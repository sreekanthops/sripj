const WebSocket = require('ws');
const jwt       = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db        = require('./db');

const SECRET = process.env.JWT_SECRET || 'diary_secret_v2';

// Map<userId, Set<WebSocket>> — supports multiple tabs per user
const clients = new Map();

function register(userId, ws) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(ws);
}

function unregister(userId, ws) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(ws);
  if (!set.size) clients.delete(userId);
}

function emitToUser(userId, type, payload) {
  const set = clients.get(userId);
  if (!set) return;
  const msg = JSON.stringify({ type, ...payload });
  set.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

function handleMessage(ws, userId, raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return; }

  if (data.type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong' }));
    return;
  }

  if (data.type === 'message') {
    const { conversationId, body } = data;
    if (!conversationId || !body?.trim()) return;

    // Verify sender is a member
    const member = db.prepare(
      'SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?'
    ).get(conversationId, userId);
    if (!member) return;

    // Find recipient(s)
    const recipients = db.prepare(
      'SELECT user_id FROM conversation_members WHERE conversation_id=? AND user_id!=?'
    ).all(conversationId, userId);

    const msgId    = uuidv4();
    const now      = new Date().toISOString();
    const bodyTrim = body.trim();

    db.prepare(
      'INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?,?,?,?,?)'
    ).run(msgId, conversationId, userId, bodyTrim, now);

    // Load sender info for delivery
    const sender = db.prepare('SELECT username, display_name, avatar_url FROM users WHERE id=?').get(userId);

    const msgObj = {
      id: msgId,
      conversationId,
      senderId: userId,
      senderUsername:    sender?.username    || '',
      senderDisplayName: sender?.display_name || '',
      senderAvatarUrl:   sender?.avatar_url  || '',
      body: bodyTrim,
      createdAt: now,
    };

    // Deliver to sender (acknowledgement)
    emitToUser(userId, 'message_sent', { message: msgObj });

    // Deliver to recipients + insert notifications
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
  }
}

function attachWS(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Auth: token passed as ?token=<jwt>
    let userId = null;
    try {
      const url    = new URL(req.url, 'ws://localhost');
      const token  = url.searchParams.get('token');
      if (token) {
        const payload = jwt.verify(token, SECRET);
        userId = payload.userId;
      }
    } catch {}

    if (!userId) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    register(userId, ws);

    ws.on('message', raw => handleMessage(ws, userId, raw.toString()));
    ws.on('close', () => unregister(userId, ws));
    ws.on('error', () => unregister(userId, ws));

    ws.send(JSON.stringify({ type: 'connected', userId }));
  });

  return wss;
}

module.exports = { attachWS, emitToUser };
