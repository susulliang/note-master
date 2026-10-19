import * as THREE from 'three';

const WORLD_W = 3200;
const WORLD_H = 2400;
const MAX_ACTORS = 256;
const TEMP_COLOR = new THREE.Color();
const DAY_BACKGROUND = new THREE.Color('#78956f');
const NIGHT_BACKGROUND = new THREE.Color('#24344d');
const LANDMARKS = [
  { text: 'TOWN HALL', x: 800, z: 155, height: 132 },
  { text: 'SPICE STORE', x: 270, z: 298, height: 110 },
  { text: 'ARCADE', x: 1330, z: 298, height: 110 },
  { text: 'DUCK BOROUGH', x: 2580, z: 780, height: 80 },
  { text: 'ODDITY ORCHARD', x: 1870, z: 1190, height: 80 },
  { text: 'STAR OVERLOOK', x: 2700, z: 1640, height: 80 },
];

type AvatarColors = {
  hair?: string;
  shirt?: string;
  bottomColor?: string;
  shoes?: string;
};

type RenderActor = {
  x: number;
  y: number;
  name: string;
  hue: number;
  moving?: boolean;
  bobPhase?: number;
  avatar?: AvatarColors | null;
  admin?: boolean;
  status?: string;
  says?: { text: string; until: number } | null;
  carId?: string | null;
  carSeat?: number | null;
};

type RenderCar = {
  id: string;
  x: number;
  y: number;
  heading: number;
  body: string;
  trim: string;
};

type RenderPet = { x: number; y: number; pet?: { mood?: number } | null; pose?: string };
type RenderDrop = { x: number; y: number };
type RenderDuck = { x: number; y: number; phase?: number };
type RenderDiscovery = { x: number; y: number };

export interface CommuneThreeFrame {
  time: number;
  zoom: number;
  player: RenderActor;
  npcs: readonly RenderActor[];
  remotes: readonly RenderActor[];
  pets: readonly RenderPet[];
  cars: readonly RenderCar[];
  drops: readonly RenderDrop[];
  ducks: readonly RenderDuck[];
  incident: RenderDiscovery | null;
  serendipity: RenderDiscovery | null;
  destination: RenderDiscovery | null;
  clickTarget: RenderDiscovery | null;
  nightOpacity: number;
  reduceMotion: boolean;
}

function material(color: THREE.ColorRepresentation): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

function addBox(
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
  parent.add(mesh);
  return mesh;
}

function addGroundDisc(
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
  parent.add(mesh);
  return mesh;
}

function addPath(
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
  parent.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
    color,
    side: THREE.DoubleSide,
    flatShading: true,
  })));
}

function addBuilding(
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
  parent.add(roof);
  addBox(parent, x, 4, z + depth * 0.505, width * 0.22, height * 0.58, 3, '#654a36');
}

function addTreeInstances(scene: THREE.Scene, positions: readonly [number, number][]): void {
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
  scene.add(trunk, canopy);
}

function makeInstanceMesh(
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

function setInstance(
  mesh: THREE.InstancedMesh,
  index: number,
  transform: THREE.Object3D,
  color?: THREE.ColorRepresentation
): void {
  transform.updateMatrix();
  mesh.setMatrixAt(index, transform.matrix);
  if (color) mesh.setColorAt(index, TEMP_COLOR.set(color));
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  small = false
): void {
  ctx.font = `${small ? 10 : 12}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const width = ctx.measureText(text).width + 14;
  const height = small ? 19 : 21;
  const left = Math.round(x - width / 2);
  const top = Math.round(y - height);
  ctx.fillStyle = 'rgba(18, 28, 22, 0.76)';
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, 6);
  ctx.fill();
  ctx.fillStyle = '#f5f4e9';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, top + height / 2, width - 8);
}

export class CommuneThreeRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 9000);
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly rayPoint = new THREE.Vector3();
  private readonly ndc = new THREE.Vector2();
  private readonly focus = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly backgroundColor = new THREE.Color();
  private readonly projectedPoint = new THREE.Vector3();
  private readonly transform = new THREE.Object3D();
  private readonly ambient: THREE.AmbientLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly actorBody: THREE.InstancedMesh;
  private readonly actorHead: THREE.InstancedMesh;
  private readonly actorHair: THREE.InstancedMesh;
  private readonly actorLegs: THREE.InstancedMesh;
  private readonly actorShadows: THREE.InstancedMesh;
  private readonly petBodies: THREE.InstancedMesh;
  private readonly petHeads: THREE.InstancedMesh;
  private readonly duckMeshes: THREE.InstancedMesh;
  private readonly dropMeshes: THREE.InstancedMesh;
  private readonly discoveryMeshes: THREE.InstancedMesh;
  private readonly cars = new Map<string, THREE.Group>();
  private readonly canvas: HTMLCanvasElement;
  private readonly labels: HTMLCanvasElement;
  private readonly labelCtx: CanvasRenderingContext2D;
  private readonly actors: RenderActor[] = [];
  private readonly actorIds: string[] = [];
  private readonly visualPositions = new Map<string, { x: number; z: number }>();
  private readonly actorColorSlots: { id: string; shirt: string | number; hair: string; bottom: string }[] = [];
  private readonly liveActorIds = new Set<string>();
  private width = 0;
  private height = 0;
  private pixelRatio = 1;
  private labelPixelRatio = 1;
  private lastRenderTime = 0;
  private cameraReady = false;
  private readonly maxPixelRatio = 1.35;

  static create(canvas: HTMLCanvasElement, labels: HTMLCanvasElement): CommuneThreeRenderer | null {
    let context: WebGL2RenderingContext | null = null;
    const labelContext = labels.getContext('2d', { alpha: true, desynchronized: true });
    if (!labelContext) return null;
    try {
      context = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
      if (!context) return null;
      return new CommuneThreeRenderer(canvas, context, labels, labelContext);
    } catch {
      return null;
    }
  }

  private constructor(
    canvas: HTMLCanvasElement,
    context: WebGL2RenderingContext,
    labels: HTMLCanvasElement,
    labelContext: CanvasRenderingContext2D
  ) {
    this.canvas = canvas;
    this.labels = labels;
    this.labelCtx = labelContext;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor('#78956f');
    this.camera.up.set(0, 1, 0);

    this.ambient = new THREE.AmbientLight('#e4f1d8', 1.35);
    this.sun = new THREE.DirectionalLight('#fff2d4', 1.5);
    this.sun.position.set(-500, 1500, 750);
    this.scene.add(this.ambient, this.sun);
    this.buildWorld();

    this.actorBody = makeInstanceMesh(new THREE.CapsuleGeometry(8, 10, 2, 5), '#ffffff', MAX_ACTORS);
    this.actorHead = makeInstanceMesh(new THREE.DodecahedronGeometry(9, 0), '#e9c49e', MAX_ACTORS);
    this.actorHair = makeInstanceMesh(new THREE.DodecahedronGeometry(10, 0), '#493a33', MAX_ACTORS);
    this.actorLegs = makeInstanceMesh(new THREE.BoxGeometry(6, 12, 6), '#353b42', MAX_ACTORS * 2);
    this.actorShadows = makeInstanceMesh(new THREE.CircleGeometry(12, 7), '#15251c', MAX_ACTORS, true);
    this.scene.add(this.actorShadows, this.actorLegs, this.actorBody, this.actorHead, this.actorHair);

    this.petBodies = makeInstanceMesh(new THREE.DodecahedronGeometry(8, 0), '#d5c2a1', MAX_ACTORS);
    this.petHeads = makeInstanceMesh(new THREE.DodecahedronGeometry(5, 0), '#d5c2a1', MAX_ACTORS);
    this.duckMeshes = makeInstanceMesh(new THREE.DodecahedronGeometry(7, 0), '#e8c56a', 64);
    this.dropMeshes = makeInstanceMesh(new THREE.OctahedronGeometry(7, 0), '#e6ad48', 96);
    this.discoveryMeshes = makeInstanceMesh(new THREE.OctahedronGeometry(9, 0), '#8fe0b0', 2);
    this.scene.add(this.petBodies, this.petHeads, this.duckMeshes, this.dropMeshes, this.discoveryMeshes);

    this.addMarkerMeshes();
    this.buildCars();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (width <= 0 || height <= 0) return;
    const cssPixels = Math.max(1, width * height);
    this.pixelRatio = Math.max(
      0.85,
      Math.min(window.devicePixelRatio || 1, this.maxPixelRatio, Math.sqrt(3_000_000 / cssPixels))
    );
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height, false);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.labelPixelRatio = Math.min(this.pixelRatio, 1);
    const pixelWidth = Math.round(width * this.labelPixelRatio);
    const pixelHeight = Math.round(height * this.labelPixelRatio);
    if (this.labels.width !== pixelWidth) this.labels.width = pixelWidth;
    if (this.labels.height !== pixelHeight) this.labels.height = pixelHeight;
    this.labels.style.width = `${width}px`;
    this.labels.style.height = `${height}px`;
    this.camera.left = -height * (width / height) * 1.05;
    this.camera.right = height * (width / height) * 1.05;
    this.camera.top = height * 1.05;
    this.camera.bottom = -height * 1.05;
    this.camera.updateProjectionMatrix();
  }

  screenToWorld(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } | null {
    if (!this.width || !this.height) return null;
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const point = this.raycaster.ray.intersectPlane(this.groundPlane, this.rayPoint);
    if (!point) return null;
    return {
      x: THREE.MathUtils.clamp(point.x, 0, WORLD_W),
      y: THREE.MathUtils.clamp(point.z, 0, WORLD_H),
    };
  }

  render(frame: CommuneThreeFrame): void {
    if (!this.width || !this.height) return;
    const zoom = THREE.MathUtils.clamp(frame.zoom, 0.7, 2.2);
    if (Math.abs(this.camera.zoom - zoom) > 0.001) {
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
    }
    const delta = this.lastRenderTime
      ? THREE.MathUtils.clamp(frame.time - this.lastRenderTime, 0, 0.05)
      : 1 / 60;
    this.lastRenderTime = frame.time;
    const follow = frame.reduceMotion ? 1 : 1 - Math.exp(-delta * 7);
    if (!this.cameraReady) {
      this.focus.set(frame.player.x, 0, frame.player.y);
      this.cameraReady = true;
    } else {
      this.focus.x += (frame.player.x - this.focus.x) * follow;
      this.focus.z += (frame.player.y - this.focus.z) * follow;
    }
    this.lookAt.set(this.focus.x, 0, this.focus.z);
    this.camera.position.set(this.focus.x + 1150, 1450, this.focus.z + 1150);
    this.camera.lookAt(this.lookAt);
    this.camera.updateMatrixWorld();

    const night = THREE.MathUtils.clamp(frame.nightOpacity / 0.54, 0, 1);
    this.ambient.intensity = 1.35 - night * 0.78;
    this.sun.intensity = 1.5 - night * 1.1;
    this.scene.background = this.backgroundColor.copy(DAY_BACKGROUND).lerp(NIGHT_BACKGROUND, night);

    this.updateCars(frame.cars);
    this.updateActors(frame, 1 - Math.exp(-delta * 26));
    this.updatePets(frame.pets, frame.time);
    this.updateMarkers(frame, frame.time);
    this.drawLabels(frame);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((entry) => entry.dispose());
      }
    });
  }

  private buildWorld(): void {
    this.scene.add(new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_W, WORLD_H),
      material('#78976b')
    ));
    this.scene.children.at(-1)!.rotation.x = -Math.PI / 2;
    this.scene.children.at(-1)!.position.set(WORLD_W / 2, -5, WORLD_H / 2);

    addGroundDisc(this.scene, 800, 620, 320, 270, '#b9b18b', 5, 32);
    addGroundDisc(this.scene, 800, 620, 278, 232, '#c6bc91', 2, 32);
    addGroundDisc(this.scene, 170, 640, 132, 88, '#486e62', 7, 20);
    addGroundDisc(this.scene, 170, 640, 112, 70, '#4d9090', 4, 20);
    addGroundDisc(this.scene, 2580, 790, 166, 118, '#486e62', 7, 20);
    addGroundDisc(this.scene, 2580, 790, 146, 98, '#4d9090', 4, 20);

    const pathColor = '#c6b58a';
    addPath(this.scene, [[800, 630], [800, 370], [800, 230]], 54, pathColor);
    addPath(this.scene, [[600, 625], [380, 470], [272, 390]], 46, pathColor);
    addPath(this.scene, [[1000, 625], [1220, 470], [1330, 390]], 46, pathColor);
    addPath(this.scene, [[800, 850], [800, 1040], [800, 1180]], 44, pathColor);
    addPath(this.scene, [[940, 680], [1350, 680], [1700, 680], [2110, 720], [2440, 790]], 40, pathColor);
    addPath(this.scene, [[1510, 680], [1630, 1000], [1830, 1280]], 38, pathColor);
    addPath(this.scene, [[1900, 1380], [2250, 1500], [2660, 1760]], 38, pathColor);
    addPath(this.scene, [[1440, 1050], [1460, 1420], [1580, 1770], [1840, 2040]], 38, pathColor);

    addBuilding(this.scene, 800, 155, 300, 146, '#d6c7a0', '#ab7050', 112);
    addBuilding(this.scene, 270, 298, 174, 174, '#cfb68d', '#6e7770', 92);
    addBuilding(this.scene, 1330, 298, 174, 174, '#c0c8b0', '#687d84', 92);
    addBuilding(this.scene, 230, 954, 158, 164, '#cdbd9c', '#9c7956', 78);
    addBuilding(this.scene, 1370, 954, 158, 164, '#bac8ae', '#6d8466', 78);
    addBuilding(this.scene, 2420, 680, 112, 84, '#d0bd91', '#817c69', 60);
    addBuilding(this.scene, 1855, 1328, 98, 86, '#b6bd91', '#7e8b62', 54);
    addBuilding(this.scene, 2700, 1768, 98, 86, '#bdc4d0', '#657b8f', 58);

    this.addFountain();
    this.addBoardAndStall();
    this.addBenchesAndFences();
    this.addFlowers();

    const treePositions: [number, number][] = [
      [480, 208], [1120, 208], [560, 260], [1040, 260],
      [64, 470], [1536, 470], [64, 872], [1536, 872],
      [600, 1128], [1000, 1128],
      [1740, 250], [1830, 310], [1940, 235], [2070, 285], [2180, 220],
      [2350, 310], [2480, 250], [2800, 240], [2940, 310],
      [1670, 1120], [1780, 1080], [1900, 1120], [2050, 1150],
      [1630, 2050], [1760, 2110], [1900, 2040], [2050, 2120],
      [2290, 2220], [2460, 2130], [2660, 2200], [2840, 2110], [3000, 2210],
      [1480, 1440],
    ];
    addTreeInstances(this.scene, treePositions);
  }

  private addFountain(): void {
    addGroundDisc(this.scene, 800, 600, 98, 98, '#8e987b', 9, 16);
    addGroundDisc(this.scene, 800, 600, 77, 77, '#668d91', 6, 16);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(18, 24, 28, 7), material('#d2c39b'));
    plinth.position.set(800, 20, 600);
    this.scene.add(plinth);
    const top = new THREE.Mesh(new THREE.DodecahedronGeometry(14, 0), material('#ead68c'));
    top.position.set(800, 42, 600);
    this.scene.add(top);
  }

  private addBoardAndStall(): void {
    addBox(this.scene, 800, 3, 342, 14, 74, 14, '#715638');
    addBox(this.scene, 800, 44, 342, 172, 84, 16, '#795a3b');
    addBox(this.scene, 800, 51, 332, 150, 60, 5, '#d6c493');
    addBox(this.scene, 400, 8, 730, 148, 44, 76, '#906c4a');
    addBox(this.scene, 400, 54, 730, 162, 8, 86, '#c7a876');
    addBox(this.scene, 400, 62, 690, 158, 8, 22, '#738453');
    addBox(this.scene, 332, 4, 734, 8, 66, 8, '#75563d');
    addBox(this.scene, 468, 4, 734, 8, 66, 8, '#75563d');
  }

  private addBenchesAndFences(): void {
    for (const [x, z] of [[660, 480], [940, 480], [640, 940], [960, 940]]) {
      addBox(this.scene, x, 10, z, 62, 8, 20, '#8d6342');
      addBox(this.scene, x, 18, z - 10, 62, 28, 8, '#9a7048');
    }
    addBox(this.scene, 212, 0, 1062, 246, 20, 10, '#829066');
    addBox(this.scene, 1418, 0, 1062, 216, 20, 10, '#829066');
  }

  private addFlowers(): void {
    const geometry = new THREE.OctahedronGeometry(3.5, 0);
    const flowers = new THREE.InstancedMesh(geometry, material('#f1d889'), 90);
    flowers.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const transform = new THREE.Object3D();
    for (let index = 0; index < 90; index++) {
      const x = 80 + ((index * 197) % 3040);
      const z = 80 + ((index * 313) % 2240);
      transform.position.set(x, 4, z);
      transform.scale.set(1, 0.6, 1);
      transform.updateMatrix();
      flowers.setMatrixAt(index, transform.matrix);
      flowers.setColorAt(index, new THREE.Color(index % 3 === 0 ? '#d78d79' : index % 3 === 1 ? '#f1d889' : '#ede6c5'));
    }
    this.scene.add(flowers);
  }

  private addMarkerMeshes(): void {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(22, 2.5, 4, 20),
      new THREE.MeshBasicMaterial({ color: '#f6db7e' })
    );
    ring.name = 'destination-marker';
    ring.rotation.x = Math.PI / 2;
    ring.visible = false;
    this.scene.add(ring);
    const click = new THREE.Mesh(
      new THREE.CylinderGeometry(12, 12, 2, 8),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.62 })
    );
    click.name = 'click-marker';
    click.position.y = 2;
    click.visible = false;
    this.scene.add(click);
  }

  private buildCars(): void {
    for (const id of ['meadow-cruiser', 'orchard-wagon']) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(64, 25, 102), material(id === 'meadow-cruiser' ? '#6288a4' : '#b76552'));
      body.position.y = 24;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(42, 24, 50), material(id === 'meadow-cruiser' ? '#d5e2e7' : '#f0d7b3'));
      cabin.position.set(0, 46, -6);
      group.add(body, cabin);
      for (const x of [-31, 31]) {
        for (const z of [-32, 32]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 7, 6), material('#30353a'));
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(x, 14, z);
          group.add(wheel);
        }
      }
      group.visible = false;
      this.cars.set(id, group);
      this.scene.add(group);
    }
  }

  private updateCars(cars: readonly RenderCar[]): void {
    for (const car of cars) {
      const group = this.cars.get(car.id);
      if (!group) continue;
      group.visible = true;
      group.position.set(car.x, 0, car.y);
      group.rotation.y = -car.heading;
    }
  }

  private updateActors(frame: CommuneThreeFrame, positionAlpha: number): void {
    this.actors.length = 0;
    this.actorIds.length = 0;
    this.actors.push(frame.player);
    this.actorIds.push(frame.player.name);
    for (const npc of frame.npcs) {
      this.actors.push(npc);
      this.actorIds.push(npc.name);
    }
    for (const remote of frame.remotes) {
      this.actors.push(remote);
      this.actorIds.push(remote.name);
    }
    const count = Math.min(this.actors.length, MAX_ACTORS);
    const now = frame.time;
    this.liveActorIds.clear();
    let colorsChanged = false;
    for (let index = 0; index < count; index++) {
      const actor = this.actors[index];
      const actorId = this.actorIds[index];
      this.liveActorIds.add(actorId);
      const car = actor.carId ? this.cars.get(actor.carId) : null;
      const carX = car?.position.x ?? actor.x;
      const carZ = car?.position.z ?? actor.y;
      const seatOffset = actor.carSeat ? (actor.carSeat === 1 ? -14 : 14) : 0;
      const targetX = carX + seatOffset;
      const targetZ = carZ;
      let visual = this.visualPositions.get(actorId);
      if (!visual) {
        visual = { x: targetX, z: targetZ };
        this.visualPositions.set(actorId, visual);
      } else {
        visual.x += (targetX - visual.x) * positionAlpha;
        visual.z += (targetZ - visual.z) * positionAlpha;
      }
      const stride = actor.moving && !frame.reduceMotion
        ? Math.sin(now * 10 + (actor.bobPhase ?? 0)) * 3.5
        : 0;
      const bob = actor.moving && !frame.reduceMotion
        ? Math.abs(Math.sin(now * 10 + (actor.bobPhase ?? 0))) * 2
        : 0;
      const x = visual.x;
      const z = visual.z;
      const shirtColor = actor.avatar?.shirt ?? actor.hue;
      const hairColor = actor.avatar?.hair ?? '#493a33';
      const bottomColor = actor.avatar?.bottomColor ?? '#424a4e';
      const previousColors = this.actorColorSlots[index];
      if (
        !previousColors
        || previousColors.id !== actorId
        || previousColors.shirt !== shirtColor
        || previousColors.hair !== hairColor
        || previousColors.bottom !== bottomColor
      ) {
        if (typeof shirtColor === 'number') {
          TEMP_COLOR.setHSL(((shirtColor % 360) + 360) % 360 / 360, 0.52, 0.48);
          this.actorBody.setColorAt(index, TEMP_COLOR);
        } else {
          this.actorBody.setColorAt(index, TEMP_COLOR.set(shirtColor));
        }
        this.actorHair.setColorAt(index, TEMP_COLOR.set(hairColor));
        for (let leg = 0; leg < 2; leg++) {
          this.actorLegs.setColorAt(index * 2 + leg, TEMP_COLOR.set(bottomColor));
        }
        const slot = previousColors ?? { id: '', shirt: '', hair: '', bottom: '' };
        slot.id = actorId;
        slot.shirt = shirtColor;
        slot.hair = hairColor;
        slot.bottom = bottomColor;
        this.actorColorSlots[index] = slot;
        colorsChanged = true;
      }

      this.transform.position.set(x, 25 + bob, z);
      this.transform.rotation.set(0, 0, 0);
      this.transform.scale.set(car ? 0.74 : 1, car ? 0.74 : 1, car ? 0.74 : 1);
      setInstance(this.actorBody, index, this.transform);

      this.transform.position.set(x, 43 + bob, z);
      this.transform.rotation.set(0, 0, 0);
      this.transform.scale.set(1, 1, 1);
      setInstance(this.actorHead, index, this.transform);

      this.transform.position.set(x, 51 + bob, z - 1);
      this.transform.rotation.set(0, 0, 0);
      this.transform.scale.set(1.02, 0.34, 0.92);
      setInstance(this.actorHair, index, this.transform);

      this.transform.position.set(x, 2, z);
      this.transform.rotation.set(-Math.PI / 2, 0, 0);
      this.transform.scale.set(1, 1, 1);
      setInstance(this.actorShadows, index, this.transform);

      for (let leg = 0; leg < 2; leg++) {
        const legIndex = index * 2 + leg;
        this.transform.position.set(x + (leg ? 4 : -4), 9 + bob, z + (leg ? stride : -stride));
        this.transform.rotation.set(0, 0, 0);
        this.transform.scale.set(1, 1, 1);
        setInstance(this.actorLegs, legIndex, this.transform);
      }
    }
    this.actorBody.count = count;
    this.actorHead.count = count;
    this.actorHair.count = count;
    this.actorShadows.count = count;
    this.actorLegs.count = count * 2;
    for (const mesh of [this.actorBody, this.actorHead, this.actorHair, this.actorLegs, this.actorShadows]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (colorsChanged) {
      for (const mesh of [this.actorBody, this.actorHair, this.actorLegs]) {
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
    for (const actorId of this.visualPositions.keys()) {
      if (!this.liveActorIds.has(actorId)) this.visualPositions.delete(actorId);
    }
  }

  private updatePets(pets: readonly RenderPet[], time: number): void {
    const count = Math.min(pets.length, MAX_ACTORS);
    for (let index = 0; index < count; index++) {
      const pet = pets[index];
      const bob = Math.sin(time * 3 + index) * 1.6;
      this.transform.position.set(pet.x, 9 + bob, pet.y);
      this.transform.rotation.set(0, 0, 0);
      this.transform.scale.set(1.2, 0.8, 1);
      setInstance(this.petBodies, index, this.transform, pet.pet?.mood !== undefined && pet.pet.mood < 25 ? '#9b9a92' : '#d5c2a1');
      this.transform.position.set(pet.x + 8, 12 + bob, pet.y - 2);
      this.transform.rotation.set(0, 0, 0);
      this.transform.scale.set(0.7, 0.7, 0.7);
      setInstance(this.petHeads, index, this.transform, '#ded0b7');
    }
    this.petBodies.count = count;
    this.petHeads.count = count;
    this.petBodies.instanceMatrix.needsUpdate = true;
    this.petHeads.instanceMatrix.needsUpdate = true;
    if (this.petBodies.instanceColor) this.petBodies.instanceColor.needsUpdate = true;
    if (this.petHeads.instanceColor) this.petHeads.instanceColor.needsUpdate = true;
  }

  private updateMarkers(frame: CommuneThreeFrame, time: number): void {
    const duckCount = Math.min(frame.ducks.length, 64);
    for (let index = 0; index < duckCount; index++) {
      const duck = frame.ducks[index];
      this.transform.position.set(duck.x, 8 + Math.sin(time * 2 + (duck.phase ?? 0)) * 1.4, duck.y);
      this.transform.rotation.set(0, 0, 0);
      this.transform.scale.set(1.3, 0.75, 1);
      setInstance(this.duckMeshes, index, this.transform, '#e8c56a');
    }
    this.duckMeshes.count = duckCount;
    this.duckMeshes.instanceMatrix.needsUpdate = true;
    if (this.duckMeshes.instanceColor) this.duckMeshes.instanceColor.needsUpdate = true;

    const dropCount = Math.min(frame.drops.length, 96);
    for (let index = 0; index < dropCount; index++) {
      const drop = frame.drops[index];
      this.transform.position.set(drop.x, 10 + Math.sin(time * 3 + index) * 2, drop.y);
      this.transform.rotation.set(0, time + index, 0);
      this.transform.scale.set(1, 1, 1);
      setInstance(this.dropMeshes, index, this.transform, index % 3 === 0 ? '#7ed7a1' : '#e6ad48');
    }
    this.dropMeshes.count = dropCount;
    this.dropMeshes.instanceMatrix.needsUpdate = true;
    if (this.dropMeshes.instanceColor) this.dropMeshes.instanceColor.needsUpdate = true;

    let discoveryCount = 0;
    if (frame.incident) {
      const item = frame.incident;
      this.transform.position.set(item.x, 20 + Math.sin(time * 3) * 3, item.y);
      this.transform.rotation.set(0, time, 0);
      this.transform.scale.set(1, 1, 1);
      setInstance(this.discoveryMeshes, discoveryCount++, this.transform, '#f4cc72');
    }
    if (frame.serendipity) {
      const item = frame.serendipity;
      this.transform.position.set(item.x, 20 + Math.sin(time * 3) * 3, item.y);
      this.transform.rotation.set(0, time, 0);
      this.transform.scale.set(1, 1, 1);
      setInstance(this.discoveryMeshes, discoveryCount++, this.transform, '#8fe0b0');
    }
    this.discoveryMeshes.count = discoveryCount;
    this.discoveryMeshes.instanceMatrix.needsUpdate = true;
    if (this.discoveryMeshes.instanceColor) this.discoveryMeshes.instanceColor.needsUpdate = true;

    const destination = this.scene.getObjectByName('destination-marker');
    if (destination) {
      destination.visible = !!frame.destination;
      if (frame.destination) {
        destination.position.set(frame.destination.x, 3, frame.destination.y);
        destination.rotation.z = Math.sin(time * 2) * 0.08;
      }
    }
    const click = this.scene.getObjectByName('click-marker');
    if (click) {
      click.visible = !!frame.clickTarget;
      if (frame.clickTarget) click.position.set(frame.clickTarget.x, 2, frame.clickTarget.y);
    }
  }

  private drawLabels(frame: CommuneThreeFrame): void {
    const ctx = this.labelCtx;
    ctx.setTransform(this.labelPixelRatio, 0, 0, this.labelPixelRatio, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    for (const landmark of LANDMARKS) {
      this.projectedPoint.set(landmark.x, landmark.height, landmark.z).project(this.camera);
      const point = this.projectedPoint;
      if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1.08 || Math.abs(point.y) > 1.1) continue;
      drawLabel(
        ctx,
        (point.x * 0.5 + 0.5) * this.width,
        (-point.y * 0.5 + 0.5) * this.height,
        landmark.text,
        true
      );
    }
    const drawActorLabel = (actor: RenderActor) => {
      if (actor.carId) return;
      this.projectedPoint.set(actor.x, 66, actor.y).project(this.camera);
      const point = this.projectedPoint;
      if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1.08 || Math.abs(point.y) > 1.1) return;
      const x = (point.x * 0.5 + 0.5) * this.width;
      const y = (-point.y * 0.5 + 0.5) * this.height;
      const name = actor.admin ? `★ ${actor.name}` : actor.name;
      drawLabel(ctx, x, y, name);
      if (actor.says && actor.says.until > Date.now()) {
        drawLabel(ctx, x, y - 25, actor.says.text.slice(0, 52), true);
      } else if (actor.status && (actor === frame.player || actor.status.length < 28)) {
        drawLabel(ctx, x, y - 23, actor.status.slice(0, 26), true);
      }
    };
    drawActorLabel(frame.player);
    for (const npc of frame.npcs) drawActorLabel(npc);
    for (const remote of frame.remotes) drawActorLabel(remote);
  }
}
