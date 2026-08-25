import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { RotateCcw, History, Type } from 'lucide-react';
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
import { getThemeMeta, type ThemeId, type UiScale } from '@/lib/themes';
import { useScopedState } from '@/hooks/use-scoped-state';
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
  uiScale: UiScale;
  onToggleUiScale: () => void;
}

/** Screen corner the toolbar is docked to */
type Corner = 'tl' | 'tr' | 'bl' | 'br';

const CORNER_CLASSES: Record<Corner, string> = {
  tl: 'left-4 top-4',
  tr: 'right-4 top-4',
  bl: 'left-4 bottom-4',
  br: 'right-4 bottom-4',
};

/**
 * Glass pill with the global actions (History + Reset + theme cycle + large
 * text) that floats over the canvas. The pill is draggable — grab it anywhere
 * except its buttons and it snaps to the nearest screen corner on release.
 * Toggling History opens a floating panel beside the pill.
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
  uiScale,
  onToggleUiScale,
}: FloatingControlsProps) {
  const themeMeta = getThemeMeta(theme);
  const ThemeIcon = themeMeta.icon;

  // Docked corner (persisted) + transient free position while dragging
  const [corner, setCorner] = useScopedState<Corner>('ecovacs_ticket_toolbar_corner', 'tr');
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    grabOffsetX: number;
    grabOffsetY: number;
    width: number;
    height: number;
    zoom: number;
  } | null>(null);

  const handlePillMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      // Buttons keep their normal click behavior
      if ((e.target as HTMLElement).closest('button')) return;
      const pill = pillRef.current;
      if (!pill) return;
      e.preventDefault();
      const rect = pill.getBoundingClientRect();
      // gBCR is in visual px, offsetWidth in layout px — the ratio is the
      // effective zoom (old-people mode), used to compensate drag deltas
      const zoom = rect.width / pill.offsetWidth || 1;
      dragRef.current = {
        grabOffsetX: e.clientX - rect.left,
        grabOffsetY: e.clientY - rect.top,
        width: rect.width,
        height: rect.height,
        zoom,
      };
      dragPosRef.current = { x: rect.left, y: rect.top };
      setDragPos({ x: rect.left, y: rect.top });
    },
    []
  );

  const isDragging = dragPos !== null;

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      // Visual (viewport) coordinates, clamped so the pill stays on screen
      const x = Math.min(
        Math.max(8, e.clientX - d.grabOffsetX),
        Math.max(8, window.innerWidth - d.width - 8)
      );
      const y = Math.min(
        Math.max(8, e.clientY - d.grabOffsetY),
        Math.max(8, window.innerHeight - d.height - 8)
      );
      dragPosRef.current = { x, y };
      setDragPos({ x, y });
    };

    const handleMouseUp = () => {
      // Snap to the nearest corner by pill center
      const pos = dragPosRef.current;
      const d = dragRef.current;
      if (pos && d) {
        const cx = pos.x + d.width / 2;
        const cy = pos.y + d.height / 2;
        const v = cy < window.innerHeight / 2 ? 't' : 'b';
        const h = cx < window.innerWidth / 2 ? 'l' : 'r';
        setCorner(`${v}${h}` as Corner);
      }
      dragPosRef.current = null;
      dragRef.current = null;
      setDragPos(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, setCorner]);

  const atTop = corner === 'tl' || corner === 'tr';
  const atRight = corner === 'tr' || corner === 'br';

  return (
    <>
      {/* Click-outside catcher for the history panel */}
      {historyOpen && (
        <div className="fixed inset-0 z-40" onClick={onToggleHistory} aria-hidden="true" />
      )}

      <div
        className={cn(
          'absolute z-50 flex gap-2',
          atTop ? 'flex-col' : 'flex-col-reverse',
          atRight ? 'items-end' : 'items-start',
          !isDragging && CORNER_CLASSES[corner]
        )}
        style={
          isDragging && dragPos
            ? {
                // Free position while dragging (visual px → layout px via zoom)
                left: dragPos.x / (dragRef.current?.zoom ?? 1),
                top: dragPos.y / (dragRef.current?.zoom ?? 1),
                right: 'auto',
                bottom: 'auto',
              }
            : undefined
        }
      >
        <div
          ref={pillRef}
          onMouseDown={handlePillMouseDown}
          className={cn(
            'flex cursor-grab items-center gap-1 rounded-full border border-foreground/10 bg-card/40 p-1 shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl active:cursor-grabbing',
            '[&_button]:cursor-pointer [&_button]:select-none',
            isDragging && 'shadow-[0_16px_48px_rgba(0,0,0,0.5)]'
          )}
        >
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
            size="icon"
            onClick={onToggleUiScale}
            className={cn(
              'size-8 rounded-full text-muted-foreground hover:text-foreground',
              uiScale === 'large' && 'bg-primary/15 text-primary'
            )}
            aria-label="Toggle larger text"
            title={uiScale === 'large' ? 'Larger text: on — click to turn off' : 'Larger text: off — click to turn on'}
          >
            <Type className="size-4" />
          </Button>

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
