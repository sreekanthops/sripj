# ✦ Unsent Stories — Features & Purpose

> *Write what you can't say. Share when you're ready.*

Unsent Stories is a **social diary platform** — part private journal, part public feed.  
Users write entries for themselves, then choose which ones the world sees.  
Others can follow, react, comment, and connect in real time.

---

## Purpose

Most social platforms push you to perform. Unsent Stories inverts that.  
You write privately first. Everything stays hidden by default.  
When something feels right to share, a single toggle sends it to the public feed.  
No algorithm pressure. No follower counts on the writing screen.  
Just writing — and connection when you choose it.

The target user is anyone who has ever typed something and then deleted it.

---

## Core Features

### 📖 Private Diary
- Write unlimited (or plan-limited) diary entries with full rich formatting
- Per-entry **colour theme** (8 palettes), **font family**, font size
- **Custom note backgrounds** — pick from the global library or upload your own
- **Tags** for personal organisation and filtering
- **Time filters** — view by This Week / Monthly / Yearly / All
- **Date range filter** + sort by newest, oldest, most reactions, most comments, most views
- **Password-protect your diary** with a share link — only people with the password can read it
- **Shareable diary link** (`/s/<token>`) — send your diary to someone without giving them your username
- Entries are **never shown publicly unless you toggle them on**, one at a time

### 🌍 Public Feed
- Toggle any entry "Share to Feed" — it appears in the global public feed instantly
- **Smart ranking algorithm** (Instagram-style):
  - Posts from people you follow shown **3× higher**
  - Fresh posts decay gradually over ~36 hours
  - Posts you've already reacted to are de-prioritised
  - Guests see pure hotness + recency
- Infinite scroll with lazy loading
- Guest browsing — no login required to read the feed

### ⚡ Stories (24-hour)
- Post any entry as a **Story** — visible for 24 hours, then auto-expires
- Story rings appear in the **Story Bar** at the top of the feed (Instagram-style)
- Tap a ring to open a full-screen story viewer with auto-advance timer
- Stories can have background colours drawn from a curated palette

### 👤 User Profiles
- Public profile page at `/@username`
- Avatar upload (photo), display name, bio
- **Follower / Following counts** with clickable lists
- View any user's public posts from their profile
- **Follow / Unfollow** from feed cards, profiles, or search
- **View Profile** button on every feed card

### 💬 Real-time Chat (DMs)
- Floating DM panel — stays open while you scroll the diary or feed
- Start a conversation from any profile or feed card
- **Live delivery** over WebSocket — messages arrive instantly, no refresh
- Edit and delete your own messages
- Photo, audio, and video attachments in chat
- **Unread badge** on the chat nav button
- AI moderation on messages (rejects explicit/harmful content)

### 🔔 Live Notifications
- Bell icon with badge count in the app topbar
- Real-time delivery over WebSocket
- Notified for: new follower, reaction on your post, reply on your post, new DM
- Mark-all-read in one click

### 🎨 Canvas Studio
- Draw and sketch directly over any diary page
- Tools: pencil, brush, eraser with adjustable sizes
- Place **stickers**, **images**, and **text boxes** anywhere on the canvas
- Canvas state saved per-user

### 🎵 Background Music
- Attach any track to a diary entry — plays automatically when the entry opens
- Three sources: **personal music library** (upload your own MP3s), **global library** (admin-curated), or a direct URL
- Floating music player with play/pause, mute, volume control
- Auto-selects a random default track if no specific track is assigned

### 🤖 AI Writing Assistant
- Built-in AI chatbot in the diary writing screen
- Modes: **expand**, **rephrase**, **continue**, **summarise**
- Word count slider (20–400 words)
- Append or replace existing text
- Powered via OpenRouter (configurable model)

### 🔐 Authentication & Security
- Username + password signup with live availability check
- Username rules: min 6 chars, must include a special character (`@ _ . - ! #`)
- **Google Sign-In** (one-click OAuth, configurable Client ID from admin)
- **Forgot password** → email reset link (expires in 1 hour, via SMTP)
- JWT sessions (8-hour expiry, stored in localStorage)
- All diary content requires auth; public feed is readable by guests

### 💳 Subscriptions & Payments
- **Free plan** — configurable note limit (default 5, admin can change globally or per-user)
- **Pro Monthly / Pro Yearly / Lifetime** — unlimited entries, canvas, uploads
- **Razorpay** payment integration (credentials stored in DB, not hardcoded)
- **Geo-pricing** — automatic local currency display based on visitor IP
  (₹ India · $ US/CA · £ UK · € EU · A$ AU)
- Admin can **grant free access** to any user for any plan, with an expiry date
- Admin can also **assign/revoke subscriptions** manually
- Per-user note limit override (independent of plan)

### 📸 Media Uploads
- Photos and videos on diary entries (images up to 4 MB, videos up to 50 MB)
- MP4 / MOV / JPG / PNG / WebP supported
- Video streaming with full Range/Accept-Ranges support (works through Nginx/Cloudflare)
- Avatar upload for user profiles
- Global background image library (admin-managed)
- Note background library (admin-managed)
- Personal music library (user-managed, MP3/OGG/WAV/AAC up to 50 MB)

### 🛡️ AI Content Moderation
- Every note toggled public is screened by an AI moderation pass (LLaMA 3.1 via OpenRouter)
- Rejects: nudity, graphic violence, hate speech, CSAM, threats, spam
- Allows: emotional writing, heartbreak, grief, mental health content, strong opinions
- Chat messages screened for hard violations only
- Fails **open** — if the AI API is down, content is allowed through

---

## Pages & Routes

| URL | Description |
|-----|-------------|
| `/` | Landing page + guest feed preview |
| `/@username` | User's diary (public view or owner view) |
| `/s/<token>` | Shared diary link (optional password) |
| `/entry/<id>` | Deep link to a specific entry |
| `/pricing` | Subscription pricing page |
| `/reset-password?token=...` | Password reset flow |
| `/admin` | Admin portal (separate auth) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js 20 + Express 5 |
| **Database** | SQLite via `better-sqlite3` (WAL mode) |
| **Auth** | JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`) |
| **Real-time** | Native WebSocket (`ws`) |
| **Payments** | Razorpay |
| **Email** | Nodemailer (SMTP / Gmail) |
| **AI** | OpenRouter API (LLaMA 3.1) |
| **Frontend** | Vanilla JS + CSS (zero frameworks) |
| **File uploads** | Multer |
| **Deployment** | EC2 + Nginx reverse proxy |

---

## Admin Panel (`/admin`)

A full management dashboard at `/admin`:

- **Overview** — total users, entries, views, reactions, replies, avg session time
- **Activity charts** — daily/weekly/monthly visitor trends (pure SVG, no chart library)
- **Users table** — all registered users with email, phone, join date, entry count, per-user note limits
- **Visitors log** — page view log with IP, location (via ip-api.com), device, time spent
- **Reactions breakdown** — emoji distribution across all posts
- **Subscriptions** — plan distribution, assign/revoke plans, grant free access with expiry
- **Global Images** — upload/delete images available to all users
- **Note Backgrounds** — upload/delete background images for entries
- **Music Library** — upload/delete global music tracks
- **Payments** — Razorpay credentials, plan pricing, geo-pricing table, payment orders
- **Settings** — free tier limit, Google OAuth client ID, Instagram link, admin password
- **My Profile** — admin email/phone (used for forgot-password verification)
