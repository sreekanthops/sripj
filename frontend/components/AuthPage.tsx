"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

type Tab = "login" | "signup";

export default function AuthPage() {
  const { login, signup } = useAuth();
  const [tab, setTab]       = useState<Tab>("login");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  // login fields
  const [lusr, setLusr] = useState("");
  const [lpwd, setLpwd] = useState("");

  // signup fields
  const [susr,  setSusr]  = useState("");
  const [sname, setSname] = useState("");
  const [spwd,  setSpwd]  = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try { await login(lusr, lpwd); }
    catch (err: unknown) { setError((err as Error).message); }
    finally { setLoading(false); }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try { await signup(susr, spwd, sname); }
    catch (err: unknown) { setError((err as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-paper)] px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-[420px]"
      >
        {/* Card */}
        <div
          className="bg-[var(--color-surface-2)] rounded-[18px] shadow-[var(--shadow-lg)] border border-[var(--color-border)] px-9 py-10"
          style={{ boxShadow: "0 16px 48px rgba(0,0,0,.12), 0 4px 16px rgba(0,0,0,.06)" }}
        >
          {/* Logo */}
          <div className="flex flex-col items-center gap-2 mb-8">
            <BookOpen size={32} className="text-[var(--color-accent)]" strokeWidth={1.5} />
            <h1 className="font-serif text-3xl text-[var(--color-ink)] tracking-tight">Diary</h1>
            <p className="font-script text-base text-[var(--color-ink-3)]">Your private space to write</p>
          </div>

          {/* Tabs */}
          <div className="flex bg-[var(--color-paper-2)] rounded-[9px] p-1 mb-6 gap-1">
            {(["login", "signup"] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(""); }}
                className={`flex-1 py-2 text-sm font-medium rounded-[7px] transition-all duration-200 cursor-pointer
                  ${tab === t
                    ? "bg-[var(--color-surface-2)] text-[var(--color-ink)] shadow-[var(--shadow-sm)]"
                    : "text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]"}`}
              >
                {t === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          {/* Forms */}
          <AnimatePresence mode="wait">
            {tab === "login" ? (
              <motion.form
                key="login"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleLogin}
                className="flex flex-col gap-4"
              >
                <Field label="Username">
                  <input value={lusr} onChange={e => setLusr(e.target.value)}
                    placeholder="your username" autoComplete="username" required
                    className="field-input" />
                </Field>
                <Field label="Password">
                  <input type="password" value={lpwd} onChange={e => setLpwd(e.target.value)}
                    placeholder="password" autoComplete="current-password" required
                    className="field-input"
                    onKeyDown={e => e.key === "Enter" && handleLogin(e as unknown as React.FormEvent)} />
                </Field>
                {error && <p className="text-sm text-[var(--color-red)]">{error}</p>}
                <SubmitBtn loading={loading}>Sign In</SubmitBtn>
              </motion.form>
            ) : (
              <motion.form
                key="signup"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleSignup}
                className="flex flex-col gap-4"
              >
                <Field label="Username" hint="letters, numbers, _ — min 3">
                  <input value={susr} onChange={e => setSusr(e.target.value)}
                    placeholder="choose a username" autoComplete="username" required
                    className="field-input" />
                </Field>
                <Field label="Display Name" hint="shown to others">
                  <input value={sname} onChange={e => setSname(e.target.value)}
                    placeholder="Your Name" className="field-input" />
                </Field>
                <Field label="Password" hint="min 4 characters">
                  <input type="password" value={spwd} onChange={e => setSpwd(e.target.value)}
                    placeholder="choose a password" autoComplete="new-password" required
                    className="field-input" />
                </Field>
                {error && <p className="text-sm text-[var(--color-red)]">{error}</p>}
                <SubmitBtn loading={loading}>Create Account</SubmitBtn>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <style>{`
        .field-input {
          width: 100%; padding: 11px 14px;
          border: 1px solid var(--color-border-2);
          border-radius: 9px;
          background: var(--color-paper);
          font-family: var(--font-sans); font-size: 14px;
          color: var(--color-ink); outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .field-input:focus {
          border-color: var(--color-accent);
          box-shadow: 0 0 0 3px var(--color-accent-ring);
          background: var(--color-surface-2);
        }
        .field-input::placeholder { color: var(--color-ink-4); }
      `}</style>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink-4)] flex items-center gap-2">
        {label}
        {hint && <span className="normal-case tracking-normal font-normal text-[var(--color-ink-4)]">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function SubmitBtn({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <motion.button
      type="submit"
      disabled={loading}
      whileTap={{ scale: 0.97 }}
      className="w-full py-3 rounded-[9px] bg-[var(--color-accent)] text-white font-medium text-sm
        shadow-[0_2px_10px_rgba(61,107,94,.25)] hover:bg-[var(--color-accent-2)]
        transition-colors duration-200 disabled:opacity-60 cursor-pointer mt-1"
    >
      {loading ? "…" : children}
    </motion.button>
  );
}
