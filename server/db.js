const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'diary.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── SCHEMA ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    username     TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL DEFAULT '',
    bio          TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notes (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT '',
    body        TEXT NOT NULL DEFAULT '',
    font        TEXT NOT NULL DEFAULT 'Georgia,serif',
    font_size   INTEGER NOT NULL DEFAULT 14,
    font_weight TEXT NOT NULL DEFAULT 'normal',
    color_idx   INTEGER NOT NULL DEFAULT 0,
    music_url   TEXT NOT NULL DEFAULT '',
    views       INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    edited_at   TEXT
  );

  CREATE TABLE IF NOT EXISTS reactions (
    id       TEXT PRIMARY KEY,
    note_id  TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    emoji    TEXT NOT NULL,
    count    INTEGER NOT NULL DEFAULT 0,
    UNIQUE(note_id, emoji)
  );

  CREATE TABLE IF NOT EXISTS replies (
    id         TEXT PRIMARY KEY,
    note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    user_id    TEXT,
    name       TEXT NOT NULL DEFAULT 'Anonymous',
    text       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS media (
    id         TEXT PRIMARY KEY,
    note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    filename   TEXT NOT NULL,
    mimetype   TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);

module.exports = db;
