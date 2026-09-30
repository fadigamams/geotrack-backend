const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
let ready = null;
function init() {
  return db.query('CREATE TABLE IF NOT EXISTS notifications (id BIGSERIAL PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, icon TEXT, title TEXT NOT NULL, body TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), read_at TIMESTAMPTZ)');
}
async function addNotif(userId, kind, icon, title, body) {
  try { ready = ready || init(); await ready;
    await db.query('INSERT INTO notifications (user_id, kind, icon, title, body) VALUES ($1,$2,$3,$4,$5)', [userId, kind, icon, title, body || null]);
  } catch (e) { console.log('notif', e.message); }
}
router.get('/', requireAuth, async (req, res) => {
  try { ready = ready || init(); await ready;
    const r = await db.query('SELECT id, kind, icon, title, body, created_at, read_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.userId]);
    res.json({ notifications: r.rows });
  } catch (e) { res.status(500).json({ error: 'Erreur notifications' }); }
});
router.post('/read-all', requireAuth, async (req, res) => {
  try { ready = ready || init(); await ready;
    await db.query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [req.userId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erreur notifications' }); }
});
module.exports = { router, addNotif };
