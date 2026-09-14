/**
 * auto-feed.js — Daily feed auto-generator
 *
 * Runs inside the server process via a daily cron.
 * Each day it generates 50 posts from a rotating pool of:
 *   - Existing seed users (old posts in their voice/language)
 *   - A handful of "new" users (created fresh, joining daily)
 *
 * Multilingual pool: English, Telugu/Tinglish, Hindi/Hinglish.
 * All posts are natural, personal, diary-like — no copy-paste online content.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// ── helpers ───────────────────────────────────────────────────────────────────
function uid() { return uuidv4(); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(n, arr.length));
}
function hoursAgo(h) { return new Date(Date.now() - h * 3600000).toISOString(); }
function minsAgo(m)  { return new Date(Date.now() - m * 60000).toISOString(); }

const FONTS = [
  "'Kalam',cursive",
  'Georgia,serif',
  "'Playfair Display',serif",
  "'Caveat',cursive",
  'system-ui,sans-serif',
];

const EMOJIS = ['♡', '😢', '✨', '🫂', '💙', '🤍', '😊', '🔥', '💫', '🌧️'];

// ── Seed user pool (existing users by username) ───────────────────────────────
const SEED_USERNAMES = [
  'aarav.writes', 'priya_journals', 'kiran.m', 'meera.thoughts', 'ravi.diaries',
  'teja.scribbles', 'sahiti.pages', 'arjun_hyd', 'niharika.ink',
  'rohit.notes', 'ananya_writes', 'dev.diaries', 'shreya.feelings',
  'vikram.space', 'deepika.daily', 'aditya.pages', 'kavya.scribbles', 'sameer.diaries',
];

// ── New user templates (one batch per day joins as fresh accounts) ─────────────
// Names drawn from these pools and combined randomly
const NEW_USER_FIRST_NAMES = [
  'Aryan', 'Ishaan', 'Nidhi', 'Divya', 'Sai', 'Yash', 'Ritu', 'Manav',
  'Sneha', 'Kabir', 'Trisha', 'Dhruv', 'Pooja', 'Aakash', 'Meghna', 'Surya',
  'Tanvi', 'Karthik', 'Roshni', 'Vihaan', 'Swara', 'Aditi', 'Rohan', 'Simran',
  'Neel', 'Kriti', 'Farhan', 'Anushka', 'Tarun', 'Lavanya', 'Mihir', 'Khushi',
];
const NEW_USER_LAST_NAMES = [
  'Patel', 'Mehta', 'Reddy', 'Nair', 'Verma', 'Iyer', 'Shah', 'Rao',
  'Sharma', 'Kumar', 'Singh', 'Krishnan', 'Joshi', 'Das', 'Bhat', 'Pillai',
  'Shetty', 'Gupta', 'Mishra', 'Chandra', 'Saxena', 'Agarwal', 'Tiwari', 'Kapoor',
];
const NEW_USER_BIO_TEMPLATES = [
  (city) => `${city} · just here to write things down`,
  (city) => `${city} · learning to be honest on paper`,
  (city) => `chai + diary = all I need · ${city}`,
  (city) => `student · overthinks · writes sometimes`,
  (city) => `${city} nights · words help`,
  (city) => `Engineer by day · feels by night · ${city}`,
  (city) => `Still figuring it out · ${city}`,
  (city) => `Write more than I speak · ${city}`,
  (city) => `${city} · roz kuch naya likhna chahta/chahti hoon`,
  (city) => `Words are cheaper than therapy · ${city}`,
];
const CITIES = [
  'Hyderabad', 'Bangalore', 'Chennai', 'Mumbai', 'Delhi',
  'Pune', 'Kolkata', 'Kochi', 'Vizag', 'Ahmedabad', 'Jaipur',
  'Chandigarh', 'Indore', 'Bhopal', 'Nagpur', 'Coimbatore',
];

// ── Large content pools (auto-generator draws from these) ─────────────────────

const EN_POSTS = [
  // Daily life / feelings
  { title: 'small things lately',        body: `The way my tea gets cold before I finish it. The exact sound the building lift makes at 11 PM. My own face in the bathroom mirror at 7 AM — a little puffy, not entirely ready.\n\nI'm paying attention more. I don't know why. It's helping.` },
  { title: 'what I didn\'t say today',   body: `Three different moments today where I had something real to say and swallowed it instead. Not because it was wrong. Just because I wasn't sure it would land.\n\nMaybe I'll say it tomorrow. Maybe tomorrow I'll swallow that too.` },
  { title: 'getting used to being alone', body: `Living alone is not what I expected. Not lonely exactly. More like… quiet in a way you have to learn to fill yourself.\n\nI've gotten okay at it. Some evenings I even prefer it.` },
  { title: 'conversation from last week', body: `My friend said "you're not responsible for other people's emotions." I've been sitting with that for 7 days.\n\nI know it's true. I don't know how to act like it's true yet. Working on it.` },
  { title: 'things I notice at 10 PM',   body: `Neighbour's TV. Fan. The distant sound of traffic that never fully stops. My phone sitting face-down because I decided that one hour was mine.\n\nThe smallest boundaries feel the biggest.` },
  { title: 'the call I keep postponing', body: `I've been meaning to call my cousin for two months. Not because anything bad happened. Just because "later" keeps winning against "now."\n\nToday: still didn't call. Tomorrow: actually might.` },
  { title: 'trying something new',       body: `Started waking up 30 mins earlier this week. No big plans — just wanted to see what a slower morning felt like.\n\nTurns out slow mornings are kind of amazing? Who knew. (Everyone probably knew.)` },
  { title: 'the friendship update',      body: `We texted for the first time in 3 months. It was fine. A little careful. But there.\n\nSome friendships hibernate. The ones that matter come back when you let them.` },
  { title: 'on comparison',              body: `Scrolled through someone's life online for 20 minutes and came away feeling smaller. This is a pattern I know well and still walk into.\n\nDeleted the app again. Day 1 again. That's fine.` },
  { title: 'what rest actually feels like', body: `Took a full Saturday off for the first time in maybe 6 weeks. Did nothing strategic. Ate late. Finished a book. Ordered food I didn't need to cook.\n\nFelt guilty for 2 hours then just... stopped. Let it be rest.` },
  { title: 'after the argument',         body: `We argued about something small that wasn't really about the small thing. We both knew it. Neither of us said the real thing.\n\nMade up by morning. Still haven't said the real thing. Maybe next time.` },
  { title: 'growth is quiet',            body: `Nobody tells you that growing up is mostly just noticing your own patterns. No big revelations. Just: oh there I go again. And then, slowly — oh, I stopped this time.\n\nThat's it. That's the whole arc.` },
  { title: 'city sounds before sleep',   body: `Rain on the AC unit outside. A dog somewhere far. Someone on a call, voice rising and falling. The building settling.\n\nI don't need silence to sleep anymore. I just need familiar sounds.` },
  { title: 'things I\'m proud of',       body: `Not the visible stuff. The quiet ones: texting someone I was thinking about instead of assuming they knew. Drinking water when I was anxious instead of doomscrolling. Going for the walk.\n\nSmall. Real.` },
  { title: 'the long way home',          body: `Took a different route today. Ten minutes longer, one less traffic light, a chai stall I've never stopped at. I stopped.\n\nBest ten extra minutes I've spent in a while.` },
  { title: 'what productivity feels like today', body: `Made one real decision. Replied to three messages I'd been avoiding. Did not refresh my email every 8 minutes.\n\nThis is what a good work day looks like for me now. I've adjusted my standards and I'm at peace with it.` },
  { title: 'missing home today',         body: `No reason in particular. Just that afternoon feeling when the light goes yellow and you know everyone at home is having chai right now and you're 800 km away.\n\nCalled. They were having chai. It helped.` },
  { title: 'some days are just fine',    body: `Not great. Not bad. Just fine. Work was fine. Lunch was fine. Came home, cooked something okay, watched half an episode, fell asleep.\n\nFine is underrated. Fine means nothing broke. Fine is rest.` },
  // reflective / introspective
  { title: 'the version of me I\'m becoming', body: `I notice I apologize less. Offer explanations less. Ask for what I need more.\n\nI don't know if this is growth or just tired. Hoping growth.` },
  { title: 'on being seen',              body: `Someone complimented something I actually worked hard on today. Not the surface thing — the real effort underneath.\n\nI didn't deflect. I said thank you and meant it. That's new.` },
  { title: 'about the 3 AM thoughts',   body: `3 AM thoughts are not real. 3 AM thoughts are the ones your brain saved up all day because they didn't feel safe to process in daylight.\n\nWrite them down. Don't reply to them.` },
  { title: 'what changes slowly',       body: `I used to need people to like me immediately. Now I'm okay with being an acquired taste.\n\nI don't know when that shifted. Sometime in my mid-twenties, I think.` },
  { title: 'home is a feeling',          body: `I've lived in four different cities. None of them were home the day I arrived. All of them became home eventually.\n\nHome is not a place. It's the accumulation of meals and failures and ordinary evenings in one spot.` },
  // work / life
  { title: 'the meeting that didn\'t happen', body: `Cancelled at the last minute. That hour turned into a walk. The walk turned into an idea. The idea actually matters.\n\nSometimes the cancelled thing is the thing.` },
  { title: 'on deadlines',              body: `Every deadline feels impossible until approximately 2 hours before it. Then something takes over. I don't understand it and I've stopped trying to.\n\nJust: survive until 2 hours before. Trust the process.` },
];

const TE_POSTS = [  // Telugu / Tinglish
  { title: 'intha pressure ento',        body: `Exams ki 10 days unnayi. Study cheyya vastuundi kaani mind settle avvatledu. Oka page open chestunte vere thoughts vastunayi.\n\nOka break theeskunanu — tea chesukuni balcony lo kurchunanu. Aa 15 minutes chaala help chesindhi.` },
  { title: 'naadu roju',                 body: `Subah late ga lecchukunanu. Auto dorikaatledu. Office lo meeting miss ayyindhi. Lunch cold gaa vachindhi. Inka raat ki light poyi.\n\nKaani raat ki neighbour hot idli tharaa ichi — aa oka vishayam entire roju fix chesindhi naku.` },
  { title: 'phone lo pic chusanu',       body: `2 years back ga meeru tolibari poyinappudu photo chusanu. Andaru young ga, unconcerned ga kanipistunnaru.\n\nEnni maruvulu jarigaayo. Andulo entho manchiga ayindhi anipistundhi ippudu.` },
  { title: 'amma gurinchi',             body: `Amma ki technically challenge istaanu — smartphone use cheyyadam, UPI cheyyadam — kaani aayana notes lo gurtupettukuntundhi anni.\n\nNenu aayanaki cheppinappudu aayana "nuvve naa teacher" antundhi. Hrudayam heavy avutundhi.` },
  { title: 'raat lo ee thoughts',       body: `Padukunattu ledu kaani nijam ga anipisleddhu. Oka chota sound, oka old song — anni memories vast unnai.\n\nEe raat moments ki label ledu. Kaani ivi feel avutunnai — anduke raastunna.` },
  { title: 'college lo friend gurinchi', body: `Oka bestie unaadu — college lo chinna issue ki fight ayyaam. Taravata cheppukunaamu. Aa incident gurinchi ippudu maatlaadite we both navvutaam.\n\nForgiveness chaala easy avutundhi time tho.` },
  { title: 'first salary memory',       body: `First salary vachinappudu naanna ki shirt konnanu. 499 shirt — kaani aa roju naanna face petti chusina look nenu maravalenu.\n\nMonetary value em ledu. Feeling is everything.` },
  { title: 'weekend plan ilaa ayyindhi', body: `Friday night "productive weekend" ani plan chesanu. Saturday: 11 AM varaku padukunnanu. Sunday: binge watched 4 episodes. Total productive hours: 0.\n\nKaani battery recharged. Monday ki ready ga unna.` },
  { title: 'new city lo adjust',        body: `Ee city ki vachina first week chala lonely feel ayyindhi. Language different, food different, people unknown.\n\nIppudu 6 months taravata — oka coffee shop naadu, oka colony road naadu, oka friendly neighbour unnadu. Slowly home aytundhi.` },
  { title: 'chinna veeraidi', body: `Chinnappudu rain ki dress teesukunuttu velledi. Ippudu umbrella theesukoni raatuku cheppudu.\n\nAdi maturity a, fear a? Edayna age thone poyindhi. Miss chestunna aa version ni.` },
  { title: 'train journey lo',           body: `Train lo window seat dorikinadhi. Bahar chustunnanu — towns, fields, small bridges, vendors at each station.\n\nNenu oka moving point, vaarike static. Ya vaare moving, nenu static. Depends on perspective.` },
  { title: 'neeku cheppali antundhi',   body: `Oka thought nenu miss chestunam oka person ni — kaani cheppaleka poyanu.\n\nTelephone lo "hiii just checking" ani message chesanu. Aayana "aww same" ani back chesaru. Cheppindi laa feel ayyindhi.` },
];

const HI_POSTS = [  // Hindi / Hinglish
  { title: 'aaj ka mood off tha',       body: `Kuch khaas reason nahi tha. Bas woh din tha jab sab normal tha par kuch theek nahi lag raha tha.\n\nAisa hota hai. Naam nahi hota uska. Bas hota hai.` },
  { title: 'ghar ki yaad',              body: `Ek gana bajaa aaj — woh jo Maa ghar pe often gaan karti thi. Ruk gaya.\n\nKuch saare din ki thakaan us ek gane mein ghul gayi. Call ki. Theek lag gaya.` },
  { title: 'kal subah ki baat',         body: `Kal subah uthke chai banayi aur balcony pe baitha raha. Koi plan nahi, koi phone nahi. Sirf chai, subah, aur ek pal jo slow tha.\n\nYeh din mein bohot baar yaad aaya. Chhoti cheezein hoti hain jo yaad rehti hain.` },
  { title: 'jab sab ek saath aata hai', body: `Office pressure, ghar ki tension, dost se baat nahi, khud pe gussa. Sab ek hi din aaya.\n\nKuch nahi kiya. Just slept early. Subah thoda theek tha. Sometimes that's the only plan.` },
  { title: 'naya sheher, naya aadmi',  body: `Is city mein aaye 8 mahine ho gaye. Pehle sirf akela lagta tha. Ab ek chai wala jaanta hai, ek neighbour hai jo nod karta hai, ek street familiar lagti hai.\n\nGhulna slow hota hai. Par hota hai.` },
  { title: 'purana notebook mila',     body: `Ek purani diary mili — 5 saal pehle ki. Woh main itna alag tha ki hassi bhi aayi aur thoda rona bhi.\n\nKitna badal gaya hoon. Kitna seedha tha tab. Dono sach hain.` },
  { title: 'kuch nahi likha tha aaj',  body: `Aaj likh nahi raha tha. Phir baith gaya. Kuch nahi socha. Bas pen liya aur shuru kar diya.\n\nYahi hota hai na — start karna hi muskil hota hai. Baki sab ho jaata hai.` },
  { title: 'dono theek hain',          body: `Dost se puraani baat hui thi — almost argument. Both of us ne kuch din baad sorry bol diya. Koi bada scene nahi.\n\nChhoti friendships badi hoti hain. Jo bina drama ke milte hain — woh rehte hain.` },
  { title: 'koi chhota kaam kiya aaj', body: `Ek mahine se ek chota kaam pending tha. Aaj 10 minute mein kiya.\n\nItna time laga sochtey sochtey jo 10 minute mein ho jaata. Yeh baat apne aap pe aajkal zyada notice karta hoon.` },
  { title: 'khud ke saath waqt',       body: `Aaj koi plan nahi tha. Pura din mera tha. Kuch productive nahi kiya. Bas woh kiya jo man kiya.\n\nPehli baar akela hona relaxing laga. Seedha nahi tha yahan tak pahunchna. Par pahunch gaya.` },
  { title: 'parents ke liye',          body: `Aaj papa ne kuch aisa kaha jo main sunna chahta tha. Kuch bata nahi sakta. Par woh sunke laga — sab theek hai.\n\nKuch words bahut kum aayi jagah lete hain. Woh wale the.` },
  { title: 'raat ki entry',            body: `Raat ke 11:45 hain. Sab so gaye. Main yahan hoon.\n\nKuch khas likhne ko nahi hai. Bas likha — kyunki yeh din hua. Yeh bhi zaroori hai.` },
];

// ── New user post pool (for newly-joined users — simpler, shorter) ──────────
const NEW_USER_POSTS = [
  { title: 'first entry',              body: `Not sure why I started this. Maybe I just needed somewhere to put things.\n\nLet's see how this goes.` },
  { title: 'day one here',             body: `Started an account today. Seems like a place for honest writing. I want to write honestly.\n\nSomewhere to start.` },
  { title: 'yahan naya hoon',          body: `Aaj join kiya. Sochta hoon likhna chahiye — din ka, feelings ka, kuch bhi. Shayad yahan achha lage.\n\nPehla post. Let's go.` },
  { title: 'starting this',            body: `Been meaning to journal properly for months. Here we go finally.\n\nNo pressure. Just writing.` },
  { title: 'ee app try chestunna',     body: `Friend suggest chesadu ee app ni. Personal feelings raayataniki ok ga untundhi ani anipistundhi.\n\nChusdam — may post cheyyadam habit avutundha ani.` },
  { title: 'oka try',                  body: `Diary raayataniki pen paper kanna phone easy ani oka friend cheppadu. Try chestunna.\n\nMana thoughts ni ikkade pettataniki okay ga feel avutundhi.` },
  { title: 'just testing this out',    body: `Friend mentioned this app. Thought I'd give it a shot.\n\nMaybe writing here will help me think better. Or maybe I'll abandon it in three days. Only one way to know.` },
  { title: 'hello from day one',       body: `Today was rough. Found this app. Thought — why not.\n\nIf nothing else, at least I wrote something today.` },
  { title: 'ek naya shuruat',         body: `Kabhi diary nahi likha. Aaj likha. Pata nahi aage bhi likhoon ya nahi.\n\nPar aaj toh likha. Yahi kaafi hai.` },
  { title: 'Vizag se hi',              body: `Vizag lo unaanu. Ee app start chesanu — kuch raayataniki okay jagah ani.\n\nFirst post — just saying hi. More soon.` },
];

// ── Comment pool ──────────────────────────────────────────────────────────────
const COMMENT_POOL = [
  'This is exactly what I needed to read today.',
  'The last line — wow. Keeping this.',
  "You put into words what I couldn't.",
  'Sent this to a friend who needed it.',
  'I relate to this more than I expected.',
  'Simple and real. Love this.',
  'Same feeling, different city 🤍',
  'Been thinking about this all day since I read it.',
  'Naaku idi chaala relate ayyindhi. Thank you for writing.',
  'Yaar yeh toh meri hi baat hai literally.',
  'Idhi cheppataniki words eppudu raaledu naaku. You did it.',
  'Ee line chaalaa hit ayyindhi — kept rereading.',
  'Bahut sahi baat. Aaj ki entry mein yeh save kar raha hoon.',
  'I have this exact thought at the same time every night.',
  'The part about quiet — I felt that one.',
  '💙',
  '✨ this one',
  'Real one. No edits needed.',
  'Thank you for sharing this.',
  'Keep writing please.',
];

// ── Main auto-generate function ───────────────────────────────────────────────
function runAutoFeed(db) {
  console.log('[auto-feed] Starting daily run…');

  const today = new Date().toISOString().slice(0, 10);

  // Check if already ran today
  const ranToday = db.prepare(
    `SELECT COUNT(*) as c FROM notes WHERE moderation_status='approved' AND is_story=0 AND DATE(created_at)=?`
  ).get(today);
  if (ranToday.c >= 50) {
    console.log(`[auto-feed] Already have ${ranToday.c} posts today, skipping.`);
    return;
  }

  const insertNote = db.prepare(`
    INSERT OR IGNORE INTO notes
      (id, user_id, title, body, font, font_size, font_weight, color_idx, is_public, is_story, story_expires_at, moderation_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NULL, 'approved', ?)
  `);

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users
      (id, username, display_name, bio, password_hash, email, share_token, avatar_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFollow = db.prepare(
    `INSERT OR IGNORE INTO follows (id, follower_id, followee_id, created_at) VALUES (?, ?, ?, ?)`
  );

  const insertReaction = db.prepare(
    `INSERT OR IGNORE INTO note_reactions (id, note_id, emoji, reactor_key, created_at) VALUES (?, ?, ?, ?, ?)`
  );

  const insertReply = db.prepare(
    `INSERT INTO replies (id, note_id, user_id, name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  );

  // Fetch all existing seed user IDs
  const seedUsers = db.prepare(
    `SELECT id, username, display_name FROM users WHERE username IN (${SEED_USERNAMES.map(() => '?').join(',')})`
  ).all(...SEED_USERNAMES);

  if (!seedUsers.length) {
    console.warn('[auto-feed] No seed users found. Run seed-demo.js first.');
    return;
  }

  const PASS_HASH = bcrypt.hashSync('demo1234', 10);

  // ── 1. Create 2–3 new users today ─────────────────────────────────────────
  const newUsersToday = Math.floor(Math.random() * 2) + 2; // 2–3
  const newUsers = [];

  for (let i = 0; i < newUsersToday; i++) {
    const first = pick(NEW_USER_FIRST_NAMES);
    const last  = pick(NEW_USER_LAST_NAMES);
    const city  = pick(CITIES);
    const suffix = Math.floor(Math.random() * 900) + 100;
    const username = `${first.toLowerCase()}.${last.toLowerCase()}${suffix}`;
    const display  = `${first} ${last}`;
    const bio      = pick(NEW_USER_BIO_TEMPLATES)(city);
    const email    = `${username}@demo.in`;
    const avatars  = [
      '/global-images/avatar-aarav.svg', '/global-images/avatar-priya.svg',
      '/global-images/avatar-kiran.svg', '/global-images/avatar-meera.svg',
      '/global-images/avatar-ravi.svg',
    ];
    const id = uid();
    insertUser.run(
      id, username, display, bio, PASS_HASH, email,
      uid().replace(/-/g,'').slice(0,14),
      pick(avatars),
      minsAgo(Math.floor(Math.random() * 120))
    );
    newUsers.push({ id, username, display });
    console.log(`[auto-feed] new user @${username}`);
  }

  // ── 2. Assign posts: ~35 from seed users, ~15 from new users ──────────────
  const allPostData = [];

  // 35 posts from existing seed users
  const postPool = [
    ...EN_POSTS.map(p => ({ ...p, lang: 'en' })),
    ...TE_POSTS.map(p => ({ ...p, lang: 'te' })),
    ...HI_POSTS.map(p => ({ ...p, lang: 'hi' })),
  ];

  const shuffledPool = [...postPool].sort(() => 0.5 - Math.random());

  for (let i = 0; i < 35; i++) {
    const user = pick(seedUsers);
    const post = shuffledPool[i % shuffledPool.length];
    allPostData.push({
      userId: user.id,
      display: user.display_name,
      title: post.title,
      body: post.body,
      minutesAgo: Math.floor(Math.random() * 900) + 5, // spread across ~15 hours
    });
  }

  // 15 posts from new users (2–3 posts each)
  for (const nu of newUsers) {
    const count = Math.floor(15 / newUsersToday);
    const shuffledNew = [...NEW_USER_POSTS].sort(() => 0.5 - Math.random());
    for (let i = 0; i < count; i++) {
      const post = shuffledNew[i % shuffledNew.length];
      allPostData.push({
        userId: nu.id,
        display: nu.display,
        title: post.title,
        body: post.body,
        minutesAgo: Math.floor(Math.random() * 60),
      });
    }
  }

  // Sort by minutesAgo desc so oldest comes first
  allPostData.sort((a, b) => b.minutesAgo - a.minutesAgo);

  const insertedNoteIds = [];
  let colorIdx = 0;
  for (const p of allPostData) {
    const id = uid();
    insertNote.run(
      id, p.userId, p.title, p.body,
      pick(FONTS), 14, 'normal', colorIdx % 8,
      minsAgo(p.minutesAgo)
    );
    insertedNoteIds.push({ id, userId: p.userId, display: p.display });
    colorIdx++;
  }
  console.log(`[auto-feed] inserted ${allPostData.length} posts`);

  // ── 3. Make new users follow some seed users ───────────────────────────────
  for (const nu of newUsers) {
    const toFollow = pickN(seedUsers, Math.floor(Math.random() * 4) + 3);
    for (const su of toFollow) {
      insertFollow.run(uid(), nu.id, su.id, minsAgo(Math.floor(Math.random() * 30)));
    }
    // A few seed users follow new users back
    const followBack = pickN(seedUsers, 2);
    for (const su of followBack) {
      insertFollow.run(uid(), su.id, nu.id, minsAgo(Math.floor(Math.random() * 20)));
    }
  }

  // ── 4. Reactions on today's posts ─────────────────────────────────────────
  const allUserIds = [
    ...seedUsers.map(u => u.id),
    ...newUsers.map(u => u.id),
  ];

  for (const note of insertedNoteIds) {
    const reactorCount = Math.floor(Math.random() * 4) + 1;
    const reactors = pickN(allUserIds.filter(id => id !== note.userId), reactorCount);
    for (const rId of reactors) {
      insertReaction.run(uid(), note.id, pick(EMOJIS), 'u:' + rId, minsAgo(Math.floor(Math.random() * 60)));
    }
  }

  // ── 5. Comments on ~30% of today's posts ──────────────────────────────────
  const commenterUsers = db.prepare(
    `SELECT id, display_name FROM users WHERE id IN (${allUserIds.map(() => '?').join(',')}) ORDER BY RANDOM() LIMIT 10`
  ).all(...allUserIds);

  for (const note of insertedNoteIds) {
    if (Math.random() < 0.3 && commenterUsers.length) {
      const commenter = pick(commenterUsers.filter(u => u.id !== note.userId));
      if (!commenter) continue;
      const commentText = pick(COMMENT_POOL.filter(c => c.length > 5));
      insertReply.run(uid(), note.id, commenter.id, commenter.display_name, commentText, minsAgo(Math.floor(Math.random() * 30)));
    }
  }

  console.log(`[auto-feed] Daily run complete — ${allPostData.length} posts, ${newUsers.length} new users`);
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
function startAutoFeedScheduler(db) {
  console.log('[auto-feed] Scheduler started');

  // Run once on startup (in case server restarted mid-day and 0 posts today)
  runAutoFeed(db);

  // Schedule daily at 6:00 AM IST = 00:30 UTC
  function scheduleNext() {
    const now = new Date();
    const nextRun = new Date();
    // Target: 6:00 AM IST = UTC+5:30 → 00:30 UTC
    nextRun.setUTCHours(0, 30, 0, 0);
    if (nextRun <= now) nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    const msUntilRun = nextRun - now;
    console.log(`[auto-feed] Next run scheduled at ${nextRun.toISOString()} (in ${Math.round(msUntilRun / 60000)} mins)`);
    setTimeout(() => {
      runAutoFeed(db);
      scheduleNext(); // reschedule for next day
    }, msUntilRun);
  }

  scheduleNext();
}

module.exports = { startAutoFeedScheduler, runAutoFeed };
