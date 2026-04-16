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

// Get calendar metadata and past appointment dates per contact (used for 30d/YTD revenue dating)
// Note: /calendars/events only returns widget-booked appointments; manual appointments
// are fetched per-contact in getPipelineData() for weekly revenue.
async function getCalendarData() {
  const now = Date.now();
  const start90d = now - 90 * 24 * 60 * 60 * 1000;

  const calRes = await axiosRetry(() => axios.get(`${BASE_URL}/calendars/`, {
    headers, timeout: 15000, params: { locationId: LOCATION_ID },
  }));
  const calendars = calRes.data?.calendars || [];

  // Find Jobs calendar ID — used in getPipelineData() for weekly revenue
  const jobsCal = calendars.find(c => (c.name || '').toLowerCase() === 'jobs');
  const jobsCalendarId = jobsCal?.id || null;

  // Build contactDateMap from past calendar events (fallback for 30d/YTD dating)
  const contactDateMap = {};
  for (const cal of calendars) {
    try {
      const evRes = await axiosRetry(() => axios.get(`${BASE_URL}/calendars/events`, {
        headers,
        timeout: 15000,
        params: { locationId: LOCATION_ID, calendarId: cal.id, startTime: start90d, endTime: now },
      }));
      const events = evRes.data?.events || [];
      for (const ev of events) {
        if (!ev.contactId || !ev.startTime) continue;
        const evTime = new Date(ev.startTime).getTime();
        if (evTime <= now) {
          const existing = contactDateMap[ev.contactId];
          if (!existing || evTime > new Date(existing).getTime()) {
            contactDateMap[ev.contactId] = ev.startTime;
          }
        }
      }
    } catch {
      // skip calendars that error
    }
  }
  return { contactDateMap, jobsCalendarId };
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
  const [stageMap, { contactDateMap: appointmentDates, jobsCalendarId }] = await Promise.all([getStageMaps(), getCalendarData()]);

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

  // Compute this week Mon-Fri range in Houston time (server runs UTC, user is CDT/CST)
  const nowDate = new Date();
  const now = nowDate.getTime();
  const houstonDate = new Date(nowDate.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const dayOfWeek = houstonDate.getDay();
  const hour = houstonDate.getHours();
  // Reset window: Sunday 11 PM → Monday 1 AM (Houston time)
  const isReset = (dayOfWeek === 0 && hour >= 23) || (dayOfWeek === 1 && hour < 1);
  const isSunday = dayOfWeek === 0;
  const daysFromMonday = isSunday ? 6 : dayOfWeek - 1;
  const monday = new Date(houstonDate);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - daysFromMonday);
  const fridayEnd = new Date(monday);
  fridayEnd.setDate(monday.getDate() + 4);
  fridayEnd.setHours(23, 59, 59, 999);

  // Weekly revenue: fetch per-contact appointments, check Jobs calendar + Mon-Fri this week
  let revenueWeek = 0;
  if (!isReset && jobsCalendarId) {
    const valueOpps = allOpps.filter(o => (o.monetaryValue || 0) > 0);
    const weekContactIds = new Set();

    for (let i = 0; i < valueOpps.length; i += 10) {
      await Promise.all(valueOpps.slice(i, i + 10).map(async opp => {
        try {
          const r = await axiosRetry(() => axios.get(`${BASE_URL}/contacts/${opp.contactId}/appointments`, {
            headers, timeout: 10000,
          }));
          for (const ev of r.data?.events || []) {
            if (ev.calendarId !== jobsCalendarId || !ev.startTime) continue;
            const t = new Date(ev.startTime.replace(' ', 'T')).getTime();
            if (t >= monday.getTime() && t <= fridayEnd.getTime()) {
              weekContactIds.add(opp.contactId);
            }
          }
        } catch {}
      }));
    }

    revenueWeek = allOpps
      .filter(o => weekContactIds.has(o.contactId))
      .reduce((sum, o) => sum + (o.monetaryValue || 0), 0);
  }

  // Count by stage name
  const stages = {};
  let completedRevenue = 0;
  let completedCount = 0;
  let quotedCount = 0;
  let fbRevenue = 0;
  let revenue30d = 0;
  let revenueYTD = 0;
  const cutoff30d = now - 30 * 24 * 60 * 60 * 1000;
  const cutoffYTD = new Date(nowDate.getFullYear(), 0, 1).getTime();
  const recentCompleted = [];

  for (const opp of allOpps) {
    const stage = stageMap[opp.pipelineStageId] || opp.status || 'Unknown';
    stages[stage] = (stages[stage] || 0) + 1;

    const isPaid = stage === 'Paid' || stage === 'Job Completed' || stage === 'Job Complete';

    if (isPaid) {
      completedCount++;
      const val = opp.monetaryValue || 0;
      completedRevenue += val;
      const jobDate = appointmentDates[opp.contactId] || opp.closedDate || opp.lastStageChangeAt;
      const paidAt = new Date(jobDate).getTime();
      if (paidAt >= cutoff30d) revenue30d += val;
      // YTD uses same date source as 30d for consistency
      const paidAtYTD = new Date(jobDate).getTime();
      if (paidAtYTD >= cutoffYTD) revenueYTD += val;
      recentCompleted.push({
        name: opp.name,
        value: val,
        closedDate: jobDate,
      });
    }

    // Track FB-sourced revenue (30d, check source field, case-insensitive)
    const src = (opp.source || opp.leadSource || '').toLowerCase();
    if (isPaid && (src.includes('facebook') || src.includes('fb'))) {
      const jobDate2 = appointmentDates[opp.contactId] || opp.closedDate || opp.lastStageChangeAt;
      const paidAt2 = new Date(jobDate2).getTime();
      if (paidAt2 >= cutoff30d) fbRevenue += opp.monetaryValue || 0;
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
    fbRevenue,
    revenueWeek,
    revenue30d,
    revenueYTD,
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
