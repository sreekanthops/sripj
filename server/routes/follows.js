const router  = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { verifyToken, optionalAuth } = require('../auth');
const { emitToUser } = require('../ws');

// POST /api/follows/:userId — follow a user
router.post('/:userId', verifyToken, (req, res) => {
  const followerId = req.user.userId;
  const followeeId = req.params.userId;
  if (followerId === followeeId)
    return res.status(400).json({ error: 'Cannot follow yourself' });

  const target = db.prepare('SELECT id FROM users WHERE id=?').get(followeeId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const exists = db.prepare(
    'SELECT id FROM follows WHERE follower_id=? AND followee_id=?'
  ).get(followerId, followeeId);
  if (exists) return res.json({ ok: true, alreadyFollowing: true });

  const id  = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO follows (id, follower_id, followee_id, created_at) VALUES (?,?,?,?)'
  ).run(id, followerId, followeeId, now);

  // Notification
  const notifId = uuidv4();
  db.prepare(
    'INSERT INTO notifications (id, recipient_id, type, actor_id, created_at) VALUES (?,?,?,?,?)'
  ).run(notifId, followeeId, 'follow', followerId, now);

  try {
    emitToUser(followeeId, 'notification', {
      notification: { id: notifId, type: 'follow', actorId: followerId, createdAt: now }
    });
  } catch {}

  res.json({ ok: true });
});

// DELETE /api/follows/:userId — unfollow
router.delete('/:userId', verifyToken, (req, res) => {
  const followerId = req.user.userId;
  const followeeId = req.params.userId;
  db.prepare('DELETE FROM follows WHERE follower_id=? AND followee_id=?').run(followerId, followeeId);
  // Remove unread follow notification for this pair
  db.prepare(
    "DELETE FROM notifications WHERE recipient_id=? AND actor_id=? AND type='follow' AND read=0"
  ).run(followeeId, followerId);
  res.json({ ok: true });
});

// GET /api/follows/:userId — counts + isFollowing
router.get('/:userId', optionalAuth, (req, res) => {
  const targetId  = req.params.userId;
  const viewerId  = req.user?.userId || null;

  const followerCount  = db.prepare('SELECT COUNT(*) as c FROM follows WHERE followee_id=?').get(targetId).c;
  const followingCount = db.prepare('SELECT COUNT(*) as c FROM follows WHERE follower_id=?').get(targetId).c;
  const isFollowing    = viewerId
    ? !!db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?').get(viewerId, targetId)
    : false;

  res.json({ followerCount, followingCount, isFollowing });
});

// GET /api/follows/:userId/followers
router.get('/:userId/followers', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_url
    FROM follows f JOIN users u ON u.id = f.follower_id
    WHERE f.followee_id=?
    ORDER BY f.created_at DESC
  `).all(req.params.userId);
  res.json({ users: rows.map(u => ({ id: u.id, username: u.username, displayName: u.display_name, avatarUrl: u.avatar_url || '' })) });
});

// GET /api/follows/:userId/following
router.get('/:userId/following', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_url
    FROM follows f JOIN users u ON u.id = f.followee_id
    WHERE f.follower_id=?
    ORDER BY f.created_at DESC
  `).all(req.params.userId);
  res.json({ users: rows.map(u => ({ id: u.id, username: u.username, displayName: u.display_name, avatarUrl: u.avatar_url || '' })) });
});

module.exports = router;
