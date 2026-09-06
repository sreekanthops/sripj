const router = require('express').Router();
const { signToken, ADMIN_PWD } = require('../auth');

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PWD) {
    res.json({ token: signToken() });
  } else {
    res.status(401).json({ error: 'Wrong password' });
  }
});

module.exports = router;
