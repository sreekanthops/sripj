"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Bookmark, Music, MessageCircle, Camera } from "lucide-react";
import type { Note } from "@/lib/api";
import { fmtDate } from "@/lib/api";

interface Props {
  note: Note;
  index: number;
  total: number;
  isOwner: boolean;
  onClick: () => void;
  onReact?: (noteId: string, emoji: string) => void;
  onTagClick?: (tag: string) => void;
  activeTag?: string | null;
}

export default function NoteCard({ note, index, total, isOwner, onClick, onReact, onTagClick, activeTag }: Props) {
  // Determine a consistent "mood" label from the note — fall back to "Memory"
  const moodLabel = note.tags?.[0]
    ? note.tags[0].charAt(0).toUpperCase() + note.tags[0].slice(1)
    : note.media?.length > 0 ? "Memory" : "Read";

  const moodIcon = note.media?.length > 0
    ? <Camera size={12}/>
    : <Bookmark size={12}/>;

  // Format index as "01 / 12"
  const numStr = `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;

  return (
    <motion.article
      layout
      initial={{ opacity:0, y:16 }}
      animate={{ opacity:1, y:0 }}
      exit={{ opacity:0, scale:0.97 }}
      transition={{ duration:0.3 }}
      onClick={onClick}
      className="note-card"
    >
      {/* Media */}
      {note.media?.length > 0 && (
        <CardMediaSlider media={note.media} />
      )}

      {/* Body */}
      <div className="card-body">
        <div className="card-meta">
          <span className="card-date">{fmtDate(note.createdAt)}</span>
          <span className="card-num">{numStr}</span>
        </div>

        {/* Title in handwriting script */}
        <h3
          className="card-title"
          style={{ fontFamily: "var(--font-script)" }}
        >
          {note.title}
        </h3>

        {/* Body excerpt — only shown when no media */}
        {!note.media?.length && note.body && (
          <p className="card-excerpt">
            {note.body}
          </p>
        )}
      </div>

      {/* Tags */}
      {note.tags?.length > 0 && (
        <div className="card-tags" onClick={e => e.stopPropagation()}>
          {note.tags.map(t => (
            <button
              key={t}
              className={`tag-chip${activeTag===t?" tag-chip-active":""}`}
              onClick={() => onTagClick?.(t)}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {/* Footer — mood label + bookmark */}
      <div className="card-footer" onClick={e => e.stopPropagation()}>
        <div className="card-mood-label">
          {moodIcon}
          <span>{moodLabel}</span>
          {/* chips for media/music/replies */}
          {note.musicUrl && <><Music size={10} style={{marginLeft:6}}/> Music</>}
          {note.replies?.length > 0 && <><MessageCircle size={10} style={{marginLeft:6}}/>{note.replies.length}</>}
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          {/* Quick emoji reactions */}
          <div style={{ display:"flex", gap:2 }}>
            {["❤️","🔥","😍"].map(e => {
              const isReacted = note.userReactions?.includes(e);
              return (
                <motion.button key={e} whileTap={{ scale:0.8 }}
                  onClick={(ev) => { ev.stopPropagation(); onReact?.(note.id, e); }}
                  style={{
                    background: isReacted ? "var(--c-accent-light)" : "none",
                    border: isReacted ? "1px solid var(--c-accent-ring)" : "1px solid transparent",
                    cursor: "pointer", fontSize:13,
                    padding:"1px 4px", borderRadius:5,
                  }}>
                  {e}
                </motion.button>
              );
            })}
          </div>

          {/* Bookmark icon */}
          <button className="card-bookmark-btn" title="Bookmark">
            <Bookmark size={14} strokeWidth={1.5}/>
          </button>
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
            style={{ width:30, height:30, fontSize:16, left:8, zIndex:30 }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCur(prev => prev > 0 ? prev - 1 : media.length - 1); }}
          >‹</button>
          <button
            type="button"
            className="sl-arrow sl-next"
            style={{ width:30, height:30, fontSize:16, right:8, zIndex:30 }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCur(prev => prev < media.length - 1 ? prev + 1 : 0); }}
          >›</button>
        </>
      )}
    </div>
  );
}
