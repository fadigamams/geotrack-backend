const { query } = require('../db');

// Vérifie que l'utilisateur est membre de l'entreprise (route /api/companies/:companyId/...)
// avec un rôle suffisant. minRole: 'member' | 'admin' | 'owner'
const ROLE_RANK = { member: 1, admin: 2, owner: 3 };

function requireCompanyRole(minRole = 'member') {
  return async (req, res, next) => {
    try {
      const companyId = req.params.companyId;
      if (!companyId) return res.status(400).json({ error: 'companyId manquant' });

      const { rows } = await query(
        'SELECT role FROM company_members WHERE company_id = $1 AND user_id = $2',
        [companyId, req.userId]
      );
      if (rows.length === 0) {
        return res.status(403).json({ error: "Vous n'êtes pas membre de cette entreprise" });
      }
      const myRank = ROLE_RANK[rows[0].role] || 0;
      if (myRank < ROLE_RANK[minRole]) {
        return res.status(403).json({ error: 'Rôle insuffisant pour cette action' });
      }
      req.companyRole = rows[0].role;
      req.companyId = companyId;
      next();
    } catch (err) {
      res.status(500).json({ error: 'Erreur vérification rôle entreprise' });
    }
  };
}

// Vérifie que l'entreprise a une licence active (à utiliser après requireCompanyRole)
async function requireActiveLicense(req, res, next) {
  try {
    const companyId = req.params.companyId || req.companyId;
    const { rows } = await query(
      `SELECT * FROM licenses WHERE company_id = $1 AND status = 'active'
       AND (expires_at IS NULL OR expires_at > now())
       ORDER BY created_at DESC LIMIT 1`,
      [companyId]
    );
    if (rows.length === 0) {
      return res.status(403).json({ error: 'Aucune licence active pour cette entreprise' });
    }
    req.license = rows[0];
    next();
  } catch (err) {
    res.status(500).json({ error: 'Erreur vérification licence' });
  }
}

// Vérifie que l'utilisateur est Super Admin YAM
async function requireSuperAdmin(req, res, next) {
  try {
    const { rows } = await query('SELECT is_super_admin FROM users WHERE id = $1', [req.userId]);
    if (rows.length === 0 || !rows[0].is_super_admin) {
      return res.status(403).json({ error: 'Accès réservé au Super Admin YAM' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Erreur vérification Super Admin' });
  }
}

module.exports = { requireCompanyRole, requireActiveLicense, requireSuperAdmin };
