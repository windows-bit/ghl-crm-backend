require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const ghlRoutes = require('./routes/ghl');
const timeRoutes = require('./routes/time');

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'GHL CRM backend is running' });
});

app.use('/auth', authRoutes);
app.use('/ghl', ghlRoutes);
app.use('/time', timeRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
