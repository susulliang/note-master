/**
 * Cat companion pet model — pure functions for the lightweight companion
 * system (Tamagotchi-inspired, but a reward loop, never a punishment loop:
 * stats floor at 5, offline decay caps at 8h, and there is no death).
 *
 * State shape is versioned (`v` field) and persisted per identity + cat in
 * localStorage (`__app_ecovacs_cat_pet_v1:<identity>:<catId>`), mirrored to
 * D1 (pet_state table) by the use-cat-pet hook — the D1 blob is opaque to
 * the server.
 */

import type { CatId } from '@/lib/cat-sprites';

export const PET_STATE_VERSION = 1;
export const PET_STORAGE_PREFIX = '__app_ecovacs_cat_pet_v1';

/** Stats floor — the pet gets grumpy but never "dies". */
export const PET_FLOOR = 5;
/** Offline decay is capped to this window so returning users aren't punished. */
export const OFFLINE_DECAY_CAP_MS = 8 * 60 * 60 * 1000;

export type PetTrait = 'Sleepy' | 'Playful' | 'Greedy' | 'Chill' | 'Curious';

export interface CatPetProfile {
  trait: PetTrait;
  /** Store product id of the favorite food (stable across renames). */
  favoriteFoodId: string | null;
  quirk: string;
}

export interface CatPetState {
  v: number;
  /** Care meters, 0–100. */
  energy: number;
  fullness: number;
  mood: number;
  /** Bond XP — progression only, never decays. */
  xp: number;
  /** True while the cat is napping (energy regenerates instead of decaying). */
  napping: boolean;
  profile: CatPetProfile;
  /** ms epoch of the last model tick. */
  updatedAt: number;
  /** Daily soft-cap counters: { ymd: { pet: n, work: n }, lastLogin: ymd }. */
  daily: {
    ymd: string;
    pets: number;
    workXp: number;
    lastLoginAwarded: string | null;
  };
}

/* ------------------------------ balance table ----------------------------- */

export const PET_BALANCE = {
  /** Per-hour decay while the app is open (ms-based under the hood). */
  decayPerHour: { energy: 12, fullness: 15, mood: 8 },
  /** Personality multipliers on decay (trait → per-stat factor). */
  traitDecay: {
    Sleepy: { energy: 1.6, fullness: 1, mood: 0.9 },
    Playful: { energy: 1.2, fullness: 1.1, mood: 1.3 },
    Greedy: { energy: 1, fullness: 1.5, mood: 1 },
    Chill: { energy: 0.8, fullness: 0.9, mood: 0.8 },
    Curious: { energy: 1.1, fullness: 1, mood: 1.1 },
  } as Record<PetTrait, { energy: number; fullness: number; mood: number }>,
  feed: { fullness: 40, xp: 8, favoriteMood: 5 },
  pet: { mood: 4, xp: 2, cooldownMs: 30_000, dailyCap: 20 },
  /** QA-scored call → Bond XP by score tier. */
  qaXp: { 70: 2, 80: 4, 90: 6 } as Record<number, number>,
  workXpDailyCap: 20,
  firstLoginXp: 3,
  nap: { /** Energy below this → nap mode. */
    threshold: 25,
    /** Energy restored per minute while napping. */
    restorePerMin: 20,
    /** Napping stops when energy reaches this. */
    wakeAt: 70,
  },
};

export const PET_STAGES = [
  { name: 'Kitten', xp: 0, scale: 0.5 },
  { name: 'Junior', xp: 30, scale: 0.68 },
  { name: 'Prime', xp: 80, scale: 0.86 },
  { name: 'Mature', xp: 160, scale: 1.04 },
  { name: 'Elder', xp: 300, scale: 1.22 },
] as const;

export type PetStageName = (typeof PET_STAGES)[number]['name'];

export interface PetStage {
  name: PetStageName;
  xp: number;
  scale: number;
}

export function stageFor(xp: number): PetStage {
  let stage: PetStage = PET_STAGES[0];
  for (const s of PET_STAGES) if (xp >= s.xp) stage = s;
  return stage;
}

export function nextStage(xp: number): PetStage | null {
  return PET_STAGES.find((s) => s.xp > xp) ?? null;
}

/** Sprite scale for the current XP (interpolated between stage anchors). */
export function scaleFor(xp: number): number {
  const s = stageFor(xp);
  const next = nextStage(xp);
  if (!next) return s.scale;
  const t = Math.min(1, (xp - s.xp) / (next.xp - s.xp));
  return s.scale + (next.scale - s.scale) * t;
}

/* --------------------------- profile generation --------------------------- */

export const PET_QUIRKS = [
  'afraid of cucumbers',
  'purrs at 3am',
  'hoards paperclips',
  'stares at the wall occasionally',
  'chirps at birds on screen',
  'sleeps in exactly one sunbeam',
  'boops the keyboard when idle',
  'hisses at PDFs',
];

/** Traits weighted so no personality dominates. */
const TRAITS: PetTrait[] = ['Sleepy', 'Playful', 'Greedy', 'Chill', 'Curious'];

/** Small seeded PRNG (mulberry32) — the profile is stable per identity+cat. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic profile for an identity + cat pair. `foodIds` are the
 *  current store food product ids — the favorite is picked from them. */
export function generateProfile(identity: string, catId: CatId, foodIds: string[]): CatPetProfile {
  const rand = seededRandom(hashString(`${identity}::${catId}`));
  const trait = TRAITS[Math.floor(rand() * TRAITS.length)];
  const quirk = PET_QUIRKS[Math.floor(rand() * PET_QUIRKS.length)];
  const favoriteFoodId = foodIds.length > 0 ? foodIds[Math.floor(rand() * foodIds.length)] : null;
  return { trait, favoriteFoodId, quirk };
}

/* ------------------------------ state basics ------------------------------ */

const clamp = (v: number) => Math.max(PET_FLOOR, Math.min(100, Math.round(v)));

export function initialState(now: number, profile: CatPetProfile): CatPetState {
  return {
    v: PET_STATE_VERSION,
    energy: 80,
    fullness: 80,
    mood: 70,
    /** 1 xp at adoption — the Kitten hub shows visible progress from day one. */
    xp: 1,
    napping: false,
    profile,
    updatedAt: now,
    daily: { ymd: ymdOf(now), pets: 0, workXp: 0, lastLoginAwarded: null },
  };
}

export function ymdOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** localStorage key for an identity + cat pair. */
export function petStorageKey(identity: string, catId: CatId): string {
  return `${PET_STORAGE_PREFIX}:${identity}:${catId}`;
}

/** Load + migrate a saved state; returns null when nothing/invalid saved. */
export function loadState(raw: string | null): CatPetState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CatPetState;
    if (parsed?.v !== PET_STATE_VERSION || typeof parsed.energy !== 'number') return null;
    // Migration point: bump PET_STATE_VERSION and map older shapes here.
    return parsed;
  } catch {
    return null;
  }
}

export function saveStateJson(state: CatPetState): string {
  return JSON.stringify(state);
}

/* --------------------------------- ticking -------------------------------- */

export interface TickDelta {
  napping: boolean;
  wokeUp: boolean;
  fellAsleep: boolean;
}

/** Advance the simulation from `state.updatedAt` to `now`.
 *  - decay while active; energy decay pauses while napping, and napping
 *    restores energy instead
 *  - offline: decay capped to 8h (returning copy stays warm, no guilt)
 *  - daily counters roll over at UTC midnight */
export function tick(state: CatPetState, now: number): { state: CatPetState; delta: TickDelta } {
  const wasNapping = state.napping;
  const elapsed = Math.max(0, now - state.updatedAt);
  const decayMs = Math.min(elapsed, OFFLINE_DECAY_CAP_MS);
  const hours = decayMs / 3_600_000;
  const factor = PET_BALANCE.traitDecay[state.profile.trait] ?? { energy: 1, fullness: 1, mood: 1 };

  const next: CatPetState = {
    ...state,
    daily: state.daily.ymd === ymdOf(now) ? state.daily : { ...state.daily, ymd: ymdOf(now), pets: 0, workXp: 0 },
  };

  if (wasNapping) {
    // Napping: energy regenerates, other meters decay at half rate.
    next.energy = clamp(state.energy + (PET_BALANCE.nap.restorePerMin * decayMs) / 60_000);
    next.fullness = clamp(state.fullness - (PET_BALANCE.decayPerHour.fullness * factor.fullness * hours) / 2);
    next.mood = clamp(state.mood - (PET_BALANCE.decayPerHour.mood * factor.mood * hours) / 2);
  } else {
    next.energy = clamp(state.energy - PET_BALANCE.decayPerHour.energy * factor.energy * hours);
    next.fullness = clamp(state.fullness - PET_BALANCE.decayPerHour.fullness * factor.fullness * hours);
    next.mood = clamp(state.mood - PET_BALANCE.decayPerHour.mood * factor.mood * hours);
  }
  next.updatedAt = now;

  // Nap state machine: doze off under the threshold, wake up at wakeAt.
  const nowNapping = wasNapping ? next.energy < PET_BALANCE.nap.wakeAt : next.energy < PET_BALANCE.nap.threshold;
  next.napping = nowNapping;
  return {
    state: next,
    delta: { napping: nowNapping, wokeUp: wasNapping && !nowNapping, fellAsleep: !wasNapping && nowNapping },
  };
}

/* ------------------------------ interactions ------------------------------ */

export interface ActionOutcome {
  state: CatPetState;
  xpGained: number;
  moodGained: number;
  /** True when the food was the pet's favorite. */
  favorite: boolean;
  /** False when the action was swallowed by a cap/cooldown — UI can hint. */
  applied: boolean;
}

/** Feed the pet (a food purchase). Always applied — buying takes real spice. */
export function applyFeed(state: CatPetState, productId: string | null, now: number): ActionOutcome {
  const favorite = Boolean(productId && state.profile.favoriteFoodId && productId === state.profile.favoriteFoodId);
  const { state: ticked } = tick(state, now);
  const next: CatPetState = {
    ...ticked,
    fullness: clamp(ticked.fullness + PET_BALANCE.feed.fullness),
    mood: clamp(ticked.mood + (favorite ? PET_BALANCE.feed.favoriteMood : 0)),
    xp: ticked.xp + PET_BALANCE.feed.xp,
  };
  return { state: next, xpGained: PET_BALANCE.feed.xp, moodGained: favorite ? PET_BALANCE.feed.favoriteMood : 0, favorite, applied: true };
}

/** Pet the cat — subject to the 30s cooldown and a daily soft cap. */
export function applyPet(state: CatPetState, now: number): ActionOutcome {
  const { state: ticked } = tick(state, now);
  if (ticked.daily.pets >= PET_BALANCE.pet.dailyCap)
    return { state: ticked, xpGained: 0, moodGained: 0, favorite: false, applied: false };
  const next: CatPetState = {
    ...ticked,
    mood: clamp(ticked.mood + PET_BALANCE.pet.mood),
    xp: ticked.xp + PET_BALANCE.pet.xp,
    daily: { ...ticked.daily, pets: ticked.daily.pets + 1 },
  };
  return { state: next, xpGained: PET_BALANCE.pet.xp, moodGained: PET_BALANCE.pet.mood, favorite: false, applied: true };
}

/** QA-scored call milestone — Bond XP by tier, under the daily work cap. */
export function applyQaScore(state: CatPetState, scorePct: number, now: number): ActionOutcome {
  const { state: ticked } = tick(state, now);
  const tier = scorePct >= 90 ? 6 : scorePct >= 80 ? 4 : scorePct >= 70 ? 2 : 0;
  if (tier === 0) return { state: ticked, xpGained: 0, moodGained: 0, favorite: false, applied: false };
  const room = Math.max(0, PET_BALANCE.workXpDailyCap - ticked.daily.workXp);
  const xp = Math.min(tier, room);
  if (xp === 0) return { state: ticked, xpGained: 0, moodGained: 0, favorite: false, applied: false };
  const next: CatPetState = {
    ...ticked,
    mood: clamp(ticked.mood + 3),
    xp: ticked.xp + xp,
    daily: { ...ticked.daily, workXp: ticked.daily.workXp + xp },
  };
  return { state: next, xpGained: xp, moodGained: 3, favorite: false, applied: true };
}

/** Manual nap toggle from the bloom's Energy petal. Napping is normally
 *  autonomous (energy < 25), but the user can tuck the cat in early —
 *  same regeneration, no XP. Toggling again wakes the cat. */
export function applyNapToggle(state: CatPetState, now: number): ActionOutcome {
  const { state: ticked } = tick(state, now);
  const next: CatPetState = { ...ticked, napping: !ticked.napping };
  return { state: next, xpGained: 0, moodGained: 0, favorite: false, applied: true };
}

/** First authenticated session each day → small Bond XP. Idempotent per day. */
export function applyDailyLogin(state: CatPetState, now: number): ActionOutcome {
  const today = ymdOf(now);
  if (state.daily.lastLoginAwarded === today)
    return { state, xpGained: 0, moodGained: 0, favorite: false, applied: false };
  const { state: ticked } = tick(state, now);
  const next: CatPetState = {
    ...ticked,
    xp: ticked.xp + PET_BALANCE.firstLoginXp,
    daily: { ...ticked.daily, lastLoginAwarded: today },
  };
  return { state: next, xpGained: PET_BALANCE.firstLoginXp, moodGained: 0, favorite: false, applied: true };
}

/* ------------------------------ display helpers --------------------------- */

export type PetStatus = 'napping' | 'hungry' | 'low-mood' | 'low-energy' | 'content';

export function statusOf(state: CatPetState, napping: boolean): PetStatus {
  if (napping) return 'napping';
  if (state.fullness < 30) return 'hungry';
  if (state.mood < 30) return 'low-mood';
  if (state.energy < PET_BALANCE.nap.threshold) return 'low-energy';
  return 'content';
}

export const PET_STATUS_COPY: Record<PetStatus, string> = {
  napping: 'Napping — saving you a sunny spot',
  hungry: 'Peckish — a wet can would hit the spot',
  'low-mood': 'A bit wistful — petting helps',
  'low-energy': 'Low battery — a nap is incoming',
  content: 'Content and keeping an eye on your tickets',
};
