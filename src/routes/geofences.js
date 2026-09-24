const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/geofences — mes zones
router.get('/', requireAuth, async (req, res) => {
  const r = await db.query(
    'SELECT id, name, lat, lng, radius_m, active, created_at FROM geofences WHERE owner_id=$1 ORDER BY created_at DESC',
    [req.userId]
  );
  res.json({ geofences: r.rows });
});

// POST /api/geofences — créer une zone
router.post('/', requireAuth, async (req, res) => {
  const { name, lat, lng, radiusM } = req.body || {};
  if (!name || typeof lat !== 'number' || typeof lng !== 'number' || !radiusM) {
    return res.status(400).json({ error: 'name, lat, lng et radiusM sont requis' });
  }
  const r = await db.query(
    `INSERT INTO geofences (owner_id, name, lat, lng, radius_m) VALUES ($1,$2,$3,$4,$5)
     RETURNING id, name, lat, lng, radius_m, active, created_at`,
    [req.userId, name, lat, lng, radiusM]
  );
  res.status(201).json({ geofence: r.rows[0] });
});

// PATCH /api/geofences/:id — activer/désactiver
router.patch('/:id', requireAuth, async (req, res) => {
  const { active } = req.body || {};
  const r = await db.query(
    'UPDATE geofences SET active=$3 WHERE id=$1 AND owner_id=$2 RETURNING id, active',
    [req.params.id, req.userId, active]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Zone introuvable' });
  res.json({ geofence: r.rows[0] });
});

// DELETE /api/geofences/:id
router.delete('/:id', requireAuth, async (req, res) => {
  await db.query('DELETE FROM geofences WHERE id=$1 AND owner_id=$2', [req.params.id, req.userId]);
  res.json({ ok: true });
});

module.exports = router;
