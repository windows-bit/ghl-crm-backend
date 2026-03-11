// GHL proxy routes — all calls here go to the user's GHL account
// using their stored API key. Auth middleware runs first on all routes.

const express = require('express');
const router = express.Router();
const axios = require('axios');
const supabase = require('../lib/supabase');
const { decrypt } = require('../lib/encrypt');
const authMiddleware = require('../middleware/auth');

// All GHL routes require the user to be logged in
router.use(authMiddleware);

// Helper: get the user's decrypted GHL API key and location ID from Supabase
async function getGhlCreds(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('ghl_key_encrypted, ghl_location_id')
    .eq('id', userId)
    .single();

  if (error || !data?.ghl_key_encrypted) {
    throw new Error('GHL API key not found. Please set up your GHL key first.');
  }

  return {
    apiKey: decrypt(data.ghl_key_encrypted),
    locationId: data.ghl_location_id,
  };
}

// Helper: build an axios instance pointing to GHL v2 with the user's key
function ghlClient(apiKey) {
  return axios.create({
    baseURL: 'https://services.leadconnectorhq.com',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    },
  });
}

// ─── CONTACTS ────────────────────────────────────────────────────────────────

// GET /ghl/contacts?search=John&limit=20&page=1
router.get('/contacts', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const { search, limit = 20, page = 1 } = req.query;

    // GHL v2 contacts uses `skip` for offset-based pagination (not startAfter which is a cursor)
    const params = { locationId, limit, skip: (page - 1) * limit };
    if (search) params.query = search;

    const response = await ghlClient(apiKey).get('/contacts/', { params });
    const data = response.data;
    // GHL v2 returns { contacts: [...], meta: { total, ... } }
    const contacts = data.contacts || data.data?.contacts || [];
    const meta = data.meta || data.data?.meta || {};
    res.json({ contacts, meta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ghl/contacts/:id
router.get('/contacts/:id', async (req, res) => {
  try {
    const { apiKey } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).get(`/contacts/${req.params.id}`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ghl/contacts — create a new contact
router.post('/contacts', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).post('/contacts/', { ...req.body, locationId });
    res.status(201).json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /ghl/contacts/:id — update a contact
router.put('/contacts/:id', async (req, res) => {
  try {
    const { apiKey } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).put(`/contacts/${req.params.id}`, req.body);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PIPELINES / OPPORTUNITIES ───────────────────────────────────────────────

// GET /ghl/pipelines — list all pipelines
router.get('/pipelines', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).get('/opportunities/pipelines', {
      params: { locationId },
    });
    const data = response.data;
    // GHL v2 returns { pipelines: [...] } directly or nested under data
    const pipelines = data.pipelines || data.data?.pipelines || [];
    res.json({ pipelines });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ghl/opportunities?pipelineId=xxx
router.get('/opportunities', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const params = { location_id: locationId };
    if (req.query.pipelineId) params.pipeline_id = req.query.pipelineId;
    const response = await ghlClient(apiKey).get('/opportunities/search', { params });
    const data = response.data;
    const opportunities = data.opportunities || data.data?.opportunities || [];
    res.json({ opportunities });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ghl/opportunities — create opportunity
router.post('/opportunities', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).post('/opportunities/', { ...req.body, locationId });
    res.status(201).json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /ghl/opportunities/:id — update opportunity stage/status
router.put('/opportunities/:id', async (req, res) => {
  try {
    const { apiKey } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).put(`/opportunities/${req.params.id}`, req.body);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CONVERSATIONS ───────────────────────────────────────────────────────────

// GET /ghl/conversations
router.get('/conversations', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).get('/conversations/search', {
      params: { locationId, limit: 20, ...req.query },
    });
    // v2 returns { conversations: [...] } or { data: { conversations: [...] } }
    const data = response.data;
    const conversations = data.conversations || data.data?.conversations || [];
    res.json({ conversations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ghl/conversations/:id/messages
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const { apiKey } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).get(`/conversations/${req.params.id}/messages`);
    // v2 returns { messages: { messages: [...] } }
    const data = response.data;
    const messages = data.messages?.messages || data.messages || data.data?.messages || [];
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ghl/conversations/:id/messages — send a message
router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const { apiKey } = await getGhlCreds(req.user.id);
    // v2 send endpoint is POST /conversations/messages (no id in path)
    const response = await ghlClient(apiKey).post('/conversations/messages', {
      type: req.body.type || 'SMS',
      conversationId: req.params.id,
      message: req.body.message,
    });
    res.status(201).json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CALENDAR ────────────────────────────────────────────────────────────────

// GET /ghl/calendars — list all calendars
router.get('/calendars', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).get('/calendars/', {
      params: { locationId },
    });
    const data = response.data;
    const calendars = data.calendars || data.data?.calendars || [];
    res.json({ calendars });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ghl/appointments
router.get('/appointments', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const startMs = new Date().setHours(0, 0, 0, 0);
    const endMs = startMs + 30 * 24 * 60 * 60 * 1000;
    const response = await ghlClient(apiKey).get('/calendars/events', {
      params: {
        locationId,
        startTime: startMs,
        endTime: endMs,
      },
    });
    const data = response.data;
    console.log('[appointments] raw GHL response keys:', Object.keys(data));
    console.log('[appointments] raw GHL data:', JSON.stringify(data).slice(0, 500));
    // GHL v2 may return { events: [...] } or { data: { events: [...] } } or { appointments: [...] }
    const events = data.events || data.data?.events || data.appointments || data.data?.appointments || [];
    res.json({ events, _debug: { keys: Object.keys(data), total: events.length } });
  } catch (err) {
    console.error('[appointments] error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message, detail: err.response?.data });
  }
});

// GET /ghl/debug/calendar — returns raw GHL response so we can see the exact structure
router.get('/debug/calendar', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const startMs = new Date().setHours(0, 0, 0, 0);
    const endMs = startMs + 30 * 24 * 60 * 60 * 1000;
    const response = await ghlClient(apiKey).get('/calendars/events', {
      params: { locationId, startTime: startMs, endTime: endMs },
    });
    res.json({ raw: response.data, params: { locationId, startTime: startMs, endTime: endMs } });
  } catch (err) {
    res.status(500).json({ error: err.message, detail: err.response?.data });
  }
});

// POST /ghl/appointments — create an appointment
router.post('/appointments', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).post('/calendars/events/appointments', {
      ...req.body,
      locationId,
    });
    res.status(201).json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── INVOICES ─────────────────────────────────────────────────────────────────

// GET /ghl/invoices — list all invoices
router.get('/invoices', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).get('/invoices/', {
      params: { altId: locationId, altType: 'location', ...req.query },
    });
    const data = response.data;
    // GHL v2 returns { invoices: [...] } directly or nested
    const invoices = data.invoices || data.data?.invoices || [];
    res.json({ invoices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ghl/invoices — create an invoice
// Body: { contactId, name, lineItems: [{ name, qty, unitPrice }], dueDate }
router.post('/invoices', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).post('/invoices/', {
      ...req.body,
      altId: locationId,
      altType: 'location',
    });
    res.status(201).json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ghl/invoices/:id/send — send invoice to contact
router.post('/invoices/:id/send', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).post(`/invoices/${req.params.id}/send`, {
      altId: locationId,
      altType: 'location',
      ...req.body,
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── WORKFLOWS / AUTOMATIONS ─────────────────────────────────────────────────

// GET /ghl/workflows — list all workflows
router.get('/workflows', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).get('/workflows/', {
      params: { locationId },
    });
    const data = response.data;
    // GHL v2 returns { workflows: [...] } directly or nested
    const workflows = data.workflows || data.data?.workflows || [];
    res.json({ workflows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ghl/workflows/:id/trigger — fire a workflow for a contact
// Body: { contactId }
// GHL v2 endpoint: POST /contacts/{contactId}/workflow/{workflowId}
router.post('/workflows/:id/trigger', async (req, res) => {
  try {
    const { apiKey } = await getGhlCreds(req.user.id);
    const { contactId } = req.body;
    if (!contactId) {
      return res.status(400).json({ error: 'contactId is required' });
    }
    const response = await ghlClient(apiKey).post(
      `/contacts/${contactId}/workflow/${req.params.id}`
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
