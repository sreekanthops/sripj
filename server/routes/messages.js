const router  = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { verifyToken } = require('../auth');
const { emitToUser } = require('../ws');
const { moderateMessage } = require('../moderation');

// multer for chat media uploads
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname).toLowerCase()),
});
const CHAT_MEDIA_ALLOWED = [
  'image/jpeg','image/png','image/gif','image/webp',
  'audio/mpeg','audio/mp3','audio/mp4','audio/ogg','audio/wav','audio/webm','audio/aac','audio/x-m4a',
  'video/mp4','video/webm','video/ogg','video/quicktime',
];
const chatUpload = multer({
  storage: chatStorage,
  limits:  { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    if (CHAT_MEDIA_ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new Error('File type not allowed in chat'));
  },
});

function isMember(conversationId, userId) {
  return !!db.prepare(
    'SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?'
  ).get(conversationId, userId);
}

function buildMsg(r, senders) {
  return {
    id:             r.id,
    conversationId: r.conversation_id,
    senderId:       r.sender_id,
    senderUsername:    senders[r.sender_id]?.username    || '',
    senderDisplayName: senders[r.sender_id]?.displayName || '',
    senderAvatarUrl:   senders[r.sender_id]?.avatarUrl   || '',
    body:      r.is_deleted ? '' : r.body,
    mediaUrl:  r.is_deleted ? '' : (r.media_url  || ''),
    mediaType: r.is_deleted ? '' : (r.media_type || ''),
    isDeleted: !!r.is_deleted,
    editedAt:  r.edited_at || null,
    createdAt: r.created_at,
    readAt:    r.read_at,
  };
}

// GET /api/messages/:conversationId — paginated history
router.get('/:conversationId', verifyToken, (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.userId;
  if (!isMember(conversationId, userId))
    return res.status(403).json({ error: 'Not a member of this conversation' });

  const limit  = Math.min(100, parseInt(req.query.limit) || 50);
  const before = req.query.before;

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
  rows.reverse();

  const senderIds = [...new Set(rows.map(r => r.sender_id))];
  const senders   = {};
  senderIds.forEach(id => {
    const u = db.prepare('SELECT username, display_name, avatar_url FROM users WHERE id=?').get(id);
    if (u) senders[id] = { username: u.username, displayName: u.display_name, avatarUrl: u.avatar_url || '' };
  });

  res.json({ messages: rows.map(r => buildMsg(r, senders)) });
});

// POST /api/messages/:conversationId — send a text message
router.post('/:conversationId', verifyToken, async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.userId;
  if (!isMember(conversationId, userId))
    return res.status(403).json({ error: 'Not a member of this conversation' });

  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Message body required' });

  // AI moderation for text
  const { allowed, reason } = await moderateMessage(body);
  if (!allowed) {
    return res.status(422).json({ error: `Message blocked: ${reason}`, moderated: true });
  }

  const msgId = uuidv4();
  const now   = new Date().toISOString();
  db.prepare(
    'INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?,?,?,?,?)'
  ).run(msgId, conversationId, userId, body.trim(), now);

  const sender = db.prepare('SELECT username, display_name, avatar_url FROM users WHERE id=?').get(userId);
  const senders = { [userId]: { username: sender?.username || '', displayName: sender?.display_name || '', avatarUrl: sender?.avatar_url || '' } };
  const row     = db.prepare('SELECT * FROM messages WHERE id=?').get(msgId);
  const msgObj  = buildMsg(row, senders);

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

// POST /api/messages/:conversationId/media — upload an audio/video/image in chat
router.post('/:conversationId/media', verifyToken, (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.userId;
  if (!isMember(conversationId, userId))
    return res.status(403).json({ error: 'Not a member of this conversation' });

  chatUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const mime      = req.file.mimetype;
    const mediaUrl  = '/uploads/' + req.file.filename;
    const mediaType = mime.startsWith('image/') ? 'image'
                    : mime.startsWith('audio/') ? 'audio'
                    : mime.startsWith('video/') ? 'video' : 'file';

    const msgId = uuidv4();
    const now   = new Date().toISOString();
    const body  = req.body.caption?.trim() || '';

    db.prepare(
      'INSERT INTO messages (id, conversation_id, sender_id, body, media_url, media_type, created_at) VALUES (?,?,?,?,?,?,?)'
    ).run(msgId, conversationId, userId, body, mediaUrl, mediaType, now);

    const sender  = db.prepare('SELECT username, display_name, avatar_url FROM users WHERE id=?').get(userId);
    const senders = { [userId]: { username: sender?.username || '', displayName: sender?.display_name || '', avatarUrl: sender?.avatar_url || '' } };
    const row     = db.prepare('SELECT * FROM messages WHERE id=?').get(msgId);
    const msgObj  = buildMsg(row, senders);

    const recipients = db.prepare(
      'SELECT user_id FROM conversation_members WHERE conversation_id=? AND user_id!=?'
    ).all(conversationId, userId);
    recipients.forEach(r => emitToUser(r.user_id, 'new_message', { message: msgObj }));

    res.json({ message: msgObj });
  });
});

// PUT /api/messages/:conversationId/:messageId — edit own message
router.put('/:conversationId/:messageId', verifyToken, async (req, res) => {
  const { conversationId, messageId } = req.params;
  const userId = req.user.userId;
  if (!isMember(conversationId, userId))
    return res.status(403).json({ error: 'Not a member of this conversation' });

  const msg = db.prepare('SELECT * FROM messages WHERE id=? AND conversation_id=?').get(messageId, conversationId);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (msg.sender_id !== userId) return res.status(403).json({ error: 'Can only edit your own messages' });
  if (msg.is_deleted) return res.status(400).json({ error: 'Cannot edit a deleted message' });

  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Message body required' });

  const { allowed, reason } = await moderateMessage(body);
  if (!allowed) return res.status(422).json({ error: `Edit blocked: ${reason}`, moderated: true });

  const now = new Date().toISOString();
  db.prepare('UPDATE messages SET body=?, edited_at=? WHERE id=?').run(body.trim(), now, messageId);

  const row     = db.prepare('SELECT * FROM messages WHERE id=?').get(messageId);
  const sender  = db.prepare('SELECT username, display_name, avatar_url FROM users WHERE id=?').get(userId);
  const senders = { [userId]: { username: sender?.username || '', displayName: sender?.display_name || '', avatarUrl: sender?.avatar_url || '' } };
  const msgObj  = buildMsg(row, senders);

  // Push edit to the other participant
  const recipients = db.prepare(
    'SELECT user_id FROM conversation_members WHERE conversation_id=? AND user_id!=?'
  ).all(conversationId, userId);
  recipients.forEach(r => emitToUser(r.user_id, 'message_edited', { message: msgObj }));

  res.json({ message: msgObj });
});

// DELETE /api/messages/:conversationId/:messageId — soft-delete own message
router.delete('/:conversationId/:messageId', verifyToken, (req, res) => {
  const { conversationId, messageId } = req.params;
  const userId = req.user.userId;
  if (!isMember(conversationId, userId))
    return res.status(403).json({ error: 'Not a member of this conversation' });

  const msg = db.prepare('SELECT * FROM messages WHERE id=? AND conversation_id=?').get(messageId, conversationId);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (msg.sender_id !== userId) return res.status(403).json({ error: 'Can only delete your own messages' });

  db.prepare('UPDATE messages SET is_deleted=1 WHERE id=?').run(messageId);

  // Notify recipient the message was deleted
  const recipients = db.prepare(
    'SELECT user_id FROM conversation_members WHERE conversation_id=? AND user_id!=?'
  ).all(conversationId, userId);
  recipients.forEach(r => emitToUser(r.user_id, 'message_deleted', { messageId, conversationId }));

  res.json({ ok: true, messageId });
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
