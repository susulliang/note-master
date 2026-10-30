import { Check, ExternalLink, KeyRound, Monitor, RotateCw, Settings, Type, Download, RefreshCcw, Sparkles, AlertTriangle } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import EngineSettingsPanel, { type EngineSettingsPanelProps } from '@/components/EngineSettingsPanel';
import PixelHumanoidAvatar from '@/components/PixelHumanoidAvatar';
import { useAuth } from '@/lib/auth-context';
import { changeAccountPassword } from '@/lib/auth-client';
import { fetchChatProfile, updateChatAvatarRotation, type ChatAvatarProfile } from '@/lib/chat-client';
import { cn } from '@/lib/utils';
import { THEMES, type ThemeId, type UiScale } from '@/lib/themes';
import { isTauriEnv } from '@/lib/tauri-env';
import {
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  subscribeUpdater,
  getUpdaterSnapshot,
  type UpdaterSnapshot,
} from '@/lib/updater';
import { openUrl } from '@tauri-apps/plugin-opener';

interface SettingsPageProps extends Omit<EngineSettingsPanelProps, 'presentation' | 'onClose'> {
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  uiScale: UiScale;
  onUiScaleChange: (scale: UiScale) => void;
}

export default function SettingsPage({
  theme,
  onThemeChange,
  uiScale,
  onUiScaleChange,
  ...engineSettings
}: SettingsPageProps) {
  const { user } = useAuth();
  const [avatar, setAvatar] = useState<ChatAvatarProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [updaterState, setUpdaterState] = useState<UpdaterSnapshot>(() =>
    isTauriEnv() ? getUpdaterSnapshot() : { status: 'up-to-date' }
  );

  // Subscribe to updater state changes. Only runs in Tauri desktop builds.
  useEffect(() => {
    if (!isTauriEnv()) return;
    const unsubscribe = subscribeUpdater((snapshot) => setUpdaterState(snapshot));
    return unsubscribe;
  }, []);

  useEffect(() => {
    let alive = true;
    fetchChatProfile()
      .then((profile) => { if (alive) setAvatar(profile); })
      .catch(() => { if (alive) setAvatar({ seed: 0, rotation: 0 }); });
    return () => { alive = false; };
  }, []);

  const rotateAvatar = () => {
    if (!avatar) return;
    const rotation = (avatar.rotation + 90) % 360;
    setAvatar({ ...avatar, rotation });
    updateChatAvatarRotation(rotation).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Could not save avatar rotation.');
    });
  };

  const submitPasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (passwordBusy) return;
    if (newPassword.length < 8) {
      toast.error('Your new password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error('The new passwords do not match.');
      return;
    }
    setPasswordBusy(true);
    try {
      await changeAccountPassword(newPassword, confirmNewPassword);
      setNewPassword('');
      setConfirmNewPassword('');
      toast.success('Password updated. Other sessions have been signed out.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change your password.');
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <main className="custom-scrollbar h-full w-full overflow-y-auto bg-background/20 px-4 py-5 sm:px-6 sm:py-7 lg:px-9">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Settings className="size-3.5" /> Workspace preferences
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Settings</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Shape how Econote looks and works on this device. Changes save automatically.
            </p>
          </div>
        </header>

        <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-border/60 bg-card/45 p-4 shadow-sm backdrop-blur-sm sm:p-5">
          <div className="w-full">
            <h2 className="text-sm font-semibold text-foreground">Chat Avatar</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Your shared identity in direct and group chats.</p>
          </div>
          <button
            type="button"
            onClick={rotateAvatar}
            disabled={!avatar}
            aria-label="Rotate your pixel avatar"
            title="Click to rotate"
            className="grid size-[76px] shrink-0 place-items-center rounded-2xl border border-accent/20 bg-accent/10 transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
          >
            {avatar
              ? <PixelHumanoidAvatar seed={avatar.seed} rotation={avatar.rotation} size={64} />
              : <span className="size-8 animate-pulse rounded-lg bg-muted" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-accent">Profile</p>
            <h2 className="mt-1 text-sm font-semibold text-foreground">{user?.username ?? 'Your avatar'}</h2>
            <p className="mt-1 max-w-lg text-xs leading-relaxed text-muted-foreground">
              Your 64 × 64 pixel avatar is randomized once and shown beside your name in chat. Click it to rotate; the change syncs to your account.
            </p>
          </div>
          <button
            type="button"
            onClick={rotateAvatar}
            disabled={!avatar}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border/70 bg-background/50 px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <RotateCw className="size-3.5" />
            Rotate
          </button>
        </section>

        <section className="rounded-2xl border border-border/60 bg-card/45 p-4 shadow-sm backdrop-blur-sm sm:p-5">
          <div className="mb-4 flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
              <KeyRound className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Change password</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Set a new password while signed in. Your current password is not required.
              </p>
            </div>
          </div>
          <form onSubmit={(event) => void submitPasswordChange(event)} className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                New password
              </span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={256}
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="glass-field h-11 w-full rounded-xl border border-border/60 bg-background/65 px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Confirm new password
              </span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={256}
                required
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                className="glass-field h-11 w-full rounded-xl border border-border/60 bg-background/65 px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
              <p className="text-[10px] text-muted-foreground">At least 8 characters. Other active sessions will be signed out.</p>
              <button
                type="submit"
                disabled={passwordBusy || !newPassword || !confirmNewPassword}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-xs font-semibold text-accent-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <KeyRound className="size-3.5" />
                {passwordBusy ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        </section>

        <section className="grid gap-4 rounded-2xl border border-border/60 bg-card/45 p-4 shadow-sm backdrop-blur-sm lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.62fr)] sm:p-5">
          <div className="lg:col-span-2">
            <h2 className="text-sm font-semibold text-foreground">Appearance</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Choose the visual style and reading scale for your workspace.</p>
          </div>
          <div>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-foreground">Theme</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Choose a color palette for your workspace.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {THEMES.map(({ id, label, icon: Icon }) => {
                const selected = theme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onThemeChange(id)}
                    className={cn(
                      'flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      selected
                        ? 'border-primary/60 bg-primary/10 text-foreground'
                        : 'border-border/50 bg-background/40 text-muted-foreground hover:border-border hover:bg-background/70 hover:text-foreground'
                    )}
                  >
                    <Icon className={cn('size-4 shrink-0', selected && 'text-primary')} />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {selected && <Check className="size-3.5 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border/50 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-foreground">Text size</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Pick the reading size that feels comfortable.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <button
                type="button"
                aria-pressed={uiScale !== 'large'}
                onClick={() => onUiScaleChange('normal')}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  uiScale !== 'large'
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-border/50 bg-background/40 hover:bg-background/70'
                )}
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-background/70 text-muted-foreground">
                  <Type className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-foreground">Standard</span>
                  <span className="block text-xs text-muted-foreground">Default workspace scale</span>
                </span>
              </button>
              <button
                type="button"
                aria-pressed={uiScale === 'large'}
                onClick={() => onUiScaleChange('large')}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  uiScale === 'large'
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-border/50 bg-background/40 hover:bg-background/70'
                )}
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-background/70 text-muted-foreground">
                  <Monitor className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-foreground">Larger text</span>
                  <span className="block text-xs text-muted-foreground">Scale the interface up for readability</span>
                </span>
              </button>
            </div>
          </div>
        </section>

        <section aria-label="Account, fonts, cat, canvas, keywords, engines, and debug">
          <EngineSettingsPanel {...engineSettings} presentation="page" />
        </section>

        {/* About / Updates section — desktop Tauri builds only. */}
        {isTauriEnv() && (
          <section className="rounded-2xl border border-border/60 bg-card/45 p-4 shadow-sm backdrop-blur-sm sm:p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </span>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-foreground">About Econote</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Keep your desktop app up to date with the latest features and fixes.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Left: Version info + actions */}
              <div className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Current version
                  </span>
                  <span className="text-sm font-mono font-semibold text-foreground">
                    {updaterState.info?.currentVersion ?? '—'}
                  </span>
                </div>

                {updaterState.info && updaterState.status === 'available' && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    <strong>v{updaterState.info.availableVersion}</strong> is available
                    {updaterState.info.date && (
                      <span className="text-amber-300/70"> · published {updaterState.info.date.slice(0, 10)}</span>
                    )}
                  </div>
                )}

                {updaterState.status === 'up-to-date' && (
                  <div className="flex items-center gap-1.5 text-xs text-primary">
                    <Check className="size-3.5" />
                    You're running the latest version.
                  </div>
                )}

                {updaterState.status === 'checking' && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <RefreshCcw className="size-3.5 animate-spin" />
                    Checking for updates…
                  </div>
                )}

                {updaterState.status === 'error' && (
                  <div className="flex items-start gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>{updaterState.error ?? 'Something went wrong. Try again later.'}</span>
                  </div>
                )}

                {updaterState.lastCheckedAt && (
                  <p className="text-[10px] text-muted-foreground">
                    Last checked {new Date(updaterState.lastCheckedAt).toLocaleString()}
                  </p>
                )}

                {/* Download progress */}
                {updaterState.status === 'downloading' && updaterState.progress && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Downloading v{updaterState.info?.availableVersion}…</span>
                      <span className="font-mono">
                        {updaterState.progress.total
                          ? `${Math.round((updaterState.progress.downloaded / updaterState.progress.total) * 100)}%`
                          : `${(updaterState.progress.downloaded / 1_000_000).toFixed(1)} MB`}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-150"
                        style={{
                          width: updaterState.progress.total
                            ? `${(updaterState.progress.downloaded / updaterState.progress.total) * 100}%`
                            : '20%',
                        }}
                      />
                    </div>
                  </div>
                )}

                {updaterState.status === 'downloaded' && (
                  <div className="flex items-center gap-1.5 text-xs text-primary">
                    <Download className="size-3.5" />
                    Download ready — install to update.
                  </div>
                )}
              </div>

              {/* Right: Action buttons */}
              <div className="flex flex-col gap-2">
                {updaterState.status !== 'downloading' && updaterState.status !== 'installing' && updaterState.status !== 'available' && updaterState.status !== 'downloaded' && (
                  <button
                    type="button"
                    onClick={() => { void checkForUpdate(); }}
                    disabled={updaterState.status === 'checking'}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/50 px-3 text-xs font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
                  >
                    <RefreshCcw className={cn('size-3.5', updaterState.status === 'checking' && 'animate-spin')} />
                    {updaterState.status === 'checking' ? 'Checking…' : 'Check for Updates'}
                  </button>
                )}

                {updaterState.status === 'available' && (
                  <button
                    type="button"
                    onClick={() => { void downloadUpdate(); }}
                    disabled={updaterState.status !== 'available'}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                  >
                    <Download className="size-3.5" />
                    Download v{updaterState.info?.availableVersion}
                  </button>
                )}

                {updaterState.status === 'downloaded' && (
                  <button
                    type="button"
                    onClick={() => { void installUpdate(); }}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-accent px-3 text-xs font-semibold text-accent-foreground transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <RefreshCcw className="size-3.5" />
                    Install & Restart
                  </button>
                )}

                {updaterState.info?.body && updaterState.status === 'available' && (
                  <div className="mt-1 rounded-lg border border-border/50 bg-background/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    <p className="mb-1 font-semibold text-foreground">Release notes</p>
                    <p className="line-clamp-6 whitespace-pre-wrap">{updaterState.info.body}</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => { void openUrl('https://github.com/susulliang/note-master/releases').catch(() => undefined); }}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/50 px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <ExternalLink className="size-3.5" />
                  View all releases
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
