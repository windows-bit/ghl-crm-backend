require('dotenv').config();
const axios = require('axios');

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const ACTOR_ID = 'clockworks~free-tiktok-scraper';

const HASHTAGS = [
  'windowcleaning',
  'pressurewashing',
  'windowcleaningbusiness',
  'pressurewashingbusiness',
  'servicebusiness',
  'exteriorcleaningbusiness',
  'softwashtiktok',
  'cleaningtiktok'
];

async function runActor(input) {
  const runRes = await axios.post(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}`,
    input
  );
  const runId = runRes.data.data.id;

  let status = 'RUNNING';
  while (status === 'RUNNING' || status === 'READY') {
    await new Promise(r => setTimeout(r, 8000));
    const statusRes = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
    );
    status = statusRes.data.data.status;
    process.stdout.write(`  [${status}]\r`);
  }

  if (status !== 'SUCCEEDED') throw new Error(`Run failed: ${status}`);

  const resultsRes = await axios.get(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`
  );
  return resultsRes.data;
}

function fmt(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function detectContentType(text) {
  if (!text) return 'No caption';
  const t = text.toLowerCase();
  if (t.includes('how to') || t.includes('tutorial') || t.includes('step')) return 'Tutorial';
  if (t.includes('day in') || t.includes('daily') || t.includes('routine')) return 'Day in the life';
  if (t.includes('before') && t.includes('after')) return 'Before/After';
  if (t.includes('satisfying') || t.includes('asmr') || t.includes('oddly')) return 'Satisfying/ASMR';
  if (t.includes('mistake') || t.includes('never') || t.includes('wrong')) return 'Mistake/Warning';
  if (t.includes('how much') || t.includes('$') || t.includes('made') || t.includes('income')) return 'Income/Money';
  if (t.includes('start') || t.includes('beginner') || t.includes('first')) return 'How to Start';
  if (t.includes('tip') || t.includes('hack') || t.includes('secret')) return 'Tips/Hacks';
  return 'Other';
}

async function main() {
  console.log('========================================');
  console.log('   NICHE RESEARCH — Best Performing TikTok Content');
  console.log('   Exterior Cleaning / Service Business');
  console.log('========================================\n');

  const allVideos = [];

  for (const tag of HASHTAGS) {
    process.stdout.write(`Scraping #${tag}... `);
    try {
      const videos = await runActor({
        hashtags: [tag],
        resultsPerPage: 20,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
      });
      console.log(`  Got ${videos.length} videos`);
      videos.forEach(v => { v._tag = tag; });
      allVideos.push(...videos);
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
    }
  }

  // Deduplicate by video ID
  const seen = new Set();
  const unique = allVideos.filter(v => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });

  // Sort by views
  const sorted = unique.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
  const top20 = sorted.slice(0, 20);

  console.log('\n========================================');
  console.log('   TOP 20 VIDEOS IN YOUR NICHE');
  console.log('========================================\n');

  top20.forEach((v, i) => {
    const caption = v.text ? v.text.substring(0, 100).replace(/\n/g, ' ') : 'No caption';
    const type = detectContentType(v.text);
    const engRate = v.playCount ? ((v.diggCount || 0) / v.playCount * 100).toFixed(1) : '0';
    console.log(`${i + 1}. [${fmt(v.playCount)} views] [${fmt(v.diggCount)} likes] [${engRate}% eng] #${v._tag}`);
    console.log(`   Type: ${type}`);
    console.log(`   Caption: "${caption}"`);
    console.log(`   URL: ${v.webVideoUrl || 'N/A'}`);
    console.log();
  });

  // Content type breakdown
  console.log('========================================');
  console.log('   WHAT CONTENT TYPES PERFORM BEST');
  console.log('========================================\n');

  const typeStats = {};
  sorted.slice(0, 50).forEach(v => {
    const type = detectContentType(v.text);
    if (!typeStats[type]) typeStats[type] = { count: 0, totalViews: 0, totalLikes: 0 };
    typeStats[type].count++;
    typeStats[type].totalViews += v.playCount || 0;
    typeStats[type].totalLikes += v.diggCount || 0;
  });

  const typeRanked = Object.entries(typeStats)
    .map(([type, s]) => ({ type, ...s, avgViews: Math.round(s.totalViews / s.count) }))
    .sort((a, b) => b.avgViews - a.avgViews);

  typeRanked.forEach(t => {
    console.log(`${t.type}`);
    console.log(`  Avg views: ${fmt(t.avgViews)} | Videos analyzed: ${t.count} | Total views: ${fmt(t.totalViews)}`);
    console.log();
  });

  // Best hooks
  console.log('========================================');
  console.log('   TOP HOOKS (opening lines that got millions of views)');
  console.log('========================================\n');

  top20.slice(0, 10).forEach((v, i) => {
    const firstLine = v.text ? v.text.split('\n')[0].substring(0, 120) : 'No caption';
    console.log(`${i + 1}. ${fmt(v.playCount)} views → "${firstLine}"`);
  });

  // Hashtag performance
  console.log('\n========================================');
  console.log('   HASHTAG REACH COMPARISON');
  console.log('========================================\n');

  const tagStats = {};
  unique.forEach(v => {
    const tag = v._tag;
    if (!tagStats[tag]) tagStats[tag] = { count: 0, totalViews: 0 };
    tagStats[tag].count++;
    tagStats[tag].totalViews += v.playCount || 0;
  });

  Object.entries(tagStats)
    .map(([tag, s]) => ({ tag, ...s, avgViews: Math.round(s.totalViews / s.count) }))
    .sort((a, b) => b.avgViews - a.avgViews)
    .forEach(t => {
      console.log(`#${t.tag} — avg ${fmt(t.avgViews)} views per video (${t.count} videos sampled)`);
    });

  console.log('\n========================================');
  console.log('   WHAT THIS MEANS FOR YOUR CONTENT');
  console.log('========================================\n');

  const topType = typeRanked[0];
  const topTag = Object.entries(tagStats)
    .map(([tag, s]) => ({ tag, avgViews: Math.round(s.totalViews / s.count) }))
    .sort((a, b) => b.avgViews - a.avgViews)[0];

  console.log(`- Best content format in your niche: ${topType.type} (${fmt(topType.avgViews)} avg views)`);
  console.log(`- Best hashtag for reach: #${topTag.tag} (${fmt(topTag.avgViews)} avg views per video)`);
  console.log(`- Total videos analyzed: ${unique.length}`);
  console.log(`- Top video in niche: ${fmt(top20[0]?.playCount)} views`);
  console.log('\nSave this report and compare next week to track trends.\n');
}

main().catch(console.error);
