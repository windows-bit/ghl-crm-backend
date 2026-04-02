require('dotenv').config();
const axios = require('axios');
async function run() {
  const res = await axios.get('https://services.leadconnectorhq.com/opportunities/pipelines', {
    headers: { Authorization: `Bearer ${process.env.GHL_API_KEY}`, Version: '2021-07-28' },
    params: { locationId: process.env.GHL_LOCATION_ID }
  });
  res.data.pipelines.forEach(p => console.log(`"${p.name}" — id: ${p.id}`));
}
run().catch(console.error);
