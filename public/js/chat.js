// ── Chat Panel ────────────────────────────────────────────────────────────────
// Exposes window.Chat = { openChatPanel, startConversation, handleIncoming, openByMessageId }
(function () {
  let _conversations = [];
  let _activeConvId  = null;
  let _messages      = [];
  let _panelOpen     = false;
  let _windowOpen    = false;
  let _unread        = 0;
  let _editingMsgId  = null;  // id of message being edited, or null

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

  async function apiForm(path, formData) {
    const res = await fetch(path, { method: 'POST', headers: { ...authHeader() }, body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload error');
    return data;
  }

  // ── Unread badge ─────────────────────────────────────────────────────────────
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
    document.getElementById('chatPanel')?.classList.add('open');
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

      // ── Admin pinned entry (always at top) ──────────────────────────────────
      const adminPin = await api('GET', '/api/complaints/admin-user').catch(() => null);
      const adminPinHtml = adminPin?.userId ? (() => {
        const adminConv = _conversations.find(c => c.other?.id === adminPin.userId);
        const unread = adminConv?.unreadCount > 0 ? `<span class="chat-unread-badge">${adminConv.unreadCount}</span>` : '';
        const last   = adminConv?.lastMessage?.body || 'Chat with Support';
        return `<div class="chat-conv-item chat-conv-admin-pin" data-admin-uid="${adminPin.userId}" style="border-bottom:1.5px solid var(--border2)">
          <div class="chat-av" style="background:rgba(184,50,50,.1);border:1.5px solid rgba(184,50,50,.3);display:flex;align-items:center;justify-content:center;font-size:14px">🛡️</div>
          <div class="chat-conv-info">
            <div class="chat-conv-name" style="color:var(--red)">Support / Admin${unread}</div>
            <div class="chat-conv-last">${escHtml(last.slice(0, 40))}</div>
          </div>
          <span style="font-size:9px;font-weight:700;letter-spacing:.5px;color:var(--red);background:rgba(184,50,50,.08);border:1px solid rgba(184,50,50,.2);border-radius:99px;padding:2px 7px;flex-shrink:0">PINNED</span>
        </div>`;
      })() : '';

      if (!_conversations.length && !adminPinHtml) {
        list.innerHTML = '<div class="chat-empty">No conversations yet.<br>Open a profile and tap Message.</div>';
        return;
      }
      list.innerHTML = adminPinHtml + _conversations.map(c => {
        const name  = c.other?.displayName || c.other?.username || 'Unknown';
        const uid   = c.other?.id || '';
        const last  = c.lastMessage?.body || (c.lastMessage?.mediaType ? '📎 Media' : '');
        const unread = c.unreadCount > 0 ? `<span class="chat-unread-badge">${c.unreadCount}</span>` : '';
        const av    = c.other?.avatarUrl
          ? `<img src="${c.other.avatarUrl}" class="chat-av-img">`
          : `<div class="chat-av-init">${name.charAt(0).toUpperCase()}</div>`;
        return `
          <div class="chat-conv-item${_activeConvId === c.id ? ' active' : ''}" data-conv="${c.id}" data-uid="${uid}">
            <div class="chat-av chat-av-profile" data-uid="${uid}" style="cursor:pointer" title="View profile">${av}</div>
            <div class="chat-conv-info">
              <div class="chat-conv-name chat-name-profile" data-uid="${uid}" style="cursor:pointer">${name}${unread}</div>
              <div class="chat-conv-last">${escHtml(last.slice(0, 40))}${last.length > 40 ? '…' : ''}</div>
            </div>
          </div>`;
      }).join('');
      list.querySelectorAll('[data-conv]').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('.chat-av-profile') || e.target.closest('.chat-name-profile')) {
            const uid = e.target.closest('[data-uid]')?.dataset.uid;
            if (uid) { e.stopPropagation(); window.openUserProfile?.(uid); return; }
          }
          openConversation(el.dataset.conv);
        });
      });
      // Admin pinned item click — start or open conversation
      list.querySelector('.chat-conv-admin-pin')?.addEventListener('click', () => {
        const uid = list.querySelector('.chat-conv-admin-pin').dataset.adminUid;
        if (uid) startConversation(uid);
      });
    } catch (e) {
      list.innerHTML = `<div class="chat-empty">Error: ${e.message}</div>`;
    }
  }

  // ── Chat Window ───────────────────────────────────────────────────────────────
  async function openConversation(convId) {
    _activeConvId = convId;
    _windowOpen   = true;
    document.getElementById('chatWindow')?.classList.add('open');
    const conv  = _conversations.find(c => c.id === convId);
    const other = conv?.other;
    const title = other?.displayName || other?.username || 'Chat';
    const titleEl = document.getElementById('chatWindowTitle');
    const avEl    = document.getElementById('chatWindowAv');
    if (titleEl) { titleEl.textContent = title; titleEl.dataset.uid = other?.id || ''; }
    if (avEl) {
      avEl.innerHTML = other?.avatarUrl
        ? `<img src="${other.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">`
        : title.charAt(0).toUpperCase();
    }
    await loadMessages(convId);
    try { await api('PUT', `/api/messages/${convId}/read`); } catch {}
    if (conv) conv.unreadCount = 0;
    _unread = _conversations.reduce((s, c) => s + (c.unreadCount || 0), 0);
    updateChatBadge();
    loadConversations();
  }

  async function loadMessages(convId) {
    const body = document.getElementById('chatMsgBody');
    if (!body) return;
    body.innerHTML = '<div class="chat-loading">Loading…</div>';
    try {
      const data = await api('GET', `/api/messages/${convId}?limit=50`);
      _messages = data.messages || [];
      renderMessages();
    } catch (e) {
      body.innerHTML = `<div class="chat-empty">Error: ${e.message}</div>`;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  function renderMediaBubble(m) {
    if (!m.mediaUrl) return '';
    if (m.mediaType === 'image') {
      return `<img src="${m.mediaUrl}" style="max-width:200px;max-height:200px;border-radius:8px;display:block;margin-bottom:4px;cursor:pointer"
                onclick="window.open('${m.mediaUrl}','_blank')">`;
    }
    if (m.mediaType === 'audio') {
      return `<audio controls src="${m.mediaUrl}" style="max-width:220px;margin-bottom:4px"></audio>`;
    }
    if (m.mediaType === 'video') {
      return `<video controls src="${m.mediaUrl}" style="max-width:220px;border-radius:8px;margin-bottom:4px"></video>`;
    }
    return `<a href="${m.mediaUrl}" target="_blank" style="color:inherit;font-size:12px">📎 Attachment</a>`;
  }

  function renderMessages() {
    const body = document.getElementById('chatMsgBody');
    if (!body) return;
    const myId = window._currentUserId;
    if (!_messages.length) {
      body.innerHTML = '<div class="chat-empty">No messages yet. Say hello! 👋</div>';
      return;
    }
    body.innerHTML = _messages.map(m => {
      const mine = m.senderId === myId;
      const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const editedMark = m.editedAt ? ' <span style="font-size:10px;opacity:.6">edited</span>' : '';
      const mediaPart  = m.isDeleted ? '' : renderMediaBubble(m);
      const textPart   = m.isDeleted
        ? `<span style="font-style:italic;opacity:.5">This message was deleted</span>`
        : (m.body ? escHtml(m.body) : '');

      const actions = (mine && !m.isDeleted) ? `
        <div class="chat-msg-actions" data-id="${m.id}">
          ${m.body ? `<button class="chat-act-btn" data-edit="${m.id}" title="Edit">✏️</button>` : ''}
          <button class="chat-act-btn" data-del="${m.id}" title="Delete">🗑</button>
        </div>` : '';

      return `<div class="chat-msg${mine ? ' chat-msg-mine' : ' chat-msg-theirs'}" data-msgid="${m.id}">
        ${actions}
        <div class="chat-bubble">
          ${mediaPart}
          ${textPart ? `<div>${textPart}${editedMark}</div>` : ''}
        </div>
        <div class="chat-msg-time">${time}</div>
      </div>`;
    }).join('');

    // Bind edit/delete buttons
    body.querySelectorAll('[data-edit]').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); startEdit(btn.dataset.edit); };
    });
    body.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); deleteMsg(btn.dataset.del); };
    });

    body.scrollTop = body.scrollHeight;
  }

  // ── Edit ──────────────────────────────────────────────────────────────────────
  function startEdit(msgId) {
    const msg = _messages.find(m => m.id === msgId);
    if (!msg) return;
    _editingMsgId = msgId;
    const input = document.getElementById('chatInput');
    if (input) { input.value = msg.body; input.focus(); }
    const bar = document.getElementById('chatEditBar');
    if (bar) { bar.style.display = ''; bar.querySelector('.chat-edit-text').textContent = 'Editing message…'; }
  }

  function cancelEdit() {
    _editingMsgId = null;
    const input = document.getElementById('chatInput');
    if (input) input.value = '';
    const bar = document.getElementById('chatEditBar');
    if (bar) bar.style.display = 'none';
  }

  async function deleteMsg(msgId) {
    if (!confirm('Delete this message?')) return;
    try {
      await api('DELETE', `/api/messages/${_activeConvId}/${msgId}`);
      const m = _messages.find(x => x.id === msgId);
      if (m) { m.isDeleted = true; m.body = ''; m.mediaUrl = ''; m.mediaType = ''; }
      renderMessages();
    } catch (e) { alert('Delete failed: ' + e.message); }
  }

  // ── Send / Edit submit ────────────────────────────────────────────────────────
  async function sendMessage() {
    const input = document.getElementById('chatInput');
    const body  = input?.value.trim();
    if (!body || !_activeConvId) return;

    // If editing an existing message
    if (_editingMsgId) {
      try {
        const data = await api('PUT', `/api/messages/${_activeConvId}/${_editingMsgId}`, { body });
        const idx = _messages.findIndex(m => m.id === _editingMsgId);
        if (idx !== -1) _messages[idx] = data.message;
        cancelEdit();
        renderMessages();
      } catch (e) { alert('Edit failed: ' + e.message); }
      return;
    }

    input.value = '';
    if (window.WS) {
      window.WS.wsSend('message', { conversationId: _activeConvId, body });
    } else {
      try {
        const data = await api('POST', `/api/messages/${_activeConvId}`, { body });
        _messages.push(data.message);
        renderMessages();
      } catch (e) { input.value = body; alert('Send failed: ' + e.message); }
    }
  }

  // ── Media upload ─────────────────────────────────────────────────────────────
  async function sendMedia(file) {
    if (!_activeConvId) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const data = await apiForm(`/api/messages/${_activeConvId}/media`, form);
      _messages.push(data.message);
      renderMessages();
    } catch (e) { alert('Upload failed: ' + e.message); }
  }

  function closeChatWindow() {
    _windowOpen   = false;
    _activeConvId = null;
    cancelEdit();
    document.getElementById('chatWindow')?.classList.remove('open');
  }

  // ── Start conversation ────────────────────────────────────────────────────────
  async function startConversation(userId) {
    try {
      const data = await api('POST', '/api/conversations', { userId });
      if (!_panelOpen) await openChatPanel();
      await openConversation(data.conversationId);
    } catch (e) { alert('Could not open chat: ' + e.message); }
  }

  // ── Notification sound ────────────────────────────────────────────────────────
  function playMsgSound() {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
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

  // ── Incoming WS events ────────────────────────────────────────────────────────
  function handleIncoming(event) {
    if (event.type === 'new_message') {
      const msg  = event.message;
      const conv = _conversations.find(c => c.id === msg.conversationId);
      if (conv) {
        conv.lastMessage = { body: msg.body, mediaType: msg.mediaType, senderId: msg.senderId };
        if (msg.conversationId !== _activeConvId || !_windowOpen) {
          conv.unreadCount = (conv.unreadCount || 0) + 1;
          _unread++;
          updateChatBadge();
          playMsgSound();
        }
      }
      if (msg.conversationId === _activeConvId && _windowOpen) {
        _messages.push(msg);
        renderMessages();
        api('PUT', `/api/messages/${_activeConvId}/read`).catch(() => {});
      }
      if (_panelOpen) loadConversations();
    }
    if (event.type === 'message_sent') {
      const msg = event.message;
      if (msg.conversationId === _activeConvId) {
        _messages.push(msg);
        renderMessages();
      }
    }
    if (event.type === 'message_edited') {
      const msg = event.message;
      if (msg.conversationId === _activeConvId) {
        const idx = _messages.findIndex(m => m.id === msg.id);
        if (idx !== -1) _messages[idx] = msg;
        renderMessages();
      }
    }
    if (event.type === 'message_deleted') {
      if (event.conversationId === _activeConvId) {
        const m = _messages.find(x => x.id === event.messageId);
        if (m) { m.isDeleted = true; m.body = ''; m.mediaUrl = ''; m.mediaType = ''; }
        renderMessages();
      }
    }
  }

  async function openByMessageId(msgId) {
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

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── DOM wiring ────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('chatSendBtn')?.addEventListener('click', sendMessage);
    document.getElementById('chatInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      if (e.key === 'Escape' && _editingMsgId) cancelEdit();
    });
    document.getElementById('chatWindowClose')?.addEventListener('click', closeChatWindow);
    document.getElementById('chatPanelClose')?.addEventListener('click', closeChatPanel);
    document.getElementById('chatWindowHeader')?.addEventListener('click', (e) => {
      if (e.target.closest('#chatWindowClose')) return;
      const uid = document.getElementById('chatWindowTitle')?.dataset.uid;
      if (uid) window.openUserProfile?.(uid);
    });

    // Cancel edit bar
    document.getElementById('chatEditCancel')?.addEventListener('click', cancelEdit);

    // Media attach button
    document.getElementById('chatAttachBtn')?.addEventListener('click', () => {
      document.getElementById('chatFileInput')?.click();
    });
    document.getElementById('chatFileInput')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) sendMedia(file);
      e.target.value = '';
    });
  });

  window.Chat = { openChatPanel, startConversation, handleIncoming, openByMessageId };
})();
