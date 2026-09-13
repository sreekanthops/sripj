import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch, getToken, setToken, clearToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null);   // { userId, username, displayName, avatarUrl }
  const [ready, setReady]   = useState(false);  // finished checking stored token

  // Verify stored token on mount
  useEffect(() => {
    (async () => {
      try {
        const t = await getToken();
        if (t) {
          const me = await apiFetch('/auth/me');
          setUser(me.user ?? me);
        }
      } catch { await clearToken(); }
      finally { setReady(true); }
    })();
  }, []);

  async function login(username, password) {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    await setToken(data.token);
    setUser(data.user ?? { username });
    return data;
  }

  async function signup(fields) {
    const data = await apiFetch('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(fields),
    });
    await setToken(data.token);
    setUser(data.user ?? { username: fields.username });
    return data;
  }

  async function logout() {
    await clearToken();
    setUser(null);
  }

  async function refreshMe() {
    try {
      const me = await apiFetch('/auth/me');
      setUser(me.user ?? me);
    } catch {}
  }

  return (
    <AuthContext.Provider value={{ user, ready, login, signup, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
