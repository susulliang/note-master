/**
 * Auth API client — talks to the note-master Worker's D1-backed auth API
 * (see worker/index.ts). Sessions are opaque bearer tokens kept in
 * localStorage; the Worker validates them against the auth_sessions table.
 */

export interface AuthUser {
  username: string;
  isAdmin: boolean;
  privileges: { dash: boolean; roster: boolean; trak: boolean };
}

const TOKEN_KEY = 'ecovacs_auth_token';

/** Workers deployment serves the API; other origins (Vercel / Tauri / local
 *  dev) call it cross-origin — the Worker sends permissive CORS headers. */
const WORKERS_ORIGIN = 'https://note-master.susulliang.workers.dev';
const API_BASE: string = (() => {
  if (import.meta.env.VITE_AUTH_API_BASE) return String(import.meta.env.VITE_AUTH_API_BASE).replace(/\/+$/, '');
  if (typeof window === 'undefined') return WORKERS_ORIGIN;
  const host = window.location.hostname;
  // Same-origin on the Workers deployment; everywhere else (Vercel / Tauri /
  // localhost dev) call the Workers deployment cross-origin (CORS is open).
  if (host.endsWith('.workers.dev')) return '';
  return WORKERS_ORIGIN;
})();

export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Resolved API origin — shared by other API clients (e.g. roster-sync). */
export function getApiBase(): string {
  return API_BASE;
}

function setStoredToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — session stays in memory only */
  }
}

async function call<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const { token, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (rest.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...rest, headers });
  } catch {
    throw new Error('Network error — is the auth server reachable?');
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}

export async function fetchServerNames(): Promise<{ names: string[]; admin: string[] }> {
  return call<{ names: string[]; admin: string[] }>('/api/auth/names');
}

export async function register(username: string, password: string, confirm: string): Promise<{ token: string; user: AuthUser }> {
  const out = await call<{ token: string; user: AuthUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, confirm }),
  });
  setStoredToken(out.token);
  return out;
}

export async function login(username: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const out = await call<{ token: string; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setStoredToken(out.token);
  return out;
}

export async function logout(): Promise<void> {
  const token = getStoredToken();
  if (token) {
    await call('/api/auth/logout', { method: 'POST', token }).catch(() => undefined);
  }
  setStoredToken(null);
}

export async function me(): Promise<AuthUser> {
  const token = getStoredToken();
  if (!token) throw new Error('No session');
  const out = await call<{ user: AuthUser }>('/api/auth/me', { token });
  return out.user;
}

// ── Admin ────────────────────────────────────────────────────────────────────

export interface AdminUserRow extends AuthUser {
  createdAt: number;
}

export async function adminListUsers(): Promise<AdminUserRow[]> {
  const token = getStoredToken();
  const out = await call<{ users: AdminUserRow[] }>('/api/admin/users', { token });
  return out.users;
}

export async function adminSetPrivileges(
  username: string,
  patch: { dash?: boolean; roster?: boolean; trak?: boolean }
): Promise<AuthUser> {
  const token = getStoredToken();
  const out = await call<{ user: AuthUser }>('/api/admin/privileges', {
    method: 'POST',
    body: JSON.stringify({ username, ...patch }),
    token,
  });
  return out.user;
}

export async function adminDeleteUser(username: string): Promise<void> {
  const token = getStoredToken();
  await call('/api/admin/delete', { method: 'POST', body: JSON.stringify({ username }), token });
}
