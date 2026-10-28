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
  const selectClass = cn(
    'glass-field auth-form-field w-full appearance-none rounded-xl px-4 py-3 text-base font-semibold text-foreground focus:outline-none focus:ring-2',
    pagePresentation
      ? 'border-white/10 bg-white/[0.04] focus:border-teal-300 focus:ring-teal-300/20'
      : 'focus:border-violet-400 focus:ring-violet-400/30',
  );

  return (
    <div
      className={cn(
        pagePresentation
          ? 'auth-page relative grid min-h-full w-full place-items-center overflow-hidden bg-[radial-gradient(ellipse_at_15%_20%,rgba(20,184,166,0.16),transparent_38%),radial-gradient(ellipse_at_85%_80%,rgba(59,130,246,0.13),transparent_42%),linear-gradient(145deg,#080d14,#101a25_55%,#0b1119)] p-4 sm:p-8'
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
      {pagePresentation && (
        <>
          <div className="pointer-events-none absolute left-[12%] top-[12%] size-72 rounded-full bg-teal-400/10 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute bottom-[8%] right-[8%] size-80 rounded-full bg-blue-400/10 blur-3xl" aria-hidden />
        </>
      )}
      <div
        role={pagePresentation ? 'main' : 'dialog'}
        aria-modal={pagePresentation ? undefined : true}
        aria-label={required ? 'Agent sign in' : 'Authentication'}
        className={cn(
          'glass-panel relative z-10 overflow-hidden shadow-2xl',
          pagePresentation
            ? 'grid w-full max-w-6xl rounded-[28px] border-white/10 bg-[#0b121c]/85 shadow-[0_32px_100px_rgba(0,0,0,0.48)] backdrop-blur-2xl lg:min-h-[660px] lg:grid-cols-[1.05fr_0.95fr]'
            : 'w-[min(420px,calc(100vw-32px))] rounded-2xl border-violet-400/30 p-6'
        )}
      >
        {pagePresentation && (
          <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-white/10 bg-[linear-gradient(145deg,rgba(18,36,46,0.9),rgba(12,20,31,0.62)_60%,rgba(15,28,42,0.8))] p-8 lg:flex xl:p-12">
            <div className="absolute -right-20 -top-20 size-72 rounded-full bg-teal-300/10 blur-3xl" aria-hidden />
            <div className="absolute -bottom-24 -left-16 size-72 rounded-full bg-blue-400/10 blur-3xl" aria-hidden />
            <div className="relative">
              <div className="mb-8 flex size-14 items-center justify-center rounded-[20px] border border-teal-200/20 bg-teal-300/10 shadow-[0_0_42px_rgba(45,212,191,0.1)]">
                <KeyRound className="size-6 text-teal-200" />
              </div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-teal-100/65">ECONOTE / AGENT WORKSPACE</p>
              <h1 className="mt-5 max-w-md text-4xl font-semibold leading-[1.08] tracking-tight text-white xl:text-5xl">
                Econote, <span className="text-teal-200">notey note.</span>
              </h1>
              <p className="mt-5 max-w-sm text-sm leading-7 text-slate-300/80">
                A calmer place to capture customer details, work through a call, and stay in sync with your team.
              </p>
            </div>
            <div className="relative grid max-w-md gap-2.5">
              {[
                ['01', 'Call notes', 'Keep every detail in the flow'],
                ['02', 'Team chat', 'Pick up conversations together'],
                ['03', 'Collab space', 'Stay close to shared work'],
              ].map(([number, title, description]) => (
                <div key={number} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-3.5 py-3">
                  <span className="font-mono text-[10px] text-teal-200/60">{number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-slate-100/90">{title}</span>
                    <span className="mt-0.5 block text-[10px] text-slate-400">{description}</span>
                  </span>
                  <span className="size-1.5 rounded-full bg-teal-300/70 shadow-[0_0_10px_rgba(94,234,212,0.55)]" />
                </div>
              ))}
            </div>
          </aside>
        )}
        <div className={cn('relative', pagePresentation ? 'p-5 sm:p-8 lg:p-10 xl:p-12' : '')}>
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
        <div className={cn('mb-6 flex items-center gap-3', pagePresentation && 'mb-8')}>
          {!pagePresentation && (
            <div className="glass-panel flex size-11 items-center justify-center rounded-xl border-violet-400/40 bg-violet-400/10">
              <KeyRound className="size-6 text-violet-300" />
            </div>
          )}
          <div className="min-w-0">
            {pagePresentation && (
              <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.24em] text-teal-200/70">
                ECONOTE · SECURE WORKSPACE
              </p>
            )}
            {pagePresentation && (
              <p className="mb-1 text-xs font-semibold text-teal-100/80 lg:hidden">
                Econote, notey note.
              </p>
            )}
            <h2 className={cn(
              'font-mono text-xl font-extrabold tracking-tight text-foreground',
              pagePresentation && 'text-2xl sm:text-3xl',
            )}>
              {pagePresentation
                ? tab === 'login' ? 'Welcome back.' : 'Create your account.'
                : required ? 'Agent sign in' : 'Authentication'}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {pagePresentation
                ? tab === 'login' ? 'Sign in and get back to the conversation.' : 'Set up your Econote workspace access.'
                : required ? 'Sign in to enter the support workspace' : 'Accounts are stored server-side (D1)'}
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
                  ? ' · Dev'
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
                      ? pagePresentation
                        ? 'bg-teal-300/15 text-teal-100 shadow-sm ring-1 ring-teal-200/20'
                        : 'bg-violet-500/80 text-white shadow-sm'
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
                  className={cn(
                    'glass-field auth-form-field w-full rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2',
                    pagePresentation
                      ? 'border-white/10 bg-white/[0.04] focus:border-teal-300 focus:ring-teal-300/20'
                      : 'focus:border-violet-400 focus:ring-violet-400/30',
                  )}
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
                    className={cn(
                      'glass-field auth-form-field w-full rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2',
                      pagePresentation
                        ? 'border-white/10 bg-white/[0.04] focus:border-teal-300 focus:ring-teal-300/20'
                        : 'focus:border-violet-400 focus:ring-violet-400/30',
                    )}
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
                    : pagePresentation
                      ? 'glass-chip border-teal-200/25 bg-teal-300/15 text-teal-50 shadow-[0_0_28px_-14px_rgba(45,212,191,0.65)] hover:bg-teal-300/25 active:scale-[0.99]'
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
