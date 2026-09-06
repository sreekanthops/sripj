# ✒ My Diary — Full-Stack Notes App

A responsive, mobile-first diary website with a real backend, SQLite database, JWT admin auth, emoji reactions, replies, and music playback.

## Tech Stack
- **Backend**: Node.js + Express 5 + better-sqlite3
- **Auth**: JWT (jsonwebtoken)
- **Database**: SQLite (auto-created as `diary.db`)
- **Frontend**: Vanilla JS + Responsive CSS (no framework)

## Quick Start

```bash
npm install
node server/index.js
# Open http://localhost:3000
```

## Environment Variables (`.env`)
```
PORT=3000
JWT_SECRET=change_this_in_production
ADMIN_PASSWORD=admin123
```

## Features
- 📝 Create / Edit / Delete notes (admin only)
- 🎨 Per-note colour theme, font family, font size & weight
- 📅 Date & time stamp on every note
- 👁 View counter per note
- 📅 Date range filter
- ❤️ Emoji reactions (anyone)
- 💬 Replies / comments (anyone; admin can delete)
- 🔐 Admin login (JWT, 12h session)
- ♪ Background music per note (admin sets URL; auto-plays on open)
- 📱 Mobile-first, swipe navigation between notes
