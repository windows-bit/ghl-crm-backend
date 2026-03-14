const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const supabase = require('./supabase');
const { decrypt } = require('./encrypt');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── GHL helpers (same as ghl.js) ────────────────────────────────────────────

async function getGhlCreds(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('ghl_key_encrypted, ghl_location_id')
    .eq('id', userId)
    .single();

  if (error || !data?.ghl_key_encrypted) {
    throw new Error('GHL API key not found for this user.');
  }

  return {
    apiKey: decrypt(data.ghl_key_encrypted),
    locationId: data.ghl_location_id,
  };
}

function ghlClient(apiKey) {
  return axios.create({
    baseURL: 'https://services.leadconnectorhq.com',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    },
    timeout: 10000,
  });
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const tools = [
  {
    name: 'search_contacts',
    description: 'Search for contacts in GHL by name, phone, or email. Returns a list of matching contacts with their name, phone, email, and tags.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (name, email, or phone)' },
        limit: { type: 'number', description: 'Max contacts to return (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_opportunities',
    description: 'Get pipeline opportunities (leads/jobs) from GHL. Returns deals with their name, stage, value, and status.',
    input_schema: {
      type: 'object',
      properties: {
        pipelineId: { type: 'string', description: 'Optional pipeline ID to filter by' },
      },
    },
  },
  {
    name: 'get_conversations',
    description: 'Get recent conversations from GHL. Returns a list of recent message threads with contacts.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max conversations to return (default 10)' },
      },
    },
  },
  {
    name: 'get_appointments',
    description: 'Get upcoming appointments from GHL calendar.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
];

// ─── Tool execution ────────────────────────────────────────────────────────────

async function executeTool(toolName, toolInput, userId) {
  const { apiKey, locationId } = await getGhlCreds(userId);
  const ghl = ghlClient(apiKey);

  try {
    if (toolName === 'search_contacts') {
      const params = { locationId, limit: toolInput.limit || 10 };
      if (toolInput.query) params.query = toolInput.query;
      const res = await ghl.get('/contacts/', { params });
      const contacts = res.data.contacts || res.data.data?.contacts || [];
      if (contacts.length === 0) return 'No contacts found matching that search.';
      return contacts.map(c =>
        `Name: ${c.firstName || ''} ${c.lastName || ''} | Phone: ${c.phone || 'N/A'} | Email: ${c.email || 'N/A'} | Tags: ${(c.tags || []).join(', ') || 'none'}`
      ).join('\n');
    }

    if (toolName === 'get_opportunities') {
      const params = { location_id: locationId };
      if (toolInput.pipelineId) params.pipeline_id = toolInput.pipelineId;
      const res = await ghl.get('/opportunities/search', { params });
      const opps = res.data.opportunities || res.data.data?.opportunities || [];
      if (opps.length === 0) return 'No opportunities found.';
      return opps.map(o =>
        `Name: ${o.name} | Stage: ${o.pipelineStage?.name || o.status || 'unknown'} | Value: $${o.monetaryValue || 0} | Status: ${o.status}`
      ).join('\n');
    }

    if (toolName === 'get_conversations') {
      const res = await ghl.get('/conversations/search', {
        params: { locationId, limit: toolInput.limit || 10 },
      });
      const convos = res.data.conversations || res.data.data?.conversations || [];
      if (convos.length === 0) return 'No conversations found.';
      return convos.map(c =>
        `Contact: ${c.contactName || c.fullName || 'Unknown'} | Last message: ${c.lastMessageBody || 'N/A'} | Type: ${c.type || 'N/A'}`
      ).join('\n');
    }

    if (toolName === 'get_appointments') {
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 1);
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 30);

      const calsRes = await ghl.get('/calendars/', { params: { locationId } });
      const calendars = calsRes.data.calendars || [];
      if (calendars.length === 0) return 'No calendars found.';

      const results = await Promise.allSettled(
        calendars.map(cal =>
          axios.get('https://services.leadconnectorhq.com/calendars/events', {
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Version: '2021-04-15' },
            params: { locationId, calendarId: cal.id, startTime: startDate.getTime(), endTime: endDate.getTime() },
            timeout: 10000,
          })
        )
      );

      const events = [];
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          const d = result.value.data;
          const calEvents = d.events || d.appointments || [];
          events.push(...calEvents);
        }
      });

      if (events.length === 0) return 'No upcoming appointments.';
      events.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
      return events.slice(0, 10).map(e =>
        `Title: ${e.title || 'Appointment'} | Date: ${new Date(e.startTime).toLocaleString()} | Contact: ${e.contactName || 'N/A'}`
      ).join('\n');
    }

    return 'Unknown tool.';
  } catch (err) {
    return `Error running ${toolName}: ${err.message}`;
  }
}

// ─── Main chat function ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an AI assistant built into a CRM app for a window cleaning and pressure washing business called Spot Off, based in Houston, TX.

You help the business owner manage their GHL CRM by answering questions about contacts, leads, appointments, and conversations. You can look up real data from their account.

Be concise, direct, and helpful. When showing data, format it clearly. If asked to do something you can't do (like send a message or create a contact), explain that clearly.`;

async function chat(userMessage, userId, conversationHistory = []) {
  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  // Agentic loop — Claude may call tools multiple times
  while (true) {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    // Add assistant response to history
    messages.push({ role: 'assistant', content: response.content });

    // If done, return the text
    if (response.stop_reason === 'end_turn') {
      const text = response.content.find(b => b.type === 'text')?.text || 'Done.';
      return { reply: text, messages };
    }

    // If Claude wants to use tools, execute them
    if (response.stop_reason === 'tool_use') {
      const toolResults = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await executeTool(block.name, block.input, userId);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      messages.push({ role: 'user', content: toolResults });
    } else {
      // Unexpected stop reason — return what we have
      const text = response.content.find(b => b.type === 'text')?.text || 'Done.';
      return { reply: text, messages };
    }
  }
}

module.exports = { chat };
