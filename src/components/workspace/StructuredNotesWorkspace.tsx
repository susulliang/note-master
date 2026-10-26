import { useMemo } from 'react';
import {
  Activity,
  ArrowDownRight,
  Check,
  CircleDot,
  LayoutTemplate,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import FlowNode, { type NodeType, type QuickTextGroup } from '@/components/FlowNode';
import { NODE_IDS } from '@/data/ticket';
import type { AutoFillSource } from '@/lib/field-extraction';

export interface NotesFieldConfig {
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
  pinFromValue?: boolean;
  mono?: boolean;
  firmwareModel?: boolean;
  skuLookup?: boolean;
  phonetic?: boolean;
  headerTag?: { label: string; href?: string; onClick?: () => void };
  collapsible?: boolean;
  collapsedLabel?: string;
};

interface StructuredNotesWorkspaceProps {
  nodes: NotesFieldConfig[];
  formData: Record<string, string | string[]>;
  onFieldChange: (id: string, value: string | string[], discrete?: boolean) => void;
  activeNodeId: string | null;
  onNodeFocus: (id: string) => void;
  onNodeBlur: () => void;
  onOpenFlowView: () => void;
  parsedFields?: Record<string, AutoFillSource>;
  quickInsertHidden?: boolean;
  customerAddressCount?: number;
  onIncrementCustomerAddressCount?: () => void;
  emailGlow?: 'need' | 'done';
  collapsedNodes?: Record<string, boolean>;
  onToggleNodeCollapsed?: (id: string) => void;
  isCapturing: boolean;
}

const SECTIONS = [
  {
    id: 'customer',
    index: '01',
    title: 'Customer',
    description: 'Who is calling and how to reach them',
    fields: [NODE_IDS.CUSTOMER_NAME, NODE_IDS.CONTACT_NUMBER, NODE_IDS.EMAIL_ADDRESS, NODE_IDS.SHIPPING_ADDRESS],
  },
  {
    id: 'device',
    index: '02',
    title: 'Device',
    description: 'Product identity and purchase details',
    fields: [NODE_IDS.DEEBOT_MODEL, NODE_IDS.SKU_NUMBER, NODE_IDS.SERIAL_NUMBER, NODE_IDS.ORDER_NUMBER, NODE_IDS.PURCHASE_INFO],
  },
  {
    id: 'issue',
    index: '03',
    title: 'Issue',
    description: 'Classify the reason for contact',
    fields: [NODE_IDS.ISSUE_TYPE, NODE_IDS.DETAILED_ISSUE],
  },
  {
    id: 'resolution',
    index: '04',
    title: 'Resolution',
    description: 'Record the actions and next steps',
    fields: [NODE_IDS.RESOLUTION_SUMMARY, NODE_IDS.ADDITIONAL_NOTES],
  },
] as const;

function hasValue(value: string | string[] | undefined): boolean {
  return Array.isArray(value) ? value.some((item) => item.trim()) : Boolean(value?.trim());
}

export function StructuredNotesWorkspace({
  nodes,
  formData,
  onFieldChange,
  activeNodeId,
  onNodeFocus,
  onNodeBlur,
  onOpenFlowView,
  parsedFields,
  quickInsertHidden = false,
  customerAddressCount,
  onIncrementCustomerAddressCount,
  emailGlow,
  collapsedNodes,
  onToggleNodeCollapsed,
  isCapturing,
}: StructuredNotesWorkspaceProps) {
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const callCues = nodes.filter((node) => node.type === 'start' || node.type === 'agent');
  const fieldIds = SECTIONS.flatMap((section) => section.fields);
  const populatedCount = fieldIds.filter((id) => hasValue(formData[id])).length;
  const customerNameValue = formData[NODE_IDS.CUSTOMER_NAME];
  const customerName = typeof customerNameValue === 'string'
    ? customerNameValue.trim()
    : '';
  const robotModelValue = formData[NODE_IDS.DEEBOT_MODEL];
  const robotModel = typeof robotModelValue === 'string'
    ? robotModelValue.trim()
    : '';

  const jumpToSection = (id: string) => {
    document.getElementById(`notes-section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={`quiet-notes-editor custom-scrollbar h-full min-h-full overflow-y-auto ${isCapturing ? 'quiet-notes-editor--capturing' : ''}`}>
      <div className="mx-auto w-full max-w-[1240px] px-4 pb-12 pt-5 sm:px-6 sm:pt-7 lg:px-8">
        <section className="quiet-notes-focus">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="quiet-status-pill">
                {isCapturing ? <Activity className="size-3.5 animate-pulse" /> : <CircleDot className="size-3.5" />}
                {isCapturing ? 'Call in progress' : 'Call workspace'}
              </span>
              <span className="quiet-status-pill quiet-status-pill--soft">
                <Check className="size-3.5" />
                {populatedCount} fields started
              </span>
            </div>
            <h2 className="mt-3 truncate text-[24px] font-semibold tracking-[-0.035em] sm:text-[28px]">
              {customerName || 'New support call'}
            </h2>
            <p className="mt-1 truncate text-sm text-[var(--qw-muted)]">
              {robotModel || 'Device model not selected yet'}
            </p>
          </div>
          <button type="button" className="quiet-secondary-action" onClick={onOpenFlowView}>
            <LayoutTemplate className="size-4" />
            <span>Flow view</span>
          </button>
        </section>

        <nav className="quiet-section-jumps" aria-label="Jump to note section">
          {SECTIONS.map((section) => (
            <button key={section.id} type="button" onClick={() => jumpToSection(section.id)}>
              <span>{section.index}</span>
              {section.title}
              <ArrowDownRight className="size-3.5" />
            </button>
          ))}
        </nav>

        {callCues.length > 0 && (
          <details className="quiet-call-cues">
            <summary>Conversation cues <span>{callCues.length} prompts</span></summary>
            <div className="quiet-call-cue-list">
              {callCues.map((cue) => (
                <p key={cue.id}>{cue.text}</p>
              ))}
            </div>
          </details>
        )}

        <div className="quiet-notes-sections">
          {SECTIONS.map((section) => {
            const fields = section.fields
              .map((id) => nodeById.get(id))
              .filter((node): node is NotesFieldConfig => Boolean(node));
            if (!fields.length) return null;
            return (
              <section
                key={section.id}
                id={`notes-section-${section.id}`}
                className={`quiet-notes-section quiet-notes-section--${section.id}`}
              >
                <header className="quiet-section-heading">
                  <span className="quiet-section-index">{section.index}</span>
                  <div>
                    <h3>{section.title}</h3>
                    <p>{section.description}</p>
                  </div>
                </header>
                <div className="quiet-fields-grid">
                  {fields.map((node) => (
                    <FlowNode
                      key={node.id}
                      id={node.id}
                      type={node.type}
                      label={node.label}
                      text={node.text}
                      value={formData[node.id] ?? (node.type === 'dynamic-list' ? [] : '')}
                      onChange={(value, discrete) => onFieldChange(node.id, value, discrete)}
                      onFocus={onNodeFocus}
                      onBlur={onNodeBlur}
                      isActive={activeNodeId === node.id}
                      position={{ x: 0, y: 0 }}
                      onDragStart={() => {}}
                      options={node.options}
                      accent={node.accent}
                      inputType={node.inputType}
                      width={node.width}
                      textareaRows={node.textareaRows}
                      autoFocus={false}
                      icon={node.icon}
                      quickTexts={node.quickTexts}
                      quickTextGroups={node.quickTextGroups}
                      quickInsertHidden={quickInsertHidden}
                      customQuickTexts={node.customQuickTexts}
                      onAddQuickText={node.onAddQuickText}
                      onRemoveQuickText={node.onRemoveQuickText}
                      parsedSource={parsedFields?.[node.id] ?? null}
                      enablePinBubble={node.pinFromValue}
                      phonetic={node.phonetic}
                      headerTag={node.headerTag}
                      addressCount={node.id === NODE_IDS.CUSTOMER_NAME ? customerAddressCount : undefined}
                      onIncrementAddressCount={node.id === NODE_IDS.CUSTOMER_NAME ? onIncrementCustomerAddressCount : undefined}
                      emailGlow={node.id === NODE_IDS.EMAIL_ADDRESS ? emailGlow : undefined}
                      showFirmware={node.firmwareModel}
                      showSkuLookup={node.skuLookup}
                      skuRobotModel={node.skuLookup ? robotModel : undefined}
                      collapsed={node.collapsible ? collapsedNodes?.[node.id] ?? false : undefined}
                      onToggleCollapsed={node.collapsible && onToggleNodeCollapsed ? () => onToggleNodeCollapsed(node.id) : undefined}
                      collapsedLabel={node.collapsedLabel}
                      layoutMode="inline"
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div className="quiet-notes-bottom-action">
          <span className="quiet-save-indicator"><Check className="size-3.5" /> Notes save as you work</span>
        </div>
      </div>
    </div>
  );
}

export default StructuredNotesWorkspace;
