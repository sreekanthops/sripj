/**
 * Seed realistic dummy users + posts for testing the feed.
 * Run once: node seed-demo.js
 *
 * Creates:
 *   - 18 realistic users across India (no gspaces2025)
 *   - 5–8 posts per user, natural personal content
 *   - Multilingual: English, Telugu/Tinglish, Hindi/Hinglish
 *   - Cross-reactions, comments, follow relationships
 *   - Story posts for several users
 */

'use strict';
const path     = require('path');
const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'diary.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

// ── ensure columns exist ──────────────────────────────────────────────────────
function hasColumn(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(r => r.name === col);
}
if (!hasColumn('notes', 'is_public'))        db.exec(`ALTER TABLE notes ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0`);
if (!hasColumn('notes', 'is_story'))         db.exec(`ALTER TABLE notes ADD COLUMN is_story INTEGER NOT NULL DEFAULT 0`);
if (!hasColumn('notes', 'story_expires_at')) db.exec(`ALTER TABLE notes ADD COLUMN story_expires_at TEXT`);
if (!hasColumn('notes', 'moderation_status')) db.exec(`ALTER TABLE notes ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'approved'`);
if (!hasColumn('notes', 'moderation_reason')) db.exec(`ALTER TABLE notes ADD COLUMN moderation_reason TEXT NOT NULL DEFAULT ''`);

// ── helpers ───────────────────────────────────────────────────────────────────
function uid()  { return uuidv4(); }
function daysAgo(d) { return new Date(Date.now() - d * 86400000).toISOString(); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function getUser(username) {
  return db.prepare('SELECT id FROM users WHERE username = ?').get(username);
}

const PASS_HASH = bcrypt.hashSync('demo1234', 10);

// ── 1. Users ──────────────────────────────────────────────────────────────────
const USERS = [
  // English-primary
  { username: 'aarav.writes',    display: 'Aarav Sharma',      bio: 'Architecture student · writes at midnight',                    email: 'aarav@demo.in',     avatar: '/global-images/avatar-aarav.svg' },
  { username: 'priya_journals',  display: 'Priya Nair',        bio: 'Bangalore · coffee addict · feelings hoarder',                 email: 'priya@demo.in',     avatar: '/global-images/avatar-priya.svg' },
  { username: 'kiran.m',         display: 'Kiran Murthy',      bio: 'Ex-engineer, full-time overthinker',                           email: 'kiran@demo.in',     avatar: '/global-images/avatar-kiran.svg' },
  { username: 'meera.thoughts',  display: 'Meera Iyer',        bio: 'Reads too much · says too little · writes the rest',           email: 'meera@demo.in',     avatar: '/global-images/avatar-meera.svg' },
  { username: 'ravi.diaries',    display: 'Ravi Kumar',        bio: 'Chennai · 3 AM thoughts · music & words',                     email: 'ravi@demo.in',      avatar: '/global-images/avatar-ravi.svg' },
  // Telugu / Tinglish-primary
  { username: 'teja.scribbles',  display: 'Teja Reddy',        bio: 'Hyderabad lo oka diary lekhaari 📖',                           email: 'teja@demo.in',      avatar: '/global-images/avatar-aarav.svg' },
  { username: 'sahiti.pages',    display: 'Sahiti Varma',      bio: 'Vizag girl · rojulo jarigindi raastanu',                       email: 'sahiti@demo.in',    avatar: '/global-images/avatar-priya.svg' },
  { username: 'arjun_hyd',       display: 'Arjun Rao',         bio: 'Hyderabad · food · cricket · feelings',                        email: 'arjun@demo.in',     avatar: '/global-images/avatar-kiran.svg' },
  { username: 'niharika.ink',    display: 'Niharika Setti',    bio: 'Words are cheaper than therapy — Warangal',                   email: 'niharika@demo.in',  avatar: '/global-images/avatar-meera.svg' },
  // Hindi / Hinglish-primary
  { username: 'rohit.notes',     display: 'Rohit Verma',       bio: 'Delhi se hoon, dil se likhta hoon',                           email: 'rohit@demo.in',     avatar: '/global-images/avatar-ravi.svg' },
  { username: 'ananya_writes',   display: 'Ananya Singh',      bio: 'Lucknow · chai lover · sochti bahut hoon',                    email: 'ananya@demo.in',    avatar: '/global-images/avatar-priya.svg' },
  { username: 'dev.diaries',     display: 'Dev Kapoor',        bio: 'Mumbai · startup grind · kabhi kabhi likhta hoon',             email: 'dev@demo.in',       avatar: '/global-images/avatar-aarav.svg' },
  { username: 'shreya.feelings', display: 'Shreya Joshi',      bio: 'Pune · chai + notebook = life',                               email: 'shreya@demo.in',    avatar: '/global-images/avatar-meera.svg' },
  // Mixed / English casual
  { username: 'vikram.space',    display: 'Vikram Pillai',     bio: 'Kochi → Bengaluru · writing things nobody asked for',          email: 'vikram@demo.in',    avatar: '/global-images/avatar-kiran.svg' },
  { username: 'deepika.daily',   display: 'Deepika Menon',     bio: 'HR by day, overthinker by night · Kochi',                     email: 'deepika@demo.in',   avatar: '/global-images/avatar-priya.svg' },
  { username: 'aditya.pages',    display: 'Aditya Bhat',       bio: 'Mangalore · mangoes · midnight thoughts',                     email: 'aditya@demo.in',    avatar: '/global-images/avatar-aarav.svg' },
  { username: 'kavya.scribbles', display: 'Kavya Reddy',       bio: 'Hyderabad · tech + poems = my whole personality',             email: 'kavya@demo.in',     avatar: '/global-images/avatar-meera.svg' },
  { username: 'sameer.diaries',  display: 'Sameer Khan',       bio: 'Pune · basketball · writing on bad days',                     email: 'sameer@demo.in',    avatar: '/global-images/avatar-ravi.svg' },
];

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users
    (id, username, display_name, bio, password_hash, email, share_token, avatar_url, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const updateAvatar = db.prepare(`UPDATE users SET avatar_url = ? WHERE username = ? AND (avatar_url = '' OR avatar_url IS NULL)`);

const insertedIds = {};
for (const u of USERS) {
  const existing = getUser(u.username);
  if (existing) {
    insertedIds[u.username] = existing.id;
    updateAvatar.run(u.avatar, u.username);
    console.log(`skip user ${u.username}`);
    continue;
  }
  const id = uid();
  insertUser.run(id, u.username, u.display, u.bio, PASS_HASH, u.email,
    uid().replace(/-/g,'').slice(0,14), u.avatar, daysAgo(Math.floor(Math.random()*45)+10));
  insertedIds[u.username] = id;
  console.log(`created user @${u.username}`);
}

// ── 2. Posts per user ─────────────────────────────────────────────────────────
const insertNote = db.prepare(`
  INSERT OR IGNORE INTO notes
    (id, user_id, title, body, font, font_size, font_weight, color_idx, is_public, is_story, story_expires_at, moderation_status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)
`);

const FONTS = ["'Kalam',cursive", 'Georgia,serif', "'Playfair Display',serif", "'Caveat',cursive", 'system-ui,sans-serif'];

const POSTS = {

  // ── English-primary users ──────────────────────────────────────────────────
  'aarav.writes': [
    { title: 'blueprint of a feeling', body: `Studio jury tomorrow and I haven't slept properly in three days. But I just fixed the one section that's been wrong for two weeks and honestly this is the best I've felt all month. Architecture does that to you — eats you alive then gives you this one moment of clarity and you forget everything else.\n\nWorth it. Maybe.` },
    { title: 'Overheard at 2 AM', body: `Someone in the hostel common room was playing guitar really badly. All wrong notes, completely off timing. But the *feeling* was right. I sat on the floor outside and listened for like 40 minutes instead of finishing my submission.\n\nNot one regret.` },
    { title: 'Draft 11', body: `This is the eleventh attempt at writing something about my father. The other ten are deleted. This one might be too.\n\nBut I'm going to keep trying because if I don't write it eventually I'll just carry it forever and honestly that's not a great option either.` },
    { title: 'What old buildings remember', body: `You can see the layers in how paint peels. Someone was here first. Someone painted over them. Someone else over that. Every wall in old buildings is basically sediment — compressed human presence.\n\nI want to design spaces that remember people the same way.` },
    { title: 'The city I keep almost leaving', body: `Every few months I have the conversation — maybe Mumbai, maybe abroad. Then something happens: a chai stall on a foggy morning, a building that takes my breath away, a conversation at 3 AM with someone who gets it. And I stay.\n\nMaybe I'm afraid. Or maybe this city already knows me too well.` },
    { title: 'Jury notes, post-mortem', body: `Got ripped apart today in jury. Prof said the section was "structurally naive." He's not wrong. But he's also not seeing what I was trying to do.\n\nMaybe next time I'll explain it better. Maybe next time I'll just let the drawing speak. Not sure which.` },
  ],

  'priya_journals': [
    { title: 'third coffee, 8:45 am', body: `Outside, Bangalore is already loud. I've been sitting here watching my phone and trying not to open Instagram. I keep failing. But I'm noticing the failing in real time, which I think is progress?\n\nSmall awareness. Slowly becoming something.` },
    { title: 'The relationship I outgrew', body: `We didn't break up dramatically. We just... tapered. Calls got shorter. Silences got longer. One day I realised I'd stopped looking forward to talking to him.\n\nGrief is weird when there's no single moment to point to. You just notice it's already over.` },
    { title: 'Things I want (honest list)', body: `A room with good light. Work that feels like mine. Friendships that don't require constant maintenance. Someone who asks follow-up questions.\n\nA dog. Definitely a dog. Everything else is flexible.` },
    { title: 'On being 25', body: `I expected to feel more settled by now. Instead I feel like a rough draft — the ideas are there, the structure is forming, but there's still so much crossing out to do.\n\nI think I'm okay with that. Ask me again in six months.` },
    { title: 'Bangalore rain hits different', body: `It doesn't drizzle. It just *commits*. One minute sun, next minute the whole city is washed clean and everyone is pretending not to be delighted.\n\nI am always, unironically, completely delighted. Every single time.` },
    { title: 'Things my mother never said', body: `She showed love through feeding. By asking if you'd eaten, twice, then bringing food anyway. By leaving the porch light on. By not asking why you were crying — just bringing water.\n\nI learned to speak her language late. I still miss some of it.` },
    { title: 'The texts I draft and delete', body: `I write them out fully sometimes. Leave them in drafts for days. Then delete.\n\nNot because they're wrong. Because I don't trust the timing. Or the reaction. Or myself to handle what comes after.` },
  ],

  'kiran.m': [
    { title: 'why I actually quit', body: `Not a breakdown. Not drama. I just woke up one Tuesday and the morning commute felt exactly like walking into someone else's life. So I stopped.\n\nThree months later I still don't know what's next. But I'm sleeping 7 hours for the first time in four years so.` },
    { title: 'Thursday mornings', body: `I have Thursday mornings free now. No calls, no standups, nothing. I use them to do absolutely nothing.\n\nIt took six weeks to stop feeling guilty about this. Week seven: I made chai slowly and watched a bird for eleven minutes. That's it. That's the whole update.` },
    { title: 'nostalgia, not what I thought', body: `We don't actually miss the past. We miss the version of ourselves who was living it. The one who didn't know what was coming. The one with more hope left in reserve.\n\nThat's what we're actually mourning.` },
    { title: 'What I unlearned at 30', body: `That staying busy = being valuable. That fast replies = being important. That saying yes = being helpful.\n\nUnlearning takes 3x longer than learning. Nobody puts that in the productivity blogs.` },
    { title: 'Message from 8 years ago', body: `Found an old Slack message I sent at 22. So certain about everything. So wrong about most of it. So earnest it's almost painful to read.\n\nI love him a little. I'm genuinely glad I'm not him anymore.` },
    { title: 'When the silence arrived', body: `After the last meeting, after everyone logged off, I sat in the quiet of my flat. No notifications. Nobody wanting something from me.\n\nI didn't know quiet could have a texture. It took a while before I could sit in it without flinching.` },
  ],

  'meera.thoughts': [
    { title: 'lines I keep returning to', body: `"The most terrible poverty is loneliness, and the feeling of being unloved." Underlined that at 16 in a library copy. I've bought two of my own copies since then.\n\nSome sentences never stop being true.` },
    { title: 'Quiet Sunday mode', body: `The weekend version of me is different. Slower. Lets dishes sit. Eats standing at the counter. Reads until it's not really reading anymore, just floating with words.\n\nI like her. I should let her come out more on weekdays.` },
    { title: 'Names I won\'t delete', body: `There are contacts on my phone I know I'll never call. I won't delete them either.\n\nNot because I expect anything. Just because I'm not ready for them to stop existing in my list. It's the gentlest form of grief I know.` },
    { title: 'Half-finished everything', body: `Four half-read books. A knitting project from 2021. A language app with a 22-day streak I abandoned. A letter to someone who moved cities.\n\nThis is not a character flaw. It's evidence of a curious person who starts things. I've decided.` },
    { title: 'Library lunches', body: `In school I used to spend lunch in the library instead of the cafeteria. I wasn't lonely — I was exactly where I wanted to be.\n\nI still feel most like myself when I'm surrounded by books and have no obligation to speak.` },
    { title: 'Karamazov chapter', body: `Started The Brothers Karamazov again. This is the fourth attempt. I always stop at the same chapter — when Alyosha weeps in the monastery garden.\n\nI don't think I'm ready for what happens after. Maybe that's okay.` },
  ],

  'ravi.diaries': [
    { title: 'Songs that found me', body: `Not the ones I chose. The ones that were playing when something happened — a break-up, an empty bus, the first day of something I was terrified of. I can't hear them without time-travelling.\n\nMusic is just bottled moments with permission to replay.` },
    { title: 'Chennai 4 PM', body: `The heat is honest here. It doesn't pretend. By 4 PM the city is golden and brutal and I'm on my bike going nowhere in particular feeling completely, stupidly alive.\n\nI will never leave this city. I've said that for 6 years and I keep meaning it.` },
    { title: 'Marina at midnight', body: `Met a friend for "quick chai" that turned into 3 hours at Marina beach, talking about parents and ambition and whether any of us actually choose our lives or just navigate what happens.\n\nBest night in months. We should do this more.` },
    { title: 'The version of me at work', body: `At work I'm confident. Funny on cue. Delivers things. At home I eat cereal at 11 PM and watch the same movie for the fifth time because I know how it ends and that's the whole point.\n\nBoth are real. The gap between them is real too.` },
    { title: 'Slowly less afraid', body: `Not of big things. Of the small ones: sending a voice note instead of typing, telling someone I actually missed them, saying yes to the thing that costs more than comfort.\n\nI'm practising. It's slow. Some days I get one right.` },
    { title: "\"You'll be fine\"", body: `She said it before she left. I believed it then completely. Now I say it to myself, every morning, like repetition might eventually make it true.\n\nMaybe that's how these things work. You say it until it becomes a fact.` },
  ],

  // ── Telugu / Tinglish-primary users ───────────────────────────────────────
  'teja.scribbles': [
    { title: 'ee roju chaala baaga undi', body: `Morning lo coffee cheyi poyi exam result chusanu — pass ayyanu!! Nanna ki call chesi cheppanu, aayana silent ga undi tarvata "sachina pani chesav" ani cheppadu. Alanthi compliment aayana dggara chala rare.\n\nEe feeling ni ikkade lock chestunan. Future lo chuste gurtu undali.` },
    { title: 'bus lo thoughts', body: `Hyderabad TSRTC bus lo veltunna, window seat dorikindu. Outside chustunna — roads, people, buildings anni rush lo unnay. Kani nenu slow motion lo feel avutunna.\n\nLife lo anni ippudu chaala fast jarigipotunnay. Breathe chestunan, just breathe.` },
    { title: 'Friendship ni miss avestunna', body: `College ayyaka friends andaru different cities lo unnaru. Group chat lo messages vastunayi but adi different. Before aina tea teesukoni road side lo kurchuni matladadam — adi ippudu ledu.\n\nDistance is real yaar. Teknology help chesina adi exact feeling ivvaledu.` },
    { title: 'nenu change ayyanan?', body: `Old photos chustunte nenu quite different ga kanapadutunna. More open, more loud. Ippudu nenu quiet ga untanu, naa feelings ni filter chestu.\n\nIdi maturity a? Or naa lo oka part disappear ayyinda? Teliyatledu. Edaina rendu nija ayyuntay.` },
    { title: 'Hyderabad ki poyanu', body: `4 months taravata first time Hyderabad ki vachanu. Ee roads, ee iragoles, ee chai — anni enduko nenu feel avutunna "nenu ikkade chendina vaadini" ani.\n\nCity mana lo oka part aipotundi. Naaku Hyderabad appudu aindi.` },
    { title: 'Raat ki diary', body: `Raat 11:30. Chuttu anni silent. Ikkade raastunte naa mind slow aipotundi — thoughts settle avutayi, clarity vastuundi.\n\nPagalu diary raayatam cheta kaadu naku. Raat maatramed naadi.` },
    { title: 'oka chinna memory', body: `Schoollo nenu tiffin box lo idli teestunte my friend always "oka idli ivvu" antadu. Oka roju idli teestukunattu forget ayyanu — aa roju lunch loneliness chaala feel chesanu.\n\nChinna vishayaalu, chala deep memories aipotaay sometimes.` },
  ],

  'sahiti.pages': [
    { title: 'Vizag sea ni miss avestunna', body: `Vizag lo unna roju evening ki beach ki velledi. Istam lekunna kuda — just walk, sea chusukuni, mind blank chesukuni. Ippudu Hyderabad lo unna — sea ledu ikkade. Oka park lo water fountain dagggara kurcchunanu, pani sound vintunte konda konchem feel aindi 😅\n\nHome ni ee roju chala miss chestunan.` },
    { title: 'Amma calls', body: `Amma daily call chestundi. "Tinnavaa? Nidra poyyaava? Chali ga undi?" ani. Busy ga unnappudu calls miss chestanu, tarvata guilt feel avutanu.\n\nNow I pick up every call. Even if it's 2 minutes. Adi chalu.` },
    { title: 'First job first week', body: `Office ki first day suits vesukunanu — AC chaala cold ga undi, ID card naa neck ki big ga feel ayyindi, coffee machine use cheyyatam teliyaledu.\n\nKani evening ki nenu "I survived" ani feel chesanu. Small win. Celebrate chesukunnanu solo.` },
    { title: 'Telugu poems nenu chinnappudu chaduvuthu', body: `Grandma Telugu padyaalu cheppedi — nenu vinnanu, ardham telusukoledu. Ippudu aa padyaalu net lo search chesi chastunna.\n\nArdham artham — chala years taravata. Kani ippudu feel chestunna anipistundi.` },
    { title: 'cheppalekapoyyanu', body: `Oka vishayam naa friend ki cheppali ani days ga try avestunna. Oka sari cheppabothanu — phone ring aindi, topic change ayyindi. Next time — again miss.\n\nEkkadanna cheppakunda ee vishayam naa lone carry cheyyatame nachutundemo ani doubt vastundi.` },
    { title: 'Sunday morning feels', body: `No alarm. Windows open, fan slow. Outside birds sound. Tea chesukuni balcony lo nunchunutte — oka 45 minutes just present ga unna feeling.\n\nEe roju chala baaga undi. Nothing special happened. But ee peace — naaku idi chalu.` },
  ],

  'arjun_hyd': [
    { title: 'IPL finals raat', body: `CSK won!! Naa friend circle lo half CSK fans, half SRH. Last ball lo match end ayyindi — oka side jump chesaru, inko side silent ayyipoyaru 😂\n\nCricket oka emotion. Explanation ledu. Anduke inka chustunam.` },
    { title: 'Hyderabad traffic therapy', body: `Hitech city to Gachibowli — 4.7 kms, 55 minutes. Normal.\n\nKaani bus lo unna time lo oka podcast vinnanu, oka idea vachindi project ki. Maybe traffic is the real thinking time emo. Still annoying though.` },
    { title: 'Biryani conversation', body: `Colleague ki "Hyderabad biryani best" ani cheppanu. Aayana "Lucknow biryani better" antadu. 20 minutes argument — no result, no consensus.\n\nMaa friendship ippudu strong. Disagreement is fine when biryani is the topic.` },
    { title: 'Amma ki health scare', body: `Last week amma ki hospital lo one day admit chesaru — minor issue, ippudu fine. Kaani aa oka roju nenu chaala fear ga feel chesanu.\n\nParents aging — idi accept cheyyatam naku inka complete kaledu. Work lo busy ga untam but idi ikkade naake cheppukuntunna.` },
    { title: 'Batchmate marriage card vachindi', body: `25 years lo already 4 batchmates married. Oka card received — ikkade nenu haldi ceremony dress code confusion lo unna 😅\n\nLife events anni oka saari vastunayi. I'm not ready but nobody asked.` },
  ],

  'niharika.ink': [
    { title: 'Words are cheaper than therapy', body: `Therapist ki vellataniki money ledu, time ledu. So I write. Naa problem solve avutundaa? Ledu. Kaani ee process lo nenu naaku naene matladadam jarigipotundi.\n\nAdi kuda help. Sometimes.` },
    { title: 'Warangal memories', body: `Warangal fort ki school trip lo poyyanu once — history class boring ani anipinchindi until teacher oka story cheppadu fort build chesina workers gurinchi. Then suddenly real ga feel ayyindi.\n\nHistory ante people's stories. Stones kadu. Idi late ga artham ayyindi.` },
    { title: 'Raat pakkana notebook', body: `Naa bed pakkana oka notebook untundi always. Raat 2 ki oka thought vastuundi — rastunte feel aipotundi, rasthe "wait idi silly" antundi.\n\nKaani raastanu. Silly thoughts kuda naa thoughts ane.` },
    { title: 'Phone screen time horror', body: `Weekly screen time report vachindi — 5 hrs 47 mins daily. Screen time reduce chesukuntanu ani plan chesanu.\n\nMa screen time: 6 hrs 12 mins next week. Okati kadu.` },
    { title: 'Akka ki letter', body: `Akka marriage ki velli Pune lo undi. Weekly call chestam. Kaani oka day letter raasinchanu — handwritten. Aayana "Years lo mee handwriting chusina first time" antundi.\n\nLetter raasata ki oka varastu undi. Miss chestunan.` },
    { title: 'Hostel last night', body: `Hostel leave chesina last night — bed pakkana 4 years items pack chestunte chala memories vachindayi. Fights, laughs, late nights, exam panics — anni ikkade jarigindayi.\n\nEe room naa garba chettu. Miss cheyyataniki ready ga ledu but ippudu time.` },
  ],

  // ── Hindi / Hinglish-primary users ────────────────────────────────────────
  'rohit.notes': [
    { title: 'Delhi ki sardi aur ye diary', body: `Bahar 6 degree hai. Geyser ne dhoka diya. Coffee thand hone se pehle pi li. Aur fir bhi — subah theek lag rahi hai.\n\nChhoti cheezon mein sukoon dhundhna main seekh raha hoon. Slowly, roz thoda thoda.` },
    { title: 'Woh purani baat', body: `Kuch din pehle ek purana message mila — do saal pehle ka. Tab sochta tha sab set ho jaayega by now. Nahi hua.\n\nPar sab kuch bekar bhi nahi hua. Middle mein hoon. Middle theek hai.` },
    { title: 'Papa se baat', body: `Papa se zyada baat nahi hoti normally. Call pe "haan sab theek" tak hi jaata hai usually.\n\nKal phone kiya toh 40 minute baat ki. Kuch khas nahi bola, bas uski awaaz sunna acha laga. Some conversations heal without saying anything important.` },
    { title: 'Metro mein thoughts', body: `Delhi metro, rush hour. Log apne phone mein hain, koi kisi ko dekh nahi raha. Par main notice karta hoon — ek bund aankh waala baccha, ek tired sa professional, ek ladki jo quietly smile kar rahi hai kuch padh ke.\n\nZindagi train ke andar bhi hoti hai, sirf destination tak pahunchne mein nahi.` },
    { title: 'February wala mood', body: `February mein kuch aisa hota hai — na thanda na garam, na naya saal ka energy na purana saal ki familiarity. Beech ki jagah.\n\nIs beech mein seedha diary kholna acha lagta hai. Kuch justify nahi karna padta.` },
    { title: 'Khud se kuch kehna tha', body: `Kuch din se ek baat andar ghoom rahi thi. Kisi ko kehna tha nahi. Toh yahan likhta hoon.\n\nMujhe pata hai main sahi direction mein hoon. Bas thoda time lagega. Yahi enough hai abhi.` },
  ],

  'ananya_writes': [
    { title: 'Lucknow mornings', body: `Subah ki chai ghar ki hi hoti hai — bahar wali nahi, chahe kitni bhi mehnat se banao. Amma ke haath ka taste alag hi hota hai.\n\nKuch cheezein copy nahi hoti. Woh bus hoti hain.` },
    { title: 'Sochti bahut hoon', body: `Ek simple decision ke baad 3 ghante sochti rahi. Kya hoga, kya nahi hoga, log kya sochenge, actually kya chahiye mujhe.\n\nThak gayi apne andar se. Kuch din ke liye brain off karna chahti hoon. Koi button hai?` },
    { title: 'Jo nahi keh payi', body: `Woh words jo kehne chahiye the — woh main kabhi nahi bol payi. Opportunity thi, moment tha, par gala bhar aaya aur chup ho gayi.\n\nShayad kuch baatein kehne se zyada feel karni hoti hain. Ya main sirf apne aap ko samjha rahi hoon.` },
    { title: 'Purani saheli se milna', body: `3 saal baad Pooja se mili. Sochti thi awkward hoga. Par 5 minute mein wahi puraani waali baat shuru ho gayi — same topics, same laugh, same drama.\n\nKuch friendships mein time nahi lagti. You just pick up where you left.` },
    { title: 'First salary story', body: `Pehli salary aayi toh Amma ko saree kharidi, Baba ko kurta. Dono ne kaha "itna kharcha mat karo."\n\nBut unke chehre pe jo tha — woh main lifelong yaad rakhuungi. Koi return gift nahi tha.` },
    { title: 'Raat ka sannata', body: `Ghar mein sab so gaye hain. Sirf fan ki awaaz aur bahar koi kutta bhaunk raha hai. Main yahan hoon, diary mein soch daalti hoon.\n\nDin mein jo nahi bol paaye, raat mein likh dete hain. Yahi kaam aati hai yeh jagah.` },
  ],

  'dev.diaries': [
    { title: 'Startup grind and 11 PM chai', body: `Office se ghar aaone ke baad phir 2 ghante laptop. Aaj ek bug tha jo 6 din se solve nahi ho raha — aaj ho gaya. Chai banai, ek minute celebration.\n\nYeh chhoti jeetein hi jeena sikhati hain. Baki sab slow hai abhi.` },
    { title: 'Mumbai dreams', body: `Mumbai ne mujhe kuch saal mein itna change kar diya. Small town se aaya tha, sab kuch overwhelm karta tha. Ek din realize kiya — ab local train mein bina sochhe chadh jaata hoon.\n\nCity tum mein ghus jaati hai. Phir aap city ho jaate ho.` },
    { title: 'Bhai ki padhai', body: `Bhai ka result aaya — 78%. Usne sochha tha mujhe gussa hoga kyunki usne zyada khela. Par yaar, effort diya usne.\n\nScore se zyada effort matter karta hai. Yahi kehna chahta tha. Bol nahi paaya seedha. Yahan likh diya.` },
    { title: 'Pressure drop', body: `Ek colleague ne resign kar diya achanak. Uska kaam automatically mujhpe. Koi official baat nahi, koi adjustment nahi — bas quietly add ho gaya.\n\nYeh normal hai kya? Yahan sab log normal bolte hain. Main nahi maanta.` },
    { title: '26 pe 26 lessons nahi hain mere paas', body: `Log likhte hain "X cheezein jo maine X saal mein seekhi." Mere paas aisi list nahi hai.\n\nBus yeh pata hai: kuch cheezein time se sikhti hain, kuch mistake se, aur kuch kabhi nahi. Yahi kaafi hai abhi.` },
  ],

  'shreya.feelings': [
    { title: 'Chai aur notebook', body: `Subah 6 baje uth gayi aaj — alarm se nahi, khud se. Chai banayi, notebook nikali, kuch likhti rahi bina kisi reason ke.\n\nSaare din mein yahi ek ghanta sabse real lagta hai. Baki sab performance hai thoda.` },
    { title: 'Dono choices galat lagte hain', body: `Job change karna chahti hoon ya nahi — is question ka jawab 3 mahine se nahi mila. Dono sides ke reasons hain. Dono sides ke darr hain.\n\nKabhi kabhi sahi jawab nahi hota. Sirf ek direction chunta hai.` },
    { title: 'Teri yaad', body: `Dost Nidhi Pune chali gayi 2 saal pehle. Kabhi kabhi ek meme dekhti hoon — sochti hoon "yeh Nidhi ko bhejti." Phir yaad aata hai woh nahi mili hain kaafi time se.\n\nDistance silent hoti hai. Tab pata lagti hai jab chai mein koi nahi hota baat karne ko.` },
    { title: 'Pune raat ka mood', body: `Raat ko walk pe nikli. Pune mein raat ka maahol different hai — cooler, quieter, almost forgiving. Ek ghante mein woh clarity aayi jo din bhar mein nahi aayi.\n\nShayad bahar nikalna bhi ek form of journaling hai.` },
    { title: 'Purani photos dekhi', body: `Old photos dekhi — woh main 20 saal ki, confident dikhti thi, thodi nasamajh bhi. Par woh energy thi usme.\n\nMain ab zyada samajhdaar hoon. Kuch energy wapas leni hai. Dono ho sakti hain ek saath na?` },
  ],

  // ── Mixed / English casual ─────────────────────────────────────────────────
  'vikram.space': [
    { title: 'Bengaluru after Kochi', body: `Moved cities 2 years ago. People said I'd adjust in 6 months. I think 2 years is more honest. Still sometimes the traffic smell, the crowd energy, the pace — all feels borrowed.\n\nBut then something clicks. A conversation, a walk, a monsoon evening. And the city feels a little more mine.` },
    { title: 'Nobody asked for this', body: `I write things nobody asked for. Observations. Tiny moments. Half-baked thoughts about nothing in particular.\n\nAnd yet here you are reading it. So maybe that's the whole thing — someone somewhere needs the unrequested thing.` },
    { title: 'The 6 AM logic', body: `Set 6 AM alarm to "start a morning routine." Snoozed it. 7:15 AM, woke up, felt guilty, had chai standing, checked Instagram, planned to start tomorrow.\n\nThis is month four. Tomorrow is very patient with me.` },
    { title: 'Unexpected conversation', body: `Had a 2 hour conversation yesterday with someone I barely knew. Ended up talking about fathers, about expectations, about the version of yourself you're still becoming.\n\nSome people open something in you. You can't plan for it. You just recognize it after.` },
    { title: 'Kochi ← → Bengaluru', body: `Went home last weekend. Got back Sunday night. Both places felt right and not-quite-right at the same time.\n\nI think that means I've genuinely split my sense of home. Which is either maturity or displacement. Maybe both.` },
  ],

  'deepika.daily': [
    { title: 'HR by day, chaos by night', body: `Spent 8 hours helping people navigate workplace conflict. Came home, couldn't decide what to eat for 25 minutes, sat on the kitchen floor with crackers.\n\nThe irony is not lost on me. I'm fine. This is fine.` },
    { title: 'Telling someone the truth', body: `Had to give honest feedback to someone I like today. Prepared for three days. It took 4 minutes. They said "I needed to hear this."\n\nAll that preparation for 4 minutes. Still worth it. Honesty is expensive and necessary.` },
    { title: 'Saturday morning nothing', body: `No plans today. Woke up at 8:30 without an alarm. Made coffee. Sat by the window. Heard birds. Read two pages of a book and then just held it.\n\nThis is enough. I keep forgetting this is enough.` },
    { title: 'The colleague who left', body: `Merin resigned last week. She was the one who always knew when you were having a bad day and would drop by your desk with chai without saying anything.\n\nSome people hold the room together without anyone noticing until they're gone.` },
    { title: 'On overthinking (again)', body: `I'm aware this is the fourth diary entry about overthinking. I see the pattern. I cannot stop the pattern yet.\n\nAwareness is step one. Apparently there are more steps. I am somewhere between 1 and 2.` },
  ],

  'aditya.pages': [
    { title: 'Mangalore and mangoes', body: `Summer here means mangoes everywhere. Totapuri, Alphonso, Badami — every house has a tree or a relative with a tree.\n\nI left for Bengaluru 3 years ago. The thing I miss most, honestly, is just walking to the backyard and eating a mango standing up, juice everywhere, not caring at all.` },
    { title: 'Night writing works better', body: `Every time I try to write in the morning I produce garbage. Every night entry sounds like something I'd actually want to read.\n\nI've accepted I'm nocturnal at heart living a diurnal schedule. This is my compromise.` },
    { title: 'Called home finally', body: `Kept postponing calling home because I didn't have "anything to say." Called anyway. 45 minutes. Mostly just comfortable talking about nothing.\n\nThe content doesn't matter. The call matters. I know this and still keep forgetting.` },
    { title: 'Mild crisis, resolved', body: `Last Tuesday I was convinced my entire career path was wrong. Wednesday morning, with sleep, I was 80% less convinced.\n\nMost 11 PM certainties become 7 AM questions. Tried to remember this. Writing it here so future me has evidence.` },
  ],

  'kavya.scribbles': [
    { title: 'Tech job + writing = my whole confusion', body: `During the day I debug code and write design docs. At night I write about feelings and post here.\n\nSometimes these feel like two different lives. Sometimes they feel exactly like the same one — both are just trying to make sense of chaos.` },
    { title: 'Hyderabad beedu', body: `Hyd lo born and raised. People ask "when are you moving to Bangalore" as if it's inevitable.\n\nMaybe never? Hyderabad is changing fast, growing into itself. I want to be here when it does. FOMO in my own city is real.` },
    { title: 'The post I deleted', body: `Wrote a long post about someone. Read it again in the morning. Deleted it.\n\nNot because it was untrue. Because I wasn't ready to share it, and posting is not the same as processing. There's an order to these things.` },
    { title: 'Reading again after a gap', body: `Didn't read properly for almost 5 months. Then picked up a book last Saturday and read 120 pages without noticing.\n\nSome habits come back to you. You don't restart them — they restart you.` },
    { title: 'Small things I noticed today', body: `The way the office building casts a shadow at exactly 5:30 PM. The smell of sambar from the canteen three floors down. My coworker who hums while he types.\n\nPaying attention is free and I forget to do it constantly.` },
  ],

  'sameer.diaries': [
    { title: 'After the game', body: `Lost by 4 today. I played badly in the second quarter and I know it. No excuses.\n\nThere's a specific kind of tiredness after sport you lose — not just physical. Like your ego used muscles it didn't train.\n\nSame time Thursday. See you then.` },
    { title: 'Bad days need a record too', body: `Today was bad. Work was frustrating, conversation with a friend ended weird, and I burned my dinner.\n\nI'm writing this not because I figured something out. Just because bad days deserve a record too. They happened. They're real.` },
    { title: 'What writing on bad days does', body: `On bad days I write angry. On good days I write grateful. I notice both look like the same handwriting.\n\nMaybe that's the whole point. You're still you across all of it.` },
    { title: 'Mom message', body: `Mom sent me a voice note today — a recipe I didn't ask for, unsolicited cooking instructions, a "are you eating properly" built in.\n\nI listened to it twice. Don't tell her.` },
    { title: 'Pune monsoon tonight', body: `Rained heavily tonight. Power cut for 40 minutes. Sat on the balcony in the dark listening to it.\n\nForgot I had my phone for 40 whole minutes. That almost never happens.` },
  ],
};

// Insert posts
for (const [username, posts] of Object.entries(POSTS)) {
  const userId = insertedIds[username] || getUser(username)?.id;
  if (!userId) { console.warn(`no user id for ${username}`); continue; }
  for (let i = 0; i < posts.length; i++) {
    const p  = posts[i];
    const id = uid();
    const font = FONTS[i % FONTS.length];
    const daysBack = Math.random() * 20 + 0.2;
    insertNote.run(id, userId, p.title, p.body, font, 14, 'normal', (i + 1) % 8, 1, 0, null, daysAgo(daysBack));
    console.log(`post by @${username}: ${p.title.slice(0, 40)}`);
  }
}

// ── 3. Story posts ────────────────────────────────────────────────────────────
const STORIES = [
  { username: 'aarav.writes',    title: 'Studio at dawn',       body: 'Been here since 4 AM. Light through the drafting table window now. It\'s going to be a good day.' },
  { username: 'priya_journals',  title: 'Current mood ☕',       body: 'Sitting with chai watching rain refusing to be productive. No notes. No regrets. Just rain.' },
  { username: 'teja.scribbles',  title: 'Ee morning feel',       body: 'Today subah chaala peaceful ga start ayyindi. Coffee ready, playlist good. Let\'s go 💪' },
  { username: 'rohit.notes',     title: 'Delhi fog morning',     body: 'Bahar fog hai, ghar mein chai. Aaj kuch theek lagega, feeling hai.' },
  { username: 'ravi.diaries',    title: 'Marina 11 PM',          body: 'Wind, waves, one good song on loop. Life is okay tonight.' },
  { username: 'ananya_writes',   title: 'Lucknow ghar se',       body: 'Amma ne aaj chai dono haath mein deke di — bina maange. Kuch keh rahi thi bina bol ke.' },
  { username: 'kavya.scribbles', title: 'Random Tuesday energy', body: 'No reason, just feeling good today. Lean in.' },
  { username: 'sameer.diaries',  title: 'Post-game tiredness',   body: 'Every muscle is done. Best kind of tired.' },
];

for (const s of STORIES) {
  const userId = insertedIds[s.username] || getUser(s.username)?.id;
  if (!userId) continue;
  const existing = db.prepare('SELECT id FROM notes WHERE user_id=? AND title=? AND is_story=1').get(userId, s.title);
  const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  if (existing) {
    db.prepare('UPDATE notes SET story_expires_at=? WHERE id=?').run(expires, existing.id);
    console.log(`refreshed story @${s.username}: ${s.title}`);
  } else {
    insertNote.run(uid(), userId, s.title, s.body, pick(FONTS), 14, 'normal', pick([0,1,2,3,4,5,6,7]), 1, 1, expires, daysAgo(0.05));
    console.log(`story @${s.username}: ${s.title}`);
  }
}

// ── 4. Follow relationships ───────────────────────────────────────────────────
const ALL_USERNAMES = USERS.map(u => u.username);
const insertFollow = db.prepare(`INSERT OR IGNORE INTO follows (id, follower_id, followee_id, created_at) VALUES (?, ?, ?, ?)`);

// Each user follows 5–9 random others
for (const u of ALL_USERNAMES) {
  const others = ALL_USERNAMES.filter(x => x !== u).sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 5) + 5);
  for (const o of others) {
    const fId = insertedIds[u] || getUser(u)?.id;
    const tId = insertedIds[o] || getUser(o)?.id;
    if (!fId || !tId) continue;
    insertFollow.run(uid(), fId, tId, daysAgo(Math.random() * 20));
  }
}
console.log('follow relationships done');

// ── 5. Reactions ──────────────────────────────────────────────────────────────
const EMOJIS = ['♡', '😢', '✨', '🫂', '💙', '🤍', '😊', '🔥'];
const insertReaction = db.prepare(`INSERT OR IGNORE INTO note_reactions (id, note_id, emoji, reactor_key, created_at) VALUES (?, ?, ?, ?, ?)`);

// Pick random notes and add reactions from random users
const allNotes = db.prepare(`SELECT id FROM notes WHERE is_public=1 AND is_story=0 ORDER BY RANDOM() LIMIT 60`).all();
const allUserIds = Object.values(insertedIds).filter(Boolean);

for (const note of allNotes) {
  const reactorCount = Math.floor(Math.random() * 5) + 1;
  const shuffled = [...allUserIds].sort(() => 0.5 - Math.random()).slice(0, reactorCount);
  for (const rId of shuffled) {
    insertReaction.run(uid(), note.id, pick(EMOJIS), 'u:' + rId, daysAgo(Math.random() * 3));
  }
}
console.log('reactions added');

// ── 6. Comments ───────────────────────────────────────────────────────────────
const COMMENT_POOL = [
  'This is exactly how I felt last week. Thank you for putting it into words.',
  'The last line hit different. Saving this.',
  'Been sitting with this for a few minutes. Really needed to read it today.',
  'You write the way I think at 3 AM.',
  'Sent this to someone. They said "yes exactly". So thanks from us both.',
  'Simple aur real. I like this.',
  'Yeha line bilkul mere jaisi soch hai — "kabhi nahi bol paaye woh baat."',
  'Idhi chaalaa true. Naaku kuda same feeling untundi.',
  'The part about the quiet — I felt that one deeply.',
  'I have a draft with the same title on my phone. Never posted it.',
  'Ekdum sahi bola yaar. Life lo idi jarigipotundi ippudu.',
  'This one\'s going in the "reread when sad" collection.',
  'I keep coming back to this. Something about it feels like being seen.',
  'Bahut honest hai yeh. Aise likhna ata nahi mujhe still.',
  'You\'re not alone in this. Same situation, different city, same feeling.',
  'Naaku idi chala daggera ga undi — oka 2 minutes chusi teluskunna 🤍',
  'Real one. No filter.',
  'The gap between the performed version and the real one — I think about this all the time.',
];

const insertReply = db.prepare(`INSERT INTO replies (id, note_id, user_id, name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)`);

// Pick some notes and add 1–2 comments
const commentNotes = db.prepare(`SELECT n.id as note_id, n.user_id FROM notes n WHERE n.is_public=1 AND n.is_story=0 ORDER BY RANDOM() LIMIT 40`).all();

for (const note of commentNotes) {
  const count = Math.random() < 0.4 ? 2 : 1;
  const commenters = allUserIds.filter(id => id !== note.user_id).sort(() => 0.5 - Math.random()).slice(0, count);
  for (const cId of commenters) {
    const commenterUsername = Object.entries(insertedIds).find(([,v]) => v === cId)?.[0];
    const commenterUser = USERS.find(u => u.username === commenterUsername);
    if (!commenterUser) continue;
    insertReply.run(uid(), note.note_id, cId, commenterUser.display, pick(COMMENT_POOL), daysAgo(Math.random() * 2));
  }
}
console.log('comments added');

console.log('\n✅ Seed complete! 18 users, multilingual posts, reactions, comments, follows.');
