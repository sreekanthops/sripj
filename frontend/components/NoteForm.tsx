"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Upload, X } from "lucide-react";
import Modal from "./Modal";
import { api, uploadMedia, PALETTE } from "@/lib/api";
import type { Note } from "@/lib/api";

const FONTS = [
  { value: "Georgia,serif",                label: "Georgia (Classic)" },
  { value: "'Palatino Linotype',serif",    label: "Palatino" },
  { value: "'Courier New',monospace",       label: "Courier" },
  { value: "Arial,sans-serif",             label: "Arial" },
  { value: "Verdana,sans-serif",           label: "Verdana" },
  { value: "'Comic Sans MS',cursive",      label: "Comic Sans" },
];

const WEIGHTS = [
  { value: "normal",      label: "Normal" },
  { value: "bold",        label: "Bold" },
  { value: "italic",      label: "Italic" },
  { value: "bold italic", label: "Bold+Italic" },
];

interface Props {
  open: boolean;
  note?: Note | null;   // null = new entry
  onClose: () => void;
  onSaved: () => void;
}

export default function NoteForm({ open, note, onClose, onSaved }: Props) {
  const isEdit = !!note;

  const [title,      setTitle]      = useState("");
  const [body,       setBody]       = useState("");
  const [font,       setFont]       = useState("Georgia,serif");
  const [fontSize,   setFontSize]   = useState(14);
  const [fontWeight, setFontWeight] = useState("normal");
  const [colorIdx,   setColorIdx]   = useState(0);
  const [musicUrl,   setMusicUrl]   = useState("");
  const [pending,    setPending]    = useState<File[]>([]);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (isEdit && note) {
      setTitle(note.title);
      setBody(note.body);
      setFont(note.font || "Georgia,serif");
      setFontSize(note.fontSize || 14);
      setFontWeight(note.fontWeight || "normal");
      setColorIdx(note.colorIdx || 0);
      setMusicUrl(note.musicUrl || "");
    } else {
      setTitle(""); setBody(""); setFont("Georgia,serif");
      setFontSize(14); setFontWeight("normal"); setColorIdx(0); setMusicUrl("");
    }
    setPending([]); setError("");
  }, [open, isEdit, note]);

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith("image/") || f.type.startsWith("video/"));
    setPending(prev => [...prev, ...arr]);
  };

  const save = async () => {
    if (!title.trim() && !body.trim()) { setError("Write something first ✍"); return; }
    setSaving(true); setError("");
    try {
      const payload = { title: title || "Untitled", body, font, fontSize, fontWeight, colorIdx, musicUrl };
      const saved = isEdit && note
        ? await api.put<Note>(`/notes/${note.id}`, payload)
        : await api.post<Note>("/notes", payload);
      if (pending.length) await uploadMedia((saved as Note).id, pending);
      onSaved();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} center maxWidth={560}>
      <h2 className="font-serif text-2xl text-[var(--color-ink)] mb-6 pr-10">
        {isEdit ? "✒ Edit Entry" : "✒ New Entry"}
      </h2>

      <div className="flex flex-col gap-5">
        {/* Title */}
        <FormField label="Title">
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Give your entry a title…"
            className="form-input" />
        </FormField>

        {/* Style row */}
        <FormField label="Appearance">
          <div className="flex flex-wrap gap-2 mb-3">
            <select value={font} onChange={e => setFont(e.target.value)} className="form-select flex-1 min-w-[140px]">
              {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <input type="number" value={fontSize} min={10} max={28}
              onChange={e => setFontSize(+e.target.value)}
              className="form-select w-[72px]" />
            <select value={fontWeight} onChange={e => setFontWeight(e.target.value)} className="form-select w-[130px]">
              {WEIGHTS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </div>
          {/* Colour swatches */}
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((p, i) => (
              <motion.button
                key={i} whileTap={{ scale: 0.9 }}
                onClick={() => setColorIdx(i)}
                className="w-6 h-6 rounded-full border-2 cursor-pointer transition-all duration-200"
                style={{
                  background: p.accent,
                  borderColor: i === colorIdx ? "var(--color-accent)" : "transparent",
                  outline: i === colorIdx ? "2px solid var(--color-accent)" : "none",
                  outlineOffset: 2,
                  transform: i === colorIdx ? "scale(1.22)" : "scale(1)",
                }} />
            ))}
          </div>
        </FormField>

        {/* Body */}
        <FormField label="Content">
          <textarea value={body} onChange={e => setBody(e.target.value)}
            placeholder="Write your thoughts here…"
            className="form-input lined-textarea"
            style={{ minHeight: 120, fontFamily: font, fontSize, resize: "vertical" }} />
        </FormField>

        {/* Music */}
        <FormField label="Background Music URL (.mp3)">
          <input value={musicUrl} onChange={e => setMusicUrl(e.target.value)}
            placeholder="https://…/song.mp3" className="form-input" />
        </FormField>

        {/* Media upload */}
        <FormField label="Photos & Videos">
          {/* Existing media thumbnails (edit mode) */}
          {isEdit && note?.media && note.media.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {note.media.map(m => (
                <div key={m.id} className="relative w-[68px] h-[68px] rounded-[9px] overflow-hidden border border-[var(--color-border)] bg-[var(--color-ink)]">
                  {m.mimetype.startsWith("video/")
                    ? <video src={m.url} muted playsInline className="w-full h-full object-cover" />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={m.url} alt="" className="w-full h-full object-cover" />}
                </div>
              ))}
            </div>
          )}

          {/* Drop zone */}
          <div
            className="border-[1.5px] border-dashed border-[var(--color-border-2)] rounded-[14px]
              p-7 text-center cursor-pointer text-[var(--color-ink-4)] text-[13px]
              hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]
              transition-all duration-200 relative"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
          >
            <input ref={fileRef} type="file" accept="video/*,image/*" multiple className="hidden"
              onChange={e => e.target.files && addFiles(e.target.files)} />
            <Upload size={22} className="mx-auto mb-2 opacity-50" />
            <p>Drag & drop or <b>tap to choose</b></p>
            <small className="text-[var(--color-ink-4)] text-[11px]">MP4 · MOV · WebM · JPG · PNG · GIF · up to 200 MB</small>
          </div>

          {/* Pending previews */}
          {pending.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {pending.map((f, i) => (
                <div key={i} className="relative w-[68px] h-[68px] rounded-[9px] overflow-hidden border border-[var(--color-border)] bg-[var(--color-ink)]">
                  {f.type.startsWith("video/")
                    ? <video src={URL.createObjectURL(f)} muted playsInline className="w-full h-full object-cover" />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />}
                  <button onClick={() => setPending(p => p.filter((_, j) => j !== i))}
                    className="absolute top-0.5 right-0.5 w-[17px] h-[17px] rounded-full
                      bg-[rgba(192,57,43,.9)] text-white flex items-center justify-center cursor-pointer">
                    <X size={9}/>
                  </button>
                </div>
              ))}
            </div>
          )}
        </FormField>

        {error && <p className="text-sm text-[var(--color-red)]">{error}</p>}

        <motion.button whileTap={{ scale: 0.97 }} onClick={save} disabled={saving}
          className="w-full py-3 rounded-[9px] bg-[var(--color-accent)] text-white font-medium text-sm
            shadow-[0_2px_10px_rgba(61,107,94,.25)] hover:bg-[var(--color-accent-2)]
            transition-colors duration-200 disabled:opacity-60 cursor-pointer">
          {saving ? "Saving…" : "Save Entry"}
        </motion.button>
      </div>

      <style>{`
        .form-input {
          width:100%; padding:11px 14px;
          border:1px solid var(--color-border-2); border-radius:9px;
          background:var(--color-paper); font-family:var(--font-sans);
          font-size:14px; color:var(--color-ink); outline:none;
          transition:border-color .2s, box-shadow .2s;
        }
        .form-input:focus {
          border-color:var(--color-accent);
          box-shadow:0 0 0 3px var(--color-accent-ring);
          background:var(--color-surface-2);
        }
        .form-input::placeholder { color:var(--color-ink-4); }
        .form-select {
          padding:8px 12px; border:1px solid var(--color-border-2); border-radius:9px;
          background:var(--color-paper); font-family:var(--font-sans);
          font-size:13px; color:var(--color-ink); outline:none; transition:border-color .2s;
        }
        .form-select:focus { border-color:var(--color-accent); }
      `}</style>
    </Modal>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink-4)]">{label}</label>
      {children}
    </div>
  );
}
