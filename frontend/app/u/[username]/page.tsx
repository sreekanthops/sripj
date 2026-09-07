"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/Sidebar";
import NoteCard from "@/components/NoteCard";
import NoteDetail from "@/components/NoteDetail";
import NoteForm from "@/components/NoteForm";
import { api } from "@/lib/api";
import type { Note, PublicUser } from "@/lib/api";

function DiaryPage() {
  const params    = useParams();
  const router    = useRouter();
  const username  = (params.username as string).toLowerCase();
  const { user, loading: authLoading, logout, refreshUser } = useAuth();

  const [notes,       setNotes]       = useState<Note[]>([]);
  const [pageUser,    setPageUser]    = useState<PublicUser | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [openNoteId,  setOpenNoteId]  = useState<string | null>(null);
  const [formOpen,    setFormOpen]    = useState(false);
  const [editNote,    setEditNote]    = useState<Note | null>(null);
  const [filterFrom,  setFilterFrom]  = useState("");
  const [filterTo,    setFilterTo]    = useState("");

  const isOwner = !!user && user.username === username;

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (filterFrom) p.set("from", filterFrom);
      if (filterTo)   p.set("to",   filterTo);
      const qs = p.toString() ? "?" + p : "";
      const data = await api.get<{ user: PublicUser; notes: Note[] }>(`/notes/user/${username}${qs}`);
      setPageUser(data.user);
      setNotes(data.notes);
    } catch {
      setPageUser(null);
    } finally {
      setPageLoading(false);
    }
  }, [username, filterFrom, filterTo]);

  useEffect(() => { if (!authLoading) load(); }, [load, authLoading]);

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const handleProfileUpdate = async (displayName: string, bio: string) => {
    await refreshUser();
    setPageUser(prev => prev ? { ...prev, displayName, bio } : prev);
  };

  if (authLoading || pageLoading) return <Spinner />;

  if (!pageUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-paper)] gap-4">
        <span className="text-4xl opacity-30">✦</span>
        <p className="text-[var(--color-ink-3)] font-serif text-xl">Diary not found</p>
        <button onClick={() => router.push("/")} className="text-sm text-[var(--color-accent)] underline cursor-pointer">
          Go home
        </button>
      </div>
    );
  }

  const pageTitle = isOwner
    ? "My Journal"
    : `${pageUser.displayName || pageUser.username}'s Diary`;

  return (
    <div className="flex min-h-screen bg-[var(--color-paper)]">
      {/* Sidebar */}
      <div className="hidden md:block">
        <Sidebar
          user={user || { userId: "", username: "", displayName: pageUser.displayName, bio: pageUser.bio }}
          isOwner={isOwner}
          viewingName={pageUser.displayName || pageUser.username}
          viewingSub={`@${pageUser.username}`}
          onNewEntry={() => { setEditNote(null); setFormOpen(true); }}
          onLogout={handleLogout}
          onGoHome={() => user && router.push(`/u/${user.username}`)}
          onGoLogin={() => router.push("/")}
          onProfileUpdate={handleProfileUpdate}
        />
      </div>

      {/* Main */}
      <main className="flex-1 md:ml-[240px] flex flex-col min-h-screen">
        {/* Topbar */}
        <div className="sticky top-0 z-[90] bg-[var(--color-paper)]/90 backdrop-blur-[16px]
          border-b border-[var(--color-border)]">
          <div className="px-8 py-4 flex items-center justify-between gap-5 flex-wrap">
            <div className="flex items-baseline gap-2.5">
              <h1 className="font-serif text-2xl text-[var(--color-ink)] tracking-tight leading-none">
                {pageTitle}
              </h1>
              {notes.length > 0 && (
                <span className="text-[12px] text-[var(--color-ink-4)]">
                  {notes.length} {notes.length === 1 ? "entry" : "entries"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 bg-[var(--color-surface-2)] border border-[var(--color-border-2)]
              rounded-[9px] px-3 py-1.5">
              <Search size={11} className="text-[var(--color-ink-4)]" />
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                className="bg-transparent text-[12px] text-[var(--color-ink-2)] outline-none cursor-pointer" />
              <span className="text-[11px] text-[var(--color-ink-4)]">—</span>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                className="bg-transparent text-[12px] text-[var(--color-ink-2)] outline-none cursor-pointer" />
              {(filterFrom || filterTo) && (
                <button onClick={() => { setFilterFrom(""); setFilterTo(""); }}
                  className="text-[11px] text-[var(--color-ink-4)] hover:text-[var(--color-ink-2)] cursor-pointer">
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile sidebar actions */}
        <div className="md:hidden px-4 py-3 flex items-center gap-2 border-b border-[var(--color-border)]">
          {isOwner ? (
            <>
              <button onClick={() => { setEditNote(null); setFormOpen(true); }}
                className="flex-1 py-2 rounded-[9px] bg-[var(--color-accent)] text-white text-sm font-medium cursor-pointer">
                + New Entry
              </button>
              <button onClick={handleLogout}
                className="px-3 py-2 rounded-[9px] border border-[var(--color-border-2)] text-[var(--color-ink-3)] text-sm cursor-pointer">
                Sign out
              </button>
            </>
          ) : (
            <button onClick={() => router.push("/")}
              className="px-3 py-2 rounded-[9px] border border-[var(--color-border-2)] text-[var(--color-ink-3)] text-sm cursor-pointer">
              Sign In
            </button>
          )}
        </div>

        {/* Grid */}
        <section className="px-8 py-7 pb-20 flex-1" style={{ padding: "28px 32px 80px" }}>
          {notes.length === 0 ? (
            <EmptyState isOwner={isOwner} onNew={() => { setEditNote(null); setFormOpen(true); }} />
          ) : (
            <motion.div
              className="grid gap-[18px]"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(295px,1fr))" }}
            >
              <AnimatePresence>
                {notes.map(n => (
                  <NoteCard key={n.id} note={n} isOwner={isOwner}
                    onClick={() => setOpenNoteId(n.id)} />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </section>
      </main>

      {/* Bio banner (public view only) */}
      {!isOwner && pageUser.bio && (
        <aside className="fixed bottom-0 left-0 right-0 bg-[var(--color-surface-2)] border-t border-[var(--color-border)]
          px-6 py-3 text-center text-[13px] text-[var(--color-ink-3)] italic font-serif z-50">
          {pageUser.bio}
        </aside>
      )}

      {/* Note Detail */}
      <NoteDetail
        noteId={openNoteId}
        notes={notes}
        isOwner={isOwner}
        currentUser={user}
        onClose={() => setOpenNoteId(null)}
        onEdit={n => { setEditNote(n); setFormOpen(true); setOpenNoteId(null); }}
        onDeleted={() => { setOpenNoteId(null); load(); }}
        onNotesUpdate={setNotes}
      />

      {/* Note Form */}
      <NoteForm
        open={formOpen}
        note={editNote}
        onClose={() => { setFormOpen(false); setEditNote(null); }}
        onSaved={() => { setFormOpen(false); setEditNote(null); load(); }}
      />

      <footer className="text-center py-5 text-[11px] text-[var(--color-ink-4)] border-t border-[var(--color-border)]
        md:ml-[240px] tracking-[.5px]">
        My Diary v4.0
      </footer>
    </div>
  );
}

export default function Page() {
  return (
    <AuthProvider>
      <DiaryPage />
    </AuthProvider>
  );
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-paper)]">
      <div className="w-8 h-8 border-2 border-[var(--color-paper-3)] border-t-[var(--color-accent)] rounded-full animate-spin" />
    </div>
  );
}

function EmptyState({ isOwner, onNew }: { isOwner: boolean; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <span className="text-[36px] text-[var(--color-accent)] opacity-40">✦</span>
      {isOwner ? (
        <p className="text-[var(--color-ink-4)] font-sans text-[15px]">
          Tap <button onClick={onNew} className="text-[var(--color-accent)] font-semibold cursor-pointer">+ New Entry</button> to write your first entry.
        </p>
      ) : (
        <p className="text-[var(--color-ink-4)] font-sans text-[15px]">No diary entries yet — check back soon.</p>
      )}
    </div>
  );
}
