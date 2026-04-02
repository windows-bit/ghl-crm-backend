const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const PIXEL_ID = process.env.META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const BASE_URL = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events`;

function hash(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

async function sendEvent({ eventName, contact, monetaryValue }) {
  const userData = {
    em: hash(contact.email),
    ph: hash(contact.phone),
  };

  // Remove null fields — Meta rejects null hashed values
  Object.keys(userData).forEach((k) => {
    if (!userData[k]) delete userData[k];
  });

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'crm',
        user_data: userData,
        ...(monetaryValue && {
          custom_data: {
            value: monetaryValue,
            currency: 'USD',
          },
        }),
      },
    ],
    access_token: ACCESS_TOKEN,
  };

  const res = await axios.post(BASE_URL, payload);
  return res.data;
}

// Fired when GHL stage → "Quote Scheduled"
// Used for campaign optimization (Meta finds more people like these)
async function fireQuoteScheduled(contact) {
  return sendEvent({ eventName: 'Schedule', contact });
}

// Fired when GHL stage → "Job Completed"
// Used for ROAS reporting only — includes job value
async function fireJobCompleted(contact, monetaryValue) {
  return sendEvent({ eventName: 'Purchase', contact, monetaryValue });
}

module.exports = { fireQuoteScheduled, fireJobCompleted };
