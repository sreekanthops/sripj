const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { verifyToken, optionalAuth } = require('../auth');

// ── GET /api/diary-access/search?q=  — search users by username/displayName ──
router.get('/search', verifyToken, (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q || q.length < 2) return res.json({ users: [] });
  const rows = db.prepare(`
    SELECT id, username, display_name, avatar_url
    FROM users
    WHERE id != ?
      AND (LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?)
    ORDER BY username ASC
    LIMIT 10
  `).all(req.user.userId, `%${q}%`, `%${q}%`);
  res.json({ users: rows.map(u => ({ id: u.id, username: u.username, displayName: u.display_name || u.username, avatarUrl: u.avatar_url || '' })) });
});

// ── GET /api/diary-access  — list users I have granted access to my diary ─────
router.get('/', verifyToken, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_url, da.created_at
    FROM diary_access da
    JOIN users u ON u.id = da.grantee_id
    WHERE da.owner_id = ?
    ORDER BY da.created_at DESC
  `).all(req.user.userId);
  res.json({ grantees: rows.map(u => ({ id: u.id, username: u.username, displayName: u.display_name || u.username, avatarUrl: u.avatar_url || '', grantedAt: u.created_at })) });
});

// ── POST /api/diary-access  — grant a user access to my diary ─────────────────
router.post('/', verifyToken, (req, res) => {
  const { granteeId } = req.body;
  if (!granteeId) return res.status(400).json({ error: 'granteeId required' });
  if (granteeId === req.user.userId) return res.status(400).json({ error: 'Cannot grant yourself' });
  const target = db.prepare('SELECT id, username FROM users WHERE id=?').get(granteeId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  db.prepare(`INSERT OR IGNORE INTO diary_access (id, owner_id, grantee_id, created_at) VALUES (?,?,?,?)`)
    .run(uuidv4(), req.user.userId, granteeId, new Date().toISOString());
  res.json({ ok: true });
});

// ── DELETE /api/diary-access/:granteeId  — revoke access ─────────────────────
router.delete('/:granteeId', verifyToken, (req, res) => {
  db.prepare('DELETE FROM diary_access WHERE owner_id=? AND grantee_id=?')
    .run(req.user.userId, req.params.granteeId);
  res.json({ ok: true });
});

// ── GET /api/diary-access/granted-to-me  — diaries I can access ───────────────
router.get('/granted-to-me', verifyToken, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_url, da.created_at
    FROM diary_access da
    JOIN users u ON u.id = da.owner_id
    WHERE da.grantee_id = ?
    ORDER BY da.created_at DESC
  `).all(req.user.userId);
  res.json({ diaries: rows.map(u => ({ id: u.id, username: u.username, displayName: u.display_name || u.username, avatarUrl: u.avatar_url || '' })) });
});

// ── GET /api/diary-access/check/:ownerId  — does this diary owner grant me access? ──
router.get('/check/:ownerId', verifyToken, (req, res) => {
  const row = db.prepare('SELECT id FROM diary_access WHERE owner_id=? AND grantee_id=?')
    .get(req.params.ownerId, req.user.userId);
  res.json({ hasAccess: !!row });
});

module.exports = router;
