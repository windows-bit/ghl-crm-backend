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
    timeout: 10000,
  });
}

// ─── DEBUG / TEST ─────────────────────────────────────────────────────────────

// GET /ghl/test — verify stored credentials and test GHL connection
router.get('/test', async (req, res) => {
  let creds = null;
  try {
    creds = await getGhlCreds(req.user.id);
  } catch (e) {
    return res.json({ success: false, error: e.message, stage: 'get_creds' });
  }

  try {
    const response = await ghlClient(creds.apiKey).get(`/locations/${creds.locationId}`);
    res.json({
      success: true,
      locationId: creds.locationId,
      keyLength: creds.apiKey.length,
      locationName: response.data?.location?.name || response.data?.name || 'Connected',
    });
  } catch (err) {
    res.json({
      success: false,
      locationId: creds.locationId,
      keyLength: creds.apiKey.length,
      ghlStatus: err.response?.status,
      ghlError: err.response?.data || err.message,
    });
  }
});

// ─── CONTACTS ────────────────────────────────────────────────────────────────

// GET /ghl/contacts?search=John&limit=20
router.get('/contacts', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const { search } = req.query;

    const params = { locationId };
    if (search) params.query = search;

    console.log('[Contacts] Calling GHL with locationId:', locationId);
    const response = await ghlClient(apiKey).get('/contacts/', { params });
    const data = response.data;
    const contacts = data.contacts || data.data?.contacts || [];
    const meta = data.meta || data.data?.meta || {};
    res.json({ contacts, meta });
  } catch (err) {
    const status = err.response?.status;
    const errData = err.response?.data;
    console.error('[Contacts] Error:', status, errData?.message || errData || err.message);
    res.status(status || 500).json({ error: errData || err.message });
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
    const payload = {
      type: req.body.type || 'SMS',
      conversationId: req.params.id,
      message: req.body.message,
      contactId: req.body.contactId,
    };
    console.log('[SendMessage] payload:', payload);
    const response = await ghlClient(apiKey).post('/conversations/messages', payload);
    res.status(201).json(response.data);
  } catch (err) {
    const errData = err.response?.data;
    const errMsg = errData?.message || errData?.error || JSON.stringify(errData) || err.message;
    console.error('[SendMessage] error:', errMsg);
    res.status(err.response?.status || 500).json({ error: errMsg });
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
// Uses /calendars/events/appointments with locationId — single call, no per-calendar loop.
router.get('/appointments', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const ghl = ghlClient(apiKey);

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 60);
    endDate.setHours(23, 59, 59, 999);

    // Step 1: get all calendars for this location
    const calsRes = await ghl.get('/calendars/', { params: { locationId } });
    const calendars = calsRes.data.calendars || calsRes.data.data?.calendars || [];
    console.log(`[Calendar] Found ${calendars.length} calendar(s)`);

    if (calendars.length === 0) {
      return res.json({ events: [] });
    }

    // Step 2: fetch events for each calendar
    // NOTE: /calendars/events requires Version: 2021-04-15 (different from other endpoints)
    const results = await Promise.allSettled(
      calendars.map(cal =>
        axios.get('https://services.leadconnectorhq.com/calendars/events', {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Version: '2021-04-15',
          },
          params: {
            locationId,
            calendarId: cal.id,
            startTime: startDate.getTime(),
            endTime: endDate.getTime(),
          },
          timeout: 10000,
        })
      )
    );

    // Step 3: merge all events, tagging each with its calendar color + name
    const events = [];
    results.forEach((result, i) => {
      const cal = calendars[i];
      if (result.status === 'fulfilled') {
        const d = result.value.data;
        const calEvents = d.events || d.appointments || d.data?.events
          || (Array.isArray(d.data) ? d.data : []);
        console.log(`[Calendar] ${cal.name}: ${calEvents.length} event(s)`);
        calEvents.forEach(e => {
          e._calendarName = cal.name;
          e._calendarColor = cal.eventColor || null;
        });
        events.push(...calEvents);
      } else {
        const status = result.reason?.response?.status;
        const msg = result.reason?.response?.data?.message || result.reason?.message;
        console.error(`[Calendar] ${cal.name} error ${status}:`, msg);
      }
    });

    events.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    console.log(`[Calendar] Total: ${events.length} event(s)`);
    res.json({ events });
  } catch (err) {
    const status = err.response?.status;
    const errMsg = err.response?.data?.message || err.response?.data?.error || err.message;
    console.error(`[Calendar] Error ${status}:`, errMsg);
    res.status(status || 500).json({ error: errMsg });
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

// ─── PRODUCTS ────────────────────────────────────────────────────────────────

// GET /ghl/products — list products/services
router.get('/products', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).get('/products/', {
      params: { locationId, limit: 100 },
    });
    const data = response.data;
    const products = data.products || data.data?.products || [];
    res.json({ products });
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
