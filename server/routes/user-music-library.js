const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { verifyToken } = require('../auth');

const USER_MUSIC_DIR = path.join(__dirname, '..', '..', 'public', 'user-music');
fs.mkdirSync(USER_MUSIC_DIR, { recursive: true });

const ALLOWED_AUDIO = [
  'audio/mpeg','audio/mp3','audio/mp4','audio/ogg','audio/wav',
  'audio/webm','audio/aac','audio/flac','audio/x-m4a',
];
const AUDIO_MAX = 20 * 1024 * 1024;  // 20 MB per track for user library

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, USER_MUSIC_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp3';
    cb(null, uuidv4() + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: AUDIO_MAX },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_AUDIO.includes(file.mimetype) || file.mimetype.startsWith('audio/'))
      cb(null, true);
    else cb(new Error('Audio files only (mp3, ogg, wav, aac, flac)'));
  },
});

// GET /api/user-music  — list caller's tracks
router.get('/', verifyToken, (req, res) => {
  const rows = db.prepare(
    'SELECT id, filename, title, artist, created_at FROM user_music_library WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.userId);
  res.json({ tracks: rows.map(r => ({
    id: r.id,
    filename: r.filename,
    title: r.title,
    artist: r.artist,
    url: '/user-music/' + r.filename,
    createdAt: r.created_at,
    source: 'user',
  })) });
});

// POST /api/user-music  — upload track to own library
router.post('/', verifyToken, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'No audio file received' });

    const id     = uuidv4();
    const title  = (req.body.title || '').trim() ||
                   path.basename(req.file.originalname, path.extname(req.file.originalname));
    const artist = (req.body.artist || '').trim();
    db.prepare(
      'INSERT INTO user_music_library (id, user_id, filename, title, artist, created_at) VALUES (?,?,?,?,?,?)'
    ).run(id, req.user.userId, req.file.filename, title, artist, new Date().toISOString());

    res.status(201).json({
      id,
      filename: req.file.filename,
      title,
      artist,
      url: '/user-music/' + req.file.filename,
      source: 'user',
    });
  });
});

// PATCH /api/user-music/:id  — rename track (owner only)
router.patch('/:id', verifyToken, (req, res) => {
  const row = db.prepare('SELECT id, user_id FROM user_music_library WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('UPDATE user_music_library SET title = ?, artist = ? WHERE id = ?')
    .run((req.body.title || '').trim(), (req.body.artist || '').trim(), row.id);
  res.json({ ok: true });
});

// DELETE /api/user-music/:id  — remove track (owner only)
router.delete('/:id', verifyToken, (req, res) => {
  const row = db.prepare('SELECT id, user_id, filename FROM user_music_library WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });
  fs.unlink(path.join(USER_MUSIC_DIR, row.filename), () => {});
  db.prepare('DELETE FROM user_music_library WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

module.exports = router;
