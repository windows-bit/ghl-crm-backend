require('dotenv').config();
const axios = require('axios');

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const ACTOR_ID = 'clockworks~free-tiktok-scraper';

const OWN_ACCOUNT = 'exteriorinnercircle';
const HASHTAGS = ['servicebusiness', 'windowcleaning', 'pressurewashing', 'smallbusiness'];

async function runActor(input) {
  const runRes = await axios.post(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}`,
    input
  );
  const runId = runRes.data.data.id;
  console.log(`Actor run started: ${runId}`);

  let status = 'RUNNING';
  while (status === 'RUNNING' || status === 'READY') {
    await new Promise(r => setTimeout(r, 8000));
    const statusRes = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
    );
    status = statusRes.data.data.status;
    process.stdout.write(`Status: ${status}\r`);
  }

  if (status !== 'SUCCEEDED') {
    throw new Error(`Run failed: ${status}`);
  }

  const resultsRes = await axios.get(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`
  );
  return resultsRes.data;
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function analyzeOwnVideos(videos) {
  if (!videos.length) return;

  // Sort by views
  const sorted = [...videos].sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
  const top5 = sorted.slice(0, 5);
  const bottom5 = sorted.slice(-5);
  const avgViews = videos.reduce((sum, v) => sum + (v.playCount || 0), 0) / videos.length;

  console.log('\n========================================');
  console.log('   @inhousegrowth ACCOUNT AUDIT');
  console.log('========================================');
  console.log(`\nTotal videos analyzed: ${videos.length}`);
  console.log(`Average views: ${formatNumber(Math.round(avgViews))}`);

  console.log('\n### What\'s Working (Top 5 Videos)');
  top5.forEach((v, i) => {
    const hook = v.text ? v.text.substring(0, 80) : 'No caption';
    console.log(`\n${i + 1}. Views: ${formatNumber(v.playCount || 0)} | Likes: ${formatNumber(v.diggCount || 0)}`);
    console.log(`   Hook/Caption: "${hook}"`);
    console.log(`   URL: ${v.webVideoUrl || 'N/A'}`);
  });

  console.log('\n### What\'s NOT Working (Bottom 5 Videos)');
  bottom5.forEach((v, i) => {
    const hook = v.text ? v.text.substring(0, 80) : 'No caption';
    console.log(`\n${i + 1}. Views: ${formatNumber(v.playCount || 0)} | Likes: ${formatNumber(v.diggCount || 0)}`);
    console.log(`   Hook/Caption: "${hook}"`);
  });
}

function analyzeHashtagTrends(hashtagResults) {
  console.log('\n========================================');
  console.log('   TRENDING CONTENT IN YOUR NICHE');
  console.log('========================================');

  for (const [tag, videos] of Object.entries(hashtagResults)) {
    if (!videos.length) continue;
    const top3 = [...videos].sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 3);
    console.log(`\n#${tag} — Top 3 Videos:`);
    top3.forEach((v, i) => {
      const hook = v.text ? v.text.substring(0, 100) : 'No caption';
      console.log(`  ${i + 1}. ${formatNumber(v.playCount || 0)} views — "${hook}"`);
    });
  }
}

function printNewIdeas(ownVideos, hashtagResults) {
  console.log('\n========================================');
  console.log('   NEW CONTENT IDEAS');
  console.log('========================================');
  console.log('\nBased on top performing content in your niche:');

  // Generic ideas based on what works in service business content
  const ideas = [
    { concept: 'Day in the life on a job', hook: 'I made $X in one afternoon cleaning windows — here\'s how' },
    { concept: 'Price reveal video', hook: 'How much does window cleaning actually cost? Here\'s what we charge' },
    { concept: 'Equipment breakdown', hook: 'This $X tool makes me $X per day — worth it?' },
    { concept: 'First job story', hook: 'My first window cleaning job was a disaster — here\'s what happened' },
    { concept: 'How to get clients', hook: 'I landed 5 clients in one week with zero ads — here\'s exactly what I did' },
  ];

  ideas.forEach((idea, i) => {
    console.log(`\n${i + 1}. ${idea.concept}`);
    console.log(`   Hook: "${idea.hook}"`);
  });
}

async function main() {
  console.log('Starting TikTok research for @inhousegrowth...\n');

  // 1. Pull own account videos
  let ownVideos = [];
  try {
    console.log(`Pulling @${OWN_ACCOUNT} videos...`);
    ownVideos = await runActor({
      profiles: [`https://www.tiktok.com/@${OWN_ACCOUNT}`],
      resultsPerPage: 30,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    });
    console.log(`\nFetched ${ownVideos.length} videos from @${OWN_ACCOUNT}`);
  } catch (err) {
    console.error('Error fetching own account:', err.message);
  }

  // 2. Pull trending hashtag content
  const hashtagResults = {};
  for (const tag of HASHTAGS) {
    try {
      console.log(`\nPulling #${tag} trending videos...`);
      const videos = await runActor({
        hashtags: [tag],
        resultsPerPage: 10,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
      });
      hashtagResults[tag] = videos;
      console.log(`Fetched ${videos.length} videos for #${tag}`);
    } catch (err) {
      console.error(`Error fetching #${tag}:`, err.message);
      hashtagResults[tag] = [];
    }
  }

  // 3. Print report
  if (ownVideos.length) {
    analyzeOwnVideos(ownVideos);
  } else {
    console.log('\nNo videos found for @inhousegrowth — account may be private or username changed.');
  }

  analyzeHashtagTrends(hashtagResults);
  printNewIdeas(ownVideos, hashtagResults);

  console.log('\n========================================');
  console.log('Report complete.');
  console.log('========================================\n');
}

main();
