"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Eye, Music, Video, MessageCircle } from "lucide-react";
import type { Note } from "@/lib/api";
import { PALETTE, fmtDate } from "@/lib/api";

interface Props {
  note: Note;
  isOwner: boolean;
  onClick: () => void;
  onReact?: (noteId: string, emoji: string) => void;
}

export default function NoteCard({ note, isOwner, onClick, onReact }: Props) {
  const p = PALETTE[note.colorIdx || 0];
  const reactions = Object.entries(note.reactions||{}).filter(([,v])=>v>0).slice(0,4);

  return (
    <motion.article
      layout
      initial={{ opacity:0, y:16 }}
      animate={{ opacity:1, y:0 }}
      exit={{ opacity:0, scale:0.97 }}
      transition={{ duration:0.3 }}
      whileHover={{ y:-3, boxShadow:"0 16px 40px rgba(0,0,0,.1)" }}
      onClick={onClick}
      className="note-card"
    >
      {/* Accent stripe */}
      <div className="card-accent-stripe" style={{ background: p.accent }} />

      {/* Media */}
      {note.media?.length > 0 && (
        <CardMediaSlider media={note.media} />
      )}

      {/* Body */}
      <div className="card-body">
        <div className="card-meta">
          <span className="card-date"><Calendar size={10}/>{fmtDate(note.createdAt)}</span>
          {isOwner && <span className="card-views"><Eye size={10}/>{note.views}</span>}
        </div>
        <h3 className="card-title" style={{ color: p.accent, fontFamily: note.font }}>{note.title}</h3>
        {!note.media?.length && note.body && (
          <p className="card-excerpt" style={{ fontFamily:note.font, fontSize:Math.min(note.fontSize||14,13) }}>
            {note.body}
          </p>
        )}
      </div>

      {/* Quick Emojis Bar on Card */}
      <div className="card-quick-react" onClick={e => e.stopPropagation()} style={{ display:"flex", alignItems:"center", gap:4, padding:"6px 20px 0" }}>
        {["❤️", "😂", "🔥", "😍", "👏"].map(e => (
          <motion.button key={e} whileTap={{ scale:0.8 }}
            onClick={(ev) => {
              ev.stopPropagation();
              onReact?.(note.id, e);
            }}
            style={{ background:"none", border:"none", cursor:"pointer", fontSize:14, padding:"2px 4px", borderRadius:4 }}
            title={`React ${e}`}>
            {e}
          </motion.button>
        ))}
      </div>

      {/* Footer */}
      <div className="card-footer">
        <div className="card-reactions">
          {reactions.length > 0
            ? reactions.map(([emoji,count]) => (
                <span key={emoji} className="react-chip" onClick={(e) => { e.stopPropagation(); onReact?.(note.id, emoji); }}>
                  {emoji} {count}
                </span>
              ))
            : <span style={{ fontSize:11, color:"var(--c-ink4)" }}>No reactions</span>}
        </div>
        <div className="card-chips">
          {note.musicUrl && <Chip icon={<Music size={9}/>} label="Music" accent={p.accent}/>}
          {note.media?.length > 0 && <Chip icon={<Video size={9}/>} label={`${note.media.length}`} accent={p.accent}/>}
          {note.replies?.length > 0 && <Chip icon={<MessageCircle size={9}/>} label={`${note.replies.length}`} accent={p.accent}/>}
        </div>
      </div>
    </motion.article>
  );
}

function CardMediaSlider({ media }: { media: Note["media"] }) {
  const [cur, setCur] = useState(0);
  const activeIdx = Math.min(cur, Math.max(0, media.length - 1));

  return (
    <div className="card-media" onClick={e => e.stopPropagation()} style={{ position:"relative", userSelect:"none" }}>
      {media[activeIdx].mimetype.startsWith("video/")
        ? <video key={media[activeIdx].id} src={media[activeIdx].url} muted playsInline loop />
        // eslint-disable-next-line @next/next/no-img-element
        : <img key={media[activeIdx].id} src={media[activeIdx].url} alt="" />}
      {media.length > 1 && (
        <>
          <span className="card-media-count">{activeIdx + 1} / {media.length}</span>
          <button
            type="button"
            className="sl-arrow sl-prev"
            style={{ width: 30, height: 30, fontSize: 16, left: 8, zIndex: 30 }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCur((prev) => (prev > 0 ? prev - 1 : media.length - 1));
            }}
          >
            ‹
          </button>
          <button
            type="button"
            className="sl-arrow sl-next"
            style={{ width: 30, height: 30, fontSize: 16, right: 8, zIndex: 30 }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCur((prev) => (prev < media.length - 1 ? prev + 1 : 0));
            }}
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}

function Chip({ icon, label, accent }: { icon:React.ReactNode; label:string; accent:string }) {
  return (
    <span className="card-chip" style={{ color:accent, borderColor:`${accent}44`, background:`${accent}11`, border:`1px solid ${accent}44` }}>
      {icon} {label}
    </span>
  );
}
