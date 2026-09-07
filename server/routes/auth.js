const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { signToken, verifyToken, hashPassword, checkPassword } = require('../auth');

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username?.trim() || !password) return res.status(400).json({ error: 'Username and password required' });
  const uname = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (uname.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters (a-z, 0-9, _)' });
  if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(uname);
  if (exists) return res.status(409).json({ error: 'Username already taken' });
  const id   = uuidv4();
  const hash = await hashPassword(password);
  db.prepare('INSERT INTO users (id, username, display_name, bio, password_hash, created_at) VALUES (?,?,?,?,?,?)')
    .run(id, uname, displayName?.trim() || uname, '', hash, new Date().toISOString());
  const token = signToken(id, uname);
  res.status(201).json({ token, userId: id, username: uname, displayName: displayName?.trim() || uname });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username?.trim() || !password) return res.status(400).json({ error: 'Username and password required' });
  const uname = username.trim().toLowerCase();
  const user  = db.prepare('SELECT * FROM users WHERE username = ?').get(uname);
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });
  const ok = await checkPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid username or password' });
  const token = signToken(user.id, user.username);
  res.json({ token, userId: user.id, username: user.username, displayName: user.display_name });
});

// GET /api/auth/verify  — validate token
router.get('/verify', verifyToken, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, bio FROM users WHERE id = ?').get(req.user.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ userId: user.id, username: user.username, displayName: user.display_name, bio: user.bio });
});

// PUT /api/auth/profile  — update display name / bio
router.put('/profile', verifyToken, (req, res) => {
  const { displayName, bio } = req.body;
  db.prepare('UPDATE users SET display_name=?, bio=? WHERE id=?')
    .run(displayName?.trim() || '', bio?.trim() || '', req.user.userId);
  res.json({ ok: true });
});

module.exports = router;
