require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'https://services.leadconnectorhq.com';
const headers = {
  Authorization: `Bearer ${process.env.GHL_API_KEY}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json',
};

const PAID_STAGE_ID = 'c4c79f61-5570-40f0-a594-893d4128661f';

const toMove = [
  { id: 'Y7j5GhVPVVOZjIfum0UY', name: 'Wade Whilden' },
  { id: 'AGRUF3jaWdRwGPKSTa3B', name: 'Randy Mackay' },
  { id: 'Hdd5ak2OraCriAnJhkJ7', name: 'Chris Roberts' },
  { id: 'n7KRX3XLk7vktck8hQZB', name: 'Ken Mire' },
  { id: 'SfUsHdRf5Cf90gziK0NS', name: 'J DeFrayne' },
  { id: 'ZQzekN2OTA6OpILj9y0C', name: 'Lou Friedl' },
  { id: 'NByljfsnAJKSCyfU1g05', name: 'Majid Basit' },
  { id: 'bYhj2fWdiAE6LE7rX1Wm', name: 'Rene Castaneda' },
  { id: '5PsnHgbON4OHKTHt8KnY', name: 'Billy Wittenberg' },
];

async function run() {
  for (const opp of toMove) {
    try {
      await axios.put(`${BASE_URL}/opportunities/${opp.id}`, { pipelineStageId: PAID_STAGE_ID }, { headers });
      console.log('✅ Moved to Paid:', opp.name);
    } catch (err) {
      console.log('❌ Failed:', opp.name, err.response?.data?.message || err.message);
    }
  }
  console.log('\nDone. Hit Refresh Now on the dashboard.');
}

run().catch(console.error);
