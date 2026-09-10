import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { CatThought } from '@/hooks/use-cat-assistant';
import { useScopedState } from '@/hooks/use-scoped-state';

/**
 * Cat Assistant sprite — a draggable cat that sits on the workspace and
 * pops up thought bubbles (tips / advice / idle musings).
 *
 * Visual model:
 *  - The sprite is a 64px image at bottom-right by default, draggable
 *    anywhere on the viewport. Position is persisted to localStorage.
 *  - A thought bubble renders above the sprite when `currentThought` is set.
 *  - States: idle (gentle bob), listening (ear twitch + dot pulse while
 *    call is active), thinking (spin while an advice request is in flight).
 *
 * Asset:
 *  - `spriteSrc` defaults to '/assets/cat-sprite.png'. Drop the real asset
 *    there and it renders. Until then we fall back to an emoji cat so the
 *    component is visible and testable with zero setup.
 */

const DEFAULT_POSITION = { x: 24, y: 24 };
const SPRITE_SIZE = 64;

interface CatAssistantProps {
  currentThought: CatThought | null;
  isCapturing: boolean;
  isThinking: boolean;
  onDismiss: () => void;
  spriteSrc?: string;
  className?: string;
}

export function CatAssistant({
  currentThought,
  isCapturing,
  isThinking,
  onDismiss,
  spriteSrc = '/assets/cat-sprite.png',
  className,
}: CatAssistantProps) {
  const [position, setPosition] = useScopedState(
    '__app_ecovacs_cat_position',
    DEFAULT_POSITION
  );
  const [imgError, setImgError] = useState(false);
  const [dragging, setDragging] = useState(false);

  const dragOffset = useRef({ x: 0, y: 0 });
  const movedRef = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only respond to left / primary button
      if (e.button !== 0) return;
      e.preventDefault();
      setDragging(true);
      movedRef.current = false;
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
      movedRef.current = true;
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

  // Reset img error if the source changes
  useEffect(() => {
    setImgError(false);
  }, [spriteSrc]);

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
        role="img"
        aria-label="Cat assistant — drag to move"
        className={cn(
          'pointer-events-auto relative flex h-16 w-16 cursor-grab items-center justify-center rounded-full',
          dragging && 'cursor-grabbing',
          'animate-cat-bob'
        )}
      >
        {showEmojiFallback ? (
          <span className="text-4xl" aria-hidden>
            🐱
          </span>
        ) : (
          <img
            src={spriteSrc}
            alt="Cat assistant"
            draggable={false}
            onError={() => setImgError(true)}
            className="h-full w-full object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
          />
        )}

        {/* Listening indicator — pulsing dot while a call is live */}
        {isCapturing && !isThinking && (
          <span className="absolute right-0 top-0 h-3 w-3 rounded-full bg-primary shadow-[0_0_8px_var(--primary)] animate-pulse" />
        )}

        {/* Thinking indicator — small spinner while fetching advice */}
        {isThinking && (
          <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        )}
      </div>
    </div>
  );
}

export default CatAssistant;
