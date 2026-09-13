# ✦ Unsent Stories — Setup Guide

This guide covers every step to get Unsent Stories running locally and deployed on a Linux server (EC2 / VPS).

---

## Requirements

| Tool | Min version | Notes |
|------|------------|-------|
| Node.js | 18+ | 20 LTS recommended |
| npm | 9+ | comes with Node |
| Git | any | for cloning / deploying |
| A Linux VPS | — | EC2 Amazon Linux 2023 tested |
| (optional) Nginx | any | reverse proxy for production |

---

## 1. Local Development

### Clone and install

```bash
git clone https://github.com/sreekanthops/sripj.git
cd sripj/diary-app
npm install
```

### Create `.env`

Create a file named `.env` in the `diary-app/` directory:

```env
# ── Core ──────────────────────────────────────────────────────────
PORT=8080
JWT_SECRET=change_this_to_a_long_random_string

# ── Email (for password reset) ────────────────────────────────────
# Use a Gmail account with App Password (not your main password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your@gmail.com
SMTP_PASS=your_gmail_app_password
SMTP_FROM="Unsent Stories <noreply@yourdomain.com>"

# ── AI features (optional) ────────────────────────────────────────
# Get a free key from https://openrouter.ai
OPENROUTER_API_KEY=sk-or-v1-...
```

> If `OPENROUTER_API_KEY` is not set, AI writing assistant and content moderation are disabled but everything else works normally.

### Start the server

```bash
npm start
# or for auto-restart on file changes:
npm run dev
```

Open **http://localhost:8080**

The SQLite database (`diary.db`) is created automatically on first run.

---

## 2. Seed Demo Data

After the server has run at least once (so the DB is created), seed dummy users and public posts to populate the feed:

```bash
node seed-demo.js
```

This creates:
- 5 dummy users: `aarav.writes`, `priya_journals`, `kiran.m`, `meera.thoughts`, `ravi.diaries` (password: `demo1234`)
- ~40 public diary entries spread across those users
- 7 active stories (24-hour)
- Reactions, comments, and follow relationships between users

The script is **safe to re-run** — it skips existing records and only refreshes story expiry.

---

## 3. Admin Portal

Go to **http://localhost:8080/admin**

Default credentials:
```
Username: admin
Password: admin123
```

**Change the password immediately** after first login:  
Admin → Settings → Change Admin Password

From the admin panel you can:
- See all users and their stats
- Manage subscriptions and grant free access
- Upload global images, note backgrounds, and music tracks
- Set Razorpay keys, Google OAuth client ID, Instagram page URL
- Configure the free tier note limit

---

## 4. Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Port to listen on (default: `8080`) |
| `JWT_SECRET` | **Yes** | Secret for signing user JWT tokens. Must be long and random in production. |
| `SMTP_HOST` | For email | SMTP server hostname |
| `SMTP_PORT` | For email | SMTP port (usually `465` for SSL or `587` for TLS) |
| `SMTP_SECURE` | For email | `true` for SSL (port 465), `false` for STARTTLS (port 587) |
| `SMTP_USER` | For email | SMTP login username (usually your email address) |
| `SMTP_PASS` | For email | SMTP password or App Password |
| `SMTP_FROM` | For email | `"From"` address shown in reset emails |
| `OPENROUTER_API_KEY` | For AI | OpenRouter API key for AI writing + content moderation |

---

## 5. Production Deployment (EC2 / Linux VPS)

### Install Node.js on Amazon Linux 2023

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
node -v   # should print v20.x.x
```

### Clone and set up the app

```bash
cd ~
git clone https://github.com/sreekanthops/sripj.git
cd sripj/diary-app
npm install --omit=dev
```

Create your `.env` file (see Section 2 above).

### Run with PM2 (process manager — keeps the app alive)

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the app
pm2 start server/index.js --name unsent-stories

# Auto-start on server reboot
pm2 startup
pm2 save
```

Useful PM2 commands:
```bash
pm2 logs unsent-stories      # stream live logs
pm2 restart unsent-stories   # restart after a deploy
pm2 status                   # check if running
```

### Pull latest code and restart

```bash
cd ~/sripj/diary-app
git pull origin apk
pm2 restart unsent-stories
```

---

## 6. Nginx Reverse Proxy (HTTPS)

Install Nginx:
```bash
sudo dnf install -y nginx
sudo systemctl enable --now nginx
```

Create `/etc/nginx/conf.d/unsent-stories.conf`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect HTTP → HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # WebSocket support (real-time chat + notifications)
    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host       $host;
        proxy_read_timeout 86400;
    }

    # All other requests
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Increase for file uploads
        client_max_body_size 55m;
        proxy_read_timeout   120s;
    }
}
```

Test and reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Free SSL with Let's Encrypt

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
# Follow the prompts — certbot edits the nginx config automatically
```

Auto-renew is set up by certbot automatically. Test it:
```bash
sudo certbot renew --dry-run
```

---

## 7. Configuring Optional Integrations (from Admin Panel)

All of these are configured at runtime from `/admin` — no restart required.

### Razorpay (payments)
1. Log in to [razorpay.com](https://razorpay.com) → Settings → API Keys → Generate Key
2. Admin → Payments → paste Key ID + Key Secret → Save

### Google Sign-In
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → APIs & Services → Credentials → Create OAuth 2.0 Client ID
3. Add your domain to **Authorised JavaScript origins** (e.g. `https://yourdomain.com`)
4. Copy the Client ID
5. Admin → Settings → Google Sign-In → paste Client ID → Save

### Instagram page link
1. Admin → Settings → Social Media Links → paste your Instagram URL → Save
2. The ✦ Instagram button appears in the landing page nav and app topbar automatically

### Gmail App Password (for password reset emails)
1. Google Account → Security → 2-Step Verification → App passwords
2. Create an app password for "Mail"
3. Add to `.env`:
   ```
   SMTP_USER=your@gmail.com
   SMTP_PASS=xxxx xxxx xxxx xxxx
   ```
4. Restart the server: `pm2 restart unsent-stories`

### OpenRouter AI key
1. Sign up at [openrouter.ai](https://openrouter.ai) — free tier available
2. Create an API key
3. Add to `.env`: `OPENROUTER_API_KEY=sk-or-v1-...`
4. Restart: `pm2 restart unsent-stories`

---

## 8. File Storage

All uploaded files are stored locally under `public/uploads/`, `public/global-images/`, `public/note-backgrounds/`, `public/music-library/`, and `public/user-music/`.

These directories are served as static files by Express (and Nginx in production).

> **Backup note:** If you redeploy or rebuild the server, copy these directories to preserve user uploads. The SQLite `diary.db` file should also be backed up — it contains all user data.

Backup command:
```bash
# Run from the diary-app directory
tar czf backup-$(date +%Y%m%d).tar.gz diary.db public/uploads public/global-images public/note-backgrounds public/music-library public/user-music
```

---

## 9. Project Structure

```
diary-app/
├── server/
│   ├── index.js          # Express app + WebSocket attachment
│   ├── db.js             # SQLite schema + migrations (auto-run on startup)
│   ├── auth.js           # JWT sign/verify, bcrypt helpers
│   ├── ws.js             # WebSocket server (chat + notifications)
│   ├── moderation.js     # AI content moderation (OpenRouter)
│   ├── subscription.js   # Plan resolver (effective plan per user)
│   └── routes/
│       ├── auth.js       # /api/auth  — login, signup, verify, forgot/reset password
│       ├── notes.js      # /api/notes — CRUD, public toggle, story toggle
│       ├── feed.js       # /api/feed  — smart-ranked public feed
│       ├── stories.js    # /api/stories — story bar + viewer
│       ├── follows.js    # /api/follows — follow/unfollow, follower lists
│       ├── conversations.js  # /api/conversations — DM threads
│       ├── messages.js   # /api/messages — send/edit/delete messages
│       ├── notifications.js  # /api/notifications — bell feed
│       ├── admin.js      # /api/admin — admin auth + stats + user management
│       ├── payments.js   # /api/payments — Razorpay, plans, geo-pricing, settings
│       ├── subscriptions.js  # /api/subscriptions — plan assignment
│       ├── upload.js     # /api/upload — media, avatar uploads
│       ├── global-images.js  # /api/global-images
│       ├── note-backgrounds.js
│       ├── music-library.js
│       ├── user-music-library.js
│       ├── ai.js         # /api/ai — AI writing assistant
│       └── rephrase.js   # /api/rephrase — rephrase endpoint
│
├── public/
│   ├── index.html        # Main SPA shell (landing + diary + feed)
│   ├── pricing.html      # Pricing page
│   ├── css/style.css     # All styles (single file, no preprocessor)
│   ├── js/
│   │   ├── app.js        # Main application logic
│   │   ├── feed.js       # Feed + Story Bar + Guest Feed modules
│   │   ├── chat.js       # DM chat panel
│   │   ├── notifications.js  # Notification bell + dropdown
│   │   └── ws-client.js  # WebSocket client (auto-reconnect)
│   ├── admin/index.html  # Admin portal (self-contained)
│   ├── uploads/          # User-uploaded media
│   ├── global-images/    # Admin-uploaded global images
│   ├── note-backgrounds/ # Admin-uploaded note backgrounds
│   ├── music-library/    # Admin-uploaded music tracks
│   └── user-music/       # User-uploaded personal music
│
├── seed-demo.js          # One-time demo data seeder
├── package.json
├── .env                  # Environment variables (not committed)
├── diary.db              # SQLite database (auto-created, not committed)
└── README.md             # Features & purpose (this repo)
```

---

## 10. Common Issues

**Port already in use**
```bash
sudo lsof -i :8080
kill -9 <PID>
```

**Database locked error**
SQLite WAL mode is enabled but if you see `SQLITE_BUSY`, it usually means another Node process is running:
```bash
pm2 list
pm2 delete all
pm2 start server/index.js --name unsent-stories
```

**Uploads not persisting after redeploy**
The `public/uploads` directory is on the local filesystem. Back it up before any deployment that replaces the directory. See Section 8.

**WebSocket not connecting in production**
Ensure the Nginx config includes the `Upgrade` and `Connection` headers for the `/ws` location block (see Section 6). Also verify your security group / firewall allows port 443.

**Google Sign-In button does nothing**
The Google Client ID must be set in Admin → Settings. The domain must match the Authorised JavaScript origins in Google Cloud Console exactly (include `https://`, no trailing slash).

**Emails not sending**
Check that `SMTP_USER` / `SMTP_PASS` are set in `.env` and the server was restarted after editing. Gmail requires a 16-character App Password (not your account password). Make sure 2FA is enabled on the Gmail account before generating an App Password.
