import * as THREE from 'three';
import { makeInstanceMesh, material } from './three-builders';

/**
 * Instanced world scatter: grass tufts, reeds around the ponds, rocks.
 * Grass + reeds share a vertex-shader wind sway (one uniform, zero CPU per
 * frame); everything is InstancedMesh so the whole scatter is 3 draw calls.
 */

/** Keep-off zones: plaza/fountain, ponds, mini-game areas, board & stall. */
const FORBIDDEN = [
  { x: 800, z: 620, r: 370 },
  { x: 170, z: 640, r: 180 },
  { x: 2580, z: 790, r: 210 },
  { x: 1065, z: 1970, r: 270 },
  { x: 2250, z: 1290, r: 250 },
  { x: 2860, z: 1280, r: 260 },
  { x: 800, z: 342, r: 150 },
  { x: 400, z: 730, r: 140 },
];

function scatterPositions(count: number, seed: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; out.length < count && i < count * 40; i++) {
    const x = ((i * 7349 + seed * 977) % 3140) + 30 + ((i * 131) % 17);
    const z = ((i * 1523 + seed * 331) % 2340) + 30 + ((i * 89) % 13);
    if (FORBIDDEN.some((f) => (x - f.x) ** 2 + (z - f.z) ** 2 < f.r * f.r)) continue;
    out.push([x, z]);
  }
  return out;
}

/** Lambert with a cheap wind sway driven by gl_InstanceID (WebGL2). */
export function createSwayMaterial(color: string): THREE.MeshLambertMaterial {
  const sway = material(color);
  const uniforms = { uTime: { value: 0 }, uSway: { value: 1 } };
  sway.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uSway = uniforms.uSway;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uSway;')
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '#ifdef USE_INSTANCING',
        '  float swayPhase = uTime * 2.1 + float(gl_InstanceID) * 1.73;',
        '  float swayAmount = uSway * smoothstep(0.0, 8.0, transformed.y);',
        '  transformed.x += sin(swayPhase) * swayAmount * 1.5;',
        '  transformed.z += cos(swayPhase * 0.83) * swayAmount * 0.9;',
        '#endif',
      ].join('\n'));
  };
  sway.userData.swayUniforms = uniforms;
  return sway;
}

/** Advance wind time; freeze sway entirely under reduced motion. */
export function updateSway(materials: readonly THREE.MeshLambertMaterial[], time: number, reduceMotion: boolean): void {
  for (const mat of materials) {
    const uniforms = mat.userData.swayUniforms as { uTime: { value: number }; uSway: { value: number } } | undefined;
    if (!uniforms) continue;
    uniforms.uTime.value = time;
    uniforms.uSway.value = reduceMotion ? 0 : 1;
  }
}

export function addWorldScatter(scene: THREE.Scene): THREE.MeshLambertMaterial[] {
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  const swayMaterials: THREE.MeshLambertMaterial[] = [];

  // Grass tufts.
  const grassMaterial = createSwayMaterial('#6f9a52');
  swayMaterials.push(grassMaterial);
  const grassColors = ['#6f9a52', '#7aa65a', '#5f8a49', '#86a95c'];
  const grassPositions = scatterPositions(420, 1);
  const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(1.9, 7.5, 3), grassMaterial, grassPositions.length);
  grass.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  grassPositions.forEach(([x, z], index) => {
    transform.position.set(x, 3.2 + (index % 3), z);
    transform.rotation.set((index % 5) * 0.06 - 0.12, index * 0.61, (index % 7) * 0.05 - 0.15);
    transform.scale.set(1 + (index % 4) * 0.22, 0.8 + (index % 5) * 0.14, 1);
    transform.updateMatrix();
    grass.setMatrixAt(index, transform.matrix);
    grass.setColorAt(index, color.set(grassColors[index % grassColors.length]));
  });
  grass.receiveShadow = true;
  scene.add(grass);

  // Reeds ringing the two ponds.
  const reedMaterial = createSwayMaterial('#8fae62');
  swayMaterials.push(reedMaterial);
  const ponds = [
    { x: 170, z: 640, rx: 132, rz: 88 },
    { x: 2580, z: 790, rx: 166, rz: 118 },
  ];
  const reedCount = 64;
  const reeds = new THREE.InstancedMesh(new THREE.ConeGeometry(1.1, 13, 3), reedMaterial, reedCount);
  reeds.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  for (let index = 0; index < reedCount; index++) {
    const pond = ponds[index % ponds.length];
    const angle = (index / reedCount) * Math.PI * 2 + (index % 3) * 0.35;
    const spread = 1.05 + ((index * 37) % 17) / 100;
    const x = pond.x + Math.cos(angle) * pond.rx * spread;
    const z = pond.z + Math.sin(angle) * pond.rz * spread;
    transform.position.set(x, 6, z);
    transform.rotation.set((index % 5) * 0.05 - 0.1, index * 1.7, (index % 4) * 0.06 - 0.09);
    transform.scale.set(1, 0.75 + (index % 4) * 0.16, 1);
    transform.updateMatrix();
    reeds.setMatrixAt(index, transform.matrix);
    reeds.setColorAt(index, color.set(index % 3 === 0 ? '#a3b86a' : '#8fae62'));
  }
  reeds.receiveShadow = true;
  scene.add(reeds);

  // Rocks.
  const rocks = makeInstanceMesh(new THREE.DodecahedronGeometry(2.6, 0), '#8d9384', 90);
  rocks.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const rockColors = ['#8d9384', '#7f857a', '#9aa093'];
  scatterPositions(90, 2).forEach(([x, z], index) => {
    transform.position.set(x, 1.4, z);
    transform.rotation.set(index * 0.7, index * 1.3, index * 0.4);
    transform.scale.set(0.6 + (index % 4) * 0.3, 0.5 + (index % 3) * 0.25, 0.6 + (index % 5) * 0.2);
    transform.updateMatrix();
    rocks.setMatrixAt(index, transform.matrix);
    rocks.setColorAt(index, color.set(rockColors[index % rockColors.length]));
  });
  scene.add(rocks);

  return swayMaterials;
}
