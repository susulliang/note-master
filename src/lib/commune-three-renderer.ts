import * as THREE from 'three';

const WORLD_W = 3200;
const WORLD_H = 2400;
const MAX_ACTORS = 256;
const TEMP_COLOR = new THREE.Color();
const DAY_BACKGROUND = new THREE.Color('#78956f');
const NIGHT_BACKGROUND = new THREE.Color('#24344d');
const LANTERN_DAY_COLOR = new THREE.Color('#b28c50');
const LANTERN_NIGHT_COLOR = new THREE.Color('#ffe3a1');
const LANDMARKS = [
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
  superAdmin?: boolean;
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

type RenderPet = {
  x: number;
  y: number;
  catId?: string;
  stage?: string;
  moving?: boolean;
  pose?: string;
  emote?: string | null;
  walkPhase?: number;
  facingLeft?: boolean;
};
type RenderDrop = { x: number; y: number };
type RenderDuck = { x: number; y: number; phase?: number };
type RenderDiscovery = { x: number; y: number };
type RenderSoccerBall = {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  kickedAt: number;
  by: string | null;
};
type RenderPhysicsBall = {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  startedAt: number;
  duration: number;
  arc: number;
};
type RenderMower = {
  x: number;
  y: number;
  heading: number;
  mode: 'mowing' | 'zoomies' | 'confused' | 'napping' | 'reverse';
  says: { text: string; until: number } | null;
};
type RenderMowerTrack = { fromX: number; fromY: number; x: number; y: number; at: number };

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
  soccerBall: RenderSoccerBall;
  golfBall: RenderPhysicsBall;
  bowlingBall: RenderPhysicsBall;
  bowlingPinsDown: readonly number[];
  bowlingPinsKnockedAt: number;
  mower: RenderMower;
  mowerTracks: readonly RenderMowerTrack[];
  nightOpacity: number;
  reduceMotion: boolean;
}

function material(color: THREE.ColorRepresentation): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

const CAT_COATS: Record<string, { body: string; light: string; dark: string; accent: string; patch: string }> = {
  hunao: { body: '#aeb8c0', light: '#dce3e7', dark: '#58616a', accent: '#7eaaa7', patch: '#707b84' },
  siam: { body: '#6a9bcc', light: '#b6d0e1', dark: '#3e5368', accent: '#d4bd6d', patch: '#526f8b' },
  heyhey: { body: '#41444c', light: '#858993', dark: '#292c32', accent: '#d6bd65', patch: '#33363e' },
  heyheyhey: { body: '#30333a', light: '#70747d', dark: '#202228', accent: '#cbb66a', patch: '#282b31' },
  ailu: { body: '#6478c2', light: '#bcc9ef', dark: '#3f4e82', accent: '#75a5cb', patch: '#4f619d' },
  bella: { body: '#fff8e9', light: '#fffaf0', dark: '#51483f', accent: '#d97757', patch: '#d97757' },
};

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
  mesh.castShadow = true;
  mesh.receiveShadow = true;
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
  mesh.receiveShadow = true;
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
  const path = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
    color,
    side: THREE.DoubleSide,
    flatShading: true,
  }));
  path.receiveShadow = true;
  parent.add(path);
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
  roof.castShadow = true;
  roof.receiveShadow = true;
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
  trunk.castShadow = true;
  canopy.castShadow = true;
  canopy.receiveShadow = true;
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
  small = false,
  superAdmin = false
): void {
  const maxChars = small ? 30 : 28;
  const label = text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
  ctx.font = `bold ${small ? 10 : 12}px 'Schoolbell', ui-monospace, monospace`;
  const width = Math.min(small ? 188 : 194, Math.ceil(ctx.measureText(label).width) + 16);
  const height = small ? 17 : 21;
  const left = Math.round(x - width / 2);
  const top = Math.round(y - height);
  ctx.fillStyle = superAdmin ? 'rgba(72, 51, 19, 0.58)' : 'rgba(36, 28, 19, 0.42)';
  ctx.fillRect(left + 2, top + 3, width, height);
  ctx.fillStyle = superAdmin ? '#a77a2f' : '#785a3c';
  ctx.fillRect(left, top, width, height);
  ctx.fillStyle = superAdmin ? '#f3d87c' : '#f0dfb9';
  ctx.fillRect(left + 2, top + 2, width - 4, height - 4);
  ctx.fillStyle = superAdmin ? '#3b2d13' : '#493927';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, Math.round(x), top + height / 2, width - 10);
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
  private readonly sunTarget = new THREE.Object3D();
  private readonly nightLightColor = new THREE.Color('#9cb7e1');
  private readonly dayLightColor = new THREE.Color('#e4f1d8');
  private readonly daySunColor = new THREE.Color('#fff2d4');
  private readonly nightSunColor = new THREE.Color('#8298c4');
  private readonly lanternLights: THREE.PointLight[] = [];
  private readonly lanternBulbs: THREE.Mesh[] = [];
  private readonly lanternHalos: THREE.Mesh[] = [];
  private readonly actorBody: THREE.InstancedMesh;
  private readonly actorHead: THREE.InstancedMesh;
  private readonly actorHair: THREE.InstancedMesh;
  private readonly actorLegs: THREE.InstancedMesh;
  private readonly actorShadows: THREE.InstancedMesh;
  private readonly petBodies: THREE.InstancedMesh;
  private readonly petHeads: THREE.InstancedMesh;
  private readonly petEars: THREE.InstancedMesh;
  private readonly petInnerEars: THREE.InstancedMesh;
  private readonly petLegs: THREE.InstancedMesh;
  private readonly petMuzzles: THREE.InstancedMesh;
  private readonly petTails: THREE.InstancedMesh;
  private readonly petShadows: THREE.InstancedMesh;
  private readonly petSparkles: THREE.InstancedMesh;
  private readonly petPatches: THREE.InstancedMesh;
  private readonly petEyes: THREE.InstancedMesh;
  private readonly petColorSlots: { id: string }[] = [];
  private readonly duckMeshes: THREE.InstancedMesh;
  private readonly dropMeshes: THREE.InstancedMesh;
  private readonly discoveryMeshes: THREE.InstancedMesh;
  private readonly soccerBallMesh: THREE.Mesh;
  private readonly golfBallMesh: THREE.Mesh;
  private readonly bowlingBallMesh: THREE.Mesh;
  private readonly bowlingPins: THREE.Mesh[] = [];
  private readonly bowlingPinHomes: THREE.Vector3[] = [];
  private readonly mowerGroup = new THREE.Group();
  private readonly mowerWheels: THREE.Mesh[] = [];
  private readonly mowerBeam: THREE.Mesh;
  private readonly mowerTrackGeometry = new THREE.BufferGeometry();
  private readonly mowerTrackMesh: THREE.LineSegments;
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
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor('#78956f');
    this.camera.up.set(0, 1, 0);

    this.ambient = new THREE.AmbientLight('#e4f1d8', 1.35);
    this.sun = new THREE.DirectionalLight('#fff2d4', 1.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -1350;
    this.sun.shadow.camera.right = 1350;
    this.sun.shadow.camera.top = 1350;
    this.sun.shadow.camera.bottom = -1350;
    this.sun.shadow.camera.near = 100;
    this.sun.shadow.camera.far = 3600;
    this.sun.shadow.bias = -0.00018;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 3;
    this.scene.add(this.ambient, this.sun, this.sunTarget);
    this.sun.target = this.sunTarget;
    this.buildWorld();

    this.actorBody = makeInstanceMesh(new THREE.CapsuleGeometry(8, 10, 2, 5), '#ffffff', MAX_ACTORS);
    this.actorHead = makeInstanceMesh(new THREE.DodecahedronGeometry(9, 0), '#e9c49e', MAX_ACTORS);
    this.actorHair = makeInstanceMesh(new THREE.DodecahedronGeometry(10, 0), '#493a33', MAX_ACTORS);
    this.actorLegs = makeInstanceMesh(new THREE.BoxGeometry(6, 12, 6), '#353b42', MAX_ACTORS * 2);
    this.actorShadows = makeInstanceMesh(new THREE.CircleGeometry(12, 7), '#15251c', MAX_ACTORS, true);
    this.scene.add(this.actorShadows, this.actorLegs, this.actorBody, this.actorHead, this.actorHair);

    this.petBodies = makeInstanceMesh(new THREE.DodecahedronGeometry(8, 0), '#d5c2a1', MAX_ACTORS);
    this.petHeads = makeInstanceMesh(new THREE.DodecahedronGeometry(5, 0), '#d5c2a1', MAX_ACTORS);
    this.petEars = makeInstanceMesh(new THREE.ConeGeometry(3.6, 8, 4), '#d5c2a1', MAX_ACTORS * 2);
    this.petInnerEars = makeInstanceMesh(new THREE.ConeGeometry(1.8, 4, 4), '#d9878f', MAX_ACTORS * 2);
    this.petLegs = makeInstanceMesh(new THREE.BoxGeometry(3.8, 7, 4), '#d5c2a1', MAX_ACTORS * 4);
    this.petMuzzles = makeInstanceMesh(new THREE.SphereGeometry(2.2, 5, 4), '#f1e4d0', MAX_ACTORS);
    this.petEyes = makeInstanceMesh(new THREE.SphereGeometry(0.9, 5, 4), '#292c32', MAX_ACTORS * 2);
    this.petTails = makeInstanceMesh(new THREE.CapsuleGeometry(2, 10, 2, 4), '#d5c2a1', MAX_ACTORS);
    this.petShadows = makeInstanceMesh(new THREE.CircleGeometry(9, 8), '#18251e', MAX_ACTORS, true);
    this.petSparkles = makeInstanceMesh(new THREE.OctahedronGeometry(2.8, 0), '#f5dc8a', MAX_ACTORS * 3);
    this.petPatches = makeInstanceMesh(new THREE.DodecahedronGeometry(3.2, 0), '#526f8b', MAX_ACTORS * 2);
    this.duckMeshes = makeInstanceMesh(new THREE.DodecahedronGeometry(7, 0), '#e8c56a', 64);
    this.scene.add(
      this.petShadows,
      this.petTails,
      this.petLegs,
      this.petBodies,
      this.petPatches,
      this.petHeads,
      this.petEars,
      this.petInnerEars,
      this.petMuzzles,
      this.petEyes,
      this.petSparkles,
      this.duckMeshes,
    );
    this.dropMeshes = makeInstanceMesh(new THREE.OctahedronGeometry(7, 0), '#e6ad48', 96);
    this.discoveryMeshes = makeInstanceMesh(new THREE.OctahedronGeometry(9, 0), '#8fe0b0', 2);
    this.scene.add(this.dropMeshes, this.discoveryMeshes);
    this.soccerBallMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(10, 0), material('#f3ecdd'));
    this.soccerBallMesh.castShadow = true;
    this.scene.add(this.soccerBallMesh);
    this.golfBallMesh = new THREE.Mesh(new THREE.SphereGeometry(7, 8, 6), material('#fff8e9'));
    this.bowlingBallMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(11, 0), material('#403428'));
    this.golfBallMesh.castShadow = true;
    this.bowlingBallMesh.castShadow = true;
    this.scene.add(this.golfBallMesh, this.bowlingBallMesh);

    const mowerBox = (
      x: number,
      y: number,
      z: number,
      width: number,
      height: number,
      depth: number,
      color: THREE.ColorRepresentation,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(color));
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.mowerGroup.add(mesh);
      return mesh;
    };
    mowerBox(0, 12, 0, 72, 12, 94, '#282d31');
    mowerBox(0, 24, -1, 74, 16, 84, '#f1f0e9');
    mowerBox(0, 34, -4, 60, 8, 62, '#fffdf5');
    mowerBox(0, 18, 44, 76, 8, 9, '#30363a');
    mowerBox(0, 31, 41, 34, 9, 3, '#20282d');
    mowerBox(0, 31, 43, 9, 3, 2, '#56d3ff');
    const stopButton = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 3, 8), material('#e54c46'));
    stopButton.position.set(-12, 40, -18);
    stopButton.castShadow = true;
    this.mowerGroup.add(stopButton);
    for (const side of [-1, 1]) {
      for (const z of [-27, 28]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 8, 8), material('#252a2e'));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * 38, 13, z);
        wheel.castShadow = true;
        this.mowerWheels.push(wheel);
        this.mowerGroup.add(wheel);
      }
    }
    const beamGeometry = new THREE.BufferGeometry();
    beamGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 4, 43,
      -50, 4, 126,
      50, 4, 126,
    ], 3));
    beamGeometry.computeVertexNormals();
    this.mowerBeam = new THREE.Mesh(
      beamGeometry,
      new THREE.MeshBasicMaterial({
        color: '#55cfff',
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.mowerGroup.add(this.mowerBeam);
    this.scene.add(this.mowerGroup);

    const trackCapacity = 420;
    this.mowerTrackGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(trackCapacity * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage)
    );
    this.mowerTrackGeometry.setDrawRange(0, 0);
    this.mowerTrackMesh = new THREE.LineSegments(
      this.mowerTrackGeometry,
      new THREE.LineBasicMaterial({ color: '#b3ce89', transparent: true, opacity: 0.62, depthWrite: false })
    );
    this.mowerTrackMesh.frustumCulled = false;
    this.scene.add(this.mowerTrackMesh);

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
    const zoom = THREE.MathUtils.clamp(frame.zoom, 1.5, 4);
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
    this.ambient.color.copy(this.dayLightColor).lerp(this.nightLightColor, night);
    this.sun.color.copy(this.daySunColor).lerp(this.nightSunColor, night);
    this.sunTarget.position.set(this.focus.x, 0, this.focus.z);
    this.sun.position.set(this.focus.x - 850, 1650, this.focus.z + 1050);
    this.sun.target.updateMatrixWorld();
    this.updateLanterns(night, frame.time);
    this.scene.background = this.backgroundColor.copy(DAY_BACKGROUND).lerp(NIGHT_BACKGROUND, night);

    this.updateCars(frame.cars);
    this.updateActors(frame, 1 - Math.exp(-delta * 26));
    this.updatePets(frame.pets, frame.time, frame.reduceMotion);
    this.updateMarkers(frame, frame.time);
    this.updateSoccerBall(frame.soccerBall);
    this.updatePhysicsBall(this.golfBallMesh, frame.golfBall);
    this.updatePhysicsBall(this.bowlingBallMesh, frame.bowlingBall);
    this.updateBowlingPins(frame.bowlingPinsDown, frame.bowlingPinsKnockedAt, frame.time * 1000);
    this.updateMower(frame.mower, frame.mowerTracks, frame.time, frame.reduceMotion);
    this.drawLabels(frame);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((entry) => entry.dispose());
      }
    });
  }

  private buildWorld(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_W, WORLD_H),
      material('#78976b')
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(WORLD_W / 2, -5, WORLD_H / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);

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
    addPath(this.scene, [[800, 1180], [900, 1540], [1065, 1815]], 34, pathColor);
    addPath(this.scene, [[1870, 1350], [2040, 1440], [2250, 1460]], 32, pathColor);
    addPath(this.scene, [[2490, 850], [2670, 1000], [2790, 1150]], 32, pathColor);

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
    this.addLantern(585, 455);
    this.addLantern(1015, 455);
    this.addLantern(585, 805);
    this.addLantern(1015, 805);
    this.addMiniGameAreas();

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

  private addMiniGameAreas(): void {
    const golf = { x: 2860, z: 1280 };
    addGroundDisc(this.scene, golf.x, golf.z, 214, 132, '#659252', 3, 28);
    addGroundDisc(this.scene, golf.x, golf.z, 174, 98, '#82a95f', 2, 28);
    addBox(this.scene, 2725, 2, 1260, 18, 5, 18, '#785a3c');
    const cupX = golf.x + 65;
    const cupZ = golf.z - 20;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 2, 12), new THREE.MeshBasicMaterial({ color: '#263a2a' }));
    cup.position.set(cupX, 4, cupZ);
    this.scene.add(cup);
    addBox(this.scene, cupX, 2, cupZ, 4, 74, 4, '#f0dfb9');
    const flag = new THREE.Mesh(new THREE.BoxGeometry(30, 18, 3), material('#d97757'));
    flag.position.set(cupX + 13, 67, cupZ);
    flag.castShadow = true;
    this.scene.add(flag);

    const bowling = { x: 2250, z: 1290 };
    addBox(this.scene, bowling.x, 0, bowling.z, 112, 5, 390, '#684a34');
    addBox(this.scene, bowling.x, 5, bowling.z, 90, 2, 366, '#b88b5c');
    for (const x of [bowling.x - 54, bowling.x + 54]) {
      addBox(this.scene, x, 5, bowling.z, 10, 10, 390, '#765338');
    }
    const pinPositions: [number, number][] = [
      [114, 25], [126, 25], [138, 25], [150, 25],
      [120, 39], [132, 39], [144, 39],
      [126, 53], [138, 53], [132, 67],
    ];
    for (const [localX, localY] of pinPositions) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 18, 6), material('#f3ecdd'));
      pin.position.set(
        bowling.x + (localX - 132) * 1.5,
        16,
        bowling.z - 150 + (localY - 25) * 3
      );
      pin.castShadow = true;
      this.bowlingPins.push(pin);
      this.bowlingPinHomes.push(pin.position.clone());
      this.scene.add(pin);
    }

    const field = { x: 1065, z: 1970, width: 430, depth: 300 };
    addBox(this.scene, field.x, 0, field.z, field.width, 2, field.depth, '#5d8c58');
    const stripe = material('#e7e5cf');
    for (const [x, z, width, depth] of [
      [field.x, field.z - field.depth / 2, field.width, 3],
      [field.x, field.z + field.depth / 2, field.width, 3],
      [field.x - field.width / 2, field.z, 3, field.depth],
      [field.x + field.width / 2, field.z, 3, field.depth],
      [field.x, field.z, 3, field.depth],
    ] as const) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(width, 1, depth), stripe);
      line.position.set(x, 2.8, z);
      this.scene.add(line);
    }
    const centerCircle = new THREE.Mesh(
      new THREE.TorusGeometry(38, 2, 4, 24),
      new THREE.MeshBasicMaterial({ color: '#e7e5cf' })
    );
    centerCircle.rotation.x = Math.PI / 2;
    centerCircle.position.set(field.x, 3, field.z);
    this.scene.add(centerCircle);
    for (const x of [field.x - field.width / 2 + 14, field.x + field.width / 2 - 14]) {
      addBox(this.scene, x, 4, field.z, 5, 48, 5, '#f0dfb9');
      addBox(this.scene, x, 50, field.z - 23, 5, 5, 48, '#f0dfb9');
      addBox(this.scene, x, 50, field.z + 23, 5, 5, 48, '#f0dfb9');
    }
  }

  private updateSoccerBall(ball: RenderSoccerBall): void {
    const progress = ball.kickedAt
      ? THREE.MathUtils.clamp((Date.now() - ball.kickedAt) / 360, 0, 1)
      : 1;
    const x = THREE.MathUtils.lerp(ball.fromX, ball.x, progress);
    const z = THREE.MathUtils.lerp(ball.fromY, ball.y, progress);
    this.soccerBallMesh.position.set(x, 13 + (1 - progress) * 7, z);
    this.soccerBallMesh.rotation.set(progress * 4, 0, progress * 3);
  }

  private updatePhysicsBall(mesh: THREE.Mesh, ball: RenderPhysicsBall): void {
    const progress = ball.duration > 0
      ? THREE.MathUtils.clamp((Date.now() - ball.startedAt) / ball.duration, 0, 1)
      : 1;
    const x = THREE.MathUtils.lerp(ball.fromX, ball.x, progress);
    const z = THREE.MathUtils.lerp(ball.fromY, ball.y, progress);
    const hop = Math.sin(progress * Math.PI) * ball.arc;
    mesh.position.set(x, 9 + hop, z);
    mesh.rotation.set(progress * 5, 0, progress * 7);
  }

  private updateBowlingPins(knocked: readonly number[], knockedAt: number, now: number): void {
    const down = new Set(knocked);
    const fall = knockedAt ? THREE.MathUtils.clamp((now - knockedAt) / 330, 0, 1) : 1;
    this.bowlingPins.forEach((pin, index) => {
      const home = this.bowlingPinHomes[index];
      if (!home) return;
      const falling = down.has(index);
      const tilt = falling ? fall : 0;
      pin.position.set(
        home.x + (index % 2 ? 11 : -11) * tilt,
        home.y - 8 * tilt,
        home.z + 9 * tilt
      );
      pin.rotation.x = 1.2 * tilt;
      pin.rotation.z = (index % 2 ? 0.48 : -0.48) * tilt;
    });
  }

  private updateMower(
    mower: RenderMower,
    tracks: readonly RenderMowerTrack[],
    time: number,
    reduceMotion: boolean,
  ): void {
    const moving = mower.mode === 'mowing' || mower.mode === 'zoomies' || mower.mode === 'reverse';
    const bounce = reduceMotion || !moving
      ? 0
      : Math.abs(Math.sin(time * (mower.mode === 'zoomies' ? 23 : 14))) * (mower.mode === 'zoomies' ? 3 : 1);
    this.mowerGroup.visible = true;
    this.mowerGroup.position.set(mower.x, -7 + bounce, mower.y);
    this.mowerGroup.rotation.set(
      mower.mode === 'napping' ? -0.08 : mower.mode === 'confused' ? Math.sin(time * 1.4) * 0.035 : 0,
      Math.PI / 2 - mower.heading,
      mower.mode === 'zoomies' && !reduceMotion ? Math.sin(time * 18) * 0.035 : 0,
    );
    const wheelRate = mower.mode === 'zoomies' ? 16 : mower.mode === 'reverse' ? -4 : 3.5;
    this.mowerWheels.forEach((wheel) => {
      wheel.rotation.x = time * wheelRate;
    });
    const beamMaterial = this.mowerBeam.material as THREE.MeshBasicMaterial;
    this.mowerBeam.visible = mower.mode !== 'napping';
    beamMaterial.opacity = mower.mode === 'confused'
      ? 0.2 + Math.sin(time * 2) * 0.08
      : mower.mode === 'zoomies' ? 0.52 : 0.3;

    const capacity = (this.mowerTrackGeometry.getAttribute('position').array as Float32Array).length / 6;
    const visibleTracks = tracks.slice(-capacity);
    const positions = this.mowerTrackGeometry.getAttribute('position').array as Float32Array;
    let segmentCount = 0;
    const now = Date.now();
    for (const track of visibleTracks) {
      if (now - track.at > 180_000) continue;
      const offset = segmentCount * 6;
      positions[offset] = track.fromX;
      positions[offset + 1] = -4;
      positions[offset + 2] = track.fromY;
      positions[offset + 3] = track.x;
      positions[offset + 4] = -4;
      positions[offset + 5] = track.y;
      segmentCount++;
    }
    const positionAttribute = this.mowerTrackGeometry.getAttribute('position') as THREE.BufferAttribute;
    positionAttribute.needsUpdate = true;
    this.mowerTrackGeometry.setDrawRange(0, segmentCount * 2);
  }

  private addLantern(x: number, z: number): void {
    addBox(this.scene, x, 0, z, 7, 64, 7, '#624d38');
    addBox(this.scene, x, 60, z, 22, 5, 22, '#624d38');
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(7, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#ffe3a1' })
    );
    bulb.position.set(x, 70, z);
    this.scene.add(bulb);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(44, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#ffc96b', transparent: true, opacity: 0, depthWrite: false })
    );
    halo.position.set(x, 70, z);
    halo.scale.y = 0.72;
    this.scene.add(halo);
    const light = new THREE.PointLight('#ffc878', 0, 270, 2);
    light.position.set(x, 70, z);
    this.scene.add(light);
    this.lanternBulbs.push(bulb);
    this.lanternHalos.push(halo);
    this.lanternLights.push(light);
  }

  private updateLanterns(night: number, time: number): void {
    this.lanternLights.forEach((light, index) => {
      const shimmer = 0.94 + Math.sin(time * 2.2 + index * 1.7) * 0.06;
      light.intensity = night * 2.1 * shimmer;
      const halo = this.lanternHalos[index];
      const bulb = this.lanternBulbs[index];
      if (halo) {
        (halo.material as THREE.MeshBasicMaterial).opacity = night * 0.11 * shimmer;
      }
      if (bulb) {
        bulb.scale.setScalar(0.9 + night * 0.1 * shimmer);
        (bulb.material as THREE.MeshBasicMaterial).color.copy(
          TEMP_COLOR.copy(LANTERN_DAY_COLOR).lerp(LANTERN_NIGHT_COLOR, night)
        );
      }
    });
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

  private updatePets(pets: readonly RenderPet[], time: number, reduceMotion: boolean): void {
    const count = Math.min(pets.length, MAX_ACTORS);
    let eyeCount = 0;
    let patchCount = 0;
    let sparkleCount = 0;
    let colorsChanged = false;
    for (let index = 0; index < count; index++) {
      const pet = pets[index];
      const catId = pet.catId ?? 'hunao';
      const coat = CAT_COATS[catId] ?? CAT_COATS.hunao;
      let colorSlot = this.petColorSlots[index];
      if (!colorSlot || colorSlot.id !== catId) {
        this.petBodies.setColorAt(index, TEMP_COLOR.set(coat.body));
        this.petHeads.setColorAt(index, TEMP_COLOR.set(coat.light));
        this.petEars.setColorAt(index * 2, TEMP_COLOR.set(coat.body));
        this.petEars.setColorAt(index * 2 + 1, TEMP_COLOR.set(coat.body));
        this.petInnerEars.setColorAt(index * 2, TEMP_COLOR.set('#d9878f'));
        this.petInnerEars.setColorAt(index * 2 + 1, TEMP_COLOR.set('#d9878f'));
        this.petLegs.setColorAt(index * 4, TEMP_COLOR.set(coat.dark));
        this.petLegs.setColorAt(index * 4 + 1, TEMP_COLOR.set(coat.dark));
        this.petLegs.setColorAt(index * 4 + 2, TEMP_COLOR.set(coat.dark));
        this.petLegs.setColorAt(index * 4 + 3, TEMP_COLOR.set(coat.dark));
        this.petMuzzles.setColorAt(index, TEMP_COLOR.set(coat.light));
        this.petTails.setColorAt(index, TEMP_COLOR.set(coat.body));
        this.petPatches.setColorAt(index * 2, TEMP_COLOR.set(coat.patch));
        this.petPatches.setColorAt(index * 2 + 1, TEMP_COLOR.set(catId === 'bella' ? coat.dark : coat.accent));
        colorSlot = { id: catId };
        this.petColorSlots[index] = colorSlot;
        colorsChanged = true;
      }

      const walking = !reduceMotion && !!pet.moving;
      const phase = pet.walkPhase ?? time * 8;
      const direction = pet.facingLeft ? -1 : 1;
      const hop = !reduceMotion && pet.pose === 'play' ? Math.abs(Math.sin(time * 7 + index)) * 6 : 0;
      const walkBob = walking ? Math.abs(Math.sin(phase)) * 2 : 0;
      const idleBreath = reduceMotion ? 0 : Math.sin(time * 1.7 + index * 1.9) * 0.45;
      const bob = hop + walkBob + idleBreath;
      const bodyY = 9 + bob;
      const loafing = pet.pose === 'loaf';
      const sitting = pet.pose === 'sit';
      const bodyScaleY = loafing ? 0.56 : sitting ? 0.76 : 0.8;
      const bodyScaleX = loafing ? 1.25 : sitting ? 1.06 : 1.16;
      const headY = bodyY + (loafing ? 7 : sitting ? 11 : 13);
      const sniffDip = !reduceMotion && pet.pose === 'sniff' ? Math.sin(time * 4 + index) * 1.3 : 0;
      const tailSwish = reduceMotion ? 0 : Math.sin(time * 2.8 + index * 1.6) * 0.42;
      const earFlick = !reduceMotion && Math.sin(time * 1.25 + index * 2.3) > 0.94 ? 0.16 : 0;
      const stageScale = pet.stage === 'Kitten' ? 0.78 : pet.stage === 'Elder' ? 1.04 : 0.92;

      this.transform.position.set(pet.x, bodyY, pet.y);
      this.transform.rotation.set(0, 0, 0);
      this.transform.scale.set(bodyScaleX * stageScale, bodyScaleY * stageScale, stageScale);
      setInstance(this.petBodies, index, this.transform);

      this.transform.position.set(pet.x - direction * 4, bodyY + 1, pet.y + 5);
      this.transform.rotation.set(0, 0, 0);
      this.transform.scale.set(0.54, 0.66, 0.58);
      setInstance(this.petPatches, patchCount++, this.transform);
      this.transform.position.set(pet.x + direction * 4, bodyY + 2, pet.y + 2);
      this.transform.scale.set(0.44, 0.52, 0.5);
      setInstance(this.petPatches, patchCount++, this.transform);

      this.transform.position.set(pet.x + direction * 4, headY - sniffDip, pet.y + 2);
      this.transform.rotation.set(0, 0, direction * (sniffDip * 0.05));
      this.transform.scale.set(0.78 * stageScale, 0.78 * stageScale, 0.78 * stageScale);
      setInstance(this.petHeads, index, this.transform);

      for (let ear = 0; ear < 2; ear++) {
        const earIndex = index * 2 + ear;
        const earX = pet.x + direction * (4 + (ear ? 3 : -3));
        const earTilt = ear === 0 ? -0.12 : 0.12;
        this.transform.position.set(earX, headY + 4 - sniffDip, pet.y + 2);
        this.transform.rotation.set(earTilt + earFlick, 0, direction * earTilt);
        this.transform.scale.set(stageScale, stageScale, stageScale);
        setInstance(this.petEars, earIndex, this.transform);
        this.transform.position.set(earX, headY + 5.2 - sniffDip, pet.y + 4.2);
        this.transform.rotation.set(earTilt + earFlick, 0, direction * earTilt);
        this.transform.scale.set(stageScale, stageScale, stageScale);
        setInstance(this.petInnerEars, earIndex, this.transform);
      }

      this.transform.position.set(pet.x + direction * 6, headY - 1 - sniffDip, pet.y + 6);
      this.transform.rotation.set(0, 0, 0);
      this.transform.scale.set(stageScale, stageScale, stageScale);
      setInstance(this.petMuzzles, index, this.transform);
      for (let eye = 0; eye < 2; eye++) {
        const eyeIndex = eyeCount++;
        this.transform.position.set(pet.x + direction * (5 + (eye ? 2 : -2)), headY + 1 - sniffDip, pet.y + 7);
        this.transform.rotation.set(0, 0, 0);
        this.transform.scale.set(stageScale, stageScale, stageScale);
        setInstance(this.petEyes, eyeIndex, this.transform, '#252a32');
      }

      this.transform.position.set(pet.x - direction * 8, bodyY + 7, pet.y - 1);
      this.transform.rotation.set(0, 0, direction * (0.42 + tailSwish));
      this.transform.scale.set(stageScale, stageScale * 1.18, stageScale);
      setInstance(this.petTails, index, this.transform);

      for (let leg = 0; leg < 4; leg++) {
        const legIndex = index * 4 + leg;
        const side = leg % 2 ? 1 : -1;
        const front = leg < 2;
        const stride = walking ? Math.sin(phase + (front === (side < 0) ? 0 : Math.PI)) * 2.1 : 0;
        const lift = walking ? Math.max(0, Math.sin(phase + (front === (side < 0) ? 0 : Math.PI))) * 1.3 : 0;
        this.transform.position.set(
          pet.x + (front ? 4 : -4) + stride * direction,
          4 + lift + (loafing ? -1.4 : 0),
          pet.y + side * 3
        );
        this.transform.rotation.set(0, 0, stride * 0.08);
        this.transform.scale.set(stageScale, stageScale, stageScale);
        setInstance(this.petLegs, legIndex, this.transform);
      }

      this.transform.position.set(pet.x, 2, pet.y);
      this.transform.rotation.set(-Math.PI / 2, 0, 0);
      this.transform.scale.set(stageScale * (loafing ? 1.05 : 1), 1, stageScale * 0.75);
      setInstance(this.petShadows, index, this.transform);

      const showSparkle = !reduceMotion && (pet.emote === 'spark' || pet.pose === 'play');
      const showSniff = !reduceMotion && pet.emote === 'sniff';
      if (showSparkle || showSniff) {
        for (let sparkle = 0; sparkle < 3; sparkle++) {
          const sparkleIndex = sparkleCount++;
          const orbit = time * (showSniff ? 1.8 : 2.5) + sparkle * (Math.PI * 2 / 3) + index;
          const radius = showSniff ? 7 : 12;
          this.transform.position.set(
            pet.x + direction * 9 + Math.cos(orbit) * radius,
            headY + 8 + Math.sin(orbit) * 2,
            pet.y + 5 + Math.sin(orbit) * radius * 0.45
          );
          this.transform.rotation.set(orbit, orbit, 0);
          this.transform.scale.setScalar(showSniff ? 0.5 : 0.7 + Math.sin(orbit) * 0.18);
          setInstance(this.petSparkles, sparkleIndex, this.transform, showSniff ? '#b8d9c8' : '#f5dc8a');
        }
      }
    }
    this.petBodies.count = count;
    this.petHeads.count = count;
    this.petEars.count = count * 2;
    this.petInnerEars.count = count * 2;
    this.petLegs.count = count * 4;
    this.petMuzzles.count = count;
    this.petEyes.count = eyeCount;
    this.petTails.count = count;
    this.petShadows.count = count;
    this.petPatches.count = patchCount;
    this.petSparkles.count = sparkleCount;
    for (const mesh of [
      this.petBodies,
      this.petHeads,
      this.petEars,
      this.petInnerEars,
      this.petLegs,
      this.petMuzzles,
      this.petEyes,
      this.petTails,
      this.petShadows,
      this.petPatches,
      this.petSparkles,
    ]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (colorsChanged) {
      for (const mesh of [
        this.petBodies,
        this.petHeads,
        this.petEars,
        this.petInnerEars,
        this.petLegs,
        this.petMuzzles,
        this.petTails,
        this.petPatches,
      ]) {
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
    if (this.petEyes.instanceColor) this.petEyes.instanceColor.needsUpdate = true;
    if (this.petSparkles.instanceColor) this.petSparkles.instanceColor.needsUpdate = true;
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
    const mower = frame.mower;
    this.projectedPoint.set(mower.x, 55, mower.y).project(this.camera);
    if (
      this.projectedPoint.z >= -1 && this.projectedPoint.z <= 1
      && Math.abs(this.projectedPoint.x) <= 1.08 && Math.abs(this.projectedPoint.y) <= 1.1
    ) {
      const mowerX = (this.projectedPoint.x * 0.5 + 0.5) * this.width;
      const mowerY = (-this.projectedPoint.y * 0.5 + 0.5) * this.height;
      drawLabel(ctx, mowerX, mowerY, 'T-REX');
      if (mower.says && mower.says.until > Date.now()) {
        drawLabel(ctx, mowerX, mowerY - 24, mower.says.text.slice(0, 48), true);
      } else if (mower.mode !== 'mowing') {
        drawLabel(ctx, mowerX, mowerY - 24, mower.mode.toUpperCase(), true);
      }
    }
    const drawActorLabel = (actor: RenderActor) => {
      if (actor.carId) return;
      const visual = this.visualPositions.get(actor.name);
      const actorX = visual?.x ?? actor.x;
      const actorZ = visual?.z ?? actor.y;
      const bob = actor.moving && !frame.reduceMotion
        ? Math.abs(Math.sin(frame.time * 10 + (actor.bobPhase ?? 0))) * 2
        : 0;
      this.projectedPoint.set(actorX, 66 + bob, actorZ).project(this.camera);
      const point = this.projectedPoint;
      if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1.08 || Math.abs(point.y) > 1.1) return;
      const pixelStep = 1 / this.labelPixelRatio;
      const x = Math.round(((point.x * 0.5 + 0.5) * this.width) / pixelStep) * pixelStep;
      const y = Math.round(((-point.y * 0.5 + 0.5) * this.height) / pixelStep) * pixelStep;
      const name = actor.superAdmin ? `ROOT · ${actor.name}` : actor.admin ? `★ ${actor.name}` : actor.name;
      drawLabel(ctx, x, y, name, false, !!actor.superAdmin);
      if (actor.says && actor.says.until > Date.now()) {
        drawLabel(ctx, x, y - 25, actor.says.text.slice(0, 52), true);
      } else if (actor.status && (actor === frame.player || actor.status.length < 28)) {
        drawLabel(ctx, x, y + 19, actor.status.slice(0, 26), true);
      }
    };
    drawActorLabel(frame.player);
    for (const npc of frame.npcs) drawActorLabel(npc);
    for (const remote of frame.remotes) drawActorLabel(remote);
  }
}
