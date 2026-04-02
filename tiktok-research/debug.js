require('dotenv').config();
const axios = require('axios');

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const ACTOR_ID = 'clockworks~free-tiktok-scraper';

async function runActor(input) {
  const runRes = await axios.post(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}`,
    input
  );
  const runId = runRes.data.data.id;
  console.log(`Run started: ${runId}`);

  let status = 'RUNNING';
  while (status === 'RUNNING' || status === 'READY') {
    await new Promise(r => setTimeout(r, 8000));
    const statusRes = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
    );
    status = statusRes.data.data.status;
    console.log(`Status: ${status}`);
  }

  const resultsRes = await axios.get(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`
  );
  return resultsRes.data;
}

async function main() {
  console.log('Fetching @exteriorinnercircle with debug output...\n');

  const results = await runActor({
    profiles: ['https://www.tiktok.com/@exteriorinnercircle'],
    resultsPerPage: 30,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  });

  console.log(`\nTotal items returned: ${results.length}`);
  if (results.length > 0) {
    console.log('\n--- FIRST ITEM RAW DATA ---');
    console.log(JSON.stringify(results[0], null, 2));
    console.log('\n--- ALL FIELD NAMES ---');
    console.log(Object.keys(results[0]));
  }
}

main().catch(console.error);
