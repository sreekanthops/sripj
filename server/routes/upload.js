const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { verifyToken } = require('../auth');

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
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new Error('File type not allowed. Use mp4/webm/jpg/png/gif/webp.'));
  },
});

// POST /api/upload/:noteId  — upload one or more media files to a note (admin)
router.post('/:noteId', verifyToken, upload.array('files', 20), (req, res) => {
  const note = db.prepare('SELECT id FROM notes WHERE id = ?').get(req.params.noteId);
  if (!note) {
    // clean up orphaned uploads
    req.files?.forEach(f => fs.unlink(f.path, () => {}));
    return res.status(404).json({ error: 'Note not found' });
  }

  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0) as m FROM media WHERE note_id=?')
                     .get(req.params.noteId).m;

  const inserted = [];
  const stmt = db.prepare(
    'INSERT INTO media (id,note_id,filename,mimetype,sort_order,created_at) VALUES (?,?,?,?,?,?)'
  );

  (req.files || []).forEach((f, i) => {
    const id = uuidv4();
    stmt.run(id, req.params.noteId, f.filename, f.mimetype, maxOrder + i + 1, new Date().toISOString());
    inserted.push({ id, filename: f.filename, mimetype: f.mimetype, url: '/uploads/' + f.filename });
  });

  res.status(201).json(inserted);
});

// DELETE /api/upload/:noteId/:mediaId  — remove a media file (admin)
router.delete('/:noteId/:mediaId', verifyToken, (req, res) => {
  const row = db.prepare('SELECT * FROM media WHERE id=? AND note_id=?')
                .get(req.params.mediaId, req.params.noteId);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const filePath = path.join(UPLOAD_DIR, row.filename);
  fs.unlink(filePath, () => {}); // ignore if already gone
  db.prepare('DELETE FROM media WHERE id=?').run(row.id);
  res.json({ success: true });
});

module.exports = router;
