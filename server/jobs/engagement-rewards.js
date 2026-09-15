/**
 * Weekly Engagement Rewards Job
 * ─────────────────────────────
 * Runs every 7 days (via setInterval on startup).
 *
 * For each user with ≥1 public post:
 *   1. Count total reactions + comments (replies) on their public notes.
 *   2. Look up paid_engagement from wallet_engagement_ledger.
 *   3. new_engagement = total - paid_engagement
 *   4. Credit wallet based on tiers applied to new_engagement:
 *        5–9   new → ₹1
 *       10–19  new → ₹2
 *       20+    new → ₹5
 *      (tiers are additive: e.g. 25 new = ₹5, not stacked)
 *   5. Update paid_engagement to the new total.
 *
 * Only counts reactions/comments on PUBLIC notes.
 * Does NOT reset the counter — it's always cumulative ("pay once, never again
 * for already-rewarded engagement"). New rewards are only for net-new engagement.
 */

const db = require('../db');
const { creditWallet } = require('../routes/wallet');

const JOB_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Compute the INR reward for a given count of new engagement events.
 * Returns paise (100 paise = ₹1).
 */
function rewardPaise(newEngagement) {
  if (newEngagement >= 20) return 500;  // ₹5
  if (newEngagement >= 10) return 200;  // ₹2
  if (newEngagement >= 5)  return 100;  // ₹1
  return 0;
}

/**
 * Run the job once. Returns a summary object.
 * Can also be called manually (e.g. from admin API).
 */
function runEngagementRewards() {
  const now = new Date().toISOString();
  const summary = { processed: 0, credited: 0, totalPaise: 0, skipped: 0, details: [] };

  // Fetch all users who have at least one public post
  const users = db.prepare(`
    SELECT DISTINCT u.id, u.username
    FROM users u
    JOIN notes n ON n.user_id = u.id
    WHERE n.is_public = 1
  `).all();

  for (const user of users) {
    summary.processed++;

    // Total reactions on this user's public notes
    const reactionCount = db.prepare(`
      SELECT COUNT(*) as c
      FROM note_reactions nr
      JOIN notes n ON n.id = nr.note_id
      WHERE n.user_id = ? AND n.is_public = 1
    `).get(user.id).c;

    // Total comments (replies) on this user's public notes
    const replyCount = db.prepare(`
      SELECT COUNT(*) as c
      FROM replies r
      JOIN notes n ON n.id = r.note_id
      WHERE n.user_id = ? AND n.is_public = 1
    `).get(user.id).c;

    const totalEngagement = reactionCount + replyCount;

    // Look up previously paid-out amount
    const ledger = db.prepare(
      'SELECT paid_engagement FROM wallet_engagement_ledger WHERE user_id = ?'
    ).get(user.id);
    const paidSoFar = ledger ? ledger.paid_engagement : 0;

    const newEngagement = Math.max(0, totalEngagement - paidSoFar);

    if (newEngagement === 0) {
      summary.skipped++;
      continue;
    }

    const paise = rewardPaise(newEngagement);

    // Update ledger regardless of whether we pay (even if 1–4 new, record it)
    if (ledger) {
      db.prepare(
        'UPDATE wallet_engagement_ledger SET paid_engagement = ?, last_run_at = ? WHERE user_id = ?'
      ).run(totalEngagement, now, user.id);
    } else {
      db.prepare(
        'INSERT INTO wallet_engagement_ledger (user_id, paid_engagement, last_run_at) VALUES (?, ?, ?)'
      ).run(user.id, totalEngagement, now);
    }

    if (paise > 0) {
      try {
        creditWallet(
          user.id,
          paise,
          'engagement_reward',
          `week_${now.slice(0, 10)}_new${newEngagement}`
        );
        summary.credited++;
        summary.totalPaise += paise;
        summary.details.push({
          username:      user.username,
          totalEngagement,
          paidBefore:    paidSoFar,
          newEngagement,
          rewardInr:     paise / 100,
        });
      } catch (e) {
        console.error(`[engagement-rewards] wallet credit failed for ${user.username}:`, e.message);
      }
    } else {
      // 1–4 new engagement — ledger updated but no credit yet
      summary.details.push({
        username:      user.username,
        totalEngagement,
        paidBefore:    paidSoFar,
        newEngagement,
        rewardInr:     0,
        note:          'Below threshold (need ≥5 new)',
      });
    }
  }

  console.log(
    `[engagement-rewards] run complete — ${summary.credited}/${summary.processed} users credited,` +
    ` ₹${(summary.totalPaise / 100).toFixed(2)} total`
  );
  return summary;
}

/**
 * Start the recurring weekly timer.
 * Called once from server/index.js.
 */
function startEngagementRewardsJob() {
  // Run once on startup (after a short delay so DB is fully ready)
  setTimeout(() => {
    console.log('[engagement-rewards] Running startup pass…');
    runEngagementRewards();
  }, 30_000); // 30 s after boot

  // Then every 7 days
  setInterval(() => {
    console.log('[engagement-rewards] Weekly run triggered');
    runEngagementRewards();
  }, JOB_INTERVAL_MS);

  console.log('[engagement-rewards] Weekly job scheduled (every 7 days)');
}

module.exports = { startEngagementRewardsJob, runEngagementRewards };
