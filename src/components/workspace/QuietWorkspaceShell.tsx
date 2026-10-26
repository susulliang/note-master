import { useState, type ReactNode, type RefCallback } from 'react';
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  Compass,
  FilePenLine,
  GraduationCap,
  HelpCircle,
  LayoutGrid,
  Menu,
  MoreHorizontal,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type { WorkView } from '@/components/FlowchartCanvas';
import { cn } from '@/lib/utils';

interface QuietWorkspaceShellProps {
  activeView: WorkView;
  availableViews: WorkView[];
  onNavigate: (view: WorkView) => void;
  onOpenHelp: () => void;
  onUtilitySlot: RefCallback<HTMLDivElement>;
  username?: string;
  nightMode: boolean;
  children: ReactNode;
}

const VIEW_META: Record<WorkView, { label: string; detail: string; icon: typeof Compass }> = {
  commune: { label: 'Commune', detail: 'Team town square', icon: Users },
  callNotes: { label: 'Call Notes', detail: 'Capture and document support calls', icon: FilePenLine },
  caseTrak: { label: 'Cases', detail: 'Case lifecycle and follow-up', icon: LayoutGrid },
  dash: { label: 'Insights', detail: 'Support performance', icon: BarChart3 },
  shifts: { label: 'Schedule', detail: 'Team roster and coverage', icon: CalendarDays },
  selfTest: { label: 'Learn', detail: 'Product knowledge practice', icon: GraduationCap },
};

const VIEW_ORDER: WorkView[] = ['commune', 'callNotes', 'caseTrak', 'dash', 'shifts', 'selfTest'];

function WorkspaceLink({
  view,
  active,
  onClick,
  compact = false,
}: {
  view: WorkView;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const { label, detail, icon: Icon } = VIEW_META[view];
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={cn(
        'group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qw-focus)]',
        active
          ? 'bg-[var(--qw-active)] text-[var(--qw-active-ink)]'
          : 'text-[var(--qw-muted)] hover:bg-[var(--qw-hover)] hover:text-[var(--qw-ink)]',
        compact && 'min-h-10',
      )}
      title={detail}
    >
      <Icon className={cn('size-[18px] shrink-0', active && 'text-[var(--qw-focus)]')} strokeWidth={1.8} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      {active && !compact && <ChevronRight className="size-3.5 text-[var(--qw-muted)]" />}
    </button>
  );
}

export function QuietWorkspaceShell({
  activeView,
  availableViews,
  onNavigate,
  onOpenHelp,
  onUtilitySlot,
  username,
  nightMode,
  children,
}: QuietWorkspaceShellProps) {
  const [tabletNavOpen, setTabletNavOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const views = VIEW_ORDER.filter((view) => availableViews.includes(view));
  const directMobileViews = views.filter((view) => ['commune', 'callNotes'].includes(view));
  const overflowViews = views.filter((view) => !['commune', 'callNotes'].includes(view));
  const current = VIEW_META[activeView];

  const goTo = (view: WorkView) => {
    onNavigate(view);
    setTabletNavOpen(false);
    setMoreOpen(false);
  };

  return (
    <div className={cn('quiet-shell', nightMode && 'quiet-shell--night')}>
      <aside className="quiet-sidebar hidden lg:flex" aria-label="Main navigation">
        <div className="quiet-brand">
          <span className="quiet-brand-mark" aria-hidden="true"><Compass className="size-5" /></span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold tracking-tight">ECOVACS</span>
            <span className="block text-[11px] text-[var(--qw-muted)]">Support workspace</span>
          </span>
        </div>

        <div className="quiet-sidebar-label">WORKSPACE</div>
        <nav className="quiet-nav-list" aria-label="Workspaces">
          {views.map((view) => (
            <WorkspaceLink key={view} view={view} active={activeView === view} onClick={() => goTo(view)} />
          ))}
        </nav>

        <div className="quiet-sidebar-spacer" />

        <button type="button" className="quiet-help-link" onClick={onOpenHelp}>
          <span className="quiet-help-icon"><Sparkles className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Find guidance</span>
            <span className="block text-[11px] text-[var(--qw-muted)]">Ask Kitty Help</span>
          </span>
          <span className="quiet-shortcut">Shift C</span>
        </button>

        <div className="quiet-account">
          <span className="quiet-avatar" aria-hidden="true">{username?.trim().charAt(0).toUpperCase() || 'A'}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">{username || 'Support agent'}</span>
            <span className="block text-[10px] text-[var(--qw-muted)]">Ecovacs NA</span>
          </span>
        </div>
      </aside>

      <div className="quiet-main">
        <header className="quiet-header">
          <button
            type="button"
            className="quiet-header-menu lg:hidden"
            aria-label="Open workspace navigation"
            onClick={() => setTabletNavOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <div className="quiet-mobile-brand lg:hidden">
            <span className="quiet-brand-mark quiet-brand-mark--small" aria-hidden="true"><Compass className="size-4" /></span>
            <span>ECOVACS</span>
          </div>
          <div className="quiet-header-title hidden min-w-0 lg:block">
            <p className="quiet-eyebrow">SUPPORT WORKSPACE</p>
            <h1>{current.label}</h1>
          </div>
          <div className="quiet-header-actions">
            <button type="button" className="quiet-guidance-button" onClick={onOpenHelp}>
              <Sparkles className="size-4" />
              <span>Find guidance</span>
              <kbd>Shift C</kbd>
            </button>
            <div className="quiet-header-utility" ref={onUtilitySlot} />
            <span className="quiet-mobile-avatar lg:hidden" aria-label={username || 'Support agent'}>
              {username?.trim().charAt(0).toUpperCase() || 'A'}
            </span>
          </div>
        </header>

        <main className="quiet-stage" aria-label={`${current.label} workspace`}>
          <div className="quiet-stage-surface">
            {children}
          </div>
        </main>
      </div>

      <nav className="quiet-mobile-dock sm:hidden" aria-label="Mobile navigation">
        {directMobileViews.map((view) => {
          const Icon = VIEW_META[view].icon;
          const active = activeView === view;
          return (
            <button
              key={view}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => goTo(view)}
              className={cn('quiet-dock-item', active && 'quiet-dock-item--active')}
            >
              <Icon className="size-5" strokeWidth={1.8} />
              <span>{VIEW_META[view].label}</span>
            </button>
          );
        })}
        <button type="button" onClick={onOpenHelp} className="quiet-dock-item">
          <HelpCircle className="size-5" strokeWidth={1.8} />
          <span>Help</span>
        </button>
        <button
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
          className={cn('quiet-dock-item', moreOpen && 'quiet-dock-item--active')}
        >
          <MoreHorizontal className="size-5" strokeWidth={1.8} />
          <span>More</span>
        </button>
      </nav>

      {tabletNavOpen && (
        <div className="quiet-nav-scrim lg:hidden" onClick={() => setTabletNavOpen(false)}>
          <aside className="quiet-nav-drawer" aria-label="Workspace navigation" onClick={(event) => event.stopPropagation()}>
            <div className="quiet-drawer-header">
              <span className="quiet-brand-mark quiet-brand-mark--small"><Compass className="size-4" /></span>
              <span className="flex-1 text-sm font-semibold">Workspaces</span>
              <button type="button" aria-label="Close navigation" onClick={() => setTabletNavOpen(false)}><X className="size-4" /></button>
            </div>
            <nav className="quiet-nav-list">
              {views.map((view) => (
                <WorkspaceLink key={view} view={view} active={activeView === view} onClick={() => goTo(view)} />
              ))}
            </nav>
            <button type="button" className="quiet-help-link" onClick={() => { setTabletNavOpen(false); onOpenHelp(); }}>
              <Sparkles className="size-4" />
              <span className="text-sm font-medium">Find guidance</span>
            </button>
          </aside>
        </div>
      )}

      {moreOpen && (
        <div className="quiet-more-scrim sm:hidden" onClick={() => setMoreOpen(false)}>
          <section className="quiet-more-sheet" aria-label="More workspaces" onClick={(event) => event.stopPropagation()}>
            <div className="quiet-sheet-handle" />
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="quiet-eyebrow">MORE TOOLS</p>
                <h2 className="text-base font-semibold">Your workspace</h2>
              </div>
              <button type="button" aria-label="Close more menu" className="quiet-icon-button" onClick={() => setMoreOpen(false)}>
                <X className="size-4" />
              </button>
            </div>
            <div className="quiet-nav-list">
              {overflowViews.map((view) => (
                <WorkspaceLink key={view} view={view} active={activeView === view} onClick={() => goTo(view)} compact />
              ))}
            </div>
            <div className="mt-3 border-t border-[var(--qw-line)] pt-3">
              <button type="button" className="quiet-help-link" onClick={() => { setMoreOpen(false); onOpenHelp(); }}>
                <Sparkles className="size-4" />
                <span className="text-sm font-medium">Find guidance</span>
                <span className="quiet-shortcut">Shift C</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default QuietWorkspaceShell;
