const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { verifyAdminToken } = require('../auth');

const GLOBAL_DIR = path.join(__dirname, '..', '..', 'public', 'global-images');
fs.mkdirSync(GLOBAL_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, GLOBAL_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uuidv4() + ext);
  },
});

const ALLOWED_IMG = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMG.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  },
});

// ── GET /api/global-images  — public: all users can fetch the library ─────────
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT id, filename, label, sort_order, created_at FROM global_images ORDER BY sort_order ASC, created_at DESC'
  ).all();
  const images = rows.map(r => ({
    id:        r.id,
    filename:  r.filename,
    label:     r.label,
    sortOrder: r.sort_order,
    url:       '/global-images/' + r.filename,
    createdAt: r.created_at,
  }));
  res.json({ images });
});

// ── POST /api/global-images  — admin only: upload one or many images ──────────
router.post('/', verifyAdminToken, upload.array('files', 50), (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded.' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0) as m FROM global_images').get().m;
  const stmt = db.prepare(
    'INSERT INTO global_images (id, filename, label, sort_order, created_at) VALUES (?,?,?,?,?)'
  );
  const inserted = [];
  req.files.forEach((f, i) => {
    const id    = uuidv4();
    const label = req.body.labels?.[i] || path.basename(f.originalname, path.extname(f.originalname));
    stmt.run(id, f.filename, label, maxOrder + i + 1, new Date().toISOString());
    inserted.push({ id, filename: f.filename, label, url: '/global-images/' + f.filename });
  });
  res.status(201).json({ images: inserted });
});

// ── PATCH /api/global-images/:id  — admin: update label ──────────────────────
router.patch('/:id', verifyAdminToken, (req, res) => {
  const row = db.prepare('SELECT id FROM global_images WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const label = (req.body.label || '').trim();
  db.prepare('UPDATE global_images SET label = ? WHERE id = ?').run(label, req.params.id);
  res.json({ ok: true });
});

// ── DELETE /api/global-images/:id  — admin only ───────────────────────────────
router.delete('/:id', verifyAdminToken, (req, res) => {
  const row = db.prepare('SELECT id, filename FROM global_images WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  fs.unlink(path.join(GLOBAL_DIR, row.filename), () => {});
  db.prepare('DELETE FROM global_images WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

module.exports = router;
