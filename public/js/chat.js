// ── Chat Panel ────────────────────────────────────────────────────────────────
// Exposes window.Chat = { openChatPanel, startConversation, handleIncoming, openByMessageId }
(function () {
  let _conversations = [];
  let _activeConvId  = null;
  let _messages      = [];
  let _panelOpen     = false;
  let _windowOpen    = false;
  let _unread        = 0;

  function authHeader() {
    const t = localStorage.getItem('diary_token');
    return t ? { Authorization: 'Bearer ' + t } : {};
  }

  async function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json', ...authHeader() } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error');
    return data;
  }

  // ── Unread badge on bottom nav chat icon ─────────────────────────────────────
  function updateChatBadge() {
    const badge = document.getElementById('chatNavBadge');
    if (!badge) return;
    if (_unread > 0) {
      badge.textContent = _unread > 99 ? '99+' : _unread;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  // ── Panel ─────────────────────────────────────────────────────────────────────
  async function openChatPanel() {
    _panelOpen = true;
    const panel = document.getElementById('chatPanel');
    if (panel) panel.classList.add('open');
    await loadConversations();
  }

  function closeChatPanel() {
    _panelOpen = false;
    document.getElementById('chatPanel')?.classList.remove('open');
  }

  async function loadConversations() {
    const list = document.getElementById('chatConvList');
    if (!list) return;
    list.innerHTML = '<div class="chat-loading">Loading…</div>';
    try {
      const data = await api('GET', '/api/conversations');
      _conversations = data.conversations || [];
      _unread = _conversations.reduce((s, c) => s + (c.unreadCount || 0), 0);
      updateChatBadge();

      if (!_conversations.length) {
        list.innerHTML = '<div class="chat-empty">No conversations yet.<br>Open a profile and tap Message.</div>';
        return;
      }
      list.innerHTML = _conversations.map(c => {
        const name = c.other?.displayName || c.other?.username || 'Unknown';
        const last = c.lastMessage?.body || '';
        const unread = c.unreadCount > 0 ? `<span class="chat-unread-badge">${c.unreadCount}</span>` : '';
        const av = c.other?.avatarUrl
          ? `<img src="${c.other.avatarUrl}" class="chat-av-img">`
          : `<div class="chat-av-init">${name.charAt(0).toUpperCase()}</div>`;
        return `
          <div class="chat-conv-item${_activeConvId === c.id ? ' active' : ''}" data-conv="${c.id}">
            <div class="chat-av">${av}</div>
            <div class="chat-conv-info">
              <div class="chat-conv-name">${name}${unread}</div>
              <div class="chat-conv-last">${last.slice(0, 40)}${last.length > 40 ? '…' : ''}</div>
            </div>
          </div>`;
      }).join('');

      list.querySelectorAll('[data-conv]').forEach(el => {
        el.addEventListener('click', () => openConversation(el.dataset.conv));
      });
    } catch (e) {
      list.innerHTML = `<div class="chat-empty">Error: ${e.message}</div>`;
    }
  }

  // ── Chat Window ───────────────────────────────────────────────────────────────
  async function openConversation(convId) {
    _activeConvId = convId;
    _windowOpen   = true;
    const win = document.getElementById('chatWindow');
    if (win) win.classList.add('open');

    const conv = _conversations.find(c => c.id === convId);
    const title = conv?.other?.displayName || conv?.other?.username || 'Chat';
    const titleEl = document.getElementById('chatWindowTitle');
    if (titleEl) titleEl.textContent = title;

    await loadMessages(convId);
    // Mark as read
    try { await api('PUT', `/api/messages/${convId}/read`); } catch {}
    if (conv) conv.unreadCount = 0;
    _unread = _conversations.reduce((s, c) => s + (c.unreadCount || 0), 0);
    updateChatBadge();
    loadConversations(); // refresh list
  }

  async function loadMessages(convId) {
    const body = document.getElementById('chatMsgBody');
    if (!body) return;
    body.innerHTML = '<div class="chat-loading">Loading…</div>';
    const myId = window._currentUserId;
    try {
      const data = await api('GET', `/api/messages/${convId}?limit=50`);
      _messages = data.messages || [];
      renderMessages(myId);
    } catch (e) {
      body.innerHTML = `<div class="chat-empty">Error: ${e.message}</div>`;
    }
  }

  function renderMessages(myId) {
    const body = document.getElementById('chatMsgBody');
    if (!body) return;
    if (!_messages.length) {
      body.innerHTML = '<div class="chat-empty">No messages yet. Say hello! 👋</div>';
      return;
    }
    body.innerHTML = _messages.map(m => {
      const mine = m.senderId === myId;
      const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `<div class="chat-msg${mine ? ' chat-msg-mine' : ' chat-msg-theirs'}">
        <div class="chat-bubble">${escHtml(m.body)}</div>
        <div class="chat-msg-time">${time}</div>
      </div>`;
    }).join('');
    body.scrollTop = body.scrollHeight;
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  async function sendMessage() {
    const input = document.getElementById('chatInput');
    const body  = input?.value.trim();
    if (!body || !_activeConvId) return;
    input.value = '';
    // Prefer WS for instant delivery
    if (window.WS) {
      window.WS.wsSend('message', { conversationId: _activeConvId, body });
    } else {
      try {
        const data = await api('POST', `/api/messages/${_activeConvId}`, { body });
        _messages.push(data.message);
        renderMessages(window._currentUserId);
      } catch (e) { input.value = body; alert('Send failed: ' + e.message); }
    }
  }

  function closeChatWindow() {
    _windowOpen    = false;
    _activeConvId  = null;
    document.getElementById('chatWindow')?.classList.remove('open');
  }

  // ── Start conversation from profile/feed ─────────────────────────────────────
  async function startConversation(userId) {
    try {
      const data = await api('POST', '/api/conversations', { userId });
      if (!_panelOpen) await openChatPanel();
      await openConversation(data.conversationId);
    } catch (e) { alert('Could not open chat: ' + e.message); }
  }

  // ── Incoming WS message ───────────────────────────────────────────────────────
  function handleIncoming(event) {
    if (event.type === 'new_message') {
      const msg = event.message;
      const conv = _conversations.find(c => c.id === msg.conversationId);
      if (conv) {
        conv.lastMessage = { body: msg.body, senderId: msg.senderId };
        if (msg.conversationId !== _activeConvId || !_windowOpen) {
          conv.unreadCount = (conv.unreadCount || 0) + 1;
          _unread++;
          updateChatBadge();
        }
      }
      if (msg.conversationId === _activeConvId && _windowOpen) {
        _messages.push(msg);
        renderMessages(window._currentUserId);
        // auto-mark read
        api('PUT', `/api/messages/${_activeConvId}/read`).catch(() => {});
      }
      if (_panelOpen) loadConversations();
    }
    if (event.type === 'message_sent') {
      const msg = event.message;
      if (msg.conversationId === _activeConvId) {
        _messages.push(msg);
        renderMessages(window._currentUserId);
      }
    }
  }

  async function openByMessageId(msgId) {
    // Find conversation that contains this message, then open it
    try {
      const data = await api('GET', '/api/conversations');
      _conversations = data.conversations || [];
      for (const c of _conversations) {
        const msgs = await api('GET', `/api/messages/${c.id}?limit=100`);
        const found = msgs.messages?.find(m => m.id === msgId);
        if (found) { await openChatPanel(); await openConversation(c.id); return; }
      }
    } catch {}
  }

  // ── Wire up DOM events ────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('chatSendBtn')?.addEventListener('click', sendMessage);
    document.getElementById('chatInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.getElementById('chatWindowClose')?.addEventListener('click', closeChatWindow);
    document.getElementById('chatPanelClose')?.addEventListener('click', closeChatPanel);
  });

  window.Chat = { openChatPanel, startConversation, handleIncoming, openByMessageId };
})();
