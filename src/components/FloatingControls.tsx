import { History, PanelLeftClose, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import HistoryPanel from '@/components/HistoryPanel';
import type { NoteHistoryEntry } from '@/data/ticket';
import { cn } from '@/lib/utils';

interface RailControlsProps {
  historyOpen: boolean;
  onToggleHistory: () => void;
  history: NoteHistoryEntry[];
  onDeleteHistory: (id: string) => void;
  onClearHistory: () => void;
  onOpenSettings: () => void;
  settingsActive?: boolean;
  /** Collapse the left rail pill into its glass circle (hidden while
   *  collapsed — the rail is unmounted then). */
  onCollapseRail?: () => void;
}

/** Round icon button shared by every rail control — springy hover/active. */
const RAIL_BTN =
  'relative size-10 rounded-full text-muted-foreground transition-all duration-200 hover:scale-110 hover:bg-foreground/5 hover:text-foreground active:scale-90';

/**
 * Vertical control stack docked at the BOTTOM of the left rail pill
 * (portaled in by the page). Settings now navigates to its own workspace;
 * appearance controls live on that page instead of crowding this stack.
 */
export default function RailControls({
  historyOpen,
  onToggleHistory,
  history,
  onDeleteHistory,
  onClearHistory,
  onOpenSettings,
  settingsActive = false,
  onCollapseRail,
}: RailControlsProps) {
  return (
    <>
      {/* Click-outside catcher for the history panel */}
      {historyOpen && (
        <div className="fixed inset-0 z-40" onClick={onToggleHistory} aria-hidden="true" />
      )}

      <div className="quiet-control-icons flex flex-col items-center gap-1 animate-in fade-in duration-700">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleHistory}
          className={cn(RAIL_BTN, historyOpen && 'bg-foreground/10 text-foreground')}
          aria-label="Toggle history"
          title="History"
        >
          <History className="size-[18px]" />
          {history.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {history.length > 99 ? '99+' : history.length}
            </span>
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          className={cn(RAIL_BTN, settingsActive && 'bg-foreground/10 text-foreground')}
          aria-label="Open Settings"
          title="Settings"
        >
          <Settings className="size-[18px] transition-transform duration-500 hover:rotate-90" />
        </Button>

        <div className="my-0.5 h-px w-6 bg-foreground/10" aria-hidden="true" />

        {/* Collapse the rail into its glass circle (narrow screens /
            extra canvas room). Hidden while collapsed — the whole rail
            unmounts then. */}
        {onCollapseRail && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onCollapseRail}
            className={RAIL_BTN}
            aria-label="Collapse menu"
            title="Collapse menu — click the circle to reopen"
          >
            <PanelLeftClose className="size-[18px]" />
          </Button>
        )}
      </div>

      {historyOpen && (
        <div className="quiet-utility-panel-anchor animate-in fade-in slide-in-from-left-2 duration-200">
          <HistoryPanel
            history={history}
            onDeleteHistory={onDeleteHistory}
            onClearHistory={onClearHistory}
            onClose={onToggleHistory}
          />
        </div>
      )}
    </>
  );
}
