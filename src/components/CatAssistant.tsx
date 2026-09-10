import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { CatThought } from '@/hooks/use-cat-assistant';
import { useScopedState } from '@/hooks/use-scoped-state';

/**
 * Cat Assistant sprite — a draggable cat that sits on the workspace and
 * pops up thought bubbles (tips / advice / idle musings).
 *
 * Visual model:
 *  - The sprite is a 128px pixel-art cat at top-left by default, draggable
 *    anywhere on the viewport. Position is persisted to localStorage.
 *  - Six states (resting / standby / side / thinking / alert / dragged),
 *    each with 3 variant frames (128×128 alpha-transparent PNGs in
 *    /assets/cat/). One variant is picked at random on every state change,
 *    so the same cat appears in a slightly different moment of that pose.
 *    No frame cycling within a state; the state change itself (pop
 *    animation) is the only movement.
 *  - A thought bubble renders above the sprite when `currentThought` is set.
 *  - After 20s of inactivity the cat dozes into "resting"; a click wakes it.
 *
 * State mapping (priority order):
 *  - dragged   → pointer is down and the cat is being moved
 *  - thinking  → LLM advice request in flight
 *  - alert     → live call capture running (ears perked, listening)
 *  - side      → showing a thought bubble (glancing sideways at the agent)
 *  - resting   → dozed off after 20s idle
 *  - standby   → idle default (sitting, calm)
 */

const DEFAULT_POSITION = { x: 24, y: 24 };
const SPRITE_SIZE = 128;

/** Sprite states. Each has 3 variant frames (128×128 alpha-transparent PNGs
 *  in /assets/cat/); one is picked at random on every state change so the cat
 *  looks like the same animal in a slightly different moment of that pose. */
type CatState = 'resting' | 'standby' | 'side' | 'thinking' | 'alert' | 'dragged';

const CAT_FRAMES: Record<CatState, string[]> = {
  resting: [1, 2, 3].map((n) => `/assets/cat/resting-${n}.png`),
  standby: [1, 2, 3].map((n) => `/assets/cat/standby-${n}.png`),
  side: [1, 2, 3].map((n) => `/assets/cat/side-${n}.png`),
  thinking: [1, 2, 3].map((n) => `/assets/cat/thinking-${n}.png`),
  alert: [1, 2, 3].map((n) => `/assets/cat/alert-${n}.png`),
  dragged: [1, 2, 3].map((n) => `/assets/cat/dragged-${n}.png`),
};

/** How long the cat waits before dozing off into "resting" (ms). */
const RESTING_DELAY_MS = 20_000;

interface CatAssistantProps {
  currentThought: CatThought | null;
  isCapturing: boolean;
  isThinking: boolean;
  onDismiss: () => void;
  className?: string;
}

export function CatAssistant({
  currentThought,
  isCapturing,
  isThinking,
  onDismiss,
  className,
}: CatAssistantProps) {
  const [position, setPosition] = useScopedState(
    '__app_ecovacs_cat_position',
    DEFAULT_POSITION
  );
  const [imgError, setImgError] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Current sprite state, derived from call / thought / LLM activity.
  // After RESTING_DELAY_MS of total inactivity the cat dozes off into
  // "resting"; clicking the cat wakes it back up.
  const [dozing, setDozing] = useState(false);
  useEffect(() => {
    if (isCapturing || currentThought || isThinking || dragging) {
      setDozing(false);
      return;
    }
    const id = window.setTimeout(() => setDozing(true), RESTING_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [isCapturing, currentThought, isThinking, dragging]);

  // State priority: dragged (being moved) > thinking (LLM working) >
  // alert (live call) > side (thought bubble showing) > resting (dozed
  // off) > standby (idle default).
  const state: CatState = dragging
    ? 'dragged'
    : isThinking
      ? 'thinking'
      : isCapturing
        ? 'alert'
        : currentThought
          ? 'side'
          : dozing
            ? 'resting'
            : 'standby';

  // Pick a random variant frame for the new state. The effect keys on
  // `state` so it only re-rolls when the state actually changes, not on
  // every render — the cat keeps the same pose while it stays put.
  const [frameIndex, setFrameIndex] = useState(0);
  useEffect(() => {
    setFrameIndex(Math.floor(Math.random() * CAT_FRAMES[state].length));
  }, [state]);

  // `key={state}` remounts the img on every state change so the pop
  // animation replays — that swap is the sprite's only animation.
  const spriteSrc = CAT_FRAMES[state][frameIndex];

  // Wake the cat from resting when clicked (only matters when dozing;
  // other states already reset the timer).
  const wakeUp = useCallback(() => {
    if (dozing) setDozing(false);
  }, [dozing]);

  const dragOffset = useRef({ x: 0, y: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only respond to left / primary button
      if (e.button !== 0) return;
      e.preventDefault();
      setDragging(true);
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [position]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const x = e.clientX - dragOffset.current.x;
      const y = e.clientY - dragOffset.current.y;
      // Clamp so the sprite stays on screen
      const maxX = window.innerWidth - SPRITE_SIZE;
      const maxY = window.innerHeight - SPRITE_SIZE;
      setPosition({
        x: Math.max(0, Math.min(x, maxX)),
        y: Math.max(0, Math.min(y, maxY)),
      });
    },
    [dragging, setPosition]
  );

  const onPointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  // Emoji fallback only if the frames are missing entirely. Never resets
  // per frame — a cycling src must not retrigger a failed load every 450ms.
  const showEmojiFallback = imgError;

  return (
    <div
      className={cn('pointer-events-none fixed z-50 select-none', className)}
      style={{ left: position.x, top: position.y }}
    >
      {/* Thought bubble — anchored above the sprite */}
      {currentThought && (
        <div className="pointer-events-auto absolute bottom-full left-1/2 mb-2 w-64 -translate-x-1/2">
          <div className="glass-panel relative rounded-2xl border border-border/70 px-3.5 py-2.5 text-sm leading-snug text-foreground shadow-lg">
            {/* Close button */}
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss cat thought"
              className="absolute right-1.5 top-1 text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              ×
            </button>
            <p className="pr-4">{currentThought.text}</p>
            {/* Bubble tail */}
            <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-border/70 bg-card/90 backdrop-blur-md" />
          </div>
        </div>
      )}

      {/* Sprite */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={wakeUp}
        role="img"
        aria-label="Cat assistant — drag to move, click to wake"
        className={cn(
          'pointer-events-auto relative flex h-32 w-32 cursor-grab items-center justify-center',
          dragging && 'cursor-grabbing'
        )}
      >
        {showEmojiFallback ? (
          <span className="text-4xl" aria-hidden>
            🐱
          </span>
        ) : (
          <img
            key={state}
            src={spriteSrc}
            alt={`Cat assistant (${state})`}
            draggable={false}
            onError={() => setImgError(true)}
            style={{ imageRendering: 'pixelated' }}
            className="h-full w-full object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] animate-cat-pop"
          />
        )}

        {/* Listening indicator — pulsing dot while a call is live.
            (thinking state is conveyed by the sprite frames themselves) */}
        {isCapturing && !isThinking && (
          <span className="absolute right-0 top-0 h-3 w-3 rounded-full bg-primary shadow-[0_0_8px_var(--primary)] animate-pulse" />
        )}
      </div>
    </div>
  );
}

export default CatAssistant;
