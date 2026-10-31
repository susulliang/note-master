import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * CC0 asset pipeline (see public/assets/commune/CREDITS.md for licenses).
 * Files are expected at /assets/commune/{buildings,animals}/*.glb; any missing
 * file resolves to null and the renderer falls back to procedural models.
 */

const BUILDING_FILES = [
  'building-1.glb', 'building-2.glb', 'building-3.glb', 'building-4.glb',
  'building-5.glb', 'building-6.glb', 'building-7.glb', 'building-8.glb',
];
const CAT_FILES = ['cat-1.glb', 'cat-2.glb', 'cat-3.glb'];

function loadScene(loader: GLTFLoader, url: string): Promise<THREE.Group | null> {
  return new Promise((resolve) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, () => resolve(null));
  });
}

export async function loadCommuneModels(): Promise<{
  buildings: (THREE.Group | null)[];
  cats: (THREE.Group | null)[];
  dog: THREE.Group | null;
}> {
  const loader = new GLTFLoader();
  const buildings = await Promise.all(
    BUILDING_FILES.map((file) => loadScene(loader, `/assets/commune/buildings/${file}`))
  );
  const cats = await Promise.all(
    CAT_FILES.map((file) => loadScene(loader, `/assets/commune/animals/${file}`))
  );
  const dog = await loadScene(loader, '/assets/commune/animals/dog-1.glb');
  return { buildings, cats, dog };
}

/**
 * Flatten a model into one geometry. When the model is textured, the first
 * texture map is returned alongside so the renderer can keep it; otherwise
 * material colors are baked into vertex colors (drops UVs).
 */
function mergeSceneToGeometry(root: THREE.Object3D): { geometry: THREE.BufferGeometry; textureMap: THREE.Texture | null } | null {
  root.updateMatrixWorld(true);
  const sources: THREE.BufferGeometry[] = [];
  const color = new THREE.Color();
  let textureMap: THREE.Texture | null = null;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material;
    if (!Array.isArray(material) && material?.map) textureMap = material.map;
    const keepUv = !!textureMap;
    const geometry = (object.geometry.index
      ? object.geometry.toNonIndexed()
      : object.geometry.clone()
    ).applyMatrix4(object.matrixWorld);
    color.set(0xffffff);
    if (!Array.isArray(material)) {
      const maybe = material as THREE.MeshStandardMaterial;
      if (maybe.color) color.copy(maybe.color);
    }
    const vertexCount = geometry.getAttribute('position').count;
    if (!textureMap) {
      const colors = new Float32Array(vertexCount * 3);
      for (let index = 0; index < vertexCount; index++) {
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'color' && !(keepUv && name === 'uv')) {
        geometry.deleteAttribute(name);
      }
    }
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    sources.push(geometry);
  });
  if (sources.length === 0) return null;
  const merged = mergeGeometries(sources, false);
  sources.forEach((geometry) => geometry.dispose());
  if (!merged) return null;
  return { geometry: merged, textureMap };
}

/**
 * Normalize a CC0 cat model to the commune's pet scale: forward = +X,
 * pivot at ground center, length ≈ 20 world units. Returns null when the
 * model has no usable mesh (or is skinned-only).
 */
export function prepareCatGeometry(root: THREE.Object3D): PreparedAnimalGeometry | null {
  return prepareQuadrupedGeometry(root, 20);
}

/** Husko replacement: CC0 dog normalized to the giant-husky footprint. */
export function prepareDogGeometry(root: THREE.Object3D): PreparedAnimalGeometry | null {
  return prepareQuadrupedGeometry(root, 104);
}

export interface PreparedAnimalGeometry {
  geometry: THREE.BufferGeometry;
  textureMap: THREE.Texture | null;
}

function prepareQuadrupedGeometry(root: THREE.Object3D, length: number): PreparedAnimalGeometry | null {
  const hasSkinnedOnly = (() => {
    let skinned = 0;
    let plain = 0;
    root.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) skinned++;
      else if (object instanceof THREE.Mesh) plain++;
    });
    return skinned > 0 && plain === 0;
  })();
  if (hasSkinnedOnly) return null;
  const merged = mergeSceneToGeometry(root);
  if (!merged) return null;
  // glTF convention: front = +Z → rotate to our pets' +X forward.
  const geometry = merged.geometry;
  geometry.rotateY(Math.PI / 2);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return null;
  const size = box.getSize(new THREE.Vector3());
  const scale = length / Math.max(size.x, 0.001);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  const box2 = geometry.boundingBox;
  if (!box2) return null;
  const center = box2.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -box2.min.y, -center.z);
  geometry.computeBoundingSphere();
  return { geometry, textureMap: merged.textureMap };
}
