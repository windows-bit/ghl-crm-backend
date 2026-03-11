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

// Helper: get the user's decrypted GHL API key from Supabase
async function getGhlKey(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('ghl_key_encrypted')
    .eq('id', userId)
    .single();

  if (error || !data?.ghl_key_encrypted) {
    throw new Error('GHL API key not found. Please set up your GHL key first.');
  }

  return decrypt(data.ghl_key_encrypted);
}

// Helper: build an axios instance pointing to GHL with the user's key
function ghlClient(apiKey) {
  return axios.create({
    baseURL: 'https://rest.gohighlevel.com/v1',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
}

// ─── CONTACTS ────────────────────────────────────────────────────────────────

// GET /ghl/contacts?search=John&limit=20&page=1
router.get('/contacts', async (req, res) => {
  try {
    const key = await getGhlKey(req.user.id);
    const { search, limit = 20, page = 1 } = req.query;

    const params = { limit, startAfter: (page - 1) * limit };
    if (search) params.query = search;

    const response = await ghlClient(key).get('/contacts/', { params });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ghl/contacts/:id
router.get('/contacts/:id', async (req, res) => {
  try {
    const key = await getGhlKey(req.user.id);
    const response = await ghlClient(key).get(`/contacts/${req.params.id}`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ghl/contacts — create a new contact
// Body: { firstName, lastName, phone, email, tags }
router.post('/contacts', async (req, res) => {
  try {
    const key = await getGhlKey(req.user.id);
    const response = await ghlClient(key).post('/contacts/', req.body);
    res.status(201).json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /ghl/contacts/:id — update a contact
router.put('/contacts/:id', async (req, res) => {
  try {
    const key = await getGhlKey(req.user.id);
    const response = await ghlClient(key).put(`/contacts/${req.params.id}`, req.body);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PIPELINES / OPPORTUNITIES ───────────────────────────────────────────────

// GET /ghl/pipelines — list all pipelines
router.get('/pipelines', async (req, res) => {
  try {
    const key = await getGhlKey(req.user.id);
    const response = await ghlClient(key).get('/pipelines/');
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ghl/opportunities?pipelineId=xxx&stageId=xxx
router.get('/opportunities', async (req, res) => {
  try {
    const key = await getGhlKey(req.user.id);
    const response = await ghlClient(key).get('/opportunities/search', {
      params: req.query,
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ghl/opportunities — create opportunity
router.post('/opportunities', async (req, res) => {
  try {
    const key = await getGhlKey(req.user.id);
    const response = await ghlClient(key).post('/opportunities/', req.body);
    res.status(201).json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /ghl/opportunities/:id — update opportunity stage/status
router.put('/opportunities/:id', async (req, res) => {
  try {
    const key = await getGhlKey(req.user.id);
    const response = await ghlClient(key).put(`/opportunities/${req.params.id}`, req.body);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CONVERSATIONS ───────────────────────────────────────────────────────────

// GET /ghl/conversations?contactId=xxx
router.get('/conversations', async (req, res) => {
  try {
    const key = await getGhlKey(req.user.id);
    const response = await ghlClient(key).get('/conversations/search', {
      params: req.query,
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ghl/conversations/:id/messages
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const key = await getGhlKey(req.user.id);
    const response = await ghlClient(key).get(`/conversations/${req.params.id}/messages`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ghl/conversations/:id/messages — send a message
// Body: { type: 'SMS' | 'Email', message }
router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const key = await getGhlKey(req.user.id);
    const response = await ghlClient(key).post(
      `/conversations/${req.params.id}/messages`,
      req.body
    );
    res.status(201).json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── WORKFLOWS / AUTOMATIONS ─────────────────────────────────────────────────

// GET /ghl/workflows — list all workflows
router.get('/workflows', async (req, res) => {
  try {
    const key = await getGhlKey(req.user.id);
    const response = await ghlClient(key).get('/workflows/');
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ghl/workflows/:id/trigger — fire a workflow for a contact
// Body: { contactId }
router.post('/workflows/:id/trigger', async (req, res) => {
  try {
    const key = await getGhlKey(req.user.id);
    const { contactId } = req.body;
    if (!contactId) {
      return res.status(400).json({ error: 'contactId is required' });
    }
    const response = await ghlClient(key).post(
      `/workflows/${req.params.id}/subscribe`,
      { contactId }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
