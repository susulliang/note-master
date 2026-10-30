/**
 * CatDesktopOverlay — the cat as a free-floating desktop sprite (the
 * "digital pet" mode). Rendered inside a dedicated frameless transparent
 * always-on-top Tauri window (`cat-overlay`, see set_cat_overlay in
 * src-tauri/src/lib.rs), NOT inside the workspace.
 *
 * Behaviors (tier 1):
 *  - mirrors the workspace cat's identity + nap state via `cat-desktop:sync`
 *  - click-through everywhere except the sprite itself
 *    (setIgnoreMouseEvents toggled by a pointer hit-test)
 *  - short click  → pet reaction (heart + meow) and notifies the main app
 *    so the shared pet model awards Mood/XP
 *  - double-click → focus the main window and open the Ask Kitty spotlight
 *  - drag         → native window drag; the resting position is reported
 *    back (debounced) so the main app persists it
 *  - right-click  → in-window context menu (Open App / Ask Kitty / Go to
 *    Commune / Go to collab space / Settings / Quit App)
 *  - notification mirror — the app pushes banner notices here as thoughts
 *  - toggled on/off from the app's Settings (Desktop Cat switch) — no
 *    in-window chrome, the sprite floats free
 *
 * Cross-platform: uses only plain Tauri window/webview APIs (no NSPanel
 * glue), so the same code runs on macOS and Windows.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { cursorPosition, getCurrentWindow } from '@tauri-apps/api/window';
import { AppWindow, Cat as CatIcon, MessagesSquare, Power, Settings2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getCatSprite,
  getCatSleepSprite,
  normalizeCatId,
  type CatId,
} from '@/lib/cat-sprites';
import {
  CAT_DESKTOP_EVENTS,
  type CatDesktopNavigateView,
  type CatDesktopSyncPayload,
} from '@/lib/cat-desktop';
import { isTauriEnv } from '@/lib/tauri-env';

const SPRITE_SIZE = 128;
const MEOWS = ['Purr~', 'Meow!', 'Mrrp?', ':3', 'Zzz… not'];
const DRAG_THRESHOLD = 6;
/** Overlay window is 220×264 logical px — clamp the context menu inside it. */
const WINDOW_W = 220;
const WINDOW_H = 264;
const MENU_W = 196;
const MENU_H = 186;

export default function CatDesktopOverlay() {
  /** Tauri shell? Outside it (plain browser preview) every window/webview
   *  API would throw — the sprite still renders, interactions just no-op. */
  const [isTauri] = useState(isTauriEnv);
  const [catId, setCatId] = useState<CatId>('hunao');
  const [napping, setNapping] = useState(false);
  const [scale, setScale] = useState(1);
  const [sleepMode, setSleepMode] = useState<'sleep' | 'wake' | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [pettedAt, setPettedAt] = useState(0);
  const [meow, setMeow] = useState<string | null>(null);
  /** Banner-notification mirror (main → overlay `cat-desktop:thought`). */
  const [thought, setThought] = useState<string | null>(null);
  /** Right-click context menu — screen position inside the overlay window. */
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  /** The interactive hit area (sprite + hover chrome) — everything outside
   *  it is click-through. */
  const hitRef = useRef<HTMLDivElement>(null);
  const ignoringRef = useRef(true);
  const menuOpenRef = useRef(false);
  menuOpenRef.current = menu !== null;
  const sleepModeRef = useRef(sleepMode);
  sleepModeRef.current = sleepMode;
  const nappingRef = useRef(napping);
  nappingRef.current = napping;
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const idleTimerRef = useRef<number | undefined>(undefined);

  // Transparent window chrome — the app shell CSS paints body with a theme
  // background; the overlay must show the desktop through instead.
  useEffect(() => {
    const doc = document.documentElement;
    const body = document.body;
    doc.style.background = 'transparent';
    body.style.background = 'transparent';
    body.style.overflow = 'hidden';
  }, []);

  // Click-through hit-test — polling the GLOBAL cursor position and toggling
  // setIgnoreCursorEvents when it moves in/out of the sprite rect. Tauri 2's
  // JS API has no forwarded-mouse-events option (Tauri 1 did), so while the
  // window ignores the cursor it receives no pointer events at all — the
  // poll is the only way to notice re-entry. 80ms is imperceptible.
  useEffect(() => {
    if (!isTauri) return;
    const win = getCurrentWindow();
    const setIgnoring = (value: boolean) => {
      if (ignoringRef.current === value) return;
      ignoringRef.current = value;
      void win.setIgnoreCursorEvents(value).catch(() => undefined);
    };
    let stopped = false;
    let timer: number | undefined;
    const tick = () => {
      if (stopped) return;
      void (async () => {
        try {
          if (menuOpenRef.current) {
            // Menu open → the whole window must take pointers.
            setIgnoring(false);
          } else {
            const [cursor, outer, dpr] = await Promise.all([
              cursorPosition(),
              win.outerPosition(),
              win.scaleFactor(),
            ]);
            const localX = (cursor.x - outer.x) / dpr;
            const localY = (cursor.y - outer.y) / dpr;
            // Sprite rect: bottom-center of the 220×264 window (bottom-2)
            const hitX0 = (WINDOW_W - SPRITE_SIZE) / 2;
            const hitY0 = WINDOW_H - 8 - SPRITE_SIZE;
            const inside =
              localX >= hitX0 &&
              localX <= hitX0 + SPRITE_SIZE &&
              localY >= hitY0 &&
              localY <= hitY0 + SPRITE_SIZE;
            setIgnoring(!inside);
          }
        } catch {
          /* window is closing — stop polling */
          stopped = true;
        }
      })();
      if (!stopped) timer = window.setTimeout(tick, 80);
    };
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [isTauri]);

  // Main-app state mirror (identity, nap, growth scale). The hello handshake
  // asks the main app to (re-)emit sync — events fired before this webview
  // finished loading would otherwise be missed.
  useEffect(() => {
    if (!isTauri) return;
    const unlisten = listen<CatDesktopSyncPayload>(CAT_DESKTOP_EVENTS.sync, (event) => {
      const payload = event.payload;
      if (!payload) return;
      setCatId(normalizeCatId(payload.catId));
      setNapping(Boolean(payload.napping));
      setScale(typeof payload.scale === 'number' && payload.scale > 0 ? payload.scale : 1);
    });
    void emit(CAT_DESKTOP_EVENTS.hello, null);
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [isTauri]);

  // Banner-notification mirror — the app pushes thought texts here whenever
  // a chat message / mention / task notification banner fires.
  useEffect(() => {
    if (!isTauri) return;
    const unlisten = listen<{ text?: string }>(CAT_DESKTOP_EVENTS.thought, (event) => {
      const text = typeof event.payload?.text === 'string' ? event.payload.text : '';
      if (!text) return;
      setThought(text);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [isTauri]);

  // The thought bubble clears itself after a while.
  useEffect(() => {
    if (!thought) return;
    const t = window.setTimeout(() => setThought(null), 7000);
    return () => window.clearTimeout(t);
  }, [thought]);

  // Right-click context menu — "Open App, Ask Kitty, Go to Commune, Go to
  // collab space, Settings, Quit App". Native menus would need per-OS glue;
  // an in-window DOM menu works identically on macOS and Windows.
  const openMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const x = Math.max(4, Math.min(event.clientX - MENU_W / 2, WINDOW_W - MENU_W - 4));
    const y = Math.min(event.clientY, WINDOW_H - MENU_H - 4);
    setMenu({ x, y });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const menuAction = useCallback((view: CatDesktopNavigateView | 'quit') => {
    setMenu(null);
    if (view === 'quit') {
      if (isTauri) void invoke('quit_app');
      return;
    }
    if (isTauri) void emit(CAT_DESKTOP_EVENTS.navigate, { view });
  }, [isTauri]);

  // Close the menu on outside click / Escape. When it is open the whole
  // window is pointer-active (see the hit-test), so listen on the window.
  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (event: PointerEvent) => {
      const el = document.getElementById('cat-desktop-menu');
      if (el && event.target instanceof Node && el.contains(event.target)) return;
      setMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [menu]);

  // Nap rig — same sheet trick as the in-app CatAssistant: falling asleep
  // plays the sleep sheet forwards and holds the last frame; waking plays
  // it in reverse, then returns to the idle pose.
  useEffect(() => {
    if (napping) {
      setSleepMode('sleep');
      setIsAnimating(false);
    } else if (sleepModeRef.current === 'sleep') {
      setSleepMode('wake');
    }
  }, [napping]);

  // Preload both sheets so the sleep animation never starts over an
  // uncached image (same guard as the in-app cat).
  useEffect(() => {
    for (const url of [getCatSprite(catId), getCatSleepSprite(catId)]) {
      const img = new Image();
      img.src = url;
    }
  }, [catId]);

  // Occasional one-shot idle animation (mirrors the workspace cat's rhythm).
  const scheduleIdle = useCallback(() => {
    window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      if (!nappingRef.current) setIsAnimating(true);
    }, 5000 + Math.random() * 9000);
  }, []);
  useEffect(() => {
    scheduleIdle();
    return () => window.clearTimeout(idleTimerRef.current);
  }, [scheduleIdle, napping]);

  const onAnimationEnd = useCallback(() => {
    if (sleepModeRef.current === 'wake') {
      setSleepMode(null);
    }
    setIsAnimating(false);
    scheduleIdle();
  }, [scheduleIdle]);

  // Persist the resting position: report the window's logical position back
  // to the main app (debounced — onMoved fires continuously while dragging).
  useEffect(() => {
    if (!isTauri) return;
    const win = getCurrentWindow();
    let timer: number | undefined;
    const unlisten = win.onMoved(({ payload }) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void win
          .scaleFactor()
          .then((dpr) => emit(CAT_DESKTOP_EVENTS.position, { x: payload.x / dpr, y: payload.y / dpr }))
          .catch(() => undefined);
      }, 400);
    });
    return () => {
      window.clearTimeout(timer);
      void unlisten.then((fn) => fn());
    };
  }, [isTauri]);

  // Sprite interaction: short click = pet, drag = move the window.
  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;
    dragStartRef.current = { x: event.clientX, y: event.clientY };
    draggedRef.current = false;
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const start = dragStartRef.current;
    if (!start || draggedRef.current) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      draggedRef.current = true;
      dragStartRef.current = null;
      // Hands the gesture to the OS: the window follows the pointer until
      // mouse-up. No further pointer events fire in this webview meanwhile.
      void getCurrentWindow().startDragging();
    }
  }, []);

  const onPointerUp = useCallback(() => {
    const wasDrag = draggedRef.current;
    dragStartRef.current = null;
    draggedRef.current = false;
    if (wasDrag) return;
    // Short click → pet: local reaction + notify the pet model in the app.
    const at = Date.now();
    setPettedAt(at);
    window.setTimeout(() => setPettedAt((v) => (v === at ? 0 : v)), 900);
    setMeow(MEOWS[Math.floor(Math.random() * MEOWS.length)]);
    if (isTauri) void emit(CAT_DESKTOP_EVENTS.pet, null);
  }, [isTauri]);

  // The meow bubble clears itself shortly after appearing.
  useEffect(() => {
    if (!meow) return;
    const t = window.setTimeout(() => setMeow(null), 1800);
    return () => window.clearTimeout(t);
  }, [meow]);

  const onDoubleClick = useCallback(() => {
    if (draggedRef.current) return;
    if (isTauri) void emit(CAT_DESKTOP_EVENTS.openChat, null);
  }, [isTauri]);

  const catName = `${catId.slice(0, 1).toUpperCase()}${catId.slice(1)}`;

  return (
    <div className="fixed inset-0 select-none overflow-hidden" style={{ background: 'transparent' }}>
      <div
        ref={hitRef}
        onContextMenu={openMenu}
        className="group absolute bottom-2 left-1/2 -translate-x-1/2"
        style={{ width: SPRITE_SIZE, height: SPRITE_SIZE }}
      >
        {/* Notification mirror / meow / pet reaction — the notification
            thought takes precedence over pet chatter. */}
        {thought ? (
          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-[200px] -translate-x-1/2">
            <div className="rounded-xl border border-amber-500/70 bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-amber-50 shadow-[0_0_16px_rgba(245,158,11,0.45)] backdrop-blur-md">
              {thought}
            </div>
            <span className="absolute -bottom-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-b border-r border-amber-500/70 bg-amber-500/15" />
          </div>
        ) : (meow || Date.now() - pettedAt < 900) && (
          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap">
            {meow ? (
              <span className="rounded-full border border-border/70 bg-card/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-lg backdrop-blur-md">
                {meow}
              </span>
            ) : (
              <span key={pettedAt} className="block animate-bounce text-center text-base drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
                💗
              </span>
            )}
          </div>
        )}

        {/* The sprite itself */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          onAnimationEnd={onAnimationEnd}
          role="button"
          tabIndex={-1}
          aria-label={`${catName} desktop cat — drag to move, click to pet, double-click to open the app`}
          className="relative flex h-32 w-32 cursor-grab touch-none items-center justify-center rounded-2xl outline-none"
        >
          <span
            aria-hidden="true"
            className={cn(
              'cat-sprite-frame h-32 w-32 drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] transition-[filter,transform] duration-300',
              sleepMode === 'sleep'
                ? 'cat-sprite-sleep'
                : sleepMode === 'wake'
                  ? 'cat-sprite-wake'
                  : isAnimating
                    ? 'cat-sprite-animate'
                    : '',
              napping && 'brightness-[0.8] saturate-[0.85]'
            )}
            style={{
              backgroundImage: `url("${sleepMode ? getCatSleepSprite(catId) : getCatSprite(catId)}")`,
              transform: `scale(${scale.toFixed(3)})`,
            }}
          />
          {napping && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-1.5 top-0.5 animate-bounce font-mono text-sm font-bold text-sky-300/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
            >
              Zzz
            </span>
          )}
        </div>
      </div>

      {/* Right-click context menu — floats in the upper part of the overlay
          window (the window is exactly menu-sized, see WINDOW_* constants). */}
      {menu && (
        <div
          id="cat-desktop-menu"
          role="menu"
          aria-label="Desktop cat menu"
          className="absolute z-30 overflow-hidden rounded-xl border border-border/70 bg-card/95 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          style={{ left: menu.x, top: menu.y, width: MENU_W }}
        >
          {(
            [
              { view: 'app', label: 'Open App', Icon: AppWindow },
              { view: 'ask-kitty', label: 'Ask Kitty', Icon: CatIcon },
              { view: 'commune', label: 'Go to Commune', Icon: MessagesSquare },
              { view: 'collab', label: 'Go to collab space', Icon: Users },
              { view: 'settings', label: 'Settings', Icon: Settings2 },
            ] as Array<{ view: CatDesktopNavigateView; label: string; Icon: typeof AppWindow }>
          ).map(({ view, label, Icon }) => (
            <button
              key={view}
              type="button"
              role="menuitem"
              onClick={() => menuAction(view)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] font-medium text-foreground transition-colors hover:bg-accent/15 focus-visible:bg-accent/15 focus-visible:outline-none"
            >
              <Icon className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
              {label}
            </button>
          ))}
          <div className="mx-2 my-1 border-t border-border/60" />
          <button
            type="button"
            role="menuitem"
            onClick={() => menuAction('quit')}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] font-medium text-red-300 transition-colors hover:bg-red-500/15 focus-visible:bg-red-500/15 focus-visible:outline-none"
          >
            <Power className="size-3.5 shrink-0" aria-hidden="true" />
            Quit App
          </button>
        </div>
      )}
    </div>
  );
}
