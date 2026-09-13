import { useEffect, useRef, useCallback } from 'react';
import { BASE_URL } from '../api/client';
import { getToken } from '../api/client';

const WS_URL = BASE_URL.replace(/^http/, 'ws') + '/ws';

// Singleton WS connection shared across screens
let _ws = null;
let _handlers = [];

export function addWSHandler(fn) {
  _handlers.push(fn);
  return () => { _handlers = _handlers.filter(h => h !== fn); };
}

export async function connectWS() {
  if (_ws && _ws.readyState <= 1) return; // already open / connecting
  const token = await getToken();
  if (!token) return;
  _ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
  _ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      _handlers.forEach(h => h(msg));
    } catch {}
  };
  _ws.onclose = () => {
    _ws = null;
    // reconnect after 4 seconds
    setTimeout(connectWS, 4000);
  };
}

export function disconnectWS() {
  if (_ws) { _ws.close(); _ws = null; }
}

export function wsSend(type, payload) {
  if (_ws && _ws.readyState === 1) {
    _ws.send(JSON.stringify({ type, ...payload }));
  }
}

// Hook — registers a message handler while the component is mounted
export function useWSMessage(handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const remove = addWSHandler((msg) => ref.current(msg));
    return remove;
  }, []);
}
