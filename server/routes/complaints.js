const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { verifyToken, verifyAdminToken } = require('../auth');
const { emitToUser } = require('../ws');

// ── GET /api/complaints/admin-user — public: return the admin's user account ID ──
// Used by the chat panel to pin admin at top of conversation list
router.get('/admin-user', (req, res) => {
  // Look up the user account that has the same username as the admin account
  const adminRow = db.prepare('SELECT username FROM admins LIMIT 1').get();
  if (!adminRow) return res.json({ userId: null });
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(adminRow.username);
  res.json({ userId: user?.id || null });
});

// ── POST /api/complaints — user submits a complaint ──────────────────────────
router.post('/', verifyToken, (req, res) => {
  const userId = req.user.userId;
  const { subject, body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Complaint body required' });
  const id  = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO complaints (id, user_id, subject, body, status, created_at) VALUES (?,?,?,?,?,?)'
  ).run(id, userId, subject?.trim() || '', body.trim(), 'open', now);
  res.status(201).json({ ok: true, id });
});

// ── GET /api/complaints/mine — user's own complaints ─────────────────────────
router.get('/mine', verifyToken, (req, res) => {
  const rows = db.prepare(`
    SELECT id, subject, body, status, admin_reply, replied_at, created_at
    FROM complaints WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 50
  `).all(req.user.userId);
  res.json({ complaints: rows });
});

// ── GET /api/complaints/admin — list all complaints (admin) ──────────────────
router.get('/admin', verifyAdminToken, (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, u.username, u.display_name, u.avatar_url
    FROM complaints c
    JOIN users u ON u.id = c.user_id
    ORDER BY c.created_at DESC
    LIMIT 200
  `).all();
  res.json({ complaints: rows.map(r => ({
    id:         r.id,
    subject:    r.subject,
    body:       r.body,
    status:     r.status,
    adminReply: r.admin_reply,
    repliedAt:  r.replied_at,
    createdAt:  r.created_at,
    user: {
      id:          r.user_id,
      username:    r.username,
      displayName: r.display_name || r.username,
      avatarUrl:   r.avatar_url || '',
    },
  }))});
});

// ── POST /api/complaints/admin/:id/reply — admin replies ─────────────────────
router.post('/admin/:id/reply', verifyAdminToken, (req, res) => {
  const { reply } = req.body;
  if (!reply?.trim()) return res.status(400).json({ error: 'Reply text required' });
  const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(req.params.id);
  if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

  const now = new Date().toISOString();
  db.prepare(
    'UPDATE complaints SET admin_reply=?, replied_at=?, status=? WHERE id=?'
  ).run(reply.trim(), now, 'resolved', complaint.id);

  // Notify user
  const notifId = uuidv4();
  db.prepare(
    'INSERT INTO notifications (id, recipient_id, type, actor_id, created_at) VALUES (?,?,?,?,?)'
  ).run(notifId, complaint.user_id, 'complaint_reply', null, now);
  emitToUser(complaint.user_id, 'notification', {
    notification: { id: notifId, type: 'complaint_reply', createdAt: now }
  });

  res.json({ ok: true });
});

// ── PUT /api/complaints/admin/:id/status — toggle open/resolved ──────────────
router.put('/admin/:id/status', verifyAdminToken, (req, res) => {
  const { status } = req.body;
  if (!['open', 'resolved'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE complaints SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
