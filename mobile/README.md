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
