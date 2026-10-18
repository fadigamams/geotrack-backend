const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await db.query('SELECT contact_key, grp FROM contact_groups WHERE owner_id = $1', [req.userId]);
    const groups = {};
    r.rows.forEach(x => { groups[x.contact_key] = x.grp; });
    res.json({ groups });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/', requireAuth, async (req, res) => {
  try {
    const key = String(req.body.key || '').slice(0, 200);
    const grp = String(req.body.grp || '').slice(0, 30);
    if (key.length === 0) return res.status(400).json({ error: 'Contact requis' });
    if (grp.length === 0) {
      await db.query('DELETE FROM contact_groups WHERE owner_id = $1 AND contact_key = $2', [req.userId, key]);
    } else {
      await db.query('INSERT INTO contact_groups (owner_id, contact_key, grp) VALUES ($1, $2, $3) ON CONFLICT (owner_id, contact_key) DO UPDATE SET grp = EXCLUDED.grp, updated_at = now()', [req.userId, key, grp]);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
