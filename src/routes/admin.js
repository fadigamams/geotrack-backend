const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/company');

const router = express.Router();

router.use(requireAuth, requireSuperAdmin);

router.get('/companies', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT c.*, l.plan, l.max_vehicles, l.status AS license_status, l.expires_at
       FROM companies c
       LEFT JOIN LATERAL (
         SELECT * FROM licenses WHERE company_id = c.id ORDER BY created_at DESC LIMIT 1
       ) l ON true
       ORDER BY c.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur recuperation entreprises' });
  }
});

router.post('/companies/:companyId/licenses', async (req, res) => {
  try {
    const { plan, max_vehicles, expires_at } = req.body;
    const { rows } = await query(
      "INSERT INTO licenses (company_id, plan, max_vehicles, status, expires_at) VALUES ($1, $2, $3, 'active', $4) RETURNING *",
      [req.params.companyId, plan || 'starter', max_vehicles || 5, expires_at || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur creation licence' });
  }
});

router.put('/licenses/:licenseId', async (req, res) => {
  try {
    const { status, plan, max_vehicles, expires_at } = req.body;
    const { rows } = await query(
      'UPDATE licenses SET status = COALESCE($1, status), plan = COALESCE($2, plan), max_vehicles = COALESCE($3, max_vehicles), expires_at = COALESCE($4, expires_at) WHERE id = $5 RETURNING *',
      [status, plan, max_vehicles, expires_at, req.params.licenseId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Licence introuvable' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur mise a jour licence' });
  }
});

module.exports = router;
