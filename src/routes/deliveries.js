const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const STATUSES = ['pending', 'picked', 'en_route', 'near', 'delivered', 'cancelled'];

db.query(`CREATE TABLE IF NOT EXISTS deliveries (
  id SERIAL PRIMARY KEY,
  courier_id UUID REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES users(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  destination TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  pod_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)`).catch(err => console.error('table deliveries:', err.message));

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT d.id, d.description, d.destination, d.status, d.pod_note, d.created_at,
              c.name AS courier_name, k.name AS client_name,
              (d.courier_id = $1) AS is_courier
       FROM deliveries d
       JOIN users c ON c.id = d.courier_id
       LEFT JOIN users k ON k.id = d.client_id
       WHERE d.courier_id = $1 OR d.client_id = $1
       ORDER BY d.created_at DESC LIMIT 50`,
      [req.userId]
    );
    res.json({ deliveries: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur chargement livraisons' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { description, destination, clientIdentifier } = req.body || {};
    if (!description || !description.trim()) return res.status(400).json({ error: 'Description requise' });
    let clientId = null;
    if (clientIdentifier && clientIdentifier.trim()) {
      const c = await db.query('SELECT id FROM users WHERE email=$1 OR phone=$1', [clientIdentifier.trim()]);
      if (!c.rows[0]) return res.status(404).json({ error: 'Client introuvable' });
      clientId = c.rows[0].id;
    }
    const { rows } = await db.query(
      'INSERT INTO deliveries (courier_id, client_id, description, destination) VALUES ($1,$2,$3,$4) RETURNING id',
      [req.userId, clientId, description.trim().slice(0, 500), (destination || '').trim().slice(0, 300) || null]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Erreur creation livraison' });
  }
});

router.put('/:id/status', requireAuth, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Statut invalide' });
    const { rows } = await db.query(
      'UPDATE deliveries SET status=$1, updated_at=NOW() WHERE id=$2 AND courier_id=$3 RETURNING id',
      [status, req.params.id, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Livraison introuvable' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur mise a jour livraison' });
  }
});

router.post('/:id/pod', requireAuth, async (req, res) => {
  try {
    const note = ((req.body || {}).note || '').trim().slice(0, 500);
    if (!note) return res.status(400).json({ error: 'Note requise' });
    const { rows } = await db.query(
      'UPDATE deliveries SET pod_note=$1, updated_at=NOW() WHERE id=$2 AND courier_id=$3 RETURNING id',
      [note, req.params.id, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Livraison introuvable' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur preuve livraison' });
  }
});

module.exports = router;
