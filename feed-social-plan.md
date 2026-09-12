# Feed, Follow, Chat & Notifications — Feature Plan

## Top-Level Overview

Introduce a social layer on top of the existing diary app:

- **Feed** — global public feed where users can share individual notes. Anyone can see, react, comment, and share public notes. A fixed **Feed button in the bottom-centre** of the screen provides persistent access.
- **Follow** — logged-in users can follow/unfollow any other user. A user's profile page shows follower/following counts and a follow button.
- **Chat** — floating direct-message panel. Users can start a conversation from any profile or note. Conversations appear in a slide-in panel, messages in a floating window alongside it.
- **Notifications** — real-time bell icon with badge for: new follower, reaction on your public note, reply on your public note, new message received.
- **WebSocket** — single persistent WS connection (Socket.io-style using `ws` npm package) for chat messages and notification pushes.

### Decisions Recorded
- Feed is **global** — all public notes, no follow filter.
- Notes are **individually** toggled as public/private per note.
- Chat is a **floating panel** — not full screen.
- Real-time via **WebSockets** (ws package, already available as a dep or added).

### What Does NOT Change
- Existing private diary, note editing, music, stickers, subscriptions, payments.
- Existing `notes` table rows — just adds a `is_public` column.
- Existing routes — all new routes are additive in new files.

---

## Architecture Overview

```
New DB tables:
  follows            (follower_id, followee_id)
  conversations      (id, created_at)
  conversation_members (conversation_id, user_id)
  messages           (id, conversation_id, sender_id, body, created_at, read_at)
  notifications      (id, recipient_id, type, actor_id, note_id, message_id, read, created_at)

New server files:
  server/routes/feed.js          GET /api/feed
  server/routes/follows.js       POST/DELETE/GET /api/follows
  server/routes/conversations.js GET/POST /api/conversations
  server/routes/messages.js      GET/POST /api/messages/:conversationId
  server/routes/notifications.js GET/PUT  /api/notifications
  server/ws.js                   WebSocket hub (attached to HTTP server)

notes table migration:
  ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0

Frontend new files:
  public/js/feed.js              Feed screen rendering + infinite scroll
  public/js/chat.js              Floating chat panel + message window
  public/js/notifications.js     Notification bell + dropdown
  public/js/ws-client.js         WebSocket client singleton

Frontend HTML additions (in index.html):
  #feedScreen                    Full-screen feed view (replaces mainContent when active)
  #bottomNav                     Fixed bottom nav bar (Home | Feed | Notifications | Chat | Profile)
  #chatPanel                     Slide-in conversation list
  #chatWindow                    Floating message window
  #notifDropdown                 Notification dropdown anchored to bell icon

CSS additions (in style.css):
  Bottom nav bar
  Feed card styles
  Chat panel + window styles
  Notification badge + dropdown
```

---

## Sub-Tasks

---

### Sub-Task 1 — Database Migrations

**Intent:** Add all new tables and the `is_public` column to `notes` so subsequent sub-tasks have a stable schema to build on.

**Expected Outcomes:**
- `notes.is_public` column exists (default 0 = private).
- `follows`, `conversations`, `conversation_members`, `messages`, `notifications` tables exist.
- All migrations are idempotent (safe to re-run).

**Todo List:**
1. In `server/db.js`, after existing migrations, add `hasColumn` guard for `notes.is_public` → `ALTER TABLE notes ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0`.
2. Add `CREATE TABLE IF NOT EXISTS follows` with columns: `id TEXT PK`, `follower_id TEXT NOT NULL`, `followee_id TEXT NOT NULL`, `created_at TEXT NOT NULL`, `UNIQUE(follower_id, followee_id)`.
3. Add `CREATE TABLE IF NOT EXISTS conversations` with columns: `id TEXT PK`, `created_at TEXT NOT NULL`.
4. Add `CREATE TABLE IF NOT EXISTS conversation_members` with columns: `conversation_id TEXT`, `user_id TEXT`, `PRIMARY KEY(conversation_id, user_id)`.
5. Add `CREATE TABLE IF NOT EXISTS messages` with columns: `id TEXT PK`, `conversation_id TEXT NOT NULL`, `sender_id TEXT NOT NULL`, `body TEXT NOT NULL`, `created_at TEXT NOT NULL`, `read_at TEXT`.
6. Add `CREATE TABLE IF NOT EXISTS notifications` with columns: `id TEXT PK`, `recipient_id TEXT NOT NULL`, `type TEXT NOT NULL` (values: `follow`, `reaction`, `reply`, `message`), `actor_id TEXT`, `note_id TEXT`, `message_id TEXT`, `read INTEGER NOT NULL DEFAULT 0`, `created_at TEXT NOT NULL`.

**Relevant Context:**
- `server/db.js` — all existing schema and migration patterns using `hasColumn()` / `hasTable()`.
- Follow the existing `CREATE TABLE IF NOT EXISTS` + `hasColumn` guard pattern exactly.

**Status:** [ ] pending

---

### Sub-Task 2 — Feed Backend (`server/routes/feed.js` + `notes` public toggle)

**Intent:** Expose a paginated global feed API and add the ability to mark/unmark individual notes as public.

**Expected Outcomes:**
- `GET /api/feed?page=1&limit=20` returns public notes from all users, newest first, with author info, reaction counts, reply counts. No auth required.
- `PUT /api/notes/:id/public` toggles `is_public` on a note (owner only).
- The `buildNote` helper in `notes.js` includes `isPublic` in every note object.

**Todo List:**
1. Create `server/routes/feed.js`. Implement `GET /` with pagination (`page`, `limit` params). JOIN `notes` + `users` where `notes.is_public = 1`. Include: `id`, `title`, `body`, `font`, `fontSize`, `bgUrl`, `createdAt`, `author` (id, username, displayName, avatarUrl), `reactionCount`, `replyCount`, `userReactions` (if auth header present via `optionalAuth`).
2. In `server/routes/notes.js`, add `PUT /:id/public` route — `verifyToken`, ownership check, toggle `is_public` value, return `{ isPublic }`.
3. In `server/routes/notes.js`, add `isPublic: !!row.is_public` to the `buildNote` helper object.
4. Mount the feed route in `server/index.js`: `app.use('/api/feed', require('./routes/feed'))`.

**Relevant Context:**
- `server/routes/notes.js` — `buildNote()` helper, `optionalAuth` middleware pattern.
- `server/routes/auth.js` — `verifyToken` middleware.
- `server/db.js` — `notes` schema, `users` schema.

**Status:** [ ] pending

---

### Sub-Task 3 — Follow Backend (`server/routes/follows.js`)

**Intent:** Allow users to follow and unfollow each other, and query follower/following counts and state.

**Expected Outcomes:**
- `POST /api/follows/:userId` — follow a user (auth required, cannot follow self).
- `DELETE /api/follows/:userId` — unfollow.
- `GET /api/follows/:userId` — returns `{ followerCount, followingCount, isFollowing }` (isFollowing relative to the requesting user if authed).
- `GET /api/follows/:userId/followers` — list of followers (id, username, displayName, avatarUrl).
- `GET /api/follows/:userId/following` — list of following.
- After follow, a `notification` row is inserted for the followee (type=`follow`).

**Todo List:**
1. Create `server/routes/follows.js`.
2. `POST /:userId` — insert into `follows`, reject self-follow and duplicate. Insert notification row (type=`follow`, actor=requester, recipient=followed user). Emit WS event to followed user (via `server/ws.js` emitter, added in Sub-Task 6).
3. `DELETE /:userId` — delete from `follows`. Delete any unread follow notification for this pair.
4. `GET /:userId` — query counts + `isFollowing` flag.
5. `GET /:userId/followers` — JOIN `follows` + `users`.
6. `GET /:userId/following` — JOIN `follows` + `users`.
7. Mount in `server/index.js`: `app.use('/api/follows', require('./routes/follows'))`.

**Relevant Context:**
- `server/routes/auth.js` — `verifyToken`, `optionalAuth`.
- `server/db.js` — `follows` table (created in Sub-Task 1), `users` columns.

**Status:** [ ] pending

---

### Sub-Task 4 — Chat Backend (`server/routes/conversations.js` + `server/routes/messages.js`)

**Intent:** Provide REST endpoints to create conversations, send messages, and fetch message history. Real-time delivery is handled by the WS layer (Sub-Task 6) which references these routes' data helpers.

**Expected Outcomes:**
- `GET /api/conversations` — list conversations for current user, each with last message and unread count.
- `POST /api/conversations` — find or create a 1:1 conversation with another user by `userId`.
- `GET /api/messages/:conversationId` — paginated message history (must be a member).
- `POST /api/messages/:conversationId` — send a message (stored to DB, WS delivery triggered). Inserts a `message` notification for the other participant.
- `PUT /api/messages/:conversationId/read` — mark all messages as read for current user.

**Todo List:**
1. Create `server/routes/conversations.js` with `GET /` and `POST /`.
   - `POST /` accepts `{ userId }`. Check if a conversation between the two users already exists in `conversation_members`; if yes return it, else create new conversation + 2 member rows.
2. Create `server/routes/messages.js` with `GET /:conversationId`, `POST /:conversationId`, `PUT /:conversationId/read`.
   - Membership check on all routes.
   - `POST` inserts message row, inserts notification for recipient (type=`message`), calls WS emitter.
3. Mount both in `server/index.js`.

**Relevant Context:**
- `server/db.js` — `conversations`, `conversation_members`, `messages`, `notifications` tables (Sub-Task 1).
- `server/routes/auth.js` — `verifyToken`.
- WS emitter will be a simple exported function from `server/ws.js` (Sub-Task 6).

**Status:** [ ] pending

---

### Sub-Task 5 — Notifications Backend (`server/routes/notifications.js`)

**Intent:** Expose endpoints to fetch and mark-as-read notifications for the current user.

**Expected Outcomes:**
- `GET /api/notifications` — returns last 50 notifications for current user, newest first, with actor info (username, avatarUrl), note title if applicable.
- `PUT /api/notifications/read` — marks all as read (or single by id).
- `GET /api/notifications/unread-count` — returns `{ count }`.

**Todo List:**
1. Create `server/routes/notifications.js`.
2. `GET /` — JOIN `notifications` + `users` (actor) + `notes` (optional). Return enriched list.
3. `PUT /read` — body `{ id? }`. If `id` provided, mark single; else mark all for user.
4. `GET /unread-count` — fast COUNT query.
5. Mount in `server/index.js`.

**Relevant Context:**
- `server/db.js` — `notifications` table (Sub-Task 1).
- Notification rows are inserted by follow (Sub-Task 3), reactions/replies (extend notes.js), and messages (Sub-Task 4).

**Status:** [ ] pending

---

### Sub-Task 6 — WebSocket Server (`server/ws.js`)

**Intent:** Attach a WebSocket server to the existing HTTP server so the app has real-time bidirectional messaging for chat and notification delivery.

**Expected Outcomes:**
- A `ws` WebSocket server is created and attached to the existing `http.Server` instance in `server/index.js`.
- Each authenticated client registers with its `userId` on connect (JWT passed as query param).
- `emitToUser(userId, eventType, payload)` is exported for other route files to call.
- Incoming WS messages are typed: `{ type: 'ping' }` for keep-alive; `{ type: 'message', conversationId, body }` triggers DB insert + delivery to recipient.
- On message delivery, emit `{ type: 'new_message', message }` to recipient and `{ type: 'message_sent', message }` back to sender.
- On follow/reply/reaction (triggered from REST handlers via `emitToUser`), emit `{ type: 'notification', notification }` to the recipient.

**Todo List:**
1. Add `ws` to `package.json` dependencies (`npm install ws`).
2. Create `server/ws.js`. Export `{ attachWS(httpServer), emitToUser(userId, type, payload) }`.
3. In `attachWS`, create `new WebSocket.Server({ server: httpServer, path: '/ws' })`.
4. On `connection`, parse JWT from `req.url` query string using `verifyToken` logic from `server/auth.js`. Store socket in a `Map<userId, Set<ws>>` to support multiple tabs.
5. On `message`, handle `ping` (pong back) and `message` type (insert to DB, emit to both parties).
6. On `close`, remove from map.
7. In `server/index.js`, change `app.listen(...)` to use an explicit `http.createServer(app)` then attach WS, then `server.listen(...)`.
8. Export `emitToUser` and import it in follows, messages, and notifications routes where needed.

**Relevant Context:**
- `server/index.js` — currently calls `app.listen()` directly; needs to switch to `http.createServer`.
- `server/auth.js` — exports `verifyToken` middleware and `signToken`; the raw `jwt.verify` logic should be reused for WS auth.

**Status:** [ ] pending

---

### Sub-Task 7 — Frontend: Feed Screen + Public Toggle

**Intent:** Build the global feed screen and the per-note "Share to Feed" toggle in the note form and note card.

**Expected Outcomes:**
- A `#feedScreen` div is shown when the Feed nav item is active. It contains an infinite-scroll feed of public note cards.
- Each feed card shows: author avatar + name, note title, truncated body, background image (if any), reaction bar, comment count, share button, follow button (if not following author).
- Logged-in users can react, comment, and follow from within the feed card.
- In the note create/edit form, a "Share to Feed 🌍" toggle appears. When enabled, note is marked `is_public=1`.
- On the note grid (diary view), public notes have a small 🌍 badge.

**Todo List:**
1. Create `public/js/feed.js`. Implement `loadFeed(page)`, `renderFeedCard(note)`, infinite scroll via `IntersectionObserver` on a sentinel element.
2. Add `#feedScreen` section to `public/index.html` inside `#appScreen` (hidden by default, shown via bottom nav).
3. Add `<script src="/js/feed.js">` to `index.html`.
4. In `renderFeedCard`, wire up inline reaction (calls `POST /api/notes/:id/react`), comment count tap (opens `detailOverlay`), share copy-link, and follow button (calls `POST /api/follows/:userId`).
5. Add "Share to Feed 🌍" toggle to the note form HTML (`#formOverlay`).
6. In `app.js` note-save handler (`openNewForm` / save path), include `isPublic` in the PUT/POST body.
7. In `renderGrid`, add a 🌍 badge to note cards where `note.isPublic === true`.

**Relevant Context:**
- `public/js/app.js` — `openNewForm()`, note save handler, `renderGrid()`, `buildNote` result shape.
- `public/index.html` — `#formOverlay` fields, `#notesSection` structure.
- `public/css/style.css` — existing card/overlay/button patterns to follow.

**Status:** [ ] pending

---

### Sub-Task 8 — Frontend: Follow Button + Profile Follower Counts

**Intent:** Surface follow/unfollow on user profiles and feed cards, and show follower/following counts on profile views.

**Expected Outcomes:**
- When viewing another user's diary (`viewingUser` set, `!isOwner`), a Follow / Following button appears in the topbar or below the page title.
- Clicking it calls `POST /api/follows/:userId` or `DELETE /api/follows/:userId`.
- The user's profile section (visible on their diary page) shows follower count and following count.
- Feed cards include an inline Follow button that updates state immediately (optimistic UI).

**Todo List:**
1. In `public/js/app.js`, in `enterPublicDiary()` after `renderHeader()`, call `loadFollowState(viewingUser.id)` to fetch `isFollowing` and counts.
2. Add a follow button to `renderHeader()` — shows when `!isOwner && viewingUser`.
3. Implement `toggleFollow(userId)` — POST or DELETE, update button state, update local follower count.
4. Add follower/following count display below `sidebarTitle`/`sidebarSub` on public profile views.
5. Export `toggleFollow` to `window` so `feed.js` can call it from feed card buttons.

**Relevant Context:**
- `public/js/app.js` — `renderHeader()`, `enterPublicDiary()`, `viewingUser`, `isOwner`.
- `public/index.html` — `#sidebarSub`, `#headerActions`.

**Status:** [ ] pending

---

### Sub-Task 9 — Frontend: Notifications Bell + Dropdown

**Intent:** Add a notification bell icon to the topbar with an unread badge and a dropdown showing recent notifications.

**Expected Outcomes:**
- Bell icon appears in `topbar-right` when logged in.
- A red badge shows unread count (disappears when opened).
- Clicking bell opens a dropdown listing last 20 notifications with type icons, actor name, and relative time.
- Clicking a notification navigates to the relevant note or conversation.
- WS `notification` events from `ws-client.js` increment the badge in real time.

**Todo List:**
1. Add bell button `#notifBell` and `#notifDropdown` to `public/index.html` topbar-right.
2. Create `public/js/notifications.js`. Implement `loadNotifications()`, `renderNotifDropdown()`, `markAllRead()`, `updateBadge(count)`.
3. On bell click, open dropdown, load notifications, mark all read.
4. In `public/js/ws-client.js` (Sub-Task 10), on `notification` WS event, call `updateBadge()` and prepend to dropdown list.
5. Poll unread count on page focus as fallback (`GET /api/notifications/unread-count`).
6. Add `<script src="/js/notifications.js">` to `index.html`.

**Relevant Context:**
- `public/index.html` — topbar-right structure, `#topbarUserChip`, `#visitorHostDp` placement.
- `public/css/style.css` — dropdown/overlay z-index layering.
- WS event handling in `ws-client.js` (Sub-Task 10).

**Status:** [ ] pending

---

### Sub-Task 10 — Frontend: WebSocket Client (`public/js/ws-client.js`)

**Intent:** Establish and maintain a single authenticated WS connection per browser session that routes incoming events to the correct handler.

**Expected Outcomes:**
- Connects to `wss://<host>/ws?token=<jwt>` after login.
- Auto-reconnects with exponential back-off on disconnect.
- Dispatches `new_message` events to `chat.js`.
- Dispatches `notification` events to `notifications.js`.
- Exposes `wsSend(type, payload)` for sending messages from the chat panel.
- Disconnects on logout.

**Todo List:**
1. Create `public/js/ws-client.js`. Export `{ wsConnect(token), wsDisconnect(), wsSend(type, payload) }` on `window.WS`.
2. `wsConnect` opens a `new WebSocket(url)`, attaches `onmessage` router, `onclose` reconnect timer.
3. `onmessage` router: parse JSON, switch on `type`, call `window.Chat?.handleIncoming` or `window.Notif?.handleIncoming`.
4. `wsDisconnect` closes socket and cancels reconnect timer.
5. Call `WS.wsConnect(token)` in `app.js` after successful login/verify.
6. Call `WS.wsDisconnect()` on logout.
7. Add `<script src="/js/ws-client.js">` to `index.html` before other social scripts.

**Relevant Context:**
- `public/js/app.js` — login handler, logout handler, `token` variable.
- `server/ws.js` (Sub-Task 6) — WS path `/ws`, event shapes.

**Status:** [ ] pending

---

### Sub-Task 11 — Frontend: Floating Chat Panel (`public/js/chat.js`)

**Intent:** Build the slide-in conversation list and floating message window for DM chat.

**Expected Outcomes:**
- A chat icon in the bottom nav opens `#chatPanel` (slide-in from right).
- `#chatPanel` lists all conversations with last message preview and unread badge.
- Clicking a conversation opens `#chatWindow` (floating bottom-right, above music player).
- `#chatWindow` shows message history, a text input, and send button.
- Incoming WS messages (`new_message` event) append to the open window and update the conversation list.
- Unread count badge on chat icon in bottom nav updates via WS.
- Users can start a new conversation from a profile page or feed card via a "Message" button.

**Todo List:**
1. Add `#chatPanel` and `#chatWindow` HTML to `public/index.html`.
2. Create `public/js/chat.js`. Implement `openChatPanel()`, `loadConversations()`, `openConversation(conversationId)`, `loadMessages(conversationId)`, `sendMessage(body)`, `handleIncoming(event)`.
3. `loadConversations` calls `GET /api/conversations`, renders list in `#chatPanel`.
4. `openConversation` calls `GET /api/messages/:id`, renders in `#chatWindow`, marks read.
5. `sendMessage` calls `POST /api/messages/:id` OR uses `WS.wsSend('message', {...})` for instant delivery.
6. `handleIncoming` receives `new_message` from `ws-client.js`, appends to open window, updates conversation list.
7. "Message" button on public profiles calls `POST /api/conversations { userId }` then opens chat window.
8. Add `<script src="/js/chat.js">` to `index.html`.

**Relevant Context:**
- `public/js/ws-client.js` (Sub-Task 10) — `window.WS.wsSend`, `window.Chat.handleIncoming` interface.
- `public/css/style.css` — z-index layers, floating player is at `z-index: 350`; chat window should be `360`.
- `public/index.html` — `#floatingMusicPlayer` position as spatial reference for chat window placement.

**Status:** [ ] pending

---

### Sub-Task 12 — Frontend: Bottom Navigation Bar

**Intent:** Add a persistent bottom nav bar with Home, Feed, Notifications, Chat, and Profile tabs for mobile-first access.

**Expected Outcomes:**
- A `#bottomNav` bar is fixed to the bottom of `#appScreen`.
- Five icons: 🏠 Home | 📰 Feed | 🔔 Notifs | 💬 Chat | 👤 Profile.
- Active tab is highlighted; Feed and Chat tabs show unread/count badges when applicable.
- On mobile it is always visible. On desktop it sits above the floating music player.
- Tapping Home shows the diary grid (`#notesSection`). Feed shows `#feedScreen`. Notifications opens the bell dropdown. Chat opens `#chatPanel`. Profile opens `profileOverlay`.
- The existing Ask AI FAB moves up to avoid overlap.

**Todo List:**
1. Add `#bottomNav` HTML to `public/index.html` inside `#appScreen`, after `#mainContent`.
2. Add bottom nav CSS to `public/css/style.css` — fixed bottom, `z-index: 370`, flex row, backdrop blur.
3. Wire tab click handlers in `public/js/app.js` — show/hide `#feedScreen` vs `#notesSection`, call `openChatPanel()`, open bell dropdown, open profile modal.
4. Adjust `main#mainContent` bottom padding to clear the nav bar (`padding-bottom: 70px`).
5. Move Ask AI FAB up by the nav bar height (already at `bottom: 80px`, increase to `bottom: 130px` when bottom nav is shown).
6. Show `#bottomNav` only when `#appScreen` is visible (mirror existing chatbot-fab visibility logic).

**Relevant Context:**
- `public/css/style.css` — `.fmp` at `bottom: 14px`, `.chatbot-fab` at `bottom: 80px`, `z-index` layer map.
- `public/index.html` — `#appScreen` structure, `#mainContent`.
- `public/js/app.js` — `showApp()`, `showLanding()` screen switches (add/remove `#bottomNav` visibility there).

**Status:** [ ] pending

---

### Sub-Task 13 — Reaction & Reply Notifications (extend notes.js)

**Intent:** Insert notification rows when someone reacts to or replies on a public note owned by a logged-in user.

**Expected Outcomes:**
- When `POST /api/notes/:id/react` succeeds on a public note, a `reaction` notification is inserted for the note owner (if actor ≠ owner).
- When `POST /api/notes/:id/replies` is posted on a public note, a `reply` notification is inserted for the note owner (if actor ≠ owner).
- `emitToUser` is called for real-time delivery of these notifications.

**Todo List:**
1. In `server/routes/notes.js` react handler: after inserting reaction row, check if `note.is_public && note.user_id !== actorId`. If yes, insert notification row and call `emitToUser`.
2. In `server/routes/notes.js` reply handler: same pattern for `reply` type notification.
3. Import `emitToUser` from `server/ws.js` at top of `notes.js`.

**Relevant Context:**
- `server/routes/notes.js` — react handler around line 306, reply handler around line 340.
- `server/ws.js` (Sub-Task 6) — `emitToUser` export.
- `server/db.js` — `notifications` table (Sub-Task 1).

**Status:** [ ] pending

---

## Implementation Order

Sub-tasks must be implemented in this order (each depends on the previous):

1. → Sub-Task 1 (DB schema)
2. → Sub-Task 6 (WS server — needs http.Server refactor done early)
3. → Sub-Task 2 (Feed backend)
4. → Sub-Task 3 (Follow backend)
5. → Sub-Task 4 (Chat backend)
6. → Sub-Task 5 (Notifications backend)
7. → Sub-Task 13 (Extend notes.js for notifications)
8. → Sub-Task 10 (WS client)
9. → Sub-Task 12 (Bottom nav)
10. → Sub-Task 7 (Feed screen)
11. → Sub-Task 8 (Follow button + counts)
12. → Sub-Task 9 (Notifications bell)
13. → Sub-Task 11 (Chat panel)
