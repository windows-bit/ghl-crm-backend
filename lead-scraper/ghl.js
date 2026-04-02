require('dotenv').config();
const axios = require('axios');

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const headers = {
  'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
  'Content-Type': 'application/json',
  'Version': '2021-07-28'
};

// Send a message to a contact in GHL
async function sendMessage(contactId, message) {
  try {
    const response = await axios.post(`${GHL_BASE_URL}/conversations/messages`, {
      contactId,
      body: message,
      type: 'SMS'
    }, { headers });
    console.log('Message sent to GHL:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending GHL message:', error.response?.data || error.message);
    throw error;
  }
}

// Create a new contact in GHL (for lead scraper)
async function createContact(lead) {
  try {
    const response = await axios.post(`${GHL_BASE_URL}/contacts`, {
      firstName: lead.firstName || '',
      lastName: lead.lastName || '',
      phone: lead.phone || '',
      ...(lead.email && lead.email.includes('@') ? { email: lead.email } : {}),
      address1: lead.address || '',
      city: lead.city || 'Houston',
      state: lead.state || 'TX',
      locationId: 'ZPL1eulX1pNHJrf5Zji0',
      tags: ['scraped-lead', 'new-commercial', lead.source || 'google-maps']
    }, { headers });
    console.log('Contact created in GHL:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error creating GHL contact:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = { sendMessage, createContact };
