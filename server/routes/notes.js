const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { verifyToken, optionalAuth } = require('../auth');

// ── helpers ────────────────────────────────────────────────────────────────────
function buildNote(row) {
  const reactions = db.prepare('SELECT emoji, count FROM reactions WHERE note_id = ? ORDER BY count DESC').all(row.id);
  const replies   = db.prepare('SELECT * FROM replies WHERE note_id = ? ORDER BY created_at ASC').all(row.id);
  const media     = db.prepare('SELECT id, filename, mimetype FROM media WHERE note_id = ? ORDER BY sort_order ASC').all(row.id);
  return {
    id:         row.id,
    title:      row.title,
    body:       row.body,
    font:       row.font,
    fontSize:   row.font_size,
    fontWeight: row.font_weight,
    colorIdx:   row.color_idx,
    musicUrl:   row.music_url,
    views:      row.views,
    createdAt:  row.created_at,
    editedAt:   row.edited_at,
    reactions:  Object.fromEntries(reactions.map(r => [r.emoji, r.count])),
    replies:    replies.map(r => ({ id: r.id, name: r.name, text: r.text, createdAt: r.created_at })),
    media:      media.map(m => ({ id: m.id, url: '/uploads/' + m.filename, mimetype: m.mimetype })),
  };
}

// GET /api/notes  (optional date range filter)
router.get('/', optionalAuth, (req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT * FROM notes';
  const params = [];
  if (from || to) {
    sql += ' WHERE 1=1';
    if (from) { sql += ' AND DATE(created_at) >= ?'; params.push(from); }
    if (to)   { sql += ' AND DATE(created_at) <= ?'; params.push(to); }
  }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(buildNote));
});

// GET /api/notes/:id
router.get('/:id', optionalAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  // increment views
  db.prepare('UPDATE notes SET views = views + 1 WHERE id = ?').run(req.params.id);
  row.views += 1;
  res.json(buildNote(row));
});

// POST /api/notes  (admin only)
router.post('/', verifyToken, (req, res) => {
  const { title, body, font, fontSize, fontWeight, colorIdx, musicUrl } = req.body;
  if (!title && !body) return res.status(400).json({ error: 'Title or body required' });
  const id = uuidv4();
  db.prepare(`
    INSERT INTO notes (id, title, body, font, font_size, font_weight, color_idx, music_url, views, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(id, title || '', body || '', font || 'Georgia,serif', fontSize || 14, fontWeight || 'normal',
         colorIdx ?? 0, musicUrl || '', new Date().toISOString());
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  res.status(201).json(buildNote(row));
});

// PUT /api/notes/:id  (admin only)
router.put('/:id', verifyToken, (req, res) => {
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { title, body, font, fontSize, fontWeight, colorIdx, musicUrl } = req.body;
  db.prepare(`
    UPDATE notes SET title=?, body=?, font=?, font_size=?, font_weight=?, color_idx=?, music_url=?, edited_at=?
    WHERE id=?
  `).run(title ?? row.title, body ?? row.body, font ?? row.font,
         fontSize ?? row.font_size, fontWeight ?? row.font_weight,
         colorIdx ?? row.color_idx, musicUrl ?? row.music_url,
         new Date().toISOString(), req.params.id);
  res.json(buildNote(db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id)));
});

// DELETE /api/notes/:id  (admin only)
router.delete('/:id', verifyToken, (req, res) => {
  const row = db.prepare('SELECT id FROM notes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/notes/:id/react
router.post('/:id/react', (req, res) => {
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'emoji required' });
  const note = db.prepare('SELECT id FROM notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Not found' });
  db.prepare(`
    INSERT INTO reactions (id, note_id, emoji, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(note_id, emoji) DO UPDATE SET count = count + 1
  `).run(uuidv4(), req.params.id, emoji);
  const reactions = db.prepare('SELECT emoji, count FROM reactions WHERE note_id = ? ORDER BY count DESC').all(req.params.id);
  res.json(Object.fromEntries(reactions.map(r => [r.emoji, r.count])));
});

// POST /api/notes/:id/replies
router.post('/:id/replies', (req, res) => {
  const { name, text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });
  const note = db.prepare('SELECT id FROM notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Not found' });
  const id = uuidv4();
  db.prepare('INSERT INTO replies (id, note_id, name, text, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.params.id, name?.trim() || 'Anonymous', text.trim(), new Date().toISOString());
  res.status(201).json({ id, name: name?.trim() || 'Anonymous', text: text.trim(), createdAt: new Date().toISOString() });
});

// DELETE /api/notes/:noteId/replies/:replyId  (admin only)
router.delete('/:noteId/replies/:replyId', verifyToken, (req, res) => {
  db.prepare('DELETE FROM replies WHERE id = ? AND note_id = ?').run(req.params.replyId, req.params.noteId);
  res.json({ success: true });
});

// PUT /api/notes/:noteId/replies/:replyId  (admin only)
router.put('/:noteId/replies/:replyId', verifyToken, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });
  const row = db.prepare('SELECT id FROM replies WHERE id = ? AND note_id = ?').get(req.params.replyId, req.params.noteId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE replies SET text = ? WHERE id = ?').run(text.trim(), req.params.replyId);
  res.json({ success: true });
});

module.exports = router;
