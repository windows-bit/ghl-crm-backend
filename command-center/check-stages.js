require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'https://services.leadconnectorhq.com';
const LOCATION_ID = process.env.GHL_LOCATION_ID;
const headers = {
  Authorization: `Bearer ${process.env.GHL_API_KEY}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json',
};

// The 12 opportunity IDs we just updated
const oppIds = [
  'Y7j5GhVPVVOZjIfum0UY',
  'AGRUF3jaWdRwGPKSTa3B',
  'sCuij4SPBeN4VPwTBXpj',
  'rDR7WAA3gezeyIkyc869',
  'rdyuy1C8adNq0lVf1vBS',
  'Hdd5ak2OraCriAnJhkJ7',
  'n7KRX3XLk7vktck8hQZB',
  'SfUsHdRf5Cf90gziK0NS',
  'ZQzekN2OTA6OpILj9y0C',
  'NByljfsnAJKSCyfU1g05',
  'bYhj2fWdiAE6LE7rX1Wm',
  '5PsnHgbON4OHKTHt8KnY',
];

async function getStageMaps() {
  const res = await axios.get(`${BASE_URL}/opportunities/pipelines`, {
    headers, params: { locationId: LOCATION_ID },
  });
  const pipelines = res.data?.pipelines || [];
  const stageMap = {};
  const stageIdByName = {};
  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages || []) {
      stageMap[stage.id] = stage.name;
      stageIdByName[stage.name.toLowerCase()] = stage.id;
    }
  }
  return { stageMap, stageIdByName };
}

async function run() {
  const { stageMap, stageIdByName } = await getStageMaps();
  console.log('\nAvailable "paid" type stages:');
  Object.entries(stageIdByName).forEach(([name, id]) => {
    if (['paid', 'job complete', 'job completed', 'won'].includes(name)) {
      console.log(`  "${name}" → ${id}`);
    }
  });

  console.log('\nChecking current stage for each of the 12 jobs:\n');
  for (const id of oppIds) {
    const res = await axios.get(`${BASE_URL}/opportunities/${id}`, { headers });
    const opp = res.data?.opportunity || res.data;
    const stageName = stageMap[opp.pipelineStageId] || opp.pipelineStageId;
    const isComplete = ['Paid', 'Job Complete', 'Job Completed'].includes(stageName);
    const marker = isComplete ? '✅' : '❌';
    console.log(`${marker} ${opp.name} — stage: "${stageName}" — value: $${opp.monetaryValue || 0}`);
  }
}

run().catch(console.error);
