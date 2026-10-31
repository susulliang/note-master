/**
 * CommunePanel — COMMUNE, the agents' town square (摩尔庄园-inspired).
 * A cozy isometric town where logged-in agents stroll between the
 * fountain, the bulletin board, the showcase stall and the challenge tent,
 * chit-chat with villager NPCs and each other via speech bubbles.
 *
 * LIVE SCOPE:
 *   • Low-poly Three.js world with instanced scenery and animated agents.
 *   • Ground-plane raycasting maps taps back into the existing world coordinates.
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
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import {
  COMMUNE_HANGOUTS,
  COMMUNE_HANGOUT_ENTER_RANGE,
  COMMUNE_HANGOUT_EXIT_OFFSET,
  type CommuneHangout,
  type CommuneHangoutId,
} from '@shared/commune-hangouts';
import {
  COMMUNE_BUILD_CATALOG,
  COMMUNE_BUILD_INTERACT_RANGE,
  communeBuildIsUnderConstruction,
  communeBuildCarId,
  type CommuneBuildable,
  type CommuneBuildKind,
} from '@shared/commune-buildables';
import CommuneBoardSketchPad, { CommuneBoardSketchPreview } from '@/components/CommuneBoardSketchPad';
import {
  communeSocketUrl,
  createCommuneBanner,
  createCommuneSocketTicket,
  deleteCommuneBanner,
  DEFAULT_AVATAR,
  editCommuneBanner,
  fetchCommuneTreeholeFeedback,
  fetchCardCollection,
  pickSpiceDrop,
  refreshCommuneSpiceDrops,
  saveCommuneLoadout,
  submitCommuneTreeholeFeedback,
  type CommuneAgent,
  type CommuneAvatar,
  type CommuneBanner,
  type CommuneBannerKind,
  type CommuneBannerPriority,
  type CommuneBannerStroke,
  type CommuneDrop,
  type CommuneLaserShot,
  type CommuneLoadout,
  type CommuneMiniGame,
  type CommunePet,
  type CommuneSoccerBall,
  type CommuneTreeholeCategory,
  type CommuneTreeholeEntry,
  finishCommuneMiniGame,
  demolishCommuneBuildable,
  fireCommuneLaser,
  kickCommuneSoccerBall,
  listCommuneChallengeNpcs,
  placeCommuneBuildable,
  startCommuneMiniGame,
  type CommuneChallengeNpc,
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
import {
  CommuneThreeRenderer,
  type CommuneThreeFrame,
  type CommuneThreeLaserShot,
} from '@/lib/commune-three-renderer';

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
const MINI_GAME_ZONES = {
  golf: { x: 2860, y: 1280, range: 230 },
  bowling: { x: 2250, y: 1290, range: 220 },
  soccer: { left: 850, right: 1280, top: 1820, bottom: 2120, x: 1065, y: 1970 },
} as const;
const GOLF_TEE = { x: 2725, y: 1260 };
const GOLF_WORLD_SCALE = 0.9;
function golfWorldPosition(localX: number, localY: number) {
  return {
    x: GOLF_TEE.x + (localX - 28) * GOLF_WORLD_SCALE,
    y: GOLF_TEE.y + (localY - 60) * GOLF_WORLD_SCALE,
  };
}
const BOWLING_PINS: [number, number][] = [
  [114, 25], [126, 25], [138, 25], [150, 25],
  [120, 39], [132, 39], [144, 39],
  [126, 53], [138, 53],
  [132, 67],
];
const BOWLING_APPROACH = { x: MINI_GAME_ZONES.bowling.x, y: 1460 };
const isInBowlingArena = (x: number, y: number) => (
  Math.hypot(x - MINI_GAME_ZONES.bowling.x, y - MINI_GAME_ZONES.bowling.y) <= MINI_GAME_ZONES.bowling.range
);
type TRexMode = 'mowing' | 'zoomies' | 'confused' | 'napping' | 'reverse';
interface MowerTrack {
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  at: number;
}
interface TRexState {
  x: number;
  y: number;
  heading: number;
  mode: TRexMode;
  modeStartedAt: number;
  modeUntil: number;
  nextMoodAt: number;
  panicCooldownUntil: number;
  lawnIndex: number;
  rowIndex: number;
  rowPass: 0 | 1;
  rowDirection: 1 | -1;
  path: { x: number; y: number }[];
  pathIndex: number;
  goalX: number;
  goalY: number;
  lastTrackX: number;
  lastTrackY: number;
  trackDistance: number;
  says: { text: string; until: number } | null;
}
const T_REX_LAWNS = [
  { left: 1690, right: 1950, top: 800, bottom: 1010 },
  { left: 1980, right: 2250, top: 800, bottom: 1010 },
  { left: 2370, right: 2600, top: 1490, bottom: 1650 },
] as const;
const MOWER_ROW_SPACING = 38;
const MOWER_TRACK_SPACING = 14;
const MOWER_NAV_GRID = 36;

function createTRexState(): TRexState {
  const now = Date.now();
  return {
    x: 1710,
    y: 818,
    heading: 0,
    mode: 'mowing',
    modeStartedAt: now,
    modeUntil: 0,
    nextMoodAt: now + 18_000,
    panicCooldownUntil: 0,
    lawnIndex: 0,
    rowIndex: 0,
    rowPass: 1,
    rowDirection: 1,
    path: [],
    pathIndex: 0,
    goalX: 1932,
    goalY: 818,
    lastTrackX: 1710,
    lastTrackY: 818,
    trackDistance: 0,
    says: { text: 'T-rex has detected suspiciously tall grass.', until: now + 5500 },
  };
}

function parseTRexState(value: unknown): TRexState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const modes: TRexMode[] = ['mowing', 'zoomies', 'confused', 'napping', 'reverse'];
  const numericKeys = [
    'x', 'y', 'heading', 'modeStartedAt', 'modeUntil', 'nextMoodAt',
    'panicCooldownUntil', 'lawnIndex', 'rowIndex', 'rowPass', 'rowDirection',
    'pathIndex', 'goalX', 'goalY', 'lastTrackX', 'lastTrackY', 'trackDistance',
  ] as const;
  if (
    !modes.includes(input.mode as TRexMode)
    || numericKeys.some((key) => !Number.isFinite(Number(input[key])))
    || !Array.isArray(input.path)
    || input.path.length > 256
  ) return null;

  const path = input.path.flatMap((point) => {
    if (!point || typeof point !== 'object') return [];
    const item = point as Record<string, unknown>;
    if (!Number.isFinite(Number(item.x)) || !Number.isFinite(Number(item.y))) return [];
    return [{
      x: Math.max(0, Math.min(WORLD_W, Number(item.x))),
      y: Math.max(0, Math.min(WORLD_H, Number(item.y))),
    }];
  });
  if (path.length !== input.path.length) return null;

  let says: TRexState['says'] = null;
  if (input.says && typeof input.says === 'object') {
    const speech = input.says as Record<string, unknown>;
    if (typeof speech.text !== 'string' || !Number.isFinite(Number(speech.until))) return null;
    says = { text: speech.text.slice(0, 120), until: Number(speech.until) };
  }

  const clampWorld = (item: unknown, maximum: number) => Math.max(0, Math.min(maximum, Number(item)));
  const rawHeading = Number(input.heading);
  return {
    x: clampWorld(input.x, WORLD_W),
    y: clampWorld(input.y, WORLD_H),
    heading: ((rawHeading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2),
    mode: input.mode as TRexMode,
    modeStartedAt: Number(input.modeStartedAt),
    modeUntil: Number(input.modeUntil),
    nextMoodAt: Number(input.nextMoodAt),
    panicCooldownUntil: Number(input.panicCooldownUntil),
    lawnIndex: Math.max(0, Math.min(T_REX_LAWNS.length - 1, Math.trunc(Number(input.lawnIndex)))),
    rowIndex: Math.max(0, Math.min(1000, Math.trunc(Number(input.rowIndex)))),
    rowPass: Number(input.rowPass) === 1 ? 1 : 0,
    rowDirection: Number(input.rowDirection) < 0 ? -1 : 1,
    path,
    pathIndex: Math.max(0, Math.min(path.length, Math.trunc(Number(input.pathIndex)))),
    goalX: clampWorld(input.goalX, WORLD_W),
    goalY: clampWorld(input.goalY, WORLD_H),
    lastTrackX: clampWorld(input.lastTrackX, WORLD_W),
    lastTrackY: clampWorld(input.lastTrackY, WORLD_H),
    trackDistance: Math.max(0, Math.min(1000, Number(input.trackDistance))),
    says,
  };
}

interface PhysicsBallMotion {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  startedAt: number;
  duration: number;
  arc: number;
}
const INITIAL_SOCCER_BALL: CommuneSoccerBall = {
  x: MINI_GAME_ZONES.soccer.x,
  y: MINI_GAME_ZONES.soccer.y,
  fromX: MINI_GAME_ZONES.soccer.x,
  fromY: MINI_GAME_ZONES.soccer.y,
  kickedAt: 0,
  by: null,
};
const PONDS = [
  { id: 'town-pond', ...POND_C },
  { id: 'duck-lagoon', ...DUCK_LAGOON },
] as const;

function smoothStep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function parseLaserShot(value: unknown): CommuneLaserShot | null {
  if (!value || typeof value !== 'object') return null;
  const shot = value as Record<string, unknown>;
  const numeric = [
    shot.fromX, shot.fromY, shot.fromHeight, shot.toX, shot.toY, shot.toHeight, shot.durationMs,
  ].map(Number);
  if (
    typeof shot.id !== 'string'
    || typeof shot.shooter !== 'string'
    || numeric.some((item) => !Number.isFinite(item))
    || (shot.targetUsername !== null && typeof shot.targetUsername !== 'string')
  ) return null;
  return {
    id: shot.id,
    shooter: shot.shooter,
    fromX: numeric[0],
    fromY: numeric[1],
    fromHeight: numeric[2],
    toX: numeric[3],
    toY: numeric[4],
    toHeight: numeric[5],
    durationMs: numeric[6],
    targetUsername: typeof shot.targetUsername === 'string' ? shot.targetUsername : null,
  };
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
type CommuneCarId = string;

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
  style?: 'classic' | 'electric-sport';
  buildId?: string;
  owner?: string;
  halfWidth?: number;
  halfLength?: number;
  samples?: { x: number; y: number; heading: number; at: number }[];
}

const PARKED_CARS: ParkedCar[] = [
  { id: 'meadow-cruiser', label: 'Meadow Coupe', x: 1740, y: 820, heading: 0, targetX: 1740, targetY: 820, targetHeading: 0, body: '#6288a4', trim: '#d5e2e7' },
  { id: 'orchard-wagon', label: 'Orchard Coupe', x: 2300, y: 1880, heading: 0, targetX: 2300, targetY: 1880, targetHeading: 0, body: '#b76552', trim: '#f0d7b3' },
];
const BUILT_OBJECTS: CommuneBuildable[] = [];
function reconcileBuiltObjects(items: CommuneBuildable[]): void {
  BUILT_OBJECTS.splice(0, BUILT_OBJECTS.length, ...items);
  const activeCarIds = new Set(
    items.filter((item) => item.kind === 'sports-car').map((item) => communeBuildCarId(item.id)),
  );
  for (let index = PARKED_CARS.length - 1; index >= 0; index--) {
    const car = PARKED_CARS[index];
    if (car?.buildId && !activeCarIds.has(car.id)) PARKED_CARS.splice(index, 1);
  }
  for (const item of items) {
    if (item.kind !== 'sports-car') continue;
    const id = communeBuildCarId(item.id);
    const existing = PARKED_CARS.find((car) => car.id === id);
    if (existing) {
      existing.owner = item.owner;
      continue;
    }
    PARKED_CARS.push({
      id,
      buildId: item.id,
      owner: item.owner,
      label: 'Electric Sports Car',
      x: item.x,
      y: item.y,
      heading: item.rotation,
      targetX: item.x,
      targetY: item.y,
      targetHeading: item.rotation,
      body: '#c9d7dd',
      trim: '#5b7180',
      style: 'electric-sport',
      halfWidth: 48,
      halfLength: 71,
      samples: [{ x: item.x, y: item.y, heading: item.rotation, at: performance.now() }],
    });
  }
}

function isBuildCarReady(car: ParkedCar): boolean {
  if (!car.buildId) return true;
  const buildable = BUILT_OBJECTS.find((item) => item.id === car.buildId);
  return !buildable || !communeBuildIsUnderConstruction(buildable);
}

function formatBuildDuration(durationMs: number): string {
  return durationMs < 60_000
    ? `${Math.round(durationMs / 1_000)} sec`
    : `${Math.round(durationMs / 60_000)} min`;
}

function resetCarSnapshot(car: ParkedCar, x: number, y: number, heading: number): void {
  const at = performance.now();
  car.x = x;
  car.y = y;
  car.heading = heading;
  car.targetX = x;
  car.targetY = y;
  car.targetHeading = heading;
  car.samples = [{ x, y, heading, at }];
}

function recordCarSnapshot(car: ParkedCar, x: number, y: number, heading: number): void {
  const samples = car.samples ?? [];
  const previous = samples[samples.length - 1];
  const at = Math.max(performance.now(), (previous?.at ?? 0) + 0.01);
  car.targetX = x;
  car.targetY = y;
  car.targetHeading = heading;
  samples.push({ x, y, heading, at });
  if (samples.length > 8) samples.splice(0, samples.length - 8);
  car.samples = samples;
}

function interpolateCarSnapshots(car: ParkedCar, renderAt: number): void {
  const samples = car.samples;
  if (!samples?.length) return;
  if (renderAt <= samples[0].at) {
    const first = samples[0];
    car.x = first.x;
    car.y = first.y;
    car.heading = first.heading;
    return;
  }
  for (let index = 1; index < samples.length; index++) {
    const next = samples[index];
    const previous = samples[index - 1];
    if (renderAt > next.at) continue;
    const span = Math.max(0.01, next.at - previous.at);
    const t = Math.max(0, Math.min(1, (renderAt - previous.at) / span));
    const headingDelta = Math.atan2(
      Math.sin(next.heading - previous.heading),
      Math.cos(next.heading - previous.heading),
    );
    car.x = previous.x + (next.x - previous.x) * t;
    car.y = previous.y + (next.y - previous.y) * t;
    car.heading = previous.heading + headingDelta * t;
    return;
  }

  const latest = samples[samples.length - 1];
  car.x = latest.x;
  car.y = latest.y;
  car.heading = latest.heading;
  if (samples.length < 2) return;
  const previous = samples[samples.length - 2];
  const span = latest.at - previous.at;
  if (span <= 0) return;
  const extrapolation = Math.min(CAR_MAX_EXTRAPOLATION_MS, Math.max(0, renderAt - latest.at)) / span;
  car.x += (latest.x - previous.x) * extrapolation;
  car.y += (latest.y - previous.y) * extrapolation;
}

function parseCommuneBuiltObjects(value: unknown): CommuneBuildable[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    if (
      typeof item.id !== 'string'
      || typeof item.owner !== 'string'
      || !COMMUNE_BUILD_CATALOG.some((entry) => entry.kind === item.kind)
      || ![item.x, item.y, item.rotation, item.createdAt].every((part) => Number.isFinite(Number(part)))
    ) return [];
    return [{
      id: item.id,
      owner: item.owner,
      kind: item.kind as CommuneBuildKind,
      x: Number(item.x),
      y: Number(item.y),
      rotation: Number(item.rotation),
      createdAt: Number(item.createdAt),
    }];
  });
}

const CAR_HALF_WIDTH = 39;
const CAR_HALF_LENGTH = 59;
const CAR_EXIT_DISTANCE = 100;
function carHalfExtents(heading: number, halfWidth = CAR_HALF_WIDTH, halfLength = CAR_HALF_LENGTH) {
  return {
    x: Math.abs(Math.cos(heading)) * halfWidth + Math.abs(Math.sin(heading)) * halfLength,
    y: Math.abs(Math.sin(heading)) * halfWidth + Math.abs(Math.cos(heading)) * halfLength,
  };
}

function buildHalfExtents(kind: CommuneBuildKind, rotation: number) {
  const item = COMMUNE_BUILD_CATALOG.find((entry) => entry.kind === kind);
  if (!item) return { x: 0, y: 0 };
  return {
    x: Math.abs(Math.cos(rotation)) * item.width / 2 + Math.abs(Math.sin(rotation)) * item.depth / 2,
    y: Math.abs(Math.sin(rotation)) * item.width / 2 + Math.abs(Math.cos(rotation)) * item.depth / 2,
  };
}

function canPlaceBuildLocally(
  kind: CommuneBuildKind,
  x: number,
  y: number,
  rotation: number,
): boolean {
  const footprint = buildHalfExtents(kind, rotation);
  return canOccupy(x, y, Math.max(footprint.x, footprint.y) + 4);
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
  | { type: 'enter-hangout'; key: 'E'; label: string; hangoutId: CommuneHangoutId }
  | { type: 'exit-hangout'; key: 'E'; label: string }
  | { type: 'demolish-build'; key: 'E'; label: string; buildingId: string }
  | { type: 'sit'; key: 'E'; label: string; x: number; y: number }
  | { type: 'fountain'; key: 'E'; label: string }
  | { type: 'pond'; key: 'E'; label: string; pondId: (typeof PONDS)[number]['id'] }
  | { type: 'serendipity'; key: 'E'; label: string; momentId: number }
  | { type: 'world-object'; key: 'E'; label: string; objectId: CommuneWorldObjectId }
  | { type: 'duck-incident'; key: 'E'; label: string; incidentId: number }
  | { type: 'mini-game'; key: 'E'; label: string; game: CommuneMiniGame }
  | { type: 'soccer-kick'; key: 'E'; label: string }
  | { type: 'prop'; key: 'E'; label: string; panel: PropPanelKind };

function touchActionIcon(action: CommuneAction) {
  switch (action.type) {
    case 'enter-car': return <CarFront className="size-6" />;
    case 'exit-car': return <DoorOpen className="size-6" />;
    case 'enter-hangout': return <Building2 className="size-6" />;
    case 'exit-hangout': return <DoorOpen className="size-6" />;
    case 'demolish-build': return <Building2 className="size-6" />;
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
    case 'mini-game':
    case 'soccer-kick': return <Gamepad2 className="size-6" />;
    case 'prop': return <Building2 className="size-6" />;
  }
}

function touchActionLabel(action: CommuneAction): string {
  switch (action.type) {
    case 'enter-car': return 'Drive';
    case 'exit-car': return 'Leave car';
    case 'enter-hangout': return 'Go inside';
    case 'exit-hangout': return 'Step outside';
    case 'demolish-build': return 'Take apart';
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
    case 'mini-game': return action.label;
    case 'soccer-kick': return 'Kick +1 spice';
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
  ...COMMUNE_HANGOUTS.map((hangout) => ({
    x: hangout.x - hangout.width / 2,
    y: hangout.y - hangout.depth / 2,
    w: hangout.width,
    h: hangout.depth,
  })),
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
const AFK_AFTER_MS = 5 * 60_000;
const PRESENCE_HEARTBEAT_MS = 15_000;
const PRESENCE_ACK_TIMEOUT_MS = 50_000;
const REMOTE_INTERPOLATION_DELAY_MS = 100;
const REMOTE_MAX_EXTRAPOLATION_MS = 180;
const CAR_MOVE_INTERVAL_MS = 80;
const CAR_INTERPOLATION_DELAY_MS = 100;
const CAR_MAX_EXTRAPOLATION_MS = 160;
const NPC_SPEED = 90;
interface Banner extends CommuneBanner {
  hue: number;
}

interface BoardNoteEditorProps {
  text: string;
  onTextChange: (text: string) => void;
  kind: CommuneBannerKind;
  onKindChange: (kind: CommuneBannerKind) => void;
  priority: CommuneBannerPriority;
  onPriorityChange: (priority: CommuneBannerPriority) => void;
  strokes: CommuneBannerStroke[];
  onStrokesChange: (strokes: CommuneBannerStroke[]) => void;
  label: string;
  large?: boolean;
}

function BoardNoteEditor({
  text,
  onTextChange,
  kind,
  onKindChange,
  priority,
  onPriorityChange,
  strokes,
  onStrokesChange,
  label,
  large = false,
}: BoardNoteEditorProps) {
  const [preview, setPreview] = useState(false);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="mb-1 block font-['Schoolbell'] text-[11px] font-bold uppercase tracking-wider text-[#705335]">Card format</span>
          <select
            value={kind}
            onChange={(event) => onKindChange(event.target.value as CommuneBannerKind)}
            className="h-9 w-full border-2 border-[#92734c] bg-[#fff4d9] px-2 font-['Schoolbell'] text-sm font-bold text-[#3c3021] outline-none focus-visible:ring-2 focus-visible:ring-[#7d6848]"
          >
            <option value="pin">Pinned note</option>
            <option value="priority">Priority card</option>
            <option value="sketch">Whiteboard sketch</option>
          </select>
        </label>
        {kind === 'priority' && (
          <label className="block min-w-0">
            <span className="mb-1 block font-['Schoolbell'] text-[11px] font-bold uppercase tracking-wider text-[#705335]">Priority</span>
            <select
              value={priority}
              onChange={(event) => onPriorityChange(event.target.value as CommuneBannerPriority)}
              className="h-9 w-full border-2 border-[#92734c] bg-[#fff4d9] px-2 font-['Schoolbell'] text-sm font-bold text-[#3c3021] outline-none focus-visible:ring-2 focus-visible:ring-[#7d6848]"
            >
              <option value="normal">Standard</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
        )}
      </div>
      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="font-['Schoolbell'] text-[11px] font-bold uppercase tracking-wider text-[#705335]">{label}</span>
          <div className="flex border border-[#92734c] bg-[#ead6ad] p-0.5" role="tablist" aria-label={`${label} editor mode`}>
            {(['Write', 'Preview'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={(mode === 'Preview') === preview}
                onClick={() => setPreview(mode === 'Preview')}
                className={cn(
                  'px-2.5 py-1 font-["Schoolbell"] text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7d6848]',
                  (mode === 'Preview') === preview
                    ? 'bg-[#735638] text-[#fff4d9]'
                    : 'text-[#715536] hover:bg-[#f8eccf]'
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        {preview ? (
          <div
            role="tabpanel"
            aria-label={`${label} Markdown preview`}
            className={cn(
              'overflow-y-auto border-2 border-[#92734c] bg-[#fff4d9] px-3 py-2.5 text-[#3c3021]',
              large ? 'min-h-64 max-h-[42dvh]' : 'min-h-20 max-h-56'
            )}
          >
            {text.trim() ? (
              <div className="prose prose-sm max-w-none break-words font-['Schoolbell'] text-sm leading-relaxed text-[#3c3021] prose-headings:my-2 prose-headings:font-['Schoolbell'] prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-a:text-[#5c6f43] prose-strong:text-[#3c3021]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
              </div>
            ) : (
              <p className="font-['Schoolbell'] text-sm italic text-[#9a805b]">Your formatted note preview will appear here.</p>
            )}
          </div>
        ) : (
          <textarea
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            maxLength={2000}
            rows={large ? 10 : 3}
            aria-label={label}
            placeholder={kind === 'priority' ? 'What needs attention?' : kind === 'sketch' ? 'Label this drawing…' : 'Write a town note… Markdown is welcome.'}
            className={cn(
              'w-full resize-y border-2 border-[#92734c] bg-[#fff4d9] px-2.5 py-2 font-["Schoolbell"] text-sm text-[#3c3021] placeholder:text-[#9a805b] outline-none focus-visible:ring-2 focus-visible:ring-[#7d6848]',
              large ? 'min-h-64' : 'min-h-20'
            )}
          />
        )}
        <p className="mt-1 font-['Schoolbell'] text-[11px] text-[#785e3e]">
          Markdown supported · raw HTML is disabled for safety · {text.length}/2000
        </p>
      </div>
      {kind === 'sketch' && <CommuneBoardSketchPad strokes={strokes} onChange={onStrokesChange} />}
    </div>
  );
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
const CHALLENGE_NPCS: {
  personaId: string;
  name: string;
  hue: number;
  x: number;
  y: number;
  modelNumber?: string;
  issueType?: string;
}[] = [
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

function bannerPlainText(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCommuneBannerStroke(value: unknown): value is CommuneBannerStroke {
  if (!value || typeof value !== 'object') return false;
  const stroke = value as Record<string, unknown>;
  return typeof stroke.color === 'string'
    && Array.isArray(stroke.points)
    && stroke.points.length <= 48
    && stroke.points.every((point) => (
      !!point
      && typeof point === 'object'
      && Number.isFinite(Number((point as Record<string, unknown>).x))
      && Number.isFinite(Number((point as Record<string, unknown>).y))
    ));
}

function parseBanners(value: unknown): Banner[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isCommuneBanner).slice(-6).map((banner) => {
    const kind: CommuneBannerKind = banner.kind === 'priority' || banner.kind === 'sketch' ? banner.kind : 'pin';
    const priority: CommuneBannerPriority = banner.priority === 'high' || banner.priority === 'urgent'
      ? banner.priority
      : 'normal';
    const strokes = Array.isArray(banner.strokes) ? banner.strokes.filter(isCommuneBannerStroke).slice(0, 20) : [];
    return {
      ...banner,
      kind,
      priority: kind === 'priority' ? priority : 'normal',
      strokes: kind === 'sketch' ? strokes : [],
      at: Number(banner.at),
      hue: hueOf(banner.author),
    };
  });
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
  headingX?: number;
  headingY?: number;
  name: string;
  hue: number;
  says: Speech | null;
  /** Status line rendered under the name tag (remote agents). */
  status?: string;
  isAfk?: boolean;
  /** Admin badge (gold star). */
  admin?: boolean;
  /** Public root marker reserved for the Super Admin. */
  superAdmin?: boolean;
  /** Optional pixel companion shown beside this agent. */
  pet?: CommunePet | null;
  /** Optional personalized pixel look (player + remote agents). */
  avatar?: CommuneAvatar | null;
  carId?: string | null;
  carSeat?: number | null;
  hangoutId?: CommuneHangoutId | null;
  hangoutSeat?: number | null;
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
  headingX: number;
  headingY: number;
  name: string;
  hue: number;
  phrase: string | null;
  status?: string;
  admin?: boolean;
  superAdmin?: boolean;
  pet: CommunePet | null;
  avatar: CommuneAvatar | null;
  says: Speech | null;
  moving: boolean;
  bobPhase: number;
  carId?: string | null;
  hangoutId?: CommuneHangoutId | null;
  hangoutSeat?: number | null;
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
  facingX: number;
  facingY: number;
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
  headingX: number;
  headingY: number;
}

export default function CommunePanel({ onCatThought, onCatMoveTo }: CommunePanelProps) {
  const { user, setSpice } = useAuth();
  const username = user?.username ?? 'Guest';
  const isAdmin = !!user?.canAccessAdmin;
  const isSuperAdmin = !!user?.isSuperAdmin;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const labelsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const communeRendererRef = useRef<CommuneThreeRenderer | null>(null);
  const [mapZoom, setMapZoom] = useState(1.5);
  const mapZoomRef = useRef(1.5);
  mapZoomRef.current = mapZoom;
  const cameraLookRef = useRef({ pitch: 0, yaw: 0 });
  const [pointerLocked, setPointerLocked] = useState(false);
  const [laserHitConfirmed, setLaserHitConfirmed] = useState(false);
  const laserHitTimerRef = useRef<number | null>(null);
  const laserShotsRef = useRef<CommuneThreeLaserShot[]>([]);
  const lastLaserFiredAtRef = useRef(Number.NEGATIVE_INFINITY);
  const upsertLaserShot = useCallback((shot: CommuneLaserShot) => {
    laserShotsRef.current = [
      ...laserShotsRef.current.filter((current) => current.id !== shot.id),
      { ...shot, startedAt: performance.now() / 1000 },
    ].slice(-32);
  }, []);
  const [panel, setPanel] = useState<PanelKind>(null);
  const golfRoundRef = useRef({
    roundId: null as string | null,
    localX: 28,
    localY: 60,
    shots: [] as { aim: number; power: number }[],
    busy: false,
    finished: false,
  });
  const golfBallMotionRef = useRef<PhysicsBallMotion>({
    x: GOLF_TEE.x,
    y: GOLF_TEE.y,
    fromX: GOLF_TEE.x,
    fromY: GOLF_TEE.y,
    startedAt: 0,
    duration: 0,
    arc: 0,
  });
  const bowlingBusyRef = useRef(false);
  const bowlingPinsDownRef = useRef<number[]>([]);
  const bowlingPinsKnockedAtRef = useRef(0);
  const bowlingBallMotionRef = useRef<PhysicsBallMotion>({
    x: BOWLING_APPROACH.x,
    y: BOWLING_APPROACH.y,
    fromX: BOWLING_APPROACH.x,
    fromY: BOWLING_APPROACH.y,
    startedAt: 0,
    duration: 0,
    arc: 0,
  });
  const tRexRef = useRef<TRexState>(createTRexState());
  const mowerClientIdRef = useRef<string | null>(null);
  const mowerAuthorityClientIdRef = useRef<string | null>(null);
  const mowerTargetRef = useRef<TRexState | null>(null);
  const lastMowerSnapshotSentAtRef = useRef(0);
  const mowerTracksRef = useRef<MowerTrack[]>([]);
  const [soccerBall, setSoccerBall] = useState<CommuneSoccerBall>(INITIAL_SOCCER_BALL);
  const soccerBallRef = useRef<CommuneSoccerBall>(INITIAL_SOCCER_BALL);
  soccerBallRef.current = soccerBall;
  /** Which challenge NPC's chat the E-key opened. */
  const [challengePersona, setChallengePersona] = useState('gb_poolius');
  const [communeChallengeProfiles, setCommuneChallengeProfiles] = useState<CommuneChallengeNpc[]>([]);
  const challengeNpcs = useMemo(() => {
    const profiles = [
      ...CHALLENGE_NPCS,
      ...communeChallengeProfiles.map((npc) => ({
        personaId: npc.id,
        name: npc.name,
        modelNumber: npc.modelNumber,
        issueType: npc.issueType,
        hue: hueOf(npc.name),
        x: 0,
        y: 0,
      })),
    ];
    const placed: typeof profiles = [];
    for (const npc of profiles) {
      let position: { x: number; y: number } | null = null;
      for (let attempt = 0; attempt < 120; attempt++) {
        const candidate = {
          x: 100 + Math.random() * (WORLD_W - 200),
          y: 160 + Math.random() * (WORLD_H - 280),
        };
        const clear = canOccupy(candidate.x, candidate.y, 38)
          && placed.every((other) => Math.hypot(candidate.x - other.x, candidate.y - other.y) >= 190);
        if (clear) {
          position = candidate;
          break;
        }
      }
      position ??= {
        x: 100 + Math.random() * (WORLD_W - 200),
        y: 160 + Math.random() * (WORLD_H - 280),
      };
      placed.push({ ...npc, ...position });
    }
    return placed;
  }, [communeChallengeProfiles]);
  const challengeNpcsRef = useRef(challengeNpcs);
  challengeNpcsRef.current = challengeNpcs;
  useEffect(() => {
    let current = true;
    void listCommuneChallengeNpcs()
      .then((npcs) => { if (current) setCommuneChallengeProfiles(npcs); })
      .catch(() => { /* custom challenges remain hidden until the API reconnects */ });
    return () => { current = false; };
  }, []);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [bannerTickerDismissed, setBannerTickerDismissed] = useState(false);
  const [bannerDraft, setBannerDraft] = useState('');
  const [bannerKind, setBannerKind] = useState<CommuneBannerKind>('pin');
  const [bannerPriority, setBannerPriority] = useState<CommuneBannerPriority>('normal');
  const [bannerStrokes, setBannerStrokes] = useState<CommuneBannerStroke[]>([]);
  const [bannerSending, setBannerSending] = useState(false);
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);
  const [bannerEditDraft, setBannerEditDraft] = useState('');
  const [bannerEditKind, setBannerEditKind] = useState<CommuneBannerKind>('pin');
  const [bannerEditPriority, setBannerEditPriority] = useState<CommuneBannerPriority>('normal');
  const [bannerEditStrokes, setBannerEditStrokes] = useState<CommuneBannerStroke[]>([]);
  const [bannerDeleteId, setBannerDeleteId] = useState<string | null>(null);
  const [bannerUpdating, setBannerUpdating] = useState(false);
  const [bannerDeleting, setBannerDeleting] = useState(false);
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
  const [interiorChatMessages, setInteriorChatMessages] = useState<CarChatMessage[]>([]);
  const [builtObjects, setBuiltObjects] = useState<CommuneBuildable[]>([]);
  const builtObjectsRef = useRef(builtObjects);
  builtObjectsRef.current = builtObjects;
  const [buildMenuOpen, setBuildMenuOpen] = useState(false);
  const [buildPlacementKind, setBuildPlacementKind] = useState<CommuneBuildKind | null>(null);
  const buildPlacementKindRef = useRef<CommuneBuildKind | null>(buildPlacementKind);
  buildPlacementKindRef.current = buildPlacementKind;
  const buildPlacementRotationRef = useRef(0);
  const buildPreviewRef = useRef<{ x: number; y: number; rotation: number; valid: boolean } | null>(null);
  const hoveredBuildObjectIdRef = useRef<string | null>(null);
  const buildTouchPreviewRef = useRef<{ x: number; y: number } | null>(null);
  const [buildBusy, setBuildBusy] = useState(false);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  /* ── agent→agent interactions ──────────────────────────────────────────────── */
  /** Direct-chat target (selected from a profile or bump interaction). */
  const [messaging, setMessaging] = useState<string | null>(null);
  const messagingRef = useRef<string | null>(null);
  messagingRef.current = messaging;
  const [carSeat, setCarSeat] = useState<{ carId: CommuneCarId; seat: number } | null>(null);
  const carSeatRef = useRef(carSeat);
  carSeatRef.current = carSeat;
  const [hangout, setHangout] = useState<{ id: CommuneHangoutId; seat: number } | null>(null);
  const hangoutRef = useRef(hangout);
  hangoutRef.current = hangout;
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
  const canvasPointerRef = useRef<{ id: number; x: number; y: number; lastX: number; lastY: number; moved: boolean } | null>(null);
  /** Pixel ducks drifting on the pond after a feed. */
  const ducksRef = useRef<PondDuck[]>([]);
  const [chatFocused, setChatFocused] = useState(false);

  useEffect(() => {
    const syncPointerLock = () => setPointerLocked(document.pointerLockElement === canvasRef.current);
    document.addEventListener('pointerlockchange', syncPointerLock);
    return () => {
      document.removeEventListener('pointerlockchange', syncPointerLock);
      if (document.pointerLockElement === canvasRef.current) document.exitPointerLock();
      if (laserHitTimerRef.current !== null) window.clearTimeout(laserHitTimerRef.current);
    };
  }, []);

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

  const playerRef = useRef<Agent>({
    x: PLAZA.x,
    y: PLAZA.y + 240,
    headingX: 0,
    headingY: 1,
    name: username,
    hue: hueOf(username),
    says: null,
  });
  playerRef.current.name = username;
  playerRef.current.hue = hueOf(username);
  playerRef.current.carId = carSeat?.carId ?? null;
  playerRef.current.carSeat = carSeat?.seat ?? null;
  playerRef.current.hangoutId = hangout?.id ?? null;
  playerRef.current.hangoutSeat = hangout?.seat ?? null;
  const npcsRef = useRef<Agent[]>([
    ...NPCS.map((n) => ({ x: n.home.x, y: n.home.y, name: n.name, hue: n.hue, says: null, target: { ...n.home }, pauseUntil: 0, nextLineAt: Date.now() + 4000 + Math.random() * 6000, bobPhase: Math.random() * 10 })),
    // Challenge NPCs stand in place (no target/line timer).
    ...challengeNpcs.map((c) => ({ x: c.x, y: c.y, name: c.name, hue: c.hue, says: null, bobPhase: Math.random() * 10 })),
  ]);
  useEffect(() => {
    npcsRef.current = [
      ...NPCS.map((npc) => ({
        x: npc.home.x,
        y: npc.home.y,
        name: npc.name,
        hue: npc.hue,
        says: null,
        target: { ...npc.home },
        pauseUntil: 0,
        nextLineAt: Date.now() + 4_000 + Math.random() * 6_000,
        bobPhase: Math.random() * 10,
      })),
      ...challengeNpcs.map((npc) => ({
        x: npc.x,
        y: npc.y,
        name: npc.name,
        hue: npc.hue,
        says: null,
        bobPhase: Math.random() * 10,
      })),
    ];
  }, [challengeNpcs]);
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
  const lastPresenceReceivedAtRef = useRef(new Map<string, number>());
  const [presenceNow, setPresenceNow] = useState(Date.now());
  /** Interpolated remote walkers, keyed by username. */
  const remoteRef = useRef(
    new Map<string, {
      rx: number;
      ry: number;
      samples: Array<{ x: number; y: number; at: number }>;
      headingX: number;
      headingY: number;
      agent: CommuneAgent;
      moving: boolean;
      bobPhase: number;
      says: Speech | null;
    }>()
  );
  /** My current status, updated by the draw loop and sent over the room socket. */
  const statusRef = useRef('hanging out');
  const lastInputAtRef = useRef(Date.now());
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

  const getViewRadius = useCallback(() => {
    const view = wrapRef.current;
    const width = view?.clientWidth ?? 1_024;
    const height = view?.clientHeight ?? 768;
    const zoom = Math.max(0.25, mapZoomRef.current);
    return Math.max(600, Math.min(4_000, Math.round(Math.hypot(width, height) / (2 * zoom) + 300)));
  }, []);

  useEffect(() => {
    const markActive = () => {
      lastInputAtRef.current = Date.now();
    };
    window.addEventListener('pointerdown', markActive, { passive: true });
    window.addEventListener('keydown', markActive);
    window.addEventListener('input', markActive, true);
    return () => {
      window.removeEventListener('pointerdown', markActive);
      window.removeEventListener('keydown', markActive);
      window.removeEventListener('input', markActive, true);
    };
  }, []);

  useEffect(() => {
    if (!selected) return undefined;
    const timer = window.setInterval(() => setPresenceNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [selected]);

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
    const applyDockBounds = (top: number, height: number) => {
      const root = wrapRef.current;
      if (!root) return;
      const dockBottom = top + height;
      const clearance = dockBottom > window.innerHeight - 72
        ? Math.max(0, window.innerHeight - top)
        : 0;
      root.style.setProperty('--commune-dock-clearance', `${clearance}px`);
    };
    const updateFromDom = () => {
      const dock = document.querySelector<HTMLElement>('.quiet-orbit-dock');
      if (!dock || getComputedStyle(dock).display === 'none') {
        applyDockBounds(window.innerHeight, 0);
        return;
      }
      const rect = dock.getBoundingClientRect();
      applyDockBounds(rect.top, rect.height);
    };
    const onDockBounds = (event: Event) => {
      const bounds = (event as CustomEvent<{ top?: number; height?: number }>).detail;
      if (typeof bounds?.top === 'number' && typeof bounds.height === 'number') {
        applyDockBounds(bounds.top, bounds.height);
      } else {
        updateFromDom();
      }
    };
    updateFromDom();
    window.addEventListener('resize', updateFromDom);
    window.addEventListener('econote:workspace-dock-bounds', onDockBounds);
    return () => {
      window.removeEventListener('resize', updateFromDom);
      window.removeEventListener('econote:workspace-dock-bounds', onDockBounds);
    };
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
    if (!text || bannerSending || (bannerKind === 'sketch' && !bannerStrokes.length)) return;
    setBannerSending(true);
    try {
      const shared = await createCommuneBanner({
        text,
        kind: bannerKind,
        priority: bannerKind === 'priority' ? bannerPriority : 'normal',
        strokes: bannerKind === 'sketch' ? bannerStrokes : [],
      });
      setBanners(parseBanners(shared));
      setBannerDraft('');
      setBannerKind('pin');
      setBannerPriority('normal');
      setBannerStrokes([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to hang the banner.';
      setInbox((items) => [...items.slice(-4), { from: 'COMMUNE', message }]);
    } finally {
      setBannerSending(false);
    }
  }, [bannerDraft, bannerKind, bannerPriority, bannerSending, bannerStrokes]);

  const saveBannerEdit = async (id: string) => {
    const text = bannerEditDraft.trim();
    if (!text || bannerUpdating || (bannerEditKind === 'sketch' && !bannerEditStrokes.length)) return;
    setBannerUpdating(true);
    try {
      const shared = await editCommuneBanner(id, {
        text,
        kind: bannerEditKind,
        priority: bannerEditKind === 'priority' ? bannerEditPriority : 'normal',
        strokes: bannerEditKind === 'sketch' ? bannerEditStrokes : [],
      });
      setBanners(parseBanners(shared));
      setEditingBannerId(null);
      setBannerEditDraft('');
      setBannerEditKind('pin');
      setBannerEditPriority('normal');
      setBannerEditStrokes([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update the town notice.';
      setInbox((items) => [...items.slice(-4), { from: 'COMMUNE', message }]);
    } finally {
      setBannerUpdating(false);
    }
  };

  const removeBanner = async (id: string) => {
    if (bannerDeleting) return;
    setBannerDeleting(true);
    try {
      const shared = await deleteCommuneBanner(id);
      setBanners(parseBanners(shared));
      setBannerDeleteId(null);
      if (editingBannerId === id) {
        setEditingBannerId(null);
        setBannerEditDraft('');
        setBannerEditKind('pin');
        setBannerEditPriority('normal');
        setBannerEditStrokes([]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove the town notice.';
      setInbox((items) => [...items.slice(-4), { from: 'COMMUNE', message }]);
    } finally {
      setBannerDeleting(false);
    }
  };

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
    let heartbeatTimer = 0;
    let heartbeatWatchdogTimer = 0;
    let lastHeartbeatAckAt = 0;
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
      lastPresenceReceivedAtRef.current.clear();
      for (const agent of agents) {
        const at = performance.now();
        remoteRef.current.set(agent.username, {
          rx: agent.x,
          ry: agent.y,
          samples: [{ x: agent.x, y: agent.y, at }],
          headingX: 0,
          headingY: 1,
          agent,
          moving: false,
          bobPhase: Math.random() * 10,
          says: null,
        });
        lastPresenceReceivedAtRef.current.set(agent.username, Date.now() - Math.max(0, agent.seenAgo));
      }
      setOthers(agents);
      const selectedAgent = selectedRef.current;
      if (selectedAgent) {
        const fresh = agents.find((agent) => agent.username === selectedAgent.username) ?? null;
        setSelected(fresh);
        if (!fresh) setPanel(null);
      }
    };

    const applyBuildables = (value: unknown) => {
      const parsed = parseCommuneBuiltObjects(value);
      if (!parsed) return;
      reconcileBuiltObjects(parsed);
      setBuiltObjects(parsed);
    };
    const applyCarPositions = (value: unknown) => {
      if (!Array.isArray(value)) return;
      for (const raw of value) {
        if (!raw || typeof raw !== 'object') continue;
        const incoming = raw as Record<string, unknown>;
        if (typeof incoming.id !== 'string') continue;
        const car = PARKED_CARS.find((item) => item.id === incoming.id);
        if (!car || !Number.isFinite(Number(incoming.x)) || !Number.isFinite(Number(incoming.y))) continue;
        resetCarSnapshot(car, Number(incoming.x), Number(incoming.y), Number(incoming.heading) || 0);
      }
    };

    const upsertAgent = (agent: CommuneAgent, compactMove = false) => {
      if (agent.username === username) return;
      lastPresenceReceivedAtRef.current.set(agent.username, Date.now() - Math.max(0, agent.seenAgo));
      const remote = remoteRef.current.get(agent.username);
      const previousAgent = remote?.agent;
      if (remote) {
        const at = performance.now();
        const lastSample = remote.samples[remote.samples.length - 1];
        if (lastSample && lastSample.x === agent.x && lastSample.y === agent.y) {
          lastSample.at = at;
        } else {
          remote.samples.push({ x: agent.x, y: agent.y, at });
          if (remote.samples.length > 8) remote.samples.shift();
        }
        remote.agent = agent;
      } else {
        const at = performance.now();
        remoteRef.current.set(agent.username, {
          rx: agent.x,
          ry: agent.y,
          samples: [{ x: agent.x, y: agent.y, at }],
          headingX: 0,
          headingY: 1,
          agent,
          moving: false,
          bobPhase: Math.random() * 10,
          says: null,
        });
      }
      if (!compactMove) {
        setOthers((current) => [...current.filter((item) => item.username !== agent.username), agent]);
      }
      if (
        selectedRef.current?.username === agent.username &&
        (!compactMove ||
          previousAgent?.status !== agent.status ||
          previousAgent?.isAfk !== agent.isAfk ||
          previousAgent?.carId !== agent.carId ||
          previousAgent?.carSeat !== agent.carSeat ||
          previousAgent?.hangoutId !== agent.hangoutId ||
          previousAgent?.hangoutSeat !== agent.hangoutSeat)
      ) setSelected(agent);
    };

    const removeAgent = (agentName: string) => {
      remoteRef.current.delete(agentName);
      lastPresenceReceivedAtRef.current.delete(agentName);
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

    const applyMowerSnapshot = (value: unknown, immediate = false) => {
      const next = parseTRexState(value);
      if (!next) return;
      mowerTargetRef.current = next;
      const isAuthority = mowerClientIdRef.current !== null
        && mowerClientIdRef.current === mowerAuthorityClientIdRef.current;
      const current = tRexRef.current;
      tRexRef.current = immediate || isAuthority
        ? next
        : { ...next, x: current.x, y: current.y, heading: current.heading };
    };

    const applyMowerTracks = (value: unknown) => {
      if (!Array.isArray(value)) return;
      for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const track = item as Record<string, unknown>;
        if (![track.fromX, track.fromY, track.x, track.y, track.at].every((part) => Number.isFinite(Number(part)))) continue;
        const at = Number(track.at);
        if (mowerTracksRef.current.some((existing) => existing.at === at && existing.x === Number(track.x))) continue;
        mowerTracksRef.current.push({
          fromX: Number(track.fromX),
          fromY: Number(track.fromY),
          x: Number(track.x),
          y: Number(track.y),
          at,
        });
      }
      if (mowerTracksRef.current.length > 420) {
        mowerTracksRef.current.splice(0, mowerTracksRef.current.length - 420);
      }
    };

    const scheduleReconnect = () => {
      if (stopped || reconnectTimer) return;
      setConnectionState('reconnecting');
      const cap = Math.min(30_000, 1_000 * 2 ** Math.min(reconnectAttempt, 5));
      const delay = Math.round(cap * (0.5 + Math.random() * 0.5));
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = 0;
        void connect();
      }, delay);
    };

    const sendPresenceHeartbeat = () => {
      const now = Date.now();
      return sendRoomEvent({
        type: 'heartbeat',
        isAfk: document.visibilityState === 'hidden' || now - lastInputAtRef.current >= AFK_AFTER_MS,
        viewRadius: getViewRadius(),
      });
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
          getViewRadius(),
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
          lastHeartbeatAckAt = Date.now();
          setConnectionState('connected');
          sendRoomEvent({ type: 'loadout', loadout: initialLoadout });
          sendPresenceHeartbeat();
        };
        socket.onmessage = (messageEvent) => {
          if (stopped || activeSocket !== socket || typeof messageEvent.data !== 'string') return;
          let event: CommuneRoomIncoming;
          try {
            event = JSON.parse(messageEvent.data) as CommuneRoomIncoming;
          } catch {
            return;
          }
          if (event.type === 'heartbeat_ack') {
            lastHeartbeatAckAt = Date.now();
            return;
          } else if (event.type === 'position_correction') {
            const x = Number(event.x);
            const y = Number(event.y);
            if (Number.isFinite(x) && Number.isFinite(y)) {
              playerRef.current.x = x;
              playerRef.current.y = y;
              clickTargetRef.current = null;
              playerRef.current.moving = false;
            }
          } else if (event.type === 'welcome') {
            mowerClientIdRef.current = typeof event.mowerClientId === 'string' ? event.mowerClientId : null;
            mowerAuthorityClientIdRef.current = typeof event.mowerAuthorityClientId === 'string'
              ? event.mowerAuthorityClientId
              : null;
            lastMowerSnapshotSentAtRef.current = 0;
            if (event.mowerState) applyMowerSnapshot(event.mowerState, true);
            if (Array.isArray(event.mowerTracks)) applyMowerTracks(event.mowerTracks);
            applySnapshot(Array.isArray(event.others) ? event.others as CommuneAgent[] : []);
            applyBuildables(event.buildables);
            applyCarPositions(event.cars);
            if (event.soccerBall && typeof event.soccerBall === 'object') {
              const value = event.soccerBall as Record<string, unknown>;
              if ([value.x, value.y, value.fromX, value.fromY].every((part) => Number.isFinite(Number(part)))) {
                const ball: CommuneSoccerBall = {
                  x: Number(value.x),
                  y: Number(value.y),
                  fromX: Number(value.fromX),
                  fromY: Number(value.fromY),
                  kickedAt: Number(value.kickedAt) || 0,
                  by: typeof value.by === 'string' ? value.by : null,
                };
                soccerBallRef.current = ball;
                setSoccerBall(ball);
              }
            }
          } else if (event.type === 'mower_authority') {
            mowerAuthorityClientIdRef.current = typeof event.clientId === 'string' ? event.clientId : null;
            if (event.mowerState) applyMowerSnapshot(event.mowerState, true);
          } else if (
            event.type === 'mower_state'
            && event.clientId === mowerAuthorityClientIdRef.current
          ) {
            applyMowerSnapshot(event.mowerState);
            applyMowerTracks(event.tracks);
          } else if (event.type === 'soccer_ball' && event.ball && typeof event.ball === 'object') {
            const value = event.ball as Record<string, unknown>;
            if ([value.x, value.y, value.fromX, value.fromY].every((part) => Number.isFinite(Number(part)))) {
              const ball: CommuneSoccerBall = {
                x: Number(value.x),
                y: Number(value.y),
                fromX: Number(value.fromX),
                fromY: Number(value.fromY),
                kickedAt: Number(value.kickedAt) || 0,
                by: typeof value.by === 'string' ? value.by : null,
              };
              soccerBallRef.current = ball;
              setSoccerBall(ball);
            }
          } else if (event.type === 'laser_shot') {
            const shot = parseLaserShot(event.shot);
            if (shot) upsertLaserShot(shot);
          } else if (
            event.type === 'laser_reward'
            && event.username === username
            && Number.isFinite(Number(event.spice))
          ) {
            setSpice(Number(event.spice));
            playerRef.current.says = {
              text: 'Tagged by a laser! +1 spice.',
              until: Date.now() + 3000,
            };
          } else if (event.type === 'drops' && Array.isArray(event.drops)) {
            dropsRef.current = (event.drops as CommuneDrop[]).filter((drop) => !pickingRef.current.has(drop.id));
          } else if (event.type === 'buildables') {
            applyBuildables(event.buildables);
            applyCarPositions(event.cars);
          } else if (event.type === 'car_update' && typeof event.carId === 'string') {
            const car = PARKED_CARS.find((item) => item.id === event.carId);
            if (car && Number.isFinite(Number(event.x)) && Number.isFinite(Number(event.y))) {
              recordCarSnapshot(car, Number(event.x), Number(event.y), Number(event.heading) || 0);
            }
          } else if (event.type === 'agent_join' || event.type === 'agent_update') {
            if (event.agent && typeof event.agent === 'object') {
              upsertAgent(
                event.agent as CommuneAgent,
                event.type === 'agent_update' && event.positionOnly === true,
              );
            }
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
          } else if (event.type === 'hangout_state') {
            const placeId = typeof event.hangoutId === 'string'
              && COMMUNE_HANGOUTS.some((item) => item.id === event.hangoutId)
              ? event.hangoutId as CommuneHangoutId
              : null;
            const seat = Number(event.seat);
            const nextHangout = placeId && Number.isInteger(seat) && seat >= 0
              ? { id: placeId, seat }
              : null;
            hangoutRef.current = nextHangout;
            setHangout(nextHangout);
            playerRef.current.hangoutId = nextHangout?.id ?? null;
            playerRef.current.hangoutSeat = nextHangout?.seat ?? null;
            playerRef.current.x = Number.isFinite(Number(event.x)) ? Number(event.x) : playerRef.current.x;
            playerRef.current.y = Number.isFinite(Number(event.y)) ? Number(event.y) : playerRef.current.y;
            clickTargetRef.current = null;
            keysRef.current.clear();
            movementInputRef.current = { x: 0, y: 0 };
            setInteriorChatMessages([]);
            if (nextHangout) {
              if (mapZoomRef.current >= 5) {
                if (document.pointerLockElement === canvasRef.current) document.exitPointerLock();
                mapZoomRef.current = 4;
                setMapZoom(4);
              }
              setCarSeat(null);
              carSeatRef.current = null;
              playerRef.current.carId = null;
              playerRef.current.carSeat = null;
              setMessaging(null);
              focusedNpcRef.current = null;
              setFocusedNpc(null);
              if (handsRef.current) {
                sendRoomEvent({ type: 'interaction', target: handsRef.current.partner, kind: 'hands_release' });
                handsRef.current = null;
                setHands(null);
              }
            }
          } else if (
            event.type === 'car_state'
            && (event.carId === null || (typeof event.carId === 'string' && PARKED_CARS.some((car) => car.id === event.carId)))
          ) {
            const nextCar = event.carId
              ? { carId: event.carId as CommuneCarId, seat: Number(event.seat) }
              : null;
            setCarSeat(nextCar && Number.isInteger(nextCar.seat) ? nextCar : null);
            hangoutRef.current = null;
            setHangout(null);
            playerRef.current.hangoutId = null;
            playerRef.current.hangoutSeat = null;
            playerRef.current.carId = nextCar?.carId ?? null;
            playerRef.current.carSeat = nextCar?.seat ?? null;
            playerRef.current.x = Number(event.x) || playerRef.current.x;
            playerRef.current.y = Number(event.y) || playerRef.current.y;
            if (nextCar) {
              const car = PARKED_CARS.find((item) => item.id === nextCar.carId);
              if (car && Number.isFinite(Number(event.x)) && Number.isFinite(Number(event.y))) {
                resetCarSnapshot(car, Number(event.x), Number(event.y), Number(event.heading) || 0);
              }
            }
            clickTargetRef.current = null;
            keysRef.current.clear();
            if (nextCar) {
              setInteriorChatMessages([]);
              setMessaging(null);
            }
          } else if (event.type === 'car_chat' && typeof event.message === 'string' && typeof event.from === 'string') {
            if (event.carId === carSeatRef.current?.carId) {
              setInteriorChatMessages((items) => [
                ...items.slice(-19),
                { from: event.from as string, message: event.message as string, at: Number(event.sentAt) || Date.now() },
              ]);
            }
          } else if (
            event.type === 'hangout_chat'
            && event.hangoutId === hangoutRef.current?.id
            && typeof event.message === 'string'
            && typeof event.from === 'string'
          ) {
            setInteriorChatMessages((items) => [
              ...items.slice(-19),
              { from: event.from as string, message: event.message as string, at: Number(event.sentAt) || Date.now() },
            ]);
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
          mowerClientIdRef.current = null;
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
          if (hangoutRef.current) {
            const place = COMMUNE_HANGOUTS.find((item) => item.id === hangoutRef.current?.id);
            if (place) {
              playerRef.current.x = place.doorX;
              playerRef.current.y = place.doorY - COMMUNE_HANGOUT_EXIT_OFFSET;
            }
            hangoutRef.current = null;
            setHangout(null);
            playerRef.current.hangoutId = null;
            playerRef.current.hangoutSeat = null;
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
    heartbeatTimer = window.setInterval(sendPresenceHeartbeat, PRESENCE_HEARTBEAT_MS);
    heartbeatWatchdogTimer = window.setInterval(() => {
      if (
        !document.hidden &&
        activeSocket?.readyState === WebSocket.OPEN &&
        Date.now() - lastHeartbeatAckAt > PRESENCE_ACK_TIMEOUT_MS
      ) {
        activeSocket.close(4000, 'Presence heartbeat timed out');
      }
    }, 5_000);
    const onPresenceVisibilityChange = () => {
      if (!document.hidden) lastHeartbeatAckAt = Date.now();
      sendPresenceHeartbeat();
    };
    document.addEventListener('visibilitychange', onPresenceVisibilityChange);
    return () => {
      stopped = true;
      window.clearInterval(heartbeatTimer);
      window.clearInterval(heartbeatWatchdogTimer);
      window.clearTimeout(dropRefreshTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      document.removeEventListener('visibilitychange', onPresenceVisibilityChange);
      if (activeSocket?.readyState === WebSocket.OPEN) {
        try {
          activeSocket.send(JSON.stringify({ type: 'leave' }));
        } catch {
          /* The close event and presence timeout remain the fallback. */
        }
      }
      activeSocket?.close(1000, 'Leaving the Commune');
      if (socketRef.current === activeSocket) socketRef.current = null;
    };
  }, [getViewRadius, sendRoomEvent, user, username]);

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

  const swingGolfBall = useCallback(async () => {
    const session = golfRoundRef.current;
    if (session.busy) return;
    session.busy = true;
    try {
      if (!session.roundId || session.finished) {
        const round = await startCommuneMiniGame('golf');
        session.roundId = round.roundId;
        session.localX = 28;
        session.localY = 60;
        session.shots = [];
        session.finished = false;
        golfBallMotionRef.current = {
          x: GOLF_TEE.x,
          y: GOLF_TEE.y,
          fromX: GOLF_TEE.x,
          fromY: GOLF_TEE.y,
          startedAt: 0,
          duration: 0,
          arc: 0,
        };
        playerRef.current.says = {
          text: 'Tee is set! Walk up to the ball and give it a mighty thwack.',
          until: Date.now() + 4200,
        };
        return;
      }

      const player = playerRef.current;
      const aim = Math.max(-12, Math.min(12, Math.round((player.y - golfWorldPosition(session.localX, session.localY).y) / 7)));
      const runUp = player.moving ? 18 : 0;
      const power = Math.max(20, Math.min(100, Math.round(62 + runUp + Math.random() * 12)));
      const angle = aim * Math.PI / 180;
      const travel = power * 1.8;
      session.localX = Math.max(16, Math.min(258, session.localX + Math.cos(angle) * travel));
      session.localY = Math.max(18, Math.min(102, session.localY - Math.sin(angle) * travel * 0.55));
      session.shots.push({ aim, power });
      const next = golfWorldPosition(session.localX, session.localY);
      const motionFrom = golfBallMotionRef.current;
      const duration = Math.round(820 - power * 2.2);
      golfBallMotionRef.current = {
        x: next.x,
        y: next.y,
        fromX: motionFrom.x,
        fromY: motionFrom.y,
        startedAt: Date.now(),
        duration,
        arc: 16 + power * 0.16,
      };
      player.says = { text: `FORE! ${['a suspiciously confident putt', 'the tiny golf ball', 'a very brave shot'][Math.floor(Math.random() * 3)]} is away!`, until: Date.now() + duration };
      await new Promise<void>((resolve) => window.setTimeout(resolve, duration));
      const holed = Math.hypot(250 - session.localX, 60 - session.localY) <= 12;
      if (holed || session.shots.length >= 4) {
        session.finished = true;
        const result = await finishCommuneMiniGame('golf', session.roundId!, { shots: session.shots });
        setSpice(result.spice);
        player.says = {
          text: result.awarded ? 'HOLE IN ONE! The golf ball has achieved enlightenment. +10 spice!' : 'The ball has joined the hedge. Four strokes; no hole this time.',
          until: Date.now() + 5200,
        };
        session.roundId = null;
      } else {
        player.says = {
          text: holed ? 'THE CUP! The ball is home!' : `Putt ${session.shots.length}/4. The ball is ${Math.round(Math.hypot(250 - session.localX, 60 - session.localY))} yards from glory.`,
          until: Date.now() + 3600,
        };
      }
    } catch (error) {
      session.roundId = null;
      playerRef.current.says = {
        text: error instanceof Error ? error.message : 'The golf ball declined to cooperate.',
        until: Date.now() + 3500,
      };
    } finally {
      session.busy = false;
    }
  }, [setSpice]);

  const rollBowlingBall = useCallback(async () => {
    if (bowlingBusyRef.current) return;
    bowlingBusyRef.current = true;
    const player = playerRef.current;
    try {
      const round = await startCommuneMiniGame('bowling');
      const aim = Math.max(-30, Math.min(30, Math.round((player.x - MINI_GAME_ZONES.bowling.x) / 2)));
      const power = Math.max(20, Math.min(100, Math.round(58 + (player.moving ? 22 : 0) + Math.random() * 18)));
      const aimX = 132 + aim * 0.7;
      const scatter = 5 + power * 0.1;
      const knocked = BOWLING_PINS.flatMap(([pinX, pinY], index) => (
        Math.abs(pinX - aimX) <= scatter + (pinY < 40 ? 2 : 0) ? [index] : []
      ));
      const ballX = BOWLING_APPROACH.x + (aimX - 132) * 1.5;
      const ballFrom = { x: ballX, y: BOWLING_APPROACH.y };
      const ballTo = { x: ballX, y: MINI_GAME_ZONES.bowling.y - 170 };
      const duration = Math.round(1480 - power * 6);
      bowlingPinsDownRef.current = [];
      bowlingPinsKnockedAtRef.current = 0;
      bowlingBallMotionRef.current = {
        x: ballTo.x,
        y: ballTo.y,
        fromX: ballFrom.x,
        fromY: ballFrom.y,
        startedAt: Date.now(),
        duration,
        arc: 6 + power * 0.08,
      };
      player.says = { text: 'ROLLING! The lane has requested a safety helmet.', until: Date.now() + duration };
      await new Promise<void>((resolve) => window.setTimeout(resolve, duration));
      bowlingPinsDownRef.current = knocked;
      bowlingPinsKnockedAtRef.current = performance.now();
      const result = await finishCommuneMiniGame('bowling', round.roundId, { aim, power });
      setSpice(result.spice);
      player.says = {
        text: `${['PIN PANIC!', 'A most respectable kerplunk!', 'The pins have filed a complaint!'][Math.floor(Math.random() * 3)]} ${result.pinsDown ?? 0} down · +${result.awarded} spice.`,
        until: Date.now() + 5200,
      };
      await new Promise<void>((resolve) => window.setTimeout(resolve, 3200));
      bowlingPinsDownRef.current = [];
      bowlingPinsKnockedAtRef.current = 0;
      bowlingBallMotionRef.current = {
        x: BOWLING_APPROACH.x,
        y: BOWLING_APPROACH.y,
        fromX: BOWLING_APPROACH.x,
        fromY: BOWLING_APPROACH.y,
        startedAt: 0,
        duration: 0,
        arc: 0,
      };
      await new Promise<void>((resolve) => window.setTimeout(resolve, 800));
    } catch (error) {
      bowlingPinsDownRef.current = [];
      bowlingPinsKnockedAtRef.current = 0;
      player.says = {
        text: error instanceof Error ? error.message : 'The bowling ball rolled away from the paperwork.',
        until: Date.now() + 3500,
      };
    } finally {
      bowlingBusyRef.current = false;
    }
  }, [setSpice]);

  const executeInteraction = useCallback((action: CommuneAction, direct = false) => {
    if (panelRef.current) return;
    if (!direct) {
      const player = playerRef.current;
      const inRange = (() => {
        switch (action.type) {
          case 'stand':
            return !!sittingRef.current;
          case 'challenge': {
            const npc = challengeNpcsRef.current.find((item) => item.personaId === action.personaId);
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
              && !hangoutRef.current
              && !!car
              && Math.hypot(player.x - car.x, player.y - car.y) < 118
              && [...remoteRef.current.values()].filter((remote) => remote.agent.carId === action.carId).length < 2;
          }
          case 'exit-car':
            return !!carSeatRef.current;
          case 'enter-hangout': {
            const place = COMMUNE_HANGOUTS.find((item) => item.id === action.hangoutId);
            const occupants = new Set(
              [...remoteRef.current.values()]
                .filter((remote) => remote.agent.hangoutId === action.hangoutId)
                .map((remote) => remote.agent.username),
            );
            return !carSeatRef.current
              && !hangoutRef.current
              && !!place
              && Math.hypot(player.x - place.doorX, player.y - place.doorY) <= COMMUNE_HANGOUT_ENTER_RANGE
              && occupants.size < place.capacity;
          }
          case 'exit-hangout':
            return !!hangoutRef.current;
          case 'demolish-build': {
            const item = builtObjectsRef.current.find((entry) => entry.id === action.buildingId);
            if (!item || item.owner !== username) return false;
            const car = item.kind === 'sports-car'
              ? PARKED_CARS.find((entry) => entry.buildId === item.id)
              : null;
            return Math.hypot(player.x - (car?.x ?? item.x), player.y - (car?.y ?? item.y))
              <= COMMUNE_BUILD_INTERACT_RANGE;
          }
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
          case 'mini-game': {
            const zone = MINI_GAME_ZONES[action.game];
            if (action.game === 'golf') {
              const session = golfRoundRef.current;
              if (session.busy) return false;
              if (session.roundId) {
                const ball = golfWorldPosition(session.localX, session.localY);
                return Math.hypot(player.x - ball.x, player.y - ball.y) <= 104;
              }
              return Math.hypot(player.x - zone.x, player.y - zone.y) <= zone.range;
            }
            return !bowlingBusyRef.current
              && isInBowlingArena(player.x, player.y);
          }
          case 'soccer-kick': {
            const field = MINI_GAME_ZONES.soccer;
            return player.x >= field.left && player.x <= field.right
              && player.y >= field.top && player.y <= field.bottom
              && Math.hypot(player.x - soccerBallRef.current.x, player.y - soccerBallRef.current.y) <= 104;
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
      case 'enter-hangout':
        if (!sendRoomEvent({ type: 'hangout_enter', hangoutId: action.hangoutId })) {
          setInbox((items) => [...items.slice(-4), { from: 'COMMUNE', message: 'The building connection is unavailable. Try again.' }]);
        }
        return;
      case 'exit-hangout':
        sendRoomEvent({ type: 'hangout_exit' });
        return;
      case 'demolish-build':
        if (buildBusy) return;
        setBuildBusy(true);
        void demolishCommuneBuildable(action.buildingId)
          .then((result) => {
            setSpice(result.spice);
            const next = builtObjectsRef.current.filter((item) => item.id !== action.buildingId);
            reconcileBuiltObjects(next);
            builtObjectsRef.current = next;
            setBuiltObjects(next);
            setInbox((items) => [...items.slice(-4), {
              from: 'COMMUNE',
              message: `Structure taken apart. ${result.refund} spice returned.`,
            }]);
          })
          .catch((error: unknown) => {
            setInbox((items) => [...items.slice(-4), {
              from: 'COMMUNE',
              message: error instanceof Error ? error.message : 'Could not take apart that structure.',
            }]);
          })
          .finally(() => setBuildBusy(false));
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
      case 'mini-game':
        if (action.game === 'golf') void swingGolfBall();
        else void rollBowlingBall();
        return;
      case 'soccer-kick': {
        const ball = soccerBallRef.current;
        const field = MINI_GAME_ZONES.soccer;
        const receiver = [...remoteRef.current.values()]
          .filter((remote) => (
            !remote.agent.carId
            && !remote.agent.hangoutId
            && remote.rx >= field.left && remote.rx <= field.right
            && remote.ry >= field.top && remote.ry <= field.bottom
          ))
          .sort((a, b) => (
            Math.hypot(a.rx - ball.x, a.ry - ball.y) - Math.hypot(b.rx - ball.x, b.ry - ball.y)
          ))[0];
        const joystick = movementInputRef.current;
        let dx = receiver ? receiver.rx - ball.x : joystick.x;
        let dy = receiver ? receiver.ry - ball.y : joystick.y;
        if (Math.hypot(dx, dy) < 0.1) {
          dx = ball.x - playerRef.current.x;
          dy = ball.y - playerRef.current.y;
        }
        void kickCommuneSoccerBall(crypto.randomUUID(), dx, dy)
          .then((result) => {
            soccerBallRef.current = result.ball;
            setSoccerBall(result.ball);
            setSpice(result.spice);
            playerRef.current.says = {
              text: result.awarded ? `Nice pass! +${result.awarded} spice ⚽` : 'The ball is back in play!',
              until: Date.now() + 2600,
            };
          })
          .catch((error: unknown) => {
            playerRef.current.says = {
              text: error instanceof Error ? error.message : 'The kick did not connect.',
              until: Date.now() + 2600,
            };
          });
        return;
      }
      case 'prop':
        setPanel(action.panel);
        return;
    }
  }, [buildBusy, onCatThought, rollBowlingBall, sendRoomEvent, setSpice, swingGolfBall, username]);

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
      if (buildPlacementKindRef.current) {
        if (e.code === 'Escape') {
          e.preventDefault();
          setBuildPlacementKind(null);
          buildPlacementKindRef.current = null;
          buildPreviewRef.current = null;
          buildTouchPreviewRef.current = null;
        } else if (e.code === 'KeyR') {
          e.preventDefault();
          buildPlacementRotationRef.current = (buildPlacementRotationRef.current + Math.PI / 2) % (Math.PI * 2);
          const preview = buildPreviewRef.current;
          const kind = buildPlacementKindRef.current;
          if (preview && kind) {
            preview.rotation = buildPlacementRotationRef.current;
            preview.valid = canPlaceBuildLocally(
              kind,
              preview.x,
              preview.y,
              preview.rotation,
            );
          }
        }
        return;
      }
      if (e.code === 'Escape' && buildMenuOpen) {
        setBuildMenuOpen(false);
        return;
      }
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
        if (playerRef.current.hangoutId) return;
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
  }, [buildMenuOpen, executeInteraction]);

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
    const labelsCanvas = labelsCanvasRef.current;
    if (!labelsCanvas) return;
    const threeRenderer = CommuneThreeRenderer.create(canvas, labelsCanvas);
    communeRendererRef.current = threeRenderer;
    const ctx = threeRenderer ? null : canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!threeRenderer && !ctx) return;

    let vw = 0;
    let vh = 0;
    let dpr = 1;
    const resize = () => {
      vw = wrap.clientWidth;
      vh = wrap.clientHeight;
      if (threeRenderer) {
        threeRenderer.resize(vw, vh);
        return;
      }
      const cssPixels = Math.max(1, vw * vh);
      dpr = Math.max(
        0.85,
        Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(4_000_000 / cssPixels))
      );
      const pixelWidth = Math.round(vw * dpr);
      const pixelHeight = Math.round(vh * dpr);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      if (canvas.style.width !== `${vw}px`) canvas.style.width = `${vw}px`;
      if (canvas.style.height !== `${vh}px`) canvas.style.height = `${vh}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    let renderRaf = 0;
    let last = performance.now();
    let lastFrame = 0;
    let lastCarMoveSentAt = 0;
    let cameraReady = false;
    let lightingMinute = -1;
    let nightOpacity = 0;
    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduceMotion = reduceMotionQuery.matches;
    const petFollowers = new Map<string, PetFollower>();
    let latestFrame: CommuneThreeFrame | null = null;

    const updateCarRenderPositions = (now: number) => {
      const renderAt = now - CAR_INTERPOLATION_DELAY_MS;
      for (const car of PARKED_CARS) interpolateCarSnapshots(car, renderAt);
      const drivenCar = playerRef.current.carId
        ? PARKED_CARS.find((car) => car.id === playerRef.current.carId)
        : null;
      if (!drivenCar) return;
      playerRef.current.x = drivenCar.x;
      playerRef.current.y = drivenCar.y;
      if (latestFrame?.player.carId === drivenCar.id) {
        latestFrame.player.x = drivenCar.x;
        latestFrame.player.y = drivenCar.y;
      }
    };

    const renderStep = (now: number) => {
      renderRaf = 0;
      if (document.hidden) return;
      if (threeRenderer && latestFrame) {
        updateCarRenderPositions(now);
        latestFrame.time = now / 1000;
        threeRenderer.render(latestFrame);
      }
      renderRaf = requestAnimationFrame(renderStep);
    };

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
      updateCarRenderPositions(now);
      const tSec = now / 1000;
      laserShotsRef.current = laserShotsRef.current.filter(
        (shot) => tSec - shot.startedAt <= shot.durationMs / 1000 + 0.12
      );
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
        if (directionLength > 0.12) {
          player.headingX = dx / directionLength;
          player.headingY = dy / directionLength;
        }
        if (directionLength > 0.12 && !panelRef.current && !chatFocusedRef.current && wallNow - lastCarMoveSentAt >= CAR_MOVE_INTERVAL_MS) {
          sendRoomEvent({ type: 'car_move', dx, dy });
          lastCarMoveSentAt = wallNow;
        }
      } else if (player.hangoutId) {
        player.moving = false;
        keysRef.current.clear();
        movementInputRef.current = { x: 0, y: 0 };
        clickTargetRef.current = null;
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
          if (leader.moving) {
            player.headingX = leader.headingX;
            player.headingY = leader.headingY;
            player.bobPhase = (player.bobPhase ?? 0) + dt * 10;
          }
        } else {
          player.moving = false;
        }
      } else if (!panelRef.current && !chatFocusedRef.current) {
        const k = keysRef.current;
        const joystick = movementInputRef.current;
        const firstPerson = mapZoomRef.current >= 5;
        let dx: number;
        let dy: number;
        let len: number;
        if (firstPerson) {
          const forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0)
            - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - joystick.y;
          const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0)
            - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + joystick.x;
          const yaw = cameraLookRef.current.yaw;
          dx = forward * Math.sin(yaw) - strafe * Math.cos(yaw);
          dy = forward * Math.cos(yaw) + strafe * Math.sin(yaw);
          len = Math.hypot(dx, dy);
          clickTargetRef.current = null;
        } else {
          dx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0)
            - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + joystick.x;
          dy = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
            - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) + joystick.y;
          len = Math.hypot(dx, dy);
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
        }
        player.moving = len > 0.12;
        if (len > 0.12) {
          if (firstPerson) {
            player.headingX = Math.sin(cameraLookRef.current.yaw);
            player.headingY = Math.cos(cameraLookRef.current.yaw);
          } else {
            player.headingX = dx / len;
            player.headingY = dy / len;
          }
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
        const [x, y] = chooseSerendipitySpot(player.x, player.y, challengeNpcsRef.current);
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
        const [x, y] = chooseSerendipitySpot(player.x, player.y, challengeNpcsRef.current);
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
            npc.headingX = tx / d;
            npc.headingY = ty / d;
            moveWithCollision(npc, nx, ny);
            npc.moving = true;
            npc.bobPhase = (npc.bobPhase ?? 0) + dt * 9;
          }
        }
      }

      const isMowerAuthority = mowerClientIdRef.current !== null
        && mowerClientIdRef.current === mowerAuthorityClientIdRef.current;
      if (isMowerAuthority) {
        updateTRex(tRexRef.current, player, remoteRef.current.values(), dt, wallNow, mowerTracksRef.current);
        if (
          wallNow - lastMowerSnapshotSentAtRef.current >= 100
          && sendRoomEvent({
            type: 'mower_state',
            mower: tRexRef.current,
            tracks: mowerTracksRef.current.slice(-16),
          })
        ) {
          lastMowerSnapshotSentAtRef.current = wallNow;
        }
      } else if (mowerTargetRef.current) {
        const target = mowerTargetRef.current;
        const mower = tRexRef.current;
        const follow = 1 - Math.exp(-dt * 14);
        mower.x += (target.x - mower.x) * follow;
        mower.y += (target.y - mower.y) * follow;
        const headingDelta = Math.atan2(
          Math.sin(target.heading - mower.heading),
          Math.cos(target.heading - mower.heading)
        );
        mower.heading += headingDelta * follow;
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
        ? challengeNpcsRef.current.find((npc) => npc.personaId === focused.personaId) ?? null
        : null;
      const focusedDistance = focusedChallenge
        ? Math.hypot(player.x - focusedChallenge.x, player.y - focusedChallenge.y)
        : Infinity;
      const nearestChallenge = challengeNpcsRef.current
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
        if (remote.agent.carId || remote.agent.hangoutId) continue;
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
          .filter(({ car, distance, occupied }) => isBuildCarReady(car) && distance < 118 && occupied < 2)
          .sort((a, b) => a.distance - b.distance)[0]?.car ?? null
        : null;
      const nearHangout = !carSeatRef.current && !hangoutRef.current
        ? COMMUNE_HANGOUTS
          .map((place) => ({
            place,
            distance: Math.hypot(player.x - place.doorX, player.y - place.doorY),
            occupants: new Set(
              [...remoteRef.current.values()]
                .filter((remote) => remote.agent.hangoutId === place.id)
                .map((remote) => remote.agent.username),
            ).size,
          }))
          .filter(({ place, distance, occupants }) =>
            distance <= COMMUNE_HANGOUT_ENTER_RANGE && occupants < place.capacity
          )
          .sort((a, b) => a.distance - b.distance)[0]?.place ?? null
        : null;
      const nearOwnedBuildable = !carSeatRef.current && !hangoutRef.current
        ? builtObjectsRef.current
          .filter((item) => item.owner === username)
          .map((item) => {
            const car = item.kind === 'sports-car'
              ? PARKED_CARS.find((entry) => entry.buildId === item.id)
              : null;
            return {
              item,
              distance: Math.hypot(player.x - (car?.x ?? item.x), player.y - (car?.y ?? item.y)),
            };
          })
          .filter(({ distance }) => distance <= COMMUNE_BUILD_INTERACT_RANGE)
          .sort((a, b) => a.distance - b.distance)[0]?.item ?? null
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
      const golfSession = golfRoundRef.current;
      const currentGolfBall = golfWorldPosition(golfSession.localX, golfSession.localY);
      const nearbyGame = (['golf', 'bowling'] as const)
        .map((game) => ({ game, distance: Math.hypot(player.x - MINI_GAME_ZONES[game].x, player.y - MINI_GAME_ZONES[game].y) }))
        .filter(({ game, distance }) => (
          game === 'golf' && golfSession.roundId
            ? !golfSession.busy && Math.hypot(player.x - currentGolfBall.x, player.y - currentGolfBall.y) <= 104
            : game === 'bowling'
              ? !bowlingBusyRef.current && isInBowlingArena(player.x, player.y)
              : distance <= MINI_GAME_ZONES.golf.range
        ))
        .sort((a, b) => a.distance - b.distance)[0]?.game ?? null;
      const soccerField = MINI_GAME_ZONES.soccer;
      const nearSoccerBall = player.x >= soccerField.left && player.x <= soccerField.right
        && player.y >= soccerField.top && player.y <= soccerField.bottom
        && Math.hypot(player.x - soccerBallRef.current.x, player.y - soccerBallRef.current.y) <= 104;
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
      } else if (hangoutRef.current) {
        actions.push({ type: 'exit-hangout', key: 'E', label: 'Step outside' });
      } else if (nearCar) {
        actions.push({ type: 'enter-car', key: 'E', label: `Get in ${nearCar.label}`, carId: nearCar.id });
      } else if (nearHangout) {
        actions.push({
          type: 'enter-hangout',
          key: 'E',
          label: `Enter ${nearHangout.label}`,
          hangoutId: nearHangout.id,
        });
      } else if (nearOwnedBuildable) {
        const catalogEntry = COMMUNE_BUILD_CATALOG.find((entry) => entry.kind === nearOwnedBuildable.kind);
        actions.push({
          type: 'demolish-build',
          key: 'E',
          label: `Take apart ${catalogEntry?.name ?? 'structure'} · +${Math.round((catalogEntry?.price ?? 0) / 2)} spice`,
          buildingId: nearOwnedBuildable.id,
        });
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
      } else if (nearSoccerBall) {
        const receiver = [...remoteRef.current.values()]
          .filter((remote) => (
            !remote.agent.carId
            && !remote.agent.hangoutId
            && remote.rx >= soccerField.left && remote.rx <= soccerField.right
            && remote.ry >= soccerField.top && remote.ry <= soccerField.bottom
          ))
          .sort((a, b) => (
            Math.hypot(a.rx - soccerBallRef.current.x, a.ry - soccerBallRef.current.y)
            - Math.hypot(b.rx - soccerBallRef.current.x, b.ry - soccerBallRef.current.y)
          ))[0];
        actions.push({
          type: 'soccer-kick',
          key: 'E',
          label: receiver ? `Pass to ${receiver.agent.username} · +1 spice` : 'Kick the soccer ball · +1 spice',
        });
      } else if (nearbyGame) {
        actions.push({
          type: 'mini-game',
          key: 'E',
          label: nearbyGame === 'golf'
            ? golfSession.roundId ? 'Swing the golf ball · +10 goal' : 'Tee off · sink for +10 spice'
            : 'Roll the bowling ball · +1 per pin',
          game: nearbyGame,
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

      if (!carSeatRef.current && !hangoutRef.current) {
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
        : player.hangoutId
          ? `chilling at ${COMMUNE_HANGOUTS.find((place) => place.id === player.hangoutId)?.label ?? 'a building'}`
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
      if (!player.carId && !player.hangoutId && (
        (player.moving && wallNow - lastPositionSentAtRef.current >= 100) ||
        statusChanged
      )) {
        if (sendRoomEvent({
          type: 'move',
          x: Math.round(player.x),
          y: Math.round(player.y),
          status: statusRef.current,
          viewRadius: getViewRadius(),
        })) {
          lastPositionSentAtRef.current = wallNow;
          lastPositionStatusRef.current = statusRef.current;
        }
      }

      /* remote agents: lerp toward their last reported position. While holding
       * hands as the leader, pin the partner beside us (fixed absolute slot). */
      const heldHands = handsRef.current;
      const remoteViews: RemoteView[] = [];
      for (const r of remoteRef.current.values()) {
        const renderAt = now - REMOTE_INTERPOLATION_DELAY_MS;
        while (r.samples.length > 2 && r.samples[1].at <= renderAt) r.samples.shift();
        const first = r.samples[0];
        const second = r.samples[1];
        let nextX = first?.x ?? r.rx;
        let nextY = first?.y ?? r.ry;
        if (first && second && renderAt > first.at) {
          const sampleDuration = Math.max(1, second.at - first.at);
          if (renderAt <= second.at) {
            const amount = Math.max(0, Math.min(1, (renderAt - first.at) / sampleDuration));
            nextX = first.x + (second.x - first.x) * amount;
            nextY = first.y + (second.y - first.y) * amount;
          } else {
            const extrapolationMs = Math.min(REMOTE_MAX_EXTRAPOLATION_MS, renderAt - second.at);
            nextX = second.x + ((second.x - first.x) / sampleDuration) * extrapolationMs;
            nextY = second.y + ((second.y - first.y) / sampleDuration) * extrapolationMs;
          }
        }
        const dx = nextX - r.rx;
        const dy = nextY - r.ry;
        const distance = Math.hypot(dx, dy);
        r.moving = distance > 0.4;
        if (distance > 0.1) {
          r.headingX = dx / distance;
          r.headingY = dy / distance;
        }
        r.rx = nextX;
        r.ry = nextY;
        if (r.moving) r.bobPhase += dt * 9;
        let vx = r.rx;
        let vy = r.ry;
        let vmoving = r.moving;
        let headingX = r.headingX;
        let headingY = r.headingY;
        if (heldHands && heldHands.lead && r.agent.username === heldHands.partner) {
          vx = player.x - 22;
          vy = player.y + 6;
          vmoving = !!player.moving;
          headingX = player.headingX ?? 0;
          headingY = player.headingY ?? 1;
        }
        remoteViews.push({
          x: vx,
          y: vy,
          headingX,
          headingY,
          name: r.agent.username,
          hue: hueOf(r.agent.username),
          phrase: r.agent.loadout?.phrase || null,
          status: r.agent.isAfk ? 'AFK' : r.agent.status,
          admin: r.agent.isAdmin && !r.agent.isManagement && !r.agent.isSuperAdmin,
          superAdmin: r.agent.isSuperAdmin,
          pet: r.agent.loadout?.pet ?? null,
          avatar: r.agent.loadout?.avatar ?? null,
          says: r.says,
          moving: vmoving,
          bobPhase: r.bobPhase,
          carId: r.agent.carId,
          hangoutId: r.agent.hangoutId,
          hangoutSeat: r.agent.hangoutSeat,
        });
      }

      const petViews = updatePetFollowers(
        [
          ...(!player.carId && !player.hangoutId
            ? [{ ownerId: player.name, x: player.x, y: player.y, moving: !!player.moving, pet: player.pet ?? null }]
            : []),
          ...remoteViews.filter((remote) => !remote.carId && !remote.hangoutId).map((remote) => ({
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
      const renderedPlayer: Agent = {
        ...player,
        admin: !!user?.isAdmin && !isSuperAdmin,
        superAdmin: isSuperAdmin,
      };
      if (threeRenderer) {
        latestFrame = {
          time: tSec,
          zoom: mapZoomRef.current,
          cameraPitch: cameraLookRef.current.pitch,
          cameraYaw: cameraLookRef.current.yaw,
          player: renderedPlayer,
          npcs: npcsRef.current,
          remotes: remoteViews,
          pets: petViews,
          cars: PARKED_CARS,
          buildables: builtObjectsRef.current,
          hoveredBuildId: hoveredBuildObjectIdRef.current,
          buildPreview: buildPlacementKindRef.current && buildPreviewRef.current
            ? { kind: buildPlacementKindRef.current, ...buildPreviewRef.current }
            : null,
          drops: dropsRef.current,
          ducks: ducksRef.current,
          incident: duckIncidentRef.current,
          serendipity: serendipityRef.current,
          destination: clickTargetRef.current,
          clickTarget: clickTargetRef.current,
          soccerBall: soccerBallRef.current,
          golfBall: golfBallMotionRef.current,
          bowlingBall: bowlingBallMotionRef.current,
          bowlingPinsDown: bowlingPinsDownRef.current,
          bowlingPinsKnockedAt: bowlingPinsKnockedAtRef.current,
          laserShots: laserShotsRef.current,
          mower: tRexRef.current,
          mowerTracks: mowerTracksRef.current,
          nightOpacity,
          reduceMotion,
        };
      } else if (ctx) {
        draw(
          ctx, vw, vh, dpr, shakeCam, tSec, renderedPlayer, npcsRef.current, banners,
          remoteViews, petViews, reduceMotion, nightOpacity, serendipityRef.current,
          clickTargetRef.current, dropsRef.current, ducksRef.current, duckIncidentRef.current,
          soccerBallRef.current, golfBallMotionRef.current, bowlingBallMotionRef.current,
          bowlingPinsDownRef.current, tRexRef.current, mowerTracksRef.current, bowlingPinsKnockedAtRef.current,
          builtObjectsRef.current,
          buildPlacementKindRef.current && buildPreviewRef.current
            ? { kind: buildPlacementKindRef.current, ...buildPreviewRef.current }
            : null,
          hoveredBuildObjectIdRef.current,
        );
      }
      raf = requestAnimationFrame(step);
    };
    const onMotionChange = (event: MediaQueryListEvent) => {
      reduceMotion = event.matches;
    };
    reduceMotionQuery.addEventListener('change', onMotionChange);
    const onVisibilityChange = () => {
      if (document.hidden) {
        keysRef.current.clear();
        movementInputRef.current = { x: 0, y: 0 };
        joystickPointerIdRef.current = null;
        clickTargetRef.current = null;
        joystickKnobRef.current?.style.setProperty('--stick-x', '0px');
        joystickKnobRef.current?.style.setProperty('--stick-y', '0px');
        setJoystickActive(false);
        cancelAnimationFrame(raf);
        cancelAnimationFrame(renderRaf);
        raf = 0;
        renderRaf = 0;
      } else if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(step);
        if (threeRenderer) renderRaf = requestAnimationFrame(renderStep);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    raf = requestAnimationFrame(step);
    if (threeRenderer) renderRaf = requestAnimationFrame(renderStep);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(renderRaf);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      reduceMotionQuery.removeEventListener('change', onMotionChange);
      ro.disconnect();
      if (communeRendererRef.current === threeRenderer) communeRendererRef.current = null;
      threeRenderer?.dispose();
    };
  }, [banners, getViewRadius, isSuperAdmin, publishNearbyActions, sendRoomEvent, setSpice, upsertLaserShot, user?.isAdmin, username]);

  /* ── pointer tap → focus a target, interact, or walk ─────────────────────── */

  const handleCanvasTap = (clientX: number, clientY: number, pointerType?: string) => {
    if (panelRef.current || playerRef.current.carId || playerRef.current.hangoutId || mapZoomRef.current >= 5) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const worldPoint = communeRendererRef.current?.screenToWorld(clientX, clientY, rect);
    const wx = worldPoint?.x ?? clientX - rect.left + camRef.current.x;
    const wy = worldPoint?.y ?? clientY - rect.top + camRef.current.y;
    if (buildPlacementKindRef.current) {
      if (pointerType && pointerType !== 'mouse') {
        const x = Math.round(wx / 8) * 8;
        const y = Math.round(wy / 8) * 8;
        const previous = buildTouchPreviewRef.current;
        buildPreviewRef.current = {
          x,
          y,
          rotation: buildPlacementRotationRef.current,
          valid: canPlaceBuildLocally(
            buildPlacementKindRef.current,
            x,
            y,
            buildPlacementRotationRef.current,
          ),
        };
        if (!previous || Math.hypot(previous.x - x, previous.y - y) > 16) {
          buildTouchPreviewRef.current = { x, y };
          return;
        }
        buildTouchPreviewRef.current = { x, y };
      }
      void placeBuildAt(wx, wy);
      return;
    }
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
      if (!isBuildCarReady(car)) return false;
      const bounds = carHalfExtents(car.heading, car.halfWidth, car.halfLength);
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
    const tappedHangout = COMMUNE_HANGOUTS.find((place) =>
      Math.abs(wx - place.x) < place.width / 2 + 24
      && Math.abs(wy - place.y) < place.depth / 2 + (place.kind === 'villa' ? 74 : 48)
    );
    if (tappedHangout) {
      const player = playerRef.current;
      const distance = Math.hypot(player.x - tappedHangout.doorX, player.y - tappedHangout.doorY);
      if (distance <= COMMUNE_HANGOUT_ENTER_RANGE) {
        executeInteraction({
          type: 'enter-hangout',
          key: 'E',
          label: `Enter ${tappedHangout.label}`,
          hangoutId: tappedHangout.id,
        });
      } else {
        clickTargetRef.current = approachPoint(
          tappedHangout.doorX,
          tappedHangout.doorY,
          player.x,
          player.y,
          22,
        );
      }
      return;
    }
    const soccerBallAtTap = soccerBallRef.current;
    if (Math.hypot(wx - soccerBallAtTap.x, wy - soccerBallAtTap.y) < 34) {
      const player = playerRef.current;
      const field = MINI_GAME_ZONES.soccer;
      const inField = player.x >= field.left && player.x <= field.right
        && player.y >= field.top && player.y <= field.bottom;
      if (inField && Math.hypot(player.x - soccerBallAtTap.x, player.y - soccerBallAtTap.y) <= 104) {
        executeInteraction({ type: 'soccer-kick', key: 'E', label: 'Kick the soccer ball · +1 spice' });
      } else {
        clickTargetRef.current = approachPoint(soccerBallAtTap.x, soccerBallAtTap.y, player.x, player.y, 52);
      }
      return;
    }
    const tappedGame = (['golf', 'bowling'] as const).find((game) => {
      const zone = MINI_GAME_ZONES[game];
      return game === 'golf'
        ? Math.abs(wx - zone.x) < 210 && Math.abs(wy - zone.y) < 130
        : Math.abs(wx - zone.x) < 82 && Math.abs(wy - zone.y) < 205;
    });
    if (tappedGame) {
      const player = playerRef.current;
      const zone = MINI_GAME_ZONES[tappedGame];
      const session = golfRoundRef.current;
      const golfBall = golfWorldPosition(session.localX, session.localY);
      const target = tappedGame === 'golf'
        ? session.roundId ? golfBall : zone
        : BOWLING_APPROACH;
      const inRange = tappedGame === 'golf' && session.roundId
        ? !session.busy && Math.hypot(player.x - golfBall.x, player.y - golfBall.y) <= 104
        : tappedGame === 'golf'
          ? Math.hypot(player.x - zone.x, player.y - zone.y) <= zone.range
          : !bowlingBusyRef.current && isInBowlingArena(player.x, player.y);
      if (inRange) {
        executeInteraction({
          type: 'mini-game',
          key: 'E',
          label: tappedGame === 'golf' ? 'Swing the golf ball' : 'Roll the bowling ball',
          game: tappedGame,
        });
      } else {
        clickTargetRef.current = approachPoint(target.x, target.y, player.x, player.y, 92);
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
    const challengeNpc = challengeNpcsRef.current.find(
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
        const agent = r.agent;
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

  const fireLaser = async () => {
    if (mapZoomRef.current < 5 || panelRef.current || playerRef.current.carId || playerRef.current.hangoutId) return;
    const now = performance.now();
    if (now - lastLaserFiredAtRef.current < 500) return;
    lastLaserFiredAtRef.current = now;
    const actionId = crypto.randomUUID();
    const yaw = cameraLookRef.current.yaw;
    const pitch = cameraLookRef.current.pitch;
    const directionX = Math.sin(yaw) * Math.cos(pitch);
    const directionY = Math.cos(yaw) * Math.cos(pitch);
    const player = playerRef.current;

    // Render locally first so the weapon has immediate feedback even when the
    // authoritative room request is delayed or unavailable.
    upsertLaserShot({
      id: actionId,
      shooter: player.name,
      fromX: player.x + directionX * 8 + Math.cos(yaw) * 6,
      fromY: player.y + directionY * 8 - Math.sin(yaw) * 6,
      fromHeight: 50 + Math.sin(pitch) * 8,
      toX: player.x + directionX * 1_800,
      toY: player.y + directionY * 1_800,
      toHeight: 55 + Math.sin(pitch) * 1_800,
      durationMs: 720,
      targetUsername: null,
    });
    try {
      const result = await fireCommuneLaser(
        actionId,
        yaw,
        pitch
      );
      // Replace the prediction with the shared, server-resolved impact.
      upsertLaserShot(result.shot);
      if (result.awarded > 0) {
        setLaserHitConfirmed(true);
        if (laserHitTimerRef.current !== null) window.clearTimeout(laserHitTimerRef.current);
        laserHitTimerRef.current = window.setTimeout(() => {
          setLaserHitConfirmed(false);
          laserHitTimerRef.current = null;
        }, 280);
      }
      playerRef.current.says = {
        text: result.targetUsername
          ? `Tagged ${result.targetUsername}! +1 spice for them.`
          : 'Pew! The laser fizzled into the scenery.',
        until: Date.now() + 2600,
      };
    } catch (error) {
      playerRef.current.says = {
        text: error instanceof Error ? error.message : 'Laser unavailable. Try again.',
        until: Date.now() + 2400,
      };
    }
  };

  const onCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (mapZoomRef.current >= 5 && event.pointerType === 'mouse') {
      event.currentTarget.focus();
      if (document.pointerLockElement !== event.currentTarget) {
        void event.currentTarget.requestPointerLock().catch(() => undefined);
      }
      void fireLaser();
      return;
    }
    canvasPointerRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerLocked) return;
    if (buildPlacementKindRef.current) {
      updateBuildPreviewAt(event.clientX, event.clientY);
      return;
    }
    const pointer = canvasPointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (mapZoomRef.current >= 5) {
      const dx = event.clientX - pointer.lastX;
      const dy = event.clientY - pointer.lastY;
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      updateFirstPersonLook(dx, dy, 0.004);
      pointer.moved ||= Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 6;
      return;
    }
    if (!pointer.moved) pointer.moved = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 12;
  };

  const updateFirstPersonLook = (dx: number, dy: number, sensitivity: number) => {
    cameraLookRef.current.yaw -= dx * sensitivity;
    cameraLookRef.current.pitch = Math.max(
      -1.2,
      Math.min(1.2, cameraLookRef.current.pitch - dy * sensitivity)
    );
  };

  const onCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (mapZoomRef.current >= 5 && document.pointerLockElement === event.currentTarget) {
      hoveredBuildObjectIdRef.current = null;
      updateFirstPersonLook(event.movementX, event.movementY, 0.0025);
      return;
    }
    if (buildPlacementKindRef.current) {
      hoveredBuildObjectIdRef.current = null;
      updateBuildPreviewAt(event.clientX, event.clientY);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const point = communeRendererRef.current?.screenToWorld(event.clientX, event.clientY, rect);
    const worldX = point?.x ?? event.clientX - rect.left + camRef.current.x;
    const worldY = point?.y ?? event.clientY - rect.top + camRef.current.y;
    const hovered = [...builtObjectsRef.current].reverse().find((item) => {
      const car = item.kind === 'sports-car'
        ? PARKED_CARS.find((candidate) => candidate.buildId === item.id)
        : null;
      const bounds = car
        ? carHalfExtents(car.heading, car.halfWidth, car.halfLength)
        : buildHalfExtents(item.kind, item.rotation);
      return Math.abs(worldX - (car?.x ?? item.x)) <= bounds.x + 12
        && Math.abs(worldY - (car?.y ?? item.y)) <= bounds.y + 12;
    });
    hoveredBuildObjectIdRef.current = hovered?.id ?? null;
  };

  const onCanvasPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pointer = canvasPointerRef.current;
    canvasPointerRef.current = null;
    if (!pointer || pointer.id !== event.pointerId || pointer.moved) return;
    if (mapZoomRef.current >= 5) {
      if (event.pointerType !== 'mouse') void fireLaser();
      return;
    }
    handleCanvasTap(event.clientX, event.clientY, event.pointerType);
  };

  const onCanvasPointerCancel = () => {
    canvasPointerRef.current = null;
  };

  const onCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (mapZoomRef.current >= 5) {
      if (event.detail > 0) void fireLaser();
      return;
    }
    // Pointer events handle mouse and touch; keep click-only keyboard activation.
    if (event.detail !== 0) return;
    handleCanvasTap(event.clientX, event.clientY);
  };

  const changeMapZoom = (value: number) => {
    const maxZoom = hangoutRef.current || buildPlacementKindRef.current ? 4.95 : 5;
    const zoom = Number(Math.min(maxZoom, Math.max(1, value)).toFixed(2));
    const wasFirstPerson = mapZoomRef.current >= 5;
    if (zoom >= 5 && !wasFirstPerson) {
      const player = playerRef.current;
      cameraLookRef.current.yaw = Math.atan2(player.headingX ?? 0, player.headingY ?? 1);
    } else if (zoom < 5 && wasFirstPerson && document.pointerLockElement === canvasRef.current) {
      document.exitPointerLock();
    }
    mapZoomRef.current = zoom;
    if (zoom >= 5) clickTargetRef.current = null;
    setMapZoom(zoom);
  };

  const cancelBuildPlacement = () => {
    setBuildPlacementKind(null);
    buildPlacementKindRef.current = null;
    buildPreviewRef.current = null;
    buildTouchPreviewRef.current = null;
  };

  const startBuildPlacement = (kind: CommuneBuildKind) => {
    setBuildMenuOpen(false);
    setBuildPlacementKind(kind);
    buildPlacementKindRef.current = kind;
    buildPlacementRotationRef.current = 0;
    buildTouchPreviewRef.current = null;
    const player = playerRef.current;
    const headingLength = Math.hypot(player.headingX ?? 0, player.headingY ?? 1) || 1;
    const x = Math.round((player.x + (player.headingX ?? 0) / headingLength * 150) / 8) * 8;
    const y = Math.round((player.y + (player.headingY ?? 1) / headingLength * 150) / 8) * 8;
    buildPreviewRef.current = {
      x,
      y,
      rotation: 0,
      valid: canPlaceBuildLocally(kind, x, y, 0),
    };
    clickTargetRef.current = null;
    if (mapZoomRef.current >= 5) {
      document.exitPointerLock();
      mapZoomRef.current = 1.5;
      setMapZoom(1.5);
    }
  };

  const updateBuildPreviewAt = (clientX: number, clientY: number) => {
    const kind = buildPlacementKindRef.current;
    const canvas = canvasRef.current;
    if (!kind || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const point = communeRendererRef.current?.screenToWorld(clientX, clientY, rect);
    const x = Math.round((point?.x ?? clientX - rect.left + camRef.current.x) / 8) * 8;
    const y = Math.round((point?.y ?? clientY - rect.top + camRef.current.y) / 8) * 8;
    const rotation = buildPlacementRotationRef.current;
    buildPreviewRef.current = {
      x,
      y,
      rotation,
      valid: canPlaceBuildLocally(kind, x, y, rotation),
    };
  };

  const placeBuildAt = async (worldX: number, worldY: number) => {
    const kind = buildPlacementKindRef.current;
    if (!kind || buildBusy) return;
    const x = Math.round(worldX / 8) * 8;
    const y = Math.round(worldY / 8) * 8;
    const rotation = buildPlacementRotationRef.current;
    if (!canPlaceBuildLocally(kind, x, y, rotation)) {
      buildPreviewRef.current = { x, y, rotation, valid: false };
      setInbox((items) => [...items.slice(-4), {
        from: 'BUILD',
        message: 'That spot is blocked. Move the preview to a clear spot.',
      }]);
      return;
    }
    setBuildBusy(true);
    try {
      const result = await placeCommuneBuildable({
        id: crypto.randomUUID(),
        kind,
        x,
        y,
        rotation,
      });
      setSpice(result.spice);
      const next = [...builtObjectsRef.current.filter((item) => item.id !== result.building.id), result.building];
      reconcileBuiltObjects(next);
      builtObjectsRef.current = next;
      setBuiltObjects(next);
      setInbox((items) => [...items.slice(-4), {
        from: 'BUILD',
        message: `${COMMUNE_BUILD_CATALOG.find((entry) => entry.kind === kind)?.name ?? 'Structure'} placed · under construction for ${formatBuildDuration(COMMUNE_BUILD_CATALOG.find((entry) => entry.kind === kind)?.buildTimeMs ?? 0)}.`,
      }]);
      cancelBuildPlacement();
    } catch (error) {
      setInbox((items) => [...items.slice(-4), {
        from: 'BUILD',
        message: error instanceof Error ? error.message : 'Could not build there.',
      }]);
    } finally {
      setBuildBusy(false);
    }
  };

  const adjustMapZoom = (delta: number) => {
    changeMapZoom(mapZoomRef.current + delta);
  };

  const onMapZoomChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    changeMapZoom(Number(event.currentTarget.value));
  };

  const onCanvasWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const step = Math.max(0.05, Math.min(0.25, Math.abs(event.deltaY) * 0.001));
    adjustMapZoom(event.deltaY < 0 ? step : -step);
  };

  const speak = () => {
    const text = chatDraft.trim();
    if (!text) return;
    const recipient = messagingRef.current;
    const car = carSeatRef.current;
    const place = hangoutRef.current;
    const sent = sendRoomEvent(
      place
        ? { type: 'hangout_chat', message: text }
        : car
          ? { type: 'car_chat', message: text }
        : recipient
          ? { type: 'private_chat', target: recipient, message: text }
          : { type: 'public_chat', message: text },
    );
    if (!sent) {
      setInbox((items) => [...items.slice(-4), { from: 'COMMUNE', message: 'Reconnecting; your message was not sent.' }]);
      return;
    }
    if (!car && !place) playerRef.current.says = { text: text.slice(0, 90), until: Date.now() + 6000 };
    setChatDraft('');
  };

  const startDirectMessage = (target: string) => {
    setMessaging(target);
    setPanel(null);
    window.requestAnimationFrame(() => chatInputRef.current?.focus());
  };

  const latestBanner = banners[banners.length - 1] ?? null;
  const activeProp = panel ? COMMUNE_PROPS.find((prop) => prop.kind === panel) ?? null : null;
  const currentCar = carSeat ? PARKED_CARS.find((car) => car.id === carSeat.carId) ?? null : null;
  const currentHangout = hangout ? COMMUNE_HANGOUTS.find((place) => place.id === hangout.id) ?? null : null;
  const carOccupants = carSeat
    ? others.filter((agent) => agent.carId === carSeat.carId).sort((a, b) => (a.carSeat ?? 0) - (b.carSeat ?? 0))
    : [];
  const hangoutOccupants = hangout
    ? others
      .filter((agent) => agent.hangoutId === hangout.id)
      .sort((a, b) => (a.hangoutSeat ?? 0) - (b.hangoutSeat ?? 0))
      .map((agent) => agent.username)
    : [];
  const widePanel = panel === 'townhall' || panel === 'arcade' || panel === 'banners' || panel === 'quiz' || panel === 'treehole';
  const paperPanel = panel === 'banners' || panel === 'agent';
  const bannerWorkspace = panel === 'banners';
  const panelPosition = bannerWorkspace
    ? 'fixed inset-0 z-[60]'
    : touchControls
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
        onMouseMove={onCanvasMouseMove}
        onMouseLeave={() => { hoveredBuildObjectIdRef.current = null; }}
        onClick={onCanvasClick}
        onWheel={onCanvasWheel}
        className={cn(
          'absolute inset-0 outline-none',
          mapZoom >= 5 && pointerLocked ? 'cursor-none' : 'cursor-crosshair'
        )}
        role="application"
        aria-label="COMMUNE town square. Zoom to 5x for first-person view. Click to capture the mouse; use WASD to move and the mouse to look."
        style={{ touchAction: mapZoom >= 5 ? 'none' : 'manipulation' }}
        tabIndex={0}
      />
      <canvas
        ref={labelsCanvasRef}
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden="true"
      />
      {mapZoom >= 5 && (
        <div
          role="img"
          aria-label={laserHitConfirmed ? 'Laser hit confirmed' : 'Laser aiming crosshair'}
          className={cn(
            'pointer-events-none absolute left-1/2 top-1/2 z-20 size-5 -translate-x-1/2 -translate-y-1/2 transition-transform duration-100',
            laserHitConfirmed
              ? 'scale-125 text-white drop-shadow-[0_0_6px_rgba(255,255,255,1)]'
              : 'text-cyan-200 drop-shadow-[0_0_4px_rgba(98,242,255,0.9)]'
          )}
        >
          {laserHitConfirmed && (
            <svg className="absolute -inset-2 size-9" viewBox="0 0 36 36" aria-hidden="true">
              <path
                d="M6 6l7 7M30 6l-7 7M6 30l7-7M30 30l-7-7"
                fill="none"
                stroke="currentColor"
                strokeLinecap="square"
                strokeWidth="2"
              />
            </svg>
          )}
          <span className="absolute left-1/2 top-0 h-1.5 w-px -translate-x-1/2 bg-current" />
          <span className="absolute bottom-0 left-1/2 h-1.5 w-px -translate-x-1/2 bg-current" />
          <span className="absolute left-0 top-1/2 h-px w-1.5 -translate-y-1/2 bg-current" />
          <span className="absolute right-0 top-1/2 h-px w-1.5 -translate-y-1/2 bg-current" />
          <span className="absolute left-1/2 top-1/2 size-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
        </div>
      )}
      {mapZoom >= 5 && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/25 bg-slate-950/55 px-3 py-1.5 font-mono text-[10px] text-white/85 shadow-lg backdrop-blur-sm">
          {touchControls
            ? 'JOYSTICK MOVE · DRAG TO LOOK · TAP TO FIRE'
            : pointerLocked
              ? 'WASD MOVE · MOUSE LOOK · LEFT CLICK FIRE · ESC RELEASE'
              : 'CLICK TO LOCK MOUSE + FIRE · WASD MOVE'}
        </div>
      )}

      {touchControls && !panel && !chatFocused && (
        <div
          role="group"
          aria-label="Map zoom controls"
          className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-2 rounded-full border border-white/30 bg-slate-950/30 px-2 py-3 shadow-lg backdrop-blur-sm"
        >
          <span className="font-mono text-[8px] font-bold tracking-wider text-white/70">{mapZoom >= 5 ? 'FPV' : 'ZOOM'}</span>
          <input
            type="range"
            min="1"
            max="5"
            step="0.05"
            value={mapZoom}
            onChange={onMapZoomChange}
            aria-label="Map zoom, 5x switches to first-person view"
            className="h-32 w-6 accent-primary"
            style={{ writingMode: 'vertical-lr', direction: 'rtl', touchAction: 'none' }}
          />
          <output className="font-mono text-[9px] font-bold tabular-nums text-white/80">
            {mapZoom >= 5 ? 'FPV' : `${mapZoom.toFixed(1)}x`}
          </output>
        </div>
      )}

      {/* Compact world identity */}
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-3 border-2 border-[#785a3c] bg-[#f0dfb9] px-3.5 py-2 text-[#493927] shadow-[3px_3px_0_rgba(36,28,19,0.42)]">
        <span className="grid size-8 place-items-center border-2 border-[#8b6a44] bg-[#735638] text-[#f8eccf]">
          <Users className="size-4" />
        </span>
          <span>
          <span className="block font-['Schoolbell'] text-sm font-bold tracking-wide">COMMUNE</span>
            <span className="block text-[10px] text-[#715b3e]">Town square · {others.length + 1} here</span>
            <span className="flex items-center gap-1.5 text-[9px] text-[#715b3e]">
              <span className={cn('size-1.5 border border-[#493927]/40', connectionState === 'connected' ? 'bg-[#788c5d]' : 'bg-[#d6a646]')} />
              {connectionState === 'connected' ? 'Live' : connectionState === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
            </span>
            <span className="mt-1 inline-flex items-center gap-1 border border-[#8b6a44] bg-[#ead6ad] px-2 py-0.5 font-['Schoolbell'] text-[10px] font-bold text-[#5c472e]">
              ✦ {oddityCount} oddit{oddityCount === 1 ? 'y' : 'ies'} found
            </span>
        </span>
      </div>

      {/* Desktop keeps compact labeled actions centered above the chat bar. */}
      {!touchControls && !panel && (focusedNpc && !focusedNpcIsReady || nearbyActions.length > 0) && (
        <div
          aria-live="polite"
          className="absolute bottom-[4.75rem] left-1/2 z-20 flex max-w-[calc(100%-24px)] -translate-x-1/2 flex-col items-center gap-1.5 animate-in fade-in"
          style={{ bottom: 'max(4.75rem, calc(var(--commune-dock-clearance, 0px) + 12px))' }}
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
            bottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 15rem), calc(var(--commune-dock-clearance, 0px) + 12px))',
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
      {touchControls && !panel && !chatFocused && !hangout && (
        <div
          ref={joystickBaseRef}
          role="group"
          aria-label={carSeat ? 'Car steering joystick' : 'Movement joystick'}
          className="absolute z-20 size-[clamp(116px,34vw,144px)] touch-none select-none rounded-full border border-white/30 bg-slate-950/25 shadow-[inset_0_0_22px_rgba(0,0,0,0.4),0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-sm"
          style={{
            bottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 5.5rem), calc(var(--commune-dock-clearance, 0px) + 12px))',
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
            bottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 5.5rem), calc(var(--commune-dock-clearance, 0px) + 12px))',
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

      {!panel && (
        <div
          className="absolute right-3 z-30"
          style={{
            bottom: touchControls
              ? 'max(calc(env(safe-area-inset-bottom, 0px) + 13rem), calc(var(--commune-dock-clearance, 0px) + 12px))'
              : 'max(calc(env(safe-area-inset-bottom, 0px) + 1rem), calc(var(--commune-dock-clearance, 0px) + 12px))',
          }}
        >
          {buildMenuOpen && !buildPlacementKind && (
            <div
              className="absolute bottom-[calc(100%+10px)] right-0 flex max-h-[min(62svh,520px)] w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-amber-200/30 bg-slate-950/90 text-white shadow-2xl backdrop-blur-xl"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">Village workshop</p>
                  <p className="mt-0.5 text-[10px] text-white/55">Balance: {user?.spice ?? 0} spice · max 24 builds each</p>
                </div>
                <button
                  type="button"
                  onClick={() => setBuildMenuOpen(false)}
                  className="grid size-8 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                  aria-label="Close building catalog"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 overflow-y-auto p-2.5">
                {COMMUNE_BUILD_CATALOG.map((entry) => {
                  const canAfford = (user?.spice ?? 0) >= entry.price;
                  return (
                    <button
                      key={entry.kind}
                      type="button"
                      disabled={!canAfford || buildBusy}
                      onClick={() => startBuildPlacement(entry.kind)}
                      className={cn(
                        'flex min-h-[98px] flex-col items-start justify-between rounded-xl border p-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200',
                        canAfford
                          ? 'border-white/12 bg-white/[0.045] hover:border-amber-200/45 hover:bg-amber-200/10'
                          : 'cursor-not-allowed border-white/5 bg-white/[0.02] opacity-45'
                      )}
                    >
                      <span>
                        <span className="block text-[11px] font-bold">{entry.name}</span>
                        <span className="mt-1 block text-[9px] leading-snug text-white/55">{entry.description}</span>
                      </span>
                      <span className="mt-2 flex w-full items-center justify-between gap-1">
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/20 bg-amber-200/10 px-2 py-0.5 font-mono text-[9px] font-bold text-amber-100">
                          <Coins className="size-3" /> {entry.price} spice
                        </span>
                        <span className="font-mono text-[9px] font-semibold text-white/55">
                          {formatBuildDuration(entry.buildTimeMs)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (buildPlacementKindRef.current) {
                cancelBuildPlacement();
                return;
              }
              setBuildMenuOpen((open) => !open);
            }}
            disabled={buildBusy}
            aria-label={buildPlacementKind ? 'Cancel building placement' : 'Open village building catalog'}
            aria-expanded={buildMenuOpen}
            className={cn(
              'flex h-11 items-center gap-2 rounded-full border px-4 font-mono text-[11px] font-bold uppercase tracking-wider shadow-xl backdrop-blur-xl transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 disabled:opacity-60',
              buildPlacementKind
                ? 'border-rose-200/45 bg-slate-950/85 text-rose-100'
                : 'border-amber-200/40 bg-slate-950/85 text-amber-100 hover:bg-amber-200/10'
            )}
          >
            {buildPlacementKind ? <X className="size-4" /> : <Building2 className="size-4" />}
            {buildPlacementKind ? 'Cancel build' : 'Build'}
          </button>
        </div>
      )}
      {buildPlacementKind && !panel && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full border border-amber-100/35 bg-slate-950/80 px-3 py-1.5 text-center font-mono text-[9px] font-bold uppercase tracking-wider text-amber-50 shadow-lg backdrop-blur-md">
          {COMMUNE_BUILD_CATALOG.find((entry) => entry.kind === buildPlacementKind)?.name} · Tap/click to place · R rotate · Esc cancel
        </div>
      )}

      {!touchControls && !panel && !chatFocused && (
        <div
          role="group"
          aria-label="Map zoom controls"
          className="absolute right-4 top-16 z-20 flex items-center gap-2 rounded-full border border-white/25 bg-slate-950/35 px-2 py-1.5 font-mono text-[10px] text-white/80 shadow-lg backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => adjustMapZoom(-0.25)}
            aria-label="Zoom out map"
            className="grid size-7 place-items-center rounded-full text-base hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            −
          </button>
          <output className="min-w-9 text-center tabular-nums">{mapZoom >= 5 ? 'FPV' : `${mapZoom.toFixed(1)}x`}</output>
          <button
            type="button"
            onClick={() => adjustMapZoom(0.25)}
            aria-label={mapZoom >= 5 ? 'First-person view active' : 'Zoom in map'}
            disabled={mapZoom >= 5}
            className="grid size-7 place-items-center rounded-full text-base hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            +
          </button>
        </div>
      )}

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
          <div className="pointer-events-none absolute bottom-[7.5rem] left-1/2 z-10 w-[min(560px,calc(100%-24px))] -translate-x-1/2" style={{ bottom: 'max(7.5rem, calc(var(--commune-dock-clearance, 0px) + 12px))' }}>
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
                {interiorChatMessages.slice(-4).map((item, index) => (
                  <p key={`${item.at}-${item.from}-${index}`} className="truncate text-[11px] leading-snug text-white/90">
                    <span className="mr-1.5 font-bold text-sky-200">{item.from}</span>
                    {item.message}
                  </p>
                ))}
                {interiorChatMessages.length === 0 && (
                  <p className="text-[10px] text-white/55">Just the two of you. Start a private conversation.</p>
                )}
              </div>
            </div>
          </div>
        )}
      {/* Short-lived shared history lets everyone remove inappropriate chat. */}
        {hangout && (
          <div className="pointer-events-none absolute bottom-[7.5rem] left-1/2 z-10 w-[min(560px,calc(100%-24px))] -translate-x-1/2" style={{ bottom: 'max(7.5rem, calc(var(--commune-dock-clearance, 0px) + 12px))' }}>
            <div
              role="log"
              aria-label={`Private ${currentHangout?.label ?? 'building'} conversation`}
              aria-live="polite"
              className="pointer-events-auto overflow-hidden rounded-xl border border-amber-200/30 bg-slate-950/85 px-3 py-2 shadow-lg backdrop-blur-md"
            >
              <div className="mb-1 flex items-center justify-between gap-2 border-b border-white/10 pb-1">
                <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-amber-200">
                  Private · {currentHangout?.label ?? 'Hangout'} · {hangoutOccupants.length + 1}/{currentHangout?.capacity ?? 2}
                </span>
                <span className="truncate text-[9px] text-white/55">
                  {[username, ...hangoutOccupants].join(' · ')}
                </span>
              </div>
              <p className="mb-1 text-[9px] text-amber-100/60">Chill here and chat privately · E to step outside</p>
              <div className="flex max-h-24 flex-col gap-1 overflow-hidden">
                {interiorChatMessages.slice(-4).map((item, index) => (
                  <p key={`${item.at}-${item.from}-${index}`} className="truncate text-[11px] leading-snug text-white/90">
                    <span className="mr-1.5 font-bold text-amber-200">{item.from}</span>
                    {item.message}
                  </p>
                ))}
                {interiorChatMessages.length === 0 && (
                  <p className="text-[10px] text-white/55">A quiet place to catch up. Say hello.</p>
                )}
              </div>
            </div>
          </div>
        )}
      {/* Short-lived shared history lets everyone remove inappropriate chat. */}
        {!carSeat && !hangout && squareMessages.length > 0 && (
        <div className="pointer-events-none absolute bottom-[7.5rem] left-1/2 z-10 w-[min(560px,calc(100%-24px))] -translate-x-1/2" style={{ bottom: 'max(7.5rem, calc(var(--commune-dock-clearance, 0px) + 12px))' }}>
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
        <div className="pointer-events-none absolute bottom-[7.25rem] left-1/2 -translate-x-1/2 animate-in fade-in rounded-full border border-primary/50 bg-primary/15 px-3 py-1 text-[11px] font-bold text-primary shadow-lg backdrop-blur-xl" style={{ bottom: 'max(7.25rem, calc(var(--commune-dock-clearance, 0px) + 12px))' }}>
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
              : hangout
                ? 'border-amber-200/40 bg-slate-950/90'
              : chatFocused || chatDraft
              ? 'border-white/30 bg-card/95'
              : 'border-white/35 bg-transparent'
        )}
        style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px), calc(var(--commune-dock-clearance, 0px) + 12px))' }}
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
            hangout
              ? 'Private building chat · only people inside can hear'
              : carSeat
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
        <ChallengePanel
          personaId={challengePersona}
          npcName={challengeNpcs.find((npc) => npc.personaId === challengePersona)?.name}
          onSpiceChange={setSpice}
          onClose={() => setPanel(null)}
        />
      )}
      {panel && panel !== 'store' && panel !== 'challenges' && (
        <div
          role="dialog"
          aria-modal={bannerWorkspace}
          aria-label={bannerWorkspace ? 'COMMUNE bulletin board' : activeProp?.label ?? (
            panel === 'treehole' ? 'Anonymous feedback treehole'
              : panel === 'loadout' ? 'My Loadout' : selected?.username ?? 'Agent details'
          )}
          className={cn(
            bannerWorkspace
              ? 'fixed inset-0 z-[60] h-[100dvh] w-screen overflow-hidden border-0 bg-[#dcc399] p-0 text-[#493927] shadow-none'
              : paperPanel
              ? 'absolute overflow-y-auto border-[3px] border-[#785a3c] bg-[#dcc399] p-3 text-[#493927] shadow-[5px_5px_0_rgba(36,28,19,0.48)]'
              : 'glass-panel absolute overflow-y-auto rounded-2xl border border-border/70 bg-card/95 p-4 shadow-2xl backdrop-blur-2xl',
            !bannerWorkspace && (touchControls
              ? cn(
                  panel === 'quiz' ? 'max-h-[min(90dvh,980px)]' : 'max-h-[min(82dvh,780px)]',
                  'w-auto'
                )
              : widePanel
                ? cn(
                    panel === 'quiz' ? 'max-h-[calc(100dvh-24px)]' : 'max-h-[min(78vh,780px)]',
                    'w-[min(720px,calc(100vw-24px))]'
                  )
                : 'max-h-[min(66vh,560px)] w-[min(390px,calc(100vw-24px))]'),
            panelPosition
          )}
          style={bannerWorkspace
            ? {
                paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
                paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
                paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
                paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
              }
            : touchControls
            ? {
                  bottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px), calc(var(--commune-dock-clearance, 0px) + 12px))',
                left: 'max(0.75rem, env(safe-area-inset-left, 0px))',
                right: 'max(0.75rem, env(safe-area-inset-right, 0px))',
              }
            : undefined}
        >
          <button
            type="button"
            onClick={() => setPanel(null)}
            className={cn(
              'absolute p-1.5 transition focus-visible:outline-none focus-visible:ring-2',
              bannerWorkspace
                ? 'right-5 top-5 z-10 border-2 border-[#8b6a44] bg-[#ead6ad] text-[#5c472e] shadow-[2px_2px_0_#6c5034] hover:bg-[#f8eccf] focus-visible:ring-[#7d6848]'
                : cn(
                    'right-2.5 top-2.5',
                    paperPanel
                      ? 'border-2 border-[#8b6a44] bg-[#ead6ad] text-[#5c472e] shadow-[2px_2px_0_#6c5034] hover:bg-[#f8eccf] focus-visible:ring-[#7d6848]'
                      : 'rounded-lg text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:ring-accent'
                  )
            )}
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
                {challengeNpcs.map((npc) => (
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
                      {npc.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span>
                      <span className="block text-xs font-bold text-foreground">{npc.name}</span>
                      <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                        {npc.modelNumber ? `${npc.modelNumber} · ${npc.issueType.replace('::', ' · ')}` : 'AI role-play · handle a tricky customer'}
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
            <div className={bannerWorkspace ? 'flex h-full min-h-0 flex-col p-4 sm:p-6' : 'mt-3'}>
              <div className="mb-3 flex shrink-0 items-center justify-between gap-3 border-2 border-[#785a3c] bg-[#735638] p-2.5 pr-12 text-[#f4e4c2] shadow-[3px_3px_0_rgba(51,39,25,0.55)]">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center border-2 border-[#8b6a44] bg-[#f0dfb9] text-[#694d32] shadow-[2px_2px_0_#443322]">
                    {boardTab === 'roster' ? <CalendarDays className="size-4" /> : <Megaphone className="size-4" />}
                  </span>
                  <div>
                    <p className="font-['Schoolbell'] text-[11px] font-bold uppercase tracking-[0.12em] text-[#ead6ad]">
                      {boardTab === 'roster' ? 'THE COMMONS' : 'TOWN HALL BULLETIN'}
                    </p>
                    <h3 className="font-['Schoolbell'] text-lg font-bold leading-tight text-[#fff4d9]">
                      {boardTab === 'roster' ? 'Agent Roster Board' : 'Town Hall News'}
                    </h3>
                  </div>
                </div>
                <div className="flex border-2 border-[#785a3c] bg-[#d4b98a] p-0.5 shadow-[2px_2px_0_#443322]">
                  {([
                    ['roster', 'Shifts'],
                    ['announcements', 'News'],
                  ] as const).map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setBoardTab(tab)}
                      className={cn(
                        'px-2.5 py-1.5 font-["Schoolbell"] text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7d6848]',
                        tab === boardTab
                          ? 'bg-[#735638] text-[#f8eccf] shadow-[2px_2px_0_#443322]'
                          : 'text-[#715536] hover:bg-[#ead6ad]'
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
                    <div className="flex items-center gap-3 border-2 border-[#8b6a44] bg-[#f0dfb9] px-3 py-2.5 shadow-[2px_2px_0_rgba(51,39,25,0.35)]">
                      <span className="grid size-9 place-items-center border-2 border-[#5b6139] bg-[#788c5d] text-[#fff4d9]"><Users className="size-4" /></span>
                      <span>
                        <span className="block font-['Schoolbell'] text-xl font-bold leading-none text-[#493927]">{rosterOnDuty.length}</span>
                        <span className="mt-1 block font-['Schoolbell'] text-[11px] font-bold uppercase tracking-wide text-[#715b3e]">scheduled on this shift</span>
                      </span>
                      <span className="ml-auto text-right font-['Schoolbell'] text-[11px] text-[#715b3e]">
                        {rosterLoading ? 'Syncing shared board…' : 'Snapshot + live updates'}
                      </span>
                    </div>
                    <label className="flex items-center gap-2 border-2 border-[#8b6a44] bg-[#ead6ad] px-3 shadow-[2px_2px_0_rgba(51,39,25,0.28)]">
                      <CalendarDays className="size-3.5 text-[#788c5d]" />
                      <span className="sr-only">Roster month</span>
                      <select
                        value={rosterMonth}
                        onChange={(event) => {
                          const nextMonth = event.target.value;
                          setRosterMonth(nextMonth);
                          setRosterDate(`${nextMonth}-01`);
                        }}
                        className="h-10 bg-transparent font-['Schoolbell'] text-sm text-[#493927] outline-none"
                      >
                        {ROSTER_MONTHS.map((month) => (
                          <option key={month} value={month} className="bg-[#fff4d9] text-[#493927]">
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
                            'min-w-12 border-2 px-2 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7d6848]',
                            selectedDay
                              ? 'border-[#5b6139] bg-[#788c5d] text-[#fff4d9] shadow-[2px_2px_0_#433d28]'
                              : 'border-[#a88a5f] bg-[#f0dfb9] text-[#715b3e] hover:bg-[#f8eccf]'
                          )}
                        >
                          <span className="block font-['Schoolbell'] text-[10px] font-bold uppercase">{date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                          <span className="mt-0.5 block font-['Schoolbell'] text-sm font-bold">{date.getDate()}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <label className="flex h-9 min-w-[180px] flex-1 items-center gap-2 border-2 border-[#a88a5f] bg-[#fff4d9] px-2.5">
                      <Search className="size-3.5 text-[#788c5d]" />
                      <input
                        value={rosterQuery}
                        onChange={(event) => setRosterQuery(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                        placeholder="Find an agent…"
                        aria-label="Find an agent on the roster"
                        className="min-w-0 flex-1 bg-transparent font-['Schoolbell'] text-sm text-[#493927] outline-none placeholder:text-[#9a805b]"
                      />
                    </label>
                    <select
                      value={rosterSkill}
                      onChange={(event) => setRosterSkill(event.target.value)}
                      aria-label="Filter roster by team"
                      className="h-9 border-2 border-[#a88a5f] bg-[#fff4d9] px-2.5 font-['Schoolbell'] text-sm text-[#493927] outline-none focus-visible:ring-2 focus-visible:ring-[#7d6848]"
                    >
                      <option value="all" className="bg-[#fff4d9] text-[#493927]">All teams</option>
                      {rosterSkillOptions.map((skill) => <option key={skill} value={skill} className="bg-[#fff4d9] text-[#493927]">{skill}</option>)}
                    </select>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-b border-[#a88a5f] px-1 pb-1 font-['Schoolbell'] text-xs text-[#715b3e]">
                    <span>{new Date(`${rosterDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                    <span>{rosterLoading ? 'Checking live schedule' : 'Read-only · shared schedule'}</span>
                  </div>
                  <div className="mt-2 max-h-56 overflow-y-auto border-2 border-[#8b6a44] bg-[#f0dfb9] shadow-[3px_3px_0_rgba(51,39,25,0.35)]">
                    {visibleRoster.length === 0 ? (
                      <p className="p-5 text-center font-['Schoolbell'] text-sm text-[#715b3e]">
                        {rosterAgents.length ? 'No agents match those filters.' : 'No roster snapshot is available for this month.'}
                      </p>
                    ) : visibleRoster.map((agent) => {
                      const code = rosterShiftOf(agent, rosterDate);
                      const off = isRosterOffDay(code);
                      return (
                        <div key={`${agent.no}-${agent.en}`} className="flex items-center gap-3 border-b border-[#c5ab7d] px-3 py-2 last:border-0 even:bg-[#ead6ad]/70">
                          <span className={cn('size-2 shrink-0 border border-[#493927]/30', off ? 'bg-[#c5ab7d]' : 'bg-[#788c5d]')} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-['Schoolbell'] text-sm font-bold text-[#493927]">{agent.en}</span>
                            <span className="block font-['Schoolbell'] text-[11px] text-[#715b3e]">{agent.skill}</span>
                          </span>
                          <span className={cn(
                            'min-w-14 border-2 px-2 py-1 text-center font-["Schoolbell"] text-xs font-bold',
                            off ? 'border-[#a88a5f] bg-[#ead6ad] text-[#715b3e]' : 'border-[#587044] bg-[#788c5d] text-[#fff4d9] shadow-[2px_2px_0_#5b6139]'
                          )}>
                            {code || '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : (
                <section
                  aria-label="Town Hall News"
                  className={cn('space-y-3', bannerWorkspace && 'flex min-h-0 flex-1 flex-col')}
                >
                  <div className="shrink-0 border-2 border-[#785a3c] bg-[#735638] px-3 py-2 text-[#f4e4c2] shadow-[3px_3px_0_rgba(51,39,25,0.7)]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-['Schoolbell'] text-xs font-bold uppercase tracking-[0.12em]">
                        TOWN HALL / MIXED-MEDIA BOARD
                      </p>
                      <span className="shrink-0 border border-[#dfc38f]/50 bg-[#59432f] px-1.5 py-0.5 font-['Schoolbell'] text-xs font-bold">
                        {banners.length}/6
                      </span>
                    </div>
                  </div>
                  <p className="shrink-0 font-['Schoolbell'] text-sm leading-relaxed text-[#715b3e]">
                    Mix pinned notes, priority alerts, and quick whiteboard sketches for the whole square.
                  </p>
                  <div className={cn(
                    'max-h-64 space-y-2 overflow-y-auto pr-1',
                    bannerWorkspace && 'grid max-h-none min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]'
                  )}>
                    <div className={cn('space-y-2', bannerWorkspace && 'min-h-0 overflow-y-auto pr-1')}>
                    {banners.length === 0 && (
                      <p className="border-2 border-dashed border-[#96774f] bg-[#e8d3a9] p-5 text-center font-['Schoolbell'] text-sm text-[#6f5537] shadow-[3px_3px_0_rgba(51,39,25,0.25)]">
                        The board is clear. Pin a note, flag a priority, or sketch an idea.
                      </p>
                    )}
                    {banners.map((banner) => {
                      const editing = editingBannerId === banner.id;
                      const confirmingDelete = bannerDeleteId === banner.id;
                      const kind = editing ? bannerEditKind : banner.kind ?? 'pin';
                      const priority = editing ? bannerEditPriority : banner.priority ?? 'normal';
                      const paperColor = kind === 'priority'
                        ? priority === 'urgent' ? '#f2c8b9' : priority === 'high' ? '#f1ddb0' : '#f0dfb9'
                        : kind === 'sketch' ? '#e4ead8' : '#f0dfb9';
                      return (
                        <article
                          key={banner.id}
                          className={cn(
                            'relative border-2 border-[#8b6a44] bg-[#f0dfb9] px-3 py-2.5 text-[#3c3021] shadow-[3px_3px_0_rgba(51,39,25,0.45)]',
                            editing && bannerWorkspace && 'max-h-full overflow-y-auto'
                          )}
                          style={{
                            borderLeftWidth: 5,
                            borderLeftColor: kind === 'priority'
                              ? priority === 'urgent' ? '#ae5141' : priority === 'high' ? '#b07831' : '#8b6a44'
                              : kind === 'sketch' ? '#788c5d' : `hsl(${banner.hue} 42% 43%)`,
                            backgroundColor: paperColor,
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className="absolute left-2 top-2 size-2 border border-[#784438] bg-[#bc6850]"
                            style={{
                              backgroundColor: kind === 'priority'
                                ? priority === 'urgent' ? '#ae5141' : priority === 'high' ? '#d6a646' : '#8b6a44'
                                : kind === 'sketch' ? '#788c5d' : `hsl(${banner.hue} 55% 43%)`,
                            }}
                          />
                          <div className="flex flex-wrap items-start gap-2 pl-3">
                            <div className="min-w-0 flex-1">
                              {editing ? (
                                <BoardNoteEditor
                                  text={bannerEditDraft}
                                  onTextChange={setBannerEditDraft}
                                  kind={bannerEditKind}
                                  onKindChange={setBannerEditKind}
                                  priority={bannerEditPriority}
                                  onPriorityChange={setBannerEditPriority}
                                  strokes={bannerEditStrokes}
                                  onStrokesChange={setBannerEditStrokes}
                                  label="EDIT BOARD ITEM"
                                  large={bannerWorkspace}
                                />
                              ) : (
                                <>
                                  <div className="mb-1 flex flex-wrap gap-1.5">
                                    <span className="border border-[#8b6a44]/60 bg-[#fff4d9]/60 px-1.5 py-0.5 font-['Schoolbell'] text-[10px] font-bold uppercase tracking-wider text-[#705335]">
                                      {kind === 'priority' ? 'PRIORITY' : kind === 'sketch' ? 'SKETCH' : 'PIN'}
                                    </span>
                                    {kind === 'priority' && (
                                      <span className={cn(
                                        'border px-1.5 py-0.5 font-["Schoolbell"] text-[10px] font-bold uppercase tracking-wider',
                                        priority === 'urgent'
                                          ? 'border-[#9c4538] bg-[#ae5b48] text-[#fff4d9]'
                                          : priority === 'high'
                                            ? 'border-[#9a6a2e] bg-[#d6a646] text-[#3c3021]'
                                            : 'border-[#8b6a44] bg-[#ead6ad] text-[#5c472e]'
                                      )}>
                                        {priority}
                                      </span>
                                    )}
                                  </div>
                                  {kind === 'sketch' && banner.strokes.length > 0 && (
                                    <CommuneBoardSketchPreview
                                      strokes={banner.strokes}
                                      className="mb-2 block h-20 w-full border-2 border-[#8b6a44]"
                                    />
                                  )}
                                  <div className="prose prose-sm max-w-none break-words font-['Schoolbell'] text-sm leading-relaxed text-[#3c3021] prose-headings:my-1 prose-headings:font-['Schoolbell'] prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-a:text-[#5c6f43] prose-strong:text-[#3c3021]">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{banner.text}</ReactMarkdown>
                                  </div>
                                </>
                              )}
                              <p className="mt-1.5 font-['Schoolbell'] text-[11px] text-[#715b3e]">
                                PINNED BY {banner.author.toUpperCase()} · {new Date(banner.at).toLocaleString()}
                              </p>
                            </div>
                            {isAdmin && (
                              <div className="flex shrink-0 gap-1">
                                {editing ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => void saveBannerEdit(banner.id)}
                                      disabled={
                                        !bannerEditDraft.trim()
                                        || bannerUpdating
                                        || (bannerEditKind === 'sketch' && !bannerEditStrokes.length)
                                      }
                                      className="border-2 border-[#5b6139] bg-[#788c5d] px-2 py-1 font-['Schoolbell'] text-xs font-bold text-[#fff4d9] shadow-[2px_2px_0_#433d28] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7d6848]"
                                    >
                                      {bannerUpdating ? 'Saving…' : 'Save'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingBannerId(null);
                                        setBannerEditDraft('');
                                        setBannerEditKind('pin');
                                        setBannerEditPriority('normal');
                                        setBannerEditStrokes([]);
                                      }}
                                      disabled={bannerUpdating}
                                      className="border-2 border-[#8b6a44] bg-[#ead6ad] px-2 py-1 font-['Schoolbell'] text-xs font-bold text-[#5c472e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7d6848]"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBannerDeleteId(null);
                                        setEditingBannerId(banner.id);
                                        setBannerEditDraft(banner.text);
                                        setBannerEditKind(banner.kind);
                                        setBannerEditPriority(banner.priority);
                                        setBannerEditStrokes(banner.strokes);
                                      }}
                                      className="border-2 border-[#92734c] bg-[#ead6ad] px-2 py-1 font-['Schoolbell'] text-xs font-bold text-[#5c472e] shadow-[2px_2px_0_#92734c] hover:bg-[#f8eccf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7d6848]"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setBannerDeleteId(banner.id)}
                                      className="border-2 border-[#9b6250] bg-[#efd0b7] px-2 py-1 font-['Schoolbell'] text-xs font-bold text-[#714536] shadow-[2px_2px_0_#9b6250] hover:bg-[#f7dfc9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7d6848]"
                                    >
                                      Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          {isAdmin && confirmingDelete && (
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#bca27a] pt-2">
                              <span className="font-['Schoolbell'] text-xs font-bold text-[#715335]">Pull this notice down?</span>
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setBannerDeleteId(null)}
                                  disabled={bannerDeleting}
                                  className="border-2 border-[#92734c] bg-[#ead6ad] px-2 py-1 font-['Schoolbell'] text-xs font-bold text-[#5c472e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7d6848]"
                                >
                                  Keep
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void removeBanner(banner.id)}
                                  disabled={bannerDeleting}
                                  className="border-2 border-[#8a493c] bg-[#ae5b48] px-2 py-1 font-['Schoolbell'] text-xs font-bold text-[#fff4d9] shadow-[2px_2px_0_#56372c] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7d6848]"
                                >
                                  {bannerDeleting ? 'Removing…' : 'Remove'}
                                </button>
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                    </div>
                  {!editingBannerId && (
                    <div className={cn(
                      'border-2 border-[#876641] bg-[#dcc399] p-3 shadow-[3px_3px_0_rgba(51,39,25,0.4)]',
                      bannerWorkspace && 'min-h-0 overflow-y-auto'
                    )}>
                      <BoardNoteEditor
                        text={bannerDraft}
                        onTextChange={setBannerDraft}
                        kind={bannerKind}
                        onKindChange={setBannerKind}
                        priority={bannerPriority}
                        onPriorityChange={setBannerPriority}
                        strokes={bannerStrokes}
                        onStrokesChange={setBannerStrokes}
                        label="NEW BOARD ITEM"
                        large={bannerWorkspace}
                      />
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="font-['Schoolbell'] text-xs text-[#785e3e]">
                          {bannerDraft.length}/2000 · {bannerKind === 'sketch' ? `${bannerStrokes.length}/20 strokes` : bannerKind === 'priority' ? `${bannerPriority} priority` : 'pinned note'}
                        </span>
                        <button
                          type="button"
                          onClick={hangBanner}
                          disabled={
                            !bannerDraft.trim()
                            || bannerSending
                            || (bannerKind === 'sketch' && !bannerStrokes.length)
                          }
                          className="border-2 border-[#4f5a37] bg-[#788c5d] px-3 py-1.5 font-['Schoolbell'] text-sm font-bold text-[#fff4d9] shadow-[3px_3px_0_#433d28] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7d6848] disabled:opacity-50"
                        >
                          {bannerSending ? 'Pinning…' : bannerKind === 'sketch' ? 'Pin sketch' : bannerKind === 'priority' ? 'Post priority' : 'Pin note'}
                        </button>
                      </div>
                    </div>
                  )}
                  </div>
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
            <div className="space-y-2">
              <div className="border-2 border-[#785a3c] bg-[#735638] px-3 py-2 pr-8 text-[#fff4d9] shadow-[3px_3px_0_rgba(51,39,25,0.5)]">
                <h3 className="flex items-center gap-2 font-['Schoolbell'] text-lg font-bold">
                  {selected.isSuperAdmin ? (
                    <span className="border border-[#b78a36] bg-[#f0d17c] px-1.5 py-0.5 font-mono text-[9px] font-extrabold tracking-wide text-[#493719]">
                      DEV
                    </span>
                  ) : selected.isAdmin && !selected.isManagement ? (
                    <span className="text-[#f0d17c]">★</span>
                  ) : null}
                  {selected.username}
                </h3>
              </div>
              <p className="inline-block border border-[#a88a5f] bg-[#ead6ad] px-2 py-1 font-['Schoolbell'] text-xs text-[#715b3e]">
                {selected.isAfk ? 'AFK' : selected.status || 'hanging out'} · seen {
                  Math.max(1, Math.round((
                    presenceNow -
                    (lastPresenceReceivedAtRef.current.get(selected.username) ?? (presenceNow - selected.seenAgo))
                  ) / 1000))
                }s ago
              </p>
              <button
                type="button"
                onClick={() => startDirectMessage(selected.username)}
                className="flex w-full items-center justify-center gap-2 border-2 border-[#5b6139] bg-[#788c5d] px-3 py-2 font-['Schoolbell'] text-sm font-bold text-[#fff4d9] shadow-[3px_3px_0_#433d28] transition hover:-translate-y-0.5 hover:bg-[#697b50] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7d6848]"
              >
                <MessageSquare className="size-3.5" /> Message {selected.username}
              </button>
              {selected.loadout?.phrase && (
                <blockquote className="border-l-4 border-[#788c5d] bg-[#f0dfb9] px-3 py-2 font-['Schoolbell'] text-sm italic text-[#493927] shadow-[2px_2px_0_rgba(51,39,25,0.22)]">
                  “{selected.loadout.phrase}”
                </blockquote>
              )}
              {selected.loadout && selected.loadout.cards.length > 0 && (
                <>
                  <p className="mb-1 font-['Schoolbell'] text-sm font-bold text-[#715b3e]">Collection cards</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {selected.loadout.cards.map((id) => {
                      const card = cardIndex?.get(id);
                      return card ? (
                        <div
                          key={id}
                          className={cn('relative aspect-[5/7] overflow-hidden border-2 bg-[#ead6ad]', rarityStyle(card.rarity).border)}
                          title={`${card.name} — ${card.rarity}`}
                        >
                          <img src={card.image} alt={card.name} className="size-full object-cover" />
                          <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1 text-[8px] font-bold text-white">
                            {card.rarity}
                          </span>
                        </div>
                      ) : (
                        <div key={id} className="flex aspect-[5/7] items-center justify-center border-2 border-dashed border-[#a88a5f] bg-[#ead6ad] font-['Schoolbell'] text-sm text-[#9a805b]">
                          ???
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {selected.loadout?.pet && (
                <>
                  <p className="mb-1 font-['Schoolbell'] text-sm font-bold text-[#715b3e]">Pet companion</p>
                  <div className="border-2 border-[#8b6a44] bg-[#f0dfb9] px-3 py-2 shadow-[2px_2px_0_rgba(51,39,25,0.3)]">
                    <p className="font-['Schoolbell'] text-sm font-bold text-[#493927]">
                      {selected.loadout.pet.name} <span className="font-normal text-[#715b3e]">· {selected.loadout.pet.stage}</span>
                    </p>
                    <div className="mt-2 flex gap-1" aria-label={`Mood ${Math.round(selected.loadout.pet.mood)} out of 100`}>
                      {Array.from({ length: 5 }, (_, index) => (
                        <span
                          key={index}
                          className={cn(
                            'h-2 flex-1 border border-[#8b6a44]',
                            selected.loadout!.pet!.mood >= (index + 1) * 20 ? 'bg-[#788c5d]' : 'bg-[#d6c199]'
                          )}
                        />
                      ))}
                    </div>
                    <p className="mt-1 font-['Schoolbell'] text-xs text-[#715b3e]">
                      Mood {Math.round(selected.loadout.pet.mood)}/100 · Bond XP {selected.loadout.pet.xp}
                    </p>
                  </div>
                </>
              )}
              {!selected.loadout?.phrase && !selected.loadout?.cards.length && !selected.loadout?.pet && (
                <p className="border-2 border-dashed border-[#a88a5f] bg-[#f0dfb9] p-3 text-center font-['Schoolbell'] text-sm text-[#715b3e]">
                  {selected.username} hasn't set up a loadout yet.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* The ticker is session-dismissible; shared posts remain pinned to the board. */}
      {latestBanner && !bannerTickerDismissed && (
        <div className="absolute left-1/2 top-4 z-20 flex w-[min(680px,calc(100%-24px))] -translate-x-1/2 items-stretch overflow-hidden border-2 border-[#725338] bg-[#f0dfb8] shadow-[4px_4px_0_rgba(36,28,19,0.38)] md:w-[min(680px,calc(100%-200px))]">
          <button
            type="button"
            onClick={() => {
              setBoardTab('announcements');
              setPanel('banners');
            }}
            aria-label="Expand latest town notice and open the bulletin board"
            className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-[#f8eccf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7d6848]"
          >
            <span className="shrink-0 border-2 border-[#5d432d] bg-[#735638] px-1.5 py-0.5 font-['Schoolbell'] text-[10px] font-bold uppercase tracking-wider text-[#f6e7c8]">
              {latestBanner.kind === 'priority'
                ? `${latestBanner.priority} priority`
                : latestBanner.kind === 'sketch' ? 'Sketch' : 'Notice'}
            </span>
            <span className="min-w-0 flex-1 truncate font-['Schoolbell'] text-sm font-bold text-[#493923]">
              {bannerPlainText(latestBanner.text)}
            </span>
            <span className="hidden shrink-0 font-['Schoolbell'] text-xs font-bold text-[#715536] sm:block">
              Expand
            </span>
          </button>
          <button
            type="button"
            onClick={() => setBannerTickerDismissed(true)}
            aria-label="Dismiss notice until next session"
            title="Dismiss until next session"
            className="grid w-10 shrink-0 place-items-center border-l-2 border-[#725338] bg-[#ead6ad] text-[#5c472e] transition-colors hover:bg-[#efd0b7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7d6848]"
          >
            <X className="size-4" />
          </button>
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
    const bounds = carHalfExtents(car.heading, car.halfWidth, car.halfLength);
    return x > car.x - bounds.x - radius && x < car.x + bounds.x + radius
      && y > car.y - bounds.y - radius && y < car.y + bounds.y + radius;
  })) return false;
  if (BUILT_OBJECTS.some((item) => {
    if (item.kind === 'sports-car') return false;
    const bounds = buildHalfExtents(item.kind, item.rotation);
    return x > item.x - bounds.x - radius && x < item.x + bounds.x + radius
      && y > item.y - bounds.y - radius && y < item.y + bounds.y + radius;
  })) return false;

  return !SOLID_RECTS.some(
    (s) =>
      x > s.x - radius &&
      x < s.x + s.w + radius &&
      y > s.y - radius &&
      y < s.y + s.h + radius
  );
}

function chooseSerendipitySpot(
  originX: number,
  originY: number,
  challengeNpcs: readonly { x: number; y: number }[] = CHALLENGE_NPCS,
): [number, number] {
  for (let attempt = 0; attempt < 24; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 120 + Math.random() * 190;
    const x = Math.round((originX + Math.cos(angle) * distance) / 4) * 4;
    const y = Math.round((originY + Math.sin(angle) * distance) / 4) * 4;
    const nearChallenge = challengeNpcs.some((npc) => Math.hypot(x - npc.x, y - npc.y) < 130);
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
        facingX: 1,
        facingY: 0,
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
      const movedDistance = Math.hypot(movedX, movedY);
      follower.facingX = movedX / movedDistance;
      follower.facingY = movedY / movedDistance;
      follower.facingLeft = follower.facingX < 0;
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
      headingX: follower.facingX,
      headingY: follower.facingY,
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

interface MowerPathNode {
  id: number;
  col: number;
  row: number;
  cost: number;
  score: number;
}

function pushMowerHeap(heap: MowerPathNode[], node: MowerPathNode): void {
  let index = heap.length;
  heap.push(node);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].score <= node.score) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = node;
}

function popMowerHeap(heap: MowerPathNode[]): MowerPathNode | undefined {
  const first = heap[0];
  const last = heap.pop();
  if (!first || !last || heap.length === 0) return first;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;
    const child = right < heap.length && heap[right].score < heap[left].score ? right : left;
    if (heap[child].score >= last.score) break;
    heap[index] = heap[child];
    index = child;
  }
  heap[index] = last;
  return first;
}

function nearestMowerCell(point: { x: number; y: number }, cols: number, rows: number) {
  const centerCol = Math.max(0, Math.min(cols - 1, Math.round((point.x - MOWER_NAV_GRID / 2) / MOWER_NAV_GRID)));
  const centerRow = Math.max(0, Math.min(rows - 1, Math.round((point.y - MOWER_NAV_GRID / 2) / MOWER_NAV_GRID)));
  for (let radius = 0; radius <= 6; radius++) {
    for (let row = centerRow - radius; row <= centerRow + radius; row++) {
      for (let col = centerCol - radius; col <= centerCol + radius; col++) {
        if (
          col < 0 || col >= cols || row < 0 || row >= rows ||
          Math.max(Math.abs(col - centerCol), Math.abs(row - centerRow)) !== radius
        ) continue;
        const x = col * MOWER_NAV_GRID + MOWER_NAV_GRID / 2;
        const y = row * MOWER_NAV_GRID + MOWER_NAV_GRID / 2;
        if (canOccupy(x, y, 15)) return { col, row, x, y };
      }
    }
  }
  return null;
}

function findMowerPath(start: { x: number; y: number }, goal: { x: number; y: number }) {
  const cols = Math.ceil(WORLD_W / MOWER_NAV_GRID);
  const rows = Math.ceil(WORLD_H / MOWER_NAV_GRID);
  const startCell = nearestMowerCell(start, cols, rows);
  const goalCell = nearestMowerCell(goal, cols, rows);
  if (!startCell || !goalCell) return [];
  const startId = startCell.row * cols + startCell.col;
  const goalId = goalCell.row * cols + goalCell.col;
  if (startId === goalId) return [{ x: goalCell.x, y: goalCell.y }];

  const total = cols * rows;
  const costs = new Float32Array(total);
  costs.fill(Infinity);
  const parents = new Int32Array(total);
  parents.fill(-1);
  const closed = new Uint8Array(total);
  const open: MowerPathNode[] = [];
  const heuristic = (col: number, row: number) => Math.hypot(goalCell.col - col, goalCell.row - row);
  costs[startId] = 0;
  pushMowerHeap(open, { id: startId, col: startCell.col, row: startCell.row, cost: 0, score: heuristic(startCell.col, startCell.row) });

  const directions: [number, number, number][] = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ];
  let visits = 0;
  while (open.length && visits++ < 2400) {
    const current = popMowerHeap(open);
    if (!current || closed[current.id]) continue;
    if (current.id === goalId) {
      const ids = [goalId];
      let cursor = goalId;
      while (cursor !== startId) {
        cursor = parents[cursor];
        if (cursor < 0) return [];
        ids.push(cursor);
      }
      ids.reverse();
      return ids.slice(1).map((id) => ({
        x: (id % cols) * MOWER_NAV_GRID + MOWER_NAV_GRID / 2,
        y: Math.floor(id / cols) * MOWER_NAV_GRID + MOWER_NAV_GRID / 2,
      }));
    }
    closed[current.id] = 1;

    for (const [dc, dr, distanceCost] of directions) {
      const col = current.col + dc;
      const row = current.row + dr;
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
      const x = col * MOWER_NAV_GRID + MOWER_NAV_GRID / 2;
      const y = row * MOWER_NAV_GRID + MOWER_NAV_GRID / 2;
      if (!canOccupy(x, y, 15)) continue;
      if (dc && dr) {
        const sideX = current.col * MOWER_NAV_GRID + MOWER_NAV_GRID / 2 + dc * MOWER_NAV_GRID;
        const sideY = current.row * MOWER_NAV_GRID + MOWER_NAV_GRID / 2 + dr * MOWER_NAV_GRID;
        if (!canOccupy(sideX, current.row * MOWER_NAV_GRID + MOWER_NAV_GRID / 2, 15)
          || !canOccupy(current.col * MOWER_NAV_GRID + MOWER_NAV_GRID / 2, sideY, 15)) continue;
      }
      const id = row * cols + col;
      if (closed[id]) continue;
      const cost = current.cost + distanceCost;
      if (cost >= costs[id]) continue;
      costs[id] = cost;
      parents[id] = current.id;
      pushMowerHeap(open, { id, col, row, cost, score: cost + heuristic(col, row) });
    }
  }
  return [];
}

function nextMowerRowGoal(mower: TRexState): { x: number; y: number } {
  let lawn = T_REX_LAWNS[mower.lawnIndex];
  const rows = Math.floor((lawn.bottom - lawn.top - 32) / MOWER_ROW_SPACING) + 1;
  if (mower.rowIndex >= rows) {
    mower.lawnIndex = (mower.lawnIndex + 1) % T_REX_LAWNS.length;
    mower.rowIndex = 0;
    mower.rowPass = 0;
    mower.rowDirection = 1;
    lawn = T_REX_LAWNS[mower.lawnIndex];
  }
  const y = lawn.top + 18 + mower.rowIndex * MOWER_ROW_SPACING;
  const startsLeft = mower.rowDirection > 0;
  const x = mower.rowPass === 0
    ? startsLeft ? lawn.left + 18 : lawn.right - 18
    : startsLeft ? lawn.right - 18 : lawn.left + 18;
  if (mower.rowPass === 0) {
    mower.rowPass = 1;
  } else {
    mower.rowPass = 0;
    mower.rowIndex++;
    mower.rowDirection = mower.rowDirection === 1 ? -1 : 1;
  }
  return { x, y };
}

function assignMowerPath(mower: TRexState, goal: { x: number; y: number }): boolean {
  const path = findMowerPath(mower, goal);
  if (!path.length && Math.hypot(goal.x - mower.x, goal.y - mower.y) > MOWER_NAV_GRID) return false;
  mower.goalX = goal.x;
  mower.goalY = goal.y;
  mower.path = path;
  mower.pathIndex = 0;
  return true;
}

function planNextMowerRow(mower: TRexState): boolean {
  for (let attempt = 0; attempt < 8; attempt++) {
    const goal = nextMowerRowGoal(mower);
    if (assignMowerPath(mower, goal)) return true;
  }
  return false;
}

function startMowerZoomies(
  mower: TRexState,
  threat: { x: number; y: number },
  now: number,
): void {
  let angle = Math.atan2(mower.y - threat.y, mower.x - threat.x);
  if (!Number.isFinite(angle)) angle = Math.random() * Math.PI * 2;
  mower.mode = 'zoomies';
  mower.modeStartedAt = now;
  mower.modeUntil = now + 1900 + Math.random() * 800;
  mower.panicCooldownUntil = now + 7000;
  mower.lastTrackX = mower.x;
  mower.lastTrackY = mower.y;
  mower.trackDistance = 0;
  mower.says = {
    text: ['NOPE NOPE NOPE!', 'T-rex has detected a large mammal!', 'Retreating to a safer lawn!', 'This mower has places to be!'][Math.floor(Math.random() * 4)],
    until: now + 2600,
  };
  for (const turn of [0, 0.45, -0.45, 0.9, -0.9, Math.PI]) {
    const fleeAngle = angle + turn;
    const goal = {
      x: Math.max(70, Math.min(WORLD_W - 70, mower.x + Math.cos(fleeAngle) * 340)),
      y: Math.max(170, Math.min(WORLD_H - 70, mower.y + Math.sin(fleeAngle) * 340)),
    };
    if (assignMowerPath(mower, goal)) return;
  }
  mower.path = [];
  mower.pathIndex = 0;
}

function followMowerPath(
  mower: TRexState,
  speed: number,
  dt: number,
  now: number,
  tracks: MowerTrack[],
  leaveTrack: boolean,
): void {
  let waypoint = mower.path[mower.pathIndex];
  if (!waypoint) {
    if (mower.mode !== 'mowing' || !planNextMowerRow(mower)) return;
    waypoint = mower.path[mower.pathIndex];
    if (!waypoint) return;
  }
  const dx = waypoint.x - mower.x;
  const dy = waypoint.y - mower.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 7) {
    mower.pathIndex++;
    if (mower.pathIndex >= mower.path.length && mower.mode === 'mowing') planNextMowerRow(mower);
    return;
  }

  const heading = Math.atan2(dy, dx);
  const headingDelta = Math.atan2(Math.sin(heading - mower.heading), Math.cos(heading - mower.heading));
  mower.heading += headingDelta * Math.min(1, dt * (mower.mode === 'zoomies' ? 8 : 3.2));
  const travel = Math.min(distance, speed * dt);
  const oldX = mower.x;
  const oldY = mower.y;
  const nextX = mower.x + (dx / distance) * travel;
  const nextY = mower.y + (dy / distance) * travel;
  if (canOccupy(nextX, nextY, 15)) {
    mower.x = nextX;
    mower.y = nextY;
  } else {
    mower.path = findMowerPath(mower, { x: mower.goalX, y: mower.goalY });
    mower.pathIndex = 0;
    if (!mower.path.length && mower.mode === 'mowing') planNextMowerRow(mower);
    return;
  }
  if (!leaveTrack) return;
  mower.trackDistance += Math.hypot(mower.x - oldX, mower.y - oldY);
  if (mower.trackDistance >= MOWER_TRACK_SPACING) {
    tracks.push({ fromX: mower.lastTrackX, fromY: mower.lastTrackY, x: mower.x, y: mower.y, at: now });
    mower.lastTrackX = mower.x;
    mower.lastTrackY = mower.y;
    mower.trackDistance = 0;
    if (tracks.length > 420) tracks.splice(0, tracks.length - 420);
  }
}

function updateTRex(
  mower: TRexState,
  player: Agent,
  remotes: Iterable<{ rx: number; ry: number; agent: { carId?: string | null; hangoutId?: string | null } }>,
  dt: number,
  now: number,
  tracks: MowerTrack[],
): void {
  if (mower.says && mower.says.until <= now) mower.says = null;
  let nearestThreat: { x: number; y: number } | null = null;
  let nearestDistance = Math.hypot(player.x - mower.x, player.y - mower.y);
  if (nearestDistance < 150) nearestThreat = player;
  for (const remote of remotes) {
    if (remote.agent.carId || remote.agent.hangoutId) continue;
    const distance = Math.hypot(remote.rx - mower.x, remote.ry - mower.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestThreat = { x: remote.rx, y: remote.ry };
    }
  }
  if (nearestThreat && nearestDistance < 145 && now >= mower.panicCooldownUntil && mower.mode !== 'zoomies') {
    startMowerZoomies(mower, nearestThreat, now);
  }

  if (mower.mode !== 'mowing' && now >= mower.modeUntil) {
    mower.mode = 'mowing';
    mower.modeUntil = 0;
    mower.path = [];
    mower.pathIndex = 0;
    mower.lastTrackX = mower.x;
    mower.lastTrackY = mower.y;
    mower.trackDistance = 0;
    mower.nextMoodAt = now + 17_000 + Math.random() * 24_000;
  }
  if (mower.mode === 'zoomies') {
    followMowerPath(mower, 285, dt, now, tracks, false);
    return;
  }
  if (mower.mode === 'confused') {
    mower.heading += dt * 0.48;
    return;
  }
  if (mower.mode === 'napping') return;
  if (mower.mode === 'reverse') {
    const distance = 30 * dt;
    const nextX = mower.x - Math.cos(mower.heading) * distance;
    const nextY = mower.y - Math.sin(mower.heading) * distance;
    if (canOccupy(nextX, nextY, 15)) {
      mower.x = nextX;
      mower.y = nextY;
    } else {
      mower.heading += dt * 1.1;
    }
    return;
  }

  if (now >= mower.nextMoodAt) {
    const mood = Math.random();
    mower.mode = mood < 0.48 ? 'confused' : mood < 0.72 ? 'napping' : 'reverse';
    mower.modeStartedAt = now;
    mower.modeUntil = now + (mower.mode === 'confused' ? 6200 : mower.mode === 'napping' ? 3900 : 1800);
    mower.says = {
      text: mower.mode === 'confused'
        ? ['Which way is north? I am a mower.', 'I have mowed this exact pixel before.', 'Grass detected. Grass... still detected.'][Math.floor(Math.random() * 3)]
        : mower.mode === 'napping'
          ? 'Zzz... dreaming of an uncut hedge.'
          : 'Reverse mowing! For science!',
      until: mower.modeUntil,
    };
    return;
  }

  if (!mower.path[mower.pathIndex]) planNextMowerRow(mower);
  followMowerPath(mower, 46, dt, now, tracks, true);
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
  incident: DuckIncident | null = null,
  soccerBall: CommuneSoccerBall = INITIAL_SOCCER_BALL,
  golfBall: PhysicsBallMotion,
  bowlingBall: PhysicsBallMotion,
  bowlingPinsDown: readonly number[],
  mower: TRexState,
  mowerTracks: readonly MowerTrack[],
  bowlingPinsKnockedAt = 0,
  buildables: readonly CommuneBuildable[] = [],
  buildPreview: { kind: CommuneBuildKind; x: number; y: number; rotation: number; valid: boolean } | null = null,
  hoveredBuildId: string | null = null,
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

  const left = cam.x - 220;
  const top = cam.y - 220;
  const right = cam.x + vw + 220;
  const bottom = cam.y + vh + 220;
  const isVisible = (x: number, y: number, radiusX = 72, radiusY = 120) =>
    x + radiusX >= left && x - radiusX <= right && y + radiusY >= top && y - radiusY <= bottom;

  /* y-sorted drawables */
  type D = { y: number; fn: () => void; bright?: boolean };
  const items: D[] = [];
  for (const [tx, ty] of TREES) {
    if (isVisible(tx, ty, 72, 180)) items.push({ y: ty, fn: () => drawPixelTree(ctx, tx, ty) });
  }
  for (const car of PARKED_CARS) {
    if (!isVisible(car.x, car.y, 64, 90)) continue;
    const buildable = car.buildId ? buildables.find((item) => item.id === car.buildId) ?? null : null;
    const occupants = [
      ...(player.carId === car.id ? [player.name] : []),
      ...remotes.filter((remote) => remote.carId === car.id).map((remote) => remote.name),
    ].slice(0, 2);
    items.push({
      y: car.y + 72,
      fn: () => drawParkedCar(ctx, car, occupants, buildable, buildable?.id === hoveredBuildId),
    });
  }
  for (const place of COMMUNE_HANGOUTS) {
    if (!isVisible(place.x, place.y, place.width / 2 + 42, place.depth / 2 + 112)) continue;
    const occupants = [
      ...(player.hangoutId === place.id ? [{ name: player.name, seat: player.hangoutSeat ?? 0 }] : []),
      ...remotes
        .filter((remote) => remote.hangoutId === place.id)
        .map((remote) => ({ name: remote.name, seat: remote.hangoutSeat ?? 0 })),
    ]
      .sort((a, b) => a.seat - b.seat)
      .map((occupant) => occupant.name)
      .slice(0, place.capacity);
    items.push({
      y: place.y + place.depth / 2,
      fn: () => drawCommuneHangout(ctx, place, occupants),
    });
  }
  for (const building of buildables) {
    if (building.kind === 'sports-car') continue;
    const catalog = COMMUNE_BUILD_CATALOG.find((entry) => entry.kind === building.kind);
    if (!catalog || !isVisible(building.x, building.y, catalog.width / 2 + 40, catalog.depth / 2 + 110)) continue;
    items.push({
      y: building.y + catalog.depth / 2,
      fn: () => drawCommuneBuildable(ctx, building, t, building.id === hoveredBuildId),
    });
  }
  for (const object of WORLD_OBJECTS) {
    if (!isVisible(object.x, object.y, 72, object.id === 'treehole' ? 360 : 90)) continue;
    items.push({ y: object.y, fn: () => drawCommuneWorldObject(ctx, object) });
  }
  for (const d of ducks) {
    if (isVisible(d.x, d.y, 32, 28)) items.push({ y: d.y, fn: () => drawDuck(ctx, d, t) });
  }
  if (incident && isVisible(incident.x, incident.y, 36, 48)) {
    items.push({ y: incident.y, bright: true, fn: () => drawWhatTheDuck(ctx, incident, t, reduceMotion) });
  }
  if (serendipity && isVisible(serendipity.x, serendipity.y, 36, 36)) {
    items.push({
      y: serendipity.y,
      bright: true,
      fn: () => drawTownSerendipity(ctx, serendipity, t, reduceMotion),
    });
  }

  /* spice drops — pixel piles bobbing gently */
  for (const d of drops) {
    if (isVisible(d.x, d.y, 32, 32)) items.push({ y: d.y, fn: () => drawSpiceDrop(ctx, d.x, d.y, t) });
  }

  const ballProgress = soccerBall.kickedAt
    ? Math.min(1, Math.max(0, (Date.now() - soccerBall.kickedAt) / 360))
    : 1;
  const soccerBallX = soccerBall.fromX + (soccerBall.x - soccerBall.fromX) * ballProgress;
  const soccerBallY = soccerBall.fromY + (soccerBall.y - soccerBall.fromY) * ballProgress;
  if (isVisible(soccerBallX, soccerBallY, 24, 28)) {
    items.push({ y: soccerBallY, bright: true, fn: () => drawSoccerBall(ctx, soccerBallX, soccerBallY, t) });
  }

  const bowlingPinPositions = BOWLING_PINS.map(([pinX, pinY]) => ({
    x: MINI_GAME_ZONES.bowling.x + (pinX - 132) * 1.5,
    y: MINI_GAME_ZONES.bowling.y - 150 + (pinY - 25) * 3,
  }));
  const pinFall = bowlingPinsKnockedAt
    ? Math.min(1, Math.max(0, (performance.now() - bowlingPinsKnockedAt) / 330))
    : 1;
  const golfBallPosition = physicsBallPosition(golfBall);
  const bowlingBallPosition = physicsBallPosition(bowlingBall);
  bowlingPinPositions.forEach((pin, index) => {
    if (isVisible(pin.x, pin.y, 18, 24)) {
      items.push({
        y: pin.y,
        fn: () => drawBowlingPin(ctx, pin.x, pin.y, bowlingPinsDown.includes(index), index, pinFall),
      });
    }
  });
  if (isVisible(golfBallPosition.x, golfBallPosition.y, 22, 28)) {
    items.push({ y: golfBallPosition.y, bright: true, fn: () => drawPhysicsBall(ctx, golfBall, 'golf', t) });
  }
  if (isVisible(bowlingBallPosition.x, bowlingBallPosition.y, 24, 30)) {
    items.push({ y: bowlingBallPosition.y, bright: true, fn: () => drawPhysicsBall(ctx, bowlingBall, 'bowling', t) });
  }
  for (const track of mowerTracks) {
    const middleX = (track.fromX + track.x) / 2;
    const middleY = (track.fromY + track.y) / 2;
    if (isVisible(middleX, middleY, 20, 20)) {
      items.push({
        y: middleY,
        fn: () => drawMowerTrack(ctx, track),
      });
    }
  }
  if (isVisible(mower.x, mower.y, 48, 52)) {
    items.push({
      y: mower.y + 20,
      bright: true,
      fn: () => drawTRexMower(ctx, mower, t),
    });
  }

  /* bulletin board (banners) */
  if (isVisible(BOARD.x, BOARD.y, BOARD.w / 2 + 20, BOARD.h + 72)) items.push({
    y: BOARD.y + BOARD.h / 2,
    fn: () => {
      const bx = BOARD.x;
      const by = BOARD.y;
      drawGroundShadow(ctx, bx, by + 91, 84, 14, 0.22);
      // posts
      ctx.fillStyle = '#694a30';
      ctx.fillRect(bx - 70, by + 20, 12, 70);
      ctx.fillRect(bx + 58, by + 20, 12, 70);
      ctx.fillRect(bx - 74, by + 76, 20, 8);
      ctx.fillRect(bx + 54, by + 76, 20, 8);
      // Square timber frame and cork backing.
      ctx.fillStyle = '#62472f';
      ctx.fillRect(bx - 100, by - 70, 200, 140);
      ctx.fillStyle = '#b1845c';
      ctx.fillRect(bx - 95, by - 65, 190, 130);
      ctx.fillStyle = '#725338';
      ctx.fillRect(bx - 88, by - 58, 176, 116);
      ctx.fillStyle = '#d8b889';
      ctx.fillRect(bx - 83, by - 53, 166, 106);
      // Four square nail heads make the sign read as built into the town.
      ctx.fillStyle = '#e3c999';
      ctx.fillRect(bx - 92, by - 62, 4, 4);
      ctx.fillRect(bx + 88, by - 62, 4, 4);
      ctx.fillRect(bx - 92, by + 58, 4, 4);
      ctx.fillRect(bx + 88, by + 58, 4, 4);
      // hung banners (up to 3 papers)
      const shown = banners.slice(-3);
      shown.forEach((b, i) => {
        const px = bx - BOARD.w / 2 + 20 + i * 56;
        const py = by - BOARD.h / 2 + 18;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(((i % 2) - 0.5) * 0.12);
        ctx.fillStyle = '#8b6845';
        ctx.fillRect(-2, -2, 48, 60);
        ctx.fillStyle = b.kind === 'priority'
          ? b.priority === 'urgent' ? '#f1c5b3' : b.priority === 'high' ? '#f0dcae' : '#f3dfb8'
          : b.kind === 'sketch' ? '#e4ead8' : ['#f3dfb8', '#e8d1a2', '#f7e8c8'][i % 3];
        ctx.fillRect(0, 0, 44, 56);
        ctx.fillStyle = b.kind === 'priority'
          ? b.priority === 'urgent' ? '#ae5141' : b.priority === 'high' ? '#b07831' : '#8b6845'
          : b.kind === 'sketch' ? '#788c5d' : `hsl(${b.hue} 55% 43%)`;
        ctx.fillRect(20, 1, 5, 4);
        if (b.kind === 'sketch' && b.strokes.length) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(3, 4, 38, 34);
          ctx.clip();
          for (const stroke of b.strokes) {
            const points = stroke.points;
            const first = points[0];
            if (!first) continue;
            if (points.length === 1) {
              ctx.fillStyle = stroke.color;
              ctx.fillRect(2 + first.x * 38, 3 + first.y * 34, 2, 2);
              continue;
            }
            ctx.beginPath();
            ctx.moveTo(3 + first.x * 38, 4 + first.y * 34);
            for (const point of points.slice(1)) {
              ctx.lineTo(3 + point.x * 38, 4 + point.y * 34);
            }
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = 2;
            ctx.lineCap = 'square';
            ctx.lineJoin = 'miter';
            ctx.stroke();
          }
          ctx.restore();
          ctx.fillStyle = '#493927';
          ctx.fillRect(2, 42, 40, 11);
          ctx.fillStyle = '#f7e8c8';
          ctx.font = "bold 6px 'Schoolbell', ui-monospace, monospace";
          ctx.textAlign = 'center';
          ctx.fillText(bannerPlainText(b.text).slice(0, 12), 22, 50, 37);
        } else {
          const isPriority = b.kind === 'priority';
          if (isPriority) {
            ctx.fillStyle = b.priority === 'urgent' ? '#ae5141' : b.priority === 'high' ? '#b07831' : '#8b6845';
            ctx.fillRect(3, 4, 38, 7);
            ctx.fillStyle = '#fff4d9';
            ctx.font = "bold 5px ui-monospace, monospace";
            ctx.textAlign = 'center';
            ctx.fillText(`${b.priority.toUpperCase()} PRIORITY`, 22, 9, 36);
          }
          ctx.fillStyle = '#493927';
          ctx.font = "bold 7px 'Schoolbell', ui-monospace, monospace";
          ctx.textAlign = 'center';
          const plainText = bannerPlainText(b.text);
          const clippedText = plainText.length > 42 ? `${plainText.slice(0, 39)}…` : plainText;
          const words = clippedText.split(/\s+/);
          let line = '';
          let ly = isPriority ? 20 : 12;
          let overflow = false;
          for (const w of words) {
            if ((line + ' ' + w).trim().length > 8 && line) {
              ctx.fillText(line.trim(), 22, ly, 36);
              line = w;
              ly += 8;
              if (ly > 44) {
                overflow = true;
                break;
              }
            } else line += ' ' + w;
          }
          if (line && ly <= 44) ctx.fillText(line.trim(), 22, ly, 36);
          if (overflow) ctx.fillText('…', 22, 52);
        }
        ctx.restore();
      });
      // Small wooden nameplate beneath the papers.
      ctx.fillStyle = '#5d432d';
      ctx.fillRect(bx - 50, by + BOARD.h / 2 + 21, 100, 20);
      ctx.fillStyle = '#dfc496';
      ctx.font = "bold 10px 'Schoolbell', ui-monospace, monospace";
      ctx.textAlign = 'center';
      ctx.fillText('TOWN HALL NEWS', bx, by + BOARD.h / 2 + 35);
    },
  });

  /* showcase stall */
  if (isVisible(STALL.x, STALL.y, STALL.w / 2 + 24, 100)) items.push({
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
  for (const npc of npcs) {
    if (isVisible(npc.x, npc.y, 72, 132)) items.push({ y: npc.y, bright: true, fn: () => drawAgent(ctx, npc, t) });
  }
  for (const r of remotes) {
    if (r.carId || r.hangoutId || !isVisible(r.x, r.y, 88, 150)) continue;
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
          { x: r.x, y: r.y, headingX: r.headingX, headingY: r.headingY, name: r.name, hue: r.hue, says: speech, status: r.status, admin: r.admin, superAdmin: r.superAdmin, pet: r.pet, avatar: r.avatar, moving: r.moving, bobPhase: r.bobPhase },
          t
        );
      },
    });
  }
  if (!player.carId && !player.hangoutId && isVisible(player.x, player.y, 88, 150)) {
    items.push({ y: player.y, bright: true, fn: () => drawAgent(ctx, player, t, true) });
  }
  for (const pet of pets) {
    if (isVisible(pet.x, pet.y, 64, 72)) items.push({ y: pet.y, fn: () => drawPixelCat(ctx, pet, t, reduceMotion) });
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
  if (buildPreview) drawBuildPreview(ctx, buildPreview);

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

function drawParkedCar(
  ctx: CanvasRenderingContext2D,
  car: ParkedCar,
  occupants: string[],
  buildable: CommuneBuildable | null = null,
  hovered = false,
) {
  const { x, y } = car;
  const underConstruction = !!buildable && communeBuildIsUnderConstruction(buildable);
  ctx.save();
  if (underConstruction) ctx.globalAlpha = 0.46;
  ctx.translate(x, y);
  ctx.rotate(car.heading);
  ctx.scale(car.style === 'electric-sport' ? 1.3 : 1, car.style === 'electric-sport' ? 1.75 : 1.3);
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

  if (buildable) {
    if (underConstruction) drawBuildTooltip(ctx, x, y + 82, 'UNDER CONSTRUCTION', true);
    else if (hovered) drawBuildTooltip(ctx, x, y - 70, `Owner · ${buildable.owner}`);
  } else if (occupants.length) {
    drawBuildTooltip(ctx, x, y + 72, `${occupants.map((name) => name.slice(0, 6)).join(' + ')} · ${occupants.length}/2`);
  } else {
    drawBuildTooltip(ctx, x, y + 72, `${car.label} · E`);
  }
}

function drawCommuneHangout(ctx: CanvasRenderingContext2D, place: CommuneHangout, occupants: string[]): void {
  const { x, y } = place;
  drawGroundShadow(ctx, x + 5, y + place.depth * 0.35, place.width * 0.58, place.depth * 0.3, 0.25);
  if (place.kind === 'villa') {
    ctx.fillStyle = '#8d7453';
    ctx.fillRect(x - 102, y - 24, 204, 94);
    ctx.fillStyle = '#ead6ad';
    ctx.fillRect(x - 90, y - 35, 180, 90);
    ctx.fillStyle = '#c8b38c';
    ctx.fillRect(x - 90, y + 40, 180, 18);
    ctx.fillStyle = '#61788a';
    ctx.beginPath();
    ctx.moveTo(x - 126, y - 34);
    ctx.lineTo(x, y - 112);
    ctx.lineTo(x + 126, y - 34);
    ctx.lineTo(x + 96, y - 48);
    ctx.lineTo(x, y - 100);
    ctx.lineTo(x - 96, y - 48);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#485f70';
    ctx.fillRect(x - 84, y - 43, 168, 12);
    ctx.fillStyle = '#82a8ad';
    ctx.fillRect(x - 70, y - 14, 34, 28);
    ctx.fillRect(x + 36, y - 14, 34, 28);
    ctx.fillStyle = '#f0dfb9';
    ctx.fillRect(x - 66, y - 10, 26, 20);
    ctx.fillRect(x + 40, y - 10, 26, 20);
    ctx.fillStyle = '#785a3c';
    ctx.fillRect(x - 15, y + 2, 30, 56);
    ctx.fillStyle = '#d6b875';
    ctx.fillRect(x + 8, y + 28, 3, 3);
    ctx.fillStyle = '#5d432d';
    ctx.fillRect(x - 43, y + 58, 86, 8);
  } else {
    const cloth = place.id === 'west-tent' ? '#c88757' : '#7f9b68';
    ctx.fillStyle = '#d9c49b';
    ctx.fillRect(x - 2, y - 67, 4, 94);
    ctx.fillStyle = '#594a39';
    ctx.beginPath();
    ctx.moveTo(x - 64, y + 25);
    ctx.lineTo(x, y - 70);
    ctx.lineTo(x + 64, y + 25);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(x - 58, y + 20);
    ctx.lineTo(x, y - 60);
    ctx.lineTo(x + 58, y + 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f0dfb9';
    ctx.beginPath();
    ctx.moveTo(x - 21, y + 20);
    ctx.lineTo(x, y - 8);
    ctx.lineTo(x + 21, y + 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#443a30';
    ctx.beginPath();
    ctx.moveTo(x - 15, y + 20);
    ctx.lineTo(x, y - 1);
    ctx.lineTo(x + 15, y + 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d6bd8d';
    ctx.fillRect(x - 66, y + 19, 5, 16);
    ctx.fillRect(x + 61, y + 19, 5, 16);
  }

  const lines = [
    `${place.label.toUpperCase()} · ${occupants.length}/${place.capacity}`,
    ...(occupants.length ? occupants : ['E · ENTER TO CHILL']),
  ];
  ctx.font = "bold 10px 'Schoolbell', ui-monospace, monospace";
  const width = Math.min(236, Math.max(142, ...lines.map((line) => Math.ceil(ctx.measureText(line).width) + 18)));
  const lineHeight = 14;
  const height = lines.length * lineHeight + 8;
  const top = y - (place.kind === 'villa' ? 120 : 79) - height;
  ctx.fillStyle = 'rgba(36,28,19,0.75)';
  ctx.fillRect(x - width / 2 + 2, top + 3, width, height);
  ctx.fillStyle = '#785a3c';
  ctx.fillRect(x - width / 2, top, width, height);
  ctx.fillStyle = '#f0dfb9';
  ctx.fillRect(x - width / 2 + 2, top + 2, width - 4, height - 4);
  ctx.fillStyle = '#493927';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, index) => {
    ctx.fillText(line, x, top + 9 + index * lineHeight, width - 10);
  });
}

function drawBuildTooltip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  construction = false,
): void {
  ctx.save();
  ctx.font = "bold 9px 'Schoolbell', ui-monospace, monospace";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = Math.min(230, Math.ceil(ctx.measureText(text).width) + 16);
  ctx.fillStyle = construction ? 'rgba(56,43,25,0.9)' : 'rgba(17,24,25,0.84)';
  ctx.fillRect(x - width / 2 + 1, y - 7, width, 15);
  ctx.fillStyle = construction ? '#f0c875' : '#fff4da';
  ctx.fillText(text, x, y + 0.5, width - 10);
  ctx.restore();
}

function drawCommuneBuildable(
  ctx: CanvasRenderingContext2D,
  item: CommuneBuildable,
  time: number,
  hovered = false,
): void {
  const catalog = COMMUNE_BUILD_CATALOG.find((entry) => entry.kind === item.kind);
  if (!catalog) return;
  const underConstruction = communeBuildIsUnderConstruction(item);
  ctx.save();
  if (underConstruction) ctx.globalAlpha = 0.46;
  ctx.translate(item.x, item.y);
  ctx.rotate(item.rotation);
  drawGroundShadow(ctx, 4, catalog.depth * 0.16, catalog.width * 0.47, catalog.depth * 0.28, 0.24);
  if (item.kind === 'tent') {
    ctx.fillStyle = '#604832';
    ctx.beginPath();
    ctx.moveTo(-44, 26); ctx.lineTo(0, -46); ctx.lineTo(44, 26); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c88757';
    ctx.beginPath();
    ctx.moveTo(-39, 22); ctx.lineTo(0, -39); ctx.lineTo(39, 22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#443a30';
    ctx.beginPath();
    ctx.moveTo(-14, 22); ctx.lineTo(0, -4); ctx.lineTo(14, 22); ctx.closePath(); ctx.fill();
  } else if (item.kind === 'tree') {
    drawPixelTree(ctx, 0, 2, 0.72);
  } else if (item.kind === 'beach-umbrella') {
    ctx.fillStyle = '#79573d';
    ctx.fillRect(-3, -8, 6, 54);
    ctx.fillStyle = '#e47b67';
    ctx.beginPath();
    ctx.moveTo(-34, -13); ctx.lineTo(-24, -37); ctx.lineTo(0, -48);
    ctx.lineTo(24, -37); ctx.lineTo(34, -13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f4e1b5';
    ctx.beginPath();
    ctx.moveTo(-15, -17); ctx.lineTo(-10, -41); ctx.lineTo(0, -47);
    ctx.lineTo(10, -41); ctx.lineTo(15, -17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7a9c62';
    ctx.fillRect(-15, 42, 30, 5);
  } else if (item.kind === 'flowerbed') {
    ctx.fillStyle = '#805a3b';
    ctx.fillRect(-40, -26, 80, 48);
    ctx.fillStyle = '#443b2d';
    ctx.fillRect(-34, -20, 68, 36);
    const flowerColors = ['#d9778c', '#e6c55b', '#b88de0', '#f4ece0', '#e58b61', '#84b9a1'];
    flowerColors.forEach((color, index) => {
      const px = -24 + (index % 3) * 24;
      const py = -12 + Math.floor(index / 3) * 20;
      ctx.fillStyle = '#557947';
      ctx.fillRect(px - 1, py + 1, 3, 12);
      ctx.fillStyle = color;
      ctx.fillRect(px - 5, py - 4, 10, 8);
      ctx.fillRect(px - 2, py - 7, 4, 14);
    });
  } else if (item.kind === 'garden-bench') {
    ctx.fillStyle = '#594633';
    ctx.fillRect(-32, 8, 7, 32); ctx.fillRect(25, 8, 7, 32);
    ctx.fillStyle = '#9b7049';
    ctx.fillRect(-42, -15, 84, 26);
    ctx.fillStyle = '#79573d';
    ctx.fillRect(-42, -33, 84, 12);
    ctx.fillStyle = '#b68a5c';
    ctx.fillRect(-39, -12, 78, 5);
  } else if (item.kind === 'campfire') {
    const flicker = Math.sin(time * 9 + item.x) * 3;
    ctx.fillStyle = '#9a8c72';
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4;
      ctx.fillRect(Math.cos(angle) * 20 - 5, Math.sin(angle) * 15 - 5, 10, 10);
    }
    ctx.fillStyle = '#79573d';
    ctx.fillRect(-18, -4, 36, 8);
    ctx.fillRect(-4, -18, 8, 36);
    ctx.fillStyle = '#f09a47';
    ctx.beginPath();
    ctx.moveTo(-12, -2); ctx.lineTo(-8, -21 - flicker); ctx.lineTo(2, -10);
    ctx.lineTo(10, -29 + flicker); ctx.lineTo(13, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe1a0';
    ctx.fillRect(-3, -10, 7, 14);
  } else if (item.kind === 'picnic-table') {
    ctx.fillStyle = '#684a34';
    ctx.fillRect(-31, -16, 7, 50); ctx.fillRect(24, -16, 7, 50);
    ctx.fillStyle = '#a5794d';
    ctx.fillRect(-52, -25, 104, 20);
    ctx.fillRect(-47, 12, 94, 10);
    ctx.fillRect(-47, 32, 94, 10);
    ctx.fillStyle = '#c49b68';
    ctx.fillRect(-47, -21, 94, 5);
  } else if (item.kind === 'paper-lantern') {
    ctx.fillStyle = '#79573d';
    ctx.fillRect(-3, -5, 6, 54);
    ctx.fillStyle = '#f4d48b';
    ctx.fillRect(-12, -31, 24, 24);
    ctx.fillStyle = '#fff0bd';
    ctx.fillRect(-7, -26, 14, 14);
    ctx.fillStyle = 'rgba(255,211,122,0.2)';
    ctx.beginPath(); ctx.arc(0, -19, 24, 0, Math.PI * 2); ctx.fill();
  } else if (item.kind === 'mini-fountain') {
    ctx.fillStyle = '#a7afb2';
    ctx.beginPath(); ctx.ellipse(0, 10, 39, 30, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5798b5';
    ctx.beginPath(); ctx.ellipse(0, 7, 29, 21, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c5c9bd';
    ctx.fillRect(-8, -22, 16, 31);
    ctx.fillStyle = '#8fc4d4';
    ctx.fillRect(-9, -30, 18, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(-16, 4, 12, 2);
    ctx.fillRect(8, 12, 14, 2);
  }
  ctx.restore();
  if (underConstruction) {
    drawBuildTooltip(ctx, item.x, item.y + catalog.depth / 2 + 18, 'UNDER CONSTRUCTION', true);
  }
  if (hovered) {
    const height = item.kind === 'tree' ? 112
      : item.kind === 'beach-umbrella' || item.kind === 'paper-lantern' ? 92
        : item.kind === 'tent' ? 76 : 62;
    drawBuildTooltip(ctx, item.x, item.y - height, `Owner · ${item.owner}`);
  }
}

function drawBuildPreview(
  ctx: CanvasRenderingContext2D,
  preview: { kind: CommuneBuildKind; x: number; y: number; rotation: number; valid: boolean },
): void {
  const catalog = COMMUNE_BUILD_CATALOG.find((entry) => entry.kind === preview.kind);
  if (!catalog) return;
  ctx.save();
  ctx.translate(preview.x, preview.y);
  ctx.rotate(preview.rotation);
  ctx.fillStyle = preview.valid ? 'rgba(61,205,106,0.22)' : 'rgba(245,75,75,0.25)';
  ctx.strokeStyle = preview.valid ? '#53df83' : '#ff5959';
  ctx.lineWidth = 4;
  ctx.fillRect(-catalog.width / 2, -catalog.depth / 2, catalog.width, catalog.depth);
  ctx.strokeRect(-catalog.width / 2, -catalog.depth / 2, catalog.width, catalog.depth);
  ctx.beginPath();
  ctx.moveTo(-10, 0); ctx.lineTo(10, 0);
  ctx.moveTo(0, -10); ctx.lineTo(0, 10);
  ctx.stroke();
  ctx.restore();
  const label = preview.valid ? 'CLICK TO BUILD · R ROTATE' : 'BLOCKED SPOT';
  ctx.fillStyle = preview.valid ? 'rgba(24,65,40,0.9)' : 'rgba(92,30,30,0.92)';
  ctx.fillRect(preview.x - 82, preview.y - catalog.depth / 2 - 33, 164, 18);
  ctx.fillStyle = '#fff';
  ctx.font = "bold 9px 'Schoolbell', ui-monospace, monospace";
  ctx.textAlign = 'center';
  ctx.fillText(label, preview.x, preview.y - catalog.depth / 2 - 20);
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

function drawSoccerBall(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const bounce = Math.sin(t * 12 + x * 0.02) * 1.5;
  ctx.save();
  drawGroundShadow(ctx, x + 2, y + 6, 12, 5, 0.26);
  ctx.translate(Math.round(x), Math.round(y - 9 - bounce));
  ctx.rotate(t * 1.8);
  ctx.fillStyle = '#fff8e9';
  ctx.strokeStyle = '#403428';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#403428';
  ctx.fillRect(-3, -4, 6, 7);
  for (const [px, py] of [[-8, -7], [6, -8], [-9, 4], [7, 5]] as const) {
    ctx.fillRect(px, py, 4, 4);
  }
  ctx.restore();
}

function drawPhysicsBall(
  ctx: CanvasRenderingContext2D,
  ball: PhysicsBallMotion,
  kind: 'golf' | 'bowling',
  t: number
) {
  const position = physicsBallPosition(ball);
  const radius = kind === 'golf' ? 7 : 12;
  ctx.save();
  drawGroundShadow(ctx, position.x + 2, position.y + 5, radius + position.height * 0.3, 4, 0.28);
  ctx.translate(Math.round(position.x), Math.round(position.y - position.height - radius));
  ctx.rotate(t * (kind === 'golf' ? 7 : 4));
  ctx.fillStyle = kind === 'golf' ? '#fff8e9' : '#403428';
  ctx.strokeStyle = kind === 'golf' ? '#5d4935' : '#ead6ad';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = kind === 'golf' ? '#b9aa8c' : '#f0dfb9';
  if (kind === 'golf') {
    ctx.fillRect(-3, -2, 2, 2);
    ctx.fillRect(2, -4, 2, 2);
    ctx.fillRect(2, 2, 2, 2);
    ctx.fillRect(-4, 3, 2, 2);
  } else {
    ctx.fillRect(-5, -3, 3, 3);
    ctx.fillRect(1, -5, 3, 3);
    ctx.fillRect(3, 2, 3, 3);
  }
  ctx.restore();
}

function physicsBallPosition(ball: PhysicsBallMotion) {
  const progress = ball.duration > 0
    ? Math.min(1, Math.max(0, (Date.now() - ball.startedAt) / ball.duration))
    : 1;
  return {
    x: ball.fromX + (ball.x - ball.fromX) * progress,
    y: ball.fromY + (ball.y - ball.fromY) * progress,
    height: Math.sin(progress * Math.PI) * ball.arc,
  };
}

function drawBowlingPin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fallen: boolean,
  index: number,
  fallProgress: number
) {
  ctx.save();
  const fall = fallen ? fallProgress : 0;
  ctx.translate(Math.round(x + (index % 2 ? 7 : -7) * fall), Math.round(y + 5 * fall));
  if (fallen) ctx.rotate((index % 2 ? 0.9 : -0.9) * fall);
  drawGroundShadow(ctx, 1, 5, 7 + fall * 5, 3, 0.25);
  ctx.fillStyle = '#fff8e9';
  ctx.fillRect(-4, -13, 8, 20);
  ctx.fillRect(-3, -16, 6, 5);
  ctx.fillStyle = '#bc6850';
  ctx.fillRect(-3, -5, 6, 3);
  ctx.fillStyle = '#d8c7a5';
  ctx.fillRect(-2, -11, 2, 2);
  ctx.restore();
}

function drawMowerTrack(ctx: CanvasRenderingContext2D, track: MowerTrack) {
  const age = Date.now() - track.at;
  const alpha = Math.max(0.08, 0.34 * (1 - age / 180_000));
  ctx.save();
  ctx.strokeStyle = `rgba(188, 217, 148, ${alpha})`;
  ctx.lineWidth = 5;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(track.fromX, track.fromY);
  ctx.lineTo(track.x, track.y);
  ctx.stroke();
  ctx.restore();
}

function drawTRexMower(ctx: CanvasRenderingContext2D, mower: TRexState, t: number) {
  const zoomies = mower.mode === 'zoomies';
  const bounce = zoomies ? Math.sin(t * 26) * 2.2 : mower.mode === 'mowing' ? Math.sin(t * 12) * 0.6 : 0;
  drawGroundShadow(ctx, mower.x + 3, mower.y + 7, 27, 10, 0.28);
  ctx.save();
  ctx.translate(Math.round(mower.x), Math.round(mower.y - bounce));
  ctx.rotate(mower.heading - Math.PI / 2);

  const beamPulse = mower.mode === 'confused' ? 0.32 + Math.sin(t * 3) * 0.2 : zoomies ? 0.55 : 0.28;
  ctx.fillStyle = `rgba(76, 197, 255, ${beamPulse})`;
  ctx.beginPath();
  ctx.moveTo(0, 16);
  ctx.lineTo(-22, 56);
  ctx.lineTo(22, 56);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#242b30';
  ctx.fillRect(-21, -24, 42, 50);
  ctx.fillStyle = '#30383d';
  ctx.fillRect(-23, -15, 6, 14);
  ctx.fillRect(17, -15, 6, 14);
  ctx.fillRect(-23, 9, 6, 14);
  ctx.fillRect(17, 9, 6, 14);
  const wheelStripe = Math.sin(t * (zoomies ? 22 : 7)) > 0 ? '#667078' : '#3c444a';
  ctx.fillStyle = wheelStripe;
  ctx.fillRect(-22, -10, 4, 3);
  ctx.fillRect(18, 14, 4, 3);

  ctx.fillStyle = '#e9e9e1';
  roundRect(ctx, -18, -23, 36, 43, 7);
  ctx.fill();
  ctx.fillStyle = '#fffdf5';
  roundRect(ctx, -15, -20, 30, 35, 6);
  ctx.fill();
  ctx.fillStyle = '#d7d8d3';
  ctx.fillRect(-13, -16, 26, 3);
  ctx.fillStyle = '#23292e';
  roundRect(ctx, -14, 12, 28, 8, 3);
  ctx.fill();
  ctx.fillStyle = '#58d1ff';
  ctx.fillRect(-5, 14, 10, 2);
  ctx.fillStyle = '#df4e48';
  ctx.beginPath();
  ctx.arc(-8, -11, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b3bac0';
  ctx.fillRect(6, -16, 5, 2);
  ctx.restore();

  ctx.save();
  ctx.font = "bold 9px 'Schoolbell', ui-monospace, monospace";
  ctx.textAlign = 'center';
  const name = 'T-REX';
  const nameWidth = ctx.measureText(name).width + 10;
  roundRect(ctx, mower.x - nameWidth / 2, mower.y - 40, nameWidth, 14, 5);
  ctx.fillStyle = '#493927';
  ctx.fill();
  ctx.fillStyle = '#f3d87c';
  ctx.fillText(name, mower.x, mower.y - 30);
  ctx.restore();
  if (mower.says && mower.says.until > Date.now()) {
    drawBubble(ctx, mower.x, mower.y - 43, mower.says.text);
  }
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
  const oy = Math.round(feet) - tpl.length * SP_P;
  ctx.save();
  ctx.translate(a.x, feet);
  ctx.rotate(Math.atan2(-(a.headingX ?? 0), a.headingY ?? 1));
  for (let r = 0; r < tpl.length; r++) {
    const row = tpl[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      ctx.fillStyle = palette[ch] ?? skin;
      if (r === hemRow && ch === 'P') {
        ctx.fillRect(-tpl[0].length * SP_P / 2 + c * SP_P - SP_P, -tpl.length * SP_P + r * SP_P, SP_P * 3, SP_P);
      } else {
        ctx.fillRect(-tpl[0].length * SP_P / 2 + c * SP_P, -tpl.length * SP_P + r * SP_P, SP_P, SP_P);
      }
    }
  }
  // Long hair — falls past the shoulders on both sides.
  if (look?.hairStyle === 'long') {
    for (let r = 3; r <= 10; r++) {
      ctx.fillStyle = r === 3 || r === 8 ? hairHi : hair;
      ctx.fillRect(-tpl[0].length * SP_P / 2 + 2 * SP_P, -tpl.length * SP_P + r * SP_P, SP_P, SP_P);
      ctx.fillRect(-tpl[0].length * SP_P / 2 + 9 * SP_P, -tpl.length * SP_P + r * SP_P, SP_P, SP_P);
    }
  }
  ctx.restore();

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
  const tag = a.superAdmin ? `ROOT · ${a.name}` : (a.admin ? '★ ' : '') + a.name;
  const w = ctx.measureText(tag).width + 14;
  roundRect(ctx, a.x - w / 2, a.y + 12, w, 17, 8);
  ctx.fillStyle = a.superAdmin ? '#d6a646' : isPlayer ? 'rgba(217,119,87,0.94)' : 'rgba(20,20,19,0.74)';
  ctx.fill();
  ctx.fillStyle = a.superAdmin || isPlayer ? '#1a1a1a' : '#fff';
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
  const bob = reduceMotion
    ? 0
    : animated
      ? Math.sin(pet.walkPhase * 2) * 1.2
      : pet.pose === 'play'
        ? Math.abs(Math.sin(t * 6 + pet.walkPhase)) * 2.5
        : Math.sin(t * 1.7 + pet.walkPhase) * 0.5;
  const top = -height + 4;
  const palette = CAT_PIXEL_PALETTES[pet.catId];

  ctx.fillStyle = 'rgba(20,20,19,0.22)';
  ctx.beginPath();
  ctx.ellipse(pet.x, pet.y + 3, width * 0.46, 5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(pet.x, pet.y + bob);
  ctx.rotate(Math.atan2(pet.headingY, pet.headingX));
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const pixel = row[colIndex];
      if (pixel === '.') continue;
      ctx.fillStyle = palette[pixel] ?? palette.C;
      ctx.fillRect(
        Math.round(-width / 2 + colIndex * cellX),
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
      ctx.fillRect(13, Math.round(emoteY), 3, 3);
      ctx.fillRect(18, Math.round(emoteY - 5), 2, 2);
      ctx.fillRect(21, Math.round(emoteY + 2), 2, 2);
    } else {
      const sx = 15;
      const sy = Math.round(emoteY - 5);
      ctx.fillStyle = '#f0d394';
      ctx.fillRect(sx, sy - 4, 3, 11);
      ctx.fillRect(sx - 4, sy, 11, 3);
      ctx.fillStyle = '#fff2cf';
      ctx.fillRect(sx + 1, sy, 2, 3);
    }
  }
  ctx.restore();
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
    [800, 1150, 920, 1540, 1065, 1815], // soccer pitch entrance
    [1150, 730, 1370, 770, 1580, 730], // arcade trail → eastern meadow
    [1580, 730, 1760, 640, 1900, 590],
    [1900, 590, 2140, 530, 2350, 650], // duck borough
    [2350, 650, 2470, 730, 2490, 850], // lagoon shore
    [800, 1150, 850, 1370, 1040, 1510], // south gate → oddity orchard
    [1040, 1510, 1330, 1660, 1530, 1600],
    [1530, 1600, 1700, 1490, 1870, 1350], // mushroom council
    [1870, 1350, 2040, 1440, 2250, 1460], // bowling lane approach
    [1530, 1600, 1810, 1700, 2110, 1710],
    [2110, 1710, 2370, 1710, 2700, 1790], // star overlook
    [1440, 1050, 1460, 1420, 1580, 1770],
    [1580, 1770, 1630, 1782, 1680, 1780], // villa entrance
    [1680, 1780, 1810, 1774, 1940, 1795],
    [1940, 1795, 2035, 1810, 2130, 1795], // tent entrances
    [2130, 1795, 2255, 1770, 2370, 1710],
    [2490, 850, 2670, 1000, 2790, 1150], // golf green entrance
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

  /* Three small play clearings are baked into the cached pixel landscape. */
  const golf = MINI_GAME_ZONES.golf;
  pxShadow(golf.x + 7, golf.y + 12, 220, 142, 0.22);
  pxEllipse(golf.x, golf.y, 216, 136, '#567d4e');
  pxEllipse(golf.x, golf.y, 184, 108, '#78a45b');
  pxEllipse(golf.x - 90, golf.y + 26, 25, 16, '#d9c38f');
  pxEllipse(golf.x + 56, golf.y - 37, 21, 13, '#d9c38f');
  px(GOLF_TEE.x - 7, GOLF_TEE.y - 4, 14, 8, '#785a3c');
  px(golf.x + 65, golf.y - 20, 10, 6, '#263a2a');
  px(golf.x + 65, golf.y - 64, 5, 52, '#f0dfb9');
  px(golf.x + 50, golf.y - 64, 20, 12, '#d97757');

  const bowling = MINI_GAME_ZONES.bowling;
  pxShadow(bowling.x + 5, bowling.y + 12, 68, 205, 0.2);
  px(bowling.x - 56, bowling.y - 195, 112, 390, '#684a34');
  px(bowling.x - 45, bowling.y - 183, 90, 366, '#b88b5c');
  px(bowling.x - 36, bowling.y - 174, 72, 348, '#d0a673');
  px(bowling.x - 55, bowling.y - 178, 110, 10, '#765338');
  px(bowling.x - 55, bowling.y + 168, 110, 10, '#765338');

  const soccer = MINI_GAME_ZONES.soccer;
  const fieldWidth = soccer.right - soccer.left;
  const fieldHeight = soccer.bottom - soccer.top;
  pxShadow(soccer.x + 5, soccer.y + 12, fieldWidth / 2 + 10, fieldHeight / 2 + 10, 0.2);
  px(soccer.left, soccer.top, fieldWidth, fieldHeight, '#426b48');
  px(soccer.left + 8, soccer.top + 8, fieldWidth - 16, fieldHeight - 16, '#648e55');
  for (let stripe = 0; stripe < 5; stripe++) {
    if (stripe % 2 === 0) px(soccer.left + 8 + stripe * ((fieldWidth - 16) / 5), soccer.top + 8, (fieldWidth - 16) / 5, fieldHeight - 16, '#6d985c');
  }
  g.strokeStyle = '#e7e5cf';
  g.lineWidth = 4;
  g.strokeRect(soccer.left + 10, soccer.top + 10, fieldWidth - 20, fieldHeight - 20);
  g.beginPath();
  g.moveTo(soccer.x, soccer.top + 10);
  g.lineTo(soccer.x, soccer.bottom - 10);
  g.stroke();
  g.beginPath();
  g.ellipse(soccer.x, soccer.y, 38, 38, 0, 0, Math.PI * 2);
  g.stroke();
  for (const x of [soccer.left + 10, soccer.right - 22]) {
    px(x, soccer.y - 32, 12, 64, '#f0dfb9');
    px(x + (x < soccer.x ? 8 : -8), soccer.y - 32, 8, 5, '#fff8e9');
    px(x + (x < soccer.x ? 8 : -8), soccer.y + 27, 8, 5, '#fff8e9');
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
