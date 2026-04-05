require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const multer = require('multer');
const { uploadImage, createCreative, createPausedAd } = require('./lib/meta-creator');

const { getPipelineData, getContact } = require('./lib/ghl');
const { getMetaData } = require('./lib/meta');
const { getLSAData } = require('./lib/google-lsa');
const { fireQuoteScheduled, fireJobCompleted } = require('./lib/conversions');
const { sendWeeklyReport } = require('./lib/weekly-report');
const {
  runMarketIntelligence,
  generateTikTokIdeas,
  generateMetaRecommendations,
  MI_FILE,
  TIKTOK_IDEAS_FILE,
  META_RECS_FILE,
  readJson,
} = require('./lib/market-intelligence');

const basicAuth = require('express-basic-auth');
const app = express();
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// Password protection
app.use(basicAuth({
  users: { 'spotoff': 'spotoff2024' },
  challenge: true,
  realm: 'Spot Off Command Center',
}));

app.use(express.static(path.join(__dirname, 'public')));

const CACHE_FILE = path.join(__dirname, 'data', 'cache.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// ─── Data Refresh ─────────────────────────────────────────────────────────────

async function refreshData() {
  console.log('[cron] Refreshing dashboard data...');
  try {
    const [meta, ghl, lsa] = await Promise.allSettled([
      getMetaData(),
      getPipelineData(),
      getLSAData(),
    ]);

    const cache = {
      lastUpdated: new Date().toISOString(),
      meta: meta.status === 'fulfilled' ? meta.value : { error: meta.reason?.message, detail: meta.reason?.response?.data },
      ghl: ghl.status === 'fulfilled' ? ghl.value : { error: ghl.reason?.message, detail: ghl.reason?.response?.data },
      lsa: lsa.status === 'fulfilled' ? lsa.value : { error: lsa.reason?.message, detail: lsa.reason?.response?.data },
    };

    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log('[cron] Data refreshed at', cache.lastUpdated);
    return cache;
  } catch (err) {
    console.error('[cron] Refresh failed:', err.message);
    throw err;
  }
}

// ─── API Routes ───────────────────────────────────────────────────────────────

// Dashboard data — reads from cache
app.get('/api/dashboard', (req, res) => {
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    res.json(cache);
  } catch {
    res.status(503).json({ error: 'Data not yet available. Refresh in progress.' });
  }
});

// Manual refresh trigger — returns immediately, runs in background
app.post('/api/refresh', (req, res) => {
  res.json({ success: true, message: 'Refresh started' });
  refreshData().catch((err) => console.error('[refresh] Error:', err.message));
});

// Create a PAUSED image ad in Meta
app.post('/api/create-ad', upload.single('image'), async (req, res) => {
  const { headline, primaryText, adName } = req.body;

  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  if (!headline || !primaryText) return res.status(400).json({ error: 'headline and primaryText are required' });

  try {
    const imageHash = await uploadImage(req.file.buffer, req.file.originalname);
    const creativeId = await createCreative(imageHash, headline, primaryText);
    const adId = await createPausedAd(adName || `Spot Off Ad ${Date.now()}`, creativeId);

    console.log('[ad-creator] Created paused ad:', adId);
    res.json({ success: true, adId });
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    console.error('[ad-creator] Error:', detail);
    res.status(500).json({ error: detail });
  }
});

// ─── Market Intelligence Routes ───────────────────────────────────────────────

// Get latest scraped research data
app.get('/api/market-intelligence', (req, res) => {
  res.json(readJson(MI_FILE) || { status: 'empty' });
});

// Get latest TikTok daily ideas
app.get('/api/tiktok-ideas', (req, res) => {
  res.json(readJson(TIKTOK_IDEAS_FILE) || { ideas: [] });
});

// Get latest Meta twice-weekly recommendations
app.get('/api/meta-recommendations', (req, res) => {
  res.json(readJson(META_RECS_FILE) || { recommendations: [] });
});

// Trigger full research run (scrape all + niche buzz)
app.post('/api/research', (req, res) => {
  res.json({ success: true, message: 'Research started' });
  runMarketIntelligence().catch(err => console.error('[research] Error:', err.message));
});

// Trigger TikTok ideas generation
app.post('/api/tiktok-ideas', (req, res) => {
  res.json({ success: true, message: 'TikTok ideas generation started' });
  generateTikTokIdeas().catch(err => console.error('[tiktok-ideas] Error:', err.message));
});

// Trigger Meta recommendations generation
app.post('/api/meta-recommendations', (req, res) => {
  res.json({ success: true, message: 'Meta recommendations generation started' });
  generateMetaRecommendations().catch(err => console.error('[meta-recs] Error:', err.message));
});

// Debug — raw Meta Ad Library API response for one keyword
app.get('/api/test-meta-library', async (req, res) => {
  const axios = require('axios');
  try {
    const result = await axios.get('https://graph.facebook.com/v22.0/ads_archive', {
      params: {
        access_token: process.env.META_ACCESS_TOKEN,
        search_terms: 'window cleaning',
        ad_type: 'ALL',
        ad_reached_countries: '["US"]',
        fields: 'id,ad_creative_bodies,page_name,ad_delivery_start_time,ad_snapshot_url',
        limit: 5,
      },
      timeout: 15000,
    });
    res.json({ ok: true, count: result.data?.data?.length, data: result.data });
  } catch (err) {
    res.json({ ok: false, error: err.response?.data || err.message });
  }
});

// Debug — show actual API errors + env var status
app.get('/api/debug', async (req, res) => {
  const axios = require('axios');
  const results = {
    env: {
      GHL_API_KEY: process.env.GHL_API_KEY ? process.env.GHL_API_KEY.substring(0, 15) + '...' : 'NOT SET',
      GHL_LOCATION_ID: process.env.GHL_LOCATION_ID || 'NOT SET',
      META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN ? process.env.META_ACCESS_TOKEN.substring(0, 15) + '...' : 'NOT SET',
      META_AD_ACCOUNT_ID: process.env.META_AD_ACCOUNT_ID || 'NOT SET',
    },
    ghl: null,
    meta: null,
  };
  try {
    const r = await axios.get('https://services.leadconnectorhq.com/opportunities/pipelines', {
      headers: { Authorization: `Bearer ${process.env.GHL_API_KEY}`, Version: '2021-07-28' },
      params: { locationId: process.env.GHL_LOCATION_ID },
    });
    results.ghl = { ok: true, pipelineCount: r.data?.pipelines?.length };
  } catch (err) {
    results.ghl = { ok: false, status: err.response?.status, error: err.response?.data };
  }
  try {
    const r = await axios.get(`https://graph.facebook.com/v22.0/${process.env.META_AD_ACCOUNT_ID}/insights`, {
      params: { access_token: process.env.META_ACCESS_TOKEN, fields: 'campaign_name,spend', date_preset: 'last_7d', level: 'campaign' },
    });
    results.meta = { ok: true, count: r.data?.data?.length };
  } catch (err) {
    results.meta = { ok: false, status: err.response?.status, error: err.response?.data };
  }
  res.json(results);
});

// Debug — show Job Scheduled stage opportunities with their appointment dates
app.get('/api/debug-job-scheduled', async (req, res) => {
  const axios = require('axios');
  const BASE_URL = 'https://services.leadconnectorhq.com';
  const headers = { Authorization: `Bearer ${process.env.GHL_API_KEY}`, Version: '2021-07-28' };
  const MAIN_PIPELINE_ID = 'zFUBxIFQ0LlxKcHbwXFX';
  try {
    // Get stage map
    const plRes = await axios.get(`${BASE_URL}/opportunities/pipelines`, { headers, params: { locationId: process.env.GHL_LOCATION_ID } });
    const stageMap = {};
    for (const pl of plRes.data?.pipelines || []) {
      for (const s of pl.stages || []) stageMap[s.id] = s.name;
    }
    // Get all opps
    let allOpps = [], page = 1;
    while (true) {
      const r = await axios.get(`${BASE_URL}/opportunities/search`, { headers, params: { location_id: process.env.GHL_LOCATION_ID, limit: 100, page } });
      const opps = r.data?.opportunities || [];
      allOpps = allOpps.concat(opps);
      if (opps.length < 100) break;
      page++;
    }
    const scheduled = allOpps
      .filter(o => o.pipelineId === MAIN_PIPELINE_ID)
      .filter(o => (stageMap[o.pipelineStageId] || '').includes('Job Scheduled') || (stageMap[o.pipelineStageId] || '').includes('Scheduled'))
      .map(o => ({
        name: o.name,
        stage: stageMap[o.pipelineStageId],
        monetaryValue: o.monetaryValue,
        lastStageChangeAt: o.lastStageChangeAt,
        closedDate: o.closedDate,
      }))
      .sort((a, b) => new Date(a.lastStageChangeAt) - new Date(b.lastStageChangeAt));
    res.json({ count: scheduled.length, opps: scheduled });
  } catch (err) {
    res.json({ error: err.response?.data || err.message });
  }
});

// Debug — list all GHL calendars
app.get('/api/debug-calendars', async (req, res) => {
  const axios = require('axios');
  try {
    const r = await axios.get('https://services.leadconnectorhq.com/calendars/', {
      headers: { Authorization: `Bearer ${process.env.GHL_API_KEY}`, Version: '2021-07-28' },
      params: { locationId: process.env.GHL_LOCATION_ID },
    });
    const calendars = (r.data?.calendars || []).map(c => ({ id: c.id, name: c.name, type: c.calendarType }));
    res.json({ count: calendars.length, calendars });
  } catch (err) {
    res.json({ error: err.response?.data || err.message });
  }
});

// Debug — show all paid opportunities with their values
app.get('/api/debug-ghl-sources', async (req, res) => {
  const axios = require('axios');
  const BASE_URL = 'https://services.leadconnectorhq.com';
  const headers = { Authorization: `Bearer ${process.env.GHL_API_KEY}`, Version: '2021-07-28' };
  const MAIN_PIPELINE_ID = 'zFUBxIFQ0LlxKcHbwXFX';
  try {
    // Get stage map
    const plRes = await axios.get(`${BASE_URL}/opportunities/pipelines`, {
      headers, params: { locationId: process.env.GHL_LOCATION_ID },
    });
    const stageMap = {};
    for (const pl of plRes.data?.pipelines || []) {
      for (const s of pl.stages || []) stageMap[s.id] = s.name;
    }

    // Get all opps
    let allOpps = [], page = 1;
    while (true) {
      const r = await axios.get(`${BASE_URL}/opportunities/search`, {
        headers, params: { location_id: process.env.GHL_LOCATION_ID, limit: 100, page },
      });
      const opps = r.data?.opportunities || [];
      allOpps = allOpps.concat(opps);
      if (opps.length < 100) break;
      page++;
    }

    const paid = allOpps
      .filter(o => o.pipelineId === MAIN_PIPELINE_ID)
      .filter(o => {
        const stage = stageMap[o.pipelineStageId] || '';
        return stage === 'Paid' || stage === 'Job Completed' || stage === 'Job Complete';
      })
      .map(o => ({
        name: o.name,
        source: o.source,
        monetaryValue: o.monetaryValue,
        closedDate: o.closedDate,
        lastStageChangeAt: o.lastStageChangeAt,
      }))
      .sort((a, b) => new Date(b.closedDate || b.lastStageChangeAt) - new Date(a.closedDate || a.lastStageChangeAt));

    const total = paid.reduce((sum, o) => sum + (o.monetaryValue || 0), 0);
    res.json({ count: paid.length, total, opps: paid });
  } catch (err) {
    res.json({ error: err.response?.data || err.message });
  }
});

// Manual trigger for weekly report
app.post('/api/send-weekly-report', (req, res) => {
  res.json({ success: true, message: 'Weekly report sending started' });
  sendWeeklyReport().catch(err => console.error('[report] Error:', err.message));
});

// ─── GHL Webhooks ─────────────────────────────────────────────────────────────

// GHL fires this when an opportunity moves to "Quote Scheduled"
app.post('/webhook/quote-scheduled', async (req, res) => {
  const { contactId, opportunityId, monetaryValue } = req.body;
  console.log('[webhook] Quote Scheduled — contact:', contactId, 'opp:', opportunityId);

  try {
    const contact = await getContact(contactId);
    await fireQuoteScheduled(contact);
    console.log('[webhook] Meta Schedule event fired for contact:', contactId);
    res.json({ success: true });
  } catch (err) {
    console.error('[webhook] quote-scheduled error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GHL fires this when an opportunity moves to "Paid"
app.post('/webhook/job-completed', async (req, res) => {
  const { contactId, opportunityId, monetaryValue } = req.body;
  console.log('[webhook] Job Completed — contact:', contactId, 'value:', monetaryValue);

  try {
    const contact = await getContact(contactId);
    await fireJobCompleted(contact, monetaryValue);
    console.log('[webhook] Meta Purchase event fired for contact:', contactId, 'value:', monetaryValue);
    res.json({ success: true });
  } catch (err) {
    console.error('[webhook] job-completed error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Scheduler ────────────────────────────────────────────────────────────────

// Refresh every hour at :00
cron.schedule('0 * * * *', () => {
  refreshData().catch((err) => console.error('[cron] Error:', err.message));
});

// Scrape Reddit, Meta Ad Library, TikTok every day at 7 AM
cron.schedule('0 7 * * *', () => {
  console.log('[cron] Running daily market intelligence...');
  runMarketIntelligence().catch(err => console.error('[cron] Market intelligence error:', err.message));
});

// Generate TikTok video ideas every day at 7:30 AM (after scrape)
cron.schedule('30 7 * * *', () => {
  console.log('[cron] Generating daily TikTok ideas...');
  generateTikTokIdeas().catch(err => console.error('[cron] TikTok ideas error:', err.message));
});

// Send weekly Meta Ads report every Tuesday at 8 AM
cron.schedule('0 8 * * 2', () => {
  console.log('[cron] Sending weekly Meta Ads report...');
  sendWeeklyReport().catch(err => console.error('[cron] Weekly report error:', err.message));
});

// Generate Meta recommendations Tuesday + Friday at 8 AM
cron.schedule('0 8 * * 2,5', () => {
  console.log('[cron] Generating Meta recommendations...');
  generateMetaRecommendations().catch(err => console.error('[cron] Meta recs error:', err.message));
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`Spot Off Command Center running at http://localhost:${PORT}`);
  // Pull fresh data on startup
  await refreshData().catch((err) => console.error('[startup] Initial refresh failed:', err.message));
});
