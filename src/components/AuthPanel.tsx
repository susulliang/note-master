/**
 * Agent sign-in gate — required on entry, then available as an account modal.
 *
 * Two tabs:
 *   • Login — username dropdown + password.
 *   • Register — username dropdown + password + confirm (register button).
 *
 * The username dropdown lists the roster's English aliases plus the fixed
 * extras (Yolanda / Jingyang / Troy / Dezzy). Accounts live in D1 (see
 * worker/index.ts); a successful login/register stores the bearer token and
 * updates the global auth context.
 */

import { useMemo, useState, type FormEvent } from 'react';
import { KeyRound, LogIn, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { ROSTER_202610 } from '@/data/roster-2026-10';
import { ROSTER_202611 } from '@/data/roster-2026-11';

const EXTRA_NAMES = ['Yolanda', 'Jingyang', 'Troy', 'Dezzy'];

/** All selectable usernames — roster English aliases (deduped, sorted) plus
 *  the fixed extra accounts. */
const USERNAME_OPTIONS: string[] = (() => {
  const set = new Set<string>();
  for (const agent of [...ROSTER_202610, ...ROSTER_202611]) {
    if (agent.en) set.add(agent.en);
  }
  for (const name of EXTRA_NAMES) set.add(name);
  return [...set].sort((a, b) => a.localeCompare(b));
})();

interface AuthPanelProps {
  onClose: () => void;
  required?: boolean;
  presentation?: 'modal' | 'page';
}

export default function AuthPanel({ onClose, required = false, presentation = 'modal' }: AuthPanelProps) {
  const pagePresentation = presentation === 'page';
  const { user, login, register, logout } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (tab === 'login') {
        await login(username, password);
      } else {
        await register(username, password, confirm);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const sortedOptions = useMemo(() => USERNAME_OPTIONS, []);
  const selectClass =
    'glass-field auth-form-field w-full appearance-none rounded-xl px-4 py-3 text-base font-semibold text-foreground focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30';

  return (
    <div
      className={cn(
        pagePresentation
          ? 'grid min-h-full w-full place-items-center bg-background/20 p-4 sm:p-8'
          : 'fixed inset-0 z-[90] flex items-center justify-center backdrop-blur-sm',
        !pagePresentation && (required ? 'bg-background/95' : 'bg-black/40')
      )}
      onMouseDown={(e) => {
        if (!pagePresentation && !required && e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (!pagePresentation && e.key === 'Escape' && !required) onClose();
      }}
    >
      <div
        role={pagePresentation ? 'main' : 'dialog'}
        aria-modal={pagePresentation ? undefined : true}
        aria-label={required ? 'Agent sign in' : 'Authentication'}
        className={cn(
          'glass-panel relative overflow-hidden shadow-2xl',
          pagePresentation
            ? 'grid w-full max-w-5xl rounded-3xl border-violet-400/25 bg-card/55 lg:min-h-[620px] lg:grid-cols-[1fr_0.9fr]'
            : 'w-[min(420px,calc(100vw-32px))] rounded-2xl border-violet-400/30 p-6'
        )}
      >
        {pagePresentation && (
          <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border/50 bg-gradient-to-br from-violet-500/15 via-background/35 to-accent/10 p-8 lg:flex xl:p-11">
            <div className="absolute -right-20 -top-20 size-72 rounded-full bg-violet-400/10 blur-3xl" aria-hidden />
            <div className="relative">
              <div className="mb-6 flex size-12 items-center justify-center rounded-2xl border border-violet-300/30 bg-violet-400/10">
                <KeyRound className="size-6 text-violet-300" />
              </div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-violet-200/80">Ecovacs Support</p>
              <h1 className="mt-3 max-w-sm text-3xl font-bold leading-tight tracking-tight text-foreground xl:text-4xl">
                Your support workspace, ready when you are.
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Sign in to manage calls, collaborate in Commune, and reach the tools assigned to your account.
              </p>
            </div>
            <div className="relative grid gap-2 text-xs text-muted-foreground">
              <div className="rounded-xl border border-border/40 bg-background/35 px-3 py-2.5">Private agent workspace</div>
              <div className="rounded-xl border border-border/40 bg-background/35 px-3 py-2.5">Your access follows your assigned role</div>
            </div>
          </aside>
        )}
        <div className={cn('relative', pagePresentation ? 'p-5 sm:p-8 lg:p-10' : '')}>
        {!required && !pagePresentation && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        )}

        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <div className="glass-panel flex size-11 items-center justify-center rounded-xl border-violet-400/40 bg-violet-400/10">
            <KeyRound className="size-6 text-violet-300" />
          </div>
          <div>
            <h2 className="font-mono text-xl font-extrabold tracking-tight text-foreground">
              {required ? 'Agent sign in' : 'Authentication'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {required ? 'Sign in to enter the support workspace' : 'Accounts are stored server-side (D1)'}
            </p>
          </div>
        </div>

        {/* Logged-in state — show account + logout */}
        {user ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300/80">Signed in as</p>
              <p className="mt-0.5 text-lg font-extrabold text-foreground">{user.username}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Privileges:{' '}
                {[
                  user.privileges.dash && 'Dash',
                  user.privileges.roster && 'Roster',
                  user.privileges.trak && 'Trak',
                ]
                  .filter(Boolean)
                  .join(' · ') || 'none granted'}
                {user.isSuperAdmin
                  ? ' · Super Admin'
                  : user.isAdmin
                    ? ' · Admin'
                    : user.isManagement
                      ? ' · Management'
                      : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await logout();
                onClose();
              }}
              className="glass-btn w-full rounded-xl border-red-400/50 bg-red-500/80 px-4 py-3 font-mono text-base font-extrabold uppercase tracking-wide text-white shadow-[0_0_18px_-10px_rgba(248,113,113,0.7)] transition-all duration-200 hover:brightness-110 active:scale-[0.99]"
            >
              Log out
            </button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div role="tablist" aria-label="Authentication mode" className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-border/60 bg-muted/40 p-1">
              {(
                [
                  { id: 'login', label: 'Log in', icon: LogIn },
                  { id: 'register', label: 'Register', icon: UserPlus },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => {
                    setTab(id);
                    setError(null);
                  }}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-colors',
                    tab === id
                      ? 'bg-violet-500/80 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Username dropdown */}
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Username
                </span>
                <select value={username} onChange={(e) => setUsername(e.target.value)} className={selectClass}>
                  <option value="" disabled>
                    Select your name…
                  </option>
                  {sortedOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Password */}
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                  className="glass-field auth-form-field w-full rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/60 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                />
              </label>

              {/* Confirm password (register tab only) */}
              {tab === 'register' && (
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Confirm password
                  </span>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="glass-field auth-form-field w-full rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/60 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                  />
                </label>
              )}

              {error && (
                <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy || !username || !password || (tab === 'register' && !confirm)}
                className={cn(
                  'glass-btn w-full rounded-xl px-4 py-3 font-mono text-base font-extrabold uppercase tracking-wide transition-all duration-200',
                  busy || !username || !password || (tab === 'register' && !confirm)
                    ? 'cursor-not-allowed border-border/60 bg-muted/60 text-muted-foreground'
                    : 'glass-chip border-violet-400/50 bg-violet-500/80 text-white shadow-[0_0_18px_-10px_rgba(167,139,250,0.7)] hover:brightness-110 active:scale-[0.99]'
                )}
              >
                {busy ? 'Working…' : tab === 'login' ? 'Log in ▶' : 'Register ✓'}
              </button>
            </form>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
