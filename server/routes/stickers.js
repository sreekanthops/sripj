const router = require('express').Router();
const db = require('../db');
const { verifyToken, optionalAuth } = require('../auth');

// GET /api/stickers/:username  — load stickers for a user's page (public)
router.get('/:username', optionalAuth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE username = ?')
                 .get(req.params.username.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found' });
  const row = db.prepare('SELECT data FROM page_stickers WHERE user_id = ?').get(user.id);
  let stickers = [];
  try { stickers = JSON.parse(row?.data || '[]'); } catch {}
  res.json({ stickers });
});

// PUT /api/stickers  — save current user's stickers (owner only)
router.put('/', verifyToken, (req, res) => {
  const { stickers } = req.body;
  if (!Array.isArray(stickers)) return res.status(400).json({ error: 'stickers array required' });
  const data = JSON.stringify(stickers);
  db.prepare(`
    INSERT INTO page_stickers (user_id, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(req.user.userId, data, new Date().toISOString());
  res.json({ ok: true });
});

module.exports = router;
