const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, icon } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Le nom du groupe est requis' });
    const { rows } = await query(
      'INSERT INTO groups (owner_id, name, icon) VALUES ($1, $2, $3) RETURNING *',
      [req.userId, name, icon || '👥']
    );
    const group = rows[0];
    await query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [group.id, req.userId]);
    res.status(201).json(group);
  } catch (err) {
    res.status(500).json({ error: 'Erreur creation groupe' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT g.*, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count FROM groups g JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $1 ORDER BY g.created_at DESC',
      [req.userId]
    );
    res.json({ groups: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur recuperation groupes' });
  }
});

router.get('/:groupId', requireAuth, async (req, res) => {
  try {
    const isMember = await query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [req.params.groupId, req.userId]);
    if (isMember.rows.length === 0) return res.status(403).json({ error: 'Vous n etes pas membre de ce groupe' });
    const group = await query('SELECT * FROM groups WHERE id = $1', [req.params.groupId]);
    if (group.rows.length === 0) return res.status(404).json({ error: 'Groupe introuvable' });
    const members = await query(
'SELECT u.id, u.name, u.phone, u.avatar_url FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = $1', [req.params.groupId]);
    res.json({ ...group.rows[0], members: members.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur recuperation groupe' });
  }
});

router.post('/:groupId/members', requireAuth, async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId requis' });
    const owner = await query('SELECT owner_id FROM groups WHERE id = $1', [req.params.groupId]);
    if (owner.rows.length === 0) return res.status(404).json({ error: 'Groupe introuvable' });
    if (owner.rows[0].owner_id !== req.userId) return res.status(403).json({ error: 'Seul le createur peut ajouter des membres' });
    await query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.groupId, userId]);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur ajout membre' });
  }
});

router.delete('/:groupId/members/:userId', requireAuth, async (req, res) => {
  try {
    const owner = await query('SELECT owner_id FROM groups WHERE id = $1', [req.params.groupId]);
    if (owner.rows.length === 0) return res.status(404).json({ error: 'Groupe introuvable' });
    if (owner.rows[0].owner_id !== req.userId && req.params.userId !== req.userId) {
      return res.status(403).json({ error: 'Action non autorisee' });
    }
    await query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [req.params.groupId, req.params.userId]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression membre' });
  }
});

router.delete('/:groupId', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await query('DELETE FROM groups WHERE id = $1 AND owner_id = $2', [req.params.groupId, req.userId]);
    if (rowCount === 0) return res.status(404).json({ error: 'Groupe introuvable ou non autorise' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression groupe' });
  }
});

module.exports = router;
