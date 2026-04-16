const axios = require('axios');
require('dotenv').config();

const BASE_URL = 'https://graph.facebook.com/v22.0';
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

const FIELDS = 'campaign_name,spend,impressions,clicks,actions,reach,action_values';
const EXCLUDE_CAMPAIGNS = [];

async function getInsights(datePreset = 'last_30d') {
  const res = await axios.get(`${BASE_URL}/${AD_ACCOUNT_ID}/insights`, {
    params: {
      access_token: ACCESS_TOKEN,
      fields: FIELDS,
      date_preset: datePreset,
      level: 'campaign',
    },
  });

  const data = res.data?.data || [];

  let totalSpend = 0;
  let totalLeads = 0;
  let totalClicks = 0;
  let totalImpressions = 0;
  const campaigns = [];

  for (const row of data) {
    if (EXCLUDE_CAMPAIGNS.includes(row.campaign_name)) continue;
    const spend = parseFloat(row.spend || 0);
    const clicks = parseInt(row.clicks || 0);
    const impressions = parseInt(row.impressions || 0);

    // Find lead count from actions array
    const leadAction = (row.actions || []).find(
      (a) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped'
    );
    const leads = parseInt(leadAction?.value || 0);

    // Revenue attributed to this campaign via Conversions API (purchase events)
    const purchaseValue = (row.action_values || []).find(
      (a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase'
    );
    const revenue = parseFloat(purchaseValue?.value || 0);
    const roas = spend > 0 && revenue > 0 ? (revenue / spend).toFixed(1) : null;

    totalSpend += spend;
    totalLeads += leads;
    totalClicks += clicks;
    totalImpressions += impressions;

    campaigns.push({
      name: row.campaign_name,
      spend,
      leads,
      clicks,
      revenue,
      roas,
      cpl: leads > 0 ? (spend / leads).toFixed(2) : null,
    });
  }

  return {
    spend: totalSpend.toFixed(2),
    leads: totalLeads,
    clicks: totalClicks,
    impressions: totalImpressions,
    cpl: totalLeads > 0 ? (totalSpend / totalLeads).toFixed(2) : null,
    campaigns: campaigns.sort((a, b) => b.spend - a.spend),
    datePreset,
  };
}

// Fetch all ads with last-30d performance
async function getActiveAds() {
  const res = await axios.get(`${BASE_URL}/${AD_ACCOUNT_ID}/insights`, {
    params: {
      access_token: ACCESS_TOKEN,
      fields: 'ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks,actions',
      date_preset: 'last_30d',
      level: 'ad',
    },
  });

  const data = res.data?.data || [];
  return data
    .filter(row => !EXCLUDE_CAMPAIGNS.includes(row.campaign_name))
    .map(row => {
      const spend = parseFloat(row.spend || 0);
      const clicks = parseInt(row.clicks || 0);
      const impressions = parseInt(row.impressions || 0);
      const leadAction = (row.actions || []).find(
        a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped'
      );
      const leads = parseInt(leadAction?.value || 0);
      return {
        id: row.ad_id,
        name: row.ad_name,
        adset: row.adset_name,
        campaign: row.campaign_name,
        spend,
        impressions,
        clicks,
        leads,
        cpl: leads > 0 ? (spend / leads).toFixed(2) : null,
        ctr: impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : null,
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

// Fetch both 7-day and 30-day windows, plus active ads
async function getMetaData() {
  const [last30, last7, activeAds] = await Promise.all([
    getInsights('last_30d'),
    getInsights('last_7d'),
    getActiveAds(),
  ]);
  return { last30, last7, activeAds };
}

module.exports = { getMetaData };
