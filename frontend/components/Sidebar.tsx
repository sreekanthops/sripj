"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Link2, LogOut, PenLine, UserRound, BookOpen } from "lucide-react";
import Modal from "./Modal";
import { api } from "@/lib/api";
import type { User } from "@/lib/api";

interface Props {
  user: User;
  isOwner: boolean;
  viewingName: string;
  viewingSub: string;
  onNewEntry: () => void;
  onLogout: () => void;
  onGoHome: () => void;
  onGoLogin: () => void;
  onProfileUpdate: (displayName: string, bio: string) => void;
}

export default function Sidebar({
  user, isOwner, viewingName, viewingSub,
  onNewEntry, onLogout, onGoHome, onGoLogin, onProfileUpdate,
}: Props) {
  const [profOpen, setProfOpen] = useState(false);
  const [profName, setProfName] = useState(user.displayName || "");
  const [profBio,  setProfBio]  = useState(user.bio || "");
  const [saving,   setSaving]   = useState(false);

  const copyLink = () => {
    const url = `${window.location.origin}/u/${user.username}`;
    navigator.clipboard?.writeText(url).then(() => {}).catch(() => {});
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.put("/auth/profile", { displayName: profName, bio: profBio });
      onProfileUpdate(profName, profBio);
      setProfOpen(false);
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  return (
    <>
      <aside className="w-[240px] min-h-screen bg-[var(--color-surface)] border-r border-[var(--color-border)]
        flex flex-col px-5 py-7 gap-8 fixed top-0 left-0 bottom-0 z-[100]">

        {/* Logo */}
        <div className="flex items-center gap-3 px-1">
          <BookOpen size={22} className="text-[var(--color-accent)]" strokeWidth={1.5} />
          <div>
            <div className="font-serif text-[17px] text-[var(--color-ink)] leading-tight tracking-tight">
              {viewingName}
            </div>
            <div className="text-[10px] text-[var(--color-ink-4)] uppercase tracking-[1.6px] mt-0.5 font-normal">
              {viewingSub}
            </div>
          </div>
        </div>

        {/* Nav actions */}
        <nav className="flex flex-col gap-2 flex-1">
          {isOwner ? (
            <>
              <SideBtn icon={<PenLine size={14}/>} primary onClick={onNewEntry}>+ New Entry</SideBtn>
              <SideBtn icon={<Link2 size={14}/>} onClick={copyLink}>Share Diary</SideBtn>
              <SideBtn icon={<UserRound size={14}/>} onClick={() => { setProfName(user.displayName); setProfBio(user.bio||""); setProfOpen(true); }}>
                Edit Profile
              </SideBtn>
              <SideBtn icon={<LogOut size={14}/>} onClick={onLogout}>Sign out</SideBtn>
            </>
          ) : user ? (
            <>
              <SideBtn icon={<BookOpen size={14}/>} onClick={onGoHome}>My Diary</SideBtn>
            </>
          ) : (
            <SideBtn icon={<UserRound size={14}/>} onClick={onGoLogin}>Sign In / Sign Up</SideBtn>
          )}
        </nav>
      </aside>

      {/* Profile Modal */}
      <Modal open={profOpen} onClose={() => setProfOpen(false)} center maxWidth={460}>
        <h2 className="font-serif text-2xl text-[var(--color-ink)] mb-6 pr-10">Edit Profile</h2>
        <div className="flex flex-col gap-4">
          <ModalField label="Display Name">
            <input value={profName} onChange={e => setProfName(e.target.value)}
              placeholder="Your Name" className="modal-input" />
          </ModalField>
          <ModalField label="Bio" hint="shown on your public page">
            <textarea value={profBio} onChange={e => setProfBio(e.target.value)}
              placeholder="Tell the world about yourself…"
              className="modal-input" style={{ minHeight: 80, resize: "vertical" }} />
          </ModalField>
          <motion.button whileTap={{ scale: 0.97 }} onClick={saveProfile} disabled={saving}
            className="w-full py-3 rounded-[9px] bg-[var(--color-accent)] text-white font-medium text-sm
              hover:bg-[var(--color-accent-2)] transition-colors duration-200 disabled:opacity-60 cursor-pointer">
            {saving ? "Saving…" : "Save"}
          </motion.button>
        </div>
      </Modal>

      <style>{`
        .modal-input {
          width: 100%; padding: 11px 14px;
          border: 1px solid var(--color-border-2);
          border-radius: 9px; background: var(--color-paper);
          font-family: var(--font-sans); font-size: 14px; color: var(--color-ink);
          outline: none; transition: border-color .2s, box-shadow .2s;
        }
        .modal-input:focus {
          border-color: var(--color-accent);
          box-shadow: 0 0 0 3px var(--color-accent-ring);
          background: var(--color-surface-2);
        }
        .modal-input::placeholder { color: var(--color-ink-4); }
      `}</style>
    </>
  );
}

function SideBtn({ children, icon, primary, onClick }: {
  children: React.ReactNode; icon?: React.ReactNode;
  primary?: boolean; onClick?: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-[9px] text-sm font-medium
        transition-all duration-150 cursor-pointer text-left
        ${primary
          ? "bg-[var(--color-accent)] text-white shadow-[0_2px_10px_rgba(61,107,94,.25)] hover:bg-[var(--color-accent-2)]"
          : "text-[var(--color-ink-3)] border border-[var(--color-border-2)] hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink-2)]"
        }`}
    >
      {icon}
      {children}
    </motion.button>
  );
}

function ModalField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink-4)] flex items-center gap-2">
        {label}
        {hint && <span className="normal-case tracking-normal font-normal">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
