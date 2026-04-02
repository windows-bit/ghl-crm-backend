require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

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
