// ── Types ──────────────────────────────────────────────────────────────────
export interface User {
  userId: string;
  username: string;
  displayName: string;
  bio?: string;
}

export interface MediaItem {
  id: string;
  url: string;
  mimetype: string;
}

export interface Reply {
  id: string;
  userId: string | null;
  name: string;
  text: string;
  createdAt: string;
  reactions?: Record<string, number>;
  userReactions?: string[];
}

export interface Note {
  id: string;
  userId: string;
  title: string;
  body: string;
  font: string;
  fontSize: number;
  fontWeight: string;
  colorIdx: number;
  musicUrl: string;
  views: number;
  createdAt: string;
  editedAt: string | null;
  reactions: Record<string, number>;
  userReactions?: string[];
  replies: Reply[];
  media: MediaItem[];
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  bio: string;
}

// ── Palette ────────────────────────────────────────────────────────────────
export const PALETTE = [
  { bg: "#2a1f14", accent: "#d4a96a" },
  { bg: "#12202e", accent: "#5b9bd5" },
  { bg: "#112214", accent: "#4caf7a" },
  { bg: "#28121e", accent: "#d55b7f" },
  { bg: "#28220c", accent: "#c9a020" },
  { bg: "#1c1228", accent: "#8b5bd5" },
  { bg: "#0f2222", accent: "#1aadad" },
  { bg: "#26150e", accent: "#cc5a35" },
];

export const EMOJIS = ["❤️","😂","😢","😮","😍","🙏","👏","🔥","🎉","😆"];

// ── Formatters ─────────────────────────────────────────────────────────────
export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
  });
}
export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit",
  });
}

// ── API ────────────────────────────────────────────────────────────────────
const BASE = "/api";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("diary_token");
}
export function setToken(t: string) { localStorage.setItem("diary_token", t); }
export function clearToken()        { localStorage.removeItem("diary_token"); }

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  get:    <T>(path: string)                     => req<T>("GET",    path),
  post:   <T>(path: string, body: unknown)      => req<T>("POST",   path, body),
  put:    <T>(path: string, body: unknown)      => req<T>("PUT",    path, body),
  delete: <T>(path: string)                     => req<T>("DELETE", path),
};

export async function uploadMedia(noteId: string, files: File[]): Promise<MediaItem[]> {
  const fd = new FormData();
  files.forEach(f => fd.append("files", f));
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/upload/${noteId}`, { method: "POST", headers, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data as MediaItem[];
}
