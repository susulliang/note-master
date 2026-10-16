/**
 * CommunePanel — COMMUNE, the agents' town square (摩尔庄园-inspired).
 * A cozy walk-around canvas world where logged-in agents stroll between the
 * fountain, the bulletin board, the showcase stall and the challenge tent,
 * chit-chat with villager NPCs and each other via speech bubbles.
 *
 * SCAFFOLD SCOPE (local-only; no server state yet):
 *   • Player movement — WASD/arrow keys or click-to-move, camera follows.
 *   • Villager NPCs — waypoint wandering + ambient chit-chat bubbles.
 *   • Player chat — type at the bottom, speak in a bubble.
 *   • Bulletin board — admin banners (localStorage `__app_commune_banners`).
 *   • Showcase stall + challenge tent — stub panels describing the roadmap.
 *
 * NEXT-BOARD ROADMAP (deliberate hook points, see the panels' stubs):
 *   1. NPC challenges — real case-study quizzes handed out at the tent.
 *   2. Agent chit-chat — real multi-user presence + chat (D1 presence sync:
 *      the player/NPC entity model below is already the wire shape).
 *   3. Delivery secrets / open conversations — proximity-gated chat channels.
 *   4. Admin banners — promote the localStorage list to a D1 table.
 *   5. Personal showcases — achievement/card displays at the stall.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Megaphone, Trophy, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';

/* ── world layout ──────────────────────────────────────────────────────────── */

const WORLD_W = 1600;
const WORLD_H = 1200;
const PLAZA = { x: 800, y: 620, r: 300 };
const FOUNTAIN = { x: 800, y: 600, r: 96 }; // collision circle
const BOARD = { x: 800, y: 330, w: 190, h: 130 }; // bulletin board (banners)
const STALL = { x: 400, y: 730, w: 170, h: 150 }; // showcase stall
const TENT = { x: 1200, y: 730, w: 180, h: 160 }; // challenge tent
const SPEED = 240; // player px/s
const NPC_SPEED = 90;
const INTERACT_RANGE = 110;

interface Banner {
  id: string;
  text: string;
  author: string;
  at: number;
  hue: number;
}

const BANNERS_KEY = '__app_commune_banners';

function loadBanners(): Banner[] {
  try {
    const raw = localStorage.getItem(BANNERS_KEY);
    const list = raw ? (JSON.parse(raw) as Banner[]) : [];
    return Array.isArray(list) ? list.slice(-6) : [];
  } catch {
    return [];
  }
}

/** Villager NPCs — stand-ins for other agents until D1 presence lands. */
const NPCS = [
  { name: 'Mocha', hue: 25, home: { x: 620, y: 760 } },
  { name: 'Latte', hue: 200, home: { x: 990, y: 760 } },
  { name: 'Bean', hue: 130, home: { x: 560, y: 470 } },
  { name: 'Waffle', hue: 330, home: { x: 1050, y: 470 } },
];

const NPC_LINES = [
  'Fresh banners on the board!',
  'Meet at the fountain?',
  'I almost beat the spin wheel yesterday…',
  'Have you hung a banner yet?',
  'The challenge tent is coming — real cases!',
  'Show your cards at the showcase stall!',
  'Lovely day in the commune ☀',
  'brb, feeding my cat',
];

type PanelKind = 'banners' | 'showcase' | 'challenges' | null;

/** Deterministic hue from a username so each agent wears their own color. */
function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

interface Speech { text: string; until: number }

interface Agent {
  x: number;
  y: number;
  name: string;
  hue: number;
  says: Speech | null;
  /** NPC-only: current waypoint + pause state. */
  target?: { x: number; y: number };
  pauseUntil?: number;
  nextLineAt?: number;
  moving?: boolean;
  bobPhase?: number;
}

export default function CommunePanel() {
  const { user } = useAuth();
  const username = user?.username ?? 'Guest';
  const isAdmin = !!user?.isAdmin;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [panel, setPanel] = useState<PanelKind>(null);
  const [banners, setBanners] = useState<Banner[]>(loadBanners);
  const [bannerDraft, setBannerDraft] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [prompt, setPrompt] = useState<string | null>(null);

  const playerRef = useRef<Agent>({ x: PLAZA.x, y: PLAZA.y + 240, name: username, hue: hueOf(username), says: null });
  const npcsRef = useRef<Agent[]>(
    NPCS.map((n) => ({ x: n.home.x, y: n.home.y, name: n.name, hue: n.hue, says: null, target: { ...n.home }, pauseUntil: 0, nextLineAt: Date.now() + 4000 + Math.random() * 6000, bobPhase: Math.random() * 10 }))
  );
  const keysRef = useRef<Set<string>>(new Set());
  const clickTargetRef = useRef<{ x: number; y: number } | null>(null);
  const camRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef<PanelKind>(null);
  panelRef.current = panel;
  const chatFocusedRef = useRef(false);

  /* ── banners ─────────────────────────────────────────────────────────────── */

  const persistBanners = useCallback((next: Banner[]) => {
    const trimmed = next.slice(-6);
    setBanners(trimmed);
    try {
      localStorage.setItem(BANNERS_KEY, JSON.stringify(trimmed));
    } catch {
      /* storage full / private mode — banners stay in memory */
    }
  }, []);

  const hangBanner = useCallback(() => {
    const text = bannerDraft.trim();
    if (!text) return;
    persistBanners([...banners, { id: `${Date.now()}`, text, author: username, at: Date.now(), hue: hueOf(username) }]);
    setBannerDraft('');
  }, [bannerDraft, banners, persistBanners, username]);

  /* ── input ───────────────────────────────────────────────────────────────── */

  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'KeyE') {
        // Interact with the nearest prop.
        const p = playerRef.current;
        const near = proximity(p.x, p.y);
        if (near) {
          e.preventDefault();
          setPanel(near);
        }
        return;
      }
      if (panelRef.current) return; // walking disabled while a panel is open
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        keysRef.current.add(e.code);
      }
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  /** Which interactable prop is within range of (x, y)? */
  const proximity = (x: number, y: number): PanelKind => {
    const near = (px: number, py: number, tx: number, ty: number, range = INTERACT_RANGE) =>
      Math.hypot(px - tx, py - ty) <= range;
    if (near(x, y, BOARD.x, BOARD.y + 60)) return 'banners';
    if (near(x, y, STALL.x + 40, STALL.y)) return 'showcase';
    if (near(x, y, TENT.x - 40, TENT.y)) return 'challenges';
    return null;
  };

  const PROP_LABEL: Record<Exclude<PanelKind, null>, string> = {
    banners: 'Bulletin Board',
    showcase: 'Showcase Stall',
    challenges: 'Challenge Tent',
  };

  /* ── main loop ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let vw = 0;
    let vh = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      vw = wrap.clientWidth;
      vh = wrap.clientHeight;
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vh}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const tSec = now / 1000;

      /* update player */
      const player = playerRef.current;
      if (!panelRef.current && !chatFocusedRef.current) {
        const k = keysRef.current;
        let dx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
        let dy = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
        if (dx === 0 && dy === 0 && clickTargetRef.current) {
          const tx = clickTargetRef.current.x - player.x;
          const ty = clickTargetRef.current.y - player.y;
          const d = Math.hypot(tx, ty);
          if (d > 6) {
            dx = tx / d;
            dy = ty / d;
          } else {
            clickTargetRef.current = null;
          }
        }
        const len = Math.hypot(dx, dy);
        player.moving = len > 0;
        if (len > 0) {
          const nx = player.x + (dx / len) * SPEED * dt;
          const ny = player.y + (dy / len) * SPEED * dt;
          moveWithCollision(player, nx, ny);
          player.bobPhase = (player.bobPhase ?? 0) + dt * 10;
        }
      } else {
        player.moving = false;
      }
      if (player.says && player.says.until < now) player.says = null;

      /* update NPCs */
      for (const npc of npcsRef.current) {
        const nowMs = now;
        if (npc.says && npc.says.until < nowMs) npc.says = null;
        if (npc.nextLineAt !== undefined && nowMs >= npc.nextLineAt) {
          npc.says = { text: NPC_LINES[Math.floor(Math.random() * NPC_LINES.length)], until: nowMs + 4200 };
          npc.nextLineAt = nowMs + 9000 + Math.random() * 14000;
        }
        if (npc.pauseUntil && nowMs < npc.pauseUntil) {
          npc.moving = false;
        } else if (npc.target) {
          const tx = npc.target.x - npc.x;
          const ty = npc.target.y - npc.y;
          const d = Math.hypot(tx, ty);
          if (d < 8) {
            // New waypoint around the plaza ring, then loiter.
            const a = Math.random() * Math.PI * 2;
            const r = PLAZA.r * (0.35 + Math.random() * 0.5);
            npc.target = { x: PLAZA.x + Math.cos(a) * r, y: PLAZA.y + Math.sin(a) * r * 0.7 };
            npc.pauseUntil = nowMs + 1500 + Math.random() * 3500;
          } else {
            const nx = npc.x + (tx / d) * NPC_SPEED * dt;
            const ny = npc.y + (ty / d) * NPC_SPEED * dt;
            moveWithCollision(npc, nx, ny);
            npc.moving = true;
            npc.bobPhase = (npc.bobPhase ?? 0) + dt * 9;
          }
        }
      }

      /* camera follows the player, clamped to the world */
      const cam = camRef.current;
      cam.x = Math.min(Math.max(player.x - vw / 2, 0), Math.max(0, WORLD_W - vw));
      cam.y = Math.min(Math.max(player.y - vh / 2, 0), Math.max(0, WORLD_H - vh));

      /* interactable prompt */
      const nearKind = proximity(player.x, player.y);
      setPrompt(nearKind ? `E — ${PROP_LABEL[nearKind]}` : null);

      draw(ctx, vw, vh, dpr, cam, tSec, player, npcsRef.current, banners);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banners]);

  /* ── canvas click → interact or walk ─────────────────────────────────────── */

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (panel) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const wx = e.clientX - rect.left + camRef.current.x;
    const wy = e.clientY - rect.top + camRef.current.y;
    // Props open their panel when clicked directly.
    const hitProp =
      (wx >= BOARD.x - BOARD.w / 2 && wx <= BOARD.x + BOARD.w / 2 && wy >= BOARD.y - BOARD.h / 2 && wy <= BOARD.y + BOARD.h / 2 && 'banners') ||
      (wx >= STALL.x - STALL.w / 2 && wx <= STALL.x + STALL.w / 2 && wy >= STALL.y - STALL.h / 2 && wy <= STALL.y + STALL.h / 2 && 'showcase') ||
      (wx >= TENT.x - TENT.w / 2 && wx <= TENT.x + TENT.w / 2 && wy >= TENT.y - TENT.h / 2 && wy <= TENT.y + TENT.h / 2 && 'challenges');
    if (hitProp) {
      setPanel(hitProp);
      return;
    }
    clickTargetRef.current = { x: wx, y: wy };
  };

  const speak = () => {
    const text = chatDraft.trim();
    if (!text) return;
    playerRef.current.says = { text: text.slice(0, 90), until: Date.now() + 6000 };
    setChatDraft('');
  };

  const bannerWords = useMemo(() => banners.map((b) => b.text), [banners]);

  return (
    <div className="relative h-full min-h-full w-full overflow-hidden bg-[#0e1a12]">
      <canvas ref={canvasRef} onClick={onCanvasClick} className="absolute inset-0 cursor-pointer" />

      {/* Title chip */}
      <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/20 bg-black/40 px-4 py-1.5 font-mono text-xs font-extrabold tracking-widest text-amber-300 backdrop-blur">
        COMMUNE · town square
      </div>

      {/* Interaction prompt */}
      {prompt && !panel && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 animate-in fade-in rounded-full border border-amber-300/50 bg-black/60 px-4 py-1.5 text-xs font-bold text-amber-200 backdrop-blur">
          {prompt}
        </div>
      )}

      {/* Chat bar */}
      <div className="absolute bottom-4 left-1/2 flex w-[min(560px,calc(100%-32px))] -translate-x-1/2 items-center gap-2">
        <input
          value={chatDraft}
          onChange={(e) => setChatDraft(e.target.value)}
          onFocus={() => (chatFocusedRef.current = true)}
          onBlur={() => (chatFocusedRef.current = false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') speak();
            e.stopPropagation();
          }}
          placeholder={`Say something to the square, ${username}…`}
          maxLength={90}
          className="h-9 flex-1 rounded-full border border-white/20 bg-black/50 px-4 text-sm text-white placeholder:text-white/40 backdrop-blur focus:border-amber-300/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={speak}
          className="h-9 rounded-full border border-amber-300/50 bg-amber-500/80 px-4 text-xs font-extrabold text-white transition hover:brightness-110"
        >
          Speak
        </button>
      </div>

      {/* ── panels ──────────────────────────────────────────────────────────── */}
      {panel && (
        <div className="glass-panel absolute right-4 top-4 max-h-[calc(100%-88px)] w-[min(360px,calc(100vw-32px))] overflow-y-auto rounded-2xl border-amber-400/30 p-4 shadow-2xl">
          <button
            type="button"
            onClick={() => setPanel(null)}
            className="absolute right-2.5 top-2.5 rounded-full p-1 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>

          {panel === 'banners' && (
            <div>
              <h3 className="flex items-center gap-2 pr-6 font-mono text-sm font-extrabold text-foreground">
                <Megaphone className="size-4 text-amber-400" /> Town Banners
              </h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Announcements hung by admins for every agent passing the square.
              </p>
              <div className="mt-3 space-y-2">
                {banners.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
                    No banners hung yet.
                  </p>
                )}
                {banners.map((b) => (
                  <div
                    key={b.id}
                    className="rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2"
                    style={{ borderLeft: `4px solid hsl(${b.hue} 70% 55%)` }}
                  >
                    <p className="text-xs font-semibold text-foreground">{b.text}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      — {b.author} · {new Date(b.at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
              {isAdmin && (
                <div className="mt-3 flex gap-1.5">
                  <input
                    value={bannerDraft}
                    onChange={(e) => setBannerDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') hangBanner();
                      e.stopPropagation();
                    }}
                    maxLength={80}
                    placeholder="Hang a banner…"
                    className="h-8 flex-1 rounded-lg border border-border/60 bg-background/40 px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-amber-300/60 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={hangBanner}
                    disabled={!bannerDraft.trim()}
                    className="h-8 rounded-lg border border-amber-400/50 bg-amber-500/80 px-3 text-[11px] font-extrabold text-white disabled:opacity-40"
                  >
                    Hang
                  </button>
                </div>
              )}
            </div>
          )}

          {panel === 'showcase' && (
            <div>
              <h3 className="flex items-center gap-2 pr-6 font-mono text-sm font-extrabold text-foreground">
                <Users className="size-4 text-amber-400" /> Personal Showcases
              </h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Agents will display their achievement &amp; TCG cards on this stall.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {['Achievement cards', 'TCG collection', 'Spice milestone', 'QA trophies'].map((label) => (
                  <div
                    key={label}
                    className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/20 p-2 text-center"
                  >
                    <p className="font-mono text-[10px] font-bold text-muted-foreground">{label}</p>
                    <p className="mt-1 text-[9px] text-muted-foreground/60">coming next</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {panel === 'challenges' && (
            <div>
              <h3 className="flex items-center gap-2 pr-6 font-mono text-sm font-extrabold text-foreground">
                <Trophy className="size-4 text-amber-400" /> NPC Challenges
              </h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Villager NPCs will hand out real case-study challenges here — answer from live tickets.
              </p>
              <div className="mt-3 space-y-2">
                {['Case-study quiz from a real DSAT ticket', 'Escalation role-play with an NPC customer', 'Daily commune challenge streak'].map((label) => (
                  <div key={label} className="rounded-lg border border-dashed border-border/60 bg-background/20 px-3 py-2.5">
                    <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                    <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground/60">coming next</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Banner ticker — hung banners also scroll along the top edge */}
      {bannerWords.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-4 w-[min(680px,calc(100%-200px))] -translate-x-1/2 overflow-hidden rounded-full border border-amber-300/30 bg-black/40 py-1 backdrop-blur">
          <p className="truncate text-center font-mono text-[11px] font-bold text-amber-200">
            📣 {bannerWords[bannerWords.length - 1]}
          </p>
        </div>
      )}
    </div>
  );
}

/* ── movement ─────────────────────────────────────────────────────────────── */

/** Move to (nx, ny) with world bounds + fountain collision (slide along). */
function moveWithCollision(a: Agent, nx: number, ny: number) {
  const R = 26;
  nx = Math.min(Math.max(nx, R), WORLD_W - R);
  ny = Math.min(Math.max(ny, R + 120), WORLD_H - R);
  const d = Math.hypot(nx - FOUNTAIN.x, ny - FOUNTAIN.y);
  if (d < FOUNTAIN.r + R) {
    // Push out of the fountain circle.
    const ang = Math.atan2(ny - FOUNTAIN.y, nx - FOUNTAIN.x);
    nx = FOUNTAIN.x + Math.cos(ang) * (FOUNTAIN.r + R);
    ny = FOUNTAIN.y + Math.sin(ang) * (FOUNTAIN.r + R);
  }
  a.x = nx;
  a.y = ny;
}

/* ── drawing ──────────────────────────────────────────────────────────────── */

type Cam = { x: number; y: number };

function draw(
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  dpr: number,
  cam: Cam,
  t: number,
  player: Agent,
  npcs: Agent[],
  banners: Banner[]
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, vw, vh);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  /* grass */
  ctx.fillStyle = '#77b255';
  ctx.fillRect(cam.x, cam.y, vw, vh);
  // soft grass patches
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 40; i++) {
    const px = ((i * 397) % WORLD_W);
    const py = ((i * 613) % WORLD_H);
    ctx.beginPath();
    ctx.ellipse(px, py, 60 + (i % 5) * 22, 24 + (i % 3) * 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* dirt paths from plaza to each prop */
  ctx.strokeStyle = '#d9b380';
  ctx.lineWidth = 46;
  ctx.lineCap = 'round';
  for (const [tx, ty] of [
    [BOARD.x, BOARD.y + 90],
    [STALL.x + 40, STALL.y],
    [TENT.x - 40, TENT.y],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(PLAZA.x, PLAZA.y);
    ctx.quadraticCurveTo((PLAZA.x + tx) / 2 + 60, (PLAZA.y + ty) / 2, tx, ty);
    ctx.stroke();
  }

  /* plaza cobbles */
  ctx.beginPath();
  ctx.ellipse(PLAZA.x, PLAZA.y, PLAZA.r, PLAZA.r * 0.72, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#e7d7ae';
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,130,80,0.25)';
  ctx.lineWidth = 2;
  for (let r = 60; r <= PLAZA.r; r += 60) {
    ctx.beginPath();
    ctx.ellipse(PLAZA.x, PLAZA.y, r, r * 0.72, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* y-sorted drawables */
  type D = { y: number; fn: () => void };
  const items: D[] = [];

  /* fountain */
  items.push({
    y: FOUNTAIN.y + FOUNTAIN.r * 0.7,
    fn: () => {
      ctx.beginPath();
      ctx.ellipse(FOUNTAIN.x, FOUNTAIN.y, FOUNTAIN.r + 16, (FOUNTAIN.r + 16) * 0.62, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#b9bec9';
      ctx.fill();
      ctx.strokeStyle = '#8f96a3';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(FOUNTAIN.x, FOUNTAIN.y, FOUNTAIN.r - 6, (FOUNTAIN.r - 6) * 0.62, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#4fb3e8';
      ctx.fill();
      // animated ripples
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      for (let k = 0; k < 3; k++) {
        const ph = (t * 0.5 + k / 3) % 1;
        ctx.globalAlpha = 1 - ph;
        ctx.beginPath();
        ctx.ellipse(FOUNTAIN.x, FOUNTAIN.y, 18 + ph * (FOUNTAIN.r - 30), (18 + ph * (FOUNTAIN.r - 30)) * 0.62, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // center statue
      ctx.beginPath();
      ctx.ellipse(FOUNTAIN.x, FOUNTAIN.y - 26, 14, 22, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#cfd4dd';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(FOUNTAIN.x, FOUNTAIN.y - 52, 11, 0, Math.PI * 2);
      ctx.fillStyle = '#cfd4dd';
      ctx.fill();
    },
  });

  /* bulletin board (banners) */
  items.push({
    y: BOARD.y + BOARD.h / 2,
    fn: () => {
      const bx = BOARD.x;
      const by = BOARD.y;
      // posts
      ctx.fillStyle = '#8a5a33';
      ctx.fillRect(bx - 70, by + 20, 12, 70);
      ctx.fillRect(bx + 58, by + 20, 12, 70);
      // frame + cork
      roundRect(ctx, bx - BOARD.w / 2, by - BOARD.h / 2, BOARD.w, BOARD.h, 10);
      ctx.fillStyle = '#a9713f';
      ctx.fill();
      roundRect(ctx, bx - BOARD.w / 2 + 8, by - BOARD.h / 2 + 8, BOARD.w - 16, BOARD.h - 16, 6);
      ctx.fillStyle = '#d9a866';
      ctx.fill();
      // hung banners (up to 3 papers)
      const shown = banners.slice(-3);
      shown.forEach((b, i) => {
        const px = bx - BOARD.w / 2 + 20 + i * 56;
        const py = by - BOARD.h / 2 + 18;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(((i % 2) - 0.5) * 0.12);
        ctx.fillStyle = `hsl(${b.hue} 75% 78%)`;
        ctx.fillRect(0, 0, 44, 56);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.font = 'bold 7px ui-monospace, monospace';
        ctx.textAlign = 'center';
        const words = b.text.split(' ');
        let line = '';
        let ly = 12;
        for (const w of words) {
          if ((line + ' ' + w).trim().length > 9) {
            ctx.fillText(line.trim(), 22, ly);
            line = w;
            ly += 9;
            if (ly > 50) break;
          } else line += ' ' + w;
        }
        if (ly <= 50) ctx.fillText(line.trim(), 22, ly);
        ctx.restore();
      });
      // label
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(ctx, bx - 46, by + BOARD.h / 2 + 22, 92, 18, 9);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BULLETIN', bx, by + BOARD.h / 2 + 35);
    },
  });

  /* showcase stall */
  items.push({
    y: STALL.y + STALL.h / 2,
    fn: () => {
      const sx = STALL.x;
      const sy = STALL.y;
      // counter
      roundRect(ctx, sx - STALL.w / 2 + 14, sy + 10, STALL.w - 28, 52, 8);
      ctx.fillStyle = '#b98254';
      ctx.fill();
      // poles
      ctx.fillStyle = '#8a5a33';
      ctx.fillRect(sx - STALL.w / 2 + 16, sy - 44, 8, 96);
      ctx.fillRect(sx + STALL.w / 2 - 24, sy - 44, 8, 96);
      // striped awning
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#e05555' : '#f7f3ea';
        ctx.beginPath();
        ctx.moveTo(sx - STALL.w / 2 + 10 + i * ((STALL.w - 20) / 8), sy - 40);
        ctx.lineTo(sx - STALL.w / 2 + 10 + (i + 1) * ((STALL.w - 20) / 8), sy - 40);
        ctx.lineTo(sx - STALL.w / 2 + 6 + (i + 1) * ((STALL.w - 20) / 8) + 2, sy - 18);
        ctx.lineTo(sx - STALL.w / 2 + 6 + i * ((STALL.w - 20) / 8) - 2, sy - 18);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(ctx, sx - 52, sy + 66, 104, 18, 9);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SHOWCASE', sx, sy + 79);
    },
  });

  /* challenge tent */
  items.push({
    y: TENT.y + TENT.h / 2,
    fn: () => {
      const tx = TENT.x;
      const ty = TENT.y;
      // canopy cone
      ctx.beginPath();
      ctx.moveTo(tx, ty - 96);
      ctx.lineTo(tx + TENT.w / 2, ty + 26);
      ctx.lineTo(tx - TENT.w / 2, ty + 26);
      ctx.closePath();
      ctx.fillStyle = '#e8a33d';
      ctx.fill();
      // stripes
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.moveTo(tx, ty - 96);
      ctx.lineTo(tx + TENT.w / 6, ty + 26);
      ctx.lineTo(tx - TENT.w / 6, ty + 26);
      ctx.closePath();
      ctx.fill();
      // flag
      ctx.strokeStyle = '#7a4a22';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(tx, ty - 96);
      ctx.lineTo(tx, ty - 122);
      ctx.stroke();
      ctx.fillStyle = '#e05555';
      ctx.beginPath();
      ctx.moveTo(tx, ty - 122);
      ctx.lineTo(tx + 26, ty - 114);
      ctx.lineTo(tx, ty - 106);
      ctx.closePath();
      ctx.fill();
      // opening
      ctx.fillStyle = '#5b3a1e';
      ctx.beginPath();
      ctx.moveTo(tx - 34, ty + 26);
      ctx.lineTo(tx, ty - 30);
      ctx.lineTo(tx + 34, ty + 26);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(ctx, tx - 62, ty + 34, 124, 18, 9);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CHALLENGES', tx, ty + 47);
    },
  });

  /* trees + flowers + houses (background dressing) */
  for (const [tx, ty] of [
    [180, 420], [300, 980], [1420, 420], [1300, 990], [620, 250], [1000, 250], [90, 760], [1520, 760],
  ] as const) {
    items.push({
      y: ty,
      fn: () => {
        ctx.fillStyle = '#7a4a22';
        ctx.fillRect(tx - 7, ty - 30, 14, 40);
        ctx.beginPath();
        ctx.arc(tx, ty - 52, 34, 0, Math.PI * 2);
        ctx.arc(tx - 24, ty - 34, 24, 0, Math.PI * 2);
        ctx.arc(tx + 24, ty - 34, 24, 0, Math.PI * 2);
        ctx.fillStyle = '#4c9a3f';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(tx - 8, ty - 60, 16, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fill();
      },
    });
  }
  for (const [hx, hy, hue] of [
    [300, 200, 210], [1300, 200, 20],
  ] as const) {
    items.push({
      y: hy,
      fn: () => {
        roundRect(ctx, hx - 90, hy - 50, 180, 110, 12);
        ctx.fillStyle = `hsl(${hue} 45% 82%)`;
        ctx.fill();
        // round roof
        ctx.beginPath();
        ctx.moveTo(hx - 104, hy - 48);
        ctx.quadraticCurveTo(hx, hy - 150, hx + 104, hy - 48);
        ctx.closePath();
        ctx.fillStyle = `hsl(${hue} 60% 52%)`;
        ctx.fill();
        // door + window
        roundRect(ctx, hx - 18, hy + 6, 36, 54, 6);
        ctx.fillStyle = '#8a5a33';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(hx - 40, hy + 6, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#ffe9a8';
        ctx.fill();
        ctx.strokeStyle = '#8a5a33';
        ctx.lineWidth = 3;
        ctx.stroke();
      },
    });
  }

  /* entities */
  for (const npc of npcs) items.push({ y: npc.y, fn: () => drawAgent(ctx, npc, t) });
  items.push({ y: player.y, fn: () => drawAgent(ctx, player, t, true) });

  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.fn();

  ctx.restore();
}

/** A chibi commune citizen: capsule body, round head, cat ears, name tag. */
function drawAgent(ctx: CanvasRenderingContext2D, a: Agent, t: number, isPlayer = false) {
  const bob = a.moving ? Math.sin(a.bobPhase ?? 0) * 3 : Math.sin(t * 2 + (a.bobPhase ?? 0)) * 1.2;
  const x = a.x;
  const y = a.y + bob;

  // shadow (unbobbed)
  ctx.beginPath();
  ctx.ellipse(a.x, a.y + 20, 24, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fill();

  // body capsule
  roundRect(ctx, x - 17, y - 8, 34, 30, 15);
  ctx.fillStyle = `hsl(${a.hue} 62% 55%)`;
  ctx.fill();
  ctx.strokeStyle = `hsl(${a.hue} 62% 40%)`;
  ctx.lineWidth = 2;
  ctx.stroke();
  // belly
  ctx.beginPath();
  ctx.ellipse(x, y + 8, 9, 7, 0, 0, Math.PI * 2);
  ctx.fillStyle = `hsl(${a.hue} 70% 82%)`;
  ctx.fill();

  // head
  ctx.beginPath();
  ctx.arc(x, y - 22, 16, 0, Math.PI * 2);
  ctx.fillStyle = '#ffe3c2';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.stroke();
  // cat ears
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + s * 6, y - 34);
    ctx.lineTo(x + s * 14, y - 46);
    ctx.lineTo(x + s * 15, y - 30);
    ctx.closePath();
    ctx.fillStyle = `hsl(${a.hue} 62% 55%)`;
    ctx.fill();
  }
  // face
  ctx.fillStyle = '#3a2a20';
  ctx.beginPath();
  ctx.arc(x - 5.5, y - 23, 2.1, 0, Math.PI * 2);
  ctx.arc(x + 5.5, y - 23, 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a2a20';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y - 18, 3.4, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  // cheeks
  ctx.fillStyle = 'rgba(240,130,130,0.4)';
  ctx.beginPath();
  ctx.arc(x - 10, y - 18, 2.6, 0, Math.PI * 2);
  ctx.arc(x + 10, y - 18, 2.6, 0, Math.PI * 2);
  ctx.fill();

  // player ring + name tag
  if (isPlayer) {
    ctx.beginPath();
    ctx.ellipse(a.x, a.y + 20, 30, 11, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,215,64,0.8)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.textAlign = 'center';
  const w = ctx.measureText(a.name).width + 14;
  roundRect(ctx, x - w / 2, y + 24, w, 17, 8);
  ctx.fillStyle = isPlayer ? 'rgba(255,215,64,0.92)' : 'rgba(0,0,0,0.55)';
  ctx.fill();
  ctx.fillStyle = isPlayer ? '#1a1a1a' : '#fff';
  ctx.fillText(a.name, x, y + 36);

  // speech bubble
  if (a.says) {
    drawBubble(ctx, x, y - 58, a.says.text);
  }
}

function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  ctx.font = '11px ui-monospace, monospace';
  const maxChars = 22;
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > maxChars) {
      lines.push(line.trim());
      line = word;
    } else line += ' ' + word;
  }
  if (line.trim()) lines.push(line.trim());
  const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 18;
  const bh = lines.length * 15 + 12;
  const bx = x - bw / 2;
  const by = y - bh;
  roundRect(ctx, bx, by, bw, bh, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // tail
  ctx.beginPath();
  ctx.moveTo(x - 6, by + bh - 1);
  ctx.lineTo(x, by + bh + 9);
  ctx.lineTo(x + 6, by + bh - 1);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, x, by + 17 + i * 15));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
