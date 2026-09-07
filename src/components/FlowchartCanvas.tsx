import { memo, useRef, useState, useCallback, useEffect, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import FlowNode, { type NodeType, type QuickTextGroup } from './FlowNode';
import { NODE_CONNECTIONS, NODE_GROUPS, NODE_IDS, NODE_LAYOUT_ROWS } from '@/data/ticket';
import type { TemplateEntry } from '@/lib/amr-templates';
import type { AutoFillSource } from '@/lib/field-extraction';
import { cn } from '@/lib/utils';

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
  autoFocus?: boolean;
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
  /** Embedded React content for 'transcript' and 'ticketTracker' panel nodes */
  panelContent?: React.ReactNode;
}

interface FlowchartCanvasProps {
  nodes: NodeConfig[];
  /** Per-node position overrides (nodes the user dragged); missing ids use the responsive default layout */
  positions: Record<string, { x: number; y: number }>;
  formData: Record<string, string | string[]>;
  /** discrete=true marks programmatic inserts (quick-insert chips) for undo */
  onFieldChange: (id: string, value: string | string[], discrete?: boolean) => void;
  activeNodeId: string | null;
  onNodeFocus: (id: string) => void;
  onNodeBlur: () => void;
  onPositionChange: (id: string, pos: { x: number; y: number }) => void;
  onHangUp: () => void;
  /** When true, the Hang Up button renders as a disabled spinner. Prevents
   *  the double-click bug visually AND mechanically while capture drains. */
  hangUpLoading?: boolean;
  /** Node whose input receives focus on page load */
  autoFocusId?: string;
  /** Called on a genuine canvas resize so drag overrides are cleared and the grid re-aligns */
  onLayoutReset?: () => void;
  /**
   * Fields currently holding an auto-parsed value (node id → engine) —
   * rendered with the yellow proofreading glow until the agent edits them.
   */
  parsedFields?: Record<string, AutoFillSource>;
  /**
   * Optional set of node ids that the user intentionally hid from the
   * canvas via the BOXES toolbar toggle. Hidden nodes are:
   *  • Skipped entirely from layout (no space reserved, no default position
   *    computed, no connection drawn to/from them).
   *  • Still keep their values in formData + localStorage — they just
   *    aren't rendered; the Hang Up note still includes them.
   * If undefined all nodes are treated as visible (default).
   */
  hiddenNodes?: Set<string>;
  /** Hide quick-insert chips while voice transcription is active */
  quickInsertHidden?: boolean;
  /** Per-call customer-name address count (drives Customer Name node glow) */
  customerAddressCount?: number;
  onIncrementCustomerAddressCount?: () => void;
  /** Email-prompt glow for the email address node */
  emailGlow?: 'need' | 'done';
}

// Layout constants (px) — compact spacing
const CANVAS_MARGIN = 16;
/** Vertical clearance above the first flow node so the Customer Info group
 *  box + its title never get clipped by the canvas top edge. */
const GROUP_TOP_PAD = 40;
const ROW_GAP = 32;
/** Extra vertical gap inserted between semantic groups (Customer Info →
 *  Robot & Issue Info) so the two dotted boxes never overlap and read as
 *  distinct zones. */
const GROUP_EXTRA_GAP = 48;
/** Gap between wrapped lines inside one semantic row */
const LINE_GAP = 20;
/** Vertical gap between stacked panels inside the left-side column */
const LEFT_COL_STACK_GAP = 20;
const MIN_COL_GAP = 16;
const MAX_COL_GAP = 28;
const FALLBACK_CONTAINER_WIDTH = 900;
/** Two-column layout only activates when the canvas scroll container is at
 *  LEAST this wide (px total). Below this threshold everything collapses to
 *  the classic single-column responsive grid so the panels never squeeze
 *  into unreadable widths. The 3/7 + 4/7 split evaluated at exactly this
 *  threshold yields ~506 px left / ~688 px right — enough for Transcript
 *  and the START + form grid respectively. */
const WIDE_SCREEN_CANVAS_WIDTH = 1320;
/** Left column ratio out of 7 total parts (3 + 4). Left = 3/7 ≈ 42.9%,
 *  Right = 4/7 ≈ 57.1%, matching the user-specified 3 : 4 ratio. */
const LEFT_COL_RATIO_NUM = 3;
const RIGHT_COL_RATIO_NUM = 4;
const RATIO_DENOM = LEFT_COL_RATIO_NUM + RIGHT_COL_RATIO_NUM; // 7
/** Guard rails so the left column never collapses on a zoomed 4K screen or
 *  blows past a comfortable reading width. Applied after the ratio math. */
const LEFT_COL_MIN_PX = 480;
const LEFT_COL_MAX_PX = 900;
/** Minimum flow-grid width required to consider the layout "wide". When a
 *  tiny window is barely over WIDE_SCREEN_CANVAS_WIDTH but the remaining
 *  right pane is under this threshold, fall back to narrow single-grid. */
const RIGHT_COL_MIN_FLOW_PX = 360;

// Approximate node dimensions for connection point + layout calculations
const NODE_VERTICAL_PADDING = 6; // py-1.5 x2

/**
 * Simulate flex-wrap for the quick-insert chips to estimate how many rows
 * they occupy inside a node (roughly 6px per char at 11px + chip padding).
 */
function estimateChipRows(texts: string[], contentWidth: number): number {
  let rows = 1;
  let line = 0;
  for (const t of texts) {
    const w = t.length * 6 + 20;
    if (line > 0 && line + w > contentWidth) {
      rows += 1;
      line = w;
    } else {
      line += w + 4; // gap-1 between chips
    }
  }
  return rows;
}

function estimateNodeHeight(node: NodeConfig, value: string | string[]): number {
  const base = NODE_VERTICAL_PADDING * 2;
  const width = node.width ?? 240;

  // Grouped quick inserts collapse to a single preview row; the real
  // (expanded) height is measured via ResizeObserver at runtime
  const quickTextBlock = node.quickTextGroups
    ? 24 + 32
    : node.quickTexts
      ? 24 + estimateChipRows([...node.quickTexts, '+'], width - 20) * 32
      : 0;

  if (node.type === 'start' || node.type === 'agent') {
    // up to ~3 lines of text
    return base + 56;
  }
  if (node.type === 'templates') {
    // label + wrapped match chip rows (or the empty-state hint line)
    const matches = node.templateMatches ?? [];
    const chipRows = matches.length > 0 ? estimateChipRows(matches.map((t) => t.name), width - 20) : 1;
    return base + 24 + chipRows * 28;
  }
  if (node.type === 'select') {
    return base + 56; // label + combobox input + padding
  }
  if (node.type === 'hangup') {
    return base + 76; // py-2 x2 + min-h-12 button + slack
  }
  if (node.type === 'transcript') {
    // Label row ~18px + wrapper padding ~28px + header (32px) +
    // level meters (28px) + transcript area min 120px + engine rows (40px)
    return 310;
  }
  if (node.type === 'ticketTracker') {
    // Label row + wrapper padding + header (40) + paste area (88) + ~6 rows
    return 440;
  }
  if (node.type === 'sop') {
    // Label + inner padding + status bar + candidate chips + heading
    // picker + markdown viewer ~460px, then viewer scrolls internally.
    return 460;
  }
  if (node.type === 'productLookup') {
    // Label row + search bar row ~44 + model chips ~34 + tabs ~32 +
    // scrollable tab body ~360 = same footprint as SOP so the left column
    // stays balanced when both panels are stacked.
    return 480;
  }
  if (node.type === 'input') {
    if (node.inputType === 'textarea') {
      // label + textarea rows + quick insert block
      const rows = node.textareaRows ?? 2;
      return base + 44 + rows * 20 + quickTextBlock;
    }
    // label + single-line input (+ quick insert block when present)
    return base + 60 + quickTextBlock;
  }
  if (node.type === 'dynamic-list') {
    const steps = Array.isArray(value) ? value.length : 4;
    return base + 24 + steps * 32 + 32; // label + steps + add button
  }
  return base + 40;
}

/**
 * Compute the default (non-dragged) node layout for a given canvas width.
 * Layout clarity wins over connection-line aesthetics: each semantic row's
 * nodes are greedily packed into lines that fit the available width (like
 * flex-wrap), lines are centered with even column gaps, and every line is
 * spaced by its tallest node so nothing ever overlaps. `heightOf` supplies
 * measured (real) node heights so the layout adjusts dynamically as nodes
 * expand or their content grows.
 */
function computeDefaultLayout(
  nodes: NodeConfig[],
  canvasWidth: number,
  heightOf: (n: NodeConfig) => number,
  hiddenNodes: Set<string> | undefined,
  widthOverrides: Record<string, number>
): Record<string, { x: number; y: number }> {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const positions: Record<string, { x: number; y: number }> = {};

  // -------------------------------------------------------------------------
  // Left column identity — user explicitly requested:
  //   Left  (3/7 width): Transcript | Matching Templates | Product lookup |
  //                      SOP box  | 24H Ticket Tracker
  //   Right (4/7 width): all other flowchart gridboxes + Hang Up button.
  // Ordered top → bottom as they appear stacked under the Live Transcript.
  // (Transcript / Template Matches / Product Lookup / SOP / 24H Ticket
  //  Tracker are NOT here — they're pull-tab bookmark panels rendered in
  //  their own floating layer.)
  // -------------------------------------------------------------------------
  const LEFT_COL_IDS: Array<string> = [];
  const leftColNodesVisible: NodeConfig[] = LEFT_COL_IDS
    .map((id) => (!hiddenNodes?.has(id) ? nodeById.get(id) ?? null : null))
    .filter((n): n is NodeConfig => Boolean(n));

  // isWide is decided by the CALLER (canvas component) and reflected via
  // a non-empty widthOverrides map (left-col entries present = wide mode).
  // Mirrors the isWide boolean to avoid duplicating threshold math.
  const anyLeftColVisible = leftColNodesVisible.length > 0;
  const isWide = anyLeftColVisible &&
    LEFT_COL_IDS.every((id) => Object.prototype.hasOwnProperty.call(widthOverrides, id));

  // Resolve width for node math inside the layout engine.
  const nodeWidth = (n: NodeConfig): number => widthOverrides[n.id] ?? n.width ?? 240;

  let mainAvailLeft = CANVAS_MARGIN;
  const mainMaxRight = canvasWidth - CANVAS_MARGIN;
  if (isWide) {
    const leftColPx = widthOverrides[LEFT_COL_IDS[0]] ?? 700;
    mainAvailLeft = CANVAS_MARGIN + leftColPx + MIN_COL_GAP;
  }
  const flowAvailWidth = Math.max(160, mainMaxRight - mainAvailLeft);

  // 1) WIDE: stack the five reference panels top → bottom in the left col.
  let yCursor = CANVAS_MARGIN + GROUP_TOP_PAD;
  if (isWide) {
    let leftY = CANVAS_MARGIN + GROUP_TOP_PAD;
    for (const n of leftColNodesVisible) {
      positions[n.id] = { x: CANVAS_MARGIN, y: leftY };
      leftY += heightOf(n) + LEFT_COL_STACK_GAP;
    }
    // Main flow y starts level with the left column's top (after the group
    // title clearance pad), regardless of how tall the left column stacks.
    yCursor = CANVAS_MARGIN + GROUP_TOP_PAD;
  }

  const leftColSetWide = isWide ? new Set(LEFT_COL_IDS) : new Set<string>();

  // Map nodeId → group id, so we can detect when a semantic row crosses
  // from one group to the next and insert extra vertical separation.
  const nodeGroupId = new Map<string, string>();
  for (const g of NODE_GROUPS) for (const id of g.nodeIds) nodeGroupId.set(id, g.id);
  const rowGroup = (row: string[]) => {
    for (const id of row) if (nodeGroupId.has(id)) return nodeGroupId.get(id)!;
    return null;
  };

  let y = yCursor;
  let prevGroup: string | null = null;
  for (const row of NODE_LAYOUT_ROWS) {
    const rowNodes = row
      .map((id) => nodeById.get(id))
      .filter((n): n is NodeConfig => Boolean(n))
      // On WIDE screens the left-column panels were already placed.
      .filter((n) => !leftColSetWide.has(n.id))
      .filter((n) => !hiddenNodes?.has(n.id));
    if (rowNodes.length === 0) continue;

    // Insert a large gap when this row starts a NEW semantic group — keeps
    // the two dotted container boxes from overlapping and gives the layout
    // a clear two-zone rhythm.
    const g = rowGroup(row);
    if (g && prevGroup && g !== prevGroup) {
      y += GROUP_EXTRA_GAP;
    }
    prevGroup = g;

    // Greedy packing inside the flow pane's horizontal width.
    const lines: NodeConfig[][] = [];
    let line: NodeConfig[] = [];
    let lineWidth = 0;
    for (const n of rowNodes) {
      const w = nodeWidth(n);
      const gap = line.length === 0 ? 0 : MIN_COL_GAP;
      if (line.length > 0 && lineWidth + gap + w > flowAvailWidth) {
        lines.push(line);
        line = [n];
        lineWidth = w;
      } else {
        line.push(n);
        lineWidth += gap + w;
      }
    }
    if (line.length > 0) lines.push(line);

    for (const lineNodes of lines) {
      const sumWidth = lineNodes.reduce((s, n) => s + nodeWidth(n), 0);
      const gaps = lineNodes.length - 1;
      let colGap = MIN_COL_GAP;
      if (gaps > 0) {
        colGap = Math.min(
          MAX_COL_GAP,
          Math.max(MIN_COL_GAP, (flowAvailWidth - sumWidth) / gaps)
        );
      }
      const totalWidth = sumWidth + colGap * gaps;
      // Center within the FLOW pane, not the full canvas — so on wide
      // screens the START node never collides with the transcript column.
      let x = Math.max(mainAvailLeft, mainAvailLeft + (flowAvailWidth - totalWidth) / 2);
      let lineHeight = 0;
      for (const n of lineNodes) {
        positions[n.id] = { x, y };
        x += nodeWidth(n) + colGap;
        lineHeight = Math.max(lineHeight, heightOf(n));
      }
      y += lineHeight + LINE_GAP;
    }
    y += ROW_GAP - LINE_GAP;
  }
  return positions;
}

/**
 * MEMOIZED: the canvas is the heaviest subtree on the page (every node +
 * the SVG connector layer). Unrelated page-state churn — audio level
 * meters (10×/s while capturing), LLM generation progress, transcript
 * ticks — must not re-render it; only its own props (formData, positions,
 * activeNodeId, parsedFields, nodes, handlers) do.
 */
const FlowchartCanvas = memo(function FlowchartCanvas({
  nodes,
  positions,
  formData,
  onFieldChange,
  activeNodeId,
  onNodeFocus,
  onNodeBlur,
  onPositionChange,
  onHangUp,
  hangUpLoading = false,
  autoFocusId,
  onLayoutReset,
  parsedFields,
  hiddenNodes,
  quickInsertHidden = false,
  customerAddressCount,
  onIncrementCustomerAddressCount,
  emailGlow,
}: FlowchartCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(FALLBACK_CONTAINER_WIDTH);

  // Pull-tab bookmark panels — these float free of the flow layout. Each is
  // collapsed (only its left-edge tab shows) until the agent clicks the tab,
  // at which point the box slides out into the canvas. Transcript defaults
  // open because the agent needs it live during a call.
  const PULL_TAB_PANEL_IDS = useMemo(
    () => [
      NODE_IDS.TRANSCRIPT_PANEL,
      NODE_IDS.TICKET_TRACKER,
      NODE_IDS.TEMPLATE_MATCHES,
      NODE_IDS.PRODUCT_LOOKUP,
      NODE_IDS.SOP_PANEL,
    ],
    []
  );
  const pullTabSet = useMemo(() => new Set<string>(PULL_TAB_PANEL_IDS), [PULL_TAB_PANEL_IDS]);
  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>({
    [NODE_IDS.TRANSCRIPT_PANEL]: false,
    [NODE_IDS.TICKET_TRACKER]: true,
    [NODE_IDS.TEMPLATE_MATCHES]: true,
    [NODE_IDS.PRODUCT_LOOKUP]: true,
    [NODE_IDS.SOP_PANEL]: true,
  });
  const togglePanel = useCallback((id: string) => {
    setCollapsedPanels((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);
  const minimizePanel = useCallback((id: string) => {
    setCollapsedPanels((prev) => ({ ...prev, [id]: true }));
  }, []);
  const pullTabNodes = useMemo(
    () => nodes.filter((n) => pullTabSet.has(n.id)),
    [nodes, pullTabSet]
  );
  const expandedPullTabNodes = useMemo(
    () => pullTabNodes.filter((n) => !collapsedPanels[n.id]),
    [pullTabNodes, collapsedPanels]
  );
  // Real rendered node heights reported by FlowNode ResizeObservers — the
  // layout uses these (falling back to estimates) so space adjusts
  // dynamically when nodes expand/collapse or content grows
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});
  const handleNodeHeightChange = useCallback((id: string, height: number) => {
    setMeasuredHeights((prev) => (prev[id] === height ? prev : { ...prev, [id]: height }));
  }, []);
  const [dragging, setDragging] = useState<{
    id: string;
    startX: number;
    startY: number;
    startPos: { x: number; y: number };
    /** Effective zoom (old-people mode) — mouse deltas are visual px */
    zoom: number;
  } | null>(null);

  // Track the scroll container's width so the default layout adapts to the canvas size
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // On a genuine window resize (after the initial measurement), discard drag
  // overrides so every node glides back to the responsive default layout —
  // stale dragged coordinates from a previous window size never linger
  const prevWidthRef = useRef<number | null>(null);
  const hasOverrides = Object.keys(positions).length > 0;
  useEffect(() => {
    if (prevWidthRef.current === null) {
      // First measurement after mount — not a resize
      prevWidthRef.current = containerWidth;
      return;
    }
    if (prevWidthRef.current === containerWidth) return;
    prevWidthRef.current = containerWidth;
    if (!dragging && hasOverrides) {
      onLayoutReset?.();
    }
  }, [containerWidth, dragging, hasOverrides, onLayoutReset]);

  // -------------------------------------------------------------------------
  // Compute the 3 : 4 ratio wide-layout decision ONCE and share it across
  // layout math + rendered node widths. Left column gets 3/7 of usable
  // space (clamped to [LEFT_COL_MIN_PX, LEFT_COL_MAX_PX]); right column
  // gets everything else. When wide layout is active, widthOverrides
  // forces every LEFT_COL_ID node to render at the exact uniform column
  // width (fulfilling "match all left boxes to the max column width").
  // -------------------------------------------------------------------------
  const LEFT_COL_IDS_WIDE: Array<string> = [];
  const totalInset = CANVAS_MARGIN * 2 + MIN_COL_GAP;
  const usableWidth = Math.max(0, containerWidth - totalInset);
  const leftColumnWidthPxRaw = (usableWidth * LEFT_COL_RATIO_NUM) / RATIO_DENOM;
  const leftColumnWidthPx = Math.max(
    LEFT_COL_MIN_PX,
    Math.min(LEFT_COL_MAX_PX, Math.round(leftColumnWidthPxRaw))
  );
  const flowPaneCandidateLeft = CANVAS_MARGIN + leftColumnWidthPx + MIN_COL_GAP;
  const anyLeftColVisible = LEFT_COL_IDS_WIDE.some((id) => !hiddenNodes?.has(id) && nodes.some((n) => n.id === id));
  const isWideLayout = Boolean(
    anyLeftColVisible &&
      containerWidth >= WIDE_SCREEN_CANVAS_WIDTH &&
      containerWidth - flowPaneCandidateLeft - CANVAS_MARGIN >= RIGHT_COL_MIN_FLOW_PX
  );
  const widthOverrides: Record<string, number> = useMemo(() => {
    if (!isWideLayout) return {};
    const out: Record<string, number> = {};
    for (const id of LEFT_COL_IDS_WIDE) out[id] = leftColumnWidthPx;
    return out;
  }, [isWideLayout, leftColumnWidthPx]);

  // Clamp node widths to the available canvas width so the default layout
  // always fits — the horizontal scrollbar never appears (dragged nodes
  // still extend the canvas on purpose). When a node has a layout-wide
  // override, the OVERRIDE is the effective width (the layout engine is
  // responsible for sizing it to still-fit within its column).
  //
  // Per-row uniform width: every node in a semantic row shares that row's
  // widest natural width so the grid looks balanced (no ragged right edges
  // inside a group). Left-column panels are excluded.
  const effectiveNodes = useMemo(() => {
    const avail = Math.max(140, containerWidth - CANVAS_MARGIN * 2);
    const clamped = nodes
      // Pull-tab panels are rendered in their own floating layer, never in
      // the main flow grid.
      .filter((n) => !hiddenNodes?.has(n.id) && !pullTabSet.has(n.id))
      .map((n) => {
        const rawW = widthOverrides[n.id] ?? n.width ?? 240;
        const clampedMax = isWideLayout && LEFT_COL_IDS_WIDE.includes(n.id)
          ? Math.max(LEFT_COL_MIN_PX, containerWidth - CANVAS_MARGIN)
          : avail;
        const w = Math.min(rawW, clampedMax);
        return w !== n.width ? { ...n, width: w } : n;
      });
    // Build id -> node lookup for the uniform-width pass
    const byId = new Map(clamped.map((n) => [n.id, n]));
    const leftColSet = isWideLayout ? new Set(LEFT_COL_IDS_WIDE) : new Set<string>();
    const uniformById = new Map<string, number>();
    for (const row of NODE_LAYOUT_ROWS) {
      const rowNodes = row
        .map((id) => byId.get(id))
        .filter((n): n is NodeConfig => Boolean(n))
        .filter((n) => !leftColSet.has(n.id));
      if (rowNodes.length < 2) continue;
      const rowMax = Math.max(...rowNodes.map((n) => n.width ?? 240));
      for (const n of rowNodes) uniformById.set(n.id, rowMax);
    }
    if (uniformById.size === 0) return clamped;
    return clamped.map((n) => {
      const u = uniformById.get(n.id);
      return u && u !== n.width ? { ...n, width: u } : n;
    });
  }, [nodes, containerWidth, hiddenNodes, widthOverrides, isWideLayout]);

  // Measured height with estimate fallback
  const heightOf = useCallback(
    (n: NodeConfig) => measuredHeights[n.id] ?? estimateNodeHeight(n, formData[n.id] ?? ''),
    [measuredHeights, formData]
  );

  // Responsive default layout; stored positions (user drags) take precedence
  const defaultLayout = useMemo(
    () => computeDefaultLayout(effectiveNodes, containerWidth, heightOf, hiddenNodes, widthOverrides),
    [effectiveNodes, containerWidth, heightOf, hiddenNodes, widthOverrides]
  );

  const effectivePositions = useMemo(() => {
    const out: Record<string, { x: number; y: number }> = {};

    // Sanitize user-saved drag overrides: PRODUCT_LOOKUP and SOP_PANEL are
    // both 760px wide ~460px tall. Older sessions may have overlapping
    // positions after the layout swap above; auto-clear overrides for only
    // these two ids when they visibly overlap. Any other user drags are
    // preserved untouched.
    const SOP = NODE_IDS.SOP_PANEL;
    const PROD = NODE_IDS.PRODUCT_LOOKUP;
    const sopW = effectiveNodes.find((n) => n.id === SOP)?.width ?? 760;
    const prodW = effectiveNodes.find((n) => n.id === PROD)?.width ?? 760;
    const sopH = effectiveNodes.find((n) => n.id === SOP) ? heightOf(effectiveNodes.find((n) => n.id === SOP)!) : 460;
    const prodH = effectiveNodes.find((n) => n.id === PROD) ? heightOf(effectiveNodes.find((n) => n.id === PROD)!) : 460;
    const sopPos = positions[SOP];
    const prodPos = positions[PROD];
    let clearPositions = false;
    if (sopPos && prodPos) {
      // Axis-aligned bounding box intersection test (with 10px tolerance for
      // accidental small offsets).
      const overlapX = !(sopPos.x + sopW <= prodPos.x + 10 || prodPos.x + prodW <= sopPos.x + 10);
      const overlapY = !(sopPos.y + sopH <= prodPos.y + 10 || prodPos.y + prodH <= sopPos.y + 10);
      clearPositions = overlapX && overlapY;
    }
    const overrides = clearPositions
      ? Object.fromEntries(Object.entries(positions).filter(([id]) => id !== SOP && id !== PROD))
      : positions;

    for (const n of effectiveNodes) {
      out[n.id] = overrides[n.id] ?? defaultLayout[n.id] ?? { x: CANVAS_MARGIN, y: CANVAS_MARGIN };
    }
    return out;
  }, [effectiveNodes, positions, defaultLayout]);

  // Canvas extent grows to fit dragged nodes — no right/bottom drag limit
  const canvasWidth = useMemo(() => {
    let w = containerWidth;
    for (const n of effectiveNodes) {
      const p = effectivePositions[n.id];
      if (p) w = Math.max(w, p.x + n.width + 80);
    }
    return w;
  }, [effectiveNodes, effectivePositions, containerWidth]);

  const canvasHeight = useMemo(() => {
    let h = 400;
    for (const n of effectiveNodes) {
      const p = effectivePositions[n.id];
      if (p) h = Math.max(h, p.y + heightOf(n) + 80);
    }
    // Also make room for expanded pull-tab panels stacked at top-left so
    // they're never clipped by the canvas bottom.
    if (expandedPullTabNodes.length > 0) {
      const gap = 16;
      let total = 16; // top-4 offset
      for (const n of expandedPullTabNodes) {
        total += (measuredHeights[n.id] ?? heightOf(n)) + gap;
      }
      h = Math.max(h, total + 40);
    }
    return h;
  }, [effectiveNodes, effectivePositions, heightOf, expandedPullTabNodes, measuredHeights]);

  const handleDragStart = useCallback(
    (id: string, e: ReactMouseEvent) => {
      const pos = effectivePositions[id];
      if (!pos) return;
      // Delta-based drag: robust regardless of canvas scroll position.
      // gBCR (visual px) / offsetWidth (layout px) = effective body zoom.
      const el = canvasRef.current;
      const zoom = el ? el.getBoundingClientRect().width / el.offsetWidth || 1 : 1;
      setDragging({
        id,
        startX: e.clientX,
        startY: e.clientY,
        startPos: pos,
        zoom,
      });
    },
    [effectivePositions]
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      // No upper clamp on x/y — the canvas expands as nodes are dragged.
      // Mouse deltas are in visual px; divide by zoom to get layout px.
      const newX = Math.max(0, dragging.startPos.x + (e.clientX - dragging.startX) / dragging.zoom);
      const newY = Math.max(0, dragging.startPos.y + (e.clientY - dragging.startY) / dragging.zoom);
      onPositionChange(dragging.id, { x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, onPositionChange]);

  // Scroll active node into view
  useEffect(() => {
    if (!activeNodeId || !canvasRef.current) return;
    const pos = effectivePositions[activeNodeId];
    if (!pos) return;

    const activeNode = effectiveNodes.find((n) => n.id === activeNodeId);
    const nodeHeight = activeNode ? heightOf(activeNode) : 80;

    const canvas = canvasRef.current;
    const nodeTop = pos.y;
    const nodeBottom = pos.y + nodeHeight;
    const viewTop = canvas.scrollTop;
    const viewBottom = canvas.scrollTop + canvas.clientHeight;

    if (nodeTop < viewTop + 60) {
      canvas.scrollTo({ top: Math.max(0, nodeTop - 60), behavior: 'smooth' });
    } else if (nodeBottom > viewBottom - 60) {
      canvas.scrollTo({ top: nodeBottom - canvas.clientHeight + 60, behavior: 'smooth' });
    }
  }, [activeNodeId, effectivePositions, effectiveNodes, heightOf]);

  // Generate SVG connection paths
  const renderConnections = () => {
    return NODE_CONNECTIONS.map((conn, idx) => {
      // A connection is drawn only when BOTH endpoints are currently
      // visible. If either node was hidden from the canvas via the BOXES
      // toggle we simply skip the line — nothing "hangs in mid-air".
      if (hiddenNodes?.has(conn.from) || hiddenNodes?.has(conn.to)) return null;
      const fromPos = effectivePositions[conn.from];
      const toPos = effectivePositions[conn.to];
      const fromNode = effectiveNodes.find((n) => n.id === conn.from);
      const toNode = effectiveNodes.find((n) => n.id === conn.to);
      if (!fromPos || !toPos || !fromNode || !toNode) return null;

      const fromHeight = heightOf(fromNode);
      const toHeight = heightOf(toNode);
      // effectiveNodes already carries layout-wide overrides, so .width is
      // safe to read directly (no per-node fallback needed here).
      const fromWidth = fromNode.width;
      const toWidth = toNode.width;

      // Start: bottom-center of from node
      const x1 = fromPos.x + fromWidth / 2;
      const y1 = fromPos.y + fromHeight;

      // End: top-center of to node
      const x2 = toPos.x + toWidth / 2;
      const y2 = toPos.y;

      // Bezier control points
      const dy = Math.max(40, (y2 - y1) / 2);
      const path = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;

      const isActive = activeNodeId === conn.to || activeNodeId === conn.from;

      return (
        <path
          key={idx}
          d={path}
          fill="none"
          stroke={isActive ? 'var(--primary)' : 'var(--border)'}
          strokeWidth={isActive ? 2 : 1.5}
          strokeDasharray={isActive ? 'none' : '4 4'}
          className="transition-all duration-300"
          opacity={isActive ? 0.9 : 0.55}
        />
      );
    });
  };

  return (
    <div
      ref={canvasRef}
      className="custom-scrollbar relative h-full w-full overflow-auto bg-[radial-gradient(circle_at_1px_1px,color-mix(in_oklab,var(--foreground)_9%,transparent)_1px,transparent_0)] [background-size:24px_24px]"
    >
      <div
        className="relative"
        style={{ width: canvasWidth, height: canvasHeight }}
      >
        {/* SVG connector layer: intentionally EMPTY.

          Connection lines (Bezier curves between nodes) have been removed per
          user request to declutter the canvas. The `defs > #glow` block is kept
          so future re-enabling only requires adding the render call back.
          NODE_CONNECTIONS and renderConnections() function itself are kept
          intact in this file for reference / easy rollback. */}
        <svg
          className="pointer-events-none absolute inset-0"
          width={canvasWidth}
          height={canvasHeight}
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Group container rectangles — sparse dotted outlines that chunk
              the flow into Customer Info and Robot & Issue Info. Both groups
              share one common width (the widest natural group) so they line
              up cleanly; the title sits inside the top-left, dim, in
              Bahnschrift. */}
          {(() => {
            // Pass 1: natural bounding box per group
            const boxes = NODE_GROUPS.map((group) => {
              const visibleNodes = group.nodeIds
                .filter((id) => !hiddenNodes?.has(id))
                .map((id) => ({ id, pos: effectivePositions[id], node: effectiveNodes.find((n) => n.id === id) }))
                .filter((x) => x.pos && x.node);
              if (visibleNodes.length < 2) return null;
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              for (const { pos, node } of visibleNodes) {
                minX = Math.min(minX, pos.x);
                minY = Math.min(minY, pos.y);
                maxX = Math.max(maxX, pos.x + node.width);
                maxY = Math.max(maxY, pos.y + heightOf(node));
              }
              return { group, minX, minY, maxX, maxY };
            }).filter((b): b is NonNullable<typeof b> => b !== null);
            if (boxes.length === 0) return null;
            // Common width = the widest natural group, so all boxes align.
            const commonWidth = Math.max(...boxes.map((b) => b.maxX - b.minX));
            const padX = 18;
            const padTop = 30;   // room for the in-box title
            const padBottom = 18;
            const borderColor = 'color-mix(in oklab, var(--border) 55%, transparent)';
            // Sparse dots: tiny dash, long gap
            const dashArray = '1 10';
            return boxes.map(({ group, minX, minY, maxX, maxY }) => {
              // Center each box on the common width (anchored at the group's
              // own left edge so rows still line up with their content).
              const naturalW = maxX - minX;
              const extra = (commonWidth - naturalW) / 2;
              const bx = minX - padX - extra;
              const by = minY - padTop;
              const bw = commonWidth + padX * 2;
              const bh = maxY - minY + padTop + padBottom;
              const title = group.title;
              return (
                <g key={group.id} className="transition-all duration-300">
                  <rect
                    x={bx}
                    y={by}
                    width={bw}
                    height={bh}
                    rx={12}
                    ry={12}
                    fill="none"
                    stroke={borderColor}
                    strokeWidth={2}
                    strokeDasharray={dashArray}
                    strokeLinecap="round"
                  />
                  {/* Title — inside the box, top-left, very dim, Bahnschrift */}
                  <text
                    x={bx + 16}
                    y={by + 20}
                    fontSize={11}
                    fontWeight={400}
                    fontFamily="Bahnschrift, 'Segoe UI', system-ui, sans-serif"
                    fill="var(--muted-foreground)"
                    fillOpacity={0.45}
                    style={{ letterSpacing: '0.12em', textTransform: 'uppercase' }}
                  >
                    {title}
                  </text>
                </g>
              );
            });
          })()}
        </svg>

        {/* Nodes layer */}
        {effectiveNodes.map((node) => (
          <FlowNode
            key={node.id}
            id={node.id}
            type={node.type}
            label={node.label}
            text={node.text}
            value={formData[node.id] ?? (node.type === 'dynamic-list' ? [] : '')}
            onChange={(val, discrete) => {
              if (node.type === 'hangup') {
                onHangUp();
              } else {
                onFieldChange(node.id, val, discrete);
              }
            }}
            onFocus={onNodeFocus}
            onBlur={onNodeBlur}
            isActive={activeNodeId === node.id}
            position={effectivePositions[node.id] ?? { x: CANVAS_MARGIN, y: CANVAS_MARGIN }}
            // Chips-bearing boxes sit above neighbours; the node being
            // dragged floats above everything
            zIndex={
              dragging?.id === node.id
                ? 50
                : node.type === 'templates' || node.quickTexts
                  ? 10
                  : undefined
            }
            onDragStart={handleDragStart}
            onHeightChange={handleNodeHeightChange}
            options={node.options}
            accent={node.accent}
            inputType={node.inputType}
            width={node.width}
            textareaRows={node.textareaRows}
            autoFocus={node.id === autoFocusId}
            icon={node.icon}
            quickTexts={node.quickTexts}
            quickTextGroups={node.quickTextGroups}
            customQuickTexts={node.customQuickTexts}
            onAddQuickText={node.onAddQuickText}
            onRemoveQuickText={node.onRemoveQuickText}
            templateMatches={node.templateMatches}
            onOpenTemplate={node.onOpenTemplate}
            parsedSource={parsedFields?.[node.id] ?? null}
            enablePinBubble={node.pinFromValue}
            panelContent={node.panelContent}
            hangUpLoading={node.type === 'hangup' ? hangUpLoading : undefined}
            quickInsertHidden={quickInsertHidden}
            addressCount={node.id === NODE_IDS.CUSTOMER_NAME ? customerAddressCount : undefined}
            onIncrementAddressCount={node.id === NODE_IDS.CUSTOMER_NAME ? onIncrementCustomerAddressCount : undefined}
            emailGlow={node.id === NODE_IDS.EMAIL_ADDRESS ? emailGlow : undefined}
          />
        ))}

        {/* Pull-tab bookmark layer — Transcript / Template Matches /
            Product Lookup / SOP live here as free-floating panels. A
            vertical stack of tabs sticks out from the left edge; clicking
            one slides its panel out into the canvas. */}
        <div
          className="sticky left-0 top-4 z-40 flex flex-col gap-1.5"
          style={{ width: 0 }}
        >
          {pullTabNodes.map((node) => {
            const isCollapsed = collapsedPanels[node.id] ?? true;
            const Icon = node.icon;
            // Short label for the tab — take the first word or up to 6 chars
            const shortLabel = (node.label ?? '')
              .split(/[\s·]/)[0]
              .slice(0, 7);
            return (
              <button
                key={`tab-${node.id}`}
                type="button"
                onClick={() => togglePanel(node.id)}
                title={node.label}
                className={cn(
                  'group relative flex h-16 w-12 flex-col items-center justify-center gap-1 rounded-r-xl border border-l-0 transition-all duration-200',
                  'glass-panel',
                  isCollapsed
                    ? 'hover:translate-x-1'
                    : 'border-accent/50 bg-accent/10 shadow-[0_0_12px_color-mix(in_oklab,var(--accent)_30%,transparent)]'
                )}
              >
                {Icon && <Icon className="size-4 text-accent" />}
                <span className="text-[8px] font-semibold uppercase leading-tight tracking-tight text-muted-foreground">
                  {shortLabel}
                </span>
                {!isCollapsed && (
                  <span className="absolute right-1 top-1 size-1.5 rounded-full bg-accent" />
                )}
              </button>
            );
          })}
        </div>

        {/* Expanded pull-tab panels — stacked vertically to the right of the
            tabs. Each FlowNode is position:absolute, so we compute a running
            top offset from the previous panel's measured (or estimated)
            height + a gap — they never overlap. */}
        {expandedPullTabNodes.length > 0 && (
          <div className="absolute left-[52px] top-4 z-30">
            {(() => {
              const gap = 16;
              let cursorY = 0;
              return expandedPullTabNodes.map((node) => {
                const panelWidth = node.width ?? 380;
                const panelHeight =
                  measuredHeights[node.id] ?? heightOf(node);
                const top = cursorY;
                cursorY += panelHeight + gap;
                return (
                  <div
                    key={`pull-${node.id}`}
                    className="pull-panel-slide"
                    style={{ width: panelWidth }}
                  >
                    <FlowNode
                      id={node.id}
                      type={node.type}
                      label={node.label}
                      text={node.text}
                      value={formData[node.id] ?? (node.type === 'dynamic-list' ? [] : '')}
                      onChange={(val, discrete) => onFieldChange(node.id, val, discrete)}
                      onFocus={onNodeFocus}
                      onBlur={onNodeBlur}
                      isActive={activeNodeId === node.id}
                      position={{ x: 0, y: top }}
                      zIndex={30}
                      onDragStart={handleDragStart}
                      onHeightChange={handleNodeHeightChange}
                      options={node.options}
                      accent={node.accent}
                      inputType={node.inputType}
                      width={panelWidth}
                      textareaRows={node.textareaRows}
                      autoFocus={false}
                      icon={node.icon}
                      quickTexts={node.quickTexts}
                      quickTextGroups={node.quickTextGroups}
                      customQuickTexts={node.customQuickTexts}
                      onAddQuickText={node.onAddQuickText}
                      onRemoveQuickText={node.onRemoveQuickText}
                      templateMatches={node.templateMatches}
                      onOpenTemplate={node.onOpenTemplate}
                      parsedSource={parsedFields?.[node.id] ?? null}
                      enablePinBubble={node.pinFromValue}
                      panelContent={node.panelContent}
                      hangUpLoading={undefined}
                      quickInsertHidden={quickInsertHidden}
                      onMinimize={() => minimizePanel(node.id)}
                    />
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
    </div>
  );
});

export default FlowchartCanvas;
