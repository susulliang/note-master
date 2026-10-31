import * as THREE from 'three';
import type { CommuneBuildable } from '@shared/commune-buildables';
import { TEMP_COLOR } from './three-constants';

/** Every opaque surface in the commune uses this one flat-shaded Lambert helper. */
export function material(color: THREE.ColorRepresentation): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

export function setConstructionOpacity(root: THREE.Object3D, opacity: number): void {
  if (root.userData.communeConstructionOpacity === opacity) return;
  root.userData.communeConstructionOpacity = opacity;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const entry of materials) {
      const data = entry.userData as Record<string, unknown>;
      if (typeof data.communeBaseOpacity !== 'number') data.communeBaseOpacity = entry.opacity;
      if (typeof data.communeBaseTransparent !== 'boolean') data.communeBaseTransparent = entry.transparent;
      if (typeof data.communeBaseDepthWrite !== 'boolean') data.communeBaseDepthWrite = entry.depthWrite;
      entry.opacity = Number(data.communeBaseOpacity) * opacity;
      entry.transparent = Boolean(data.communeBaseTransparent) || opacity < 1;
      entry.depthWrite = opacity < 1 ? false : Boolean(data.communeBaseDepthWrite);
      entry.needsUpdate = true;
    }
  });
}

export function addBox(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  color: THREE.ColorRepresentation
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(color));
  mesh.position.set(x, y + height / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function addGroundDisc(
  parent: THREE.Object3D,
  x: number,
  z: number,
  radiusX: number,
  radiusZ: number,
  color: THREE.ColorRepresentation,
  height = 2,
  segments = 24
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, height, segments),
    material(color)
  );
  mesh.scale.set(radiusX, 1, radiusZ);
  mesh.position.set(x, height / 2, z);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function addPath(
  parent: THREE.Object3D,
  points: readonly [number, number][],
  width: number,
  color: THREE.ColorRepresentation
): void {
  const vertices: number[] = [];
  for (let index = 0; index < points.length - 1; index++) {
    const [x1, z1] = points[index];
    const [x2, z2] = points[index + 1];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz) || 1;
    const nx = (-dz / length) * width / 2;
    const nz = (dx / length) * width / 2;
    vertices.push(
      x1 + nx, 1, z1 + nz,
      x1 - nx, 1, z1 - nz,
      x2 - nx, 1, z2 - nz,
      x1 + nx, 1, z1 + nz,
      x2 - nx, 1, z2 - nz,
      x2 + nx, 1, z2 + nz
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  const path = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
    color,
    side: THREE.DoubleSide,
    flatShading: true,
  }));
  path.receiveShadow = true;
  parent.add(path);
}

export function addBuilding(
  parent: THREE.Object3D,
  x: number,
  z: number,
  width: number,
  depth: number,
  wallColor: string,
  roofColor: string,
  height = 100
): void {
  addGroundDisc(parent, x, z, width * 0.58, depth * 0.64, '#587354', 3, 4);
  addBox(parent, x, 3, z, width, height, depth, wallColor);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.hypot(width, depth) * 0.48, height * 0.58, 4),
    material(roofColor)
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.set(x, height + height * 0.29 + 3, z);
  roof.castShadow = true;
  roof.receiveShadow = true;
  parent.add(roof);
  addBox(parent, x, 4, z + depth * 0.505, width * 0.22, height * 0.58, 3, '#654a36');
}

export function addTent(parent: THREE.Object3D, x: number, z: number, color: string): void {
  addGroundDisc(parent, x, z, 66, 54, '#55764e', 3, 8);
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(62, 82, 4),
    material(color),
  );
  canopy.rotation.y = Math.PI / 4;
  canopy.position.set(x, 43, z);
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  parent.add(canopy);
  addBox(parent, x, 3, z + 44, 25, 37, 4, '#443a30');
  addBox(parent, x - 28, 5, z + 27, 3, 52, 3, '#d6bd8d');
  addBox(parent, x + 28, 5, z + 27, 3, 52, 3, '#d6bd8d');
}

export function createBuildableModel(item: CommuneBuildable): THREE.Group {
  const group = new THREE.Group();
  const box = (x: number, y: number, z: number, width: number, height: number, depth: number, color: string) =>
    addBox(group, x, y, z, width, height, depth, color);
  const cylinder = (x: number, y: number, z: number, radius: number, height: number, color: string) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 8), material(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  if (item.kind === 'tent') {
    addTent(group, 0, 0, '#bd7b51');
  } else if (item.kind === 'tree') {
    addGroundDisc(group, 0, 0, 28, 25, '#526f48', 2, 8);
    box(0, 0, 0, 14, 54, 14, '#79573d');
    const crown = new THREE.Mesh(new THREE.ConeGeometry(34, 68, 6), material('#4e8153'));
    crown.position.set(0, 76, 0);
    crown.castShadow = true;
    group.add(crown);
    const upperCrown = new THREE.Mesh(new THREE.ConeGeometry(25, 50, 6), material('#68945d'));
    upperCrown.position.set(0, 91, 0);
    group.add(upperCrown);
  } else if (item.kind === 'beach-umbrella') {
    addGroundDisc(group, 0, 0, 32, 30, '#638b55', 2, 8);
    box(0, 0, 0, 5, 80, 5, '#785a3c');
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(42, 22, 8), material('#e47b67'));
    canopy.position.set(0, 75, 0);
    canopy.castShadow = true;
    group.add(canopy);
    box(0, 67, 0, 5, 3, 38, '#f4e1b5');
  } else if (item.kind === 'flowerbed') {
    addGroundDisc(group, 0, 0, 46, 33, '#587354', 2, 8);
    box(0, 2, 0, 78, 10, 49, '#805a3b');
    box(0, 12, 0, 66, 4, 37, '#4b4030');
    const colors = ['#d9778c', '#e6c55b', '#b88de0', '#f4ece0', '#e58b61', '#84b9a1'];
    colors.forEach((color, index) => {
      const x = (index % 3 - 1) * 22;
      const z = (Math.floor(index / 3) - 0.5) * 19;
      box(x, 15, z, 3, 15, 3, '#557947');
      const flower = new THREE.Mesh(new THREE.DodecahedronGeometry(6, 0), material(color));
      flower.position.set(x, 34, z);
      group.add(flower);
    });
  } else if (item.kind === 'garden-bench') {
    addGroundDisc(group, 0, 0, 48, 25, '#587354', 2, 8);
    box(0, 23, 0, 76, 8, 18, '#9b7049');
    box(0, 37, -7, 76, 21, 7, '#79573d');
    for (const x of [-30, 30]) {
      box(x, 3, 0, 6, 22, 6, '#594633');
      box(x, 3, -8, 6, 36, 6, '#594633');
    }
  } else if (item.kind === 'campfire') {
    addGroundDisc(group, 0, 0, 31, 29, '#526744', 2, 8);
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4;
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(8, 0), material('#9a8c72'));
      stone.position.set(Math.cos(angle) * 19, 6, Math.sin(angle) * 17);
      group.add(stone);
    }
    box(0, 8, 0, 8, 8, 34, '#79573d').rotation.y = 0.68;
    box(0, 8, 0, 8, 8, 34, '#8b623f').rotation.y = -0.68;
    const flame = new THREE.Mesh(new THREE.TetrahedronGeometry(18, 0), material('#f09a47'));
    flame.position.set(0, 26, 0);
    group.add(flame);
  } else if (item.kind === 'picnic-table') {
    addGroundDisc(group, 0, 0, 58, 40, '#587354', 2, 8);
    box(0, 36, 0, 92, 8, 39, '#a5794d');
    for (const x of [-31, 31]) {
      box(x, 5, 0, 6, 31, 6, '#684a34');
      box(x, 23, -32, 88, 7, 9, '#8d6441');
      box(x, 23, 32, 88, 7, 9, '#8d6441');
    }
  } else if (item.kind === 'paper-lantern') {
    addGroundDisc(group, 0, 0, 18, 17, '#526f48', 2, 8);
    box(0, 0, 0, 4, 66, 4, '#79573d');
    const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(14, 0), new THREE.MeshLambertMaterial({
      color: '#f4d48b',
      emissive: '#a77635',
      emissiveIntensity: 0.42,
      flatShading: true,
    }));
    lantern.position.set(0, 76, 0);
    group.add(lantern);
  } else if (item.kind === 'mini-fountain') {
    addGroundDisc(group, 0, 0, 42, 40, '#55764e', 2, 10);
    cylinder(0, 7, 0, 38, 13, '#a7afb2');
    cylinder(0, 15, 0, 28, 4, '#5798b5');
    cylinder(0, 32, 0, 9, 30, '#c5c9bd');
    const cap = new THREE.Mesh(new THREE.SphereGeometry(7, 7, 5), material('#8fc4d4'));
    cap.position.set(0, 50, 0);
    group.add(cap);
  }
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });
  return group;
}

export function addTreeInstances(scene: THREE.Scene, positions: readonly [number, number][]): void {
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(4, 6, 38, 5),
    material('#79573d'),
    positions.length
  );
  const canopy = new THREE.InstancedMesh(
    new THREE.ConeGeometry(32, 82, 5),
    material('#537d50'),
    positions.length
  );
  trunk.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  canopy.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const transform = new THREE.Object3D();
  const colors = ['#537d50', '#5f8957', '#688d58', '#4f764c'];
  positions.forEach(([x, z], index) => {
    transform.position.set(x, 20, z);
    transform.rotation.set(0, (index % 5) * 0.27, 0);
    transform.updateMatrix();
    trunk.setMatrixAt(index, transform.matrix);
    transform.position.set(x, 78, z);
    transform.scale.set(1 + (index % 3) * 0.08, 1 + (index % 4) * 0.06, 1);
    transform.updateMatrix();
    canopy.setMatrixAt(index, transform.matrix);
    canopy.setColorAt(index, new THREE.Color(colors[index % colors.length]));
    transform.scale.set(1, 1, 1);
  });
  trunk.computeBoundingSphere();
  canopy.computeBoundingSphere();
  trunk.castShadow = true;
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  scene.add(trunk, canopy);
}

export function makeInstanceMesh(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  capacity: number,
  transparent = false
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
    transparent,
    opacity: transparent ? 0.28 : 1,
    depthWrite: !transparent,
  }), capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  return mesh;
}

export function setInstance(
  mesh: THREE.InstancedMesh,
  index: number,
  transform: THREE.Object3D,
  color?: THREE.ColorRepresentation
): void {
  transform.updateMatrix();
  mesh.setMatrixAt(index, transform.matrix);
  if (color) mesh.setColorAt(index, TEMP_COLOR.set(color));
}
