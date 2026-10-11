import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { CatThought } from '@/hooks/use-cat-assistant';
import { useScopedState } from '@/hooks/use-scoped-state';
import { getCatSprite, type CatId } from '@/lib/cat-sprites';

/**
 * Draggable pixel cat with occasional sprite animation and thought bubbles.
 */
const DEFAULT_POSITION = { x: 16, y: 24 };
const SPRITE_SIZE = 128;

function clampPosition(position: { x: number; y: number }) {
  return {
    x: Math.max(0, Math.min(position.x, window.innerWidth - SPRITE_SIZE)),
    y: Math.max(0, Math.min(position.y, window.innerHeight - SPRITE_SIZE)),
  };
}

interface CatAssistantProps {
  catId: CatId;
  currentThought: CatThought | null;
  isCapturing: boolean;
  isThinking: boolean;
  onDismiss: () => void;
  moveRequest?: { id: number; x: number; y: number } | null;
  className?: string;
}

export function CatAssistant({
  catId,
  currentThought,
  isCapturing,
  isThinking,
  onDismiss,
  moveRequest,
  className,
}: CatAssistantProps) {
  const [position, setPosition] = useScopedState(
    '__app_ecovacs_cat_position',
    DEFAULT_POSITION
  );
  const [dragging, setDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const catName = `${catId.slice(0, 1).toUpperCase()}${catId.slice(1)}`;

  const dragOffset = useRef({ x: 0, y: 0 });
  const spriteRef = useRef<HTMLSpanElement>(null);
  const visiblePosition = clampPosition(position);

  useEffect(() => {
    const keepPositionInViewport = () => setPosition((previous) => clampPosition(previous));
    keepPositionInViewport();
    window.addEventListener('resize', keepPositionInViewport);
    return () => window.removeEventListener('resize', keepPositionInViewport);
  }, [setPosition]);

  useEffect(() => {
    if (!moveRequest) return;
    setPosition(clampPosition({ x: moveRequest.x, y: moveRequest.y }));
  }, [moveRequest, setPosition]);

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timeoutId: number | undefined;
    let cancelled = false;

    const scheduleAnimation = () => {
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
      if (cancelled || motionPreference.matches) return;

      timeoutId = window.setTimeout(() => {
        timeoutId = undefined;
        if (!cancelled && !motionPreference.matches) setIsAnimating(true);
      }, 2000 + Math.random() * 28000);
    };

    const handleAnimationEnd = () => {
      setIsAnimating(false);
      scheduleAnimation();
    };

    const handleMotionPreferenceChange = () => {
      if (motionPreference.matches) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
        setIsAnimating(false);
      } else {
        scheduleAnimation();
      }
    };

    scheduleAnimation();
    const sprite = spriteRef.current;
    sprite?.addEventListener('animationend', handleAnimationEnd);
    motionPreference.addEventListener('change', handleMotionPreferenceChange);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      sprite?.removeEventListener('animationend', handleAnimationEnd);
      motionPreference.removeEventListener('change', handleMotionPreferenceChange);
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only respond to left / primary button
      if (e.button !== 0) return;
      e.preventDefault();
      setDragging(true);
      dragOffset.current = {
        x: e.clientX - visiblePosition.x,
        y: e.clientY - visiblePosition.y,
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [visiblePosition.x, visiblePosition.y]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const x = e.clientX - dragOffset.current.x;
      const y = e.clientY - dragOffset.current.y;
      setPosition(clampPosition({ x, y }));
    },
    [dragging, setPosition]
  );

  const onPointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  return (
    <div
      className={cn('pointer-events-none fixed z-50 select-none', className)}
      style={{
        left: visiblePosition.x,
        top: visiblePosition.y,
        transition: dragging ? undefined : 'left 550ms cubic-bezier(0.2, 0.8, 0.2, 1), top 550ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
    >
      {/* Thought bubble — anchored above the sprite */}
      {currentThought && (
        <div className="pointer-events-auto absolute bottom-full left-1/2 mb-2 w-64 -translate-x-1/2">
          <div
            className={cn(
              'glass-panel relative rounded-2xl border px-3.5 py-2.5 text-sm leading-snug shadow-lg',
              currentThought.kind === 'alert'
                ? 'border-amber-500/80 bg-amber-500/10 text-amber-50 shadow-[0_0_18px_rgba(245,158,11,0.55)] animate-cat-alert-glow'
                : 'border-border/70 text-foreground'
            )}
          >
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
            <span
              className={cn(
                'absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r backdrop-blur-md',
                currentThought.kind === 'alert'
                  ? 'border-amber-500/80 bg-amber-500/10'
                  : 'border-border/70 bg-card/90'
              )}
            />
          </div>
        </div>
      )}

      {/* Rest on frame zero, with occasional one-shot animation. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label={`${catName} cat assistant${isThinking ? ', thinking' : ''}${isCapturing ? ', listening' : ''} — drag to move`}
        className={cn(
          'pointer-events-auto relative flex h-32 w-32 cursor-grab items-center justify-center',
          dragging && 'cursor-grabbing'
        )}
      >
        <span
          ref={spriteRef}
          aria-hidden="true"
          className={cn(
            'cat-sprite-frame h-32 w-32 drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]',
            isAnimating && 'cat-sprite-animate'
          )}
          style={{ backgroundImage: `url("${getCatSprite(catId)}")` }}
        />

        {/* Keep call and generation activity legible without swapping poses. */}
        {isCapturing && !isThinking && (
          <span className="absolute right-0 top-0 h-3 w-3 rounded-full bg-primary shadow-[0_0_8px_var(--primary)] animate-pulse" />
        )}
        {isThinking && (
          <span className="absolute right-0 top-0 h-3 w-3 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)] animate-pulse" />
        )}
      </div>
    </div>
  );
}

export default CatAssistant;
