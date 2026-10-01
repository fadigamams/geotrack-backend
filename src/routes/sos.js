const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { addNotif } = require('./notifs');
const { notifyUser } = require('../push');
const router = express.Router();
let ready = null;
function init() {
  return db.query('CREATE TABLE IF NOT EXISTS sos_events (id BIGSERIAL PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, lat DOUBLE PRECISION, lng DOUBLE PRECISION, accuracy DOUBLE PRECISION, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ)');
}
async function contactsOf(uid) { const r = await db.query('SELECT contact_user_id AS id FROM contacts WHERE owner_id=$1', [uid]); return r.rows; }
router.post('/', requireAuth, async (req, res) => {
  try { ready = ready || init(); await ready;
    const b = req.body || {};
    const lat = Number(b.lat), lng = Number(b.lng);
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'Position requise' });
    const u = await db.query('SELECT name FROM users WHERE id=$1', [req.userId]);
    const e = await db.query('INSERT INTO sos_events (user_id, lat, lng, accuracy) VALUES ($1,$2,$3,$4) RETURNING id', [req.userId, lat, lng, Number(b.accuracy) || null]);
    const list = await contactsOf(req.userId);
    const name = u.rows[0].name, link = 'https://www.google.com/maps?q=' + lat + ',' + lng;
    for (const c of list) {
      addNotif(c.id, 'alertes', '🚨', 'SOS de ' + name, link);
      notifyUser(c.id, { title: '🚨 SOS de ' + name, body: 'Appuyez pour ouvrir YAM', convId: 'sos' });
      req.app.get('io').to('user:' + c.id).emit('sos:new', { id: e.rows[0].id, name: name, lat: lat, lng: lng });
    }
    res.status(201).json({ id: e.rows[0].id, sent: list.length });
  } catch (err) { res.status(500).json({ error: 'Erreur SOS' }); }
});
router.post('/:id/resolve', requireAuth, async (req, res) => {
  try { ready = ready || init(); await ready;
    const r = await db.query('UPDATE sos_events SET resolved_at=now() WHERE id=$1 AND user_id=$2 AND resolved_at IS NULL RETURNING id', [req.params.id, req.userId]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'SOS introuvable' });
    const u = await db.query('SELECT name FROM users WHERE id=$1', [req.userId]);
    for (const c of await contactsOf(req.userId)) {
      addNotif(c.id, 'alertes', '✅', u.rows[0].name + ' est en sécurité', null);
      req.app.get('io').to('user:' + c.id).emit('sos:end', { name: u.rows[0].name });
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erreur SOS' }); }
});
router.get('/active', requireAuth, async (req, res) => {
  try { ready = ready || init(); await ready;
    const r = await db.query('SELECT id FROM sos_events WHERE user_id=$1 AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 1', [req.userId]);
    res.json({ id: r.rows[0] ? r.rows[0].id : null });
  } catch (err) { res.status(500).json({ error: 'Erreur SOS' }); }
});
module.exports = { router };
