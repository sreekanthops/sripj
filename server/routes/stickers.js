const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { verifyToken, optionalAuth } = require('../auth');

// Reuse the same uploads directory as note media
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, uuidv4() + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max per sticker image
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  },
});

// POST /api/stickers/upload  — upload a sticker image file, return its URL
router.post('/upload', verifyToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// GET /api/stickers/:username  — load stickers for a user's page (public)
router.get('/:username', optionalAuth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE username = ?')
                 .get(req.params.username.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found' });
  const row = db.prepare('SELECT data FROM page_stickers WHERE user_id = ?').get(user.id);
  let stickers = [];
  try { stickers = JSON.parse(row?.data || '[]'); } catch {}
  res.json({ stickers });
});

// PUT /api/stickers  — save current user's sticker layout (positions/sizes only, no image data)
router.put('/', verifyToken, (req, res) => {
  const { stickers } = req.body;
  if (!Array.isArray(stickers)) return res.status(400).json({ error: 'stickers array required' });
  // Strip any accidental base64 blobs — only store URL srcs
  const safe = stickers.map(s => ({
    id:  s.id,
    src: typeof s.src === 'string' && s.src.startsWith('/') ? s.src : s.src, // keep as-is
    x:   s.x, y: s.y, w: s.w, rot: s.rot,
  }));
  const data = JSON.stringify(safe);
  db.prepare(`
    INSERT INTO page_stickers (user_id, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(req.user.userId, data, new Date().toISOString());
  res.json({ ok: true });
});

module.exports = router;
