"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Bookmark, Eye, Camera, Music, MessageCircle } from "lucide-react";
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

const QUICK_EMOJIS = ["❤️", "😂", "🔥", "😍", "👏"];

export default function NoteCard({ note, index, total, isOwner, onClick, onReact, onTagClick, activeTag }: Props) {
  const hasMedia = note.media?.length > 0;
  const moodLabel = hasMedia ? "Memory" : "Read";
  const numStr = `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;

  // Total reactions count
  const totalReactions = Object.values(note.reactions || {}).reduce((a, b) => a + b, 0);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className="note-card"
    >
      {/* Media thumbnail */}
      {hasMedia && <CardMediaSlider media={note.media} />}

      {/* Card body */}
      <div className="card-body">
        {/* Meta row: date + counter */}
        <div className="card-meta">
          <span className="card-date">
            <span className="card-date-icon">📅</span>
            {fmtDate(note.createdAt)}
          </span>
          <span className="card-num">{numStr}</span>
        </div>

        {/* Title — italic handwriting script */}
        <h3 className="card-title">{note.title}</h3>

        {/* Body excerpt (text-only notes) */}
        {!hasMedia && note.body && (
          <p className="card-excerpt">{note.body}</p>
        )}

        {/* Emoji reaction row — shown in card body, large emojis */}
        <div className="card-emoji-row" onClick={e => e.stopPropagation()}>
          {QUICK_EMOJIS.map(e => {
            const isReacted = note.userReactions?.includes(e);
            return (
              <motion.button
                key={e}
                whileTap={{ scale: 0.75 }}
                className={`emoji-quick-btn${isReacted ? " reacted" : ""}`}
                onClick={ev => { ev.stopPropagation(); onReact?.(note.id, e); }}
                title={isReacted ? `Remove ${e}` : `React ${e}`}
              >
                {e}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Tags */}
      {note.tags?.length > 0 && (
        <div className="card-tags" onClick={e => e.stopPropagation()}>
          {note.tags.map(t => (
            <button
              key={t}
              className={`tag-chip${activeTag === t ? " tag-chip-active" : ""}`}
              onClick={() => onTagClick?.(t)}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="card-footer" onClick={e => e.stopPropagation()}>
        {/* Left: mood label */}
        <div className="card-mood-label">
          {hasMedia ? <Camera size={12} /> : <Eye size={12} />}
          <span>{moodLabel}</span>
          {note.musicUrl && <Music size={10} style={{ marginLeft: 6 }} />}
        </div>

        {/* Right: reactions count chip + bookmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {(totalReactions > 0 || note.replies?.length > 0) ? (
            <span className="card-reaction-count">
              {note.replies?.length > 0 && (
                <><MessageCircle size={11} />{note.replies.length}</>
              )}
            </span>
          ) : (
            <span className="card-no-react">No reactions</span>
          )}
          <button className="card-bookmark-btn" title="Bookmark" onClick={e => e.stopPropagation()}>
            <Bookmark size={14} strokeWidth={1.5} />
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
    <div className="card-media" onClick={e => e.stopPropagation()} style={{ position: "relative", userSelect: "none" }}>
      {media[activeIdx].mimetype.startsWith("video/")
        ? <video key={media[activeIdx].id} src={media[activeIdx].url} muted playsInline loop />
        // eslint-disable-next-line @next/next/no-img-element
        : <img key={media[activeIdx].id} src={media[activeIdx].url} alt="" />}
      {media.length > 1 && (
        <>
          <span className="card-media-count">{activeIdx + 1} / {media.length}</span>
          <button type="button" className="sl-arrow sl-prev"
            style={{ width: 30, height: 30, fontSize: 16, left: 8, zIndex: 30 }}
            onClick={e => { e.preventDefault(); e.stopPropagation(); setCur(p => p > 0 ? p - 1 : media.length - 1); }}>‹</button>
          <button type="button" className="sl-arrow sl-next"
            style={{ width: 30, height: 30, fontSize: 16, right: 8, zIndex: 30 }}
            onClick={e => { e.preventDefault(); e.stopPropagation(); setCur(p => p < media.length - 1 ? p + 1 : 0); }}>›</button>
        </>
      )}
    </div>
  );
}
