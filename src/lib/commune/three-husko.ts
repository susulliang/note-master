import * as THREE from 'three';
import { addBox } from './three-builders';
import { material } from './three-builders';
import type { RenderHusko } from './three-types';

/**
 * Husko the commune's giant husky. Voxel identity kept, but with a better
 * silhouette: neck, haunches, cheek fluff, husky brow markings, tilted ears
 * and a curled tail — all cheap boxes so the instanced/flat pipeline holds.
 */

export type HuskoRig = {
  root: THREE.Group;
  legs: THREE.Mesh[];
  tail: THREE.Mesh;
  ballMesh: THREE.Mesh;
  pooMeshes: THREE.Group[];
};

export function createHuskoRig(scene: THREE.Scene): HuskoRig {
  const root = new THREE.Group();
  root.name = 'husko';
  const coat = '#93a1ad';
  const dark = '#57646f';
  const light = '#edf1f4';

  const body = addBox(root, -6, 30, 0, 58, 26, 30, coat);
  body.name = 'body';
  addBox(root, 6, 26, 0, 34, 18, 32, light);            // chest / belly
  addBox(root, -20, 40, 0, 26, 14, 28, dark);           // saddle
  addBox(root, -32, 24, -16, 18, 22, 10, coat);         // haunch L
  addBox(root, -32, 24, 6, 18, 22, 10, coat);           // haunch R
  addBox(root, 22, 42, 0, 16, 20, 18, coat);            // neck
  const head = addBox(root, 36, 48, 0, 24, 22, 22, coat);
  head.name = 'head';
  addBox(root, 48, 42, 0, 16, 11, 11, light);           // snout
  addBox(root, 58, 44, 0, 4, 5, 5, '#20262c');          // nose
  addBox(root, 28, 42, -13, 10, 8, 5, light);           // cheek fluff L
  addBox(root, 28, 42, 8, 10, 8, 5, light);             // cheek fluff R
  const earL = addBox(root, 34, 62, -8, 5, 12, 4, dark);
  earL.rotation.x = 0.18;
  const earR = addBox(root, 34, 62, 8, 5, 12, 4, dark);
  earR.rotation.x = -0.18;
  addBox(root, 44, 56, -6, 6, 3, 5, light);             // brow marking L
  addBox(root, 44, 56, 6, 6, 3, 5, light);              // brow marking R
  addBox(root, 46, 52, -6, 3, 4, 3, '#6fb7e0');         // eye L (blue)
  addBox(root, 46, 52, 6, 3, 4, 3, '#6fb7e0');          // eye R
  const tail = addBox(root, -40, 46, 0, 10, 9, 9, coat);
  tail.name = 'tail';
  tail.rotation.z = -0.5;                               // curled up over the back
  addBox(root, -46, 53, 0, 8, 8, 8, light);             // tail tip
  const legs: THREE.Mesh[] = [];
  for (const [lx, lz] of [[20, -10], [20, 10], [-24, -10], [-24, 10]] as const) {
    legs.push(addBox(root, lx, 0, lz, 8, 30, 9, lx > 0 ? light : coat));
  }
  root.visible = false;
  scene.add(root);

  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(9, 10, 8), material('#e05a4e'));
  ballMesh.name = 'husko-ball';
  ballMesh.visible = false;
  scene.add(ballMesh);

  const pooMeshes: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const poo = new THREE.Group();
    addBox(poo, 0, 0, 0, 10, 7, 10, '#7a5b40');
    addBox(poo, 2, 7, 1, 6, 5, 6, '#6a4d35');
    poo.name = `husko-poo-${i}`;
    poo.visible = false;
    scene.add(poo);
    pooMeshes.push(poo);
  }

  return { root, legs, tail, ballMesh, pooMeshes };
}

export function updateHuskoRig(rig: HuskoRig, husko: RenderHusko | null, time: number): void {
  const { root, legs, tail, ballMesh, pooMeshes } = rig;
  if (!husko) {
    root.visible = false;
    ballMesh.visible = false;
    for (const poo of pooMeshes) poo.visible = false;
    return;
  }
  root.visible = true;
  root.position.set(husko.x, 0, husko.y);
  root.rotation.y = Math.atan2(husko.headingY ?? 1, husko.headingX ?? 0);

  // Pose by state.
  let bodySquash = 1;
  let rearSquat = 0;
  let sink = 0;
  if (husko.state === 'chill') bodySquash = 0.5;
  else if (husko.state === 'poo') { bodySquash = 0.82; rearSquat = 0.16; }
  else if (husko.state === 'swim') { bodySquash = 0.8; sink = 12; }
  root.scale.set(1, bodySquash, 1);
  root.position.y = -sink + rearSquat * 18;

  const bob = husko.moving
    ? Math.abs(Math.sin(husko.walkPhase)) * 4
    : Math.sin(time * 2.2) * 1.2 + (husko.state === 'zoomies' ? 3 : 0);
  root.position.y += bob;

  // Legs & tail.
  const swing = husko.moving ? Math.sin(husko.walkPhase) * 0.55 : 0;
  legs.forEach((leg, index) => {
    leg.rotation.z = index % 2 === 0 ? swing : -swing;
  });
  const wagSpeed = husko.state === 'chase-ball' || husko.state === 'eat' ? 14 : husko.happiness > 65 ? 9 : 4;
  tail.rotation.y = Math.sin(time * wagSpeed) * 0.6;

  // Ball + poos.
  ballMesh.visible = !!husko.ball;
  if (husko.ball) {
    ballMesh.position.set(husko.ball.x, 9 + Math.abs(Math.sin(time * 9)) * 5, husko.ball.y);
    ballMesh.rotation.x = time * 6;
  }
  const poos = husko.poos ?? [];
  for (let i = 0; i < pooMeshes.length; i++) {
    const poo = pooMeshes[i];
    const entry = poos[i];
    poo.visible = !!entry;
    if (entry) {
      poo.position.set(entry.x, 0, entry.y);
      poo.rotation.y = i * 1.3;
      const age = (Date.now() - entry.at) / 90_000;
      poo.scale.setScalar(Math.max(0.2, 1 - age));
    }
  }
}
