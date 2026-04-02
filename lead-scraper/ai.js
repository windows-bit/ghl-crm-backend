require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateReply(contactName, inboundMessage) {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `You are a friendly assistant for Spot Off Reflections, a window cleaning and pressure washing company in Houston, TX.

A lead named ${contactName || 'there'} just sent this message:
"${inboundMessage}"

Write a short, friendly, human-sounding SMS reply. Keep it under 3 sentences.
- If they ask about pricing, say pricing depends on home size and offer to get them an exact quote
- If they want to book, ask for their address and preferred day
- Always end with a question to keep the conversation going
- Never sound robotic or like a bot`
      }
    ]
  });

  return message.content[0].text;
}

module.exports = { generateReply };
