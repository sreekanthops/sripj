"use client";

import { motion } from "framer-motion";
import { Calendar, Eye, Music, Video, MessageCircle } from "lucide-react";
import type { Note } from "@/lib/api";
import { PALETTE, fmtDate } from "@/lib/api";

interface Props { note: Note; isOwner: boolean; onClick: () => void; }

export default function NoteCard({ note, isOwner, onClick }: Props) {
  const p = PALETTE[note.colorIdx || 0];
  const reactions = Object.entries(note.reactions||{}).filter(([,v])=>v>0).slice(0,4);

  return (
    <motion.article
      layout
      initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
      exit={{ opacity:0, scale:0.97 }} transition={{ duration:0.3 }}
      whileHover={{ y:-3, boxShadow:"0 16px 40px rgba(0,0,0,.1)" }}
      onClick={onClick}
      className="note-card"
    >
      {/* Accent stripe */}
      <div className="card-accent-stripe" style={{ background: p.accent }} />

      {/* Media */}
      {note.media?.length > 0 && (
        <div className="card-media">
          {note.media[0].mimetype.startsWith("video/")
            ? <video src={note.media[0].url} muted playsInline loop />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={note.media[0].url} alt="" />}
          {note.media.length > 1 && <span className="card-media-count">+{note.media.length-1}</span>}
        </div>
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

      {/* Footer */}
      <div className="card-footer">
        <div className="card-reactions">
          {reactions.length > 0
            ? reactions.map(([emoji,count]) => <span key={emoji} className="react-chip">{emoji} {count}</span>)
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

function Chip({ icon, label, accent }: { icon:React.ReactNode; label:string; accent:string }) {
  return (
    <span className="card-chip" style={{ color:accent, borderColor:`${accent}44`, background:`${accent}11`, border:`1px solid ${accent}44` }}>
      {icon} {label}
    </span>
  );
}
