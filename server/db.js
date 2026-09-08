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
if (!hasColumn('users', 'display_name'))  db.exec(`ALTER TABLE users ADD COLUMN display_name  TEXT NOT NULL DEFAULT ''`);
if (!hasColumn('users', 'bio'))           db.exec(`ALTER TABLE users ADD COLUMN bio           TEXT NOT NULL DEFAULT ''`);
if (!hasColumn('users', 'password_hash')) db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''`);

// notes.user_id / tags / pinned
if (!hasColumn('notes', 'user_id')) db.exec(`ALTER TABLE notes ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
if (!hasColumn('notes', 'tags'))    db.exec(`ALTER TABLE notes ADD COLUMN tags    TEXT NOT NULL DEFAULT '[]'`);
if (!hasColumn('notes', 'pinned'))  db.exec(`ALTER TABLE notes ADD COLUMN pinned  INTEGER NOT NULL DEFAULT 0`);

// replies.user_id
if (!hasColumn('replies', 'user_id')) db.exec(`ALTER TABLE replies ADD COLUMN user_id TEXT`);

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
//   Free      — $0/mo   · up to 5 diary entries, no uploads, no canvas
//   Pro Monthly — $4.99/mo · unlimited entries, uploads, canvas
//   Pro Yearly  — $39.99/yr · same as monthly (save ~33 %)
//   Lifetime    — $99 once  · unlimited everything, forever
//
const seedPlan = db.prepare(`
  INSERT OR IGNORE INTO subscription_plans (id, name, price_usd, notes_limit, uploads, canvas, description)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
seedPlan.run('free',     'Free',          0,      5,  0, 0, 'Up to 5 diary entries. No media uploads. No canvas stickers.');
seedPlan.run('monthly',  'Pro Monthly',   4.99,  -1,  1, 1, 'Unlimited entries, media uploads & canvas stickers. Billed monthly.');
seedPlan.run('yearly',   'Pro Yearly',   39.99,  -1,  1, 1, 'Unlimited entries, media uploads & canvas stickers. Billed yearly (save 33%).');
seedPlan.run('lifetime', 'Lifetime',     99.00,  -1,  1, 1, 'Unlimited everything. One-time payment, never expires.');

module.exports = db;
