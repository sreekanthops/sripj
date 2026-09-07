"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/Sidebar";
import NoteCard from "@/components/NoteCard";
import NoteDetail from "@/components/NoteDetail";
import NoteForm from "@/components/NoteForm";
import { api } from "@/lib/api";
import type { Note, PublicUser } from "@/lib/api";

type SortKey = "newest" | "oldest" | "most-reactions" | "most-comments" | "most-views";

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

  if (authLoading || pageLoading) return <div className="spinner" style={{marginTop:80}}/>;

  if (!pageUser) return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"var(--c-paper)", gap:16 }}>
      <span style={{ fontSize:36, opacity:.3 }}>✦</span>
      <p style={{ color:"var(--c-ink3)", fontFamily:"var(--font-serif)", fontSize:20 }}>Diary not found</p>
      <button onClick={() => router.push("/")} style={{ fontSize:14, color:"var(--c-accent)", background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}>
        Go home
      </button>
    </div>
  );

  const pageTitle = isOwner
    ? <>My Journal <span style={{ fontSize:"0.55em", fontStyle:"italic", fontWeight:300, letterSpacing:".5px", opacity:.75, fontFamily:"var(--font-script)", verticalAlign:"middle" }}>abt u abt u</span></>
    : `${pageUser.displayName||pageUser.username}'s Diary`;

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <Sidebar
        user={user||{userId:"",username:"",displayName:pageUser.displayName,bio:pageUser.bio}}
        isOwner={isOwner}
        viewingName={pageUser.displayName||pageUser.username}
        viewingSub={`@${pageUser.username}`}
        onNewEntry={() => { setEditNote(null); setFormOpen(true); }}
        onLogout={handleLogout}
        onGoHome={() => user && router.push(`/u/${user.username}`)}
        onGoLogin={() => router.push("/")}
        onProfileUpdate={handleProfileUpdate}
      />

      <div className="main-area">
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-inner">
            <div>
              <span className="page-title">{pageTitle}</span>
              {notes.length > 0 && <span className="note-count">{displayedNotes.length} {displayedNotes.length===1?"entry":"entries"}</span>}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              {/* Sort selector */}
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as SortKey)}
                className="f-select-sm"
                style={{ fontSize:12, padding:"5px 10px", borderRadius:8, border:"1px solid var(--c-border2)", background:"var(--c-surface2)", color:"var(--c-ink2)", cursor:"pointer" }}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="most-reactions">Most reactions</option>
                <option value="most-comments">Most comments</option>
                <option value="most-views">Most viewed</option>
              </select>
              {/* Date filter */}
              <div className="filter-bar">
                <Search size={11} color="var(--c-ink4)"/>
                <input type="date" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)}/>
                <span className="filter-sep">—</span>
                <input type="date" value={filterTo} onChange={e=>setFilterTo(e.target.value)}/>
                {(filterFrom||filterTo) && <button className="filter-clear" onClick={()=>{setFilterFrom("");setFilterTo("");}}>Clear</button>}
              </div>
            </div>
          </div>

          {/* Tag filter row */}
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
                {displayedNotes.map(n => (
                  <NoteCard
                    key={n.id}
                    note={n}
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

        <footer>My Diary v4.0</footer>
      </div>

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
    </div>
  );
}

export default function Page() {
  return <AuthProvider><DiaryPage/></AuthProvider>;
}
