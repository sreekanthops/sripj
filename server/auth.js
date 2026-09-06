const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET = process.env.JWT_SECRET || 'diary_secret';
const ADMIN_PWD = process.env.ADMIN_PASSWORD || 'admin123';

function signToken() {
  return jwt.sign({ role: 'admin' }, SECRET, { expiresIn: '12h' });
}

function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.admin = jwt.verify(auth.slice(7), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function optionalAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try { req.admin = jwt.verify(auth.slice(7), SECRET); } catch {}
  }
  next();
}

module.exports = { signToken, verifyToken, optionalAuth, ADMIN_PWD };
