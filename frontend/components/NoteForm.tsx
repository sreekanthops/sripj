"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Upload, X, Sparkles } from "lucide-react";
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

const WORD_PRESETS = [40, 80, 150, 250];

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
  const [tagInput,   setTagInput]   = useState("");
  const [tags,       setTags]       = useState<string[]>([]);
  const [pending,    setPending]    = useState<File[]>([]);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");

  // AI expand state
  const [aiWords,    setAiWords]    = useState(80);
  const [aiLoading,  setAiLoading]  = useState(false);
  const [aiError,    setAiError]    = useState("");
  const [aiMode,     setAiMode]     = useState<"append"|"replace">("append");

  const fileRef    = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    if (isEdit && note) {
      setTitle(note.title); setBody(note.body); setFont(note.font||"Georgia,serif");
      setFontSize(note.fontSize||14); setFontWeight(note.fontWeight||"normal");
      setColorIdx(note.colorIdx||0); setMusicUrl(note.musicUrl||"");
      setTags(note.tags||[]);
    } else {
      setTitle(""); setBody(""); setFont("Georgia,serif");
      setFontSize(14); setFontWeight("normal"); setColorIdx(0); setMusicUrl("");
      setTags([]);
    }
    setTagInput(""); setPending([]); setError(""); setAiError("");
  }, [open, isEdit, note]);

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, "");
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput("");
  };

  const removeTag = (t: string) => setTags(prev => prev.filter(x => x !== t));

  const addFiles = (files: FileList|File[]) => {
    setPending(prev => [...prev, ...Array.from(files).filter(f => f.type.startsWith("image/")||f.type.startsWith("video/"))]);
  };

  // ── AI expand ──────────────────────────────────────────────────────────────
  const handleAiExpand = async () => {
    const seed = body.trim();
    if (!seed) { setAiError("Write a few words first — the AI will expand on what you've started."); return; }
    setAiLoading(true);
    setAiError("");
    try {
      const data = await api.post<{ result: string }>("/ai/expand", { text: seed, words: aiWords });
      if (aiMode === "replace") {
        setBody(data.result);
      } else {
        // append with a blank line separator
        setBody(prev => prev.trimEnd() + "\n\n" + data.result);
      }
      // scroll textarea to bottom
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
        }
      });
    } catch (e: unknown) {
      setAiError((e as Error).message || "AI request failed");
    } finally {
      setAiLoading(false);
    }
  };

  const save = async () => {
    if (!title.trim()&&!body.trim()) { setError("Write something first ✍"); return; }
    setSaving(true); setError("");
    try {
      const payload = { title:title||"Untitled", body, font, fontSize, fontWeight, colorIdx, musicUrl, tags };
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
        <div className="ai-content-label">
          <label className="f-label" style={{marginBottom:0}}>Content</label>

          {/* AI toolbar */}
          <div className="ai-toolbar">
            {/* word count presets */}
            <div className="ai-word-presets">
              {WORD_PRESETS.map(w => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setAiWords(w)}
                  className={`ai-preset-btn${aiWords === w ? " active" : ""}`}
                >
                  ~{w}w
                </button>
              ))}
              <input
                type="number"
                value={aiWords}
                min={20}
                max={400}
                onChange={e => setAiWords(Math.min(400, Math.max(20, +e.target.value || 80)))}
                className="ai-words-input"
                title="Target word count"
              />
            </div>

            {/* append / replace toggle */}
            <div className="ai-mode-toggle">
              <button
                type="button"
                onClick={() => setAiMode("append")}
                className={`ai-mode-btn${aiMode === "append" ? " active" : ""}`}
                title="Append AI text after your writing"
              >+ Append</button>
              <button
                type="button"
                onClick={() => setAiMode("replace")}
                className={`ai-mode-btn${aiMode === "replace" ? " active" : ""}`}
                title="Replace your text with AI-generated version"
              >↺ Replace</button>
            </div>

            {/* AI button */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={handleAiExpand}
              disabled={aiLoading}
              className="btn-ai-expand"
              title="Generate diary text from your seed using AI"
            >
              {aiLoading
                ? <span className="ai-spinner"/>
                : <Sparkles size={13} style={{flexShrink:0}}/>
              }
              {aiLoading ? "Writing…" : "AI Write"}
            </motion.button>
          </div>
        </div>

        {aiError && (
          <p className="ai-error">{aiError}</p>
        )}

        <textarea
          ref={textareaRef}
          value={body}
          onChange={e=>setBody(e.target.value)}
          placeholder="Write a few words and click ✦ AI Write to expand, or just write freely…"
          className="f-textarea lined-ta"
          style={{ fontFamily:font, fontSize }}/>
      </div>

      {/* Tags */}
      <div className="f-field">
        <label className="f-label">Tags <span className="f-hint">press Enter or comma to add</span></label>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:tags.length?8:0 }}>
          {tags.map(t => (
            <span key={t} className="tag-chip tag-chip-form">
              #{t}
              <button onClick={() => removeTag(t)} style={{ background:"none", border:"none", cursor:"pointer", marginLeft:3, lineHeight:1, color:"inherit", opacity:.7, fontSize:11, padding:0 }}>✕</button>
            </span>
          ))}
        </div>
        <input
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); }
            if (e.key === "Backspace" && !tagInput && tags.length) removeTag(tags[tags.length-1]);
          }}
          onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
          placeholder="e.g. travel, love, rant…"
          className="f-input"
        />
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
