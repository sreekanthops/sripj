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
              <div class="feed-author-name">${escHtml(a.displayName || a.username)}</div>
              <div class="feed-author-handle">@${escHtml(a.username)} · ${relTime(note.createdAt)}</div>
            </div>
            ${!isOwnNote && myId ? `<button class="feed-follow-btn${isFollowing ? ' following' : ''}" data-uid="${escHtml(a.id)}">${isFollowing ? '✓ Following' : '+ Follow'}</button>` : ''}
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
          container.innerHTML = '<div class="feed-empty">No public notes yet. Be the first to share! 🌍</div>';
        }
        return;
      }
      data.notes.forEach(note => {
        const div = document.createElement('div');
        div.innerHTML = renderFeedCard(note);
        container.insertBefore(div.firstElementChild, _sentinel);
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

  function bindCardEvents() {
    const container = document.getElementById('feedCards');
    if (!container) return;

    // Follow buttons
    container.querySelectorAll('.feed-follow-btn[data-uid]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
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

    // Author avatar/name → visit diary
    container.querySelectorAll('.feed-av[data-uname]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const uname = el.dataset.uname;
        if (uname) window.location.href = '/@' + encodeURIComponent(uname);
      };
    });

    // React button — open note detail for emoji reactions
    container.querySelectorAll('.feed-react-btn[data-note-id]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        window.openNoteById?.(btn.dataset.noteId);
      };
    });

    // Comment button
    container.querySelectorAll('.feed-comment-btn[data-note-id]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
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

    // Message button
    container.querySelectorAll('.feed-msg-btn[data-uid]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
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

  function showFeed() {
    const feedScreen  = document.getElementById('feedScreen');
    const notesSection = document.getElementById('notesSection');
    if (feedScreen)   feedScreen.style.display  = '';
    if (notesSection) notesSection.style.display = 'none';
    setActiveNavTab('feed');
    if (_page === 1) loadMore();
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

  window.Feed = { initFeed, showFeed, hideFeed };
})();
