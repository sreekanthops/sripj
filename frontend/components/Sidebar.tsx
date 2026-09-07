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

export default function Sidebar({ user, isOwner, viewingName, viewingSub, onNewEntry, onLogout, onGoHome, onGoLogin, onProfileUpdate }: Props) {
  const [profOpen, setProfOpen] = useState(false);
  const [profName, setProfName] = useState(user.displayName || "");
  const [profBio,  setProfBio]  = useState(user.bio || "");
  const [saving,   setSaving]   = useState(false);
  const [copied,   setCopied]   = useState(false);

  const copyLink = () => {
    const url = `${window.location.origin}/u/${user.username}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url)
        .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
        .catch(() => window.prompt("Copy your diary link:", url));
    } else {
      window.prompt("Copy your diary link:", url);
    }
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
      <aside className="sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <BookOpen size={22} color="var(--c-accent)" strokeWidth={1.5} />
          <div>
            <div className="sidebar-logo-name">{viewingName}</div>
            <div className="sidebar-logo-sub">{viewingSub}</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {isOwner ? (
            <>
              <SideBtn icon={<PenLine size={14}/>} primary onClick={onNewEntry}>+ New Entry</SideBtn>
              <SideBtn icon={<Link2 size={14}/>} onClick={copyLink}>
                {copied ? "✓ Link Copied!" : "Share Diary"}
              </SideBtn>
              <SideBtn icon={<UserRound size={14}/>} onClick={() => { setProfName(user.displayName); setProfBio(user.bio||""); setProfOpen(true); }}>
                Edit Profile
              </SideBtn>
              <SideBtn icon={<LogOut size={14}/>} onClick={onLogout}>Sign out</SideBtn>
            </>
          ) : user?.userId ? (
            <SideBtn icon={<BookOpen size={14}/>} onClick={onGoHome}>My Diary</SideBtn>
          ) : (
            <SideBtn icon={<UserRound size={14}/>} onClick={onGoLogin}>Sign In / Sign Up</SideBtn>
          )}
        </nav>
      </aside>

      {/* Profile Modal */}
      <Modal open={profOpen} onClose={() => setProfOpen(false)} center maxWidth={460}>
        <h2 className="modal-title">Edit Profile</h2>
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div className="f-field" style={{marginBottom:0}}>
            <label className="f-label">Display Name</label>
            <input value={profName} onChange={e=>setProfName(e.target.value)}
              placeholder="Your Name" className="f-input"/>
          </div>
          <div className="f-field" style={{marginBottom:0}}>
            <label className="f-label">Bio <span className="f-hint">shown on your public page</span></label>
            <textarea value={profBio} onChange={e=>setProfBio(e.target.value)}
              placeholder="Tell the world about yourself…"
              className="f-textarea" style={{ minHeight:80 }}/>
          </div>
          <motion.button whileTap={{ scale:0.97 }} onClick={saveProfile} disabled={saving} className="btn-save">
            {saving ? "Saving…" : "Save"}
          </motion.button>
        </div>
      </Modal>
    </>
  );
}

function SideBtn({ children, icon, primary, onClick }: { children:React.ReactNode; icon?:React.ReactNode; primary?:boolean; onClick?:()=>void }) {
  return (
    <motion.button whileTap={{ scale:0.97 }} onClick={onClick}
      className={primary ? "btn-primary" : "btn-ghost"}>
      {icon}{children}
    </motion.button>
  );
}
