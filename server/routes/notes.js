const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { verifyToken, optionalAuth } = require('../auth');

// ── helpers ────────────────────────────────────────────────────────────────────
function getReactorKey(req) {
  if (req.user?.userId) return 'u:' + req.user.userId;
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'guest';
  const ua = req.headers['user-agent'] || 'generic';
  return 'g:' + clientIp + ':' + ua.slice(0, 40);
}

function getNoteReactions(noteId, currentReactorKey) {
  const counts = db.prepare(`
    SELECT emoji, COUNT(*) as count
    FROM note_reactions
    WHERE note_id = ?
    GROUP BY emoji
    ORDER BY count DESC
  `).all(noteId);

  const userReacts = currentReactorKey ? db.prepare(`
    SELECT emoji
    FROM note_reactions
    WHERE note_id = ? AND reactor_key = ?
  `).all(noteId, currentReactorKey).map(r => r.emoji) : [];

  return {
    reactions: Object.fromEntries(counts.map(r => [r.emoji, r.count])),
    userReactions: userReacts,
  };
}

function getReplyReactions(replyId, currentReactorKey) {
  const counts = db.prepare(`
    SELECT emoji, COUNT(*) as count
    FROM reply_reactions
    WHERE reply_id = ?
    GROUP BY emoji
    ORDER BY count DESC
  `).all(replyId);

  const userReacts = currentReactorKey ? db.prepare(`
    SELECT emoji
    FROM reply_reactions
    WHERE reply_id = ? AND reactor_key = ?
  `).all(replyId, currentReactorKey).map(r => r.emoji) : [];

  return {
    reactions: Object.fromEntries(counts.map(r => [r.emoji, r.count])),
    userReactions: userReacts,
  };
}

function buildNote(row, req) {
  const reactorKey = req ? getReactorKey(req) : null;
  const { reactions, userReactions } = getNoteReactions(row.id, reactorKey);
  const replies = db.prepare('SELECT * FROM replies WHERE note_id = ? ORDER BY created_at ASC').all(row.id);
  const media   = db.prepare('SELECT id, filename, mimetype FROM media WHERE note_id = ? ORDER BY sort_order ASC').all(row.id);
  
  const repliesWithReactions = replies.map(r => {
    const rReactData = getReplyReactions(r.id, reactorKey);
    return {
      id: r.id,
      userId: r.user_id,
      name: r.name,
      text: r.text,
      createdAt: r.created_at,
      reactions: rReactData.reactions,
      userReactions: rReactData.userReactions,
    };
  });

  let tags = [];
  try { tags = JSON.parse(row.tags || '[]'); } catch { tags = []; }

  return {
    id:            row.id,
    userId:        row.user_id,
    title:         row.title,
    body:          row.body,
    font:          row.font,
    fontSize:      row.font_size,
    fontWeight:    row.font_weight,
    colorIdx:      row.color_idx,
    musicUrl:      row.music_url,
    tags:          tags,
    views:         row.views,
    createdAt:     row.created_at,
    editedAt:      row.edited_at,
    reactions:     reactions,
    userReactions: userReactions,
    replies:       repliesWithReactions,
    media:         media.map(m => ({ id: m.id, url: '/uploads/' + m.filename, mimetype: m.mimetype })),
  };
}

// GET /api/notes/user/:username  — public diary page for a user
router.get('/user/:username', optionalAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, bio FROM users WHERE username = ?').get(req.params.username.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { from, to } = req.query;
  let sql = 'SELECT * FROM notes WHERE user_id = ?';
  const params = [user.id];
  if (from) { sql += ' AND DATE(created_at) >= ?'; params.push(from); }
  if (to)   { sql += ' AND DATE(created_at) <= ?'; params.push(to); }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json({ user: { id: user.id, username: user.username, displayName: user.display_name, bio: user.bio }, notes: rows.map(r => buildNote(r, req)) });
});

// GET /api/notes  — get current user's notes (must be logged in)
router.get('/', verifyToken, (req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT * FROM notes WHERE user_id = ?';
  const params = [req.user.userId];
  if (from) { sql += ' AND DATE(created_at) >= ?'; params.push(from); }
  if (to)   { sql += ' AND DATE(created_at) <= ?'; params.push(to); }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(r => buildNote(r, req)));
});

// GET /api/notes/:id
router.get('/:id', optionalAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  // increment views only for non-owners
  if (!req.user || req.user.userId !== row.user_id) {
    db.prepare('UPDATE notes SET views = views + 1 WHERE id = ?').run(req.params.id);
    row.views += 1;
  }
  res.json(buildNote(row, req));
});

// POST /api/notes  (owner only)
router.post('/', verifyToken, (req, res) => {
  const { title, body, font, fontSize, fontWeight, colorIdx, musicUrl, tags } = req.body;
  if (!title && !body) return res.status(400).json({ error: 'Title or body required' });
  const id = uuidv4();
  const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);
  db.prepare(`
    INSERT INTO notes (id, user_id, title, body, font, font_size, font_weight, color_idx, music_url, tags, views, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(id, req.user.userId, title || '', body || '', font || 'Georgia,serif', fontSize || 14, fontWeight || 'normal',
         colorIdx ?? 0, musicUrl || '', tagsJson, new Date().toISOString());
  res.status(201).json(buildNote(db.prepare('SELECT * FROM notes WHERE id = ?').get(id), req));
});

// PUT /api/notes/:id  (owner only)
router.put('/:id', verifyToken, (req, res) => {
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });
  const { title, body, font, fontSize, fontWeight, colorIdx, musicUrl, tags } = req.body;
  const tagsJson = tags !== undefined ? JSON.stringify(Array.isArray(tags) ? tags : []) : row.tags;
  db.prepare(`
    UPDATE notes SET title=?, body=?, font=?, font_size=?, font_weight=?, color_idx=?, music_url=?, tags=?, edited_at=?
    WHERE id=?
  `).run(title ?? row.title, body ?? row.body, font ?? row.font,
         fontSize ?? row.font_size, fontWeight ?? row.font_weight,
         colorIdx ?? row.color_idx, musicUrl ?? row.music_url,
         tagsJson, new Date().toISOString(), req.params.id);
  res.json(buildNote(db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id), req));
});

// DELETE /api/notes/:id  (owner only)
router.delete('/:id', verifyToken, (req, res) => {
  const row = db.prepare('SELECT id, user_id FROM notes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/notes/:id/react  (toggle 1 reaction per user/guest per emoji)
router.post('/:id/react', optionalAuth, (req, res) => {
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'emoji required' });
  const note = db.prepare('SELECT id FROM notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Not found' });
  const reactorKey = getReactorKey(req);

  const existing = db.prepare('SELECT id FROM note_reactions WHERE note_id = ? AND emoji = ? AND reactor_key = ?')
                     .get(req.params.id, emoji, reactorKey);
  if (existing) {
    // toggle off / undo
    db.prepare('DELETE FROM note_reactions WHERE id = ?').run(existing.id);
  } else {
    // add reaction
    db.prepare('INSERT INTO note_reactions (id, note_id, emoji, reactor_key, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(uuidv4(), req.params.id, emoji, reactorKey, new Date().toISOString());
  }

  const { reactions, userReactions } = getNoteReactions(req.params.id, reactorKey);
  res.json({ reactions, userReactions, isReacted: !existing });
});

// POST /api/notes/:id/replies  (anyone — optionally logged in)
router.post('/:id/replies', optionalAuth, (req, res) => {
  const { name, text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });
  const note = db.prepare('SELECT id FROM notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Not found' });
  const id      = uuidv4();
  const userId  = req.user?.userId || null;
  const author  = req.user ? null : (name?.trim() || 'Anonymous');
  // if logged in, get their display name
  let displayName = author;
  if (userId) {
    const u = db.prepare('SELECT display_name, username FROM users WHERE id = ?').get(userId);
    displayName = u?.display_name || u?.username || 'User';
  }
  db.prepare('INSERT INTO replies (id, note_id, user_id, name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.params.id, userId, displayName, text.trim(), new Date().toISOString());
  res.status(201).json({ id, userId, name: displayName, text: text.trim(), createdAt: new Date().toISOString() });
});

// DELETE /api/notes/:noteId/replies/:replyId  (note owner OR reply author)
router.delete('/:noteId/replies/:replyId', verifyToken, (req, res) => {
  const reply = db.prepare('SELECT r.id, r.user_id, n.user_id as note_owner FROM replies r JOIN notes n ON n.id = r.note_id WHERE r.id = ? AND r.note_id = ?')
                  .get(req.params.replyId, req.params.noteId);
  if (!reply) return res.status(404).json({ error: 'Not found' });
  if (reply.note_owner !== req.user.userId && reply.user_id !== req.user.userId)
    return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM replies WHERE id = ?').run(req.params.replyId);
  res.json({ success: true });
});

// PUT /api/notes/:noteId/replies/:replyId  (note owner OR reply author)
router.put('/:noteId/replies/:replyId', verifyToken, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });
  const reply = db.prepare('SELECT r.id, r.user_id, n.user_id as note_owner FROM replies r JOIN notes n ON n.id = r.note_id WHERE r.id = ? AND r.note_id = ?')
                  .get(req.params.replyId, req.params.noteId);
  if (!reply) return res.status(404).json({ error: 'Not found' });
  if (reply.note_owner !== req.user.userId && reply.user_id !== req.user.userId)
    return res.status(403).json({ error: 'Forbidden' });
  db.prepare('UPDATE replies SET text = ? WHERE id = ?').run(text.trim(), req.params.replyId);
  res.json({ success: true });
});

// POST /api/notes/:noteId/replies/:replyId/react  (toggle 1 reaction per user/guest per emoji)
router.post('/:noteId/replies/:replyId/react', optionalAuth, (req, res) => {
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'emoji required' });
  const reply = db.prepare('SELECT id FROM replies WHERE id = ? AND note_id = ?').get(req.params.replyId, req.params.noteId);
  if (!reply) return res.status(404).json({ error: 'Reply not found' });
  const reactorKey = getReactorKey(req);

  const existing = db.prepare('SELECT id FROM reply_reactions WHERE reply_id = ? AND emoji = ? AND reactor_key = ?')
                     .get(req.params.replyId, emoji, reactorKey);
  if (existing) {
    // toggle off / undo
    db.prepare('DELETE FROM reply_reactions WHERE id = ?').run(existing.id);
  } else {
    // add reaction
    db.prepare('INSERT INTO reply_reactions (id, reply_id, emoji, reactor_key, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(uuidv4(), req.params.replyId, emoji, reactorKey, new Date().toISOString());
  }

  const { reactions, userReactions } = getReplyReactions(req.params.replyId, reactorKey);
  res.json({ reactions, userReactions, isReacted: !existing });
});

module.exports = router;
