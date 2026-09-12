// ── WebSocket Client ──────────────────────────────────────────────────────────
// Singleton WS connection. Exposes window.WS = { wsConnect, wsDisconnect, wsSend }
(function () {
  let ws = null;
  let reconnectTimer = null;
  let reconnectDelay = 1000;
  let _token = null;
  let _intentionallyClosed = false;

  function getWsUrl(token) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`;
  }

  function dispatch(data) {
    try {
      if (data.type === 'pong') return;
      if (data.type === 'connected') return;
      if (data.type === 'new_message' || data.type === 'message_sent') {
        window.Chat?.handleIncoming?.(data);
        return;
      }
      if (data.type === 'notification') {
        window.Notif?.handleIncoming?.(data.notification);
        return;
      }
    } catch (e) {
      console.warn('[WS] dispatch error', e);
    }
  }

  function connect(token) {
    if (!token) return;
    _token = token;
    _intentionallyClosed = false;

    ws = new WebSocket(getWsUrl(token));

    ws.onopen = () => {
      reconnectDelay = 1000;
      // Keep-alive ping every 25s
      ws._pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
      }, 25000);
    };

    ws.onmessage = (e) => {
      try { dispatch(JSON.parse(e.data)); } catch {}
    };

    ws.onclose = () => {
      clearInterval(ws._pingInterval);
      if (_intentionallyClosed) return;
      // Exponential back-off reconnect (max 30s)
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        connect(_token);
      }, reconnectDelay);
    };

    ws.onerror = () => { /* onclose will handle reconnect */ };
  }

  function disconnect() {
    _intentionallyClosed = true;
    clearTimeout(reconnectTimer);
    if (ws) { clearInterval(ws._pingInterval); ws.close(); ws = null; }
    _token = null;
  }

  function send(type, payload) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ...payload }));
    }
  }

  window.WS = { wsConnect: connect, wsDisconnect: disconnect, wsSend: send };
})();
