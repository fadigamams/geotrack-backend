const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, avatarUrl: row.avatar_url, isSuperAdmin: !!row.is_super_admin };
}

router.post('/register', async (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nom, email et mot de passe requis' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caracteres' });
  }

  const existing = await db.query('SELECT id FROM users WHERE email = $1 OR ($2::text IS NOT NULL AND phone = $2)', [email, phone || null]);
  if (existing.rows.length) {
    return res.status(409).json({ error: 'Un compte existe deja avec cet email ou ce numero' });
  }

  const hash = await bcrypt.hash(password, 12);
  const result = await db.query(
    'INSERT INTO users (name, email, phone, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, name, email, phone, avatar_url, is_super_admin',
    [name, email, phone || null, hash]
  );
  const user = result.rows[0];
  res.status(201).json({ token: signToken(user.id), user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: 'Identifiants invalides' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Identifiants invalides' });

  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  if (superAdminEmail && user.email === superAdminEmail && !user.is_super_admin) {
    await db.query('UPDATE users SET is_super_admin = true WHERE id = $1', [user.id]);
    user.is_super_admin = true;
  }

  res.json({ token: signToken(user.id), user: publicUser(user) });
});

router.get('/me', requireAuth, async (req, res) => {
  const result = await db.query('SELECT id, name, email, phone, avatar_url, is_super_admin FROM users WHERE id = $1', [req.userId]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json({ user: publicUser(result.rows[0]) });
});

module.exports = router;
