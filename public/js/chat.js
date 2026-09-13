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
        const uid  = c.other?.id || '';
        const last = c.lastMessage?.body || '';
        const unread = c.unreadCount > 0 ? `<span class="chat-unread-badge">${c.unreadCount}</span>` : '';
        const av = c.other?.avatarUrl
          ? `<img src="${c.other.avatarUrl}" class="chat-av-img">`
          : `<div class="chat-av-init">${name.charAt(0).toUpperCase()}</div>`;
        return `
          <div class="chat-conv-item${_activeConvId === c.id ? ' active' : ''}" data-conv="${c.id}" data-uid="${uid}">
            <div class="chat-av chat-av-profile" data-uid="${uid}" style="cursor:pointer" title="View profile">${av}</div>
            <div class="chat-conv-info">
              <div class="chat-conv-name chat-name-profile" data-uid="${uid}" style="cursor:pointer">${name}${unread}</div>
              <div class="chat-conv-last">${last.slice(0, 40)}${last.length > 40 ? '…' : ''}</div>
            </div>
          </div>`;
      }).join('');

      list.querySelectorAll('[data-conv]').forEach(el => {
        // clicking anywhere on the row opens the conversation
        el.addEventListener('click', (e) => {
          // but if they clicked the avatar or name, open profile instead
          if (e.target.closest('.chat-av-profile') || e.target.closest('.chat-name-profile')) {
            const uid = e.target.closest('[data-uid]')?.dataset.uid;
            if (uid) { e.stopPropagation(); window.openUserProfile?.(uid); return; }
          }
          openConversation(el.dataset.conv);
        });
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

    const conv  = _conversations.find(c => c.id === convId);
    const other = conv?.other;
    const title = other?.displayName || other?.username || 'Chat';
    const titleEl = document.getElementById('chatWindowTitle');
    const avEl    = document.getElementById('chatWindowAv');
    if (titleEl) {
      titleEl.textContent = title;
      titleEl.dataset.uid = other?.id || '';
    }
    if (avEl) {
      avEl.innerHTML = other?.avatarUrl
        ? `<img src="${other.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">`
        : title.charAt(0).toUpperCase();
    }

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

  // ── Notification sound (tiny synth beep via Web Audio API) ───────────────────
  function playMsgSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
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
          playMsgSound();
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
    // Chat window header (av + title) → open user profile
    document.getElementById('chatWindowHeader')?.addEventListener('click', (e) => {
      if (e.target.closest('#chatWindowClose')) return; // don't trigger on close btn
      const uid = document.getElementById('chatWindowTitle')?.dataset.uid;
      if (uid) window.openUserProfile?.(uid);
    });
  });

  window.Chat = { openChatPanel, startConversation, handleIncoming, openByMessageId };
})();
