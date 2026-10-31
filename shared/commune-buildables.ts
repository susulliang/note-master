export type CommuneBuildKind =
  | 'tent'
  | 'tree'
  | 'beach-umbrella'
  | 'sports-car'
  | 'flowerbed'
  | 'garden-bench'
  | 'campfire'
  | 'picnic-table'
  | 'paper-lantern'
  | 'mini-fountain';

export interface CommuneBuildable {
  id: string;
  owner: string;
  kind: CommuneBuildKind;
  x: number;
  y: number;
  rotation: number;
  createdAt: number;
}

export interface CommuneBuildCatalogEntry {
  kind: CommuneBuildKind;
  name: string;
  description: string;
  price: number;
  width: number;
  depth: number;
}

export const COMMUNE_BUILD_CATALOG: readonly CommuneBuildCatalogEntry[] = [
  { kind: 'tent', name: 'Camp Tent', description: 'A cozy patch of canvas for taking a breather.', price: 99, width: 92, depth: 76 },
  { kind: 'tree', name: 'Young Oak', description: 'Adds a little shade and a lot of village charm.', price: 49, width: 58, depth: 58 },
  { kind: 'beach-umbrella', name: 'Beach Umbrella', description: 'A striped umbrella for sunny-day lounging.', price: 29, width: 62, depth: 62 },
  { kind: 'sports-car', name: 'Electric Sports Car', description: 'A sleek two-seat electric cruiser with private car chat.', price: 199, width: 96, depth: 142 },
  { kind: 'flowerbed', name: 'Flowerbed', description: 'A bright cluster of flowers for an empty corner.', price: 19, width: 82, depth: 54 },
  { kind: 'garden-bench', name: 'Garden Bench', description: 'A quiet spot to sit and watch the square.', price: 39, width: 86, depth: 40 },
  { kind: 'campfire', name: 'Campfire', description: 'A warm little gathering place after sunset.', price: 49, width: 58, depth: 58 },
  { kind: 'picnic-table', name: 'Picnic Table', description: 'Room for snacks, stories, and a few friends.', price: 59, width: 110, depth: 72 },
  { kind: 'paper-lantern', name: 'Paper Lantern', description: 'A softly glowing marker for the village paths.', price: 19, width: 34, depth: 34 },
  { kind: 'mini-fountain', name: 'Mini Fountain', description: 'A tiny bubbling fountain for your own nook.', price: 89, width: 78, depth: 78 },
] as const;

export const COMMUNE_BUILD_MAX_PER_AGENT = 24;
export const COMMUNE_BUILD_MAX_TOTAL = 80;
export const COMMUNE_BUILD_INTERACT_RANGE = 132;
export const COMMUNE_BUILD_PLACE_RANGE = 300;

export function communeBuildCarId(buildingId: string): string {
  return `buildcar-${buildingId}`;
}
