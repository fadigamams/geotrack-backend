const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/users/lookup?identifier=email-ou-telephone — pour démarrer une conversation
router.get('/users/lookup', requireAuth, async (req, res) => {
  const identifier = req.query.identifier;
  if (!identifier) return res.status(400).json({ error: 'identifier requis' });
  const r = await db.query('SELECT id, name FROM users WHERE email=$1 OR phone=$1', [identifier]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json({ user: r.rows[0] });
});

async function isBlocked(userA, userB) {
  const r = await db.query(
    'SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1',
    [userA, userB]
  );
  return r.rows.length > 0;
}

async function isMember(conversationId, userId) {
  const r = await db.query(
    'SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2',
    [conversationId, userId]
  );
  return r.rows.length > 0;
}

// POST /api/conversations — récupère ou crée une conversation 1:1 avec un utilisateur
router.post('/conversations', requireAuth, async (req, res) => {
  const { withUserId } = req.body || {};
  if (!withUserId) return res.status(400).json({ error: 'withUserId requis' });
  if (withUserId === req.userId) return res.status(400).json({ error: 'Impossible de discuter avec vous-même' });

  if (await isBlocked(req.userId, withUserId)) {
    return res.status(403).json({ error: 'Conversation impossible (blocage actif)' });
  }

  const existing = await db.query(
    `SELECT c.id FROM conversations c
     JOIN conversation_members m1 ON m1.conversation_id=c.id AND m1.user_id=$1
     JOIN conversation_members m2 ON m2.conversation_id=c.id AND m2.user_id=$2
     WHERE c.is_group=false LIMIT 1`,
    [req.userId, withUserId]
  );
  if (existing.rows[0]) return res.json({ conversationId: existing.rows[0].id });

  const conv = await db.query(`INSERT INTO conversations (is_group) VALUES (false) RETURNING id`);
  const convId = conv.rows[0].id;
  await db.query(
    `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1,$2),($1,$3)`,
    [convId, req.userId, withUserId]
  );
  res.status(201).json({ conversationId: convId });
});

// GET /api/conversations — mes conversations avec dernier message et non-lus
router.get('/conversations', requireAuth, async (req, res) => {
  const r = await db.query(
    `SELECT c.id, c.is_group, c.name,
       (SELECT json_agg(json_build_object('id',u.id,'name',u.name))
          FROM conversation_members cm2 JOIN users u ON u.id=cm2.user_id
          WHERE cm2.conversation_id=c.id AND cm2.user_id<>$1) AS others,
       (SELECT body FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) AS last_body,
       (SELECT created_at FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) AS last_at,
       (SELECT count(*) FROM messages msg WHERE msg.conversation_id=c.id AND msg.created_at > cm.last_read_at AND msg.sender_id<>$1) AS unread
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=$1
     ORDER BY last_at DESC NULLS LAST`,
    [req.userId]
  );
  res.json({ conversations: r.rows });
});

// GET /api/conversations/:id/messages
router.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  if (!(await isMember(req.params.id, req.userId))) return res.status(403).json({ error: 'Accès refusé à cette conversation' });
  const r = await db.query(
    `SELECT m.id, m.sender_id, m.body, m.kind, m.meta, m.created_at
     FROM messages m
     LEFT JOIN message_deletions d ON d.message_id=m.id AND d.user_id=$2
     WHERE m.conversation_id=$1 AND d.user_id IS NULL
     ORDER BY m.created_at ASC LIMIT 200`,
    [req.params.id, req.userId]
  );
  res.json({ messages: r.rows });
});

// POST /api/conversations/:id/messages — envoyer un message (texte ou position)
router.post('/conversations/:id/messages', requireAuth, async (req, res) => {
  const convId = req.params.id;
  if (!(await isMember(convId, req.userId))) return res.status(403).json({ error: 'Accès refusé à cette conversation' });

  const { body, kind, meta } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'Message vide' });

  // Vérifie qu'aucun membre n'a bloqué l'expéditeur (conversations 1:1)
  const others = await db.query(
    'SELECT user_id FROM conversation_members WHERE conversation_id=$1 AND user_id<>$2',
    [convId, req.userId]
  );
  for (const o of others.rows) {
    if (await isBlocked(req.userId, o.user_id)) return res.status(403).json({ error: 'Envoi impossible (blocage actif)' });
  }

  const result = await db.query(
    `INSERT INTO messages (conversation_id, sender_id, body, kind, meta) VALUES ($1,$2,$3,$4,$5)
     RETURNING id, sender_id, body, kind, meta, created_at`,
    [convId, req.userId, body.trim(), kind || 'text', meta ? JSON.stringify(meta) : null]
  );
  const msg = result.rows[0];

  const io = req.app.get('io');
  io.to(`conv:${convId}`).emit('message:new', { conversationId: convId, message: msg });
  for (const o of others.rows) io.to(`user:${o.user_id}`).emit('message:notify', { conversationId: convId });

  res.status(201).json({ message: msg });
});

// POST /api/conversations/:id/read — marque la conversation comme lue jusqu'à maintenant
router.post('/conversations/:id/read', requireAuth, async (req, res) => {
  if (!(await isMember(req.params.id, req.userId))) return res.status(403).json({ error: 'Accès refusé' });
  await db.query(
    'UPDATE conversation_members SET last_read_at=now() WHERE conversation_id=$1 AND user_id=$2',
    [req.params.id, req.userId]
  );
  res.json({ ok: true });
});

// DELETE /api/messages/:id — supprimer pour moi
router.delete('/messages/:id', requireAuth, async (req, res) => {
  await db.query(
    'INSERT INTO message_deletions (message_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [req.params.id, req.userId]
  );
  res.json({ ok: true });
});

// POST /api/users/:id/block | /unblock
router.post('/users/:id/block', requireAuth, async (req, res) => {
  await db.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.userId, req.params.id]);
  res.json({ ok: true });
});
router.post('/users/:id/unblock', requireAuth, async (req, res) => {
  await db.query('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.userId, req.params.id]);
  res.json({ ok: true });
});

// POST /api/reports — signaler un utilisateur ou un message
router.post('/reports', requireAuth, async (req, res) => {
  const { reportedUserId, messageId, reason, details } = req.body || {};
  if (!reason) return res.status(400).json({ error: 'Motif requis' });
  await db.query(
    'INSERT INTO reports (reporter_id, reported_user_id, message_id, reason, details) VALUES ($1,$2,$3,$4,$5)',
    [req.userId, reportedUserId || null, messageId || null, reason, details || null]
  );
  res.status(201).json({ ok: true });
});

module.exports = router;
