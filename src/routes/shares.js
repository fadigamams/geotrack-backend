const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function computeExpiry(durationMinutes) {
  if (!durationMinutes || durationMinutes <= 0) return null; // jusqu'à désactivation
  return new Date(Date.now() + durationMinutes * 60000);
}

// POST /api/shares — inviter quelqu'un à recevoir MA position
// body: { identifier: email ou téléphone, durationMinutes: 15|30|60|240|0 }
router.post('/', requireAuth, async (req, res) => {
  const { identifier, durationMinutes } = req.body || {};
  if (!identifier) return res.status(400).json({ error: 'Identifiant du destinataire requis' });

  const found = await db.query('SELECT id, name FROM users WHERE email = $1 OR phone = $1', [identifier]);
  const viewer = found.rows[0];
  if (!viewer) return res.status(404).json({ error: "Cette personne n'a pas de compte GeoTrack" });
  if (viewer.id === req.userId) return res.status(400).json({ error: 'Impossible de partager avec vous-même' });

  const result = await db.query(
    `INSERT INTO shares (owner_id, viewer_id, status, duration_minutes)
     VALUES ($1,$2,'pending',$3) RETURNING *`,
    [req.userId, viewer.id, durationMinutes ?? null]
  );
  const share = result.rows[0];

  const io = req.app.get('io');
  io.to(`user:${viewer.id}`).emit('share:invite', { shareId: share.id, ownerId: req.userId });

  res.status(201).json({ share });
});

// POST /api/shares/:id/accept — le viewer accepte
router.post('/:id/accept', requireAuth, async (req, res) => {
  const r = await db.query('SELECT * FROM shares WHERE id = $1', [req.params.id]);
  const share = r.rows[0];
  if (!share) return res.status(404).json({ error: 'Demande introuvable' });
  if (share.viewer_id !== req.userId) return res.status(403).json({ error: "Cette demande ne vous est pas adressée" });
  if (share.status !== 'pending') return res.status(409).json({ error: 'Cette demande a déjà été traitée' });

  const expiresAt = computeExpiry(share.duration_minutes);
  const updated = await db.query(
    `UPDATE shares SET status='active', accepted_at=now(), expires_at=$2 WHERE id=$1 RETURNING *`,
    [share.id, expiresAt]
  );

  const io = req.app.get('io');
  io.to(`user:${share.owner_id}`).emit('share:accepted', { shareId: share.id, viewerId: req.userId });

  res.json({ share: updated.rows[0] });
});

// POST /api/shares/:id/decline
router.post('/:id/decline', requireAuth, async (req, res) => {
  const r = await db.query('SELECT * FROM shares WHERE id = $1', [req.params.id]);
  const share = r.rows[0];
  if (!share) return res.status(404).json({ error: 'Demande introuvable' });
  if (share.viewer_id !== req.userId) return res.status(403).json({ error: "Cette demande ne vous est pas adressée" });

  const updated = await db.query(`UPDATE shares SET status='declined' WHERE id=$1 RETURNING *`, [share.id]);
  req.app.get('io').to(`user:${share.owner_id}`).emit('share:declined', { shareId: share.id });
  res.json({ share: updated.rows[0] });
});

// POST /api/shares/:id/stop — arrêt immédiat, par le propriétaire OU le spectateur
router.post('/:id/stop', requireAuth, async (req, res) => {
  const r = await db.query('SELECT * FROM shares WHERE id = $1', [req.params.id]);
  const share = r.rows[0];
  if (!share) return res.status(404).json({ error: 'Partage introuvable' });
  if (share.owner_id !== req.userId && share.viewer_id !== req.userId) {
    return res.status(403).json({ error: "Vous ne participez pas à ce partage" });
  }

  const updated = await db.query(`UPDATE shares SET status='stopped', stopped_at=now() WHERE id=$1 RETURNING *`, [share.id]);
  const io = req.app.get('io');
  io.to(`pos:${share.owner_id}`).emit('share:stopped', { shareId: share.id, ownerId: share.owner_id });
  io.to(`user:${share.owner_id}`).emit('share:stopped', { shareId: share.id });
  io.to(`user:${share.viewer_id}`).emit('share:stopped', { shareId: share.id });

  res.json({ share: updated.rows[0] });
});

// GET /api/shares/mine — partages que J'AI créés (je suis owner)
router.get('/mine', requireAuth, async (req, res) => {
  const r = await db.query(
    `SELECT s.*, u.name AS viewer_name, u.email AS viewer_email
     FROM shares s JOIN users u ON u.id = s.viewer_id
     WHERE s.owner_id = $1 ORDER BY s.created_at DESC`,
    [req.userId]
  );
  res.json({ shares: r.rows });
});

// GET /api/shares/shared-with-me — partages dont JE suis le spectateur autorisé
router.get('/shared-with-me', requireAuth, async (req, res) => {
  const r = await db.query(
    `SELECT s.*, u.name AS owner_name, u.email AS owner_email
     FROM shares s JOIN users u ON u.id = s.owner_id
     WHERE s.viewer_id = $1 ORDER BY s.created_at DESC`,
    [req.userId]
  );
  res.json({ shares: r.rows });
});

module.exports = router;
