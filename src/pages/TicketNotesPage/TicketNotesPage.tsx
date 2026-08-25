import { useState, useCallback, useEffect, useMemo } from 'react';
import { Toaster, toast } from 'sonner';
import {
  MessageSquareText,
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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import FloatingControls from '@/components/FloatingControls';
import FlowchartCanvas from '@/components/FlowchartCanvas';
import OutputModal from '@/components/OutputModal';
import { useScopedState } from '@/hooks/use-scoped-state';
import {
  DEEBOT_MODELS,
  ISSUE_TYPES,
  DEFAULT_NODE_POSITIONS,
  NODE_IDS,
  MAX_HISTORY_ENTRIES,
  RESOLUTION_QUICK_TEXTS,
  PURCHASE_QUICK_TEXTS,
} from '@/data/ticket';
import type { NoteHistoryEntry } from '@/data/ticket';
import type { NodeType } from '@/components/FlowNode';

interface NodeConfig {
  id: string;
  type: NodeType;
  label?: string;
  text?: string;
  options?: string[];
  accent?: 'green' | 'blue' | 'red' | 'default';
  inputType?: 'text' | 'email' | 'tel' | 'textarea';
  width?: number;
  icon?: LucideIcon;
  quickTexts?: string[];
  customQuickTexts?: string[];
  onAddQuickText?: (text: string) => void;
  onRemoveQuickText?: (text: string) => void;
}

const NODES: NodeConfig[] = [
  {
    id: NODE_IDS.START,
    type: 'start',
    text: "👋 Hello, thanks for calling Ecovacs. My name is Dezzy, how can I help you today?",
    accent: 'green',
  },
  {
    id: NODE_IDS.FIRST_COMPLAINT,
    type: 'input',
    label: "Customer's First Complaint",
    inputType: 'textarea',
    accent: 'default',
    icon: MessageSquareText,
  },
  {
    id: NODE_IDS.ASK_NAME,
    type: 'agent',
    text: "📋 Before we get into that, can I please have your name?",
    accent: 'blue',
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
    id: NODE_IDS.ASK_NUMBER,
    type: 'agent',
    text: "📞 And the best number to reach you at?",
    accent: 'blue',
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
    inputType: 'text',
    accent: 'default',
    width: 200,
    icon: ShoppingBag,
  },
  {
    id: NODE_IDS.ISSUE_TYPE,
    type: 'select',
    label: 'Issue Type',
    options: ISSUE_TYPES,
    accent: 'default',
    width: 200,
    icon: TriangleAlert,
  },
  {
    id: NODE_IDS.DETAILED_ISSUE,
    type: 'input',
    label: 'Detailed Issue Description',
    inputType: 'textarea',
    accent: 'default',
    icon: FileText,
  },
  {
    id: NODE_IDS.EMAIL_ADDRESS,
    type: 'input',
    label: 'Email Address',
    inputType: 'email',
    accent: 'default',
    width: 200,
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
    width: 240,
  },
];

const INITIAL_FORM_DATA: Record<string, string | string[]> = {
  [NODE_IDS.START]: '',
  [NODE_IDS.FIRST_COMPLAINT]: '',
  [NODE_IDS.ASK_NAME]: '',
  [NODE_IDS.CUSTOMER_NAME]: '',
  [NODE_IDS.ASK_NUMBER]: '',
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

export default function TicketNotesPage() {
  const [formData, setFormData] = useScopedState<Record<string, string | string[]>>(
    'ecovacs_ticket_form_data',
    INITIAL_FORM_DATA
  );
  const [positions, setPositions] = useScopedState<Record<string, { x: number; y: number }>>(
    'ecovacs_ticket_node_positions',
    DEFAULT_NODE_POSITIONS
  );
  const [theme, setTheme] = useScopedState<'dark' | 'light'>('ecovacs_ticket_theme', 'dark');
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
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [showOutput, setShowOutput] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [noteText, setNoteText] = useState('');

  // Apply theme to document via data-theme attribute
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.setAttribute('data-theme', 'dark');
    }
  }, [theme]);

  const handleFieldChange = useCallback(
    (id: string, value: string | string[]) => {
      setFormData((prev) => ({ ...prev, [id]: value }));
    },
    [setFormData]
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

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, [setTheme]);

  const handleToggleHistory = useCallback(() => {
    setShowHistory((prev) => !prev);
  }, []);

  const handleReset = useCallback(() => {
    setFormData(INITIAL_FORM_DATA);
    setPositions(DEFAULT_NODE_POSITIONS);
    setActiveNodeId(null);
  }, [setFormData, setPositions]);

  // Quick texts per node: defaults + user-added (persisted separately per field)
  const resolutionQuickTexts = useMemo(
    () => [...RESOLUTION_QUICK_TEXTS, ...customResolutionQuickTexts],
    [customResolutionQuickTexts]
  );
  const purchaseQuickTexts = useMemo(
    () => [...PURCHASE_QUICK_TEXTS, ...customPurchaseQuickTexts],
    [customPurchaseQuickTexts]
  );

  const handleAddQuickText = useCallback(
    (target: 'resolution' | 'purchase', text: string) => {
      const t = text.trim();
      if (!t) return;
      const defaults = target === 'resolution' ? RESOLUTION_QUICK_TEXTS : PURCHASE_QUICK_TEXTS;
      const customs =
        target === 'resolution' ? customResolutionQuickTexts : customPurchaseQuickTexts;
      if (defaults.includes(t) || customs.includes(t)) {
        toast.info(`"${t}" already exists.`);
        return;
      }
      if (target === 'resolution') {
        setCustomResolutionQuickTexts((prev) => [...prev, t]);
      } else {
        setCustomPurchaseQuickTexts((prev) => [...prev, t]);
      }
      toast.success(`Quick text "${t}" added.`);
    },
    [
      customResolutionQuickTexts,
      customPurchaseQuickTexts,
      setCustomResolutionQuickTexts,
      setCustomPurchaseQuickTexts,
    ]
  );

  const handleRemoveQuickText = useCallback(
    (target: 'resolution' | 'purchase', text: string) => {
      if (target === 'resolution') {
        setCustomResolutionQuickTexts((prev) => prev.filter((t) => t !== text));
      } else {
        setCustomPurchaseQuickTexts((prev) => prev.filter((t) => t !== text));
      }
      toast.success(`Quick text "${text}" removed.`);
    },
    [setCustomResolutionQuickTexts, setCustomPurchaseQuickTexts]
  );

  // Attach quick texts + per-node handlers to the Resolution Summary and
  // Purchase Channel and Date node configs
  const nodes = useMemo(
    () =>
      NODES.map((n) => {
        if (n.id === NODE_IDS.RESOLUTION_SUMMARY) {
          return {
            ...n,
            quickTexts: resolutionQuickTexts,
            customQuickTexts: customResolutionQuickTexts,
            onAddQuickText: (t: string) => handleAddQuickText('resolution', t),
            onRemoveQuickText: (t: string) => handleRemoveQuickText('resolution', t),
          };
        }
        if (n.id === NODE_IDS.PURCHASE_INFO) {
          return {
            ...n,
            quickTexts: purchaseQuickTexts,
            customQuickTexts: customPurchaseQuickTexts,
            onAddQuickText: (t: string) => handleAddQuickText('purchase', t),
            onRemoveQuickText: (t: string) => handleRemoveQuickText('purchase', t),
          };
        }
        return n;
      }),
    [
      resolutionQuickTexts,
      purchaseQuickTexts,
      customResolutionQuickTexts,
      customPurchaseQuickTexts,
      handleAddQuickText,
      handleRemoveQuickText,
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

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background font-sans text-foreground">
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
            onToggleTheme={handleToggleTheme}
            onReset={handleReset}
            historyOpen={showHistory}
            onToggleHistory={handleToggleHistory}
            history={history}
            onDeleteHistory={handleDeleteHistory}
            onClearHistory={handleClearHistory}
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
          />
        </main>
      </div>

      <OutputModal
        open={showOutput}
        onOpenChange={setShowOutput}
        noteText={noteText}
        onSaveToHistory={handleOutputClose}
      />

      <Toaster
        position="bottom-right"
        theme={theme}
        toastOptions={{
          classNames: {
            toast:
              'font-sans text-sm !border-foreground/10 !bg-card/70 !text-foreground !shadow-2xl backdrop-blur-2xl',
          },
        }}
      />
    </div>
  );
}
