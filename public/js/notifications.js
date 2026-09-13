// ── Notifications ─────────────────────────────────────────────────────────────
// Exposes window.Notif = { init, handleIncoming, updateBadge }
(function () {
  const API = '/api/notifications';
  let _items = [];
  let _open  = false;

  // ── helpers ─────────────────────────────────────────────────────────────────
  function authHeader() {
    const t = localStorage.getItem('diary_token');
    return t ? { Authorization: 'Bearer ' + t } : {};
  }

  async function fetchJson(path) {
    const res = await fetch(API + path, { headers: authHeader() });
    if (!res.ok) return null;
    return res.json();
  }

  function relTime(iso) {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60)   return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  function typeIcon(type) {
    return { follow: '👤', reaction: '❤️', reply: '💬', message: '✉️' }[type] || '🔔';
  }

  function typeText(n) {
    const name = n.actor?.displayName || n.actor?.username || 'Someone';
    if (n.type === 'follow')   return `${name} started following you`;
    if (n.type === 'reaction') return `${name} reacted to "${n.noteTitle || 'your note'}"`;
    if (n.type === 'reply')    return `${name} replied to "${n.noteTitle || 'your note'}"`;
    if (n.type === 'message')  return `${name} sent you a message`;
    return 'New notification';
  }

  // ── Badge ────────────────────────────────────────────────────────────────────
  function updateBadge(count) {
    const el = document.getElementById('notifBadge');
    if (!el) return;
    if (count > 0) {
      el.textContent = count > 99 ? '99+' : count;
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  }

  async function refreshUnread() {
    const data = await fetchJson('/unread-count');
    if (data) updateBadge(data.count);
  }

  // ── Dropdown render ───────────────────────────────────────────────────────────
  function renderDropdown() {
    const list = document.getElementById('notifList');
    if (!list) return;
    if (!_items.length) {
      list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
      return;
    }
    list.innerHTML = _items.map(n => `
      <div class="notif-item${n.read ? '' : ' notif-unread'}" data-notif-id="${n.id}" data-type="${n.type}" data-note-id="${n.noteId || ''}" data-msg-id="${n.messageId || ''}" data-actor-id="${n.actor?.id || ''}">
        <span class="notif-icon">${typeIcon(n.type)}</span>
        <div class="notif-body">
          <div class="notif-text">${typeText(n)}</div>
          <div class="notif-time">${relTime(n.createdAt)}</div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', () => {
        const type    = el.dataset.type;
        const noteId  = el.dataset.noteId;
        const msgId   = el.dataset.msgId;
        const actorId = el.dataset.actorId;
        closeDropdown();
        if (type === 'message' && actorId) {
          // Open chat with this user directly
          window.Chat?.startConversation?.(actorId);
        } else if (type === 'follow' && actorId) {
          // Open the follower's profile
          window.openUserProfile?.(actorId);
        } else if (noteId) {
          window.openNoteById?.(noteId);
        }
        // mark this notification read
        fetch(API + '/read', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeader() }, body: JSON.stringify({ id: el.dataset.notifId }) }).catch(() => {});
      });
    });
  }

  async function openDropdown() {
    _open = true;
    const dd = document.getElementById('notifDropdown');
    if (dd) dd.classList.add('open');
    const data = await fetchJson('');
    if (data) {
      _items = data.notifications;
      renderDropdown();
    }
    // mark all read
    fetch(API + '/read', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeader() }, body: JSON.stringify({}) });
    updateBadge(0);
  }

  function closeDropdown() {
    _open = false;
    const dd = document.getElementById('notifDropdown');
    if (dd) dd.classList.remove('open');
  }

  // ── Incoming WS notification ────────────────────────────────────────────────
  function handleIncoming(notif) {
    _items.unshift({ ...notif, read: false });
    const currentCount = parseInt(document.getElementById('notifBadge')?.textContent || '0') || 0;
    updateBadge(currentCount + 1);
    if (_open) renderDropdown();
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    refreshUnread();
    // Re-check on window focus as WS fallback
    window.addEventListener('focus', refreshUnread);

    const bell = document.getElementById('notifBell');
    if (bell) {
      bell.addEventListener('click', (e) => {
        e.stopPropagation();
        if (_open) { closeDropdown(); } else { openDropdown(); }
      });
    }

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (_open && !e.target.closest('#notifDropdown') && !e.target.closest('#notifBell')) {
        closeDropdown();
      }
    });
  }

  window.Notif = { init, handleIncoming, updateBadge };
})();
