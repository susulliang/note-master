import { RotateCcw, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import HistoryPanel from '@/components/HistoryPanel';
import { getThemeMeta, type ThemeId } from '@/lib/themes';
import type { NoteHistoryEntry } from '@/data/ticket';
import { cn } from '@/lib/utils';

interface FloatingControlsProps {
  theme: ThemeId;
  onCycleTheme: () => void;
  onReset: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
  history: NoteHistoryEntry[];
  onDeleteHistory: (id: string) => void;
  onClearHistory: () => void;
}

/**
 * Glass pill with the global actions (History + Reset + theme cycle) that
 * floats over the top-right corner of the canvas. Toggling History opens a
 * floating history panel beneath the pill.
 */
export default function FloatingControls({
  theme,
  onCycleTheme,
  onReset,
  historyOpen,
  onToggleHistory,
  history,
  onDeleteHistory,
  onClearHistory,
}: FloatingControlsProps) {
  const themeMeta = getThemeMeta(theme);
  const ThemeIcon = themeMeta.icon;

  return (
    <>
      {/* Click-outside catcher for the history panel */}
      {historyOpen && (
        <div className="fixed inset-0 z-40" onClick={onToggleHistory} aria-hidden="true" />
      )}

      <div className="absolute right-4 top-4 z-50 flex flex-col items-end gap-2">
        <div className="flex items-center gap-1 rounded-full border border-foreground/10 bg-card/40 p-1 shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleHistory}
            className={cn(
              'relative size-8 rounded-full text-muted-foreground hover:text-foreground',
              historyOpen && 'bg-foreground/10 text-foreground'
            )}
            aria-label="Toggle history"
            title="History"
          >
            <History className="size-4" />
            {history.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {history.length > 99 ? '99+' : history.length}
              </span>
            )}
          </Button>

          <div className="h-5 w-px bg-foreground/10" aria-hidden="true" />

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                aria-label="Reset form"
                title="Reset"
              >
                <RotateCcw className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="border-foreground/15 bg-card/70 backdrop-blur-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Reset all fields?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will clear all ticket data and reset node positions. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onReset}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="h-5 w-px bg-foreground/10" aria-hidden="true" />

          <Button
            variant="ghost"
            onClick={onCycleTheme}
            className="h-8 gap-1.5 rounded-full px-2.5 text-muted-foreground hover:text-foreground"
            aria-label={`Switch theme (current: ${themeMeta.label})`}
            title={`Theme: ${themeMeta.label} — click to cycle`}
          >
            <ThemeIcon className="size-4" />
            <span className="text-xs font-medium">{themeMeta.label}</span>
          </Button>
        </div>

        {historyOpen && (
          <HistoryPanel
            history={history}
            onDeleteHistory={onDeleteHistory}
            onClearHistory={onClearHistory}
            onClose={onToggleHistory}
          />
        )}
      </div>
    </>
  );
}
