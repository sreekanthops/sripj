const router = require('express').Router();
const db     = require('../db');
const { verifyToken } = require('../auth');

// GET /api/notifications — last 50 for current user
router.get('/', verifyToken, (req, res) => {
  const userId = req.user.userId;
  const rows = db.prepare(`
    SELECT n.*, u.username as actor_username, u.display_name as actor_display_name, u.avatar_url as actor_avatar_url,
           nt.title as note_title
    FROM notifications n
    LEFT JOIN users u  ON u.id  = n.actor_id
    LEFT JOIN notes nt ON nt.id = n.note_id
    WHERE n.recipient_id = ?
    ORDER BY n.created_at DESC
    LIMIT 50
  `).all(userId);

  const notifications = rows.map(r => ({
    id:        r.id,
    type:      r.type,
    read:      !!r.read,
    createdAt: r.created_at,
    noteId:    r.note_id    || null,
    noteTitle: r.note_title || null,
    messageId: r.message_id || null,
    actor: r.actor_id ? {
      id:          r.actor_id,
      username:    r.actor_username    || '',
      displayName: r.actor_display_name || '',
      avatarUrl:   r.actor_avatar_url  || '',
    } : null,
  }));

  res.json({ notifications });
});

// GET /api/notifications/unread-count
router.get('/unread-count', verifyToken, (req, res) => {
  const count = db.prepare(
    'SELECT COUNT(*) as c FROM notifications WHERE recipient_id=? AND read=0'
  ).get(req.user.userId).c;
  res.json({ count });
});

// PUT /api/notifications/read — mark all or single as read
router.put('/read', verifyToken, (req, res) => {
  const userId = req.user.userId;
  const { id } = req.body;
  if (id) {
    db.prepare('UPDATE notifications SET read=1 WHERE id=? AND recipient_id=?').run(id, userId);
  } else {
    db.prepare('UPDATE notifications SET read=1 WHERE recipient_id=?').run(userId);
  }
  res.json({ ok: true });
});

module.exports = router;
