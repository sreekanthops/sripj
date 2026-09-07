"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Upload, X } from "lucide-react";
import Modal from "./Modal";
import { api, uploadMedia, PALETTE } from "@/lib/api";
import type { Note } from "@/lib/api";

const FONTS = [
  { value:"Georgia,serif",               label:"Georgia (Classic)" },
  { value:"'Palatino Linotype',serif",   label:"Palatino" },
  { value:"'Courier New',monospace",     label:"Courier" },
  { value:"Arial,sans-serif",            label:"Arial" },
  { value:"Verdana,sans-serif",          label:"Verdana" },
  { value:"'Comic Sans MS',cursive",     label:"Comic Sans" },
];
const WEIGHTS = [
  { value:"normal",       label:"Normal" },
  { value:"bold",         label:"Bold" },
  { value:"italic",       label:"Italic" },
  { value:"bold italic",  label:"Bold+Italic" },
];

interface Props { open:boolean; note?:Note|null; onClose:()=>void; onSaved:()=>void; }

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
      setTitle(note.title); setBody(note.body); setFont(note.font||"Georgia,serif");
      setFontSize(note.fontSize||14); setFontWeight(note.fontWeight||"normal");
      setColorIdx(note.colorIdx||0); setMusicUrl(note.musicUrl||"");
    } else {
      setTitle(""); setBody(""); setFont("Georgia,serif");
      setFontSize(14); setFontWeight("normal"); setColorIdx(0); setMusicUrl("");
    }
    setPending([]); setError("");
  }, [open, isEdit, note]);

  const addFiles = (files: FileList|File[]) => {
    setPending(prev => [...prev, ...Array.from(files).filter(f => f.type.startsWith("image/")||f.type.startsWith("video/"))]);
  };

  const save = async () => {
    if (!title.trim()&&!body.trim()) { setError("Write something first ✍"); return; }
    setSaving(true); setError("");
    try {
      const payload = { title:title||"Untitled", body, font, fontSize, fontWeight, colorIdx, musicUrl };
      const saved = isEdit && note
        ? await api.put<Note>(`/notes/${note.id}`, payload)
        : await api.post<Note>("/notes", payload);
      if (pending.length) await uploadMedia((saved as Note).id, pending);
      onSaved();
    } catch (e:unknown) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} center maxWidth={560}>
      <h2 className="modal-title">{isEdit ? "✒ Edit Entry" : "✒ New Entry"}</h2>

      {/* Title */}
      <div className="f-field">
        <label className="f-label">Title</label>
        <input value={title} onChange={e=>setTitle(e.target.value)}
          placeholder="Give your entry a title…" className="f-input"/>
      </div>

      {/* Appearance */}
      <div className="f-field">
        <label className="f-label">Appearance</label>
        <div className="f-row">
          <select value={font} onChange={e=>setFont(e.target.value)} className="f-select" style={{flex:1,minWidth:140}}>
            {FONTS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <input type="number" value={fontSize} min={10} max={28}
            onChange={e=>setFontSize(+e.target.value)} className="f-num"/>
          <select value={fontWeight} onChange={e=>setFontWeight(e.target.value)} className="f-select" style={{width:130}}>
            {WEIGHTS.map(w=><option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
        </div>
        <div className="swatches">
          {PALETTE.map((p,i) => (
            <motion.button key={i} whileTap={{ scale:0.9 }}
              onClick={() => setColorIdx(i)}
              className={`swatch${colorIdx===i?" active":""}`}
              style={{ background:p.accent }}/>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="f-field">
        <label className="f-label">Content</label>
        <textarea value={body} onChange={e=>setBody(e.target.value)}
          placeholder="Write your thoughts here…"
          className="f-textarea lined-ta"
          style={{ fontFamily:font, fontSize }}/>
      </div>

      {/* Music */}
      <div className="f-field">
        <label className="f-label">Background Music URL (.mp3)</label>
        <input value={musicUrl} onChange={e=>setMusicUrl(e.target.value)}
          placeholder="https://…/song.mp3" className="f-input"/>
      </div>

      {/* Media */}
      <div className="f-field">
        <label className="f-label">Photos &amp; Videos</label>
        {isEdit && note?.media && note.media.length > 0 && (
          <div className="upload-previews" style={{marginBottom:8}}>
            {note.media.map(m => (
              <div key={m.id} className="up-prev">
                {m.mimetype.startsWith("video/")
                  ? <video src={m.url} muted playsInline/>
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={m.url} alt=""/>}
              </div>
            ))}
          </div>
        )}
        <div className="upload-zone"
          onClick={() => fileRef.current?.click()}
          onDragOver={e=>e.preventDefault()}
          onDrop={e=>{e.preventDefault();addFiles(e.dataTransfer.files);}}>
          <input ref={fileRef} type="file" accept="video/*,image/*" multiple style={{display:"none"}}
            onChange={e=>e.target.files&&addFiles(e.target.files)}/>
          <Upload size={22} style={{margin:"0 auto 8px",opacity:.5,display:"block"}}/>
          <p>Drag &amp; drop or <b>tap to choose</b></p>
          <small style={{color:"var(--c-ink4)",fontSize:11}}>MP4 · MOV · WebM · JPG · PNG · GIF · up to 200 MB</small>
        </div>
        {pending.length > 0 && (
          <div className="upload-previews">
            {pending.map((f,i) => (
              <div key={i} className="up-prev">
                {f.type.startsWith("video/")
                  ? <video src={URL.createObjectURL(f)} muted playsInline/>
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={URL.createObjectURL(f)} alt=""/>}
                <button className="up-prev-del" onClick={()=>setPending(p=>p.filter((_,j)=>j!==i))}>
                  <X size={9}/>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p style={{color:"var(--c-red)",fontSize:13,marginBottom:8}}>{error}</p>}
      <motion.button whileTap={{ scale:0.97 }} onClick={save} disabled={saving} className="btn-save">
        {saving ? "Saving…" : "Save Entry"}
      </motion.button>
    </Modal>
  );
}
