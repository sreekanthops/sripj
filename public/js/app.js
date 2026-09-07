/* ── app.js  v4  — multi-user diary ──────────────────────────────────────── */
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
let token       = localStorage.getItem('diary_token') || null;
let currentUser = null;   // { userId, username, displayName, bio }
let viewingUser = null;   // { id, username, displayName, bio } — when on public page
let isOwner     = false;  // viewing own diary
let notes       = [];
let editId      = null;
let pendingFiles = [];

const audio = document.getElementById('bgAudio');

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
function showAuth()  {
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('appScreen').classList.add('hidden');
}
function showApp()   {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
}

// ── AUTH SCREEN ────────────────────────────────────────────────────────────
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
document.getElementById('loginPwd').onkeydown = e => { if (e.key==='Enter') document.getElementById('loginBtn').click(); };

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
document.getElementById('signupPwd').onkeydown = e => { if (e.key==='Enter') document.getElementById('signupBtn').click(); };

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

// ── HEADER ─────────────────────────────────────────────────────────────────
function renderHeader() {
  const el = document.getElementById('headerActions');
  if (isOwner) {
    // viewing own diary — show full owner controls
    el.innerHTML = `
      <span class="owner-badge">✦ ${esc(currentUser.displayName)}</span>
      <button class="btn btn-primary btn-sm" data-action="new-note">+ New Entry</button>
      <button class="btn btn-ghost btn-sm" data-action="share">🔗 Share</button>
      <button class="btn btn-ghost btn-sm" data-action="profile">✏️ Profile</button>
      <button class="btn btn-ghost btn-sm" data-action="logout">Sign out</button>`;
  } else if (currentUser && viewingUser) {
    // logged-in user visiting someone else's diary
    el.innerHTML = `
      <span class="owner-badge">👤 ${esc(currentUser.displayName)}</span>
      <button class="btn btn-ghost btn-sm" data-action="go-home">My Diary</button>`;
  } else if (!currentUser && viewingUser) {
    // guest visiting a public diary
    el.innerHTML = `
      <button class="btn btn-ghost btn-sm" data-action="go-login">Sign In / Sign Up</button>`;
  } else {
    el.innerHTML = '';
  }
}

document.getElementById('headerActions').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'new-note') {
    openNewForm();
  } else if (action === 'share') {
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

// scroll shadow
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
  document.getElementById('pageTitle').textContent    = 'My Journal';
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
    if (isOwner) {
      document.body.classList.add('is-owner');
    } else {
      document.body.classList.remove('is-owner');
    }
    notes = data.notes;
    document.getElementById('sidebarTitle').textContent = viewingUser.displayName || viewingUser.username;
    document.getElementById('sidebarSub').textContent   = '@' + viewingUser.username;
    document.getElementById('pageTitle').textContent    = isOwner ? 'My Journal' : (viewingUser.displayName || viewingUser.username) + "'s Diary";
    renderHeader();
    buildSwatches(0);
    setupUploadZone();
    showApp();
    renderGrid();
  } catch {
    // user not found — show auth or 404 message
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
    del.onclick = () => { pendingFiles.splice(pendingFiles.indexOf(f),1); wrap.remove(); };
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
        wrap.remove();
        toast('Removed');
      } catch (e) { toast('Error: ' + e.message); }
    };
    wrap.appendChild(el); wrap.appendChild(del); row.appendChild(wrap);
  });
}

// ── FORMS ──────────────────────────────────────────────────────────────────
function openNewForm() {
  editId = null;
  document.getElementById('formTitle').textContent = '✒ New Entry';
  document.getElementById('fTitle').value  = '';
  document.getElementById('fBody').value   = '';
  document.getElementById('fFont').value   = 'Georgia,serif';
  document.getElementById('fSize').value   = 14;
  document.getElementById('fWeight').value = 'normal';
  document.getElementById('fMusic').value  = '';
  document.getElementById('existMediaRow').innerHTML = '';
  buildSwatches(0); setupUploadZone();
  openOv('formOverlay');
  setTimeout(() => document.getElementById('fTitle').focus(), 120);
}
function openEditForm(note) {
  editId = note.id;
  document.getElementById('formTitle').textContent = '✒ Edit Entry';
  document.getElementById('fTitle').value  = note.title;
  document.getElementById('fBody').value   = note.body;
  document.getElementById('fFont').value   = note.font || 'Georgia,serif';
  document.getElementById('fSize').value   = note.fontSize || 14;
  document.getElementById('fWeight').value = note.fontWeight || 'normal';
  document.getElementById('fMusic').value  = note.musicUrl || '';
  buildSwatches(note.colorIdx || 0);
  renderExistMedia(note); setupUploadZone();
  openOv('formOverlay');
}

document.getElementById('fSave').onclick = async () => {
  const title      = document.getElementById('fTitle').value.trim();
  const body       = document.getElementById('fBody').value.trim();
  const font       = document.getElementById('fFont').value;
  const fontSize   = parseInt(document.getElementById('fSize').value) || 14;
  const fontWeight = document.getElementById('fWeight').value;
  const colorIdx   = activeCI();
  const musicUrl   = document.getElementById('fMusic').value.trim();
  if (!title && !body) { toast('Write something first ✍'); return; }
  const payload = { title: title||'Untitled', body, font, fontSize, fontWeight, colorIdx, musicUrl };
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
  const p = new URLSearchParams();
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
  try { await loadNotes(); renderGrid(); }
  catch { document.getElementById('notesGrid').innerHTML =
    `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--ink4);font-family:var(--sans)">
      <div style="font-size:32px;margin-bottom:12px;color:var(--accent);opacity:.5">⚠</div>
      Could not load entries.
    </div>`; }
}

document.getElementById('filterFrom').onchange    = loadAndRender;
document.getElementById('filterTo').onchange      = loadAndRender;
document.getElementById('btnClearFilter').onclick = () => {
  document.getElementById('filterFrom').value = '';
  document.getElementById('filterTo').value   = '';
  loadAndRender();
};

// ══════════════════════════════════════════════════════════════════════════
//  MEDIA SLIDER
// ══════════════════════════════════════════════════════════════════════════
function buildSlider(items, size, noteId) {
  if (!items || !items.length) return null;

  const root  = document.createElement('div');
  root.className = `slider-root sz-${size}`;
  const track = document.createElement('div');
  track.className = 'slider-track';

  let cur = 0;
  const slides = [];

  items.forEach((item, idx) => {
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

    // per-slide delete (only for owner)
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

  // dots & counter only if multiple
  let dots = [];
  if (items.length > 1) {
    const dotsEl = document.createElement('div');
    dotsEl.className = 'sl-dots';
    items.forEach((_, i) => {
      const d = document.createElement('button');
      d.className = 'sl-dot' + (i===0?' active':'');
      d.onclick = e => { e.stopPropagation(); goTo(i); };
      dotsEl.appendChild(d); dots.push(d);
    });
    root.appendChild(dotsEl);

    const counter = document.createElement('div');
    counter.className = 'sl-counter';
    counter.textContent = `1 / ${items.length}`;
    root.appendChild(counter);

    const prevBtn = document.createElement('button');
    prevBtn.className = 'sl-arrow prev'; prevBtn.innerHTML = '&#8249;'; prevBtn.disabled = true;
    const nextBtn = document.createElement('button');
    nextBtn.className = 'sl-arrow next'; nextBtn.innerHTML = '&#8250;';

    function goTo(n) {
      cur = Math.max(0, Math.min(n, items.length-1));
      track.style.transform = `translateX(-${cur * 100}%)`;
      dots.forEach((d,i) => d.classList.toggle('active', i===cur));
      counter.textContent = `${cur+1} / ${items.length}`;
      prevBtn.disabled = cur === 0;
      nextBtn.disabled = cur === items.length-1;
    }

    function handlePrev(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      goTo(cur > 0 ? cur - 1 : items.length - 1);
    }
    function handleNext(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      goTo(cur < items.length - 1 ? cur + 1 : 0);
    }

    prevBtn.onclick = handlePrev;
    nextBtn.onclick = handleNext;
    prevBtn.disabled = false;
    nextBtn.disabled = false;
    root.appendChild(prevBtn); root.appendChild(nextBtn);

    // touch swipe
    let tx=0, dragging=false;
    root.addEventListener('touchstart', e => { tx = e.touches[0].clientX; dragging=true; }, {passive:true});
    root.addEventListener('touchend',   e => {
      if (!dragging) return; dragging=false;
      const dx = e.changedTouches[0].clientX - tx;
      if (Math.abs(dx) > 40) { if (dx < 0) goTo(cur+1); else goTo(cur-1); }
    });
  }

  return root;
}

function buildVideoControls(v, item, noteId) {
  const ctrl = document.createElement('div');
  ctrl.className = 'vid-controls';

  const prog = document.createElement('input');
  prog.type='range'; prog.min=0; prog.max=100; prog.value=0; prog.className='vid-progress';

  const bar    = document.createElement('div'); bar.className = 'vid-bar';
  const btnPP  = document.createElement('button'); btnPP.className='vid-btn'; btnPP.textContent='▶';
  const timeEl = document.createElement('span');  timeEl.className='vid-time'; timeEl.textContent='0:00 / 0:00';
  const spacer = document.createElement('div');   spacer.className='vid-spacer';
  const volEl  = document.createElement('input'); volEl.type='range'; volEl.min=0; volEl.max=1; volEl.step=0.05; volEl.value=0.6; volEl.className='vid-vol';
  const btnMute= document.createElement('button'); btnMute.className='vid-btn'; btnMute.textContent='♪';
  const btnFS  = document.createElement('button'); btnFS.className='vid-btn'; btnFS.textContent='⤢';

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
  prog.addEventListener('input', e => { e.stopPropagation(); v.currentTime = (prog.value / 100) * (v.duration||0); });
  v.addEventListener('play',  () => { btnPP.textContent='⏸'; showCtrl(); });
  v.addEventListener('pause', () => { btnPP.textContent='▶'; });

  btnPP.onclick = e => { e.stopPropagation(); v.paused ? v.play() : v.pause(); };
  volEl.oninput = e => { e.stopPropagation(); v.volume = parseFloat(volEl.value); v.muted = false; btnMute.textContent='♪'; };
  btnMute.onclick = e => { e.stopPropagation(); v.muted = !v.muted; btnMute.textContent = v.muted ? '🔇' : '♪'; };
  btnFS.onclick   = e => { e.stopPropagation(); v.requestFullscreen?.(); };
  ctrl.addEventListener('click', e => e.stopPropagation());

  return ctrl;
}

// ══════════════════════════════════════════════════════════════════════════
//  GRID
// ══════════════════════════════════════════════════════════════════════════
function renderGrid() {
  const grid    = document.getElementById('notesGrid');
  const countEl = document.getElementById('noteCount');
  document.getElementById('swipeHint').textContent = notes.length > 1 ? '← swipe to navigate ←' : '';
  if (countEl) countEl.textContent = notes.length ? `${notes.length} entr${notes.length===1?'y':'ies'}` : '';

  if (!notes.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:70px 20px;color:var(--ink4);font-family:var(--sans)">
        <div style="font-size:36px;margin-bottom:12px;color:var(--accent);opacity:.5">✦</div>
        ${isOwner ? 'Tap <b style="color:var(--accent)">+ New Entry</b> to write your first entry.'
                  : 'No diary entries yet — check back soon.'}
      </div>`;
    return;
  }

  grid.innerHTML = notes.map(() => '<div class="skeleton"></div>').join('');
  requestAnimationFrame(() => {
    grid.innerHTML = '';
    notes.forEach(n => {
      const p    = PALETTE[n.colorIdx || 0];
      const card = document.createElement('article');
      card.className = 'note-card fade-enter';
      card.dataset.id = n.id;
      card.style.setProperty('--card-accent', p.accent);

      if (n.media && n.media.length) {
        const mediaWrap = document.createElement('div');
        mediaWrap.className = 'card-media';
        const sl = buildSlider(n.media, 'card', n.id);
        if (sl) mediaWrap.appendChild(sl);
        card.appendChild(mediaWrap);
      }

      const body = document.createElement('div');
      body.className = 'card-body-section';
      body.innerHTML = `
        <div class="card-meta-row">
          <span class="card-date">📅 ${fmtDate(n.createdAt)}</span>
          ${isOwner ? `<span class="card-views">👁 ${n.views}</span>` : ''}
        </div>
        <div class="card-title" style="font-family:${esc(n.font)};color:${p.accent}">${esc(n.title)}</div>
        ${!n.media?.length ? `<div class="card-excerpt" style="font-family:${esc(n.font)};font-size:${Math.min(n.fontSize||14,13)}px">${esc(n.body)}</div>` : ''}`;
      card.appendChild(body);

      const reacts = Object.entries(n.reactions||{}).filter(([,v])=>v>0)
        .map(([e,c]) => {
          const isUser = (n.userReactions||[]).includes(e);
          return `<span class="react-chip btn-card-react" data-nid="${n.id}" data-em="${e}" style="${isUser?'background:var(--accent-bg);border-color:var(--accent-border);font-weight:700':''}">${e} ${c}</span>`;
        }).join('') || `<span style="font-size:11px;color:var(--ink4);font-family:var(--sans)">No reactions</span>`;
      const chips = [
        n.musicUrl ? `<span class="chip">♫ Music</span>` : '',
        n.media?.length ? `<span class="chip">🎬 ${n.media.length}</span>` : '',
        (n.replies||[]).length ? `<span class="chip">💬 ${n.replies.length}</span>` : '',
      ].filter(Boolean).join('');

      // quick emojis bar
      const quickBar = document.createElement('div');
      quickBar.className = 'card-quick-bar';
      quickBar.style.cssText = 'display:flex;align-items:center;gap:4px;padding:6px 20px 0;';
      quickBar.innerHTML = ['❤️', '😂', '🔥', '😍', '👏']
        .map(e => {
          const isUser = (n.userReactions||[]).includes(e);
          return `<button class="btn-card-react" data-nid="${n.id}" data-em="${e}" style="background:${isUser?'var(--accent-bg)':'none'};border:${isUser?'1px solid var(--accent-border)':'1px solid transparent'};cursor:pointer;font-size:14px;padding:2px 5px;border-radius:6px;transform:${isUser?'scale(1.15)':'none'}" title="${isUser?'Remove '+e:'React '+e}">${e}</button>`;
        })
        .join('');
      card.appendChild(quickBar);

      const foot = document.createElement('div');
      foot.className = 'card-footer';
      foot.innerHTML = `
        <div class="card-reactions">${reacts}</div>
        <div class="card-chips">${chips}</div>`;
      card.appendChild(foot);
      grid.appendChild(card);
    });

    grid.querySelectorAll('.note-card').forEach(card => {
      card.onclick = e => {
        if (e.target.closest('.slider-root') || e.target.closest('.btn-card-react')) return;
        openDetail(card.dataset.id);
      };
    });

    grid.querySelectorAll('.btn-card-react').forEach(btn => {
      btn.onclick = async e => {
        e.stopPropagation();
        try {
          const res = await api('POST', `/notes/${btn.dataset.nid}/react`, { emoji: btn.dataset.em });
          const n = notes.find(x => x.id === btn.dataset.nid);
          if (n) {
            n.reactions = res.reactions;
            n.userReactions = res.userReactions;
            renderGrid();
          }
          toast(res.isReacted ? ('Reacted ' + btn.dataset.em) : ('Removed ' + btn.dataset.em));
        } catch (err) { toast('Error: ' + err.message); }
      };
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════
//  DETAIL VIEW
// ══════════════════════════════════════════════════════════════════════════
async function openDetail(id) {
  document.getElementById('detailContent').innerHTML = '<div class="spinner"></div>';
  openOv('detailOverlay');
  try {
    const note = await api('GET', `/notes/${id}`);
    const i = notes.findIndex(n => n.id === id);
    if (i !== -1) notes[i] = note;
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
  const prevId = idx > 0               ? allIds[idx-1] : null;
  const nextId = idx < allIds.length-1 ? allIds[idx+1] : null;

  const reactHtml = Object.entries(note.reactions||{}).filter(([,v])=>v>0)
    .map(([e,c]) => {
      const isUser = (note.userReactions||[]).includes(e);
      return `<span class="rcnt btn-react" data-id="${note.id}" data-em="${e}" style="cursor:pointer;background:${isUser?'var(--accent-bg)':'var(--bg)'};border-color:${isUser?'var(--accent-border)':'var(--border)'}">${e} <b>${c}</b></span>`;
    }).join('') || `<span style="color:var(--ink4);font-size:12px;font-family:var(--sans)">Be the first to react!</span>`;

  const repliesHtml = (note.replies||[]).map(r => {
    // can delete own reply (if logged in as author) OR owner can delete any reply
    const canEdit = currentUser && (r.userId === currentUser.userId || isOwner);
    const replyReacts = Object.entries(r.reactions||{}).filter(([,v])=>v>0)
      .map(([e,c]) => {
        const isUser = (r.userReactions||[]).includes(e);
        return `<span class="react-chip btn-reply-react" data-nid="${note.id}" data-rid="${r.id}" data-em="${e}" style="font-size:11px;padding:2px 7px;cursor:pointer;background:${isUser?'var(--accent-bg)':'var(--bg)'};border-color:${isUser?'var(--accent-border)':'var(--border)'};font-weight:${isUser?'700':'400'}">${e} ${c}</span>`;
      }).join('');
    const quickReplyReacts = ['❤️','😂','🔥','😍','👏']
      .map(e => {
        const isUser = (r.userReactions||[]).includes(e);
        return `<button class="btn-reply-react" data-nid="${note.id}" data-rid="${r.id}" data-em="${e}" style="background:${isUser?'var(--accent-bg)':'none'};border:${isUser?'1px solid var(--accent-border)':'1px solid transparent'};cursor:pointer;font-size:13px;padding:1px 4px;border-radius:4px;transform:${isUser?'scale(1.15)':'none'}" title="${isUser?'Remove '+e:'React '+e}">${e}</button>`;
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
      ${canEdit ? `
      <div class="reply-admin-btns" style="margin-top:6px">
        <button class="btn btn-dark btn-xs btn-redit" data-nid="${note.id}" data-rid="${r.id}">✏️ Edit</button>
        <button class="btn btn-red  btn-xs btn-rdel"  data-nid="${note.id}" data-rid="${r.id}">🗑 Del</button>
      </div>` : ''}
    </div>`;
  }).join('') ||
    `<p style="color:var(--ink4);font-size:12px;font-style:italic;font-family:var(--sans)">No replies yet.</p>`;

  const cont = document.getElementById('detailContent');
  cont.className = 'fade-enter';
  cont.innerHTML = `
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
    <div id="mediaMount" style="margin-bottom:${note.media?.length?'18px':'0'}"></div>
    <div class="detail-body" style="font-family:${esc(note.font)};font-size:${note.fontSize||14}px;${fsCss};border-left-color:${p.accent}">${esc(note.body)}</div>
    <hr class="sep">
    <div class="section-label">React</div>
    <div class="emoji-grid">${EMOJIS.map(e=>{
      const isUser = (note.userReactions||[]).includes(e);
      return `<button class="emoji-btn btn-react" data-em="${e}" data-id="${note.id}" style="${isUser?'background:var(--accent-bg);border-color:var(--accent);transform:scale(1.12)':''}" title="${isUser?'Remove '+e:'React '+e}">${e}</button>`;
    }).join('')}</div>
    <div class="react-display" id="rdisplay">${reactHtml}</div>
    <hr class="sep">
    <div class="section-label">💬 Replies (${(note.replies||[]).length})</div>
    <div class="reply-list" id="replyList">${repliesHtml}</div>
    <div class="reply-form">
      <input type="text" id="rName" placeholder="${currentUser ? (currentUser.displayName||currentUser.username) : 'Your name (optional)'}" ${currentUser?'disabled':''}>
      <textarea id="rText" placeholder="Share your thoughts or feelings…"></textarea>
      <button class="btn btn-gold btn-sm btn-rpost" data-id="${note.id}" style="align-self:flex-end">Post Reply</button>
    </div>
    <div class="swipe-nav">
      ${prevId ? `<button class="btn btn-dark btn-sm btn-prev" data-id="${prevId}">← Prev</button>` : '<span></span>'}
      ${nextId ? `<button class="btn btn-dark btn-sm btn-next" data-id="${nextId}">Next →</button>` : '<span></span>'}
    </div>
    ${isOwner ? `
    <div class="admin-note-bar">
      <span class="admin-bar-label">Owner</span>
      <button class="btn btn-ghost btn-sm btn-dedit" data-id="${note.id}">✏️ Edit Entry</button>
      <button class="btn btn-red   btn-sm btn-ddel"  data-id="${note.id}">🗑 Delete Entry</button>
    </div>` : ''}`;

  // media slider
  if (note.media?.length) {
    const sl = buildSlider(note.media, 'detail', note.id);
    if (sl) document.getElementById('mediaMount').appendChild(sl);
  }

  // ── events ─────────────────────────────────────────────────────────────
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
        const res = await api('POST', `/notes/${btn.dataset.id}/react`, { emoji: btn.dataset.em });
        const up = await api('GET', `/notes/${btn.dataset.id}`);
        const i  = notes.findIndex(x => x.id === up.id); if (i !== -1) notes[i] = up;
        renderDetail(up); renderGrid();
        toast(res.isReacted ? ('Reacted ' + btn.dataset.em) : ('Removed ' + btn.dataset.em));
      } catch (err) { toast('Error: ' + err.message); }
    };
  });

  cont.querySelectorAll('.btn-reply-react').forEach(btn => {
    btn.onclick = async () => {
      try {
        const res = await api('POST', `/notes/${btn.dataset.nid}/replies/${btn.dataset.rid}/react`, { emoji: btn.dataset.em });
        const up = await api('GET', `/notes/${btn.dataset.nid}`);
        const i  = notes.findIndex(x => x.id === up.id); if (i !== -1) notes[i] = up;
        renderDetail(up); renderGrid();
        toast(res.isReacted ? ('Reacted ' + btn.dataset.em) : ('Removed ' + btn.dataset.em));
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
      const rid  = btn.dataset.rid;
      const nid  = btn.dataset.nid;
      const item = cont.querySelector(`.reply-item[data-rid="${rid}"]`);
      if (!item) return;
      const txtEl = item.querySelector(`#rtxt-${rid}`);
      const cur   = txtEl.textContent;
      txtEl.style.display = 'none';
      const ta = document.createElement('textarea');
      ta.className = 'reply-edit-ta';
      ta.value = cur;
      ta.style.cssText = 'width:100%;padding:7px 10px;border:1px solid var(--border2);border-radius:8px;background:var(--bg);color:var(--ink);font-family:var(--serif);font-size:13px;resize:vertical;min-height:60px;margin-top:6px;';
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn btn-gold btn-xs'; saveBtn.textContent = 'Save'; saveBtn.style.marginTop = '6px';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-dark btn-xs'; cancelBtn.textContent = 'Cancel'; cancelBtn.style.marginTop = '6px';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;margin-top:4px;';
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

  cont.querySelector('.btn-prev')?.addEventListener('click', () =>
    openDetail(cont.querySelector('.btn-prev').dataset.id));
  cont.querySelector('.btn-next')?.addEventListener('click', () =>
    openDetail(cont.querySelector('.btn-next').dataset.id));

  // swipe between notes
  const modal = document.getElementById('detailModal');
  let sx = 0, sy = 0;
  modal.ontouchstart = e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; };
  modal.ontouchend   = e => {
    if (e.target.closest('.slider-root')) return;
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
  if (!note.musicUrl) { audio.pause(); audio.src=''; document.getElementById('musicBar').classList.remove('active'); return; }
  if (audio.src !== note.musicUrl) { audio.src = note.musicUrl; audio.volume = 0.6; }
  audio.play().catch(()=>{});
  document.getElementById('musicTitle').textContent = note.title || 'Playing…';
  document.getElementById('musicBar').classList.add('active');
}
document.getElementById('btnMPP').onclick = () => {
  if (audio.paused) { audio.play(); document.getElementById('musicBar').classList.remove('paused'); document.getElementById('btnMPP').textContent='⏸'; }
  else              { audio.pause(); document.getElementById('musicBar').classList.add('paused');    document.getElementById('btnMPP').textContent='▶'; }
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
  // detect URL: /u/:username → public diary, else auth
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
    // Someone opened a /u/:username link
    await enterPublicDiary(urlUsername);
  } else if (currentUser) {
    // Logged in, no specific URL — go to own diary
    await enterOwnDiary();
  } else {
    // No token, no URL — show auth screen
    showAuth();
  }
})();
