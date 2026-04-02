require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'https://services.leadconnectorhq.com';
const LOCATION_ID = process.env.GHL_LOCATION_ID;
const headers = {
  Authorization: `Bearer ${process.env.GHL_API_KEY}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json',
};

// The 12 jobs from the invoice PDF
const jobs = [
  { name: 'Wade Whilden',              value: 600  },
  { name: 'Indalecio Andy Rodriguez',  value: 1950 },
  { name: 'Bobby Owen',                value: 1160 },
  { name: 'Ryan O. Smith',             value: 400  },
  { name: 'Japhet Diaz',               value: 1000 },
  { name: 'Robert W. Balogh',          value: 635  },
  { name: 'Ken Mire',                  value: 500  },
  { name: 'Jay DeFrayne',              value: 450  },
  { name: 'Lou Friedl',               value: 974  },
  { name: 'Majid Basit',               value: 349  },
  { name: 'Rene Castaneda',            value: 1569 },
  { name: 'Billy Wittenberg',          value: 722  },
];

async function getAllOpportunities() {
  let all = [];
  let page = 1;
  while (true) {
    const res = await axios.get(`${BASE_URL}/opportunities/search`, {
      headers,
      params: { location_id: LOCATION_ID, limit: 100, page },
    });
    const opps = res.data?.opportunities || [];
    all = all.concat(opps);
    if (opps.length < 100) break;
    page++;
  }
  return all;
}

async function updateOpportunity(oppId, value) {
  await axios.put(`${BASE_URL}/opportunities/${oppId}`, { monetaryValue: value }, { headers });
}

async function run() {
  console.log('Fetching all opportunities from GHL...');
  const opps = await getAllOpportunities();
  console.log(`Found ${opps.length} total opportunities\n`);

  for (const job of jobs) {
    // Fuzzy match: check if opp name contains any word from the job name
    const words = job.name.toLowerCase().split(/\s+/);
    const match = opps.find(o => {
      const oppName = (o.name || '').toLowerCase();
      return words.some(w => w.length > 2 && oppName.includes(w));
    });

    if (!match) {
      console.log(`❌ NOT FOUND: ${job.name} ($${job.value})`);
      continue;
    }

    try {
      await updateOpportunity(match.id, job.value);
      console.log(`✅ Updated: ${match.name} → $${job.value}  (id: ${match.id})`);
    } catch (err) {
      console.log(`❌ Failed:  ${match.name} — ${err.response?.data?.message || err.message}`);
    }
  }

  console.log('\nDone. Run "npm start" and hit Refresh Now to see real ROAS.');
}

run().catch(console.error);
