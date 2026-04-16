const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const BASE_URL = 'https://services.leadconnectorhq.com';
const LOCATION_ID = process.env.GHL_LOCATION_ID;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ghlHeaders = {
  Authorization: `Bearer ${process.env.GHL_API_KEY}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json',
};

// Find a GHL contact by email address
async function findContactByEmail(email) {
  const res = await axios.get(`${BASE_URL}/contacts/`, {
    headers: ghlHeaders,
    params: { locationId: LOCATION_ID, query: email, limit: 1 },
  });
  const contacts = res.data?.contacts || [];
  return contacts.find(c => c.email === email) || contacts[0] || null;
}

// Send an email via GHL conversations API
async function sendEmailViaGHL(contactId, subject, html) {
  const res = await axios.post(`${BASE_URL}/conversations/messages`, {
    type: 'Email',
    contactId,
    subject,
    html,
    emailFrom: 'windows@spotoffreflections.com',
    fromName: 'Spot Off Command Center',
  }, { headers: ghlHeaders });
  return res.data;
}

// Use Claude to generate 3 specific ad ideas based on this week's top performers
async function generateWeeklyAdIdeas(meta) {
  const { last7, activeAds } = meta;
  const topCampaigns = (last7.campaigns || []).slice(0, 3);
  const topAds = (activeAds || []).slice(0, 3);

  const campaignSummary = topCampaigns.map(c =>
    `- ${c.name}: $${c.spend.toFixed(2)} spend, ${c.leads} leads, CPL $${c.cpl || '—'}`
  ).join('\n');

  const adSummary = topAds.map(a =>
    `- "${a.name}": ${a.impressions} impressions, ${a.clicks} clicks, ${a.leads} leads, CTR ${a.ctr || '—'}%`
  ).join('\n');

  const prompt = `You are a Meta Ads expert for Spot Off Reflections, a Houston exterior cleaning company (window cleaning, pressure washing, soft washing, roof washing, gutters). Target customers: Houston homeowners.

Here's what ran this week:

TOP CAMPAIGNS:
${campaignSummary || 'No campaign data'}

TOP ADS:
${adSummary || 'No ad data'}

Based on this performance data, give me 3 specific ad ideas to test next week. For each idea:
- Hook: The first line or visual concept (make it specific, not generic)
- Copy angle: The main message approach
- Why: One sentence on why this should work based on the data above

Format as plain text, no bullet symbols or markdown. Separate each idea with a blank line. Keep each idea under 4 lines total.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    return msg.content[0].text;
  } catch (err) {
    console.error('[weekly-report] Failed to generate ad ideas:', err.message);
    return null;
  }
}

// Format AI ideas as styled HTML blocks
function formatIdeasHtml(ideas) {
  if (!ideas) return '<p style="color:#888;">Could not generate ideas this week.</p>';
  return ideas.trim().split(/\n\n+/).map((idea, i) =>
    `<div style="background:#f8f9fa;border-left:4px solid #0066cc;padding:12px 16px;margin:8px 0;border-radius:4px;font-size:14px;line-height:1.7">
      <strong style="color:#0066cc">Idea ${i + 1}</strong><br>
      ${idea.trim().replace(/\n/g, '<br>')}
    </div>`
  ).join('');
}

// Generate HTML report from live Meta data
function buildReportHTML(meta, weekLabel, ideas) {
  const { last7, activeAds } = meta;
  const campaigns = last7.campaigns || [];
  const totalSpend = parseFloat(last7.spend || 0);
  const totalLeads = last7.leads || 0;
  const totalImpressions = last7.impressions || 0;
  const avgCPL = totalLeads > 0 ? (totalSpend / totalLeads).toFixed(2) : '—';

  const campaignRows = campaigns.map(c => {
    const status = !c.leads && c.spend > 100
      ? '<span style="background:#fdecea;color:#c0392b;padding:2px 8px;border-radius:4px;font-size:13px;font-weight:bold">PROBLEM</span>'
      : parseFloat(c.cpl) > 45
      ? '<span style="background:#fef9e7;color:#b7770d;padding:2px 8px;border-radius:4px;font-size:13px;font-weight:bold">WATCH</span>'
      : '<span style="background:#eafaf1;color:#1e8449;padding:2px 8px;border-radius:4px;font-size:13px;font-weight:bold">OK</span>';
    return `<tr>
      <td style="padding:8px 10px;border:1px solid #ddd">${c.name}</td>
      <td style="padding:8px 10px;border:1px solid #ddd">$${c.spend.toFixed(2)}</td>
      <td style="padding:8px 10px;border:1px solid #ddd">${c.impressions ? c.impressions.toLocaleString() : '—'}</td>
      <td style="padding:8px 10px;border:1px solid #ddd">${c.leads}</td>
      <td style="padding:8px 10px;border:1px solid #ddd">${c.cpl ? '$' + c.cpl : '—'}</td>
      <td style="padding:8px 10px;border:1px solid #ddd">${c.ctr || '—'}%</td>
      <td style="padding:8px 10px;border:1px solid #ddd">${status}</td>
    </tr>`;
  }).join('');

  const adRows = activeAds.map(a => `<tr>
    <td style="padding:8px 10px;border:1px solid #ddd">${a.name}</td>
    <td style="padding:8px 10px;border:1px solid #ddd">${a.campaign}</td>
    <td style="padding:8px 10px;border:1px solid #ddd">$${a.spend.toFixed(2)}</td>
    <td style="padding:8px 10px;border:1px solid #ddd">${a.impressions ? a.impressions.toLocaleString() : '—'}</td>
    <td style="padding:8px 10px;border:1px solid #ddd">${a.leads}</td>
    <td style="padding:8px 10px;border:1px solid #ddd">${a.cpl ? '$' + a.cpl : '—'}</td>
    <td style="padding:8px 10px;border:1px solid #ddd">${a.ctr || '—'}%</td>
  </tr>`).join('');

  const problems = campaigns.filter(c => !c.leads && c.spend > 100);
  const watches = campaigns.filter(c => parseFloat(c.cpl) > 45);

  const alertsHtml = [
    ...problems.map(c => `<div style="background:#fdecea;border-left:4px solid #c0392b;padding:12px 16px;margin:8px 0;border-radius:4px">
      🚨 <strong>${c.name}</strong> — $${c.spend.toFixed(2)} spent with 0 leads. Pause or replace creative.
    </div>`),
    ...watches.map(c => `<div style="background:#fef9e7;border-left:4px solid #f39c12;padding:12px 16px;margin:8px 0;border-radius:4px">
      ⚠️ <strong>${c.name}</strong> — CPL is $${c.cpl} (target: under $45). Monitor closely.
    </div>`),
    problems.length === 0 && watches.length === 0
      ? `<div style="background:#eafaf1;border-left:4px solid #27ae60;padding:12px 16px;margin:8px 0;border-radius:4px">
          ✅ No critical issues this week.
        </div>`
      : '',
  ].join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:700px;margin:40px auto;padding:0 20px;line-height:1.6">

<h1 style="font-size:22px;border-bottom:2px solid #e0e0e0;padding-bottom:10px">Spot Off — Meta Ads Weekly Report</h1>
<p><strong>Period:</strong> ${weekLabel} &nbsp;|&nbsp; <strong>Account:</strong> ${process.env.META_AD_ACCOUNT_ID}</p>
<p>
  <strong>Total Spend:</strong> $${totalSpend.toFixed(2)} &nbsp;|&nbsp;
  <strong>Total Leads:</strong> ${totalLeads} &nbsp;|&nbsp;
  <strong>Avg CPL:</strong> $${avgCPL} &nbsp;|&nbsp;
  <strong>Impressions:</strong> ${totalImpressions.toLocaleString()}
</p>

<hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0">

<h2 style="font-size:17px;border-left:4px solid #0066cc;padding-left:10px">1. Campaign Performance — Last 7 Days</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
  <tr style="background:#f0f4f8">
    <th style="padding:8px 10px;border:1px solid #ddd;text-align:left">Campaign</th>
    <th style="padding:8px 10px;border:1px solid #ddd;text-align:left">Spend</th>
    <th style="padding:8px 10px;border:1px solid #ddd;text-align:left">Impressions</th>
    <th style="padding:8px 10px;border:1px solid #ddd;text-align:left">Leads</th>
    <th style="padding:8px 10px;border:1px solid #ddd;text-align:left">CPL</th>
    <th style="padding:8px 10px;border:1px solid #ddd;text-align:left">CTR</th>
    <th style="padding:8px 10px;border:1px solid #ddd;text-align:left">Status</th>
  </tr>
  ${campaignRows}
</table>

<hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0">

<h2 style="font-size:17px;border-left:4px solid #0066cc;padding-left:10px">2. Alerts</h2>
${alertsHtml}

<hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0">

<h2 style="font-size:17px;border-left:4px solid #0066cc;padding-left:10px">3. Active Ads — Last 30 Days</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
  <tr style="background:#f0f4f8">
    <th style="padding:8px 10px;border:1px solid #ddd;text-align:left">Ad</th>
    <th style="padding:8px 10px;border:1px solid #ddd;text-align:left">Campaign</th>
    <th style="padding:8px 10px;border:1px solid #ddd;text-align:left">Spend</th>
    <th style="padding:8px 10px;border:1px solid #ddd;text-align:left">Impressions</th>
    <th style="padding:8px 10px;border:1px solid #ddd;text-align:left">Leads</th>
    <th style="padding:8px 10px;border:1px solid #ddd;text-align:left">CPL</th>
    <th style="padding:8px 10px;border:1px solid #ddd;text-align:left">CTR</th>
  </tr>
  ${adRows}
</table>

<hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0">

<h2 style="font-size:17px;border-left:4px solid #0066cc;padding-left:10px">4. Ad Ideas for Next Week</h2>
<p style="color:#555;font-size:14px;margin-bottom:12px">Based on this week's performance — 3 ideas to test next week.</p>
${formatIdeasHtml(ideas)}

<div style="margin-top:40px;padding-top:16px;border-top:1px solid #e0e0e0;font-size:13px;color:#888">
  Report auto-generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} &nbsp;|&nbsp; Spot Off Reflections &nbsp;|&nbsp; Meta Ads
</div>

</body>
</html>`;
}

// Main function — pull data, build HTML, send via GHL
async function sendWeeklyReport() {
  const { getMetaData } = require('./meta');

  console.log('[weekly-report] Fetching Meta data...');
  const meta = await getMetaData();

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const weekLabel = `${fmt(weekAgo)} – ${fmt(now)}`;

  console.log('[weekly-report] Generating ad ideas...');
  const ideas = await generateWeeklyAdIdeas(meta);

  console.log('[weekly-report] Building HTML...');
  const html = buildReportHTML(meta, weekLabel, ideas);

  const subject = `Spot Off Meta Ads — Week of ${fmt(weekAgo)}`;
  const recipients = ['windows@spotoffreflections.com'];

  for (const email of recipients) {
    console.log(`[weekly-report] Looking up GHL contact: ${email}`);
    const contact = await findContactByEmail(email);
    if (!contact) {
      console.error(`[weekly-report] Contact not found in GHL for ${email} — skipping`);
      continue;
    }
    console.log(`[weekly-report] Sending to ${email} (contactId: ${contact.id})`);
    await sendEmailViaGHL(contact.id, subject, html);
    console.log(`[weekly-report] Sent to ${email}`);
  }

  console.log('[weekly-report] Done.');
}

module.exports = { sendWeeklyReport };
