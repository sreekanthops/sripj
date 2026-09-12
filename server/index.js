require('dotenv').config();
const http    = require('http');
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
// Trust reverse proxy (Nginx, Cloudflare, etc.) so req.ip and
// x-forwarded-for contain the real visitor IP, not the proxy's IP
app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(morgan('dev'));

// ── Uploads: stream with full Range / Accept-Ranges support ─────────────────
// express.static handles Accept-Ranges fine in dev, but behind some reverse
// proxies the Content-Length / Range headers get stripped, causing audio
// elements to show 0:00/0:00. This explicit route forces them through.
const _uploadDir  = path.join(__dirname, '..', 'public', 'uploads');
const _fs         = require('fs');
const _mime       = require('mime-types');
app.get('/uploads/:file', (req, res) => {
  const filePath = path.join(_uploadDir, path.basename(req.params.file));
  // Prevent path traversal
  if (!filePath.startsWith(_uploadDir)) return res.status(403).end();
  _fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return res.status(404).end();
    const mimeType = _mime.lookup(filePath) || 'application/octet-stream';
    const fileSize = stat.size;
    const range    = req.headers.range;
    if (range) {
      // Partial content — required for audio seeking & duration detection
      const parts  = range.replace(/bytes=/, '').split('-');
      const start  = parseInt(parts[0], 10);
      const end    = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges':  'bytes',
        'Content-Length': chunkSize,
        'Content-Type':   mimeType,
      });
      _fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type':   mimeType,
        'Accept-Ranges':  'bytes',
      });
      _fs.createReadStream(filePath).pipe(res);
    }
  });
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/notes',             require('./routes/notes'));
app.use('/api/auth',              require('./routes/auth'));
app.use('/api/upload',            require('./routes/upload'));
app.use('/api/admin',             require('./routes/admin'));
app.use('/api/rephrase',          require('./routes/rephrase'));
app.use('/api/ai',                require('./routes/ai'));
app.use('/api/stickers',          require('./routes/stickers'));
app.use('/api/subscriptions',     require('./routes/subscriptions'));
app.use('/api/global-images',     require('./routes/global-images'));
app.use('/api/payments',          require('./routes/payments'));
app.use('/api/note-backgrounds',  require('./routes/note-backgrounds'));
app.use('/api/music-library',     require('./routes/music-library'));
app.use('/api/user-music',        require('./routes/user-music-library'));
app.use('/api/feed',              require('./routes/feed'));
app.use('/api/follows',           require('./routes/follows'));
app.use('/api/conversations',     require('./routes/conversations'));
app.use('/api/messages',          require('./routes/messages'));
app.use('/api/notifications',     require('./routes/notifications'));

// Admin portal — explicit route before SPA fallback
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});
app.get('/admin/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});

// Pricing page — explicit route before SPA fallback
app.get('/pricing', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'pricing.html'));
});

// /reset-password?token=... — serve SPA (JS handles the reset form)
app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// /s/:token  — opaque diary share link → serves the SPA (JS handles resolution)
app.get('/s/:token', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// SPA fallback
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── WebSocket server ────────────────────────────────────────────────────────
const { attachWS } = require('./ws');
attachWS(server);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Diary running → http://localhost:${PORT}`));
