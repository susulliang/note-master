import { memo, useRef, useState, useCallback, useEffect, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import FlowNode, { type NodeType, type QuickTextGroup } from './FlowNode';
import { NODE_CONNECTIONS, NODE_LAYOUT_ROWS } from '@/data/ticket';
import type { TemplateEntry } from '@/lib/amr-templates';
import type { AutoFillSource } from '@/lib/field-extraction';

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
  /** Node whose input receives focus on page load */
  autoFocusId?: string;
  /** Called on a genuine canvas resize so drag overrides are cleared and the grid re-aligns */
  onLayoutReset?: () => void;
  /**
   * Fields currently holding an auto-parsed value (node id → engine) —
   * rendered with the yellow proofreading glow until the agent edits them.
   */
  parsedFields?: Record<string, AutoFillSource>;
}

// Layout constants (px) — compact spacing
const CANVAS_MARGIN = 16;
const ROW_GAP = 32;
/** Gap between wrapped lines inside one semantic row */
const LINE_GAP = 20;
const MIN_COL_GAP = 16;
const MAX_COL_GAP = 28;
const FALLBACK_CONTAINER_WIDTH = 900;

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
    // Transcript panel: drag handle (18px + border) + header (32px) +
    // level meters (28px) + transcript area min 120px + engine rows (40px)
    // + extracted fields padding → ~260px plus the 20px handle buffer.
    return 300;
  }
  if (node.type === 'ticketTracker') {
    // Drag handle ~20px + header (40) + paste area (88) + ~6 table rows
    // (216) + footer (48) → ~412, rounded up for breathing room.
    return 420;
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
  heightOf: (n: NodeConfig) => number
): Record<string, { x: number; y: number }> {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const positions: Record<string, { x: number; y: number }> = {};
  const availWidth = canvasWidth - CANVAS_MARGIN * 2;

  let y = CANVAS_MARGIN;
  for (const row of NODE_LAYOUT_ROWS) {
    const rowNodes = row
      .map((id) => nodeById.get(id))
      .filter((n): n is NodeConfig => Boolean(n));
    if (rowNodes.length === 0) continue;

    // Greedy packing: fill each line with as many nodes as fit
    const lines: NodeConfig[][] = [];
    let line: NodeConfig[] = [];
    let lineWidth = 0;
    for (const n of rowNodes) {
      const w = n.width ?? 240;
      const gap = line.length === 0 ? 0 : MIN_COL_GAP;
      if (line.length > 0 && lineWidth + gap + w > availWidth) {
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
      const sumWidth = lineNodes.reduce((s, n) => s + (n.width ?? 240), 0);
      const gaps = lineNodes.length - 1;
      let colGap = MIN_COL_GAP;
      if (gaps > 0) {
        colGap = Math.min(
          MAX_COL_GAP,
          Math.max(MIN_COL_GAP, (availWidth - sumWidth) / gaps)
        );
      }
      const totalWidth = sumWidth + colGap * gaps;
      let x = Math.max(CANVAS_MARGIN, (canvasWidth - totalWidth) / 2);
      let lineHeight = 0;
      for (const n of lineNodes) {
        positions[n.id] = { x, y };
        x += (n.width ?? 240) + colGap;
        lineHeight = Math.max(lineHeight, heightOf(n));
      }
      y += lineHeight + LINE_GAP;
    }
    // Extra breathing room between semantic rows
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
  autoFocusId,
  onLayoutReset,
  parsedFields,
}: FlowchartCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(FALLBACK_CONTAINER_WIDTH);
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

  // Clamp node widths to the available canvas width so the default layout
  // always fits — the horizontal scrollbar never appears (dragged nodes
  // still extend the canvas on purpose)
  const effectiveNodes = useMemo(() => {
    const avail = Math.max(140, containerWidth - CANVAS_MARGIN * 2);
    return nodes.map((n) => {
      const w = n.width ?? 240;
      return w > avail ? { ...n, width: Math.floor(avail) } : n;
    });
  }, [nodes, containerWidth]);

  // Measured height with estimate fallback
  const heightOf = useCallback(
    (n: NodeConfig) => measuredHeights[n.id] ?? estimateNodeHeight(n, formData[n.id] ?? ''),
    [measuredHeights, formData]
  );

  // Responsive default layout; stored positions (user drags) take precedence
  const defaultLayout = useMemo(
    () => computeDefaultLayout(effectiveNodes, containerWidth, heightOf),
    [effectiveNodes, containerWidth, heightOf]
  );

  const effectivePositions = useMemo(() => {
    const out: Record<string, { x: number; y: number }> = {};
    for (const n of effectiveNodes) {
      out[n.id] = positions[n.id] ?? defaultLayout[n.id] ?? { x: CANVAS_MARGIN, y: CANVAS_MARGIN };
    }
    return out;
  }, [effectiveNodes, positions, defaultLayout]);

  // Canvas extent grows to fit dragged nodes — no right/bottom drag limit
  const canvasWidth = useMemo(() => {
    let w = containerWidth;
    for (const n of effectiveNodes) {
      const p = effectivePositions[n.id];
      if (p) w = Math.max(w, p.x + (n.width ?? 240) + 80);
    }
    return w;
  }, [effectiveNodes, effectivePositions, containerWidth]);

  const canvasHeight = useMemo(() => {
    let h = 400;
    for (const n of effectiveNodes) {
      const p = effectivePositions[n.id];
      if (p) h = Math.max(h, p.y + heightOf(n) + 80);
    }
    return h;
  }, [effectiveNodes, effectivePositions, heightOf]);

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
      const fromPos = effectivePositions[conn.from];
      const toPos = effectivePositions[conn.to];
      const fromNode = effectiveNodes.find((n) => n.id === conn.from);
      const toNode = effectiveNodes.find((n) => n.id === conn.to);
      if (!fromPos || !toPos || !fromNode || !toNode) return null;

      const fromHeight = heightOf(fromNode);
      const toHeight = heightOf(toNode);
      const fromWidth = fromNode.width ?? 280;
      const toWidth = toNode.width ?? 280;

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
        {/* SVG layer for connections */}
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
          {renderConnections()}
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
          />
        ))}
      </div>
    </div>
  );
});

export default FlowchartCanvas;
