/**
 * Subscription helpers — shared by all routes that need plan enforcement.
 *
 * Plans:
 *   free      — up to 5 entries, uploads allowed, no canvas stickers
 *   monthly   — unlimited entries, uploads, canvas stickers. Billed monthly.
 *   yearly    — unlimited entries, uploads, canvas stickers. Billed yearly (save 33%).
 *   lifetime  — unlimited everything, forever. One-time payment.
 */
const db = require('./db');

/**
 * Returns the active plan object for a user.
 * Falls back to the free plan if:
 *   • no subscription row exists
 *   • the subscription has an expiry that is in the past
 */
function getUserPlan(userId) {
  const row = db.prepare(`
    SELECT s.id as sub_id, s.plan_id, s.starts_at, s.expires_at, s.granted_by,
           p.name, p.price_usd, p.notes_limit, p.uploads, p.canvas, p.description
    FROM user_subscriptions s
    JOIN subscription_plans p ON p.id = s.plan_id
    WHERE s.user_id = ?
  `).get(userId);

  if (!row) return getFreePlan();

  // Expired?
  if (row.expires_at && new Date(row.expires_at) < new Date()) return getFreePlan();

  return {
    planId:       row.plan_id,
    name:         row.name,
    description:  row.description,
    priceUsd:     row.price_usd,
    notesLimit:   row.notes_limit,   // -1 = unlimited
    uploads:      !!row.uploads,
    canvas:       !!row.canvas,
    expiresAt:    row.expires_at || null,
    startsAt:     row.starts_at,
    grantedBy:    row.granted_by || null,
    isGranted:    !!row.granted_by,
  };
}

function getFreePlan() {
  const p = db.prepare(`SELECT * FROM subscription_plans WHERE id = 'free'`).get();
  return {
    planId:      'free',
    name:        p?.name || 'Free',
    description: p?.description || 'Up to 5 diary entries. Photos & videos allowed.',
    priceUsd:    0,
    notesLimit:  p?.notes_limit ?? 5,
    uploads:     p ? !!p.uploads : true,   // free plan allows uploads
    canvas:      false,                    // canvas stickers require Pro
    expiresAt:   null,
    startsAt:    null,
    grantedBy:   null,
    isGranted:   false,
  };
}

/**
 * Returns all plan definitions (for pricing page / upgrade UI).
 */
function getAllPlans() {
  return db.prepare('SELECT * FROM subscription_plans ORDER BY price_usd ASC').all();
}

module.exports = { getUserPlan, getFreePlan, getAllPlans };
