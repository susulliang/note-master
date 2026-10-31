import * as THREE from 'three';

/**
 * Stylized pond water: one procedurally generated scrolling normal map
 * (DataTexture — no canvas upload) over a MeshPhongMaterial, so the sun
 * produces moving specular glints. Deliberately NOT planar-reflection Water:
 * that renders the scene twice; this costs one extra material.
 */

function makeWaterNormalTexture(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      // Tileable pseudo-noise height field via layered sines; derivative → normal.
      const dhdu = Math.cos(u * 3 + Math.sin(v * 2) * 1.5) * 0.9
        + Math.cos(u * 7 - v * 5) * 0.45
        + Math.cos(u * 2 + v * 8) * 0.28;
      const dhdv = Math.cos(v * 4 + Math.sin(u * 3)) * 0.9
        + Math.cos(v * 9 + u * 3) * 0.45
        + Math.cos(v * 3 - u * 6) * 0.28;
      const strength = 0.85;
      const nx = -dhdu * strength;
      const ny = -dhdv * strength;
      const nz = 1;
      const length = Math.hypot(nx, ny, nz);
      const index = (y * size + x) * 4;
      data[index] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
      data[index + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
      data[index + 2] = Math.round(((nz / length) * 0.5 + 0.5) * 255);
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.repeat.set(5, 5);
  texture.needsUpdate = true;
  return texture;
}

export function createWaterMaterial(): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color: '#4f9aa0',
    normalMap: makeWaterNormalTexture(),
    normalScale: new THREE.Vector2(0.55, 0.55),
    specular: new THREE.Color('#bfe8ef'),
    shininess: 130,
    flatShading: false,
  });
}

/** Flat water surface disc (UV-mapped circle so the normal map scrolls cleanly). */
export function createWaterSurface(
  material: THREE.MeshPhongMaterial,
  x: number,
  z: number,
  radiusX: number,
  radiusZ: number,
  y: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 28), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(radiusX, radiusZ, 1);
  mesh.position.set(x, y, z);
  return mesh;
}

/** Scroll the shared normal map — call once per frame. */
export function animateWater(material: THREE.MeshPhongMaterial, time: number): void {
  const map = material.normalMap;
  if (!map) return;
  map.offset.set((time * 0.018) % 1, (time * 0.011) % 1);
}
