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

  // Top visitor sources (UTM)
  const topSources = db.prepare(`
    SELECT utm_source, COUNT(*) as hits FROM page_views
    WHERE utm_source != '' GROUP BY utm_source ORDER BY hits DESC LIMIT 5
  `).all();

  // Top pages
  const topPages = db.prepare(`
    SELECT path, COUNT(*) as hits FROM page_views
    GROUP BY path ORDER BY hits DESC LIMIT 5
  `).all();

  // New users last 7 days
  const recentSignups = db.prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as c FROM users
    WHERE created_at >= DATE('now','-7 days') GROUP BY day ORDER BY day ASC
  `).all();

  const context = `
You are an admin AI assistant for "Unsent Stories" — a private diary/writing app.
Today is ${now}. Answer questions based on this live data snapshot:

USERS: total=${totalUsers}, new_today=${todayUsers}, new_this_week=${weekUsers}
NOTES: total=${totalNotes}, public=${publicNotes}
ENGAGEMENT: reactions=${totalReactions}, comments=${totalReplies}
VISITORS: today=${todayVisitors}, avg_session=${avgTime}s
SUBSCRIPTIONS: monthly=${subMonthly}, yearly=${subYearly}, lifetime=${subLifetime}, free=${subFree}
COMPLAINTS: open=${openComplaints}
TOP_SOURCES: ${topSources.map(s => `${s.utm_source}(${s.hits})`).join(', ') || 'none tracked'}
TOP_PAGES: ${topPages.map(p => `${p.path}(${p.hits})`).join(', ')}
RECENT_SIGNUPS (last 7 days): ${recentSignups.map(r => `${r.day}:${r.c}`).join(', ') || 'none'}

Answer concisely. Use numbers directly. If asked for charts or graphs, describe the trend in text.
`.trim();

  // ── Call Ollama (stream) ────────────────────────────────────────────────────
  const ollamaHost  = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2';

  const messages = [
    { role: 'system', content: context },
    ...history.slice(-6).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message.trim() },
  ];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.flushHeaders?.();

  try {
    const https = require('https');
    const http  = require('http');
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

    oReq.on('error', err => {
      res.write(`data: ${JSON.stringify({ error: 'Ollama not reachable: ' + err.message })}\n\n`);
      res.end();
    });
    oReq.setTimeout(60000, () => { oReq.destroy(); });
    oReq.write(body);
    oReq.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

module.exports = router;
