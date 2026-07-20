const express = require('express');
const path = require('path');
const db = require('./redis');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── Static files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API Routes ────────────────────────────────────────────────────────────────
const sessionRoutes = require('./routes/session');
const drawRoutes = require('./routes/draw');
const eventsRoutes = require('./routes/events');

app.use('/api/session', sessionRoutes);
app.use('/api/session/:code', drawRoutes);
app.use('/api/session/:code', eventsRoutes);

// ── Configuration Route ──────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    theaterNotifyMax: parseInt(process.env.APP_THEATER_NOTIFY_MAX, 10) || 7,
    theaterNotifyTimeout: parseInt(process.env.APP_THEATER_NOTIFY_TIMEOUT, 10) || 15
  });
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await db.connect();
    app.listen(PORT, () => {
      console.log(`[Server] Sorteador by gclabs running on port ${PORT}`);
    });
  } catch (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
}

start();
