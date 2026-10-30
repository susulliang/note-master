export type CommuneHangoutId = 'agent-villa' | 'west-tent' | 'east-tent';

export interface CommuneHangout {
  id: CommuneHangoutId;
  label: string;
  kind: 'villa' | 'tent';
  x: number;
  y: number;
  doorX: number;
  doorY: number;
  width: number;
  depth: number;
  capacity: number;
}

export const COMMUNE_HANGOUTS: readonly CommuneHangout[] = [
  {
    id: 'agent-villa',
    label: 'Agent Villa',
    kind: 'villa',
    x: 1680,
    y: 1900,
    doorX: 1680,
    doorY: 1778,
    width: 230,
    depth: 160,
    capacity: 4,
  },
  {
    id: 'west-tent',
    label: 'West Camp Tent',
    kind: 'tent',
    x: 1940,
    y: 1900,
    doorX: 1940,
    doorY: 1800,
    width: 110,
    depth: 90,
    capacity: 2,
  },
  {
    id: 'east-tent',
    label: 'East Camp Tent',
    kind: 'tent',
    x: 2130,
    y: 1900,
    doorX: 2130,
    doorY: 1800,
    width: 110,
    depth: 90,
    capacity: 2,
  },
] as const;

export const COMMUNE_HANGOUT_ENTER_RANGE = 132;
export const COMMUNE_HANGOUT_EXIT_OFFSET = 28;
