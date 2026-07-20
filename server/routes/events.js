const express = require('express');
const Redis = require('ioredis');
const db = require('../redis');

const router = express.Router({ mergeParams: true });

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Track all active SSE connections: Map<code, Set<res>>
const sseClients = new Map();

// Single subscriber client shared across all connections
let subscriber = null;

async function getSubscriber() {
  if (subscriber) return subscriber;
  subscriber = new Redis(REDIS_URL, { lazyConnect: true });
  await subscriber.connect();

  subscriber.on('message', (channel, message) => {
    // channel = "session:<code>:events"
    const code = channel.split(':')[1];
    const clients = sseClients.get(code);
    if (!clients || clients.size === 0) return;

    clients.forEach((res) => {
      try {
        res.write(`data: ${message}\n\n`);
      } catch {
        clients.delete(res);
      }
    });
  });

  return subscriber;
}

// ── GET /api/session/:code/events ─────────────────────────────────────────
// Server-Sent Events stream for a session
router.get('/events', async (req, res) => {
  const { code } = req.params;

  // Verify session exists
  const session = await db.getSession(code);
  if (!session) {
    return res.status(404).json({ error: 'Sessão não encontrada' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx/traefik buffering
  res.flushHeaders();

  // Register client
  if (!sseClients.has(code)) {
    sseClients.set(code, new Set());
  }
  const clients = sseClients.get(code);
  clients.add(res);

  // Subscribe to Redis channel for this session (if not already)
  const sub = await getSubscriber();
  const channel = `session:${code}:events`;
  await sub.subscribe(channel);

  // Send initial state ping
  res.write(`data: ${JSON.stringify({ type: 'connected', code })}\n\n`);

  // Heartbeat every 25s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  // Cleanup on disconnect
  req.on('close', async () => {
    clearInterval(heartbeat);
    clients.delete(res);

    // Unsubscribe from Redis channel if no more clients for this session
    if (clients.size === 0) {
      sseClients.delete(code);
      try {
        await sub.unsubscribe(channel);
      } catch { /* ignore */ }
    }
  });
});

module.exports = router;
