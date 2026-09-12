const router  = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { verifyToken } = require('../auth');

// GET /api/conversations — list conversations for current user
router.get('/', verifyToken, (req, res) => {
  const userId = req.user.userId;

  const convos = db.prepare(`
    SELECT c.id, c.created_at
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id
    WHERE cm.user_id = ?
    ORDER BY c.created_at DESC
  `).all(userId);

  const result = convos.map(c => {
    // Other participant
    const other = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_url
      FROM conversation_members cm JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id=? AND cm.user_id!=?
      LIMIT 1
    `).get(c.id, userId);

    // Last message
    const last = db.prepare(
      'SELECT body, sender_id, created_at FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 1'
    ).get(c.id);

    // Unread count
    const unread = db.prepare(
      'SELECT COUNT(*) as c FROM messages WHERE conversation_id=? AND sender_id!=? AND read_at IS NULL'
    ).get(c.id, userId).c;

    return {
      id:          c.id,
      createdAt:   c.created_at,
      other:       other ? { id: other.id, username: other.username, displayName: other.display_name, avatarUrl: other.avatar_url || '' } : null,
      lastMessage: last ? { body: last.body, senderId: last.sender_id, createdAt: last.created_at } : null,
      unreadCount: unread,
    };
  });

  res.json({ conversations: result });
});

// POST /api/conversations — find or create 1:1 conversation
router.post('/', verifyToken, (req, res) => {
  const myId     = req.user.userId;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  if (userId === myId) return res.status(400).json({ error: 'Cannot start conversation with yourself' });

  const other = db.prepare('SELECT id FROM users WHERE id=?').get(userId);
  if (!other) return res.status(404).json({ error: 'User not found' });

  // Check for existing conversation between these two users
  const existing = db.prepare(`
    SELECT c.id FROM conversations c
    JOIN conversation_members a ON a.conversation_id=c.id AND a.user_id=?
    JOIN conversation_members b ON b.conversation_id=c.id AND b.user_id=?
  `).get(myId, userId);

  if (existing) return res.json({ conversationId: existing.id, existing: true });

  const convId = uuidv4();
  const now    = new Date().toISOString();
  db.prepare('INSERT INTO conversations (id, created_at) VALUES (?,?)').run(convId, now);
  db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?,?)').run(convId, myId);
  db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?,?)').run(convId, userId);

  res.json({ conversationId: convId, existing: false });
});

module.exports = router;
