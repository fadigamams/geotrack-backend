const webpush = require('web-push');
const express = require('express');
const db = require('./db');
const { requireAuth } = require('./middleware/auth');
const router = express.Router();
let ready = null;
async function init() {
  await db.query('CREATE TABLE IF NOT EXISTS app_keys (name TEXT PRIMARY KEY, value TEXT NOT NULL)');
  await db.query('CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, p256dh TEXT NOT NULL, auth TEXT NOT NULL)');
  let r = await db.query("SELECT value FROM app_keys WHERE name='vapid'");
  if (r.rows[0] === undefined) {
    const n = webpush.generateVAPIDKeys();
    await db.query("INSERT INTO app_keys (name, value) VALUES ('vapid', $1) ON CONFLICT DO NOTHING", [JSON.stringify(n)]);
    r = await db.query("SELECT value FROM app_keys WHERE name='vapid'");
  }
  const k = JSON.parse(r.rows[0].value);
  webpush.setVapidDetails('mailto:fadigamams@gmail.com', k.publicKey, k.privateKey);
  return k.publicKey;
}
router.get('/key', async (req, res) => { ready = ready || init(); res.json({ publicKey: await ready }); });
router.post('/subscribe', requireAuth, async (req, res) => {
  ready = ready || init(); await ready;
  const s = (req.body || {}).subscription || {};
  const keys = s.keys || {};
  if (typeof s.endpoint !== 'string' || typeof keys.p256dh !== 'string') return res.status(400).json({ error: 'Abonnement invalide' });
  await db.query('INSERT INTO push_subs (endpoint, user_id, p256dh, auth) VALUES ($1,$2,$3,$4) ON CONFLICT (endpoint) DO UPDATE SET user_id=$2, p256dh=$3, auth=$4', [s.endpoint, req.userId, keys.p256dh, keys.auth]);
  res.json({ ok: true });
});
async function notifyUser(userId, payload) {
  try {
    ready = ready || init(); await ready;
    const r = await db.query('SELECT * FROM push_subs WHERE user_id=$1', [userId]);
    for (const s of r.rows) {
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload)).catch(e => { if (e.statusCode === 404 || e.statusCode === 410) db.query('DELETE FROM push_subs WHERE endpoint=$1', [s.endpoint]); });
    }
  } catch (e) { console.log('push', e.message); }
}
module.exports = { router, notifyUser };
