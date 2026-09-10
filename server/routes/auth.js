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
  const user = db.prepare('SELECT id, username, display_name, bio, share_protected FROM users WHERE id = ?').get(req.user.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({
    userId: user.id,
    username: user.username,
    displayName: user.display_name,
    bio: user.bio,
    shareProtected: !!user.share_protected,
  });
});

// PUT /api/auth/profile  — update display name / bio
router.put('/profile', verifyToken, (req, res) => {
  const { displayName, bio } = req.body;
  db.prepare('UPDATE users SET display_name=?, bio=? WHERE id=?')
    .run(displayName?.trim() || '', bio?.trim() || '', req.user.userId);
  res.json({ ok: true });
});

// GET /api/auth/share-settings — get current user's share settings
router.get('/share-settings', verifyToken, (req, res) => {
  const user = db.prepare('SELECT share_protected, (share_password_hash != "") as has_password FROM users WHERE id = ?').get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    shareProtected: !!user.share_protected,
    hasPassword: !!user.has_password,
  });
});

// PUT /api/auth/share-settings — configure share protection & password
router.put('/share-settings', verifyToken, async (req, res) => {
  const { isProtected, password } = req.body;
  const user = db.prepare('SELECT id, share_password_hash FROM users WHERE id = ?').get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (isProtected) {
    let hash = user.share_password_hash;
    if (password) {
      if (password.length < 3) {
        return res.status(400).json({ error: 'Share password must be at least 3 characters' });
      }
      hash = await hashPassword(password);
    } else if (!hash) {
      return res.status(400).json({ error: 'Please provide a password for protected sharing' });
    }
    db.prepare('UPDATE users SET share_protected = 1, share_password_hash = ? WHERE id = ?')
      .run(hash, req.user.userId);
    return res.json({ ok: true, shareProtected: true });
  } else {
    // Disable password protection
    db.prepare('UPDATE users SET share_protected = 0 WHERE id = ?')
      .run(req.user.userId);
    return res.json({ ok: true, shareProtected: false });
  }
});

module.exports = router;
