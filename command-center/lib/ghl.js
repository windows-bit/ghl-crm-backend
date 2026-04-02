const axios = require('axios');
require('dotenv').config();

const BASE_URL = 'https://services.leadconnectorhq.com';
const LOCATION_ID = process.env.GHL_LOCATION_ID;

const headers = {
  Authorization: `Bearer ${process.env.GHL_API_KEY}`,
  Version: '2021-07-28',
};

async function axiosRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// Build a map of stageId -> stageName from GHL pipelines
async function getStageMaps() {
  const res = await axiosRetry(() => axios.get(`${BASE_URL}/opportunities/pipelines`, {
    headers,
    timeout: 15000,
    params: { locationId: LOCATION_ID },
  }));
  const pipelines = res.data?.pipelines || [];
  const stageMap = {};
  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages || []) {
      stageMap[stage.id] = stage.name;
    }
  }
  return stageMap;
}

// Get all pipeline opportunities and summarize by stage
async function getPipelineData() {
  const stageMap = await getStageMaps();

  // Paginate through all opportunities (GHL max 100 per page)
  let allOpps = [];
  let page = 1;
  while (true) {
    const res = await axiosRetry(() => axios.get(`${BASE_URL}/opportunities/search`, {
      headers,
      timeout: 15000,
      params: { location_id: LOCATION_ID, limit: 100, page },
    }));
    const opps = res.data?.opportunities || [];
    allOpps = allOpps.concat(opps);
    if (opps.length < 100) break;
    page++;
  }

  // Only show the main "Pipeline", exclude cold call etc.
  const MAIN_PIPELINE_ID = 'zFUBxIFQ0LlxKcHbwXFX';
  allOpps = allOpps.filter(o => o.pipelineId === MAIN_PIPELINE_ID);

  // Count by stage name
  const stages = {};
  let completedRevenue = 0;
  let completedCount = 0;
  let quotedCount = 0;
  const recentCompleted = [];

  for (const opp of allOpps) {
    const stage = stageMap[opp.pipelineStageId] || opp.status || 'Unknown';
    stages[stage] = (stages[stage] || 0) + 1;

    if (stage === 'Paid' || stage === 'Job Completed' || stage === 'Job Complete') {
      completedCount++;
      completedRevenue += opp.monetaryValue || 0;
      recentCompleted.push({
        name: opp.name,
        value: opp.monetaryValue || 0,
        closedDate: opp.lastStatusChangeAt,
      });
    }

    if (stage === 'Quote Scheduled') {
      quotedCount++;
    }
  }

  // Sort recent completed by date, keep last 10
  recentCompleted.sort((a, b) => new Date(b.closedDate) - new Date(a.closedDate));

  return {
    stages,
    completedRevenue,
    completedCount,
    quotedCount,
    totalLeads: allOpps.length,
    recentCompleted: recentCompleted.slice(0, 10),
  };
}

// Get a single contact by ID (used by webhook handler)
async function getContact(contactId) {
  const res = await axios.get(`${BASE_URL}/contacts/${contactId}`, { headers });
  return res.data?.contact || res.data;
}

module.exports = { getPipelineData, getContact };
