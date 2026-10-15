import { useState } from 'react';
import { History, Settings, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import type { CatId } from '@/lib/cat-sprites';
import type { CatPetSnapshot } from '@/hooks/use-cat-pet';
import type { KeywordAlert } from '@/lib/keyword-alerts';
import type { KeywordAlertSource } from '@/hooks/use-keyword-alerts';

interface RailControlsProps {
  theme: ThemeId;
  onCycleTheme: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
  history: NoteHistoryEntry[];
  onDeleteHistory: (id: string) => void;
  onClearHistory: () => void;
  uiScale: UiScale;
  onToggleUiScale: () => void;
  /** CCP tab-audio + mic capture state — only used by the Settings
   *  panel (the standalone mic rail button moved to the sticky bottom
   *  call bar in v0.2.0). */
  callSupported?: boolean;
  callCapturing?: boolean;
  onToggleCall?: () => void;
  /** Settings panel (gear): cat selection plus whisper/LLM state and handlers */
  engine?: EngineState;
  parser?: ParserState;
  selectedCat: CatId;
  onSelectCat: (catId: CatId) => void;
  /** Companion-system snapshot (forwarded to the Settings panel). */
  pet?: CatPetSnapshot | null;
  petCooldown?: boolean;
  onPet?: () => void;
  /** On-demand DeepSeek cloud parser state (the Cloud parse button) */
  cloud?: CloudState;
  transcript?: TranscriptEntry[];
  isTranscribing?: boolean;
  /** Gridbox visibility controls embedded in Settings. */
  gridboxVisibility?: {
    toggles: Array<{ id: string; label: string; visible: boolean }>;
    onToggle: (id: string, nextVisible: boolean) => void;
  };
  /** D1-backed live-transcript keyword alerts shown in Settings. */
  keywordAlerts?: KeywordAlert[];
  keywordAlertSource?: KeywordAlertSource;
  /** Opens the Shift+R auth panel (Settings → Account → Log in). */
  onOpenAuth?: () => void;
  /** Opens the Shift+A admin panel (Settings → Account → Admin badge). */
  onOpenAdmin?: () => void;
}

/** Round icon button shared by every rail control — springy hover/active. */
const RAIL_BTN =
  'relative size-10 rounded-full text-muted-foreground transition-all duration-200 hover:scale-110 hover:bg-foreground/5 hover:text-foreground active:scale-90';

/**
 * Vertical control stack docked at the BOTTOM of the left rail pill
 * (portaled in by the page). Replaces the old draggable corner toolbar:
 * History / UI-scale / Settings / Theme.
 *
 * Panels (History, Settings) are viewport-fixed and slide in
 * from the rail's right edge — the rail's glass background is a sibling
 * layer, not an ancestor, so these `fixed` elements are never trapped by a
 * backdrop-filter containing block.
 */
export default function RailControls({
  theme,
  onCycleTheme,
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
  selectedCat,
  onSelectCat,
  pet,
  petCooldown,
  onPet,
  cloud,
  transcript,
  isTranscribing,
  gridboxVisibility,
  keywordAlerts,
  keywordAlertSource,
  onOpenAuth,
  onOpenAdmin,
}: RailControlsProps) {
  const themeMeta = getThemeMeta(theme);
  const ThemeIcon = themeMeta.icon;
  const [engineOpen, setEngineOpen] = useState(false);

  return (
    <>
      {/* Click-outside catcher for the history panel */}
      {historyOpen && (
        <div className="fixed inset-0 z-40" onClick={onToggleHistory} aria-hidden="true" />
      )}

      <div className="flex flex-col items-center gap-1 animate-in fade-in duration-700">
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
          onClick={onToggleUiScale}
          className={cn(RAIL_BTN, uiScale === 'large' && 'bg-primary/15 text-primary')}
          aria-label="Toggle larger text"
          title={uiScale === 'large' ? 'Larger text: on — click to turn off' : 'Larger text: off — click to turn on'}
        >
          <Type className="size-[18px]" />
        </Button>

        {/* Settings — the gear opens the Whisper/LLM/downloads/
            resources/debug panel (like the History button opens history) */}
        {engine && parser && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setEngineOpen((v) => !v);
            }}
            className={cn(RAIL_BTN, engineOpen && 'bg-foreground/10 text-foreground')}
            aria-label="Settings"
            title="Settings — cat, Whisper & LLM models, downloads, resources, debug"
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

      {/* Settings panel — opens from the gear, sliding in from the
          rail's right edge; vertically centered. The click-outside catcher
          sits UNDER the panel (z-40 vs z-50). */}
      {engineOpen && engine && parser && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setEngineOpen(false)} aria-hidden="true" />
          <div className="fixed left-[88px] top-1/2 z-50 max-h-[calc(100vh-2rem)] -translate-y-1/2 animate-in fade-in slide-in-from-left-2 duration-200">
            <EngineSettingsPanel
              engine={engine}
              selectedCat={selectedCat}
              onSelectCat={onSelectCat}
              pet={pet}
              petCooldown={petCooldown}
              onPet={onPet}
              parser={parser}
              cloud={cloud}
              transcript={transcript ?? []}
              isCapturing={!!callCapturing}
              isTranscribing={!!isTranscribing}
              onToggleCapture={() => onToggleCall?.()}
              onClose={() => setEngineOpen(false)}
              gridboxVisibility={gridboxVisibility}
              keywordAlerts={keywordAlerts}
              keywordAlertSource={keywordAlertSource}
              onOpenAuth={onOpenAuth}
              onOpenAdmin={onOpenAdmin}
            />
          </div>
        </>
      )}
    </>
  );
}
