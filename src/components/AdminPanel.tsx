/**
 * Admin panel — Dezzy-only management console, toggled with Shift+A (only
 * available while an admin account is logged in; the hotkey is a no-op for
 * everyone else). Manages per-user privileges — Dash / Roster / Trak rail
 * visibility — and supports force-deleting accounts (the username can then
 * register again). All data lives in D1 via the Worker auth API.
 */

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, Trash2, UserCog, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { adminDeleteUser, adminListUsers, adminSetPrivileges, type AdminUserRow } from '@/lib/auth-client';

interface AdminPanelProps {
  onClose: () => void;
}

type PrivilegeKey = 'dash' | 'roster' | 'trak';

const PRIVILEGE_LABELS: { key: PrivilegeKey; label: string }[] = [
  { key: 'dash', label: 'DASH' },
  { key: 'roster', label: 'Roster' },
  { key: 'trak', label: 'TRAK' },
];

export default function AdminPanel({ onClose }: AdminPanelProps) {
  const { user, refresh: refreshSelf } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setUsers(await adminListUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const togglePrivilege = async (row: AdminUserRow, key: PrivilegeKey) => {
    if (busyName) return;
    setBusyName(row.username);
    setError(null);
    try {
      const updated = await adminSetPrivileges(row.username, { [key]: !row.privileges[key] });
      setUsers((prev) => (prev ? prev.map((u) => (u.username === updated.username ? { ...u, ...updated } : u)) : prev));
      // If Dezzy edits their own privileges, sync the live session too.
      if (user?.username === updated.username) void refreshSelf();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update privileges');
    } finally {
      setBusyName(null);
    }
  };

  const forceDelete = async (row: AdminUserRow) => {
    if (busyName) return;
    setBusyName(row.username);
    setError(null);
    try {
      await adminDeleteUser(row.username);
      setUsers((prev) => (prev ? prev.filter((u) => u.username !== row.username) : prev));
      setConfirmDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setBusyName(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Admin panel"
        className="glass-panel relative flex max-h-[80vh] w-[min(560px,calc(100vw-32px))] flex-col rounded-2xl border-sky-400/30 p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>

        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <div className="glass-panel flex size-11 items-center justify-center rounded-xl border-sky-400/40 bg-sky-400/10">
            <ShieldCheck className="size-6 text-sky-300" />
          </div>
          <div className="flex-1">
            <h2 className="font-mono text-xl font-extrabold tracking-tight text-foreground">Admin Panel</h2>
            <p className="text-xs text-muted-foreground">
              {users ? `${users.length} account${users.length === 1 ? '' : 's'} · toggles apply instantly` : 'Loading accounts…'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="glass-btn rounded-lg p-2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Reload users"
          >
            <RefreshCw className={cn('size-4', users === null && 'animate-spin')} />
          </button>
        </div>

        {error && (
          <p className="mb-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
            {error}
          </p>
        )}

        {/* User list */}
        <div className="custom-scrollbar -mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
          {users === null && !error && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl border border-border/50 bg-muted/40" />
              ))}
            </div>
          )}
          {users?.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No accounts registered yet.</p>
          )}
          {users?.map((row) => {
            const isAdminRow = row.isAdmin;
            const busy = busyName === row.username;
            return (
              <div
                key={row.username}
                className={cn(
                  'rounded-xl border p-3 transition-colors',
                  isAdminRow ? 'border-sky-400/40 bg-sky-500/10' : 'border-border/60 bg-background/35'
                )}
              >
                <div className="flex items-center gap-2">
                  <UserCog className={cn('size-4 shrink-0', isAdminRow ? 'text-sky-300' : 'text-muted-foreground')} />
                  <p className="flex-1 truncate text-sm font-extrabold text-foreground">
                    {row.username}
                    {isAdminRow && (
                      <span className="ml-2 rounded bg-sky-400/20 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wider text-sky-300">
                        Admin
                      </span>
                    )}
                    {user?.username === row.username && (
                      <span className="ml-1.5 text-[10px] font-semibold text-muted-foreground">(you)</span>
                    )}
                  </p>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {PRIVILEGE_LABELS.map(({ key, label }) => {
                    const on = row.privileges[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={busy}
                        aria-pressed={on}
                        onClick={() => void togglePrivilege(row, key)}
                        className={cn(
                          'rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors',
                          on
                            ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                            : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/70',
                          busy && 'opacity-50'
                        )}
                        title={`${on ? 'Hide' : 'Show'} ${label} for ${row.username}`}
                      >
                        {label} {on ? '✓' : '✕'}
                      </button>
                    );
                  })}

                  {/* Force delete — disabled for the admin account */}
                  {isAdminRow ? (
                    <span className="ml-auto text-[10px] text-muted-foreground/70">protected</span>
                  ) : confirmDelete === row.username ? (
                    <span className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void forceDelete(row)}
                        className="rounded-lg border border-red-400/60 bg-red-500/80 px-2.5 py-1 text-[11px] font-bold text-white hover:brightness-110"
                      >
                        {busy ? 'Deleting…' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        className="rounded-lg border border-border/60 px-2.5 py-1 text-[11px] font-bold text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDelete(row.username)}
                      className="ml-auto flex items-center gap-1 rounded-lg border border-red-400/40 px-2.5 py-1 text-[11px] font-bold text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-50"
                      title={`Force-delete ${row.username} (they can register again)`}
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-3 shrink-0 text-center text-[10px] text-muted-foreground/70">
          Force-deleted users can register the same username again · Shift+A toggles this panel
        </p>
      </div>
    </div>
  );
}
