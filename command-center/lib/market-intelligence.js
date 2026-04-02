require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const META_TOKEN = process.env.META_ACCESS_TOKEN;
const TIKTOK_ACTOR_ID = 'clockworks~free-tiktok-scraper';

const DATA_DIR = path.join(__dirname, '..', 'data');
const MI_FILE = path.join(DATA_DIR, 'market-intelligence.json');
const TIKTOK_IDEAS_FILE = path.join(DATA_DIR, 'tiktok-ideas.json');
const META_RECS_FILE = path.join(DATA_DIR, 'meta-recommendations.json');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Reddit ───────────────────────────────────────────────────────────────────

async function scrapeReddit() {
  const subreddits = ['pressurewashing', 'windowcleaning', 'homeimprovement'];
  const posts = [];

  for (const sub of subreddits) {
    try {
      const res = await axios.get(`https://www.reddit.com/r/${sub}/top.json?t=week&limit=5`, {
        headers: { 'User-Agent': 'SpotOffBot/1.0 (marketing dashboard)' },
        timeout: 10000,
      });
      const items = res.data?.data?.children || [];
      items.forEach(item => {
        const d = item.data;
        posts.push({
          subreddit: sub,
          title: d.title,
          upvotes: d.ups,
          comments: d.num_comments,
          body: d.selftext ? d.selftext.substring(0, 200) : '',
          url: `https://reddit.com${d.permalink}`,
        });
      });
    } catch (err) {
      console.error(`[reddit] Error scraping r/${sub}:`, err.message);
    }
  }

  return posts;
}

// ─── Meta Ad Library (via Apify Google Search) ────────────────────────────────
// Official Meta Ad Library API requires Meta app review (takes days).
// Instead we search Google for competitor Facebook ads — no permissions needed.

async function scrapeMetaAdLibrary() {
  const queries = [
    'site:facebook.com "window cleaning" Houston',
    'site:facebook.com "pressure washing" Houston TX',
    'site:facebook.com "soft washing" Houston',
    'site:facebook.com "roof washing" Houston',
    'site:facebook.com "house washing" Houston TX',
  ];

  try {
    const runRes = await axios.post(
      `https://api.apify.com/v2/acts/apify~google-search-scraper/runs?token=${APIFY_TOKEN}`,
      {
        queries: queries.join('\n'),
        maxPagesPerQuery: 1,
        resultsPerPage: 5,
        mobileResults: false,
        languageCode: 'en',
        countryCode: 'us',
      },
      { timeout: 30000 }
    );

    const runId = runRes.data.data.id;
    let status = 'RUNNING';
    let attempts = 0;
    while ((status === 'RUNNING' || status === 'READY') && attempts < 20) {
      await new Promise(r => setTimeout(r, 6000));
      const statusRes = await axios.get(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
      status = statusRes.data.data.status;
      attempts++;
    }

    if (status !== 'SUCCEEDED') {
      console.error('[meta-library] Apify run did not succeed:', status);
      return [];
    }

    const dataRes = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}&limit=40`
    );

    const results = dataRes.data || [];
    const ads = [];
    const seen = new Set();

    for (const page of results) {
      const keyword = (page.searchQuery?.term || '')
        .replace(/site:facebook\.com\s*/i, '')
        .replace(/Houston TX|Houston/gi, '')
        .replace(/"/g, '')
        .trim();
      for (const item of (page.organicResults || [])) {
        if (seen.has(item.url)) continue;
        // Only include actual Facebook pages — skip YouTube, blogs, etc.
        if (!item.url?.includes('facebook.com')) continue;
        seen.add(item.url);
        const title = item.title || '';
        const desc = item.description || '';
        // Extract page name from title (Facebook titles are usually "Page Name - Facebook")
        const pageName = title.split(' - ')[0].split(' | ')[0].trim();
        ads.push({
          advertiser: pageName || 'Unknown',
          text: desc.substring(0, 300),
          hook: desc.split('.')[0].substring(0, 120),
          url: item.url || null,
          keyword,
        });
      }
    }

    console.log(`[meta-library] Google search returned ${ads.length} competitor ad results`);
    return ads;
  } catch (err) {
    console.error('[meta-library] Error:', err.response?.data || err.message);
    return [];
  }
}

// ─── TikTok via Apify ─────────────────────────────────────────────────────────

async function runApifyActor(input) {
  const runRes = await axios.post(
    `https://api.apify.com/v2/acts/${TIKTOK_ACTOR_ID}/runs?token=${APIFY_TOKEN}`,
    input,
    { timeout: 30000 }
  );
  const runId = runRes.data.data.id;

  let status = 'RUNNING';
  let attempts = 0;
  while ((status === 'RUNNING' || status === 'READY') && attempts < 30) {
    await new Promise(r => setTimeout(r, 8000));
    const statusRes = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
    );
    status = statusRes.data.data.status;
    attempts++;
  }

  if (status !== 'SUCCEEDED') throw new Error(`Apify run failed: ${status}`);

  const resultsRes = await axios.get(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`
  );
  return resultsRes.data;
}

function detectContentType(text) {
  if (!text) return 'Other';
  const t = text.toLowerCase();
  if (t.includes('how to') || t.includes('tutorial') || t.includes('step')) return 'Tutorial';
  if (t.includes('day in') || t.includes('daily') || t.includes('routine')) return 'Day in the life';
  if (t.includes('before') && t.includes('after')) return 'Before/After';
  if (t.includes('satisfying') || t.includes('asmr')) return 'Satisfying/ASMR';
  if (t.includes('mistake') || t.includes('never') || t.includes('wrong')) return 'Mistake/Warning';
  if (t.includes('how much') || t.includes('$') || t.includes('income')) return 'Income/Money';
  if (t.includes('start') || t.includes('beginner') || t.includes('first')) return 'How to Start';
  if (t.includes('tip') || t.includes('hack') || t.includes('secret')) return 'Tips/Hacks';
  return 'Other';
}

async function scrapeTikTok() {
  if (!APIFY_TOKEN) {
    console.warn('[tiktok] No APIFY_API_TOKEN set — skipping TikTok scrape');
    return [];
  }

  const hashtags = ['windowcleaning', 'pressurewashing', 'softwashing', 'exteriorclean'];
  // Run all hashtags in parallel to save time
  const results = await Promise.allSettled(
    hashtags.map(tag =>
      runApifyActor({ hashtags: [tag], resultsPerPage: 10, shouldDownloadVideos: false, shouldDownloadCovers: false })
        .then(videos => { videos.forEach(v => { v._tag = tag; }); return videos; })
        .catch(err => { console.error(`[tiktok] Error on #${tag}:`, err.message); return []; })
    )
  );

  const allVideos = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

  const seen = new Set();
  return allVideos
    .filter(v => { if (seen.has(v.id)) return false; seen.add(v.id); return true; })
    .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
    .slice(0, 20)
    .map(v => ({
      id: v.id,
      tag: v._tag,
      views: v.playCount || 0,
      likes: v.diggCount || 0,
      caption: (v.text || '').substring(0, 200),
      hook: (v.text || '').split('\n')[0].substring(0, 120),
      contentType: detectContentType(v.text),
      url: v.webVideoUrl || null,
      engagementRate: v.playCount ? ((v.diggCount || 0) / v.playCount * 100).toFixed(1) : '0',
    }));
}

// ─── Claude Analysis ──────────────────────────────────────────────────────────

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in Claude response');
  return JSON.parse(match[0]);
}

async function analyzeNicheBuzz(redditPosts, metaAds, tiktokVideos) {
  const prompt = `You are a marketing analyst for Spot Off Reflections, a Houston exterior cleaning company (windows, pressure washing, soft washing, gutters).

Analyze this data and return ONLY valid JSON — no extra text.

Reddit top posts this week:
${redditPosts.slice(0, 8).map(p => `- [r/${p.subreddit}] "${p.title}" (${p.upvotes} upvotes)`).join('\n')}

Competitor Meta ads running now:
${metaAds.slice(0, 6).map(a => `- ${a.advertiser}: "${a.hook}"`).join('\n')}

Top TikTok in niche this week:
${tiktokVideos.slice(0, 8).map(v => `- [${v.contentType}] ${Math.round(v.views/1000)}K views | "${v.hook}"`).join('\n')}

JSON format:
{"nicheBuzz": ["one-sentence topic 1", "one-sentence topic 2", "one-sentence topic 3"]}`;

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });
  return extractJson(msg.content[0].text);
}

async function generateTikTokIdeasFromData(tiktokVideos, redditPosts) {
  const prompt = `You are a TikTok strategist for @exteriorinnercircle — a page teaching service business owners (window cleaning, pressure washing) how to grow and make money.

EVAN'S FILMING STYLE — every idea MUST fit one of these two formats:
1. Face-to-camera: Evan talking directly into his phone, seated or standing, no field footage needed
2. Screen share: Evan records his computer screen (showing GHL, Meta Ads, spreadsheets, quotes, etc.) while narrating

Evan is the authority — a Houston exterior cleaning business owner who knows pricing, sales, marketing, and operations. Ideas should position him as the expert other service business owners learn from.

Content tone: direct, no-fluff, educational. Think "here's exactly what I do" not "here are some tips."

Trending niche videos this week:
${tiktokVideos.slice(0, 8).map(v => `- [${v.contentType}] ${Math.round(v.views/1000)}K views | "${v.hook}"`).join('\n')}

Hot Reddit topics service business owners are asking about:
${redditPosts.slice(0, 4).map(p => `- "${p.title}"`).join('\n')}

Generate 10 specific TikTok video ideas. Every idea must be filmable with just Evan's face or his computer screen — no job site footage. Mix the content types — don't repeat the same type more than 3 times. Return ONLY valid JSON — no extra text.

{"ideas":[
  {"title":"video title","hook":"exact opening line Evan says on camera","contentType":"Tutorial|Breakdown|Myth Bust|How I|Storytime|Screen Share","format":"face-to-camera OR screen-share — one sentence on exactly how to film it","why":"why this will get views and build authority"}
]}`;

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });
  return extractJson(msg.content[0].text);
}

async function generateMetaRecsFromData(metaAds, dashboardCache) {
  const d = dashboardCache?.meta?.last30;
  const prompt = `You are a Meta Ads strategist for Spot Off Reflections, a Houston exterior cleaning company.

My Meta Ads last 30 days:
- Spend: $${d?.spend || 'unknown'} | Leads: ${d?.leads || 'unknown'} | CPL: $${d?.cpl || 'unknown'}
${(d?.campaigns || []).map(c => `- Campaign "${c.name}": $${c.spend} spend, ${c.leads} leads, CPL $${c.cpl}, ROAS ${c.roas || '—'}`).join('\n')}

Competitor ads running now:
${metaAds.slice(0, 5).map(a => `- "${a.advertiser}": "${a.hook}" | "${a.text.substring(0, 100)}"`).join('\n\n')}

Give 3-5 specific, actionable Meta Ads recommendations. Return ONLY valid JSON — no extra text.

{"recommendations":["specific rec 1","specific rec 2","specific rec 3","specific rec 4","specific rec 5"]}`;

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });
  return extractJson(msg.content[0].text);
}

// ─── File Helpers ─────────────────────────────────────────────────────────────

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ─── Main Orchestrators ───────────────────────────────────────────────────────

async function runMarketIntelligence() {
  console.log('[intel] Starting market intelligence run...');
  writeJson(MI_FILE, { status: 'running', lastUpdated: new Date().toISOString() });

  try {
    const [redditResult, metaResult, tiktokResult] = await Promise.allSettled([
      scrapeReddit(),
      scrapeMetaAdLibrary(),
      scrapeTikTok(),
    ]);

    const reddit = redditResult.status === 'fulfilled' ? redditResult.value : [];
    const ads = metaResult.status === 'fulfilled' ? metaResult.value : [];
    const tiktok = tiktokResult.status === 'fulfilled' ? tiktokResult.value : [];

    console.log(`[intel] Scraped: ${reddit.length} Reddit posts, ${ads.length} Meta ads, ${tiktok.length} TikTok videos`);

    let analysis = {};
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        analysis = await analyzeNicheBuzz(reddit, ads, tiktok);
      } catch (err) {
        console.error('[intel] Niche buzz analysis failed:', err.message);
      }
    }

    const result = {
      status: 'complete',
      lastUpdated: new Date().toISOString(),
      reddit: { posts: reddit },
      metaAdLibrary: { ads },
      tiktok: { videos: tiktok },
      analysis,
    };

    writeJson(MI_FILE, result);
    console.log('[intel] Market intelligence run complete');

    // Generate fresh TikTok ideas right after scraping
    if (process.env.ANTHROPIC_API_KEY && tiktok.length > 0) {
      await generateTikTokIdeas().catch(err => console.error('[intel] TikTok ideas failed:', err.message));
    }

    return result;
  } catch (err) {
    console.error('[intel] Run failed:', err.message);
    writeJson(MI_FILE, { status: 'error', error: err.message, lastUpdated: new Date().toISOString() });
    throw err;
  }
}

async function generateTikTokIdeas() {
  console.log('[intel] Generating TikTok ideas...');
  const mi = readJson(MI_FILE) || {};
  const tiktok = mi?.tiktok?.videos || [];
  const reddit = mi?.reddit?.posts || [];

  const result = await generateTikTokIdeasFromData(tiktok, reddit);
  const output = { lastUpdated: new Date().toISOString(), ideas: result.ideas || [] };
  writeJson(TIKTOK_IDEAS_FILE, output);
  console.log('[intel] TikTok ideas saved');
  return output;
}

async function generateMetaRecommendations() {
  console.log('[intel] Generating Meta recommendations...');
  const mi = readJson(MI_FILE) || {};
  const dashCache = readJson(path.join(DATA_DIR, 'cache.json')) || {};

  const metaAds = mi?.metaAdLibrary?.ads || [];
  const result = await generateMetaRecsFromData(metaAds, dashCache);
  const output = { lastUpdated: new Date().toISOString(), recommendations: result.recommendations || [] };
  writeJson(META_RECS_FILE, output);
  console.log('[intel] Meta recommendations saved');
  return output;
}

module.exports = {
  runMarketIntelligence,
  generateTikTokIdeas,
  generateMetaRecommendations,
  MI_FILE,
  TIKTOK_IDEAS_FILE,
  META_RECS_FILE,
  readJson,
};
