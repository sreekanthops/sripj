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
async function api(method, path, body, customHeaders = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...customHeaders } };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body)  opts.body = JSON.stringify(body);
  const res  = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.limitReached = !!data.limitReached;
    err.isProtected = !!data.isProtected;
    err.status = res.status;
    err.user = data.user;
    throw err;
  }
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

['detailOverlay','formOverlay','profileOverlay','upgradeOverlay','libraryOverlay','shareOverlay'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', e => {
    if (e.target === document.getElementById(id)) closeOv(id);
  });
});
document.getElementById('detailClose')?.addEventListener('click', () => closeOv('detailOverlay'));
document.getElementById('formClose')?.addEventListener('click', () => closeOv('formOverlay'));
document.getElementById('profileClose')?.addEventListener('click', () => closeOv('profileOverlay'));
document.getElementById('upgradeClose')?.addEventListener('click', () => closeOv('upgradeOverlay'));
document.getElementById('libraryClose')?.addEventListener('click', () => closeOv('libraryOverlay'));
document.getElementById('shareClose')?.addEventListener('click', () => closeOv('shareOverlay'));

// Refresh upgrade overlay prices from live API when it opens
;(function() {
  const orig = openOv;
  window._upgradeOverlayPricesLoaded = false;
  // Patch openOv to refresh prices on first open of upgradeOverlay
  window._refreshUpgradePrices = async function() {
    if (window._upgradeOverlayPricesLoaded) return;
    try {
      const data = await fetch('/api/payments/plans').then(r => r.json());
      (data.plans || []).forEach(p => {
        const el = document.getElementById('upg-price-' + p.id);
        if (!el) return;
        const price = p.discountActive ? p.effectivePriceInr : p.price_inr;
        if (!price) return;
        const periodSuffix = { monthly:'/mo', yearly:'/yr', lifetime:' once' };
        el.innerHTML = '\u20b9' + price.toLocaleString('en-IN') + '<span>' + (periodSuffix[p.id]||'') + '</span>';
        if (p.discountActive && p.discount_label) {
          el.title = p.discount_label + ' \u2014 ' + p.discount_pct + '% off';
        }
      });
      window._upgradeOverlayPricesLoaded = true;
    } catch {}
  };
})();

// ── IMAGE LIBRARY PICKER ───────────────────────────────────────────────────
// Opens from the Canvas panel; places chosen images directly as canvas stickers.
// _libraryOnConfirm is set by whoever opens the picker (currently initStickers).
let _libraryImages   = null;   // cached after first fetch
let _librarySelected = new Set();
let _libraryOnConfirm = null;  // callback(selectedImages[])

async function openLibraryPicker(onConfirm) {
  _libraryOnConfirm = onConfirm || null;
  _librarySelected.clear();
  document.getElementById('librarySelCount').textContent = '';
  openOv('libraryOverlay');

  if (!_libraryImages) {
    document.getElementById('libraryGrid').innerHTML =
      '<div class="lib-loading">Loading library…</div>';
    try {
      const data = await fetch('/api/global-images').then(r => r.json());
      _libraryImages = data.images || [];
    } catch {
      document.getElementById('libraryGrid').innerHTML =
        '<div class="lib-loading">Could not load library.</div>';
      return;
    }
  }

  renderLibraryGrid();
}

function renderLibraryGrid() {
  const grid = document.getElementById('libraryGrid');
  if (!_libraryImages || !_libraryImages.length) {
    grid.innerHTML = '<div class="lib-loading">The admin has not added any images yet.</div>';
    return;
  }
  grid.innerHTML = '';
  _libraryImages.forEach(img => {
    const thumb = document.createElement('div');
    thumb.className = 'lib-thumb' + (_librarySelected.has(img.id) ? ' selected' : '');
    thumb.innerHTML = `
      <img src="${img.url}" alt="${esc(img.label)}" loading="lazy">
      <div class="lib-check">✓</div>
      ${img.label ? `<div class="lib-label">${esc(img.label)}</div>` : ''}
    `;
    thumb.onclick = () => {
      if (_librarySelected.has(img.id)) _librarySelected.delete(img.id);
      else                               _librarySelected.add(img.id);
      thumb.classList.toggle('selected', _librarySelected.has(img.id));
      updateLibrarySelBar();
    };
    grid.appendChild(thumb);
  });
  updateLibrarySelBar();
}

function updateLibrarySelBar() {
  const count = _librarySelected.size;
  document.getElementById('librarySelCount').textContent =
    count ? count + ' image' + (count !== 1 ? 's' : '') + ' selected' : '';
}

document.getElementById('libraryCancelSel').onclick = () => {
  _librarySelected.clear();
  renderLibraryGrid();
};

document.getElementById('libraryAddBtn').onclick = () => {
  if (!_librarySelected.size) return;
  const chosen = (_libraryImages || []).filter(img => _librarySelected.has(img.id));
  closeOv('libraryOverlay');
  if (_libraryOnConfirm) _libraryOnConfirm(chosen);
};

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
      <button class="btn btn-ghost btn-sm" data-action="go-home">My Stories</button>`;
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
    openShareModal();
  } else if (action === 'profile') {
    document.getElementById('profName').value = currentUser.displayName || '';
    document.getElementById('profBio').value  = currentUser.bio || '';
    openOv('profileOverlay');
  } else if (action === 'logout') {
    token = null; currentUser = null; isOwner = false; viewingUser = null;
    localStorage.removeItem('diary_token');
    document.body.classList.remove('is-owner');
    window._chatbotSetOwner?.(false);
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

// ── SHARE MODAL LOGIC ──────────────────────────────────────────────────────
async function openShareModal() {
  if (!currentUser) return;
  const url = `${location.origin}/u/${currentUser.username}`;
  const urlInput = document.getElementById('shareUrlInput');
  if (urlInput) urlInput.value = url;

  // Fetch current share protection status
  try {
    const data = await api('GET', '/auth/share-settings');
    const isProt = !!data.shareProtected;
    setShareOptionUI(isProt);
  } catch {
    setShareOptionUI(false);
  }

  const passInput = document.getElementById('sharePassInput');
  if (passInput) passInput.value = '';
  openOv('shareOverlay');
}

function setShareOptionUI(isProtected) {
  const noPassCard = document.getElementById('optNoPassCard');
  const passCard   = document.getElementById('optPassCard');
  const noPassRadio= document.getElementById('optNoPass');
  const passRadio  = document.getElementById('optPass');
  const passWrap   = document.getElementById('sharePassWrap');

  if (isProtected) {
    if (passRadio) passRadio.checked = true;
    passCard?.classList.add('active');
    noPassCard?.classList.remove('active');
    passWrap?.classList.remove('hidden');
  } else {
    if (noPassRadio) noPassRadio.checked = true;
    noPassCard?.classList.add('active');
    passCard?.classList.remove('active');
    passWrap?.classList.add('hidden');
  }
}

// Share modal radio toggles
document.getElementById('optNoPassCard')?.addEventListener('click', () => setShareOptionUI(false));
document.getElementById('optPassCard')?.addEventListener('click', () => setShareOptionUI(true));

// Copy link button inside share modal
document.getElementById('btnCopyShareLink')?.addEventListener('click', () => {
  const url = document.getElementById('shareUrlInput').value;
  navigator.clipboard?.writeText(url)
    .then(() => toast('Link copied! 🔗'))
    .catch(() => toast(url));
});

// Save & Copy Link button
document.getElementById('btnSaveShareSettings')?.addEventListener('click', async () => {
  const isProtected = document.getElementById('optPass')?.checked;
  const password = document.getElementById('sharePassInput')?.value || '';

  if (isProtected && !password) {
    // If setting protected for the first time, check if password entered
    try {
      const curr = await api('GET', '/auth/share-settings');
      if (!curr.hasPassword && !password) {
        toast('Please enter a password for protection 🔒');
        document.getElementById('sharePassInput')?.focus();
        return;
      }
    } catch {
      toast('Please enter a password');
      return;
    }
  }

  try {
    await api('PUT', '/auth/share-settings', { isProtected, password });
    const url = `${location.origin}/u/${currentUser.username}`;
    await navigator.clipboard?.writeText(url).catch(() => {});
    closeOv('shareOverlay');
    toast(isProtected ? 'Password set & link copied! 🔒🔗' : 'Public link copied! 🌐🔗');
  } catch (e) {
    toast('Error: ' + e.message);
  }
});

// ── ENTERING DIARIES ────────────────────────────────────────────────────────
async function enterOwnDiary() {
  isOwner = true;
  viewingUser = { id: currentUser.userId, username: currentUser.username, displayName: currentUser.displayName };
  document.body.classList.add('is-owner');
  document.getElementById('sidebarTitle').textContent = currentUser.displayName || currentUser.username;
  document.getElementById('sidebarSub').textContent   = '@' + currentUser.username;
  document.getElementById('pageTitle').innerHTML       = '<span class="brand-unsent">Unsent</span> <span class="brand-stories">Stories</span>';
  document.getElementById('pageTitleCaption').textContent = 'write · reflect · remember';
  history.replaceState({}, '', '/u/' + currentUser.username);
  renderHeader();
  buildSwatches(0);
  setupUploadZone();
  showApp();
  window._stickerSetOwner?.(true);
  window._stickerLoad?.(currentUser.username);
  window._chatbotSetOwner?.(true);
  await loadAndRender();
}

let currentEnteredPassword = '';

async function enterPublicDiary(username, password = '') {
  try {
    const headers = {};
    const passToUse = password || currentEnteredPassword;
    if (passToUse) {
      headers['x-share-password'] = passToUse;
    }
    const data = await api('GET', `/notes/user/${username}`, null, headers);
    if (passToUse) currentEnteredPassword = passToUse;
    closeOv('passOverlay');
    viewingUser = data.user;
    isOwner = currentUser?.userId === viewingUser.id;
    if (isOwner) document.body.classList.add('is-owner');
    else         document.body.classList.remove('is-owner');
    notes = data.notes;
    document.getElementById('sidebarTitle').textContent = viewingUser.displayName || viewingUser.username;
    document.getElementById('sidebarSub').textContent   = '@' + viewingUser.username;
    if (isOwner) {
      document.getElementById('pageTitle').innerHTML = '<span class="brand-unsent">Unsent</span><span class="brand-divider">♡</span><span class="brand-stories">Stories</span>';
    } else {
      document.getElementById('pageTitle').textContent = (viewingUser.displayName || viewingUser.username) + "'s Stories";
    }
    document.getElementById('pageTitleCaption').textContent = '';
    renderHeader();
    buildSwatches(0);
    setupUploadZone();
    showApp();
    window._stickerSetOwner?.(isOwner);
    window._stickerLoad?.(viewingUser.username, currentEnteredPassword);
    renderGrid();
  } catch (err) {
    if (err.isProtected) {
      showApp(); // Show container
      promptDiaryPassword(username, err.user);
      return;
    }
    if (!currentUser) { showAuth(); } else { toast('Stories not found'); await enterOwnDiary(); }
  }
}

function promptDiaryPassword(username, userObj) {
  const modalTitle = document.getElementById('passModalTitle');
  const modalSub   = document.getElementById('passModalSub');
  const passInput  = document.getElementById('diaryUnlockPass');
  const errEl      = document.getElementById('passErr');

  if (modalTitle) {
    const name = userObj?.displayName || username;
    modalTitle.textContent = `${name}'s Diary is Locked`;
  }
  if (errEl) errEl.textContent = '';
  if (passInput) passInput.value = '';

  const unlockBtn = document.getElementById('btnUnlockDiary');
  if (unlockBtn) {
    unlockBtn.onclick = async () => {
      const pwd = passInput.value.trim();
      if (!pwd) {
        if (errEl) errEl.textContent = 'Please enter password';
        return;
      }
      try {
        await enterPublicDiary(username, pwd);
      } catch {
        if (errEl) errEl.textContent = 'Incorrect password, please try again';
      }
    };
  }

  if (passInput) {
    passInput.onkeydown = e => {
      if (e.key === 'Enter') unlockBtn.click();
    };
  }

  openOv('passOverlay');
  setTimeout(() => passInput?.focus(), 150);
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
      applyBodyPreview();
    };
    c.appendChild(s);
  });
}
function activeCI() {
  const a = document.querySelector('.swatch.active');
  return a ? parseInt(a.dataset.ci) : 0;
}

// ── LIVE PREVIEW — applies current style controls to the textarea ──────────
function applyBodyPreview() {
  const ta     = document.getElementById('fBody');
  const font   = document.getElementById('fFont').value;
  const size   = parseInt(document.getElementById('fSize').value) || 14;
  const weight = document.getElementById('fWeight').value;
  const p      = PALETTE[activeCI()] || PALETTE[0];

  ta.style.fontFamily  = font;
  ta.style.fontSize    = size + 'px';
  ta.style.fontWeight  = weight === 'bold' || weight === 'bold italic' ? 'bold'   : 'normal';
  ta.style.fontStyle   = weight === 'italic' || weight === 'bold italic' ? 'italic' : 'normal';
  ta.style.borderLeftColor = p.accent;
  ta.style.borderLeftWidth = '3px';
  ta.style.borderLeftStyle = 'solid';
}

// Wire live preview to all style controls (called once at page load)
;(function wirePreviewControls() {
  ['fFont', 'fSize', 'fWeight'].forEach(id => {
    document.getElementById(id).addEventListener('input',  applyBodyPreview);
    document.getElementById(id).addEventListener('change', applyBodyPreview);
  });
})();

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
  applyBodyPreview();
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
  applyBodyPreview();
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
  } catch (err) {
    if (err.limitReached) {
      closeOv('formOverlay');
      openOv('upgradeOverlay');
      window._refreshUpgradePrices?.();
    } else {
      toast('Error: ' + err.message);
    }
  }
};

// ── AI WRITE ───────────────────────────────────────────────────────────────
let aiWordCount = 80;
let aiMode = 'append'; // 'append' | 'replace'

// Preset buttons
document.getElementById('aiWordPresets').addEventListener('click', e => {
  const btn = e.target.closest('.ai-preset');
  if (!btn) return;
  aiWordCount = parseInt(btn.dataset.w, 10);
  document.getElementById('aiWordCount').value = aiWordCount;
  document.querySelectorAll('.ai-preset').forEach(b => b.removeAttribute('data-active'));
  btn.setAttribute('data-active', 'true');
});

document.getElementById('aiWordCount').addEventListener('change', e => {
  aiWordCount = Math.min(400, Math.max(20, parseInt(e.target.value, 10) || 80));
  e.target.value = aiWordCount;
  document.querySelectorAll('.ai-preset').forEach(b => {
    if (parseInt(b.dataset.w, 10) === aiWordCount) b.setAttribute('data-active', 'true');
    else b.removeAttribute('data-active');
  });
});

// Mode toggle
document.getElementById('aiModeAppend').onclick = () => {
  aiMode = 'append';
  document.getElementById('aiModeAppend').classList.add('active');
  document.getElementById('aiModeReplace').classList.remove('active');
};
document.getElementById('aiModeReplace').onclick = () => {
  aiMode = 'replace';
  document.getElementById('aiModeReplace').classList.add('active');
  document.getElementById('aiModeAppend').classList.remove('active');
};

// AI Write button
document.getElementById('aiWriteBtn').onclick = async () => {
  const bodyEl  = document.getElementById('fBody');
  const errEl   = document.getElementById('aiError');
  const btn     = document.getElementById('aiWriteBtn');
  const label   = document.getElementById('aiWriteLabel');
  const seed    = bodyEl.value.trim();

  errEl.classList.add('hidden');
  errEl.textContent = '';

  if (!seed) {
    errEl.textContent = 'Write a few words first — the AI will expand on what you\'ve started.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  label.textContent = 'Writing…';
  btn.classList.add('loading');

  try {
    const { result } = await api('POST', '/ai/expand', { text: seed, words: aiWordCount });
    if (aiMode === 'replace') {
      bodyEl.value = result;
    } else {
      bodyEl.value = bodyEl.value.trimEnd() + '\n\n' + result;
    }
    bodyEl.scrollTop = bodyEl.scrollHeight;
  } catch (err) {
    errEl.textContent = '✦ AI failed: ' + err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    label.textContent = 'AI Write';
    btn.classList.remove('loading');
  }
};

// ── REPHRASE ───────────────────────────────────────────────────────────────
document.getElementById('rephraseBtn').onclick = async () => {
  const bodyEl  = document.getElementById('fBody');
  const hintEl  = document.getElementById('rephraseHint');
  const btn     = document.getElementById('rephraseBtn');
  const text    = bodyEl.value.trim();
  if (!text) { toast('Write something first ✍'); return; }
  btn.disabled  = true;
  hintEl.textContent = 'Rephrasing…';
  try {
    const { rephrased } = await api('POST', '/rephrase', { text });
    bodyEl.value = rephrased;
    hintEl.textContent = 'Grammar corrected ✓';
    setTimeout(() => { hintEl.textContent = ''; }, 3000);
  } catch (err) {
    hintEl.textContent = '';
    toast('Rephrase failed: ' + err.message);
  } finally {
    btn.disabled = false;
  }
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
  // pinned always float to the very top regardless of sort
  list = [...list.filter(n => n.pinned), ...list.filter(n => !n.pinned)];
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
  if (n.pinned) card.classList.add('is-pinned');

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
      <span class="card-num">${n.pinned ? '<span class="pin-badge">📌 Pinned</span>' : numStr}</span>
    </div>
    <div class="card-title">${esc(n.title)}</div>
    ${!n.media?.length && n.body
      ? `<div class="card-excerpt" style="font-family:${esc(n.font||'Georgia,serif')}">${esc(n.body)}</div>`
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
        <button class="btn btn-ghost btn-sm btn-dedit" data-id="${note.id}">✏️ Edit</button>
        <button class="btn btn-pin   btn-sm btn-dpin"  data-id="${note.id}" data-pinned="${note.pinned?'1':'0'}">${note.pinned ? '📌 Unpin' : '📌 Pin'}</button>
        <button class="btn btn-red   btn-sm btn-ddel"  data-id="${note.id}">🗑 Delete</button>
      </div>` : ''}
    </div>`;

  // mount media slider into cover area
  if (note.media?.length) {
    const sl = buildSlider(note.media, 'detail', note.id);
    const mount = document.getElementById('tdMediaMount');
    if (sl && mount) mount.appendChild(sl);
  }

  // ── events ──────────────────────────────────────────────────────────────
  cont.querySelector('.btn-dedit')?.addEventListener('click', e => {
    e.stopPropagation();
    closeOv('detailOverlay'); openEditForm(note);
  });
  cont.querySelector('.btn-dpin')?.addEventListener('click', async e => {
    e.stopPropagation();
    const btn = e.currentTarget;
    try {
      const { pinned } = await api('PUT', `/notes/${note.id}/pin`, {});
      // update local state
      const idx = notes.findIndex(n => n.id === note.id);
      if (idx !== -1) notes[idx].pinned = pinned;
      note.pinned = pinned;
      btn.textContent = pinned ? '📌 Unpin' : '📌 Pin';
      btn.dataset.pinned = pinned ? '1' : '0';
      toast(pinned ? '📌 Pinned!' : 'Unpinned');
      renderGrid();
    } catch (err) { toast('Error: ' + err.message); }
  });
  cont.querySelector('.btn-ddel')?.addEventListener('click', async e => {
    e.stopPropagation();
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

// ── CHATBOT ────────────────────────────────────────────────────────────────
;(function initChatbot() {
  const fab        = document.getElementById('chatbotFab');
  const win        = document.getElementById('chatbotWindow');
  const msgsEl     = document.getElementById('chatbotMessages');
  const inputEl    = document.getElementById('chatbotInput');
  const sendBtn    = document.getElementById('chatbotSendBtn');
  const closeBtn   = document.getElementById('chatbotCloseBtn');
  const clearBtn   = document.getElementById('chatbotClearBtn');
  const fsBtn      = document.getElementById('chatbotFullscreenBtn');
  if (!fab) return;

  let chatHistory = [];      // [{role, content}, …] — in-memory + localStorage
  let isFullscreen = false;

  // ── Persistence helpers ──────────────────────────────────────────────────
  function storageKey() {
    return currentUser ? `chat_history_${currentUser.userId}` : null;
  }
  function saveHistory() {
    const k = storageKey();
    if (k) localStorage.setItem(k, JSON.stringify(chatHistory));
  }
  function loadHistory() {
    const k = storageKey();
    if (!k) return;
    try {
      const saved = JSON.parse(localStorage.getItem(k) || '[]');
      chatHistory = saved;
      // Restore messages in DOM (skip the default welcome if we have history)
      if (saved.length) {
        msgsEl.innerHTML = '';
        saved.forEach(m => appendBubble(m.role === 'user' ? 'user' : 'ai', m.content));
      }
    } catch { chatHistory = []; }
  }

  // ── DOM helpers ─────────────────────────────────────────────────────────
  function appendBubble(who, text) {
    const wrap = document.createElement('div');
    wrap.className = `chatbot-msg chatbot-msg-${who}`;
    const bub = document.createElement('div');
    bub.className = 'chatbot-bubble';
    bub.textContent = text;
    wrap.appendChild(bub);
    msgsEl.appendChild(wrap);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return wrap;
  }

  function showTyping() {
    const wrap = document.createElement('div');
    wrap.className = 'chatbot-msg chatbot-msg-ai';
    wrap.id = 'chatbotTyping';
    wrap.innerHTML = '<div class="chatbot-bubble chatbot-typing"><span class="chatbot-dot"></span><span class="chatbot-dot"></span><span class="chatbot-dot"></span></div>';
    msgsEl.appendChild(wrap);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  function removeTyping() {
    document.getElementById('chatbotTyping')?.remove();
  }

  // ── Open / close ─────────────────────────────────────────────────────────
  function openChat() {
    win.classList.remove('hidden');
    fab.style.display = 'none';
    loadHistory();
    inputEl.focus();
  }
  function closeChat() {
    win.classList.add('hidden');
    fab.style.display = '';
    if (isFullscreen) exitFullscreen();
  }

  // ── Fullscreen ───────────────────────────────────────────────────────────
  function enterFullscreen() {
    isFullscreen = true;
    win.classList.add('fullscreen');
    fsBtn.title = 'Exit full screen';
    fsBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 1H1v5M10 1h5v5M1 10v5h5M15 10v5h-5"/></svg>';
  }
  function exitFullscreen() {
    isFullscreen = false;
    win.classList.remove('fullscreen');
    fsBtn.title = 'Full screen';
    fsBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 6V1h5M10 1h5v5M15 10v5h-5M6 15H1v-5"/></svg>';
  }

  // ── Send message ─────────────────────────────────────────────────────────
  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || sendBtn.disabled) return;

    inputEl.value = '';
    inputEl.style.height = '';
    appendBubble('user', text);
    chatHistory.push({ role: 'user', content: text });
    saveHistory();

    sendBtn.disabled = true;
    showTyping();

    try {
      const { reply } = await api('POST', '/ai/chat', {
        message: text,
        history: chatHistory.slice(-12),
      });
      removeTyping();
      appendBubble('ai', reply);
      chatHistory.push({ role: 'assistant', content: reply });
      saveHistory();
    } catch (err) {
      removeTyping();
      appendBubble('ai', '⚠ ' + err.message);
    } finally {
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  // ── Clear ────────────────────────────────────────────────────────────────
  function clearChat() {
    if (!confirm('Clear all chat history?')) return;
    chatHistory = [];
    const k = storageKey();
    if (k) localStorage.removeItem(k);
    msgsEl.innerHTML = '';
    appendBubble('ai', 'Chat cleared. Ask me anything about your stories!');
  }

  // FAB visibility is now controlled purely by CSS: body.is-owner shows it.
  // _chatbotSetOwner still called on logout to close the window if open.
  window._chatbotSetOwner = (owner) => {
    if (!owner) closeChat();
  };

  // ── Event listeners ──────────────────────────────────────────────────────
  fab.onclick     = openChat;
  closeBtn.onclick = closeChat;
  clearBtn.onclick = clearChat;
  fsBtn.onclick   = () => { if (isFullscreen) exitFullscreen(); else enterFullscreen(); };
  sendBtn.onclick = sendMessage;

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  // Auto-grow textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = '';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
  });
})();

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

// ══════════════════════════════════════════════════════════════════════════
//  CANVAS LAYER  — draggable images + text boxes, rotate, resize, z-order
// ══════════════════════════════════════════════════════════════════════════
;(function initStickers() {
  const layer       = document.getElementById('stickerLayer');
  const panel       = document.getElementById('stickerPanel');
  const toggleBtn   = document.getElementById('stickerToggle');
  const fileInput   = document.getElementById('stickerFileInput');
  const clearAllBtn = document.getElementById('stickerClearAll');
  const addTextBtn  = document.getElementById('stickerAddText');
  if (!layer || !panel || !toggleBtn) return;

  // ── State ─────────────────────────────────────────────────────────────
  // type: 'img' | 'text'
  // img fields:  src
  // text fields: text, fontSize, bold, color
  let items = [];
  let _zTop = 160;   // running z-index counter
  let _saveTimer = null;

  // ── Server persistence ────────────────────────────────────────────────
  function save() {
    if (!token) return;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async () => {
      try {
        const data = items.map(s => {
          const d = { id: s.id, type: s.type,
            x: Math.round(s.x), y: Math.round(s.y),
            w: Math.round(s.w), rot: Math.round(s.rot * 100) / 100,
            z: s.z };
          if (s.type === 'img')  d.src = s.src;
          if (s.type === 'text') { d.text = s.text; d.fontSize = s.fontSize; d.bold = s.bold; d.color = s.color; }
          return d;
        });
        await fetch('/api/stickers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ stickers: data }),
        });
      } catch(e) {}
    }, 800);
  }

  async function loadForUser(username, password = '') {
    try {
      const headers = {};
      if (password) headers['x-share-password'] = password;
      const res  = await fetch(`/api/stickers/${encodeURIComponent(username)}`, { headers });
      const data = await res.json().catch(() => ({}));
      (data.stickers || []).forEach(d => {
        if (d.type === 'text') createTextItem(d.text, d.x, d.y, d.w, d.rot, d.id, d.fontSize, d.bold, d.color, d.z);
        else if (d.type === 'img' && d.src) createImgItem(d.src, d.x, d.y, d.w, d.rot, d.id, d.z);
        // skip any record missing type or src to avoid broken-image stickers
      });
      // After load, apply visitor restrictions if not owner
      if (!isOwner) {
        layer.querySelectorAll('.sticker-text-edit').forEach(e => { e.contentEditable = 'false'; e.style.cursor = 'default'; });
        layer.querySelectorAll('.sticker').forEach(e => { e.style.cursor = 'default'; e.style.pointerEvents = 'none'; });
      }
    } catch(e) {}
  }

  // ── Shared helpers ─────────────────────────────────────────────────────
  function randPos() {
    return {
      x: window.scrollX + window.innerWidth  * 0.25 + Math.random() * window.innerWidth  * 0.4,
      y: window.scrollY + window.innerHeight * 0.2  + Math.random() * window.innerHeight * 0.35,
    };
  }

  // Build the shared control toolbar (rotate, send-back, bring-front, delete)
  // plus optional extra buttons injected via extraBtns array [{text,title,onclick}]
  function buildControls(state, el, applyTransform, extraBtns) {
    // ── click-to-lock ─────────────────────────────────────────────────
    // Clicking the sticker activates it (controls stay visible).
    // Clicking anything outside deactivates it.
    // Use a flag so the sticker's own click doesn't also trigger the
    // outside-click handler on the same event.
    function positionToolbar() {
      const rect   = el.getBoundingClientRect();
      const ctrlEl = el.querySelector('.sticker-controls');
      if (!ctrlEl) return;
      const spaceAbove = rect.top;
      const barH = ctrlEl.offsetHeight || 40;
      ctrlEl.classList.toggle('below', spaceAbove < barH + 16);
    }

    el.addEventListener('pointerdown', e => {
      e._stickerHandled = true;          // flag: this click is ON a sticker
      layer.querySelectorAll('.sticker.active').forEach(s => { if (s !== el) s.classList.remove('active'); });
      el.classList.add('active');
      requestAnimationFrame(positionToolbar);
    });

    document.addEventListener('pointerdown', e => {
      if (!e._stickerHandled) el.classList.remove('active');
    });

    // ── floating toolbar (contains all controls including delete) ──────
    const bar = document.createElement('div');
    bar.className = 'sticker-controls';

    function addBtn(text, title, onClick, extraClass) {
      const b = document.createElement('button');
      b.className = (extraClass || 'sticker-btn'); b.title = title; b.textContent = text;
      b.addEventListener('pointerdown', e => { e.stopPropagation(); onClick(); });
      bar.appendChild(b); return b;
    }

    // Rotate ±15°
    addBtn('↺', 'Rotate left',  () => { state.rot -= 15; applyTransform(); save(); });
    addBtn('↻', 'Rotate right', () => { state.rot += 15; applyTransform(); save(); });

    // Extra type-specific buttons (font size, bold, colour for text)
    (extraBtns || []).forEach(b => addBtn(b.text, b.title, b.onClick));

    // Separator
    const sep = document.createElement('span');
    sep.style.cssText = 'width:1px;height:16px;background:rgba(255,255,255,.2);flex-shrink:0';
    bar.appendChild(sep);

    // Send back / bring front
    addBtn('↓', 'Send back',    () => { state.z = Math.max(1, state.z - 1); el.style.zIndex = state.z; save(); });
    addBtn('↑', 'Bring front',  () => { _zTop++; state.z = _zTop; el.style.zIndex = state.z; save(); });

    // Separator before delete
    const sep2 = document.createElement('span');
    sep2.style.cssText = 'width:1px;height:16px;background:rgba(255,255,255,.2);flex-shrink:0';
    bar.appendChild(sep2);

    // Delete — inside toolbar, always visible with the rest
    addBtn('✕', 'Delete', () => { el.remove(); items = items.filter(s => s.id !== state.id); save(); }, 'sticker-del');

    el.appendChild(bar);

    // ── free-rotate handle (top-right) ────────────────────────────────
    const rotH = document.createElement('div');
    rotH.className = 'sticker-rotate-handle'; rotH.title = 'Drag to rotate'; rotH.textContent = '⟳';
    let rotating = false, rotA0 = 0, rotR0 = 0;
    function getAngle(e) {
      const r = el.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height/2), e.clientX - (r.left + r.width/2)) * 180/Math.PI;
    }
    rotH.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); rotH.setPointerCapture(e.pointerId); rotating=true; rotA0=getAngle(e); rotR0=state.rot; el.classList.add('active'); });
    rotH.addEventListener('pointermove', e => { if(!rotating) return; state.rot = rotR0 + getAngle(e) - rotA0; applyTransform(); });
    rotH.addEventListener('pointerup',   e => { rotating=false; el.classList.remove('active'); save(); });
    el.appendChild(rotH);

    // ── resize handle (bottom-right) ──────────────────────────────────
    const resH = document.createElement('div');
    resH.className = 'sticker-resize-handle'; resH.title = 'Drag to resize';
    let resizing=false, resX0=0, resW0=0;
    resH.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); resH.setPointerCapture(e.pointerId); resizing=true; resX0=e.clientX; resW0=state.w; el.classList.add('active'); });
    resH.addEventListener('pointermove', e => { if(!resizing) return; state.w=Math.max(40,Math.min(900,resW0+(e.clientX-resX0))); applyTransform(); });
    resH.addEventListener('pointerup',   () => { resizing=false; el.classList.remove('active'); save(); });
    el.appendChild(resH);

    // ── drag to move ─────────────────────────────────────────────────
    // We wait for actual pointer movement (>4px) before committing to a drag.
    // This lets dblclick fire normally for text edit mode.
    let pending=false, dragging=false, dOX=0, dOY=0, downX=0, downY=0, downId=0;
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.sticker-controls,.sticker-rotate-handle,.sticker-resize-handle,.sticker-del')) return;
      if (el.classList.contains('editing')) return; // don't drag while in text-edit mode
      pending = true; dragging = false;
      downX = e.clientX; downY = e.clientY; downId = e.pointerId;
      dOX = (e.clientX + window.scrollX) - state.x;
      dOY = (e.clientY + window.scrollY) - state.y;
    });
    el.addEventListener('pointermove', e => {
      if (!pending) return;
      const moved = Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
      if (!dragging && moved > 4) {
        dragging = true;
        el.setPointerCapture(downId);
        el.classList.add('active'); el.style.zIndex = 200 + _zTop;
      }
      if (!dragging) return;
      state.x = (e.clientX + window.scrollX) - dOX;
      state.y = (e.clientY + window.scrollY) - dOY;
      applyTransform();
    });
    el.addEventListener('pointerup', () => {
      pending = false;
      if (dragging) { dragging = false; el.classList.remove('active'); el.style.zIndex = state.z; save(); }
    });
  }

  // ── Create IMAGE item ─────────────────────────────────────────────────
  function createImgItem(src, x, y, w, rot, id, z) {
    const pos = randPos();
    id  = id  || ('s'+Date.now()+Math.random().toString(36).slice(2,6));
    x   = x  ?? pos.x; y = y ?? pos.y; w = w ?? 140; rot = rot ?? 0;
    z   = z  ?? (++_zTop);
    if (z > _zTop) _zTop = z;

    const state = { id, type:'img', src, x, y, w, rot, z };
    items.push(state);

    const el = document.createElement('div');
    el.className = 'sticker'; el.dataset.id = id; el.style.zIndex = z;

    function applyTransform() {
      el.style.left = state.x+'px'; el.style.top = state.y+'px';
      el.style.width = state.w+'px'; el.style.height = state.w+'px';
      el.style.transform = `rotate(${state.rot}deg)`;
    }
    applyTransform();

    const img = document.createElement('img');
    img.draggable = false; img.alt = '';
    el.appendChild(img);
    requestAnimationFrame(() => { img.src = src; });

    buildControls(state, el, applyTransform, []);

    layer.appendChild(el);
    return el;
  }

  // ── Create TEXT item ──────────────────────────────────────────────────
  function createTextItem(text, x, y, w, rot, id, fontSize, bold, color, z) {
    const pos = randPos();
    id       = id       || ('t'+Date.now()+Math.random().toString(36).slice(2,6));
    x        = x        ?? pos.x; y = y ?? pos.y; w = w ?? 200; rot = rot ?? 0;
    fontSize = fontSize ?? 20;
    bold     = bold     ?? false;
    color    = color    ?? '#2c2416';
    z        = z        ?? (++_zTop);
    if (z > _zTop) _zTop = z;

    const state = { id, type:'text', text: text||'Type here…', x, y, w, rot, fontSize, bold, color, z };
    items.push(state);

    const el = document.createElement('div');
    el.className = 'sticker sticker-text'; el.dataset.id = id; el.style.zIndex = z;

    function applyTransform() {
      el.style.left = state.x+'px'; el.style.top = state.y+'px';
      el.style.width = state.w+'px';
      el.style.transform = `rotate(${state.rot}deg)`;
    }
    function applyStyle() {
      ed.style.fontSize  = state.fontSize+'px';
      ed.style.fontWeight = state.bold ? 'bold' : 'normal';
      ed.style.color      = state.color;
    }
    applyTransform();

    // Editable text area — double-click to enter edit mode, single-click+drag to move
    const ed = document.createElement('div');
    ed.className = 'sticker-text-edit';
    ed.contentEditable = 'false'; // starts non-editable; enabled on dblclick
    ed.spellcheck = false;
    ed.textContent = state.text;
    ed.style.cursor = 'grab';
    ed.addEventListener('input', () => { state.text = ed.textContent; save(); });

    // Double-click → enter edit mode (owner only)
    ed.addEventListener('dblclick', e => {
      if (!isOwner) return;
      e.stopPropagation();
      ed.contentEditable = 'true';
      ed.style.cursor = 'text';
      el.classList.add('editing');
      ed.focus();
    });

    // Click outside → exit edit mode
    document.addEventListener('pointerdown', e => {
      if (el.classList.contains('editing') && !el.contains(e.target)) {
        ed.contentEditable = 'false';
        ed.style.cursor = isOwner ? 'grab' : 'default';
        el.classList.remove('editing');
        state.text = ed.textContent;
        save();
      }
    }, true);

    el.appendChild(ed);
    applyStyle();

    // Extra toolbar buttons for text
    const extraBtns = [
      { text:'A+', title:'Bigger text',  onClick: () => { state.fontSize = Math.min(120, state.fontSize+4); applyStyle(); save(); } },
      { text:'A−', title:'Smaller text', onClick: () => { state.fontSize = Math.max(8,  state.fontSize-4); applyStyle(); save(); } },
      { text:'B',  title:'Toggle bold',  onClick: () => { state.bold = !state.bold; applyStyle(); save(); } },
    ];

    // Colour picker — inline input appended directly to bar after build
    buildControls(state, el, applyTransform, extraBtns);

    // Append colour swatch to the controls bar
    const bar = el.querySelector('.sticker-controls');
    const colorInput = document.createElement('input');
    colorInput.type  = 'color';
    colorInput.value = state.color;
    colorInput.title = 'Text colour';
    colorInput.className = 'sticker-color-pick';
    colorInput.addEventListener('input', e => { state.color = e.target.value; applyStyle(); save(); });
    colorInput.addEventListener('pointerdown', e => e.stopPropagation());
    bar.appendChild(colorInput);

    layer.appendChild(el);
    // New items: immediately enter edit mode so user can start typing
    if (!text) requestAnimationFrame(() => {
      ed.contentEditable = 'true';
      ed.style.cursor = 'text';
      el.classList.add('editing');
      ed.focus(); selectAll(ed);
    });
    return el;
  }

  function selectAll(el) {
    const range = document.createRange(); range.selectNodeContents(el);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }

  // ── File input → upload → place image ─────────────────────────────────
  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files); fileInput.value = '';
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        toast('Uploading…', 5000);
        const fd = new FormData(); fd.append('file', file);
        const res = await fetch('/api/stickers/upload', {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { toast('Upload failed: '+(data.error||res.status)); continue; }
        const el = createImgItem(data.url);
        if (el) { el.classList.add('just-placed'); el.addEventListener('animationend', () => el.classList.remove('just-placed'), { once:true }); }
        save();
        toast('Image placed 🌸');
        panel.classList.add('hidden'); toggleBtn.classList.remove('active');
      } catch(e) { toast('Upload error: '+e.message); }
    }
  });

  // ── Library button → pick global image → place as sticker ─────────────
  const fromLibBtn = document.getElementById('stickerFromLibrary');
  if (fromLibBtn) {
    fromLibBtn.addEventListener('click', () => {
      panel.classList.add('hidden'); toggleBtn.classList.remove('active');
      openLibraryPicker(chosen => {
        chosen.forEach(img => {
          const el = createImgItem(img.url);
          if (el) {
            el.classList.add('just-placed');
            el.addEventListener('animationend', () => el.classList.remove('just-placed'), { once: true });
          }
        });
        save();
        toast(chosen.length + ' image' + (chosen.length !== 1 ? 's' : '') + ' placed on canvas 🌸');
      });
    });
  }

  // ── Add text button ────────────────────────────────────────────────────
  addTextBtn && addTextBtn.addEventListener('click', () => {
    const el = createTextItem('');
    if (el) { el.classList.add('just-placed'); el.addEventListener('animationend', () => el.classList.remove('just-placed'), {once:true}); }
    save();
    panel.classList.add('hidden'); toggleBtn.classList.remove('active');
  });

  // ── Clear all ──────────────────────────────────────────────────────────
  clearAllBtn.addEventListener('click', () => {
    layer.innerHTML = ''; items = []; save(); toast('Canvas cleared');
  });

  // ── Toggle panel ──────────────────────────────────────────────────────
  toggleBtn.addEventListener('click', () => {
    const open = !panel.classList.contains('hidden');
    panel.classList.toggle('hidden', open);
    toggleBtn.classList.toggle('active', !open);
  });
  document.addEventListener('pointerdown', e => {
    if (!panel.classList.contains('hidden') && !panel.contains(e.target) && e.target !== toggleBtn) {
      panel.classList.add('hidden'); toggleBtn.classList.remove('active');
    }
  }, true);

  // ── Owner visibility ──────────────────────────────────────────────────
  window._stickerSetOwner = function(owner) {
    const wasHidden = toggleBtn.classList.contains('hidden');
    toggleBtn.classList.toggle('hidden', !owner);
    if (owner && wasHidden) {
      toggleBtn.classList.remove('pulse'); void toggleBtn.offsetWidth;
      toggleBtn.classList.add('pulse');
      toggleBtn.addEventListener('animationend', () => toggleBtn.classList.remove('pulse'), {once:true});
    }
    if (!owner) { panel.classList.add('hidden'); toggleBtn.classList.remove('active'); }
    // For visitors: ensure text boxes are non-interactive and stickers don't show grab cursor
    layer.querySelectorAll('.sticker-text-edit').forEach(e => {
      e.contentEditable = 'false';
      e.style.cursor = 'default';
    });
    layer.querySelectorAll('.sticker').forEach(e => {
      if (!owner) { e.style.cursor = 'default'; e.style.pointerEvents = 'none'; }
    });
  };

  window._stickerLoad = function(username, password = '') {
    layer.innerHTML = ''; items = [];
    if (username) loadForUser(username, password);
  };
})();
