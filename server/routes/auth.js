const router = require('express').Router();
const { signToken, verifyToken, ADMIN_PWD } = require('../auth');

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PWD) {
    res.json({ token: signToken() });
  } else {
    res.status(401).json({ error: 'Wrong password' });
  }
});

// GET /api/auth/verify  — returns 200 if the Bearer token is valid, 401 otherwise
router.get('/verify', verifyToken, (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
