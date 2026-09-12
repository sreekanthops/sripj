require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const path    = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(morgan('dev'));
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Diary running → http://localhost:${PORT}`));
