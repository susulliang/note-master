import { Check, Monitor, RotateCw, Settings, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import EngineSettingsPanel, { type EngineSettingsPanelProps } from '@/components/EngineSettingsPanel';
import PixelHumanoidAvatar from '@/components/PixelHumanoidAvatar';
import { useAuth } from '@/lib/auth-context';
import { fetchChatProfile, updateChatAvatarRotation, type ChatAvatarProfile } from '@/lib/chat-client';
import { cn } from '@/lib/utils';
import { THEMES, type ThemeId, type UiScale } from '@/lib/themes';

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
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-accent">Your chat identity</p>
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

        <section className="grid gap-4 rounded-2xl border border-border/60 bg-card/45 p-4 shadow-sm backdrop-blur-sm lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.62fr)] sm:p-5">
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

        <section aria-label="Account, companion, audio, and engine settings">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Workspace controls</h2>
              <p className="text-xs text-muted-foreground">Account, companion, capture, and AI engine preferences.</p>
            </div>
          </div>
          <EngineSettingsPanel {...engineSettings} presentation="page" />
        </section>
      </div>
    </main>
  );
}
