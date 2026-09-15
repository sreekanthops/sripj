const router   = require('express').Router();
const crypto   = require('crypto');
const https    = require('https');
const { v4: uuidv4 } = require('uuid');
const db       = require('../db');
const { verifyToken, verifyAdminToken } = require('../auth');
const { getUserPlan } = require('../subscription');

// ── Wallet helpers ────────────────────────────────────────────────────────────
function getWalletBalance(userId) {
  const row = db.prepare('SELECT balance FROM user_wallets WHERE user_id = ?').get(userId);
  return row ? row.balance : 0;
}

function debitWallet(userId, amountPaise, reason, reference = '') {
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT balance FROM user_wallets WHERE user_id = ?').get(userId);
  const oldBalance = existing ? existing.balance : 0;
  const newBalance = Math.max(0, oldBalance - amountPaise);
  const actualDebit = oldBalance - newBalance; // may be less if wallet runs short
  if (existing) {
    db.prepare('UPDATE user_wallets SET balance = ?, updated_at = ? WHERE user_id = ?').run(newBalance, now, userId);
  } else {
    db.prepare('INSERT INTO user_wallets (user_id, balance, updated_at) VALUES (?, ?, ?)').run(userId, 0, now);
  }
  if (actualDebit > 0) {
    db.prepare(`
      INSERT INTO wallet_transactions (id, user_id, type, amount, reason, reference, balance_after, created_at)
      VALUES (?, ?, 'debit', ?, ?, ?, ?, ?)
    `).run(uuidv4(), userId, actualDebit, reason, reference, newBalance, now);
  }
  return { actualDebit, newBalance };
}

function activateSubscription(userId, planId) {
  const now = new Date().toISOString();
  let expiresAt = null;
  if (planId === 'monthly') {
    const d = new Date(); d.setDate(d.getDate() + 31); expiresAt = d.toISOString();
  } else if (planId === 'yearly') {
    const d = new Date(); d.setDate(d.getDate() + 366); expiresAt = d.toISOString();
  }
  const existing = db.prepare('SELECT id FROM user_subscriptions WHERE user_id = ?').get(userId);
  if (existing) {
    db.prepare(`UPDATE user_subscriptions SET plan_id=?, starts_at=?, expires_at=?, granted_by=NULL WHERE user_id=?`)
      .run(planId, now, expiresAt, userId);
  } else {
    db.prepare(`INSERT INTO user_subscriptions (id,user_id,plan_id,starts_at,expires_at,created_at) VALUES (?,?,?,?,?,?)`)
      .run(uuidv4(), userId, planId, now, expiresAt, now);
  }
  return getUserPlan(userId);
}

// ── Geo-IP helper — map country code → region key ─────────────────────────────
const COUNTRY_TO_REGION = (() => {
  const map = {};
  // India
  ['IN'].forEach(c => { map[c] = 'IN'; });
  // UK
  ['GB'].forEach(c => { map[c] = 'UK'; });
  // Europe
  ['DE','FR','IT','ES','NL','BE','AT','CH','SE','NO','DK','FI','PL','PT','CZ','HU','RO','GR','IE','SK','SI','HR','BG','LT','LV','EE','CY','LU','MT'].forEach(c => { map[c] = 'EU'; });
  // Australia / NZ
  ['AU','NZ'].forEach(c => { map[c] = 'AU'; });
  // US / Canada
  ['US','CA'].forEach(c => { map[c] = 'US'; });
  return map;
})();

function getRegionFromIp(ip) {
  return new Promise(resolve => {
    // Use ip-api.com free tier (no key, 1000 req/min)
    const cleanIp = (ip || '').replace(/^::ffff:/, '');
    if (!cleanIp || cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp.startsWith('192.168') || cleanIp.startsWith('10.')) {
      return resolve('IN'); // default to India for local dev
    }
    const req = https.get(`https://ip-api.com/json/${cleanIp}?fields=countryCode`, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try {
          const { countryCode } = JSON.parse(data);
          resolve(COUNTRY_TO_REGION[countryCode] || 'ROW');
        } catch { resolve('ROW'); }
      });
    });
    req.on('error', () => resolve('ROW'));
    req.setTimeout(3000, () => { req.destroy(); resolve('ROW'); });
  });
}

function getGeoPrices(region) {
  const rows = db.prepare(`SELECT plan_id, currency, symbol, amount FROM geo_pricing WHERE region = ?`).all(region);
  const result = {};
  rows.forEach(r => { result[r.plan_id] = { currency: r.currency, symbol: r.symbol, amount: r.amount }; });
  return result;
}

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

// ── POST /api/payments/create-order  — create Razorpay order (wallet-aware) ──
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
  const priceInr    = discountActive
    ? Math.round(plan.price_inr * (1 - plan.discount_pct / 100))
    : plan.price_inr;
  const fullAmountPaise = priceInr * 100;

  if (fullAmountPaise <= 0) return res.status(400).json({ error: 'Price not configured for this plan' });

  const userId = req.user.userId;

  // ── Wallet deduction ─────────────────────────────────────────────────────
  const walletBalance = getWalletBalance(userId);
  const walletDeduct  = Math.min(walletBalance, fullAmountPaise);
  const netAmountPaise = fullAmountPaise - walletDeduct;

  // ── Zero-payment: wallet covers everything — skip Razorpay entirely ───────
  if (netAmountPaise <= 0) {
    // Debit wallet
    debitWallet(userId, walletDeduct, 'payment', `wallet_cover_${planId}_${Date.now()}`);
    // Activate subscription immediately
    const activePlan = activateSubscription(userId, planId);
    // Log a zero-amount "order" for audit trail
    db.prepare(`
      INSERT INTO razorpay_orders (id, user_id, plan_id, amount_paise, currency, status, created_at, paid_at)
      VALUES (?, ?, ?, 0, 'INR', 'paid', ?, ?)
    `).run('wallet_' + uuidv4().replace(/-/g,'').slice(0,16), userId, planId, new Date().toISOString(), new Date().toISOString());

    return res.json({
      walletCovered: true,
      walletDeducted: walletDeduct,
      plan: activePlan,
      message: `Subscribed using wallet balance! No payment needed.`,
    });
  }

  // ── Partial or no wallet — create Razorpay order for the net amount ───────
  try {
    const rzp   = getRazorpayInstance();
    const order = await rzp.orders.create({
      amount:   netAmountPaise,
      currency: 'INR',
      receipt:  `diary_${userId.slice(0,8)}_${Date.now()}`,
      notes:    { planId, userId, walletDeducted: walletDeduct },
    });

    // Persist the order (store full amount + wallet deduction for reference)
    db.prepare(`
      INSERT INTO razorpay_orders (id, user_id, plan_id, amount_paise, currency, status, created_at)
      VALUES (?, ?, ?, ?, 'INR', 'created', ?)
    `).run(order.id, userId, planId, netAmountPaise, new Date().toISOString());

    const { keyId } = getRazorpayCreds();
    res.json({
      orderId:         order.id,
      amount:          netAmountPaise,
      currency:        'INR',
      keyId,
      planName:        plan.name,
      walletDeducted:  walletDeduct,
      originalAmount:  fullAmountPaise,
      walletBalance,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/payments/verify  — verify Razorpay signature + activate plan ───
router.post('/verify', verifyToken, (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId, walletDeducted } = req.body;
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

  const userId = req.user.userId;
  const plan   = db.prepare('SELECT id FROM subscription_plans WHERE id = ?').get(planId);
  if (!plan) return res.status(400).json({ error: 'Unknown plan' });

  // Debit wallet for the portion covered by wallet (walletDeducted is in paise)
  const walletPaise = Number(walletDeducted) || 0;
  if (walletPaise > 0) {
    debitWallet(userId, walletPaise, 'payment', razorpay_order_id);
  }

  // Activate subscription
  const activePlan = activateSubscription(userId, planId);
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

// ── GET /api/payments/public/settings  — read safe public settings (no auth) ──
// Only exposes whitelisted keys that are safe to show publicly.
const PUBLIC_SETTING_KEYS = ['instagram_url'];
router.get('/public/settings', (req, res) => {
  const settings = {};
  PUBLIC_SETTING_KEYS.forEach(k => {
    const row = db.prepare('SELECT value FROM app_settings WHERE key=?').get(k);
    if (row) settings[k] = row.value;
  });
  res.json({ settings });
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
  const allowed = ['razorpay_key_id', 'razorpay_key_secret', 'google_client_id', 'instagram_url'];
  const stmt = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `);
  const now = new Date().toISOString();
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      stmt.run(key, String(req.body[key]).trim(), now);
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

// ── GET /api/payments/geo-price  — detect visitor region, return local prices ──
router.get('/geo-price', async (req, res) => {
  // 1. Cloudflare sets cf-ipcountry header — free, instant, no API call needed
  const cfCountry = (req.headers['cf-ipcountry'] || '').trim().toUpperCase();
  // 2. Real visitor IP — works correctly now that trust proxy is enabled
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.ip || req.socket.remoteAddress || '';

  let region;
  if (cfCountry && cfCountry !== 'XX' && cfCountry !== 'T1') {
    // Cloudflare header available — use it directly, no ip-api call needed
    region = COUNTRY_TO_REGION[cfCountry] || 'ROW';
  } else {
    region = await getRegionFromIp(ip);
  }

  let prices = getGeoPrices(region);

  // If no geo rows for this region, fall back to ROW
  if (!Object.keys(prices).length) prices = getGeoPrices('ROW');

  // Final fallback: if geo_pricing table is empty, build INR prices from subscription_plans
  if (!Object.keys(prices).length) {
    const plans = db.prepare(`SELECT id, price_inr, discount_pct, discount_ends_at FROM subscription_plans WHERE id != 'free'`).all();
    const now = new Date();
    plans.forEach(p => {
      const discountActive = p.discount_pct > 0 && (!p.discount_ends_at || new Date(p.discount_ends_at) > now);
      const amount = discountActive ? Math.round(p.price_inr * (1 - p.discount_pct / 100)) : p.price_inr;
      prices[p.id] = { currency: 'INR', symbol: '₹', amount };
    });
  }

  res.json({ region, prices });
});

// ── GET /api/payments/admin/geo-pricing  — list all geo prices ───────────────
router.get('/admin/geo-pricing', verifyAdminToken, (req, res) => {
  const rows = db.prepare(`SELECT region, plan_id, currency, symbol, amount FROM geo_pricing ORDER BY region, plan_id`).all();
  res.json({ rows });
});

// ── PUT /api/payments/admin/geo-pricing  — upsert a region/plan price ────────
router.put('/admin/geo-pricing', verifyAdminToken, (req, res) => {
  const { region, plan_id, currency, symbol, amount } = req.body;
  if (!region || !plan_id || !currency || !symbol || amount == null)
    return res.status(400).json({ error: 'region, plan_id, currency, symbol, amount required' });
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO geo_pricing (id, region, plan_id, currency, symbol, amount, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(region, plan_id) DO UPDATE SET currency=excluded.currency, symbol=excluded.symbol, amount=excluded.amount, updated_at=excluded.updated_at
  `).run(uuidv4(), region, plan_id, currency, symbol, Number(amount), now);
  res.json({ ok: true });
});

module.exports = router;
