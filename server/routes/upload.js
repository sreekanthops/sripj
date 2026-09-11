const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { verifyToken } = require('../auth');
const { getUserPlan } = require('../subscription');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uuidv4() + ext);
  },
});

const ALLOWED = ['video/mp4','video/webm','video/ogg','video/quicktime',
                 'image/jpeg','image/png','image/gif','image/webp'];

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new Error('File type not allowed.'));
  },
});

// POST /api/upload/avatar  — upload user profile picture (DP)
router.post('/avatar', verifyToken, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No avatar image uploaded' });
  const avatarUrl = '/uploads/' + req.file.filename;
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, req.user.userId);
  res.json({ avatarUrl });
});

// POST /api/upload/:noteId  — upload media (note owner only)
router.post('/:noteId', verifyToken, upload.array('files', 20), (req, res) => {
  // ── Enforce plan upload permission ────────────────────────────────────────
  const plan = getUserPlan(req.user.userId);
  if (!plan.uploads) {
    req.files?.forEach(f => fs.unlink(f.path, () => {}));
    return res.status(403).json({
      error: 'Media uploads require a Pro plan. Upgrade to upload photos and videos.',
      limitReached: true,
      plan: plan.planId,
    });
  }

  const note = db.prepare('SELECT id, user_id FROM notes WHERE id = ?').get(req.params.noteId);
  if (!note) {
    req.files?.forEach(f => fs.unlink(f.path, () => {}));
    return res.status(404).json({ error: 'Note not found' });
  }
  if (note.user_id !== req.user.userId) {
    req.files?.forEach(f => fs.unlink(f.path, () => {}));
    return res.status(403).json({ error: 'Forbidden' });
  }
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0) as m FROM media WHERE note_id=?')
                     .get(req.params.noteId).m;
  const inserted = [];
  const stmt = db.prepare('INSERT INTO media (id,note_id,filename,mimetype,sort_order,created_at) VALUES (?,?,?,?,?,?)');
  (req.files || []).forEach((f, i) => {
    const id = uuidv4();
    stmt.run(id, req.params.noteId, f.filename, f.mimetype, maxOrder + i + 1, new Date().toISOString());
    inserted.push({ id, filename: f.filename, mimetype: f.mimetype, url: '/uploads/' + f.filename });
  });
  res.status(201).json(inserted);
});

// DELETE /api/upload/:noteId/:mediaId  — remove media (note owner only)
router.delete('/:noteId/:mediaId', verifyToken, (req, res) => {
  const row = db.prepare('SELECT m.*, n.user_id as note_owner FROM media m JOIN notes n ON n.id = m.note_id WHERE m.id=? AND m.note_id=?')
                .get(req.params.mediaId, req.params.noteId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.note_owner !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });
  fs.unlink(path.join(UPLOAD_DIR, row.filename), () => {});
  db.prepare('DELETE FROM media WHERE id=?').run(row.id);
  res.json({ success: true });
});

module.exports = router;
