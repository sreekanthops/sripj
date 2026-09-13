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

    // Check if this user has an active story (available in StoryBar cache)
    const hasStory = window._storyUserIds?.has(a.id);
    const avWrapStyle = hasStory
      ? 'cursor:pointer;padding:2.5px;border-radius:50%;background:linear-gradient(135deg,#f7971e,#f72585,#7209b7,#4cc9f0);display:inline-flex;flex-shrink:0'
      : 'cursor:pointer';

    return `
      <article class="feed-card" data-note-id="${note.id}">
        ${note.bgUrl ? `<div class="feed-card-bg" ${bgStyle}></div>` : ''}
        <div class="feed-card-body">
          <div class="feed-card-author">
            <div class="feed-av" data-uid="${escHtml(a.id)}" data-uname="${escHtml(a.username)}" style="${avWrapStyle}">${hasStory ? `<div style="border-radius:50%;border:2px solid var(--bg);overflow:hidden;width:100%;height:100%;display:flex;align-items:center;justify-content:center">${av}</div>` : av}</div>
            <div class="feed-author-info">
              <div class="feed-author-name feed-author-link" data-uid="${escHtml(a.id)}" data-uname="${escHtml(a.username)}" style="cursor:pointer">${escHtml(a.displayName || a.username)}</div>
              <div class="feed-author-handle">@${escHtml(a.username)} · ${relTime(note.createdAt)}</div>
            </div>
            ${!isOwnNote && myId ? `<button class="feed-follow-btn${isFollowing ? ' following' : ''}" data-uid="${escHtml(a.id)}">${isFollowing ? '✓ Following' : '+ Follow'}</button>` : ''}
            ${!isOwnNote ? `<button class="feed-profile-btn" data-uid="${escHtml(a.id)}" data-uname="${escHtml(a.username)}" title="View profile">View Profile</button>` : ''}
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
          container.innerHTML = '<div class="feed-empty">No public stories yet. Be the first to share! ✍️</div>';
        }
        return;
      }
      const frag = document.createDocumentFragment();
      data.notes.forEach(note => {
        const div = document.createElement('div');
        div.innerHTML = renderFeedCard(note);
        if (div.firstElementChild) frag.appendChild(div.firstElementChild);
      });
      if (container) container.appendChild(frag);
      _page++;
      if (data.notes.length < 20) _done = true;
      bindCardEvents(container);
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

    // Author avatar → open stories if available, otherwise profile
    container.querySelectorAll('.feed-av[data-uid]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        if (el.dataset.uid) window.StoryBar?.openForUser?.(el.dataset.uid);
      };
    });

    // Author display-name link → open user profile modal
    container.querySelectorAll('.feed-author-link[data-uname]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        if (el.dataset.uid) window.openUserProfile?.(el.dataset.uid);
        else if (el.dataset.uname) window.location.href = '/@' + encodeURIComponent(el.dataset.uname);
      };
    });

    // "View Profile" button → open user profile modal
    container.querySelectorAll('.feed-profile-btn[data-uname]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (btn.dataset.uid) window.openUserProfile?.(btn.dataset.uid);
        else if (btn.dataset.uname) window.location.href = '/@' + encodeURIComponent(btn.dataset.uname);
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
    const feedScreen   = document.getElementById('feedScreen');
    const mainContent  = document.getElementById('mainContent');
    if (feedScreen)  feedScreen.style.display  = 'block';
    if (mainContent) mainContent.style.display = 'none';
    setActiveNavTab('feed');
    // always reset + reload so newly-public notes appear immediately
    resetFeed();
    loadMore();
    initObserver();
    // Load story bar
    window.StoryBar?.load?.();
  }

  function hideFeed() {
    const feedScreen   = document.getElementById('feedScreen');
    const mainContent  = document.getElementById('mainContent');
    if (feedScreen)  feedScreen.style.display  = 'none';
    if (mainContent) mainContent.style.display = '';
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

  // Wire Refresh button
  document.getElementById('feedRefreshBtn')?.addEventListener('click', () => {
    resetFeed();
    loadMore();
  });

  window.Feed = { initFeed, showFeed, hideFeed, reloadLanding };
})();

// ── Story Bar + Story Viewer ─────────────────────────────────────────────────
(function () {
  'use strict';

  const STORY_DURATION_MS = 5000; // 5s per story slide
  const PALETTE_BG = [
    '#1a1025','#0d1f2d','#12201a','#2a1615','#1e1a0c',
    '#1a1825','#0e1f1f','#1f1215',
  ];
  const PALETTE_ACCENT = [
    '#c084fc','#60a5fa','#34d399','#f87171','#fbbf24',
    '#a78bfa','#2dd4bf','#f472b6',
  ];

  let _seenUsers = new Set(); // track which user stories have been viewed
  let _groups    = [];        // cached story groups from API
  let _curGroup  = 0;
  let _curStory  = 0;
  let _storyTimer = null;
  let _progInterval = null;
  let _progStart = null;

  function authHeader() {
    const t = localStorage.getItem('diary_token');
    return t ? { Authorization: 'Bearer ' + t } : {};
  }
  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function relTime(iso) {
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 3600)  return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  // ── Render story bar ──────────────────────────────────────────────────────
  function renderBar(groups) {
    const inner = document.getElementById('storyBarInner');
    if (!inner) return;
    if (!groups.length) {
      inner.innerHTML = '<span class="story-bar-empty" style="display:block">No stories right now</span>';
      return;
    }
    inner.innerHTML = groups.map((g, gi) => {
      const a = g.author;
      const seen = _seenUsers.has(a.id);
      const av = a.avatarUrl
        ? `<img class="story-ring-img" src="${escHtml(a.avatarUrl)}" alt="">`
        : `<div class="story-ring-init">${(a.displayName || a.username || '?').charAt(0).toUpperCase()}</div>`;
      return `
        <div class="story-bubble" data-group="${gi}">
          <div class="story-ring${seen?' seen':''}">
            <div class="story-ring-inner">${av}</div>
          </div>
          <div class="story-bubble-name">${escHtml(a.displayName || a.username)}</div>
        </div>`;
    }).join('');

    inner.querySelectorAll('.story-bubble').forEach(el => {
      el.onclick = () => openViewer(parseInt(el.dataset.group, 10), 0);
    });
  }

  // ── Load stories ─────────────────────────────────────────────────────────
  async function load() {
    const inner = document.getElementById('storyBarInner');
    if (inner) inner.innerHTML = '<span class="story-bar-loading">Loading stories…</span>';
    try {
      const res = await fetch('/api/stories/feed', { headers: { 'Content-Type': 'application/json', ...authHeader() } });
      const data = await res.json().catch(() => ({ groups: [] }));
      _groups = data.groups || [];
      // Expose user IDs that have active stories for feed card ring rendering
      window._storyUserIds = new Set(_groups.map(g => g.author.id));
      renderBar(_groups);
    } catch {
      if (inner) inner.innerHTML = '';
    }
  }

  // ── Story Viewer ──────────────────────────────────────────────────────────
  function openViewer(groupIdx, storyIdx) {
    _curGroup = groupIdx;
    _curStory = storyIdx;
    const overlay = document.getElementById('storyViewerOverlay');
    if (overlay) overlay.classList.remove('hidden');
    renderSlide();
  }

  function closeViewer() {
    stopTimer();
    const overlay = document.getElementById('storyViewerOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function stopTimer() {
    clearTimeout(_storyTimer);
    clearInterval(_progInterval);
    _storyTimer = null;
    _progInterval = null;
  }

  function startTimer() {
    stopTimer();
    _progStart = Date.now();
    const fill = document.querySelector('.sv-prog-bar.active .sv-prog-fill');
    if (fill) {
      fill.style.transition = `width ${STORY_DURATION_MS}ms linear`;
      fill.style.width = '100%';
    }
    _storyTimer = setTimeout(() => advanceStory(1), STORY_DURATION_MS);
  }

  function advanceStory(dir) {
    const group = _groups[_curGroup];
    if (!group) return closeViewer();
    const next = _curStory + dir;
    if (next >= group.stories.length) {
      // next group
      if (_curGroup + 1 < _groups.length) {
        _seenUsers.add(group.author.id);
        updateBarSeen(group.author.id);
        openViewer(_curGroup + 1, 0);
      } else {
        _seenUsers.add(group.author.id);
        updateBarSeen(group.author.id);
        closeViewer();
      }
    } else if (next < 0) {
      // prev group
      if (_curGroup > 0) {
        openViewer(_curGroup - 1, 0);
      }
    } else {
      _curStory = next;
      renderSlide();
    }
  }

  function updateBarSeen(userId) {
    document.querySelectorAll('.story-bubble').forEach(el => {
      const gi = parseInt(el.dataset.group, 10);
      if (_groups[gi]?.author?.id === userId) {
        el.querySelector('.story-ring')?.classList.add('seen');
      }
    });
  }

  function renderSlide() {
    stopTimer();
    const group = _groups[_curGroup];
    if (!group) return closeViewer();
    const story = group.stories[_curStory];
    if (!story) return closeViewer();
    const a = group.author;

    // Progress bars
    const progRow = document.getElementById('svProgressRow');
    if (progRow) {
      progRow.innerHTML = group.stories.map((_, si) => {
        const cls = si < _curStory ? 'done' : si === _curStory ? 'active' : '';
        return `<div class="sv-prog-bar ${cls}"><div class="sv-prog-fill" style="${si < _curStory ? 'width:100%' : ''}"></div></div>`;
      }).join('');
    }

    // Header
    const svAvatar = document.getElementById('svAvatar');
    if (svAvatar) {
      if (a.avatarUrl) {
        svAvatar.innerHTML = `<img src="${escHtml(a.avatarUrl)}" alt="">`;
      } else {
        svAvatar.textContent = (a.displayName || a.username || '?').charAt(0).toUpperCase();
      }
    }
    const svName = document.getElementById('svName');
    if (svName) svName.textContent = a.displayName || a.username;
    const svTime = document.getElementById('svTime');
    if (svTime) svTime.textContent = relTime(story.createdAt);

    // Body — colour from palette
    const ci  = story.colorIdx ?? 0;
    const bg  = PALETTE_BG[ci % PALETTE_BG.length];
    const acc = PALETTE_ACCENT[ci % PALETTE_ACCENT.length];
    const svBody = document.getElementById('svBody');
    const svCard = document.getElementById('storyViewerCard');
    // Remove any previous bg element
    svCard?.querySelectorAll('.sv-story-bg').forEach(el => el.remove());
    // Inject background into the card (positioned ancestor)
    const bgDiv = document.createElement('div');
    bgDiv.className = 'sv-story-bg';
    bgDiv.innerHTML = `<div class="sv-story-bg-color" style="background:${bg};width:100%;height:100%;position:absolute;inset:0"></div>`;
    svCard?.insertBefore(bgDiv, svCard.firstChild);

    if (svBody) {
      svBody.innerHTML = `
        <div class="sv-story-content">
          ${story.title ? `<div class="sv-story-title" style="color:${escHtml(acc)}">${escHtml(story.title)}</div>` : ''}
          <div class="sv-story-text">${escHtml(story.body || '')}</div>
        </div>`;
    }

    // Tap areas
    const tapL = document.getElementById('svTapLeft');
    const tapR = document.getElementById('svTapRight');
    if (tapL) tapL.onclick = () => advanceStory(-1);
    if (tapR) tapR.onclick = () => advanceStory(1);

    startTimer();
  }

  // Wire close button
  document.getElementById('svClose')?.addEventListener('click', closeViewer);
  // Close on overlay bg click
  document.getElementById('storyViewerOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('storyViewerOverlay')) closeViewer();
  });

  // Expose openViewer globally so user profile modal can call it
  window.StoryBar = { load, openViewer, openForUser };

  // Open stories for a specific userId
  async function openForUser(userId) {
    // ensure groups are loaded
    if (!_groups.length) await load();
    const idx = _groups.findIndex(g => g.author.id === userId);
    if (idx === -1) {
      // Fetch on demand for this user
      try {
        const res  = await fetch(`/api/stories/user/${userId}`, { headers: authHeader() });
        const data = await res.json().catch(() => ({ stories: [] }));
        if (!data.stories?.length) { window.toast?.('No active stories right now'); return; }
        // Build a one-off group and show
        _groups.push({ author: data.stories[0].author || { id: userId, username: '', displayName: '', avatarUrl: '' }, stories: data.stories });
        openViewer(_groups.length - 1, 0);
      } catch {}
      return;
    }
    openViewer(idx, 0);
  }
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
