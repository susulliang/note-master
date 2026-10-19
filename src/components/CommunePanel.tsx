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

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Armchair,
  BookOpen,
  Building2,
  CalendarDays,
  CarFront,
  Coins,
  DoorOpen,
  Fish,
  GraduationCap,
  Gamepad2,
  Hand,
  MessageCircle,
  Megaphone,
  MessageSquare,
  Palette,
  Search,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import {
  communeSocketUrl,
  createCommuneBanner,
  createCommuneSocketTicket,
  DEFAULT_AVATAR,
  fetchCommuneTreeholeFeedback,
  fetchCardCollection,
  pickSpiceDrop,
  refreshCommuneSpiceDrops,
  saveCommuneLoadout,
  submitCommuneTreeholeFeedback,
  type CommuneAgent,
  type CommuneAvatar,
  type CommuneBanner,
  type CommuneDrop,
  type CommuneLoadout,
  type CommunePet,
  type CommuneTreeholeCategory,
  type CommuneTreeholeEntry,
} from '@/lib/auth-client';
import { CAT_CHOICES, CAT_SELECTION_STORAGE_KEY, normalizeCatId, type CatId } from '@/lib/cat-sprites';
import { loadState, petStorageKey, stageFor } from '@/lib/cat-pet';
import { TCG_COLLECTIONS, loadTcgManifest, rarityStyle, type TcgManifestCard } from '@/lib/tcg-manifest';
import StorePanel from '@/components/StorePanel';
import ChallengePanel from '@/components/ChallengePanel';
import { getRoster, ROSTER_MONTHS } from '@/data/roster-index';
import type { RosterAgent } from '@/data/roster';
import { fetchRosterMonth, subscribeRosterMonth, type RosterCell } from '@/lib/roster-sync';
import { loadFaqAnswer, searchLoadedFaqs } from '@/utils/faqData';
import type { FaqSearchHit } from '@/utils/productData';

const SelfTestWorkspace = lazy(() => import('@/components/SelfTestWorkspace'));

/* ── world layout ──────────────────────────────────────────────────────────── */

const WORLD_W = 3200;
const WORLD_H = 2400;
const GMT8_OFFSET_MS = 8 * 60 * 60 * 1000;
const PLAZA = { x: 800, y: 620, r: 300 };
const FOUNTAIN = { x: 800, y: 600, r: 96 }; // collision circle
const BOARD = { x: 800, y: 330, w: 190, h: 130 }; // bulletin board (banners)
const STALL = { x: 400, y: 730, w: 170, h: 150 }; // showcase stall
const POND_C = { x: 170, y: 640, rx: 115, ry: 75 }; // west pond (ellipse)
const DUCK_LAGOON = { x: 2580, y: 790, rx: 150, ry: 102 };
const PONDS = [
  { id: 'town-pond', ...POND_C },
  { id: 'duck-lagoon', ...DUCK_LAGOON },
] as const;

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

function gmt8DateKey(timestamp = Date.now()): string {
  return new Date(timestamp + GMT8_OFFSET_MS).toISOString().slice(0, 10);
}

function isRosterOffDay(code: string): boolean {
  return !code || /^(OFF|PH|AL|休息|病假|事假|年假|产假|调休|Farewell)$/i.test(code);
}

type PropPanelKind = 'townhall' | 'store' | 'arcade' | 'banners' | 'showcase' | 'challenges';
type PanelKind = PropPanelKind | 'loadout' | 'agent' | 'quiz' | 'treehole' | null;
type BoardTab = 'roster' | 'announcements';
type CommuneCarId = 'meadow-cruiser' | 'orchard-wagon';

interface ParkedCar {
  id: CommuneCarId;
  label: string;
  x: number;
  y: number;
  heading: number;
  targetX: number;
  targetY: number;
  targetHeading: number;
  body: string;
  trim: string;
}

const PARKED_CARS: ParkedCar[] = [
  { id: 'meadow-cruiser', label: 'Meadow Coupe', x: 1740, y: 820, heading: 0, targetX: 1740, targetY: 820, targetHeading: 0, body: '#6288a4', trim: '#d5e2e7' },
  { id: 'orchard-wagon', label: 'Orchard Coupe', x: 2300, y: 1880, heading: 0, targetX: 2300, targetY: 1880, targetHeading: 0, body: '#b76552', trim: '#f0d7b3' },
];
const CAR_HALF_WIDTH = 39;
const CAR_HALF_LENGTH = 59;
const CAR_EXIT_DISTANCE = 100;
function carHalfExtents(heading: number) {
  return {
    x: Math.abs(Math.cos(heading)) * CAR_HALF_WIDTH + Math.abs(Math.sin(heading)) * CAR_HALF_LENGTH,
    y: Math.abs(Math.sin(heading)) * CAR_HALF_WIDTH + Math.abs(Math.cos(heading)) * CAR_HALF_LENGTH,
  };
}
const TREEHOLE = { x: 1480, y: 1440, range: 108 };

interface CommunePanelProps {
  onCatThought?: (text: string, ttl?: number) => void;
  onCatMoveTo?: (position: { x: number; y: number }) => void;
}

type CommuneAction =
  | { type: 'stand'; key: 'E'; label: string }
  | { type: 'challenge'; key: 'E'; label: string; personaId: string }
  | { type: 'message-agent'; key: 'E'; label: string; username: string }
  | { type: 'hold-hands'; key: 'H'; label: string; username: string }
  | { type: 'release-hands'; key: 'H'; label: string; username: string }
  | { type: 'enter-car'; key: 'E'; label: string; carId: CommuneCarId }
  | { type: 'exit-car'; key: 'E'; label: string }
  | { type: 'sit'; key: 'E'; label: string; x: number; y: number }
  | { type: 'fountain'; key: 'E'; label: string }
  | { type: 'pond'; key: 'E'; label: string; pondId: (typeof PONDS)[number]['id'] }
  | { type: 'serendipity'; key: 'E'; label: string; momentId: number }
  | { type: 'world-object'; key: 'E'; label: string; objectId: CommuneWorldObjectId }
  | { type: 'duck-incident'; key: 'E'; label: string; incidentId: number }
  | { type: 'prop'; key: 'E'; label: string; panel: PropPanelKind };

function touchActionIcon(action: CommuneAction) {
  switch (action.type) {
    case 'enter-car': return <CarFront className="size-6" />;
    case 'exit-car': return <DoorOpen className="size-6" />;
    case 'sit':
    case 'stand': return <Armchair className="size-6" />;
    case 'challenge': return <Gamepad2 className="size-6" />;
    case 'message-agent': return <MessageCircle className="size-6" />;
    case 'hold-hands':
    case 'release-hands': return <Hand className="size-6" />;
    case 'fountain': return <Coins className="size-6" />;
    case 'pond': return <Fish className="size-6" />;
    case 'serendipity':
    case 'duck-incident':
    case 'world-object': return <Sparkles className="size-6" />;
    case 'prop': return <Building2 className="size-6" />;
  }
}

function touchActionLabel(action: CommuneAction): string {
  switch (action.type) {
    case 'enter-car': return 'Drive';
    case 'exit-car': return 'Leave car';
    case 'sit': return 'Sit';
    case 'stand': return 'Stand';
    case 'challenge': return 'Talk';
    case 'message-agent': return 'Chat';
    case 'hold-hands': return 'Hold hands';
    case 'release-hands': return 'Let go';
    case 'fountain': return 'Toss coin';
    case 'pond': return 'Feed ducks';
    case 'serendipity': return 'Discover';
    case 'duck-incident': return 'Ask duck';
    case 'world-object': return 'Explore';
    case 'prop': return 'Open';
  }
}

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
    description: 'The town library is open. Search product guides, common symptoms, and troubleshooting answers.',
  },
  {
    kind: 'store', label: 'Store', x: 270, y: 420, range: 102,
    hitbox: { x: 185, y: 206, w: 170, h: 184 },
    description: 'The Spice Store — spend your hard-earned spice on treats, cards, and goodies.',
  },
  {
    kind: 'arcade', label: 'Arcade', x: 1330, y: 420, range: 102,
    hitbox: { x: 1245, y: 206, w: 170, h: 184 },
    description: 'Practice tricky customer conversations, take a knowledge quest, and earn spice.',
  },
  {
    kind: 'banners', label: 'Roster Board', x: BOARD.x, y: BOARD.y + 60, range: 110,
    hitbox: { x: BOARD.x - BOARD.w / 2, y: BOARD.y - BOARD.h / 2, w: BOARD.w, h: BOARD.h },
    description: 'Check today’s shift coverage, look up a teammate, or browse upcoming schedules and town news.',
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
  { x: 2318, y: 674, w: 64, h: 38 }, // duck post box
  { x: 1840, y: 1314, w: 62, h: 36 }, // mushroom throne
  { x: 2672, y: 1746, w: 56, h: 46 }, // star scope
  { x: 736, y: 312, w: 128, h: 36 }, // bulletin board posts
  { x: 330, y: 742, w: 140, h: 36 }, // showcase counter
  { x: 90, y: 1062, w: 246, h: 18 }, // west fence
  { x: 1310, y: 1062, w: 216, h: 18 }, // east fence
  { x: TREEHOLE.x - 26, y: TREEHOLE.y - 54, w: 52, h: 54 }, // treehole oak trunk
];
/** Oaks drawn dynamically (y-sorted with agents). */
const TREES: [number, number][] = [
  [480, 208], [1120, 208], [560, 260], [1040, 260],
  [64, 470], [1536, 470], [64, 872], [1536, 872],
  [600, 1128], [1000, 1128],
];
/** Distant groves are baked into the map so they do not add per-frame sorting work. */
const REMOTE_TREES: [number, number][] = [
  [1740, 250], [1830, 310], [1940, 235], [2070, 285], [2180, 220],
  [2350, 310], [2480, 250], [2800, 240], [2940, 310],
  [1670, 1120], [1780, 1080], [1900, 1120], [2050, 1150],
  [1630, 2050], [1760, 2110], [1900, 2040], [2050, 2120],
  [2290, 2220], [2460, 2130], [2660, 2200], [2840, 2110], [3000, 2210],
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

type SerendipityKind = 'feather' | 'clover' | 'paper-plane' | 'firefly' | 'treasure' | 'rubber-duck';
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
  [800, 870], [350, 680], [1250, 680], [1710, 650],
  [1950, 1040], [1450, 1520], [2380, 1630], [2840, 1120],
];
const SERENDIPITIES: Omit<TownSerendipity, 'id' | 'x' | 'y' | 'expiresAt'>[] = [
  { kind: 'feather', label: 'Look closer at the feather', message: 'A silver feather drifted into your path. The town says hello.' },
  { kind: 'clover', label: 'Find the lucky clover', message: 'Four little leaves. One pocket-sized bit of luck.' },
  { kind: 'paper-plane', label: 'Read the tiny note', message: 'A tiny note says: “Glad you wandered by.”' },
  { kind: 'firefly', label: 'Follow the firefly', message: 'A firefly led you to a quiet corner. Take a little breath.' },
  { kind: 'treasure', label: 'Open the suspiciously tiny treasure chest', message: 'Treasure! One gold star, three crumbs, and a certificate saying you are Extremely Rich.' },
  { kind: 'rubber-duck', label: 'Inspect the tiny rubber duck', message: 'The duck squeaks “WHAT THE DUCK?!” and awards you one official pond inspector badge.' },
];

type CommuneWorldObjectId = 'duck-post' | 'mushroom-throne' | 'star-scope' | 'treehole';
interface CommuneWorldObject {
  id: CommuneWorldObjectId;
  x: number;
  y: number;
  range: number;
  label: string;
  messages: string[];
}
const WORLD_OBJECTS: CommuneWorldObject[] = [
  {
    id: 'duck-post', x: 2350, y: 720, range: 76, label: 'Check the Duck Post',
    messages: [
      'A formal notice: “The pond is not a swimming pool.” It is, in fact, a pond.',
      'You received a postcard from a duck. It is just a drawing of bread.',
      'The mailbox quacks. The mailbox should not be able to do that.',
    ],
  },
  {
    id: 'mushroom-throne', x: 1870, y: 1350, range: 72, label: 'Sit on the tiny mushroom throne',
    messages: [
      'The Mushroom Council recognizes you as Deputy Assistant of Vibes.',
      'A tiny mushroom squeaks. You have been elected mayor by one mushroom.',
      'The throne grants +3 confidence and absolutely no legal authority.',
    ],
  },
  {
    id: 'star-scope', x: 2700, y: 1790, range: 82, label: 'Look through the star scope',
    messages: [
      'You spot a constellation shaped exactly like a confused vacuum.',
      'The stars spell “take your break.” The telescope seems very wise.',
      'A duck is looking back through the other end. Awkward.',
    ],
  },
  {
    id: 'treehole', x: TREEHOLE.x, y: TREEHOLE.y, range: TREEHOLE.range,
    label: 'Leave anonymous feedback in the treehole',
    messages: [],
  },
];
const SERENDIPITY_RANGE = 62;
const SERENDIPITY_LIFETIME_MS = 120_000;

/** Pixel ducks summoned by feeding the pond (E near the water). */
interface PondDuck { x: number; y: number; vx: number; phase: number; until: number; homeX: number; homeY: number }
interface DuckIncident { id: number; x: number; y: number; anchorX: number; vx: number; phase: number; until: number }
const DUCK_LIFE_MS = 20_000;
const DUCK_INCIDENT_LIFETIME_MS = 13_000;
const SPEED = 240; // player px/s
const CAR_MOVE_INTERVAL_MS = 80;
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

interface CarChatMessage {
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
  carId?: string | null;
  carSeat?: number | null;
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
  carId?: string | null;
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

export default function CommunePanel({ onCatThought, onCatMoveTo }: CommunePanelProps) {
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
  const [treeholeCategory, setTreeholeCategory] = useState<CommuneTreeholeCategory>('app-feedback');
  const [treeholeMessage, setTreeholeMessage] = useState('');
  const [treeholeSending, setTreeholeSending] = useState(false);
  const [treeholeSubmitted, setTreeholeSubmitted] = useState(false);
  const [treeholeError, setTreeholeError] = useState('');
  const [treeholeAdminView, setTreeholeAdminView] = useState(false);
  const [treeholeEntries, setTreeholeEntries] = useState<CommuneTreeholeEntry[]>([]);
  const [treeholeEntriesLoading, setTreeholeEntriesLoading] = useState(false);
  const [boardTab, setBoardTab] = useState<BoardTab>('roster');
  const todayKey = gmt8DateKey();
  const initialRosterMonth = ROSTER_MONTHS.includes(todayKey.slice(0, 7))
    ? todayKey.slice(0, 7)
    : ROSTER_MONTHS.at(-1) ?? '';
  const [rosterMonth, setRosterMonth] = useState(initialRosterMonth);
  const [rosterDate, setRosterDate] = useState(
    ROSTER_MONTHS.includes(todayKey.slice(0, 7)) ? todayKey : `${initialRosterMonth}-01`
  );
  const [rosterQuery, setRosterQuery] = useState('');
  const [rosterSkill, setRosterSkill] = useState('all');
  const [rosterOverlay, setRosterOverlay] = useState<Record<string, string>>({});
  const [rosterLoading, setRosterLoading] = useState(false);
  const [faqQuery, setFaqQuery] = useState('');
  const [faqHits, setFaqHits] = useState<FaqSearchHit[]>([]);
  const [activeFaq, setActiveFaq] = useState<FaqSearchHit | null>(null);
  const [faqAnswer, setFaqAnswer] = useState('');
  const [faqLoading, setFaqLoading] = useState(false);
  const [faqAnswerLoading, setFaqAnswerLoading] = useState(false);
  const [faqError, setFaqError] = useState('');
  const faqRequestRef = useRef(0);
  const [chatDraft, setChatDraft] = useState('');
  const [squareMessages, setSquareMessages] = useState<SquareChatMessage[]>([]);
  const [carChatMessages, setCarChatMessages] = useState<CarChatMessage[]>([]);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  /* ── agent→agent interactions ──────────────────────────────────────────────── */
  /** Direct-chat target (selected from a profile or bump interaction). */
  const [messaging, setMessaging] = useState<string | null>(null);
  const messagingRef = useRef<string | null>(null);
  messagingRef.current = messaging;
  const [carSeat, setCarSeat] = useState<{ carId: CommuneCarId; seat: number } | null>(null);
  const carSeatRef = useRef(carSeat);
  carSeatRef.current = carSeat;
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
  const duckIncidentRef = useRef<DuckIncident | null>(null);
  const nextDuckIncidentAtRef = useRef(0);
  const duckIncidentSequenceRef = useRef(0);
  const [oddityCount, setOddityCount] = useState(0);
  const [focusedNpc, setFocusedNpc] = useState<FocusedNpc | null>(null);
  const focusedNpcRef = useRef<FocusedNpc | null>(null);
  const [touchControls, setTouchControls] = useState(false);
  const [joystickActive, setJoystickActive] = useState(false);
  const joystickBaseRef = useRef<HTMLDivElement | null>(null);
  const joystickKnobRef = useRef<HTMLDivElement | null>(null);
  const joystickPointerIdRef = useRef<number | null>(null);
  const movementInputRef = useRef({ x: 0, y: 0 });
  const canvasPointerRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  /** Pixel ducks drifting on the pond after a feed. */
  const ducksRef = useRef<PondDuck[]>([]);
  const [chatFocused, setChatFocused] = useState(false);

  const rosterAgents = useMemo(() => getRoster(rosterMonth) ?? [], [rosterMonth]);
  const rosterShiftOf = useCallback((agent: RosterAgent, iso: string) =>
    rosterOverlay[`${agent.en}|${iso}`] ?? agent.shifts[iso] ?? '', [rosterOverlay]);
  const rosterSkillOptions = useMemo(
    () => [...new Set(rosterAgents.map((agent) => agent.skill).filter(Boolean))].sort(),
    [rosterAgents]
  );
  const visibleRoster = useMemo(() => {
    const query = rosterQuery.trim().toLowerCase();
    return rosterAgents.filter((agent) => {
      const matchesQuery = !query
        || `${agent.en} ${agent.skill} ${agent.zh}`.toLowerCase().includes(query);
      return matchesQuery && (rosterSkill === 'all' || agent.skill === rosterSkill);
    });
  }, [rosterAgents, rosterQuery, rosterSkill]);
  const rosterDays = useMemo(() => {
    const [year, month, day] = rosterDate.split('-').map(Number);
    if (!year || !month || !day) return [];
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(Date.UTC(year, month - 1, day + index, 12));
      const iso = date.toISOString().slice(0, 10);
      return iso.slice(0, 7) === rosterMonth ? iso : '';
    }).filter(Boolean);
  }, [rosterDate, rosterMonth]);
  const rosterOnDuty = rosterAgents.filter((agent) => !isRosterOffDay(rosterShiftOf(agent, rosterDate)));

  useEffect(() => {
    if (panel !== 'townhall') return;
    const query = faqQuery.trim();
    if (query.length < 2) {
      setFaqHits([]);
      setFaqLoading(false);
      setFaqError('');
      return;
    }
    let active = true;
    setFaqLoading(true);
    setFaqError('');
    const timer = window.setTimeout(() => {
      void searchLoadedFaqs({ query, limit: 10 })
        .then((hits) => {
          if (active) setFaqHits(hits);
        })
        .catch(() => {
          if (active) setFaqError('Knowledge search is unavailable right now. Try again in a moment.');
        })
        .finally(() => {
          if (active) setFaqLoading(false);
        });
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [faqQuery, panel]);

  useEffect(() => {
    if (panel !== 'banners' || !rosterMonth) return;
    let active = true;
    setRosterLoading(true);
    const mergeCells = (cells: RosterCell[]) => {
      if (!active) return;
      setRosterOverlay((current) => {
        const next = { ...current };
        for (const cell of cells) next[`${cell.en}|${cell.iso}`] = cell.code;
        return next;
      });
    };
    void fetchRosterMonth(rosterMonth)
      .then(mergeCells)
      .finally(() => {
        if (active) setRosterLoading(false);
      });
    const unsubscribe = subscribeRosterMonth(rosterMonth, {
      onCell: (cell) => mergeCells([cell]),
      onCells: mergeCells,
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [panel, rosterMonth]);

  const openFaq = async (entry: FaqSearchHit) => {
    const requestId = ++faqRequestRef.current;
    setActiveFaq(entry);
    setFaqAnswer('');
    setFaqAnswerLoading(true);
    setFaqError('');
    try {
      const answer = await loadFaqAnswer(entry);
      if (requestId === faqRequestRef.current) {
        setFaqAnswer(answer || 'No answer is available for this article yet.');
      }
    } catch {
      if (requestId === faqRequestRef.current) {
        setFaqError('This answer could not be loaded. Please try another result.');
      }
    } finally {
      if (requestId === faqRequestRef.current) setFaqAnswerLoading(false);
    }
  };

  const playerRef = useRef<Agent>({ x: PLAZA.x, y: PLAZA.y + 240, name: username, hue: hueOf(username), says: null });
  playerRef.current.name = username;
  playerRef.current.hue = hueOf(username);
  playerRef.current.carId = carSeat?.carId ?? null;
  playerRef.current.carSeat = carSeat?.seat ?? null;
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

  useEffect(() => {
    if (!panel && !chatFocused) return;
    joystickPointerIdRef.current = null;
    movementInputRef.current = { x: 0, y: 0 };
    keysRef.current.clear();
    joystickKnobRef.current?.style.setProperty('--stick-x', '0px');
    joystickKnobRef.current?.style.setProperty('--stick-y', '0px');
    setJoystickActive(false);
  }, [panel, chatFocused]);

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

  const submitTreeholeNote = async () => {
    const message = treeholeMessage.trim();
    if (!message || treeholeSending) return;
    setTreeholeSending(true);
    setTreeholeError('');
    try {
      await submitCommuneTreeholeFeedback(treeholeCategory, message);
      setTreeholeMessage('');
      setTreeholeSubmitted(true);
    } catch (error) {
      setTreeholeError(error instanceof Error ? error.message : 'Your note could not be sent. Please try again.');
    } finally {
      setTreeholeSending(false);
    }
  };

  useEffect(() => {
    if (panel !== 'treehole' || !isAdmin || !treeholeAdminView) return;
    let active = true;
    setTreeholeEntriesLoading(true);
    setTreeholeError('');
    void fetchCommuneTreeholeFeedback()
      .then((entries) => {
        if (active) setTreeholeEntries(entries);
      })
      .catch((error) => {
        if (active) setTreeholeError(error instanceof Error ? error.message : 'Unable to load the feedback inbox.');
      })
      .finally(() => {
        if (active) setTreeholeEntriesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [panel, isAdmin, treeholeAdminView]);

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
  /** Ids with a pickup request currently in flight. */
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
        pickingRef.current.delete(id);
        try {
          const result = await refreshCommuneSpiceDrops();
          dropsRef.current = result.drops.filter((drop) => !pickingRef.current.has(drop.id));
        } catch {
          /* Keep the rest of the map usable while offline. */
        }
      } finally {
        pickingRef.current.delete(id);
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
    let dropRefreshTimer = 0;
    let activeSocket: WebSocket | null = null;

    const refreshDrops = async () => {
      if (stopped || document.visibilityState === 'hidden') return;
      try {
        const result = await refreshCommuneSpiceDrops();
        if (!stopped) {
          dropsRef.current = result.drops.filter((drop) => !pickingRef.current.has(drop.id));
        }
      } catch {
        /* A later refresh or reconnect will recover the shared drops. */
      }
    };
    const scheduleDropRefresh = () => {
      dropRefreshTimer = window.setTimeout(() => {
        void refreshDrops().finally(() => {
          if (!stopped) scheduleDropRefresh();
        });
      }, 45_000 + Math.random() * 45_000);
    };

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
            if (Array.isArray(event.cars)) {
              for (const value of event.cars) {
                if (!value || typeof value !== 'object') continue;
                const incoming = value as Record<string, unknown>;
                if (incoming.id !== 'meadow-cruiser' && incoming.id !== 'orchard-wagon') continue;
                const car = PARKED_CARS.find((item) => item.id === incoming.id);
                if (!car || !Number.isFinite(Number(incoming.x)) || !Number.isFinite(Number(incoming.y))) continue;
                car.x = Number(incoming.x);
                car.y = Number(incoming.y);
                car.heading = Number(incoming.heading) || 0;
                car.targetX = car.x;
                car.targetY = car.y;
                car.targetHeading = car.heading;
              }
            }
          } else if (event.type === 'drops' && Array.isArray(event.drops)) {
            dropsRef.current = (event.drops as CommuneDrop[]).filter((drop) => !pickingRef.current.has(drop.id));
          } else if (event.type === 'car_update' && typeof event.carId === 'string') {
            const car = PARKED_CARS.find((item) => item.id === event.carId);
            if (car && Number.isFinite(Number(event.x)) && Number.isFinite(Number(event.y))) {
              car.targetX = Number(event.x);
              car.targetY = Number(event.y);
              car.targetHeading = Number(event.heading) || 0;
              if (playerRef.current.carId === car.id) {
                playerRef.current.x = car.targetX;
                playerRef.current.y = car.targetY;
              }
            }
          } else if (event.type === 'agent_join' || event.type === 'agent_update') {
            if (event.agent && typeof event.agent === 'object') upsertAgent(event.agent as CommuneAgent);
          } else if (event.type === 'agent_leave' && typeof event.username === 'string') {
            removeAgent(event.username);
          } else if (event.type === 'banners') {
            setBanners(parseBanners(event.banners));
          } else if (event.type === 'public_chat_history' && Array.isArray(event.messages)) {
            const messages = event.messages.flatMap((value) => {
              if (!value || typeof value !== 'object') return [];
              const item = value as Record<string, unknown>;
              if (
                typeof item.id !== 'string'
                || typeof item.from !== 'string'
                || typeof item.message !== 'string'
              ) return [];
              return [{
                id: item.id,
                from: item.from,
                message: item.message,
                at: Number(item.sentAt) || Date.now(),
              }];
            });
            setSquareMessages(messages.slice(-8));
          } else if (event.type === 'public_chat') {
            const from = typeof event.from === 'string' ? event.from : '';
            const message = typeof event.message === 'string' ? event.message : '';
            if (from && message) {
              const at = Number(event.sentAt) || Date.now();
              setSquareMessages((items) => [
                ...items.slice(-7),
                {
                  id: typeof event.id === 'string' ? event.id : `${at}-${from}`,
                  from,
                  message,
                  at,
                },
              ]);
              if (from !== username) {
                const remote = remoteRef.current.get(from);
                if (remote) remote.says = { text: message, until: Date.now() + 6_000 };
              }
            }
          } else if (event.type === 'public_chat_delete' && typeof event.id === 'string') {
            setSquareMessages((items) => items.filter((item) => item.id !== event.id));
          } else if (
            event.type === 'car_state'
            && (event.carId === null || event.carId === 'meadow-cruiser' || event.carId === 'orchard-wagon')
          ) {
            const nextCar = event.carId
              ? { carId: event.carId as CommuneCarId, seat: Number(event.seat) }
              : null;
            setCarSeat(nextCar && Number.isInteger(nextCar.seat) ? nextCar : null);
            playerRef.current.carId = nextCar?.carId ?? null;
            playerRef.current.carSeat = nextCar?.seat ?? null;
            playerRef.current.x = Number(event.x) || playerRef.current.x;
            playerRef.current.y = Number(event.y) || playerRef.current.y;
            if (nextCar) {
              const car = PARKED_CARS.find((item) => item.id === nextCar.carId);
              if (car && Number.isFinite(Number(event.x)) && Number.isFinite(Number(event.y))) {
                car.x = Number(event.x);
                car.y = Number(event.y);
                car.heading = Number(event.heading) || 0;
                car.targetX = car.x;
                car.targetY = car.y;
                car.targetHeading = car.heading;
              }
            }
            clickTargetRef.current = null;
            keysRef.current.clear();
            if (nextCar) {
              setCarChatMessages([]);
              setMessaging(null);
            }
          } else if (event.type === 'car_chat' && typeof event.message === 'string' && typeof event.from === 'string') {
            if (event.carId === carSeatRef.current?.carId) {
              setCarChatMessages((items) => [
                ...items.slice(-19),
                { from: event.from as string, message: event.message as string, at: Number(event.sentAt) || Date.now() },
              ]);
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
          } else if (event.type === 'error' && event.code === 'car_exit_first') {
            return;
          } else if (event.type === 'error' && typeof event.message === 'string') {
            setInbox((items) => [...items.slice(-4), { from: 'COMMUNE', message: event.message as string }]);
          }
        };
        socket.onclose = () => {
          if (activeSocket !== socket) return;
          activeSocket = null;
          if (socketRef.current === socket) socketRef.current = null;
          if (carSeatRef.current) {
            const car = PARKED_CARS.find((item) => item.id === carSeatRef.current?.carId);
            if (car) {
              const side = carSeatRef.current.seat === 0 ? -CAR_EXIT_DISTANCE : CAR_EXIT_DISTANCE;
              playerRef.current.x = car.x + Math.cos(car.heading) * side;
              playerRef.current.y = car.y + Math.sin(car.heading) * side;
            }
            setCarSeat(null);
            playerRef.current.carId = null;
            playerRef.current.carSeat = null;
          }
          scheduleReconnect();
        };
        socket.onerror = () => socket.close();
      } catch {
        if (!stopped) scheduleReconnect();
      }
    };
    void connect();
    scheduleDropRefresh();
    const heartbeat = window.setInterval(() => sendRoomEvent({ type: 'heartbeat' }), 20_000);
    return () => {
      stopped = true;
      window.clearInterval(heartbeat);
      window.clearTimeout(dropRefreshTimer);
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
          case 'enter-car': {
            const car = PARKED_CARS.find((item) => item.id === action.carId);
            return !carSeatRef.current
              && !!car
              && Math.hypot(player.x - car.x, player.y - car.y) < 118
              && [...remoteRef.current.values()].filter((remote) => remote.agent.carId === action.carId).length < 2;
          }
          case 'exit-car':
            return !!carSeatRef.current;
          case 'sit':
            return BENCHES.some(([x, y]) => x === action.x && y === action.y)
              && Math.hypot(player.x - action.x, player.y - action.y) < BENCH_RANGE;
          case 'fountain':
            return Math.hypot(player.x - FOUNTAIN.x, player.y - FOUNTAIN.y) < FOUNTAIN_RANGE;
          case 'pond': {
            const pond = PONDS.find((item) => item.id === action.pondId);
            return !!pond
              && Math.hypot(player.x - pond.x, player.y - pond.y) < POND_RANGE
              && Math.hypot(player.x - FOUNTAIN.x, player.y - FOUNTAIN.y) >= FOUNTAIN_RANGE;
          }
          case 'serendipity': {
            const moment = serendipityRef.current;
            return moment?.id === action.momentId
              && Math.hypot(player.x - moment.x, player.y - moment.y) < SERENDIPITY_RANGE;
          }
          case 'world-object': {
            const object = WORLD_OBJECTS.find((item) => item.id === action.objectId);
            return !!object && Math.hypot(player.x - object.x, player.y - object.y) < object.range;
          }
          case 'duck-incident': {
            const incident = duckIncidentRef.current;
            return incident?.id === action.incidentId
              && Math.hypot(player.x - incident.x, player.y - incident.y) < 76;
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
      case 'enter-car':
        if (!sendRoomEvent({ type: 'car_enter', carId: action.carId })) {
          setInbox((items) => [...items.slice(-4), { from: 'COMMUNE', message: 'The car connection is unavailable. Try again.' }]);
        }
        return;
      case 'exit-car':
        sendRoomEvent({ type: 'car_exit' });
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
        const pond = PONDS.find((item) => item.id === action.pondId);
        if (!pond) return;
        for (let i = 0; i < 3; i++) {
          ducksRef.current.push({
            x: pond.x + 70,
            y: pond.y - 30 + i * 30,
            vx: -26,
            phase: i * 2.1,
            until: now + DUCK_LIFE_MS,
            homeX: pond.x,
            homeY: pond.y,
          });
        }
        playerRef.current.says = {
          text: pond.id === 'duck-lagoon' ? 'Pond meeting! Bring your own bread… 🍞' : 'Here ducky ducky… 🍞',
          until: now + 3500,
        };
        return;
      }
      case 'serendipity': {
        const moment = serendipityRef.current;
        if (!moment || moment.id !== action.momentId) return;
        serendipityRef.current = null;
        nextSerendipityAtRef.current = Date.now() + 38_000 + Math.random() * 56_000;
        playerRef.current.says = { text: moment.message, until: Date.now() + 6200 };
        setOddityCount((count) => count + 1);
        onCatThought?.(moment.kind === 'treasure' ? 'A treasure chest! I shall guard the crumbs.' : 'We found a tiny town surprise!', 4200);
        return;
      }
      case 'world-object': {
        const object = WORLD_OBJECTS.find((item) => item.id === action.objectId);
        if (!object) return;
        if (object.id === 'treehole') {
          setTreeholeSubmitted(false);
          setTreeholeError('');
          setTreeholeAdminView(false);
          setPanel('treehole');
          return;
        }
        const message = object.messages[Math.floor(Math.random() * object.messages.length)];
        playerRef.current.says = { text: message, until: Date.now() + 6200 };
        if (object.id === 'duck-post') {
          onCatThought?.('The duck has sent us official pond mail.', 4200);
        }
        return;
      }
      case 'duck-incident': {
        const incident = duckIncidentRef.current;
        if (!incident || incident.id !== action.incidentId) return;
        duckIncidentRef.current = null;
        nextDuckIncidentAtRef.current = Date.now() + 55_000 + Math.random() * 85_000;
        playerRef.current.says = {
          text: 'The duck filed a complaint about “excessive pond.” Case dismissed. 🦆',
          until: Date.now() + 6500,
        };
        setOddityCount((count) => count + 1);
        onCatThought?.('WHAT THE DUCK! That bird has a tiny briefcase.', 5000);
        return;
      }
      case 'prop':
        setPanel(action.panel);
        return;
    }
  }, [onCatThought, sendRoomEvent]);

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
        if (playerRef.current.carId) {
          keysRef.current.add(e.code);
          return;
        }
        if (sittingRef.current) sittingRef.current = null; // moving stands up
        if (focusedNpcRef.current) {
          focusedNpcRef.current = null;
          setFocusedNpc(null);
        }
        keysRef.current.add(e.code);
      }
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    const releaseInputs = () => {
      keysRef.current.clear();
      joystickPointerIdRef.current = null;
      movementInputRef.current = { x: 0, y: 0 };
      joystickKnobRef.current?.style.setProperty('--stick-x', '0px');
      joystickKnobRef.current?.style.setProperty('--stick-y', '0px');
      setJoystickActive(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', releaseInputs);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', releaseInputs);
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
    let lastCarMoveSentAt = 0;
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
      const carFollow = 1 - Math.exp(-dt * 14);
      for (const car of PARKED_CARS) {
        car.x += (car.targetX - car.x) * carFollow;
        car.y += (car.targetY - car.y) * carFollow;
        const headingDelta = Math.atan2(
          Math.sin(car.targetHeading - car.heading),
          Math.cos(car.targetHeading - car.heading)
        );
        car.heading += headingDelta * carFollow;
      }

      /* update player */
      const player = playerRef.current;
      const hands = handsRef.current;
      const sitting = sittingRef.current;
      if (player.carId) {
        const keys = keysRef.current;
        const joystick = movementInputRef.current;
        const dx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
          - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + joystick.x;
        const dy = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)
          - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + joystick.y;
        const directionLength = Math.hypot(dx, dy);
        player.moving = directionLength > 0.12;
        if (directionLength > 0.12 && !panelRef.current && !chatFocusedRef.current && wallNow - lastCarMoveSentAt >= CAR_MOVE_INTERVAL_MS) {
          sendRoomEvent({ type: 'car_move', dx, dy });
          lastCarMoveSentAt = wallNow;
        }
      } else if (sitting) {
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
        const joystick = movementInputRef.current;
        let dx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0)
          - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + joystick.x;
        let dy = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
          - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) + joystick.y;
        let len = Math.hypot(dx, dy);
        if (len > 0.12) clickTargetRef.current = null;
        if (len <= 0.12 && clickTargetRef.current) {
          const tx = clickTargetRef.current.x - player.x;
          const ty = clickTargetRef.current.y - player.y;
          const d = Math.hypot(tx, ty);
          if (d > 6) {
            dx = tx / d;
            dy = ty / d;
            len = 1;
          } else {
            clickTargetRef.current = null;
          }
        }
        player.moving = len > 0.12;
        if (len > 0.12) {
          const nx = player.x + (dx / len) * SPEED * dt * Math.min(1, len);
          const ny = player.y + (dy / len) * SPEED * dt * Math.min(1, len);
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
          if (Math.abs(d.x - d.homeX) > 88) d.vx *= -1;
          d.y = d.homeY + Math.sin(now / 900 + d.phase) * 16;
          return d;
        });

      if (!nextSerendipityAtRef.current) {
        nextSerendipityAtRef.current = wallNow + 12_000 + Math.random() * 18_000;
      }
      if (serendipityRef.current && wallNow >= serendipityRef.current.expiresAt) {
        serendipityRef.current = null;
        nextSerendipityAtRef.current = wallNow + 35_000 + Math.random() * 55_000;
      }
      if (!serendipityRef.current && wallNow >= nextSerendipityAtRef.current) {
        const treasureRun = Math.random() < 0.22;
        const pool = treasureRun ? SERENDIPITIES.slice(4) : SERENDIPITIES.slice(0, 4);
        const surprise = pool[Math.floor(Math.random() * pool.length)];
        const [x, y] = chooseSerendipitySpot(player.x, player.y);
        serendipityRef.current = {
          ...surprise,
          id: ++serendipitySequenceRef.current,
          x,
          y,
          expiresAt: wallNow + SERENDIPITY_LIFETIME_MS,
        };
      }

      if (!nextDuckIncidentAtRef.current) {
        nextDuckIncidentAtRef.current = wallNow + 38_000 + Math.random() * 45_000;
      }
      const duckIncident = duckIncidentRef.current;
      if (duckIncident && wallNow >= duckIncident.until) {
        duckIncidentRef.current = null;
        nextDuckIncidentAtRef.current = wallNow + 55_000 + Math.random() * 85_000;
      } else if (duckIncident) {
        if (!reduceMotion) {
          duckIncident.x += duckIncident.vx * dt;
          if (Math.abs(duckIncident.x - duckIncident.anchorX) > 64) duckIncident.vx *= -1;
        }
      } else if (wallNow >= nextDuckIncidentAtRef.current) {
        const [x, y] = chooseSerendipitySpot(player.x, player.y);
        duckIncidentRef.current = {
          id: ++duckIncidentSequenceRef.current,
          x,
          y,
          anchorX: x,
          vx: Math.random() < 0.5 ? -76 : 76,
          phase: Math.random() * 10,
          until: wallNow + DUCK_INCIDENT_LIFETIME_MS,
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
        if (remote.agent.carId) continue;
        const distance = Math.hypot(player.x - remote.rx, player.y - remote.ry);
        if (distance < 64 && (!nearAgent || distance < nearAgent.distance)) {
          nearAgent = { username: remote.agent.username, distance };
        }
        if (distance < 90 && (!handAgent || distance < handAgent.distance)) {
          handAgent = { username: remote.agent.username, distance };
        }
      }
      const held = handsRef.current;
      const nearCar = !carSeatRef.current
        ? PARKED_CARS
          .map((car) => ({
            car,
            distance: Math.hypot(player.x - car.x, player.y - car.y),
            occupied: [...remoteRef.current.values()].filter((remote) => remote.agent.carId === car.id).length,
          }))
          .filter(({ distance, occupied }) => distance < 118 && occupied < 2)
          .sort((a, b) => a.distance - b.distance)[0]?.car ?? null
        : null;
      const nearBench = !sittingRef.current
        ? BENCHES.find(([bx, by]) => Math.hypot(player.x - bx, player.y - by) < BENCH_RANGE)
        : undefined;
      const nearFountain = Math.hypot(player.x - FOUNTAIN.x, player.y - FOUNTAIN.y) < FOUNTAIN_RANGE;
      const moment = serendipityRef.current;
      const nearSerendipity = moment
        && Math.hypot(player.x - moment.x, player.y - moment.y) < SERENDIPITY_RANGE
        ? moment
        : null;
      const incident = duckIncidentRef.current;
      const nearDuckIncident = incident
        && Math.hypot(player.x - incident.x, player.y - incident.y) < 76
        ? incident
        : null;
      const nearWorldObject = WORLD_OBJECTS
        .map((object) => ({ object, distance: Math.hypot(player.x - object.x, player.y - object.y) }))
        .filter(({ object, distance }) => distance < object.range)
        .sort((a, b) => a.distance - b.distance)[0]?.object ?? null;
      const nearPond = !nearFountain
        ? PONDS
          .map((pond) => ({ pond, distance: Math.hypot(player.x - pond.x, player.y - pond.y) }))
          .filter(({ pond, distance }) =>
            distance < POND_RANGE
            && (pond.id !== 'town-pond' || Math.hypot(player.x - FOUNTAIN.x, player.y - FOUNTAIN.y) >= FOUNTAIN_RANGE)
          )
          .sort((a, b) => a.distance - b.distance)[0]?.pond ?? null
        : null;
      const actions: CommuneAction[] = [];

      if (carSeatRef.current) {
        actions.push({ type: 'exit-car', key: 'E', label: 'Leave car' });
      } else if (nearCar) {
        actions.push({ type: 'enter-car', key: 'E', label: `Get in ${nearCar.label}`, carId: nearCar.id });
      } else if (sittingRef.current) {
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
      } else if (nearDuckIncident) {
        actions.push({
          type: 'duck-incident',
          key: 'E',
          label: 'Ask the duck what the duck',
          incidentId: nearDuckIncident.id,
        });
      } else if (nearWorldObject) {
        actions.push({
          type: 'world-object',
          key: 'E',
          label: nearWorldObject.label,
          objectId: nearWorldObject.id,
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
        actions.push({ type: 'pond', key: 'E', label: 'Feed the ducks', pondId: nearPond.id });
      } else if (nearProp) {
        actions.push({ type: 'prop', key: 'E', label: nearProp.label, panel: nearProp.kind });
      }

      if (!carSeatRef.current) {
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
      }
      publishNearbyActions(actions);
      const nearKind = nearProp?.kind ?? null;
      statusRef.current = player.carId
        ? 'in a private car conversation'
        : player.says
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
      if (!player.carId && (
        (player.moving && wallNow - lastPositionSentAtRef.current >= 100) ||
        statusChanged
      )) {
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
          carId: r.agent.carId,
        });
      }

      const petViews = updatePetFollowers(
        [
          ...(!player.carId
            ? [{ ownerId: player.name, x: player.x, y: player.y, moving: !!player.moving, pet: player.pet ?? null }]
            : []),
          ...remoteViews.filter((remote) => !remote.carId).map((remote) => ({
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
      draw(
        ctx, vw, vh, dpr, shakeCam, tSec, player, npcsRef.current, banners,
        remoteViews, petViews, reduceMotion, nightOpacity, serendipityRef.current,
        clickTargetRef.current, dropsRef.current, ducksRef.current, duckIncidentRef.current
      );
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
    if (panelRef.current || playerRef.current.carId) return;
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
    const incident = duckIncidentRef.current;
    if (incident && Math.hypot(wx - incident.x, wy - (incident.y - 24)) < 32) {
      const player = playerRef.current;
      if (Math.hypot(player.x - incident.x, player.y - incident.y) < 76) {
        executeInteraction({
          type: 'duck-incident',
          key: 'E',
          label: 'Ask the duck what the duck',
          incidentId: incident.id,
        });
      } else {
        clickTargetRef.current = approachPoint(incident.x, incident.y, player.x, player.y);
      }
      return;
    }
    const tappedCar = PARKED_CARS.find((car) => {
      const bounds = carHalfExtents(car.heading);
      return Math.abs(wx - car.x) < bounds.x + 10 && Math.abs(wy - car.y) < bounds.y + 10;
    });
    if (tappedCar) {
      const player = playerRef.current;
      if (Math.hypot(player.x - tappedCar.x, player.y - tappedCar.y) < 118) {
        executeInteraction({
          type: 'enter-car',
          key: 'E',
          label: `Get in ${tappedCar.label}`,
          carId: tappedCar.id,
        });
      } else {
        clickTargetRef.current = approachPoint(tappedCar.x, tappedCar.y, player.x, player.y, 100);
      }
      return;
    }
    const worldObject = WORLD_OBJECTS.find(
      (object) => object.id === 'treehole'
        ? Math.abs(wx - object.x) < 96 && wy >= object.y - 318 && wy <= object.y + 5
        : Math.hypot(wx - object.x, wy - (object.y - 18)) < 38
    );
    if (worldObject) {
      const player = playerRef.current;
      if (Math.hypot(player.x - worldObject.x, player.y - worldObject.y) < worldObject.range) {
        executeInteraction({
          type: 'world-object',
          key: 'E',
          label: worldObject.label,
          objectId: worldObject.id,
        });
      } else {
        clickTargetRef.current = approachPoint(
          worldObject.x,
          worldObject.y,
          player.x,
          player.y,
          worldObject.id === 'treehole' ? 94 : 58
        );
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

  const updateJoystick = (clientX: number, clientY: number) => {
    const base = joystickBaseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const maxRadius = rect.width * 0.34;
    const rawX = (clientX - (rect.left + rect.width / 2)) / maxRadius;
    const rawY = (clientY - (rect.top + rect.height / 2)) / maxRadius;
    const distance = Math.hypot(rawX, rawY);
    const visualScale = Math.min(1, distance);
    const deadZone = 0.12;
    const movementScale = visualScale <= deadZone
      ? 0
      : (visualScale - deadZone) / (1 - deadZone);
    const unitX = distance > 0 ? rawX / distance : 0;
    const unitY = distance > 0 ? rawY / distance : 0;
    movementInputRef.current = {
      x: unitX * movementScale,
      y: unitY * movementScale,
    };
    joystickKnobRef.current?.style.setProperty('--stick-x', `${unitX * visualScale * maxRadius}px`);
    joystickKnobRef.current?.style.setProperty('--stick-y', `${unitY * visualScale * maxRadius}px`);
  };

  const stopJoystick = (pointerId?: number) => {
    if (pointerId !== undefined && joystickPointerIdRef.current !== pointerId) return;
    joystickPointerIdRef.current = null;
    movementInputRef.current = { x: 0, y: 0 };
    joystickKnobRef.current?.style.setProperty('--stick-x', '0px');
    joystickKnobRef.current?.style.setProperty('--stick-y', '0px');
    setJoystickActive(false);
  };

  const onJoystickPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    joystickPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setJoystickActive(true);
    clickTargetRef.current = null;
    if (sittingRef.current) sittingRef.current = null;
    updateJoystick(event.clientX, event.clientY);
  };

  const onJoystickPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (joystickPointerIdRef.current === event.pointerId) {
      event.preventDefault();
      updateJoystick(event.clientX, event.clientY);
    }
  };

  const onJoystickPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    stopJoystick(event.pointerId);
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
    const car = carSeatRef.current;
    const sent = sendRoomEvent(
      car
        ? { type: 'car_chat', message: text }
        : recipient
          ? { type: 'private_chat', target: recipient, message: text }
          : { type: 'public_chat', message: text },
    );
    if (!sent) {
      setInbox((items) => [...items.slice(-4), { from: 'COMMUNE', message: 'Reconnecting; your message was not sent.' }]);
      return;
    }
    if (!car) playerRef.current.says = { text: text.slice(0, 90), until: Date.now() + 6000 };
    setChatDraft('');
  };

  const startDirectMessage = (target: string) => {
    setMessaging(target);
    setPanel(null);
    window.requestAnimationFrame(() => chatInputRef.current?.focus());
  };

  const bannerWords = useMemo(() => banners.map((b) => b.text), [banners]);
  const activeProp = panel ? COMMUNE_PROPS.find((prop) => prop.kind === panel) ?? null : null;
  const currentCar = carSeat ? PARKED_CARS.find((car) => car.id === carSeat.carId) ?? null : null;
  const carOccupants = carSeat
    ? others.filter((agent) => agent.carId === carSeat.carId).sort((a, b) => (a.carSeat ?? 0) - (b.carSeat ?? 0))
    : [];
  const widePanel = panel === 'townhall' || panel === 'arcade' || panel === 'banners' || panel === 'quiz' || panel === 'treehole';
  const panelPosition = touchControls
    ? 'left-3 right-3 bottom-3 top-auto z-30 translate-x-0'
    : panel === 'loadout'
      ? 'right-4 top-4 z-20'
      : panel === 'quiz'
        ? 'left-1/2 top-3 z-30 -translate-x-1/2'
        : 'left-1/2 top-14 z-30 -translate-x-1/2';
  const primaryAction = nearbyActions.find((action) => action.key === 'E');
  const secondaryAction = nearbyActions.find((action) => action.key === 'H');
  const focusedNpcIsReady = !!focusedNpc && nearbyActions.some(
    (action) => action.type === 'challenge' && action.personaId === focusedNpc.personaId
  );

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
        aria-label="COMMUNE town square. Tap the ground to walk. On touchscreens, use the left joystick and nearby action buttons. Keyboard: WASD or arrow keys to move, E and H to interact."
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
            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 font-mono text-[9px] font-bold text-amber-100">
              ✦ {oddityCount} oddit{oddityCount === 1 ? 'y' : 'ies'} found
            </span>
        </span>
      </div>

      {/* Desktop keeps compact labeled actions centered above the chat bar. */}
      {!touchControls && !panel && (focusedNpc && !focusedNpcIsReady || nearbyActions.length > 0) && (
        <div
          aria-live="polite"
          className="absolute bottom-[4.75rem] left-1/2 z-20 flex max-w-[calc(100%-24px)] -translate-x-1/2 flex-col items-center gap-1.5 animate-in fade-in"
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
              aria-label={`${action.label}, press ${action.key}`}
              title={`${action.label} (${action.key})`}
              className={cn(
                'glass-btn flex min-h-11 max-w-[min(72vw,360px)] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold shadow-lg backdrop-blur-xl transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                action.key === 'E'
                  ? 'border-primary/50 bg-card/95 text-foreground hover:border-primary'
                  : 'border-accent/40 bg-card/90 text-foreground/90 hover:border-accent'
              )}
            >
              <kbd className="rounded-md bg-primary px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary-foreground">
                {action.key}
              </kbd>
              <span className="truncate">{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {touchControls && !panel && !chatFocused && focusedNpc && !focusedNpcIsReady && (
        <div
          aria-live="polite"
          className="absolute z-20 flex items-center gap-2 rounded-xl border border-accent/40 bg-card/95 px-3 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur-xl"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 15rem)',
            right: 'max(0.75rem, env(safe-area-inset-right, 0px))',
          }}
        >
          <span className="max-w-[34vw] truncate">Walking to {focusedNpc.name}</span>
          <button
            type="button"
            onClick={() => {
              clickTargetRef.current = null;
              focusedNpcRef.current = null;
              setFocusedNpc(null);
            }}
            className="rounded-md px-2 py-1 text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={`Cancel approach to ${focusedNpc.name}`}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Dota-style thumb zones: a shared walk/drive stick and contextual actions. */}
      {touchControls && !panel && !chatFocused && (
        <div
          ref={joystickBaseRef}
          role="group"
          aria-label={carSeat ? 'Car steering joystick' : 'Movement joystick'}
          className="absolute z-20 size-[clamp(116px,34vw,144px)] touch-none select-none rounded-full border border-white/30 bg-slate-950/25 shadow-[inset_0_0_22px_rgba(0,0,0,0.4),0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-sm"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)',
            left: 'max(0.75rem, env(safe-area-inset-left, 0px))',
            touchAction: 'none',
          }}
          onPointerDown={onJoystickPointerDown}
          onPointerMove={onJoystickPointerMove}
          onPointerUp={onJoystickPointerUp}
          onPointerCancel={onJoystickPointerUp}
          onLostPointerCapture={onJoystickPointerUp}
        >
          <span className="pointer-events-none absolute inset-[12%] rounded-full border border-white/15" />
          <span className="pointer-events-none absolute inset-[28%] rounded-full border border-white/10" />
          <span
            ref={joystickKnobRef}
            className={cn(
              'absolute left-1/2 top-1/2 grid size-[54px] place-items-center rounded-full border shadow-lg',
              joystickActive ? 'transition-none' : 'transition-transform duration-100',
              carSeat
                ? 'border-sky-100/50 bg-sky-300/75 text-slate-950 shadow-sky-950/30'
                : 'border-primary-foreground/50 bg-primary/90 text-primary-foreground shadow-emerald-950/35'
            )}
            style={{
              transform: 'translate(calc(-50% + var(--stick-x, 0px)), calc(-50% + var(--stick-y, 0px)))',
            }}
          >
            <span className="size-2 rounded-full bg-current opacity-80" />
          </span>
          <span className="pointer-events-none absolute bottom-[10%] left-1/2 -translate-x-1/2 font-mono text-[8px] font-bold tracking-[0.18em] text-white/55">
            {carSeat ? 'DRIVE' : 'MOVE'}
          </span>
        </div>
      )}

      {touchControls && !panel && !chatFocused && nearbyActions.length > 0 && (
        <div
          role="group"
          aria-label="Nearby actions"
          className="absolute z-20 flex items-end gap-2.5"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)',
            right: 'max(0.75rem, env(safe-area-inset-right, 0px))',
          }}
        >
          {[secondaryAction, primaryAction]
            .filter((action): action is CommuneAction => !!action)
            .map((action) => {
              const isPrimary = action.key === 'E';
              return (
                <button
                  key={`${action.key}-${action.type}`}
                  type="button"
                  onClick={() => executeInteraction(action)}
                  aria-label={action.label}
                  title={action.label}
                  className="group flex w-[68px] touch-manipulation flex-col items-center gap-1 rounded-xl text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span
                    className={cn(
                      'relative grid place-items-center rounded-full border shadow-xl backdrop-blur-md transition-transform active:scale-90',
                      isPrimary
                        ? 'size-[68px] border-primary/70 bg-slate-950/75 text-primary-foreground shadow-primary/20 group-active:bg-primary'
                        : 'mx-1 size-[54px] border-accent/55 bg-slate-950/75 text-accent shadow-accent/15 group-active:bg-accent/30'
                    )}
                  >
                    {touchActionIcon(action)}
                    {!isPrimary && (
                      <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border border-white/30 bg-card text-[9px] font-extrabold text-foreground">
                        H
                      </span>
                    )}
                  </span>
                  <span className="max-w-full truncate rounded-full border border-white/15 bg-slate-950/65 px-2 py-0.5 text-[9px] font-bold text-white/90 shadow backdrop-blur-sm">
                    {touchActionLabel(action)}
                  </span>
                </button>
              );
            })}
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

      {/* Short-lived messages in parked cars are delivered only to occupants. */}
      {carSeat && (
          <div className="pointer-events-none absolute bottom-[7.5rem] left-1/2 z-10 w-[min(560px,calc(100%-24px))] -translate-x-1/2">
            <div
              role="log"
              aria-label="Private parked car conversation"
              aria-live="polite"
              className="pointer-events-auto overflow-hidden rounded-xl border border-sky-200/25 bg-slate-950/85 px-3 py-2 shadow-lg backdrop-blur-md"
            >
              <div className="mb-1 flex items-center justify-between gap-2 border-b border-white/10 pb-1">
                <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-sky-200">
                  Private · {currentCar?.label ?? 'Parked car'}
                </span>
                <span className="truncate text-[9px] text-white/55">
                  {[username, ...carOccupants.map((agent) => agent.username)].slice(0, 2).join(' · ')}
                </span>
              </div>
              <p className="mb-1 text-[9px] text-sky-100/60">
                {touchControls ? 'Left joystick to drive · action button to leave' : 'WASD / arrow keys to drive · E to leave'}
              </p>
              <div className="flex max-h-24 flex-col gap-1 overflow-hidden">
                {carChatMessages.slice(-4).map((item, index) => (
                  <p key={`${item.at}-${item.from}-${index}`} className="truncate text-[11px] leading-snug text-white/90">
                    <span className="mr-1.5 font-bold text-sky-200">{item.from}</span>
                    {item.message}
                  </p>
                ))}
                {carChatMessages.length === 0 && (
                  <p className="text-[10px] text-white/55">Just the two of you. Start a private conversation.</p>
                )}
              </div>
            </div>
          </div>
        )}
      {/* Short-lived shared history lets everyone remove inappropriate chat. */}
        {!carSeat && squareMessages.length > 0 && (
        <div className="pointer-events-none absolute bottom-[7.5rem] left-1/2 z-10 w-[min(560px,calc(100%-24px))] -translate-x-1/2">
          <div
            role="log"
            aria-label="Recent square chat"
            aria-live="polite"
            className="pointer-events-auto flex max-h-36 flex-col gap-1 overflow-hidden rounded-xl border border-white/20 bg-card/85 px-3 py-2 shadow-lg backdrop-blur-md"
          >
            {squareMessages.slice(-5).map((item) => (
              <div key={item.id} className="group flex min-w-0 items-center gap-1">
                <p className="min-w-0 flex-1 truncate text-[11px] leading-snug text-foreground">
                  <span className="mr-1.5 font-bold" style={{ color: `hsl(${hueOf(item.from)} 70% 65%)` }}>
                    {item.from}
                  </span>
                  {item.message}
                </p>
                {(item.from === username || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => sendRoomEvent({ type: 'public_chat_delete', id: item.id })}
                    className="shrink-0 rounded p-1 text-muted-foreground/70 transition hover:bg-red-500/15 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                    aria-label={`Delete ${item.from}'s public message`}
                    title="Delete public message"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
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
            : carSeat
              ? 'border-sky-200/40 bg-slate-950/90'
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
          placeholder={
            carSeat
              ? 'Private conversation · only car occupants can hear'
              : messaging
                ? `Send a message to ${messaging}…`
                : `Say something to the square, ${username}…`
          }
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
          aria-label={activeProp?.label ?? (panel === 'treehole' ? 'Anonymous feedback treehole' : panel === 'loadout' ? 'My Loadout' : selected?.username ?? 'Agent details')}
          className={cn(
            'glass-panel absolute overflow-y-auto rounded-2xl border border-border/70 bg-card/95 p-4 shadow-2xl backdrop-blur-2xl',
            touchControls
              ? cn(
                  panel === 'quiz' ? 'max-h-[min(90dvh,980px)]' : 'max-h-[min(82dvh,780px)]',
                  'w-auto'
                )
              : widePanel
                ? cn(
                    panel === 'quiz' ? 'max-h-[calc(100dvh-24px)]' : 'max-h-[min(78vh,780px)]',
                    'w-[min(720px,calc(100vw-24px))]'
                  )
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
                  {panel === 'townhall'
                    ? <BookOpen className="size-4" />
                    : panel === 'arcade'
                      ? <Gamepad2 className="size-4" />
                      : <Building2 className="size-4" />}
                </span>
                <div>
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">COMMUNE PLACE</p>
                  <h3 className="font-mono text-sm font-extrabold text-foreground">{activeProp.label}</h3>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{activeProp.description}</p>
              <p className="mt-4 border-t border-border/50 pt-2.5 text-[10px] text-muted-foreground/80">
                {touchControls ? 'Close to return · Use the joystick to explore' : 'Press Esc to close · Keep exploring with WASD'}
              </p>
            </div>
          )}

          {panel === 'treehole' && (
            <section className="mt-1 space-y-3 pr-7" aria-label="Anonymous feedback treehole">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl bg-emerald-400/12 text-emerald-300">
                  <MessageSquare className="size-4" />
                </span>
                <div>
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">ODDITY ORCHARD</p>
                  <h3 className="font-mono text-sm font-extrabold text-foreground">
                    {treeholeAdminView ? 'Treehole inbox' : 'The Feedback Tree'}
                  </h3>
                </div>
              </div>

              <p className="rounded-lg border border-emerald-300/20 bg-emerald-300/5 p-2.5 text-[11px] leading-relaxed text-foreground/80">
                Leave app feedback, an improvement idea, a useful tip, or anything else. Your username is not saved with your note. Please don’t include contact details or other identifying information.
              </p>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setTreeholeAdminView((view) => !view);
                    setTreeholeError('');
                  }}
                  className="rounded-lg border border-border/60 px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground transition hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {treeholeAdminView ? 'Write a note' : 'Review anonymous notes'}
                </button>
              )}

              {treeholeAdminView && isAdmin ? (
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {treeholeEntriesLoading ? (
                    <p className="animate-pulse py-5 text-center text-xs text-muted-foreground">Opening the treehole…</p>
                  ) : treeholeEntries.length ? treeholeEntries.map((entry) => (
                    <article key={entry.id} className="rounded-xl border border-border/60 bg-background/35 p-3">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-bold uppercase text-accent">
                          {entry.category.replace('-', ' ')}
                        </span>
                        <time className="text-[9px] text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleString()}
                        </time>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/90">{entry.message}</p>
                    </article>
                  )) : (
                    <p className="rounded-lg border border-dashed border-border/60 p-5 text-center text-xs text-muted-foreground">
                      {treeholeEntriesLoading ? 'Loading notes…' : 'The treehole is quiet for now.'}
                    </p>
                  )}
                </div>
              ) : treeholeSubmitted ? (
                <div className="rounded-xl border border-emerald-300/25 bg-emerald-300/10 p-4 text-center">
                  <p className="font-mono text-xs font-bold text-emerald-200">Your note is tucked away.</p>
                  <p className="mt-1 text-[10px] text-foreground/70">Thanks for helping the town grow.</p>
                  <button
                    type="button"
                    onClick={() => setTreeholeSubmitted(false)}
                    className="mt-3 rounded-lg border border-emerald-200/25 px-3 py-1.5 text-[10px] font-bold text-emerald-100 hover:bg-emerald-200/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    Leave another note
                  </button>
                </div>
              ) : (
                <form
                  className="space-y-2.5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitTreeholeNote();
                  }}
                >
                  <label className="block space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">What kind of note?</span>
                    <select
                      value={treeholeCategory}
                      onChange={(event) => setTreeholeCategory(event.target.value as CommuneTreeholeCategory)}
                      className="h-10 w-full rounded-lg border border-border/70 bg-background/65 px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <option value="app-feedback">App feedback</option>
                      <option value="suggestion">Suggestion for improvement</option>
                      <option value="tip">Tip for the team</option>
                      <option value="other">Something else</option>
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Your anonymous note</span>
                    <textarea
                      value={treeholeMessage}
                      onChange={(event) => setTreeholeMessage(event.target.value)}
                      onKeyDown={(event) => event.stopPropagation()}
                      maxLength={2000}
                      rows={5}
                      placeholder="What should we know?"
                      className="w-full resize-y rounded-lg border border-border/70 bg-background/65 p-3 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    />
                  </label>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] text-muted-foreground">{treeholeMessage.length}/2000</span>
                    <button
                      type="submit"
                      disabled={!treeholeMessage.trim() || treeholeSending}
                      className="rounded-lg border border-emerald-300/30 bg-emerald-400/15 px-3 py-2 text-[10px] font-bold text-emerald-100 transition hover:bg-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {treeholeSending ? 'Tucking it away…' : 'Leave anonymous note'}
                    </button>
                  </div>
                </form>
              )}
              {treeholeError && <p role="alert" className="text-[10px] text-amber-300">{treeholeError}</p>}
            </section>
          )}

          {panel === 'townhall' && (
            <section className="mt-4 border-t border-border/50 pt-4" aria-label="Knowledge kiosk">
              {activeFaq ? (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      faqRequestRef.current += 1;
                      setActiveFaq(null);
                      setFaqAnswer('');
                      setFaqError('');
                    }}
                    className="mb-3 rounded-md px-2 py-1 text-[11px] font-semibold text-accent transition hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    ← Search results
                  </button>
                  <div className="rounded-xl border border-accent/25 bg-accent/5 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-[9px] font-bold uppercase tracking-wide text-accent">
                      <BookOpen className="size-3.5" />
                      {activeFaq.model || 'Product guide'}
                      {activeFaq.lang && <span className="text-muted-foreground">· {activeFaq.lang}</span>}
                    </div>
                    <h4 className="mt-2 text-sm font-bold leading-relaxed text-foreground">{activeFaq.question}</h4>
                    <div className="mt-3 max-h-64 overflow-y-auto rounded-lg bg-background/50 p-3 text-xs leading-relaxed text-foreground/85">
                      {faqAnswerLoading
                        ? <p className="animate-pulse text-muted-foreground">Opening the handbook…</p>
                        : faqAnswer
                          ? <p className="whitespace-pre-wrap">{faqAnswer}</p>
                          : <p className="text-muted-foreground">Answer not loaded.</p>}
                    </div>
                    {faqError && <p role="status" className="mt-2 text-[10px] text-amber-300">{faqError}</p>}
                  </div>
                </div>
              ) : (
                <>
                  <label className="flex h-11 items-center gap-2 rounded-xl border border-border/70 bg-background/65 px-3 focus-within:border-accent/70 focus-within:ring-2 focus-within:ring-accent/25">
                    <Search className="size-4 shrink-0 text-accent" />
                    <input
                      value={faqQuery}
                      onChange={(event) => setFaqQuery(event.target.value)}
                      onKeyDown={(event) => event.stopPropagation()}
                      placeholder="Search robot, error, symptom…"
                      aria-label="Search product knowledge"
                      className="h-full min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    {faqLoading && <span className="size-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />}
                  </label>
                  {faqQuery.trim().length < 2 && (
                    <div className="mt-3">
                      <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                        Quick trails
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {['Wi-Fi setup', 'Mapping', 'Charging', 'Water issues', 'Error code'].map((topic) => (
                          <button
                            key={topic}
                            type="button"
                            onClick={() => setFaqQuery(topic)}
                            className="rounded-full border border-border/70 bg-background/40 px-2.5 py-1 text-[10px] text-foreground/80 transition hover:border-accent/50 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          >
                            {topic}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {faqError && <p role="status" className="mt-3 text-[11px] text-amber-300">{faqError}</p>}
                  {faqQuery.trim().length >= 2 && !faqLoading && !faqError && faqHits.length === 0 && (
                    <p className="mt-3 rounded-lg border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
                      No matching articles yet. Try a model name or a shorter symptom.
                    </p>
                  )}
                  <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
                    {faqHits.map((hit) => (
                      <button
                        key={hit.id}
                        type="button"
                        onClick={() => void openFaq(hit)}
                        className="group flex w-full items-start gap-3 rounded-xl border border-border/50 bg-background/35 px-3 py-2.5 text-left transition hover:border-accent/40 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <BookOpen className="mt-0.5 size-3.5 shrink-0 text-accent/80" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold leading-relaxed text-foreground">{hit.question}</span>
                          <span className="mt-1 block text-[9px] text-muted-foreground">
                            {hit.model || 'General'} · {hit.category || 'Product support'} · {hit.lang}
                          </span>
                        </span>
                        <span className="pt-0.5 text-[10px] text-accent opacity-70 transition group-hover:opacity-100">Open</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[9px] text-muted-foreground/70">
                    Search uses the shared knowledge base, with the bundled handbook as fallback.
                  </p>
                </>
              )}
            </section>
          )}

          {panel === 'arcade' && (
            <section className="mt-4 space-y-3 border-t border-border/50 pt-4" aria-label="Challenge arcade">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Choose a run</p>
                  <p className="mt-1 text-[11px] text-foreground/80">Practice live conversations or test what you know.</p>
                </div>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
                  <Trophy className="size-4" />
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {CHALLENGE_NPCS.map((npc, index) => (
                  <button
                    key={npc.personaId}
                    type="button"
                    onClick={() => {
                      setChallengePersona(npc.personaId);
                      setPanel('challenges');
                    }}
                    className="group flex min-h-24 items-center gap-3 rounded-xl border border-rose-400/25 bg-gradient-to-br from-rose-400/10 to-background/30 p-3 text-left transition hover:-translate-y-0.5 hover:border-rose-300/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-full border border-rose-300/30 bg-rose-300/10 font-mono text-xs font-black text-rose-200">
                      {index === 0 ? 'GB' : 'TH'}
                    </span>
                    <span>
                      <span className="block text-xs font-bold text-foreground">{npc.name}</span>
                      <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                        AI role-play · handle a tricky customer · earn spice
                      </span>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPanel('quiz')}
                  className="group flex min-h-24 items-center gap-3 rounded-xl border border-violet-400/30 bg-gradient-to-br from-violet-400/12 to-background/30 p-3 text-left transition hover:-translate-y-0.5 hover:border-violet-300/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-violet-300/35 bg-violet-300/10 text-violet-200">
                    <GraduationCap className="size-5" />
                  </span>
                  <span>
                    <span className="block text-xs font-bold text-foreground">Knowledge quests</span>
                    <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                      Take a weekly self-test, track your score, and collect spice.
                    </span>
                  </span>
                </button>
              </div>
              <p className="text-[9px] text-muted-foreground/70">Your progress and challenge results use the same account systems as the rest of the app.</p>
            </section>
          )}

          {panel === 'quiz' && (
            <section className="flex h-[min(82dvh,820px)] min-h-[420px] flex-col" aria-label="Knowledge quests">
              <div className="mb-2 flex shrink-0 items-center gap-2 border-b border-border/50 pb-2 pr-8">
                <button
                  type="button"
                  onClick={() => setPanel('arcade')}
                  className="rounded-md px-2 py-1 text-[11px] font-semibold text-accent transition hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  ← Arcade
                </button>
                <span className="font-mono text-xs font-bold text-foreground">Knowledge quests</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl">
                <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading the quest board…</div>}>
                  <SelfTestWorkspace onCatThought={onCatThought} onCatMoveTo={onCatMoveTo} />
                </Suspense>
              </div>
            </section>
          )}

          {panel === 'banners' && (
            <div className="mt-3">
              <div className="mb-3 flex items-center justify-between gap-3 pr-8">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-xl bg-primary/12 text-primary">
                    {boardTab === 'roster' ? <CalendarDays className="size-4" /> : <Megaphone className="size-4" />}
                  </span>
                  <div>
                    <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">THE COMMONS</p>
                    <h3 className="font-mono text-sm font-extrabold text-foreground">
                      {boardTab === 'roster' ? 'Agent Roster Board' : 'Town Announcements'}
                    </h3>
                  </div>
                </div>
                <div className="flex rounded-lg border border-border/70 bg-background/55 p-0.5">
                  {([
                    ['roster', 'Shifts'],
                    ['announcements', 'News'],
                  ] as const).map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setBoardTab(tab)}
                      className={cn(
                        'rounded-md px-2.5 py-1.5 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        boardTab === tab ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {boardTab === 'roster' ? (
                <section aria-label="Agent shift schedule">
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/8 px-3 py-2.5">
                      <span className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary"><Users className="size-4" /></span>
                      <span>
                        <span className="block font-mono text-lg font-black leading-none text-foreground">{rosterOnDuty.length}</span>
                        <span className="mt-1 block text-[9px] font-bold uppercase tracking-wide text-muted-foreground">scheduled on this shift</span>
                      </span>
                      <span className="ml-auto text-right text-[9px] text-muted-foreground">
                        {rosterLoading ? 'Syncing shared board…' : 'Snapshot + live updates'}
                      </span>
                    </div>
                    <label className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/45 px-3">
                      <CalendarDays className="size-3.5 text-accent" />
                      <span className="sr-only">Roster month</span>
                      <select
                        value={rosterMonth}
                        onChange={(event) => {
                          const nextMonth = event.target.value;
                          setRosterMonth(nextMonth);
                          setRosterDate(`${nextMonth}-01`);
                        }}
                        className="h-10 bg-transparent text-xs text-foreground outline-none"
                      >
                        {ROSTER_MONTHS.map((month) => (
                          <option key={month} value={month} className="bg-background text-foreground">
                            {new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
                    {rosterDays.map((iso) => {
                      const date = new Date(`${iso}T12:00:00`);
                      const selectedDay = iso === rosterDate;
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => setRosterDate(iso)}
                          className={cn(
                            'min-w-12 rounded-xl border px-2 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                            selectedDay
                              ? 'border-accent/55 bg-accent/15 text-accent'
                              : 'border-border/60 bg-background/35 text-muted-foreground hover:border-accent/30'
                          )}
                        >
                          <span className="block text-[8px] font-bold uppercase">{date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                          <span className="mt-0.5 block font-mono text-xs font-bold">{date.getDate()}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <label className="flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-border/60 bg-background/55 px-2.5">
                      <Search className="size-3.5 text-muted-foreground" />
                      <input
                        value={rosterQuery}
                        onChange={(event) => setRosterQuery(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                        placeholder="Find an agent…"
                        aria-label="Find an agent on the roster"
                        className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
                      />
                    </label>
                    <select
                      value={rosterSkill}
                      onChange={(event) => setRosterSkill(event.target.value)}
                      aria-label="Filter roster by team"
                      className="h-9 rounded-lg border border-border/60 bg-background/70 px-2.5 text-[11px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <option value="all" className="bg-background text-foreground">All teams</option>
                      {rosterSkillOptions.map((skill) => <option key={skill} value={skill} className="bg-background text-foreground">{skill}</option>)}
                    </select>
                  </div>
                  <div className="mt-2 flex items-center justify-between px-1 text-[9px] text-muted-foreground">
                    <span>{new Date(`${rosterDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                    <span>{rosterLoading ? 'Checking live schedule' : 'Read-only · shared schedule'}</span>
                  </div>
                  <div className="mt-1 max-h-56 overflow-y-auto rounded-xl border border-border/60 bg-background/25">
                    {visibleRoster.length === 0 ? (
                      <p className="p-5 text-center text-xs text-muted-foreground">
                        {rosterAgents.length ? 'No agents match those filters.' : 'No roster snapshot is available for this month.'}
                      </p>
                    ) : visibleRoster.map((agent) => {
                      const code = rosterShiftOf(agent, rosterDate);
                      const off = isRosterOffDay(code);
                      return (
                        <div key={`${agent.no}-${agent.en}`} className="flex items-center gap-3 border-b border-border/35 px-3 py-2 last:border-0">
                          <span className={cn('size-2 shrink-0 rounded-full', off ? 'bg-foreground/20' : 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.35)]')} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-foreground">{agent.en}</span>
                            <span className="block text-[9px] text-muted-foreground">{agent.skill}</span>
                          </span>
                          <span className={cn(
                            'min-w-14 rounded-md border px-2 py-1 text-center font-mono text-[10px] font-bold',
                            off ? 'border-border/50 bg-background/50 text-muted-foreground' : 'border-sky-400/25 bg-sky-400/10 text-sky-200'
                          )}>
                            {code || '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : (
                <section aria-label="Town announcements">
                  <p className="mb-3 text-[11px] text-muted-foreground">Community notes hung for everyone passing through the square.</p>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {banners.length === 0 && (
                      <p className="rounded-lg border border-dashed border-border/60 p-5 text-center text-xs text-muted-foreground">
                        No announcements yet. Check back after the next town meeting.
                      </p>
                    )}
                    {banners.map((banner) => (
                      <div
                        key={banner.id}
                        className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2"
                        style={{ borderLeft: `4px solid hsl(${banner.hue} 70% 55%)` }}
                      >
                        <p className="text-xs font-semibold text-foreground">{banner.text}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          — {banner.author} · {new Date(banner.at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                  {isAdmin && (
                    <div className="mt-3 flex gap-1.5">
                      <input
                        value={bannerDraft}
                        onChange={(event) => setBannerDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') hangBanner();
                          event.stopPropagation();
                        }}
                        maxLength={80}
                        placeholder="Post a town announcement…"
                        className="glass-field h-9 min-w-0 flex-1 rounded-lg border border-border/60 bg-background/70 px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      />
                      <button
                        type="button"
                        onClick={hangBanner}
                        disabled={!bannerDraft.trim() || bannerSending}
                        className="glass-btn h-9 rounded-lg border border-primary/40 bg-primary px-3 text-[11px] font-bold text-primary-foreground transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
                      >
                        {bannerSending ? 'Posting…' : 'Post'}
                      </button>
                    </div>
                  )}
                </section>
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
function canOccupy(x: number, y: number, radius: number, ignoreCarId?: CommuneCarId) {
  if (x < radius || x > WORLD_W - radius || y < radius + 120 || y > WORLD_H - radius) return false;
  if (Math.hypot(x - FOUNTAIN.x, y - FOUNTAIN.y) < FOUNTAIN.r + radius) return false;

  if (PONDS.some((pond) => {
    const pondX = (x - pond.x) / (pond.rx + radius);
    const pondY = (y - pond.y) / (pond.ry + radius);
    return pondX * pondX + pondY * pondY < 1;
  })) return false;
  if (REMOTE_TREES.some(([tx, ty]) =>
    x > tx - 30 - radius && x < tx + 30 + radius
    && y > ty - 42 - radius && y < ty + 4 + radius
  )) return false;
  if (PARKED_CARS.some((car) => {
    if (car.id === ignoreCarId) return false;
    const bounds = carHalfExtents(car.heading);
    return x > car.x - bounds.x - radius && x < car.x + bounds.x + radius
      && y > car.y - bounds.y - radius && y < car.y + bounds.y + radius;
  })) return false;

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
    const nearObject = WORLD_OBJECTS.some((object) => Math.hypot(x - object.x, y - object.y) < 100);
    if (canOccupy(x, y, 28) && !nearChallenge && !nearProp && !nearObject) return [x, y];
  }

  const safeSpots = SERENDIPITY_SPOTS.filter(([x, y]) => canOccupy(x, y, 28));
  return safeSpots[Math.floor(Math.random() * safeSpots.length)] ?? [originX, originY];
}

function approachPoint(targetX: number, targetY: number, fromX: number, fromY: number, distance = 58) {
  const baseAngle = Math.atan2(fromY - targetY, fromX - targetX);
  for (let i = 0; i < 8; i++) {
    const angle = baseAngle + i * Math.PI / 4;
    const x = targetX + Math.cos(angle) * distance;
    const y = targetY + Math.sin(angle) * distance;
    if (canOccupy(x, y, 24)) return { x, y };
  }
  return { x: targetX + distance + 8, y: targetY };
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
  ducks: PondDuck[] = [],
  incident: DuckIncident | null = null
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
  for (const car of PARKED_CARS) {
    const occupants = [
      ...(player.carId === car.id ? [player.name] : []),
      ...remotes.filter((remote) => remote.carId === car.id).map((remote) => remote.name),
    ].slice(0, 2);
    items.push({ y: car.y + 72, fn: () => drawParkedCar(ctx, car, occupants) });
  }
  for (const object of WORLD_OBJECTS) {
    items.push({ y: object.y, fn: () => drawCommuneWorldObject(ctx, object) });
  }
  for (const d of ducks) items.push({ y: d.y, fn: () => drawDuck(ctx, d, t) });
  if (incident) items.push({ y: incident.y, bright: true, fn: () => drawWhatTheDuck(ctx, incident, t, reduceMotion) });
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
    if (r.carId) continue;
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
  if (!player.carId) items.push({ y: player.y, bright: true, fn: () => drawAgent(ctx, player, t, true) });
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
    treasure: '#f5c95d',
    'rubber-duck': '#ffe36e',
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
  } else if (moment.kind === 'treasure') {
    ctx.fillStyle = '#8a5a33';
    ctx.fillRect(-9, -2, 18, 12);
    ctx.fillStyle = '#d9a441';
    ctx.fillRect(-10, -6, 20, 6);
    ctx.fillRect(-2, -6, 4, 16);
    ctx.fillStyle = '#f5e2a2';
    ctx.fillRect(-1, -1, 3, 3);
  } else if (moment.kind === 'rubber-duck') {
    ctx.fillStyle = '#f3c941';
    ctx.fillRect(-7, -4, 13, 9);
    ctx.fillRect(-3, -8, 8, 7);
    ctx.fillStyle = '#e68b35';
    ctx.fillRect(5, -5, 5, 3);
    ctx.fillStyle = '#24303b';
    ctx.fillRect(1, -6, 2, 2);
    ctx.fillStyle = '#d97757';
    ctx.fillRect(-3, -12, 3, 4);
    ctx.fillRect(-6, -9, 9, 2);
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

function drawCommuneWorldObject(ctx: CanvasRenderingContext2D, object: CommuneWorldObject) {
  const { x, y } = object;
  if (object.id === 'treehole') {
    drawGroundShadow(ctx, x, y + 4, 48, 14, 0.24);
    drawPixelTree(ctx, x, y, 1.9);
    ctx.fillStyle = '#342b25';
    ctx.fillRect(x - 9, y - 67, 18, 19);
    ctx.fillStyle = '#806b51';
    ctx.fillRect(x - 5, y - 64, 10, 12);
    ctx.fillStyle = '#d6b875';
    ctx.fillRect(x + 12, y - 57, 3, 3);
    ctx.fillStyle = '#f2e6c8';
    ctx.font = "bold 9px 'Schoolbell', ui-monospace, monospace";
    ctx.textAlign = 'center';
    ctx.fillText('TREEHOLE', x, y - 92);
    return;
  }
  drawGroundShadow(ctx, x, y + 3, 25, 7, 0.2);
  if (object.id === 'duck-post') {
    ctx.fillStyle = '#79573f';
    ctx.fillRect(x - 3, y - 38, 6, 38);
    ctx.fillStyle = '#4e7180';
    ctx.fillRect(x - 19, y - 34, 34, 25);
    ctx.fillStyle = '#78a5ad';
    ctx.fillRect(x - 15, y - 30, 26, 15);
    ctx.fillStyle = '#f0d394';
    ctx.fillRect(x - 5, y - 25, 7, 5);
    ctx.fillStyle = '#fff2cf';
    ctx.font = "bold 8px 'Schoolbell', ui-monospace, monospace";
    ctx.textAlign = 'center';
    ctx.fillText('DUCK MAIL', x, y - 42);
  } else if (object.id === 'mushroom-throne') {
    ctx.fillStyle = '#f4e3bf';
    ctx.fillRect(x - 10, y - 21, 20, 20);
    ctx.fillStyle = '#d97757';
    ctx.fillRect(x - 24, y - 31, 48, 12);
    ctx.fillRect(x - 17, y - 39, 34, 10);
    ctx.fillStyle = '#f5f3ea';
    ctx.fillRect(x - 12, y - 32, 5, 4);
    ctx.fillRect(x + 7, y - 36, 5, 4);
    ctx.fillStyle = '#788c5d';
    ctx.fillRect(x - 3, y - 16, 6, 5);
  } else {
    ctx.fillStyle = '#6a5948';
    ctx.fillRect(x - 18, y - 16, 4, 18);
    ctx.fillRect(x + 13, y - 16, 4, 18);
    ctx.fillRect(x - 2, y - 18, 4, 20);
    ctx.fillStyle = '#8a6a4a';
    ctx.fillRect(x - 22, y - 24, 32, 12);
    ctx.fillRect(x - 14, y - 29, 23, 9);
    ctx.fillStyle = '#6a9bcc';
    ctx.fillRect(x - 17, y - 22, 23, 6);
    ctx.fillStyle = '#d6b875';
    ctx.fillRect(x + 10, y - 26, 3, 3);
  }
}

function drawParkedCar(ctx: CanvasRenderingContext2D, car: ParkedCar, occupants: string[]) {
  const { x, y } = car;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(car.heading);
  ctx.scale(1, 1.3);
  const cx = 0;
  const cy = 0;
  drawGroundShadow(ctx, cx + 2, cy + 8, 42, 39, 0.25);
  ctx.fillStyle = '#293338';
  ctx.fillRect(cx - 32, cy - 29, 9, 16);
  ctx.fillRect(cx + 23, cy - 29, 9, 16);
  ctx.fillRect(cx - 32, cy + 13, 9, 16);
  ctx.fillRect(cx + 23, cy + 13, 9, 16);

  ctx.fillRect(cx - 21, cy - 43, 42, 86);
  ctx.fillRect(cx - 30, cy - 36, 60, 72);
  ctx.fillRect(cx - 36, cy - 25, 72, 50);
  ctx.fillStyle = car.body;
  ctx.fillRect(cx - 18, cy - 40, 36, 80);
  ctx.fillRect(cx - 27, cy - 33, 54, 66);
  ctx.fillRect(cx - 33, cy - 22, 66, 44);

  ctx.fillStyle = car.trim;
  ctx.fillRect(cx - 20, cy - 35, 40, 3);
  ctx.fillStyle = '#38545d';
  ctx.fillRect(cx - 20, cy - 29, 40, 11);
  ctx.fillRect(cx - 22, cy - 14, 44, 41);
  ctx.fillStyle = '#253940';
  ctx.fillRect(cx - 18, cy - 10, 36, 32);
  ctx.fillStyle = '#7da5ad';
  ctx.fillRect(cx - 18, cy + 28, 36, 6);
  ctx.fillStyle = car.trim;
  ctx.fillRect(cx - 28, cy - 12, 4, 38);
  ctx.fillRect(cx + 24, cy - 12, 4, 38);
  ctx.fillRect(cx - 1, cy - 16, 2, 42);

  ctx.fillStyle = '#f5df9b';
  ctx.fillRect(cx - 22, cy - 42, 8, 3);
  ctx.fillRect(cx + 14, cy - 42, 8, 3);
  ctx.fillStyle = '#f18268';
  ctx.fillRect(cx - 21, cy + 39, 8, 3);
  ctx.fillRect(cx + 13, cy + 39, 8, 3);

  for (let seat = 0; seat < 2; seat++) {
    ctx.fillStyle = occupants[seat] ? '#f3d6a2' : 'rgba(255,255,255,0.22)';
    ctx.fillRect(cx - 17 + seat * 23, cy + 1, 13, 14);
    ctx.fillStyle = occupants[seat] ? '#26333a' : 'rgba(255,255,255,0.1)';
    ctx.fillRect(cx - 13 + seat * 23, cy + 4, 3, 3);
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(17,24,25,0.76)';
  ctx.fillRect(x - 49, y + 62, 98, 14);
  ctx.fillStyle = '#fff4da';
  ctx.font = "bold 7px 'Schoolbell', ui-monospace, monospace";
  ctx.textAlign = 'center';
  const occupantsLabel = occupants.length
    ? `${occupants.map((name) => name.slice(0, 6)).join(' + ')} · ${occupants.length}/2`
    : `${car.label} · E`;
  ctx.fillText(occupantsLabel, x, y + 72);
}

function drawWhatTheDuck(ctx: CanvasRenderingContext2D, incident: DuckIncident, t: number, reduceMotion: boolean) {
  const bob = reduceMotion ? 0 : Math.sin(t * 10 + incident.phase) * 4;
  const x = Math.round(incident.x);
  const y = Math.round(incident.y + bob);
  drawGroundShadow(ctx, x, y + 3, 14, 4, 0.22);
  ctx.save();
  ctx.translate(x, y);
  if (!reduceMotion) ctx.rotate(Math.sin(t * 12 + incident.phase) * 0.09);
  // A very serious duck, wearing a party hat and carrying a tiny briefcase.
  ctx.fillStyle = '#f3c941';
  ctx.fillRect(-9, -12, 18, 10);
  ctx.fillRect(-2, -19, 11, 10);
  ctx.fillStyle = '#e68b35';
  ctx.fillRect(7, -16, 7, 3);
  ctx.fillStyle = '#24303b';
  ctx.fillRect(3, -17, 2, 2);
  ctx.fillStyle = '#d97757';
  ctx.fillRect(1, -26, 4, 7);
  ctx.fillRect(-2, -21, 10, 2);
  ctx.fillStyle = '#58616a';
  ctx.fillRect(-16, -9, 8, 7);
  ctx.fillStyle = '#d8c298';
  ctx.fillRect(-15, -8, 6, 5);
  ctx.fillStyle = '#e68b35';
  ctx.fillRect(-7, -2, 4, 4);
  ctx.fillRect(3, -2, 4, 4);
  ctx.restore();
  drawBubble(ctx, x, y - 21, 'WHAT THE DUCK?!');
  if (!reduceMotion && Math.floor(t * 5) % 3 === 0) {
    ctx.fillStyle = '#f7f3c8';
    ctx.fillRect(x + 17, y - 22, 3, 3);
    ctx.fillRect(x - 20, y - 27, 2, 2);
  }
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

function drawPixelTree(ctx: CanvasRenderingContext2D, x: number, groundY: number, scale = 1) {
  if (!pixelTreeSprite) {
    pixelTreeSprite = document.createElement('canvas');
    pixelTreeSprite.width = 112;
    pixelTreeSprite.height = 176;
    const treeCtx = pixelTreeSprite.getContext('2d');
    if (treeCtx) paintPixelTree(treeCtx, 56, 160);
  }
  ctx.drawImage(pixelTreeSprite, x - 56 * scale, groundY - 160 * scale, 112 * scale, 176 * scale);
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
  for (const [bx, by] of [[40, 40], [3160, 40], [40, 2360], [3160, 2360]] as const) {
    pxEllipse(bx, by, 40, 28, '#527a58');
  }

  /* A few broad clearings give the new districts their own color without
   * turning the whole map into a costly field of individual sprites. */
  pxEllipse(2350, 690, 660, 410, '#6e916b');
  pxEllipse(1940, 1650, 720, 610, '#6a8a63');
  pxEllipse(2850, 1790, 420, 430, '#7e9871');
  for (let i = 0; i < 1900; i++) {
    const x = 1540 + rand() * 1620;
    const y = 64 + rand() * 2272;
    const color = rand() < 0.55 ? '#789b72' : '#668967';
    px(x, y, 8, 8, color);
  }

  /* dirt paths (quadratic curves sampled into grid-aligned slabs) */
  const PATHS: [number, number, number, number, number, number][] = [
    [800, 600, 800, 480, 800, 400], // north → bulletin board
    [800, 640, 620, 700, 450, 730], // west → showcase stall
    [800, 640, 980, 700, 1150, 730], // east → challenge tent
    [800, 700, 800, 900, 800, 1150], // south → hedge gate
    [1150, 730, 1370, 770, 1580, 730], // arcade trail → eastern meadow
    [1580, 730, 1760, 640, 1900, 590],
    [1900, 590, 2140, 530, 2350, 650], // duck borough
    [2350, 650, 2470, 730, 2490, 850], // lagoon shore
    [800, 1150, 850, 1370, 1040, 1510], // south gate → oddity orchard
    [1040, 1510, 1330, 1660, 1530, 1600],
    [1530, 1600, 1700, 1490, 1870, 1350], // mushroom council
    [1530, 1600, 1810, 1700, 2110, 1710],
    [2110, 1710, 2370, 1710, 2700, 1790], // star overlook
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
  for (let i = 0; i < 540; i++) {
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

  /* East lagoon — a second place to feed ducks and find suspicious mail. */
  pxShadow(DUCK_LAGOON.x + 8, DUCK_LAGOON.y + 18, DUCK_LAGOON.rx + 24, DUCK_LAGOON.ry + 22, 0.23);
  pxEllipse(DUCK_LAGOON.x, DUCK_LAGOON.y, DUCK_LAGOON.rx + 20, DUCK_LAGOON.ry + 18, '#b99a72');
  pxEllipse(DUCK_LAGOON.x, DUCK_LAGOON.y, DUCK_LAGOON.rx, DUCK_LAGOON.ry, '#5b8ea2');
  pxEllipse(DUCK_LAGOON.x - 8, DUCK_LAGOON.y - 6, DUCK_LAGOON.rx - 22, DUCK_LAGOON.ry - 18, '#77abc0');
  for (let i = 0; i < 72; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = Math.sqrt(rand());
    px(
      DUCK_LAGOON.x + Math.cos(angle) * radius * (DUCK_LAGOON.rx - 24),
      DUCK_LAGOON.y + Math.sin(angle) * radius * (DUCK_LAGOON.ry - 20),
      8,
      8,
      i % 3 ? '#94c5d0' : '#b7d8d4'
    );
  }
  // A short dock and reeds make the shore legible from the walking path.
  pxShadow(2444, 882, 58, 12, 0.22);
  px(2398, 852, 96, 12, '#876b54');
  px(2404, 868, 84, 10, '#a38665');
  for (const [rx, ry] of [[2434, 632], [2508, 594], [2728, 670], [2694, 898]] as const) {
    px(rx, ry - 15, 5, 22, '#3c7849');
    px(rx - 3, ry - 21, 11, 7, '#698d58');
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

  const districtSign = (x: number, y: number, title: string, color: string) => {
    pxShadow(x, y + 8, 88, 12, 0.18);
    px(x - 78, y - 14, 156, 28, '#72573f');
    px(x - 72, y - 10, 144, 20, color);
    g.fillStyle = '#fff4da';
    g.font = "bold 12px 'Schoolbell', ui-monospace, monospace";
    g.textAlign = 'center';
    g.fillText(title, x, y + 4);
  };
  districtSign(2580, 548, 'DUCK BOROUGH', '#587f85');
  districtSign(1870, 1190, 'ODDITY ORCHARD', '#71814f');
  districtSign(2700, 1632, 'STAR OVERLOOK', '#53677f');

  // The far groves are part of the static bake, keeping per-frame work flat.
  for (const [x, y] of REMOTE_TREES) paintPixelTree(g, x, y);

  townLayer = cv;
  return cv;
}
