import { useRef, useState, useCallback, useEffect, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import FlowNode, { type NodeType, type QuickTextGroup } from './FlowNode';
import { NODE_CONNECTIONS, NODE_LAYOUT_ROWS } from '@/data/ticket';

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
}

interface FlowchartCanvasProps {
  nodes: NodeConfig[];
  /** Per-node position overrides (nodes the user dragged); missing ids use the responsive default layout */
  positions: Record<string, { x: number; y: number }>;
  formData: Record<string, string | string[]>;
  onFieldChange: (id: string, value: string | string[]) => void;
  activeNodeId: string | null;
  onNodeFocus: (id: string) => void;
  onNodeBlur: () => void;
  onPositionChange: (id: string, pos: { x: number; y: number }) => void;
  onHangUp: () => void;
  /** Node whose input receives focus on page load */
  autoFocusId?: string;
}

// Layout constants (px)
const CANVAS_MARGIN = 24;
const ROW_GAP = 56;
const MIN_COL_GAP = 24;
const MAX_COL_GAP = 48;
const FALLBACK_CONTAINER_WIDTH = 900;

// Approximate node dimensions for connection point + layout calculations
const NODE_HEADER_HEIGHT = 16; // compact drag handle
const NODE_VERTICAL_PADDING = 8;

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
  const base = NODE_HEADER_HEIGHT + NODE_VERTICAL_PADDING * 2;
  const width = node.width ?? 240;

  // Grouped quick inserts collapse to a single preview row — the full list
  // lives in a hover overlay that doesn't affect node layout
  const quickTextBlock = node.quickTextGroups
    ? 78
    : node.quickTexts
      ? 30 + estimateChipRows([...node.quickTexts, '+'], width - 24) * 32
      : 0;

  if (node.type === 'start' || node.type === 'agent') {
    // up to ~3 lines of text
    return base + 64;
  }
  if (node.type === 'select') {
    return base + 60; // label + combobox input + padding
  }
  if (node.type === 'hangup') {
    return base + 84; // py-3 x2 + min-h-12 button + slack
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
 * Rows are spaced by their tallest node so nothing overlaps. Each multi-node
 * row is decided independently: it spreads side by side when it fits the
 * canvas and stacks vertically otherwise.
 */
function computeDefaultLayout(
  nodes: NodeConfig[],
  canvasWidth: number
): Record<string, { x: number; y: number }> {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const positions: Record<string, { x: number; y: number }> = {};

  let y = CANVAS_MARGIN;
  for (const row of NODE_LAYOUT_ROWS) {
    const rowNodes = row
      .map((id) => nodeById.get(id))
      .filter((n): n is NodeConfig => Boolean(n));
    if (rowNodes.length === 0) continue;

    const sumWidth = rowNodes.reduce((s, n) => s + (n.width ?? 240), 0);
    const gaps = rowNodes.length - 1;
    const rowFits =
      rowNodes.length === 1 ||
      canvasWidth >= sumWidth + gaps * MIN_COL_GAP + CANVAS_MARGIN * 2;

    if (rowFits) {
      let colGap = MIN_COL_GAP;
      if (gaps > 0) {
        colGap = Math.min(
          MAX_COL_GAP,
          Math.max(MIN_COL_GAP, (canvasWidth - CANVAS_MARGIN * 2 - sumWidth) / gaps)
        );
      }
      const totalWidth = sumWidth + colGap * gaps;
      let x = Math.max(CANVAS_MARGIN, (canvasWidth - totalWidth) / 2);
      for (const n of rowNodes) {
        positions[n.id] = { x, y };
        x += (n.width ?? 240) + colGap;
      }
      const rowHeight = Math.max(...rowNodes.map((n) => estimateNodeHeight(n, '')));
      y += rowHeight + ROW_GAP;
    } else {
      // Too narrow for this row: stack its nodes vertically
      for (const n of rowNodes) {
        positions[n.id] = {
          x: Math.max(CANVAS_MARGIN, (canvasWidth - (n.width ?? 240)) / 2),
          y,
        };
        y += estimateNodeHeight(n, '') + MIN_COL_GAP;
      }
      y += ROW_GAP - MIN_COL_GAP;
    }
  }
  return positions;
}

export default function FlowchartCanvas({
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
}: FlowchartCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(FALLBACK_CONTAINER_WIDTH);
  const [dragging, setDragging] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
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

  // Responsive default layout; stored positions (user drags) take precedence
  const defaultLayout = useMemo(
    () => computeDefaultLayout(nodes, containerWidth),
    [nodes, containerWidth]
  );

  const effectivePositions = useMemo(() => {
    const out: Record<string, { x: number; y: number }> = {};
    for (const n of nodes) {
      out[n.id] = positions[n.id] ?? defaultLayout[n.id] ?? { x: CANVAS_MARGIN, y: CANVAS_MARGIN };
    }
    return out;
  }, [nodes, positions, defaultLayout]);

  // Canvas extent grows to fit dragged nodes — no right/bottom drag limit
  const canvasWidth = useMemo(() => {
    let w = containerWidth;
    for (const n of nodes) {
      const p = effectivePositions[n.id];
      if (p) w = Math.max(w, p.x + (n.width ?? 240) + 80);
    }
    return w;
  }, [nodes, effectivePositions, containerWidth]);

  const canvasHeight = useMemo(() => {
    let h = 400;
    for (const n of nodes) {
      const p = effectivePositions[n.id];
      if (p) h = Math.max(h, p.y + estimateNodeHeight(n, formData[n.id] ?? '') + 80);
    }
    return h;
  }, [nodes, effectivePositions, formData]);

  const handleDragStart = useCallback(
    (id: string, e: ReactMouseEvent) => {
      const pos = effectivePositions[id];
      if (!pos) return;
      setDragging({
        id,
        offsetX: e.clientX - pos.x,
        offsetY: e.clientY - pos.y,
      });
    },
    [effectivePositions]
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      // No upper clamp on x/y — the canvas expands as nodes are dragged
      const newX = Math.max(0, e.clientX - dragging.offsetX);
      const newY = Math.max(0, e.clientY - dragging.offsetY);
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

    const activeNode = nodes.find((n) => n.id === activeNodeId);
    const nodeHeight = activeNode
      ? estimateNodeHeight(activeNode, formData[activeNodeId] ?? '')
      : 80;

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
  }, [activeNodeId, effectivePositions, nodes, formData]);

  // Generate SVG connection paths
  const renderConnections = () => {
    return NODE_CONNECTIONS.map((conn, idx) => {
      const fromPos = effectivePositions[conn.from];
      const toPos = effectivePositions[conn.to];
      const fromNode = nodes.find((n) => n.id === conn.from);
      const toNode = nodes.find((n) => n.id === conn.to);
      if (!fromPos || !toPos || !fromNode || !toNode) return null;

      const fromHeight = estimateNodeHeight(fromNode, formData[conn.from] ?? '');
      const toHeight = estimateNodeHeight(toNode, formData[conn.to] ?? '');
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
        {nodes.map((node) => (
          <FlowNode
            key={node.id}
            id={node.id}
            type={node.type}
            label={node.label}
            text={node.text}
            value={formData[node.id] ?? (node.type === 'dynamic-list' ? [] : '')}
            onChange={(val) => {
              if (node.type === 'hangup') {
                onHangUp();
              } else {
                onFieldChange(node.id, val);
              }
            }}
            onFocus={onNodeFocus}
            onBlur={onNodeBlur}
            isActive={activeNodeId === node.id}
            position={effectivePositions[node.id] ?? { x: CANVAS_MARGIN, y: CANVAS_MARGIN }}
            onDragStart={handleDragStart}
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
          />
        ))}
      </div>
    </div>
  );
}
