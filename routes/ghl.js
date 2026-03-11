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

    const params = { locationId, limit, startAfter: (page - 1) * limit };
    if (search) params.query = search;

    const response = await ghlClient(apiKey).get('/contacts/', { params });
    res.json(response.data);
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
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ghl/opportunities?pipelineId=xxx&stageId=xxx
router.get('/opportunities', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).get('/opportunities/search', {
      params: { location_id: locationId, ...req.query },
    });
    res.json(response.data);
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

// GET /ghl/conversations?contactId=xxx
router.get('/conversations', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).get('/conversations/search', {
      params: { locationId, ...req.query },
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ghl/conversations/:id/messages
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const { apiKey } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).get(`/conversations/${req.params.id}/messages`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ghl/conversations/:id/messages — send a message
router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const { apiKey } = await getGhlCreds(req.user.id);
    const response = await ghlClient(apiKey).post(
      `/conversations/${req.params.id}/messages`,
      req.body
    );
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
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ghl/appointments?startTime=...&endTime=...&calendarId=...
router.get('/appointments', async (req, res) => {
  try {
    const { apiKey, locationId } = await getGhlCreds(req.user.id);
    const now = new Date();
    const start = req.query.startTime || new Date(now.setHours(0,0,0,0)).toISOString();
    const end = req.query.endTime || new Date(now.setDate(now.getDate() + 30)).toISOString();
    const response = await ghlClient(apiKey).get('/calendars/events', {
      params: { locationId, startTime: start, endTime: end, ...req.query },
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.json(response.data);
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
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ghl/workflows/:id/trigger — fire a workflow for a contact
// Body: { contactId }
router.post('/workflows/:id/trigger', async (req, res) => {
  try {
    const { apiKey } = await getGhlCreds(req.user.id);
    const { contactId } = req.body;
    if (!contactId) {
      return res.status(400).json({ error: 'contactId is required' });
    }
    const response = await ghlClient(apiKey).post(
      `/workflows/${req.params.id}/subscribe`,
      { contactId }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
