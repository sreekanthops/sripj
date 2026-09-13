"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell } from "lucide-react";
import { api, getToken } from "@/lib/api";

interface Notif {
  id: string;
  type: string;
  read: boolean;
  createdAt: string;
  noteId: string | null;
  noteTitle: string | null;
  actor: { id: string; username: string; displayName: string; avatarUrl: string } | null;
}

const TYPE_LABEL: Record<string, string> = {
  tagged_post:      "tagged you in a post",
  tagged_seen:      "saw your post",
  tagged_no_response: "scrolled past your post",
  like:             "reacted to your entry",
  reply:            "replied to your entry",
  follow:           "started following you",
  message:          "sent you a message",
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)   return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function NotificationBell({ onNoteOpen }: { onNoteOpen?: (noteId: string) => void }) {
  const [count,    setCount]    = useState(0);
  const [open,     setOpen]     = useState(false);
  const [notifs,   setNotifs]   = useState<Notif[]>([]);
  const [loading,  setLoading]  = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Poll unread count every 30s ────────────────────────────────────────────
  const fetchCount = useCallback(async () => {
    try {
      const d = await api.get<{ count: number }>("/notifications/unread-count");
      setCount(d.count);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchCount();
    const t = setInterval(fetchCount, 30_000);
    return () => clearInterval(t);
  }, [fetchCount]);

  // ── WebSocket — real-time badge bump ───────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${token}`);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "notification") {
          setCount(c => c + 1);
          // If panel is open, prepend live notification
          if (open) {
            const n = msg.notification as Notif;
            setNotifs(prev => [{ ...n, read: false } as Notif, ...prev]);
          }
        }
      } catch { /* ignore */ }
    };

    const ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" })); }, 25_000);
    return () => { clearInterval(ping); ws.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Open panel — fetch & mark read ────────────────────────────────────────
  const openPanel = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setLoading(true);
    try {
      const d = await api.get<{ notifications: Notif[] }>("/notifications");
      setNotifs(d.notifications);
      // Mark all read
      await api.put("/notifications/read", {});
      setCount(0);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  // ── Close on outside click ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleClick = (n: Notif) => {
    if (n.noteId && onNoteOpen) {
      onNoteOpen(n.noteId);
      setOpen(false);
    }
  };

  return (
    <div ref={panelRef} className="notif-bell-wrap">
      <button className="notif-bell-btn" onClick={openPanel} title="Notifications" aria-label="Notifications">
        <Bell size={18} strokeWidth={1.7} />
        {count > 0 && <span className="notif-badge">{count > 99 ? "99+" : count}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span>Notifications</span>
          </div>

          {loading ? (
            <div className="notif-empty">Loading…</div>
          ) : notifs.length === 0 ? (
            <div className="notif-empty">You&apos;re all caught up ✦</div>
          ) : (
            <ul className="notif-list">
              {notifs.map(n => (
                <li
                  key={n.id}
                  className={`notif-item${n.read ? "" : " notif-item-unread"}${n.noteId ? " notif-item-clickable" : ""}`}
                  onClick={() => handleClick(n)}
                >
                  {/* Avatar */}
                  <div className="notif-avatar">
                    {n.actor?.avatarUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={n.actor.avatarUrl} alt="" />
                      : <span>{(n.actor?.displayName || n.actor?.username || "?")[0].toUpperCase()}</span>
                    }
                  </div>

                  {/* Text */}
                  <div className="notif-body">
                    <p className="notif-text">
                      {n.actor
                        ? <><strong>{n.actor.displayName || n.actor.username}</strong> {TYPE_LABEL[n.type] || n.type}</>
                        : <span className="notif-system">{TYPE_LABEL[n.type] || n.type}</span>
                      }
                      {n.noteTitle && (
                        <span className="notif-note-title"> &ldquo;{n.noteTitle}&rdquo;</span>
                      )}
                    </p>
                    <span className="notif-time">{timeAgo(n.createdAt)}</span>
                  </div>

                  {/* Unread dot */}
                  {!n.read && <span className="notif-dot" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
