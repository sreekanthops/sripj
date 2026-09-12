const router  = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { verifyToken } = require('../auth');
const { emitToUser } = require('../ws');

function isMember(conversationId, userId) {
  return !!db.prepare(
    'SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?'
  ).get(conversationId, userId);
}

// GET /api/messages/:conversationId — paginated history
router.get('/:conversationId', verifyToken, (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.userId;
  if (!isMember(conversationId, userId))
    return res.status(403).json({ error: 'Not a member of this conversation' });

  const limit  = Math.min(100, parseInt(req.query.limit) || 50);
  const before = req.query.before; // ISO timestamp cursor

  let rows;
  if (before) {
    rows = db.prepare(
      'SELECT * FROM messages WHERE conversation_id=? AND created_at<? ORDER BY created_at DESC LIMIT ?'
    ).all(conversationId, before, limit);
  } else {
    rows = db.prepare(
      'SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT ?'
    ).all(conversationId, limit);
  }

  rows.reverse(); // return oldest→newest

  const senderIds = [...new Set(rows.map(r => r.sender_id))];
  const senders   = {};
  senderIds.forEach(id => {
    const u = db.prepare('SELECT username, display_name, avatar_url FROM users WHERE id=?').get(id);
    if (u) senders[id] = { username: u.username, displayName: u.display_name, avatarUrl: u.avatar_url || '' };
  });

  const messages = rows.map(r => ({
    id:             r.id,
    conversationId: r.conversation_id,
    senderId:       r.sender_id,
    senderUsername:    senders[r.sender_id]?.username    || '',
    senderDisplayName: senders[r.sender_id]?.displayName || '',
    senderAvatarUrl:   senders[r.sender_id]?.avatarUrl   || '',
    body:           r.body,
    createdAt:      r.created_at,
    readAt:         r.read_at,
  }));

  res.json({ messages });
});

// POST /api/messages/:conversationId — send a message (REST fallback; WS is preferred)
router.post('/:conversationId', verifyToken, (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.userId;
  if (!isMember(conversationId, userId))
    return res.status(403).json({ error: 'Not a member of this conversation' });

  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Message body required' });

  const msgId = uuidv4();
  const now   = new Date().toISOString();
  db.prepare(
    'INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?,?,?,?,?)'
  ).run(msgId, conversationId, userId, body.trim(), now);

  const sender = db.prepare('SELECT username, display_name, avatar_url FROM users WHERE id=?').get(userId);
  const msgObj = {
    id: msgId, conversationId, senderId: userId,
    senderUsername:    sender?.username     || '',
    senderDisplayName: sender?.display_name || '',
    senderAvatarUrl:   sender?.avatar_url   || '',
    body: body.trim(), createdAt: now,
  };

  // Push to recipient via WS
  const recipients = db.prepare(
    'SELECT user_id FROM conversation_members WHERE conversation_id=? AND user_id!=?'
  ).all(conversationId, userId);

  recipients.forEach(r => {
    emitToUser(r.user_id, 'new_message', { message: msgObj });
    const notifId = uuidv4();
    db.prepare(
      'INSERT INTO notifications (id, recipient_id, type, actor_id, message_id, created_at) VALUES (?,?,?,?,?,?)'
    ).run(notifId, r.user_id, 'message', userId, msgId, now);
    emitToUser(r.user_id, 'notification', {
      notification: { id: notifId, type: 'message', actorId: userId, messageId: msgId, createdAt: now }
    });
  });

  res.json({ message: msgObj });
});

// PUT /api/messages/:conversationId/read — mark all as read
router.put('/:conversationId/read', verifyToken, (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.userId;
  if (!isMember(conversationId, userId))
    return res.status(403).json({ error: 'Not a member' });

  const now = new Date().toISOString();
  db.prepare(
    'UPDATE messages SET read_at=? WHERE conversation_id=? AND sender_id!=? AND read_at IS NULL'
  ).run(now, conversationId, userId);

  res.json({ ok: true });
});

module.exports = router;
