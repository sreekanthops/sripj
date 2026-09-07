require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const path    = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/notes',  require('./routes/notes'));
app.use('/api/auth',   require('./routes/auth'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/admin',  require('./routes/admin'));

// Admin portal — explicit route before SPA fallback
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});
app.get('/admin/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});

// SPA fallback
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Diary running → http://localhost:${PORT}`));
