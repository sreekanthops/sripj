/**
 * Seed realistic dummy users + posts for testing the feed.
 * Run once: node seed-demo.js
 *
 * Creates:
 *   - 5 realistic users (aarav.writes, priya_journals, kiran.m, meera.thoughts, ravi.diaries)
 *   - Posts for gspaces2025 (10 public + 2 stories)
 *   - 6-8 posts per dummy user (all public)
 *   - Cross-reactions and comments between users
 *   - Follow relationships
 */

'use strict';
const path    = require('path');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'diary.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

// ── ensure columns exist (run if server hasn't migrated yet) ─────────────────
function hasColumn(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(r => r.name === col);
}
if (!hasColumn('notes', 'is_public'))      db.exec(`ALTER TABLE notes ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0`);
if (!hasColumn('notes', 'is_story'))       db.exec(`ALTER TABLE notes ADD COLUMN is_story INTEGER NOT NULL DEFAULT 0`);
if (!hasColumn('notes', 'story_expires_at')) db.exec(`ALTER TABLE notes ADD COLUMN story_expires_at TEXT`);
if (!hasColumn('notes', 'moderation_status')) db.exec(`ALTER TABLE notes ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'approved'`);
if (!hasColumn('notes', 'moderation_reason'))  db.exec(`ALTER TABLE notes ADD COLUMN moderation_reason TEXT NOT NULL DEFAULT ''`);

// ── helpers ──────────────────────────────────────────────────────────────────
function uid()  { return uuidv4(); }
function now(offsetMs = 0) { return new Date(Date.now() + offsetMs).toISOString(); }
function daysAgo(d) { return new Date(Date.now() - d * 86400000).toISOString(); }

function getUser(username) {
  return db.prepare('SELECT id FROM users WHERE username = ?').get(username);
}

// ── 1. Dummy users ─────────────────────────────────────────────────────────

const USERS = [
  { username: 'aarav.writes', display: 'Aarav Sharma', bio: 'Architecture student · writes at midnight', email: 'aarav.writes@demo.in' },
  { username: 'priya_journals', display: 'Priya Nair',   bio: 'Bangalore · coffee addict · feelings hoarder', email: 'priya.journals@demo.in' },
  { username: 'kiran.m',        display: 'Kiran Murthy', bio: 'Former engineer, full-time overthinker', email: 'kiran.m@demo.in' },
  { username: 'meera.thoughts', display: 'Meera Iyer',   bio: 'Reads too much · says too little · writes the rest', email: 'meera.thoughts@demo.in' },
  { username: 'ravi.diaries',   display: 'Ravi Kumar',   bio: 'Chennai · 3 AM thoughts · music & words', email: 'ravi.diaries@demo.in' },
];

const PASS_HASH = bcrypt.hashSync('demo1234', 10);

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users
    (id, username, display_name, bio, password_hash, email, share_token, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertedIds = {};
for (const u of USERS) {
  const existing = getUser(u.username);
  if (existing) { insertedIds[u.username] = existing.id; console.log(`skip user ${u.username}`); continue; }
  const id = uid();
  insertUser.run(id, u.username, u.display, u.bio, PASS_HASH, u.email,
    uid().replace(/-/g,'').slice(0,14), daysAgo(Math.floor(Math.random()*30)+5));
  insertedIds[u.username] = id;
  console.log(`created user @${u.username}`);
}

// ── 2. gspaces2025 posts ────────────────────────────────────────────────────
let gsUser = getUser('gspaces2025');
if (!gsUser) {
  const gsId = uid();
  db.prepare(`INSERT OR IGNORE INTO users (id, username, display_name, bio, password_hash, email, share_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(gsId, 'gspaces2025', 'G Spaces', 'Writing things I can never say out loud.', PASS_HASH, 'gspaces2025@demo.in', uid().replace(/-/g,'').slice(0,14), daysAgo(30));
  gsUser = { id: gsId };
  console.log('created user @gspaces2025');
}
const GS = gsUser.id;

const GS_POSTS = [
  { title: 'Why I started writing again', body: `I stopped writing after college. Life got in the way — deadlines, expectations, the noise of always being available. Then one night I found my old notebook and read something my 19-year-old self had written. It made me cry. Not because it was sad. Because it was honest in a way I hadn't allowed myself to be in years.\n\nSo here I am. Starting again. No audience in mind. Just me and whatever needs to get out.`, daysAgo: 14 },
  { title: 'The conversation I never had', body: `There's a person I haven't spoken to in three years. Not because we fought. Just because we drifted, and neither of us reached out, and somehow the silence became permanent.\n\nI think about the last time we met. We were both pretending everything was fine. Maybe that's why we stopped — we were both too tired to pretend.`, daysAgo: 11 },
  { title: 'On being the "strong" one', body: `Everyone assumes I'm fine. I'm the one who checks in on others, who shows up, who holds things together. And I am fine, most of the time.\n\nBut sometimes I wish someone would ask — not "how are you" as a greeting, but really ask. Sit down. Wait for the actual answer.\n\nI don't know what I'd say. But I'd like to find out.`, daysAgo: 9 },
  { title: 'Things I noticed today', body: `The way sunlight comes through my kitchen window at 7:15 AM. The sound of a neighbour's pressure cooker. My own breathing, which I almost never notice.\n\nI am trying to pay attention. To let the ordinary be enough.`, daysAgo: 7 },
  { title: 'A letter to my younger self', body: `You're going to fall in love with the wrong person first. It will feel like the right one. It will teach you more about yourself than any right one ever could.\n\nStop trying to be ready. You never will be. Start anyway.`, daysAgo: 6 },
  { title: 'What loneliness actually feels like', body: `It's not sadness, exactly. It's more like being in a room full of people and realising you're watching from slightly outside your own body. You're there, you're responding, you're laughing at the right moments — but some core part of you is untouched by any of it.\n\nThat's the kind of lonely you can't explain to people who haven't felt it.`, daysAgo: 5 },
  { title: 'Gratitude (an honest attempt)', body: `I'm told to write three things I'm grateful for. Okay.\n\n1. That I woke up with enough mental space to write this.\n2. The cup of chai I made too strong and drank anyway.\n3. That I am, slowly and imperfectly, learning to be a little kinder to myself.\n\nThat last one is the hardest to claim. But today I will.`, daysAgo: 3 },
  { title: 'The thing I keep almost saying', body: `There's a sentence that lives in my throat. I've almost said it to three different people in the last two years. Each time I swallowed it back.\n\nI don't even know if it's true anymore. But the not-saying of it takes up space.`, daysAgo: 2 },
  { title: 'On not having it figured out', body: `I'm twenty-seven and I still don't know what I'm doing. I thought by now there'd be some clarity — about work, about love, about what kind of person I'm becoming.\n\nInstead I have better questions. Maybe that's what growing up actually is.`, daysAgo: 1 },
  { title: 'Midnight, window, city', body: `The city doesn't sleep and neither do I. There's comfort in that. All those lights — every one of them is someone's life, their noise, their private chaos. I'm one light among millions.\n\nSmall, and strangely not alone.`, daysAgo: 0.1 },
];

// 2 story posts for gspaces2025
const GS_STORIES = [
  { title: 'Today was strange', body: 'Got lost on the way to a place I\'ve been a hundred times. Stood on the wrong platform for ten minutes. Missed my stop. Maybe I needed to take the long way.' },
  { title: '3:12 AM', body: 'Can\'t sleep. Listening to rain. Remembering a version of myself that felt lighter. Wondering where she went. Hoping she\'s still somewhere.' },
];

const insertNote = db.prepare(`
  INSERT OR IGNORE INTO notes
    (id, user_id, title, body, font, font_size, font_weight, color_idx, is_public, is_story, story_expires_at, moderation_status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)
`);

const gsPosts = [];
for (let i = 0; i < GS_POSTS.length; i++) {
  const p  = GS_POSTS[i];
  const id = uid();
  const fonts = ["'Kalam',cursive", 'Georgia,serif', "'Playfair Display',serif", "'Caveat',cursive"];
  insertNote.run(id, GS, p.title, p.body, fonts[i % fonts.length], 14, 'normal', i % 8, 1, 0, null, daysAgo(p.daysAgo));
  gsPosts.push(id);
  console.log(`created gs post: ${p.title}`);
}

// story posts (expire in 20 hours from now so they're still active)
for (const s of GS_STORIES) {
  const id      = uid();
  const expires = new Date(Date.now() + 20 * 3600 * 1000).toISOString();
  insertNote.run(id, GS, s.title, s.body, "'Kalam',cursive", 14, 'normal', 3, 1, 1, expires, daysAgo(0.05));
  console.log(`created gs story: ${s.title}`);
}

// ── 3. Dummy user posts ──────────────────────────────────────────────────────
const DUMMY_POSTS = {
  'aarav.writes': [
    { title: 'Blueprint of a feeling', body: 'Architecture taught me that the best spaces make you feel something before you understand why. That\'s how she entered my life. I didn\'t understand it. I just felt the change in the room.' },
    { title: 'Unfinished structures', body: 'My thesis is about unfinished buildings. I keep coming back to them because they don\'t pretend. They don\'t say "this is done". They say "this was attempted".\n\nI want to be more like an unfinished building.' },
    { title: 'Overheard at 2 AM', body: 'Someone playing guitar in the hostel common room. Wrong notes, right feeling. I sat outside and listened for forty minutes instead of finishing my submission.\n\nWorth it.' },
    { title: 'The city I never left', body: 'I keep planning to move to another city. I\'ve had the conversation a hundred times. But every time the decision gets close, I find something here — a chai stall, a view, a person — that tethers me.\n\nMaybe I\'m not meant to leave. Or maybe I\'m afraid of what happens if I do.' },
    { title: 'Draft 11', body: 'This entry is the eleventh attempt at writing something about my father. The other ten are deleted. This one might be too. But I\'m going to keep trying.' },
    { title: 'What I notice in old buildings', body: 'The walls remember things. You can see it in the way paint peels — in layers, like sediment. Someone was here. Someone else painted over them. Someone else over that.\n\nWe\'re all just coats of paint.' },
  ],
  'priya_journals': [
    { title: 'Things my mother never said', body: 'She showed love through feeding. By asking twice if you\'d eaten. By leaving the porch light on. By never asking why you were crying — just bringing water.\n\nI learned to speak her language late. I still miss some of it.' },
    { title: 'Coffee, 8:45 AM', body: 'My third cup. Outside, Bangalore is already loud. I\'ve been sitting here watching my phone and trying not to open Instagram. I\'m failing. But at least I know I\'m failing.\n\nSmall awareness.' },
    { title: 'The relationship I outgrew', body: 'We didn\'t break up. We just... tapered. Phone calls got shorter. Silences got longer. One day I realised I\'d stopped looking forward to talking to him.\n\nGrief is strange when there\'s no single moment to mourn.' },
    { title: 'What I want', body: 'Not a lot. A room with good light. Work that feels like mine. Friendships that don\'t require maintenance. Someone who asks follow-up questions.\n\nA dog, maybe. Definitely a dog.' },
    { title: 'On being 25', body: 'I expected to feel more settled. Instead I feel like a rough draft — the ideas are there, the structure is forming, but there\'s so much crossing out still to do.\n\nI think I\'m okay with that.' },
    { title: 'The texts I never sent', body: 'I write them out fully. Sometimes I even leave them in drafts for days. Then I delete them.\n\nNot because they\'re wrong. Because I don\'t trust the timing. Or the reaction. Or myself.' },
    { title: 'Rain thoughts', body: 'Bangalore rain is different. It doesn\'t drizzle — it commits. One moment sun, next moment the city is washed clean and everyone is pretending not to be delighted.\n\nI am always delighted.' },
  ],
  'kiran.m': [
    { title: 'Why I quit my job', body: 'Not drama. Not a breakdown. I woke up one Tuesday and the commute felt like walking into someone else\'s life. So I stopped.\n\nThree months later I still don\'t know what\'s next. I do know I\'m sleeping better.' },
    { title: 'The cost of always being available', body: 'My calendar used to be a wall of blue blocks. Every hour accounted for. I thought that was success.\n\nNow I have Thursday mornings free and I use them to do absolutely nothing. It took six weeks to stop feeling guilty.' },
    { title: 'A theory about nostalgia', body: 'We don\'t miss the past. We miss the version of ourselves who was living it. The one who didn\'t know what was coming. The one with more hope left.' },
    { title: 'What the silence said', body: 'After the last meeting, after everyone logged off, I sat in the silence of my flat and listened. No notifications. No one wanting something.\n\nI didn\'t know quiet could feel like this much.' },
    { title: 'Things I unlearned at 30', body: 'That staying busy means you\'re valuable. That a fast reply means you\'re important. That saying yes is the same as being helpful.\n\nUnlearning takes longer than learning. Nobody told me that.' },
    { title: 'The person I was at 22', body: 'I found an old Slack message from eight years ago. So certain. So wrong about so many things. So earnest.\n\nI love him a little. I\'m glad I\'m not him anymore.' },
  ],
  'meera.thoughts': [
    { title: 'Lines I underlined', body: '"The most terrible poverty is loneliness, and the feeling of being unloved." I underlined that at 16. I still return to it.\n\nSome sentences never stop being true.' },
    { title: 'The book I keep starting', body: 'I\'ve started The Brothers Karamazov four times. I always stop at the same chapter — when Alyosha weeps in the monastery garden.\n\nI\'m not sure I\'m ready for what comes after.' },
    { title: 'Quiet Sunday', body: 'The weekend version of myself is different. Slower. More permissive. Lets dishes sit. Eats standing at the counter. Reads until it\'s not exactly reading anymore, just floating with words.\n\nI like her.' },
    { title: 'People I miss but can\'t call', body: 'There are names on my phone I\'ll never delete. Not because I expect to call. Just because I\'m not ready for them to stop existing in my contact list.\n\nThat feels like the gentlest kind of grief.' },
    { title: 'On not finishing things', body: 'Four half-read books. A knitting project from 2021. A language-learning app with a 14-day streak. A letter I started writing to someone who moved away.\n\nI\'ve decided this is not a character flaw. It\'s just evidence of a curious person.' },
    { title: 'When the library was home', body: 'In school I used to go to the library at lunch instead of eating with the others. I wasn\'t lonely. I was in exactly the right place.\n\nI still feel most myself surrounded by books and no obligation to talk.' },
  ],
  'ravi.diaries': [
    { title: 'The songs that found me', body: 'Not the ones I chose. The ones that were playing when something happened — a break-up, an empty bus, the first day of something new. Now I can\'t hear them without time-travelling.\n\nMusic is just bottled moments.' },
    { title: 'Chennai, 4 PM', body: 'The heat is honest. It doesn\'t pretend. By 4 PM the city is golden and brutal and I\'m on my bike going nowhere in particular, feeling completely alive.\n\nI will never leave this city.' },
    { title: 'What she said before she left', body: '"You\'re going to be fine." I believed her then. I don\'t know if I believe it now. But I keep saying it to myself anyway, like enough repetition might make it true.' },
    { title: 'A night with no plan', body: 'Met a friend for chai. Ended up walking Marina Beach at midnight talking about parents and ambition and whether any of us really choose our lives or just navigate them.\n\nBest night in months.' },
    { title: 'The version of me I perform', body: 'At work I\'m confident. Direct. Funny on cue. At home I eat cereal for dinner and watch the same movie for the fifth time because the ending is predictable and that\'s the point.\n\nBoth are real. The gap between them is also real.' },
    { title: 'Trying to be less afraid', body: 'Not of big things. Of the small ones: sending the voice note instead of typing, telling someone I missed them, saying yes to the thing that costs more than convenience.\n\nI\'m practising. Slowly.' },
  ],
};

for (const [username, posts] of Object.entries(DUMMY_POSTS)) {
  const uid_val = insertedIds[username] || getUser(username)?.id;
  if (!uid_val) { console.warn(`no user id for ${username}`); continue; }
  const fonts = ["'Kalam',cursive", 'Georgia,serif', "'Playfair Display',serif", "'Caveat',cursive", "'Kalam',cursive", 'Georgia,serif'];
  for (let i = 0; i < posts.length; i++) {
    const p  = posts[i];
    const id = uid();
    insertNote.run(id, uid_val, p.title, p.body, fonts[i % fonts.length], 14, 'normal', (i + 2) % 8, 1, 0, null, daysAgo(Math.random() * 12 + 0.5));
    console.log(`post by @${username}: ${p.title}`);
  }
}

// ── 4. Follow relationships ──────────────────────────────────────────────────
const follows = [
  ['aarav.writes',    'gspaces2025'],
  ['aarav.writes',    'priya_journals'],
  ['aarav.writes',    'kiran.m'],
  ['priya_journals',  'gspaces2025'],
  ['priya_journals',  'meera.thoughts'],
  ['priya_journals',  'ravi.diaries'],
  ['kiran.m',         'gspaces2025'],
  ['kiran.m',         'aarav.writes'],
  ['kiran.m',         'ravi.diaries'],
  ['meera.thoughts',  'gspaces2025'],
  ['meera.thoughts',  'aarav.writes'],
  ['meera.thoughts',  'priya_journals'],
  ['ravi.diaries',    'gspaces2025'],
  ['ravi.diaries',    'kiran.m'],
  ['ravi.diaries',    'meera.thoughts'],
];

const insertFollow = db.prepare(`INSERT OR IGNORE INTO follows (id, follower_id, followee_id, created_at) VALUES (?, ?, ?, ?)`);
for (const [from, to] of follows) {
  const fId = insertedIds[from] || getUser(from)?.id;
  const tId = to === 'gspaces2025' ? GS : (insertedIds[to] || getUser(to)?.id);
  if (!fId || !tId) continue;
  insertFollow.run(uid(), fId, tId, daysAgo(Math.random() * 10));
  console.log(`follow: @${from} → @${to}`);
}

// ── 5. Reactions on gspaces2025 posts ───────────────────────────────────────
const EMOJIS = ['♡', '😢', '✨', '🫂', '💙', '🤍'];
const reactors = Object.values(insertedIds).filter(Boolean);

const insertReaction = db.prepare(`
  INSERT OR IGNORE INTO note_reactions (id, note_id, emoji, reactor_key, created_at)
  VALUES (?, ?, ?, ?, ?)
`);

for (const noteId of gsPosts) {
  // 2-4 random users react with different emojis
  const shuffled = reactors.sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 3) + 2);
  for (const reactorId of shuffled) {
    const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    insertReaction.run(uid(), noteId, emoji, 'u:' + reactorId, daysAgo(Math.random() * 2));
  }
}
console.log('reactions added to gspaces2025 posts');

// ── 6. Comments (replies) on gspaces2025 posts ───────────────────────────────
const COMMENTS = [
  ['aarav.writes',    'This is exactly what I needed to read today. Thank you for putting it into words.'],
  ['priya_journals',  'The part about the silence — I felt that so deeply. Saving this.'],
  ['kiran.m',         'I have a draft with the same title sitting in my notes app. Never published it. Maybe I should.'],
  ['meera.thoughts',  'You write the way I think at 3 AM. In the best possible way.'],
  ['ravi.diaries',    'This hit different. The last two lines especially. 💙'],
  ['priya_journals',  'I keep coming back to this. Something about it feels like being seen.'],
  ['meera.thoughts',  'I sent this to someone who needed it. Hope that\'s okay. They said thank you.'],
  ['aarav.writes',    'The honest ones are always the ones that stay with you.'],
];

const insertReply = db.prepare(`
  INSERT INTO replies (id, note_id, user_id, name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)
`);

// Add 1-2 comments to random gspaces posts
for (let i = 0; i < gsPosts.length; i++) {
  const numComments = Math.floor(Math.random() * 2) + 1;
  for (let c = 0; c < numComments; c++) {
    const comment = COMMENTS[(i + c) % COMMENTS.length];
    const commenterName = comment[0];
    const commenterId   = insertedIds[commenterName] || getUser(commenterName)?.id;
    const commenterObj  = USERS.find(u => u.username === commenterName);
    if (!commenterId) continue;
    insertReply.run(uid(), gsPosts[i], commenterId, commenterObj?.display || commenterName, comment[1], daysAgo(Math.random() * 2));
  }
}
console.log('comments added');

// ── 7. Story posts for dummy users ──────────────────────────────────────────
const STORY_BODIES = [
  { username: 'aarav.writes',    title: 'Studio at dawn', body: 'Been here since 4 AM. Light is coming through the drafting table window now. It\'s going to be a good day.' },
  { username: 'priya_journals',  title: 'Current mood', body: 'Sitting with chai watching the rain and absolutely refusing to be productive. No notes. No regrets.' },
  { username: 'kiran.m',         title: 'Good news', body: 'Something shifted today. Can\'t explain it yet. Just wanted to note it down before it fades.' },
  { username: 'meera.thoughts',  title: 'What I\'m reading', body: 'Page 200 of something I can\'t put down. This never gets old.' },
  { username: 'ravi.diaries',    title: 'Marina at 11 PM', body: 'Wind, waves, a good song on repeat. Life is okay tonight.' },
];

for (const s of STORY_BODIES) {
  const uid_val = insertedIds[s.username] || getUser(s.username)?.id;
  if (!uid_val) continue;
  const id      = uid();
  const expires = new Date(Date.now() + (18 + Math.random() * 6) * 3600 * 1000).toISOString();
  insertNote.run(id, uid_val, s.title, s.body, "'Kalam',cursive", 14, 'normal', 4, 1, 1, expires, daysAgo(0.02));
  console.log(`story by @${s.username}: ${s.title}`);
}

console.log('\n✅ Seed complete!');
