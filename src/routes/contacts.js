const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/contacts/match — body: { phones: ["+225...", ...] }
// Ne stocke RIEN côté serveur : retourne uniquement, pour chaque numéro, s'il correspond à un
// compte GeoTrack existant. La position n'est jamais renvoyée ici (règle du module Répertoire).
router.post('/match', requireAuth, async (req, res) => {
  const phones = Array.isArray(req.body?.phones) ? req.body.phones.slice(0, 500) : [];
  if (!phones.length) return res.status(400).json({ error: 'Liste de numéros requise' });

  const result = await db.query(
    'SELECT id, name, phone FROM users WHERE phone = ANY($1::text[])',
    [phones]
  );
  const byPhone = new Map(result.rows.map(u => [u.phone, u]));

  const matches = phones.map(phone => {
    const u = byPhone.get(phone);
    return u
      ? { phone, matched: true, userId: u.id, name: u.name }
      : { phone, matched: false };
  });

  res.json({ matches });
});

// POST /api/contacts — enregistrer un contact matché dans mon répertoire GeoTrack
router.post('/', requireAuth, async (req, res) => {
  const { userId, label } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId requis' });
  if (userId === req.userId) return res.status(400).json({ error: 'Impossible de vous ajouter vous-même' });

  await db.query(
    `INSERT INTO contacts (owner_id, contact_user_id, label) VALUES ($1,$2,$3)
     ON CONFLICT (owner_id, contact_user_id) DO UPDATE SET label = $3`,
    [req.userId, userId, label || null]
  );
  res.status(201).json({ ok: true });
});

// DELETE /api/contacts/:userId
router.delete('/:userId', requireAuth, async (req, res) => {
  await db.query('DELETE FROM contacts WHERE owner_id = $1 AND contact_user_id = $2', [req.userId, req.params.userId]);
  res.json({ ok: true });
});

// GET /api/contacts — mon répertoire GeoTrack avec statut de partage calculé
router.get('/', requireAuth, async (req, res) => {
  const result = await db.query(
    `SELECT
       u.id AS user_id, u.name, u.phone,
       c.label,
       s.id AS share_id, s.status AS share_status, s.expires_at,
       (f.owner_id IS NOT NULL) AS is_favorite
     FROM contacts c
     JOIN users u ON u.id = c.contact_user_id
     LEFT JOIN shares s ON s.owner_id = u.id AND s.viewer_id = c.owner_id
       AND s.status IN ('active','pending')
       AND (s.expires_at IS NULL OR s.expires_at > now())
     LEFT JOIN favorites f ON f.owner_id = c.owner_id AND f.favorite_user_id = u.id
     WHERE c.owner_id = $1
     ORDER BY u.name ASC`,
    [req.userId]
  );

  const contacts = result.rows.map(r => ({
    userId: r.user_id,
    name: r.label || r.name,
    phone: r.phone,
    isFavorite: r.is_favorite,
    status: r.share_status === 'active' ? 'shared' : r.share_status === 'pending' ? 'pending' : 'stopped',
    expiresAt: r.expires_at,
  }));
  res.json({ contacts });
});

module.exports = router;
