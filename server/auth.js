const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
require('dotenv').config();

const SECRET       = process.env.JWT_SECRET       || 'diary_secret_v2';
const ADMIN_SECRET = process.env.ADMIN_JWT_SECRET || 'admin_secret_v1';

function signToken(userId, username) {
  return jwt.sign({ userId, username }, SECRET, { expiresIn: '30d' });
}

function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(auth.slice(7), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function optionalAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try { req.user = jwt.verify(auth.slice(7), SECRET); } catch {}
  }
  next();
}

function signAdminToken(adminId, username) {
  return jwt.sign({ adminId, username, role: 'admin' }, ADMIN_SECRET, { expiresIn: '8h' });
}

function verifyAdminToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(auth.slice(7), ADMIN_SECRET);
    if (payload.role !== 'admin') throw new Error('Not admin');
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}

async function hashPassword(pwd)        { return bcrypt.hash(pwd, 10); }
async function checkPassword(pwd, hash) { return bcrypt.compare(pwd, hash); }

module.exports = { signToken, verifyToken, optionalAuth, signAdminToken, verifyAdminToken, hashPassword, checkPassword };
