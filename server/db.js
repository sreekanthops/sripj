const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'diary.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── SCHEMA ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id          TEXT PRIMARY KEY,
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

// ── SEED DEMO DATA ────────────────────────────────────────────────────────────

const count = db.prepare('SELECT COUNT(*) as c FROM notes').get();
if (count.c === 0) {
  const insert = db.prepare(`
    INSERT INTO notes (id, title, body, font, font_size, font_weight, color_idx, music_url, views, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = Date.now();
  const demoNotes = [
    ['demo1', 'Morning Thoughts',
     "Today the sunlight came through the curtains differently.\nI felt a calm I haven't had in weeks. Maybe it's the season — or maybe I'm finally slowing down enough to notice the small things.\n\nI made coffee and sat by the window for twenty minutes without checking my phone. That's a first.",
     'Georgia,serif', 15, 'normal', 0, '', 24, new Date(now - 4*86400000).toISOString()],
    ['demo2', 'A Rainy Evening',
     "Rain on the window again.\n\nI made chamomile tea and sat in the armchair with a book. No phone. No screens. Just rain and the faint sound of traffic below.\n\nSome evenings are perfect exactly because nothing happens.",
     "'Palatino Linotype',serif", 15, 'italic', 1, '', 17, new Date(now - 2*86400000).toISOString()],
    ['demo3', "Things I'm Grateful For",
     "1. Friends who check in.\n2. Books that ask hard questions.\n3. The smell of rain on dry earth.\n4. A warm meal after a long day.\n5. This little diary.",
     'Georgia,serif', 14, 'normal', 4, '', 38, new Date(now - 86400000).toISOString()],
  ];
  const insertReaction = db.prepare(`
    INSERT OR IGNORE INTO reactions (id, note_id, emoji, count) VALUES (?, ?, ?, ?)
  `);
  const insertReply = db.prepare(`
    INSERT INTO replies (id, note_id, name, text, created_at) VALUES (?, ?, ?, ?, ?)
  `);

  demoNotes.forEach(n => insert.run(...n));
  insertReaction.run('r1','demo1','❤️',4);
  insertReaction.run('r2','demo1','😂',1);
  insertReaction.run('r3','demo2','😢',2);
  insertReaction.run('r4','demo2','🔥',1);
  insertReaction.run('r5','demo3','❤️',6);
  insertReaction.run('r6','demo3','🎉',3);
  insertReply.run('rep1','demo1','Reader','This really resonated with me. Thank you for sharing ❤️', new Date(now - 3*86400000).toISOString());
  insertReply.run('rep2','demo3','Sara','Number 3 is so real! Love this entry.', new Date(now - 70000000).toISOString());
}

module.exports = db;
