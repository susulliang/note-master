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
import { Building2, Megaphone, Palette, Trophy, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import {
  fetchCardCollection,
  pickSpiceDrop,
  syncCommune,
  type CommuneAgent,
  type CommuneDrop,
  type CommuneLoadout,
  type CommunePet,
} from '@/lib/auth-client';
import { CAT_CHOICES, CAT_SELECTION_STORAGE_KEY, normalizeCatId, type CatId } from '@/lib/cat-sprites';
import { loadState, petStorageKey, stageFor } from '@/lib/cat-pet';
import { TCG_COLLECTIONS, loadTcgManifest, rarityStyle, type TcgManifestCard } from '@/lib/tcg-manifest';
import StorePanel from '@/components/StorePanel';
import ChallengePanel from '@/components/ChallengePanel';

/* ── world layout ──────────────────────────────────────────────────────────── */

const WORLD_W = 1600;
const WORLD_H = 1200;
const PLAZA = { x: 800, y: 620, r: 300 };
const FOUNTAIN = { x: 800, y: 600, r: 96 }; // collision circle
const BOARD = { x: 800, y: 330, w: 190, h: 130 }; // bulletin board (banners)
const STALL = { x: 400, y: 730, w: 170, h: 150 }; // showcase stall
const TENT = { x: 1200, y: 730, w: 180, h: 160 }; // challenge tent
const POND_C = { x: 170, y: 640, rx: 115, ry: 75 }; // west pond (ellipse)
type PropPanelKind = 'townhall' | 'store' | 'arcade' | 'banners' | 'showcase' | 'challenges';
type PanelKind = PropPanelKind | 'loadout' | 'agent' | null;

interface CommuneProp {
  kind: PropPanelKind;
  label: string;
  x: number;
  y: number;
  range: number;
  hitbox: { x: number; y: number; w: number; h: number };
  description: string;
}

const COMMUNE_PROPS: CommuneProp[] = [
  {
    kind: 'townhall', label: 'Town Hall', x: 800, y: 252, range: 112,
    hitbox: { x: 650, y: 96, w: 300, h: 134 },
    description: 'The heart of the square. Stop by to see what the community is building together.',
  },
  {
    kind: 'store', label: 'Store', x: 270, y: 420, range: 102,
    hitbox: { x: 185, y: 206, w: 170, h: 184 },
    description: 'The Spice Store — spend your hard-earned spice on treats, cards, and goodies.',
  },
  {
    kind: 'arcade', label: 'Arcade', x: 1330, y: 420, range: 102,
    hitbox: { x: 1245, y: 206, w: 170, h: 184 },
    description: 'The arcade is where the square’s games and collection adventures live.',
  },
  {
    kind: 'banners', label: 'Bulletin Board', x: BOARD.x, y: BOARD.y + 60, range: 110,
    hitbox: { x: BOARD.x - BOARD.w / 2, y: BOARD.y - BOARD.h / 2, w: BOARD.w, h: BOARD.h },
    description: 'Community notes and announcements hung for everyone passing through.',
  },
  {
    kind: 'showcase', label: 'Showcase Stall', x: STALL.x + 40, y: STALL.y, range: 110,
    hitbox: { x: STALL.x - STALL.w / 2, y: STALL.y - STALL.h / 2, w: STALL.w, h: STALL.h },
    description: 'A place to show off favorite cards, milestones, and personal collections.',
  },
  {
    kind: 'challenges', label: 'Challenge Tent', x: TENT.x - 40, y: TENT.y, range: 110,
    hitbox: { x: TENT.x - TENT.w / 2, y: TENT.y - TENT.h / 2, w: TENT.w, h: TENT.h },
    description: 'Step inside the tent and take on an NPC customer challenge — talk them down to earn spice.',
  },
];
/** Solid footprints (building walls incl. roof silhouette + props). */
const SOLID_RECTS: { x: number; y: number; w: number; h: number }[] = [
  { x: 650, y: 96, w: 300, h: 134 }, // town hall
  { x: 161, y: 206, w: 170, h: 184 }, // store (west building)
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
interface Banner {
  id: string;
  text: string;
  author: string;
  at: number;
  hue: number;
}

const BANNERS_KEY = '__app_commune_banners';

/** The cat this agent already carries as their workspace companion (the
 *  "Cat companion" pick in Settings) — the loadout defaults to it so the
 *  square shows the same pet without manual setup. */
function carriedPet(username: string): CommunePet {
  let id: CatId;
  try {
    id = normalizeCatId(window.localStorage.getItem(CAT_SELECTION_STORAGE_KEY));
  } catch {
    id = 'hunao';
  }
  let st: ReturnType<typeof loadState> = null;
  try {
    st = loadState(window.localStorage.getItem(petStorageKey(username, id)));
  } catch {
    st = null;
  }
  return {
    id,
    name: CAT_CHOICES.find((c) => c.id === id)?.name ?? id,
    stage: st ? stageFor(st.xp).name : 'Kitten',
    mood: st?.mood ?? 60,
    xp: st?.xp ?? 0,
  };
}

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

/** GB Poolius — the standing challenge NPC in front of the challenge tent.
 *  No waypoint / line schedule: he paces in place, waiting for agents. */
const GB_NPC = { name: 'GB Poolius', hue: 0, x: 1160, y: 790 };
const GB_INTERACT_RANGE = 92;

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
  /** Optional pixel companion shown beside this agent. */
  pet?: CommunePet | null;
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
  pet: CommunePet | null;
  moving: boolean;
  bobPhase: number;
}

interface PetOwner {
  ownerId: string;
  x: number;
  y: number;
  moving: boolean;
  pet: CommunePet | null;
}

interface PetFollower {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  ownerX: number;
  ownerY: number;
  followAt: number;
  repathAt: number;
  side: number;
  idleAngle: number;
  headingX: number;
  headingY: number;
  ownerWasMoving: boolean;
  following: boolean;
  moving: boolean;
  walkPhase: number;
  facingLeft: boolean;
}

interface PixelPetView {
  catId: CatId;
  stage: string;
  x: number;
  y: number;
  moving: boolean;
  walkPhase: number;
  facingLeft: boolean;
}

export default function CommunePanel() {
  const { user, setSpice } = useAuth();
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
  playerRef.current.name = username;
  playerRef.current.hue = hueOf(username);
  const npcsRef = useRef<Agent[]>([
    ...NPCS.map((n) => ({ x: n.home.x, y: n.home.y, name: n.name, hue: n.hue, says: null, target: { ...n.home }, pauseUntil: 0, nextLineAt: Date.now() + 4000 + Math.random() * 6000, bobPhase: Math.random() * 10 })),
    // GB Poolius stands outside the challenge tent (no target/line timer).
    { x: GB_NPC.x, y: GB_NPC.y, name: GB_NPC.name, hue: GB_NPC.hue, says: null, bobPhase: Math.random() * 10 },
  ]);
  const keysRef = useRef<Set<string>>(new Set());
  const clickTargetRef = useRef<{ x: number; y: number } | null>(null);
  const camRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef<PanelKind>(null);
  panelRef.current = panel;
  const chatFocusedRef = useRef(false);
  const promptRef = useRef<string | null>(null);

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
  const [loadout, setLoadout] = useState<CommuneLoadout>(() => ({ cards: [], pet: carriedPet(username), phrase: '' }));
  const loadoutRef = useRef(loadout);
  loadoutRef.current = loadout;
  playerRef.current.pet = loadout.pet;
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

  /* ── spice drops on the square ────────────────────────────────────────────── */
  const dropsRef = useRef<CommuneDrop[]>([]);
  /** Ids with an in-flight or settled pickup request this session. */
  const pickingRef = useRef<Set<number>>(new Set());

  const tryPickDrop = useCallback(
    async (id: number) => {
      if (pickingRef.current.has(id)) return;
      pickingRef.current.add(id);
      dropsRef.current = dropsRef.current.filter((d) => d.id !== id);
      try {
        const out = await pickSpiceDrop(id);
        setSpice(out.spice);
        const p = playerRef.current;
        p.says = { text: '+1 spice 🌶', until: Date.now() + 2200 };
      } catch {
        /* someone else claimed it or offline — it just stays gone visually */
      }
    },
    [setSpice]
  );

  /* ── presence poll — one round-trip every 8s while the commune is open ────── */
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
          loadoutDirtyRef.current ? loadoutRef.current : undefined
        );
        if (stopped) return;
        loadoutDirtyRef.current = false;
        dropsRef.current = out.drops.filter((d) => !pickingRef.current.has(d.id));
        // First server echo fills the editor (until the user edits locally).
        // A saved loadout without a pet keeps the locally carried companion.
        if (!loadoutTouchedRef.current && out.me) {
          if (out.me.pet) setLoadout(out.me);
          else {
            setLoadout({ ...out.me, pet: loadoutRef.current.pet });
            loadoutDirtyRef.current = true; // sync the auto-picked pet on the next poll
          }
        }
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
    const iv = window.setInterval(() => void tick(), 8000);
    return () => {
      stopped = true;
      window.clearInterval(iv);
    };
  }, [user]);

  /* ── input ───────────────────────────────────────────────────────────────── */

  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && panelRef.current) {
        e.preventDefault();
        setPanel(null);
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (e.code === 'KeyE') {
        if (panelRef.current) return;
        // Talk to GB Poolius first (he stands by the challenge tent).
        const p = playerRef.current;
        if (Math.hypot(p.x - GB_NPC.x, p.y - GB_NPC.y) < GB_INTERACT_RANGE) {
          e.preventDefault();
          clickTargetRef.current = null;
          setPanel('challenges');
          return;
        }
        // Interact with the nearest prop.
        const near = proximity(p.x, p.y);
        if (near) {
          e.preventDefault();
          clickTargetRef.current = null;
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

  /** Nearest interactable within range; keeps prompts and E behavior aligned. */
  const nearestProp = (x: number, y: number) => {
    let nearest: CommuneProp | null = null;
    let nearestDistance = Infinity;
    for (const prop of COMMUNE_PROPS) {
      const distance = Math.hypot(x - prop.x, y - prop.y);
      if (distance <= prop.range && distance < nearestDistance) {
        nearest = prop;
        nearestDistance = distance;
      }
    }
    return nearest;
  };

  const proximity = (x: number, y: number): PropPanelKind | null => nearestProp(x, y)?.kind ?? null;

  /* ── main loop ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let vw = 0;
    let vh = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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
    let lastFrame = 0;
    let cameraReady = false;
    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduceMotion = reduceMotionQuery.matches;
    const petFollowers = new Map<string, PetFollower>();

    const step = (now: number) => {
      raf = 0;
      if (document.hidden) return;
      if (now - lastFrame < 1000 / 40) {
        raf = requestAnimationFrame(step);
        return;
      }
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      lastFrame = now;
      const tSec = now / 1000;

      /* update player */
      const player = playerRef.current;
      if (!panelRef.current && !chatFocusedRef.current) {
        const k = keysRef.current;
        let dx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
        let dy = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
        if (dx !== 0 || dy !== 0) clickTargetRef.current = null;
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

      /* spice pickups — walk over a pile to claim it */
      for (const d of dropsRef.current) {
        if (Math.hypot(player.x - d.x, player.y - (d.y - 8)) < 24) void tryPickDrop(d.id);
      }

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
      const targetX = Math.min(Math.max(player.x - vw / 2, 0), Math.max(0, WORLD_W - vw));
      const targetY = Math.min(Math.max(player.y - vh / 2, 0), Math.max(0, WORLD_H - vh));
      if (!cameraReady) {
        cam.x = targetX;
        cam.y = targetY;
        cameraReady = true;
      } else {
        const follow = 1 - Math.exp(-dt * 8);
        cam.x += (targetX - cam.x) * follow;
        cam.y += (targetY - cam.y) * follow;
      }

      /* interactable prompt + my status line */
      const nearProp = nearestProp(player.x, player.y);
      const nearGb = Math.hypot(player.x - GB_NPC.x, player.y - GB_NPC.y) < GB_INTERACT_RANGE;
      const nextPrompt = nearGb ? 'E  Talk to GB Poolius' : nearProp ? `E  ${nearProp.label}` : null;
      if (promptRef.current !== nextPrompt) {
        promptRef.current = nextPrompt;
        setPrompt(nextPrompt);
      }
      const nearKind = nearProp?.kind ?? null;
      statusRef.current = player.says
        ? 'chatting'
        : nearGb
          ? 'talking with GB Poolius'
          : nearKind === 'banners'
          ? 'reading the banners'
          : nearKind === 'showcase'
            ? 'browsing showcases'
            : nearKind === 'challenges'
              ? 'at the challenge tent'
        : nearKind === 'townhall'
          ? 'visiting town hall'
        : nearKind === 'store'
          ? 'at the store'
        : nearKind === 'arcade'
          ? 'at the arcade'
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
          pet: r.agent.loadout?.pet ?? null,
          moving: r.moving,
          bobPhase: r.bobPhase,
        });
      }

      const petViews = updatePetFollowers(
        [
          { ownerId: player.name, x: player.x, y: player.y, moving: !!player.moving, pet: player.pet ?? null },
          ...remoteViews.map((remote) => ({
            ownerId: remote.name,
            x: remote.x,
            y: remote.y,
            moving: remote.moving,
            pet: remote.pet,
          })),
        ],
        petFollowers,
        now,
        dt
      );
      draw(ctx, vw, vh, dpr, cam, tSec, player, npcsRef.current, banners, remoteViews, petViews, reduceMotion, clickTargetRef.current, dropsRef.current);
      raf = requestAnimationFrame(step);
    };
    const onMotionChange = (event: MediaQueryListEvent) => {
      reduceMotion = event.matches;
    };
    reduceMotionQuery.addEventListener('change', onMotionChange);
    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(step);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      reduceMotionQuery.removeEventListener('change', onMotionChange);
      ro.disconnect();
    };
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
    clickTargetRef.current = null;
        setSelected(agent);
        setPanel('agent');
        return;
      }
    }
    // Props open their panel when clicked directly.
    const hitProp = COMMUNE_PROPS.find(({ hitbox }) =>
      wx >= hitbox.x && wx <= hitbox.x + hitbox.w && wy >= hitbox.y && wy <= hitbox.y + hitbox.h
    );
    if (hitProp) {
      clickTargetRef.current = null;
      setPanel(hitProp.kind);
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
  const activeProp = panel ? COMMUNE_PROPS.find((prop) => prop.kind === panel) ?? null : null;
  const panelPosition = panel === 'loadout'
    ? 'right-4 top-4 z-20'
    : 'left-1/2 top-14 z-30 -translate-x-1/2';

  return (
    <div ref={wrapRef} className="relative h-full min-h-full w-full overflow-hidden bg-[#607c61]">
      <canvas
        ref={canvasRef}
        onClick={onCanvasClick}
        className="absolute inset-0 cursor-crosshair outline-none"
        role="application"
        aria-label="COMMUNE town square. Click to walk, use WASD or arrow keys, and press E near a place to interact."
        tabIndex={0}
      />

      {/* Compact world identity */}
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-3 rounded-2xl border border-white/35 bg-card/85 px-3.5 py-2 text-foreground shadow-lg backdrop-blur-xl">
        <span className="grid size-8 place-items-center rounded-xl bg-primary/15 text-primary">
          <Users className="size-4" />
        </span>
        <span>
          <span className="block font-mono text-[11px] font-extrabold tracking-[0.12em]">COMMUNE</span>
          <span className="block text-[10px] text-muted-foreground">Town square · {others.length + 1} here</span>
        </span>
      </div>

      {/* Interaction prompt */}
      {prompt && !panel && (
        <div className="pointer-events-none absolute bottom-[4.75rem] left-1/2 -translate-x-1/2 animate-in fade-in rounded-xl border border-primary/40 bg-card/90 px-3 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur-xl">
          <kbd className="mr-2 rounded-md bg-primary px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary-foreground">E</kbd>
          {prompt.replace(/^E\s+/, '')}
        </div>
      )}

      {/* Loadout editor button */}
      <button
        type="button"
        onClick={() => setPanel(panel === 'loadout' ? null : 'loadout')}
        className={cn(
          'glass-btn absolute right-4 top-4 z-10 flex items-center gap-2 rounded-xl border border-border/70 bg-card/85 px-3.5 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          panel === 'loadout'
            ? 'border-primary/70 bg-primary/15 text-primary'
            : ''
        )}
        title="Edit what other agents see: cards, pet, phrase"
      >
        <Palette className="size-3.5" /> <span>Loadout</span>
      </button>

      {/* Chat bar */}
      <div className="glass-panel absolute bottom-3 left-1/2 flex w-[min(560px,calc(100%-24px))] -translate-x-1/2 items-center gap-2 rounded-2xl p-2 shadow-xl">
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
          className="glass-field h-10 min-w-0 flex-1 rounded-xl border border-border/70 bg-background/75 px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <button
          type="button"
          onClick={speak}
          className="glass-btn h-10 rounded-xl border border-primary/40 bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Speak
        </button>
      </div>

      {/* ── panels ──────────────────────────────────────────────────────────── */}
      {/* The Store is its own centered modal (same one as Settings). */}
      {panel === 'store' && (
        <StorePanel spice={user?.spice ?? 0} onSpiceChange={setSpice} onClose={() => setPanel(null)} />
      )}
      {panel === 'challenges' && <ChallengePanel onSpiceChange={setSpice} onClose={() => setPanel(null)} />}
      {panel && panel !== 'store' && panel !== 'challenges' && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={activeProp?.label ?? (panel === 'loadout' ? 'My Loadout' : selected?.username ?? 'Agent details')}
          className={cn(
            'glass-panel absolute max-h-[min(66vh,560px)] w-[min(390px,calc(100vw-24px))] overflow-y-auto rounded-2xl border border-border/70 bg-card/95 p-4 shadow-2xl backdrop-blur-2xl',
            panelPosition
          )}
        >
          <button
            type="button"
            onClick={() => setPanel(null)}
            className="absolute right-2.5 top-2.5 rounded-lg p-1.5 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>

          {activeProp && !['banners', 'showcase', 'challenges'].includes(activeProp.kind) && (
            <div className="pr-7">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl bg-primary/12 text-primary">
                  <Building2 className="size-4" />
                </span>
                <div>
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">COMMUNE PLACE</p>
                  <h3 className="font-mono text-sm font-extrabold text-foreground">{activeProp.label}</h3>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{activeProp.description}</p>
              <p className="mt-4 border-t border-border/50 pt-2.5 text-[10px] text-muted-foreground/80">Press Esc to close · Keep exploring with WASD</p>
            </div>
          )}

          {panel === 'banners' && (
            <div>
              <h3 className="flex items-center gap-2 pr-6 font-mono text-sm font-extrabold text-foreground">
                <Megaphone className="size-4 text-primary" /> Town Banners
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
                    className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2"
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
                    className="glass-field h-9 min-w-0 flex-1 rounded-lg border border-border/60 bg-background/70 px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  />
                  <button
                    type="button"
                    onClick={hangBanner}
                    disabled={!bannerDraft.trim()}
                    className="glass-btn h-9 rounded-lg border border-primary/40 bg-primary px-3 text-[11px] font-bold text-primary-foreground transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
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
                <Users className="size-4 text-primary" /> Personal Showcases
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

          {panel === 'loadout' && (
            <div>
              <h3 className="flex items-center gap-2 pr-6 font-mono text-sm font-extrabold text-foreground">
                <Palette className="size-4 text-primary" /> My Loadout
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
                className="glass-field h-9 w-full rounded-lg border border-border/60 bg-background/70 px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                        ? 'border-primary/60 bg-primary/10'
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
                        loadout.cards.includes(c.id) ? 'border-primary ring-1 ring-primary/60' : 'border-transparent'
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
                className="glass-btn mt-3 h-10 w-full rounded-xl border border-primary/40 bg-primary text-sm font-bold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Save loadout
              </button>
            </div>
          )}

          {panel === 'agent' && selected && (
            <div>
              <h3 className="flex items-center gap-2 pr-6 font-mono text-sm font-extrabold text-foreground">
                {selected.isAdmin && <span className="text-primary">★</span>}
                {selected.username}
              </h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {selected.status || 'hanging out'} · seen {Math.max(1, Math.round(selected.seenAgo / 1000))}s ago
              </p>
              {selected.loadout?.phrase && (
                <blockquote className="mt-2 rounded-lg border-l-4 border-primary/60 bg-primary/10 px-3 py-2 text-xs italic text-foreground">
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
        <div className="pointer-events-none absolute left-1/2 top-4 w-[min(680px,calc(100%-200px))] -translate-x-1/2 overflow-hidden rounded-full border border-border/70 bg-card/80 py-1.5 shadow-sm backdrop-blur-xl">
          <p className="truncate text-center font-mono text-[11px] font-semibold text-primary">
            📣 {bannerWords[bannerWords.length - 1]}
          </p>
        </div>
      )}
    </div>
  );
}

/* ── movement ─────────────────────────────────────────────────────────────── */

/** Axis-separated collision checks keep diagonal walking from snagging on walls. */
function canOccupy(x: number, y: number, radius: number) {
  if (x < radius || x > WORLD_W - radius || y < radius + 120 || y > WORLD_H - radius) return false;
  if (Math.hypot(x - FOUNTAIN.x, y - FOUNTAIN.y) < FOUNTAIN.r + radius) return false;

  const pondX = (x - POND_C.x) / (POND_C.rx + radius);
  const pondY = (y - POND_C.y) / (POND_C.ry + radius);
  if (pondX * pondX + pondY * pondY < 1) return false;

  return !SOLID_RECTS.some(
    (s) =>
      x > s.x - radius &&
      x < s.x + s.w + radius &&
      y > s.y - radius &&
      y < s.y + s.h + radius
  );
}

function petSpot(ownerX: number, ownerY: number, angle: number, distance: number) {
  for (let i = 0; i < 8; i++) {
    const candidateAngle = angle + i * Math.PI / 4;
    const x = ownerX + Math.cos(candidateAngle) * distance;
    const y = ownerY + Math.sin(candidateAngle) * distance * 0.72;
    if (canOccupy(x, y, 12)) return { x, y };
  }
  return { x: ownerX + 52, y: ownerY };
}

function updatePetFollowers(
  owners: PetOwner[],
  followers: Map<string, PetFollower>,
  now: number,
  dt: number
): PixelPetView[] {
  const active = new Set<string>();
  const views: PixelPetView[] = [];

  for (const owner of owners) {
    if (!owner.pet?.id) continue;
    const key = owner.ownerId.trim().toLowerCase();
    active.add(key);
    let follower = followers.get(key);
    if (!follower) {
      const idleAngle = Math.random() * Math.PI * 2;
      const start = petSpot(owner.x, owner.y, idleAngle, 54);
      follower = {
        ...start,
        targetX: start.x,
        targetY: start.y,
        ownerX: owner.x,
        ownerY: owner.y,
        followAt: now + 650 + Math.random() * 1700,
        repathAt: 0,
        side: Math.random() < 0.5 ? -1 : 1,
        idleAngle,
        headingX: 1,
        headingY: 0,
        ownerWasMoving: owner.moving,
        following: false,
        moving: false,
        walkPhase: Math.random() * Math.PI * 2,
        facingLeft: false,
      };
      followers.set(key, follower);
    }

    const ownerDx = owner.x - follower.ownerX;
    const ownerDy = owner.y - follower.ownerY;
    if (Math.hypot(ownerDx, ownerDy) > 0.1) {
      const length = Math.hypot(ownerDx, ownerDy);
      follower.headingX = ownerDx / length;
      follower.headingY = ownerDy / length;
    }

    if (owner.moving && !follower.ownerWasMoving) {
      // Let the owner get going before the cat decides to trail after them.
      follower.followAt = now + 650 + Math.random() * 1750;
      follower.side = Math.random() < 0.5 ? -1 : 1;
      follower.following = false;
    } else if (!owner.moving && follower.ownerWasMoving) {
      follower.followAt = now + 450 + Math.random() * 900;
    }
    follower.ownerWasMoving = owner.moving;

    const ownerDistance = Math.hypot(owner.x - follower.x, owner.y - follower.y);
    if (owner.moving && now >= follower.followAt) follower.following = true;
    if (!owner.moving && ownerDistance > 105 && now >= follower.followAt) follower.following = true;

    if (follower.following && !owner.moving && ownerDistance < 82) {
      follower.following = false;
      follower.idleAngle = Math.random() * Math.PI * 2;
      const rest = petSpot(owner.x, owner.y, follower.idleAngle, 54);
      follower.targetX = rest.x;
      follower.targetY = rest.y;
    }

    const targetDistance = Math.hypot(follower.targetX - follower.x, follower.targetY - follower.y);
    if (follower.following && (now >= follower.repathAt || targetDistance < 14)) {
      let angle = follower.idleAngle;
      if (owner.moving) {
        const perpendicular = Math.atan2(follower.headingY, follower.headingX) + follower.side * Math.PI / 2;
        angle = perpendicular;
        const behindX = owner.x - follower.headingX * 10;
        const behindY = owner.y - follower.headingY * 10;
        const target = petSpot(behindX, behindY, angle, 52);
        follower.targetX = target.x;
        follower.targetY = target.y;
      } else {
        const rest = petSpot(owner.x, owner.y, angle, 54);
        follower.targetX = rest.x;
        follower.targetY = rest.y;
      }
      follower.repathAt = now + 380 + Math.random() * 520;
    }

    const oldX = follower.x;
    const oldY = follower.y;
    const dx = follower.targetX - follower.x;
    const dy = follower.targetY - follower.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 2) {
      const speed = Math.min(220, 118 + distance * 0.3);
      const travel = Math.min(distance, speed * dt);
      const nextX = follower.x + (dx / distance) * travel;
      const nextY = follower.y + (dy / distance) * travel;
      if (canOccupy(nextX, follower.y, 12)) follower.x = nextX;
      if (canOccupy(follower.x, nextY, 12)) follower.y = nextY;
    }
    const movedX = follower.x - oldX;
    const movedY = follower.y - oldY;
    follower.moving = Math.hypot(movedX, movedY) > 0.15;
    if (follower.moving) {
      follower.walkPhase += dt * 8.5;
      follower.facingLeft = movedX < -0.1;
    }
    follower.ownerX = owner.x;
    follower.ownerY = owner.y;

    views.push({
      catId: normalizeCatId(owner.pet.id),
      stage: owner.pet.stage,
      x: follower.x,
      y: follower.y,
      moving: follower.moving,
      walkPhase: follower.walkPhase,
      facingLeft: follower.facingLeft,
    });
  }

  for (const key of followers.keys()) {
    if (!active.has(key)) followers.delete(key);
  }
  return views;
}

function moveWithCollision(a: Agent, nx: number, ny: number) {
  const radius = 24;
  const clampedX = Math.min(Math.max(nx, radius), WORLD_W - radius);
  const clampedY = Math.min(Math.max(ny, radius + 120), WORLD_H - radius);
  if (canOccupy(clampedX, a.y, radius)) a.x = clampedX;
  if (canOccupy(a.x, clampedY, radius)) a.y = clampedY;
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
  remotes: RemoteView[],
  pets: PixelPetView[],
  reduceMotion: boolean,
  destination: { x: number; y: number } | null,
  drops: CommuneDrop[] = []
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, vw, vh);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  /* baked pixel town (grass, paths, plaza, buildings, pond, lamps, decor) */
  const visibleW = Math.min(vw, WORLD_W - cam.x);
  const visibleH = Math.min(vh, WORLD_H - cam.y);
  if (visibleW > 0 && visibleH > 0) {
    ctx.drawImage(getTownLayer(), cam.x, cam.y, visibleW, visibleH, cam.x, cam.y, visibleW, visibleH);
  }

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
  if (destination) drawDestinationMarker(ctx, destination.x, destination.y, t);

  /* y-sorted drawables */
  type D = { y: number; fn: () => void };
  const items: D[] = [];
  for (const [tx, ty] of TREES) items.push({ y: ty, fn: () => drawPixelTree(ctx, tx, ty) });

  /* spice drops — pixel piles bobbing gently */
  for (const d of drops) items.push({ y: d.y, fn: () => drawSpiceDrop(ctx, d.x, d.y, t) });

  /* bulletin board (banners) */
  items.push({
    y: BOARD.y + BOARD.h / 2,
    fn: () => {
      const bx = BOARD.x;
      const by = BOARD.y;
      // posts
      ctx.fillStyle = '#876b54';
      ctx.fillRect(bx - 70, by + 20, 12, 70);
      ctx.fillRect(bx + 58, by + 20, 12, 70);
      // frame + cork
      roundRect(ctx, bx - BOARD.w / 2, by - BOARD.h / 2, BOARD.w, BOARD.h, 10);
      ctx.fillStyle = '#a87f5c';
      ctx.fill();
      roundRect(ctx, bx - BOARD.w / 2 + 8, by - BOARD.h / 2 + 8, BOARD.w - 16, BOARD.h - 16, 6);
      ctx.fillStyle = '#d8b889';
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
      ctx.fillStyle = '#b88b67';
      ctx.fill();
      // poles
      ctx.fillStyle = '#8a5a33';
      ctx.fillRect(sx - STALL.w / 2 + 16, sy - 44, 8, 96);
      ctx.fillRect(sx + STALL.w / 2 - 24, sy - 44, 8, 96);
      // striped awning
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#d97757' : '#f7f3ea';
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
      ctx.fillStyle = '#d49a5b';
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
      ctx.fillStyle = '#d97757';
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
          { x: r.x, y: r.y, name: r.name, hue: r.hue, says: near && r.phrase ? { text: r.phrase, until: Infinity } : null, status: r.status, admin: r.admin, pet: r.pet, moving: r.moving, bobPhase: r.bobPhase },
          t
        );
      },
    });
  }
  items.push({ y: player.y, fn: () => drawAgent(ctx, player, t, true) });
  for (const pet of pets) {
    items.push({ y: pet.y, fn: () => drawPixelCat(ctx, pet, t, reduceMotion) });
  }

  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.fn();

  ctx.restore();
}

/** A pixel spice pile (red chili + green flecks on a wooden scoop), bobbing
 *  gently so it reads as a pickup from across the square. */
function drawSpiceDrop(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const bob = Math.round(Math.sin(t * 2.4 + x * 0.13) * 2);
  const px = 3; // pixel size — matches the town's chunky pixel look
  ctx.save();
  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + 4, 11, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  const top = y - 12 + bob;
  // scoop (wood tone)
  ctx.fillStyle = '#8a5a33';
  ctx.fillRect(x - 5 * px, top + 4 * px, 10 * px, 2 * px);
  // chili-red mound
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(x - 4 * px, top + 2 * px, 8 * px, 2 * px);
  ctx.fillRect(x - 3 * px, top + 1 * px, 6 * px, 1 * px);
  ctx.fillRect(x - 1 * px, top, 2 * px, 1 * px);
  // green flecks + a highlight
  ctx.fillStyle = '#4c9a2a';
  ctx.fillRect(x - 3 * px, top + 2 * px, px, px);
  ctx.fillRect(x + 1 * px, top + 1 * px, px, px);
  ctx.fillStyle = '#e8735a';
  ctx.fillRect(x - 2 * px, top + px, px, px);
  ctx.restore();
}

function drawDestinationMarker(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const pulse = 1 + Math.sin(t * 5) * 0.12;
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = '#d97757';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y, 13 * pulse, 7 * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#d97757';
  ctx.fillRect(Math.round(x - 2), Math.round(y - 2), 4, 4);
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

const CAT_STAND = [
  '..D....D..',
  '.DDD..DDD.',
  'DCCCCCCCCD',
  'DCEECCEECD',
  'DCCCCCCCCD',
  '.DCLNWLCD.',
  '..DCCCCD..',
  'TCCCCCCCC.',
  '.CCCCOCCC.',
  '..LL..LL..',
];
const CAT_WALK_A = [...CAT_STAND.slice(0, 9), '...LL.LL..'];
const CAT_WALK_B = [...CAT_STAND.slice(0, 9), '..LL.LL...'];

const CAT_PIXEL_PALETTES: Record<CatId, Record<string, string>> = {
  hunao: { D: '#58616a', C: '#aeb8c0', L: '#dce3e7', W: '#f4f2ec', E: '#7eaaa7', N: '#d9878f', O: '#aeb8c0', T: '#707b84' },
  siam: { D: '#3e5368', C: '#6a9bcc', L: '#b6d0e1', W: '#f1f1e9', E: '#d4bd6d', N: '#d9878f', O: '#6a9bcc', T: '#526f8b' },
  heyhey: { D: '#292c32', C: '#41444c', L: '#858993', W: '#e6e4dc', E: '#d6bd65', N: '#ce8588', O: '#41444c', T: '#33363e' },
  heyheyhey: { D: '#202228', C: '#30333a', L: '#70747d', W: '#eeeae1', E: '#cbb66a', N: '#c67d84', O: '#30333a', T: '#282b31' },
  ailu: { D: '#3f4e82', C: '#6478c2', L: '#bcc9ef', W: '#f1efe8', E: '#75a5cb', N: '#d9878f', O: '#6478c2', T: '#4f619d' },
  bella: { D: '#51483f', C: '#eee5d5', L: '#fff8e9', W: '#fffaf0', E: '#788c5d', N: '#d97757', O: '#d97757', T: '#756657' },
};

/** Pixel human with an optional cat companion and a readable identity tag. */
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
    ctx.strokeStyle = 'rgba(217,119,87,0.9)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.textAlign = 'center';
  const tag = (a.admin ? '★ ' : '') + a.name;
  const w = ctx.measureText(tag).width + 14;
  roundRect(ctx, a.x - w / 2, a.y + 12, w, 17, 8);
  ctx.fillStyle = isPlayer ? 'rgba(217,119,87,0.94)' : 'rgba(20,20,19,0.74)';
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

/** Procedural pixel cat: drawn from the same square-pixel grammar as agents. */
function drawPixelCat(ctx: CanvasRenderingContext2D, pet: PixelPetView, t: number, reduceMotion: boolean) {
  const stageScale: Record<string, number> = {
    Kitten: 0.85,
    Junior: 0.92,
    Prime: 1,
    Mature: 1.08,
    Elder: 1.15,
  };
  const scale = stageScale[pet.stage] ?? 1;
  const cell = SP_P * scale;
  const animated = pet.moving && !reduceMotion;
  const rows = animated
    ? (Math.floor(pet.walkPhase * 5) % 2 === 0 ? CAT_WALK_A : CAT_WALK_B)
    : CAT_STAND;
  const width = rows[0].length * cell;
  const height = rows.length * cell;
  const left = pet.x - width / 2;
  const bob = reduceMotion ? 0 : animated ? Math.sin(pet.walkPhase * 2) * 1.2 : Math.sin(t * 1.7 + pet.walkPhase) * 0.5;
  const top = pet.y - height + 4 + bob;
  const palette = CAT_PIXEL_PALETTES[pet.catId];

  ctx.fillStyle = 'rgba(20,20,19,0.22)';
  ctx.beginPath();
  ctx.ellipse(pet.x, pet.y + 3, width * 0.46, 5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const pixel = row[colIndex];
      if (pixel === '.') continue;
      const col = pet.facingLeft ? row.length - 1 - colIndex : colIndex;
      ctx.fillStyle = palette[pixel] ?? palette.C;
      ctx.fillRect(
        Math.round(left + col * cell),
        Math.round(top + rowIndex * cell),
        Math.ceil(cell),
        Math.ceil(cell)
      );
    }
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
  q(x - 8, groundY - 40, 16, 40, '#876b54');
  q(x, groundY - 40, 8, 40, '#735944');
  q(x - 44, groundY - 100, 88, 32, '#527a58');
  q(x - 34, groundY - 126, 68, 28, '#668c63');
  q(x - 20, groundY - 148, 40, 24, '#7a9c71');
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
      tg.fillStyle = (i + j) % 2 ? '#6a8e68' : '#759873';
      tg.fillRect(i * 8, j * 8, 8, 8);
    }
  }
  tg.fillStyle = '#5b805d';
  tg.fillRect(8, 16, 8, 8);
  tg.fillRect(24, 0, 8, 8);
  g.fillStyle = g.createPattern(tile, 'repeat')!;
  g.fillRect(0, 0, WORLD_W, WORLD_H);

  /* hedge border + corner bushes */
  px(0, 0, WORLD_W, 16, '#456b4b');
  px(0, WORLD_H - 16, WORLD_W, 16, '#456b4b');
  px(0, 0, 16, WORLD_H, '#456b4b');
  px(WORLD_W - 16, 0, 16, WORLD_H, '#456b4b');
  for (const [bx, by] of [[40, 40], [1560, 40], [40, 1160], [1560, 1160]] as const) {
    pxEllipse(bx, by, 40, 28, '#527a58');
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
      px(wx - 20, wy - 20, 40, 40, '#c8a27b');
    }
  }
  for (let i = 0; i < 260; i++) {
    const [wx, wy] = pathPts[Math.floor(rand() * pathPts.length)];
    px(wx - 20 + rand() * 40, wy - 20 + rand() * 40, 8, 8, rand() < 0.5 ? '#b68e69' : '#e2c69c');
  }

  /* plaza cobbles + fountain */
  pxEllipse(PLAZA.x, PLAZA.y, PLAZA.r + 14, PLAZA.r * 0.72 + 14, '#b3916d');
  pxEllipse(PLAZA.x, PLAZA.y, PLAZA.r, PLAZA.r * 0.72, '#e8dabb');
  for (let i = 0; i < 420; i++) {
    const a = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand());
    const wx = PLAZA.x + Math.cos(a) * rr * PLAZA.r;
    const wy = PLAZA.y + Math.sin(a) * rr * PLAZA.r * 0.72;
    g.fillStyle = rand() < 0.6 ? '#d2c19f' : '#f0e5cc';
    g.fillRect(Math.round(wx / BG) * BG, Math.round(wy / BG) * BG, BG, BG);
  }
  pxEllipse(FOUNTAIN.x, FOUNTAIN.y, FOUNTAIN.r + 16, (FOUNTAIN.r + 16) * 0.62, '#b0aea5');
  pxEllipse(FOUNTAIN.x, FOUNTAIN.y, FOUNTAIN.r, FOUNTAIN.r * 0.62, '#738ca2');
  pxEllipse(FOUNTAIN.x, FOUNTAIN.y, FOUNTAIN.r - 6, (FOUNTAIN.r - 6) * 0.62, '#6a9bcc');
  pxEllipse(FOUNTAIN.x, FOUNTAIN.y, FOUNTAIN.r - 26, (FOUNTAIN.r - 26) * 0.62, '#83b1d5');
  for (let i = 0; i < 36; i++) {
    const a = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand()) * (FOUNTAIN.r - 30);
    g.fillStyle = '#c1dfeb';
    g.fillRect(Math.round((FOUNTAIN.x + Math.cos(a) * rr) / BG) * BG, Math.round((FOUNTAIN.y + Math.sin(a) * rr * 0.6) / BG) * BG, BG, BG);
  }
  px(FOUNTAIN.x - 8, FOUNTAIN.y - 64, 16, 44, '#c8cdd6'); // pedestal
  px(FOUNTAIN.x - 16, FOUNTAIN.y - 72, 32, 10, '#d4d9e2');
  px(FOUNTAIN.x - 7, FOUNTAIN.y - 96, 14, 26, '#d4d9e2'); // statue body
  px(FOUNTAIN.x - 5, FOUNTAIN.y - 110, 10, 14, '#d4d9e2'); // statue head

  /* pond */
  pxEllipse(POND_C.x, POND_C.y, POND_C.rx + 16, POND_C.ry + 16, '#c1a17c');
  pxEllipse(POND_C.x, POND_C.y, POND_C.rx, POND_C.ry, '#6a9bcc');
  pxEllipse(POND_C.x, POND_C.y, POND_C.rx - 18, POND_C.ry - 14, '#83b1d5');
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand());
    g.fillStyle = '#c1dfeb';
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
    px(cx - w / 2, top, w, 120, '#e8dfcf');
    px(cx - w / 2, top, w, 8, '#d6cbb8');
    px(cx - w / 2, gy - 10, w, 10, '#b8a991');
    bakeRoof(cx, top, w, '#718797', '#5f7586');
    px(cx - 64, top - 98, 6, 42, '#8a5a33'); // flag poles
    px(cx - 58, top - 96, 26, 16, '#d97757');
    px(cx + 58, top - 98, 6, 42, '#8a5a33');
    px(cx + 64, top - 96, 26, 16, '#788c5d');
    px(cx - 70, top + 14, 140, 24, '#49504c'); // sign band
    g.fillStyle = '#f2e6c8';
    g.font = 'bold 14px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText('TOWN HALL', cx, top + 31);
    bakeWindows(cx - 110, top + 46);
    bakeWindows(cx + 82, top + 46);
    px(cx - 46, gy - 62, 14, 62, '#d6cbb8'); // columns
    px(cx + 32, gy - 62, 14, 62, '#d6cbb8');
    px(cx - 20, gy - 56, 40, 56, '#7a4a2a'); // door
    px(cx + 10, gy - 30, 6, 6, '#e8c86a');
  }

  /* CAFÉ (west-north) */
  {
    const cx = 270, gy = 390, w = 170, top = gy - 104;
    px(cx - w / 2, top, w, 104, '#ead9b8');
    px(cx - w / 2, gy - 10, w, 10, '#d2bd98');
    bakeRoof(cx, top, w, '#d97757', '#b85e49');
    bakeWindows(cx - 56, gy - 66);
    bakeWindows(cx + 26, gy - 66);
    px(cx - 16, gy - 48, 32, 48, '#7a4a2a');
    px(cx + 8, gy - 26, 6, 6, '#e8c86a');
    for (let i = 0; i < 10; i++) px(cx - w / 2 + 4 + i * 16, gy - 84, 16, 14, i % 2 ? '#f7f3ea' : '#d97757'); // awning
    px(cx - 30, gy - 84, 60, 14, '#49504c');
    g.fillStyle = '#f2dfb8';
    g.font = 'bold 10px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText('STORE', cx, gy - 73);
  }

  /* ARCADE (east-north) */
  {
    const cx = 1330, gy = 390, w = 170, top = gy - 104;
    px(cx - w / 2, top, w, 104, '#56677b');
    px(cx - w / 2, gy - 10, w, 10, '#405366');
    bakeRoof(cx, top, w, '#3e4e61', '#303f51');
    px(cx - 62, top + 12, 124, 24, '#2d3949'); // arcade sign
    g.fillStyle = '#b5d8e3';
    g.font = 'bold 14px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText('ARCADE', cx, top + 30);
    for (let i = 0; i < 12; i++) px(cx - 62 + i * 11, top + 40, 4, 4, i % 2 ? '#d9879a' : '#9ec9d9');
    px(cx - 56, gy - 60, 24, 24, '#354758'); // glowing windows
    px(cx - 54, gy - 58, 20, 20, '#d6b875');
    px(cx + 32, gy - 60, 24, 24, '#354758');
    px(cx + 34, gy - 58, 20, 20, '#d6b875');
    px(cx - 16, gy - 48, 32, 48, '#2d3949');
    px(cx + 8, gy - 26, 6, 6, '#d9879a');
  }

  /* houses (south corners) */
  const bakeHouseSmall = (cx: number) => {
    const gy = 1040, w = 150, top = gy - 96;
    px(cx - w / 2, top, w, 96, '#e4d9c5');
    px(cx - w / 2, gy - 10, w, 10, '#cbb99b');
    bakeRoof(cx, top, w, '#8f7560', '#755e4d');
    bakeWindows(cx - 52, gy - 62);
    bakeWindows(cx + 24, gy - 62);
    px(cx - 15, gy - 44, 30, 44, '#7a4a2a');
    px(cx + 7, gy - 24, 5, 5, '#e8c86a');
    px(cx - 56, gy - 36, 28, 8, '#876b54'); // flower boxes
    for (let i = 0; i < 4; i++) px(cx - 54 + i * 7, gy - 42, 5, 6, i % 2 ? '#d6b875' : '#d97757');
    px(cx + 20, gy - 36, 28, 8, '#876b54');
    for (let i = 0; i < 4; i++) px(cx + 22 + i * 7, gy - 42, 5, 6, i % 2 ? '#d9879a' : '#f7f3ea');
  };
  bakeHouseSmall(230);
  bakeHouseSmall(1370);

  /* fences in front of the houses */
  const fence = (x0: number, x1: number, y: number) => {
    for (let x = x0; x <= x1; x += 32) px(x, y - 20, 6, 20, '#876b54');
    px(x0, y - 16, x1 - x0 + 6, 4, '#a38665');
    px(x0, y - 8, x1 - x0 + 6, 4, '#a38665');
  };
  fence(90, 330, 1080);
  fence(1310, 1520, 1080);

  /* lamp posts */
  const lamp = (x: number, y: number) => {
    g.fillStyle = 'rgba(255,224,138,0.16)';
    g.beginPath();
    g.arc(x, y - 51, 26, 0, Math.PI * 2);
    g.fill();
    px(x - 3, y - 46, 7, 46, '#46525a');
    px(x - 9, y - 60, 19, 16, '#36414a');
    px(x - 5, y - 56, 11, 9, '#f0d394');
  };
  lamp(712, 500);
  lamp(888, 500);
  lamp(576, 668);
  lamp(1024, 668);
  lamp(712, 940);
  lamp(888, 940);

  /* bushes + flower patches */
  for (const [bx, by] of [[648, 224], [952, 224], [336, 428], [1204, 428], [536, 772], [1064, 772]] as const) {
    pxEllipse(bx, by, 26, 18, '#527a58');
    px(bx - 10, by - 10, 8, 5, '#6b9567');
  }
  const flowerColors = ['#d97757', '#d6b875', '#f7f3ea', '#d9879a'];
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
