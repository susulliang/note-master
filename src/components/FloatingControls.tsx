import { useState } from 'react';
import { RotateCcw, History, Settings, Type, Mic, MicOff, Boxes, AlertTriangle } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import HistoryPanel from '@/components/HistoryPanel';
import EngineSettingsPanel, {
  type CloudState,
  type EngineState,
  type ParserState,
} from '@/components/EngineSettingsPanel';
import type { TranscriptEntry } from '@/hooks/use-call-capture';
import { getThemeMeta, type ThemeId, type UiScale } from '@/lib/themes';
import type { NoteHistoryEntry } from '@/data/ticket';
import { cn } from '@/lib/utils';
import type { KeywordAlert } from '@/hooks/use-cat-assistant';

interface RailControlsProps {
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
  /** On-demand DeepSeek cloud parser state (the Cloud parse button) */
  cloud?: CloudState;
  transcript?: TranscriptEntry[];
  isTranscribing?: boolean;
  /** Optional gridbox (flowchart node) visibility toggles. When supplied the
   *  rail renders a Boxes icon button that opens a small toggle panel. */
  gridboxVisibility?: {
    toggles: Array<{ id: string; label: string; visible: boolean }>;
    onToggle: (id: string, nextVisible: boolean) => void;
  };
  /** Live-transcript keyword → alert dictionary (cat pops an amber bubble
   *  when any keyword is heard). Editable from this rail's alert menu. */
  keywordAlerts?: KeywordAlert[];
  onAddKeywordAlert?: () => void;
  onUpdateKeywordAlert?: (id: string, patch: Partial<Pick<KeywordAlert, 'keyword' | 'alert'>>) => void;
  onRemoveKeywordAlert?: (id: string) => void;
}

/** Round icon button shared by every rail control — springy hover/active. */
const RAIL_BTN =
  'relative size-10 rounded-full text-muted-foreground transition-all duration-200 hover:scale-110 hover:bg-foreground/5 hover:text-foreground active:scale-90';

/**
 * Vertical control stack docked at the BOTTOM of the left rail pill
 * (portaled in by the page). Replaces the old draggable corner toolbar:
 * History / Reset / Boxes / Mic / UI-scale / Engine settings / Theme.
 *
 * Panels (History, Engine settings, Boxes) are viewport-fixed and slide in
 * from the rail's right edge — the rail's glass background is a sibling
 * layer, not an ancestor, so these `fixed` elements are never trapped by a
 * backdrop-filter containing block.
 */
export default function RailControls({
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
  cloud,
  transcript,
  isTranscribing,
  gridboxVisibility,
  keywordAlerts,
  onAddKeywordAlert,
  onUpdateKeywordAlert,
  onRemoveKeywordAlert,
}: RailControlsProps) {
  const themeMeta = getThemeMeta(theme);
  const ThemeIcon = themeMeta.icon;
  const [engineOpen, setEngineOpen] = useState(false);
  const [boxesOpen, setBoxesOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

  return (
    <>
      {/* Click-outside catcher for the history panel */}
      {historyOpen && (
        <div className="fixed inset-0 z-40" onClick={onToggleHistory} aria-hidden="true" />
      )}

      <div className="flex flex-col items-center gap-1 animate-in fade-in duration-700">
        {/* Keyword alerts — the amber ⚠ button opens the editable
            word→reminder dictionary. Sits at the TOP of the rail so the
            agent can reach it while a call is live. */}
        {keywordAlerts && onAddKeywordAlert && onUpdateKeywordAlert && onRemoveKeywordAlert && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setAlertsOpen((v) => !v);
              if (engineOpen) setEngineOpen(false);
              if (boxesOpen) setBoxesOpen(false);
            }}
            className={cn(RAIL_BTN, alertsOpen && 'bg-amber-500/15 text-amber-400')}
            aria-label="Keyword alerts"
            title="Keyword alerts — words the cat watches for during calls (editable)"
          >
            <AlertTriangle className="size-[18px]" />
            {keywordAlerts.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-black">
                {keywordAlerts.length > 9 ? '9+' : keywordAlerts.length}
              </span>
            )}
          </Button>
        )}

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

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={RAIL_BTN}
              aria-label="Reset form"
              title="Reset"
            >
              <RotateCcw className="size-[18px] transition-transform duration-300 hover:-rotate-90" />
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

        {/* Gridbox visibility toggles — the BOXES button + dropdown panel. */}
        {gridboxVisibility && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setBoxesOpen((v) => !v);
              if (engineOpen) setEngineOpen(false);
            }}
            className={cn(RAIL_BTN, boxesOpen && 'bg-foreground/10 text-foreground')}
            aria-label="Toggle gridboxes"
            title="Gridboxes — show / hide Shipping address, Transcript, 24h tracker, SOP, SKU, Serial, Additional notes, Matching template"
          >
            <Boxes className="size-[18px]" />
            {/* If any toggle is currently turned OFF, show a small amber
                count badge so agent notices the canvas has hidden boxes. */}
            {(() => {
              const hiddenCount = gridboxVisibility.toggles.filter((t) => !t.visible).length;
              if (hiddenCount === 0) return null;
              return (
                <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-amber-500/90 text-[9px] font-bold text-black">
                  {hiddenCount}
                </span>
              );
            })()}
          </Button>
        )}

        {callSupported && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCall}
            className={cn(
              RAIL_BTN,
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
              <MicOff className="size-[18px]" />
            ) : (
              <Mic className="size-[18px]" />
            )}
            {callCapturing && (
              <span className="absolute -right-0.5 -top-0.5 flex size-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
              </span>
            )}
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleUiScale}
          className={cn(RAIL_BTN, uiScale === 'large' && 'bg-primary/15 text-primary')}
          aria-label="Toggle larger text"
          title={uiScale === 'large' ? 'Larger text: on — click to turn off' : 'Larger text: off — click to turn on'}
        >
          <Type className="size-[18px]" />
        </Button>

        {/* Engine settings — the gear opens the Whisper/LLM/downloads/
            resources/debug panel (like the History button opens history) */}
        {engine && parser && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setEngineOpen((v) => !v);
              if (boxesOpen) setBoxesOpen(false);
            }}
            className={cn(RAIL_BTN, engineOpen && 'bg-foreground/10 text-foreground')}
            aria-label="Engine settings"
            title="Engine settings — Whisper & LLM models, downloads, resources, debug"
          >
            <Settings className="size-[18px] transition-transform duration-500 hover:rotate-90" />
            {(engine.status === 'error' || parser.status === 'error') && (
              <span className="absolute -right-0.5 -top-0.5 flex size-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-destructive" />
              </span>
            )}
          </Button>
        )}

        <div className="my-0.5 h-px w-6 bg-foreground/10" aria-hidden="true" />

        <Button
          variant="ghost"
          size="icon"
          onClick={onCycleTheme}
          className={RAIL_BTN}
          aria-label={`Switch theme (current: ${themeMeta.label})`}
          title={`Theme: ${themeMeta.label} — click to cycle`}
        >
          <ThemeIcon className="size-[18px] transition-transform duration-300 hover:scale-110" />
        </Button>
      </div>

      {historyOpen && (
        <div className="fixed left-[88px] top-1/2 z-50 -translate-y-1/2 animate-in fade-in slide-in-from-left-2 duration-200">
          <HistoryPanel
            history={history}
            onDeleteHistory={onDeleteHistory}
            onClearHistory={onClearHistory}
            onClose={onToggleHistory}
          />
        </div>
      )}

      {/* BOXES gridbox visibility panel — small glass card anchored to the
          right of the rail with 7 switches. Same geometry convention as
          Engine settings: fixed outside-click catcher at z-40, panel at
          z-50. */}
      {boxesOpen && gridboxVisibility && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setBoxesOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed bottom-6 left-[88px] z-50 animate-in fade-in slide-in-from-left-2 duration-200">
            <div className="glass-panel w-72 rounded-2xl p-3 text-[11px] shadow-2xl">
              <div className="mb-1.5 flex items-center justify-between px-0.5">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground">
                    <Boxes className="size-3.5 text-primary" />
                    Gridboxes
                  </div>
                  <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                    Hide or show canvas gridboxes — node values are kept even while hidden.
                  </div>
                </div>
                <button
                  type="button"
                  className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
                  onClick={() => setBoxesOpen(false)}
                  aria-label="Close gridboxes panel"
                  title="Close"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2 flex flex-col gap-0.5 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-1.5">
                {gridboxVisibility.toggles.map((t) => (
                  <div
                    key={t.id}
                    className="group flex items-center gap-2 rounded-md px-1.5 py-1.5 transition hover:bg-foreground/[0.05]"
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          'truncate text-[11px]',
                          t.visible ? 'text-foreground' : 'text-muted-foreground/70 line-through decoration-muted-foreground/50'
                        )}
                      >
                        {t.label}
                      </div>
                    </div>
                    <Switch
                      checked={t.visible}
                      onCheckedChange={(next) => gridboxVisibility.onToggle(t.id, !!next)}
                      aria-label={`Toggle ${t.label}`}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-2 px-0.5 text-[10px] text-muted-foreground/70">
                {gridboxVisibility.toggles.filter((t) => !t.visible).length === 0
                  ? 'All gridboxes are visible.'
                  : `${gridboxVisibility.toggles.filter((t) => !t.visible).length} gridbox(es) hidden — they still keep their values and participate in the final note.`}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Engine settings panel — opens from the gear, sliding in from the
          rail's right edge; vertically centered. The click-outside catcher
          sits UNDER the panel (z-40 vs z-50). */}
      {engineOpen && engine && parser && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setEngineOpen(false)} aria-hidden="true" />
          <div className="fixed left-[88px] top-1/2 z-50 max-h-[calc(100vh-2rem)] -translate-y-1/2 animate-in fade-in slide-in-from-left-2 duration-200">
            <EngineSettingsPanel
              engine={engine}
              parser={parser}
              cloud={cloud}
              transcript={transcript ?? []}
              isCapturing={callCapturing}
              isTranscribing={!!isTranscribing}
              onToggleCapture={onToggleCall}
              onClose={() => setEngineOpen(false)}
            />
          </div>
        </>
      )}
      {/* Keyword alerts panel — editable word → reminder dictionary.
          Each row edits the keyword (what the cat listens for) and the
          alert text (what the amber bubble says). */}
      {alertsOpen &&
        keywordAlerts &&
        onAddKeywordAlert &&
        onUpdateKeywordAlert &&
        onRemoveKeywordAlert && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setAlertsOpen(false)}
              aria-hidden="true"
            />
            <div className="fixed bottom-6 left-[88px] z-50 max-h-[calc(100vh-2rem)] w-80 animate-in fade-in slide-in-from-left-2 duration-200">
              <div className="glass-panel max-h-[80vh] overflow-y-auto rounded-2xl p-3 text-[11px] shadow-2xl">
                <div className="mb-1.5 flex items-center justify-between px-0.5">
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground">
                      <AlertTriangle className="size-3.5 text-amber-400" />
                      Keyword alerts
                    </div>
                    <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                      The cat pops an amber reminder whenever it hears a
                      keyword during a live call. Case-insensitive.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
                    onClick={() => setAlertsOpen(false)}
                    aria-label="Close keyword alerts"
                    title="Close"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-2 flex flex-col gap-1.5 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-1.5">
                  {keywordAlerts.length === 0 && (
                    <p className="px-1.5 py-2 text-[10px] text-muted-foreground/70">
                      No keywords yet — add one below.
                    </p>
                  )}
                  {keywordAlerts.map((a) => (
                    <div
                      key={a.id}
                      className="group flex flex-col gap-1 rounded-md border border-amber-500/20 bg-amber-500/[0.04] px-1.5 py-1.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <input
                          value={a.keyword}
                          onChange={(e) =>
                            onUpdateKeywordAlert(a.id, { keyword: e.target.value })
                          }
                          placeholder="keyword (e.g. factory reset)"
                          className="min-w-0 flex-1 rounded-md border border-foreground/10 bg-background/60 px-1.5 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
                        />
                        <button
                          type="button"
                          onClick={() => onRemoveKeywordAlert(a.id)}
                          aria-label={`Remove keyword ${a.keyword || 'alert'}`}
                          title="Remove"
                          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition hover:bg-destructive/15 hover:text-destructive"
                        >
                          ✕
                        </button>
                      </div>
                      <textarea
                        value={a.alert}
                        onChange={(e) =>
                          onUpdateKeywordAlert(a.id, { alert: e.target.value })
                        }
                        placeholder="Reminder the cat shows (e.g. Please remind user that settings and maps will be erased.)"
                        rows={2}
                        className="min-w-0 resize-y rounded-md border border-foreground/10 bg-background/60 px-1.5 py-1 text-[11px] leading-snug text-foreground placeholder:text-muted-foreground/50 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={onAddKeywordAlert}
                  className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] font-medium text-amber-300 transition hover:bg-amber-500/20"
                >
                  + Add keyword alert
                </button>
              </div>
            </div>
          </>
        )}
    </>
  );
}
