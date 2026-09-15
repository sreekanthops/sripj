const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { verifyToken, verifyAdminToken } = require('../auth');

// ── Wallet helper (shared with auth.js logic, kept local to avoid circular deps)
function getWallet(userId) {
  const row = db.prepare('SELECT balance FROM user_wallets WHERE user_id = ?').get(userId);
  return row ? row.balance : 0;
}

function creditWallet(userId, amountPaise, reason, reference = '') {
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT balance FROM user_wallets WHERE user_id = ?').get(userId);
  const oldBalance = existing ? existing.balance : 0;
  const newBalance = oldBalance + amountPaise;
  if (existing) {
    db.prepare('UPDATE user_wallets SET balance = ?, updated_at = ? WHERE user_id = ?').run(newBalance, now, userId);
  } else {
    db.prepare('INSERT INTO user_wallets (user_id, balance, updated_at) VALUES (?, ?, ?)').run(userId, newBalance, now);
  }
  db.prepare(`
    INSERT INTO wallet_transactions (id, user_id, type, amount, reason, reference, balance_after, created_at)
    VALUES (?, ?, 'credit', ?, ?, ?, ?, ?)
  `).run(uuidv4(), userId, amountPaise, reason, reference, newBalance, now);
  return newBalance;
}

// ── GET /api/wallet/me  — current user's wallet balance + recent transactions ──
router.get('/me', verifyToken, (req, res) => {
  const userId = req.user.userId;
  const balance = getWallet(userId);
  const transactions = db.prepare(`
    SELECT id, type, amount, reason, reference, balance_after, created_at
    FROM wallet_transactions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(userId);
  res.json({ balancePaise: balance, balanceInr: balance / 100, transactions });
});

// ── POST /api/wallet/admin/assign-bonus  — credit bonus to one user ──────────
//   Body: { userId, amountInr, note? }
router.post('/admin/assign-bonus', verifyAdminToken, (req, res) => {
  const { userId, amountInr, note } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  if (!amountInr || Number(amountInr) <= 0) return res.status(400).json({ error: 'amountInr must be > 0' });

  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const amountPaise = Math.round(Number(amountInr) * 100);
  const newBalance = creditWallet(userId, amountPaise, 'admin_bonus', note || 'Admin bonus');

  res.json({ ok: true, userId, username: user.username, amountPaise, newBalancePaise: newBalance, newBalanceInr: newBalance / 100 });
});

// ── POST /api/wallet/admin/assign-bonus-all  — credit bonus to every user ────
//   Body: { amountInr, note? }
router.post('/admin/assign-bonus-all', verifyAdminToken, (req, res) => {
  const { amountInr, note } = req.body;
  if (!amountInr || Number(amountInr) <= 0) return res.status(400).json({ error: 'amountInr must be > 0' });

  const amountPaise = Math.round(Number(amountInr) * 100);
  const users = db.prepare('SELECT id FROM users').all();
  const now = new Date().toISOString();

  let credited = 0;
  const credit = db.transaction(() => {
    for (const u of users) {
      const existing = db.prepare('SELECT balance FROM user_wallets WHERE user_id = ?').get(u.id);
      const oldBalance = existing ? existing.balance : 0;
      const newBalance = oldBalance + amountPaise;
      if (existing) {
        db.prepare('UPDATE user_wallets SET balance = ?, updated_at = ? WHERE user_id = ?').run(newBalance, now, u.id);
      } else {
        db.prepare('INSERT INTO user_wallets (user_id, balance, updated_at) VALUES (?, ?, ?)').run(u.id, newBalance, now);
      }
      db.prepare(`
        INSERT INTO wallet_transactions (id, user_id, type, amount, reason, reference, balance_after, created_at)
        VALUES (?, ?, 'credit', ?, 'admin_bonus', ?, ?, ?)
      `).run(uuidv4(), u.id, amountPaise, note || 'Admin bulk bonus', newBalance, now);
      credited++;
    }
  });
  credit();

  res.json({ ok: true, credited, amountPaise, amountInr: Number(amountInr) });
});

// ── GET /api/wallet/admin/list  — list all wallets with user info ─────────────
router.get('/admin/list', verifyAdminToken, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id as user_id, u.username, u.display_name,
           COALESCE(w.balance, 0) as balance_paise,
           w.updated_at
    FROM users u
    LEFT JOIN user_wallets w ON w.user_id = u.id
    ORDER BY u.created_at DESC
  `).all();

  res.json({ wallets: rows.map(r => ({
    userId:      r.user_id,
    username:    r.username,
    displayName: r.display_name || '',
    balancePaise: r.balance_paise,
    balanceInr:  r.balance_paise / 100,
    updatedAt:   r.updated_at || null,
  }))});
});

// ── GET /api/wallet/admin/transactions/:userId  — transaction history ─────────
router.get('/admin/transactions/:userId', verifyAdminToken, (req, res) => {
  const txns = db.prepare(`
    SELECT id, type, amount, reason, reference, balance_after, created_at
    FROM wallet_transactions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(req.params.userId);
  res.json({ transactions: txns });
});

module.exports = router;
module.exports.creditWallet = creditWallet;
module.exports.getWallet    = getWallet;
