const axios = require('axios');
require('dotenv').config();

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const LSA_BASE = 'https://localservices.googleapis.com/v1';

async function getAccessToken() {
  const res = await axios.post(TOKEN_URL, {
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  return res.data.access_token;
}

async function getLSAData() {
  if (!process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN === 'your-refresh-token') {
    return { spend: '0.00', leads: 0, cpl: null, leadDetails: [], status: 'not_configured' };
  }

  const token = await getAccessToken();
  const authHeader = { Authorization: `Bearer ${token}` };

  // Date range: last 30 days
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const fmt = (d) => d.toISOString().split('T')[0];

  const query = {
    startDate: { year: startDate.getFullYear(), month: startDate.getMonth() + 1, day: startDate.getDate() },
    endDate: { year: endDate.getFullYear(), month: endDate.getMonth() + 1, day: endDate.getDate() },
  };

  // Account-level report: spend + lead counts
  const reportRes = await axios.post(`${LSA_BASE}/accountReports:search`, { query }, { headers: authHeader });

  const reports = reportRes.data?.accountReports || [];
  let totalSpend = 0;
  let totalLeads = 0;

  for (const r of reports) {
    totalSpend += parseFloat(r.totalCost?.units || 0) + (r.totalCost?.nanos || 0) / 1e9;
    totalLeads += parseInt(r.leads || 0);
  }

  // Detailed lead report
  const leadRes = await axios.post(`${LSA_BASE}/detailedLeadReports:search`, { query }, { headers: authHeader });

  const leadDetails = (leadRes.data?.detailedLeadReports || []).map((l) => ({
    type: l.leadType,
    status: l.leadStatus,
    date: l.eventDateTime,
  }));

  return {
    spend: totalSpend.toFixed(2),
    leads: totalLeads,
    cpl: totalLeads > 0 ? (totalSpend / totalLeads).toFixed(2) : null,
    leadDetails,
  };
}

module.exports = { getLSAData };
