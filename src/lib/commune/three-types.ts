import type {
  CommuneBuildable,
  CommuneBuildKind,
} from '@shared/commune-buildables';

export type AvatarColors = {
  hair?: string;
  shirt?: string;
  bottomColor?: string;
  shoes?: string;
};

export type RenderActor = {
  x: number;
  y: number;
  headingX?: number;
  headingY?: number;
  name: string;
  hue: number;
  moving?: boolean;
  bobPhase?: number;
  avatar?: AvatarColors | null;
  admin?: boolean;
  superAdmin?: boolean;
  status?: string;
  says?: { text: string; until: number } | null;
  carId?: string | null;
  carSeat?: number | null;
  hangoutId?: string | null;
};

export type RenderCar = {
  id: string;
  x: number;
  y: number;
  heading: number;
  body: string;
  trim: string;
  style?: 'classic' | 'electric-sport';
  owner?: string;
  buildId?: string;
};

export type RenderBuildPreview = {
  kind: CommuneBuildKind;
  x: number;
  y: number;
  rotation: number;
  valid: boolean;
};

export type RenderPet = {
  x: number;
  y: number;
  catId?: string;
  stage?: string;
  moving?: boolean;
  pose?: string;
  emote?: string | null;
  walkPhase?: number;
  facingLeft?: boolean;
  headingX?: number;
  headingY?: number;
};

export type RenderDrop = { x: number; y: number };
export type RenderDuck = { x: number; y: number; phase?: number };
export type RenderDiscovery = { x: number; y: number };

export type RenderSoccerBall = {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  kickedAt: number;
  by: string | null;
};

export type RenderPhysicsBall = {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  startedAt: number;
  duration: number;
  arc: number;
};

export type RenderMower = {
  x: number;
  y: number;
  heading: number;
  mode: 'mowing' | 'zoomies' | 'confused' | 'napping' | 'reverse';
  says: { text: string; until: number } | null;
};

export type RenderMowerTrack = { fromX: number; fromY: number; x: number; y: number; at: number };

export type HuskoState =
  | 'wander' | 'sniff-tree' | 'poo' | 'sniff-npc' | 'swim'
  | 'chill' | 'chase-ball' | 'follow' | 'eat' | 'zoomies';

export type RenderHusko = {
  x: number;
  y: number;
  state: HuskoState;
  moving: boolean;
  headingX: number;
  headingY: number;
  walkPhase: number;
  happiness: number;
  says?: { text: string; until: number } | null;
  /** Thrown ball in flight/on ground for Husko to chase. */
  ball?: { x: number; y: number } | null;
  /** Left-behind poo piles (fade on the client). */
  poos?: readonly { x: number; y: number; at: number }[];
};

export interface CommuneThreeLaserShot {
  id: string;
  shooter: string;
  fromX: number;
  fromY: number;
  fromHeight: number;
  toX: number;
  toY: number;
  toHeight: number;
  durationMs: number;
  targetUsername: string | null;
  startedAt: number;
}

export interface CommuneThreeFrame {
  time: number;
  zoom: number;
  cameraPitch: number;
  cameraYaw: number;
  player: RenderActor;
  npcs: readonly RenderActor[];
  remotes: readonly RenderActor[];
  pets: readonly RenderPet[];
  cars: readonly RenderCar[];
  buildables: readonly CommuneBuildable[];
  hoveredBuildId?: string | null;
  buildPreview: RenderBuildPreview | null;
  drops: readonly RenderDrop[];
  ducks: readonly RenderDuck[];
  incident: RenderDiscovery | null;
  serendipity: RenderDiscovery | null;
  destination: RenderDiscovery | null;
  clickTarget: RenderDiscovery | null;
  soccerBall: RenderSoccerBall;
  golfBall: RenderPhysicsBall;
  bowlingBall: RenderPhysicsBall;
  bowlingPinsDown: readonly number[];
  bowlingPinsKnockedAt: number;
  laserShots: readonly CommuneThreeLaserShot[];
  mower: RenderMower;
  mowerTracks: readonly RenderMowerTrack[];
  /** The commune's shared giant husky (null → not yet spawned). */
  husko: RenderHusko | null;
  nightOpacity: number;
  reduceMotion: boolean;
}
