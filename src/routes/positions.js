const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function hasActiveShare(ownerId, viewerId) {
  if (ownerId === viewerId) return true; // on peut toujours voir sa propre position
  const r = await db.query(
    `SELECT 1 FROM shares
     WHERE owner_id = $1 AND viewer_id = $2 AND status = 'active'
       AND (expires_at IS NULL OR expires_at > now())
     LIMIT 1`,
    [ownerId, viewerId]
  );
  return r.rows.length > 0;
}

async function audit(actorId, targetId, action, allowed) {
  await db.query(
    'INSERT INTO access_audit (actor_id, target_id, action, allowed) VALUES ($1,$2,$3,$4)',
    [actorId, targetId, action, allowed]
  );
}

// POST /api/positions — l'utilisateur connecté publie sa propre position
router.post('/', requireAuth, async (req, res) => {
  const { lat, lng, accuracy, speed, heading, battery, isDemo } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat et lng (nombres) sont requis' });
  }

  await db.query(
    `INSERT INTO current_positions (user_id, lat, lng, accuracy, speed, heading, battery, is_demo, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (user_id) DO UPDATE SET
       lat=$2, lng=$3, accuracy=$4, speed=$5, heading=$6, battery=$7, is_demo=$8, updated_at=now()`,
    [req.userId, lat, lng, accuracy ?? null, speed ?? null, heading ?? null, battery ?? null, !!isDemo]
  );
  await db.query(
    'INSERT INTO position_history (user_id, lat, lng, accuracy, speed) VALUES ($1,$2,$3,$4,$5)',
    [req.userId, lat, lng, accuracy ?? null, speed ?? null]
  );

  // Ne diffuser en temps réel qu'aux spectateurs actuellement autorisés (le socket ne rejoint la
  // room que si /api/shares a validé un partage actif — voir src/sockets/index.js).
  const io = req.app.get('io');
  io.to(`pos:${req.userId}`).emit('position:update', {
    userId: req.userId, lat, lng, accuracy, speed, heading, battery,
    isDemo: !!isDemo, updatedAt: new Date().toISOString(),
  });

  res.json({ ok: true });
});

// GET /api/positions/:userId — lecture de la position d'un tiers (403 si non autorisé)
router.get('/:userId', requireAuth, async (req, res) => {
  const targetId = req.params.userId;
  const allowed = await hasActiveShare(targetId, req.userId);
  await audit(req.userId, targetId, 'view_position', allowed);

  if (!allowed) return res.status(403).json({ error: 'Accès à la localisation refusé' });

  const result = await db.query('SELECT * FROM current_positions WHERE user_id = $1', [targetId]);
  if (!result.rows[0]) return res.status(404).json({ error: "Aucune position partagée pour l'instant" });

  const p = result.rows[0];
  res.json({
    userId: p.user_id, lat: p.lat, lng: p.lng, accuracy: p.accuracy,
    speed: p.speed, heading: p.heading, battery: p.battery,
    isDemo: p.is_demo, updatedAt: p.updated_at,
  });
});

// GET /api/positions/:userId/history?since=ISO — trajets (même règle d'autorisation)
router.get('/:userId/history', requireAuth, async (req, res) => {
  const targetId = req.params.userId;
  const allowed = await hasActiveShare(targetId, req.userId);
  await audit(req.userId, targetId, 'view_history', allowed);
  if (!allowed) return res.status(403).json({ error: 'Accès à l\'historique refusé' });

  const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 24 * 3600 * 1000);
  const result = await db.query(
    `SELECT lat, lng, accuracy, speed, recorded_at FROM position_history
     WHERE user_id = $1 AND recorded_at >= $2 ORDER BY recorded_at ASC LIMIT 2000`,
    [targetId, since]
  );
  res.json({ points: result.rows });
});

module.exports = router;
