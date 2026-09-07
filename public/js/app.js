/* ── app.js  v6  — grid home + tinder detail ───────────────────────────── */
'use strict';

// ── CONFIG ─────────────────────────────────────────────────────────────────
const API    = '/api';
const EMOJIS = ['❤️','😂','😢','😮','😍','🙏','👏','🔥','🎉','😆'];
const PALETTE = [
  { bg:'#2a1f14', accent:'#d4a96a' },
  { bg:'#12202e', accent:'#5b9bd5' },
  { bg:'#112214', accent:'#4caf7a' },
  { bg:'#28121e', accent:'#d55b7f' },
  { bg:'#28220c', accent:'#c9a020' },
  { bg:'#1c1228', accent:'#8b5bd5' },
  { bg:'#0f2222', accent:'#1aadad' },
  { bg:'#26150e', accent:'#cc5a35' },
];

// ── STATE ──────────────────────────────────────────────────────────────────
let token        = localStorage.getItem('diary_token') || null;
let currentUser  = null;
let viewingUser  = null;
let isOwner      = false;
let notes        = [];
let editId       = null;
let pendingFiles = [];
let detailIdx    = 0;   // current note index inside the tinder detail overlay
let activeTag    = null;
let pendingTags  = [];

// ── TIME FILTER STATE ──────────────────────────────────────────────────────
let tfMode      = 'week';   // 'week' | 'month' | 'year' | 'all'
let tfSubKey    = null;     // e.g. '2025-06' for month mode, or '2025-W23' for year drill-down
let allPage     = 1;        // current page in 'all' mode
const PER_PAGE  = 50;

const audio = document.getElementById('bgAudio');

// ── PAGE VIEW TRACKING ──────────────────────────────────────────────────────
;(function trackPageView() {
  const start = Date.now();
  function sendBeacon(dur) {
    const userId = (() => { try { const t = localStorage.getItem('diary_token'); if (!t) return null; return JSON.parse(atob(t.split('.')[1])).userId; } catch { return null; } })();
    const payload = JSON.stringify({ userId, path: location.pathname, duration_s: Math.round(dur / 1000) });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/admin/track-view', new Blob([payload], { type: 'application/json' }));
    else fetch('/api/admin/track-view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
  }
  window.addEventListener('pagehide', () => sendBeacon(Date.now() - start));
  // also send at 30s intervals for long sessions
  setInterval(() => sendBeacon(Date.now() - start), 30000);
})();

// ── UTILS ──────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB',
    { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-GB',
    { hour:'2-digit', minute:'2-digit' });
}
function fmtDur(s) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2,'0');
  return `${m}:${sec}`;
}
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function isVid(mime) { return (mime||'').startsWith('video/'); }

function toast(msg, dur = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), dur);
}

// ── API ────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body)  opts.body = JSON.stringify(body);
  const res  = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
async function apiUpload(noteId, files) {
  const fd = new FormData();
  files.forEach(f => fd.append('files', f));
  const opts = { method:'POST', headers:{} };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  opts.body = fd;
  const res  = await fetch(`${API}/upload/${noteId}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── SCREEN SWITCHING ───────────────────────────────────────────────────────
function showAuth() {
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('appScreen').classList.add('hidden');
}
function showApp() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
}

// ── AUTH ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.auth-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('panel' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1))
      .classList.remove('hidden');
  };
});

document.getElementById('loginBtn').onclick = async () => {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPwd').value;
  const errEl    = document.getElementById('loginErr');
  errEl.textContent = '';
  try {
    const data = await api('POST', '/auth/login', { username, password });
    token = data.token;
    currentUser = { userId: data.userId, username: data.username, displayName: data.displayName };
    localStorage.setItem('diary_token', token);
    await enterOwnDiary();
  } catch (e) { errEl.textContent = e.message; }
};
document.getElementById('loginPwd').onkeydown = e => {
  if (e.key === 'Enter') document.getElementById('loginBtn').click();
};

document.getElementById('signupBtn').onclick = async () => {
  const username    = document.getElementById('signupUser').value.trim();
  const displayName = document.getElementById('signupName').value.trim();
  const password    = document.getElementById('signupPwd').value;
  const errEl       = document.getElementById('signupErr');
  errEl.textContent = '';
  try {
    const data = await api('POST', '/auth/signup', { username, password, displayName });
    token = data.token;
    currentUser = { userId: data.userId, username: data.username, displayName: data.displayName };
    localStorage.setItem('diary_token', token);
    await enterOwnDiary();
  } catch (e) { errEl.textContent = e.message; }
};
document.getElementById('signupPwd').onkeydown = e => {
  if (e.key === 'Enter') document.getElementById('signupBtn').click();
};

// ── OVERLAYS ───────────────────────────────────────────────────────────────
function openOv(id)  { document.getElementById(id).classList.add('open'); }
function closeOv(id) { document.getElementById(id).classList.remove('open'); }

['detailOverlay','formOverlay','profileOverlay'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target === document.getElementById(id)) closeOv(id);
  });
});
document.getElementById('detailClose').onclick  = () => closeOv('detailOverlay');
document.getElementById('formClose').onclick    = () => closeOv('formOverlay');
document.getElementById('profileClose').onclick = () => closeOv('profileOverlay');

// ── SIDEBAR DRAWER ─────────────────────────────────────────────────────────
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarBackdrop').classList.add('active');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('active');
}
document.getElementById('hamburgerBtn').onclick    = openSidebar;
document.getElementById('sidebarCloseBtn').onclick = closeSidebar;
document.getElementById('sidebarBackdrop').onclick = closeSidebar;

// ── HEADER ─────────────────────────────────────────────────────────────────
function renderHeader() {
  const el  = document.getElementById('headerActions');
  const fab = document.getElementById('quickNewBtn');
  if (isOwner) {
    el.innerHTML = `
      <span class="owner-badge">✦ ${esc(currentUser.displayName)}</span>
      <button class="btn btn-ghost btn-sm" data-action="share">🔗 Share</button>
      <button class="btn btn-ghost btn-sm" data-action="profile">✏️ Profile</button>
      <button class="btn btn-ghost btn-sm" data-action="logout">Sign out</button>`;
    if (fab) { fab.style.display = 'flex'; fab.onclick = () => { closeSidebar(); openNewForm(); }; }
  } else if (currentUser && viewingUser) {
    el.innerHTML = `
      <span class="owner-badge">👤 ${esc(currentUser.displayName)}</span>
      <button class="btn btn-ghost btn-sm" data-action="go-home">My Diary</button>`;
    if (fab) fab.style.display = 'none';
  } else if (!currentUser && viewingUser) {
    el.innerHTML = `
      <button class="btn btn-ghost btn-sm" data-action="go-login">Sign In / Sign Up</button>`;
    if (fab) fab.style.display = 'none';
  } else {
    el.innerHTML = '';
    if (fab) fab.style.display = 'none';
  }
}

document.getElementById('headerActions').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  closeSidebar();
  const action = btn.dataset.action;
  if (action === 'share') {
    const url = `${location.origin}/u/${currentUser.username}`;
    navigator.clipboard?.writeText(url).then(() => toast('Link copied! 🔗')).catch(() => toast(url));
  } else if (action === 'profile') {
    document.getElementById('profName').value = currentUser.displayName || '';
    document.getElementById('profBio').value  = currentUser.bio || '';
    openOv('profileOverlay');
  } else if (action === 'logout') {
    token = null; currentUser = null; isOwner = false; viewingUser = null;
    localStorage.removeItem('diary_token');
    document.body.classList.remove('is-owner');
    history.replaceState({}, '', '/');
    showAuth();
  } else if (action === 'go-home') {
    enterOwnDiary();
  } else if (action === 'go-login') {
    showAuth();
  }
});

// scroll shadow on topbar
window.addEventListener('scroll', () => {
  document.getElementById('topbar')?.classList.toggle('scrolled', window.scrollY > 8);
}, { passive: true });

// ── PROFILE MODAL ──────────────────────────────────────────────────────────
document.getElementById('profSave').onclick = async () => {
  const displayName = document.getElementById('profName').value.trim();
  const bio         = document.getElementById('profBio').value.trim();
  try {
    await api('PUT', '/auth/profile', { displayName, bio });
    currentUser.displayName = displayName;
    currentUser.bio = bio;
    document.getElementById('sidebarTitle').textContent = displayName || currentUser.username;
    closeOv('profileOverlay');
    toast('Profile updated ✅');
  } catch (e) { toast('Error: ' + e.message); }
};

// ── ENTERING DIARIES ────────────────────────────────────────────────────────
async function enterOwnDiary() {
  isOwner = true;
  viewingUser = { id: currentUser.userId, username: currentUser.username, displayName: currentUser.displayName };
  document.body.classList.add('is-owner');
  document.getElementById('sidebarTitle').textContent = currentUser.displayName || currentUser.username;
  document.getElementById('sidebarSub').textContent   = '@' + currentUser.username;
  document.getElementById('pageTitle').textContent     = 'My Journal';
  document.getElementById('pageTitleCaption').textContent = 'write · reflect · remember';
  history.replaceState({}, '', '/u/' + currentUser.username);
  renderHeader();
  buildSwatches(0);
  setupUploadZone();
  showApp();
  await loadAndRender();
}

async function enterPublicDiary(username) {
  try {
    const data = await api('GET', `/notes/user/${username}`);
    viewingUser = data.user;
    isOwner = currentUser?.userId === viewingUser.id;
    if (isOwner) document.body.classList.add('is-owner');
    else         document.body.classList.remove('is-owner');
    notes = data.notes;
    document.getElementById('sidebarTitle').textContent = viewingUser.displayName || viewingUser.username;
    document.getElementById('sidebarSub').textContent   = '@' + viewingUser.username;
    document.getElementById('pageTitle').textContent     = isOwner
      ? 'My Journal'
      : (viewingUser.displayName || viewingUser.username) + "'s Diary";
    document.getElementById('pageTitleCaption').textContent = isOwner ? 'write · reflect · remember' : '';
    renderHeader();
    buildSwatches(0);
    setupUploadZone();
    showApp();
    renderGrid();
  } catch {
    if (!currentUser) { showAuth(); } else { toast('Diary not found'); await enterOwnDiary(); }
  }
}

// ── SWATCHES ───────────────────────────────────────────────────────────────
function buildSwatches(selIdx = 0) {
  const c = document.getElementById('swatches');
  c.innerHTML = '';
  PALETTE.forEach((p, i) => {
    const s = document.createElement('button');
    s.className = 'swatch' + (i === selIdx ? ' active' : '');
    s.style.background = p.accent;
    s.dataset.ci = i;
    s.onclick = () => {
      c.querySelectorAll('.swatch').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
    };
    c.appendChild(s);
  });
}
function activeCI() {
  const a = document.querySelector('.swatch.active');
  return a ? parseInt(a.dataset.ci) : 0;
}

// ── UPLOAD ZONE ────────────────────────────────────────────────────────────
function setupUploadZone() {
  pendingFiles = [];
  const inp  = document.getElementById('fFiles');
  const zone = document.getElementById('uploadZone');
  const prev = document.getElementById('uploadPreviews');
  prev.innerHTML = '';
  inp.onchange = () => addFiles(Array.from(inp.files));
  zone.ondragover  = e => { e.preventDefault(); zone.classList.add('drag'); };
  zone.ondragleave = () => zone.classList.remove('drag');
  zone.ondrop      = e => {
    e.preventDefault(); zone.classList.remove('drag');
    addFiles(Array.from(e.dataTransfer.files));
  };
}
function addFiles(files) {
  const prev = document.getElementById('uploadPreviews');
  files.forEach(f => {
    if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) return;
    pendingFiles.push(f);
    const wrap = document.createElement('div'); wrap.className = 'up-prev';
    const el   = isVid(f.type) ? document.createElement('video') : document.createElement('img');
    el.src = URL.createObjectURL(f);
    if (isVid(f.type)) { el.muted = true; el.playsInline = true; }
    const del  = document.createElement('button'); del.className = 'up-prev-del'; del.textContent = '×';
    del.onclick = () => { pendingFiles.splice(pendingFiles.indexOf(f), 1); wrap.remove(); };
    wrap.appendChild(el); wrap.appendChild(del);
    prev.appendChild(wrap);
  });
}

function renderExistMedia(note) {
  const row = document.getElementById('existMediaRow');
  row.innerHTML = '';
  (note.media||[]).forEach(m => {
    const wrap = document.createElement('div'); wrap.className = 'exist-thumb';
    const el   = isVid(m.mimetype) ? document.createElement('video') : document.createElement('img');
    el.src = m.url;
    if (isVid(m.mimetype)) { el.muted = true; el.playsInline = true; }
    const del  = document.createElement('button'); del.className = 'exist-thumb-del'; del.textContent = '×';
    del.onclick = async () => {
      try {
        await api('DELETE', `/upload/${note.id}/${m.id}`);
        wrap.remove(); toast('Removed');
      } catch (e) { toast('Error: ' + e.message); }
    };
    wrap.appendChild(el); wrap.appendChild(del); row.appendChild(wrap);
  });
}

// ── TAGS FORM HELPERS ──────────────────────────────────────────────────────
function renderTagsChips() {
  const wrap = document.getElementById('tagsChips');
  wrap.innerHTML = pendingTags.map((t, i) =>
    `<span class="tag-chip-edit">#${esc(t)}<button class="tag-chip-del" data-i="${i}">✕</button></span>`
  ).join('');
  wrap.querySelectorAll('.tag-chip-del').forEach(btn => {
    btn.onclick = () => { pendingTags.splice(parseInt(btn.dataset.i), 1); renderTagsChips(); };
  });
}

function addPendingTag(raw) {
  const t = raw.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '');
  if (t && !pendingTags.includes(t)) pendingTags.push(t);
  document.getElementById('fTags').value = '';
  renderTagsChips();
}

document.getElementById('fTags').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addPendingTag(e.target.value); }
  if (e.key === 'Backspace' && !e.target.value && pendingTags.length) {
    pendingTags.pop(); renderTagsChips();
  }
});
document.getElementById('fTags').addEventListener('blur', e => {
  if (e.target.value.trim()) addPendingTag(e.target.value);
});

// ── FORMS ──────────────────────────────────────────────────────────────────
function openNewForm() {
  editId = null; pendingTags = [];
  document.getElementById('formTitle').textContent = '✒ New Entry';
  document.getElementById('fTitle').value  = '';
  document.getElementById('fBody').value   = '';
  document.getElementById('fFont').value   = 'Georgia,serif';
  document.getElementById('fSize').value   = 14;
  document.getElementById('fWeight').value = 'normal';
  document.getElementById('fMusic').value  = '';
  document.getElementById('fTags').value   = '';
  document.getElementById('existMediaRow').innerHTML = '';
  renderTagsChips();
  buildSwatches(0); setupUploadZone();
  openOv('formOverlay');
  setTimeout(() => document.getElementById('fTitle').focus(), 120);
}
function openEditForm(note) {
  editId = note.id; pendingTags = Array.isArray(note.tags) ? [...note.tags] : [];
  document.getElementById('formTitle').textContent = '✒ Edit Entry';
  document.getElementById('fTitle').value  = note.title;
  document.getElementById('fBody').value   = note.body;
  document.getElementById('fFont').value   = note.font || 'Georgia,serif';
  document.getElementById('fSize').value   = note.fontSize || 14;
  document.getElementById('fWeight').value = note.fontWeight || 'normal';
  document.getElementById('fMusic').value  = note.musicUrl || '';
  document.getElementById('fTags').value   = '';
  renderTagsChips();
  buildSwatches(note.colorIdx || 0);
  renderExistMedia(note); setupUploadZone();
  openOv('formOverlay');
}

document.getElementById('fSave').onclick = async () => {
  if (document.getElementById('fTags').value.trim()) addPendingTag(document.getElementById('fTags').value);
  const title      = document.getElementById('fTitle').value.trim();
  const body       = document.getElementById('fBody').value.trim();
  const font       = document.getElementById('fFont').value;
  const fontSize   = parseInt(document.getElementById('fSize').value) || 14;
  const fontWeight = document.getElementById('fWeight').value;
  const colorIdx   = activeCI();
  const musicUrl   = document.getElementById('fMusic').value.trim();
  const tags       = [...pendingTags];
  if (!title && !body) { toast('Write something first ✍'); return; }
  const payload = { title: title||'Untitled', body, font, fontSize, fontWeight, colorIdx, musicUrl, tags };
  try {
    let saved;
    if (editId) {
      saved = await api('PUT', `/notes/${editId}`, payload); toast('Entry updated ✅');
    } else {
      saved = await api('POST', '/notes', payload); toast('Entry saved 💾');
    }
    if (pendingFiles.length) {
      toast('Uploading…', 8000);
      await apiUpload(saved.id, pendingFiles);
      toast('Uploaded ✅');
    }
    closeOv('formOverlay'); await loadAndRender();
  } catch (err) { toast('Error: ' + err.message); }
};

// ── LOAD & RENDER ──────────────────────────────────────────────────────────
async function loadNotes() {
  if (!viewingUser) return;
  const from = document.getElementById('filterFrom').value;
  const to   = document.getElementById('filterTo').value;
  const p    = new URLSearchParams();
  if (from) p.set('from', from);
  if (to)   p.set('to', to);
  if (isOwner) {
    notes = await api('GET', '/notes' + (p.toString() ? '?'+p : ''));
  } else {
    const data = await api('GET', `/notes/user/${viewingUser.username}` + (p.toString() ? '?'+p : ''));
    notes = data.notes;
  }
}
async function loadAndRender() {
  try {
    await loadNotes();
    renderGrid();
  } catch {
    document.getElementById('notesGrid').innerHTML =
      `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--ink4);font-family:var(--sans)">
        <div style="font-size:32px;margin-bottom:12px;color:var(--accent);opacity:.5">⚠</div>
        Could not load entries.
       </div>`;
  }
}

function updateClearBtn() {
  const btn = document.getElementById('btnClearFilter');
  const has = document.getElementById('filterFrom').value || document.getElementById('filterTo').value;
  if (btn) btn.style.display = has ? 'inline-flex' : 'none';
}
document.getElementById('filterFrom').onchange = () => { updateClearBtn(); loadAndRender(); };
document.getElementById('filterTo').onchange   = () => { updateClearBtn(); loadAndRender(); };
document.getElementById('btnClearFilter').onclick = () => {
  document.getElementById('filterFrom').value = '';
  document.getElementById('filterTo').value   = '';
  updateClearBtn(); loadAndRender();
};

document.getElementById('sortSelect').onchange = renderGrid;

// ── TIME FILTER HELPERS ────────────────────────────────────────────────────
function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '00')}`;
}
function weekLabel(key) {
  const [y, w] = key.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4); monday.setUTCDate(jan4.getUTCDate() - dow + 1 + (w - 1) * 7);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = d => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  return `${fmt(monday)} — ${fmt(sunday)}`;
}
function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'00')}`; }
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function getTimeFilteredNotes() {
  let list = activeTag ? notes.filter(n => (n.tags||[]).includes(activeTag)) : notes;
  const sortKey = document.getElementById('sortSelect')?.value || 'newest';
  const totalReact = n => Object.values(n.reactions||{}).reduce((a,b)=>a+b,0);
  switch (sortKey) {
    case 'oldest':         list = [...list].sort((a,b) => a.createdAt.localeCompare(b.createdAt)); break;
    case 'most-reactions': list = [...list].sort((a,b) => totalReact(b) - totalReact(a)); break;
    case 'most-comments':  list = [...list].sort((a,b) => (b.replies?.length||0) - (a.replies?.length||0)); break;
    case 'most-views':     list = [...list].sort((a,b) => b.views - a.views); break;
    default:               list = [...list].sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }
  const now = new Date();
  if (tfMode === 'week') return list.filter(n => isoWeekKey(new Date(n.createdAt)) === isoWeekKey(now));
  if (tfMode === 'month') {
    const key = tfSubKey || monthKey(now);
    return list.filter(n => monthKey(new Date(n.createdAt)) === key);
  }
  if (tfMode === 'year') {
    const selYear = tfSubKey ? tfSubKey.split('-')[0] : String(now.getFullYear());
    let r = list.filter(n => String(new Date(n.createdAt).getFullYear()) === selYear);
    if (tfSubKey && tfSubKey.length === 7 && !tfSubKey.includes('-W')) r = r.filter(n => monthKey(new Date(n.createdAt)) === tfSubKey);
    if (tfSubKey && tfSubKey.includes('-W')) r = r.filter(n => isoWeekKey(new Date(n.createdAt)) === tfSubKey);
    return r;
  }
  return list;
}

function renderTimeFilterBar() {
  document.querySelectorAll('.tf-pill').forEach(b => b.classList.toggle('active', b.dataset.tf === tfMode));
  const subRow = document.getElementById('tfSubRow');
  subRow.innerHTML = ''; subRow.style.display = 'none'; subRow.style.flexDirection = '';
  const allSorted = [...notes].sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  if (!allSorted.length) return;

  if (tfMode === 'month') {
    const months = [...new Set(allSorted.map(n => monthKey(new Date(n.createdAt))))].sort().reverse().slice(0,24);
    if (!months.length) return;
    const cur = tfSubKey || monthKey(new Date());
    subRow.style.display = 'flex';
    subRow.innerHTML = months.map(k =>
      `<button class="tf-sub-btn${k===cur?' active':''}" data-mk="${k}">${monthLabel(k)}</button>`
    ).join('');
    subRow.querySelectorAll('.tf-sub-btn').forEach(b => {
      b.onclick = () => { tfSubKey = b.dataset.mk; renderTimeFilterBar(); renderGrid(); };
    });
  }

  if (tfMode === 'year') {
    const years = [...new Set(allSorted.map(n => String(new Date(n.createdAt).getFullYear())))].sort().reverse();
    const selYear = tfSubKey ? tfSubKey.split('-')[0] : String(new Date().getFullYear());
    subRow.style.display = 'flex'; subRow.style.flexDirection = 'column'; subRow.style.gap = '8px';

    const yearRow = document.createElement('div');
    yearRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    yearRow.innerHTML = years.map(y =>
      `<button class="tf-sub-btn${y===selYear?' active':''}" data-yk="${y}">${y}</button>`
    ).join('');
    subRow.appendChild(yearRow);

    const monthsInYear = [...new Set(
      allSorted.filter(n => String(new Date(n.createdAt).getFullYear()) === selYear)
               .map(n => monthKey(new Date(n.createdAt)))
    )].sort().reverse();

    if (monthsInYear.length) {
      const selMonth = tfSubKey && tfSubKey.length === 7 && !tfSubKey.includes('-W') ? tfSubKey : null;
      const monthRow = document.createElement('div');
      monthRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
      monthRow.innerHTML = monthsInYear.map(mk => {
        const lbl = new Date(mk + '-01').toLocaleDateString('en-GB', { month: 'short' });
        return `<button class="tf-sub-btn${mk===selMonth?' active':''}" data-mk="${mk}">${lbl}</button>`;
      }).join('');
      subRow.appendChild(monthRow);
      if (selMonth) {
        const weeksInMonth = [...new Set(
          allSorted.filter(n => monthKey(new Date(n.createdAt)) === selMonth)
                   .map(n => isoWeekKey(new Date(n.createdAt)))
        )].sort().reverse();
        if (weeksInMonth.length > 1) {
          const selWeek = tfSubKey && tfSubKey.includes('-W') ? tfSubKey : null;
          const wkRow = document.createElement('div');
          wkRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
          wkRow.innerHTML = weeksInMonth.map(wk =>
            `<button class="tf-sub-btn${wk===selWeek?' active':''}" data-wk="${wk}">${weekLabel(wk)}</button>`
          ).join('');
          subRow.appendChild(wkRow);
          wkRow.querySelectorAll('[data-wk]').forEach(b => {
            b.onclick = () => { tfSubKey = b.dataset.wk; renderTimeFilterBar(); renderGrid(); };
          });
        }
      }
      monthRow.querySelectorAll('[data-mk]').forEach(b => {
        b.onclick = () => { tfSubKey = b.dataset.mk; renderTimeFilterBar(); renderGrid(); };
      });
    }
    yearRow.querySelectorAll('[data-yk]').forEach(b => {
      b.onclick = () => { tfSubKey = b.dataset.yk; renderTimeFilterBar(); renderGrid(); };
    });
  }
}

document.getElementById('timeFilterBar').addEventListener('click', e => {
  const pill = e.target.closest('.tf-pill');
  if (!pill) return;
  tfMode = pill.dataset.tf; tfSubKey = null; allPage = 1;
  renderTimeFilterBar(); renderGrid();
});

// ── TAG FILTER BAR ─────────────────────────────────────────────────────────
function renderTagFilterRow() {
  const allTags = [...new Set(notes.flatMap(n => n.tags||[]))].sort();
  const row     = document.getElementById('tagFilterRow');
  const wrap    = document.getElementById('tagChips');
  const clearBtn = document.getElementById('btnClearTag');
  if (!allTags.length) { row.style.display = 'none'; return; }
  row.style.display = 'flex';
  wrap.innerHTML = allTags.map(t =>
    `<button class="tag-chip${activeTag===t?' tag-chip-active':''}" data-tag="${esc(t)}">#${esc(t)}</button>`
  ).join('');
  wrap.querySelectorAll('.tag-chip').forEach(btn => {
    btn.onclick = () => {
      activeTag = activeTag === btn.dataset.tag ? null : btn.dataset.tag;
      renderTagFilterRow(); renderGrid();
    };
  });
  clearBtn.style.display = activeTag ? 'inline-block' : 'none';
  clearBtn.onclick = () => { activeTag = null; renderTagFilterRow(); renderGrid(); };
}

// ══════════════════════════════════════════════════════════════════════════
//  GRID  —  home / dashboard view
// ══════════════════════════════════════════════════════════════════════════
function renderGrid() {
  const grid    = document.getElementById('notesGrid');
  const countEl = document.getElementById('noteCount');
  const pager   = document.getElementById('notesPager');
  const display = getTimeFilteredNotes();
  renderTagFilterRow();
  renderTimeFilterBar();

  if (countEl) countEl.textContent = display.length
    ? `${display.length} entr${display.length === 1 ? 'y' : 'ies'}` : '';

  pager.style.display = 'none'; pager.innerHTML = '';

  if (!display.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:70px 20px;color:var(--ink4);font-family:var(--sans)">
        <div style="font-size:36px;margin-bottom:12px;color:var(--accent);opacity:.5">✦</div>
        ${activeTag
          ? `No entries tagged <b style="color:var(--accent)">#${esc(activeTag)}</b>.`
          : isOwner
            ? 'Tap <b style="color:var(--accent)">+ New Entry</b> to write your first entry.'
            : 'No entries for this period.'}
      </div>`;
    return;
  }

  // pagination for 'all' mode (50 per page)
  let toRender = display;
  if (tfMode === 'all') {
    const totalPages = Math.ceil(display.length / PER_PAGE);
    if (allPage > totalPages) allPage = totalPages;
    toRender = display.slice((allPage - 1) * PER_PAGE, allPage * PER_PAGE);
    if (totalPages > 1) {
      pager.style.display = 'flex';
      const maxShow = 7;
      let start = Math.max(1, allPage - Math.floor(maxShow/2));
      let end   = Math.min(totalPages, start + maxShow - 1);
      if (end - start < maxShow - 1) start = Math.max(1, end - maxShow + 1);
      if (start > 1) pager.innerHTML += `<button class="pager-btn" data-pg="1">« First</button>`;
      for (let pg = start; pg <= end; pg++)
        pager.innerHTML += `<button class="pager-btn${pg===allPage?' active':''}" data-pg="${pg}">${pg}</button>`;
      if (end < totalPages) pager.innerHTML += `<button class="pager-btn" data-pg="${totalPages}">Last »</button>`;
      pager.querySelectorAll('[data-pg]').forEach(b => {
        b.onclick = () => { allPage = Number(b.dataset.pg); renderGrid(); window.scrollTo({top:0,behavior:'smooth'}); };
      });
    }
  }

  // group notes by week for month/year modes
  const shouldGroup = tfMode === 'month' || tfMode === 'year';
  let groups = [];
  if (shouldGroup) {
    const map = new Map();
    toRender.forEach(n => { const wk = isoWeekKey(new Date(n.createdAt)); if (!map.has(wk)) map.set(wk,[]); map.get(wk).push(n); });
    groups = [...map.entries()].sort(([a],[b]) => b.localeCompare(a));
  }

  // skeleton flash
  grid.innerHTML = toRender.map(() => '<div class="skeleton"></div>').join('');

  requestAnimationFrame(() => {
    grid.innerHTML = '';
    _rotIdx = 0; // reset rotation cycle each render
    const totalCards = toRender.length;
    let cardIdx = 0;
    if (shouldGroup && groups.length) {
      groups.forEach(([wk, weekNotes]) => {
        const lbl = document.createElement('div');
        lbl.className = 'week-group-label';
        lbl.textContent = weekLabel(wk);
        grid.appendChild(lbl);
        weekNotes.forEach(n => grid.appendChild(buildNoteCard(n, cardIdx++, totalCards)));
      });
    } else {
      toRender.forEach((n, i) => grid.appendChild(buildNoteCard(n, i, totalCards)));
    }

    grid.querySelectorAll('.note-card').forEach(card => {
      card.onclick = e => {
        if (e.target.closest('.slider-root') || e.target.closest('.card-react-btn') || e.target.closest('.tag-chip')) return;
        detailIdx = notes.findIndex(n => n.id === card.dataset.id);
        openDetail(card.dataset.id);
      };
    });

    grid.querySelectorAll('.card-react-btn').forEach(btn => {
      btn.onclick = async e => {
        e.stopPropagation();
        try {
          const noteObj = notes.find(x => x.id === btn.dataset.nid);
          const hadReacted = (noteObj?.userReactions||[]).includes(btn.dataset.em);
          const res = await api('POST', `/notes/${btn.dataset.nid}/react`, { emoji: btn.dataset.em });
          if (noteObj) { noteObj.reactions = res.reactions; noteObj.userReactions = res.userReactions; }
          const isAdded = res.isReacted !== undefined ? res.isReacted : !hadReacted;
          toast(isAdded ? 'Reacted ' + btn.dataset.em : 'Removed ' + btn.dataset.em);
          renderGrid();
        } catch (err) { toast('Error: ' + err.message); }
      };
    });
  });
}

// ── BUILD A SINGLE NOTE CARD ELEMENT ──────────────────────────────────────
// Rotation cycle for paper-tilt effect
const ROT_CLASSES = ['rot-0','rot-1','rot-2','rot-3','rot-4','rot-5'];
let _rotIdx = 0;

function buildNoteCard(n, index, total) {
  const card = document.createElement('article');
  // Paper rotation — cycles through 6 angles
  const rotClass = ROT_CLASSES[_rotIdx % ROT_CLASSES.length];
  _rotIdx++;
  card.className = `note-card fade-enter ${rotClass}`;
  card.dataset.id = n.id;
  if (n.media && n.media.length) card.classList.add('has-media');

  if (n.media && n.media.length) {
    const mediaWrap = document.createElement('div');
    mediaWrap.className = 'card-media';
    const sl = buildSlider(n.media, 'card', n.id);
    if (sl) mediaWrap.appendChild(sl);
    card.appendChild(mediaWrap);
  }

  // Entry counter e.g. "01 / 12"
  const numStr = total > 0
    ? `${String(index + 1).padStart(2,'0')} / ${String(total).padStart(2,'0')}`
    : '';

  const body = document.createElement('div');
  body.className = 'card-body-section';
  body.innerHTML = `
    <div class="card-meta-row">
      <span class="card-date">📅 ${fmtDate(n.createdAt)}</span>
      <span class="card-num">${numStr}</span>
    </div>
    <div class="card-title">${esc(n.title)}</div>
    ${!n.media?.length && n.body
      ? `<div class="card-excerpt">${esc(n.body)}</div>`
      : ''}`;
  card.appendChild(body);

  const quickBar = document.createElement('div');
  quickBar.className = 'card-quick-bar';
  quickBar.innerHTML = ['❤️','😂','🔥','😍','👏'].map(e => {
    const isUser = (n.userReactions||[]).includes(e);
    const cnt    = (n.reactions||{})[e] || 0;
    return `<button class="card-react-btn ${isUser?'active':''}" data-nid="${n.id}" data-em="${e}">
      ${e}${cnt > 0 ? `<span class="card-react-cnt">${cnt}</span>` : ''}
    </button>`;
  }).join('');
  card.appendChild(quickBar);

  const reacts = Object.entries(n.reactions||{}).filter(([,v])=>v>0)
    .map(([e,c]) => {
      const isUser = (n.userReactions||[]).includes(e);
      return `<span class="react-chip" style="${isUser?'background:var(--accent-bg);border-color:var(--accent-border);font-weight:700':''}">${e} ${c}</span>`;
    }).join('') || `<span style="font-size:11px;color:var(--ink4);font-family:var(--sans)">No reactions</span>`;
  const chips = [
    n.musicUrl      ? `<span class="chip">♫</span>` : '',
    n.media?.length ? `<span class="chip">🎬 ${n.media.length}</span>` : '',
    (n.replies||[]).length ? `<span class="chip">💬 ${n.replies.length}</span>` : '',
  ].filter(Boolean).join('');

  const foot = document.createElement('div');
  foot.className = 'card-footer';
  foot.innerHTML = `<div class="card-reactions">${reacts}</div><div class="card-chips">${chips}</div>`;
  card.appendChild(foot);

  if (n.tags && n.tags.length) {
    const tagRow = document.createElement('div');
    tagRow.className = 'card-tags-row';
    tagRow.innerHTML = n.tags.map(t =>
      `<button class="tag-chip${activeTag===t?' tag-chip-active':''}" data-tag="${esc(t)}">#${esc(t)}</button>`
    ).join('');
    tagRow.querySelectorAll('.tag-chip').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        activeTag = activeTag === btn.dataset.tag ? null : btn.dataset.tag;
        renderTagFilterRow(); renderGrid();
      };
    });
    card.appendChild(tagRow);
  }
  return card;
}

// ══════════════════════════════════════════════════════════════════════════
//  MEDIA SLIDER  (used inside grid cards and detail view)
// ══════════════════════════════════════════════════════════════════════════
function buildSlider(items, size, noteId) {
  if (!items || !items.length) return null;

  const root  = document.createElement('div');
  root.className = `slider-root sz-${size}`;
  const track = document.createElement('div');
  track.className = 'slider-track';

  let cur = 0;
  const slides = [];

  items.forEach(item => {
    const slide = document.createElement('div');
    slide.className = 'slide-item';

    if (isVid(item.mimetype)) {
      const v = document.createElement('video');
      v.src = item.url; v.loop = true; v.muted = true; v.playsInline = true;
      v.onloadedmetadata = () => {
        if (v.videoWidth > v.videoHeight) v.classList.add('is-landscape');
      };
      slide.appendChild(v);
      if (size === 'detail') {
        const ctrl = buildVideoControls(v, item, noteId);
        if (ctrl) slide.appendChild(ctrl);
      }
    } else {
      const img = document.createElement('img');
      img.src = item.url; img.loading = 'lazy'; img.draggable = false;
      slide.appendChild(img);
    }

    if (isOwner) {
      const del = document.createElement('button');
      del.className = 'slide-del';
      del.textContent = '✕ Remove';
      del.dataset.nid = noteId;
      del.dataset.mid = item.id;
      slide.appendChild(del);
    }

    track.appendChild(slide);
    slides.push(slide);
  });

  root.appendChild(track);

  let dots = [];
  if (items.length > 1) {
    const dotsEl = document.createElement('div');
    dotsEl.className = 'sl-dots';
    items.forEach((_, i) => {
      const d = document.createElement('button');
      d.className = 'sl-dot' + (i === 0 ? ' active' : '');
      d.onclick = e => { e.stopPropagation(); goTo(i); };
      dotsEl.appendChild(d); dots.push(d);
    });
    root.appendChild(dotsEl);

    const counter = document.createElement('div');
    counter.className = 'sl-counter';
    counter.textContent = `1 / ${items.length}`;
    root.appendChild(counter);

    const prevBtn = document.createElement('button');
    prevBtn.className = 'sl-arrow prev'; prevBtn.innerHTML = '&#8249;';
    const nextBtn = document.createElement('button');
    nextBtn.className = 'sl-arrow next'; nextBtn.innerHTML = '&#8250;';

    function goTo(n) {
      cur = Math.max(0, Math.min(n, items.length - 1));
      track.style.transform = `translateX(-${cur * 100}%)`;
      dots.forEach((d, i) => d.classList.toggle('active', i === cur));
      counter.textContent = `${cur + 1} / ${items.length}`;
      prevBtn.disabled = cur === 0;
      nextBtn.disabled = cur === items.length - 1;
    }

    prevBtn.onclick = e => { e.preventDefault(); e.stopPropagation(); goTo(cur - 1); };
    nextBtn.onclick = e => { e.preventDefault(); e.stopPropagation(); goTo(cur + 1); };
    prevBtn.disabled = false; nextBtn.disabled = false;
    root.appendChild(prevBtn); root.appendChild(nextBtn);

    let tx = 0, dragging = false;
    root.addEventListener('touchstart', e => { tx = e.touches[0].clientX; dragging = true; }, { passive: true });
    root.addEventListener('touchend', e => {
      if (!dragging) return; dragging = false;
      const dx = e.changedTouches[0].clientX - tx;
      if (Math.abs(dx) > 40) { if (dx < 0) goTo(cur + 1); else goTo(cur - 1); }
    });
  }

  return root;
}

function buildVideoControls(v, item, noteId) {
  const ctrl  = document.createElement('div'); ctrl.className = 'vid-controls';
  const prog  = document.createElement('input');
  prog.type = 'range'; prog.min = 0; prog.max = 100; prog.value = 0; prog.className = 'vid-progress';
  const bar     = document.createElement('div');    bar.className = 'vid-bar';
  const btnPP   = document.createElement('button'); btnPP.className = 'vid-btn'; btnPP.textContent = '▶';
  const timeEl  = document.createElement('span');   timeEl.className = 'vid-time'; timeEl.textContent = '0:00 / 0:00';
  const spacer  = document.createElement('div');    spacer.className = 'vid-spacer';
  const volEl   = document.createElement('input');  volEl.type = 'range'; volEl.min = 0; volEl.max = 1; volEl.step = 0.05; volEl.value = 0.6; volEl.className = 'vid-vol';
  const btnMute = document.createElement('button'); btnMute.className = 'vid-btn'; btnMute.textContent = '♪';
  const btnFS   = document.createElement('button'); btnFS.className = 'vid-btn'; btnFS.textContent = '⤢';
  bar.append(btnPP, timeEl, spacer, volEl, btnMute, btnFS);
  ctrl.append(prog, bar);
  v.volume = 0.6;
  let showTimer;
  const showCtrl = () => {
    v.closest('.slide-item')?.classList.add('show-ctrl');
    clearTimeout(showTimer);
    showTimer = setTimeout(() => v.closest('.slide-item')?.classList.remove('show-ctrl'), 2800);
  };
  v.addEventListener('click', () => { showCtrl(); v.paused ? v.play() : v.pause(); });
  v.addEventListener('timeupdate', () => {
    if (!v.duration) return;
    prog.value = (v.currentTime / v.duration) * 100;
    timeEl.textContent = `${fmtDur(v.currentTime)} / ${fmtDur(v.duration)}`;
  });
  prog.addEventListener('input', e => { e.stopPropagation(); v.currentTime = (prog.value / 100) * (v.duration || 0); });
  v.addEventListener('play',  () => { btnPP.textContent = '⏸'; showCtrl(); });
  v.addEventListener('pause', () => { btnPP.textContent = '▶'; });
  btnPP.onclick   = e => { e.stopPropagation(); v.paused ? v.play() : v.pause(); };
  volEl.oninput   = e => { e.stopPropagation(); v.volume = parseFloat(volEl.value); v.muted = false; btnMute.textContent = '♪'; };
  btnMute.onclick = e => { e.stopPropagation(); v.muted = !v.muted; btnMute.textContent = v.muted ? '🔇' : '♪'; };
  btnFS.onclick   = e => { e.stopPropagation(); v.requestFullscreen?.(); };
  ctrl.addEventListener('click', e => e.stopPropagation());
  return ctrl;
}

// ══════════════════════════════════════════════════════════════════════════
//  DETAIL  —  Tinder-style full-screen card overlay
//  Opens when a grid card is clicked; left/right swipe moves between notes
// ══════════════════════════════════════════════════════════════════════════
async function openDetail(id) {
  document.getElementById('detailContent').innerHTML = '<div class="spinner"></div>';
  document.getElementById('detailBars').innerHTML = '';
  openOv('detailOverlay');
  try {
    const note = await api('GET', `/notes/${id}`);
    const i = notes.findIndex(n => n.id === id);
    if (i !== -1) { notes[i] = note; detailIdx = i; }
    renderDetail(note);
    playMusic(note);
  } catch (err) {
    document.getElementById('detailContent').innerHTML =
      `<p style="color:var(--ink3);padding:40px;text-align:center">Could not load entry.<br><small>${esc(err.message)}</small></p>`;
  }
}

function renderDetail(note) {
  const p     = PALETTE[note.colorIdx || 0];
  const fsCss = note.fontWeight === 'bold italic' ? 'font-weight:bold;font-style:italic'
              : note.fontWeight === 'bold'        ? 'font-weight:bold'
              : note.fontWeight === 'italic'      ? 'font-style:italic' : '';

  const allIds = notes.map(n => n.id);
  const idx    = allIds.indexOf(note.id);
  const prevId = idx > 0               ? allIds[idx - 1] : null;
  const nextId = idx < allIds.length-1 ? allIds[idx + 1] : null;

  // ── story progress bars ──
  const barsEl = document.getElementById('detailBars');
  barsEl.innerHTML = notes.map((_, i) =>
    `<div class="td-bar ${i === idx ? 'active' : (i < idx ? 'done' : '')}"></div>`
  ).join('');

  // ── tap-zone nav ──
  const tapL = document.getElementById('detailTapLeft');
  const tapR = document.getElementById('detailTapRight');
  tapL.style.display = prevId ? 'flex' : 'none';
  tapR.style.display = nextId ? 'flex' : 'none';
  tapL.onclick = () => { detailIdx = idx - 1; openDetail(prevId); };
  tapR.onclick = () => { detailIdx = idx + 1; openDetail(nextId); };

  // ── reactions ──
  const reactHtml = Object.entries(note.reactions||{}).filter(([,v])=>v>0)
    .map(([e,c]) => {
      const isUser = (note.userReactions||[]).includes(e);
      return `<span class="rcnt btn-react" data-id="${note.id}" data-em="${e}"
        style="cursor:pointer;background:${isUser?'var(--accent-bg)':'var(--bg)'};border-color:${isUser?'var(--accent-border)':'var(--border)'}">
        ${e} <b>${c}</b></span>`;
    }).join('') || `<span style="color:var(--ink4);font-size:12px;font-family:var(--sans)">Be the first to react!</span>`;

  // ── replies ──
  const repliesHtml = (note.replies||[]).map(r => {
    const canEdit = currentUser && (r.userId === currentUser.userId || isOwner);
    const replyReacts = Object.entries(r.reactions||{}).filter(([,v])=>v>0)
      .map(([e,c]) => {
        const isUser = (r.userReactions||[]).includes(e);
        return `<span class="react-chip btn-reply-react" data-nid="${note.id}" data-rid="${r.id}" data-em="${e}"
          style="font-size:11px;padding:2px 7px;cursor:pointer;background:${isUser?'var(--accent-bg)':'var(--bg)'};border-color:${isUser?'var(--accent-border)':'var(--border)'};font-weight:${isUser?'700':'400'}">${e} ${c}</span>`;
      }).join('');
    const quickReplyReacts = ['❤️','😂','🔥','😍','👏'].map(e => {
      const isUser = (r.userReactions||[]).includes(e);
      return `<button class="btn-reply-react" data-nid="${note.id}" data-rid="${r.id}" data-em="${e}"
        style="background:${isUser?'var(--accent-bg)':'none'};border:${isUser?'1px solid var(--accent-border)':'1px solid transparent'};cursor:pointer;font-size:13px;padding:1px 4px;border-radius:4px;transform:${isUser?'scale(1.15)':'none'}">${e}</button>`;
    }).join('');
    return `
    <div class="reply-item" data-rid="${r.id}">
      <div class="reply-author">
        <span>👤 ${esc(r.name||'Anonymous')}</span>
        <small>${fmtDate(r.createdAt)} ${fmtTime(r.createdAt)}</small>
      </div>
      <div class="reply-text" id="rtxt-${r.id}">${esc(r.text)}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;padding-top:6px;border-top:1px solid var(--border)">
        <div style="display:flex;flex-wrap:wrap;gap:4px">${replyReacts}</div>
        <div style="display:flex;gap:2px">${quickReplyReacts}</div>
      </div>
      ${canEdit ? `<div class="reply-admin-btns" style="margin-top:6px">
        <button class="btn btn-dark btn-xs btn-redit" data-nid="${note.id}" data-rid="${r.id}">✏️ Edit</button>
        <button class="btn btn-red  btn-xs btn-rdel"  data-nid="${note.id}" data-rid="${r.id}">🗑 Del</button>
      </div>` : ''}
    </div>`;
  }).join('') || `<p style="color:var(--ink4);font-size:12px;font-style:italic;font-family:var(--sans)">No replies yet.</p>`;

  // ── render tinder detail body ──
  // Top cover: if media exists show it full-width; else coloured title bg
  let coverHtml = '';
  if (note.media && note.media.length) {
    coverHtml = `<div id="tdMediaMount" class="td-cover-media"></div>`;
  } else {
    coverHtml = `<div class="td-cover-textbg" style="background:${p.bg}">
      <div class="td-cover-title" style="color:${p.accent};font-family:${esc(note.font)}">${esc(note.title)}</div>
    </div>`;
  }

  const cont = document.getElementById('detailContent');
  cont.className = 'detail-body-wrap fade-enter';
  cont.innerHTML = `
    ${coverHtml}
    <div class="td-body">
      <div class="detail-header">
        <h2 class="detail-title" style="font-family:${esc(note.font)};color:${p.accent}">${esc(note.title)}</h2>
      </div>
      <div class="detail-meta">
        <span>📅 ${fmtDate(note.createdAt)} · ${fmtTime(note.createdAt)}</span>
        ${isOwner ? `<span>👁 ${note.views} views</span>` : ''}
        ${note.editedAt ? `<span>✏️ Edited ${fmtDate(note.editedAt)}</span>` : ''}
        <span>💬 ${(note.replies||[]).length} ${(note.replies||[]).length===1?'reply':'replies'}</span>
      </div>
      ${note.musicUrl ? `<div style="font-size:12px;color:var(--accent);margin-bottom:12px;font-style:italic;font-family:var(--sans)">♫ Background music is playing</div>` : ''}
      <div class="detail-body" style="font-family:${esc(note.font)};font-size:${note.fontSize||14}px;${fsCss};border-left-color:${p.accent}">${esc(note.body)}</div>
      <hr class="sep">
      <div class="section-label">React</div>
      <div class="emoji-grid">${EMOJIS.map(e => {
        const isUser = (note.userReactions||[]).includes(e);
        return `<button class="emoji-btn btn-react" data-em="${e}" data-id="${note.id}"
          style="${isUser?'background:var(--accent-bg);border-color:var(--accent);transform:scale(1.12)':''}">${e}</button>`;
      }).join('')}</div>
      <div class="react-display" id="rdisplay">${reactHtml}</div>
      <hr class="sep">
      <div class="section-label">💬 Replies (${(note.replies||[]).length})</div>
      <div class="reply-list" id="replyList">${repliesHtml}</div>
      <div class="reply-form">
        <input type="text" id="rName" placeholder="${currentUser?(currentUser.displayName||currentUser.username):'Your name (optional)'}" ${currentUser?'disabled':''}>
        <textarea id="rText" placeholder="Share your thoughts or feelings…"></textarea>
        <button class="btn btn-gold btn-sm btn-rpost" data-id="${note.id}" style="align-self:flex-end">Post Reply</button>
      </div>
      ${isOwner ? `
      <div class="admin-note-bar">
        <span class="admin-bar-label">Owner</span>
        <button class="btn btn-ghost btn-sm btn-dedit" data-id="${note.id}">✏️ Edit Entry</button>
        <button class="btn btn-red   btn-sm btn-ddel"  data-id="${note.id}">🗑 Delete Entry</button>
      </div>` : ''}
    </div>`;

  // mount media slider into cover area
  if (note.media?.length) {
    const sl = buildSlider(note.media, 'detail', note.id);
    const mount = document.getElementById('tdMediaMount');
    if (sl && mount) mount.appendChild(sl);
  }

  // ── events ──────────────────────────────────────────────────────────────
  cont.querySelector('.btn-dedit')?.addEventListener('click', () => {
    closeOv('detailOverlay'); openEditForm(note);
  });
  cont.querySelector('.btn-ddel')?.addEventListener('click', async () => {
    if (!confirm('Delete this entry permanently?')) return;
    try {
      await api('DELETE', `/notes/${note.id}`);
      closeOv('detailOverlay'); toast('Deleted 🗑'); await loadAndRender();
    } catch (err) { toast('Error: ' + err.message); }
  });

  cont.querySelectorAll('.slide-del').forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      if (!confirm('Remove this media file?')) return;
      try {
        await api('DELETE', `/upload/${btn.dataset.nid}/${btn.dataset.mid}`);
        const up = await api('GET', `/notes/${btn.dataset.nid}`);
        const i  = notes.findIndex(x => x.id === up.id); if (i !== -1) notes[i] = up;
        renderGrid(); renderDetail(up); toast('Removed 🗑');
      } catch (err) { toast('Error: ' + err.message); }
    };
  });

  cont.querySelectorAll('.btn-react').forEach(btn => {
    btn.onclick = async () => {
      try {
        const noteObj    = notes.find(x => x.id === btn.dataset.id);
        const hadReacted = (noteObj?.userReactions||[]).includes(btn.dataset.em);
        const res = await api('POST', `/notes/${btn.dataset.id}/react`, { emoji: btn.dataset.em });
        const up  = await api('GET', `/notes/${btn.dataset.id}`);
        const i   = notes.findIndex(x => x.id === up.id); if (i !== -1) notes[i] = up;
        renderDetail(up); renderGrid();
        toast((res.isReacted ?? !hadReacted) ? 'Reacted ' + btn.dataset.em : 'Removed ' + btn.dataset.em);
      } catch (err) { toast('Error: ' + err.message); }
    };
  });

  cont.querySelectorAll('.btn-reply-react').forEach(btn => {
    btn.onclick = async () => {
      try {
        const replyObj   = (note.replies||[]).find(x => x.id === btn.dataset.rid);
        const hadReacted = (replyObj?.userReactions||[]).includes(btn.dataset.em);
        const res = await api('POST', `/notes/${btn.dataset.nid}/replies/${btn.dataset.rid}/react`, { emoji: btn.dataset.em });
        const up  = await api('GET', `/notes/${btn.dataset.nid}`);
        const i   = notes.findIndex(x => x.id === up.id); if (i !== -1) notes[i] = up;
        renderDetail(up); renderGrid();
        toast((res.isReacted ?? !hadReacted) ? 'Reacted ' + btn.dataset.em : 'Removed ' + btn.dataset.em);
      } catch (err) { toast('Error: ' + err.message); }
    };
  });

  cont.querySelectorAll('.btn-rdel').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this reply?')) return;
      try {
        await api('DELETE', `/notes/${btn.dataset.nid}/replies/${btn.dataset.rid}`);
        const up = await api('GET', `/notes/${btn.dataset.nid}`);
        const i  = notes.findIndex(x => x.id === up.id); if (i !== -1) notes[i] = up;
        renderDetail(up); renderGrid(); toast('Reply deleted');
      } catch (err) { toast('Error: ' + err.message); }
    };
  });

  cont.querySelectorAll('.btn-redit').forEach(btn => {
    btn.onclick = () => {
      const rid   = btn.dataset.rid;
      const nid   = btn.dataset.nid;
      const item  = cont.querySelector(`.reply-item[data-rid="${rid}"]`);
      if (!item) return;
      const txtEl = item.querySelector(`#rtxt-${rid}`);
      const cur   = txtEl.textContent;
      txtEl.style.display = 'none';
      const ta = document.createElement('textarea');
      ta.className = 'reply-edit-ta';
      ta.value = cur;
      ta.style.cssText = 'width:100%;padding:7px 10px;border:1px solid var(--border2);border-radius:8px;background:var(--bg);color:var(--ink);font-family:var(--serif);font-size:13px;resize:vertical;min-height:60px;margin-top:6px;';
      const saveBtn   = document.createElement('button'); saveBtn.className   = 'btn btn-gold btn-xs'; saveBtn.textContent   = 'Save';   saveBtn.style.marginTop   = '6px';
      const cancelBtn = document.createElement('button'); cancelBtn.className = 'btn btn-dark btn-xs'; cancelBtn.textContent = 'Cancel'; cancelBtn.style.marginTop = '6px';
      const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;margin-top:4px;';
      row.append(saveBtn, cancelBtn);
      item.append(ta, row); ta.focus();
      cancelBtn.onclick = () => { ta.remove(); row.remove(); txtEl.style.display = ''; };
      saveBtn.onclick = async () => {
        const newText = ta.value.trim();
        if (!newText) { toast('Reply cannot be empty'); return; }
        try {
          await api('PUT', `/notes/${nid}/replies/${rid}`, { text: newText });
          const up = await api('GET', `/notes/${nid}`);
          const i  = notes.findIndex(x => x.id === up.id); if (i !== -1) notes[i] = up;
          renderDetail(up); renderGrid(); toast('Reply updated ✅');
        } catch (err) { toast('Error: ' + err.message); }
      };
    };
  });

  cont.querySelector('.btn-rpost')?.addEventListener('click', async () => {
    const text = document.getElementById('rText').value.trim();
    if (!text) { toast('Write something ✍'); return; }
    const name = currentUser
      ? (currentUser.displayName || currentUser.username)
      : (document.getElementById('rName').value.trim() || 'Anonymous');
    try {
      await api('POST', `/notes/${note.id}/replies`, { name, text });
      const up = await api('GET', `/notes/${note.id}`);
      const i  = notes.findIndex(x => x.id === up.id); if (i !== -1) notes[i] = up;
      renderDetail(up); renderGrid(); toast('Reply posted 💬');
    } catch (err) { toast('Error: ' + err.message); }
  });

  // touch swipe between notes inside the detail card
  const modal = document.getElementById('detailModal');
  let sx = 0, sy = 0;
  modal.ontouchstart = e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; };
  modal.ontouchend   = e => {
    if (e.target.closest('.slider-root')) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 48) {
      if (dx < 0 && nextId) { detailIdx = allIds.indexOf(nextId); openDetail(nextId); }
      else if (dx > 0 && prevId) { detailIdx = allIds.indexOf(prevId); openDetail(prevId); }
    }
  };
}

// keyboard left/right when detail is open
document.addEventListener('keydown', e => {
  if (!document.getElementById('detailOverlay').classList.contains('open')) return;
  if (document.getElementById('formOverlay').classList.contains('open')) return;
  const allIds = notes.map(n => n.id);
  const prevId = detailIdx > 0               ? allIds[detailIdx - 1] : null;
  const nextId = detailIdx < allIds.length-1 ? allIds[detailIdx + 1] : null;
  if (e.key === 'ArrowRight' && nextId) { detailIdx++; openDetail(nextId); }
  if (e.key === 'ArrowLeft'  && prevId) { detailIdx--; openDetail(prevId); }
});

// ── MUSIC ──────────────────────────────────────────────────────────────────
function playMusic(note) {
  if (!note.musicUrl) {
    audio.pause(); audio.src = '';
    document.getElementById('musicBar').classList.remove('active');
    return;
  }
  if (audio.src !== note.musicUrl) { audio.src = note.musicUrl; audio.volume = 0.6; }
  audio.play().catch(() => {});
  document.getElementById('musicTitle').textContent = note.title || 'Playing…';
  document.getElementById('musicBar').classList.add('active');
}
document.getElementById('btnMPP').onclick = () => {
  if (audio.paused) {
    audio.play();
    document.getElementById('musicBar').classList.remove('paused');
    document.getElementById('btnMPP').textContent = '⏸';
  } else {
    audio.pause();
    document.getElementById('musicBar').classList.add('paused');
    document.getElementById('btnMPP').textContent = '▶';
  }
};
document.getElementById('btnMute').onclick = () => {
  audio.muted = !audio.muted;
  document.getElementById('btnMute').textContent = audio.muted ? '🔇' : '♪';
};
document.getElementById('musicVol').oninput = e => {
  audio.volume = parseFloat(e.target.value);
  audio.muted  = false;
  document.getElementById('btnMute').textContent = '♪';
};

// ── INIT ───────────────────────────────────────────────────────────────────
(async () => {
  const match = location.pathname.match(/^\/u\/([^/]+)/);
  const urlUsername = match ? match[1].toLowerCase() : null;

  if (token) {
    try {
      const data = await api('GET', '/auth/verify');
      currentUser = { userId: data.userId, username: data.username, displayName: data.displayName, bio: data.bio };
    } catch {
      token = null;
      localStorage.removeItem('diary_token');
    }
  }

  if (urlUsername) {
    await enterPublicDiary(urlUsername);
  } else if (currentUser) {
    await enterOwnDiary();
  } else {
    showAuth();
  }
})();
