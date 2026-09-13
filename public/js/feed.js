// ── Feed Screen ───────────────────────────────────────────────────────────────
// Exposes window.Feed = { initFeed, showFeed, hideFeed }
(function () {
  const API = '/api/feed';
  let _page    = 1;
  let _loading = false;
  let _done    = false;
  let _sentinel = null;
  let _observer = null;

  function authHeader() {
    const t = localStorage.getItem('diary_token');
    return t ? { Authorization: 'Bearer ' + t } : {};
  }

  async function apiFeed(path, opts = {}) {
    const res = await fetch(API + path, { headers: { 'Content-Type': 'application/json', ...authHeader() }, ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error');
    return data;
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function relTime(iso) {
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  function renderFeedCard(note) {
    const a = note.author;
    const av = a.avatarUrl
      ? `<img src="${escHtml(a.avatarUrl)}" class="feed-av-img">`
      : `<div class="feed-av-init">${(a.displayName || a.username || '?').charAt(0).toUpperCase()}</div>`;

    const reactionTotal = note.reactions.reduce((s, r) => s + r.c, 0);
    const topEmoji = note.reactions.sort((a, b) => b.c - a.c).slice(0, 3).map(r => r.emoji).join('');

    const bgStyle = note.bgUrl ? `style="background-image:url('${escHtml(note.bgUrl)}');background-size:cover;background-position:center"` : '';

    const isFollowing = a.isFollowing;
    const myId = window._currentUserId;
    const isOwnNote = myId && myId === a.id;

    return `
      <article class="feed-card" data-note-id="${note.id}">
        ${note.bgUrl ? `<div class="feed-card-bg" ${bgStyle}></div>` : ''}
        <div class="feed-card-body">
          <div class="feed-card-author">
            <div class="feed-av" data-uid="${escHtml(a.id)}" data-uname="${escHtml(a.username)}" style="cursor:pointer">${av}</div>
            <div class="feed-author-info">
              <div class="feed-author-name feed-author-link" data-uname="${escHtml(a.username)}" style="cursor:pointer">${escHtml(a.displayName || a.username)}</div>
              <div class="feed-author-handle">@${escHtml(a.username)} · ${relTime(note.createdAt)}</div>
            </div>
            ${!isOwnNote && myId ? `<button class="feed-follow-btn${isFollowing ? ' following' : ''}" data-uid="${escHtml(a.id)}">${isFollowing ? '✓ Following' : '+ Follow'}</button>` : ''}
            ${!isOwnNote ? `<button class="feed-profile-btn" data-uname="${escHtml(a.username)}" title="View public notes">View Profile</button>` : ''}
          </div>
          ${note.title ? `<h3 class="feed-card-title" style="font-family:${escHtml(note.font)}">${escHtml(note.title)}</h3>` : ''}
          <p class="feed-card-text">${escHtml((note.body || '').slice(0, 280))}${(note.body || '').length > 280 ? '…' : ''}</p>
          <div class="feed-card-actions">
            <button class="feed-react-btn" data-note-id="${note.id}" title="React">
              ${topEmoji || '♡'} <span class="feed-react-count">${reactionTotal || ''}</span>
            </button>
            <button class="feed-comment-btn" data-note-id="${note.id}" title="Comments">
              💬 <span>${note.replyCount || 0}</span>
            </button>
            <button class="feed-share-btn" data-note-id="${note.id}" title="Share">
              ↗
            </button>
            ${!isOwnNote && myId ? `<button class="feed-msg-btn" data-uid="${escHtml(a.id)}" title="Message">✉️</button>` : ''}
          </div>
        </div>
      </article>`;
  }

  async function loadMore() {
    if (_loading || _done) return;
    _loading = true;
    const container = document.getElementById('feedCards');
    const spinner   = document.getElementById('feedSpinner');
    if (spinner) spinner.style.display = '';
    try {
      const data = await apiFeed(`?page=${_page}&limit=20`);
      if (!data.notes?.length) {
        _done = true;
        if (spinner) spinner.style.display = 'none';
        if (_page === 1 && container) {
          container.innerHTML = '<div class="feed-empty">No public stories yet. When you write a note, tick <strong>🌍 Share to Feed</strong> to show it here.</div>';
        }
        return;
      }
      data.notes.forEach(note => {
        const div = document.createElement('div');
        div.innerHTML = renderFeedCard(note);
        container.appendChild(div.firstElementChild);
      });
      _page++;
      if (data.notes.length < 20) _done = true;
      bindCardEvents();
    } catch (e) {
      if (container) container.insertAdjacentHTML('beforeend', `<div class="feed-empty">Error loading feed: ${e.message}</div>`);
    } finally {
      _loading = false;
      if (spinner) spinner.style.display = 'none';
    }
  }

  function requireLogin(e) {
    const token = localStorage.getItem('diary_token');
    if (token) return true;
    e.stopPropagation();
    // show auth modal
    const modal = document.getElementById('authModal');
    const authScreen = document.getElementById('authScreen');
    if (modal)      modal.classList.remove('hidden');
    if (authScreen) authScreen.classList.remove('hidden');
    return false;
  }

  function bindCardEvents(container) {
    if (!container) container = document.getElementById('feedCards');
    if (!container) return;

    // Follow buttons
    container.querySelectorAll('.feed-follow-btn[data-uid]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        if (!requireLogin(e)) return;
        const uid       = btn.dataset.uid;
        const following = btn.classList.contains('following');
        try {
          if (following) {
            await fetch(`/api/follows/${uid}`, { method: 'DELETE', headers: authHeader() });
            btn.classList.remove('following');
            btn.textContent = '+ Follow';
          } else {
            await fetch(`/api/follows/${uid}`, { method: 'POST', headers: { 'Content-Type':'application/json', ...authHeader() } });
            btn.classList.add('following');
            btn.textContent = '✓ Following';
          }
        } catch {}
      };
    });

    // Author avatar → visit diary (public notes only for non-owners)
    container.querySelectorAll('.feed-av[data-uname]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const uname = el.dataset.uname;
        if (uname) window.location.href = '/@' + encodeURIComponent(uname);
      };
    });

    // Author display-name link → visit profile public notes
    container.querySelectorAll('.feed-author-link[data-uname]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const uname = el.dataset.uname;
        if (uname) window.location.href = '/@' + encodeURIComponent(uname);
      };
    });

    // "View Profile" button → visit profile public notes
    container.querySelectorAll('.feed-profile-btn[data-uname]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const uname = btn.dataset.uname;
        if (uname) window.location.href = '/@' + encodeURIComponent(uname);
      };
    });

    // React button — open note detail for emoji reactions (login required)
    container.querySelectorAll('.feed-react-btn[data-note-id]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (!requireLogin(e)) return;
        window.openNoteById?.(btn.dataset.noteId);
      };
    });

    // Comment button (login required)
    container.querySelectorAll('.feed-comment-btn[data-note-id]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (!requireLogin(e)) return;
        window.openNoteById?.(btn.dataset.noteId);
      };
    });

    // Share
    container.querySelectorAll('.feed-share-btn[data-note-id]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const url = `${location.origin}/entry/${btn.dataset.noteId}`;
        try {
          await navigator.clipboard.writeText(url);
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = '↗'; }, 1500);
        } catch {}
      };
    });

    // Message button (login required)
    container.querySelectorAll('.feed-msg-btn[data-uid]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (!requireLogin(e)) return;
        window.Chat?.startConversation?.(btn.dataset.uid);
      };
    });
  }

  function initObserver() {
    if (_observer) return;
    _sentinel = document.getElementById('feedSentinel');
    if (!_sentinel) return;
    _observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore();
    }, { threshold: 0.1 });
    _observer.observe(_sentinel);
  }

  function resetFeed() {
    _page    = 1;
    _loading = false;
    _done    = false;
    const container = document.getElementById('feedCards');
    const sentinel  = document.getElementById('feedSentinel');
    if (container && sentinel) {
      // clear all cards but keep the sentinel and spinner in place
      container.querySelectorAll('.feed-card').forEach(el => el.remove());
      container.querySelectorAll('.feed-empty').forEach(el => el.remove());
    }
  }

  function showFeed() {
    const feedScreen  = document.getElementById('feedScreen');
    const notesSection = document.getElementById('notesSection');
    if (feedScreen)   feedScreen.style.display  = 'block';
    if (notesSection) notesSection.style.display = 'none';
    setActiveNavTab('feed');
    // always reset + reload so newly-public notes appear immediately
    resetFeed();
    loadMore();
    initObserver();
  }

  function hideFeed() {
    const feedScreen  = document.getElementById('feedScreen');
    const notesSection = document.getElementById('notesSection');
    if (feedScreen)   feedScreen.style.display  = 'none';
    if (notesSection) notesSection.style.display = '';
  }

  function setActiveNavTab(tab) {
    document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  }

  function initFeed() {
    showFeed();
  }

  // Alias so enterOwnDiary can reload after auth state changes
  function reloadLanding() {
    resetFeed();
    loadMore();
  }

  window.Feed = { initFeed, showFeed, hideFeed, reloadLanding };
})();

// ── Guest Feed Screen — standalone, no login required ─────────────────────
(function () {
  let _page    = 1;
  let _loading = false;
  let _done    = false;

  function authHeader() {
    const t = localStorage.getItem('diary_token');
    return t ? { Authorization: 'Bearer ' + t } : {};
  }
  function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function relTime(iso) {
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return Math.floor(diff/60) + 'm ago';
    if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
    return Math.floor(diff/86400) + 'd ago';
  }

  function promptLogin() {
    document.getElementById('authModal')?.classList.remove('hidden');
    document.getElementById('authScreen')?.classList.remove('hidden');
    document.getElementById('guestFeedScreen')?.classList.add('hidden');
    document.getElementById('landingFixedBar') && (document.getElementById('landingFixedBar').style.display = '');
  }

  function renderCard(note) {
    const a = note.author;
    const av = a.avatarUrl
      ? `<img src="${escHtml(a.avatarUrl)}" class="feed-av-img">`
      : `<div class="feed-av-init">${(a.displayName||a.username||'?').charAt(0).toUpperCase()}</div>`;
    const reactionTotal = note.reactions.reduce((s,r) => s + r.c, 0);
    const topEmoji = [...note.reactions].sort((a,b)=>b.c-a.c).slice(0,3).map(r=>r.emoji).join('');
    const loggedIn = !!localStorage.getItem('diary_token');
    const myId = window._currentUserId;
    const isOwnNote = myId && myId === a.id;
    const bgStyle = note.bgUrl ? `style="background-image:url('${escHtml(note.bgUrl)}');background-size:cover;background-position:center"` : '';

    return `
      <article class="feed-card" data-note-id="${escHtml(note.id)}">
        ${note.bgUrl ? `<div class="feed-card-bg" ${bgStyle}></div>` : ''}
        <div class="feed-card-body">
          <div class="feed-card-author">
            <div class="feed-av gf-av-link" data-uname="${escHtml(a.username)}" style="cursor:pointer">${av}</div>
            <div class="feed-author-info">
              <div class="feed-author-name gf-av-link" data-uname="${escHtml(a.username)}" style="cursor:pointer">${escHtml(a.displayName||a.username)}</div>
              <div class="feed-author-handle">@${escHtml(a.username)} · ${relTime(note.createdAt)}</div>
            </div>
          </div>
          ${note.title ? `<h3 class="feed-card-title">${escHtml(note.title)}</h3>` : ''}
          <p class="feed-card-text">${escHtml((note.body||'').slice(0,280))}${(note.body||'').length>280?'…':''}</p>
          <div class="feed-card-actions">
            <button class="feed-react-btn gf-action" data-note-id="${escHtml(note.id)}" title="${loggedIn?'React':'Sign in to react'}">
              ${topEmoji||'♡'} <span>${reactionTotal||''}</span>
            </button>
            <button class="feed-comment-btn gf-action" data-note-id="${escHtml(note.id)}" title="${loggedIn?'Comments':'Sign in to comment'}">
              💬 <span>${note.replyCount||0}</span>
            </button>
            <button class="feed-share-btn gf-share" data-note-id="${escHtml(note.id)}" title="Share">↗</button>
            ${!loggedIn ? `<button class="feed-signin-nudge-btn gf-login">Sign in to react →</button>` : ''}
          </div>
        </div>
      </article>`;
  }

  function bindEvents(container) {
    container.querySelectorAll('.gf-av-link[data-uname]').forEach(el => {
      el.onclick = e => { e.stopPropagation(); window.location.href = '/@' + encodeURIComponent(el.dataset.uname); };
    });
    container.querySelectorAll('.gf-action[data-note-id]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        if (!localStorage.getItem('diary_token')) { promptLogin(); return; }
        window.openNoteById?.(btn.dataset.noteId);
      };
    });
    container.querySelectorAll('.gf-share[data-note-id]').forEach(btn => {
      btn.onclick = async e => {
        e.stopPropagation();
        const url = `${location.origin}/entry/${btn.dataset.noteId}`;
        try { await navigator.clipboard.writeText(url); btn.textContent = '✓'; setTimeout(()=>{ btn.textContent='↗'; },1500); } catch {}
      };
    });
    container.querySelectorAll('.gf-login').forEach(btn => {
      btn.onclick = e => { e.stopPropagation(); promptLogin(); };
    });
  }

  async function loadMore() {
    if (_loading || _done) return;
    _loading = true;
    const container = document.getElementById('guestFeedCards');
    const spinner   = document.getElementById('guestFeedSpinner');
    const empty     = document.getElementById('guestFeedEmpty');
    if (spinner) spinner.style.display = '';
    try {
      const res  = await fetch(`/api/feed?page=${_page}&limit=20`, { headers: { 'Content-Type':'application/json', ...authHeader() } });
      const data = await res.json().catch(()=>({notes:[]}));
      if (!data.notes?.length) {
        _done = true;
        if (_page === 1 && empty) empty.style.display = '';
        return;
      }
      const frag = document.createDocumentFragment();
      data.notes.forEach(note => {
        const div = document.createElement('div');
        div.innerHTML = renderCard(note);
        frag.appendChild(div.firstElementChild);
      });
      bindEvents(frag);
      container.appendChild(frag);
      _page++;
      if (data.notes.length < 20) _done = true;
    } catch (err) { console.error('[guestFeed]', err); }
    finally { _loading = false; if (spinner) spinner.style.display = 'none'; }
  }

  // Infinite scroll inside the guest feed screen
  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) loadMore();
  }, { threshold: 0.1 });

  function load() {
    // reset
    _page = 1; _loading = false; _done = false;
    const container = document.getElementById('guestFeedCards');
    const empty     = document.getElementById('guestFeedEmpty');
    if (container) container.innerHTML = '';
    if (empty) empty.style.display = 'none';
    // observe bottom sentinel
    const sentinel = document.getElementById('guestFeedSpinner');
    if (sentinel) observer.observe(sentinel);
    loadMore();
  }

  // Back button
  document.getElementById('guestFeedBack')?.addEventListener('click', () => {
    document.getElementById('guestFeedScreen').classList.add('hidden');
    document.getElementById('authScreen').classList.remove('hidden');
    const bar = document.getElementById('landingFixedBar');
    if (bar) bar.style.display = '';
  });
  // Sign In button inside feed screen
  document.getElementById('guestFeedSignIn')?.addEventListener('click', () => promptLogin());

  window.GuestFeed = { load };
})();
