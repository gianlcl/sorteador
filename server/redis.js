const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('error', (err) => console.error('[Redis] Error:', err.message));

// Pub/Sub client for publishing draw events to SSE listeners
const pub = new Redis(REDIS_URL, { lazyConnect: true });
pub.on('error', (err) => console.error('[Redis-PUB] Error:', err.message));

async function connect() {
  await redis.connect();
  await pub.connect();
}

const SESSION_TTL = 60 * 60 * 24; // 24 hours in seconds

// ── Session helpers ──────────────────────────────────────────────────────────

async function getSession(code) {
  const data = await redis.hgetall(`session:${code}`);
  if (!data || !data.operatorKey) return null;
  return data;
}

async function createSession(code, operatorKey) {
  const key = `session:${code}`;
  await redis.hset(key, {
    operatorKey,
    createdAt: Date.now(),
    mode: 'numbers',
  });
  await redis.expire(key, SESSION_TTL);
  return { code, operatorKey };
}

async function refreshSessionTTL(code) {
  await redis.expire(`session:${code}`, SESSION_TTL);
  await redis.expire(`session:${code}:participants`, SESSION_TTL);
  await redis.expire(`session:${code}:drawn`, SESSION_TTL);
  await redis.expire(`session:${code}:winners`, SESSION_TTL);
}

async function deleteSession(code) {
  await redis.del(`session:${code}`);
  await redis.del(`session:${code}:participants`);
  await redis.del(`session:${code}:drawn`);
  await redis.del(`session:${code}:winners`);
}

// ── Participants ─────────────────────────────────────────────────────────────

async function getParticipants(code) {
  const members = await redis.smembers(`session:${code}:participants`);
  return members.map((m) => JSON.parse(m));
}

async function addParticipant(code, participant) {
  // Remove old entry by participantId before adding to avoid duplicates
  const existing = await redis.smembers(`session:${code}:participants`);
  for (const m of existing) {
    const p = JSON.parse(m);
    if (p.id === participant.id) {
      await redis.srem(`session:${code}:participants`, m);
    }
  }
  await redis.sadd(`session:${code}:participants`, JSON.stringify(participant));
  await redis.expire(`session:${code}:participants`, SESSION_TTL);
}

async function removeParticipant(code, participantId) {
  const existing = await redis.smembers(`session:${code}:participants`);
  for (const m of existing) {
    const p = JSON.parse(m);
    if (p.id === participantId) {
      await redis.srem(`session:${code}:participants`, m);
    }
  }
}

async function clearParticipants(code) {
  await redis.del(`session:${code}:participants`);
}

// ── Drawn pool ───────────────────────────────────────────────────────────────

async function getDrawnPool(code) {
  return redis.smembers(`session:${code}:drawn`);
}

async function addToDrawnPool(code, items) {
  if (items.length === 0) return;
  await redis.sadd(`session:${code}:drawn`, ...items);
  await redis.expire(`session:${code}:drawn`, SESSION_TTL);
}

async function clearDrawnPool(code) {
  await redis.del(`session:${code}:drawn`);
}

// ── Winners / Rounds ─────────────────────────────────────────────────────────

async function getRounds(code) {
  const items = await redis.lrange(`session:${code}:winners`, 0, -1);
  return items.map((i) => JSON.parse(i));
}

async function addRound(code, round) {
  await redis.lpush(`session:${code}:winners`, JSON.stringify(round));
  await redis.expire(`session:${code}:winners`, SESSION_TTL);
}

async function clearRounds(code) {
  await redis.del(`session:${code}:winners`);
}

// ── Pub/Sub ──────────────────────────────────────────────────────────────────

async function publishEvent(code, eventData) {
  await pub.publish(`session:${code}:events`, JSON.stringify(eventData));
}

module.exports = {
  redis,
  connect,
  getSession,
  createSession,
  refreshSessionTTL,
  deleteSession,
  getParticipants,
  addParticipant,
  removeParticipant,
  clearParticipants,
  getDrawnPool,
  addToDrawnPool,
  clearDrawnPool,
  getRounds,
  addRound,
  clearRounds,
  publishEvent,
};
