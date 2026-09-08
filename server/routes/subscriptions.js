const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { verifyToken, verifyAdminToken } = require('../auth');
const { getUserPlan, getAllPlans } = require('../subscription');

// ── GET /api/subscriptions/plans  — public plan catalogue ────────────────────
router.get('/plans', (req, res) => {
  res.json({ plans: getAllPlans() });
});

// ── GET /api/subscriptions/me  — current user's active plan ──────────────────
router.get('/me', verifyToken, (req, res) => {
  res.json(getUserPlan(req.user.userId));
});

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN ENDPOINTS  (all require verifyAdminToken)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/subscriptions/admin/list
//   Returns every user with their current subscription info.
router.get('/admin/list', verifyAdminToken, (req, res) => {
  const rows = db.prepare(`
    SELECT
      u.id          AS user_id,
      u.username,
      u.display_name,
      u.created_at  AS user_created_at,
      s.id          AS sub_id,
      s.plan_id,
      p.name        AS plan_name,
      p.price_usd,
      s.starts_at,
      s.expires_at,
      s.granted_by,
      s.created_at  AS sub_created_at
    FROM users u
    LEFT JOIN user_subscriptions s ON s.user_id = u.id
    LEFT JOIN subscription_plans p ON p.id = s.plan_id
    ORDER BY u.created_at DESC
  `).all();

  // Enrich with live plan (handles expiry fallback) and note count
  const result = rows.map(row => {
    const livePlan   = getUserPlan(row.user_id);
    const note_count = db.prepare('SELECT COUNT(*) as c FROM notes WHERE user_id = ?').get(row.user_id).c;
    return {
      userId:       row.user_id,
      username:     row.username,
      displayName:  row.display_name || '',
      userCreatedAt:row.user_created_at,
      noteCount:    note_count,
      // raw subscription row (may be null if never assigned)
      rawPlanId:    row.plan_id || null,
      rawPlanName:  row.plan_name || null,
      subId:        row.sub_id || null,
      startsAt:     row.starts_at || null,
      expiresAt:    row.expires_at || null,
      grantedBy:    row.granted_by || null,
      // effective plan after expiry check
      effectivePlan: livePlan.planId,
      effectiveName: livePlan.name,
      isExpired:    !!(row.expires_at && new Date(row.expires_at) < new Date()),
    };
  });

  res.json({ users: result });
});

// PUT /api/subscriptions/admin/assign
//   Assign or update a plan for a user.
//   Body: { userId, planId, expiresAt? }
//   - planId can be 'free' | 'monthly' | 'yearly' | 'lifetime'
//   - expiresAt: ISO string or null; ignored for 'lifetime'
router.put('/admin/assign', verifyAdminToken, (req, res) => {
  const { userId, planId, expiresAt } = req.body;
  if (!userId || !planId) return res.status(400).json({ error: 'userId and planId required' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const plan = db.prepare('SELECT id FROM subscription_plans WHERE id = ?').get(planId);
  if (!plan) return res.status(400).json({ error: `Unknown planId: ${planId}` });

  // Lifetime plan never expires
  const exp = (planId === 'lifetime') ? null : (expiresAt || null);

  const existing = db.prepare('SELECT id FROM user_subscriptions WHERE user_id = ?').get(userId);
  const now = new Date().toISOString();

  if (existing) {
    db.prepare(`
      UPDATE user_subscriptions
      SET plan_id = ?, expires_at = ?, granted_by = ?, starts_at = ?
      WHERE user_id = ?
    `).run(planId, exp, req.admin.adminId, now, userId);
  } else {
    db.prepare(`
      INSERT INTO user_subscriptions (id, user_id, plan_id, granted_by, starts_at, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), userId, planId, req.admin.adminId, now, exp, now);
  }

  res.json({ ok: true, planId, expiresAt: exp });
});

// POST /api/subscriptions/admin/grant-free
//   Grant a free (admin-courtesy) paid plan to a user for a fixed time period.
//   expiresAt is REQUIRED — admin must always set a time limit for free grants.
//   Body: { userId, planId, expiresAt }   planId must be 'monthly' | 'yearly' | 'lifetime'
router.post('/admin/grant-free', verifyAdminToken, (req, res) => {
  const { userId, planId, expiresAt } = req.body;
  if (!userId || !planId) return res.status(400).json({ error: 'userId and planId required' });
  if (!expiresAt) return res.status(400).json({ error: 'expiresAt is required for a free courtesy grant — you must set a time period.' });
  if (planId === 'free') return res.status(400).json({ error: 'Use planId monthly/yearly/lifetime to grant free access to a paid plan.' });

  const expDate = new Date(expiresAt);
  if (isNaN(expDate.getTime()) || expDate <= new Date()) {
    return res.status(400).json({ error: 'expiresAt must be a valid future date.' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const plan = db.prepare('SELECT id FROM subscription_plans WHERE id = ?').get(planId);
  if (!plan) return res.status(400).json({ error: `Unknown planId: ${planId}` });

  const existing = db.prepare('SELECT id FROM user_subscriptions WHERE user_id = ?').get(userId);
  const now = new Date().toISOString();

  if (existing) {
    db.prepare(`
      UPDATE user_subscriptions
      SET plan_id = ?, expires_at = ?, granted_by = ?, starts_at = ?
      WHERE user_id = ?
    `).run(planId, expiresAt, req.admin.adminId, now, userId);
  } else {
    db.prepare(`
      INSERT INTO user_subscriptions (id, user_id, plan_id, granted_by, starts_at, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), userId, planId, req.admin.adminId, now, expiresAt, now);
  }

  res.json({ ok: true, planId, expiresAt, grantedFree: true });
});

// DELETE /api/subscriptions/admin/revoke/:userId
//   Remove any custom subscription — user reverts to free.
router.delete('/admin/revoke/:userId', verifyAdminToken, (req, res) => {
  db.prepare('DELETE FROM user_subscriptions WHERE user_id = ?').run(req.params.userId);
  res.json({ ok: true });
});

// GET /api/subscriptions/admin/stats
//   Summary counts per plan (for admin overview).
router.get('/admin/stats', verifyAdminToken, (req, res) => {
  const planCounts = db.prepare(`
    SELECT
      COALESCE(p.name, 'Free') AS plan_name,
      COALESCE(s.plan_id, 'free') AS plan_id,
      COUNT(*) AS user_count
    FROM users u
    LEFT JOIN user_subscriptions s ON s.user_id = u.id
      AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))
    LEFT JOIN subscription_plans p ON p.id = s.plan_id
    GROUP BY COALESCE(s.plan_id, 'free')
    ORDER BY user_count DESC
  `).all();

  res.json({ planCounts });
});

module.exports = router;
