require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const axios = require('axios');
const multer = require('multer');
const sharp = require('sharp');
const Anthropic = require('@anthropic-ai/sdk');
const { uploadImage, createCreative, createPausedAd } = require('./lib/meta-creator');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

const nodemailer = require('nodemailer');
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
const ADS_TRACKER_FILE = path.join(__dirname, 'data', 'ads-tracker.json');

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

// ─── Ad Tracker ───────────────────────────────────────────────────────────────

function logCreatedAd(adId, name, headline) {
  const ads = readJson(ADS_TRACKER_FILE) || [];
  ads.push({ adId, name, headline, createdAt: new Date().toISOString(), emailSent: false });
  fs.writeFileSync(ADS_TRACKER_FILE, JSON.stringify(ads, null, 2));
}

async function generateAdIdeasFor3Day(ad, metrics) {
  const prompt = `You are a Meta Ads expert for Spot Off Reflections, a Houston exterior cleaning company (window cleaning, pressure washing, soft washing, roof washing, gutters). Target customers: Houston homeowners.

This ad just ran for 3 days:
- Ad name: ${ad.name}
- Headline: ${ad.headline}
- Impressions: ${metrics.impressions}
- Clicks: ${metrics.clicks}
- CTR: ${metrics.ctr}%
- Spend: $${metrics.spend}
- Leads: ${metrics.leads}

Based on these 3-day results, give me 2 specific follow-up ad ideas to test next. For each idea:
- Hook: The first line or visual concept (specific, not generic)
- Copy angle: The main message approach
- Why: One sentence on why this should work based on the results above

Format as plain text, no bullet symbols or markdown. Separate each idea with a blank line. Keep each idea under 4 lines total.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });
    return msg.content[0].text;
  } catch (err) {
    console.error('[ad-tracker] Failed to generate ad ideas:', err.message);
    return null;
  }
}

async function sendAdResultsEmail(ad, metrics, ideas) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: 'windows@spotoffreflections.com', pass: process.env.GMAIL_APP_PASSWORD },
  });

  const ideasHtml = ideas
    ? ideas.trim().split(/\n\n+/).map((idea, i) =>
        `<div style="background:#f8f9fa;border-left:4px solid #0066cc;padding:12px 16px;margin:8px 0;border-radius:4px;font-size:14px;line-height:1.7;">
          <strong style="color:#0066cc;">Idea ${i + 1}</strong><br>
          ${idea.trim().replace(/\n/g, '<br>')}
        </div>`
      ).join('')
    : '';

  await transporter.sendMail({
    from: 'windows@spotoffreflections.com',
    to: 'windows@spotoffreflections.com',
    subject: `3-Day Results: ${ad.name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
        <h2 style="border-bottom:2px solid #e0e0e0;padding-bottom:10px;">3-Day Ad Results</h2>
        <p><b>Ad:</b> ${ad.name}</p>
        <p><b>Headline:</b> ${ad.headline}</p>
        <table style="border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 16px 6px 0;color:#888;">Impressions</td><td style="padding:6px 0;font-weight:bold;">${metrics.impressions.toLocaleString()}</td></tr>
          <tr><td style="padding:6px 16px 6px 0;color:#888;">Clicks</td><td style="padding:6px 0;font-weight:bold;">${metrics.clicks}</td></tr>
          <tr><td style="padding:6px 16px 6px 0;color:#888;">CTR</td><td style="padding:6px 0;font-weight:bold;">${metrics.ctr}%</td></tr>
          <tr><td style="padding:6px 16px 6px 0;color:#888;">Spend</td><td style="padding:6px 0;font-weight:bold;">$${metrics.spend}</td></tr>
          <tr><td style="padding:6px 16px 6px 0;color:#888;">Leads</td><td style="padding:6px 0;font-weight:bold;">${metrics.leads}</td></tr>
        </table>
        ${ideasHtml ? `<hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;">
        <h3 style="font-size:16px;border-left:4px solid #0066cc;padding-left:10px;">Ideas to Test Next</h3>
        <p style="color:#555;font-size:14px;margin-bottom:12px;">Based on this ad's performance:</p>
        ${ideasHtml}` : ''}
      </div>
    `,
  });
}

async function checkAdFollowUps() {
  const ads = readJson(ADS_TRACKER_FILE) || [];
  const now = Date.now();
  let updated = false;
  for (const ad of ads) {
    if (ad.emailSent) continue;
    const ageDays = (now - new Date(ad.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 3) continue;
    try {
      const since = ad.createdAt.slice(0, 10);
      const until = new Date().toISOString().slice(0, 10);
      const res = await axios.get(`https://graph.facebook.com/v22.0/${ad.adId}/insights`, {
        params: {
          access_token: process.env.META_ACCESS_TOKEN,
          fields: 'spend,impressions,clicks,actions',
          time_range: JSON.stringify({ since, until }),
        },
      });
      const row = res.data?.data?.[0] || {};
      const spend = parseFloat(row.spend || 0);
      const clicks = parseInt(row.clicks || 0);
      const impressions = parseInt(row.impressions || 0);
      const leadAction = (row.actions || []).find(
        a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped'
      );
      const leads = parseInt(leadAction?.value || 0);
      const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : '0.00';
      const metrics = { spend: spend.toFixed(2), clicks, impressions, leads, ctr };
      const ideas = await generateAdIdeasFor3Day(ad, metrics);
      await sendAdResultsEmail(ad, metrics, ideas);
      ad.emailSent = true;
      updated = true;
      console.log('[ad-tracker] Sent 3-day results email for:', ad.name);
    } catch (err) {
      console.error('[ad-tracker] Failed for ad', ad.adId, err.message);
    }
  }
  if (updated) fs.writeFileSync(ADS_TRACKER_FILE, JSON.stringify(ads, null, 2));
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
    const enhanced = await enhanceImage(req.file.buffer);
    const imageHash = await uploadImage(enhanced, req.file.originalname);
    const creativeId = await createCreative(imageHash, headline, primaryText);
    const adId = await createPausedAd(adName || `Spot Off Ad ${Date.now()}`, creativeId);
    logCreatedAd(adId, adName || `Spot Off Ad ${Date.now()}`, headline);

    console.log('[ad-creator] Created paused ad:', adId);
    res.json({ success: true, adId });
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    console.error('[ad-creator] Error:', detail);
    res.status(500).json({ error: detail });
  }
});

// Strip markdown code fences from AI JSON responses before parsing
function parseAiJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

// Enhance image: sharpen, boost saturation + contrast, output as JPEG
async function enhanceImage(buffer) {
  return sharp(buffer)
    .sharpen({ sigma: 1.2 })
    .modulate({ saturation: 1.3, brightness: 1.05 })
    .jpeg({ quality: 92 })
    .toBuffer();
}

// Resize/crop image to 1080x1080 (Meta optimal square format)
async function resizeForMeta(buffer) {
  return sharp(buffer)
    .resize(1080, 1080, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 92 })
    .toBuffer();
}

// Add semi-transparent CTA banner to bottom of image
async function addCtaBanner(buffer, text = 'FREE QUOTE · spotoffreflections.com') {
  const svg = `<svg width="1080" height="110" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="110" fill="rgba(0,0,0,0.65)"/>
    <text x="540" y="72" font-family="Arial,sans-serif" font-size="44"
      fill="white" text-anchor="middle" font-weight="bold">${text}</text>
  </svg>`;
  return sharp(buffer)
    .composite([{ input: Buffer.from(svg), gravity: 'south' }])
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .jpeg({ quality: 92 })
    .toBuffer();
}

// Combine before + after photos side by side into a single 1080x1080 image
async function makeBeforeAfter(beforeBuffer, afterBuffer) {
  const [left, right] = await Promise.all([
    sharp(beforeBuffer).resize(540, 1080, { fit: 'cover', position: 'entropy' }).toBuffer(),
    sharp(afterBuffer).resize(540, 1080, { fit: 'cover', position: 'entropy' }).toBuffer(),
  ]);

  // "BEFORE" label SVG
  const beforeLabel = Buffer.from(`<svg width="140" height="48" xmlns="http://www.w3.org/2000/svg">
    <rect width="140" height="48" rx="6" fill="rgba(0,0,0,0.7)"/>
    <text x="70" y="33" font-family="Arial,sans-serif" font-size="26" fill="white" text-anchor="middle" font-weight="bold">BEFORE</text>
  </svg>`);

  // "AFTER" label SVG
  const afterLabel = Buffer.from(`<svg width="120" height="48" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="48" rx="6" fill="rgba(37,99,235,0.9)"/>
    <text x="60" y="33" font-family="Arial,sans-serif" font-size="26" fill="white" text-anchor="middle" font-weight="bold">AFTER</text>
  </svg>`);

  // White divider (4px)
  const divider = await sharp({
    create: { width: 4, height: 1080, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).jpeg().toBuffer();

  return sharp({
    create: { width: 1080, height: 1080, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      { input: left, left: 0, top: 0 },
      { input: right, left: 542, top: 0 },
      { input: divider, left: 538, top: 0 },
      { input: beforeLabel, left: 16, top: 16 },
      { input: afterLabel, left: 558, top: 16 },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

// Service-specific copy context for AI prompt
const SERVICE_PROMPTS = {
  'commercial': 'This is a commercial job photo — office building, storefront, or business property. Write copy targeting Houston business owners and property managers. Focus on professional image, curb appeal, and keeping the property looking sharp for customers.',
  'roof': 'This is a roof washing photo. Write about removing black streaks and algae from Houston roofs, extending roof life, and protecting the home investment. Urgency: Houston humidity makes roofs filthy fast.',
  'house': 'This is a residential house cleaning photo — windows, siding, or soft washing. Write about transforming how the home looks, boosting curb appeal, and making Houston homeowners proud of their house again.',
  'pressure': 'This is a pressure washing photo — driveway, patio, sidewalk, or exterior surfaces. Write about blasting away years of Houston grime, mold, and algae. Before vs after results are dramatic.',
  'window': 'This is a window cleaning photo. Write about crystal clear, streak-free windows — residential or commercial. Focus on how much better the home or building looks and how Houston homeowners notice the difference immediately.',
};

// 3 rotating copy styles — each photo gets a different angle
const AD_STYLES = [
  'Focus on the dramatic result or transformation shown. Make the Houston homeowner visualize how great their home will look.',
  'Create urgency — Houston heat, humidity, and mold make this service essential right now. Push them to get a free quote before it gets worse.',
  'Build trust — professional results, local Houston company, free no-pressure quote. Make homeowners feel safe calling.',
];

// Fetch last 5 uploaded photos from Facebook page
async function fetchFacebookPhotos() {
  const res = await axios.get(`https://graph.facebook.com/v22.0/${process.env.META_PAGE_ID}/photos`, {
    params: { type: 'uploaded', fields: 'images,created_time', limit: 5, access_token: process.env.META_ACCESS_TOKEN },
  });
  return (res.data?.data || [])
    .map(p => ({ url: p.images?.[0]?.source, source: 'Facebook' }))
    .filter(p => p.url);
}

// Fetch up to 5 photos from Google Business Profile via Places API (skips if env vars not set)
async function fetchGMBPhotos() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const placeId = process.env.GMB_PLACE_ID;
  if (!apiKey || !placeId) return [];
  try {
    const res = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: { place_id: placeId, fields: 'photos', key: apiKey },
    });
    return (res.data?.result?.photos || []).slice(0, 5).map(p => ({
      url: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1600&photoreference=${p.photo_reference}&key=${apiKey}`,
      source: 'Google',
    }));
  } catch {
    return [];
  }
}

// Fetch last 5 photos from Instagram (silently skips if not connected)
async function fetchInstagramPhotos() {
  try {
    const pageRes = await axios.get(`https://graph.facebook.com/v22.0/${process.env.META_PAGE_ID}`, {
      params: { fields: 'instagram_business_account', access_token: process.env.META_ACCESS_TOKEN },
    });
    const igId = pageRes.data?.instagram_business_account?.id;
    if (!igId) return [];

    const mediaRes = await axios.get(`https://graph.facebook.com/v22.0/${igId}/media`, {
      params: { fields: 'media_type,media_url,timestamp', limit: 5, access_token: process.env.META_ACCESS_TOKEN },
    });
    return (mediaRes.data?.data || [])
      .filter(m => m.media_type === 'IMAGE' || m.media_type === 'CAROUSEL_ALBUM')
      .map(m => ({ url: m.media_url, source: 'Instagram' }))
      .filter(m => m.url);
  } catch {
    return []; // Instagram not connected — skip silently
  }
}

// Create up to 6 PAUSED ads from Facebook + Instagram + GMB photos, 3 rotating styles
async function runBulkCreateAds() {
  const [fbPhotos, igPhotos, gmbPhotos] = await Promise.all([
    fetchFacebookPhotos(),
    fetchInstagramPhotos(),
    fetchGMBPhotos(),
  ]);

  // Interleave FB, IG, GMB — up to 2 from each, 6 total
  const allPhotos = [];
  for (let i = 0; i < 2 && allPhotos.length < 6; i++) {
    if (fbPhotos[i]) allPhotos.push(fbPhotos[i]);
    if (igPhotos[i] && allPhotos.length < 6) allPhotos.push(igPhotos[i]);
    if (gmbPhotos[i] && allPhotos.length < 6) allPhotos.push(gmbPhotos[i]);
  }
  if (!allPhotos.length) throw new Error('No photos found. Post photos to your Facebook page, Instagram, or Google Business Profile first.');

  const results = [];
  for (let i = 0; i < allPhotos.length; i++) {
    const { url, source } = allPhotos[i];
    const style = AD_STYLES[i % AD_STYLES.length];
    try {
      const imgRes = await axios.get(url, { responseType: 'arraybuffer' });
      const imageBuffer = await enhanceImage(Buffer.from(imgRes.data));
      const fileName = `${source.toLowerCase()}-${Date.now()}-${i}.jpg`;

      const base64 = imageBuffer.toString('base64');
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: `You write Facebook ad copy for Spot Off (spotoffreflections.com), a Houston exterior cleaning company. Services: roof washing, pressure washing, window cleaning, soft washing, gutters. Target: Houston homeowners. Goal: get a free quote request.\n\n${style}\n\nReturn ONLY valid JSON:\n{"headline":"max 40 chars, punchy","primaryText":"max 125 chars, conversational"}` },
        ]}],
      });

      const copy = parseAiJson(msg.content[0].text);
      const imageHash = await uploadImage(imageBuffer, fileName);
      const creativeId = await createCreative(imageHash, copy.headline, copy.primaryText);
      const adId = await createPausedAd(`Auto Ad ${source} ${i + 1} — ${new Date().toLocaleDateString('en-US')}`, creativeId);
      logCreatedAd(adId, `Auto Ad ${source} ${i + 1}`, copy.headline);

      console.log(`[bulk-ad] Ad ${i + 1}/${allPhotos.length} (${source}):`, adId, '|', copy.headline);
      results.push({ adId, headline: copy.headline, primaryText: copy.primaryText, source });
    } catch (err) {
      console.error(`[bulk-ad] Photo ${i + 1} (${source}) failed:`, err.response?.data?.error?.message || err.message);
    }
  }

  if (!results.length) throw new Error('All photos failed — check server logs.');
  return results;
}

// Manual trigger via dashboard button
app.post('/api/auto-create-ad', async (req, res) => {
  try {
    const ads = await runBulkCreateAds();
    res.json({ success: true, ads });
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    console.error('[bulk-ad] Error:', detail);
    res.status(500).json({ error: detail });
  }
});

// Automatic: every Monday at 8am Houston time (Central = UTC-5 in April)
// Cron: 0 13 * * 1 = Monday 1pm UTC = 8am Central
cron.schedule('0 13 * * 1', () => {
  console.log('[auto-ad] Weekly cron: creating ads from socials...');
  runBulkCreateAds().catch((err) => console.error('[auto-ad] Weekly cron failed:', err.message));
});

// Generate ad copy from photo using Claude vision
app.post('/api/generate-ad-copy', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  try {
    const base64 = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype;

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: `You write Facebook ad copy for Spot Off, a Houston exterior cleaning company (windows, pressure washing, soft washing, gutters). Look at this job photo and write ad copy that gets Houston homeowners to request a quote.\n\nReturn ONLY valid JSON, no explanation:\n{"headline":"max 40 chars, punchy benefit","primaryText":"max 125 chars, shows the result or creates urgency"}` }
        ]
      }]
    });

    const copy = parseAiJson(msg.content[0].text);
    res.json(copy);
  } catch (err) {
    console.error('[generate-copy] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Send processed ad images + copy via email
async function sendAdEmail(ads, service) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'windows@spotoffreflections.com',
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const attachments = ads.map((ad, i) => ({
    filename: `ad-${i + 1}-${ad.fileName}`,
    content: ad.imageBuffer,
    contentType: 'image/jpeg',
  }));

  const bodyLines = ads.map((ad, i) => `
    <div style="margin-bottom:24px;border-bottom:1px solid #eee;padding-bottom:16px;">
      <strong>Ad ${i + 1} — ${ad.fileName}</strong><br>
      <b>Headline:</b> ${ad.headline}<br>
      <b>Primary Text:</b> ${ad.primaryText}<br>
      <em style="color:#888;">Image attached as ad-${i + 1}-${ad.fileName}</em>
    </div>`).join('');

  await transporter.sendMail({
    from: 'windows@spotoffreflections.com',
    to: process.env.AD_EMAIL_TO,
    subject: `Spot Off Ad Pack — ${service} (${ads.length} ads) · ${new Date().toLocaleDateString('en-US')}`,
    html: `<h2>Your Spot Off Ad Pack is ready</h2><p>Service: <strong>${service}</strong></p>${bodyLines}<p style="color:#888;font-size:12px;">Images are 1080x1080 JPEG, ready to upload to Meta Ads Manager.</p>`,
    attachments,
  });
}

// Bulk process images and email ad pack
app.post('/api/bulk-create-from-upload', upload.array('images', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No images uploaded' });

  const service = req.body.service || 'general';
  const addBanner = req.body.addBanner === 'true';
  const bannerText = req.body.bannerText || 'FREE QUOTE · spotoffreflections.com';
  const serviceContext = SERVICE_PROMPTS[service] || SERVICE_PROMPTS['general'];

  const results = [];
  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    try {
      let buf = await enhanceImage(file.buffer);
      buf = await resizeForMeta(buf);
      if (addBanner) buf = await addCtaBanner(buf, bannerText);

      const base64 = buf.toString('base64');
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: `You write Facebook ad copy for Spot Off (spotoffreflections.com), a Houston exterior cleaning company. Target: Houston homeowners. Goal: get a free quote request.\n\n${serviceContext}\n\nReturn ONLY valid JSON:\n{"headline":"max 40 chars, punchy","primaryText":"max 125 chars, conversational"}` },
        ]}],
      });

      const copy = parseAiJson(msg.content[0].text);
      console.log(`[bulk-upload] Photo ${i + 1}/${req.files.length} processed:`, copy.headline);
      results.push({ fileName: file.originalname, imageBuffer: buf, headline: copy.headline, primaryText: copy.primaryText });
    } catch (err) {
      const detail = err.response?.data?.error?.message || err.message;
      console.error(`[bulk-upload] File ${file.originalname} failed:`, detail);
      results.push({ fileName: file.originalname, error: detail });
    }
  }

  const successful = results.filter(r => !r.error);
  if (successful.length > 0) {
    try {
      await sendAdEmail(successful, service);
      console.log(`[bulk-upload] Email sent with ${successful.length} ads to`, process.env.AD_EMAIL_TO);
    } catch (err) {
      console.error('[bulk-upload] Email failed:', err.message);
    }
  }

  res.json({ success: true, ads: results.map(r => ({ fileName: r.fileName, headline: r.headline, primaryText: r.primaryText, error: r.error })) });
});

// Create a before/after ad from two uploaded images
app.post('/api/before-after-ad', upload.fields([{ name: 'before', maxCount: 1 }, { name: 'after', maxCount: 1 }]), async (req, res) => {
  if (!req.files?.before || !req.files?.after) return res.status(400).json({ error: 'Both before and after images are required' });

  const service = req.body.service || 'general';
  const addBanner = req.body.addBanner === 'true';
  const bannerText = req.body.bannerText || 'FREE QUOTE · spotoffreflections.com';
  const serviceContext = SERVICE_PROMPTS[service] || SERVICE_PROMPTS['general'];

  try {
    let buf = await makeBeforeAfter(req.files.before[0].buffer, req.files.after[0].buffer);
    buf = await enhanceImage(buf);
    if (addBanner) buf = await addCtaBanner(buf, bannerText);

    const base64 = buf.toString('base64');
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
        { type: 'text', text: `You write Facebook ad copy for Spot Off (spotoffreflections.com), a Houston exterior cleaning company. This is a before/after transformation photo. ${serviceContext} The dramatic transformation is visible — use that to sell the result.\n\nReturn ONLY valid JSON:\n{"headline":"max 40 chars, shows transformation","primaryText":"max 125 chars, wow-factor result"}` },
      ]}],
    });

    const copy = parseAiJson(msg.content[0].text);
    console.log('[before-after] Processed, sending email...');
    await sendAdEmail([{ fileName: 'before-after.jpg', imageBuffer: buf, headline: copy.headline, primaryText: copy.primaryText }], service);
    res.json({ success: true, headline: copy.headline, primaryText: copy.primaryText });
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    console.error('[before-after] Error:', detail);
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

// Debug — test each step of ad creation with a tiny test image
app.get('/api/debug-ad-create', async (req, res) => {
  const results = {};
  const axios = require('axios');

  // Check env vars
  results.env = {
    META_AD_ACCOUNT_ID: process.env.META_AD_ACCOUNT_ID || 'NOT SET',
    META_PAGE_ID: process.env.META_PAGE_ID || 'NOT SET',
    META_DEFAULT_ADSET_ID: process.env.META_DEFAULT_ADSET_ID || 'NOT SET',
    META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN ? process.env.META_ACCESS_TOKEN.substring(0, 15) + '...' : 'NOT SET',
  };

  // Step 1: upload a 1x1 white pixel image
  try {
    const { uploadImage } = require('./lib/meta-creator');
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const hash = await uploadImage(pixel, 'test-pixel.png');
    results.step1_upload = { ok: true, hash };

    // Step 2: create creative
    try {
      const { createCreative } = require('./lib/meta-creator');
      const creativeId = await createCreative(hash, 'Test Headline', 'Test primary text for debugging.');
      results.step2_creative = { ok: true, creativeId };

      // Step 3: create paused ad
      try {
        const { createPausedAd } = require('./lib/meta-creator');
        const adId = await createPausedAd('DEBUG TEST AD — DELETE ME', creativeId);
        results.step3_ad = { ok: true, adId };
      } catch (err) {
        results.step3_ad = { ok: false, error: err.response?.data || err.message };
      }
    } catch (err) {
      results.step2_creative = { ok: false, error: err.response?.data || err.message };
    }
  } catch (err) {
    results.step1_upload = { ok: false, error: err.response?.data || err.message };
  }

  res.json(results);
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

// Check for 3-day ad follow-up emails every day at noon UTC (7 AM Houston)
cron.schedule('0 12 * * *', () => {
  console.log('[cron] Checking 3-day ad follow-ups...');
  checkAdFollowUps().catch(err => console.error('[cron] Ad follow-up error:', err.message));
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`Spot Off Command Center running at http://localhost:${PORT}`);
  // Pull fresh data on startup
  await refreshData().catch((err) => console.error('[startup] Initial refresh failed:', err.message));
});
