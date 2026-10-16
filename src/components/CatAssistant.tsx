import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { CatThought } from '@/hooks/use-cat-assistant';
import { useScopedState } from '@/hooks/use-scoped-state';
import type { CatPetSnapshot } from '@/hooks/use-cat-pet';
import { getCatSprite, getCatSleepSprite, getCatEatingSprite, CAT_EAT_EVENT, type CatId } from '@/lib/cat-sprites';

/**
 * Draggable pixel cat with occasional sprite animation and thought bubbles.
 * Doubles as the pet avatar: nap state, growth scale and pet-to-pet
 * interactions come from the companion snapshot (`pet` prop).
 */
const DEFAULT_POSITION = { x: 16, y: 24 };
const SPRITE_SIZE = 128;
/** Pointer movement (px) before a press becomes a drag — under this it's a
 *  click-to-pet, so affection and dragging coexist on the same gesture. */
const DRAG_THRESHOLD = 6;

function clampPosition(position: { x: number; y: number }, size = SPRITE_SIZE) {
  const maxX = Math.max(0, window.innerWidth - size);
  const maxY = Math.max(0, window.innerHeight - size);
  const x = Number.isFinite(position.x) ? position.x : DEFAULT_POSITION.x;
  const y = Number.isFinite(position.y) ? position.y : DEFAULT_POSITION.y;
  return {
    x: Math.round(Math.max(0, Math.min(x, maxX))),
    y: Math.round(Math.max(0, Math.min(y, maxY))),
  };
}

interface CatAssistantProps {
  catId: CatId;
  currentThought: CatThought | null;
  isCapturing: boolean;
  isThinking: boolean;
  onDismiss: () => void;
  moveRequest?: { id: number; x: number; y: number } | null;
  /** Double-click the cat → run the Kitty Help routine (persistent cloud
   *  LLM conversation: fill notes → pick sources → write resolution). */
  onKittyHelp?: () => void;
  /** Live stage of the Kitty Help routine — rendered as a persistent
   *  violet bubble above the cat while non-null. */
  kittyStage?: { label: string; detail?: string } | null;
  /** Companion-system snapshot (null when the pet model hasn't booted). */
  pet?: CatPetSnapshot | null;
  /** Pet the cat (+Mood) — short click / Enter / Space. */
  onPet?: () => void;
  /** True while the pet-action cooldown is running (dims the paw cursor). */
  petCooldown?: boolean;
  className?: string;
}

export function CatAssistant({
  catId,
  currentThought,
  isCapturing,
  isThinking,
  onDismiss,
  moveRequest,
  onKittyHelp,
  kittyStage,
  pet,
  onPet,
  petCooldown,
  className,
}: CatAssistantProps) {
  const petScale = pet?.scale ?? 1;
  const napping = pet?.napping ?? false;
  const [position, setPosition] = useScopedState(
    '__app_ecovacs_cat_position',
    DEFAULT_POSITION
  );
  const [dragging, setDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  /** One-shot eating animation triggered by a spice-store cat-food purchase. */
  const [isEating, setIsEating] = useState(false);
  const isEatingRef = useRef(false);
  /** Napping rig: 'sleep' plays the falling-asleep sheet forwards (holds the
   *  asleep frame via fill-mode), 'wake' plays it in reverse. 'sleep' stays
   *  applied the whole nap so the held frame doesn't snap back to standing. */
  const [sleepMode, setSleepMode] = useState<'sleep' | 'wake' | null>(null);
  const nappingPrevRef = useRef(napping);
  /** Sheets confirmed loaded by the browser. The sleep animation must never
   *  start over an uncached sheet — the 3.6s playback would run while the
   *  image is still downloading and the first visible paint would be the
   *  held last frame (the "nap jumps straight to sleep" bug). */
  const loadedSheetsRef = useRef<Set<string>>(new Set());
  const [, setLoadedSheetsTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    for (const url of [getCatSprite(catId), getCatSleepSprite(catId)]) {
      if (loadedSheetsRef.current.has(url)) continue;
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        loadedSheetsRef.current.add(url);
        setLoadedSheetsTick((t) => t + 1);
      };
      img.src = url;
    }
    return () => {
      cancelled = true;
    };
  }, [catId]);
  useEffect(() => {
    if (napping === nappingPrevRef.current) return;
    nappingPrevRef.current = napping;
    if (!napping) {
      // Waking: the sleep sheet is guaranteed cached (it was on display).
      setSleepMode('wake');
      return;
    }
    const sleepUrl = getCatSleepSprite(catId);
    if (loadedSheetsRef.current.has(sleepUrl)) {
      setSleepMode('sleep');
      return;
    }
    // Sheet not cached yet — keep the idle pose until it loads, then play.
    // nappingStateRef guards the stale-load race: if the cat was woken while
    // the sheet was still downloading, the late onload must not start the nap.
    const img = new Image();
    img.onload = () => {
      loadedSheetsRef.current.add(sleepUrl);
      if (nappingStateRef.current) setSleepMode('sleep');
    };
    img.src = sleepUrl;
  }, [napping, catId]);
  const catName = `${catId.slice(0, 1).toUpperCase()}${catId.slice(1)}`;

  const dragOffset = useRef({ x: 0, y: 0 });
  /** True while the primary pointer is physically down on the sprite. */
  const pointerDownRef = useRef(false);
  /** True once the active pointer gesture passed the drag threshold. */
  const gestureDragRef = useRef(false);
  const pressStartRef = useRef({ x: 0, y: 0 });
  /** Brief pet-reaction flash (+Mood). */
  const [pettedAt, setPettedAt] = useState(0);
  /** Napping mirror in a ref so the idle-animation timer sees fresh value. */
  const nappingStateRef = useRef(napping);
  nappingStateRef.current = napping;
  const sleepModeRef = useRef(sleepMode);
  sleepModeRef.current = sleepMode;
  const spriteRef = useRef<HTMLSpanElement>(null);
  const visiblePosition = clampPosition(position, SPRITE_SIZE * petScale);

  useLayoutEffect(() => {
    const size = SPRITE_SIZE * petScale;
    const keepPositionInViewport = () => setPosition((previous) => clampPosition(previous, size));
    keepPositionInViewport();
    window.addEventListener('resize', keepPositionInViewport);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', keepPositionInViewport);
    viewport?.addEventListener('scroll', keepPositionInViewport);
    return () => {
      window.removeEventListener('resize', keepPositionInViewport);
      viewport?.removeEventListener('resize', keepPositionInViewport);
      viewport?.removeEventListener('scroll', keepPositionInViewport);
    };
  }, [setPosition, petScale]);

  useEffect(() => {
    if (!moveRequest) return;
    setPosition(clampPosition({ x: moveRequest.x, y: moveRequest.y }));
  }, [moveRequest, setPosition]);

  useEffect(() => {
    // A "Fancy Feast" purchase makes the cat eat (event from StorePanel).
    const handleEat = () => {
      isEatingRef.current = true;
      setIsAnimating(false);
      setIsEating(true);
    };
    window.addEventListener(CAT_EAT_EVENT, handleEat);
    return () => window.removeEventListener(CAT_EAT_EVENT, handleEat);
  }, []);

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timeoutId: number | undefined;
    let cancelled = false;

    const scheduleAnimation = () => {
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
      if (cancelled || motionPreference.matches) return;

      timeoutId = window.setTimeout(() => {
        // Napping cats don't fidget — the Zzz bubble carries the moment.
        if (!cancelled && !motionPreference.matches && !nappingStateRef.current) setIsAnimating(true);
      }, 2000 + Math.random() * 28000);
    };

    const handleAnimationEnd = () => {
      if (isEatingRef.current) {
        // Meal finished → back to the idle pose and the random schedule.
        isEatingRef.current = false;
        setIsEating(false);
      }
      if (sleepModeRef.current === 'wake') {
        // Reverse playback finished — back to the standing idle pose.
        setSleepMode(null);
      }
      // 'sleep' ends holding the asleep frame (forwards fill) — keep it.
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
      pointerDownRef.current = true;
      gestureDragRef.current = false;
      pressStartRef.current = { x: e.clientX, y: e.clientY };
      dragOffset.current = {
        x: e.clientX - visiblePosition.x,
        y: e.clientY - visiblePosition.y,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture may be unavailable after a browser cancellation.
      }
    },
    [visiblePosition.x, visiblePosition.y]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Ignore hover moves entirely — only a pressed pointer can drag.
      if (!pointerDownRef.current) return;
      // Drag only after the gesture passes the movement threshold — a short
      // press stays a click-to-pet, so drag / pet / Kitty Help coexist.
      if (!gestureDragRef.current) {
        const dx = e.clientX - pressStartRef.current.x;
        const dy = e.clientY - pressStartRef.current.y;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        gestureDragRef.current = true;
        setDragging(true);
      }
      const x = e.clientX - dragOffset.current.x;
      const y = e.clientY - dragOffset.current.y;
      setPosition(clampPosition({ x, y }, SPRITE_SIZE * petScale));
    },
    [petScale, setPosition]
  );

  const onPointerUp = useCallback(() => {
    pointerDownRef.current = false;
    if (!gestureDragRef.current) {
      // Short press → pet the cat (heart pop clears itself after 900ms).
      const at = Date.now();
      setPettedAt(at);
      window.setTimeout(() => setPettedAt((v) => (v === at ? 0 : v)), 900);
      onPet?.();
    }
    gestureDragRef.current = false;
    setDragging(false);
  }, [onPet]);

  const onPetKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setPettedAt(Date.now());
        onPet?.();
      }
    },
    [onPet]
  );

  return (
    <div
      className={cn('pointer-events-none fixed z-50 select-none', className)}
      style={{
        left: visiblePosition.x,
        top: visiblePosition.y,
        transition: dragging ? undefined : 'left 550ms cubic-bezier(0.2, 0.8, 0.2, 1), top 550ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
    >
      {/* Kitty Help stage bubble — persistent while the routine runs. */}
      {kittyStage && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2">
          <div className="glass-panel relative rounded-2xl border border-violet-400/70 bg-violet-500/10 px-3.5 py-2.5 shadow-[0_0_18px_rgba(167,139,250,0.45)]">
            <p className="flex items-center gap-2 text-sm font-medium leading-snug text-foreground">
              <span className="inline-block size-2 shrink-0 animate-pulse rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.9)]" />
              {kittyStage.label}
            </p>
            {kittyStage.detail && (
              <p className="mt-1 pl-4 text-[11px] leading-snug text-muted-foreground">{kittyStage.detail}</p>
            )}
            <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-violet-400/70 bg-violet-500/10 backdrop-blur-md" />
          </div>
        </div>
      )}

      {/* Thought bubble — anchored above the sprite */}
      {currentThought && !kittyStage && (
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
        onDoubleClick={() => {
          if (!dragging) onKittyHelp?.();
        }}
        onKeyDown={onPetKey}
        role="button"
        tabIndex={0}
        aria-label={`${catName} cat assistant${napping ? ', napping' : ''}${isThinking ? ', thinking' : ''}${isCapturing ? ', listening' : ''} — drag to move, click or press Enter to pet, double-click for Kitty Help`}
        className={cn(
          'pointer-events-auto relative flex h-32 w-32 touch-none overscroll-contain cursor-grab items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-2xl',
          dragging && 'cursor-grabbing',
          petCooldown && 'cursor-default'
        )}
        onLostPointerCapture={onPointerUp}
      >
        <span
          ref={spriteRef}
          aria-hidden="true"
          className={cn(
            'cat-sprite-frame h-32 w-32 drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] transition-[filter,transform] duration-300',
            isEating ? 'cat-sprite-eat' : sleepMode === 'sleep' ? 'cat-sprite-sleep' : sleepMode === 'wake' ? 'cat-sprite-wake' : isAnimating && 'cat-sprite-animate',
            napping && 'brightness-[0.8] saturate-[0.85]'
          )}
          style={{
            backgroundImage: `url("${isEating ? getCatEatingSprite(catId) : sleepMode ? getCatSleepSprite(catId) : getCatSprite(catId)}")`,
            transform: `scale(${petScale.toFixed(3)})`,
          }}
        />

        {/* Napping overlay — Zzz drifts up while the sprite dozes. */}
        {napping && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-1.5 top-0.5 animate-bounce font-mono text-sm font-bold text-sky-300/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
          >
            Zzz
          </span>
        )}
        {/* Pet reaction — a brief heart pop above the sprite. */}
        {Date.now() - pettedAt < 900 && (
          <span
            key={pettedAt}
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 animate-bounce text-base drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
          >
            💗
          </span>
        )}

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
