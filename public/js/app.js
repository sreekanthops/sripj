/* ── app.js — full client-side diary application ────────────────────────── */
'use strict';

// ── CONFIG ─────────────────────────────────────────────────────────────────
const API = '/api';
const EMOJIS = ['❤️','😂','😢','😮','😍','🙏','👏','🔥','🎉','😆'];
const PALETTE = [
  { bg: '#fff8f0', accent: '#c9956a', border: '#e8d5b7' },
  { bg: '#f0f7ff', accent: '#4a8fd5', border: '#b5d0f0' },
  { bg: '#f2fff0', accent: '#3d9a4e', border: '#b0e0b5' },
  { bg: '#fff0f6', accent: '#c93d6f', border: '#f0b5ce' },
  { bg: '#fffbf0', accent: '#b07a10', border: '#e8d080' },
  { bg: '#f6f0ff', accent: '#7a40cc', border: '#c8aef5' },
  { bg: '#f0fffe', accent: '#1aadad', border: '#90dede' },
  { bg: '#fff4f0', accent: '#cc5a35', border: '#f0c0a8' },
];

// ── STATE ──────────────────────────────────────────────────────────────────
let token     = sessionStorage.getItem('diary_token') || null;
let isAdmin   = false;
let notes     = [];
let editId    = null;
let detailId  = null;

const audio   = document.getElementById('bgAudio');

// ── HELPERS ────────────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg, dur = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), dur);
}

// ── API REQUESTS ───────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body)  opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── MODAL HELPERS ──────────────────────────────────────────────────────────
function openOverlay(id) { document.getElementById(id).classList.add('open'); }
function closeOverlay(id) { document.getElementById(id).classList.remove('open'); }

['detailOverlay','formOverlay','loginOverlay'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target === document.getElementById(id)) closeOverlay(id);
  });
});
document.getElementById('detailClose').onclick = () => closeOverlay('detailOverlay');
document.getElementById('formClose').onclick   = () => closeOverlay('formOverlay');
document.getElementById('loginClose').onclick  = () => closeOverlay('loginOverlay');

// ── AUTH ───────────────────────────────────────────────────────────────────
async function tryLogin() {
  const pwd = document.getElementById('loginPwd').value;
  try {
    const { token: t } = await api('POST', '/auth/login', { password: pwd });
    token = t;
    sessionStorage.setItem('diary_token', t);
    isAdmin = true;
    document.body.classList.add('is-admin');
    closeOverlay('loginOverlay');
    renderHeader();
    renderGrid();
    toast('Welcome, Admin! 👋');
  } catch (err) {
    toast('Wrong password ❌');
    document.getElementById('loginPwd').value = '';
    document.getElementById('loginPwd').focus();
  }
}
document.getElementById('loginBtn').onclick = tryLogin;
document.getElementById('loginPwd').onkeydown = e => { if (e.key === 'Enter') tryLogin(); };

// ── VERIFY STORED TOKEN ────────────────────────────────────────────────────
async function verifyStoredToken() {
  if (!token) return;
  try {
    // Simple check: try fetching notes with token
    await api('GET', '/notes');
    isAdmin = true;
    document.body.classList.add('is-admin');
  } catch {
    token = null;
    sessionStorage.removeItem('diary_token');
  }
}

// ── HEADER ─────────────────────────────────────────────────────────────────
function renderHeader() {
  const el = document.getElementById('headerActions');
  document.getElementById('musicField').style.display = isAdmin ? '' : 'none';

  if (isAdmin) {
    el.innerHTML = `
      <span class="admin-badge">🔐 Admin</span>
      <button class="btn btn-primary btn-sm" id="btnNewNote">+ New Note</button>
      <button class="btn btn-outline btn-sm" id="btnLogout">Logout</button>
    `;
    document.getElementById('btnNewNote').onclick = openNewNoteForm;
    document.getElementById('btnLogout').onclick  = () => {
      token = null; isAdmin = false;
      sessionStorage.removeItem('diary_token');
      document.body.classList.remove('is-admin');
      renderHeader(); renderGrid();
      toast('Logged out');
    };
  } else {
    el.innerHTML = `
      <button class="btn btn-outline btn-sm" id="btnAdminLogin">🔐 Admin Login</button>
    `;
    document.getElementById('btnAdminLogin').onclick = () => {
      document.getElementById('loginPwd').value = '';
      openOverlay('loginOverlay');
      setTimeout(() => document.getElementById('loginPwd').focus(), 120);
    };
  }
}

// ── COLOUR SWATCHES ────────────────────────────────────────────────────────
function buildSwatches(selIdx = 0) {
  const c = document.getElementById('swatches');
  c.innerHTML = '';
  PALETTE.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'swatch' + (i === selIdx ? ' active' : '');
    div.style.cssText = `background:${p.bg};border-color:${i === selIdx ? p.accent : p.border};`;
    div.dataset.i = i;
    div.onclick = () => {
      c.querySelectorAll('.swatch').forEach(s => {
        s.classList.remove('active');
        s.style.borderColor = PALETTE[+s.dataset.i].border;
      });
      div.classList.add('active');
      div.style.borderColor = p.accent;
    };
    c.appendChild(div);
  });
}
function activeCI() {
  const s = document.querySelector('#swatches .swatch.active');
  return s ? parseInt(s.dataset.i) : 0;
}

// ── NOTE FORM ──────────────────────────────────────────────────────────────
function openNewNoteForm() {
  editId = null;
  document.getElementById('formTitle').textContent = '✒ New Note';
  document.getElementById('fTitle').value   = '';
  document.getElementById('fBody').value    = '';
  document.getElementById('fFont').value    = 'Georgia,serif';
  document.getElementById('fSize').value    = 14;
  document.getElementById('fWeight').value  = 'normal';
  document.getElementById('fMusic').value   = '';
  buildSwatches(0);
  openOverlay('formOverlay');
  setTimeout(() => document.getElementById('fTitle').focus(), 150);
}

function openEditForm(note) {
  editId = note.id;
  document.getElementById('formTitle').textContent = '✒ Edit Note';
  document.getElementById('fTitle').value   = note.title;
  document.getElementById('fBody').value    = note.body;
  document.getElementById('fFont').value    = note.font || 'Georgia,serif';
  document.getElementById('fSize').value    = note.fontSize || 14;
  document.getElementById('fWeight').value  = note.fontWeight || 'normal';
  document.getElementById('fMusic').value   = note.musicUrl || '';
  buildSwatches(note.colorIdx || 0);
  openOverlay('formOverlay');
}

document.getElementById('fSave').onclick = async () => {
  const title      = document.getElementById('fTitle').value.trim();
  const body       = document.getElementById('fBody').value.trim();
  const font       = document.getElementById('fFont').value;
  const fontSize   = parseInt(document.getElementById('fSize').value) || 14;
  const fontWeight = document.getElementById('fWeight').value;
  const colorIdx   = activeCI();
  const musicUrl   = isAdmin ? document.getElementById('fMusic').value.trim() : '';

  if (!title && !body) { toast('Please write something! ✍'); return; }

  const payload = { title: title || 'Untitled', body, font, fontSize, fontWeight, colorIdx, musicUrl };

  try {
    if (editId) {
      await api('PUT', `/notes/${editId}`, payload);
      toast('Note updated ✅');
    } else {
      await api('POST', '/notes', payload);
      toast('Note saved 💾');
    }
    closeOverlay('formOverlay');
    await loadAndRender();
  } catch (err) {
    toast('Error: ' + err.message);
  }
};

// ── LOAD NOTES ─────────────────────────────────────────────────────────────
async function loadNotes() {
  const from = document.getElementById('filterFrom').value;
  const to   = document.getElementById('filterTo').value;
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to)   params.set('to', to);
  const qs = params.toString() ? '?' + params : '';
  notes = await api('GET', '/notes' + qs);
}

async function loadAndRender() {
  try {
    await loadNotes();
    renderGrid();
  } catch (err) {
    console.error(err);
    document.getElementById('notesGrid').innerHTML =
      `<div class="empty-state"><div class="icon">⚠️</div>Could not load notes.<br>Is the server running?</div>`;
  }
}

// ── DATE FILTER ────────────────────────────────────────────────────────────
document.getElementById('filterFrom').onchange = loadAndRender;
document.getElementById('filterTo').onchange   = loadAndRender;
document.getElementById('btnClearFilter').onclick = () => {
  document.getElementById('filterFrom').value = '';
  document.getElementById('filterTo').value   = '';
  loadAndRender();
};

// ── RENDER GRID ────────────────────────────────────────────────────────────
function renderGrid() {
  const grid = document.getElementById('notesGrid');
  document.getElementById('swipeHint').textContent =
    notes.length > 1 ? '← swipe or tap arrows to navigate notes →' : '';

  if (!notes.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="icon">✒</div>
        ${isAdmin ? 'Tap <b>+ New Note</b> to write your first entry.' : 'No notes here yet — check back soon.'}
      </div>`;
    return;
  }

  grid.innerHTML = notes.map(n => cardHtml(n)).join('');

  grid.querySelectorAll('.note-card').forEach(card => {
    card.onclick = e => {
      if (e.target.closest('.card-admin-row')) return;
      openDetail(card.dataset.id);
    };
  });
  grid.querySelectorAll('.btn-card-edit').forEach(b => {
    b.onclick = e => { e.stopPropagation(); openEditForm(notes.find(n => n.id === b.dataset.id)); };
  });
  grid.querySelectorAll('.btn-card-del').forEach(b => {
    b.onclick = async e => {
      e.stopPropagation();
      if (!confirm('Delete this note permanently?')) return;
      try { await api('DELETE', `/notes/${b.dataset.id}`); toast('Deleted 🗑'); await loadAndRender(); }
      catch (err) { toast('Error: ' + err.message); }
    };
  });
}

function reactionChips(reactions) {
  const entries = Object.entries(reactions || {}).filter(([, v]) => v > 0);
  if (!entries.length) return '<span style="font-size:11px;color:var(--mut)">No reactions yet</span>';
  return entries.map(([e, c]) => `<span class="reaction-pill">${e} ${c}</span>`).join('');
}

function cardHtml(n) {
  const p = PALETTE[n.colorIdx || 0];
  return `
    <article class="note-card" data-id="${n.id}"
      style="background:${p.bg};--card-accent:${p.accent};border-color:${p.border}">
      <div class="card-admin-row">
        <button class="btn btn-primary btn-sm btn-card-edit" data-id="${n.id}">✏️ Edit</button>
        <button class="btn btn-danger btn-sm btn-card-del"  data-id="${n.id}">🗑 Del</button>
      </div>
      <div class="card-header">
        <div class="card-meta">
          📅 ${fmtDate(n.createdAt)}<br>🕐 ${fmtTime(n.createdAt)}
        </div>
        <div class="card-views">👁 ${n.views}</div>
      </div>
      <div class="card-title" style="font-family:${esc(n.font)};color:${p.accent}">${esc(n.title)}</div>
      <div class="card-body"  style="font-family:${esc(n.font)};font-size:${Math.min(n.fontSize||14,13)}px">${esc(n.body)}</div>
      <div class="card-footer">
        <div class="card-reactions">${reactionChips(n.reactions)}</div>
        ${n.musicUrl ? '<span class="music-chip">♪ Music</span>' : ''}
      </div>
    </article>`;
}

// ── DETAIL VIEW ────────────────────────────────────────────────────────────
async function openDetail(id) {
  detailId = id;
  document.getElementById('detailContent').innerHTML = '<div class="spinner"></div>';
  openOverlay('detailOverlay');
  try {
    const note = await api('GET', `/notes/${id}`);
    // update local cache
    const idx = notes.findIndex(n => n.id === id);
    if (idx !== -1) notes[idx] = note;
    renderGrid();
    renderDetail(note);
    playMusic(note);
  } catch (err) {
    document.getElementById('detailContent').innerHTML = `<p style="color:var(--red)">Error: ${esc(err.message)}</p>`;
  }
}

function renderDetail(note) {
  const p = PALETTE[note.colorIdx || 0];
  const fs = note.fontWeight === 'bold italic' ? 'font-weight:bold;font-style:italic'
           : note.fontWeight === 'bold'        ? 'font-weight:bold'
           : note.fontWeight === 'italic'      ? 'font-style:italic' : '';

  const allIds = notes.map(n => n.id);
  const idx    = allIds.indexOf(note.id);
  const prevId = idx > 0               ? allIds[idx - 1] : null;
  const nextId = idx < allIds.length-1 ? allIds[idx + 1] : null;

  const reactHtml = Object.entries(note.reactions || {}).filter(([, v]) => v > 0)
    .map(([e, c]) => `<span class="rcnt">${e} <b>${c}</b></span>`).join('') ||
    '<span style="color:var(--mut);font-size:12px">Be the first to react!</span>';

  const repliesHtml = (note.replies || []).map(r => `
    <div class="reply-item" data-rid="${r.id}">
      <div class="reply-author">
        👤 ${esc(r.name || 'Anonymous')}
        <small>${fmtDate(r.createdAt)} ${fmtTime(r.createdAt)}</small>
      </div>
      <div class="reply-text">${esc(r.text)}</div>
      <button class="reply-del-btn btn-rdel" data-nid="${note.id}" data-rid="${r.id}" title="Delete reply">🗑</button>
    </div>`).join('') || '<p style="color:var(--mut);font-size:12px;font-style:italic">No replies yet.</p>';

  document.getElementById('detailContent').innerHTML = `
    <div class="detail-top">
      <h2 class="detail-title" style="font-family:${esc(note.font)};color:${p.accent}">${esc(note.title)}</h2>
      <div class="detail-actions">
        ${isAdmin ? `<button class="btn btn-primary btn-sm btn-dedit" data-id="${note.id}">✏️ Edit</button>` : ''}
        ${isAdmin ? `<button class="btn btn-danger  btn-sm btn-ddel"  data-id="${note.id}">🗑 Delete</button>` : ''}
      </div>
    </div>
    <div class="detail-meta">
      <span>📅 ${fmtDate(note.createdAt)} · ${fmtTime(note.createdAt)}</span>
      <span>👁 ${note.views} views</span>
      ${note.editedAt ? `<span>✏️ Edited ${fmtDate(note.editedAt)}</span>` : ''}
      <span>💬 ${(note.replies||[]).length} ${(note.replies||[]).length===1?'reply':'replies'}</span>
    </div>
    ${note.musicUrl ? '<div style="font-size:12px;color:var(--acc2);margin-bottom:10px;font-style:italic">♪ Background music is playing for this note</div>' : ''}
    <div class="detail-body" style="font-family:${esc(note.font)};font-size:${note.fontSize||14}px;${fs};background:${p.bg};border-left-color:${p.accent}">${esc(note.body)}</div>

    <hr class="sep">

    <div class="section-label">React to this note</div>
    <div class="emoji-grid">${EMOJIS.map(e => `<button class="emoji-btn btn-react" data-em="${e}" data-id="${note.id}">${e}</button>`).join('')}</div>
    <div class="reactions-display" id="rdisplay">${reactHtml}</div>

    <hr class="sep">

    <div class="section-label">💬 Replies (${(note.replies||[]).length})</div>
    <div class="reply-list" id="replyList">${repliesHtml}</div>
    <div class="reply-form">
      <input  type="text"  id="rName"  placeholder="Your name (optional)">
      <textarea            id="rText"  placeholder="Share your thoughts or feeling…"></textarea>
      <button class="btn btn-primary btn-sm btn-rsubmit" data-id="${note.id}" style="align-self:flex-end">Post Reply</button>
    </div>

    <div class="swipe-nav">
      ${prevId ? `<button class="btn btn-ghost btn-sm btn-prev" data-id="${prevId}">← Previous</button>` : '<span></span>'}
      ${nextId ? `<button class="btn btn-ghost btn-sm btn-next" data-id="${nextId}">Next →</button>`     : '<span></span>'}
    </div>
  `;

  // BINDINGS ─────────────────────────────────────────────────────────────────

  document.querySelector('.btn-dedit')?.addEventListener('click', () => {
    closeOverlay('detailOverlay');
    openEditForm(note);
  });

  document.querySelector('.btn-ddel')?.addEventListener('click', async () => {
    if (!confirm('Delete this note permanently?')) return;
    try {
      await api('DELETE', `/notes/${note.id}`);
      closeOverlay('detailOverlay');
      toast('Deleted 🗑');
      await loadAndRender();
    } catch (err) { toast('Error: ' + err.message); }
  });

  document.querySelectorAll('.btn-react').forEach(btn => {
    btn.onclick = async () => {
      try {
        const reactions = await api('POST', `/notes/${btn.dataset.id}/react`, { emoji: btn.dataset.em });
        const reactHtml = Object.entries(reactions).filter(([,v])=>v>0)
          .map(([e,c])=>`<span class="rcnt">${e} <b>${c}</b></span>`).join('');
        document.getElementById('rdisplay').innerHTML = reactHtml || '';
        // update local note
        const n = notes.find(x => x.id === btn.dataset.id);
        if (n) { n.reactions = reactions; renderGrid(); }
        toast('Reacted ' + btn.dataset.em);
      } catch (err) { toast('Error: ' + err.message); }
    };
  });

  document.querySelectorAll('.btn-rdel').forEach(btn => {
    btn.onclick = async () => {
      try {
        await api('DELETE', `/notes/${btn.dataset.nid}/replies/${btn.dataset.rid}`);
        const n = await api('GET', `/notes/${btn.dataset.nid}`);
        const idx = notes.findIndex(x => x.id === n.id); if (idx !== -1) notes[idx] = n;
        renderDetail(n); renderGrid(); toast('Reply deleted');
      } catch (err) { toast('Error: ' + err.message); }
    };
  });

  document.querySelector('.btn-rsubmit')?.addEventListener('click', async () => {
    const text = document.getElementById('rText').value.trim();
    if (!text) { toast('Write something first! ✍'); return; }
    const name = document.getElementById('rName').value.trim() || 'Anonymous';
    try {
      await api('POST', `/notes/${note.id}/replies`, { name, text });
      const updated = await api('GET', `/notes/${note.id}`);
      const idx = notes.findIndex(x => x.id === updated.id); if (idx !== -1) notes[idx] = updated;
      renderDetail(updated); renderGrid(); toast('Reply posted 💬');
    } catch (err) { toast('Error: ' + err.message); }
  });

  document.querySelector('.btn-prev')?.addEventListener('click', () => openDetail(document.querySelector('.btn-prev').dataset.id));
  document.querySelector('.btn-next')?.addEventListener('click', () => openDetail(document.querySelector('.btn-next').dataset.id));

  // Touch swipe
  const modal = document.getElementById('detailModal');
  let sx = 0, sy = 0;
  modal.ontouchstart = e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; };
  modal.ontouchend = e => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 48) {
      if (dx < 0 && nextId) openDetail(nextId);
      else if (dx > 0 && prevId) openDetail(prevId);
    }
  };
}

// ── MUSIC ──────────────────────────────────────────────────────────────────
function playMusic(note) {
  if (!note.musicUrl) return;
  if (audio.src !== location.origin + note.musicUrl && audio.src !== note.musicUrl) {
    audio.src = note.musicUrl;
    audio.volume = parseFloat(document.getElementById('musicVol').value);
    audio.play().catch(() => {});
  } else if (audio.paused) {
    audio.play().catch(() => {});
  }
  document.getElementById('musicTitle').textContent = note.title + ' — music';
  document.getElementById('musicBar').classList.add('active');
  document.getElementById('btnMPP').textContent = '⏸';
}

document.getElementById('btnMPP').onclick = () => {
  if (audio.paused) { audio.play(); document.getElementById('btnMPP').textContent = '⏸'; }
  else              { audio.pause(); document.getElementById('btnMPP').textContent = '▶'; }
};
document.getElementById('btnMute').onclick = () => {
  audio.muted = !audio.muted;
  document.getElementById('btnMute').textContent = audio.muted ? '🔇' : '🔊';
};
document.getElementById('musicVol').oninput = e => {
  audio.volume = parseFloat(e.target.value);
  audio.muted  = false;
  document.getElementById('btnMute').textContent = '🔊';
};

// ── INIT ───────────────────────────────────────────────────────────────────
(async () => {
  await verifyStoredToken();
  renderHeader();
  buildSwatches(0);
  await loadAndRender();
})();
