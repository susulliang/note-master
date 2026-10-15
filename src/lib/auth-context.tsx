/**
 * Auth context — global login state for the note-master account system.
 * Restores the session from the stored bearer token on mount, exposes
 * login/register/logout, and derives the privilege flags that drive the
 * hidden work-view rail pills (Dash / Roster / Trak).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as api from '@/lib/auth-client';
import type { AuthUser } from '@/lib/auth-client';

export interface AuthPrivileges {
  dash: boolean;
  roster: boolean;
  trak: boolean;
}

interface AuthContextValue {
  /** Current user, or null when signed out / session not yet resolved. */
  user: AuthUser | null;
  /** True until the initial /me probe settles (prevents flicker of gated UI). */
  resolving: boolean;
  privileges: AuthPrivileges | null;
  login: (username: string, password: string) => Promise<AuthUser>;
  register: (username: string, password: string, confirm: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** Re-pull /me (e.g. after an admin edits this user's privileges). */
  refresh: () => Promise<void>;
  /** Locally patch the spice balance (after a purchase / QA award round-trip). */
  setSpice: (spice: number) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [resolving, setResolving] = useState(true);

  // Restore the session from the stored token on first mount.
  useEffect(() => {
    let alive = true;
    api
      .me()
      .then((u) => {
        if (alive) setUser(u);
      })
      .catch(() => {
        if (alive) setUser(null);
      })
      .finally(() => {
        if (alive) setResolving(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const out = await api.login(username, password);
    setUser(out.user);
    return out.user;
  }, []);

  const register = useCallback(async (username: string, password: string, confirm: string) => {
    const out = await api.register(username, password, confirm);
    setUser(out.user);
    return out.user;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.me());
    } catch {
      setUser(null);
    }
  }, []);

  const setSpice = useCallback((spice: number) => {
    setUser((prev) => (prev ? { ...prev, spice } : prev));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      resolving,
      privileges: user ? user.privileges : null,
      login,
      register,
      logout,
      refresh,
      setSpice,
    }),
    [user, resolving, login, register, logout, refresh, setSpice]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
