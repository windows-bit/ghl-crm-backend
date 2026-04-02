require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://services.leadconnectorhq.com';
const LOCATION_ID = process.env.GHL_LOCATION_ID;
const STATE_FILE = path.join(__dirname, 'outreach-state.json');

const headers = {
  Authorization: `Bearer ${process.env.GHL_API_KEY}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json',
};

// Time to wait before sending each step (in milliseconds)
// Step 1 = initial, Step 2 = 8h later, Step 3 = 1 day, Step 4 = 4 days, Step 5 = 7 days, Step 6 = 14 days
const STEP_DELAYS = [
  0,
  8  * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  4  * 24 * 60 * 60 * 1000,
  7  * 24 * 60 * 60 * 1000,
  14 * 24 * 60 * 60 * 1000,
];

function getMessage(firstName, step) {
  const n = firstName || 'there';
  const msgs = [
    `Hey ${n}! It's Evan with Spot Off — we've worked together before and I wanted to reach out. Spring cleaning season is HERE and our schedule is filling up fast. Want to lock in a spot before we're booked out? Just reply YES and I'll get you taken care of 🙌`,
    `Hey ${n}, just following up from earlier! We still have a few spring cleaning spots open but they're going quick. Reply YES to lock yours in before we close out for the week ✅`,
    `${n}, checking back in — spring pollen and grime are already hitting hard in Houston. Our next 2 weeks are almost full. Shoot me a YES and I'll hold a spot for you 🏠`,
    `Hey ${n}! Quick heads up — we just had a cancellation open up and I wanted to offer it to you first since you're a past customer. Want to grab it? Reply YES or just text us back 📞`,
    `${n}, last check-in on spring cleaning. We're nearly booked out for April. If you want your home cleaned up before summer hits, now's the time. Reply YES and we'll make it happen 🙏 — Evan, Spot Off`,
    `Hey ${n}, one last message from us — we appreciate your past business and wanted to give you first dibs on our remaining spring slots. If it's not the right time, no worries at all! Whenever you're ready, we're here. Thanks! — Evan, Spot Off 🏠`,
  ];
  return msgs[step - 1];
}

async function axiosRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// Fetch all contacts tagged "service sms" (handles pagination)
async function getTaggedContacts() {
  let contacts = [];
  let page = 1;
  while (true) {
    const res = await axiosRetry(() => axios.get(`${BASE_URL}/contacts/`, {
      headers,
      params: { locationId: LOCATION_ID, tag: 'service sms', limit: 100, page },
      timeout: 15000,
    }));
    const batch = res.data?.contacts || [];
    contacts = contacts.concat(batch);
    if (batch.length < 100) break;
    page++;
  }
  return contacts;
}

// Get the GHL conversation ID for a contact
async function getConversationId(contactId) {
  const res = await axiosRetry(() => axios.get(`${BASE_URL}/conversations/search`, {
    headers,
    params: { contactId, locationId: LOCATION_ID },
    timeout: 15000,
  }));
  const convos = res.data?.conversations || [];
  return convos[0]?.id || null;
}

// Check if contact has sent any inbound message since we first reached out
async function hasReplied(contactId, sinceTimestamp) {
  const convId = await getConversationId(contactId);
  if (!convId) return false;

  const res = await axiosRetry(() => axios.get(`${BASE_URL}/conversations/${convId}/messages`, {
    headers,
    timeout: 15000,
  }));
  // GHL returns { messages: { messages: [...] } }
  const messages = res.data?.messages?.messages || res.data?.messages || [];

  return messages.some(m => {
    const msgTime = new Date(m.dateAdded || m.createdAt).getTime();
    return m.direction === 'inbound' && msgTime > sinceTimestamp;
  });
}

// Send SMS to a contact
async function sendSMS(contactId, body) {
  const res = await axiosRetry(() => axios.post(`${BASE_URL}/conversations/messages`, {
    contactId,
    body,
    type: 'SMS',
  }, { headers, timeout: 15000 }));
  return res.data;
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
  return {};
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function run() {
  console.log('🌱 Spot Off Spring Outreach\n');

  const state = loadState();
  const contacts = await getTaggedContacts();
  console.log(`Found ${contacts.length} contacts tagged "service sms"\n`);

  let sent = 0;
  let skipped = 0;

  for (const contact of contacts) {
    const id = contact.id;
    const firstName = contact.firstName || contact.name?.split(' ')[0] || '';
    const displayName = contact.name || firstName || id;

    // New contact — send step 1
    if (!state[id]) {
      try {
        await sendSMS(id, getMessage(firstName, 1));
        state[id] = {
          name: displayName,
          step: 1,
          firstSentAt: new Date().toISOString(),
          lastSentAt: new Date().toISOString(),
          responded: false,
          done: false,
        };
        saveState(state);
        console.log(`✅ [Step 1] ${displayName}`);
        sent++;
      } catch (err) {
        console.error(`❌ ${displayName}:`, err.response?.data || err.message);
      }
      await new Promise(r => setTimeout(r, 500)); // rate limit
      continue;
    }

    const entry = state[id];

    // Already finished
    if (entry.done || entry.responded) {
      skipped++;
      continue;
    }

    // Already sent all 6 steps
    if (entry.step >= 6) {
      entry.done = true;
      saveState(state);
      skipped++;
      continue;
    }

    // Check if enough time has passed for the next step
    const nextStep = entry.step + 1;
    const needed = STEP_DELAYS[nextStep - 1];
    const elapsed = Date.now() - new Date(entry.lastSentAt).getTime();

    if (elapsed < needed) {
      const hoursLeft = Math.ceil((needed - elapsed) / (1000 * 60 * 60));
      console.log(`⏳ [Step ${nextStep}] ${displayName} — ${hoursLeft}h left`);
      skipped++;
      continue;
    }

    // Check if they replied since we first messaged them
    const replied = await hasReplied(id, new Date(entry.firstSentAt).getTime());
    if (replied) {
      entry.responded = true;
      saveState(state);
      console.log(`💬 ${displayName} replied — stopping sequence`);
      skipped++;
      continue;
    }

    // Send next message
    try {
      await sendSMS(id, getMessage(firstName, nextStep));
      entry.step = nextStep;
      entry.lastSentAt = new Date().toISOString();
      if (nextStep === 6) entry.done = true;
      saveState(state);
      console.log(`✅ [Step ${nextStep}] ${displayName}`);
      sent++;
    } catch (err) {
      console.error(`❌ ${displayName}:`, err.response?.data || err.message);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n✨ Done — ${sent} sent, ${skipped} skipped`);
  console.log(`State file: ${STATE_FILE}`);
}

run().catch(console.error);
