import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import {
  User,
  Phone,
  Mail,
  MapPin,
  Barcode,
  Hash,
  Bot,
  TriangleAlert,
  FileText,
  CheckCircle2,
  StickyNote,
  ShoppingBag,
  FileSearch,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import FloatingControls from '@/components/FloatingControls';
import FlowchartCanvas from '@/components/FlowchartCanvas';
import OutputModal from '@/components/OutputModal';
import TemplatePanel from '@/components/TemplatePanel';
import TicketTrackerPanel from '@/components/TicketTrackerPanel';
import SopPanel from '@/components/SopPanel';
import VoiceCaptionPanel from '@/components/VoiceCaptionPanel';
import { useVoiceTranscription } from '@/hooks/use-voice-transcription';
import type { AutoFillSource } from '@/lib/field-extraction';
import { useCallCapture } from '@/hooks/use-call-capture';
import { useLocalTranscriber } from '@/hooks/use-local-transcriber';
import { useLlmParser } from '@/hooks/use-llm-parser';
import { useCloudParser } from '@/hooks/use-cloud-parser';
import { generateWithDeepseek } from '@/lib/cloud-parser';
import { searchTemplates } from '@/lib/amr-templates';
import { useScopedState } from '@/hooks/use-scoped-state';
import {
  normalizeTheme,
  nextTheme,
  getThemeMeta,
  NARROW_SCREEN_WIDTH,
  type ThemeId,
  type UiScale,
} from '@/lib/themes';
import {
  DEEBOT_MODELS,
  ISSUE_TYPES,
  NODE_IDS,
  MAX_HISTORY_ENTRIES,
  RESOLUTION_QUICK_TEXTS,
  PURCHASE_QUICK_TEXTS,
  DETAILED_ISSUE_QUICK_TEXTS,
  FAILURE_TOP_ISSUES,
  HOWTO_TOP_ISSUES,
} from '@/data/ticket';
import type { NoteHistoryEntry } from '@/data/ticket';
import { TicketPanelsContext } from '@/components/FlowNode';
import type { NodeType, QuickTextGroup } from '@/components/FlowNode';
import type { TemplateEntry } from '@/lib/amr-templates';

interface NodeConfig {
  id: string;
  type: NodeType;
  label?: string;
  text?: string;
  options?: string[];
  accent?: 'green' | 'blue' | 'red' | 'default';
  inputType?: 'text' | 'email' | 'tel' | 'textarea';
  width?: number;
  textareaRows?: number;
  icon?: LucideIcon;
  quickTexts?: string[];
  quickTextGroups?: QuickTextGroup[];
  customQuickTexts?: string[];
  onAddQuickText?: (text: string) => void;
  onRemoveQuickText?: (text: string) => void;
  templateMatches?: TemplateEntry[];
  onOpenTemplate?: (template: TemplateEntry) => void;
  /** HIDDEN: press-and-hold the field to reveal its derived PIN (SN node) */
  pinFromValue?: boolean;
}

const NODES: NodeConfig[] = [
  {
    id: NODE_IDS.START,
    type: 'start',
    text: "👋 Hello, thanks for calling Ecovacs. My name is ____ , how can I help you today?",
    accent: 'green',
  },
  {
    id: NODE_IDS.CUSTOMER_NAME,
    type: 'input',
    label: 'Customer Name',
    inputType: 'text',
    accent: 'default',
    icon: User,
  },
  {
    id: NODE_IDS.CONTACT_NUMBER,
    type: 'input',
    label: 'Contact Number',
    inputType: 'tel',
    accent: 'default',
    icon: Phone,
  },
  {
    id: NODE_IDS.TRANSITION,
    type: 'agent',
    text: "🔧 Thanks a lot, let's try to figure out your issue",
    accent: 'green',
  },
  {
    id: NODE_IDS.DEEBOT_MODEL,
    type: 'select',
    label: 'Robot Model',
    options: DEEBOT_MODELS,
    accent: 'default',
    width: 200,
    icon: Bot,
  },
  {
    id: NODE_IDS.SKU_NUMBER,
    type: 'input',
    label: 'SKU Number',
    inputType: 'text',
    accent: 'default',
    width: 200,
    icon: Barcode,
  },
  {
    id: NODE_IDS.SERIAL_NUMBER,
    type: 'input',
    label: 'Serial Number',
    inputType: 'text',
    accent: 'default',
    width: 200,
    icon: Hash,
    // HIDDEN: press-and-hold the field ~600ms → floating PIN bubble (snToPin)
    pinFromValue: true,
  },
  {
    id: NODE_IDS.PURCHASE_INFO,
    type: 'input',
    label: 'Purchase Channel and Date',
    inputType: 'textarea',
    accent: 'default',
    width: 220,
    icon: ShoppingBag,
  },
  {
    id: NODE_IDS.TEMPLATE_MATCHES,
    type: 'templates',
    label: 'Matching Templates',
    accent: 'default',
    width: 480,
    icon: FileSearch,
  },
  {
    id: NODE_IDS.ISSUE_TYPE,
    type: 'select',
    label: 'Issue Type',
    options: ISSUE_TYPES,
    accent: 'default',
    width: 400,
    icon: TriangleAlert,
  },
  {
    id: NODE_IDS.DETAILED_ISSUE,
    type: 'input',
    label: 'Detailed Issue Description',
    inputType: 'textarea',
    accent: 'default',
    width: 320,
    textareaRows: 4,
    icon: FileText,
  },
  {
    id: NODE_IDS.EMAIL_ADDRESS,
    type: 'input',
    label: 'Email Address',
    inputType: 'email',
    accent: 'default',
    width: 400,
    icon: Mail,
  },
  {
    id: NODE_IDS.SHIPPING_ADDRESS,
    type: 'input',
    label: 'Shipping Address',
    inputType: 'textarea',
    accent: 'default',
    width: 200,
    icon: MapPin,
  },
  {
    id: NODE_IDS.RESOLUTION_SUMMARY,
    type: 'input',
    label: 'Resolution Summary',
    inputType: 'textarea',
    accent: 'default',
    // Doubled width (240 -> 480): the accumulated step list gets long, and
    // condensed 3-10 word phrases read best on a single line each
    width: 480,
    // Doubled height: the LLM accumulates every troubleshooting step the
    // agent advises across the whole call, so the list grows long
    textareaRows: 4,
    icon: CheckCircle2,
  },
  {
    id: NODE_IDS.ADDITIONAL_NOTES,
    type: 'input',
    label: 'Additional Notes',
    inputType: 'textarea',
    accent: 'default',
    icon: StickyNote,
  },
  {
    id: NODE_IDS.HANG_UP,
    type: 'hangup',
    accent: 'red',
    width: 280,
  },
  // Side tool panels: seated directly in the flowchart canvas as draggable
  // boxes. Actual live content (VoiceCaptionPanel / TicketTrackerPanel)
  // is injected from the component body via FlowchartCanvas override props
  // so that hook state / callbacks stay fresh without rebuilding the whole
  // nodes array every render.
  {
    id: NODE_IDS.TRANSCRIPT_PANEL,
    type: 'transcript',
    label: 'Live Call Transcript',
    width: 640,
  },
  {
    id: NODE_IDS.TICKET_TRACKER,
    type: 'ticketTracker',
    label: '24H Ticket Tracker',
    width: 380,
  },
  {
    id: NODE_IDS.SOP_PANEL,
    type: 'sop',
    label: 'SOP · Standard Operating Procedure Match',
    width: 760,
  },
];

const INITIAL_FORM_DATA: Record<string, string | string[]> = {
  [NODE_IDS.START]: '',
  [NODE_IDS.CUSTOMER_NAME]: '',
  [NODE_IDS.CONTACT_NUMBER]: '',
  [NODE_IDS.TRANSITION]: '',
  [NODE_IDS.DEEBOT_MODEL]: '',
  [NODE_IDS.SKU_NUMBER]: '',
  [NODE_IDS.SERIAL_NUMBER]: '',
  [NODE_IDS.ISSUE_TYPE]: '',
  [NODE_IDS.DETAILED_ISSUE]: '',
  [NODE_IDS.PURCHASE_INFO]: '',
  [NODE_IDS.EMAIL_ADDRESS]: '',
  [NODE_IDS.SHIPPING_ADDRESS]: '',
  [NODE_IDS.RESOLUTION_SUMMARY]: '',
  [NODE_IDS.ADDITIONAL_NOTES]: '',
  [NODE_IDS.HANG_UP]: '',
};

// Quick-insert quick texts: built-in defaults per field, plus user-added custom
// texts persisted separately per field in localStorage.
type QuickTextTarget = 'resolution' | 'purchase' | 'issue';

const QUICK_TEXT_DEFAULTS: Record<QuickTextTarget, string[]> = {
  resolution: RESOLUTION_QUICK_TEXTS,
  purchase: PURCHASE_QUICK_TEXTS,
  issue: DETAILED_ISSUE_QUICK_TEXTS,
};

const QUICK_TEXT_NODE_TARGETS: Record<string, QuickTextTarget> = {
  [NODE_IDS.RESOLUTION_SUMMARY]: 'resolution',
  [NODE_IDS.PURCHASE_INFO]: 'purchase',
  [NODE_IDS.DETAILED_ISSUE]: 'issue',
};

function getCustomQuickTexts(
  target: QuickTextTarget,
  all: Record<QuickTextTarget, string[]>
): string[] {
  return all[target];
}

/** Fields covered by the Ctrl/Cmd+Z undo stack */
const UNDO_FIELDS = new Set<string>([NODE_IDS.RESOLUTION_SUMMARY, NODE_IDS.DETAILED_ISSUE]);

interface UndoEntry {
  field: string;
  value: string;
}

/** Typing bursts within this window collapse into one undo step (ms) */
const UNDO_COALESCE_MS = 600;
/** Max undo steps retained per session */
const UNDO_STACK_LIMIT = 100;

/** Result of merging an auto-parsed value into a field's current text */
interface AutoFillMerge {
  next: string;
  /**
   * Human-authored portion to keep in front of future LLM values.
   * `null` = leave any stored base untouched (REGEX path).
   */
  base: string | null;
}

/**
 * Merge an auto-parsed value into the field's current text.
 *
 *  - REGEX (the relegated engine) only ever fills an EMPTY field — anything
 *    a human or another parser already wrote is untouchable;
 *  - REGEX-GROW / PARAPHRASE (the evolving machine text) replace the value
 *    a previous regex or paraphrase pass wrote — that is what keeps the
 *    accumulating boxes GROWING as the call talks about new information —
 *    but never touch human-typed or main-LLM text;
 *  - the LLM is authoritative: it replaces a provisional REGEX value and
 *    replaces its OWN previous value (keeping the human-typed base in
 *    front), but APPENDS to text the agent typed by hand, so nothing a
 *    human wrote is ever lost and repeated parses never pile up.
 */
export function mergeAutoFill(
  curTrimmed: string,
  priorSource: AutoFillSource | undefined,
  humanBase: string,
  value: string,
  source: AutoFillSource
): AutoFillMerge {
  if (curTrimmed.length === 0) {
    return { next: value, base: source === 'llm' ? '' : null };
  }
  if (source === 'regex') {
    // Never disturbs an existing value (also the race guard: the field was
    // filled after this callback was captured)
    return { next: curTrimmed, base: null };
  }
  if (source === 'regex-grow' || source === 'paraphrase') {
    // Evolving machine text: replace the regex/paraphrase-authored value.
    // Human-typed and main-parse text is untouchable.
    if (
      priorSource === 'regex' ||
      priorSource === 'regex-grow' ||
      priorSource === 'paraphrase'
    ) {
      return { next: value, base: null };
    }
    return { next: curTrimmed, base: null };
  }
  if (priorSource === 'llm') {
    // Replace the machine-written portion; the human base stays in front
    return { next: humanBase ? `${humanBase} -> ${value}` : value, base: humanBase };
  }
  if (priorSource === 'regex' || priorSource === 'regex-grow' || priorSource === 'paraphrase') {
    // LLM supersedes the provisional pattern-matched / paraphrased value
    return { next: value, base: '' };
  }
  // Human-typed text — append, never overwrite
  const sep = curTrimmed.endsWith('->') ? ' ' : ' -> ';
  return { next: `${curTrimmed}${sep}${value}`, base: curTrimmed };
}

export default function TicketNotesPage() {
  const [formData, setFormData] = useScopedState<Record<string, string | string[]>>(
    'ecovacs_ticket_form_data',
    INITIAL_FORM_DATA
  );
  // Node positions are stored as per-node drag overrides — nodes without an
  // override follow the responsive default layout computed from canvas size.
  // Resizing the window clears the overrides so the grid re-aligns.
  const [positions, setPositions] = useScopedState<Record<string, { x: number; y: number }>>(
    'ecovacs_ticket_node_position_overrides',
    {}
  );
  /**
   * Canvas gridboxes the agent has intentionally HIDDEN from view via the
   * BOXES toolbar toggle. Hidden nodes are still:
   *  • Stored in formData + localStorage (values preserved)
   *  • Included in the Hang Up final note (their data is part of the ticket)
   * But they are simply not rendered in the flowchart canvas nor their
   * bezier connections drawn, to let the agent focus on the flow.
   *
   * Persisted key: `ecovacs_ticket_hidden_nodes` (string[] of node ids).
   */
  const [hiddenNodeIds, setHiddenNodeIds] = useScopedState<string[]>(
    'ecovacs_ticket_hidden_nodes',
    []
  );
  const hiddenNodesSet = useMemo(
    () => new Set(hiddenNodeIds),
    [hiddenNodeIds]
  );
  /** The 7 gridboxes the user asked for toggle controls for — a stable
   *  ordered list we render in the BOXES dropdown. Labels match their
   *  request exactly: Shipping address, Call Transcript, 24H tracker,
   *  SOP box, SKU box, SERIAL Number box, additional note box. */
  const GRIDBOX_VISIBILITY_TOGGLES = useMemo(
    () => [
      { id: NODE_IDS.SHIPPING_ADDRESS, label: 'Shipping address' },
      { id: NODE_IDS.TRANSCRIPT_PANEL, label: 'Call Transcript' },
      { id: NODE_IDS.TICKET_TRACKER, label: '24H tracker' },
      { id: NODE_IDS.SOP_PANEL, label: 'SOP box' },
      { id: NODE_IDS.SKU_NUMBER, label: 'SKU box' },
      { id: NODE_IDS.SERIAL_NUMBER, label: 'SERIAL Number box' },
      { id: NODE_IDS.ADDITIONAL_NOTES, label: 'Additional note box' },
    ],
    []
  );
  const handleToggleGridbox = useCallback(
    (id: string, nextVisible: boolean) => {
      setHiddenNodeIds((prev) => {
        const cur = new Set(prev);
        if (nextVisible) {
          cur.delete(id);
        } else {
          cur.add(id);
        }
        return Array.from(cur);
      });
    },
    [setHiddenNodeIds]
  );
  const gridboxVisibilityToggles = useMemo(
    () =>
      GRIDBOX_VISIBILITY_TOGGLES.map((t) => ({
        ...t,
        visible: !hiddenNodesSet.has(t.id),
      })),
    [GRIDBOX_VISIBILITY_TOGGLES, hiddenNodesSet]
  );
  const [rawTheme, setTheme] = useScopedState<ThemeId>('ecovacs_ticket_theme', 'midnight');
  // Normalize legacy 'dark'/'light' values from older sessions
  const theme = normalizeTheme(rawTheme);
  // UI scale ("old people mode"): 1.25x zoom of the entire app
  const [uiScale, setUiScale] = useScopedState<UiScale>('ecovacs_ticket_ui_scale', 'normal');
  // Narrow screens auto-apply the small scale (one size down) unless the
  // user explicitly turned large mode on
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window === 'undefined' ? NARROW_SCREEN_WIDTH + 1 : window.innerWidth
  );
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const effectiveScale: UiScale =
    uiScale === 'large' ? 'large' : windowWidth < NARROW_SCREEN_WIDTH ? 'small' : 'normal';
  const [history, setHistory] = useScopedState<NoteHistoryEntry[]>(
    'ecovacs_ticket_notes_history',
    []
  );
  const [customResolutionQuickTexts, setCustomResolutionQuickTexts] = useScopedState<string[]>(
    'ecovacs_ticket_resolution_quicktexts',
    []
  );
  const [customPurchaseQuickTexts, setCustomPurchaseQuickTexts] = useScopedState<string[]>(
    'ecovacs_ticket_purchase_quicktexts',
    []
  );
  const [customIssueQuickTexts, setCustomIssueQuickTexts] = useScopedState<string[]>(
    'ecovacs_ticket_issue_quicktexts',
    []
  );
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [showOutput, setShowOutput] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [noteText, setNoteText] = useState('');
  // AMR template search + viewer
  const [templateMatches, setTemplateMatches] = useState<TemplateEntry[]>([]);
  const [openTemplate, setOpenTemplate] = useState<TemplateEntry | null>(null);
  /**
   * Fields currently holding an auto-parsed value (node id → engine) —
   * drives the yellow proofreading glow and is cleared the moment the
   * agent edits the field by hand.
   */
  const [parsedFields, setParsedFields] = useState<Record<string, AutoFillSource>>({});
  /**
   * Human-typed portion of each auto-filled field (node id → base). When
   * the LLM appends to text the agent typed by hand, the base is kept in
   * front of every later LLM value instead of the appends piling up.
   */
  const llmBasesRef = useRef<Record<string, string>>({});

  // Apply theme to document via data-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Apply UI scale to <body> (zoom handled in CSS)
  useEffect(() => {
    document.body.setAttribute('data-ui-scale', effectiveScale);
  }, [effectiveScale]);

  // Customers usually state their concern first — focus the Detailed Issue
  // Description node when the page opens
  useEffect(() => {
    setActiveNodeId(NODE_IDS.DETAILED_ISSUE);
  }, []);

  // Debounced fuzzy search of AMR template names. The selected issue type
  // and Deebot model are prefixed onto the typed issue text so model- and
  // category-specific templates surface more reliably.
  useEffect(() => {
    const getStr = (key: string) => {
      const v = formData[key];
      return typeof v === 'string' ? v : '';
    };
    const query = [
      getStr(NODE_IDS.ISSUE_TYPE),
      getStr(NODE_IDS.DEEBOT_MODEL),
      getStr(NODE_IDS.DETAILED_ISSUE),
    ]
      .filter(Boolean)
      .join(' ');
    const timer = window.setTimeout(() => {
      setTemplateMatches(searchTemplates(query));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [formData]);

  const handleOpenTemplate = useCallback((tpl: TemplateEntry) => {
    setOpenTemplate(tpl);
  }, []);

  const handleCloseTemplate = useCallback(() => {
    setOpenTemplate(null);
  }, []);

  // ---------------------------------------------------------------------
  //  Undo (Ctrl/Cmd+Z) for Resolution Summary + Detailed Issue: covers
  //  typing (bursts coalesced) and chip/template-line inserts (discrete).
  // ---------------------------------------------------------------------
  const undoStack = useRef<UndoEntry[]>([]);
  const lastUndoPush = useRef(0);

  /** Snapshot the pre-change value; discrete inserts always push, keystrokes coalesce */
  const pushUndo = useCallback((field: string, value: string, discrete: boolean) => {
    const now = Date.now();
    if (!discrete && now - lastUndoPush.current < UNDO_COALESCE_MS) return;
    const top = undoStack.current[undoStack.current.length - 1];
    if (top && top.field === field && top.value === value) return;
    undoStack.current.push({ field, value });
    if (undoStack.current.length > UNDO_STACK_LIMIT) undoStack.current.shift();
    lastUndoPush.current = now;
  }, []);

  const handleFieldChange = useCallback(
    (id: string, value: string | string[], discrete?: boolean) => {
      if (UNDO_FIELDS.has(id) && typeof value === 'string') {
        const prev = formData[id];
        if (typeof prev === 'string') pushUndo(id, prev, Boolean(discrete));
      }
      // Any change routed through here is a human edit (typing, chip insert,
      // combobox pick) — auto-fills bypass this path — so the yellow
      // proofreading glow comes off the field and any recorded human base
      // is re-anchored to the freshly edited text.
      if (parsedFields[id]) {
        setParsedFields((prev) => {
          const { [id]: _cleared, ...rest } = prev;
          return rest;
        });
      }
      delete llmBasesRef.current[id];
      setFormData((prev) => ({ ...prev, [id]: value }));
    },
    [formData, setFormData, pushUndo, parsedFields]
  );

  // Ctrl/Cmd+Z: undo the last tracked change. Native undo still applies to
  // other text fields — we only intercept when focus is in a tracked field
  // or on a non-editable element (e.g. right after clicking a chip)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== 'z') return;
      const target = e.target as HTMLElement | null;
      const editable = target?.closest?.(
        'input, textarea, [contenteditable="true"]'
      ) as HTMLElement | null;
      if (editable && !UNDO_FIELDS.has(editable.dataset.fieldId ?? '')) {
        return; // other fields keep native undo
      }
      e.preventDefault();
      const entry = undoStack.current.pop();
      if (!entry) return;
      setFormData((prev) => ({ ...prev, [entry.field]: entry.value }));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setFormData]);

  // Append a clicked template line to the Resolution Summary, exactly like
  // a quick-insert chip ("->" separator between entries) — pushed as its
  // own undo step
  const handleInsertTemplateLine = useCallback(
    (line: string) => {
      const current =
        typeof formData[NODE_IDS.RESOLUTION_SUMMARY] === 'string'
          ? (formData[NODE_IDS.RESOLUTION_SUMMARY] as string)
          : '';
      pushUndo(NODE_IDS.RESOLUTION_SUMMARY, current, true);
      setFormData((prev) => {
        const trimmed =
          typeof prev[NODE_IDS.RESOLUTION_SUMMARY] === 'string'
            ? (prev[NODE_IDS.RESOLUTION_SUMMARY] as string).trimEnd()
            : '';
        let next: string;
        if (!trimmed) {
          next = line;
        } else if (trimmed.endsWith('->')) {
          next = `${trimmed} ${line}`;
        } else {
          next = `${trimmed} -> ${line}`;
        }
        return { ...prev, [NODE_IDS.RESOLUTION_SUMMARY]: next };
      });
    },
    [formData, setFormData, pushUndo]
  );

  // Direct edits to the Resolution Summary from the template panel — typed
  // edits flow through the undo-coalescing path like canvas typing
  const handleResolutionChange = useCallback(
    (text: string) => {
      handleFieldChange(NODE_IDS.RESOLUTION_SUMMARY, text);
    },
    [handleFieldChange]
  );

  const handleNodeFocus = useCallback((id: string) => {
    setActiveNodeId(id);
  }, []);

  const handleNodeBlur = useCallback(() => {
    // Small delay to allow chip clicks to land before deactivating the node
    setTimeout(() => {
      setActiveNodeId(null);
    }, 150);
  }, []);

  const handlePositionChange = useCallback(
    (id: string, pos: { x: number; y: number }) => {
      setPositions((prev) => ({ ...prev, [id]: pos }));
    },
    [setPositions]
  );

  // Window resize: drop drag overrides so the responsive default layout
  // re-aligns every node cleanly at the new canvas size
  const handleLayoutReset = useCallback(() => {
    setPositions({});
  }, [setPositions]);

  const handleCycleTheme = useCallback(() => {
    setTheme(nextTheme(theme));
  }, [theme, setTheme]);

  const handleToggleUiScale = useCallback(() => {
    setUiScale((prev) => (prev === 'large' ? 'normal' : 'large'));
  }, [setUiScale]);

  const handleToggleHistory = useCallback(() => {
    setShowHistory((prev) => !prev);
  }, []);

  const handleAddQuickText = useCallback(
    (target: QuickTextTarget, text: string) => {
      const t = text.trim();
      if (!t) return;
      const customs = getCustomQuickTexts(target, {
        resolution: customResolutionQuickTexts,
        purchase: customPurchaseQuickTexts,
        issue: customIssueQuickTexts,
      });
      if (QUICK_TEXT_DEFAULTS[target].includes(t) || customs.includes(t)) {
        toast.info(`"${t}" already exists.`);
        return;
      }
      if (target === 'resolution') setCustomResolutionQuickTexts((prev) => [...prev, t]);
      else if (target === 'purchase') setCustomPurchaseQuickTexts((prev) => [...prev, t]);
      else setCustomIssueQuickTexts((prev) => [...prev, t]);
      toast.success(`Quick text "${t}" added.`);
    },
    [
      customResolutionQuickTexts,
      customPurchaseQuickTexts,
      customIssueQuickTexts,
      setCustomResolutionQuickTexts,
      setCustomPurchaseQuickTexts,
      setCustomIssueQuickTexts,
    ]
  );

  const handleRemoveQuickText = useCallback(
    (target: QuickTextTarget, text: string) => {
      const remove = (prev: string[]) => prev.filter((t) => t !== text);
      if (target === 'resolution') setCustomResolutionQuickTexts(remove);
      else if (target === 'purchase') setCustomPurchaseQuickTexts(remove);
      else setCustomIssueQuickTexts(remove);
      toast.success(`Quick text "${text}" removed.`);
    },
    [setCustomResolutionQuickTexts, setCustomPurchaseQuickTexts, setCustomIssueQuickTexts]
  );

  // Attach quick texts + per-node handlers to the nodes that support them.
  // Resolution Summary and Purchase info use flat chip lists; Detailed Issue
  // Description uses grouped chips (top-30 lists) rendered in a hover-expand
  // overlay panel. AMR template matches render in their own grid box.
  const nodes = useMemo(
    () =>
      NODES.map((n) => {
        if (n.id === NODE_IDS.TEMPLATE_MATCHES) {
          return {
            ...n,
            templateMatches,
            onOpenTemplate: handleOpenTemplate,
          };
        }
        const target = QUICK_TEXT_NODE_TARGETS[n.id];
        if (!target) return n;
        const customs = getCustomQuickTexts(target, {
          resolution: customResolutionQuickTexts,
          purchase: customPurchaseQuickTexts,
          issue: customIssueQuickTexts,
        });
        const base = {
          ...n,
          customQuickTexts: customs,
          onAddQuickText: (t: string) => handleAddQuickText(target, t),
          onRemoveQuickText: (t: string) => handleRemoveQuickText(target, t),
        };
        if (target === 'issue') {
          return {
            ...base,
            quickTextGroups: [
              { label: 'General', items: DETAILED_ISSUE_QUICK_TEXTS },
              { label: 'Failure · Top 30', items: FAILURE_TOP_ISSUES },
              { label: 'How to use · Top 30', items: HOWTO_TOP_ISSUES },
            ],
          };
        }
        return {
          ...base,
          quickTexts: [...QUICK_TEXT_DEFAULTS[target], ...customs],
        };
      }),
    [
      customResolutionQuickTexts,
      customPurchaseQuickTexts,
      customIssueQuickTexts,
      templateMatches,
      handleAddQuickText,
      handleRemoveQuickText,
      handleOpenTemplate,
    ]
  );

  const buildNoteText = useCallback((data: Record<string, string | string[]>): string => {
    const getStr = (key: string) => {
      const v = data[key];
      return typeof v === 'string' ? v : '';
    };

    return `**Notes**

Customer Name: ${getStr(NODE_IDS.CUSTOMER_NAME) || 'N/A'}
Contact number: ${getStr(NODE_IDS.CONTACT_NUMBER) || 'N/A'}
Email address: ${getStr(NODE_IDS.EMAIL_ADDRESS) || 'N/A'}
Current shipping address: ${getStr(NODE_IDS.SHIPPING_ADDRESS) || 'N/A'}
Serial Number: ${getStr(NODE_IDS.SERIAL_NUMBER) || 'N/A'}
Robot Model: ${getStr(NODE_IDS.DEEBOT_MODEL) || 'N/A'}
SKU: ${getStr(NODE_IDS.SKU_NUMBER) || 'N/A'}
Purchase Channel and Date: ${getStr(NODE_IDS.PURCHASE_INFO) || 'N/A'}
Issue/s: ${getStr(NODE_IDS.ISSUE_TYPE) || 'N/A'} - ${getStr(NODE_IDS.DETAILED_ISSUE) || 'N/A'}
Resolution/s: ${getStr(NODE_IDS.RESOLUTION_SUMMARY) || 'N/A'}

Additional information (if needed): ${getStr(NODE_IDS.ADDITIONAL_NOTES) || 'N/A'}`;
  }, []);

  /** Always-fresh mirror of the form data — the hang-up flow generates the
   *  note only AFTER an async drain/finalize, when the closure would be stale */
  const formDataRef = useRef(formData);
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Save the (possibly edited) note to history when the output modal closes
  const handleOutputClose = useCallback(
    (finalText: string) => {
      const getStr = (key: string) => {
        const v = formData[key];
        return typeof v === 'string' ? v : '';
      };

      const entry: NoteHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        customerName: getStr(NODE_IDS.CUSTOMER_NAME),
        issueType: getStr(NODE_IDS.ISSUE_TYPE),
        noteText: finalText,
      };
      setHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
    },
    [formData, setHistory]
  );

  const handleDeleteHistory = useCallback(
    (id: string) => {
      setHistory((prev) => prev.filter((entry) => entry.id !== id));
      toast.success('Note removed from history.');
    },
    [setHistory]
  );

  const handleClearHistory = useCallback(() => {
    setHistory([]);
    toast.success('History cleared.');
  }, [setHistory]);

  // ---------------------------------------------------------------------
  //  Voice transcription (Web Speech API prototype)
  //  The hook keeps one stable SpeechRecognition instance; the auto-fill
  //  callback below receives results from the LLM (primary, authoritative)
  //  and the regex engine (relegated, provisional) and layers them into
  //  the form via mergeAutoFill().
  // ---------------------------------------------------------------------

  /** Extracted field id → canvas node id */
  const FIELD_TO_NODE: Record<string, string> = {
    customerName: NODE_IDS.CUSTOMER_NAME,
    contactNumber: NODE_IDS.CONTACT_NUMBER,
    emailAddress: NODE_IDS.EMAIL_ADDRESS,
    deebotModel: NODE_IDS.DEEBOT_MODEL,
    skuNumber: NODE_IDS.SKU_NUMBER,
    serialNumber: NODE_IDS.SERIAL_NUMBER,
    purchaseInfo: NODE_IDS.PURCHASE_INFO,
    issueDescription: NODE_IDS.DETAILED_ISSUE,
    issueType: NODE_IDS.ISSUE_TYPE,
    resolutionSummary: NODE_IDS.RESOLUTION_SUMMARY,
  };

  /**
   * Layer auto-parse results into the form (see mergeAutoFill for the exact
   * semantics). The merge runs inside the setState updater as well, so a
   * value landing mid-keystroke still merges against the freshest text.
   * Either way the field lights up with the yellow proofreading glow until
   * it is edited by hand; repeated identical parses are silent no-ops.
   */
  const handleAutoFill = useCallback(
    (fieldId: string, value: string, source: AutoFillSource) => {
      const nodeId = FIELD_TO_NODE[fieldId];
      if (!nodeId) return;

      const current = formData[nodeId];
      const curTrimmed = typeof current === 'string' ? current.trimEnd() : '';
      const priorSource = parsedFields[nodeId];

      // REGEX (relegated) only ever fills EMPTY fields
      if (source === 'regex' && curTrimmed.length > 0) return;
      // The evolving machine text (regex-grow / paraphrase) may only
      // replace text a previous regex/paraphrase pass wrote — anything a
      // human or the main LLM authored is untouchable
      if (
        (source === 'regex-grow' || source === 'paraphrase') &&
        curTrimmed.length > 0 &&
        !(
          priorSource === 'regex' ||
          priorSource === 'regex-grow' ||
          priorSource === 'paraphrase'
        )
      ) {
        return;
      }

      // Undo snapshot for the two undo-tracked textareas, before the change
      if (UNDO_FIELDS.has(nodeId) && typeof current === 'string') {
        pushUndo(nodeId, current, true);
      }

      const base = llmBasesRef.current[nodeId] ?? '';
      const plan = mergeAutoFill(curTrimmed, priorSource, base, value, source);

      setFormData((prev) => {
        const cur = prev[nodeId];
        const latest = typeof cur === 'string' ? cur.trimEnd() : '';
        const merged =
          latest === curTrimmed
            ? plan
            : mergeAutoFill(latest, priorSource, base, value, source);
        if (merged.next === latest) return prev;
        return { ...prev, [nodeId]: merged.next };
      });

      if (plan.base !== null) llmBasesRef.current[nodeId] = plan.base;
      // 'regex-grow' is the same engine as 'regex' (one badge); the
      // paraphrase polish gets its own marker
      const storedSource: AutoFillSource = source === 'regex-grow' ? 'regex' : source;
      setParsedFields((prev) =>
        prev[nodeId] === storedSource ? prev : { ...prev, [nodeId]: storedSource }
      );
      if (plan.next !== curTrimmed) {
        const label =
          source === 'llm'
            ? 'AI parsed'
            : source === 'paraphrase'
              ? 'AI polished'
              : source === 'regex-grow'
                ? 'Pattern updated'
                : 'Pattern filled';
        toast.success(`${label}: ${fieldId}`, {
          description: value.length > 80 ? `${value.slice(0, 80)}…` : value
        });
      }
    },
    [formData, setFormData, pushUndo, parsedFields]
  );

  const voice = useVoiceTranscription(handleAutoFill);

  // ---------------------------------------------------------------------
  //  Local Whisper engine — on-device transcription of the CCP call.
  //  Fully local (transformers.js WASM in a worker): no API key, no
  //  upload, no per-minute cost. base.en by default, tiny.en available.
  // ---------------------------------------------------------------------
  const localWhisper = useLocalTranscriber();

  // ---------------------------------------------------------------------
  //  Ultra-small on-device LLM — the PRIMARY field parser. It re-reads the
  //  whole speaker-tagged conversation (agent + customer) whenever the
  //  transcription queue drains, and its full-context reading of the
  //  situation overrides anything the regex engine provisionally filled
  //  (transformers.js in a worker, ~360M params, output validated against
  //  the canonical option lists).
  // ---------------------------------------------------------------------
  const llmParser = useLlmParser();

  // ---------------------------------------------------------------------
  //  On-demand DeepSeek cloud parser — the explicit "Cloud parse" button
  //  in the engine settings panel. One click sends the current transcript
  //  window to the DeepSeek API; the reply's fields overwrite every
  //  provisional regex fill. Needs the agent's API key (stored locally).
  // ---------------------------------------------------------------------
  const cloudParser = useCloudParser();
  // Stable SOP-cloud-AI generate handle. Wraps the raw DeepSeek chat
  // completion into the LlmGenerateFn shape the SopPanel consumes.
  // Only enabled when an effective DeepSeek key is present (env secret
  // priority, localStorage fallback) so that SopPanel falls back to the
  // local WASM LLM when the remote key is absent.
  const sopCloudGenerate = useCallback<(
    system: string,
    user: string,
    maxNewTokens?: number
  ) => Promise<{ text: string; ms: number; timedOut: boolean }>>(
    (system, user, maxNewTokens = 512) =>
      generateWithDeepseek(system, user, maxNewTokens),
    []
  );
  const sopCloudGenerateEnabled = cloudParser.hasKey;

  // ---------------------------------------------------------------------
  //  CCP tab-audio capture → local Whisper → auto-fill.
  //  Mutually exclusive with the mic-only mode above.
  // ---------------------------------------------------------------------
  const call = useCallCapture(handleAutoFill, localWhisper, llmParser, cloudParser);

  /** Panel mic-mode toggle (no longer in the toolbar — call capture covers
   *  both speakers with the same Mic icon) */
  const handleToggleVoice = useCallback(() => {
    if (call.isCapturing) call.stop();
    voice.toggle();
  }, [call, voice]);

  const handleToggleCall = useCallback(() => {
    if (localWhisper.isSupported && localWhisper.status !== 'ready') {
      // Warm the model while the user picks the CCP tab in the share dialog
      void localWhisper.load();
    }
    // Warm the LLM parser too (one-time, cached) so the first full-context
    // parse is not download-bound while the call is already running
    if (llmParser.enabled && !llmParser.isReady) {
      void llmParser.load();
    }
    call.toggle();
  }, [call, localWhisper, llmParser]);

  const handleSwitchWhisperModel = useCallback(
    (model: Parameters<typeof localWhisper.switchModel>[0]) => {
      localWhisper.switchModel(model);
    },
    [localWhisper]
  );

  const handleSwitchLlmModel = useCallback(
    (model: Parameters<typeof llmParser.switchModel>[0]) => {
      llmParser.switchModel(model);
    },
    [llmParser]
  );

  const handleToggleLlmEnabled = useCallback(
    (enabled: boolean) => {
      llmParser.setEnabled(enabled);
      if (enabled && !llmParser.isReady) void llmParser.load();
    },
    [llmParser]
  );

  const handleLoadLlm = useCallback(() => {
    void llmParser.load();
  }, [llmParser]);

  /** Download-manager load: pin the model to a backend (gpu=fp32, cpu=q8) */
  const handleLoadLlmDevice = useCallback(
    (model: Parameters<typeof llmParser.load>[0], device: 'gpu' | 'cpu') => {
      // Switching to a different model also updates the selector
      llmParser.switchModel(model as Parameters<typeof llmParser.switchModel>[0]);
      void llmParser.load(model, device);
    },
    [llmParser]
  );

  /**
   * Hang Up & Generate Note:
   *
   *  1. stops the live caption capture (same as the panel's Stop button —
   *     both the mic mode and the CCP call capture);
   *  2. waits (bounded) for the final audio segments to transcribe and runs
   *     one last authoritative LLM pass over the whole conversation, so
   *     fields parsed from the last seconds of the call make it into the
   *     note;
   *  3. generates the note from the then-current form data.
   *
   * Reads voice/call through a ref so the callback identity stays stable —
   * FlowchartCanvas is memoized and would otherwise re-render on every
   * capture-state tick (audio level meters fire 10×/s).
   */
  const voiceRef = useRef(voice);
  const callRef = useRef(call);
  useEffect(() => {
    voiceRef.current = voice;
    callRef.current = call;
  }, [voice, call]);
  const handleHangUp = useCallback(async () => {
    const voiceNow = voiceRef.current;
    const callNow = callRef.current;
    if (voiceNow.isListening) voiceNow.stop();
    if (callNow.isCapturing) {
      callNow.stop();
      await callNow.finalize();
      // Let React commit the final auto-fills before reading the form data
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    }
    const text = buildNoteText(formDataRef.current);
    setNoteText(text);
    setShowOutput(true);
  }, [buildNoteText]);

  const handleClearMic = useCallback(() => {
    voice.clear();
  }, [voice]);

  const handleClearCall = useCallback(() => {
    call.clear();
  }, [call]);

  // Defined after the capture hooks (voice / call): reset wipes the whole run
  // — form data, node positions, proofreading glows AND both transcript
  // sources — so a fresh ticket never shows the previous call's leftovers.
  const handleReset = useCallback(() => {
    setFormData(INITIAL_FORM_DATA);
    // Clear drag overrides so all nodes return to the responsive default layout
    setPositions({});
    setActiveNodeId(null);
    // Proofreading glows are per-run — a fresh form starts clean
    setParsedFields({});
    llmBasesRef.current = {};
    // Transcripts belong to the same run — reset wipes both capture sources
    // (mic captions + speaker-tagged call transcript) along with the form
    voice.clear();
    call.clear();
  }, [setFormData, setPositions, voice, call]);

  return (
    // h-full (not h-screen) so the viewport-filling layout stays correct
    // when the old-people-mode zoom is active on <body>
    <div className="relative h-full w-full overflow-hidden bg-background font-sans text-foreground">
      {/* Ambient color orbs — give the glass surfaces something to refract */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="glass-orb glass-orb-1" />
        <div className="glass-orb glass-orb-2" />
        <div className="glass-orb glass-orb-3" />
      </div>

      <div className="flex h-full w-full">
        {/* Main canvas area */}
        <main className="relative flex-1 min-w-0">
          <FloatingControls
            theme={theme}
            onCycleTheme={handleCycleTheme}
            onReset={handleReset}
            historyOpen={showHistory}
            onToggleHistory={handleToggleHistory}
            history={history}
            onDeleteHistory={handleDeleteHistory}
            onClearHistory={handleClearHistory}
            uiScale={uiScale}
            onToggleUiScale={handleToggleUiScale}
            callSupported={call.isSupported}
            callCapturing={call.isCapturing}
            onToggleCall={handleToggleCall}
            engine={{
              isSupported: localWhisper.isSupported,
              model: localWhisper.model,
              status: localWhisper.status,
              progress: localWhisper.progress,
              dtype: localWhisper.dtype,
              error: localWhisper.error,
              lastInferenceMs: localWhisper.lastInferenceMs,
              memStats: localWhisper.memStats,
              onSwitchModel: handleSwitchWhisperModel,
            }}
            parser={{
              enabled: llmParser.enabled,
              model: llmParser.model,
              models: llmParser.models,
              status: llmParser.status,
              progress: llmParser.progress,
              error: llmParser.error,
              isParsing: llmParser.isParsing,
              isParaphrasing: llmParser.isParaphrasing,
              lastParseMs: llmParser.lastParseMs,
              device: llmParser.device,
              dtype: llmParser.dtype,
              genProgress: llmParser.genProgress,
              memStats: llmParser.memStats,
              failedAttempts: llmParser.failedAttempts,
              window: llmParser.lastWindow,
              lastReply: llmParser.lastReply,
              lastStats: llmParser.lastStats,
              onLoadDevice: handleLoadLlmDevice,
              onToggleEnabled: handleToggleLlmEnabled,
              onSwitchModel: handleSwitchLlmModel,
              onLoad: handleLoadLlm,
            }}
            cloud={{
              hasKey: cloudParser.hasKey,
              error: cloudParser.error,
              onSetApiKey: cloudParser.setApiKey,
              isDefault: cloudParser.isDefault,
            }}
            transcript={call.transcript}
            isTranscribing={call.isTranscribing}
            gridboxVisibility={{
              toggles: gridboxVisibilityToggles,
              onToggle: handleToggleGridbox,
            }}
          />
          <TicketPanelsContext.Provider
            value={{
              transcriptContent: (
                <VoiceCaptionPanel
                  mic={{
                    isListening: voice.isListening,
                    finalTranscript: voice.finalTranscript,
                    interimText: voice.interimText,
                    suggestions: voice.suggestions,
                    error: voice.error,
                    level: voice.level,
                    onToggle: handleToggleVoice,
                    onClear: handleClearMic,
                  }}
                  call={{
                    isCapturing: call.isCapturing,
                    transcript: call.transcript,
                    suggestions: call.suggestions,
                    segmentsSent: call.segmentsSent,
                    queued: call.queued,
                    isTranscribing: call.isTranscribing,
                    error: call.error,
                    customerLevel: call.customerLevel,
                    agentLevel: call.agentLevel,
                    hasMic: call.hasMic,
                    onToggle: handleToggleCall,
                    onClear: handleClearCall,
                  }}
                  engine={{
                    isSupported: localWhisper.isSupported,
                    model: localWhisper.model,
                    status: localWhisper.status,
                    progress: localWhisper.progress,
                    dtype: localWhisper.dtype,
                    error: localWhisper.error,
                    lastInferenceMs: localWhisper.lastInferenceMs,
                    memStats: localWhisper.memStats,
                    onSwitchModel: handleSwitchWhisperModel,
                  }}
                  parser={{
                    enabled: llmParser.enabled,
                    model: llmParser.model,
                    models: llmParser.models,
                    status: llmParser.status,
                    progress: llmParser.progress,
                    error: llmParser.error,
                    isParsing: llmParser.isParsing,
                    isParaphrasing: llmParser.isParaphrasing,
                    lastParseMs: llmParser.lastParseMs,
                    device: llmParser.device,
                    dtype: llmParser.dtype,
                    genProgress: llmParser.genProgress,
                    memStats: llmParser.memStats,
                    window: llmParser.lastWindow,
                    lastReply: llmParser.lastReply,
                    lastStats: llmParser.lastStats,
                    failedAttempts: llmParser.failedAttempts,
                    onLoadDevice: handleLoadLlmDevice,
                    onToggleEnabled: handleToggleLlmEnabled,
                    onSwitchModel: handleSwitchLlmModel,
                    onLoad: handleLoadLlm,
                  }}
                  cloud={{
                    isParsing: call.isCloudParsing,
                    progress: cloudParser.progress,
                    isDefault: cloudParser.isDefault,
                    error: cloudParser.error,
                    lastResult: cloudParser.lastResult,
                    onParse: () => void call.cloudParse(),
                  }}
                />
              ),
              trackerContent: <TicketTrackerPanel />,
              sopContent: (
                <SopPanel
                  formData={formData}
                  issueTypeId={NODE_IDS.ISSUE_TYPE}
                  detailedIssueId={NODE_IDS.DETAILED_ISSUE}
                  purchaseInfoId={NODE_IDS.PURCHASE_INFO}
                  getFinalNote={() => buildNoteText(formData)}
                  cloudGenerate={sopCloudGenerateEnabled ? sopCloudGenerate : undefined}
                  llmGenerate={llmParser.enabled ? llmParser.generate : null}
                  llmStatus={llmParser.status}
                  llmIsReady={llmParser.isReady}
                  warmLlm={llmParser.load}
                />
              ),
            }}
          >
            <FlowchartCanvas
              nodes={nodes}
              positions={positions}
              formData={formData}
              onFieldChange={handleFieldChange}
              activeNodeId={activeNodeId}
              onNodeFocus={handleNodeFocus}
              onNodeBlur={handleNodeBlur}
              onPositionChange={handlePositionChange}
              onHangUp={handleHangUp}
              autoFocusId={NODE_IDS.DETAILED_ISSUE}
              onLayoutReset={handleLayoutReset}
              parsedFields={parsedFields}
              hiddenNodes={hiddenNodesSet}
            />
          </TicketPanelsContext.Provider>
        </main>
      </div>

      <OutputModal
        open={showOutput}
        onOpenChange={setShowOutput}
        noteText={noteText}
        onSaveToHistory={handleOutputClose}
      />

      <TemplatePanel
        template={openTemplate}
        onClose={handleCloseTemplate}
        onInsertLine={handleInsertTemplateLine}
        resolutionText={
          typeof formData[NODE_IDS.RESOLUTION_SUMMARY] === 'string'
            ? (formData[NODE_IDS.RESOLUTION_SUMMARY] as string)
            : ''
        }
        onResolutionChange={handleResolutionChange}
      />

      <Toaster
        position="bottom-right"
        theme={getThemeMeta(theme).toaster}
        toastOptions={{
          classNames: {
            toast: 'glass-panel font-sans text-sm !text-foreground',
          },
        }}
      />
    </div>
  );
}
