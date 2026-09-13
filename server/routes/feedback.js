const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { optionalAuth, verifyAdminToken } = require('../auth');

// ── POST /api/feedback  — submit feedback (open to all, login optional) ───────
router.post('/', optionalAuth, (req, res) => {
  const { rating, helpsShare, challenges, improvements, recommend } = req.body;

  if (!rating || rating < 1 || rating > 5)
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });

  const userId   = req.user?.userId || null;
  const username = userId
    ? (db.prepare('SELECT username FROM users WHERE id=?').get(userId)?.username || '')
    : (req.body.guestName || '').slice(0, 40).trim();

  db.prepare(`
    INSERT INTO feedback (id, user_id, username, rating, helps_share, challenges, improvements, recommend, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(),
    userId,
    username,
    Math.round(rating),
    helpsShare ? 1 : 0,
    (challenges   || '').slice(0, 2000).trim(),
    (improvements || '').slice(0, 2000).trim(),
    recommend ? 1 : 0,
    new Date().toISOString()
  );

  res.json({ ok: true });
});

// ── GET /api/feedback/admin  — list all feedback (admin only) ─────────────────
router.get('/admin', verifyAdminToken, (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 200, 500);
  const offset = parseInt(req.query.offset) || 0;

  const rows = db.prepare(`
    SELECT id, user_id, username, rating, helps_share, challenges, improvements, recommend, created_at
    FROM feedback
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = db.prepare('SELECT COUNT(*) as c FROM feedback').get().c;

  const avgRating = db.prepare('SELECT ROUND(AVG(rating),1) as v FROM feedback').get().v || 0;
  const pctHelps  = total
    ? Math.round(db.prepare('SELECT COUNT(*) as c FROM feedback WHERE helps_share=1').get().c / total * 100)
    : 0;
  const pctRecommend = total
    ? Math.round(db.prepare('SELECT COUNT(*) as c FROM feedback WHERE recommend=1').get().c / total * 100)
    : 0;

  const ratingDist = db.prepare(`
    SELECT rating, COUNT(*) as c FROM feedback GROUP BY rating ORDER BY rating
  `).all();

  res.json({ rows, total, avgRating, pctHelps, pctRecommend, ratingDist });
});

// ── DELETE /api/feedback/admin/:id  — delete a single response ───────────────
router.delete('/admin/:id', verifyAdminToken, (req, res) => {
  db.prepare('DELETE FROM feedback WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
