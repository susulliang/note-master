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
 *   • Live presence — positions and status stream over the room WebSocket.
 *   • Loadouts — up to 3 collection cards from your inventory, one pet
 *     snapshot, one phrase (revealed when someone walks close).
 *   • Shared admin banners, transient square chat, showcase + challenge stubs.
 *
 * NEXT-BOARD ROADMAP (deliberate hook points, see the panels' stubs):
 *   1. Delivery secrets / open conversations — proximity-gated chat channels.
 *   2. Personal showcases — achievement/card displays at the stall.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Megaphone, MessageSquare, Palette, Trophy, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import {
  communeSocketUrl,
  createCommuneBanner,
  createCommuneSocketTicket,
  DEFAULT_AVATAR,
  fetchCardCollection,
  pickSpiceDrop,
  saveCommuneLoadout,
  type CommuneAgent,
  type CommuneAvatar,
  type CommuneBanner,
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
const GMT8_OFFSET_MS = 8 * 60 * 60 * 1000;
const PLAZA = { x: 800, y: 620, r: 300 };
const FOUNTAIN = { x: 800, y: 600, r: 96 }; // collision circle
const BOARD = { x: 800, y: 330, w: 190, h: 130 }; // bulletin board (banners)
const STALL = { x: 400, y: 730, w: 170, h: 150 }; // showcase stall
const POND_C = { x: 170, y: 640, rx: 115, ry: 75 }; // west pond (ellipse)

function smoothStep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Nightfall follows a fixed GMT+8 clock, independent of the viewer's locale. */
function getNightOpacity(timestamp: number): number {
  const gmt8 = new Date(timestamp + GMT8_OFFSET_MS);
  const hour = gmt8.getUTCHours() + gmt8.getUTCMinutes() / 60;
  const daylight = smoothStep(5.5, 7.25, hour) * (1 - smoothStep(17.5, 19.25, hour));
  return (1 - daylight) * 0.54;
}

type PropPanelKind = 'townhall' | 'store' | 'arcade' | 'banners' | 'showcase' | 'challenges';
type PanelKind = PropPanelKind | 'loadout' | 'agent' | null;

type CommuneAction =
  | { type: 'stand'; key: 'E'; label: string }
  | { type: 'challenge'; key: 'E'; label: string; personaId: string }
  | { type: 'message-agent'; key: 'E'; label: string; username: string }
  | { type: 'hold-hands'; key: 'H'; label: string; username: string }
  | { type: 'release-hands'; key: 'H'; label: string; username: string }
  | { type: 'sit'; key: 'E'; label: string; x: number; y: number }
  | { type: 'fountain'; key: 'E'; label: string }
  | { type: 'pond'; key: 'E'; label: string }
  | { type: 'serendipity'; key: 'E'; label: string; momentId: number }
  | { type: 'prop'; key: 'E'; label: string; panel: PropPanelKind };

interface FocusedNpc {
  personaId: string;
  name: string;
  x: number;
  y: number;
}

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

/** Plaza benches — E to sit, E / move keys to stand. */
const BENCHES: [number, number][] = [
  [660, 480], [940, 480], [640, 940], [960, 940],
];
const BENCH_RANGE = 54;

/** Fortunes for tossing a coin into the fountain (E near the water). */
const FORTUNES = [
  '🪙 The plaza whispers: good news is walking your way ☘',
  '🪙 A tricky caller today — patience wins spice',
  '🪙 Someone somewhere just admired your cards',
  '🪙 The ducks know something you don\u2019t…',
  '🪙 Your next QA score will make you smile',
  '🪙 A banner you hang will outlive the trend',
  '🪙 Spice comes to those who wander the square',
  '🪙 The fountain accepts your offering',
];
const FOUNTAIN_RANGE = 155;
const POND_RANGE = 155;

type SerendipityKind = 'feather' | 'clover' | 'paper-plane' | 'firefly';
interface TownSerendipity {
  id: number;
  kind: SerendipityKind;
  x: number;
  y: number;
  label: string;
  message: string;
  expiresAt: number;
}

const SERENDIPITY_SPOTS: [number, number][] = [
  [430, 520], [1170, 520], [410, 785], [1190, 785],
  [800, 870], [350, 680], [1250, 680],
];
const SERENDIPITIES: Omit<TownSerendipity, 'id' | 'x' | 'y' | 'expiresAt'>[] = [
  { kind: 'feather', label: 'Look closer at the feather', message: 'A silver feather drifted into your path. The town says hello.' },
  { kind: 'clover', label: 'Find the lucky clover', message: 'Four little leaves. One pocket-sized bit of luck.' },
  { kind: 'paper-plane', label: 'Read the tiny note', message: 'A tiny note says: “Glad you wandered by.”' },
  { kind: 'firefly', label: 'Follow the firefly', message: 'A firefly led you to a quiet corner. Take a little breath.' },
];
const SERENDIPITY_RANGE = 62;
const SERENDIPITY_LIFETIME_MS = 120_000;

/** Pixel ducks summoned by feeding the pond (E near the water). */
interface PondDuck { x: number; y: number; vx: number; phase: number; until: number }
const DUCK_LIFE_MS = 20_000;
const SPEED = 240; // player px/s
const NPC_SPEED = 90;
interface Banner extends CommuneBanner {
  hue: number;
}

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

/** Villager NPC — a stand-in wandering the square. */
const NPCS = [
  { name: 'Mocha', hue: 25, home: { x: 620, y: 760 } },
];

/** Avatar-look persistence — kept locally so the look survives refresh. */
const AVATAR_STORAGE_KEY = 'ecovacs_commune_avatar';

function loadAvatar(): CommuneAvatar {
  try {
    const raw = localStorage.getItem(AVATAR_STORAGE_KEY);
    if (raw) return { ...DEFAULT_AVATAR, ...(JSON.parse(raw) as Partial<CommuneAvatar>) };
  } catch {
    /* fall through to default */
  }
  return DEFAULT_AVATAR;
}

function saveAvatar(avatar: CommuneAvatar): void {
  try {
    localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(avatar));
  } catch {
    /* storage unavailable */
  }
}

/** Palette offered for the pixel-look swatches. */
const AVATAR_SWATCHES = [
  '#4a3728', '#8b5a2b', '#d9b380', '#b34700', '#e8c34a', '#238636',
  '#3b82f6', '#58a6ff', '#7a4fd0', '#e05252', '#ff8fab', '#f5f0e6',
  '#6b7280', '#111318',
];

/** Standing challenge NPCs — walk up and use the shared Talk action.
 *  Each runs its own persona (worker/npc/*.json, see npc-personas.ts). */
const CHALLENGE_NPCS = [
  { personaId: 'gb_poolius', name: 'GB Poolius', hue: 0, x: 1200, y: 800 },
  { personaId: 'topus_hundrius', name: 'Topus Hundrius', hue: 45, x: 960, y: 800 },
];
const CHALLENGE_INTERACT_RANGE = 92;
const CHALLENGE_HIT_RADIUS = 46;

const NPC_LINES = [
  'Fresh banners on the board!',
  'Meet at the fountain?',
  'I almost beat the spin wheel yesterday…',
  'Have you hung a banner yet?',
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

function isCommuneBanner(value: unknown): value is CommuneBanner {
  if (!value || typeof value !== 'object') return false;
  const banner = value as Record<string, unknown>;
  return typeof banner.id === 'string'
    && typeof banner.text === 'string'
    && typeof banner.author === 'string'
    && Number.isFinite(Number(banner.at));
}

function parseBanners(value: unknown): Banner[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isCommuneBanner).slice(-6).map((banner) => ({
    ...banner,
    at: Number(banner.at),
    hue: hueOf(banner.author),
  }));
}

interface Speech { text: string; until: number }

interface SquareChatMessage {
  id: string;
  from: string;
  message: string;
  at: number;
}

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
  /** Optional personalized pixel look (player + remote agents). */
  avatar?: CommuneAvatar | null;
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
  avatar: CommuneAvatar | null;
  says: Speech | null;
  moving: boolean;
  bobPhase: number;
}

interface CommuneRoomIncoming {
  type: string;
  [key: string]: unknown;
}

interface PetOwner {
  ownerId: string;
  x: number;
  y: number;
  moving: boolean;
  pet: CommunePet | null;
}

type PetBehavior = 'hangout' | 'waiting' | 'following' | 'detour' | 'catchup';
type PetPose = 'stand' | 'sit' | 'loaf' | 'sniff' | 'play';

interface PetFollower {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  ownerX: number;
  ownerY: number;
  followAt: number;
  repathAt: number;
  nextChoiceAt: number;
  behaviorUntil: number;
  sideChangeAt: number;
  side: number;
  pace: number;
  idleAngle: number;
  headingX: number;
  headingY: number;
  ownerWasMoving: boolean;
  behavior: PetBehavior;
  pose: PetPose;
  emote: 'sniff' | 'spark' | null;
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
  pose: PetPose;
  emote: 'sniff' | 'spark' | null;
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
  /** Which challenge NPC's chat the E-key opened. */
  const [challengePersona, setChallengePersona] = useState('gb_poolius');
  const [banners, setBanners] = useState<Banner[]>([]);
  const [bannerDraft, setBannerDraft] = useState('');
  const [bannerSending, setBannerSending] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [squareMessages, setSquareMessages] = useState<SquareChatMessage[]>([]);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  /* ── agent→agent interactions ──────────────────────────────────────────────── */
  /** Direct-chat target (selected from a profile or bump interaction). */
  const [messaging, setMessaging] = useState<string | null>(null);
  const messagingRef = useRef<string | null>(null);
  messagingRef.current = messaging;
  /** Banners popped by direct messages from other agents. */
  const [inbox, setInbox] = useState<{ from: string; message: string }[]>([]);
  /** Hand-holding: { partner, lead } — the first agent to press H leads. */
  const [hands, setHands] = useState<{ partner: string; lead: boolean } | null>(null);
  const handsRef = useRef<{ partner: string; lead: boolean } | null>(null);
  /** Bump screen-shake end timestamp (ms). */
  const shakeUntilRef = useRef(0);
  /** Bench seat we're sitting on (null = standing). */
  const sittingRef = useRef<{ x: number; y: number } | null>(null);
  const [nearbyActions, setNearbyActions] = useState<CommuneAction[]>([]);
  const nearbyActionsRef = useRef<CommuneAction[]>([]);
  const serendipityRef = useRef<TownSerendipity | null>(null);
  const nextSerendipityAtRef = useRef(0);
  const serendipitySequenceRef = useRef(0);
  const [focusedNpc, setFocusedNpc] = useState<FocusedNpc | null>(null);
  const focusedNpcRef = useRef<FocusedNpc | null>(null);
  const [touchControls, setTouchControls] = useState(false);
  const [movePadOpen, setMovePadOpen] = useState(false);
  const canvasPointerRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  /** Pixel ducks drifting on the pond after a feed. */
  const ducksRef = useRef<PondDuck[]>([]);
  const [chatFocused, setChatFocused] = useState(false);

  const playerRef = useRef<Agent>({ x: PLAZA.x, y: PLAZA.y + 240, name: username, hue: hueOf(username), says: null });
  playerRef.current.name = username;
  playerRef.current.hue = hueOf(username);
  const npcsRef = useRef<Agent[]>([
    ...NPCS.map((n) => ({ x: n.home.x, y: n.home.y, name: n.name, hue: n.hue, says: null, target: { ...n.home }, pauseUntil: 0, nextLineAt: Date.now() + 4000 + Math.random() * 6000, bobPhase: Math.random() * 10 })),
    // Challenge NPCs stand in place (no target/line timer).
    ...CHALLENGE_NPCS.map((c) => ({ x: c.x, y: c.y, name: c.name, hue: c.hue, says: null, bobPhase: Math.random() * 10 })),
  ]);
  const keysRef = useRef<Set<string>>(new Set());
  const clickTargetRef = useRef<{ x: number; y: number } | null>(null);
  const camRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef<PanelKind>(null);
  panelRef.current = panel;
  const chatFocusedRef = useRef(false);

  /* ── live presence (other agents) ─────────────────────────────────────────── */
  const [others, setOthers] = useState<CommuneAgent[]>([]);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const [selected, setSelected] = useState<CommuneAgent | null>(null);
  const selectedRef = useRef<CommuneAgent | null>(null);
  selectedRef.current = selected;
  const socketRef = useRef<WebSocket | null>(null);
  const lastPositionSentAtRef = useRef(0);
  const lastPositionStatusRef = useRef('');
  /** Interpolated remote walkers, keyed by username. */
  const remoteRef = useRef(
    new Map<string, {
      rx: number;
      ry: number;
      tx: number;
      ty: number;
      agent: CommuneAgent;
      moving: boolean;
      bobPhase: number;
      says: Speech | null;
    }>()
  );
  /** My current status, updated by the draw loop and sent over the room socket. */
  const statusRef = useRef('hanging out');
  const sendRoomEvent = useCallback((event: Record<string, unknown>): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify(event));
      return true;
    } catch {
      return false;
    }
  }, []);

  const publishNearbyActions = useCallback((actions: CommuneAction[]) => {
    const signature = (items: CommuneAction[]) => JSON.stringify(items);
    if (signature(nearbyActionsRef.current) === signature(actions)) return;
    nearbyActionsRef.current = actions;
    setNearbyActions(actions);
  }, []);

  useEffect(() => {
    const coarsePointer = window.matchMedia('(pointer: coarse)');
    const updateTouchMode = () => {
      setTouchControls(coarsePointer.matches || navigator.maxTouchPoints > 0);
    };
    updateTouchMode();
    coarsePointer.addEventListener('change', updateTouchMode);
    return () => coarsePointer.removeEventListener('change', updateTouchMode);
  }, []);

  /* ── my loadout ───────────────────────────────────────────────────────────── */
  const [loadout, setLoadout] = useState<CommuneLoadout>(() => ({ cards: [], pet: carriedPet(username), phrase: '', avatar: loadAvatar() }));
  const loadoutRef = useRef(loadout);
  loadoutRef.current = loadout;
  playerRef.current.pet = loadout.pet;
  playerRef.current.avatar = loadout.avatar;
  const loadoutTouchedRef = useRef(false);
  const loadoutDirtyRef = useRef(false);
  const [petChoices, setPetChoices] = useState<CommunePet[]>([]);
  const [ownedCards, setOwnedCards] = useState<TcgManifestCard[] | null>(null);
  const [cardIndex, setCardIndex] = useState<Map<string, TcgManifestCard> | null>(null);

  /* ── shared banners ──────────────────────────────────────────────────────── */

  const hangBanner = useCallback(async () => {
    const text = bannerDraft.trim();
    if (!text || bannerSending) return;
    setBannerSending(true);
    try {
      const shared = await createCommuneBanner(text);
      setBanners(parseBanners(shared));
      setBannerDraft('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to hang the banner.';
      setInbox((items) => [...items.slice(-4), { from: 'COMMUNE', message }]);
    } finally {
      setBannerSending(false);
    }
  }, [bannerDraft, bannerSending]);

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

  /** Every loadout edit marks it dirty; the debounced save persists and broadcasts it. */
  const toggleLoadoutCard = (id: string) => {
    loadoutTouchedRef.current = true;
    loadoutDirtyRef.current = true;
    setLoadout((l) => ({
      ...l,
      cards: l.cards.includes(id) ? l.cards.filter((c) => c !== id) : [...l.cards, id].slice(-3),
    }));
  };

  /** Patch the pixel look — persists locally and flags the loadout dirty. */
  const patchAvatar = (patch: Partial<CommuneAvatar>) => {
    loadoutTouchedRef.current = true;
    loadoutDirtyRef.current = true;
    setLoadout((l) => {
      const avatar = { ...(l.avatar ?? DEFAULT_AVATAR), ...patch };
      saveAvatar(avatar);
      return { ...l, avatar };
    });
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

  /* ── live room connection ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!user) return;
    let stopped = false;
    let reconnectTimer = 0;
    let reconnectAttempt = 0;
    let activeSocket: WebSocket | null = null;

    const applySnapshot = (agents: CommuneAgent[]) => {
      remoteRef.current.clear();
      for (const agent of agents) {
        remoteRef.current.set(agent.username, {
          rx: agent.x,
          ry: agent.y,
          tx: agent.x,
          ty: agent.y,
          agent,
          moving: false,
          bobPhase: Math.random() * 10,
          says: null,
        });
      }
      setOthers(agents);
      const selectedAgent = selectedRef.current;
      if (selectedAgent) {
        const fresh = agents.find((agent) => agent.username === selectedAgent.username) ?? null;
        setSelected(fresh);
        if (!fresh) setPanel(null);
      }
    };

    const upsertAgent = (agent: CommuneAgent) => {
      if (agent.username === username) return;
      const remote = remoteRef.current.get(agent.username);
      if (remote) {
        remote.tx = agent.x;
        remote.ty = agent.y;
        remote.agent = agent;
      } else {
        remoteRef.current.set(agent.username, {
          rx: agent.x,
          ry: agent.y,
          tx: agent.x,
          ty: agent.y,
          agent,
          moving: false,
          bobPhase: Math.random() * 10,
          says: null,
        });
      }
      setOthers((current) => [...current.filter((item) => item.username !== agent.username), agent]);
      if (selectedRef.current?.username === agent.username) setSelected(agent);
    };

    const removeAgent = (agentName: string) => {
      remoteRef.current.delete(agentName);
      setOthers((current) => current.filter((agent) => agent.username !== agentName));
      if (selectedRef.current?.username === agentName) {
        setSelected(null);
        setPanel(null);
      }
      if (handsRef.current?.partner === agentName) {
        handsRef.current = null;
        setHands(null);
      }
      if (messagingRef.current === agentName) setMessaging(null);
    };

    const scheduleReconnect = () => {
      if (stopped || reconnectTimer) return;
      setConnectionState('reconnecting');
      reconnectAttempt += 1;
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(reconnectAttempt - 1, 5));
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = 0;
        void connect();
      }, delay);
    };

    const connect = async () => {
      try {
        setConnectionState(reconnectAttempt ? 'reconnecting' : 'connecting');
        if (loadoutDirtyRef.current) {
          await saveCommuneLoadout(loadoutRef.current);
          loadoutDirtyRef.current = false;
        }
        if (stopped) return;
        const player = playerRef.current;
        const bootstrap = await createCommuneSocketTicket(
          Math.round(player.x),
          Math.round(player.y),
          statusRef.current,
        );
        if (stopped) return;
        dropsRef.current = bootstrap.drops.filter((drop) => !pickingRef.current.has(drop.id));
        setBanners(parseBanners(bootstrap.banners));
        let initialLoadout = loadoutRef.current;
        if (!loadoutTouchedRef.current) {
          if (bootstrap.me) {
            initialLoadout = { ...bootstrap.me, pet: bootstrap.me.pet ?? loadoutRef.current.pet };
            setLoadout(initialLoadout);
            if (!bootstrap.me.pet && initialLoadout.pet) loadoutDirtyRef.current = true;
          } else {
            loadoutDirtyRef.current = true;
            setLoadout((current) => ({ ...current }));
          }
        }

        const socket = new WebSocket(communeSocketUrl(bootstrap.ticket));
        activeSocket = socket;
        socketRef.current = socket;
        socket.onopen = () => {
          if (stopped || activeSocket !== socket) return;
          reconnectAttempt = 0;
          setConnectionState('connected');
          sendRoomEvent({ type: 'loadout', loadout: initialLoadout });
        };
        socket.onmessage = (messageEvent) => {
          if (stopped || activeSocket !== socket || typeof messageEvent.data !== 'string') return;
          let event: CommuneRoomIncoming;
          try {
            event = JSON.parse(messageEvent.data) as CommuneRoomIncoming;
          } catch {
            return;
          }
          if (event.type === 'welcome') {
            applySnapshot(Array.isArray(event.others) ? event.others as CommuneAgent[] : []);
          } else if (event.type === 'drops' && Array.isArray(event.drops)) {
            dropsRef.current = (event.drops as CommuneDrop[]).filter((drop) => !pickingRef.current.has(drop.id));
          } else if (event.type === 'agent_join' || event.type === 'agent_update') {
            if (event.agent && typeof event.agent === 'object') upsertAgent(event.agent as CommuneAgent);
          } else if (event.type === 'agent_leave' && typeof event.username === 'string') {
            removeAgent(event.username);
          } else if (event.type === 'banners') {
            setBanners(parseBanners(event.banners));
          } else if (event.type === 'public_chat') {
            const from = typeof event.from === 'string' ? event.from : '';
            const message = typeof event.message === 'string' ? event.message : '';
            if (from && message) {
              const at = Number(event.sentAt) || Date.now();
              setSquareMessages((items) => [
                ...items.slice(-7),
                { id: `${at}-${from}`, from, message, at },
              ]);
              if (from !== username) {
                const remote = remoteRef.current.get(from);
                if (remote) remote.says = { text: message, until: Date.now() + 6_000 };
              }
            }
          } else if (event.type === 'private_chat') {
            if (typeof event.from === 'string' && typeof event.message === 'string') {
              setInbox((items) => [...items.slice(-4), { from: event.from as string, message: event.message as string }]);
            }
          } else if (event.type === 'interaction') {
            const from = typeof event.from === 'string' ? event.from : '';
            if (event.kind === 'bump') {
              shakeUntilRef.current = Date.now() + 700;
            } else if (event.kind === 'hands') {
              if (!handsRef.current) {
                handsRef.current = { partner: from, lead: false };
                setHands(handsRef.current);
              }
            } else if (event.kind === 'hands_release' && handsRef.current?.partner === from) {
              handsRef.current = null;
              setHands(null);
            }
          } else if (event.type === 'error' && typeof event.message === 'string') {
            setInbox((items) => [...items.slice(-4), { from: 'COMMUNE', message: event.message as string }]);
          }
        };
        socket.onclose = () => {
          if (activeSocket !== socket) return;
          activeSocket = null;
          if (socketRef.current === socket) socketRef.current = null;
          scheduleReconnect();
        };
        socket.onerror = () => socket.close();
      } catch {
        if (!stopped) scheduleReconnect();
      }
    };
    void connect();
    const heartbeat = window.setInterval(() => sendRoomEvent({ type: 'heartbeat' }), 20_000);
    return () => {
      stopped = true;
      window.clearInterval(heartbeat);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      activeSocket?.close(1000, 'Leaving the Commune');
      if (socketRef.current === activeSocket) socketRef.current = null;
    };
  }, [sendRoomEvent, user, username]);

  useEffect(() => {
    if (!loadoutDirtyRef.current) return;
    const snapshot = JSON.stringify(loadout);
    const timer = window.setTimeout(() => {
      void saveCommuneLoadout(loadout)
        .then(() => {
          if (JSON.stringify(loadoutRef.current) === snapshot) loadoutDirtyRef.current = false;
        })
        .catch(() => {
          /* Keep the dirty flag so the next connection ticket can carry it. */
        });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [loadout]);

  const executeInteraction = useCallback((action: CommuneAction, direct = false) => {
    if (panelRef.current) return;
    if (!direct) {
      const player = playerRef.current;
      const inRange = (() => {
        switch (action.type) {
          case 'stand':
            return !!sittingRef.current;
          case 'challenge': {
            const npc = CHALLENGE_NPCS.find((item) => item.personaId === action.personaId);
            return !!npc && Math.hypot(player.x - npc.x, player.y - npc.y) < CHALLENGE_INTERACT_RANGE;
          }
          case 'message-agent': {
            const remote = remoteRef.current.get(action.username);
            return !!remote && Math.hypot(player.x - remote.rx, player.y - remote.ry) < 64;
          }
          case 'hold-hands': {
            const remote = remoteRef.current.get(action.username);
            return !handsRef.current && !!remote && Math.hypot(player.x - remote.rx, player.y - remote.ry) < 90;
          }
          case 'release-hands':
            return handsRef.current?.partner === action.username;
          case 'sit':
            return BENCHES.some(([x, y]) => x === action.x && y === action.y)
              && Math.hypot(player.x - action.x, player.y - action.y) < BENCH_RANGE;
          case 'fountain':
            return Math.hypot(player.x - FOUNTAIN.x, player.y - FOUNTAIN.y) < FOUNTAIN_RANGE;
          case 'pond':
            return Math.hypot(player.x - POND_C.x, player.y - POND_C.y) < POND_RANGE
              && Math.hypot(player.x - FOUNTAIN.x, player.y - FOUNTAIN.y) >= FOUNTAIN_RANGE;
          case 'serendipity': {
            const moment = serendipityRef.current;
            return moment?.id === action.momentId
              && Math.hypot(player.x - moment.x, player.y - moment.y) < SERENDIPITY_RANGE;
          }
          case 'prop': {
            const prop = COMMUNE_PROPS.find((item) => item.kind === action.panel);
            return !!prop && Math.hypot(player.x - prop.x, player.y - prop.y) <= prop.range;
          }
        }
      })();
      if (!inRange) return;
    }
    clickTargetRef.current = null;
    switch (action.type) {
      case 'stand':
        sittingRef.current = null;
        focusedNpcRef.current = null;
        setFocusedNpc(null);
        return;
      case 'challenge':
        focusedNpcRef.current = null;
        setFocusedNpc(null);
        setChallengePersona(action.personaId);
        setPanel('challenges');
        return;
      case 'message-agent':
        setMessaging(action.username);
        sendRoomEvent({ type: 'interaction', target: action.username, kind: 'bump' });
        window.requestAnimationFrame(() => chatInputRef.current?.focus());
        return;
      case 'hold-hands':
        handsRef.current = { partner: action.username, lead: true };
        setHands(handsRef.current);
        sendRoomEvent({ type: 'interaction', target: action.username, kind: 'hands' });
        return;
      case 'release-hands':
        handsRef.current = null;
        setHands(null);
        sendRoomEvent({ type: 'interaction', target: action.username, kind: 'hands_release' });
        return;
      case 'sit':
        sittingRef.current = { x: action.x, y: action.y - 2 };
        return;
      case 'fountain':
        playerRef.current.says = {
          text: FORTUNES[Math.floor(Math.random() * FORTUNES.length)],
          until: Date.now() + 4500,
        };
        return;
      case 'pond': {
        const now = Date.now();
        for (let i = 0; i < 3; i++) {
          ducksRef.current.push({
            x: POND_C.x + 70,
            y: POND_C.y - 30 + i * 30,
            vx: -26,
            phase: i * 2.1,
            until: now + DUCK_LIFE_MS,
          });
        }
        playerRef.current.says = { text: 'Here ducky ducky… 🍞', until: now + 3500 };
        return;
      }
      case 'serendipity': {
        const moment = serendipityRef.current;
        if (!moment || moment.id !== action.momentId) return;
        serendipityRef.current = null;
        nextSerendipityAtRef.current = Date.now() + 60_000 + Math.random() * 120_000;
        playerRef.current.says = { text: moment.message, until: Date.now() + 5200 };
        return;
      }
      case 'prop':
        setPanel(action.panel);
        return;
    }
  }, [sendRoomEvent]);

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
      if (e.code === 'KeyE' || e.code === 'KeyH') {
        if (panelRef.current) return;
        if (e.repeat) return;
        const action = nearbyActionsRef.current.find((candidate) => candidate.key === (e.code === 'KeyE' ? 'E' : 'H'));
        if (action) {
          e.preventDefault();
          executeInteraction(action);
        }
        return;
      }
      if (e.code === 'Escape' && focusedNpcRef.current) {
        clickTargetRef.current = null;
        focusedNpcRef.current = null;
        setFocusedNpc(null);
        return;
      }
      if (panelRef.current) return; // walking disabled while a panel is open
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        if (sittingRef.current) sittingRef.current = null; // moving stands up
        if (focusedNpcRef.current) {
          focusedNpcRef.current = null;
          setFocusedNpc(null);
        }
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
  }, [executeInteraction]);

  /** Nearest interactable within range. */
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
    let lightingMinute = -1;
    let nightOpacity = 0;
    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduceMotion = reduceMotionQuery.matches;
    const petFollowers = new Map<string, PetFollower>();

    const step = (now: number) => {
      raf = 0;
      if (document.hidden) return;
      if (now - lastFrame < 1000 / 30) {
        raf = requestAnimationFrame(step);
        return;
      }
      const wallNow = Date.now();
      const minute = Math.floor(wallNow / 60_000);
      if (minute !== lightingMinute) {
        lightingMinute = minute;
        nightOpacity = getNightOpacity(wallNow);
      }
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      lastFrame = now;
      const tSec = now / 1000;

      /* update player */
      const player = playerRef.current;
      const hands = handsRef.current;
      const sitting = sittingRef.current;
      if (sitting) {
        // Pinned to the bench seat; E or a move key stands up.
        player.x = sitting.x;
        player.y = sitting.y;
        player.moving = false;
      } else if (hands && !hands.lead) {
        // Follower: stay pinned beside the leader (their last synced position).
        const leader = remoteRef.current.get(hands.partner);
        if (leader) {
          const tx = leader.rx - 22;
          const ty = leader.ry + 6;
          // Smooth hard-pull (no collision — we're in the leader's walkable
          // space) so the two read as locked side by side.
          const k = 1 - Math.exp(-dt * 9);
          player.x += (tx - player.x) * k;
          player.y += (ty - player.y) * k;
          player.moving = leader.moving;
          if (leader.moving) player.bobPhase = (player.bobPhase ?? 0) + dt * 10;
        } else {
          player.moving = false;
        }
      } else if (!panelRef.current && !chatFocusedRef.current) {
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

      /* pond ducks — drift back and forth until their feed expires */
      ducksRef.current = ducksRef.current
        .filter((d) => d.until > now)
        .map((d) => {
          d.x += d.vx * dt;
          if (Math.abs(d.x - POND_C.x) > 88) d.vx *= -1;
          d.y = POND_C.y + Math.sin(now / 900 + d.phase) * 16;
          return d;
        });

      if (!nextSerendipityAtRef.current) {
        nextSerendipityAtRef.current = wallNow + 18_000 + Math.random() * 27_000;
      }
      if (serendipityRef.current && wallNow >= serendipityRef.current.expiresAt) {
        serendipityRef.current = null;
        nextSerendipityAtRef.current = wallNow + 75_000 + Math.random() * 120_000;
      }
      if (!serendipityRef.current && wallNow >= nextSerendipityAtRef.current) {
        const surprise = SERENDIPITIES[Math.floor(Math.random() * SERENDIPITIES.length)];
        const [x, y] = chooseSerendipitySpot(player.x, player.y);
        serendipityRef.current = {
          ...surprise,
          id: ++serendipitySequenceRef.current,
          x,
          y,
          expiresAt: wallNow + SERENDIPITY_LIFETIME_MS,
        };
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

      /* Resolve keyboard and touch actions from the same nearby target list. */
      const focused = focusedNpcRef.current;
      const focusedChallenge = focused
        ? CHALLENGE_NPCS.find((npc) => npc.personaId === focused.personaId) ?? null
        : null;
      const focusedDistance = focusedChallenge
        ? Math.hypot(player.x - focusedChallenge.x, player.y - focusedChallenge.y)
        : Infinity;
      const nearestChallenge = CHALLENGE_NPCS
        .map((npc) => ({ npc, distance: Math.hypot(player.x - npc.x, player.y - npc.y) }))
        .filter(({ distance }) => distance < CHALLENGE_INTERACT_RANGE)
        .sort((a, b) => a.distance - b.distance)[0]?.npc ?? null;
      const nearChallengeNpc = focusedChallenge && focusedDistance < CHALLENGE_INTERACT_RANGE
        ? focusedChallenge
        : nearestChallenge;
      const nearProp = nearestProp(player.x, player.y);
      let nearAgent: { username: string; distance: number } | null = null;
      let handAgent: { username: string; distance: number } | null = null;
      for (const remote of remoteRef.current.values()) {
        const distance = Math.hypot(player.x - remote.rx, player.y - remote.ry);
        if (distance < 64 && (!nearAgent || distance < nearAgent.distance)) {
          nearAgent = { username: remote.agent.username, distance };
        }
        if (distance < 90 && (!handAgent || distance < handAgent.distance)) {
          handAgent = { username: remote.agent.username, distance };
        }
      }
      const held = handsRef.current;
      const nearBench = !sittingRef.current
        ? BENCHES.find(([bx, by]) => Math.hypot(player.x - bx, player.y - by) < BENCH_RANGE)
        : undefined;
      const nearFountain = Math.hypot(player.x - FOUNTAIN.x, player.y - FOUNTAIN.y) < FOUNTAIN_RANGE;
      const nearPond = !nearFountain && Math.hypot(player.x - POND_C.x, player.y - POND_C.y) < POND_RANGE;
      const moment = serendipityRef.current;
      const nearSerendipity = moment
        && Math.hypot(player.x - moment.x, player.y - moment.y) < SERENDIPITY_RANGE
        ? moment
        : null;
      const actions: CommuneAction[] = [];

      if (sittingRef.current) {
        actions.push({ type: 'stand', key: 'E', label: 'Stand up' });
      } else if (nearChallengeNpc) {
        actions.push({
          type: 'challenge',
          key: 'E',
          label: `Talk to ${nearChallengeNpc.name}`,
          personaId: nearChallengeNpc.personaId,
        });
      } else if (nearSerendipity) {
        actions.push({
          type: 'serendipity',
          key: 'E',
          label: nearSerendipity.label,
          momentId: nearSerendipity.id,
        });
      } else if (nearAgent) {
        actions.push({
          type: 'message-agent',
          key: 'E',
          label: `Say hi to ${nearAgent.username}`,
          username: nearAgent.username,
        });
      } else if (nearBench) {
        actions.push({ type: 'sit', key: 'E', label: 'Sit on the bench', x: nearBench[0], y: nearBench[1] });
      } else if (nearFountain) {
        actions.push({ type: 'fountain', key: 'E', label: 'Toss a coin into the fountain' });
      } else if (nearPond) {
        actions.push({ type: 'pond', key: 'E', label: 'Feed the ducks' });
      } else if (nearProp) {
        actions.push({ type: 'prop', key: 'E', label: nearProp.label, panel: nearProp.kind });
      }

      if (held) {
        actions.push({
          type: 'release-hands',
          key: 'H',
          label: `Let go of ${held.partner}`,
          username: held.partner,
        });
      } else if (handAgent) {
        actions.push({
          type: 'hold-hands',
          key: 'H',
          label: `Hold hands with ${handAgent.username}`,
          username: handAgent.username,
        });
      }
      publishNearbyActions(actions);
      const nearKind = nearProp?.kind ?? null;
      statusRef.current = player.says
        ? 'chatting'
        : nearChallengeNpc
          ? `talking with ${nearChallengeNpc.name}`
          : nearKind === 'banners'
          ? 'reading the banners'
          : nearKind === 'showcase'
            ? 'browsing showcases'
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

      const statusChanged = statusRef.current !== lastPositionStatusRef.current;
      if (
        (player.moving && wallNow - lastPositionSentAtRef.current >= 100) ||
        statusChanged
      ) {
        if (sendRoomEvent({ type: 'move', x: Math.round(player.x), y: Math.round(player.y), status: statusRef.current })) {
          lastPositionSentAtRef.current = wallNow;
          lastPositionStatusRef.current = statusRef.current;
        }
      }

      /* remote agents: lerp toward their last reported position. While holding
       * hands as the leader, pin the partner beside us (fixed absolute slot). */
      const heldHands = handsRef.current;
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
        let vx = r.rx;
        let vy = r.ry;
        let vmoving = r.moving;
        if (heldHands && heldHands.lead && r.agent.username === heldHands.partner) {
          vx = player.x - 22;
          vy = player.y + 6;
          vmoving = !!player.moving;
        }
        remoteViews.push({
          x: vx,
          y: vy,
          name: r.agent.username,
          hue: hueOf(r.agent.username),
          phrase: r.agent.loadout?.phrase || null,
          status: r.agent.status,
          admin: r.agent.isAdmin,
          pet: r.agent.loadout?.pet ?? null,
          avatar: r.agent.loadout?.avatar ?? null,
          says: r.says,
          moving: vmoving,
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
      // Bump shake — jitter the camera for a moment when someone bumps us.
      // (rAF `now` is performance.now(); the deadline is epoch-based.)
      const shakeCam = Date.now() < shakeUntilRef.current ? { x: cam.x + (Math.random() - 0.5) * 10, y: cam.y + (Math.random() - 0.5) * 10 } : cam;
      draw(ctx, vw, vh, dpr, shakeCam, tSec, player, npcsRef.current, banners, remoteViews, petViews, reduceMotion, nightOpacity, serendipityRef.current, clickTargetRef.current, dropsRef.current, ducksRef.current);
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
  }, [banners, publishNearbyActions, sendRoomEvent]);

  /* ── pointer tap → focus a target, interact, or walk ─────────────────────── */

  const handleCanvasTap = (clientX: number, clientY: number) => {
    if (panelRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const wx = clientX - rect.left + camRef.current.x;
    const wy = clientY - rect.top + camRef.current.y;
    // A target tap also stands the player up before selecting the target.
    if (sittingRef.current) sittingRef.current = null;
    const moment = serendipityRef.current;
    if (moment && Math.hypot(wx - moment.x, wy - (moment.y - 15)) < 28) {
      focusedNpcRef.current = null;
      setFocusedNpc(null);
      const player = playerRef.current;
      if (Math.hypot(player.x - moment.x, player.y - moment.y) < SERENDIPITY_RANGE) {
        executeInteraction({
          type: 'serendipity',
          key: 'E',
          label: moment.label,
          momentId: moment.id,
        });
      } else {
        clickTargetRef.current = approachPoint(moment.x, moment.y, player.x, player.y);
      }
      return;
    }
    const challengeNpc = CHALLENGE_NPCS.find(
      (npc) => Math.hypot(wx - npc.x, wy - (npc.y - 30)) < CHALLENGE_HIT_RADIUS
    );
    if (challengeNpc) {
      const focus = { ...challengeNpc };
      focusedNpcRef.current = focus;
      setFocusedNpc(focus);
      const player = playerRef.current;
      if (Math.hypot(player.x - focus.x, player.y - focus.y) < CHALLENGE_INTERACT_RANGE - 12) {
        clickTargetRef.current = null;
      } else {
        clickTargetRef.current = approachPoint(focus.x, focus.y, player.x, player.y);
      }
      return;
    }
    // Clicking another agent opens their card (loadout: phrase, cards, pet).
    for (const r of remoteRef.current.values()) {
      if (Math.hypot(wx - r.rx, wy - (r.ry - 30)) < 42) {
        const agent = others.find((o) => o.username === r.agent.username) ?? r.agent;
        clickTargetRef.current = null;
        focusedNpcRef.current = null;
        setFocusedNpc(null);
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
      focusedNpcRef.current = null;
      setFocusedNpc(null);
      executeInteraction({ type: 'prop', key: 'E', label: hitProp.label, panel: hitProp.kind }, true);
      return;
    }
    focusedNpcRef.current = null;
    setFocusedNpc(null);
    clickTargetRef.current = { x: wx, y: wy };
  };

  const onCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    canvasPointerRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pointer = canvasPointerRef.current;
    if (!pointer || pointer.id !== event.pointerId || pointer.moved) return;
    pointer.moved = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 12;
  };

  const onCanvasPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pointer = canvasPointerRef.current;
    canvasPointerRef.current = null;
    if (!pointer || pointer.id !== event.pointerId || pointer.moved) return;
    handleCanvasTap(event.clientX, event.clientY);
  };

  const onCanvasPointerCancel = () => {
    canvasPointerRef.current = null;
  };

  const onCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    // Pointer events handle mouse and touch; keep click-only keyboard activation.
    if (event.detail !== 0) return;
    handleCanvasTap(event.clientX, event.clientY);
  };

  const speak = () => {
    const text = chatDraft.trim();
    if (!text) return;
    const recipient = messagingRef.current;
    const sent = sendRoomEvent(
      recipient
        ? { type: 'private_chat', target: recipient, message: text }
        : { type: 'public_chat', message: text },
    );
    if (!sent) {
      setInbox((items) => [...items.slice(-4), { from: 'COMMUNE', message: 'Reconnecting; your message was not sent.' }]);
      return;
    }
    playerRef.current.says = { text: text.slice(0, 90), until: Date.now() + 6000 };
    setChatDraft('');
  };

  const startDirectMessage = (target: string) => {
    setMessaging(target);
    setPanel(null);
    window.requestAnimationFrame(() => chatInputRef.current?.focus());
  };

  const bannerWords = useMemo(() => banners.map((b) => b.text), [banners]);
  const activeProp = panel ? COMMUNE_PROPS.find((prop) => prop.kind === panel) ?? null : null;
  const panelPosition = touchControls
    ? 'left-3 right-3 bottom-3 top-auto z-30 translate-x-0'
    : panel === 'loadout'
      ? 'right-4 top-4 z-20'
      : 'left-1/2 top-14 z-30 -translate-x-1/2';
  const primaryAction = nearbyActions.find((action) => action.key === 'E');
  const secondaryAction = nearbyActions.find((action) => action.key === 'H');
  const focusedNpcIsReady = !!focusedNpc && nearbyActions.some(
    (action) => action.type === 'challenge' && action.personaId === focusedNpc.personaId
  );
  const moveDirections = [
    null, { code: 'ArrowUp', label: 'Move up' }, null,
    { code: 'ArrowLeft', label: 'Move left' }, null, { code: 'ArrowRight', label: 'Move right' },
    null, { code: 'ArrowDown', label: 'Move down' }, null,
  ];

  return (
    <div ref={wrapRef} className="relative h-full min-h-full w-full overflow-hidden bg-[#607c61]">
      <canvas
        ref={canvasRef}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onPointerCancel={onCanvasPointerCancel}
        onClick={onCanvasClick}
        className="absolute inset-0 cursor-crosshair outline-none"
        role="application"
        aria-label="COMMUNE town square. Tap or click the ground to walk. Use the nearby action buttons, or WASD, arrow keys, E, and H."
        style={{ touchAction: 'manipulation' }}
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
            <span className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
              <span className={cn('size-1.5 rounded-full', connectionState === 'connected' ? 'bg-emerald-400' : 'bg-amber-400')} />
              {connectionState === 'connected' ? 'Live' : connectionState === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
            </span>
        </span>
      </div>

      {/* Focused NPC approach and shared nearby actions */}
      {!panel && (focusedNpc && !focusedNpcIsReady || nearbyActions.length > 0) && (
        <div
          aria-live="polite"
          className={cn(
            'absolute z-20 flex max-w-[calc(100%-24px)] flex-col gap-1.5 animate-in fade-in',
            touchControls
              ? 'items-end'
              : 'bottom-[4.75rem] left-1/2 -translate-x-1/2 items-center'
          )}
          style={touchControls
            ? {
                bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.25rem)',
                right: 'max(0.75rem, env(safe-area-inset-right, 0px))',
              }
            : undefined}
        >
          {focusedNpc && !focusedNpcIsReady && (
            <div className="flex items-center gap-2 rounded-xl border border-accent/40 bg-card/95 px-3 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur-xl">
              <span className="max-w-[34vw] truncate">Walking to {focusedNpc.name}</span>
              <button
                type="button"
                onClick={() => {
                  clickTargetRef.current = null;
                  focusedNpcRef.current = null;
                  setFocusedNpc(null);
                }}
                className="rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={`Cancel approach to ${focusedNpc.name}`}
              >
                Cancel
              </button>
            </div>
          )}
          {[primaryAction, secondaryAction].filter((action): action is CommuneAction => !!action).map((action) => (
            <button
              key={`${action.key}-${action.type}`}
              type="button"
              onClick={() => executeInteraction(action)}
              aria-label={`${action.label}${touchControls ? '' : `, press ${action.key}`}`}
              title={touchControls ? action.label : `${action.label} (${action.key})`}
              className={cn(
                'glass-btn flex min-h-11 max-w-[min(72vw,360px)] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold shadow-lg backdrop-blur-xl transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                touchControls && 'w-[min(46vw,220px)]',
                action.key === 'E'
                  ? 'border-primary/50 bg-card/95 text-foreground hover:border-primary'
                  : 'border-accent/40 bg-card/90 text-foreground/90 hover:border-accent'
              )}
            >
              {!touchControls && (
                <kbd className="rounded-md bg-primary px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary-foreground">
                  {action.key}
                </kbd>
              )}
              <span className="truncate">{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Optional touch D-pad; tap-to-walk remains available on the map. */}
      {touchControls && !panel && !chatFocused && (
        <div
          className="absolute z-20"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.25rem)',
            left: 'max(0.75rem, env(safe-area-inset-left, 0px))',
            touchAction: 'none',
          }}
        >
          {movePadOpen ? (
            <div
              id="commune-move-controls"
              role="group"
              aria-label="Directional movement controls"
              className="grid grid-cols-3 gap-1 rounded-2xl border border-white/25 bg-card/75 p-1.5 shadow-lg backdrop-blur-xl"
            >
              {moveDirections.map((direction, index) => direction ? (
                <button
                  key={direction.code}
                  type="button"
                  aria-label={direction.label}
                  className="grid size-10 touch-none place-items-center rounded-xl border border-border/70 bg-background/70 text-lg font-bold text-foreground shadow-sm active:scale-95 active:bg-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    keysRef.current.add(direction.code);
                    if (sittingRef.current) sittingRef.current = null;
                  }}
                  onPointerUp={() => keysRef.current.delete(direction.code)}
                  onPointerCancel={() => keysRef.current.delete(direction.code)}
                  onLostPointerCapture={() => keysRef.current.delete(direction.code)}
                >
                  {direction.code === 'ArrowUp' ? '^' : direction.code === 'ArrowDown' ? 'v' : direction.code === 'ArrowLeft' ? '<' : '>'}
                </button>
              ) : (
                <span key={`empty-${index}`} className="size-10" aria-hidden="true" />
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMovePadOpen(true)}
              className="glass-btn min-h-11 rounded-xl border border-white/25 bg-card/85 px-3 text-xs font-bold text-foreground shadow-lg backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-expanded={movePadOpen}
              aria-controls="commune-move-controls"
            >
              Move controls
            </button>
          )}
          {movePadOpen && (
            <button
              type="button"
              onClick={() => {
                keysRef.current.clear();
                setMovePadOpen(false);
              }}
              className="mt-1 w-full rounded-lg border border-border/50 bg-card/85 px-2 py-1 text-[10px] font-semibold text-muted-foreground shadow backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-expanded={true}
              aria-controls="commune-move-controls"
            >
              Hide controls
            </button>
          )}
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

      {/* Direct-message banners (from bumps / hand-holds) */}
      {inbox.length > 0 && (
        <div className="absolute left-1/2 top-16 z-30 flex w-[min(460px,calc(100%-24px))] -translate-x-1/2 flex-col gap-2">
          {inbox.map((b, i) => (
            <div
              key={`${b.from}-${i}`}
              className="flex items-start gap-2 rounded-xl border border-primary/50 bg-card/95 px-3 py-2 shadow-xl backdrop-blur-xl animate-in fade-in"
            >
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                {b.from.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-primary">{b.from}</p>
                <p className="break-words text-xs text-foreground">{b.message}</p>
              </div>
              {b.from !== 'COMMUNE' && (
                <button
                  type="button"
                  onClick={() => {
                    startDirectMessage(b.from);
                    setInbox((list) => list.filter((_, j) => j !== i));
                  }}
                  className="rounded-lg px-2 py-1 text-[10px] font-semibold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label={`Reply to ${b.from}`}
                >
                  Reply
                </button>
              )}
              <button
                type="button"
                onClick={() => setInbox((list) => list.filter((_, j) => j !== i))}
                className="rounded-lg p-1 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label="Dismiss message"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Recent square chat is kept in memory only; reconnects do not replay history. */}
      {squareMessages.length > 0 && (
        <div className="pointer-events-none absolute bottom-[7.5rem] left-1/2 z-10 w-[min(560px,calc(100%-24px))] -translate-x-1/2">
          <div
            role="log"
            aria-label="Recent square chat"
            aria-live="polite"
            className="flex max-h-36 flex-col gap-1 overflow-hidden rounded-xl border border-white/20 bg-card/85 px-3 py-2 shadow-lg backdrop-blur-md"
          >
            {squareMessages.slice(-5).map((item) => (
              <p key={item.id} className="truncate text-[11px] leading-snug text-foreground">
                <span className="mr-1.5 font-bold" style={{ color: `hsl(${hueOf(item.from)} 70% 65%)` }}>
                  {item.from}
                </span>
                {item.message}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Hand-holding indicator */}
      {hands && (
        <div className="pointer-events-none absolute bottom-[7.25rem] left-1/2 -translate-x-1/2 animate-in fade-in rounded-full border border-primary/50 bg-primary/15 px-3 py-1 text-[11px] font-bold text-primary shadow-lg backdrop-blur-xl">
          🤝 {hands.lead ? 'Leading' : 'Following'} {hands.partner}
          {touchControls ? ' · Use the action button to let go' : ' · press H to let go'}
        </div>
      )}

      {/* Chat bar — ghost glass while idle; opaque only while typing; green while
          direct-messaging an agent. */}
      <div
        className={cn(
          'absolute left-1/2 flex w-[min(560px,calc(100%-24px))] -translate-x-1/2 items-center gap-2 rounded-2xl border p-2 shadow-xl backdrop-blur-md transition-all duration-200',
          messaging
            ? 'border-primary/70 bg-card/95'
            : chatFocused || chatDraft
              ? 'border-white/30 bg-card/95'
              : 'border-white/35 bg-transparent'
        )}
        style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      >
        {messaging && (
          <button
            type="button"
            onClick={() => setMessaging(null)}
            className="ml-1 flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary transition hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            title="Stop messaging this agent"
          >
            → {messaging} <X className="size-3" />
          </button>
        )}
        <input
          ref={chatInputRef}
          value={chatDraft}
          onChange={(e) => setChatDraft(e.target.value)}
          onFocus={() => {
            chatFocusedRef.current = true;
            setChatFocused(true);
          }}
          onBlur={() => {
            chatFocusedRef.current = false;
            setChatFocused(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') speak();
            e.stopPropagation();
          }}
          placeholder={messaging ? `Send a message to ${messaging}…` : `Say something to the square, ${username}…`}
          maxLength={90}
          className="h-10 min-w-0 flex-1 rounded-xl bg-transparent px-3.5 text-sm text-foreground placeholder:text-foreground/60 focus-visible:outline-none"
        />
        <button
          type="button"
          onClick={speak}
          className={cn(
            'h-10 rounded-xl border px-4 text-xs font-bold shadow-sm transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            chatFocused || chatDraft
              ? 'border-primary/40 bg-primary text-primary-foreground hover:brightness-105'
              : 'border-white/35 bg-white/10 text-foreground/90 hover:bg-white/20'
          )}
        >
          Speak
        </button>
      </div>

      {/* ── panels ──────────────────────────────────────────────────────────── */}
      {/* The Store is its own centered modal (same one as Settings). */}
      {panel === 'store' && (
        <StorePanel spice={user?.spice ?? 0} onSpiceChange={setSpice} onClose={() => setPanel(null)} />
      )}
      {panel === 'challenges' && (
        <ChallengePanel personaId={challengePersona} onSpiceChange={setSpice} onClose={() => setPanel(null)} />
      )}
      {panel && panel !== 'store' && panel !== 'challenges' && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={activeProp?.label ?? (panel === 'loadout' ? 'My Loadout' : selected?.username ?? 'Agent details')}
          className={cn(
            'glass-panel absolute overflow-y-auto rounded-2xl border border-border/70 bg-card/95 p-4 shadow-2xl backdrop-blur-2xl',
            touchControls
              ? 'max-h-[min(78dvh,640px)] w-auto'
              : 'max-h-[min(66vh,560px)] w-[min(390px,calc(100vw-24px))]',
            panelPosition
          )}
          style={touchControls
            ? {
                bottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
                left: 'max(0.75rem, env(safe-area-inset-left, 0px))',
                right: 'max(0.75rem, env(safe-area-inset-right, 0px))',
              }
            : undefined}
        >
          <button
            type="button"
            onClick={() => setPanel(null)}
            className="absolute right-2.5 top-2.5 rounded-lg p-1.5 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>

          {activeProp && !['banners', 'showcase'].includes(activeProp.kind) && (
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
                    disabled={!bannerDraft.trim() || bannerSending}
                    className="glass-btn h-9 rounded-lg border border-primary/40 bg-primary px-3 text-[11px] font-bold text-primary-foreground transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
                  >
                    {bannerSending ? 'Posting…' : 'Hang'}
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
                onChange={(e) => {
                  loadoutTouchedRef.current = true;
                  loadoutDirtyRef.current = true;
                  setLoadout((l) => ({ ...l, phrase: e.target.value }));
                }}
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
                    onClick={() => {
                      loadoutTouchedRef.current = true;
                      loadoutDirtyRef.current = true;
                      setLoadout((l) => ({ ...l, pet: l.pet?.id === p.id ? null : { ...p } }));
                    }}
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

              {/* Pixel look personalization */}
              <p className="mt-3 mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Your look</p>
              <div className="space-y-1.5 rounded-lg border border-border/50 bg-background/20 p-2">
                {([['Hair', 'hair'], ['Shirt', 'shirt'], ['Shoes', 'shoes']] as const).map(([label, key]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-10 shrink-0 text-[10px] font-bold uppercase text-muted-foreground">{label}</span>
                    <div className="flex flex-wrap gap-1">
                      {AVATAR_SWATCHES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => patchAvatar({ [key]: c })}
                          className={cn(
                            'size-5 rounded-full border transition-transform hover:scale-110',
                            (loadout.avatar?.[key] ?? DEFAULT_AVATAR[key]) === c
                              ? 'border-foreground ring-2 ring-accent'
                              : 'border-border/60'
                          )}
                          style={{ background: c }}
                          aria-label={`${label} color ${c}`}
                        />
                      ))}
                    </div>
                    {key === 'hair' && (
                      <div className="ml-auto flex gap-1">
                        {(['short', 'long'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => patchAvatar({ hairStyle: s })}
                            className={cn(
                              'rounded-md border px-1.5 py-0.5 text-[10px] font-bold capitalize transition-colors',
                              (loadout.avatar?.hairStyle ?? DEFAULT_AVATAR.hairStyle) === s
                                ? 'border-primary/60 bg-primary/15 text-foreground'
                                : 'border-border/50 bg-background/30 text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 w-10 shrink-0 text-[10px] font-bold uppercase text-muted-foreground">Legs</span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex gap-1">
                      {(['pants', 'skirt'] as const).map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => patchAvatar({ bottom: b })}
                          className={cn(
                            'rounded-md border px-2 py-0.5 text-[10px] font-bold capitalize transition-colors',
                            (loadout.avatar?.bottom ?? DEFAULT_AVATAR.bottom) === b
                              ? 'border-primary/60 bg-primary/15 text-foreground'
                              : 'border-border/50 bg-background/30 text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {AVATAR_SWATCHES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => patchAvatar({ bottomColor: c })}
                          className={cn(
                            'size-5 rounded-full border transition-transform hover:scale-110',
                            (loadout.avatar?.bottomColor ?? DEFAULT_AVATAR.bottomColor) === c
                              ? 'border-foreground ring-2 ring-accent'
                              : 'border-border/60'
                          )}
                          style={{ background: c }}
                          aria-label={`Bottom color ${c}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
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

              <p className="mt-3 text-center text-[10px] text-muted-foreground">
                Edits save automatically ✓
              </p>
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
              <button
                type="button"
                onClick={() => startDirectMessage(selected.username)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/15 px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <MessageSquare className="size-3.5" /> Message {selected.username}
              </button>
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

function chooseSerendipitySpot(originX: number, originY: number): [number, number] {
  for (let attempt = 0; attempt < 24; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 120 + Math.random() * 190;
    const x = Math.round((originX + Math.cos(angle) * distance) / 4) * 4;
    const y = Math.round((originY + Math.sin(angle) * distance) / 4) * 4;
    const nearChallenge = CHALLENGE_NPCS.some((npc) => Math.hypot(x - npc.x, y - npc.y) < 130);
    const nearProp = COMMUNE_PROPS.some((prop) => Math.hypot(x - prop.x, y - prop.y) < 115);
    if (canOccupy(x, y, 28) && !nearChallenge && !nearProp) return [x, y];
  }

  const safeSpots = SERENDIPITY_SPOTS.filter(([x, y]) => canOccupy(x, y, 28));
  return safeSpots[Math.floor(Math.random() * safeSpots.length)] ?? [originX, originY];
}

function approachPoint(targetX: number, targetY: number, fromX: number, fromY: number) {
  const baseAngle = Math.atan2(fromY - targetY, fromX - targetX);
  for (let i = 0; i < 8; i++) {
    const angle = baseAngle + i * Math.PI / 4;
    const x = targetX + Math.cos(angle) * 58;
    const y = targetY + Math.sin(angle) * 58;
    if (canOccupy(x, y, 24)) return { x, y };
  }
  return { x: targetX + 64, y: targetY };
}

function petSpot(ownerX: number, ownerY: number, angle: number, distance: number) {
  const rings = [distance, distance * 0.78, distance * 1.2, 34, 52, 72];
  for (const radius of rings) {
    for (let i = 0; i < 12; i++) {
      const candidateAngle = angle + i * Math.PI / 6;
      const x = ownerX + Math.cos(candidateAngle) * radius;
      const y = ownerY + Math.sin(candidateAngle) * radius * 0.72;
      if (canOccupy(x, y, 12)) return { x, y };
    }
  }
  return { x: ownerX + 52, y: ownerY };
}

const petRandom = (min: number, max: number) => min + Math.random() * (max - min);

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
      const startsMoving = owner.moving;
      follower = {
        ...start,
        targetX: start.x,
        targetY: start.y,
        ownerX: owner.x,
        ownerY: owner.y,
        followAt: now + petRandom(900, 2600),
        repathAt: now + petRandom(500, 1300),
        nextChoiceAt: now + petRandom(1800, 4200),
        behaviorUntil: now + petRandom(1200, 3000),
        sideChangeAt: now + petRandom(2800, 6800),
        side: Math.random() < 0.5 ? -1 : 1,
        pace: petRandom(0.82, 1.22),
        idleAngle,
        headingX: 1,
        headingY: 0,
        ownerWasMoving: startsMoving,
        behavior: startsMoving ? 'waiting' : 'hangout',
        pose: Math.random() < 0.45 ? 'sit' : 'stand',
        emote: null,
        moving: false,
        walkPhase: Math.random() * Math.PI * 2,
        facingLeft: false,
      };
      if (startsMoving) follower.followAt = now + petRandom(700, 2400);
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
      // The owner gets a little head start while the cat decides what to do.
      follower.followAt = now + petRandom(750, 2700);
      follower.behavior = 'waiting';
      follower.behaviorUntil = follower.followAt;
      follower.pose = Math.random() < 0.5 ? 'sniff' : 'sit';
      follower.emote = follower.pose === 'sniff' ? 'sniff' : null;
      if (Math.random() < 0.42) {
        const wander = petSpot(follower.x, follower.y, Math.random() * Math.PI * 2, petRandom(18, 38));
        follower.targetX = wander.x;
        follower.targetY = wander.y;
      } else {
        follower.targetX = follower.x;
        follower.targetY = follower.y;
      }
    } else if (!owner.moving && follower.ownerWasMoving) {
      follower.behaviorUntil = now + petRandom(350, 1050);
      if (follower.behavior === 'waiting') {
        follower.followAt = now + petRandom(300, 850);
      }
    }
    follower.ownerWasMoving = owner.moving;

    const ownerDistance = Math.hypot(owner.x - follower.x, owner.y - follower.y);

    if (ownerDistance > 275) {
      follower.behavior = 'catchup';
      follower.pose = 'stand';
      follower.emote = null;
      follower.repathAt = Math.min(follower.repathAt, now);
    } else if (follower.behavior === 'catchup' && ownerDistance < 112) {
      follower.behavior = owner.moving || ownerDistance > 76 ? 'following' : 'hangout';
      follower.behaviorUntil = now + petRandom(900, 1800);
      follower.nextChoiceAt = now + petRandom(2500, 5200);
    } else if (follower.behavior === 'waiting' && now >= follower.followAt) {
      if (owner.moving || ownerDistance > 112) {
        follower.behavior = 'following';
        follower.pose = 'stand';
        follower.emote = null;
        follower.repathAt = now;
      } else {
        follower.behavior = 'hangout';
        follower.nextChoiceAt = now + petRandom(1200, 3200);
      }
    } else if (follower.behavior === 'following' && !owner.moving && ownerDistance < 76) {
      // Arrive beside the owner, then choose an unhurried little resting pose.
      follower.behavior = 'hangout';
      follower.idleAngle = Math.random() * Math.PI * 2;
      const rest = petSpot(owner.x, owner.y, follower.idleAngle, petRandom(38, 67));
      follower.targetX = rest.x;
      follower.targetY = rest.y;
      follower.pose = Math.random() < 0.32 ? 'loaf' : 'sit';
      follower.emote = null;
      follower.behaviorUntil = now + petRandom(1300, 3200);
      follower.nextChoiceAt = now + petRandom(3300, 7200);
    }

    if (follower.behavior === 'detour') {
      if (ownerDistance > 178) {
        follower.behavior = ownerDistance > 275 ? 'catchup' : 'following';
        follower.pose = 'stand';
        follower.emote = null;
        follower.repathAt = now;
      } else if (now >= follower.behaviorUntil) {
        follower.behavior = owner.moving || ownerDistance > 105 ? 'following' : 'hangout';
        follower.pose = 'stand';
        follower.emote = null;
        follower.nextChoiceAt = now + petRandom(2200, 5600);
      }
    }

    if (
      follower.behavior === 'hangout' &&
      !owner.moving &&
      ownerDistance < 122 &&
      now >= follower.nextChoiceAt
    ) {
      const roll = Math.random();
      follower.emote = null;
      follower.behaviorUntil = now + petRandom(1300, 3900);
      if (roll < 0.32) {
        follower.pose = 'loaf';
        follower.targetX = follower.x;
        follower.targetY = follower.y;
      } else if (roll < 0.62) {
        follower.pose = 'sniff';
        follower.emote = 'sniff';
        const spot = petSpot(follower.x, follower.y, Math.random() * Math.PI * 2, petRandom(20, 48));
        follower.targetX = spot.x;
        follower.targetY = spot.y;
        follower.behavior = 'detour';
      } else if (roll < 0.84) {
        follower.pose = 'play';
        follower.emote = 'spark';
        const angle = Math.random() * Math.PI * 2;
        const spot = petSpot(owner.x, owner.y, angle, petRandom(46, 78));
        follower.targetX = spot.x;
        follower.targetY = spot.y;
        follower.behavior = 'detour';
      } else {
        follower.pose = 'sit';
        follower.targetX = follower.x;
        follower.targetY = follower.y;
      }
      follower.nextChoiceAt = follower.behaviorUntil + petRandom(1800, 5100);
    }

    if (
      follower.behavior === 'hangout' &&
      ownerDistance > 135 &&
      (owner.moving || now >= follower.followAt)
    ) {
      follower.behavior = 'following';
      follower.pose = 'stand';
      follower.emote = null;
      follower.repathAt = now;
    }

    if (follower.behavior === 'hangout' && now >= follower.behaviorUntil && !owner.moving) {
      if (follower.pose === 'loaf' || follower.pose === 'sit') follower.pose = 'stand';
    }

    if (follower.behavior === 'following' || follower.behavior === 'catchup') {
      if (now >= follower.sideChangeAt) {
        if (Math.random() < 0.72) follower.side *= -1;
        follower.sideChangeAt = now + petRandom(2800, 7600);
      }
      if (now >= follower.repathAt) {
        const angle = Math.atan2(follower.headingY, follower.headingX);
        const isCatchingUp = follower.behavior === 'catchup';
        const behind = petRandom(isCatchingUp ? 8 : 18, isCatchingUp ? 26 : 48);
        const offset = petRandom(isCatchingUp ? 10 : 24, isCatchingUp ? 26 : 54);
        const anchorX = owner.x - follower.headingX * behind;
        const anchorY = owner.y - follower.headingY * behind;
        const sideAngle = angle + follower.side * Math.PI / 2;
        const target = petSpot(anchorX, anchorY, sideAngle, offset);
        follower.targetX = target.x;
        follower.targetY = target.y;
        follower.pace = petRandom(0.82, isCatchingUp ? 1.38 : 1.2);
        follower.repathAt = now + petRandom(isCatchingUp ? 500 : 850, isCatchingUp ? 950 : 1850);
      }
    }

    const oldX = follower.x;
    const oldY = follower.y;
    const dx = follower.targetX - follower.x;
    const dy = follower.targetY - follower.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 2) {
      const baseSpeed = follower.behavior === 'catchup'
        ? 205
        : follower.behavior === 'detour'
          ? 88
          : follower.behavior === 'waiting'
            ? 66
            : 112;
      const speed = Math.min(245, baseSpeed * follower.pace + distance * 0.16);
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
      follower.walkPhase += dt * (follower.behavior === 'catchup' ? 12 : 8.5) * follower.pace;
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
      pose: follower.pose,
      emote: follower.emote,
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
  nightOpacity: number,
  serendipity: TownSerendipity | null,
  destination: { x: number; y: number } | null,
  drops: CommuneDrop[] = [],
  ducks: PondDuck[] = []
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
    if (nightOpacity > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(7, 22, 70, ${nightOpacity})`;
      ctx.fillRect(cam.x, cam.y, visibleW, visibleH);
      ctx.restore();
    }
  }

  /* fountain water ripples — the basin itself is baked */
  ctx.save();
  if (nightOpacity > 0) {
    const night = nightOpacity / 0.54;
    ctx.filter = `brightness(${1 - night * 0.42}) saturate(${1 - night * 0.2})`;
  }
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
  ctx.restore();
  if (destination) drawDestinationMarker(ctx, destination.x, destination.y, t);

  /* y-sorted drawables */
  type D = { y: number; fn: () => void; bright?: boolean };
  const items: D[] = [];
  for (const [tx, ty] of TREES) items.push({ y: ty, fn: () => drawPixelTree(ctx, tx, ty) });
  for (const d of ducks) items.push({ y: d.y, fn: () => drawDuck(ctx, d, t) });
  if (serendipity) {
    items.push({
      y: serendipity.y,
      bright: true,
      fn: () => drawTownSerendipity(ctx, serendipity, t, reduceMotion),
    });
  }

  /* spice drops — pixel piles bobbing gently */
  for (const d of drops) items.push({ y: d.y, fn: () => drawSpiceDrop(ctx, d.x, d.y, t) });

  /* bulletin board (banners) */
  items.push({
    y: BOARD.y + BOARD.h / 2,
    fn: () => {
      const bx = BOARD.x;
      const by = BOARD.y;
      drawGroundShadow(ctx, bx, by + 91, 82, 14, 0.2);
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
        ctx.font = "bold 7px 'Schoolbell', ui-monospace, monospace";
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
      ctx.font = "bold 10px 'Schoolbell', ui-monospace, monospace";
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
      drawGroundShadow(ctx, sx, sy + 63, 78, 15, 0.22);
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
      ctx.font = "bold 10px 'Schoolbell', ui-monospace, monospace";
      ctx.textAlign = 'center';
      ctx.fillText('SHOWCASE', sx, sy + 79);
    },
  });

  /* entities — remotes reveal their loadout phrase when you walk close */
  for (const npc of npcs) items.push({ y: npc.y, bright: true, fn: () => drawAgent(ctx, npc, t) });
  for (const r of remotes) {
    items.push({
      y: r.y,
      bright: true,
      fn: () => {
        const near = !!r.phrase && Math.hypot(r.x - player.x, r.y - player.y) < 170;
        const speech = r.says && r.says.until > Date.now()
          ? r.says
          : near && r.phrase
            ? { text: r.phrase, until: Infinity }
            : null;
        drawAgent(
          ctx,
          { x: r.x, y: r.y, name: r.name, hue: r.hue, says: speech, status: r.status, admin: r.admin, pet: r.pet, avatar: r.avatar, moving: r.moving, bobPhase: r.bobPhase },
          t
        );
      },
    });
  }
  items.push({ y: player.y, bright: true, fn: () => drawAgent(ctx, player, t, true) });
  for (const pet of pets) {
    items.push({ y: pet.y, fn: () => drawPixelCat(ctx, pet, t, reduceMotion) });
  }

  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    ctx.save();
    if (nightOpacity > 0 && !it.bright) {
      const night = nightOpacity / 0.54;
      ctx.filter = `brightness(${1 - night * 0.42}) saturate(${1 - night * 0.2})`;
    }
    it.fn();
    ctx.restore();
  }

  ctx.restore();
}

function drawTownSerendipity(
  ctx: CanvasRenderingContext2D,
  moment: TownSerendipity,
  t: number,
  reduceMotion: boolean
) {
  const bob = reduceMotion ? 0 : Math.sin(t * 2.4 + moment.id) * 2;
  const pulse = reduceMotion ? 0.5 : 0.5 + Math.sin(t * 4.2 + moment.id) * 0.5;
  const colors: Record<SerendipityKind, string> = {
    feather: '#c4d9ee',
    clover: '#b6d18c',
    'paper-plane': '#f3d6a2',
    firefly: '#f6dc82',
  };
  ctx.save();
  ctx.translate(moment.x, moment.y - 15 + bob);
  ctx.globalAlpha = 0.72 + pulse * 0.28;
  ctx.shadowColor = colors[moment.kind];
  ctx.shadowBlur = 8 + pulse * 8;
  ctx.fillStyle = colors[moment.kind];
  ctx.fillRect(-2, -2, 4, 4);
  ctx.fillRect(-1, -7, 2, 14);
  ctx.fillRect(-7, -1, 14, 2);
  ctx.shadowBlur = 0;

  if (moment.kind === 'feather') {
    ctx.rotate(-0.5);
    ctx.fillRect(-2, -8, 4, 13);
    ctx.fillRect(-5, -5, 3, 4);
    ctx.fillRect(2, -1, 3, 4);
  } else if (moment.kind === 'clover') {
    ctx.fillRect(-5, -5, 4, 4);
    ctx.fillRect(1, -5, 4, 4);
    ctx.fillRect(-5, 1, 4, 4);
    ctx.fillRect(1, 1, 4, 4);
    ctx.fillRect(-1, 4, 2, 7);
  } else if (moment.kind === 'paper-plane') {
    ctx.beginPath();
    ctx.moveTo(-7, -5);
    ctx.lineTo(8, -1);
    ctx.lineTo(-3, 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3, 7);
    ctx.lineTo(-1, 0);
    ctx.lineTo(8, -1);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-1, -10, 2, 4);
    ctx.fillRect(-1, 6, 2, 4);
    ctx.fillRect(-10, -1, 4, 2);
    ctx.fillRect(6, -1, 4, 2);
  }
  ctx.restore();
}

function drawGroundShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  alpha = 0.18
) {
  ctx.fillStyle = `rgba(20, 20, 19, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
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
const CAT_SIT = [
  '..D....D..',
  '.DDD..DDD.',
  'DCCCCCCCCD',
  'DCEECCEECD',
  'DCCCCCCCCD',
  '.DCLNWLCD.',
  '..DCCCCD..',
  '..TCCCC..',
  '..LLLL..',
  '..........',
];
const CAT_LOAF = [
  '..........',
  '..D....D..',
  '.DDD..DDD.',
  'DCCCCCCCCD',
  'DCEECCEECD',
  'DCCCCCCCCD',
  '.DCLNWLCD.',
  'TCCCCCCCC.',
  '.CCCCCCCC.',
  '..LLLLLL..',
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

  const look = a.avatar ?? null;
  const hair = look?.hair ?? `hsl(${a.hue} 42% 30%)`;
  const hairHi = look?.hair ?? `hsl(${a.hue} 48% 42%)`;
  const skin = '#eec39a';
  const eye = '#33251b';
  const shirt = look?.shirt ?? `hsl(${a.hue} 60% 52%)`;
  const shirtSh = look?.shirt ?? `hsl(${a.hue} 60% 38%)`;
  const pants = look?.bottomColor ?? '#3f4a63';
  const shoe = look?.shoes ?? '#2a2d38';
  const palette: Record<string, string> = { h: hair, H: hairHi, S: skin, E: eye, B: shirt, b: shirtSh, s: shirtSh, a: skin, P: pants, F: shoe };

  const tpl = a.moving && Math.floor((a.bobPhase ?? 0) / 3) % 2 === 1 ? HUMAN_WALK : HUMAN_STAND;
  // Skirt: flare the lowest pants row one pixel wider on each side.
  const skirt = look?.bottom === 'skirt';
  let hemRow = -1;
  if (skirt) {
    for (let r = tpl.length - 1; r >= 0; r--) {
      if (tpl[r].includes('P')) {
        hemRow = r;
        break;
      }
    }
  }
  const ox = Math.round(a.x) - (tpl[0].length * SP_P) / 2;
  const oy = Math.round(feet) - tpl.length * SP_P;
  for (let r = 0; r < tpl.length; r++) {
    const row = tpl[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      ctx.fillStyle = palette[ch] ?? skin;
      if (r === hemRow && ch === 'P') {
        ctx.fillRect(ox + c * SP_P - SP_P, oy + r * SP_P, SP_P * 3, SP_P);
      } else {
        ctx.fillRect(ox + c * SP_P, oy + r * SP_P, SP_P, SP_P);
      }
    }
  }
  // Long hair — falls past the shoulders on both sides.
  if (look?.hairStyle === 'long') {
    for (let r = 3; r <= 10; r++) {
      ctx.fillStyle = r === 3 || r === 8 ? hairHi : hair;
      ctx.fillRect(ox + 2 * SP_P, oy + r * SP_P, SP_P, SP_P);
      ctx.fillRect(ox + 9 * SP_P, oy + r * SP_P, SP_P, SP_P);
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
  ctx.font = "bold 11px 'Schoolbell', ui-monospace, monospace";
  ctx.textAlign = 'center';
  const tag = (a.admin ? '★ ' : '') + a.name;
  const w = ctx.measureText(tag).width + 14;
  roundRect(ctx, a.x - w / 2, a.y + 12, w, 17, 8);
  ctx.fillStyle = isPlayer ? 'rgba(217,119,87,0.94)' : 'rgba(20,20,19,0.74)';
  ctx.fill();
  ctx.fillStyle = isPlayer ? '#1a1a1a' : '#fff';
  ctx.fillText(tag, a.x, a.y + 24);
  if (a.status && !isPlayer) {
    ctx.font = "9px 'Schoolbell', ui-monospace, monospace";
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
    Kitten: 0.78,
    Junior: 0.84,
    Prime: 0.9,
    Mature: 0.97,
    Elder: 1.03,
  };
  const scale = stageScale[pet.stage] ?? 0.9;
  // Slightly narrower than tall so the cats read lean, not fat.
  const cellX = SP_P * scale * 0.8;
  const cellY = SP_P * scale;
  const animated = pet.moving && !reduceMotion;
  const rows = animated
    ? (Math.floor(pet.walkPhase * 5) % 2 === 0 ? CAT_WALK_A : CAT_WALK_B)
    : pet.pose === 'loaf'
      ? CAT_LOAF
      : pet.pose === 'sit'
        ? CAT_SIT
        : CAT_STAND;
  const width = rows[0].length * cellX;
  const height = rows.length * cellY;
  const left = pet.x - width / 2;
  const bob = reduceMotion
    ? 0
    : animated
      ? Math.sin(pet.walkPhase * 2) * 1.2
      : pet.pose === 'play'
        ? Math.abs(Math.sin(t * 6 + pet.walkPhase)) * 2.5
        : Math.sin(t * 1.7 + pet.walkPhase) * 0.5;
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
        Math.round(left + col * cellX),
        Math.round(top + rowIndex * cellY),
        Math.ceil(cellX),
        Math.ceil(cellY)
      );
    }
  }
  if (pet.emote && !reduceMotion) {
    const emoteY = top - 5 - Math.sin(t * 3 + pet.walkPhase) * 2;
    if (pet.emote === 'sniff') {
      ctx.fillStyle = '#b8d9c8';
      ctx.fillRect(Math.round(pet.x + (pet.facingLeft ? -17 : 13)), Math.round(emoteY), 3, 3);
      ctx.fillRect(Math.round(pet.x + (pet.facingLeft ? -22 : 18)), Math.round(emoteY - 5), 2, 2);
      ctx.fillRect(Math.round(pet.x + (pet.facingLeft ? -25 : 21)), Math.round(emoteY + 2), 2, 2);
    } else {
      const sx = Math.round(pet.x + 15);
      const sy = Math.round(emoteY - 5);
      ctx.fillStyle = '#f0d394';
      ctx.fillRect(sx, sy - 4, 3, 11);
      ctx.fillRect(sx - 4, sy, 11, 3);
      ctx.fillStyle = '#fff2cf';
      ctx.fillRect(sx + 1, sy, 2, 3);
    }
  }
}

/** Chunky pixel oak (dynamic so it y-sorts with the agents), cached as a sprite. */
let pixelTreeSprite: HTMLCanvasElement | null = null;

function drawPixelTree(ctx: CanvasRenderingContext2D, x: number, groundY: number) {
  if (!pixelTreeSprite) {
    pixelTreeSprite = document.createElement('canvas');
    pixelTreeSprite.width = 112;
    pixelTreeSprite.height = 176;
    const treeCtx = pixelTreeSprite.getContext('2d');
    if (treeCtx) paintPixelTree(treeCtx, 56, 160);
  }
  ctx.drawImage(pixelTreeSprite, x - 56, groundY - 160);
}

function paintPixelTree(ctx: CanvasRenderingContext2D, x: number, groundY: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(x, groundY + 2, 30, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  const q = (px: number, py: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(px / 4) * 4, Math.round(py / 4) * 4, Math.round(w / 4) * 4, Math.round(h / 4) * 4);
  };
  // Trunk reaches up into the canopy (no gap → no floating look).
  q(x - 8, groundY - 72, 16, 74, '#876b54');
  q(x, groundY - 72, 8, 74, '#735944');
  q(x - 44, groundY - 104, 88, 38, '#527a58');
  q(x - 34, groundY - 128, 68, 30, '#668c63');
  q(x - 20, groundY - 150, 40, 24, '#7a9c71');
  q(x - 16, groundY - 144, 14, 8, 'rgba(255,255,255,0.18)');
}

/** A little pixel duck drifting on the pond (occasionally quacks). */
function drawDuck(ctx: CanvasRenderingContext2D, d: PondDuck, t: number) {
  const bob = Math.sin(t * 4 + d.phase) * 1.5;
  const x = Math.round(d.x);
  const y = Math.round(d.y + bob);
  const facing = d.vx >= 0 ? 1 : -1;
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.beginPath();
  ctx.ellipse(x, y + 3, 9, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // body + wing shade
  ctx.fillStyle = '#f2ede0';
  ctx.fillRect(x - 7, y - 6, 14, 7);
  ctx.fillStyle = '#ddd6c0';
  ctx.fillRect(x - 7, y - 1, 14, 2);
  // head toward the swim direction
  ctx.fillStyle = '#4a7a4f';
  ctx.fillRect(x + facing * 2 - 3, y - 13, 6, 6);
  // beak + eye
  ctx.fillStyle = '#e8a13c';
  ctx.fillRect(x + facing * 7 - 1, y - 11, 3, 2);
  ctx.fillStyle = '#1d2b1e';
  ctx.fillRect(x + facing * 3 - 1, y - 12, 2, 2);
  if ((t * 0.35 + d.phase) % 7 < 0.45) drawBubble(ctx, x, y - 20, 'quack!');
}

function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  ctx.font = "11px 'Schoolbell', ui-monospace, monospace";
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

  const pxShadow = (cx: number, cy: number, rx: number, ry: number, alpha = 0.16) => {
    g.fillStyle = `rgba(20, 20, 19, ${alpha})`;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
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
  pxShadow(PLAZA.x + 5, PLAZA.y + 16, PLAZA.r + 20, PLAZA.r * 0.72 + 20, 0.14);
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
  pxShadow(FOUNTAIN.x + 4, FOUNTAIN.y + 12, FOUNTAIN.r + 20, (FOUNTAIN.r + 20) * 0.62, 0.2);
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

  /* plaza benches (E to sit) */
  for (const [bx, by] of BENCHES) {
    pxShadow(bx + 3, by + 12, 31, 10, 0.2);
    px(bx - 26, by - 14, 52, 8, '#8a6a4a'); // backrest
    px(bx - 26, by - 4, 52, 8, '#a07a52'); // seat
    px(bx - 24, by + 4, 6, 10, '#6b4f36'); // legs
    px(bx + 18, by + 4, 6, 10, '#6b4f36');
  }

  /* pond */
  pxShadow(POND_C.x + 4, POND_C.y + 12, POND_C.rx + 20, POND_C.ry + 20, 0.19);
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
    pxShadow(cx + 8, gy + 8, w * 0.58, 18, 0.2);
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
    g.font = "bold 14px 'Schoolbell', ui-monospace, monospace";
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
    pxShadow(cx + 5, gy + 7, w * 0.62, 15, 0.2);
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
    g.font = "bold 10px 'Schoolbell', ui-monospace, monospace";
    g.textAlign = 'center';
    g.fillText('STORE', cx, gy - 73);
  }

  /* ARCADE (east-north) */
  {
    const cx = 1330, gy = 390, w = 170, top = gy - 104;
    pxShadow(cx + 5, gy + 7, w * 0.62, 15, 0.2);
    px(cx - w / 2, top, w, 104, '#56677b');
    px(cx - w / 2, gy - 10, w, 10, '#405366');
    bakeRoof(cx, top, w, '#3e4e61', '#303f51');
    px(cx - 62, top + 12, 124, 24, '#2d3949'); // arcade sign
    g.fillStyle = '#b5d8e3';
    g.font = "bold 14px 'Schoolbell', ui-monospace, monospace";
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
    pxShadow(cx + 5, gy + 7, w * 0.62, 15, 0.2);
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
    pxShadow((x0 + x1) / 2, y + 3, (x1 - x0) / 2 + 8, 7, 0.15);
    for (let x = x0; x <= x1; x += 32) px(x, y - 20, 6, 20, '#876b54');
    px(x0, y - 16, x1 - x0 + 6, 4, '#a38665');
    px(x0, y - 8, x1 - x0 + 6, 4, '#a38665');
  };
  fence(90, 330, 1080);
  fence(1310, 1520, 1080);

  /* lamp posts */
  const lamp = (x: number, y: number) => {
    pxShadow(x + 2, y + 3, 10, 4, 0.2);
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
    pxShadow(bx + 3, by + 13, 27, 8, 0.18);
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
