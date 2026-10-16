/**
 * CommunePanel — COMMUNE, the agents' town square (摩尔庄园-inspired).
 * A cozy walk-around canvas world where logged-in agents stroll between the
 * fountain, the bulletin board, the showcase stall and the challenge tent,
 * chit-chat with villager NPCs and each other via speech bubbles.
 *
 * LIVE SCOPE:
 *   • Pixel-art town — the static map (town hall, café, arcade, houses, pond,
 *     paths, lamps, fences, flowers) is baked once into an offscreen canvas.
 *   • Pixel human sprites for the player, villager NPCs and remote agents.
 *   • Live presence — other agents walk around in real time (D1, 2.5s poll).
 *   • Loadouts — up to 3 collection cards from your inventory, one pet
 *     snapshot, one phrase (revealed when someone walks close).
 *   • Bulletin board (admin banners), showcase stall + challenge tent stubs.
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
import { Megaphone, Palette, Trophy, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import {
  fetchCardCollection,
  syncCommune,
  type CommuneAgent,
  type CommuneLoadout,
  type CommunePet,
} from '@/lib/auth-client';
import { CAT_CHOICES, type CatId } from '@/lib/cat-sprites';
import { loadState, petStorageKey, stageFor } from '@/lib/cat-pet';
import { TCG_COLLECTIONS, loadTcgManifest, rarityStyle, type TcgManifestCard } from '@/lib/tcg-manifest';

/* ── world layout ──────────────────────────────────────────────────────────── */

const WORLD_W = 1600;
const WORLD_H = 1200;
const PLAZA = { x: 800, y: 620, r: 300 };
const FOUNTAIN = { x: 800, y: 600, r: 96 }; // collision circle
const BOARD = { x: 800, y: 330, w: 190, h: 130 }; // bulletin board (banners)
const STALL = { x: 400, y: 730, w: 170, h: 150 }; // showcase stall
const TENT = { x: 1200, y: 730, w: 180, h: 160 }; // challenge tent
const POND_C = { x: 170, y: 640, rx: 115, ry: 75 }; // west pond (ellipse)
/** Solid footprints (building walls incl. roof silhouette + props). */
const SOLID_RECTS: { x: number; y: number; w: number; h: number }[] = [
  { x: 650, y: 96, w: 300, h: 134 }, // town hall
  { x: 161, y: 206, w: 170, h: 184 }, // café
  { x: 1245, y: 206, w: 170, h: 184 }, // arcade
  { x: 155, y: 864, w: 150, h: 176 }, // west house
  { x: 1295, y: 864, w: 150, h: 176 }, // east house
  { x: 736, y: 312, w: 128, h: 36 }, // bulletin board posts
  { x: 330, y: 742, w: 140, h: 36 }, // showcase counter
  { x: 90, y: 1062, w: 246, h: 18 }, // west fence
  { x: 1310, y: 1062, w: 216, h: 18 }, // east fence
];
/** Oaks drawn dynamically (y-sorted with agents). */
const TREES: [number, number][] = [
  [480, 208], [1120, 208], [560, 260], [1040, 260],
  [64, 470], [1536, 470], [64, 872], [1536, 872],
  [600, 1128], [1000, 1128],
];
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

type PanelKind = 'banners' | 'showcase' | 'challenges' | 'loadout' | 'agent' | null;

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
  /** Status line rendered under the name tag (remote agents). */
  status?: string;
  /** Admin badge (gold star). */
  admin?: boolean;
  /** NPC-only: current waypoint + pause state. */
  target?: { x: number; y: number };
  pauseUntil?: number;
  nextLineAt?: number;
  moving?: boolean;
  bobPhase?: number;
}

/** Interpolated view of a remote agent for the draw loop. */
interface RemoteView {
  x: number;
  y: number;
  name: string;
  hue: number;
  phrase: string | null;
  status?: string;
  admin?: boolean;
  moving: boolean;
  bobPhase: number;
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

  /* ── live presence (other agents) ─────────────────────────────────────────── */
  const [others, setOthers] = useState<CommuneAgent[]>([]);
  const [selected, setSelected] = useState<CommuneAgent | null>(null);
  const selectedRef = useRef<CommuneAgent | null>(null);
  selectedRef.current = selected;
  /** Interpolated remote walkers, keyed by username. */
  const remoteRef = useRef(
    new Map<string, { rx: number; ry: number; tx: number; ty: number; agent: CommuneAgent; moving: boolean; bobPhase: number }>()
  );
  /** My current status, updated by the draw loop, sent by the poll. */
  const statusRef = useRef('hanging out');

  /* ── my loadout ───────────────────────────────────────────────────────────── */
  const [loadout, setLoadout] = useState<CommuneLoadout>({ cards: [], pet: null, phrase: '' });
  const loadoutTouchedRef = useRef(false);
  const loadoutDirtyRef = useRef(false);
  const [petChoices, setPetChoices] = useState<CommunePet[]>([]);
  const [ownedCards, setOwnedCards] = useState<TcgManifestCard[] | null>(null);
  const [cardIndex, setCardIndex] = useState<Map<string, TcgManifestCard> | null>(null);

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

  /* ── loadout editor data (pets + owned cards) ────────────────────────────── */

  // My six cats with their local per-cat stats (D1-synced snapshots cached in
  // localStorage by use-cat-pet).
  useEffect(() => {
    if (panel !== 'loadout' || petChoices.length) return;
    const list = CAT_CHOICES.map((c) => {
      let st: ReturnType<typeof loadState> = null;
      try {
        st = loadState(window.localStorage.getItem(petStorageKey(username, c.id as CatId)));
      } catch {
        st = null;
      }
      return { id: c.id, name: c.name, stage: st ? stageFor(st.xp).name : 'Kitten', mood: st?.mood ?? 60, xp: st?.xp ?? 0 };
    });
    setPetChoices(list);
  }, [panel, petChoices.length, username]);

  // Card id → manifest card index (all collections) — resolves any card id
  // for rendering (loadout slots + other agents' inspect panels).
  useEffect(() => {
    if ((panel !== 'loadout' && panel !== 'agent') || cardIndex) return;
    let cancelled = false;
    void (async () => {
      try {
        const manifests = await Promise.all(TCG_COLLECTIONS.map((c) => loadTcgManifest(c.id)));
        const idx = new Map<string, TcgManifestCard>();
        for (const m of manifests) for (const card of m.cards) idx.set(card.id, card);
        if (!cancelled) setCardIndex(idx);
      } catch {
        /* editor simply shows empty pickers when offline */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [panel, cardIndex]);

  // My inventory — the pool the loadout picker draws from. Loaded whenever
  // the loadout editor opens (independent of cardIndex so it can't be
  // skipped by an earlier agent-panel visit).
  useEffect(() => {
    if (panel !== 'loadout' || ownedCards) return;
    let cancelled = false;
    void (async () => {
      try {
        const manifests = await Promise.all(TCG_COLLECTIONS.map((c) => loadTcgManifest(c.id)));
        const idx = new Map<string, TcgManifestCard>();
        for (const m of manifests) for (const card of m.cards) idx.set(card.id, card);
        const col = await fetchCardCollection();
        if (cancelled) return;
        const ids = new Set(col.map((r) => r.cardId));
        setOwnedCards([...idx.values()].filter((c) => ids.has(c.id)));
      } catch {
        /* picker stays empty when offline */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [panel, ownedCards]);

  const toggleLoadoutCard = (id: string) => {
    setLoadout((l) => ({
      ...l,
      cards: l.cards.includes(id) ? l.cards.filter((c) => c !== id) : [...l.cards, id].slice(-3),
    }));
  };

  const saveLoadout = async () => {
    loadoutTouchedRef.current = true;
    loadoutDirtyRef.current = true;
    setPanel(null);
    const p = playerRef.current;
    try {
      const out = await syncCommune(Math.round(p.x), Math.round(p.y), statusRef.current, loadout);
      setOthers(out.others);
    } catch {
      /* next presence tick will retry */
    }
  };

  /* ── presence poll — one round-trip every 2.5s while the commune is open ─── */
  useEffect(() => {
    if (!user) return;
    let stopped = false;
    const tick = async () => {
      const p = playerRef.current;
      try {
        const out = await syncCommune(
          Math.round(p.x),
          Math.round(p.y),
          statusRef.current,
          loadoutDirtyRef.current ? loadout : undefined
        );
        if (stopped) return;
        loadoutDirtyRef.current = false;
        // First server echo fills the editor (until the user edits locally).
        if (!loadoutTouchedRef.current && out.me) setLoadout(out.me);
        const seen = new Set<string>();
        for (const a of out.others) {
          seen.add(a.username);
          const r = remoteRef.current.get(a.username);
          if (r) {
            r.tx = a.x;
            r.ty = a.y;
            r.agent = a;
          } else {
            remoteRef.current.set(a.username, { rx: a.x, ry: a.y, tx: a.x, ty: a.y, agent: a, moving: false, bobPhase: Math.random() * 10 });
          }
        }
        for (const key of [...remoteRef.current.keys()]) {
          if (!seen.has(key)) remoteRef.current.delete(key);
        }
        setOthers(out.others);
        const sel = selectedRef.current;
        if (sel) {
          const fresh = out.others.find((o) => o.username === sel.username) ?? null;
          setSelected(fresh);
          if (!fresh) setPanel(null); // they walked away / went offline
        }
      } catch {
        /* offline — keep showing the last known square */
      }
    };
    void tick();
    const iv = window.setInterval(() => void tick(), 2500);
    return () => {
      stopped = true;
      window.clearInterval(iv);
    };
  }, [user, loadout]);

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

      /* interactable prompt + my status line */
      const nearKind = proximity(player.x, player.y);
      setPrompt(nearKind ? `E — ${PROP_LABEL[nearKind]}` : null);
      statusRef.current = player.says
        ? 'chatting'
        : nearKind === 'banners'
          ? 'reading the banners'
          : nearKind === 'showcase'
            ? 'browsing showcases'
            : nearKind === 'challenges'
              ? 'at the challenge tent'
              : player.moving
                ? 'wandering'
                : Math.hypot(player.x - FOUNTAIN.x, player.y - FOUNTAIN.y) < PLAZA.r
                  ? 'resting by the fountain'
                  : 'hanging out';

      /* remote agents: lerp toward their last reported position */
      const remoteViews: RemoteView[] = [];
      for (const r of remoteRef.current.values()) {
        const dx = r.tx - r.rx;
        const dy = r.ty - r.ry;
        const d = Math.hypot(dx, dy);
        r.moving = d > 3;
        if (d > 0.5) {
          const k = Math.min(1, dt * 3.5);
          r.rx += dx * k;
          r.ry += dy * k;
        }
        if (r.moving) r.bobPhase += dt * 9;
        remoteViews.push({
          x: r.rx,
          y: r.ry,
          name: r.agent.username,
          hue: hueOf(r.agent.username),
          phrase: r.agent.loadout?.phrase || null,
          status: r.agent.status,
          admin: r.agent.isAdmin,
          moving: r.moving,
          bobPhase: r.bobPhase,
        });
      }

      draw(ctx, vw, vh, dpr, cam, tSec, player, npcsRef.current, banners, remoteViews);
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
    // Clicking another agent opens their card (loadout: phrase, cards, pet).
    for (const r of remoteRef.current.values()) {
      if (Math.hypot(wx - r.rx, wy - (r.ry - 30)) < 42) {
        const agent = others.find((o) => o.username === r.agent.username) ?? r.agent;
        setSelected(agent);
        setPanel('agent');
        return;
      }
    }
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

      {/* Loadout editor button */}
      <button
        type="button"
        onClick={() => setPanel(panel === 'loadout' ? null : 'loadout')}
        className={cn(
          'absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold backdrop-blur transition-colors',
          panel === 'loadout'
            ? 'border-amber-300/60 bg-amber-500/80 text-white'
            : 'border-white/20 bg-black/40 text-amber-200 hover:bg-black/60'
        )}
        title="Edit what other agents see: cards, pet, phrase"
      >
        <Palette className="size-3.5" /> Loadout
      </button>

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

          {panel === 'loadout' && (
            <div>
              <h3 className="flex items-center gap-2 pr-6 font-mono text-sm font-extrabold text-foreground">
                <Palette className="size-4 text-amber-400" /> My Loadout
              </h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                What other agents see when they click you: up to 3 collection cards, one pet, one phrase.
              </p>

              {/* Signature phrase */}
              <p className="mt-3 mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Signature phrase</p>
              <input
                value={loadout.phrase}
                onChange={(e) => setLoadout((l) => ({ ...l, phrase: e.target.value }))}
                onKeyDown={(e) => e.stopPropagation()}
                maxLength={80}
                placeholder="e.g. Greetings from the north stall ☕"
                className="h-8 w-full rounded-lg border border-border/60 bg-background/40 px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-amber-300/60 focus:outline-none"
              />

              {/* Pet selector */}
              <p className="mt-3 mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Displayed pet</p>
              <div className="grid grid-cols-3 gap-1.5">
                {petChoices.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setLoadout((l) => ({ ...l, pet: l.pet?.id === p.id ? null : { ...p } }))}
                    className={cn(
                      'rounded-lg border px-1.5 py-1.5 text-center transition-colors',
                      loadout.pet?.id === p.id
                        ? 'border-amber-300/70 bg-amber-400/15'
                        : 'border-border/50 bg-background/20 hover:bg-background/40'
                    )}
                  >
                    <p className="text-[11px] font-extrabold text-foreground">{p.name}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {p.stage} · Mood {p.mood}
                    </p>
                  </button>
                ))}
              </div>

              {/* Card slots */}
              <p className="mt-3 mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Collection cards ({loadout.cards.length}/3)
                {ownedCards && <span className="normal-case"> · {ownedCards.length} in your inventory</span>}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {[0, 1, 2].map((i) => {
                  const id = loadout.cards[i];
                  const card = id ? cardIndex?.get(id) : undefined;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => id && toggleLoadoutCard(id)}
                      className={cn(
                        'relative aspect-[5/7] overflow-hidden rounded-lg border bg-white/5',
                        card ? rarityStyle(card.rarity).border : 'border-dashed border-border/50'
                      )}
                      title={card ? `${card.name} — click to remove` : 'Pick a card below'}
                    >
                      {card ? (
                        <>
                          <img src={card.image} alt={card.name} className="size-full object-cover" />
                          <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1 text-[8px] font-bold text-white">
                            {card.rarity}
                          </span>
                        </>
                      ) : (
                        <span className="flex size-full items-center justify-center font-mono text-xs text-muted-foreground/50">+</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {ownedCards && ownedCards.length > 0 && (
                <div className="custom-scrollbar mt-2 grid max-h-36 grid-cols-5 gap-1 overflow-y-auto rounded-lg border border-border/40 bg-background/20 p-1.5">
                  {ownedCards.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleLoadoutCard(c.id)}
                      className={cn(
                        'relative aspect-[5/7] overflow-hidden rounded border transition-transform hover:scale-105',
                        loadout.cards.includes(c.id) ? 'border-amber-300 ring-1 ring-amber-300/60' : 'border-transparent'
                      )}
                      title={`${c.name} — ${c.rarity}`}
                    >
                      <img src={c.image} alt={c.name} className="size-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
              {ownedCards && ownedCards.length === 0 && (
                <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                  No cards yet — draw some from the Spice Store.
                </p>
              )}

              <button
                type="button"
                onClick={() => void saveLoadout()}
                className="mt-3 h-9 w-full rounded-lg border border-amber-400/50 bg-amber-500/80 text-sm font-extrabold text-white transition hover:brightness-110"
              >
                Save loadout
              </button>
            </div>
          )}

          {panel === 'agent' && selected && (
            <div>
              <h3 className="flex items-center gap-2 pr-6 font-mono text-sm font-extrabold text-foreground">
                {selected.isAdmin && <span className="text-amber-400">★</span>}
                {selected.username}
              </h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {selected.status || 'hanging out'} · seen {Math.max(1, Math.round(selected.seenAgo / 1000))}s ago
              </p>
              {selected.loadout?.phrase && (
                <blockquote className="mt-2 rounded-lg border-l-4 border-amber-400/60 bg-amber-400/10 px-3 py-2 text-xs italic text-foreground">
                  “{selected.loadout.phrase}”
                </blockquote>
              )}
              {selected.loadout && selected.loadout.cards.length > 0 && (
                <>
                  <p className="mt-3 mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Collection cards</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {selected.loadout.cards.map((id) => {
                      const card = cardIndex?.get(id);
                      return card ? (
                        <div
                          key={id}
                          className={cn('relative aspect-[5/7] overflow-hidden rounded-lg border bg-white/5', rarityStyle(card.rarity).border)}
                          title={`${card.name} — ${card.rarity}`}
                        >
                          <img src={card.image} alt={card.name} className="size-full object-cover" />
                          <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1 text-[8px] font-bold text-white">
                            {card.rarity}
                          </span>
                        </div>
                      ) : (
                        <div key={id} className="flex aspect-[5/7] items-center justify-center rounded-lg border border-dashed border-border/50 font-mono text-xs text-muted-foreground/50">
                          ???
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {selected.loadout?.pet && (
                <>
                  <p className="mt-3 mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Pet</p>
                  <div className="rounded-lg border border-border/50 bg-background/20 px-3 py-2">
                    <p className="text-xs font-extrabold text-foreground">
                      {selected.loadout.pet.name} <span className="font-normal text-muted-foreground">· {selected.loadout.pet.stage}</span>
                    </p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background/60">
                      <div
                        className="h-full rounded-full bg-emerald-400"
                        style={{ width: `${Math.round(selected.loadout.pet.mood)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Mood {Math.round(selected.loadout.pet.mood)}/100 · Bond XP {selected.loadout.pet.xp}
                    </p>
                  </div>
                </>
              )}
              {!selected.loadout?.phrase && !selected.loadout?.cards.length && !selected.loadout?.pet && (
                <p className="mt-3 rounded-lg border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
                  {selected.username} hasn't set up a loadout yet.
                </p>
              )}
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

/** Move to (nx, ny) with world bounds, fountain/pond ellipses and the solid
 *  building footprints (slide along the nearest edge). */
function moveWithCollision(a: Agent, nx: number, ny: number) {
  const R = 24;
  nx = Math.min(Math.max(nx, R), WORLD_W - R);
  ny = Math.min(Math.max(ny, R + 120), WORLD_H - R);
  // Circular fountain + elliptical pond: push out radially.
  for (const circ of [{ x: FOUNTAIN.x, y: FOUNTAIN.y, r: FOUNTAIN.r }] as const) {
    const d = Math.hypot(nx - circ.x, ny - circ.y);
    if (d < circ.r + R) {
      const ang = Math.atan2(ny - circ.y, nx - circ.x);
      nx = circ.x + Math.cos(ang) * (circ.r + R);
      ny = circ.y + Math.sin(ang) * (circ.r + R);
    }
  }
  {
    const ex = (nx - POND_C.x) / (POND_C.rx + R);
    const ey = (ny - POND_C.y) / (POND_C.ry + R);
    const d2 = ex * ex + ey * ey;
    if (d2 < 1) {
      const d = Math.sqrt(d2) || 1e-6;
      nx = POND_C.x + (ex / d) * (POND_C.rx + R);
      ny = POND_C.y + (ey / d) * (POND_C.ry + R);
    }
  }
  // Rect buildings: push out along the smallest penetration axis.
  for (const s of SOLID_RECTS) {
    const l = s.x - R;
    const r2 = s.x + s.w + R;
    const tp = s.y - R;
    const bt = s.y + s.h + R;
    if (nx > l && nx < r2 && ny > tp && ny < bt) {
      const dl = nx - l;
      const dr = r2 - nx;
      const dtp = ny - tp;
      const db = bt - ny;
      const m = Math.min(dl, dr, dtp, db);
      if (m === dl) nx = l;
      else if (m === dr) nx = r2;
      else if (m === dtp) ny = tp;
      else ny = bt;
    }
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
  banners: Banner[],
  remotes: RemoteView[]
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, vw, vh);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  /* baked pixel town (grass, paths, plaza, buildings, pond, lamps, decor) */
  ctx.drawImage(getTownLayer(), 0, 0);

  /* fountain water ripples — the basin itself is baked */
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const ph = (t * 0.5 + k / 3) % 1;
    ctx.globalAlpha = 1 - ph;
    ctx.beginPath();
    ctx.ellipse(FOUNTAIN.x, FOUNTAIN.y, 18 + ph * (FOUNTAIN.r - 30), (18 + ph * (FOUNTAIN.r - 30)) * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* y-sorted drawables */
  type D = { y: number; fn: () => void };
  const items: D[] = [];
  for (const [tx, ty] of TREES) items.push({ y: ty, fn: () => drawPixelTree(ctx, tx, ty) });

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

  /* entities — remotes reveal their loadout phrase when you walk close */
  for (const npc of npcs) items.push({ y: npc.y, fn: () => drawAgent(ctx, npc, t) });
  for (const r of remotes) {
    items.push({
      y: r.y,
      fn: () => {
        const near = !!r.phrase && Math.hypot(r.x - player.x, r.y - player.y) < 170;
        drawAgent(
          ctx,
          { x: r.x, y: r.y, name: r.name, hue: r.hue, says: near && r.phrase ? { text: r.phrase, until: Infinity } : null, status: r.status, admin: r.admin, moving: r.moving, bobPhase: r.bobPhase },
          t
        );
      },
    });
  }
  items.push({ y: player.y, fn: () => drawAgent(ctx, player, t, true) });

  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.fn();

  ctx.restore();
}

/* ── pixel people ─────────────────────────────────────────────────────────── */

const SP_P = 4; // sprite pixel size (each art pixel = 4 canvas px)

/** 12×19 pixel human, front view. h/hair · H/highlight · S/skin · E/eye ·
 *  B/shirt · b/hem · s/sleeve · a/hand · P/pants · F/shoes. */
const HUMAN_STAND = [
  '...HHHHHH...',
  '..hhhhhhhh..',
  '..hhhhhhhh..',
  '..hSSSSSSh..',
  '..SESSSSES..',
  '..SSSSSSSS..',
  '...SSSSSS...',
  '....SSSS....',
  '.sBBBBBBBBs.',
  '.sBBBBBBBBs.',
  '.aBBBBBBBBa.',
  '..BBBBBBBB..',
  '..bbbbbbbb..',
  '..PPPPPPPP..',
  '..PPP..PPP..',
  '..PPP..PPP..',
  '..PPP..PPP..',
  '..FFF..FFF..',
  '..FFF..FFF..',
];

/** Walk frame — legs apart. */
const HUMAN_WALK = [
  ...HUMAN_STAND.slice(0, 14),
  '.PPP....PPP.',
  '.PPP....PPP.',
  '.PPP....PPP.',
  '.FFF....FFF.',
  '.FFF....FFF.',
];

/** A little pixel human — hair + shirt tinted by the agent's hue, a 2-frame
 *  walk cycle, gold name tag for the player, status line for remote agents. */
function drawAgent(ctx: CanvasRenderingContext2D, a: Agent, t: number, isPlayer = false) {
  const bob = a.moving ? Math.sin((a.bobPhase ?? 0) / 1.6) * 2.4 : Math.sin(t * 2 + (a.bobPhase ?? 0)) * 1.2;
  const feet = a.y + bob;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(a.x, a.y + 4, 19, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  const hair = `hsl(${a.hue} 42% 30%)`;
  const hairHi = `hsl(${a.hue} 48% 42%)`;
  const skin = '#eec39a';
  const eye = '#33251b';
  const shirt = `hsl(${a.hue} 60% 52%)`;
  const shirtSh = `hsl(${a.hue} 60% 38%)`;
  const pants = '#3f4a63';
  const shoe = '#2a2d38';
  const palette: Record<string, string> = { h: hair, H: hairHi, S: skin, E: eye, B: shirt, b: shirtSh, s: shirtSh, a: skin, P: pants, F: shoe };

  const tpl = a.moving && Math.floor((a.bobPhase ?? 0) / 3) % 2 === 1 ? HUMAN_WALK : HUMAN_STAND;
  const ox = Math.round(a.x) - (tpl[0].length * SP_P) / 2;
  const oy = Math.round(feet) - tpl.length * SP_P;
  for (let r = 0; r < tpl.length; r++) {
    const row = tpl[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      ctx.fillStyle = palette[ch] ?? skin;
      ctx.fillRect(ox + c * SP_P, oy + r * SP_P, SP_P, SP_P);
    }
  }

  // player ring + name tag (+ admin star, + status line for remote agents)
  if (isPlayer) {
    ctx.beginPath();
    ctx.ellipse(a.x, a.y + 4, 26, 10, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,215,64,0.85)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.textAlign = 'center';
  const tag = (a.admin ? '★ ' : '') + a.name;
  const w = ctx.measureText(tag).width + 14;
  roundRect(ctx, a.x - w / 2, a.y + 12, w, 17, 8);
  ctx.fillStyle = isPlayer ? 'rgba(255,215,64,0.92)' : 'rgba(0,0,0,0.55)';
  ctx.fill();
  ctx.fillStyle = isPlayer ? '#1a1a1a' : '#fff';
  ctx.fillText(tag, a.x, a.y + 24);
  if (a.status && !isPlayer) {
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(a.status, a.x, a.y + 37);
  }

  // speech bubble above the head
  if (a.says) {
    drawBubble(ctx, a.x, oy - 10, a.says.text);
  }
}

/** Chunky pixel oak (dynamic so it y-sorts with the agents). */
function drawPixelTree(ctx: CanvasRenderingContext2D, x: number, groundY: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(x, groundY + 2, 30, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  const q = (px: number, py: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(px / 4) * 4, Math.round(py / 4) * 4, Math.round(w / 4) * 4, Math.round(h / 4) * 4);
  };
  q(x - 8, groundY - 40, 16, 40, '#7a4a22');
  q(x, groundY - 40, 8, 40, '#683d1a');
  q(x - 44, groundY - 100, 88, 32, '#3f8f3a');
  q(x - 34, groundY - 126, 68, 28, '#4aa044');
  q(x - 20, groundY - 148, 40, 24, '#57b14e');
  q(x - 16, groundY - 142, 14, 8, 'rgba(255,255,255,0.18)');
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

/* ── pixel town map (baked once to an offscreen canvas) ───────────────────── */

const BG = 8; // bake grid — every static element snaps to these chunky pixels

let townLayer: HTMLCanvasElement | null = null;

/** Tiny seeded PRNG so the bake is identical on every machine/tab. */
function bakeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bake the static town: grass, hedge border, dirt paths, plaza, fountain,
 *  pond, town hall, café, arcade, two houses, fences, lamps, bushes, flowers.
 *  Drawn on an 8px grid for a chunky pixel-art look; cached module-level. */
function getTownLayer(): HTMLCanvasElement {
  if (townLayer) return townLayer;
  const cv = document.createElement('canvas');
  cv.width = WORLD_W;
  cv.height = WORLD_H;
  const g = cv.getContext('2d')!;
  const rand = bakeRng(20260416);

  const px = (x: number, y: number, w: number, h: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(Math.round(x / BG) * BG, Math.round(y / BG) * BG, Math.max(BG, Math.round(w / BG) * BG), Math.max(BG, Math.round(h / BG) * BG));
  };

  const pxEllipse = (cx: number, cy: number, rx: number, ry: number, color: string) => {
    g.fillStyle = color;
    for (let y = Math.floor((cy - ry) / BG) * BG; y <= cy + ry; y += BG) {
      for (let x = Math.floor((cx - rx) / BG) * BG; x <= cx + rx; x += BG) {
        const dx = x + BG / 2 - cx;
        const dy = y + BG / 2 - cy;
        if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) g.fillRect(x, y, BG, BG);
      }
    }
  };

  /* grass base — two-tone dithered pattern */
  const tile = document.createElement('canvas');
  tile.width = 32;
  tile.height = 32;
  const tg = tile.getContext('2d')!;
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      tg.fillStyle = (i + j) % 2 ? '#6fb254' : '#77bb5c';
      tg.fillRect(i * 8, j * 8, 8, 8);
    }
  }
  tg.fillStyle = '#639e4b';
  tg.fillRect(8, 16, 8, 8);
  tg.fillRect(24, 0, 8, 8);
  g.fillStyle = g.createPattern(tile, 'repeat')!;
  g.fillRect(0, 0, WORLD_W, WORLD_H);

  /* hedge border + corner bushes */
  px(0, 0, WORLD_W, 16, '#3c7a35');
  px(0, WORLD_H - 16, WORLD_W, 16, '#3c7a35');
  px(0, 0, 16, WORLD_H, '#3c7a35');
  px(WORLD_W - 16, 0, 16, WORLD_H, '#3c7a35');
  for (const [bx, by] of [[40, 40], [1560, 40], [40, 1160], [1560, 1160]] as const) {
    pxEllipse(bx, by, 40, 28, '#35803b');
  }

  /* dirt paths (quadratic curves sampled into grid-aligned slabs) */
  const PATHS: [number, number, number, number, number, number][] = [
    [800, 600, 800, 480, 800, 400], // north → bulletin board
    [800, 640, 620, 700, 450, 730], // west → showcase stall
    [800, 640, 980, 700, 1150, 730], // east → challenge tent
    [800, 700, 800, 900, 800, 1150], // south → hedge gate
  ];
  const pathPts: [number, number][] = [];
  for (const [x0, y0, cx, cy, x1, y1] of PATHS) {
    for (let i = 0; i <= 90; i++) {
      const t = i / 90;
      const u = 1 - t;
      const wx = u * u * x0 + 2 * u * t * cx + t * t * x1;
      const wy = u * u * y0 + 2 * u * t * cy + t * t * y1;
      pathPts.push([wx, wy]);
      px(wx - 20, wy - 20, 40, 40, '#d9b47c');
    }
  }
  for (let i = 0; i < 260; i++) {
    const [wx, wy] = pathPts[Math.floor(rand() * pathPts.length)];
    px(wx - 20 + rand() * 40, wy - 20 + rand() * 40, 8, 8, rand() < 0.5 ? '#c9a266' : '#e8cd96');
  }

  /* plaza cobbles + fountain */
  pxEllipse(PLAZA.x, PLAZA.y, PLAZA.r + 14, PLAZA.r * 0.72 + 14, '#b89a63');
  pxEllipse(PLAZA.x, PLAZA.y, PLAZA.r, PLAZA.r * 0.72, '#e6d6a8');
  for (let i = 0; i < 420; i++) {
    const a = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand());
    const wx = PLAZA.x + Math.cos(a) * rr * PLAZA.r;
    const wy = PLAZA.y + Math.sin(a) * rr * PLAZA.r * 0.72;
    g.fillStyle = rand() < 0.6 ? '#d4c190' : '#efe2ba';
    g.fillRect(Math.round(wx / BG) * BG, Math.round(wy / BG) * BG, BG, BG);
  }
  pxEllipse(FOUNTAIN.x, FOUNTAIN.y, FOUNTAIN.r + 16, (FOUNTAIN.r + 16) * 0.62, '#c8cdd6');
  pxEllipse(FOUNTAIN.x, FOUNTAIN.y, FOUNTAIN.r, FOUNTAIN.r * 0.62, '#8f96a3');
  pxEllipse(FOUNTAIN.x, FOUNTAIN.y, FOUNTAIN.r - 6, (FOUNTAIN.r - 6) * 0.62, '#5aa7d8');
  pxEllipse(FOUNTAIN.x, FOUNTAIN.y, FOUNTAIN.r - 26, (FOUNTAIN.r - 26) * 0.62, '#63b2e6');
  for (let i = 0; i < 36; i++) {
    const a = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand()) * (FOUNTAIN.r - 30);
    g.fillStyle = '#8fd0f0';
    g.fillRect(Math.round((FOUNTAIN.x + Math.cos(a) * rr) / BG) * BG, Math.round((FOUNTAIN.y + Math.sin(a) * rr * 0.6) / BG) * BG, BG, BG);
  }
  px(FOUNTAIN.x - 8, FOUNTAIN.y - 64, 16, 44, '#c8cdd6'); // pedestal
  px(FOUNTAIN.x - 16, FOUNTAIN.y - 72, 32, 10, '#d4d9e2');
  px(FOUNTAIN.x - 7, FOUNTAIN.y - 96, 14, 26, '#d4d9e2'); // statue body
  px(FOUNTAIN.x - 5, FOUNTAIN.y - 110, 10, 14, '#d4d9e2'); // statue head

  /* pond */
  pxEllipse(POND_C.x, POND_C.y, POND_C.rx + 16, POND_C.ry + 16, '#d3c48c');
  pxEllipse(POND_C.x, POND_C.y, POND_C.rx, POND_C.ry, '#4f9fd8');
  pxEllipse(POND_C.x, POND_C.y, POND_C.rx - 18, POND_C.ry - 14, '#63b2e6');
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand());
    g.fillStyle = '#8fd0f0';
    g.fillRect(Math.round((POND_C.x + Math.cos(a) * rr * POND_C.rx) / BG) * BG, Math.round((POND_C.y + Math.sin(a) * rr * POND_C.ry) / BG) * BG, BG, BG);
  }
  px(120, 616, 20, 12, '#3f9a46'); // lily pads
  px(124, 620, 8, 4, '#57b45c');
  px(206, 664, 20, 12, '#3f9a46');
  px(210, 668, 8, 4, '#57b45c');
  for (const [rx2, ry2] of [[58, 566], [76, 552], [258, 586]] as const) {
    px(rx2, ry2 - 14, 4, 18, '#2e7d38'); // reeds
    px(rx2 - 2, ry2 - 20, 8, 6, '#3f9a46');
  }

  /* shared building pieces */
  const bakeWindows = (x: number, y: number) => {
    px(x - 2, y - 2, 28, 28, '#5b4632');
    px(x, y, 24, 24, '#bfe6f5');
    px(x + 10, y, 4, 24, '#5b4632');
    px(x, y + 10, 24, 4, '#5b4632');
    px(x + 2, y + 2, 6, 4, '#eaf7fc');
  };
  const bakeRoof = (cx: number, baseY: number, w: number, color: string, colorShade: string) => {
    for (let i = 0; i < 7; i++) {
      const rw = Math.round(w * (1 - i / 9));
      px(cx - rw / 2, baseY - 8 * (i + 1), rw, 8, i % 2 ? color : colorShade);
    }
    px(cx - w / 2 - 8, baseY - 6, w + 16, 8, colorShade);
  };

  /* TOWN HALL (north, behind the bulletin board) */
  {
    const cx = 800, gy = 230, w = 300, top = gy - 120;
    px(cx - w / 2, top, w, 120, '#ddd3c0');
    px(cx - w / 2, top, w, 8, '#cfc3ac');
    px(cx - w / 2, gy - 10, w, 10, '#b8ab90');
    bakeRoof(cx, top, w, '#7d8aa0', '#6b778c');
    px(cx - 64, top - 98, 6, 42, '#8a5a33'); // flag poles
    px(cx - 58, top - 96, 26, 16, '#e05555');
    px(cx + 58, top - 98, 6, 42, '#8a5a33');
    px(cx + 64, top - 96, 26, 16, '#3f8f3a');
    px(cx - 70, top + 14, 140, 24, '#4a4034'); // sign band
    g.fillStyle = '#f2e6c8';
    g.font = 'bold 14px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText('TOWN HALL', cx, top + 31);
    bakeWindows(cx - 110, top + 46);
    bakeWindows(cx + 82, top + 46);
    px(cx - 46, gy - 62, 14, 62, '#cfc3ac'); // columns
    px(cx + 32, gy - 62, 14, 62, '#cfc3ac');
    px(cx - 20, gy - 56, 40, 56, '#7a4a2a'); // door
    px(cx + 10, gy - 30, 6, 6, '#e8c86a');
  }

  /* CAFÉ (west-north) */
  {
    const cx = 270, gy = 390, w = 170, top = gy - 104;
    px(cx - w / 2, top, w, 104, '#efdcb4');
    px(cx - w / 2, gy - 10, w, 10, '#d9c398');
    bakeRoof(cx, top, w, '#c05a4c', '#a84a3e');
    bakeWindows(cx - 56, gy - 66);
    bakeWindows(cx + 26, gy - 66);
    px(cx - 16, gy - 48, 32, 48, '#7a4a2a');
    px(cx + 8, gy - 26, 6, 6, '#e8c86a');
    for (let i = 0; i < 10; i++) px(cx - w / 2 + 4 + i * 16, gy - 84, 16, 14, i % 2 ? '#f7f3ea' : '#e05555'); // awning
    px(cx - 30, gy - 84, 60, 14, '#4a4034');
    g.fillStyle = '#ffd98a';
    g.font = 'bold 10px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText('CAFE', cx, gy - 73);
  }

  /* ARCADE (east-north) */
  {
    const cx = 1330, gy = 390, w = 170, top = gy - 104;
    px(cx - w / 2, top, w, 104, '#4d5370');
    px(cx - w / 2, gy - 10, w, 10, '#3c4158');
    bakeRoof(cx, top, w, '#323750', '#2a2f44');
    px(cx - 62, top + 12, 124, 24, '#23273a'); // neon sign
    g.fillStyle = '#7ef3ff';
    g.font = 'bold 14px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText('ARCADE', cx, top + 30);
    for (let i = 0; i < 12; i++) px(cx - 62 + i * 11, top + 40, 4, 4, i % 2 ? '#ff7ad9' : '#7ef3ff');
    px(cx - 56, gy - 60, 24, 24, '#3c4158'); // glowing windows
    px(cx - 54, gy - 58, 20, 20, '#ffd76e');
    px(cx + 32, gy - 60, 24, 24, '#3c4158');
    px(cx + 34, gy - 58, 20, 20, '#ffd76e');
    px(cx - 16, gy - 48, 32, 48, '#23273a');
    px(cx + 8, gy - 26, 6, 6, '#ff7ad9');
  }

  /* houses (south corners) */
  const bakeHouseSmall = (cx: number) => {
    const gy = 1040, w = 150, top = gy - 96;
    px(cx - w / 2, top, w, 96, '#e3d6b6');
    px(cx - w / 2, gy - 10, w, 10, '#cbbb96');
    bakeRoof(cx, top, w, '#8a6f4e', '#75603f');
    bakeWindows(cx - 52, gy - 62);
    bakeWindows(cx + 24, gy - 62);
    px(cx - 15, gy - 44, 30, 44, '#7a4a2a');
    px(cx + 7, gy - 24, 5, 5, '#e8c86a');
    px(cx - 56, gy - 36, 28, 8, '#8a5a33'); // flower boxes
    for (let i = 0; i < 4; i++) px(cx - 54 + i * 7, gy - 42, 5, 6, i % 2 ? '#ffd24a' : '#f05a5a');
    px(cx + 20, gy - 36, 28, 8, '#8a5a33');
    for (let i = 0; i < 4; i++) px(cx + 22 + i * 7, gy - 42, 5, 6, i % 2 ? '#e88ac2' : '#f8f4ec');
  };
  bakeHouseSmall(230);
  bakeHouseSmall(1370);

  /* fences in front of the houses */
  const fence = (x0: number, x1: number, y: number) => {
    for (let x = x0; x <= x1; x += 32) px(x, y - 20, 6, 20, '#9c7647');
    px(x0, y - 16, x1 - x0 + 6, 4, '#b08a55');
    px(x0, y - 8, x1 - x0 + 6, 4, '#b08a55');
  };
  fence(90, 330, 1080);
  fence(1310, 1520, 1080);

  /* lamp posts */
  const lamp = (x: number, y: number) => {
    g.fillStyle = 'rgba(255,224,138,0.16)';
    g.beginPath();
    g.arc(x, y - 51, 26, 0, Math.PI * 2);
    g.fill();
    px(x - 3, y - 46, 7, 46, '#3a3f4a');
    px(x - 9, y - 60, 19, 16, '#2f333d');
    px(x - 5, y - 56, 11, 9, '#ffe08a');
  };
  lamp(712, 500);
  lamp(888, 500);
  lamp(576, 668);
  lamp(1024, 668);
  lamp(712, 940);
  lamp(888, 940);

  /* bushes + flower patches */
  for (const [bx, by] of [[648, 224], [952, 224], [336, 428], [1204, 428], [536, 772], [1064, 772]] as const) {
    pxEllipse(bx, by, 26, 18, '#35803b');
    px(bx - 10, by - 10, 8, 5, '#4aa044');
  }
  const flowerColors = ['#f05a5a', '#ffd24a', '#f8f4ec', '#e88ac2'];
  for (const [fx, fy] of [
    [620, 540], [980, 540], [648, 748], [952, 748],
    [392, 292], [168, 452], [1216, 292], [1436, 452],
    [150, 996], [1452, 996], [700, 1120], [900, 1120],
    [520, 800], [1080, 800],
  ] as const) {
    for (let i = 0; i < 7; i++) {
      const dx = Math.round((rand() * 56 - 28) / BG) * BG;
      const dy = Math.round((rand() * 28 - 14) / BG) * BG;
      px(fx + dx, fy + dy, 6, 6, flowerColors[Math.floor(rand() * flowerColors.length)]);
    }
  }

  townLayer = cv;
  return cv;
}
