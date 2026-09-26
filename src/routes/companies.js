const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireCompanyRole } = require('../middleware/company');

const router = express.Router();

// Créer une entreprise (le créateur devient owner automatiquement)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, sector } = req.body;
    if (!name) return res.status(400).json({ error: 'Le nom est requis' });

    const { rows } = await query(
      'INSERT INTO companies (name, sector, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name, sector || null, req.userId]
    );
    const company = rows[0];

    await query(
      "INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')",
      [company.id, req.userId]
    );

    // Licence de démarrage automatique (starter, 5 véhicules)
    await query(
      "INSERT INTO licenses (company_id, plan, max_vehicles, status) VALUES ($1, 'starter', 5, 'active')",
      [company.id]
    );

    res.status(201).json(company);
  } catch (err) {
    res.status(500).json({ error: 'Erreur création entreprise' });
  }
});

// Liste des entreprises dont je suis membre
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT c.*, cm.role FROM companies c
       JOIN company_members cm ON cm.company_id = c.id
       WHERE cm.user_id = $1 ORDER BY c.created_at DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur récupération entreprises' });
  }
});

// Détail d'une entreprise (membres requis)
router.get('/:companyId', requireAuth, requireCompanyRole('member'), async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM companies WHERE id = $1', [req.params.companyId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Entreprise introuvable' });

    const { rows: license } = await query(
      `SELECT * FROM licenses WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.params.companyId]
    );

    res.json({ ...rows[0], license: license[0] || null, myRole: req.companyRole });
  } catch (err) {
    res.status(500).json({ error: 'Erreur récupération entreprise' });
  }
});


// Lister les membres d'une entreprise
router.get('/:companyId/members', requireAuth, requireCompanyRole('member'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT cm.id, cm.role, cm.joined_at, u.id AS user_id, u.name, u.email, u.avatar_url
       FROM company_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.company_id = $1 ORDER BY cm.joined_at ASC`,
      [req.params.companyId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur recuperation membres' });
  }
});

router.post('/:companyId/members', requireAuth, requireCompanyRole('admin'), async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis' });
    const finalRole = ['owner','admin','member'].includes(role) ? role : 'member';
    const { rows: userRows } = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (userRows.length === 0) return res.status(404).json({ error: 'Aucun utilisateur avec cet email' });
    const userId = userRows[0].id;
    const { rows } = await query(
      `INSERT INTO company_members (company_id, user_id, role) VALUES ($1,$2,$3)
       ON CONFLICT (company_id, user_id) DO UPDATE SET role = EXCLUDED.role RETURNING *`,
      [req.params.companyId, userId, finalRole]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur ajout membre' });
  }
});

router.put('/:companyId/members/:memberId', requireAuth, requireCompanyRole('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    if (!['owner','admin','member'].includes(role)) return res.status(400).json({ error: 'Role invalide' });
    const { rows } = await query(
      'UPDATE company_members SET role = $1 WHERE id = $2 AND company_id = $3 RETURNING *',
      [role, req.params.memberId, req.params.companyId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Membre introuvable' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur modification role' });
  }
});

router.delete('/:companyId/members/:memberId', requireAuth, requireCompanyRole('admin'), async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM company_members WHERE id = $1 AND company_id = $2',
      [req.params.memberId, req.params.companyId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Membre introuvable' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression membre' });
  }
});
module.exports = router;
