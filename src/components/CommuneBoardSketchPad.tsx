import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CommuneBannerStroke } from '@/lib/auth-client';

const SKETCH_COLORS = ['#403428', '#bc6850', '#6a9bcc', '#788c5d', '#d6a646'] as const;
const MAX_STROKES = 8;
const MAX_POINTS = 48;

interface CommuneBoardSketchPadProps {
  strokes: CommuneBannerStroke[];
  onChange: (strokes: CommuneBannerStroke[]) => void;
}

interface CommuneBoardSketchPreviewProps {
  strokes: CommuneBannerStroke[];
  className?: string;
  onPointerDown?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerCancel?: (event: ReactPointerEvent<SVGSVGElement>) => void;
}

export function CommuneBoardSketchPreview({
  strokes,
  className = '',
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: CommuneBoardSketchPreviewProps) {
  return (
    <svg
      viewBox="0 0 320 140"
      preserveAspectRatio="none"
      role="application"
      aria-label="Whiteboard sketch"
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <rect width="320" height="140" fill="#fff4d9" />
      <path
        d="M0 35H320 M0 70H320 M0 105H320 M40 0V140 M80 0V140 M120 0V140 M160 0V140 M200 0V140 M240 0V140 M280 0V140"
        stroke="#e5d9bf"
        strokeWidth="1"
      />
      {strokes.map((stroke, index) => {
        const points = stroke.points.map((point) => `${point.x * 320},${point.y * 140}`).join(' ');
        const first = stroke.points[0];
        if (!first) return null;
        return stroke.points.length === 1 ? (
          <circle
            key={`${index}-${stroke.color}`}
            cx={first.x * 320}
            cy={first.y * 140}
            r="3"
            fill={stroke.color}
          />
        ) : (
          <polyline
            key={`${index}-${stroke.color}`}
            points={points}
            fill="none"
            stroke={stroke.color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}

export default function CommuneBoardSketchPad({ strokes, onChange }: CommuneBoardSketchPadProps) {
  const [color, setColor] = useState<string>(SKETCH_COLORS[0]);
  const [liveStroke, setLiveStroke] = useState<CommuneBannerStroke | null>(null);
  const liveStrokeRef = useRef<CommuneBannerStroke | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  const pointAt = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };

  const startStroke = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (strokes.length >= MAX_STROKES || boundsMissing(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerIdRef.current = event.pointerId;
    const stroke = { color, points: [pointAt(event)] };
    liveStrokeRef.current = stroke;
    setLiveStroke(stroke);
  };

  const continueStroke = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const current = liveStrokeRef.current;
    if (!current || pointerIdRef.current !== event.pointerId || current.points.length >= MAX_POINTS) return;
    const next = pointAt(event);
    const previous = current.points[current.points.length - 1];
    if (previous && Math.hypot((next.x - previous.x) * 320, (next.y - previous.y) * 140) < 3) return;
    const updated = { ...current, points: [...current.points, next] };
    liveStrokeRef.current = updated;
    setLiveStroke(updated);
  };

  const finishStroke = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (pointerIdRef.current !== event.pointerId) return;
    const completed = liveStrokeRef.current;
    if (completed?.points.length) onChange([...strokes, completed].slice(0, MAX_STROKES));
    liveStrokeRef.current = null;
    pointerIdRef.current = null;
    setLiveStroke(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const canDraw = strokes.length < MAX_STROKES;
  const visibleStrokes = liveStroke ? [...strokes, liveStroke] : strokes;

  return (
    <div className="border-2 border-[#92734c] bg-[#dcc399] p-2 shadow-[2px_2px_0_rgba(51,39,25,0.28)]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[9px] font-black uppercase tracking-wider text-[#705335]">
          Whiteboard · {strokes.length}/{MAX_STROKES} strokes
        </span>
        <div className="flex items-center gap-1.5">
          {SKETCH_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`Select sketch color ${swatch}`}
              aria-pressed={color === swatch}
              onClick={() => setColor(swatch)}
              className={`size-5 border-2 ${color === swatch ? 'border-[#3c3021] ring-1 ring-[#3c3021]' : 'border-[#8c704d]'}`}
              style={{ backgroundColor: swatch }}
            />
          ))}
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={!strokes.length}
            className="border border-[#92734c] bg-[#fff4d9] px-2 py-1 font-mono text-[9px] font-bold uppercase text-[#5c472e] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Clear
          </button>
        </div>
      </div>
      <CommuneBoardSketchPreview
        strokes={visibleStrokes}
        className={`block h-28 w-full border-2 border-[#8b6a44] touch-none ${canDraw ? 'cursor-crosshair' : 'cursor-not-allowed opacity-80'}`}
        onPointerDown={startStroke}
        onPointerMove={continueStroke}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
      />
      <p className="mt-1 font-mono text-[8px] text-[#785e3e]">
        {canDraw ? 'Drag to sketch · up to 48 points per stroke' : 'Clear the board to draw more'}
      </p>
    </div>
  );
}

function boundsMissing(event: ReactPointerEvent<SVGSVGElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return bounds.width <= 0 || bounds.height <= 0;
}
