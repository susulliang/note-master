import type { ReactNode, RefCallback } from 'react';
import {
  AudioLines,
  BarChart3,
  BookMarked,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FilePenLine,
  GraduationCap,
  LayoutGrid,
  PackageSearch,
  Sparkles,
  Users,
} from 'lucide-react';
import type { WorkView } from '@/components/FlowchartCanvas';
import { cn } from '@/lib/utils';

interface QuietWorkspaceShellProps {
  activeView: WorkView;
  availableViews: WorkView[];
  onNavigate: (view: WorkView) => void;
  onOpenHelp: () => void;
  onOpenWidget: (widget: WidgetId) => void;
  onUtilitySlot: RefCallback<HTMLDivElement>;
  username?: string;
  hideDock?: boolean;
  children: ReactNode;
}

export type WidgetId = 'tracker' | 'guides' | 'product' | 'transcript' | 'qa' | 'manuals';

const VIEW_META: Record<WorkView, { label: string; icon: typeof Users }> = {
  commune: { label: 'Commune', icon: Users },
  callNotes: { label: 'Call Notes', icon: FilePenLine },
  caseTrak: { label: 'Cases', icon: LayoutGrid },
  dash: { label: 'DASH', icon: BarChart3 },
  shifts: { label: 'Schedule', icon: CalendarDays },
  selfTest: { label: 'Learn', icon: GraduationCap },
};

const VIEW_ORDER: WorkView[] = ['commune', 'callNotes', 'caseTrak', 'dash', 'shifts', 'selfTest'];
const SUPPORT_WIDGETS: Array<{ id: WidgetId; label: string; icon: typeof Users }> = [
  { id: 'tracker', label: '24-hour case tracker', icon: Clock3 },
  { id: 'guides', label: 'SOP lookup', icon: BookOpen },
  { id: 'product', label: 'Product lookup', icon: PackageSearch },
  { id: 'transcript', label: 'Live transcript', icon: AudioLines },
  { id: 'qa', label: 'QA review', icon: ClipboardCheck },
  { id: 'manuals', label: 'Product manuals', icon: BookMarked },
];

export function QuietWorkspaceShell({
  activeView,
  availableViews,
  onNavigate,
  onOpenHelp,
  onOpenWidget,
  onUtilitySlot,
  username,
  hideDock = false,
  children,
}: QuietWorkspaceShellProps) {
  const views = VIEW_ORDER.filter((view) => availableViews.includes(view));

  return (
    <div className="quiet-shell">
      <main className="quiet-stage" aria-label={`${VIEW_META[activeView].label} workspace`}>
          <div className="quiet-stage-surface">
            {children}
          </div>
      </main>

      <div className="quiet-global-controls" ref={onUtilitySlot} aria-label={`Global controls for ${username || 'agent'}`} />

      {!hideDock && (
        <nav className="quiet-orbit-dock" aria-label="Workspace and support tools">
          <div className="quiet-dock-cluster quiet-dock-cluster--navigation" aria-label="Workspaces">
            {views.map((view) => {
              const Icon = VIEW_META[view].icon;
              return (
                <button
                  key={view}
                  type="button"
                  title={VIEW_META[view].label}
                  aria-label={VIEW_META[view].label}
                  aria-current={activeView === view ? 'page' : undefined}
                  onClick={() => onNavigate(view)}
                  className={cn('quiet-orbit-action', activeView === view && 'quiet-orbit-action--active')}
                >
                  <Icon className="size-[18px]" strokeWidth={1.8} />
                </button>
              );
            })}
          </div>

          <span className="quiet-dock-divider" aria-hidden="true" />

          <button type="button" className="quiet-magic-ball" aria-label="Open Kitty Help" title="Ask Kitty" onClick={onOpenHelp}>
            <span className="quiet-magic-ball-core"><Sparkles className="size-5" /></span>
          </button>

          <span className="quiet-dock-divider" aria-hidden="true" />

          <div className="quiet-dock-cluster quiet-dock-cluster--widgets" aria-label="Support widgets">
            {SUPPORT_WIDGETS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                title={label}
                aria-label={label}
                onClick={() => onOpenWidget(id)}
                className="quiet-orbit-action"
              >
                <Icon className="size-[18px]" strokeWidth={1.8} />
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

export default QuietWorkspaceShell;
