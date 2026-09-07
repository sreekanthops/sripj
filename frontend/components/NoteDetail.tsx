"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Calendar, Eye, Pencil, Trash2, Music, ChevronLeft, ChevronRight, Send, Edit2, Trash } from "lucide-react";
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

export default function NoteDetail({ noteId, notes, isOwner, currentUser, onClose, onEdit, onDeleted, onNotesUpdate }: Props) {
  const [note,      setNote]      = useState<Note|null>(null);
  const [loading,   setLoading]   = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyName, setReplyName] = useState("");
  const [posting,   setPosting]   = useState(false);

  const idx    = notes.findIndex(n => n.id===noteId);
  const prevId = idx > 0                ? notes[idx-1].id : null;
  const nextId = idx < notes.length-1   ? notes[idx+1].id : null;

  const loadNote = async (id: string) => {
    setLoading(true);
    try {
      const n = await api.get<Note>(`/notes/${id}`);
      setNote(n);
      onNotesUpdate(notes.map(x => x.id===n.id ? n : x));
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (noteId) loadNote(noteId);
    else setNote(null);
    setReplyText(""); setReplyName("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const del = async () => {
    if (!note||!confirm("Delete this entry permanently?")) return;
    await api.delete(`/notes/${note.id}`);
    onDeleted();
  };

  const react = async (emoji: string) => {
    if (!note) return;
    const reactions = await api.post<Record<string,number>>(`/notes/${note.id}/react`, { emoji });
    const updated = { ...note, reactions };
    setNote(updated);
    onNotesUpdate(notes.map(x => x.id===updated.id ? updated : x));
  };

  const postReply = async () => {
    if (!note||!replyText.trim()) return;
    setPosting(true);
    try {
      await api.post(`/notes/${note.id}/replies`, {
        name: currentUser ? (currentUser.displayName||currentUser.username) : (replyName||"Anonymous"),
        text: replyText,
      });
      const updated = await api.get<Note>(`/notes/${note.id}`);
      setNote(updated);
      onNotesUpdate(notes.map(x => x.id===updated.id ? updated : x));
      setReplyText("");
    } finally { setPosting(false); }
  };

  const delReply = async (replyId: string) => {
    if (!note||!confirm("Delete this reply?")) return;
    await api.delete(`/notes/${note.id}/replies/${replyId}`);
    const updated = await api.get<Note>(`/notes/${note.id}`);
    setNote(updated);
    onNotesUpdate(notes.map(x => x.id===updated.id ? updated : x));
  };

  const p = note ? PALETTE[note.colorIdx||0] : PALETTE[0];
  const fsCss: React.CSSProperties = note ? {
    fontWeight: note.fontWeight?.includes("bold") ? "bold" : "normal",
    fontStyle:  note.fontWeight?.includes("italic") ? "italic" : "normal",
  } : {};

  return (
    <Modal open={!!noteId} onClose={onClose}>
      {loading && <div className="spinner" />}
      {!loading && note && (
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.25 }}>

          {/* Title */}
          <h2 className="detail-title" style={{ color:p.accent, fontFamily:note.font }}>{note.title}</h2>

          {/* Meta */}
          <div className="detail-meta">
            <span><Calendar size={10}/>{fmtDate(note.createdAt)} · {fmtTime(note.createdAt)}</span>
            {isOwner && <span><Eye size={10}/>{note.views} views</span>}
            {note.editedAt && <span><Edit2 size={10}/>Edited {fmtDate(note.editedAt)}</span>}
          </div>

          {/* Music */}
          {note.musicUrl && (
            <p style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, fontStyle:"italic", color:"var(--c-accent)", marginBottom:16, fontFamily:"var(--font-serif)" }}>
              <Music size={12}/>Background music is playing
            </p>
          )}

          {/* Media */}
          {note.media?.length > 0 && (
            <MediaSlider items={note.media} noteId={note.id} isOwner={isOwner}
              onRemove={async (mid) => {
                await api.delete(`/upload/${note.id}/${mid}`);
                const up = await api.get<Note>(`/notes/${note.id}`);
                setNote(up); onNotesUpdate(notes.map(x => x.id===up.id ? up : x));
              }}/>
          )}

          {/* Body */}
          <div className="detail-body"
            style={{ fontFamily:note.font, fontSize:note.fontSize||14, borderLeftColor:p.accent, ...fsCss }}>
            {note.body}
          </div>

          <hr className="sep"/>

          {/* Reactions */}
          <p className="section-label">React</p>
          <div className="emoji-grid">
            {EMOJIS.map(e => (
              <motion.button key={e} whileTap={{ scale:0.84 }} onClick={() => react(e)} className="emoji-btn">{e}</motion.button>
            ))}
          </div>
          <div className="react-display">
            {Object.entries(note.reactions||{}).filter(([,v])=>v>0).length > 0
              ? Object.entries(note.reactions||{}).filter(([,v])=>v>0).map(([e,c]) => (
                  <span key={e} className="rcnt">{e} <b>{c}</b></span>
                ))
              : <span style={{ fontSize:12, color:"var(--c-ink4)" }}>Be the first to react!</span>}
          </div>

          <hr className="sep"/>

          {/* Replies */}
          <p className="section-label">💬 Replies ({note.replies?.length||0})</p>
          <div className="reply-list">
            {note.replies?.length
              ? note.replies.map(r => {
                  const canDel = currentUser && (r.userId===currentUser.userId || isOwner);
                  const replyReacts = Object.entries(r.reactions||{}).filter(([,v])=>v>0);
                  return (
                    <div key={r.id} className="reply-item">
                      <div className="reply-author">
                        <span>👤 {r.name||"Anonymous"}</span>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <small>{fmtDate(r.createdAt)} {fmtTime(r.createdAt)}</small>
                          {canDel && (
                            <button onClick={() => delReply(r.id)} className="reply-del-btn"><Trash size={11}/></button>
                          )}
                        </div>
                      </div>
                      <p className="reply-text">{r.text}</p>
                      
                      {/* Reply Reactions */}
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:8, paddingTop:6, borderTop:"1px solid var(--c-border)" }}>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                          {replyReacts.length > 0 && replyReacts.map(([e,c]) => (
                            <span key={e} className="react-chip" style={{ fontSize:11, padding:"2px 7px" }}>{e} {c}</span>
                          ))}
                        </div>
                        <div style={{ display:"flex", gap:3 }}>
                          {EMOJIS.slice(0, 5).map(e => (
                            <motion.button key={e} whileTap={{ scale:0.8 }}
                              onClick={async () => {
                                const reacts = await api.post<Record<string,number>>(`/notes/${note.id}/replies/${r.id}/react`, { emoji: e });
                                const updated = {
                                  ...note,
                                  replies: note.replies.map(x => x.id === r.id ? { ...x, reactions: reacts } : x),
                                };
                                setNote(updated);
                                onNotesUpdate(notes.map(x => x.id===updated.id ? updated : x));
                              }}
                              style={{ background:"none", border:"none", cursor:"pointer", fontSize:14, padding:"2px 4px", borderRadius:4 }}
                              title={`React ${e}`}>
                              {e}
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })
              : <p style={{ fontSize:12, fontStyle:"italic", color:"var(--c-ink4)" }}>No replies yet.</p>}
          </div>

          {/* Reply form */}
          <div className="reply-form">
            {!currentUser && (
              <input value={replyName} onChange={e=>setReplyName(e.target.value)}
                placeholder="Your name (optional)" className="reply-input reply-name-input"/>
            )}
            <textarea value={replyText} onChange={e=>setReplyText(e.target.value)}
              placeholder="Share your thoughts or feelings…" className="reply-input"/>
            <motion.button whileTap={{ scale:0.97 }} onClick={postReply} disabled={posting}
              className="btn-gold" style={{ alignSelf:"flex-end" }}>
              <Send size={13}/>{posting ? "Posting…" : "Post Reply"}
            </motion.button>
          </div>

          {/* Prev/Next */}
          <div className="nav-btns">
            {prevId
              ? <motion.button whileTap={{ scale:0.97 }} className="btn-outline"
                  onClick={() => loadNote(prevId)}>
                  <ChevronLeft size={13}/>{notes.find(n=>n.id===prevId)?.title||"← Prev"}
                </motion.button>
              : <span/>}
            {nextId
              ? <motion.button whileTap={{ scale:0.97 }} className="btn-outline"
                  onClick={() => loadNote(nextId)}>
                  {notes.find(n=>n.id===nextId)?.title||"Next →"}<ChevronRight size={13}/>
                </motion.button>
              : <span/>}
          </div>

          {/* Owner bar */}
          {isOwner && (
            <div className="owner-bar">
              <span className="owner-bar-label">Owner</span>
              <motion.button whileTap={{ scale:0.97 }} className="btn-outline" onClick={() => onEdit(note)}>
                <Pencil size={11}/>Edit Entry
              </motion.button>
              <motion.button whileTap={{ scale:0.97 }} className="btn-danger" onClick={del}>
                <Trash2 size={11}/>Delete Entry
              </motion.button>
            </div>
          )}
        </motion.div>
      )}
    </Modal>
  );
}

function MediaSlider({ items, noteId, isOwner, onRemove }: {
  items:{id:string;url:string;mimetype:string}[];
  noteId:string; isOwner:boolean; onRemove:(id:string)=>void;
}) {
  const [cur, setCur] = useState(0);
  return (
    <div className="media-slider">
      {items[cur].mimetype.startsWith("video/")
        ? <video src={items[cur].url} controls playsInline loop />
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={items[cur].url} alt=""/>}
      {isOwner && (
        <button onClick={() => onRemove(items[cur].id)} className="slide-del-btn">✕ Remove</button>
      )}
      {items.length > 1 && (
        <>
          <span className="sl-counter">{cur+1} / {items.length}</span>
          {cur > 0 && <button className="sl-arrow sl-prev" onClick={() => setCur(cur-1)}>‹</button>}
          {cur < items.length-1 && <button className="sl-arrow sl-next" onClick={() => setCur(cur+1)}>›</button>}
          <div className="sl-dots">
            {items.map((_,i) => (
              <button key={i} className={`sl-dot${i===cur?" active":""}`} onClick={() => setCur(i)}/>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
