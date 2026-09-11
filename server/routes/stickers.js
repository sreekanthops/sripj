const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { verifyToken, optionalAuth, checkPassword } = require('../auth');

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
router.get('/:username', optionalAuth, async (req, res) => {
  const user = db.prepare('SELECT id, share_protected, share_password_hash FROM users WHERE username = ?')
                 .get(req.params.username.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found' });

  const isOwner = req.user && req.user.userId === user.id;
  if (user.share_protected && !isOwner) {
    const providedPass = req.headers['x-share-password'] || req.query.pass || '';
    let passMatch = false;
    if (providedPass && user.share_password_hash) {
      passMatch = await checkPassword(providedPass, user.share_password_hash);
    }
    if (!passMatch) {
      return res.status(403).json({ error: 'Password required' });
    }
  }

  const row = db.prepare('SELECT data FROM page_stickers WHERE user_id = ?').get(user.id);
  let parsed = null;
  try { parsed = JSON.parse(row?.data || '[]'); } catch {}
  
  if (Array.isArray(parsed)) {
    res.json({ stickers: parsed, drawings: [] });
  } else if (parsed && typeof parsed === 'object') {
    res.json({ stickers: parsed.stickers || [], drawings: parsed.drawings || [] });
  } else {
    res.json({ stickers: [], drawings: [] });
  }
});

// PUT /api/stickers  — save current user's sticker & drawings canvas layout
router.put('/', verifyToken, (req, res) => {
  const { stickers, drawings } = req.body;
  const safeStickers = Array.isArray(stickers) ? stickers.map(s => {
    const d = { id: s.id, type: s.type, x: s.x, y: s.y, w: s.w, rot: s.rot, z: s.z };
    if (s.type === 'img')  d.src = s.src;
    if (s.type === 'text') { d.text = s.text; d.fontSize = s.fontSize; d.bold = s.bold; d.color = s.color; }
    return d;
  }) : [];
  
  const payload = {
    stickers: safeStickers,
    drawings: Array.isArray(drawings) ? drawings : []
  };

  const data = JSON.stringify(payload);
  db.prepare(`
    INSERT INTO page_stickers (user_id, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(req.user.userId, data, new Date().toISOString());
  res.json({ ok: true });
});

module.exports = router;
