require('dotenv').config();
const express = require('express');
const { generateReply } = require('./ai');
const { sendMessage } = require('./ghl');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check
app.get('/', (req, res) => {
  res.send('Spot Off AI Automation is running.');
});

// GHL webhook — fires when a contact sends an inbound message
app.post('/webhook/inbound-message', async (req, res) => {
  try {
    const { contactId, firstName, body } = req.body;

    console.log(`Inbound message from ${firstName}: "${body}"`);

    // Generate AI reply
    const reply = await generateReply(firstName, body);
    console.log(`AI reply: "${reply}"`);

    // Send reply back via GHL
    await sendMessage(contactId, reply);

    res.status(200).json({ success: true, reply });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
