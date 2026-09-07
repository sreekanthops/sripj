/* ── app.js  v2  ─────────────────────────────────────────────────────────── */
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
let token        = sessionStorage.getItem('diary_token') || null;
let isAdmin      = false;
let notes        = [];
let editId       = null;
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

// ── OVERLAY ────────────────────────────────────────────────────────────────
function openOv(id)  { document.getElementById(id).classList.add('open'); }
function closeOv(id) { document.getElementById(id).classList.remove('open'); }

['detailOverlay','formOverlay','loginOverlay'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target === document.getElementById(id)) closeOv(id);
  });
});
document.getElementById('detailClose').onclick = () => closeOv('detailOverlay');
document.getElementById('formClose').onclick   = () => closeOv('formOverlay');
document.getElementById('loginClose').onclick  = () => closeOv('loginOverlay');

// ── AUTH ───────────────────────────────────────────────────────────────────
async function tryLogin() {
  const pwd = document.getElementById('loginPwd').value;
  try {
    const { token: t } = await api('POST', '/auth/login', { password: pwd });
    token = t;
    sessionStorage.setItem('diary_token', t);
    isAdmin = true;
    document.body.classList.add('is-admin');
    closeOv('loginOverlay');
    renderHeader(); renderGrid();
    toast('Welcome, Admin! 👋');
  } catch {
    toast('Wrong password ❌');
    document.getElementById('loginPwd').value = '';
    document.getElementById('loginPwd').focus();
  }
}
document.getElementById('loginBtn').onclick   = tryLogin;
document.getElementById('loginPwd').onkeydown = e => { if (e.key==='Enter') tryLogin(); };

async function verifyStoredToken() {
  if (!token) return;
  try {
    await api('GET', '/auth/verify');
    isAdmin = true;
    document.body.classList.add('is-admin');
  } catch {
    token = null;
    isAdmin = false;
    sessionStorage.removeItem('diary_token');
  }
}

// ── HEADER ─────────────────────────────────────────────────────────────────
function renderHeader() {
  const el = document.getElementById('headerActions');
  document.getElementById('musicField').style.display = isAdmin ? '' : 'none';
  document.getElementById('mediaField').style.display = isAdmin ? '' : 'none';

  if (isAdmin) {
    el.innerHTML = `
      <span class="admin-badge">✦ Admin</span>
      <button class="btn btn-primary btn-sm" data-action="new-note">+ New Entry</button>
      <button class="btn btn-ghost btn-sm" data-action="logout">Sign out</button>`;
  } else {
    el.innerHTML = `
      <button class="btn btn-ghost btn-sm" data-action="admin-login">Sign in</button>`;
  }
}

// scroll shadow on topbar
window.addEventListener('scroll', () => {
  document.getElementById('topbar')?.classList.toggle('scrolled', window.scrollY > 8);
}, { passive: true });

// single delegated listener on the header actions container (survives innerHTML replacement)
document.getElementById('headerActions').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'admin-login') {
    document.getElementById('loginPwd').value = '';
    openOv('loginOverlay');
    setTimeout(() => document.getElementById('loginPwd').focus(), 100);
  } else if (action === 'new-note') {
    openNewForm();
  } else if (action === 'logout') {
    token = null; isAdmin = false;
    sessionStorage.removeItem('diary_token');
    document.body.classList.remove('is-admin');
    renderHeader(); renderGrid(); toast('Logged out');
  }
});

// ── SWATCHES ───────────────────────────────────────────────────────────────
function buildSwatches(selIdx = 0) {
  const c = document.getElementById('swatches');
  c.innerHTML = '';
  PALETTE.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'swatch' + (i === selIdx ? ' active' : '');
    div.style.background = p.bg;
    div.style.borderColor = p.accent;
    div.dataset.i = i;
    div.onclick = () => {
      c.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
      div.classList.add('active');
    };
    c.appendChild(div);
  });
}
function activeCI() {
  const s = document.querySelector('#swatches .swatch.active');
  return s ? +s.dataset.i : 0;
}

// ── UPLOAD ZONE ────────────────────────────────────────────────────────────
function setupUploadZone() {
  pendingFiles = [];
  document.getElementById('uploadPreviews').innerHTML = '';
  document.getElementById('fFiles').value = '';
  const zone = document.getElementById('uploadZone');
  const inp  = document.getElementById('fFiles');
  inp.onchange = () => addFiles(Array.from(inp.files));
  zone.ondragover  = e => { e.preventDefault(); zone.classList.add('drag'); };
  zone.ondragleave = () => zone.classList.remove('drag');
  zone.ondrop      = e => {
    e.preventDefault(); zone.classList.remove('drag');
    addFiles(Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith('video/') || f.type.startsWith('image/')
    ));
  };
}
function addFiles(files) {
  files.forEach(f => {
    if (pendingFiles.find(x => x.name===f.name && x.size===f.size)) return;
    pendingFiles.push(f);
    const wrap = document.createElement('div');
    wrap.className = 'up-prev';
    const el = f.type.startsWith('video/') ? document.createElement('video') : document.createElement('img');
    el.src = URL.createObjectURL(f);
    if (el.tagName==='VIDEO') { el.muted=true; el.loop=true; el.autoplay=true; el.playsInline=true; }
    const del = document.createElement('button');
    del.className = 'up-prev-del'; del.textContent = '✕';
    del.onclick = () => { pendingFiles = pendingFiles.filter(x=>!(x.name===f.name&&x.size===f.size)); wrap.remove(); };
    wrap.append(el, del);
    document.getElementById('uploadPreviews').appendChild(wrap);
  });
}
function renderExistMedia(note) {
  const row = document.getElementById('existMediaRow');
  row.innerHTML = '';
  (note?.media||[]).forEach(m => {
    const wrap = document.createElement('div');
    wrap.className = 'exist-thumb';
    const el = isVid(m.mimetype) ? document.createElement('video') : document.createElement('img');
    el.src = m.url;
    if (el.tagName==='VIDEO') el.muted = true;
    const del = document.createElement('button');
    del.className = 'exist-thumb-del'; del.textContent = '✕';
    del.onclick = async () => {
      try { await api('DELETE', `/upload/${note.id}/${m.id}`); wrap.remove(); toast('Removed'); }
      catch (err) { toast('Error: ' + err.message); }
    };
    wrap.append(el, del); row.appendChild(wrap);
  });
}

// ── FORMS ──────────────────────────────────────────────────────────────────
function openNewForm() {
  editId = null;
  document.getElementById('formTitle').textContent = '✒ New Note';
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
  document.getElementById('formTitle').textContent = '✒ Edit Note';
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
  const musicUrl   = isAdmin ? document.getElementById('fMusic').value.trim() : '';
  if (!title && !body) { toast('Write something first ✍'); return; }
  const payload = { title: title||'Untitled', body, font, fontSize, fontWeight, colorIdx, musicUrl };
  try {
    let saved;
    if (editId) {
      saved = await api('PUT', `/notes/${editId}`, payload); toast('Note updated ✅');
    } else {
      saved = await api('POST', '/notes', payload); toast('Note saved 💾');
    }
    if (pendingFiles.length) {
      toast('Uploading…', 8000);
      await apiUpload(saved.id, pendingFiles);
      toast('Uploaded ✅');
    }
    closeOv('formOverlay'); await loadAndRender();
  } catch (err) { toast('Error: ' + err.message); }
};

// ── LOAD ───────────────────────────────────────────────────────────────────
async function loadNotes() {
  const from = document.getElementById('filterFrom').value;
  const to   = document.getElementById('filterTo').value;
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to)   p.set('to', to);
  notes = await api('GET', '/notes' + (p.toString() ? '?'+p : ''));
}
async function loadAndRender() {
  try { await loadNotes(); renderGrid(); }
  catch { document.getElementById('notesGrid').innerHTML =
    `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--ink4);font-family:var(--sans)">
      <div style="font-size:32px;margin-bottom:12px;color:var(--accent);opacity:.5">⚠</div>
      Could not connect to server. Run: <code>node server/index.js</code>
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
//  MEDIA SLIDER — complete rewrite
//  • swipe LEFT  → next slide
//  • swipe RIGHT → previous slide
//  • videos: portrait-aware, custom controls with play/pause/volume/fullscreen
// ══════════════════════════════════════════════════════════════════════════
function buildSlider(items, size, noteId) {
  if (!items || !items.length) return null;

  // root
  const root  = document.createElement('div');
  root.className = `slider-root sz-${size}`;

  // track
  const track = document.createElement('div');
  track.className = 'slider-track';
  root.appendChild(track);

  let cur = 0;
  const total = items.length;

  // build slides
  items.forEach((item, idx) => {
    const slide = document.createElement('div');
    slide.className = 'slide-item';

    if (isVid(item.mimetype)) {
      const v = document.createElement('video');
      v.src = item.url;
      v.loop = false;
      v.muted = (size === 'card');
      v.playsInline = true;
      v.preload = 'metadata';
      if (size === 'card') { v.autoplay = true; v.loop = true; }

      // detect orientation once metadata loads
      v.addEventListener('loadedmetadata', () => {
        if (v.videoWidth > v.videoHeight) v.classList.add('is-landscape');
      });

      slide.appendChild(v);

      // custom controls (detail only)
      if (size === 'detail') {
        const ctrl = buildVideoControls(v, item, noteId);
        slide.appendChild(ctrl);

        // tap to show/hide controls on mobile
        slide.addEventListener('click', e => {
          if (e.target.closest('.vid-controls')) return;
          slide.classList.toggle('show-ctrl');
        });
      }

    } else {
      const img = document.createElement('img');
      img.src = item.url;
      img.alt = '';
      img.loading = idx === 0 ? 'eager' : 'lazy';
      img.draggable = false;
      slide.appendChild(img);
    }

    // per-slide admin delete (detail only)
    if (size === 'detail' && item.id && noteId) {
      const del = document.createElement('button');
      del.className = 'slide-del';
      del.textContent = '🗑 Remove';
      del.dataset.mid = item.id;
      del.dataset.nid = noteId;
      slide.appendChild(del);
    }

    track.appendChild(slide);
  });

  // ── controls (multi-slide only) ──────────────────────────────────────────
  let prevBtn, nextBtn, dotsWrap, counter;

  if (total > 1) {
    prevBtn = document.createElement('button');
    prevBtn.className = 'sl-arrow prev';
    prevBtn.innerHTML = '&#8249;';
    prevBtn.setAttribute('aria-label','Previous');

    nextBtn = document.createElement('button');
    nextBtn.className = 'sl-arrow next';
    nextBtn.innerHTML = '&#8250;';
    nextBtn.setAttribute('aria-label','Next');

    dotsWrap = document.createElement('div');
    dotsWrap.className = 'sl-dots';
    items.forEach((_, i) => {
      const d = document.createElement('button');
      d.className = 'sl-dot' + (i===0 ? ' active' : '');
      d.onclick = e => { e.stopPropagation(); goTo(i); };
      dotsWrap.appendChild(d);
    });

    counter = document.createElement('div');
    counter.className = 'sl-counter';

    root.append(prevBtn, nextBtn, dotsWrap, counter);
  }

  // ── goTo ─────────────────────────────────────────────────────────────────
  function goTo(n) {
    const prev = cur;
    cur = ((n % total) + total) % total;
    track.style.transform = `translateX(-${cur * 100}%)`;

    // pause prev video, play new if detail
    const slides = track.querySelectorAll('.slide-item');
    slides.forEach((sl, i) => {
      const v = sl.querySelector('video');
      if (!v) return;
      if (i === cur && size === 'detail') {
        v.play().catch(() => {});
      } else {
        v.pause();
        if (size === 'card') { v.currentTime = 0; v.play().catch(() => {}); }
      }
    });

    if (total > 1) {
      dotsWrap.querySelectorAll('.sl-dot').forEach((d, i) => d.classList.toggle('active', i===cur));
      counter.textContent = `${cur+1} / ${total}`;
    }
  }

  if (total > 1) {
    // ← prev,  → next  (matching natural swipe: swipe left = next)
    prevBtn.onclick = e => { e.stopPropagation(); goTo(cur - 1); };
    nextBtn.onclick = e => { e.stopPropagation(); goTo(cur + 1); };
  }

  // ── Touch swipe (LEFT = next, RIGHT = prev) ───────────────────────────────
  let touchX = 0, touchY = 0, dragging = false;

  root.addEventListener('touchstart', e => {
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
    dragging = false;
    track.classList.add('no-anim');
  }, { passive: true });

  root.addEventListener('touchmove', e => {
    if (!total || total <= 1) return;
    const dx = e.touches[0].clientX - touchX;
    const dy = e.touches[0].clientY - touchY;
    if (!dragging && Math.abs(dy) > Math.abs(dx)) return; // vertical scroll
    dragging = true;
    const offset = -(cur * 100) + (dx / root.offsetWidth * 100);
    track.style.transform = `translateX(${offset}%)`;
  }, { passive: true });

  root.addEventListener('touchend', e => {
    track.classList.remove('no-anim');
    if (!dragging || total <= 1) { dragging = false; return; }
    const dx = e.changedTouches[0].clientX - touchX;
    dragging = false;
    if (Math.abs(dx) > 44) {
      // swipe LEFT (dx<0) → go NEXT, swipe RIGHT (dx>0) → go PREV
      goTo(dx < 0 ? cur + 1 : cur - 1);
    } else {
      goTo(cur); // snap back
    }
  }, { passive: true });

  goTo(0);
  return root;
}

// ── Custom video controls builder ─────────────────────────────────────────
function buildVideoControls(v, item, noteId) {
  const ctrl = document.createElement('div');
  ctrl.className = 'vid-controls';

  // progress
  const prog = document.createElement('input');
  prog.type = 'range'; prog.className = 'vid-progress';
  prog.min = 0; prog.max = 100; prog.value = 0; prog.step = 0.1;

  // bottom bar
  const bar = document.createElement('div');
  bar.className = 'vid-bar';

  // play/pause
  const btnPP = document.createElement('button');
  btnPP.className = 'vid-btn'; btnPP.innerHTML = '▶'; btnPP.title = 'Play / Pause';

  // time
  const time = document.createElement('span');
  time.className = 'vid-time'; time.textContent = '0:00 / 0:00';

  // spacer
  const spacer = document.createElement('span');
  spacer.className = 'vid-spacer';

  // volume
  const vol = document.createElement('input');
  vol.type = 'range'; vol.className = 'vid-vol';
  vol.min = 0; vol.max = 1; vol.step = 0.05; vol.value = 0.8;

  // mute
  const btnMute = document.createElement('button');
  btnMute.className = 'vid-btn'; btnMute.innerHTML = '🔊'; btnMute.title = 'Mute';

  // fullscreen
  const btnFS = document.createElement('button');
  btnFS.className = 'vid-btn vid-fullscreen'; btnFS.innerHTML = '⛶'; btnFS.title = 'Fullscreen';

  bar.append(btnPP, time, spacer, vol, btnMute, btnFS);
  ctrl.append(prog, bar);

  // ── wire up ──────────────────────────────────────────────────────────────
  v.volume = 0.8;

  // play/pause
  btnPP.onclick = e => {
    e.stopPropagation();
    v.paused ? v.play() : v.pause();
  };
  v.addEventListener('play',  () => { btnPP.innerHTML = '⏸'; });
  v.addEventListener('pause', () => { btnPP.innerHTML = '▶'; });
  v.addEventListener('ended', () => { btnPP.innerHTML = '▶'; });

  // time update
  v.addEventListener('timeupdate', () => {
    if (!isFinite(v.duration)) return;
    prog.value = (v.currentTime / v.duration) * 100;
    time.textContent = `${fmtDur(v.currentTime)} / ${fmtDur(v.duration)}`;
  });
  v.addEventListener('loadedmetadata', () => {
    time.textContent = `0:00 / ${fmtDur(v.duration)}`;
  });

  // seek
  prog.addEventListener('input', e => {
    e.stopPropagation();
    v.currentTime = (prog.value / 100) * v.duration;
  });

  // volume
  vol.addEventListener('input', e => {
    e.stopPropagation();
    v.volume = parseFloat(vol.value);
    v.muted  = false;
    btnMute.innerHTML = '🔊';
  });

  // mute
  btnMute.onclick = e => {
    e.stopPropagation();
    v.muted = !v.muted;
    btnMute.innerHTML = v.muted ? '🔇' : '🔊';
  };

  // fullscreen
  btnFS.onclick = e => {
    e.stopPropagation();
    const target = v.closest('.slide-item') || v;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (target.requestFullscreen) {
      target.requestFullscreen().catch(() => {});
    } else if (v.webkitEnterFullscreen) {
      v.webkitEnterFullscreen(); // iOS
    }
  };
  document.addEventListener('fullscreenchange', () => {
    btnFS.innerHTML = document.fullscreenElement ? '✕' : '⛶';
  });

  return ctrl;
}

// ══════════════════════════════════════════════════════════════════════════
//  GRID
// ══════════════════════════════════════════════════════════════════════════
function renderGrid() {
  const grid = document.getElementById('notesGrid');
  document.getElementById('swipeHint').textContent =
    notes.length > 1 ? '← swipe to navigate ←' : '';
  const countEl = document.getElementById('noteCount');
  if (countEl) countEl.textContent = notes.length ? `${notes.length} entr${notes.length===1?'y':'ies'}` : '';

  if (!notes.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:70px 20px;color:var(--ink4);font-family:var(--sans)">
        <div style="font-size:36px;margin-bottom:12px;color:var(--accent);opacity:.5">✦</div>
        ${isAdmin ? 'Tap <b style="color:var(--accent)">+ New Entry</b> to write your first entry.'
                  : 'No diary entries yet — check back soon.'}
      </div>`;
    return;
  }

  // skeleton → real
  grid.innerHTML = notes.map(() => '<div class="skeleton"></div>').join('');
  requestAnimationFrame(() => {
    grid.innerHTML = '';
    notes.forEach(n => {
      const p    = PALETTE[n.colorIdx || 0];
      const card = document.createElement('article');
      card.className = 'note-card fade-enter';
      card.dataset.id = n.id;
      card.style.setProperty('--card-accent', p.accent);

      // no edit/del on cards — admin controls are inside the note detail only

      // media slider (card size)
      if (n.media && n.media.length) {
        const mediaWrap = document.createElement('div');
        mediaWrap.className = 'card-media';
        const sl = buildSlider(n.media, 'card', n.id);
        if (sl) mediaWrap.appendChild(sl);
        card.appendChild(mediaWrap);
      }

      // body section
      const body = document.createElement('div');
      body.className = 'card-body-section';
      body.innerHTML = `
        <div class="card-meta-row">
          <span class="card-date">📅 ${fmtDate(n.createdAt)}</span>
          ${isAdmin ? `<span class="card-views">👁 ${n.views}</span>` : ''}
        </div>
        <div class="card-title" style="font-family:${esc(n.font)};color:${p.accent}">${esc(n.title)}</div>
        ${!n.media?.length ? `<div class="card-excerpt" style="font-family:${esc(n.font)};font-size:${Math.min(n.fontSize||14,13)}px">${esc(n.body)}</div>` : ''}`;
      card.appendChild(body);

      // footer
      const reacts = Object.entries(n.reactions||{}).filter(([,v])=>v>0)
        .map(([e,c]) => `<span class="react-chip">${e} ${c}</span>`).join('') ||
        `<span style="font-size:11px;color:var(--ink4);font-family:var(--sans)">No reactions</span>`;

      const chips = [
        n.musicUrl ? `<span class="chip">♫ Music</span>` : '',
        n.media?.length ? `<span class="chip">🎬 ${n.media.length}</span>` : '',
        (n.replies||[]).length ? `<span class="chip">💬 ${n.replies.length}</span>` : '',
      ].filter(Boolean).join('');

      const foot = document.createElement('div');
      foot.className = 'card-footer';
      foot.innerHTML = `
        <div class="card-reactions">${reacts}</div>
        <div class="card-chips">${chips}</div>`;
      card.appendChild(foot);

      grid.appendChild(card);
    });

    // events
    grid.querySelectorAll('.note-card').forEach(card => {
      card.onclick = e => {
        if (e.target.closest('.slider-root')) return;
        openDetail(card.dataset.id);
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
    renderGrid();
    renderDetail(note);
    playMusic(note);
  } catch (err) {
    document.getElementById('detailContent').innerHTML =
      `<p style="color:var(--red);font-family:var(--sans)">Error: ${esc(err.message)}</p>`;
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
    .map(([e,c]) => `<span class="rcnt">${e} <b>${c}</b></span>`).join('') ||
    `<span style="color:var(--ink4);font-size:12px;font-family:var(--sans)">Be the first to react!</span>`;

  const repliesHtml = (note.replies||[]).map(r => `
    <div class="reply-item" data-rid="${r.id}">
      <div class="reply-author">
        <span>👤 ${esc(r.name||'Anonymous')}</span>
        <small>${fmtDate(r.createdAt)} ${fmtTime(r.createdAt)}</small>
      </div>
      <div class="reply-text" id="rtxt-${r.id}">${esc(r.text)}</div>
      ${isAdmin ? `
      <div class="reply-admin-btns">
        <button class="btn btn-dark btn-xs btn-redit" data-nid="${note.id}" data-rid="${r.id}">✏️ Edit</button>
        <button class="btn btn-red  btn-xs btn-rdel"  data-nid="${note.id}" data-rid="${r.id}">🗑 Del</button>
      </div>` : ''}
    </div>`).join('') ||
    `<p style="color:var(--ink4);font-size:12px;font-style:italic;font-family:var(--sans)">No replies yet.</p>`;

  const cont = document.getElementById('detailContent');
  cont.className = 'fade-enter';
  cont.innerHTML = `
    <div class="detail-header">
      <h2 class="detail-title" style="font-family:${esc(note.font)};color:${p.accent}">${esc(note.title)}</h2>
    </div>
    <div class="detail-meta">
      <span>📅 ${fmtDate(note.createdAt)} · ${fmtTime(note.createdAt)}</span>
      ${isAdmin ? `<span>👁 ${note.views} views</span>` : ''}
      ${note.editedAt ? `<span>✏️ Edited ${fmtDate(note.editedAt)}</span>` : ''}
      <span>💬 ${(note.replies||[]).length} ${(note.replies||[]).length===1?'reply':'replies'}</span>
    </div>
    ${note.musicUrl ? `<div style="font-size:12px;color:var(--accent);margin-bottom:12px;font-style:italic;font-family:var(--sans)">♫ Background music is playing</div>` : ''}
    <div id="mediaMount" style="margin-bottom:${note.media?.length?'18px':'0'}"></div>
    <div class="detail-body" style="font-family:${esc(note.font)};font-size:${note.fontSize||14}px;${fsCss};border-left-color:${p.accent}">${esc(note.body)}</div>
    <hr class="sep">
    <div class="section-label">React</div>
    <div class="emoji-grid">${EMOJIS.map(e=>`<button class="emoji-btn btn-react" data-em="${e}" data-id="${note.id}">${e}</button>`).join('')}</div>
    <div class="react-display" id="rdisplay">${reactHtml}</div>
    <hr class="sep">
    <div class="section-label">💬 Replies (${(note.replies||[]).length})</div>
    <div class="reply-list" id="replyList">${repliesHtml}</div>
    <div class="reply-form">
      <input type="text" id="rName" placeholder="Your name (optional)">
      <textarea id="rText" placeholder="Share your thoughts or feelings…"></textarea>
      <button class="btn btn-gold btn-sm btn-rpost" data-id="${note.id}" style="align-self:flex-end">Post Reply</button>
    </div>
    <div class="swipe-nav">
      ${prevId ? `<button class="btn btn-dark btn-sm btn-prev" data-id="${prevId}">← Prev</button>` : '<span></span>'}
      ${nextId ? `<button class="btn btn-dark btn-sm btn-next" data-id="${nextId}">Next →</button>` : '<span></span>'}
    </div>
    ${isAdmin ? `
    <div class="admin-note-bar">
      <span class="admin-bar-label">Admin</span>
      <button class="btn btn-ghost btn-sm btn-dedit" data-id="${note.id}">✏️ Edit Post</button>
      <button class="btn btn-red   btn-sm btn-ddel"  data-id="${note.id}">🗑 Delete Post</button>
    </div>` : ''}`;

  // inject media slider (detail size)
  if (note.media?.length) {
    const sl = buildSlider(note.media, 'detail', note.id);
    if (sl) document.getElementById('mediaMount').appendChild(sl);
  }

  // ── events ────────────────────────────────────────────────────────────────
  cont.querySelector('.btn-dedit')?.addEventListener('click', () => {
    closeOv('detailOverlay'); openEditForm(note);
  });
  cont.querySelector('.btn-ddel')?.addEventListener('click', async () => {
    if (!confirm('Delete this note permanently?')) return;
    try {
      await api('DELETE', `/notes/${note.id}`);
      closeOv('detailOverlay'); toast('Deleted 🗑'); await loadAndRender();
    } catch (err) { toast('Error: ' + err.message); }
  });

  // per-slide delete
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
        const reactions = await api('POST', `/notes/${btn.dataset.id}/react`, { emoji: btn.dataset.em });
        document.getElementById('rdisplay').innerHTML =
          Object.entries(reactions).filter(([,v])=>v>0)
            .map(([e,c])=>`<span class="rcnt">${e} <b>${c}</b></span>`).join('');
        const n = notes.find(x => x.id === btn.dataset.id);
        if (n) { n.reactions = reactions; renderGrid(); }
        toast('Reacted ' + btn.dataset.em);
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
      // swap text div for textarea
      txtEl.style.display = 'none';
      const ta = document.createElement('textarea');
      ta.className = 'reply-edit-ta';
      ta.value = cur;
      ta.style.cssText = 'width:100%;padding:7px 10px;border:1px solid var(--border2);border-radius:8px;background:var(--bg);color:var(--ink);font-family:var(--serif);font-size:13px;resize:vertical;min-height:60px;margin-top:6px;';
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn btn-gold btn-xs';
      saveBtn.textContent = 'Save';
      saveBtn.style.marginTop = '6px';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-dark btn-xs';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.marginTop = '6px';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;margin-top:4px;';
      row.append(saveBtn, cancelBtn);
      item.append(ta, row);
      ta.focus();

      cancelBtn.onclick = () => {
        ta.remove(); row.remove(); txtEl.style.display = '';
      };
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
    const name = document.getElementById('rName').value.trim() || 'Anonymous';
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

  // swipe between notes (horizontal, outside slider)
  const modal = document.getElementById('detailModal');
  let sx = 0, sy = 0;
  modal.ontouchstart = e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; };
  modal.ontouchend   = e => {
    if (e.target.closest('.slider-root')) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 48) {
      // swipe LEFT → next note, swipe RIGHT → prev note
      if (dx < 0 && nextId) openDetail(nextId);
      else if (dx > 0 && prevId) openDetail(prevId);
    }
  };
}

// ── MUSIC ──────────────────────────────────────────────────────────────────
function playMusic(note) {
  if (!note.musicUrl) return;
  if (audio.src !== note.musicUrl) {
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
  document.getElementById('btnMute').textContent = audio.muted ? '✕' : '♪';
};
document.getElementById('musicVol').oninput = e => {
  audio.volume = parseFloat(e.target.value);
  audio.muted  = false;
  document.getElementById('btnMute').textContent = '♪';
};

// ── INIT ───────────────────────────────────────────────────────────────────
(async () => {
  await verifyStoredToken();
  renderHeader();
  buildSwatches(0);
  setupUploadZone();
  await loadAndRender();
})();
