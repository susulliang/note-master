import * as THREE from 'three';

/** World extents in world units (also mirrored in CommunePanel for simulation). */
export const WORLD_W = 3200;
export const WORLD_H = 2400;
export const MAX_ACTORS = 256;

/** Shared scratch color — reuse instead of allocating per frame. */
export const TEMP_COLOR = new THREE.Color();

/** Floating landmark captions drawn on the 2D label overlay. */
export const LANDMARKS = [
  { text: 'TOWN HALL', x: 800, z: 155, height: 132 },
  { text: 'SPICE STORE', x: 270, z: 298, height: 110 },
  { text: 'ARCADE', x: 1330, z: 298, height: 110 },
  { text: 'DUCK BOROUGH', x: 2580, z: 780, height: 80 },
  { text: 'ODDITY ORCHARD', x: 1870, z: 1190, height: 80 },
  { text: 'STAR OVERLOOK', x: 2700, z: 1640, height: 80 },
  { text: 'GOLF GREEN', x: 2860, z: 1132, height: 18 },
  { text: 'BOWLING LANE', x: 2250, z: 1200, height: 22 },
  { text: 'SOCCER FIELD', x: 1065, z: 1808, height: 18 },
];

/** Cat coat palettes keyed by catId (kept as data so new coats are one-liners). */
export const CAT_COATS: Record<string, { body: string; light: string; dark: string; accent: string; patch: string }> = {
  hunao: { body: '#aeb8c0', light: '#dce3e7', dark: '#58616a', accent: '#7eaaa7', patch: '#707b84' },
  siam: { body: '#6a9bcc', light: '#b6d0e1', dark: '#3e5368', accent: '#d4bd6d', patch: '#526f8b' },
  heyhey: { body: '#41444c', light: '#858993', dark: '#292c32', accent: '#d6bd65', patch: '#33363e' },
  heyheyhey: { body: '#30333a', light: '#70747d', dark: '#202228', accent: '#cbb66a', patch: '#282b31' },
  ailu: { body: '#6478c2', light: '#bcc9ef', dark: '#3f4e82', accent: '#75a5cb', patch: '#4f619d' },
  bella: { body: '#fff8e9', light: '#fffaf0', dark: '#51483f', accent: '#d97757', patch: '#d97757' },
};
