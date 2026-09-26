const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireCompanyRole, requireActiveLicense } = require('../middleware/company');

const router = express.Router({ mergeParams: true });

router.get('/', requireAuth, requireCompanyRole('member'), async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM vehicles WHERE company_id = $1 ORDER BY created_at DESC',
      [req.params.companyId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur recuperation vehicules' });
  }
});

router.post('/', requireAuth, requireCompanyRole('admin'), requireActiveLicense, async (req, res) => {
  try {
    const { plate, brand, model, driver_id } = req.body;
    if (!plate) return res.status(400).json({ error: 'La plaque est requise' });

    const { rows: countRows } = await query(
      'SELECT COUNT(*) FROM vehicles WHERE company_id = $1 AND active = true',
      [req.params.companyId]
    );
    const current = parseInt(countRows[0].count, 10);
    if (current >= req.license.max_vehicles) {
      return res.status(403).json({ error: 'Quota de vehicules atteint pour votre licence' });
    }

    const { rows } = await query(
      'INSERT INTO vehicles (company_id, plate, brand, model, driver_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.params.companyId, plate, brand || null, model || null, driver_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Cette plaque existe deja' });
    res.status(500).json({ error: 'Erreur ajout vehicule' });
  }
});

router.put('/:vehicleId', requireAuth, requireCompanyRole('admin'), async (req, res) => {
  try {
    const { plate, brand, model, driver_id, active } = req.body;
    const { rows } = await query(
      'UPDATE vehicles SET plate = COALESCE($1, plate), brand = COALESCE($2, brand), model = COALESCE($3, model), driver_id = COALESCE($4, driver_id), active = COALESCE($5, active) WHERE id = $6 AND company_id = $7 RETURNING *',
      [plate, brand, model, driver_id, active, req.params.vehicleId, req.params.companyId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Vehicule introuvable' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur modification vehicule' });
  }
});

router.delete('/:vehicleId', requireAuth, requireCompanyRole('admin'), async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM vehicles WHERE id = $1 AND company_id = $2',
      [req.params.vehicleId, req.params.companyId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Vehicule introuvable' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression vehicule' });
  }
});

module.exports = router;
