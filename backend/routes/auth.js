// Auth routes: register, login, and save GHL API key
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../lib/supabase');
const { encrypt, decrypt } = require('../lib/encrypt');
const authMiddleware = require('../middleware/auth');

// POST /auth/register
// Creates a new user account. Body: { email, password }
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  // Hash the password before storing — never store plain text passwords
  const hashedPassword = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from('users')
    .insert({ email, password: hashedPassword })
    .select('id, email')
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    return res.status(500).json({ error: error.message });
  }

  const token = jwt.sign({ sub: data.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.status(201).json({ token, user: { id: data.id, email: data.email } });
});

// POST /auth/login
// Body: { email, password }
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, password, ghl_key_encrypted')
    .eq('email', email)
    .single();

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      hasGhlKey: !!user.ghl_key_encrypted,
    },
  });
});

// POST /auth/ghl-key
// Saves the user's GHL API key (encrypted) and optionally the location ID.
// Body: { ghlKey, locationId? }
// Requires auth token in header: Authorization: Bearer <token>
router.post('/ghl-key', authMiddleware, async (req, res) => {
  const { ghlKey, locationId } = req.body;
  if (!ghlKey) {
    return res.status(400).json({ error: 'ghlKey is required' });
  }

  const encrypted = encrypt(ghlKey);

  // Build the update object — always update the key, only update locationId if provided
  const updateData = { ghl_key_encrypted: encrypted };
  if (locationId) updateData.ghl_location_id = locationId;

  const { error } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', req.user.id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

module.exports = router;
