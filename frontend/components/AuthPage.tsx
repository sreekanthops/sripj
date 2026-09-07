"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

type Tab = "login" | "signup";

export default function AuthPage() {
  const { login, signup } = useAuth();
  const [tab,     setTab]     = useState<Tab>("login");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [lusr, setLusr] = useState("");
  const [lpwd, setLpwd] = useState("");
  const [susr, setSusr] = useState("");
  const [sname,setSname]= useState("");
  const [spwd, setSpwd] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try { await login(lusr, lpwd); }
    catch (err: unknown) { setError((err as Error).message); }
    finally { setLoading(false); }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try { await signup(susr, spwd, sname); }
    catch (err: unknown) { setError((err as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-screen">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ width: "100%", maxWidth: 420 }}
      >
        <div className="auth-card">
          {/* Logo */}
          <div className="auth-logo">
            <BookOpen size={32} color="var(--c-accent)" strokeWidth={1.5} />
            <div className="auth-logo-title">Diary</div>
            <div className="auth-logo-sub">Your private space to write</div>
          </div>

          {/* Tabs */}
          <div className="auth-tabs">
            {(["login","signup"] as Tab[]).map(t => (
              <button key={t} className={`auth-tab${tab===t?" active":""}`}
                onClick={() => { setTab(t); setError(""); }}>
                {t === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          {/* Forms */}
          <AnimatePresence mode="wait">
            {tab === "login" ? (
              <motion.form key="login"
                initial={{ opacity:0, x:-12 }} animate={{ opacity:1, x:0 }}
                exit={{ opacity:0, x:12 }} transition={{ duration:0.2 }}
                onSubmit={handleLogin}
                style={{ display:"flex", flexDirection:"column", gap:16 }}
              >
                <Field label="Username">
                  <input value={lusr} onChange={e=>setLusr(e.target.value)}
                    placeholder="your username" autoComplete="username" required className="f-input"/>
                </Field>
                <Field label="Password">
                  <input type="password" value={lpwd} onChange={e=>setLpwd(e.target.value)}
                    placeholder="password" autoComplete="current-password" required className="f-input"/>
                </Field>
                {error && <p className="auth-err">{error}</p>}
                <Btn loading={loading}>Sign In</Btn>
              </motion.form>
            ) : (
              <motion.form key="signup"
                initial={{ opacity:0, x:12 }} animate={{ opacity:1, x:0 }}
                exit={{ opacity:0, x:-12 }} transition={{ duration:0.2 }}
                onSubmit={handleSignup}
                style={{ display:"flex", flexDirection:"column", gap:16 }}
              >
                <Field label="Username" hint="letters, numbers, _ — min 3">
                  <input value={susr} onChange={e=>setSusr(e.target.value)}
                    placeholder="choose a username" autoComplete="username" required className="f-input"/>
                </Field>
                <Field label="Display Name" hint="shown to others">
                  <input value={sname} onChange={e=>setSname(e.target.value)}
                    placeholder="Your Name" className="f-input"/>
                </Field>
                <Field label="Password" hint="min 4 characters">
                  <input type="password" value={spwd} onChange={e=>setSpwd(e.target.value)}
                    placeholder="choose a password" autoComplete="new-password" required className="f-input"/>
                </Field>
                {error && <p className="auth-err">{error}</p>}
                <Btn loading={loading}>Create Account</Btn>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function Field({ label, hint, children }: { label:string; hint?:string; children:React.ReactNode }) {
  return (
    <div className="f-field" style={{ marginBottom:0 }}>
      <label className="f-label">{label}{hint && <span className="f-hint" style={{marginLeft:6}}>{hint}</span>}</label>
      {children}
    </div>
  );
}

function Btn({ loading, children }: { loading:boolean; children:React.ReactNode }) {
  return (
    <motion.button type="submit" disabled={loading} whileTap={{ scale:0.97 }} className="btn-save" style={{ marginTop:4 }}>
      {loading ? "…" : children}
    </motion.button>
  );
}
