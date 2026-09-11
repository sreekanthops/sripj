const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { verifyAdminToken } = require('../auth');

const MUSIC_DIR = path.join(__dirname, '..', '..', 'public', 'music-library');
fs.mkdirSync(MUSIC_DIR, { recursive: true });

const ALLOWED_AUDIO = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/aac', 'audio/flac', 'audio/x-m4a'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MUSIC_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp3';
    cb(null, uuidv4() + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_AUDIO.includes(file.mimetype) || file.mimetype.startsWith('audio/')) cb(null, true);
    else cb(new Error('Audio files only (mp3, ogg, wav, aac)'));
  },
});

// GET /api/music-library  — public: all users can browse tracks
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT id, filename, title, artist, sort_order, created_at FROM music_library ORDER BY sort_order ASC, created_at DESC'
  ).all();
  res.json({ tracks: rows.map(r => ({
    id: r.id, filename: r.filename, title: r.title, artist: r.artist,
    url: '/music-library/' + r.filename, sortOrder: r.sort_order, createdAt: r.created_at,
  }))});
});

// POST /api/music-library  — admin only: upload tracks
router.post('/', verifyAdminToken, upload.array('files', 20), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0) as m FROM music_library').get().m;
  const stmt = db.prepare('INSERT INTO music_library (id, filename, title, artist, sort_order, created_at) VALUES (?,?,?,?,?,?)');
  const inserted = [];
  req.files.forEach((f, i) => {
    const id     = uuidv4();
    const title  = (Array.isArray(req.body.titles)  ? req.body.titles[i]  : req.body.titles)  ||
                   path.basename(f.originalname, path.extname(f.originalname));
    const artist = (Array.isArray(req.body.artists) ? req.body.artists[i] : req.body.artists) || '';
    stmt.run(id, f.filename, title, artist, maxOrder + i + 1, new Date().toISOString());
    inserted.push({ id, filename: f.filename, title, artist, url: '/music-library/' + f.filename });
  });
  res.status(201).json({ tracks: inserted });
});

// PATCH /api/music-library/:id  — admin: update title/artist
router.patch('/:id', verifyAdminToken, (req, res) => {
  const row = db.prepare('SELECT id FROM music_library WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE music_library SET title = ?, artist = ? WHERE id = ?')
    .run((req.body.title || '').trim(), (req.body.artist || '').trim(), req.params.id);
  res.json({ ok: true });
});

// DELETE /api/music-library/:id  — admin only
router.delete('/:id', verifyAdminToken, (req, res) => {
  const row = db.prepare('SELECT id, filename FROM music_library WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  fs.unlink(path.join(MUSIC_DIR, row.filename), () => {});
  db.prepare('DELETE FROM music_library WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

module.exports = router;
