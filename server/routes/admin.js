const router  = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { signAdminToken, verifyAdminToken, hashPassword, checkPassword } = require('../auth');

// ── SEED DEFAULT ADMIN (runs once on startup) ─────────────────────────────────
;(async () => {
  const exists = db.prepare('SELECT id FROM admins WHERE username = ?').get('admin');
  if (!exists) {
    const hash = await hashPassword('admin123');
    db.prepare('INSERT INTO admins (id, username, password_hash, email, created_at) VALUES (?,?,?,?,?)')
      .run(uuidv4(), 'admin', hash, 'sri.chityala501@gmail.com', new Date().toISOString());
    console.log('[admin] Default admin created → username: admin / password: admin123');
  }
})();

// ── POST /api/admin/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username.trim().toLowerCase());
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await checkPassword(password, admin.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signAdminToken(admin.id, admin.username);
  res.json({ token, username: admin.username, email: admin.email });
});

// ── GET /api/admin/profile ────────────────────────────────────────────────────
router.get('/profile', verifyAdminToken, (req, res) => {
  const admin = db.prepare('SELECT id, username, email, phone FROM admins WHERE id = ?').get(req.admin.adminId);
  if (!admin) return res.status(404).json({ error: 'Admin not found' });
  res.json({ username: admin.username, email: admin.email || '', phone: admin.phone || '' });
});

// ── PUT /api/admin/profile ────────────────────────────────────────────────────
router.put('/profile', verifyAdminToken, (req, res) => {
  const { email, phone } = req.body;
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' });
  if (!phone?.trim()) return res.status(400).json({ error: 'Phone number is required' });
  const phoneClean = phone.trim().replace(/\s+/g, '');
  if (!/^\+?[0-9]{7,15}$/.test(phoneClean))
    return res.status(400).json({ error: 'Enter a valid phone number' });
  db.prepare('UPDATE admins SET email=?, phone=? WHERE id=?')
    .run(email.trim().toLowerCase(), phoneClean, req.admin.adminId);
  res.json({ ok: true });
});

// ── POST /api/admin/forgot-password ──────────────────────────────────────────
// Admin can reset via phone (OTP-less: just returns the current phone on record for manual verification)
// Since there's no email server set up for admin, we simply allow reset if they know their username + phone
router.post('/forgot-password', async (req, res) => {
  const { username, phone } = req.body;
  if (!username?.trim() || !phone?.trim()) return res.status(400).json({ error: 'Username and phone required' });
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username.trim().toLowerCase());
  if (!admin) return res.status(404).json({ error: 'Admin not found' });
  const phoneClean = phone.trim().replace(/\s+/g, '');
  if (!admin.phone || admin.phone !== phoneClean)
    return res.status(401).json({ error: 'Phone number does not match our records' });
  // Generate a temporary password
  const tempPass = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();
  const hash = await hashPassword(tempPass);
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, admin.id);
  res.json({ ok: true, tempPassword: tempPass, message: 'Temporary password set. Log in and change it immediately.' });
});

// ── POST /api/admin/change-password ──────────────────────────────────────────
router.post('/change-password', verifyAdminToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password min 6 characters' });
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.adminId);
  const ok = await checkPassword(currentPassword, admin.password_hash);
  if (!ok) return res.status(401).json({ error: 'Current password incorrect' });
  const hash = await hashPassword(newPassword);
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, admin.id);
  res.json({ ok: true });
});

// ── POST /api/admin/track-view ────────────────────────────────────────────────
// Called by the frontend to record a page view + session duration
router.post('/track-view', (req, res) => {
  const { userId, path, duration_s, referrer, utm_source, utm_medium, utm_campaign } = req.body;
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  const ua = (req.headers['user-agent'] || '').slice(0, 200);
  db.prepare(`INSERT INTO page_views
    (id, user_id, path, ip, ua, duration_s, referrer, utm_source, utm_medium, utm_campaign, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      uuidv4(), userId || null, path || '/', ip, ua,
      Math.floor(duration_s) || 0,
      (referrer || '').slice(0, 500),
      (utm_source   || '').slice(0, 100),
      (utm_medium   || '').slice(0, 100),
      (utm_campaign || '').slice(0, 100),
      new Date().toISOString()
    );
  res.json({ ok: true });
});

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', verifyAdminToken, (req, res) => {

  // totals
  const totalUsers    = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const totalNotes    = db.prepare('SELECT COUNT(*) as c FROM notes').get().c;
  const totalViews    = db.prepare('SELECT COALESCE(SUM(views),0) as c FROM notes').get().c;
  const totalReactions= db.prepare('SELECT COUNT(*) as c FROM note_reactions').get().c;
  const totalReplies  = db.prepare('SELECT COUNT(*) as c FROM replies').get().c;

  // avg time on site (seconds)
  const avgTime = db.prepare('SELECT COALESCE(AVG(duration_s),0) as v FROM page_views WHERE duration_s > 0').get().v;

  // daily active unique IPs / users — last 30 days
  const dailyActivity = db.prepare(`
    SELECT DATE(created_at) as day,
           COUNT(DISTINCT COALESCE(user_id, ip)) as uniq,
           COUNT(*) as hits
    FROM page_views
    WHERE created_at >= DATE('now','-30 days')
    GROUP BY day
    ORDER BY day ASC
  `).all();

  // weekly active — last 12 weeks
  const weeklyActivity = db.prepare(`
    SELECT strftime('%Y-W%W', created_at) as week,
           COUNT(DISTINCT COALESCE(user_id, ip)) as uniq,
           COUNT(*) as hits
    FROM page_views
    WHERE created_at >= DATE('now','-84 days')
    GROUP BY week
    ORDER BY week ASC
  `).all();

  // monthly active — last 12 months
  const monthlyActivity = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month,
           COUNT(DISTINCT COALESCE(user_id, ip)) as uniq,
           COUNT(*) as hits
    FROM page_views
    WHERE created_at >= DATE('now','-365 days')
    GROUP BY month
    ORDER BY month ASC
  `).all();

  // avg time per day — last 30 days
  const avgTimeDaily = db.prepare(`
    SELECT DATE(created_at) as day,
           ROUND(AVG(duration_s),1) as avg_s
    FROM page_views
    WHERE duration_s > 0 AND created_at >= DATE('now','-30 days')
    GROUP BY day
    ORDER BY day ASC
  `).all();

  // top reactions breakdown
  const topReactions = db.prepare(`
    SELECT emoji, COUNT(*) as c
    FROM note_reactions
    GROUP BY emoji
    ORDER BY c DESC
  `).all();

  // new users over last 30 days
  const newUsersDaily = db.prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as c
    FROM users
    WHERE created_at >= DATE('now','-30 days')
    GROUP BY day
    ORDER BY day ASC
  `).all();

  // all users list
  const users = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.email, u.phone, u.created_at,
           u.notes_limit_override,
           COUNT(DISTINCT n.id) as note_count,
           COALESCE(SUM(n.views),0) as total_views
    FROM users u
    LEFT JOIN notes n ON n.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();

  // notes overview per user
  const notesPerUser = db.prepare(`
    SELECT u.username, COUNT(n.id) as c
    FROM users u
    LEFT JOIN notes n ON n.user_id = u.id
    GROUP BY u.id
    ORDER BY c DESC
    LIMIT 20
  `).all();

  // views per day last 30 days (notes views col)
  const noteViewsDaily = db.prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as pv_hits
    FROM page_views
    WHERE created_at >= DATE('now','-30 days')
    GROUP BY day
    ORDER BY day ASC
  `).all();

  res.json({
    totals: { totalUsers, totalNotes, totalViews, totalReactions, totalReplies, avgTime: Math.round(avgTime) },
    dailyActivity,
    weeklyActivity,
    monthlyActivity,
    avgTimeDaily,
    topReactions,
    newUsersDaily,
    users,
    notesPerUser,
    noteViewsDaily,
  });
});

// Seed usernames — excluded from "genuine" visitors view
const SEED_USERNAMES = [
  'aarav.writes','priya_journals','kiran.m','meera.thoughts','ravi.diaries',
  'teja.scribbles','sahiti.pages','arjun_hyd','niharika.ink',
  'rohit.notes','ananya_writes','dev.diaries','shreya.feelings',
  'vikram.space','deepika.daily','aditya.pages','kavya.scribbles','sameer.diaries',
];

// ── GET /api/admin/visitors ───────────────────────────────────────────────────
router.get('/visitors', verifyAdminToken, async (req, res) => { try {
  const limit      = Math.min(parseInt(req.query.limit)  || 200, 1000);
  const device     = req.query.device     || 'all';   // all | mobile | desktop | tablet
  const user_type  = req.query.user_type  || 'all';   // all | guest | registered | genuine
  const date_from  = req.query.date_from  || '';
  const date_to    = req.query.date_to    || '';
  const path_filter= (req.query.path     || '').trim();
  const utm_source = (req.query.utm_source || '').trim();
  const utm_medium = (req.query.utm_medium || '').trim();

  // Build WHERE clauses
  const conditions = [];
  const params     = [];

  // Exclude seed/demo users when user_type === 'genuine'
  if (user_type === 'genuine') {
    const placeholders = SEED_USERNAMES.map(() => '?').join(',');
    conditions.push(`(pv.user_id IS NULL OR u.username NOT IN (${placeholders}))`);
    params.push(...SEED_USERNAMES);
    // Also skip auto-generated users (pattern: name.surname123)
    conditions.push(`(pv.user_id IS NULL OR u.username IS NULL OR (
      u.username NOT LIKE '%0' AND u.username NOT LIKE '%1' AND u.username NOT LIKE '%2' AND
      u.username NOT LIKE '%3' AND u.username NOT LIKE '%4' AND u.username NOT LIKE '%5' AND
      u.username NOT LIKE '%6' AND u.username NOT LIKE '%7' AND u.username NOT LIKE '%8' AND
      u.username NOT LIKE '%9'
    ))`);
  } else if (user_type === 'guest') {
    conditions.push(`pv.user_id IS NULL`);
  } else if (user_type === 'registered') {
    conditions.push(`pv.user_id IS NOT NULL`);
  }

  if (date_from) { conditions.push(`DATE(pv.created_at) >= ?`); params.push(date_from); }
  if (date_to)   { conditions.push(`DATE(pv.created_at) <= ?`); params.push(date_to); }
  if (path_filter) { conditions.push(`pv.path LIKE ?`); params.push('%' + path_filter + '%'); }
  if (utm_source)  { conditions.push(`pv.utm_source LIKE ?`); params.push('%' + utm_source + '%'); }
  if (utm_medium)  { conditions.push(`pv.utm_medium LIKE ?`); params.push('%' + utm_medium + '%'); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const rows = db.prepare(`
    SELECT pv.id, pv.user_id, pv.path, pv.ip, pv.ua, pv.duration_s,
           pv.referrer, pv.utm_source, pv.utm_medium, pv.utm_campaign,
           pv.created_at,
           u.username, u.display_name
    FROM page_views pv
    LEFT JOIN users u ON u.id = pv.user_id
    ${where}
    ORDER BY pv.created_at DESC
    LIMIT ?
  `).all(...params, limit);

  // Device filter (done in JS after UA parse — cheaper than SQLite REGEXP on UA)
  const privateRe = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|localhost)/;
  function detectDevice(ua) {
    if (!ua) return 'desktop';
    if (/iPad|Tablet/i.test(ua)) return 'tablet';
    if (/Mobile|Android|iPhone/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  const filtered = device === 'all'
    ? rows
    : rows.filter(r => detectDevice(r.ua) === device);

  // Collect unique IPs for geo lookup
  const uniqueIps = [...new Set(filtered.map(r => r.ip).filter(ip => ip && !privateRe.test(ip)))];

  let geoMap = {};
  try {
    if (uniqueIps.length) {
      const batch = uniqueIps.slice(0, 100).map(ip => ({ query: ip, fields: 'query,country,regionName,city,status' }));
      const geoRes = await fetch('http://ip-api.com/batch?fields=query,country,regionName,city,status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(4000),
      });
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        geoData.forEach(g => {
          if (g.status === 'success') geoMap[g.query] = [g.city, g.regionName, g.country].filter(Boolean).join(', ');
        });
      }
    }
  } catch { /* geo lookup optional */ }

  // Summary breakdown for the current filtered set
  const deviceCounts = { mobile: 0, desktop: 0, tablet: 0 };
  const sourceCounts = {};
  filtered.forEach(r => {
    const devKey = detectDevice(r.ua);
    deviceCounts[devKey] = (deviceCounts[devKey] || 0) + 1;
    let src = 'direct';
    if (r.utm_source) {
      src = r.utm_source;
    } else if (r.referrer) {
      try { src = new URL(r.referrer).hostname.replace('www.', '') || 'direct'; } catch { src = 'direct'; }
    }
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  });
  const topSources = Object.entries(sourceCounts).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([src,c])=>({src,c}));

  const visitors = filtered.map(r => ({
    id:           r.id,
    username:     r.username  || null,
    displayName:  r.display_name || null,
    path:         r.path,
    ip:           r.ip,
    location:     geoMap[r.ip] || (privateRe.test(r.ip) ? 'Local' : '—'),
    ua:           r.ua,
    device:       detectDevice(r.ua),
    duration_s:   r.duration_s,
    referrer:     r.referrer     || '',
    utm_source:   r.utm_source   || '',
    utm_medium:   r.utm_medium   || '',
    utm_campaign: r.utm_campaign || '',
    createdAt:    r.created_at,
  }));

  res.json({ visitors, summary: { total: filtered.length, deviceCounts, topSources } });
  } catch (err) {
    console.error('[visitors]', err);
    res.status(500).json({ error: err.message, visitors: [], summary: { total: 0, deviceCounts: {}, topSources: [] } });
  }
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
router.delete('/users/:id', verifyAdminToken, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM notes WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── PUT /api/admin/users/:id/note-limit — set per-user free note limit override
router.put('/users/:id/note-limit', verifyAdminToken, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { notesLimit } = req.body;
  // null = clear override (fall back to plan default)
  const val = notesLimit === null || notesLimit === '' ? null : Number(notesLimit);
  if (val !== null && (isNaN(val) || val < 0)) return res.status(400).json({ error: 'notesLimit must be a non-negative integer or null' });
  db.prepare('UPDATE users SET notes_limit_override = ? WHERE id = ?').run(val, req.params.id);
  res.json({ ok: true, notesLimitOverride: val });
});

// ── GET /api/admin/free-limit — get global free plan notes_limit
router.get('/free-limit', verifyAdminToken, (req, res) => {
  const plan = db.prepare(`SELECT notes_limit FROM subscription_plans WHERE id = 'free'`).get();
  res.json({ notesLimit: plan?.notes_limit ?? 5 });
});

// ── POST /api/admin/run-engagement-rewards — manually trigger the weekly job ─
router.post('/run-engagement-rewards', verifyAdminToken, (req, res) => {
  try {
    const { runEngagementRewards } = require('../jobs/engagement-rewards');
    const summary = runEngagementRewards();
    res.json({ ok: true, summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/admin/engagement-ledger — view all users' engagement state ────────
router.get('/engagement-ledger', verifyAdminToken, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name,
           COALESCE(el.paid_engagement, 0) AS paid_engagement,
           el.last_run_at,
           (SELECT COUNT(*) FROM note_reactions nr
              JOIN notes n ON n.id = nr.note_id
              WHERE n.user_id = u.id AND n.is_public = 1) AS total_reactions,
           (SELECT COUNT(*) FROM replies r
              JOIN notes n ON n.id = r.note_id
              WHERE n.user_id = u.id AND n.is_public = 1) AS total_replies,
           (SELECT COUNT(*) FROM notes WHERE user_id = u.id AND is_public = 1) AS public_posts
    FROM users u
    LEFT JOIN wallet_engagement_ledger el ON el.user_id = u.id
    WHERE (SELECT COUNT(*) FROM notes WHERE user_id = u.id AND is_public = 1) > 0
    ORDER BY (total_reactions + total_replies) DESC
    LIMIT 500
  `).all();

  res.json({ rows: rows.map(r => ({
    userId:          r.id,
    username:        r.username,
    displayName:     r.display_name || '',
    publicPosts:     r.public_posts,
    totalReactions:  r.total_reactions,
    totalReplies:    r.total_replies,
    totalEngagement: r.total_reactions + r.total_replies,
    paidEngagement:  r.paid_engagement,
    newEngagement:   Math.max(0, r.total_reactions + r.total_replies - r.paid_engagement),
    lastRunAt:       r.last_run_at || null,
  }))});
});

// ── POST /api/admin/generate-feed — AI-driven feed generator ────────────────
// Streams progress via newline-delimited JSON (NDJSON).
// Body: { feedCount, storyCount, enPct, tePct, hiPct, customPrompt }
router.post('/generate-feed', verifyAdminToken, async (req, res) => {
  const { feedCount = 20, storyCount = 5, enPct = 40, tePct = 30, hiPct = 30, customPrompt = '' } = req.body;

  // Validate
  const fc = Math.max(1, Math.min(100, parseInt(feedCount) || 20));
  const sc = Math.max(0, Math.min(20,  parseInt(storyCount) || 5));
  const en = Math.max(0, Math.min(100, parseInt(enPct)  || 40));
  const te = Math.max(0, Math.min(100, parseInt(tePct)  || 30));
  const hi = Math.max(0, Math.min(100, parseInt(hiPct)  || 30));

  // Stream progress as NDJSON
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders?.();

  const send = (msg, done = false, error = null) => {
    try { res.write(JSON.stringify({ msg, done, error }) + '\n'); } catch {}
  };

  try {
    const { runAutoFeed } = require('../auto-feed');
    const result = await runAutoFeed(db, {
      feedCount: fc, storyCount: sc,
      enPct: en, tePct: te, hiPct: hi,
      customPrompt: (customPrompt || '').trim(),
      onProgress: (msg) => send(msg),
    });
    send(`✅ Generation complete — ${result.created} notes created.`, true);
  } catch (err) {
    send(`❌ Error: ${err.message}`, true, err.message);
  }

  res.end();
});

// ── POST /api/admin/ai-chat — Ollama-powered admin assistant ─────────────────
// Builds a live data snapshot from the DB, injects it as context, streams reply
router.post('/ai-chat', verifyAdminToken, async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'message required' });

  // ── Build live data context ─────────────────────────────────────────────────
  const now = new Date().toISOString().slice(0, 10);
  const privateRe = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|localhost)/;

  const totalUsers     = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const todayUsers     = db.prepare("SELECT COUNT(*) as c FROM users WHERE DATE(created_at) = DATE('now')").get().c;
  const weekUsers      = db.prepare("SELECT COUNT(*) as c FROM users WHERE created_at >= DATE('now','-7 days')").get().c;
  const totalNotes     = db.prepare('SELECT COUNT(*) as c FROM notes').get().c;
  const publicNotes    = db.prepare('SELECT COUNT(*) as c FROM notes WHERE is_public=1').get().c;
  const totalReactions = db.prepare('SELECT COUNT(*) as c FROM note_reactions').get().c;
  const totalReplies   = db.prepare('SELECT COUNT(*) as c FROM replies').get().c;
  const avgTime        = db.prepare('SELECT ROUND(AVG(duration_s),1) as v FROM page_views WHERE duration_s > 0').get().v || 0;
  const todayVisitors  = db.prepare("SELECT COUNT(DISTINCT COALESCE(user_id,ip)) as c FROM page_views WHERE DATE(created_at)=DATE('now')").get().c;
  const openComplaints = db.prepare("SELECT COUNT(*) as c FROM complaints WHERE status='open'").get().c;

  // Subscriptions breakdown
  const subMonthly  = db.prepare("SELECT COUNT(*) as c FROM user_subscriptions WHERE plan_id='monthly' AND (expires_at IS NULL OR expires_at > datetime('now'))").get().c;
  const subYearly   = db.prepare("SELECT COUNT(*) as c FROM user_subscriptions WHERE plan_id='yearly'  AND (expires_at IS NULL OR expires_at > datetime('now'))").get().c;
  const subLifetime = db.prepare("SELECT COUNT(*) as c FROM user_subscriptions WHERE plan_id='lifetime' AND (expires_at IS NULL OR expires_at > datetime('now'))").get().c;
  const subFree     = totalUsers - subMonthly - subYearly - subLifetime;

  // All traffic sources — UTM + referrer hostname combined
  const utmRows = db.prepare(`
    SELECT utm_source as src, COUNT(*) as hits FROM page_views
    WHERE utm_source != '' GROUP BY utm_source ORDER BY hits DESC LIMIT 10
  `).all();
  const refRows = db.prepare(`
    SELECT referrer, COUNT(*) as hits FROM page_views
    WHERE referrer != '' AND utm_source = '' GROUP BY referrer ORDER BY hits DESC LIMIT 20
  `).all();
  // Collapse referrer hostnames
  const refMap = {};
  refRows.forEach(r => {
    let host = 'direct';
    try { host = new URL(r.referrer).hostname.replace(/^www\./, '') || 'direct'; } catch {}
    refMap[host] = (refMap[host] || 0) + r.hits;
  });
  const topReferrers = Object.entries(refMap).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([src,c])=>({src,c}));
  const topSources   = utmRows; // keep for rule-based

  // Top pages
  const topPages = db.prepare(`
    SELECT path, COUNT(*) as hits FROM page_views
    GROUP BY path ORDER BY hits DESC LIMIT 10
  `).all();

  // New users last 7 days (with names)
  const recentSignups = db.prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as c FROM users
    WHERE created_at >= DATE('now','-7 days') GROUP BY day ORDER BY day ASC
  `).all();
  const recentUserList = db.prepare(`
    SELECT username, display_name, email, created_at FROM users
    WHERE created_at >= DATE('now','-7 days') ORDER BY created_at DESC LIMIT 30
  `).all();
  const todayUserList = db.prepare(`
    SELECT username, display_name, email, created_at FROM users
    WHERE DATE(created_at) = DATE('now') ORDER BY created_at DESC
  `).all();

  // Today's visitor IPs for geo lookup
  const todayIpRows = db.prepare(`
    SELECT DISTINCT ip FROM page_views
    WHERE DATE(created_at) = DATE('now') AND ip IS NOT NULL AND ip != ''
    LIMIT 100
  `).all();
  const publicIps = todayIpRows.map(r=>r.ip).filter(ip => !privateRe.test(ip));

  // Async geo lookup for today's IPs
  let geoMap = {};
  let locationCounts = {};  // city → count of visitors
  try {
    if (publicIps.length) {
      const batch = publicIps.slice(0,100).map(ip => ({ query: ip, fields: 'query,country,regionName,city,status' }));
      const geoRes = await fetch('http://ip-api.com/batch?fields=query,country,regionName,city,status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(5000),
      });
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        geoData.forEach(g => {
          if (g.status !== 'success') return;
          const loc = [g.city, g.regionName, g.country].filter(Boolean).join(', ');
          geoMap[g.query] = loc;
          const cityKey = g.city || g.regionName || g.country || 'Unknown';
          locationCounts[cityKey] = (locationCounts[cityKey] || 0) + 1;
        });
      }
    }
  } catch { /* geo lookup optional */ }

  // All-time visitor geo (from IPs we have, limited sample)
  const allIpRows = db.prepare(`
    SELECT DISTINCT ip FROM page_views WHERE ip IS NOT NULL AND ip != '' LIMIT 200
  `).all();
  const allPublicIps = allIpRows.map(r=>r.ip).filter(ip => !privateRe.test(ip) && !geoMap[ip]);
  let allGeoMap = { ...geoMap };
  try {
    if (allPublicIps.length) {
      const batch = allPublicIps.slice(0,100).map(ip => ({ query: ip, fields: 'query,country,regionName,city,status' }));
      const geoRes = await fetch('http://ip-api.com/batch?fields=query,country,regionName,city,status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(5000),
      });
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        geoData.forEach(g => {
          if (g.status === 'success') allGeoMap[g.query] = [g.city, g.regionName, g.country].filter(Boolean).join(', ');
        });
      }
    }
  } catch {}

  // Count all-time visitors per city from page_views + allGeoMap
  const allIpRowsFull = db.prepare(`SELECT ip, COUNT(*) as hits FROM page_views WHERE ip IS NOT NULL AND ip != '' GROUP BY ip`).all();
  const allLocationCounts = {};
  allIpRowsFull.forEach(r => {
    if (allGeoMap[r.ip]) {
      const city = allGeoMap[r.ip].split(',')[0].trim();
      allLocationCounts[city] = (allLocationCounts[city] || 0) + r.hits;
    }
  });
  const topLocations = Object.entries(allLocationCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([loc,c])=>({loc,c}));
  const topLocationsToday = Object.entries(locationCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([loc,c])=>({loc,c}));

  const context = `
You are an admin AI assistant for "Unsent Stories" — a private diary/writing app.
Today is ${now}. Answer questions based on this live data snapshot:

USERS: total=${totalUsers}, new_today=${todayUsers}, new_this_week=${weekUsers}
NEW_USERS_TODAY: ${todayUserList.length ? todayUserList.map(u=>`${u.username}(${u.display_name||''})`).join(', ') : 'none'}
NEW_USERS_THIS_WEEK: ${recentUserList.map(u=>`${u.username} joined ${u.created_at.slice(0,10)}`).join('; ') || 'none'}
NOTES: total=${totalNotes}, public=${publicNotes}
ENGAGEMENT: reactions=${totalReactions}, comments=${totalReplies}
VISITORS: today=${todayVisitors}, avg_session=${avgTime}s
VISITOR_LOCATIONS_TODAY: ${topLocationsToday.map(l=>`${l.loc}(${l.c})`).join(', ') || 'geo data pending or local IPs'}
VISITOR_LOCATIONS_ALLTIME: ${topLocations.map(l=>`${l.loc}(${l.c})`).join(', ') || 'geo data pending or local IPs'}
SUBSCRIPTIONS: monthly=${subMonthly}, yearly=${subYearly}, lifetime=${subLifetime}, free=${subFree}
COMPLAINTS: open=${openComplaints}
UTM_SOURCES: ${topSources.map(s=>`${s.src}(${s.hits})`).join(', ') || 'none tracked'}
REFERRERS: ${topReferrers.map(s=>`${s.src}(${s.c})`).join(', ') || 'none'}
TOP_PAGES: ${topPages.map(p=>`${p.path}(${p.hits})`).join(', ')}
RECENT_SIGNUPS_BY_DAY: ${recentSignups.map(r=>`${r.day}:${r.c}`).join(', ') || 'none'}

Answer concisely and directly. Use the exact numbers above. When asked about locations/cities, use VISITOR_LOCATIONS data. When asked who signed up, list from NEW_USERS fields.
`.trim();

  // ── Call Ollama (stream) ────────────────────────────────────────────────────
  const ollamaHost  = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'granite3.2:2b';

  const messages = [
    { role: 'system', content: context },
    ...history.slice(-6).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message.trim() },
  ];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.flushHeaders?.();

  // ── Rule-based fallback (used when Ollama is unreachable) ──────────────────
  function ruleBasedAnswer(q) {
    const lines = [];

    // ── Who are the new users / who joined ──────────────────────────────────
    if (/who.*(new|join|sign|register)|new.*user.*name|list.*user|user.*list/i.test(q)) {
      if (todayUserList.length) {
        lines.push(`**${todayUserList.length} new user(s) today:**`);
        todayUserList.forEach(u => lines.push(`• **${u.username}** (${u.display_name || '—'}) — ${u.email || 'no email'}`));
      } else {
        lines.push(`No new users today.`);
      }
      if (/week|7.*day/i.test(q) && recentUserList.length) {
        lines.push(`\n**This week (${recentUserList.length} users):**`);
        recentUserList.forEach(u => lines.push(`• **${u.username}** (${u.display_name || '—'}) joined ${u.created_at.slice(0,10)}`));
      }
    }

    // ── New users count ─────────────────────────────────────────────────────
    if (!lines.length && /new.*(user|signup|register).*today|today.*new.*(user|signup)/i.test(q)) {
      lines.push(`**${todayUsers}** new user(s) today.`);
      if (todayUserList.length)
        todayUserList.forEach(u => lines.push(`• ${u.username} (${u.display_name || '—'})`));
    }
    if (!lines.length && /new.*(user|signup).*week|this week|last 7/i.test(q)) {
      lines.push(`**${weekUsers}** new users this week.`);
      recentUserList.forEach(u => lines.push(`• ${u.username} — joined ${u.created_at.slice(0,10)}`));
    }

    // ── Location / city / geo / Hyderabad etc. ──────────────────────────────
    if (/location|city|cit(y|ies)|where.*from|from.*where|geo|country|hyder|bangalore|mumbai|chennai|delhi|pune|kolkata/i.test(q)) {
      // Check for specific city mention
      const cityMatch = q.match(/hyderabad|hyder|bangalore|bengaluru|mumbai|chennai|delhi|pune|kolkata|surat|jaipur/i);
      if (cityMatch) {
        const cityQuery = cityMatch[0].toLowerCase();
        const cityNorm  = { hyder: 'Hyderabad', hyderabad: 'Hyderabad', bangalore: 'Bangalore', bengaluru: 'Bangalore',
          mumbai: 'Mumbai', chennai: 'Chennai', delhi: 'Delhi', pune: 'Pune', kolkata: 'Kolkata',
          surat: 'Surat', jaipur: 'Jaipur' }[cityQuery] || cityQuery;
        const todayCount = topLocationsToday.find(l => l.loc.toLowerCase().includes(cityQuery))?.c || 0;
        const alltimeCount = topLocations.find(l => l.loc.toLowerCase().includes(cityQuery))?.c || 0;
        lines.push(`Visitors from **${cityNorm}**: **${todayCount}** today, **${alltimeCount}** all-time`);
      } else if (/today/i.test(q)) {
        if (topLocationsToday.length) {
          lines.push(`**Visitor locations today:**`);
          topLocationsToday.forEach(l => lines.push(`• **${l.loc}**: ${l.c}`));
        } else {
          lines.push(`Location data not available for today (visitors may be on local/private IPs, or geo lookup is pending).`);
        }
      } else {
        if (topLocations.length) {
          lines.push(`**Top visitor locations (all time):**`);
          topLocations.forEach(l => lines.push(`• **${l.loc}**: ${l.c} visit(s)`));
        } else {
          lines.push(`Location data not available yet. This could be because visitors are on private/local networks, or no public IPs have been recorded.`);
        }
      }
    }

    // ── Traffic sources / referrers ─────────────────────────────────────────
    if (/source|traffic|referr|where.*visit|visit.*from|ig|instagram|facebook|fb|organic/i.test(q) &&
        !/location|city|geo/i.test(q)) {
      if (topSources.length || topReferrers.length) {
        if (topSources.length) {
          lines.push(`**UTM sources:**`);
          topSources.forEach(s => lines.push(`• **${s.src}**: ${s.hits} hits`));
        }
        if (topReferrers.length) {
          lines.push(`\n**Referrer domains:**`);
          topReferrers.forEach(r => lines.push(`• **${r.src}**: ${r.c} hits`));
        }
        if (!topSources.length && !topReferrers.length)
          lines.push(`No traffic source data recorded yet.`);
      } else {
        lines.push(`No UTM-tagged or referrer traffic tracked yet. Make sure your links include UTM parameters.`);
      }
    }

    // ── Subscriptions ───────────────────────────────────────────────────────
    if (/total.*user|how many user|user.*count/i.test(q))
      lines.push(`Total registered users: **${totalUsers}**`);
    if (/monthly.*sub|subscriber.*month/i.test(q))
      lines.push(`Monthly subscribers: **${subMonthly}**`);
    if (/yearly.*sub|subscriber.*year/i.test(q))
      lines.push(`Yearly subscribers: **${subYearly}**`);
    if (/lifetime.*sub|subscriber.*life/i.test(q))
      lines.push(`Lifetime subscribers: **${subLifetime}**`);
    if (/free.*user|free.*plan/i.test(q))
      lines.push(`Free plan users: **${subFree}**`);
    if (/subscri/i.test(q) && !lines.length)
      lines.push(`Subscriptions — Monthly: **${subMonthly}**, Yearly: **${subYearly}**, Lifetime: **${subLifetime}**, Free: **${subFree}**`);

    // ── Visitors ────────────────────────────────────────────────────────────
    if (/visitor.*today|today.*visitor|how many.*visit/i.test(q) && !/location|city|geo/i.test(q))
      lines.push(`Visitors today: **${todayVisitors}**`);

    // ── Pages ───────────────────────────────────────────────────────────────
    if (/top.*page|popular.*page|most.*visit.*page/i.test(q))
      lines.push(`Top pages:\n${topPages.map(p=>`• **${p.path}**: ${p.hits} hits`).join('\n')}`);

    // ── Engagement ──────────────────────────────────────────────────────────
    if (/reaction|emoji/i.test(q))
      lines.push(`Total reactions: **${totalReactions}**`);
    if (/comment|repl/i.test(q))
      lines.push(`Total comments/replies: **${totalReplies}**`);
    if (/complaint/i.test(q))
      lines.push(`Open complaints: **${openComplaints}**`);
    if (/session|avg.*time|time.*site/i.test(q))
      lines.push(`Average session time: **${avgTime}s**`);
    if (/note|entr|post/i.test(q) && !/footnote/i.test(q))
      lines.push(`Total notes: **${totalNotes}** (**${publicNotes}** public)`);
    if (/recent.*signup|signup.*last|last.*7/i.test(q))
      lines.push(`Recent signups:\n${recentSignups.map(r=>`• ${r.day}: **${r.c}**`).join('\n') || 'none'}`);

    // ── General summary (fallback) ──────────────────────────────────────────
    if (!lines.length) {
      const locSummary = topLocations.length
        ? topLocations.slice(0,5).map(l=>`${l.loc}(${l.c})`).join(', ')
        : 'geo data pending';
      lines.push(
        `**Portal snapshot — ${now}:**`,
        `• Users: **${totalUsers}** total · **${todayUsers}** new today · **${weekUsers}** this week`,
        `• Subscriptions: **${subMonthly}** monthly · **${subYearly}** yearly · **${subLifetime}** lifetime · **${subFree}** free`,
        `• Visitors today: **${todayVisitors}** · Avg session: **${avgTime}s**`,
        `• Top locations: ${locSummary}`,
        `• Traffic: ${topSources.slice(0,3).map(s=>`${s.src}(${s.hits})`).join(', ') || 'no UTM data'}`,
        `• Notes: **${totalNotes}** (**${publicNotes}** public)`,
        `• Open complaints: **${openComplaints}**`,
      );
    }

    return lines.join('\n');
  }

  // ── Try Ollama; fall back to rule-based if unreachable ────────────────────
  try {
    const https  = require('https');
    const http   = require('http');
    const urlMod = require('url');
    const parsed = urlMod.parse(ollamaHost + '/api/chat');
    const lib    = parsed.protocol === 'https:' ? https : http;
    const body   = JSON.stringify({ model: ollamaModel, messages, stream: true });

    const oReq = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.path,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, oRes => {
      oRes.on('data', chunk => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            const token = obj?.message?.content || '';
            if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`);
            if (obj.done) res.write(`data: [DONE]\n\n`);
          } catch {}
        }
      });
      oRes.on('end', () => { try { res.write(`data: [DONE]\n\n`); res.end(); } catch {} });
    });

    oReq.on('error', () => {
      // Ollama unreachable — answer directly from live DB data
      const answer = ruleBasedAnswer(message.trim());
      res.write(`data: ${JSON.stringify({ token: answer })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    });
    oReq.setTimeout(60000, () => { oReq.destroy(); });
    oReq.write(body);
    oReq.end();
  } catch (err) {
    const answer = ruleBasedAnswer(message.trim());
    res.write(`data: ${JSON.stringify({ token: answer })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();
  }
});

module.exports = router;
