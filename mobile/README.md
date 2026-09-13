# Unsent Stories — Mobile App

React Native / Expo app for **Android** (Play Store) and **iOS** (App Store).  
Connects to the same server as the web app — all features are shared via REST API + WebSockets.

---

## Features
- 📖 Private diary with grid + story-view (tinder swipe)
- 🌍 Public feed with reactions, follow, message
- 💬 Real-time direct messaging (WebSocket)
- 🔔 Live notifications (follow, reaction, reply, message)
- 👤 Profiles with follower/following counts
- ✦ Note form: font picker, colour themes, tags, bg toggle, share-to-feed switch
- 🔑 Auth: sign in, sign up, forgot password
- Warm parchment design system matching the web app

---

## Local Development

```bash
cd mobile
npm install
npx expo start
```

Scan the QR with **Expo Go** (iOS / Android).

### Point at your local server

Edit [`src/api/client.js`](src/api/client.js) line 4:
```js
export const BASE_URL = 'http://192.168.x.x:3000';  // your LAN IP
```

---

## Building for Stores

### Prerequisites
```bash
npm install -g eas-cli
eas login
```

### Android (Play Store)
```bash
eas build --platform android --profile production
```
Produces an `.aab` bundle ready for the Play Console.

### iOS (App Store)
```bash
eas build --platform ios --profile production
```
Requires an Apple Developer account ($99/yr).  
Produces an `.ipa` for App Store Connect.

### Submit
```bash
eas submit --platform android   # uploads .aab to Play Console
eas submit --platform ios       # uploads .ipa to App Store Connect
```

---

## Configuration

| File | Purpose |
|------|---------|
| `app.json` | Bundle IDs, permissions, splash, icons |
| `src/api/client.js` | `BASE_URL` — switch prod ↔ local |
| `eas.json` | Build profiles (create with `eas build:configure`) |

---

## Project Structure

```
mobile/
├── App.js                    # Root navigator + auth gate
├── app.json                  # Expo config (iOS + Android)
├── src/
│   ├── api/client.js         # apiFetch, getToken, BASE_URL
│   ├── context/AuthContext.js# login / signup / logout state
│   ├── hooks/useWebSocket.js # WS singleton + useWSMessage hook
│   ├── theme/index.js        # Colors, Typography, Shadow, Radius
│   ├── components/UI.js      # Button, Card, TextField, Avatar, Toast
│   └── screens/
│       ├── auth/             # LoginScreen, ForgotPasswordScreen
│       ├── home/             # HomeScreen (diary grid)
│       ├── note/             # NoteDetailScreen, NoteFormScreen
│       ├── feed/             # FeedScreen (public feed)
│       ├── chat/             # ConversationsScreen, ChatThreadScreen
│       ├── notifications/    # NotificationsScreen
│       └── profile/          # ProfileScreen, UserProfileScreen, UserListScreen
```

---

## ⚠️ Running on EC2 vs Local Machine

**The Expo dev server must run on your local machine, not on EC2.**

EC2 is your production backend (Express server). The mobile app is a *client* that calls that backend.

### Correct workflow

**On your local Mac/Windows:**
```bash
git pull origin apk
cd mobile
npm install
npx expo start
```
Scan the QR with **Expo Go** on your phone.

**Point the app at your EC2 server:**
Edit `src/api/client.js` line 4 — it is already set to prod:
```js
export const BASE_URL = 'https://unsentstories.in';
```
So your phone will call your live EC2 backend. No change needed.

**To build a real APK / IPA (still on local machine):**
```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview   # .apk for testing
eas build --platform android --profile production # .aab for Play Store
eas build --platform ios     --profile production # .ipa for App Store
```
