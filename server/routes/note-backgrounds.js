const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { verifyAdminToken, verifyToken } = require('../auth');

const BG_DIR = path.join(__dirname, '..', '..', 'public', 'note-backgrounds');
fs.mkdirSync(BG_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, BG_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, uuidv4() + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  },
});

// GET /api/note-backgrounds  — public: all users can see the library
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT id, filename, label, sort_order, created_at FROM note_backgrounds ORDER BY sort_order ASC, created_at DESC'
  ).all();
  res.json({ backgrounds: rows.map(r => ({
    id: r.id, filename: r.filename, label: r.label,
    url: '/note-backgrounds/' + r.filename, sortOrder: r.sort_order, createdAt: r.created_at,
  }))});
});

// POST /api/note-backgrounds  — admin only: upload images
router.post('/', verifyAdminToken, upload.array('files', 50), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0) as m FROM note_backgrounds').get().m;
  const stmt = db.prepare('INSERT INTO note_backgrounds (id, filename, label, sort_order, created_at) VALUES (?,?,?,?,?)');
  const inserted = [];
  req.files.forEach((f, i) => {
    const id = uuidv4();
    const label = (Array.isArray(req.body.labels) ? req.body.labels[i] : req.body.labels) ||
                  path.basename(f.originalname, path.extname(f.originalname));
    stmt.run(id, f.filename, label, maxOrder + i + 1, new Date().toISOString());
    inserted.push({ id, filename: f.filename, label, url: '/note-backgrounds/' + f.filename });
  });
  res.status(201).json({ backgrounds: inserted });
});

// PATCH /api/note-backgrounds/:id  — admin: update label
router.patch('/:id', verifyAdminToken, (req, res) => {
  const row = db.prepare('SELECT id FROM note_backgrounds WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE note_backgrounds SET label = ? WHERE id = ?')
    .run((req.body.label || '').trim(), req.params.id);
  res.json({ ok: true });
});

// DELETE /api/note-backgrounds/:id  — admin only
router.delete('/:id', verifyAdminToken, (req, res) => {
  const row = db.prepare('SELECT id, filename FROM note_backgrounds WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  fs.unlink(path.join(BG_DIR, row.filename), () => {});
  db.prepare('DELETE FROM note_backgrounds WHERE id = ?').run(row.id);
  // If this was the admin global default, clear it
  db.prepare(`UPDATE app_settings SET value='', updated_at=? WHERE key='default_note_bg_id'`)
    .run(new Date().toISOString());
  res.json({ ok: true });
});

// ── GET /api/note-backgrounds/defaults  — returns admin global default + user's own ──
// Must be defined BEFORE /:id to avoid route conflict
router.get('/defaults', verifyToken, (req, res) => {
  const adminDefault = db.prepare(`SELECT value FROM app_settings WHERE key='default_note_bg_id'`).get()?.value || '';
  const user = db.prepare('SELECT default_note_bg_id FROM users WHERE id=?').get(req.user.userId);
  // user.default_note_bg_id === null  → user never set own → use admin default
  // user.default_note_bg_id === ''    → user explicitly chose "none"
  // user.default_note_bg_id === <id>  → user has their own default
  const userDefault = user?.default_note_bg_id;  // may be null or string
  res.json({ adminDefault, userDefault });
});

// ── PUT /api/note-backgrounds/defaults  — user sets their own default bg ─────
router.put('/defaults', verifyToken, (req, res) => {
  const { bgId } = req.body;  // bgId = '' to clear, or a valid note_backgrounds id
  // validate — must be '' or an existing bg id
  if (bgId && bgId !== '') {
    const exists = db.prepare('SELECT id FROM note_backgrounds WHERE id=?').get(bgId);
    if (!exists) return res.status(404).json({ error: 'Background not found' });
  }
  db.prepare('UPDATE users SET default_note_bg_id=? WHERE id=?')
    .run(bgId === '' ? '' : bgId, req.user.userId);
  res.json({ ok: true });
});

// ── GET /api/note-backgrounds/admin-default-get  — admin reads global default ─
router.get('/admin-default-get', verifyAdminToken, (req, res) => {
  const adminDefault = db.prepare(`SELECT value FROM app_settings WHERE key='default_note_bg_id'`).get()?.value || '';
  res.json({ adminDefault });
});

// ── PUT /api/note-backgrounds/admin-default  — admin sets global default bg ──
router.put('/admin-default', verifyAdminToken, (req, res) => {
  const { bgId } = req.body;  // bgId = '' to clear, or a valid id
  if (bgId && bgId !== '') {
    const exists = db.prepare('SELECT id FROM note_backgrounds WHERE id=?').get(bgId);
    if (!exists) return res.status(404).json({ error: 'Background not found' });
  }
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES ('default_note_bg_id', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
    .run(bgId || '', now);
  res.json({ ok: true });
});

module.exports = router;
