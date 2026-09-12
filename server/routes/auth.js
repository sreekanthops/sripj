const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { signToken, verifyToken, hashPassword, checkPassword } = require('../auth');

function genShareToken() {
  return uuidv4().replace(/-/g, '').slice(0, 14);
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username?.trim() || !password) return res.status(400).json({ error: 'Username and password required' });
  const uname = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (uname.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters (a-z, 0-9, _)' });
  if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(uname);
  if (exists) return res.status(409).json({ error: 'Username already taken' });
  const id    = uuidv4();
  const hash  = await hashPassword(password);
  const token = genShareToken();
  db.prepare('INSERT INTO users (id, username, display_name, bio, password_hash, share_token, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, uname, displayName?.trim() || uname, '', hash, token, new Date().toISOString());
  const jwt = signToken(id, uname);
  res.status(201).json({ token: jwt, userId: id, username: uname, displayName: displayName?.trim() || uname, shareToken: token });
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
  res.json({
    token,
    userId:      user.id,
    username:    user.username,
    displayName: user.display_name,
    email:       user.email       || '',
    bio:         user.bio         || '',
    avatarUrl:   user.avatar_url  || '',
    shareToken:  user.share_token || '',
  });
});

// Hardcoded fallback Google Client ID from Google Cloud Console configuration
const DEFAULT_GOOGLE_CLIENT_ID = '226581903418-3ed1eqsl14qlou4nmk2m9sdf6il1mluu.apps.googleusercontent.com';

// GET /api/auth/config — public auth config (Google Client ID)
router.get('/config', (req, res) => {
  const googleClientId = db.prepare("SELECT value FROM app_settings WHERE key = 'google_client_id'").get()?.value
    || process.env.GOOGLE_CLIENT_ID
    || DEFAULT_GOOGLE_CLIENT_ID;
  res.json({ googleClientId: (googleClientId || '').trim() });
});

// POST /api/auth/google — sign in / sign up with Google access_token or ID Token credential
router.post('/google', async (req, res) => {
  const { credential, accessToken } = req.body;
  if (!credential && !accessToken) return res.status(400).json({ error: 'Google credential or access token required' });

  try {
    let googleId = null;
    let email = null;
    let name = null;
    let picture = null;

    if (accessToken) {
      // Fetch user profile from Google UserInfo endpoint with access_token
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!response.ok) {
        return res.status(401).json({ error: 'Failed to fetch Google profile with access token' });
      }
      const payload = await response.json();
      googleId = payload.sub;
      email = payload.email;
      name = payload.name;
      picture = payload.picture;
    } else if (credential) {
      // Verify token using Google tokeninfo API endpoint
      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      if (!response.ok) {
        return res.status(401).json({ error: 'Invalid Google token' });
      }
      const payload = await response.json();
      googleId = payload.sub;
      email = payload.email;
      name = payload.name;
      picture = payload.picture;
    }

    if (!googleId || !email) {
      return res.status(400).json({ error: 'Invalid Google profile payload' });
    }

    // Check if user exists by google_id or by email
    let user = db.prepare('SELECT * FROM users WHERE google_id = ? OR email = ?').get(googleId, email.toLowerCase());

    if (!user) {
      // Auto-generate a unique clean username from email or name
      let baseUname = (email.split('@')[0] || name || 'user')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 18);
      if (baseUname.length < 3) baseUname = 'user_' + baseUname;

      let uname = baseUname;
      let counter = 1;
      while (db.prepare('SELECT id FROM users WHERE username = ?').get(uname)) {
        uname = `${baseUname.slice(0, 14)}_${counter++}`;
      }

      const id = uuidv4();
      const fakePassHash = await hashPassword(uuidv4()); // Secure random placeholder password
      const displayName = name?.trim() || uname;
      const sToken = genShareToken();

      db.prepare(`
        INSERT INTO users (id, username, display_name, bio, password_hash, google_id, email, avatar_url, share_token, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, uname, displayName, '', fakePassHash, googleId, email.toLowerCase(), picture || '', sToken, new Date().toISOString());

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    } else {
      let updateSql = 'UPDATE users SET google_id = ?';
      const params = [googleId];
      if (picture && !user.avatar_url) {
        updateSql += ', avatar_url = ?';
        params.push(picture);
      }
      updateSql += ' WHERE id = ?';
      params.push(user.id);
      db.prepare(updateSql).run(...params);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }

    const token = signToken(user.id, user.username);
    res.json({
      token,
      userId: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
    });
  } catch (err) {
    console.error('[auth/google] error:', err);
    res.status(500).json({ error: 'Google authentication failed: ' + err.message });
  }
});

// ── inline migration: ensure all user columns exist (safe on any DB version) ─
function ensureUserColumns() {
  const cols = db.prepare('PRAGMA table_info(users)').all().map(r => r.name);
  const add = (col, def) => { if (!cols.includes(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`); };
  add('display_name',        'TEXT NOT NULL DEFAULT ""');
  add('bio',                 'TEXT NOT NULL DEFAULT ""');
  add('email',               'TEXT NOT NULL DEFAULT ""');
  add('avatar_url',          'TEXT NOT NULL DEFAULT ""');
  add('share_protected',     'INTEGER NOT NULL DEFAULT 0');
  add('share_password_hash', 'TEXT NOT NULL DEFAULT ""');
  add('share_token',         'TEXT NOT NULL DEFAULT ""');
  add('google_id',           'TEXT');
}
let _migrated = false;
function runMigrationOnce() { if (!_migrated) { ensureUserColumns(); _migrated = true; } }

// GET /api/auth/verify  — validate token
router.get('/verify', verifyToken, (req, res) => {
  runMigrationOnce();
  const user = db.prepare('SELECT id, username, display_name, email, bio, avatar_url, share_protected, share_token, (password_hash != "") as has_password FROM users WHERE id = ?').get(req.user.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  // ensure every user has a share_token (back-fill if missing)
  let shareToken = user.share_token || '';
  if (!shareToken) {
    const { v4: uuidv4 } = require('uuid');
    shareToken = uuidv4().replace(/-/g,'').slice(0,14);
    db.prepare('UPDATE users SET share_token = ? WHERE id = ?').run(shareToken, user.id);
  }
  res.json({
    userId: user.id,
    username: user.username,
    displayName: user.display_name,
    email: user.email || '',
    bio: user.bio || '',
    avatarUrl: user.avatar_url || '',
    shareProtected: !!user.share_protected,
    hasPassword: !!user.has_password,
    shareToken,
  });
});

// GET /api/auth/resolve/:token  — public: token → username (for /s/:token routing)
router.get('/resolve/:token', (req, res) => {
  const user = db.prepare('SELECT username FROM users WHERE share_token = ?').get(req.params.token);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ username: user.username });
});

// PUT /api/auth/profile  — update display name, bio, email, avatar_url
router.put('/profile', verifyToken, (req, res) => {
  runMigrationOnce();
  const { displayName, bio, email, avatarUrl } = req.body;
  db.prepare('UPDATE users SET display_name=?, bio=?, email=?, avatar_url=? WHERE id=?')
    .run(displayName?.trim() || '', bio?.trim() || '', email?.trim().toLowerCase() || '', avatarUrl || '', req.user.userId);
  res.json({ ok: true });
});

// POST /api/auth/change-password  — change user account password
router.post('/change-password', verifyToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }

  const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // If user already has a password, verify current password
  if (user.password_hash) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required' });
    }
    const ok = await checkPassword(currentPassword, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
  }

  const newHash = await hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.userId);
  res.json({ ok: true, message: 'Password updated successfully' });
});

// GET /api/auth/share-settings — get current user's share settings
router.get('/share-settings', verifyToken, (req, res) => {
  runMigrationOnce();
  const user = db.prepare('SELECT share_protected, (share_password_hash != "") as has_password FROM users WHERE id = ?').get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    shareProtected: !!user.share_protected,
    hasPassword: !!user.has_password,
  });
});

// PUT /api/auth/share-settings — configure share protection & password
router.put('/share-settings', verifyToken, async (req, res) => {
  runMigrationOnce();
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
