"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, BookOpen, PenLine, LogOut, UserRound, Link2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import NoteCard from "@/components/NoteCard";
import NoteDetail from "@/components/NoteDetail";
import NoteForm from "@/components/NoteForm";
import Modal from "@/components/Modal";
import { api } from "@/lib/api";
import type { Note, PublicUser } from "@/lib/api";

type SortKey = "newest" | "oldest" | "most-reactions" | "most-comments" | "most-views";
type FilterTab = "all" | "this-week" | "monthly" | "yearly";

function DiaryPage() {
  const params   = useParams();
  const router   = useRouter();
  const username = (params.username as string).toLowerCase();
  const { user, loading: authLoading, logout, refreshUser } = useAuth();

  const [notes,        setNotes]        = useState<Note[]>([]);
  const [pageUser,     setPageUser]     = useState<PublicUser|null>(null);
  const [pageLoading,  setPageLoading]  = useState(true);
  const [openNoteId,   setOpenNoteId]   = useState<string|null>(null);
  const [formOpen,     setFormOpen]     = useState(false);
  const [editNote,     setEditNote]     = useState<Note|null>(null);
  const [filterFrom,   setFilterFrom]   = useState("");
  const [filterTo,     setFilterTo]     = useState("");
  const [sortKey,      setSortKey]      = useState<SortKey>("newest");
  const [activeTag,    setActiveTag]    = useState<string|null>(null);
  const [filterTab,    setFilterTab]    = useState<FilterTab>("all");
  const [profOpen,     setProfOpen]     = useState(false);
  const [profName,     setProfName]     = useState("");
  const [profBio,      setProfBio]      = useState("");
  const [saving,       setSaving]       = useState(false);
  const [copied,       setCopied]       = useState(false);

  const isOwner = !!user && user.username === username;

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (filterFrom) p.set("from", filterFrom);
      if (filterTo)   p.set("to",   filterTo);
      const qs = p.toString() ? "?"+p : "";
      const data = await api.get<{user:PublicUser;notes:Note[]}>(`/notes/user/${username}${qs}`);
      setPageUser(data.user);
      setNotes(data.notes);
    } catch { setPageUser(null); }
    finally  { setPageLoading(false); }
  }, [username, filterFrom, filterTo]);

  useEffect(() => { if (!authLoading) load(); }, [load, authLoading]);

  // Apply tab filter to date range
  useEffect(() => {
    const now = new Date();
    if (filterTab === "this-week") {
      const start = new Date(now); start.setDate(now.getDate() - 6);
      setFilterFrom(start.toISOString().split("T")[0]);
      setFilterTo(now.toISOString().split("T")[0]);
    } else if (filterTab === "monthly") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setFilterFrom(start.toISOString().split("T")[0]);
      setFilterTo(now.toISOString().split("T")[0]);
    } else if (filterTab === "yearly") {
      const start = new Date(now.getFullYear(), 0, 1);
      setFilterFrom(start.toISOString().split("T")[0]);
      setFilterTo(now.toISOString().split("T")[0]);
    } else {
      setFilterFrom(""); setFilterTo("");
    }
  }, [filterTab]);

  // Collect all unique tags across notes
  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach(n => (n.tags||[]).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [notes]);

  // Apply tag filter + sort
  const displayedNotes = useMemo(() => {
    let list = activeTag ? notes.filter(n => (n.tags||[]).includes(activeTag)) : notes;
    const totalReactions = (n: Note) => Object.values(n.reactions||{}).reduce((a,b)=>a+b,0);
    switch (sortKey) {
      case "oldest":         list = [...list].sort((a,b) => a.createdAt.localeCompare(b.createdAt)); break;
      case "most-reactions": list = [...list].sort((a,b) => totalReactions(b) - totalReactions(a)); break;
      case "most-comments":  list = [...list].sort((a,b) => (b.replies?.length||0) - (a.replies?.length||0)); break;
      case "most-views":     list = [...list].sort((a,b) => b.views - a.views); break;
      default:               list = [...list].sort((a,b) => b.createdAt.localeCompare(a.createdAt)); break;
    }
    return list;
  }, [notes, sortKey, activeTag]);

  const handleLogout = () => { logout(); router.push("/"); };
  const handleProfileUpdate = async (displayName: string, bio: string) => {
    await refreshUser();
    setPageUser(prev => prev ? { ...prev, displayName, bio } : prev);
  };

  const copyLink = () => {
    const url = `${window.location.origin}/u/${user?.username || username}`;
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
      handleProfileUpdate(profName, profBio);
      setProfOpen(false);
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  if (authLoading || pageLoading) return <div className="spinner" style={{marginTop:80}}/>;

  if (!pageUser) return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"var(--c-bg)", gap:16 }}>
      <span style={{ fontSize:36, opacity:.3 }}>✦</span>
      <p style={{ color:"var(--c-ink3)", fontFamily:"var(--font-serif)", fontSize:20 }}>Diary not found</p>
      <button onClick={() => router.push("/")} style={{ fontSize:14, color:"var(--c-accent)", background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}>
        Go home
      </button>
    </div>
  );

  const diaryName = pageUser.displayName || (isOwner ? "My Journal" : `${pageUser.username}'s Journal`);

  return (
    <div className="app-shell">

      {/* ── TOP NAVBAR ── */}
      <nav className="navbar" style={{ background: "rgba(232,224,208,.94)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}>
        {/* Brand */}
        <div className="navbar-brand">
          <div className="navbar-brand-icon">
            <BookOpen size={18} strokeWidth={1.5}/>
          </div>
          <div>
            <div className="navbar-brand-name">{diaryName}</div>
            {isOwner && (
              <div className="navbar-brand-tagline">write · reflect · remember</div>
            )}
          </div>
        </div>

        {/* Nav links */}
        <div className="navbar-links">
          <button className="navbar-link active" onClick={() => {}}>Home</button>
          <button className="navbar-link" onClick={() => setSortKey("newest")}>All Entries</button>
          <button className="navbar-link" onClick={() => {
            if (notes.length > 0) {
              const r = notes[Math.floor(Math.random() * notes.length)];
              setOpenNoteId(r.id);
            }
          }}>Random</button>
          {isOwner ? (
            <>
              <div className="navbar-divider"/>
              <button className="navbar-link" onClick={copyLink} title="Copy diary link">
                {copied ? "✓ Copied!" : <><Link2 size={13} style={{display:"inline",marginRight:4}}/>Share</>}
              </button>
              <button className="navbar-link" onClick={() => { setProfName(pageUser.displayName||""); setProfBio(pageUser.bio||""); setProfOpen(true); }}>
                <UserRound size={13} style={{display:"inline",marginRight:4}}/>Profile
              </button>
              <button className="navbar-link" onClick={handleLogout}>
                <LogOut size={13} style={{display:"inline",marginRight:4}}/>Sign out
              </button>
            </>
          ) : user?.userId ? (
            <button className="navbar-link" onClick={() => router.push(`/u/${user.username}`)}>My Diary</button>
          ) : (
            <button className="navbar-link" onClick={() => router.push("/")}>Sign In</button>
          )}
        </div>

        {/* New Entry button */}
        {isOwner && (
          <button className="btn-new-entry" onClick={() => { setEditNote(null); setFormOpen(true); }}>
            <PenLine size={14}/> + New Entry
          </button>
        )}
      </nav>

      {/* ── HERO ── */}
      <div className="page-hero">
        <p className="hero-quote">
          A collection of thoughts,<br/>moments and little pieces of my heart.
        </p>
        <p className="hero-sub">Same person. Different days. Endless thoughts.</p>
        <div className="hero-accent-line"/>
      </div>

      {/* ── FILTER TABS + DATE RANGE ── */}
      <div className="filter-section">
        <div className="filter-tabs">
          {(["this-week","monthly","yearly","all"] as FilterTab[]).map(t => (
            <button
              key={t}
              className={`filter-tab${filterTab===t?" active":""}`}
              onClick={() => setFilterTab(t)}
            >
              {t === "this-week" ? "This Week" : t === "monthly" ? "Monthly" : t === "yearly" ? "Yearly" : "Show All"}
            </button>
          ))}
        </div>

        {/* Date range override */}
        <div className="filter-bar">
          <input type="date" value={filterFrom} onChange={e=>{setFilterFrom(e.target.value);setFilterTab("all");}}/>
          <span className="filter-sep">→</span>
          <input type="date" value={filterTo} onChange={e=>{setFilterTo(e.target.value);setFilterTab("all");}}/>
          {(filterFrom||filterTo) && <button className="filter-clear" onClick={()=>{setFilterFrom("");setFilterTo("");setFilterTab("all");}}>Clear</button>}
        </div>

        {/* Sort */}
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          className="f-select-sm"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="most-reactions">Most reactions</option>
          <option value="most-comments">Most comments</option>
          <option value="most-views">Most viewed</option>
        </select>
      </div>

      {/* ── TAG FILTER ── */}
      {allTags.length > 0 && (
        <div className="tag-filter-row">
          <span className="tag-filter-label">Tags:</span>
          {allTags.map(tag => (
            <button
              key={tag}
              className={`tag-chip${activeTag===tag?" tag-chip-active":""}`}
              onClick={() => setActiveTag(prev => prev===tag ? null : tag)}
            >
              #{tag}
            </button>
          ))}
          {activeTag && (
            <button className="filter-clear" onClick={() => setActiveTag(null)} style={{ display:"flex", alignItems:"center", gap:3 }}>
              <X size={10}/> Clear tag
            </button>
          )}
        </div>
      )}

      {/* ── NOTES COUNT + GRID ── */}
      <div className="notes-header">
        {notes.length > 0 && (
          <span className="notes-count">{displayedNotes.length} {displayedNotes.length===1?"entry":"entries"}</span>
        )}
      </div>

      {/* Mobile bar */}
      <div className="mobile-bar">
        {isOwner ? (
          <>
            <button className="btn-primary" style={{flex:1}} onClick={() => { setEditNote(null); setFormOpen(true); }}>+ New Entry</button>
            <button className="btn-ghost" style={{width:"auto"}} onClick={handleLogout}>Sign out</button>
          </>
        ) : (
          <button className="btn-ghost" style={{width:"auto"}} onClick={() => router.push("/")}>Sign In</button>
        )}
      </div>

      {/* Grid */}
      <div className="notes-section">
        {displayedNotes.length === 0 ? (
          <div className="empty-state">
            <span className="empty-star">✦</span>
            <p className="empty-text">
              {activeTag
                ? <>No entries tagged <b>#{activeTag}</b>.</>
                : isOwner
                  ? <>Tap <button onClick={() => { setEditNote(null); setFormOpen(true); }}>+ New Entry</button> to write your first entry.</>
                  : "No diary entries yet — check back soon."}
            </p>
          </div>
        ) : (
          <div className="notes-grid">
            <AnimatePresence>
              {displayedNotes.map((n, idx) => (
                <NoteCard
                  key={n.id}
                  note={n}
                  index={idx}
                  total={displayedNotes.length}
                  isOwner={isOwner}
                  onClick={() => setOpenNoteId(n.id)}
                  onTagClick={tag => setActiveTag(prev => prev===tag ? null : tag)}
                  activeTag={activeTag}
                  onReact={async (noteId, emoji) => {
                    const res = await api.post<{ reactions: Record<string, number>; userReactions: string[]; isReacted: boolean }>(`/notes/${noteId}/react`, { emoji });
                    setNotes(prev => prev.map(x => x.id === noteId ? { ...x, reactions: res.reactions, userReactions: res.userReactions } : x));
                  }}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <footer>My Journal · {new Date().getFullYear()}</footer>

      {/* Bio banner */}
      {!isOwner && pageUser.bio && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"var(--c-surface2)", borderTop:"1px solid var(--c-border)", padding:"12px 24px", textAlign:"center", fontSize:13, color:"var(--c-ink3)", fontStyle:"italic", fontFamily:"var(--font-serif)", zIndex:50 }}>
          {pageUser.bio}
        </div>
      )}

      <NoteDetail noteId={openNoteId} notes={notes} isOwner={isOwner} currentUser={user}
        onClose={() => setOpenNoteId(null)}
        onEdit={n => { setEditNote(n); setFormOpen(true); setOpenNoteId(null); }}
        onDeleted={() => { setOpenNoteId(null); load(); }}
        onNotesUpdate={setNotes}/>

      <NoteForm open={formOpen} note={editNote}
        onClose={() => { setFormOpen(false); setEditNote(null); }}
        onSaved={() => { setFormOpen(false); setEditNote(null); load(); }}/>

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
    </div>
  );
}

export default function Page() {
  return <AuthProvider><DiaryPage/></AuthProvider>;
}
