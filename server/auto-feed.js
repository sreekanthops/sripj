/**
 * auto-feed.js — Admin-triggered AI feed generator
 *
 * No cron. Called manually via POST /api/admin/generate-feed.
 * Generates notes using OpenRouter AI with language-specific prompts.
 * Only dummy/seed users post — never real user accounts.
 * Languages: English, Telugu, Hindi — never mixed within a single note.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const AI_MODEL = 'meta-llama/llama-3.1-8b-instruct';

// ── helpers ───────────────────────────────────────────────────────────────────
function uid()   { return uuidv4(); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) {
  return [...arr].sort(() => 0.5 - Math.random()).slice(0, Math.min(n, arr.length));
}
function minsAgo(m) { return new Date(Date.now() - m * 60000).toISOString(); }

const FONTS = ["'Kalam',cursive", 'Georgia,serif', "'Playfair Display',serif", "'Caveat',cursive", 'system-ui,sans-serif'];
const EMOJIS = ['♡', '😢', '✨', '🫂', '💙', '🤍', '😊', '🔥', '💫', '🌧️'];

const COMMENT_POOL = [
  'This is exactly what I needed to read today.',
  'The last line — wow. Keeping this.',
  "You put into words what I couldn't.",
  'I relate to this more than I expected.',
  'Same feeling, different city 🤍',
  'Been thinking about this all day since I read it.',
  'Naaku idi chaala relate ayyindhi.',
  'Yaar yeh toh meri hi baat hai literally.',
  'I have this exact thought at the same time every night.',
  'Real one. No edits needed.',
  'Thank you for sharing this.',
  'Keep writing please.',
  '💙', '✨ this one',
];

// ── Seed user pool ────────────────────────────────────────────────────────────
const SEED_USERNAMES = [
  'aarav.writes', 'priya_journals', 'kiran.m', 'meera.thoughts', 'ravi.diaries',
  'teja.scribbles', 'sahiti.pages', 'arjun_hyd', 'niharika.ink',
  'rohit.notes', 'ananya_writes', 'dev.diaries', 'shreya.feelings',
  'vikram.space', 'deepika.daily', 'aditya.pages', 'kavya.scribbles', 'sameer.diaries',
];

const NEW_USER_FIRST = [
  'Aryan','Ishaan','Nidhi','Divya','Sai','Yash','Ritu','Manav',
  'Sneha','Kabir','Trisha','Dhruv','Pooja','Aakash','Meghna','Surya',
  'Tanvi','Karthik','Roshni','Vihaan','Swara','Aditi','Rohan','Simran',
];
const NEW_USER_LAST = [
  'Patel','Mehta','Reddy','Nair','Verma','Iyer','Shah','Rao',
  'Sharma','Kumar','Singh','Krishnan','Joshi','Das','Bhat','Pillai',
];
const CITIES = [
  'Hyderabad','Bangalore','Chennai','Mumbai','Delhi','Pune','Kolkata',
  'Kochi','Vizag','Ahmedabad','Jaipur','Chandigarh','Indore','Coimbatore',
];
const BIO_TMPL = [
  c => `${c} · just here to write things down`,
  c => `${c} · learning to be honest on paper`,
  c => `chai + diary = all I need · ${c}`,
  c => `student · overthinks · writes sometimes`,
  c => `${c} nights · words help`,
  c => `Engineer by day · feels by night · ${c}`,
  c => `Write more than I speak · ${c}`,
  c => `Words are cheaper than therapy · ${c}`,
];

// ── Language prompts ──────────────────────────────────────────────────────────
const LANG_PROMPTS = {
  en: {
    label: 'English',
    topics: [
      'missing someone you loved', 'a small moment that stayed with you',
      'feeling lonely in a crowd', 'regretting what you never said',
      'the day everything changed', 'a letter to your past self',
      'waiting for something that never came', 'growing up too fast',
      'a friendship that drifted apart', 'the silence after a fight',
    ],
    system: `You are writing a short, personal diary entry in English. 
Write in first person, emotionally honest, like a real person's private thoughts. 
Around 80–120 words. No titles. No hashtags. No markdown. Just raw diary text.`,
  },
  te: {
    label: 'Telugu',
    topics: [
      'oka person ni miss cheyyadam', 'chinnappudu jarigina oka chinna vishayam',
      'ekant lo feel avvadam', 'cheppaka poyinavi regret avvadam',
      'amma gurinchi thoughts', 'first salary memory',
      'friend ki cheppali ani anipinchindhi kaani cheyyaledu',
      'train journey lo anipinchindhi', 'new city lo adjust avvadam',
      'college days gurinchi',
    ],
    system: `You are writing a short personal diary entry in Telugu (తెలుగు). 
Use natural Telugu or Tenglish (Telugu written in English script). 
First person, emotionally honest, like real private thoughts. 
Around 80–120 words. No titles. No hashtags. No markdown. Write ONLY in Telugu/Tenglish — do NOT mix Hindi or use Hindi words.`,
  },
  hi: {
    label: 'Hindi',
    topics: [
      'kisi ko miss karna', 'ek choti si baat jo yaad rahi',
      'akela mahsoos karna', 'jo nahi kaha woh', 'ghar ki yaad',
      'purani diary mili', 'dost se door ho jaana',
      'subah ki chai aur shukar', 'parents ke saath waqt',
      'naya sheher, naya aadmi',
    ],
    system: `You are writing a short personal diary entry in Hindi. 
Use natural Hindi or Hinglish (Hindi written in English script). 
First person, emotionally honest, like real private thoughts. 
Around 80–120 words. No titles. No hashtags. No markdown. Write ONLY in Hindi/Hinglish — do NOT mix Telugu or use Telugu words.`,
  },
};

// ── AI call ───────────────────────────────────────────────────────────────────
async function generateNote(lang, customPrompt) {
  const cfg   = LANG_PROMPTS[lang] || LANG_PROMPTS.en;
  const topic = customPrompt || pick(cfg.topics);

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  'https://unsentstories.in',
      'X-Title':       'Unsent Stories',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 300,
      messages: [
        { role: 'system', content: cfg.system },
        { role: 'user',   content: `Topic: ${topic}` },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `AI error HTTP ${res.status}`);
  }

  const data = await res.json();
  const body = (data.choices?.[0]?.message?.content || '').trim();
  // Derive a short title from first line or first 6 words
  const firstLine = body.split('\n')[0].slice(0, 60).trim();
  const words     = firstLine.split(/\s+/);
  const title     = words.slice(0, Math.min(6, words.length)).join(' ').replace(/[.,!?]+$/, '');
  return { title, body };
}

// ── Main generator ────────────────────────────────────────────────────────────
/**
 * @param {object} db - better-sqlite3 db instance
 * @param {object} opts
 * @param {number} opts.feedCount   - total feed notes to create (default 20)
 * @param {number} opts.storyCount  - total story notes to create (default 5)
 * @param {number} opts.enPct       - % English  (default 40)
 * @param {number} opts.tePct       - % Telugu   (default 30)
 * @param {number} opts.hiPct       - % Hindi    (default 30)
 * @param {string} opts.customPrompt- optional custom topic override
 * @param {function} opts.onProgress- optional progress callback(msg)
 */
async function runAutoFeed(db, opts = {}) {
  const {
    feedCount   = 20,
    storyCount  = 5,
    enPct       = 40,
    tePct       = 30,
    hiPct       = 30,
    customPrompt = '',
    onProgress  = () => {},
  } = opts;

  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured');

  onProgress('Fetching seed users…');

  // Ensure seed users exist
  const PASS_HASH = bcrypt.hashSync('demo1234', 10);
  for (const uname of SEED_USERNAMES) {
    const exists = db.prepare('SELECT id FROM users WHERE username=?').get(uname);
    if (!exists) {
      const first = pick(NEW_USER_FIRST); const last = pick(NEW_USER_LAST); const city = pick(CITIES);
      db.prepare(`INSERT OR IGNORE INTO users (id,username,display_name,bio,password_hash,email,share_token,avatar_url,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(uid(), uname, `${first} ${last}`, pick(BIO_TMPL)(city), PASS_HASH,
             `${uname}@demo.in`, uid().replace(/-/g,'').slice(0,14), '', new Date().toISOString());
    }
  }

  const seedUsers = db.prepare(
    `SELECT id, username, display_name FROM users WHERE username IN (${SEED_USERNAMES.map(()=>'?').join(',')})`
  ).all(...SEED_USERNAMES);

  if (!seedUsers.length) throw new Error('No seed users found');

  // Build language distribution list
  const total = feedCount + storyCount;
  const langs = [];
  const enN = Math.round(total * enPct / 100);
  const teN = Math.round(total * tePct / 100);
  const hiN = total - enN - teN;
  for (let i = 0; i < enN; i++) langs.push('en');
  for (let i = 0; i < teN; i++) langs.push('te');
  for (let i = 0; i < hiN; i++) langs.push('hi');
  langs.sort(() => 0.5 - Math.random()); // shuffle

  const insertNote = db.prepare(`
    INSERT OR IGNORE INTO notes
      (id, user_id, title, body, font, font_size, font_weight, color_idx, is_public, is_story, story_expires_at, moderation_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'approved', ?)
  `);

  const insertReaction = db.prepare(
    `INSERT OR IGNORE INTO note_reactions (id, note_id, emoji, reactor_key, created_at) VALUES (?, ?, ?, ?, ?)`
  );
  const insertReply = db.prepare(
    `INSERT INTO replies (id, note_id, user_id, name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  );

  const createdIds = [];
  let colorIdx = 0;

  for (let i = 0; i < langs.length; i++) {
    const lang    = langs[i];
    const isStory = i < storyCount;
    const user    = pick(seedUsers);
    const storyExpires = isStory ? new Date(Date.now() + 24 * 3600 * 1000).toISOString() : null;
    // Spread timestamps: oldest is ~12h ago, newest is ~5 min ago
    const minsBack = Math.floor(5 + (i / langs.length) * 700);

    onProgress(`Generating note ${i + 1}/${langs.length} (${LANG_PROMPTS[lang].label})…`);

    let title, body;
    try {
      ({ title, body } = await generateNote(lang, customPrompt));
    } catch (err) {
      onProgress(`⚠ AI error on note ${i + 1}: ${err.message} — skipping`);
      continue;
    }

    const noteId = uid();
    insertNote.run(
      noteId, user.id, title, body,
      pick(FONTS), 14, 'normal', colorIdx % 8,
      isStory ? 1 : 0, storyExpires,
      minsAgo(minsBack)
    );
    createdIds.push({ id: noteId, userId: user.id, displayName: user.display_name });
    colorIdx++;
  }

  // Add reactions and occasional comments
  for (const note of createdIds) {
    const reactorCount = Math.floor(Math.random() * 4) + 1;
    const others = seedUsers.filter(u => u.id !== note.userId);
    pickN(others, reactorCount).forEach(u => {
      insertReaction.run(uid(), note.id, pick(EMOJIS), 'u:' + u.id, minsAgo(Math.floor(Math.random() * 60)));
    });
    if (Math.random() < 0.35 && others.length) {
      const commenter = pick(others);
      insertReply.run(uid(), note.id, commenter.id, commenter.display_name, pick(COMMENT_POOL), minsAgo(Math.floor(Math.random() * 30)));
    }
  }

  onProgress(`✅ Done — created ${createdIds.length} notes (${feedCount} feed + ${storyCount} stories)`);
  return { created: createdIds.length };
}

// No cron scheduler — admin triggers manually
module.exports = { runAutoFeed, SEED_USERNAMES };
