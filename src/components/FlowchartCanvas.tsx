import { useRef, useState, useCallback, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import FlowNode, { type NodeType } from './FlowNode';
import { NODE_CONNECTIONS, DEFAULT_NODE_POSITIONS } from '@/data/ticket';
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
  icon?: LucideIcon;
  quickTexts?: string[];
  customQuickTexts?: string[];
  onAddQuickText?: (text: string) => void;
  onRemoveQuickText?: (text: string) => void;
}

interface FlowchartCanvasProps {
  nodes: NodeConfig[];
  positions: Record<string, { x: number; y: number }>;
  formData: Record<string, string | string[]>;
  onFieldChange: (id: string, value: string | string[]) => void;
  activeNodeId: string | null;
  onNodeFocus: (id: string) => void;
  onNodeBlur: () => void;
  onPositionChange: (id: string, pos: { x: number; y: number }) => void;
  onHangUp: () => void;
}

// Approximate node dimensions for connection point calculation
const NODE_HEADER_HEIGHT = 16; // compact drag handle
const NODE_VERTICAL_PADDING = 8;

function estimateNodeHeight(node: NodeConfig, value: string | string[]): number {
  const base = NODE_HEADER_HEIGHT + NODE_VERTICAL_PADDING * 2;

  // Quick insert chips wrap ~2 per row at a 200-240px node width
  // (+1 accounts for the add-chip button)
  const quickTextRows = node.quickTexts
    ? Math.ceil((node.quickTexts.length + 1) / 2)
    : 0;
  const quickTextBlock = node.quickTexts ? 30 + quickTextRows * 32 : 0;

  if (node.type === 'start' || node.type === 'agent') {
    // ~2 lines of text
    return base + 44;
  }
  if (node.type === 'select') {
    return base + 60; // label + combobox input + padding
  }
  if (node.type === 'hangup') {
    return base + 60;
  }
  if (node.type === 'input') {
    if (node.inputType === 'textarea') {
      // label + 2-row textarea + quick insert block
      return base + 84 + quickTextBlock;
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
}: FlowchartCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // Calculate canvas size based on node positions
  const canvasWidth = 680;
  const canvasHeight = 1600;

  const handleDragStart = useCallback(
    (id: string, e: ReactMouseEvent) => {
      const pos = positions[id];
      if (!pos) return;
      setDragging({
        id,
        offsetX: e.clientX - pos.x,
        offsetY: e.clientY - pos.y,
      });
    },
    [positions]
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = Math.max(0, Math.min(canvasWidth - 200, e.clientX - dragging.offsetX));
      const newY = Math.max(0, Math.min(canvasHeight - 80, e.clientY - dragging.offsetY));
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
    const pos = positions[activeNodeId];
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
  }, [activeNodeId, positions, nodes, formData]);

  // Generate SVG connection paths
  const renderConnections = () => {
    return NODE_CONNECTIONS.map((conn, idx) => {
      const fromPos = positions[conn.from];
      const toPos = positions[conn.to];
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
            position={positions[node.id] ?? DEFAULT_NODE_POSITIONS[node.id] ?? { x: 100, y: 100 }}
            onDragStart={handleDragStart}
            options={node.options}
            accent={node.accent}
            inputType={node.inputType}
            width={node.width}
            icon={node.icon}
            quickTexts={node.quickTexts}
            customQuickTexts={node.customQuickTexts}
            onAddQuickText={node.onAddQuickText}
            onRemoveQuickText={node.onRemoveQuickText}
          />
        ))}
      </div>
    </div>
  );
}
