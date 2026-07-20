const express = require('express');
const db = require('../redis');

const router = express.Router({ mergeParams: true });

// Middleware: validate operator key
function requireOperator(req, res, next) {
  req._operatorKey = req.headers['x-operator-key'];
  if (!req._operatorKey) {
    return res.status(401).json({ error: 'x-operator-key header obrigatório' });
  }
  next();
}

async function validateOperator(code, operatorKey) {
  const session = await db.getSession(code);
  if (!session) return null;
  if (session.operatorKey !== operatorKey) return null;
  return session;
}

// ── POST /api/session/:code/draw ───────────────────────────────────────────
router.post('/draw', requireOperator, async (req, res) => {
  try {
    const { code } = req.params;
    const session = await validateOperator(code, req._operatorKey);
    if (!session) return res.status(403).json({ error: 'Não autorizado ou sessão inválida' });

    const { mode, pool, qty, title } = req.body;
    if (!Array.isArray(pool) || pool.length === 0) {
      return res.status(400).json({ error: 'Pool vazio ou inválido' });
    }
    if (!qty || qty < 1 || qty > pool.length) {
      return res.status(400).json({ error: 'Quantidade inválida' });
    }

    // Pick winners randomly
    const tmp = [...pool];
    const winners = [];
    for (let i = 0; i < qty; i++) {
      const idx = Math.floor(Math.random() * tmp.length);
      winners.push(tmp.splice(idx, 1)[0]);
    }

    // Recalculate round number from list length before saving
    const rounds = await db.getRounds(code);
    const roundNumber = rounds.length + 1;

    const round = {
      round: roundNumber,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      mode,
      winners,
    };
    if (title) round.title = title;

    // Save drawn items and round
    await db.addToDrawnPool(code, winners);
    await db.addRound(code, round);
    await db.refreshSessionTTL(code);

    // Broadcast to all SSE listeners
    await db.publishEvent(code, { type: 'draw', round });

    res.json({ ok: true, round });
  } catch (err) {
    console.error('[draw] error:', err);
    res.status(500).json({ error: 'Erro ao realizar sorteio' });
  }
});

// ── POST /api/session/:code/reset ─────────────────────────────────────────
router.post('/reset', requireOperator, async (req, res) => {
  try {
    const { code } = req.params;
    const session = await validateOperator(code, req._operatorKey);
    if (!session) return res.status(403).json({ error: 'Não autorizado ou sessão inválida' });

    await Promise.all([
      db.clearParticipants(code),
      db.clearDrawnPool(code),
      db.clearRounds(code),
    ]);

    await db.publishEvent(code, { type: 'reset' });

    res.json({ ok: true });
  } catch (err) {
    console.error('[reset] error:', err);
    res.status(500).json({ error: 'Erro ao reiniciar sessão' });
  }
});

// ── POST /api/session/:code/regen ─────────────────────────────────────────
// Generate a new code for the session. The old code's key is deleted.
router.post('/regen', requireOperator, async (req, res) => {
  try {
    const { code } = req.params;
    const session = await validateOperator(code, req._operatorKey);
    if (!session) return res.status(403).json({ error: 'Não autorizado ou sessão inválida' });

    // Notify existing participants before invalidating
    await db.publishEvent(code, { type: 'session_invalidated' });

    // Generate new code
    const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let newCode = Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
    if (await db.getSession(newCode)) {
      newCode = Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
    }

    // Create new session with same operatorKey
    await db.createSession(newCode, session.operatorKey);

    // Clean up old session
    const { redis } = require('../redis');
    await redis.del(`session:${code}`);
    await redis.del(`session:${code}:participants`);
    await redis.del(`session:${code}:drawn`);
    await redis.del(`session:${code}:winners`);

    res.json({ ok: true, newCode });
  } catch (err) {
    console.error('[regen] error:', err);
    res.status(500).json({ error: 'Erro ao regenerar código' });
  }
});

module.exports = router;
