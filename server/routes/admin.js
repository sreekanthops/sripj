const router  = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { signAdminToken, verifyAdminToken, hashPassword, checkPassword } = require('../auth');

// ── SEED DEFAULT ADMIN (runs once on startup) ─────────────────────────────────
;(async () => {
  const exists = db.prepare('SELECT id FROM admins WHERE username = ?').get('admin');
  if (!exists) {
    const hash = await hashPassword('admin123');
    db.prepare('INSERT INTO admins (id, username, password_hash, email, created_at) VALUES (?,?,?,?,?)')
      .run(uuidv4(), 'admin', hash, 'sri.chityala501@gmail.com', new Date().toISOString());
    console.log('[admin] Default admin created → username: admin / password: admin123');
  }
})();

// ── POST /api/admin/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username.trim().toLowerCase());
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await checkPassword(password, admin.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signAdminToken(admin.id, admin.username);
  res.json({ token, username: admin.username, email: admin.email });
});

// ── POST /api/admin/change-password ──────────────────────────────────────────
router.post('/change-password', verifyAdminToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password min 6 characters' });
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.adminId);
  const ok = await checkPassword(currentPassword, admin.password_hash);
  if (!ok) return res.status(401).json({ error: 'Current password incorrect' });
  const hash = await hashPassword(newPassword);
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, admin.id);
  res.json({ ok: true });
});

// ── POST /api/admin/track-view ────────────────────────────────────────────────
// Called by the frontend to record a page view + session duration
router.post('/track-view', (req, res) => {
  const { userId, path, duration_s } = req.body;
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  const ua = (req.headers['user-agent'] || '').slice(0, 200);
  db.prepare('INSERT INTO page_views (id, user_id, path, ip, ua, duration_s, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(uuidv4(), userId || null, path || '/', ip, ua, Math.floor(duration_s) || 0, new Date().toISOString());
  res.json({ ok: true });
});

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', verifyAdminToken, (req, res) => {

  // totals
  const totalUsers    = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const totalNotes    = db.prepare('SELECT COUNT(*) as c FROM notes').get().c;
  const totalViews    = db.prepare('SELECT COALESCE(SUM(views),0) as c FROM notes').get().c;
  const totalReactions= db.prepare('SELECT COUNT(*) as c FROM note_reactions').get().c;
  const totalReplies  = db.prepare('SELECT COUNT(*) as c FROM replies').get().c;

  // avg time on site (seconds)
  const avgTime = db.prepare('SELECT COALESCE(AVG(duration_s),0) as v FROM page_views WHERE duration_s > 0').get().v;

  // daily active unique IPs / users — last 30 days
  const dailyActivity = db.prepare(`
    SELECT DATE(created_at) as day,
           COUNT(DISTINCT COALESCE(user_id, ip)) as uniq,
           COUNT(*) as hits
    FROM page_views
    WHERE created_at >= DATE('now','-30 days')
    GROUP BY day
    ORDER BY day ASC
  `).all();

  // weekly active — last 12 weeks
  const weeklyActivity = db.prepare(`
    SELECT strftime('%Y-W%W', created_at) as week,
           COUNT(DISTINCT COALESCE(user_id, ip)) as uniq,
           COUNT(*) as hits
    FROM page_views
    WHERE created_at >= DATE('now','-84 days')
    GROUP BY week
    ORDER BY week ASC
  `).all();

  // monthly active — last 12 months
  const monthlyActivity = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month,
           COUNT(DISTINCT COALESCE(user_id, ip)) as uniq,
           COUNT(*) as hits
    FROM page_views
    WHERE created_at >= DATE('now','-365 days')
    GROUP BY month
    ORDER BY month ASC
  `).all();

  // avg time per day — last 30 days
  const avgTimeDaily = db.prepare(`
    SELECT DATE(created_at) as day,
           ROUND(AVG(duration_s),1) as avg_s
    FROM page_views
    WHERE duration_s > 0 AND created_at >= DATE('now','-30 days')
    GROUP BY day
    ORDER BY day ASC
  `).all();

  // top reactions breakdown
  const topReactions = db.prepare(`
    SELECT emoji, COUNT(*) as c
    FROM note_reactions
    GROUP BY emoji
    ORDER BY c DESC
  `).all();

  // new users over last 30 days
  const newUsersDaily = db.prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as c
    FROM users
    WHERE created_at >= DATE('now','-30 days')
    GROUP BY day
    ORDER BY day ASC
  `).all();

  // all users list
  const users = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.created_at,
           COUNT(DISTINCT n.id) as note_count,
           COALESCE(SUM(n.views),0) as total_views
    FROM users u
    LEFT JOIN notes n ON n.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();

  // notes overview per user
  const notesPerUser = db.prepare(`
    SELECT u.username, COUNT(n.id) as c
    FROM users u
    LEFT JOIN notes n ON n.user_id = u.id
    GROUP BY u.id
    ORDER BY c DESC
    LIMIT 20
  `).all();

  // views per day last 30 days (notes views col)
  const noteViewsDaily = db.prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as pv_hits
    FROM page_views
    WHERE created_at >= DATE('now','-30 days')
    GROUP BY day
    ORDER BY day ASC
  `).all();

  res.json({
    totals: { totalUsers, totalNotes, totalViews, totalReactions, totalReplies, avgTime: Math.round(avgTime) },
    dailyActivity,
    weeklyActivity,
    monthlyActivity,
    avgTimeDaily,
    topReactions,
    newUsersDaily,
    users,
    notesPerUser,
    noteViewsDaily,
  });
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
router.delete('/users/:id', verifyAdminToken, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM notes WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
