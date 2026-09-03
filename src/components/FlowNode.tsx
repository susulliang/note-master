import {
  createContext,
  memo,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { Plus, X, ChevronDown, Check, PhoneOff, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import type { TemplateEntry } from '@/lib/amr-templates';

/**
 * Supplies the live React content for the two panel-node toolboxes that sit
 * inside the flowchart canvas. Using a context (instead of threading the
 * JSX elements through the FlowchartCanvas memo-boundary) keeps the canvas
 * layout memo stable when audio meters / LLM progress / transcript state
 * updates 10×/s during capture — only the actual transcript/tracker nodes
 * re-render. TicketNotesPage renders a Provider above FlowchartCanvas with
 * the up-to-date VoiceCaptionPanel and TicketTrackerPanel trees.
 */
export interface TicketPanelsContextShape {
  transcriptContent?: React.ReactNode;
  trackerContent?: React.ReactNode;
  sopContent?: React.ReactNode;
  productContent?: React.ReactNode;
  /** Open / focus a Salesforce Console tab via the Ecovacs Note Helper
   *  extension.  This is the action behind the "Open case in SF" buttons
   *  in the 24h tracker rows.  Returns { ok, url } on success, or
   *  { ok:false, error } when the extension is missing / can't find the
   *  org (e.g. no Salesforce tab is open yet, caller should show a toast
   *  asking to open ANY org tab first). */
  openCase?: (opts: { caseNumber?: string; directUrl?: string; newTab?: boolean }) =>
    Promise<{ ok: boolean; url?: string | null; navigated?: 'new' | 'reused' | null; error?: string | null }>;

  /** After generating a formatted ticket note, push the Post body + a
   *  handful of editable layout fields back into the currently-open
   *  Salesforce Case tab (or auto-select one if tabId omitted).  Used by
   *  the new "Push to Salesforce Case" button in the Output Modal.
   *  Returns { ok, summary:{okCount/total}, postBody, fields, tab }. */
  applyCaseFields?: (opts: {
    fields: {
      postBody?: string;
      postPublish?: boolean;
      amrModelNo?: string;
      customerName?: string;
      accountName?: string;
      contactPhone?: string;
    };
    tabId?: number;
    saveEach?: boolean;
  }) => Promise<{
    ok: boolean;
    summary?: { ok: boolean; okCount: number; total: number } | null;
    postBody?: any;
    fields?: any;
    tab?: any;
    error?: string | null;
  }>;

  /** Extension-connection diagnostics. Rendered by OutputModal + gridbox
   *  status bar so disconnected states now show:
   *    - current app origin
   *    - is the manifest content-script pattern covering it
   *    - is externally_connectable covering it
   *    - if NO: exact patterns user must paste into manifest + reload hint
   *    - last handshake time / errors from sendMessage path */
  extensionConnection?: {
    connected: boolean;
    /** Ask bridge.js for another handshake probe → connected should flip
     *  true quickly if the content script is actually injected. */
    requestConnection: () => void;
    diagnostics: {
      appOrigin: string;
      appHref: string;
      bridgeInjected: boolean;
      manifestBridgePatterns: string[];
      manifestExternalPatterns: string[];
      originCoveredByBridge: boolean;
      originCoveredByExternal: boolean;
      suggestedPatternsToAdd: string[];
      lastHandshakeAt: string | null;
      handshakeRequested: boolean;
      lastExternalError: string | null;
      /** Version of the installed-extension manifest we WANT to see. */
      expectedManifestVersion: string;
      /** Version of the manifest that actually injected bridge.js. */
      injectedManifestVersion: string | null;
      /** Content hash of manifest + patterns that injected bridge.js. */
      injectedFingerprint: string | null;
      /** True if pattern lists below came from the INSTALLED extension
       *  (runtime-extracted from manifest.json). False means the values
       *  you're reading are best-guess DEFAULTS, not authoritative. */
      patternsReceivedFromBridge: boolean;
      /** Timestamp (ISO) of the last runtime-extracted pattern list we
       *  received from bridge.js. */
      patternsReceivedAt: string | null;
      /** null / false / true tri-state for expected vs injected version. */
      injectedVersionMatchesExpected: boolean | null;
      /** True when installed is clearly older than expected (Chrome
       *  cached stale content script → user must reload extension) */
      injectedVersionStale: boolean;
    };
  };
}
export const TicketPanelsContext = createContext<TicketPanelsContextShape | null>(null);
import type { AutoFillSource } from '@/lib/field-extraction';
import { snToPin } from '@/lib/sn-pin';

export type NodeType =
  | 'start'
  | 'agent'
  | 'input'
  | 'select'
  | 'dynamic-list'
  | 'hangup'
  | 'templates'
  | 'transcript'
  | 'ticketTracker'
  | 'sop'
  | 'productLookup';

export interface QuickTextGroup {
  label: string;
  items: string[];
}

export interface FlowNodeProps {
  id: string;
  type: NodeType;
  label?: string;
  text?: string;
  value: string | string[];
  /**
   * Field updates. `discrete` marks a programmatic insert (quick-insert
   * chip) rather than keystrokes — the undo stack treats it as its own
   * undo step.
   */
  onChange: (value: string | string[], discrete?: boolean) => void;
  onFocus: (id: string) => void;
  onBlur: () => void;
  isActive: boolean;
  position: { x: number; y: number };
  onDragStart: (id: string, e: ReactMouseEvent) => void;
  options?: string[];
  accent?: 'green' | 'blue' | 'red' | 'default';
  inputType?: 'text' | 'email' | 'tel' | 'textarea';
  width?: number;
  /** Visible textarea rows (defaults to 2) */
  textareaRows?: number;
  /** Focus this node's input once on mount (initial page focus target) */
  autoFocus?: boolean;
  icon?: LucideIcon;
  /** Quick insert chips rendered below the field (e.g. Resolution Summary) */
  quickTexts?: string[];
  /**
   * Grouped quick insert chips. Takes precedence over quickTexts: the panel
   * collapses to a preview row and expands into a hover overlay panel with a
   * smooth animation, covering neighbouring nodes (no layout reflow).
   */
  quickTextGroups?: QuickTextGroup[];
  /** Subset of quickTexts that were user-added (rendered with a remove button) */
  customQuickTexts?: string[];
  onAddQuickText?: (text: string) => void;
  onRemoveQuickText?: (text: string) => void;
  /** Fuzzy-matched templates (AMR emails + macro TBS steps) for the typed issue text */
  templateMatches?: TemplateEntry[];
  onOpenTemplate?: (template: TemplateEntry) => void;
  /** Stacking order within the nodes layer (chips-bearing boxes sit higher) */
  zIndex?: number;
  /** Reports the node's actual rendered height so the layout adjusts dynamically */
  onHeightChange?: (id: string, height: number) => void;
  /**
   * Which engine auto-filled this field ('regex' | 'regex-grow' | 'paraphrase'
   * | 'llm') — renders the yellow proofreading glow + source badge until the
   * agent edits it. ('regex-grow' is stored as 'regex' upstream, but the
   * display layer accepts the full source union.)
   */
  parsedSource?: AutoFillSource | null;
  /**
   * HIDDEN feature: press-and-hold the field (~600ms) to pop a floating
   * bubble with the PIN derived from its value (see snToPin). Set on the
   * Serial Number node only.
   */
  enablePinBubble?: boolean;
  /**
   * Arbitrary React content rendered inside a glass-panel node for the
   * 'transcript' and 'ticketTracker' panel node types. Allows embedding
   * complex interactive panels as draggable canvas boxes without hard-
   * coding them in the FlowNode switch statement.
   */
  panelContent?: React.ReactNode;
  /**
   * Disables the Hang Up & Generate Note button and replaces its icon
   * with a spinner. Prevents the "press twice just to see output" UX by
   * giving the agent visual feedback while capture / LLM drain runs.
   */
  hangUpLoading?: boolean;
}

// iOS-26 liquid-glass node skins (see .glass-* utilities in tailwind-theme.css).
// accentBorders = resting glass with a faint tinted edge; accentGlows = active
// glass that lights up and protrudes further towards the user.
const accentBorders: Record<string, string> = {
  green: 'glass-panel glass-accent-green',
  blue: 'glass-panel glass-accent-blue',
  red: 'glass-panel glass-accent-red',
  default: 'glass-panel',
};

const accentGlows: Record<string, string> = {
  green: 'glass-panel glass-accent-green glass-active',
  blue: 'glass-panel glass-accent-blue glass-active',
  red: 'glass-panel glass-accent-red glass-active',
  default: 'glass-panel glass-active',
};

interface ComboboxFieldProps {
  label?: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  icon?: LucideIcon;
  /** Node width — the dropdown matches the input width (min 300px) */
  width?: number;
}

/**
 * Cap on rendered dropdown rows. Option sets like the issue-type list hold
 * ~800 entries; filtering is cheap but rendering all rows at once is not,
 * so only the first COMBOBOX_MAX_RENDERED matches are mounted.
 */
const COMBOBOX_MAX_RENDERED = 100;

function ComboboxField({
  label,
  value,
  options,
  onChange,
  onFocus,
  onBlur,
  icon: Icon,
  width,
}: ComboboxFieldProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Group options by "Category::" prefix when present (e.g. issue types);
  // un-prefixed option sets (e.g. robot models) fall back to one flat group.
  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const opt of options) {
      const sep = opt.indexOf('::');
      const key = sep > 0 ? opt.slice(0, sep) : '';
      const list = map.get(key);
      if (list) list.push(opt);
      else map.set(key, [opt]);
    }
    return Array.from(map.entries());
  }, [options]);

  const filteredGroups = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return groups;
    return groups
      .map(
        ([cat, items]) =>
          [cat, items.filter((o) => o.toLowerCase().includes(query))] as [string, string[]]
      )
      .filter(([, items]) => items.length > 0);
  }, [groups, value]);

  const totalFiltered = filteredGroups.reduce((n, [, items]) => n + items.length, 0);
  const truncated = totalFiltered > COMBOBOX_MAX_RENDERED;

  // Slice groups against the render budget (groups later in the list are cut first)
  let budget = COMBOBOX_MAX_RENDERED;
  const visibleGroups = filteredGroups
    .map(([cat, items]): [string, string[]] | null => {
      if (budget <= 0) return null;
      const shown = items.slice(0, budget);
      budget -= shown.length;
      return [cat, shown];
    })
    .filter((g): g is [string, string[]] => g !== null && g[1].length > 0);

  const isCustomValue = value.trim().length > 0 && !options.includes(value);

  return (
    <div className="px-2.5 py-1.5">
      {label && (
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {Icon && <Icon className="size-3.5 text-accent/70" />}
          {label}
        </div>
      )}
      <div ref={wrapperRef} className="relative flex items-center">
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            onFocus();
            setOpen(true);
          }}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Type or select..."
          className="h-9 pr-8 text-sm"
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Toggle options"
              className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent/10 hover:text-foreground"
              onMouseDown={(e) => {
                // Prevent input blur before popover opens
                e.preventDefault();
              }}
              onClick={() => {
                onFocus();
                setOpen((o) => !o);
              }}
            >
              <ChevronDown
                className={cn('size-3.5 transition-transform', open && 'rotate-180')}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={4}
            style={{ width: Math.max(300, width ?? 300) }}
            className="glass-panel rounded-xl p-0"
            onInteractOutside={(e) => {
              // Keep the dropdown open while the agent works in the input
              if (wrapperRef.current?.contains(e.target as Node)) {
                e.preventDefault();
              }
            }}
            onFocusOutside={(e) => {
              if (wrapperRef.current?.contains(e.target as Node)) {
                e.preventDefault();
              }
            }}
          >
            <Command shouldFilter={false}>
              <CommandList className="max-h-[280px]">
                {filteredGroups.length === 0 ? (
                  <CommandEmpty>
                    {value.trim()
                      ? 'No match — your text will be kept as a custom value'
                      : 'No options'}
                  </CommandEmpty>
                ) : (
                  visibleGroups.map(([cat, items]) => (
                    <CommandGroup
                      key={cat || 'all'}
                      heading={cat || undefined}
                    >
                      {items.map((opt) => {
                        const sep = opt.indexOf('::');
                        const display = sep > 0 ? opt.slice(sep + 2) : opt;
                        return (
                          <CommandItem
                            key={opt}
                            value={opt}
                            onSelect={() => {
                              onChange(opt);
                              setOpen(false);
                            }}
                            className="gap-2 text-sm"
                          >
                            <Check
                              className={cn(
                                'size-3.5 shrink-0',
                                value === opt ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <span className="truncate">{display}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ))
                )}
                {truncated && (
                  <div className="px-2 py-1.5 text-center text-[11px] text-muted-foreground">
                    {totalFiltered - COMBOBOX_MAX_RENDERED} more — keep typing to narrow down
                  </div>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {isCustomValue && (
        <div className="mt-1 text-[10px] uppercase tracking-wider text-accent/80">
          Custom value
        </div>
      )}
    </div>
  );
}

function FlowNodeComponent({
  id,
  type,
  label,
  text,
  value,
  onChange,
  onFocus,
  onBlur,
  isActive,
  position,
  onDragStart,
  options = [],
  accent = 'default',
  inputType = 'text',
  width = 240,
  textareaRows = 2,
  autoFocus = false,
  icon: Icon,
  quickTexts,
  quickTextGroups,
  customQuickTexts,
  onAddQuickText,
  onRemoveQuickText,
  templateMatches,
  onOpenTemplate,
  zIndex,
  onHeightChange,
  parsedSource = null,
  enablePinBubble = false,
  panelContent,
  hangUpLoading = false,
}: FlowNodeProps) {
  const panelsCtx = useContext(TicketPanelsContext);
  const nodeRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showAddQuickText, setShowAddQuickText] = useState(false);
  const [newQuickText, setNewQuickText] = useState('');
  const [quickPanelOpen, setQuickPanelOpen] = useState(false);
  // HIDDEN PIN bubble: press-and-hold the field → PIN derived from its value
  const [showPin, setShowPin] = useState(false);
  const pinPressTimerRef = useRef<number | null>(null);
  // Hang-up drag/click disambiguation
  const pendingDragRef = useRef<{ startX: number; startY: number } | null>(null);
  const suppressClickRef = useRef(false);

  // Grouped panel: total chip count + collapsed preview (first group's chips)
  const groupedTotal = quickTextGroups
    ? quickTextGroups.reduce((n, g) => n + g.items.length, 0) + (customQuickTexts?.length ?? 0)
    : 0;
  const previewItems = quickTextGroups?.[0]?.items.slice(0, 5) ?? [];
  const hiddenCount = Math.max(0, groupedTotal - previewItems.length);

  const handleFocus = useCallback(() => {
    onFocus(id);
  }, [id, onFocus]);

  // ---- HIDDEN PIN bubble (Serial Number field) -------------------------
  // Press-and-hold the input ~600ms → floating bubble with the PIN derived
  // from the current value. A quick click just focuses the field as usual.
  const startPinPress = useCallback(() => {
    if (!enablePinBubble) return;
    pinPressTimerRef.current = window.setTimeout(() => {
      pinPressTimerRef.current = null;
      setShowPin(true);
    }, 600);
  }, [enablePinBubble]);

  const cancelPinPress = useCallback(() => {
    if (pinPressTimerRef.current !== null) {
      window.clearTimeout(pinPressTimerRef.current);
      pinPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => cancelPinPress, [cancelPinPress]);

  // The bubble self-dismisses after 5s
  useEffect(() => {
    if (!showPin) return;
    const t = window.setTimeout(() => setShowPin(false), 5000);
    return () => window.clearTimeout(t);
  }, [showPin]);

  /**
   * Insert a quick text chip into the field value.
   * When the field already has text, the chip is appended after a "->"
   * separator (e.g. "Email for POP -> Reset Machine").
   */
  const handleInsertQuickText = useCallback(
    (quickText: string) => {
      const current = typeof value === 'string' ? value.trimEnd() : '';
      let next: string;
      if (!current) {
        next = quickText;
      } else if (current.endsWith('->')) {
        // Avoid doubling the separator if the text already ends with one
        next = `${current} ${quickText}`;
      } else {
        next = `${current} -> ${quickText}`;
      }
      onChange(next, true);
      // Refocus the textarea and place the caret at the end for continued typing
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    },
    [value, onChange]
  );

  const handleAddQuickTextSubmit = useCallback(() => {
    const t = newQuickText.trim();
    if (t) {
      onAddQuickText?.(t);
    }
    setNewQuickText('');
    setShowAddQuickText(false);
  }, [newQuickText, onAddQuickText]);

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      // Whole box is draggable, except when grabbing an interactive control
      // (text fields, chips, buttons) inside it. Applies equally to plain
      // gridboxes and embedded panel nodes (transcript / 24h tracker).
      const target = e.target as HTMLElement;
      const interactive = target.closest(
        'input, textarea, button, select, [contenteditable="true"], [role="combobox"], [role="listbox"]'
      );
      if (interactive && type !== 'hangup') {
        return;
      }
      if (type === 'hangup') {
        // The hang-up node's whole body is one button: start a pending drag
        // that only engages after ~4px of movement — a plain click still
        // triggers the hang-up action, while a drag moves the node
        pendingDragRef.current = { startX: e.clientX, startY: e.clientY };
        const onMove = (ev: MouseEvent) => {
          const p = pendingDragRef.current;
          if (!p) return;
          if (Math.hypot(ev.clientX - p.startX, ev.clientY - p.startY) > 4) {
            cleanup();
            suppressClickRef.current = true;
            onDragStart(id, e);
          }
        };
        const onUp = () => cleanup();
        const cleanup = () => {
          pendingDragRef.current = null;
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return;
      }
      onDragStart(id, e);
    },
    [id, onDragStart, type]
  );

  // Report the node's real rendered height so the canvas layout adjusts
  // dynamically (collapsed quick-inserts → compact row; expanded → taller)
  useEffect(() => {
    const el = nodeRef.current;
    if (!el || !onHeightChange) return;
    const report = () => onHeightChange(id, el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, onHeightChange]);

  // Initial focus target: focus this node's input once, after layout settles
  useEffect(() => {
    if (!autoFocus) return;
    const raf = requestAnimationFrame(() => {
      const el = nodeRef.current?.querySelector('textarea, input') as HTMLElement | null;
      el?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [autoFocus]);

  /** Shared quick-insert chip (optionally with a hover remove badge) */
  const renderQuickChip = (qt: string, onRemove?: () => void) => (
    <span key={qt} className="group relative">
      <button
        type="button"
        onClick={() => handleInsertQuickText(qt)}
        title={`Insert: ${qt}`}
        className="glass-chip h-7 min-w-0 max-w-full truncate rounded-md px-2 text-[11px] font-semibold"
      >
        {qt}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove quick text: ${qt}`}
          title={`Remove: ${qt}`}
          className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full border border-background bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
        >
          <X className="size-2" />
        </button>
      )}
    </span>
  );

  const renderContent = () => {
    if (type === 'start' || type === 'agent') {
      return (
        <div className="px-2.5 py-1.5">
          {label && (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
          )}
          <p className="text-sm leading-snug text-foreground">{text}</p>
        </div>
      );
    }

    if (type === 'hangup') {
      return (
        <div className="px-2.5 py-2">
          <button
            type="button"
            disabled={hangUpLoading}
            onClick={() => {
              if (hangUpLoading) return;
              // Swallow the click that follows a drag (mouseup on the button)
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              onChange('hangup');
            }}
            className={cn(
              'glass-btn glass-btn-destructive group flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold text-destructive-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              hangUpLoading && 'pointer-events-none opacity-80 ring-2 ring-destructive/50'
            )}
          >
            {hangUpLoading ? (
              <Loader2 className="size-4 shrink-0 animate-spin" />
            ) : (
              <PhoneOff className="size-4 shrink-0 transition-transform duration-200 group-hover:rotate-12" />
            )}
            {hangUpLoading ? 'Wrapping up…' : 'Hang Up & Generate Note'}
          </button>
        </div>
      );
    }

    if (type === 'templates') {
      const matches = templateMatches ?? [];
      return (
        <div className="px-2.5 py-1.5">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {Icon && <Icon className="size-3.5 text-accent/70" />}
            {label}
            {matches.length > 0 && (
              <span className="rounded-full bg-accent/15 px-1.5 text-[9px] font-semibold text-accent">
                {matches.length}
              </span>
            )}
          </div>
          {matches.length > 0 && onOpenTemplate ? (
            <div className="flex flex-wrap gap-1">
              {matches.map((tpl) => (
                <button
                  key={`${tpl.kind}-${tpl.file}`}
                  type="button"
                  onClick={() => onOpenTemplate(tpl)}
                  title={`Open ${tpl.category}: ${tpl.name}`}
                  className={cn(
                    'glass-chip h-7 min-w-0 max-w-full truncate rounded-md px-2 text-[11px] font-semibold',
                    tpl.kind === 'amr' && 'glass-chip-accent'
                  )}
                >
                  <span
                    className={cn(
                      'mr-1 rounded px-1 text-[8px] font-bold uppercase tracking-wider',
                      tpl.kind === 'amr' && 'bg-accent/20 text-accent',
                      tpl.kind === 'tbs' && 'bg-primary/20 text-primary',
                      tpl.kind === 'err' && 'bg-destructive/25 text-destructive',
                      tpl.kind === 'macro' &&
                        'bg-emerald-500/25 text-emerald-600 dark:text-emerald-300',
                      tpl.kind === 'faq' && 'bg-warning/25 text-warning'
                    )}
                  >
                    {tpl.kind === 'amr'
                      ? 'AMR'
                      : tpl.kind === 'tbs'
                        ? 'TBS'
                        : tpl.kind === 'err'
                          ? 'ERR'
                          : tpl.kind === 'macro'
                            ? 'MACRO'
                            : 'FAQ'}
                  </span>
                  {tpl.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/80">
              No matches yet — type in the Detailed Issue Description to find AMR emails, TBS steps, error codes, MACRO shortcuts, and real FAQs.
            </p>
          )}
        </div>
      );
    }

    if (
      type === 'transcript' ||
      type === 'ticketTracker' ||
      type === 'sop' ||
      type === 'productLookup'
    ) {
      // Pull the live content from context (captured at top of the function)
      // so the canvas memo stays clean while audio meters tick 10×/s. Wrap
      // with the same label row + inner padding used by every other gridbox
      // so the two panels visually match the rest of the canvas.
      const content =
        (type === 'transcript'
          ? panelsCtx?.transcriptContent
          : type === 'ticketTracker'
            ? panelsCtx?.trackerContent
            : type === 'sop'
              ? panelsCtx?.sopContent
              : panelsCtx?.productContent) ?? panelContent;
      return (
        <div className="px-2.5 py-1.5">
          {label && (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
          )}
          <div data-panel-body className="min-h-0">
            {content}
          </div>
        </div>
      );
    }

    if (type === 'select') {
      return (
        <ComboboxField
          label={label}
          value={typeof value === 'string' ? value : ''}
          options={options}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={onBlur}
          icon={Icon}
          width={width}
        />
      );
    }

    if (type === 'dynamic-list') {
      const steps = Array.isArray(value) ? value : [];
      return (
        <div className="px-2.5 py-1.5">
          {label && (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
          )}
          <div className="space-y-1.5">
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="w-4 shrink-0 text-[11px] text-muted-foreground">
                  {idx + 1}.
                </span>
                <Input
                  value={step}
                  onChange={(e) => {
                    const newSteps = [...steps];
                    newSteps[idx] = e.target.value;
                    onChange(newSteps);
                  }}
                  onFocus={handleFocus}
                  onBlur={onBlur}
                  className="h-8 text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="!absolute right-1 top-1 h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    const newSteps = steps.filter((_, i) => i !== idx);
                    onChange(newSteps);
                  }}
                  aria-label="Remove step"
                >
                  <X className="size-3" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onChange([...steps, ''])}
            >
              <Plus className="size-3" />
              Add step
            </Button>
          </div>
        </div>
      );
    }

    // input type
    const strValue = typeof value === 'string' ? value : '';
    const pin = enablePinBubble ? snToPin(strValue) : null;
    return (
      <div className="px-2.5 py-1.5">
        {label && (
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {Icon && <Icon className="size-3.5 text-accent/70" />}
            {label}
          </div>
        )}
        {inputType === 'textarea' ? (
          <Textarea
            ref={textareaRef}
            data-field-id={id}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={onBlur}
            rows={textareaRows}
            className="resize-none text-sm"
            placeholder="Type here..."
          />
        ) : (
          <div
            className="relative"
            onMouseDown={startPinPress}
            onMouseUp={cancelPinPress}
            onMouseLeave={cancelPinPress}
          >
            <Input
              type={inputType}
              data-field-id={id}
              value={strValue}
              onChange={(e) => onChange(e.target.value)}
              onFocus={handleFocus}
              onBlur={onBlur}
              className="h-9 text-sm"
              placeholder="Type here..."
            />
            {/* HIDDEN PIN bubble — press-and-hold the field to reveal */}
            {showPin && (
              <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2">
                <div className="glass-panel flex items-center gap-2.5 rounded-lg px-3.5 py-2 shadow-lg">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    PIN
                  </span>
                  <span className="font-mono text-lg font-bold tracking-[0.25em] text-primary">
                    {pin ?? '—'}
                  </span>
                  <div className="absolute left-1/2 top-full size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 glass-panel" />
                </div>
              </div>
            )}
          </div>
        )}
        {quickTextGroups ? (
          /* Grouped quick inserts — collapsed preview row; hovering expands
             the node box itself in place (no popup), and the node turns
             much frostier for readability while expanded */
          <div
            className="relative mt-1.5 border-t border-border/30 pt-1.5"
            onMouseEnter={() => setQuickPanelOpen(true)}
            onMouseLeave={() => setQuickPanelOpen(false)}
          >
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Quick insert
              <span className="rounded-full bg-foreground/10 px-1.5 text-[9px] font-semibold text-muted-foreground">
                {groupedTotal}
              </span>
              <span className="ml-auto flex items-center gap-0.5 text-[9px] normal-case tracking-normal text-muted-foreground/70">
                hover to expand
                <ChevronDown
                  className={cn(
                    'size-3 transition-transform duration-300',
                    quickPanelOpen && 'rotate-180'
                  )}
                />
              </span>
            </div>
            {/* Collapsed preview */}
            <div className="flex flex-wrap gap-1">
              {previewItems.map((qt) => renderQuickChip(qt))}
              {hiddenCount > 0 && (
                <span className="flex h-7 items-center rounded-md border border-dashed border-foreground/20 px-2 text-[11px] text-muted-foreground/80">
                  +{hiddenCount} more
                </span>
              )}
            </div>
            {/* In-flow expansion — the node itself grows */}
            {quickPanelOpen && (
              <div className="custom-scrollbar mt-1.5 max-h-[320px] overflow-y-auto rounded-lg border border-foreground/10 bg-foreground/[0.03] p-2">
                {customQuickTexts && customQuickTexts.length > 0 && (
                  <div className="mb-2 last:mb-0">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Custom
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {customQuickTexts.map((qt) =>
                        renderQuickChip(qt, () => onRemoveQuickText?.(qt))
                      )}
                    </div>
                  </div>
                )}
                {quickTextGroups.map((g) => (
                  <div key={g.label} className="mb-2 last:mb-0">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {g.label}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {g.items.map((qt) => renderQuickChip(qt))}
                    </div>
                  </div>
                ))}
                {onAddQuickText && (
                  <div className="mt-1 border-t border-border/30 pt-1.5">
                    {showAddQuickText ? (
                      <Input
                        value={newQuickText}
                        onChange={(e) => setNewQuickText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddQuickTextSubmit();
                          } else if (e.key === 'Escape') {
                            setShowAddQuickText(false);
                            setNewQuickText('');
                          }
                        }}
                        placeholder="New quick text + Enter"
                        autoFocus
                        className="h-7 text-[11px]"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setNewQuickText('');
                          setShowAddQuickText(true);
                        }}
                        className="flex h-7 w-full items-center justify-center gap-1 rounded-md border border-dashed border-foreground/20 text-[11px] text-muted-foreground transition-colors hover:border-accent/60 hover:bg-accent/15 hover:text-accent"
                      >
                        <Plus className="size-3" />
                        Add quick text
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : quickTexts ? (
          /* Flat quick inserts (e.g. Resolution Summary, Purchase info) */
          <div className="mt-1.5 border-t border-border/30 pt-1.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Quick insert
            </div>
            <div className="flex flex-wrap gap-1">
              {quickTexts.map((qt) =>
                renderQuickChip(
                  qt,
                  customQuickTexts?.includes(qt) && onRemoveQuickText
                    ? () => onRemoveQuickText(qt)
                    : undefined
                )
              )}
              {onAddQuickText && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddQuickText((v) => !v);
                    if (!showAddQuickText) {
                      setNewQuickText('');
                    }
                  }}
                  aria-label="Add quick text"
                  title="Add quick text"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-foreground/20 text-muted-foreground transition-colors hover:border-accent/60 hover:bg-accent/15 hover:text-accent"
                >
                  <Plus className="size-3" />
                </button>
              )}
            </div>
            {showAddQuickText && onAddQuickText && (
              <Input
                value={newQuickText}
                onChange={(e) => setNewQuickText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddQuickTextSubmit();
                  } else if (e.key === 'Escape') {
                    setShowAddQuickText(false);
                    setNewQuickText('');
                  }
                }}
                placeholder="New quick text + Enter"
                autoFocus
                className="mt-1.5 h-7 text-[11px]"
              />
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const isPanelNode =
    type === 'transcript' ||
    type === 'ticketTracker' ||
    type === 'sop' ||
    type === 'productLookup';

  return (
    <div
      ref={nodeRef}
      style={{
        left: position.x,
        top: position.y,
        width,
        ...(zIndex !== undefined ? { zIndex } : {}),
      }}
      className={cn(
        'absolute cursor-grab select-none rounded-xl transition-all duration-200 active:cursor-grabbing',
        '[&_button]:cursor-pointer [&_input]:cursor-text [&_textarea]:cursor-text [&_input]:select-text [&_textarea]:select-text',
        // Embedded panel nodes (transcript / 24h tracker) carry the same
        // glass-card frame + accent border + active glow as every other
        // gridbox in the canvas. The inner panel root no longer ships its
        // own glass-panel wrapping — we keep a single outer frame, exactly
        // like the input / select / dynamic-list nodes.
        isActive
          ? cn(accentGlows[accent], 'animate-pulse-slow')
          : accentBorders[accent],
        // For panel bodies (which contain readable caption text / tracker
        // rows) re-enable user-select so agents can highlight and copy.
        isPanelNode &&
          '[&_[data-panel-body]]:select-text [&_[data-panel-body]_*]:select-text',
        // Auto-parsed value awaiting proofreading — engine-colored glow
        // takes precedence over the accent skins (later in the stylesheet):
        // YELLOW = LLM's full-context reading, BLUE = provisional regex
        // match the AI may still replace, TURQUOISE = Salesforce DOM scrape
        parsedSource === 'llm' && !isPanelNode && 'glass-parsed',
        parsedSource === 'dom-ext' && !isPanelNode && 'glass-parsed-dom',
        parsedSource && parsedSource !== 'llm' && parsedSource !== 'dom-ext' && !isPanelNode && 'glass-parsed-regex',
        // Expanded (in-flow) quick-inserts: node grows over neighbours and
        // turns much frostier for readability
        quickPanelOpen && 'glass-expanded z-30'
      )}
      onMouseDown={handleMouseDown}
    >
      {/* Parsed-field badge — which engine filled it, until it's proofread
          (yellow for the AI parser, blue for the provisional regex match) */}
      {parsedSource && (
        <span
          className={cn(
            'absolute right-2 top-2 z-10 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
            parsedSource === 'llm'
              ? 'border-amber-400/40 bg-amber-400/15 text-amber-600 dark:text-amber-300'
              : parsedSource === 'paraphrase'
                ? 'border-amber-400/40 bg-amber-400/15 text-amber-600 dark:text-amber-300'
                : parsedSource === 'dom-ext'
                  ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-700 dark:text-cyan-300'
                  : 'border-sky-400/40 bg-sky-400/15 text-sky-600 dark:text-sky-300'
          )}
          title={
            parsedSource === 'llm'
              ? 'Filled by the on-device AI parser from the whole conversation — please verify'
              : parsedSource === 'paraphrase'
                ? 'AI-polished condensation of the transcript — please verify'
                : parsedSource === 'dom-ext'
                  ? 'Filled from Salesforce Case data via the browser extension — verify against the live case if uncertain'
                  : 'Provisional pattern match from speech — the AI parser may still replace it, please verify'
          }
        >
          {parsedSource === 'llm'
            ? 'AI parsed'
            : parsedSource === 'paraphrase'
              ? 'AI polished'
              : parsedSource === 'dom-ext'
                ? 'Salesforce'
                : 'auto parsed'}
        </span>
      )}
      {renderContent()}
    </div>
  );
}

export default memo(FlowNodeComponent);
