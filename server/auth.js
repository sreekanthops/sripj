const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
require('dotenv').config();

const SECRET = process.env.JWT_SECRET || 'diary_secret_v2';

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

async function hashPassword(pwd)        { return bcrypt.hash(pwd, 10); }
async function checkPassword(pwd, hash) { return bcrypt.compare(pwd, hash); }

module.exports = { signToken, verifyToken, optionalAuth, hashPassword, checkPassword };
