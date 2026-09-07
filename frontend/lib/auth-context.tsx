"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getToken, setToken, clearToken } from "@/lib/api";
import type { User } from "@/lib/api";

interface AuthCtx {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]     = useState<User | null>(null);
  const [token, setTok]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const t = getToken();
    if (!t) { setLoading(false); return; }
    try {
      const data = await api.get<User>("/auth/verify");
      setUser(data);
      setTok(t);
    } catch {
      clearToken();
      setUser(null);
      setTok(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  const login = async (username: string, password: string) => {
    const data = await api.post<User & { token: string }>("/auth/login", { username, password });
    setToken(data.token);
    setTok(data.token);
    setUser({ userId: data.userId, username: data.username, displayName: data.displayName });
  };

  const signup = async (username: string, password: string, displayName: string) => {
    const data = await api.post<User & { token: string }>("/auth/signup", { username, password, displayName });
    setToken(data.token);
    setTok(data.token);
    setUser({ userId: data.userId, username: data.username, displayName: data.displayName });
  };

  const logout = () => {
    clearToken();
    setUser(null);
    setTok(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
