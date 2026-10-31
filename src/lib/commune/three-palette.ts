import * as THREE from 'three';

/**
 * Single source of truth for the Commune's graded colors. Every renderer color
 * lerp (day↔night) pulls from here so the sky, fog, lights and lanterns stay
 * in the same palette family. Tune the look in this one file.
 */

export const DAY_BACKGROUND = new THREE.Color('#78956f');
export const NIGHT_BACKGROUND = new THREE.Color('#24344d');
export const LANTERN_DAY_COLOR = new THREE.Color('#b28c50');
export const LANTERN_NIGHT_COLOR = new THREE.Color('#ffe3a1');

/** Hemisphere + ambient fill (sky above / grass bounce below). */
export const DAY_SKY_LIGHT = new THREE.Color('#cfe4f6');
export const NIGHT_SKY_LIGHT = new THREE.Color('#5d76a3');
export const DAY_GROUND_LIGHT = new THREE.Color('#b8c79a');
export const NIGHT_GROUND_LIGHT = new THREE.Color('#2e3a52');

/** Legacy ambient tint (kept dim under the hemisphere light). */
export const DAY_AMBIENT_COLOR = new THREE.Color('#e4f1d8');
export const NIGHT_AMBIENT_COLOR = new THREE.Color('#9cb7e1');
export const DAY_SUN_COLOR = new THREE.Color('#fff2d4');
export const NIGHT_SUN_COLOR = new THREE.Color('#8298c4');

/** Fog must sit between the sky horizon and background so edges melt away. */
export const DAY_FOG_COLOR = new THREE.Color('#c2d4bd');
export const NIGHT_FOG_COLOR = new THREE.Color('#26374f');
export const FOG_NEAR = 1500;
export const FOG_FAR = 3600;

/** Direction of the sun disc drawn in the sky dome (matches the sun light offset). */
export const SUN_DIRECTION = { x: -850, y: 1650, z: 1050 };
