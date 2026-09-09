const router   = require('express').Router();
const crypto   = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db       = require('../db');
const { verifyToken, verifyAdminToken } = require('../auth');
const { getUserPlan } = require('../subscription');

// ── Helper: get live Razorpay credentials from app_settings ──────────────────
function getRazorpayCreds() {
  const keyId     = db.prepare(`SELECT value FROM app_settings WHERE key='razorpay_key_id'`).get()?.value || '';
  const keySecret = db.prepare(`SELECT value FROM app_settings WHERE key='razorpay_key_secret'`).get()?.value || '';
  return { keyId, keySecret };
}

function getRazorpayInstance() {
  const { keyId, keySecret } = getRazorpayCreds();
  if (!keyId || !keySecret) throw new Error('Razorpay credentials not configured. Please set them in the Admin → Payments page.');
  const Razorpay = require('razorpay');
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// ── GET /api/payments/config  — return public key_id for frontend ─────────────
router.get('/config', (req, res) => {
  const { keyId } = getRazorpayCreds();
  res.json({ keyId: keyId || null, configured: !!keyId });
});

// ── GET /api/payments/plans  — all plans with live pricing + discounts ─────────
router.get('/plans', (req, res) => {
  const plans = db.prepare(`
    SELECT id, name, price_usd, price_inr, notes_limit, uploads, canvas,
           description, discount_pct, discount_label, discount_ends_at
    FROM subscription_plans
    ORDER BY price_inr ASC
  `).all();

  const now = new Date();
  const enriched = plans.map(p => {
    // Check if discount is still active
    const discountActive = p.discount_pct > 0 &&
      (!p.discount_ends_at || new Date(p.discount_ends_at) > now);
    const effectivePriceInr = discountActive
      ? Math.round(p.price_inr * (1 - p.discount_pct / 100))
      : p.price_inr;
    return {
      ...p,
      discountActive,
      effectivePriceInr,
      effectivePricePaise: effectivePriceInr * 100,
    };
  });
  res.json({ plans: enriched });
});

// ── POST /api/payments/create-order  — create Razorpay order ─────────────────
router.post('/create-order', verifyToken, async (req, res) => {
  const { planId } = req.body;
  if (!planId || planId === 'free') return res.status(400).json({ error: 'Invalid planId' });

  const plan = db.prepare(`
    SELECT id, name, price_inr, discount_pct, discount_ends_at
    FROM subscription_plans WHERE id = ?
  `).get(planId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  // Effective price after discount
  const now = new Date();
  const discountActive = plan.discount_pct > 0 &&
    (!plan.discount_ends_at || new Date(plan.discount_ends_at) > now);
  const priceInr   = discountActive
    ? Math.round(plan.price_inr * (1 - plan.discount_pct / 100))
    : plan.price_inr;
  const amountPaise = priceInr * 100;

  if (amountPaise <= 0) return res.status(400).json({ error: 'Price not configured for this plan' });

  try {
    const rzp   = getRazorpayInstance();
    const order = await rzp.orders.create({
      amount:   amountPaise,
      currency: 'INR',
      receipt:  `diary_${req.user.userId.slice(0,8)}_${Date.now()}`,
      notes:    { planId, userId: req.user.userId },
    });

    // Persist the order
    db.prepare(`
      INSERT INTO razorpay_orders (id, user_id, plan_id, amount_paise, currency, status, created_at)
      VALUES (?, ?, ?, ?, 'INR', 'created', ?)
    `).run(order.id, req.user.userId, planId, amountPaise, new Date().toISOString());

    const { keyId } = getRazorpayCreds();
    res.json({ orderId: order.id, amount: amountPaise, currency: 'INR', keyId, planName: plan.name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/payments/verify  — verify Razorpay signature + activate plan ───
router.post('/verify', verifyToken, (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
    return res.status(400).json({ error: 'Missing payment fields' });

  const { keySecret } = getRazorpayCreds();
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expected !== razorpay_signature)
    return res.status(400).json({ error: 'Payment signature invalid' });

  // Mark order paid
  db.prepare(`
    UPDATE razorpay_orders SET status='paid', payment_id=?, paid_at=? WHERE id=?
  `).run(razorpay_payment_id, new Date().toISOString(), razorpay_order_id);

  // Activate subscription
  const userId = req.user.userId;
  const plan   = db.prepare('SELECT id FROM subscription_plans WHERE id = ?').get(planId);
  if (!plan) return res.status(400).json({ error: 'Unknown plan' });

  const now      = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM user_subscriptions WHERE user_id = ?').get(userId);

  // Expiry: monthly = 31 days, yearly = 366 days, lifetime = null
  let expiresAt = null;
  if (planId === 'monthly') {
    const d = new Date(); d.setDate(d.getDate() + 31); expiresAt = d.toISOString();
  } else if (planId === 'yearly') {
    const d = new Date(); d.setDate(d.getDate() + 366); expiresAt = d.toISOString();
  }

  if (existing) {
    db.prepare(`UPDATE user_subscriptions SET plan_id=?, starts_at=?, expires_at=?, granted_by=NULL WHERE user_id=?`)
      .run(planId, now, expiresAt, userId);
  } else {
    db.prepare(`INSERT INTO user_subscriptions (id,user_id,plan_id,starts_at,expires_at,created_at) VALUES (?,?,?,?,?,?)`)
      .run(uuidv4(), userId, planId, now, expiresAt, now);
  }

  const activePlan = getUserPlan(userId);
  res.json({ ok: true, plan: activePlan });
});

// ── GET /api/payments/admin/orders  — admin: list all orders ─────────────────
router.get('/admin/orders', verifyAdminToken, (req, res) => {
  const orders = db.prepare(`
    SELECT r.id, r.user_id, u.username, r.plan_id, r.amount_paise, r.currency,
           r.status, r.payment_id, r.created_at, r.paid_at
    FROM razorpay_orders r
    JOIN users u ON u.id = r.user_id
    ORDER BY r.created_at DESC
    LIMIT 200
  `).all();
  res.json({ orders });
});

// ── GET /api/payments/admin/settings  — get current settings ─────────────────
router.get('/admin/settings', verifyAdminToken, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  // Never expose secret in full — mask last chars
  if (settings.razorpay_key_secret) {
    settings.razorpay_key_secret_masked = settings.razorpay_key_secret.slice(0, 8) + '••••••••';
    delete settings.razorpay_key_secret;
  }
  res.json({ settings });
});

// ── POST /api/payments/admin/settings  — save settings ───────────────────────
router.post('/admin/settings', verifyAdminToken, (req, res) => {
  const allowed = ['razorpay_key_id', 'razorpay_key_secret'];
  const stmt = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `);
  const now = new Date().toISOString();
  for (const key of allowed) {
    if (req.body[key] !== undefined && req.body[key] !== '') {
      stmt.run(key, req.body[key].trim(), now);
    }
  }
  res.json({ ok: true });
});

// ── PUT /api/payments/admin/plans/:id  — update plan pricing + discount ───────
router.put('/admin/plans/:id', verifyAdminToken, (req, res) => {
  const { price_inr, price_usd, discount_pct, discount_label, discount_ends_at, name, description, notes_limit } = req.body;
  const plan = db.prepare('SELECT id FROM subscription_plans WHERE id = ?').get(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  db.prepare(`
    UPDATE subscription_plans SET
      name             = COALESCE(?, name),
      price_inr        = COALESCE(?, price_inr),
      price_usd        = COALESCE(?, price_usd),
      discount_pct     = COALESCE(?, discount_pct),
      discount_label   = COALESCE(?, discount_label),
      discount_ends_at = ?,
      description      = COALESCE(?, description),
      notes_limit      = COALESCE(?, notes_limit)
    WHERE id = ?
  `).run(
    name        ?? null,
    price_inr   != null ? Number(price_inr)   : null,
    price_usd   != null ? Number(price_usd)   : null,
    discount_pct!= null ? Number(discount_pct): null,
    discount_label ?? null,
    discount_ends_at || null,
    description ?? null,
    notes_limit != null ? Number(notes_limit) : null,
    req.params.id
  );
  res.json({ ok: true });
});

module.exports = router;
