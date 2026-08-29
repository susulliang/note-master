import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { RotateCcw, History, Settings, Type, Mic, MicOff } from 'lucide-react';
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
import EngineSettingsPanel, {
  type EngineState,
  type ParserState,
} from '@/components/EngineSettingsPanel';
import type { TranscriptEntry } from '@/hooks/use-call-capture';
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
  /** CCP tab-audio + mic capture → local Whisper auto-fill (both speakers) */
  callSupported: boolean;
  callCapturing: boolean;
  onToggleCall: () => void;
  /** Engine settings panel (gear): whisper/LLM state + handlers */
  engine?: EngineState;
  parser?: ParserState;
  transcript?: TranscriptEntry[];
  isTranscribing?: boolean;
}

/** Screen corner the toolbar is docked to */
type Corner = 'tl' | 'tr' | 'bl' | 'br';

/** Snug 8px insets — the pill sits right at the screen corner */
const CORNER_CLASSES: Record<Corner, string> = {
  tl: 'left-2 top-2',
  tr: 'right-2 top-2',
  bl: 'left-2 bottom-2',
  br: 'right-2 bottom-2',
};

/** Handle bar auto-hides this long after the mouse leaves (ms) */
const HANDLE_HIDE_DELAY = 3000;
/** Toolbar dims to 10% opacity + minimal frost after this long idle (ms) */
const DIM_DELAY = 8000;

/**
 * Glass pill with the global actions (History + Reset + large text + theme
 * cycle) pinned to a screen corner.
 *
 * - An iPhone-style handle bar below/above the pill is the drag grip: it
 *   shows on hover, auto-hides 3s after the mouse leaves, and dragging it
 *   snaps the toolbar to the nearest screen corner on release.
 * - After 8s idle the pill dims to 20% opacity with almost no frost;
 *   hovering brings it right back.
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
  callSupported,
  callCapturing,
  onToggleCall,
  engine,
  parser,
  transcript,
  isTranscribing,
}: FloatingControlsProps) {
  const themeMeta = getThemeMeta(theme);
  const ThemeIcon = themeMeta.icon;
  const [engineOpen, setEngineOpen] = useState(false);

  // Docked corner (persisted) + transient free position while dragging
  const [corner, setCorner] = useScopedState<Corner>('ecovacs_ticket_toolbar_corner', 'tr');
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  // Handle-bar visibility (hover to show, 3s auto-hide) + idle dimming
  const [handleVisible, setHandleVisible] = useState(false);
  const [dimmed, setDimmed] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    grabOffsetX: number;
    grabOffsetY: number;
    width: number;
    height: number;
    zoom: number;
  } | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const dimTimerRef = useRef<number | null>(null);

  const isDragging = dragPos !== null;

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (dimTimerRef.current !== null) {
      window.clearTimeout(dimTimerRef.current);
      dimTimerRef.current = null;
    }
  }, []);

  // Start the idle-dim countdown on mount
  useEffect(() => {
    dimTimerRef.current = window.setTimeout(() => setDimmed(true), DIM_DELAY);
    return () => clearTimers();
  }, [clearTimers]);

  const handleMouseEnter = useCallback(() => {
    clearTimers();
    setDimmed(false);
    setHandleVisible(true);
  }, [clearTimers]);

  const handleMouseLeave = useCallback(() => {
    // While dragging, the cursor may briefly leave the container — stay live
    if (isDragging) return;
    clearTimers();
    hideTimerRef.current = window.setTimeout(() => setHandleVisible(false), HANDLE_HIDE_DELAY);
    dimTimerRef.current = window.setTimeout(() => setDimmed(true), DIM_DELAY);
  }, [clearTimers, isDragging]);

  const handleDragStart = useCallback(
    (e: ReactMouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      e.preventDefault();
      clearTimers();
      setDimmed(false);
      setHandleVisible(true);
      // Measure the whole container (pill + handle + panel) so grabbing the
      // handle never jumps the pill — gBCR is visual px, offsetWidth layout
      // px, their ratio is the effective body zoom (large-text mode)
      const rect = container.getBoundingClientRect();
      const zoom = rect.width / container.offsetWidth || 1;
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
    [clearTimers]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      // Visual (viewport) coordinates, clamped so the toolbar stays on screen
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

    const handleMouseUp = (e: MouseEvent) => {
      // Snap to the corner nearest the drop point (cursor position)
      const v = e.clientY < window.innerHeight / 2 ? 't' : 'b';
      const h = e.clientX < window.innerWidth / 2 ? 'l' : 'r';
      setCorner(`${v}${h}` as Corner);
      dragPosRef.current = null;
      dragRef.current = null;
      setDragPos(null);
      // Fresh interaction: restart the auto-hide / dim countdowns
      hideTimerRef.current = window.setTimeout(() => setHandleVisible(false), HANDLE_HIDE_DELAY);
      dimTimerRef.current = window.setTimeout(() => setDimmed(true), DIM_DELAY);
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
        ref={containerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          'fixed z-50 flex gap-2',
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
        {/* Pill + attached drag handle (handle faces the screen edge) */}
        <div className={cn('flex flex-col items-center gap-1', !atTop && 'flex-col-reverse')}>
          <div
            className={cn(
              'glass-panel flex items-center gap-1 rounded-full p-1 transition-all duration-500',
              dimmed
                ? // Idle: 20% opacity, frost almost gone
                  'glass-dim opacity-20'
                : // Hovering: full frosted glass
                  'opacity-100',
              isDragging && 'glass-active'
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
              <AlertDialogContent className="glass-panel rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset all fields?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will clear all ticket data, captions and transcript, and reset node
                    positions. This action cannot be undone.
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

            {callSupported && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleCall}
                className={cn(
                  'relative size-8 rounded-full text-muted-foreground hover:text-foreground',
                  callCapturing &&
                    'bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive'
                )}
                aria-label={callCapturing ? 'Stop call capture' : 'Capture CCP call audio'}
                title={
                  callCapturing
                    ? 'Call capture: on — transcribing Customer (tab) + Agent (mic)'
                    : 'Call capture: off — share the CCP tab (tick "Also share tab audio") and allow the mic to transcribe both speakers'
                }
              >
                {callCapturing ? (
                  <MicOff className="size-4" />
                ) : (
                  <Mic className="size-4" />
                )}
                {callCapturing && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
                  </span>
                )}
              </Button>
            )}

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

            {/* Engine settings — the gear opens the Whisper/LLM/downloads/
                resources/debug panel (like the History button opens history) */}
            {engine && parser && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEngineOpen((v) => !v)}
                className={cn(
                  'relative size-8 rounded-full text-muted-foreground hover:text-foreground',
                  engineOpen && 'bg-foreground/10 text-foreground'
                )}
                aria-label="Engine settings"
                title="Engine settings — Whisper & LLM models, downloads, resources, debug"
              >
                <Settings className="size-4" />
                {(engine.status === 'error' || parser.status === 'error') && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-2.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-destructive" />
                  </span>
                )}
              </Button>
            )}

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

          {/* iPhone-style drag handle: hover to show, auto-hides after 3s */}
          <div
            onMouseDown={handleDragStart}
            aria-label="Drag toolbar to a corner"
            title="Drag to move"
            className={cn(
              'glass-chip flex h-5 w-16 cursor-grab items-center justify-center rounded-full transition-opacity duration-300 active:cursor-grabbing',
              handleVisible || isDragging ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
          >
            <div className="h-1 w-10 rounded-full bg-foreground/45 shadow-[0_1px_3px_rgba(0,0,0,0.4)]" />
          </div>
        </div>

        {historyOpen && (
          <HistoryPanel
            history={history}
            onDeleteHistory={onDeleteHistory}
            onClearHistory={onClearHistory}
            onClose={onToggleHistory}
          />
        )}

        {/* Engine settings panel — opens from the gear like the History
            panel opens from its button; renders alongside the pill inside
            the docked-corner flex container. */}
        {engineOpen && engine && parser && (
          <>
            {/* Click-outside catcher */}
            <div className="fixed inset-0 z-40" onClick={() => setEngineOpen(false)} aria-hidden="true" />
            <EngineSettingsPanel
              engine={engine}
              parser={parser}
              transcript={transcript ?? []}
              isCapturing={callCapturing}
              isTranscribing={!!isTranscribing}
              onToggleCapture={onToggleCall}
              onClose={() => setEngineOpen(false)}
            />
          </>
        )}
      </div>
    </>
  );
}
