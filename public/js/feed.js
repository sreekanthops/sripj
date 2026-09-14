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

  function isVidMime(mime) { return (mime || '').startsWith('video/'); }

  // Build media block for a feed card — preserves native aspect ratio, no forced sizing
  function buildFeedMedia(media) {
    if (!media || !media.length) return '';
    return media.map(m => {
      if (isVidMime(m.mimetype)) {
        return `<div class="feed-media-item">
          <video src="${escHtml(m.url)}" controls playsinline preload="metadata"
            style="display:block;width:100%;height:auto;max-width:100%;border-radius:8px;background:#000"></video>
        </div>`;
      }
      return `<div class="feed-media-item">
        <img src="${escHtml(m.url)}" loading="lazy" decoding="async"
          style="display:block;width:100%;height:auto;max-width:100%;border-radius:8px;object-fit:contain">
      </div>`;
    }).join('');
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
    // isPinnedTag = true means this user was tagged — track silently, no visual hint
    const isPinned = !!note.isPinnedTag;

    // Check if this user has an active story (available in StoryBar cache)
    const hasStory = window._storyUserIds?.has(a.id);
    const avWrapStyle = hasStory
      ? 'cursor:pointer;padding:2.5px;border-radius:50%;background:linear-gradient(135deg,#f7971e,#f72585,#7209b7,#4cc9f0);display:inline-flex;flex-shrink:0'
      : 'cursor:pointer';

    const mediaHtml = buildFeedMedia(note.media);

    // data-tagged-pinned used for view tracking only — no visible banner shown to user
    return `
      <article class="feed-card" data-note-id="${note.id}"${isPinned ? ' data-tagged-pinned="1"' : ''}>
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
          ${mediaHtml ? `<div class="feed-card-media">${mediaHtml}</div>` : ''}
          ${!mediaHtml ? `<p class="feed-card-text">${escHtml((note.body || '').slice(0, 280))}${(note.body || '').length > 280 ? '…' : ''}</p>` : (note.body ? `<p class="feed-card-text" style="margin-top:8px">${escHtml((note.body || '').slice(0, 200))}${(note.body || '').length > 200 ? '…' : ''}</p>` : '')}
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

  // ── Tag-view tracking ─────────────────────────────────────────────────────
  // Silently tracks how long the tagged user views each tagged card.
  // Rules:
  //   ≥5s total across any views → report "seen"  (owner gets ✅ notification)
  //   scrolled past ≥2 times, each time <2s       → report "no_response" (owner gets 📭)
  //
  // Two mechanisms combined:
  //   1. IntersectionObserver fires when card enters/leaves viewport → captures scroll-past
  //   2. setTimeout of 5s fires while card IS in viewport → captures "still reading"
  const _tagViewMap = new Map(); // noteId → { enterTime, seenTimer, totalDur, viewCount }

  function reportTagView(noteId, durationSec) {
    const t = localStorage.getItem('diary_token');
    if (!t) return;
    fetch(`/api/notes/${noteId}/tag-view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify({ durationSec }),
    }).catch(() => {});
  }

  let _tagViewObserver = null;

  function initTagViewObserver() {
    if (_tagViewObserver) return;
    _tagViewObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const card   = entry.target;
        const noteId = card.dataset.noteId;
        if (!noteId) return;

        if (!_tagViewMap.has(noteId)) {
          _tagViewMap.set(noteId, { enterTime: null, seenTimer: null, totalDur: 0, viewCount: 0 });
        }
        const rec = _tagViewMap.get(noteId);

        if (entry.isIntersecting) {
          // Card entered viewport — start tracking
          rec.enterTime = Date.now();

          // Fire after 5s if user is still reading (hasn't scrolled away)
          rec.seenTimer = setTimeout(() => {
            if (rec.enterTime) {
              const dur = (Date.now() - rec.enterTime) / 1000;
              rec.totalDur += dur;
              rec.viewCount += 1;
              rec.enterTime = null; // prevent double-count when they scroll away later
              reportTagView(noteId, dur);
            }
          }, 5100); // 5.1s — slightly over 5s threshold

        } else if (rec.enterTime) {
          // Card left viewport — record how long it was visible
          clearTimeout(rec.seenTimer);
          rec.seenTimer = null;
          const dur = (Date.now() - rec.enterTime) / 1000;
          rec.totalDur  += dur;
          rec.viewCount += 1;
          rec.enterTime  = null;
          reportTagView(noteId, dur);
        }
      });
    }, { threshold: 0.5 });
  }

  function attachTagViewObserver(container) {
    if (!window._currentUserId) return;
    initTagViewObserver();
    container.querySelectorAll('.feed-card[data-tagged-pinned="1"]').forEach(card => {
      _tagViewObserver.observe(card);
    });
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
      attachTagViewObserver(container);
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

  // Flush any in-flight tag views when page hides (user navigates away)
  window.addEventListener('pagehide', () => {
    if (!_tagViewObserver) return;
    _tagViewMap.forEach((rec, noteId) => {
      clearTimeout(rec.seenTimer);
      if (rec.enterTime) {
        const dur = (Date.now() - rec.enterTime) / 1000;
        reportTagView(noteId, dur);
      }
    });
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
    // Stop any playing story video so sound doesn't leak after close
    const vid = document.getElementById('svVideo');
    if (vid) { vid.pause(); vid.src = ''; }
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

  function isVidMime(mime) { return (mime || '').startsWith('video/'); }

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

    // Body — colour from palette (used as fallback bg when no media)
    const ci  = story.colorIdx ?? 0;
    const bg  = PALETTE_BG[ci % PALETTE_BG.length];
    const acc = PALETTE_ACCENT[ci % PALETTE_ACCENT.length];
    const svBody = document.getElementById('svBody');
    const svCard = document.getElementById('storyViewerCard');

    // Remove any previous bg / media elements
    svCard?.querySelectorAll('.sv-story-bg').forEach(el => el.remove());

    const firstMedia = story.media?.[0];

    if (firstMedia) {
      // Media story — show video or image filling the card, no colour bg overlay
      if (svCard) svCard.style.background = '#000';
      if (svBody) {
        if (isVidMime(firstMedia.mimetype)) {
          // Build video element in JS so we can control it after insert
          svBody.innerHTML = `
            <div class="sv-story-media" id="svVideoWrap" style="position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:0">
              <video id="svVideo" src="${escHtml(firstMedia.url)}" playsinline loop
                style="max-width:100%;max-height:100%;width:auto;height:auto;display:block"></video>
              <div id="svPauseIcon" style="display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;background:rgba(0,0,0,.45);border-radius:50%;width:64px;height:64px;align-items:center;justify-content:center">
                <svg viewBox="0 0 24 24" fill="#fff" width="32" height="32" style="display:block;margin:auto"><rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/></svg>
              </div>
              ${story.title ? `<div class="sv-story-title" style="position:absolute;bottom:70px;left:0;right:0;text-align:center;color:#fff;padding:8px 16px;text-shadow:0 1px 4px rgba(0,0,0,.7);pointer-events:none">${escHtml(story.title)}</div>` : ''}
              ${story.body  ? `<div class="sv-story-text"  style="position:absolute;bottom:44px;left:0;right:0;text-align:center;color:rgba(255,255,255,.9);font-size:13px;padding:0 16px;text-shadow:0 1px 3px rgba(0,0,0,.6);pointer-events:none">${escHtml(story.body)}</div>` : ''}
            </div>`;

          // Autoplay with sound; browsers may block unmuted autoplay — fall back to muted then unmute
          const vid = document.getElementById('svVideo');
          const pauseIcon = document.getElementById('svPauseIcon');
          let pauseIconTimer = null;

          function showPauseIcon() {
            if (!pauseIcon) return;
            pauseIcon.style.display = 'flex';
            clearTimeout(pauseIconTimer);
            pauseIconTimer = setTimeout(() => { pauseIcon.style.display = 'none'; }, 800);
          }

          if (vid) {
            vid.muted = false;
            vid.play().catch(() => {
              // Autoplay blocked without mute — play muted first, then unmute on user gesture
              vid.muted = true;
              vid.play().catch(() => {});
              const unmute = () => { vid.muted = false; document.removeEventListener('click', unmute); };
              document.addEventListener('click', unmute, { once: true });
            });

            // Tap on video wrap toggles pause/play + shows pause icon
            const wrap = document.getElementById('svVideoWrap');
            if (wrap) {
              wrap.addEventListener('click', e => {
                // Don't fire if user tapped the tap-left / tap-right overlay areas
                e.stopPropagation();
                if (vid.paused) {
                  vid.play().catch(() => {});
                } else {
                  vid.pause();
                  showPauseIcon();
                }
              });
            }

            // Sync story timer to actual video duration once metadata loads
            vid.addEventListener('loadedmetadata', () => {
              if (!vid.duration || !isFinite(vid.duration)) return;
              const vidDurMs = Math.min(vid.duration * 1000, 60000); // cap 60s
              stopTimer();
              _progStart = Date.now();
              const activeFill = document.querySelector('.sv-prog-bar.active .sv-prog-fill');
              if (activeFill) {
                activeFill.style.transition = `width ${vidDurMs}ms linear`;
                activeFill.style.width = '100%';
              }
              _storyTimer = setTimeout(() => advanceStory(1), vidDurMs);
            }, { once: true });
          }
        } else {
          svBody.innerHTML = `
            <div class="sv-story-media" style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;padding:0;position:relative">
              <img src="${escHtml(firstMedia.url)}" style="max-width:100%;max-height:100%;width:auto;height:auto;display:block;object-fit:contain">
              ${story.title ? `<div class="sv-story-title" style="position:absolute;bottom:70px;left:0;right:0;text-align:center;color:#fff;padding:8px 16px;text-shadow:0 1px 4px rgba(0,0,0,.7)">${escHtml(story.title)}</div>` : ''}
              ${story.body  ? `<div class="sv-story-text"  style="position:absolute;bottom:44px;left:0;right:0;text-align:center;color:rgba(255,255,255,.9);font-size:13px;padding:0 16px;text-shadow:0 1px 3px rgba(0,0,0,.6)">${escHtml(story.body)}</div>` : ''}
            </div>`;
        }
      }
    } else {
      // Text-only story — original colour background rendering
      if (svCard) svCard.style.background = '';
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
    }

    // Show delete button only for own stories
    const svDeleteBtn = document.getElementById('svDeleteBtn');
    if (svDeleteBtn) {
      const myId = window._currentUserId;
      const isOwn = myId && myId === story.userId;
      svDeleteBtn.style.display = isOwn ? '' : 'none';
      svDeleteBtn.dataset.storyId = story.id;
      svDeleteBtn.dataset.groupIdx = _curGroup;
    }

    // Tap areas — pause video on tap-left, don't auto-advance during video
    const tapL = document.getElementById('svTapLeft');
    const tapR = document.getElementById('svTapRight');
    if (tapL) tapL.onclick = () => advanceStory(-1);
    if (tapR) tapR.onclick = () => advanceStory(1);

    // For video stories the timer is set after loadedmetadata (above); for others set now
    const isVideoStory = firstMedia && isVidMime(firstMedia.mimetype);
    if (!isVideoStory) {
      stopTimer();
      _progStart = Date.now();
      const fill = document.querySelector('.sv-prog-bar.active .sv-prog-fill');
      if (fill) {
        fill.style.transition = `width ${STORY_DURATION_MS}ms linear`;
        fill.style.width = '100%';
      }
      _storyTimer = setTimeout(() => advanceStory(1), STORY_DURATION_MS);
    }
    // (video timer is started inside the loadedmetadata handler above)
  }

  // Wire close button
  document.getElementById('svClose')?.addEventListener('click', closeViewer);
  // Close on overlay bg click
  document.getElementById('storyViewerOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('storyViewerOverlay')) closeViewer();
  });

  // Delete story button
  document.getElementById('svDeleteBtn')?.addEventListener('click', async e => {
    e.stopPropagation();
    const btn     = e.currentTarget;
    const storyId = btn.dataset.storyId;
    const gIdx    = parseInt(btn.dataset.groupIdx, 10);
    if (!storyId) return;
    if (!confirm('Delete this story? This cannot be undone.')) return;
    const t = localStorage.getItem('diary_token');
    if (!t) return;
    try {
      btn.disabled = true;
      btn.textContent = 'Deleting…';
      const r = await fetch(`/api/notes/${storyId}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + t },
      });
      if (!r.ok) throw new Error('Delete failed');
      // Remove from in-memory groups
      if (_groups[gIdx]) {
        _groups[gIdx].stories = _groups[gIdx].stories.filter(s => s.id !== storyId);
        if (_groups[gIdx].stories.length === 0) {
          _groups.splice(gIdx, 1);
          closeViewer();
          // reload story bar
          load();
          return;
        }
      }
      // Move to next story or close
      if (_curStory >= _groups[gIdx]?.stories.length) _curStory = Math.max(0, _curStory - 1);
      renderSlide();
      // reload story bar to remove the bubble
      load();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '🗑 Delete';
      alert('Could not delete story: ' + err.message);
    }
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

  function isVidMime(m) { return (m||'').startsWith('video/'); }
  function buildGfMedia(media) {
    if (!media || !media.length) return '';
    return media.map(m => isVidMime(m.mimetype)
      ? `<div class="feed-media-item"><video src="${escHtml(m.url)}" controls playsinline preload="metadata" style="display:block;width:100%;height:auto;max-width:100%;border-radius:8px;background:#000"></video></div>`
      : `<div class="feed-media-item"><img src="${escHtml(m.url)}" loading="lazy" decoding="async" style="display:block;width:100%;height:auto;max-width:100%;border-radius:8px;object-fit:contain"></div>`
    ).join('');
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
    const mediaHtml = buildGfMedia(note.media);

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
          ${mediaHtml ? `<div class="feed-card-media">${mediaHtml}</div>` : ''}
          ${!mediaHtml ? `<p class="feed-card-text">${escHtml((note.body||'').slice(0,280))}${(note.body||'').length>280?'…':''}</p>` : (note.body ? `<p class="feed-card-text" style="margin-top:8px">${escHtml((note.body||'').slice(0,200))}${(note.body||'').length>200?'…':''}</p>` : '')}
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
