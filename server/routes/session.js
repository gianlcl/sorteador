const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../redis');

const router = express.Router();

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateCode() {
  return Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

// ── POST /api/session ──────────────────────────────────────────────────────
// Create a new session. Returns { code, operatorKey }
router.post('/', async (req, res) => {
  try {
    let code = generateCode();
    // Make sure code is unique (retry once on collision)
    if (await db.getSession(code)) code = generateCode();
    const operatorKey = uuidv4();
    await db.createSession(code, operatorKey);
    res.json({ code, operatorKey });
  } catch (err) {
    console.error('[session] create error:', err);
    res.status(500).json({ error: 'Erro ao criar sessão' });
  }
});

// ── GET /api/session/:code ─────────────────────────────────────────────────
// Get session state (participants, drawn, rounds)
router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const session = await db.getSession(code);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

    const [participants, drawn, rounds] = await Promise.all([
      db.getParticipants(code),
      db.getDrawnPool(code),
      db.getRounds(code),
    ]);

    res.json({ code, participants, drawn, rounds });
  } catch (err) {
    console.error('[session] get error:', err);
    res.status(500).json({ error: 'Erro ao buscar sessão' });
  }
});

// ── POST /api/session/:code/join ───────────────────────────────────────────
// Participant joins a session
router.post('/:code/join', async (req, res) => {
  try {
    const { code } = req.params;
    const { participantId, name } = req.body;

    if (!participantId || !name) {
      return res.status(400).json({ error: 'participantId e name são obrigatórios' });
    }

    const session = await db.getSession(code);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada ou expirada' });

    const trimmedName = name.trim();

    // Validação de nome único (ignorando case)
    const participants = await db.getParticipants(code);
    const nameTaken = participants.some(
      p => p.name.toLowerCase() === trimmedName.toLowerCase() && p.id !== participantId
    );

    if (nameTaken) {
      return res.status(409).json({ error: 'Este nome já está em uso. Por favor, adicione um sobrenome.' });
    }

    const participant = { id: participantId, name: trimmedName, timestamp: Date.now() };
    await db.addParticipant(code, participant);
    await db.refreshSessionTTL(code);

    // Notify operator and others of new participant
    await db.publishEvent(code, { type: 'participant_joined', participant });

    res.json({ ok: true, participant });
  } catch (err) {
    console.error('[session] join error:', err);
    res.status(500).json({ error: 'Erro ao entrar na sessão' });
  }
});

// ── POST /api/session/:code/kick-all ──────────────────────────────────────
router.post('/:code/kick-all', async (req, res) => {
  try {
    const { code } = req.params;
    const session = await db.getSession(code);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

    const operatorKey = req.headers['x-operator-key'];
    if (session.operatorKey !== operatorKey) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    await db.clearParticipants(code);
    await db.publishEvent(code, { type: 'kick_all' });

    res.json({ ok: true });
  } catch (err) {
    console.error('[session] kick-all error:', err);
    res.status(500).json({ error: 'Erro ao expulsar participantes' });
  }
});

// ── POST /api/session/:code/leave ──────────────────────────────────────────
// Participant leaves a session
router.post('/:code/leave', async (req, res) => {
  try {
    const { code } = req.params;
    const { participantId } = req.body;

    if (!participantId) {
      return res.status(400).json({ error: 'participantId é obrigatório' });
    }

    const session = await db.getSession(code);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

    await db.removeParticipant(code, participantId);
    
    // Notify operator and others of participant leaving
    await db.publishEvent(code, { type: 'participant_left', participantId });

    res.json({ ok: true });
  } catch (err) {
    console.error('[session] leave error:', err);
    res.status(500).json({ error: 'Erro ao sair da sessão' });
  }
});

// ── DELETE /api/session/:code ──────────────────────────────────────────────
// End a session
router.delete('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const session = await db.getSession(code);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

    // Autenticação básica via X-Operator-Key
    const operatorKey = req.headers['x-operator-key'];
    if (session.operatorKey !== operatorKey) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    await db.deleteSession(code);
    await db.publishEvent(code, { type: 'session_invalidated' });

    res.json({ ok: true });
  } catch (err) {
    console.error('[session] delete error:', err);
    res.status(500).json({ error: 'Erro ao encerrar a sessão' });
  }
});

module.exports = router;
