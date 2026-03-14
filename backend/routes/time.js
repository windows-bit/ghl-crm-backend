// Time tracking routes — clock in/out for employees
const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /time/entries — list time entries for this user's team
router.get('/entries', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', req.user.id)
      .order('clock_in', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ entries: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /time/active — entries that are clocked in but not out yet
router.get('/active', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', req.user.id)
      .is('clock_out', null);

    if (error) throw error;
    res.json({ entries: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /time/clock-in — Body: { employeeName, notes }
router.post('/clock-in', async (req, res) => {
  const { employeeName, notes } = req.body;
  if (!employeeName) {
    return res.status(400).json({ error: 'employeeName is required' });
  }

  try {
    const { data, error } = await supabase
      .from('time_entries')
      .insert({
        user_id: req.user.id,
        employee_name: employeeName,
        clock_in: new Date().toISOString(),
        notes: notes || null,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ entry: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /time/clock-out/:id — clock out an active entry
router.put('/clock-out/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('time_entries')
      .update({ clock_out: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ entry: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
