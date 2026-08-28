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
import VoiceCaptionPanel from '@/components/VoiceCaptionPanel';
import { useVoiceTranscription } from '@/hooks/use-voice-transcription';
import { useCallCapture } from '@/hooks/use-call-capture';
import { useLocalTranscriber } from '@/hooks/use-local-transcriber';
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
    label: 'Deebot Model',
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
    width: 240,
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
      setFormData((prev) => ({ ...prev, [id]: value }));
    },
    [formData, setFormData, pushUndo]
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

  const handleReset = useCallback(() => {
    setFormData(INITIAL_FORM_DATA);
    // Clear drag overrides so all nodes return to the responsive default layout
    setPositions({});
    setActiveNodeId(null);
  }, [setFormData, setPositions]);

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

  const generateNoteText = useCallback((): string => {
    const getStr = (key: string) => {
      const v = formData[key];
      return typeof v === 'string' ? v : '';
    };

    return `**Notes**

Customer Name: ${getStr(NODE_IDS.CUSTOMER_NAME) || 'N/A'}
Contact number: ${getStr(NODE_IDS.CONTACT_NUMBER) || 'N/A'}
Email address: ${getStr(NODE_IDS.EMAIL_ADDRESS) || 'N/A'}
Current shipping address: ${getStr(NODE_IDS.SHIPPING_ADDRESS) || 'N/A'}
Serial Number: ${getStr(NODE_IDS.SERIAL_NUMBER) || 'N/A'}
Deebot Model: ${getStr(NODE_IDS.DEEBOT_MODEL) || 'N/A'}
SKU: ${getStr(NODE_IDS.SKU_NUMBER) || 'N/A'}
Purchase Channel and Date: ${getStr(NODE_IDS.PURCHASE_INFO) || 'N/A'}
Issue/s: ${getStr(NODE_IDS.ISSUE_TYPE) || 'N/A'} - ${getStr(NODE_IDS.DETAILED_ISSUE) || 'N/A'}
Resolution/s: ${getStr(NODE_IDS.RESOLUTION_SUMMARY) || 'N/A'}

Additional information (if needed): ${getStr(NODE_IDS.ADDITIONAL_NOTES) || 'N/A'}`;
  }, [formData]);

  const handleHangUp = useCallback(() => {
    const text = generateNoteText();
    setNoteText(text);
    setShowOutput(true);
  }, [generateNoteText]);

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
  //  callback below only fills empty fields so manual input is preserved.
  // ---------------------------------------------------------------------
  const handleAutoFill = useCallback(
    (fieldId: string, value: string) => {
      const nodeIdMap: Record<string, string> = {
        customerName: NODE_IDS.CUSTOMER_NAME,
        contactNumber: NODE_IDS.CONTACT_NUMBER,
        emailAddress: NODE_IDS.EMAIL_ADDRESS,
        deebotModel: NODE_IDS.DEEBOT_MODEL,
        skuNumber: NODE_IDS.SKU_NUMBER,
        serialNumber: NODE_IDS.SERIAL_NUMBER,
      };
      const nodeId = nodeIdMap[fieldId];
      if (!nodeId) return;

      // Never overwrite values the agent already typed
      const current = formData[nodeId];
      if (typeof current === 'string' && current.trim().length > 0) {
        return;
      }
      handleFieldChange(nodeId, value, true);
      toast.success(`Voice filled: ${fieldId}`);
    },
    [formData, handleFieldChange]
  );

  const voice = useVoiceTranscription(handleAutoFill);

  // ---------------------------------------------------------------------
  //  Local Whisper engine — on-device transcription of the CCP call.
  //  Fully local (transformers.js WASM in a worker): no API key, no
  //  upload, no per-minute cost. base.en by default, tiny.en available.
  // ---------------------------------------------------------------------
  const localWhisper = useLocalTranscriber();

  // ---------------------------------------------------------------------
  //  CCP tab-audio capture → local Whisper → auto-fill.
  //  Mutually exclusive with the mic-only mode above.
  // ---------------------------------------------------------------------
  const call = useCallCapture(handleAutoFill, localWhisper);

  const handleToggleVoice = useCallback(() => {
    if (call.isCapturing) call.stop();
    voice.toggle();
  }, [call, voice]);

  const handleToggleCall = useCallback(() => {
    if (voice.isListening) voice.toggle(); // stop mic mode first
    if (localWhisper.isSupported && localWhisper.status !== 'ready') {
      // Warm the model while the user picks the CCP tab in the share dialog
      void localWhisper.load();
    }
    call.toggle();
  }, [call, voice, localWhisper]);

  const handleSwitchWhisperModel = useCallback(
    (model: Parameters<typeof localWhisper.switchModel>[0]) => {
      localWhisper.switchModel(model);
    },
    [localWhisper]
  );

  const handleClearMic = useCallback(() => {
    voice.clear();
  }, [voice]);

  const handleClearCall = useCallback(() => {
    call.clear();
  }, [call]);

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
            voiceSupported={voice.isSupported}
            voiceListening={voice.isListening}
            onToggleVoice={handleToggleVoice}
            callSupported={call.isSupported}
            callCapturing={call.isCapturing}
            onToggleCall={handleToggleCall}
          />
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
          />
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

      {/* Live captions + extracted-field chips; hidden when idle with no content */}
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
          onSwitchModel: handleSwitchWhisperModel,
        }}
      />
    </div>
  );
}
