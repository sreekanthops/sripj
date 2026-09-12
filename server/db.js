const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'diary.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');   // disabled during schema init / migration

// ── SCHEMA (create tables if not exist) ───────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL DEFAULT '',
    bio           TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notes (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL DEFAULT '',
    title       TEXT NOT NULL DEFAULT '',
    body        TEXT NOT NULL DEFAULT '',
    font        TEXT NOT NULL DEFAULT 'Georgia,serif',
    font_size   INTEGER NOT NULL DEFAULT 14,
    font_weight TEXT NOT NULL DEFAULT 'normal',
    color_idx   INTEGER NOT NULL DEFAULT 0,
    music_url   TEXT NOT NULL DEFAULT '',
    tags        TEXT NOT NULL DEFAULT '[]',
    views       INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    edited_at   TEXT
  );

  CREATE TABLE IF NOT EXISTS note_reactions (
    id          TEXT PRIMARY KEY,
    note_id     TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    emoji       TEXT NOT NULL,
    reactor_key TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    UNIQUE(note_id, emoji, reactor_key)
  );

  CREATE TABLE IF NOT EXISTS replies (
    id         TEXT PRIMARY KEY,
    note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    user_id    TEXT,
    name       TEXT NOT NULL DEFAULT 'Anonymous',
    text       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reply_reactions (
    id          TEXT PRIMARY KEY,
    reply_id    TEXT NOT NULL REFERENCES replies(id) ON DELETE CASCADE,
    emoji       TEXT NOT NULL,
    reactor_key TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    UNIQUE(reply_id, emoji, reactor_key)
  );

  CREATE TABLE IF NOT EXISTS media (
    id         TEXT PRIMARY KEY,
    note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    filename   TEXT NOT NULL,
    mimetype   TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS page_stickers (
    user_id    TEXT NOT NULL PRIMARY KEY,
    data       TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admins (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email         TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS page_views (
    id          TEXT PRIMARY KEY,
    user_id     TEXT,
    path        TEXT NOT NULL DEFAULT '/',
    ip          TEXT NOT NULL DEFAULT '',
    ua          TEXT NOT NULL DEFAULT '',
    duration_s  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT,
    ip         TEXT NOT NULL DEFAULT '',
    ua         TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL,
    ended_at   TEXT
  );

  -- ── APP SETTINGS — key/value store for admin-configurable settings ──────────
  CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );

  -- ── RAZORPAY ORDERS — track payment lifecycle ────────────────────────────────
  CREATE TABLE IF NOT EXISTS razorpay_orders (
    id           TEXT PRIMARY KEY,   -- Razorpay order_id
    user_id      TEXT NOT NULL,
    plan_id      TEXT NOT NULL,
    amount_paise INTEGER NOT NULL,   -- amount in paise (INR smallest unit)
    currency     TEXT NOT NULL DEFAULT 'INR',
    status       TEXT NOT NULL DEFAULT 'created',  -- created | paid | failed
    payment_id   TEXT,               -- Razorpay payment_id after success
    created_at   TEXT NOT NULL,
    paid_at      TEXT
  );

  -- ── GLOBAL IMAGES — admin-curated library visible to all users ─────────────
  CREATE TABLE IF NOT EXISTS global_images (
    id         TEXT PRIMARY KEY,
    filename   TEXT NOT NULL,
    label      TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- ── SUBSCRIPTION TABLES ────────────────────────────────────────────────────
  --  Plans: free / monthly / yearly / lifetime
  CREATE TABLE IF NOT EXISTS subscription_plans (
    id          TEXT PRIMARY KEY,   -- 'free' | 'monthly' | 'yearly' | 'lifetime'
    name        TEXT NOT NULL,
    price_usd   REAL NOT NULL DEFAULT 0,
    notes_limit INTEGER NOT NULL DEFAULT 5,   -- -1 = unlimited
    uploads     INTEGER NOT NULL DEFAULT 0,   -- 0 = no upload, 1 = allowed
    canvas      INTEGER NOT NULL DEFAULT 0,   -- 0 = no canvas stickers
    description TEXT NOT NULL DEFAULT ''
  );

  --  One active subscription per user.
  --  granted_by = admin id means admin manually assigned it (free courtesy plan etc.)
  --  expires_at NULL  = lifetime / never expires
  CREATE TABLE IF NOT EXISTS user_subscriptions (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id      TEXT NOT NULL REFERENCES subscription_plans(id),
    granted_by   TEXT,
    starts_at    TEXT NOT NULL,
    expires_at   TEXT,
    created_at   TEXT NOT NULL,
    UNIQUE(user_id)
  );
`);

// ── MIGRATIONS (idempotent — safe to run on every start) ─────────────────────

function hasColumn(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(r => r.name === col);
}

function hasTable(name) {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name);
}

// users columns (older DBs may be missing these)
if (!hasColumn('users', 'display_name'))        db.exec(`ALTER TABLE users ADD COLUMN display_name        TEXT NOT NULL DEFAULT ''`);
if (!hasColumn('users', 'bio'))                 db.exec(`ALTER TABLE users ADD COLUMN bio                 TEXT NOT NULL DEFAULT ''`);
if (!hasColumn('users', 'password_hash'))       db.exec(`ALTER TABLE users ADD COLUMN password_hash       TEXT NOT NULL DEFAULT ''`);
if (!hasColumn('users', 'share_protected'))     db.exec(`ALTER TABLE users ADD COLUMN share_protected     INTEGER NOT NULL DEFAULT 0`);
if (!hasColumn('users', 'share_password_hash')) db.exec(`ALTER TABLE users ADD COLUMN share_password_hash TEXT NOT NULL DEFAULT ''`);
if (!hasColumn('users', 'google_id'))           db.exec(`ALTER TABLE users ADD COLUMN google_id           TEXT`);
if (!hasColumn('users', 'email'))               db.exec(`ALTER TABLE users ADD COLUMN email               TEXT NOT NULL DEFAULT ''`);
if (!hasColumn('users', 'avatar_url'))          db.exec(`ALTER TABLE users ADD COLUMN avatar_url          TEXT NOT NULL DEFAULT ''`);

// users: share_token (opaque slug for diary share URL)
if (!hasColumn('users', 'share_token')) {
  db.exec(`ALTER TABLE users ADD COLUMN share_token TEXT NOT NULL DEFAULT ''`);
}
// Always back-fill any users that still have an empty share_token
;(function backFillShareTokens() {
  const { v4: uuidv4 } = require('uuid');
  const empty = db.prepare("SELECT id FROM users WHERE share_token = ''").all();
  if (!empty.length) return;
  const upd = db.prepare('UPDATE users SET share_token = ? WHERE id = ?');
  empty.forEach(u => upd.run(uuidv4().replace(/-/g, '').slice(0, 14), u.id));
  console.log(`[db] back-filled share_token for ${empty.length} user(s)`);
})();

// notes.user_id / tags / pinned / bg_url / note_music_id
if (!hasColumn('notes', 'user_id'))       db.exec(`ALTER TABLE notes ADD COLUMN user_id       TEXT NOT NULL DEFAULT ''`);
if (!hasColumn('notes', 'tags'))          db.exec(`ALTER TABLE notes ADD COLUMN tags          TEXT NOT NULL DEFAULT '[]'`);
if (!hasColumn('notes', 'pinned'))        db.exec(`ALTER TABLE notes ADD COLUMN pinned        INTEGER NOT NULL DEFAULT 0`);
if (!hasColumn('notes', 'bg_url'))        db.exec(`ALTER TABLE notes ADD COLUMN bg_url        TEXT NOT NULL DEFAULT ''`);
if (!hasColumn('notes', 'note_music_id')) db.exec(`ALTER TABLE notes ADD COLUMN note_music_id TEXT NOT NULL DEFAULT ''`);
// notes TTS voice & tone settings
if (!hasColumn('notes', 'tts_voice'))     db.exec(`ALTER TABLE notes ADD COLUMN tts_voice     TEXT NOT NULL DEFAULT 'female'`);
if (!hasColumn('notes', 'tts_tone'))      db.exec(`ALTER TABLE notes ADD COLUMN tts_tone      TEXT NOT NULL DEFAULT 'auto'`);
if (!hasColumn('notes', 'title_font'))    db.exec(`ALTER TABLE notes ADD COLUMN title_font    TEXT NOT NULL DEFAULT ''`);

// note_backgrounds — admin-managed library of note background images
if (!hasTable('note_backgrounds')) {
  db.exec(`
    CREATE TABLE note_backgrounds (
      id         TEXT PRIMARY KEY,
      filename   TEXT NOT NULL,
      label      TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
}

// music_library — admin-managed library of background music tracks
if (!hasTable('music_library')) {
  db.exec(`
    CREATE TABLE music_library (
      id         TEXT PRIMARY KEY,
      filename   TEXT NOT NULL,
      title      TEXT NOT NULL DEFAULT '',
      artist     TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
}

// password_reset_tokens — time-limited tokens for email-based password reset
if (!hasTable('password_reset_tokens')) {
  db.exec(`
    CREATE TABLE password_reset_tokens (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used       INTEGER NOT NULL DEFAULT 0
    )
  `);
}

// user_music_library — per-user personal music uploads
if (!hasTable('user_music_library')) {
  db.exec(`
    CREATE TABLE user_music_library (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      filename   TEXT NOT NULL,
      title      TEXT NOT NULL DEFAULT '',
      artist     TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )
  `);
}

// geo_pricing — per-region prices for each plan
if (!hasTable('geo_pricing')) {
  db.exec(`
    CREATE TABLE geo_pricing (
      id         TEXT PRIMARY KEY,
      region     TEXT NOT NULL,          -- e.g. 'IN', 'US', 'UK', 'EU', 'AU', 'ROW'
      plan_id    TEXT NOT NULL,          -- 'monthly' | 'yearly' | 'lifetime'
      currency   TEXT NOT NULL,          -- 'INR', 'USD', 'GBP', 'EUR', 'AUD'
      symbol     TEXT NOT NULL,          -- '₹', '$', '£', '€', 'A$'
      amount     REAL NOT NULL,          -- display amount in that currency
      updated_at TEXT NOT NULL,
      UNIQUE(region, plan_id)
    )
  `);

  // Seed default geo prices
  const now = new Date().toISOString();
  const seedGeo = db.prepare(`
    INSERT OR IGNORE INTO geo_pricing (id, region, plan_id, currency, symbol, amount, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const { v4: uuid } = require('uuid');
  const geoDefaults = [
    // India
    ['IN','monthly','INR','₹',149], ['IN','yearly','INR','₹',999], ['IN','lifetime','INR','₹',2499],
    // US/Canada
    ['US','monthly','USD','$',4.99], ['US','yearly','USD','$',39.99], ['US','lifetime','USD','$',79.99],
    // UK
    ['UK','monthly','GBP','£',4.49], ['UK','yearly','GBP','£',34.99], ['UK','lifetime','GBP','£',64.99],
    // Europe
    ['EU','monthly','EUR','€',4.99], ['EU','yearly','EUR','€',39.99], ['EU','lifetime','EUR','€',74.99],
    // Australia
    ['AU','monthly','AUD','A$',7.99], ['AU','yearly','AUD','A$',59.99], ['AU','lifetime','AUD','A$',119.99],
    // Rest of World
    ['ROW','monthly','USD','$',3.99], ['ROW','yearly','USD','$',29.99], ['ROW','lifetime','USD','$',69.99],
  ];
  geoDefaults.forEach(([region, plan_id, currency, symbol, amount]) => {
    seedGeo.run(uuid(), region, plan_id, currency, symbol, amount, now);
  });
}

// replies.user_id
if (!hasColumn('replies', 'user_id')) db.exec(`ALTER TABLE replies ADD COLUMN user_id TEXT`);

// subscription_plans: discount columns
if (!hasColumn('subscription_plans', 'discount_pct'))      db.exec(`ALTER TABLE subscription_plans ADD COLUMN discount_pct     REAL    NOT NULL DEFAULT 0`);
if (!hasColumn('subscription_plans', 'discount_label'))    db.exec(`ALTER TABLE subscription_plans ADD COLUMN discount_label   TEXT    NOT NULL DEFAULT ''`);
if (!hasColumn('subscription_plans', 'discount_ends_at'))  db.exec(`ALTER TABLE subscription_plans ADD COLUMN discount_ends_at TEXT`);
if (!hasColumn('subscription_plans', 'price_inr'))         db.exec(`ALTER TABLE subscription_plans ADD COLUMN price_inr        REAL    NOT NULL DEFAULT 0`);

// reply_reactions — drop old schema that had a `count` column
if (hasTable('reply_reactions') && hasColumn('reply_reactions', 'count')) {
  db.exec(`DROP TABLE reply_reactions`);
  db.exec(`
    CREATE TABLE reply_reactions (
      id          TEXT PRIMARY KEY,
      reply_id    TEXT NOT NULL REFERENCES replies(id) ON DELETE CASCADE,
      emoji       TEXT NOT NULL,
      reactor_key TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      UNIQUE(reply_id, emoji, reactor_key)
    )
  `);
}

// Re-enable FK enforcement
db.pragma('foreign_keys = ON');

// ── SEED SUBSCRIPTION PLANS (idempotent) ─────────────────────────────────────
//
//  Pricing strategy:
//   Free        — ₹0     · up to 5 diary entries, uploads allowed, no canvas stickers
//   Pro Monthly — ₹419   · unlimited entries, uploads, canvas stickers. Billed monthly.
//   Pro Yearly  — ₹3329  · same as monthly (save ~33%). Billed yearly.
//   Lifetime    — ₹8249  · unlimited everything, forever. One-time payment.
//
const seedPlan = db.prepare(`
  INSERT OR IGNORE INTO subscription_plans (id, name, price_usd, price_inr, notes_limit, uploads, canvas, description)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
seedPlan.run('free',     'Free',          0,      0,      5,  1, 0, 'Up to 5 diary entries. Photos & videos allowed. No canvas stickers.');
seedPlan.run('monthly',  'Pro Monthly',   4.99,   419,   -1,  1, 1, 'Unlimited entries, media uploads & canvas stickers. Billed monthly.');
seedPlan.run('yearly',   'Pro Yearly',   39.99,  3329,   -1,  1, 1, 'Unlimited entries, media uploads & canvas stickers. Billed yearly (save 33%).');
seedPlan.run('lifetime', 'Lifetime',     99.00,  8249,   -1,  1, 1, 'Unlimited everything. One-time payment, never expires.');

// ── Live migration: update the free plan's uploads flag to 1 if it was 0 ─────
// (INSERT OR IGNORE above won't update existing rows, so we patch it here)
db.prepare(`UPDATE subscription_plans SET uploads = 1, description = 'Up to 5 diary entries. Photos & videos allowed. No canvas stickers.' WHERE id = 'free' AND uploads = 0`).run();

module.exports = db;
