"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Calendar, Eye, Pencil, Trash2, Music,
  ChevronLeft, ChevronRight, Send, Edit2, Trash
} from "lucide-react";
import Modal from "./Modal";
import { api, fmtDate, fmtTime, PALETTE, EMOJIS } from "@/lib/api";
import type { Note, User } from "@/lib/api";

interface Props {
  noteId: string | null;
  notes: Note[];
  isOwner: boolean;
  currentUser: User | null;
  onClose: () => void;
  onEdit: (note: Note) => void;
  onDeleted: () => void;
  onNotesUpdate: (notes: Note[]) => void;
}

export default function NoteDetail({
  noteId, notes, isOwner, currentUser, onClose, onEdit, onDeleted, onNotesUpdate,
}: Props) {
  const [note,    setNote]    = useState<Note | null>(null);
  const [loading, setLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyName, setReplyName] = useState("");
  const [posting,   setPosting]   = useState(false);

  const idx    = notes.findIndex(n => n.id === noteId);
  const prevId = idx > 0               ? notes[idx - 1].id : null;
  const nextId = idx < notes.length - 1 ? notes[idx + 1].id : null;

  useEffect(() => {
    if (!noteId) return;
    setLoading(true);
    api.get<Note>(`/notes/${noteId}`)
      .then(n => {
        setNote(n);
        // update parent list
        onNotesUpdate(notes.map(x => x.id === n.id ? n : x));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const del = async () => {
    if (!note) return;
    if (!confirm("Delete this entry permanently?")) return;
    await api.delete(`/notes/${note.id}`);
    onDeleted();
  };

  const react = async (emoji: string) => {
    if (!note) return;
    const reactions = await api.post<Record<string, number>>(`/notes/${note.id}/react`, { emoji });
    const updated = { ...note, reactions };
    setNote(updated);
    onNotesUpdate(notes.map(x => x.id === updated.id ? updated : x));
  };

  const postReply = async () => {
    if (!note || !replyText.trim()) return;
    setPosting(true);
    try {
      await api.post(`/notes/${note.id}/replies`, {
        name: currentUser ? (currentUser.displayName || currentUser.username) : (replyName || "Anonymous"),
        text: replyText,
      });
      const updated = await api.get<Note>(`/notes/${note.id}`);
      setNote(updated);
      onNotesUpdate(notes.map(x => x.id === updated.id ? updated : x));
      setReplyText("");
    } finally { setPosting(false); }
  };

  const delReply = async (replyId: string) => {
    if (!note || !confirm("Delete this reply?")) return;
    await api.delete(`/notes/${note.id}/replies/${replyId}`);
    const updated = await api.get<Note>(`/notes/${note.id}`);
    setNote(updated);
    onNotesUpdate(notes.map(x => x.id === updated.id ? updated : x));
  };

  const p = note ? PALETTE[note.colorIdx || 0] : PALETTE[0];
  const fsCss: React.CSSProperties = note ? {
    fontWeight: note.fontWeight?.includes("bold") ? "bold" : "normal",
    fontStyle:  note.fontWeight?.includes("italic") ? "italic" : "normal",
  } : {};

  return (
    <Modal open={!!noteId} onClose={onClose}>
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[var(--color-paper-3)] border-t-[var(--color-accent)] rounded-full animate-spin" />
        </div>
      )}

      {!loading && note && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Title */}
          <h2 className="font-serif text-[28px] font-normal leading-snug tracking-tight word-break mb-3 pr-10"
            style={{ color: p.accent, fontFamily: note.font }}>
            {note.title}
          </h2>

          {/* Meta */}
          <div className="flex flex-wrap gap-4 text-[11px] font-medium uppercase tracking-[.5px] text-[var(--color-ink-4)] mb-5">
            <span className="flex items-center gap-1.5"><Calendar size={10}/>{fmtDate(note.createdAt)} · {fmtTime(note.createdAt)}</span>
            {isOwner && <span className="flex items-center gap-1.5"><Eye size={10}/>{note.views} views</span>}
            {note.editedAt && <span className="flex items-center gap-1.5"><Edit2 size={10}/>Edited {fmtDate(note.editedAt)}</span>}
          </div>

          {/* Music hint */}
          {note.musicUrl && (
            <p className="flex items-center gap-1.5 text-[12px] italic text-[var(--color-accent)] mb-4 font-serif">
              <Music size={12}/>Background music is playing
            </p>
          )}

          {/* Media */}
          {note.media?.length > 0 && (
            <MediaSlider items={note.media} noteId={note.id} isOwner={isOwner}
              onRemove={async (mid) => {
                await api.delete(`/upload/${note.id}/${mid}`);
                const up = await api.get<Note>(`/notes/${note.id}`);
                setNote(up); onNotesUpdate(notes.map(x => x.id === up.id ? up : x));
              }} />
          )}

          {/* Body */}
          <div
            className="text-[16px] leading-[1.95] whitespace-pre-wrap break-words
              px-6 py-5 rounded-[14px] bg-[var(--color-paper)] mb-6 border-l-2"
            style={{
              fontFamily: note.font,
              fontSize: note.fontSize || 14,
              borderLeftColor: p.accent,
              color: "var(--color-ink-2)",
              ...fsCss,
            }}
          >
            {note.body}
          </div>

          <Divider />

          {/* Reactions */}
          <p className="section-label">React</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {EMOJIS.map(e => (
              <motion.button key={e} whileTap={{ scale: 0.84 }} onClick={() => react(e)}
                className="text-[19px] px-2.5 py-1.5 bg-[var(--color-paper)] border border-[var(--color-border)]
                  rounded-[9px] cursor-pointer hover:bg-[var(--color-accent-light)] hover:border-[var(--color-accent-ring)]
                  transition-colors duration-150">
                {e}
              </motion.button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 min-h-[26px] mb-4">
            {Object.entries(note.reactions || {}).filter(([,v]) => v > 0).length > 0
              ? Object.entries(note.reactions || {}).filter(([,v]) => v > 0).map(([e, c]) => (
                  <span key={e} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px]
                    bg-[var(--color-accent-light)] border border-[var(--color-accent-ring)]">
                    {e} <b className="text-[var(--color-accent)] font-bold">{c}</b>
                  </span>
                ))
              : <span className="text-[12px] text-[var(--color-ink-4)]">Be the first to react!</span>
            }
          </div>

          <Divider />

          {/* Replies */}
          <p className="section-label">💬 Replies ({note.replies?.length || 0})</p>
          <div className="flex flex-col gap-2.5 mb-5">
            {note.replies?.length
              ? note.replies.map(r => {
                  const canDel = currentUser && (r.userId === currentUser.userId || isOwner);
                  return (
                    <div key={r.id} className="bg-[var(--color-paper)] border border-[var(--color-border)]
                      rounded-[9px] px-4 py-3">
                      <div className="flex items-center justify-between flex-wrap gap-1 mb-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-[.5px] text-[var(--color-accent)]">
                          👤 {r.name || "Anonymous"}
                        </span>
                        <div className="flex items-center gap-2">
                          <small className="text-[10px] text-[var(--color-ink-4)]">
                            {fmtDate(r.createdAt)} {fmtTime(r.createdAt)}
                          </small>
                          {canDel && (
                            <button onClick={() => delReply(r.id)}
                              className="text-[var(--color-ink-4)] hover:text-[var(--color-red)] cursor-pointer transition-colors">
                              <Trash size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-[14px] leading-relaxed text-[var(--color-ink-2)]">{r.text}</p>
                    </div>
                  );
                })
              : <p className="text-[12px] italic text-[var(--color-ink-4)]">No replies yet.</p>
            }
          </div>

          {/* Reply form */}
          <div className="flex flex-col gap-2">
            {!currentUser && (
              <input value={replyName} onChange={e => setReplyName(e.target.value)}
                placeholder="Your name (optional)"
                className="reply-input" />
            )}
            <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
              placeholder="Share your thoughts or feelings…"
              className="reply-input" style={{ minHeight: 80, resize: "vertical" }} />
            <motion.button whileTap={{ scale: 0.97 }} onClick={postReply} disabled={posting}
              className="self-end flex items-center gap-2 px-4 py-2 rounded-[9px] text-sm font-medium
                bg-[var(--color-gold)] text-white hover:opacity-90 transition-opacity cursor-pointer
                disabled:opacity-60">
              <Send size={13}/>{posting ? "Posting…" : "Post Reply"}
            </motion.button>
          </div>

          {/* Prev / Next nav */}
          <div className="flex items-center justify-between mt-6 pt-5 border-t border-[var(--color-border)]">
            {prevId
              ? <NavBtn dir="prev" noteId={prevId} notes={notes} onClick={() => {
                  const idx2 = notes.findIndex(n => n.id === prevId);
                  if (idx2 !== -1) { setNote(null); setLoading(true); }
                  api.get<Note>(`/notes/${prevId}`).then(n => { setNote(n); setLoading(false); });
                }} />
              : <span/>}
            {nextId
              ? <NavBtn dir="next" noteId={nextId} notes={notes} onClick={() => {
                  setNote(null); setLoading(true);
                  api.get<Note>(`/notes/${nextId}`).then(n => { setNote(n); setLoading(false); });
                }} />
              : <span/>}
          </div>

          {/* Owner bar */}
          {isOwner && (
            <div className="mt-5 px-4 py-3 rounded-[9px] bg-[var(--color-accent-light)] border border-[var(--color-accent-ring)]
              flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--color-accent)] mr-1">Owner</span>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => onEdit(note)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-[12px] font-medium
                  text-[var(--color-ink-2)] border border-[var(--color-border-2)]
                  hover:bg-[var(--color-paper-2)] transition-colors cursor-pointer">
                <Pencil size={11}/>Edit Entry
              </motion.button>
              <motion.button whileTap={{ scale: 0.97 }} onClick={del}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-[12px] font-medium
                  text-white bg-[var(--color-red)] hover:opacity-90 transition-opacity cursor-pointer">
                <Trash2 size={11}/>Delete Entry
              </motion.button>
            </div>
          )}
        </motion.div>
      )}

      <style>{`
        .section-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1.2px; color:var(--color-ink-4); margin-bottom:12px; }
        .reply-input {
          width:100%; padding:10px 14px;
          border:1px solid var(--color-border-2); border-radius:9px;
          background:var(--color-paper); font-family:var(--font-sans);
          font-size:14px; color:var(--color-ink); outline:none;
          transition:border-color .2s, box-shadow .2s;
        }
        .reply-input:focus { border-color:var(--color-accent); box-shadow:0 0 0 3px var(--color-accent-ring); background:var(--color-surface-2); }
        .reply-input::placeholder { color:var(--color-ink-4); }
      `}</style>
    </Modal>
  );
}

function Divider() {
  return <hr className="border-none border-t border-[var(--color-border)] my-5" style={{ borderTopWidth: 1, borderTopColor: "var(--color-border)" }} />;
}

function NavBtn({ dir, noteId, notes, onClick }: { dir: "prev"|"next"; noteId: string; notes: Note[]; onClick: () => void }) {
  const n = notes.find(x => x.id === noteId);
  return (
    <motion.button whileTap={{ scale: 0.97 }} onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-[12px] font-medium
        text-[var(--color-ink-3)] border border-[var(--color-border-2)]
        hover:bg-[var(--color-paper-2)] transition-colors cursor-pointer max-w-[45%] truncate">
      {dir === "prev" && <ChevronLeft size={13}/>}
      <span className="truncate">{n?.title || (dir === "prev" ? "← Prev" : "Next →")}</span>
      {dir === "next" && <ChevronRight size={13}/>}
    </motion.button>
  );
}

function MediaSlider({ items, noteId, isOwner, onRemove }: {
  items: { id: string; url: string; mimetype: string }[];
  noteId: string; isOwner: boolean;
  onRemove: (id: string) => void;
}) {
  const [cur, setCur] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <div className="relative w-full rounded-[14px] overflow-hidden bg-black mb-5"
      style={{ aspectRatio: "9/16", maxHeight: "min(72vh, 560px)" }}>
      {items[cur].mimetype.startsWith("video/") ? (
        <video ref={videoRef} src={items[cur].url} controls playsInline loop
          className="w-full h-full object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={items[cur].url} alt="" className="w-full h-full object-contain" />
      )}

      {isOwner && (
        <button onClick={() => onRemove(items[cur].id)}
          className="absolute top-2 left-2 bg-[rgba(192,57,43,.85)] text-white text-[11px] px-2.5 py-1
            rounded-[6px] cursor-pointer hover:bg-[var(--color-red)] transition-colors backdrop-blur-sm">
          ✕ Remove
        </button>
      )}

      {items.length > 1 && (
        <>
          <span className="absolute top-2 right-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm">
            {cur + 1} / {items.length}
          </span>
          {cur > 0 && (
            <button onClick={() => setCur(cur - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm
                text-white flex items-center justify-center hover:bg-white/35 transition-colors cursor-pointer">
              <ChevronLeft size={16}/>
            </button>
          )}
          {cur < items.length - 1 && (
            <button onClick={() => setCur(cur + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm
                text-white flex items-center justify-center hover:bg-white/35 transition-colors cursor-pointer">
              <ChevronRight size={16}/>
            </button>
          )}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {items.map((_, i) => (
              <button key={i} onClick={() => setCur(i)}
                className={`rounded-full border-0 cursor-pointer transition-all duration-200 ${i === cur ? "w-4 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/40"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
