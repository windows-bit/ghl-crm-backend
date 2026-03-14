const express = require('express');
const router = express.Router();
const { chat } = require('../lib/claude');
const authMiddleware = require('../middleware/auth');

// All AI routes require login
router.use(authMiddleware);

// POST /ai/chat
// Body: { message: "How many leads do I have?", history: [] }
// history is optional — pass previous messages to maintain conversation context
router.post('/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const { reply, messages } = await chat(message, req.user.id, history);

    res.json({ reply, history: messages });
  } catch (err) {
    console.error('[AI] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
