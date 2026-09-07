"use client";

import { motion } from "framer-motion";
import { Calendar, Eye, Music, Video, MessageCircle } from "lucide-react";
import type { Note } from "@/lib/api";
import { PALETTE, fmtDate } from "@/lib/api";

interface Props {
  note: Note;
  isOwner: boolean;
  onClick: () => void;
}

export default function NoteCard({ note, isOwner, onClick }: Props) {
  const p = PALETTE[note.colorIdx || 0];

  const reactions = Object.entries(note.reactions || {})
    .filter(([, v]) => v > 0)
    .slice(0, 4);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ y: -3, boxShadow: "0 16px 40px rgba(0,0,0,.1)" }}
      onClick={onClick}
      className="bg-[var(--color-surface-2)] rounded-[14px] border border-[var(--color-border)]
        shadow-[var(--shadow-sm)] cursor-pointer overflow-hidden flex flex-col
        transition-[border-color] duration-300 hover:border-[rgba(0,0,0,.06)]
        relative group"
    >
      {/* Colour accent stripe */}
      <div
        className="h-[2px] w-0 group-hover:w-full transition-all duration-300 flex-shrink-0"
        style={{ background: p.accent }}
      />

      {/* Media thumbnail */}
      {note.media?.length > 0 && (
        <div className="bg-[var(--color-ink)] aspect-[4/3] max-h-[200px] overflow-hidden relative">
          {note.media[0].mimetype.startsWith("video/") ? (
            <video
              src={note.media[0].url} muted playsInline loop
              className="w-full h-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={note.media[0].url} alt="" className="w-full h-full object-cover" />
          )}
          {note.media.length > 1 && (
            <span className="absolute top-2 right-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full font-sans backdrop-blur-sm">
              +{note.media.length - 1}
            </span>
          )}
        </div>
      )}

      {/* Body */}
      <div className="px-5 pt-5 pb-0">
        <div className="flex items-center justify-between mb-2">
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[.6px] text-[var(--color-ink-4)]">
            <Calendar size={10} />
            {fmtDate(note.createdAt)}
          </span>
          {isOwner && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--color-ink-4)]">
              <Eye size={10} />
              {note.views}
            </span>
          )}
        </div>

        <h3
          className="font-serif text-[17px] font-normal leading-snug mb-2 tracking-tight"
          style={{ color: p.accent }}
        >
          {note.title}
        </h3>

        {!note.media?.length && note.body && (
          <p
            className="text-[13px] leading-relaxed text-[var(--color-ink-3)] overflow-hidden mb-3"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              fontFamily: note.font,
              fontSize: Math.min(note.fontSize || 14, 13),
            }}
          >
            {note.body}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto px-5 py-3 border-t border-[var(--color-border)] flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-1">
          {reactions.length > 0
            ? reactions.map(([emoji, count]) => (
                <span key={emoji} className="text-[12px] bg-[var(--color-paper)] border border-[var(--color-border)] rounded-full px-2.5 py-0.5 font-sans">
                  {emoji} {count}
                </span>
              ))
            : <span className="text-[11px] text-[var(--color-ink-4)] font-sans">No reactions</span>
          }
        </div>
        <div className="flex items-center gap-1.5">
          {note.musicUrl && <Chip icon={<Music size={9}/>} label="Music" accent={p.accent} />}
          {note.media?.length > 0 && <Chip icon={<Video size={9}/>} label={`${note.media.length}`} accent={p.accent} />}
          {note.replies?.length > 0 && <Chip icon={<MessageCircle size={9}/>} label={`${note.replies.length}`} accent={p.accent} />}
        </div>
      </div>
    </motion.article>
  );
}

function Chip({ icon, label, accent }: { icon: React.ReactNode; label: string; accent: string }) {
  return (
    <span
      className="flex items-center gap-1 text-[10px] font-semibold tracking-[.3px] px-2 py-0.5 rounded-full border"
      style={{ color: accent, borderColor: `${accent}44`, background: `${accent}11` }}
    >
      {icon}{label}
    </span>
  );
}
