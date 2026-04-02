require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const { createContact } = require('./ghl');

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const ACTOR_ID = 'nwua9Gu5YrADL7ZDj'; // Apify Google Maps Scraper

const SEARCH_TERMS = [
  // Houston general
  'property management company Houston TX',
  'HOA management Houston TX',
  'commercial property management Houston TX',
  'residential property management Houston TX',
  'rental property management Houston TX',
  'apartment management company Houston TX',
  'multifamily property management Houston TX',
  'condominium management Houston TX',
  'building management company Houston TX',
  'realty management Houston TX',
  // Houston neighborhoods
  'property management Houston Heights TX',
  'property management Montrose Houston TX',
  'property management Galleria Houston TX',
  'property management Midtown Houston TX',
  'property management Memorial Houston TX',
  'property management Katy TX',
  'property management Cypress TX',
  'property management Spring TX',
  'property management Humble TX',
  'property management Pasadena TX',
  'property management Baytown TX',
  'property management Tomball TX',
  'property management Pearland TX',
  'property management Sugar Land TX',
  'property management La Porte TX',
  'property management Friendswood TX',
  'property management Bellaire TX',
  'property management Webster TX',
  'property management Deer Park TX',
  'property management Stafford TX',
  'property management Missouri City TX',
  'property management Seabrook TX',
  'property management League City TX',
  'property management Channelview TX',
  'property management Galena Park TX',
  // Harris County general
  'HOA management Harris County TX',
  'property management company Harris County TX',
  'commercial real estate management Houston TX',
  'office building management Houston TX',
  'retail property management Houston TX'
];

async function runScraper(searchTerm) {
  console.log(`\nScraping: "${searchTerm}"...`);

  // Start actor run
  const runRes = await axios.post(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}`,
    {
      searchStringsArray: [searchTerm],
      maxCrawledPlacesPerSearch: 100,
      language: 'en',
      countryCode: 'us'
    }
  );

  const runId = runRes.data.data.id;
  console.log(`Run started: ${runId}`);

  // Wait for run to finish
  let status = 'RUNNING';
  while (status === 'RUNNING' || status === 'READY') {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
    );
    status = statusRes.data.data.status;
    console.log(`Status: ${status}`);
  }

  if (status !== 'SUCCEEDED') {
    console.error(`Run failed with status: ${status}`);
    return [];
  }

  // Get results
  const resultsRes = await axios.get(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`
  );

  return resultsRes.data;
}

function parseLead(place) {
  const nameParts = (place.title || '').split(' ');
  return {
    firstName: nameParts[0] || '',
    lastName: nameParts.slice(1).join(' ') || '',
    phone: place.phone || '',
    email: place.email || '',
    address: place.address || '',
    city: 'Houston',
    state: 'TX',
    source: 'google-maps'
  };
}

async function main() {
  console.log('Starting Google Maps lead scraper for Houston...');
  let totalPushed = 0;
  const csvRows = ['Company,Phone,Email,Address'];

  for (const term of SEARCH_TERMS) {
    try {
      const places = await runScraper(term);
      console.log(`Found ${places.length} results`);

      for (const place of places) {
        const lead = parseLead(place);

        // Always save to CSV regardless of phone
        const row = [
          `"${(place.title || '').replace(/"/g, '""')}"`,
          `"${lead.phone}"`,
          `"${lead.email}"`,
          `"${lead.address}"`
        ].join(',');
        csvRows.push(row);

        // Skip pushing to GHL if no phone number
        if (!lead.phone) {
          console.log(`Skipping GHL push for ${place.title} — no phone number`);
          continue;
        }

        try {
          await createContact(lead);
          console.log(`✓ Pushed to GHL: ${place.title} — ${lead.phone}`);
          totalPushed++;
          // Small delay to avoid GHL rate limits
          await new Promise(r => setTimeout(r, 500));
        } catch (err) {
          console.error(`✗ Failed to push ${place.title}:`, err.message);
        }
      }
    } catch (err) {
      console.error(`Error scraping "${term}":`, err.message);
    }
  }

  const csvPath = 'houston-property-managers.csv';
  fs.writeFileSync(csvPath, csvRows.join('\n'));
  console.log(`\nCSV saved: ${csvPath} (${csvRows.length - 1} leads)`);
  console.log(`Done. Total leads pushed to GHL: ${totalPushed}`);
}

main();
