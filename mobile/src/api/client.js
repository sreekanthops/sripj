import * as SecureStore from 'expo-secure-store';

// ── Change to your production server URL before building for stores ──
export const BASE_URL = 'https://unsentstories.in';  // prod
// export const BASE_URL = 'http://192.168.1.x:3000'; // local dev

const TOKEN_KEY = 'diary_token';

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function setToken(t) {
  return SecureStore.setItemAsync(TOKEN_KEY, t);
}
export async function clearToken() {
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function apiFetch(path, opts = {}) {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  };
  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...opts,
    headers,
  });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Multipart form upload (images, audio)
export async function apiUpload(path, formData) {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
