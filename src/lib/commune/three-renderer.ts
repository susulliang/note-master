import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  VignetteEffect,
} from 'postprocessing';
import { COMMUNE_HANGOUTS } from '@shared/commune-hangouts';
import {
  COMMUNE_BUILD_CATALOG,
  communeBuildIsUnderConstruction,
  type CommuneBuildable,
} from '@shared/commune-buildables';
import { CAT_COATS, LANDMARKS, MAX_ACTORS, TEMP_COLOR, WORLD_H, WORLD_W } from './three-constants';
import {
  DAY_AMBIENT_COLOR,
  DAY_BACKGROUND,
  DAY_FOG_COLOR,
  DAY_GROUND_LIGHT,
  DAY_SKY_LIGHT,
  DAY_SUN_COLOR,
  FOG_FAR,
  FOG_NEAR,
  LANTERN_DAY_COLOR,
  LANTERN_NIGHT_COLOR,
  NIGHT_AMBIENT_COLOR,
  NIGHT_BACKGROUND,
  NIGHT_FOG_COLOR,
  NIGHT_GROUND_LIGHT,
  NIGHT_SKY_LIGHT,
  NIGHT_SUN_COLOR,
} from './three-palette';
import {
  addBox,
  addBuilding,
  addGroundDisc,
  addPath,
  addTent,
  addTreeInstances,
  createBuildableModel,
  makeGroundTexture,
  makeInstanceMesh,
  material,
  setConstructionOpacity,
  setInstance,
} from './three-builders';
import { addWorldScatter, updateSway } from './three-scatter';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { drawHangoutLabel, drawLabel } from './three-labels';
import { createSkyMaterial } from './three-sky';
import { animateWater, createWaterMaterial, createWaterSurface } from './three-water';
import { createHuskoRig, updateHuskoRig, type HuskoRig } from './three-husko';
import type {
  AvatarColors,
  CommuneThreeFrame,
  CommuneThreeLaserShot,
  RenderActor,
  RenderBuildPreview,
  RenderCar,
  RenderDiscovery,
  RenderDrop,
  RenderDuck,
  RenderHusko,
  RenderMower,
  RenderMowerTrack,
  RenderPet,
  RenderPhysicsBall,
  RenderSoccerBall,
} from './three-types';

export class CommuneThreeRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 9000);
  private readonly perspectiveCamera = new THREE.PerspectiveCamera(68, 1, 0.5, 9000);
  private activeCamera: THREE.Camera = this.camera;
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
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly waterMaterials: THREE.MeshPhongMaterial[] = [];
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private huskoRig: HuskoRig | null = null;
  private lastShadowZoom = 0;
  private readonly swayMaterials: THREE.MeshLambertMaterial[] = [];
  private readonly debugStats = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('commune-debug');
  private lastStatsAt = 0;
  private readonly lanternLights: THREE.PointLight[] = [];
  private readonly lanternBulbs: THREE.Mesh[] = [];
  private readonly lanternHalos: THREE.Mesh[] = [];
  private readonly actorBody: THREE.InstancedMesh;
  private readonly actorHead: THREE.InstancedMesh;
  private readonly actorHair: THREE.InstancedMesh;
  private readonly actorLegs: THREE.InstancedMesh;
  private readonly actorArms: THREE.InstancedMesh;
  private readonly actorHands: THREE.InstancedMesh;
  private readonly actorShadows: THREE.InstancedMesh;
  private readonly firstPersonArms = new THREE.Group();
  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly skyMesh: THREE.Mesh;
  private readonly boundaryGroup = new THREE.Group();
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
  private readonly laserBeams = new Map<string, THREE.Mesh>();
  private readonly laserImpactMeshes = new Map<string, THREE.Mesh>();
  private readonly cars = new Map<string, THREE.Group>();
  private readonly buildableModels = new Map<string, THREE.Group>();
  private readonly buildPreviewMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1, 4),
    new THREE.MeshBasicMaterial({
      color: '#69d78d',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
  );
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
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor('#78956f');
    this.camera.up.set(0, 1, 0);
    this.perspectiveCamera.up.set(0, 1, 0);
    this.perspectiveCamera.add(this.firstPersonArms);
    this.skyMaterial = createSkyMaterial();
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(7000, 32, 20), this.skyMaterial);
    this.skyMesh.frustumCulled = false;
    this.scene.add(this.skyMesh, this.boundaryGroup, this.perspectiveCamera);

    this.scene.fog = new THREE.Fog(DAY_FOG_COLOR.getHex(), FOG_NEAR, FOG_FAR);
    this.hemisphere = new THREE.HemisphereLight(DAY_SKY_LIGHT, DAY_GROUND_LIGHT, 0.85);
    this.ambient = new THREE.AmbientLight(DAY_AMBIENT_COLOR, 0.38);
    this.sun = new THREE.DirectionalLight(DAY_SUN_COLOR, 1.35);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -1350;
    this.sun.shadow.camera.right = 1350;
    this.sun.shadow.camera.top = 1350;
    this.sun.shadow.camera.bottom = -1350;
    this.sun.shadow.camera.near = 100;
    this.sun.shadow.camera.far = 3600;
    this.sun.shadow.bias = -0.00018;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 3;
    this.scene.add(this.hemisphere, this.ambient, this.sun, this.sunTarget);
    this.sun.target = this.sunTarget;
    this.buildWorld();

    this.actorBody = makeInstanceMesh(new THREE.CapsuleGeometry(8, 10, 2, 5), '#ffffff', MAX_ACTORS);
    this.actorHead = makeInstanceMesh(new THREE.SphereGeometry(8.5, 7, 6), '#e9c49e', MAX_ACTORS);
    this.actorHair = makeInstanceMesh(new THREE.SphereGeometry(9.5, 7, 5), '#493a33', MAX_ACTORS);
    this.actorLegs = makeInstanceMesh(new THREE.BoxGeometry(6, 12, 6), '#353b42', MAX_ACTORS * 2);
    this.actorArms = makeInstanceMesh(new THREE.CapsuleGeometry(3.2, 9, 2, 5), '#ffffff', MAX_ACTORS * 2);
    this.actorHands = makeInstanceMesh(new THREE.SphereGeometry(3.2, 6, 5), '#eec39a', MAX_ACTORS * 2);
    this.actorShadows = makeInstanceMesh(new THREE.CircleGeometry(12, 7), '#15251c', MAX_ACTORS, true);
    this.scene.add(this.actorShadows, this.actorLegs, this.actorArms, this.actorHands, this.actorBody, this.actorHead, this.actorHair);

    const sleeveMaterial = material('#d97757');
    const handMaterial = material('#eec39a');
    for (const side of [-1, 1]) {
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.42, 0.2), sleeveMaterial);
      sleeve.position.set(side * 0.34, -0.28, -0.82);
      sleeve.rotation.z = side * -0.32;
      sleeve.castShadow = false;
      this.firstPersonArms.add(sleeve);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.105, 7, 6), handMaterial);
      hand.position.set(side * 0.24, -0.42, -0.88);
      hand.castShadow = false;
      this.firstPersonArms.add(hand);
    }
    const gunMetal = material('#28323a');
    const gunDark = material('#151c22');
    const gunGlow = new THREE.MeshBasicMaterial({ color: '#62f2ff' });
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.15, 0.4), gunMetal);
    gunBody.position.set(0.31, -0.3, -0.72);
    this.firstPersonArms.add(gunBody);
    const gunGrip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.23, 0.17), gunDark);
    gunGrip.position.set(0.34, -0.44, -0.57);
    gunGrip.rotation.z = -0.18;
    this.firstPersonArms.add(gunGrip);
    const gunBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.27), gunDark);
    gunBarrel.position.set(0.31, -0.26, -1.02);
    this.firstPersonArms.add(gunBarrel);
    const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.075, 8), gunGlow);
    emitter.rotation.x = -Math.PI / 2;
    emitter.position.set(0.31, -0.26, -1.18);
    this.firstPersonArms.add(emitter);
    for (const mesh of [gunBody, gunGrip, gunBarrel, emitter]) mesh.castShadow = false;

    this.petBodies = makeInstanceMesh(new THREE.CapsuleGeometry(6, 10, 3, 8), '#d5c2a1', MAX_ACTORS);
    this.petHeads = makeInstanceMesh(new THREE.SphereGeometry(5.5, 8, 6), '#d5c2a1', MAX_ACTORS);
    this.petEars = makeInstanceMesh(new THREE.ConeGeometry(2.6, 5.5, 4), '#d5c2a1', MAX_ACTORS * 2);
    this.petInnerEars = makeInstanceMesh(new THREE.ConeGeometry(1.3, 2.8, 4), '#d9878f', MAX_ACTORS * 2);
    this.petLegs = makeInstanceMesh(new THREE.CylinderGeometry(1.7, 1.9, 6.5, 6), '#d5c2a1', MAX_ACTORS * 4);
    this.petMuzzles = makeInstanceMesh(new THREE.SphereGeometry(1.8, 6, 5), '#f1e4d0', MAX_ACTORS);
    this.petEyes = makeInstanceMesh(new THREE.SphereGeometry(0.9, 5, 4), '#292c32', MAX_ACTORS * 2);
    this.petTails = makeInstanceMesh(new THREE.CapsuleGeometry(1.6, 9, 2, 6), '#d5c2a1', MAX_ACTORS);
    this.petShadows = makeInstanceMesh(new THREE.CircleGeometry(9, 8), '#18251e', MAX_ACTORS, true);
    this.petSparkles = makeInstanceMesh(new THREE.OctahedronGeometry(2.8, 0), '#f5dc8a', MAX_ACTORS * 3);
    this.petPatches = makeInstanceMesh(new THREE.SphereGeometry(3.2, 6, 5), '#526f8b', MAX_ACTORS * 2);
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
    this.scene.add(this.buildPreviewMesh);
    this.mergeStaticWorld();
    this.setupComposer();
  }

  /** Optional post stack: bloom + vignette + grain, MSAA'd input buffer. Falls
   *  back to plain renderer.render when the composer can't initialize. */
  private setupComposer(): void {
    try {
      const composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
      composer.multisampling = Math.min(4, this.renderer.capabilities.maxSamples || 0);
      const renderPass = new RenderPass(this.scene, this.camera);
      const bloom = new BloomEffect({
        blendFunction: BlendFunction.ADD,
        luminanceThreshold: 0.82,
        luminanceSmoothing: 0.15,
        intensity: 0.45,
        mipmapBlur: true,
      });
      const vignette = new VignetteEffect({ offset: 0.26, darkness: 0.58 });
      const noise = new NoiseEffect({ premultiply: true });
      noise.blendMode.opacity.value = 0.05;
      composer.addPass(renderPass);
      composer.addPass(new EffectPass(this.camera, bloom, vignette, noise));
      this.renderPass = renderPass;
      this.composer = composer;
    } catch {
      this.composer = null;
      this.renderPass = null;
    }
  }

  /** Zoom-aware shadow frustum: hugs the visible area so the 2048² shadow map
   *  resolves ~2-3× finer texels than the old whole-world frustum. */
  private updateShadowFrustum(zoom: number): void {
    if (!this.width || !this.height || zoom === this.lastShadowZoom) return;
    this.lastShadowZoom = zoom;
    const halfH = Math.min(1350, (this.height * 1.05 / zoom) * 1.3);
    const halfW = Math.min(1350, (this.width * 1.05 / zoom) * 1.3);
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = -halfW;
    shadowCamera.right = halfW;
    shadowCamera.top = halfH;
    shadowCamera.bottom = -halfH;
    shadowCamera.updateProjectionMatrix();
  }

  private getWaterMaterial(): THREE.MeshPhongMaterial {
    if (this.waterMaterials.length === 0) this.waterMaterials.push(createWaterMaterial());
    return this.waterMaterials[0];
  }

  private addWaterPond(x: number, z: number, radiusX: number, radiusZ: number, y: number): void {
    const surface = createWaterSurface(this.getWaterMaterial(), x, z, radiusX, radiusZ, y);
    surface.receiveShadow = true;
    this.scene.add(surface);
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
    if (this.composer) this.composer.setSize(width, height);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.labelPixelRatio = Math.min(this.pixelRatio, 1.5);
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
    this.perspectiveCamera.aspect = width / height;
    this.perspectiveCamera.updateProjectionMatrix();
  }

  screenToWorld(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } | null {
    if (!this.width || !this.height) return null;
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.ndc, this.activeCamera);
    const point = this.raycaster.ray.intersectPlane(this.groundPlane, this.rayPoint);
    if (!point) return null;
    return {
      x: THREE.MathUtils.clamp(point.x, 0, WORLD_W),
      y: THREE.MathUtils.clamp(point.z, 0, WORLD_H),
    };
  }

  render(frame: CommuneThreeFrame): void {
    if (!this.width || !this.height) return;
    const firstPerson = frame.zoom >= 5;
    const zoom = THREE.MathUtils.clamp(frame.zoom, 1, 4.95);
    if (Math.abs(this.camera.zoom - zoom) > 0.001) {
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
    }
    this.activeCamera = firstPerson ? this.perspectiveCamera : this.camera;
    this.skyMesh.visible = true;
    this.boundaryGroup.visible = firstPerson;
    this.firstPersonArms.visible = firstPerson;
    this.updateShadowFrustum(firstPerson ? 5 : zoom);
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
    if (firstPerson) {
      const yaw = frame.cameraYaw;
      const pitch = THREE.MathUtils.clamp(frame.cameraPitch, -1.25, 1.25);
      const horizontal = Math.cos(pitch);
      this.perspectiveCamera.position.set(this.focus.x, 55, this.focus.z);
      this.lookAt.set(
        this.focus.x + Math.sin(yaw) * horizontal * 180,
        55 + Math.sin(pitch) * 180,
        this.focus.z + Math.cos(yaw) * horizontal * 180
      );
      this.perspectiveCamera.lookAt(this.lookAt);
      this.perspectiveCamera.updateMatrixWorld();
    } else {
      this.lookAt.set(this.focus.x, 0, this.focus.z);
      this.camera.position.set(this.focus.x + 1150, 1450, this.focus.z + 1150);
      this.camera.lookAt(this.lookAt);
      this.camera.updateMatrixWorld();
    }

    const night = THREE.MathUtils.clamp(frame.nightOpacity / 0.54, 0, 1);
    this.hemisphere.color.copy(DAY_SKY_LIGHT).lerp(NIGHT_SKY_LIGHT, night);
    this.hemisphere.groundColor.copy(DAY_GROUND_LIGHT).lerp(NIGHT_GROUND_LIGHT, night);
    this.hemisphere.intensity = 0.85 - night * 0.52;
    this.ambient.intensity = 0.38 + night * 0.1;
    this.sun.intensity = 1.35 - night * 0.95;
    this.ambient.color.copy(DAY_AMBIENT_COLOR).lerp(NIGHT_AMBIENT_COLOR, night);
    this.sun.color.copy(DAY_SUN_COLOR).lerp(NIGHT_SUN_COLOR, night);
    const fog = this.scene.fog;
    if (fog instanceof THREE.Fog) fog.color.copy(DAY_FOG_COLOR).lerp(NIGHT_FOG_COLOR, night);
    this.skyMaterial.uniforms.night.value = night;
    this.skyMesh.position.set(this.focus.x, 0, this.focus.z);
    this.sunTarget.position.set(this.focus.x, 0, this.focus.z);
    this.sun.position.set(this.focus.x - 850, 1650, this.focus.z + 1050);
    this.sun.target.updateMatrixWorld();
    this.updateLanterns(night, frame.time);
    for (const waterMaterial of this.waterMaterials) animateWater(waterMaterial, frame.time);
    updateSway(this.swayMaterials, frame.time, frame.reduceMotion);
    if (this.debugStats && frame.time - this.lastStatsAt > 5) {
      this.lastStatsAt = frame.time;
      const stats = this.renderer.info.render;
      console.info(`[commune] ${stats.calls} draw calls · ${(stats.triangles / 1000).toFixed(0)}k tris`);
    }
    this.scene.background = this.backgroundColor.copy(DAY_BACKGROUND).lerp(NIGHT_BACKGROUND, night);

    this.updateCars(frame.cars, frame.buildables);
    this.updateBuildableModels(frame.buildables, frame.buildPreview);
    this.updateActors(frame, 1 - Math.exp(-delta * 26));
    this.updatePets(frame.pets, frame.time, frame.reduceMotion);
    this.updateMarkers(frame, frame.time);
    this.updateSoccerBall(frame.soccerBall);
    this.updatePhysicsBall(this.golfBallMesh, frame.golfBall);
    this.updatePhysicsBall(this.bowlingBallMesh, frame.bowlingBall);
    this.updateBowlingPins(frame.bowlingPinsDown, frame.bowlingPinsKnockedAt, frame.time * 1000);
    this.updateLaserShots(frame.laserShots, frame.time);
    this.updateMower(frame.mower, frame.mowerTracks, frame.time, frame.reduceMotion);
    this.drawLabels(frame);
    if (this.composer && this.renderPass) {
      // RenderPass.camera is protected in the typings but stable across versions.
      (this.renderPass as unknown as { camera: THREE.Camera }).camera = this.activeCamera;
      this.composer.render(delta);
    } else {
      this.renderer.render(this.scene, this.activeCamera);
    }
  }

  dispose(): void {
    this.renderer.dispose();
    this.composer?.dispose();
    for (const waterMaterial of this.waterMaterials) {
      waterMaterial.normalMap?.dispose();
    }
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((entry) => {
          entry.map?.dispose();
          entry.normalMap?.dispose();
          entry.dispose();
        });
      }
    });
  }

  private updateLaserShots(shots: readonly CommuneThreeLaserShot[], time: number): void {
    const liveIds = new Set<string>();
    for (const shot of shots) {
      const flightSeconds = Math.max(0.08, shot.durationMs / 1000);
      const age = time - shot.startedAt;
      if (age < 0 || age > flightSeconds + 0.12) continue;
      liveIds.add(shot.id);

      let beam = this.laserBeams.get(shot.id);
      if (!beam) {
        beam = new THREE.Mesh(
          new THREE.CylinderGeometry(2.4, 2.4, 1, 10),
          new THREE.MeshBasicMaterial({
            color: '#62f2ff',
            transparent: true,
            opacity: 0.96,
            depthWrite: false,
            depthTest: false,
            blending: THREE.AdditiveBlending,
          })
        );
        beam.frustumCulled = false;
        this.laserBeams.set(shot.id, beam);
        this.scene.add(beam);
      }

      const progress = THREE.MathUtils.clamp(age / flightSeconds, 0, 1);
      const x = shot.fromX + (shot.toX - shot.fromX) * progress;
      const z = shot.fromY + (shot.toY - shot.fromY) * progress;
      const y = shot.fromHeight + (shot.toHeight - shot.fromHeight) * progress;
      const from = new THREE.Vector3(shot.fromX, shot.fromHeight, shot.fromY);
      const to = new THREE.Vector3(x, y, z);
      const distance = from.distanceTo(to);
      beam.position.copy(from).lerp(to, 0.5);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize());
      beam.scale.set(1, Math.max(1, distance), 1);
      const material = beam.material as THREE.MeshBasicMaterial;
      material.opacity = age > flightSeconds
        ? 0.96 * (1 - (age - flightSeconds) / 0.12)
        : 0.96;
      if (age >= flightSeconds) {
        let impact = this.laserImpactMeshes.get(shot.id);
        if (!impact) {
          impact = new THREE.Mesh(
            new THREE.SphereGeometry(3.5, 8, 6),
            new THREE.MeshBasicMaterial({
              color: shot.targetUsername ? '#f4fdff' : '#62f2ff',
              transparent: true,
              opacity: 0.9,
              depthWrite: false,
            })
          );
          this.laserImpactMeshes.set(shot.id, impact);
          this.scene.add(impact);
        }
        impact.visible = true;
        impact.position.set(shot.toX, shot.toHeight, shot.toY);
        const pulse = 1 + Math.sin((age - flightSeconds) * 36) * 0.22;
        impact.scale.setScalar(pulse);
        (impact.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - (age - flightSeconds) / 0.12);
      } else {
        const impact = this.laserImpactMeshes.get(shot.id);
        if (impact) impact.visible = false;
      }
    }

    for (const [id, beam] of this.laserBeams) {
      if (liveIds.has(id)) continue;
      this.scene.remove(beam);
      beam.geometry.dispose();
      (beam.material as THREE.Material).dispose();
      this.laserBeams.delete(id);
      const impact = this.laserImpactMeshes.get(id);
      if (impact) {
        this.scene.remove(impact);
        impact.geometry.dispose();
        (impact.material as THREE.Material).dispose();
        this.laserImpactMeshes.delete(id);
      }
    }
  }

  private buildWorld(): void {
    const groundMaterial = material('#78976b');
    groundMaterial.map = makeGroundTexture();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_W, WORLD_H),
      groundMaterial
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(WORLD_W / 2, -5, WORLD_H / 2);
    ground.receiveShadow = true;
    ground.userData.communeKeepSeparate = true;
    this.scene.add(ground);

    this.boundaryGroup.visible = false;
    const boundary = '#66745d';
    const boundaryTop = '#a0a879';
    addBox(this.boundaryGroup, -12, 0, WORLD_H / 2, 24, 180, WORLD_H + 24, boundary);
    addBox(this.boundaryGroup, WORLD_W + 12, 0, WORLD_H / 2, 24, 180, WORLD_H + 24, boundary);
    addBox(this.boundaryGroup, WORLD_W / 2, 0, -12, WORLD_W + 24, 180, 24, boundary);
    addBox(this.boundaryGroup, WORLD_W / 2, 0, WORLD_H + 12, WORLD_W + 24, 180, 24, boundary);
    addBox(this.boundaryGroup, -12, 180, WORLD_H / 2, 24, 16, WORLD_H + 24, boundaryTop);
    addBox(this.boundaryGroup, WORLD_W + 12, 180, WORLD_H / 2, 24, 16, WORLD_H + 24, boundaryTop);
    addBox(this.boundaryGroup, WORLD_W / 2, 180, -12, WORLD_W + 24, 16, 24, boundaryTop);
    addBox(this.boundaryGroup, WORLD_W / 2, 180, WORLD_H + 12, WORLD_W + 24, 16, 24, boundaryTop);
    this.boundaryGroup.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.Material) {
        object.material.side = THREE.DoubleSide;
        object.castShadow = false;
        object.receiveShadow = false;
      }
    });

    addGroundDisc(this.scene, 800, 620, 320, 270, '#b9b18b', 5, 32);
    addGroundDisc(this.scene, 800, 620, 278, 232, '#c6bc91', 2, 32);
    addGroundDisc(this.scene, 170, 640, 132, 88, '#486e62', 7, 20);
    addGroundDisc(this.scene, 2580, 790, 166, 118, '#486e62', 7, 20);
    this.addWaterPond(170, 640, 112, 70, 6.2);
    this.addWaterPond(2580, 790, 146, 98, 6.2);

    const pathColor = '#c6b58a';
    addPath(this.scene, [[800, 630], [800, 370], [800, 230]], 54, pathColor);
    addPath(this.scene, [[600, 625], [380, 470], [272, 390]], 46, pathColor);
    addPath(this.scene, [[1000, 625], [1220, 470], [1330, 390]], 46, pathColor);
    addPath(this.scene, [[800, 850], [800, 1040], [800, 1180]], 44, pathColor);
    addPath(this.scene, [[940, 680], [1350, 680], [1700, 680], [2110, 720], [2440, 790]], 40, pathColor);
    addPath(this.scene, [[1510, 680], [1630, 1000], [1830, 1280]], 38, pathColor);
    addPath(this.scene, [[1900, 1380], [2250, 1500], [2660, 1760]], 38, pathColor);
    addPath(this.scene, [[1440, 1050], [1460, 1420], [1580, 1770]], 38, pathColor);
    addPath(this.scene, [[1580, 1770], [1630, 1782], [1680, 1780]], 34, pathColor);
    addPath(this.scene, [[1680, 1780], [1810, 1774], [1940, 1795]], 34, pathColor);
    addPath(this.scene, [[1940, 1795], [2035, 1810], [2130, 1795]], 34, pathColor);
    addPath(this.scene, [[2130, 1795], [2255, 1770], [2370, 1710]], 34, pathColor);
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
    const villa = COMMUNE_HANGOUTS.find((hangout) => hangout.kind === 'villa');
    if (villa) {
      addBuilding(this.scene, villa.x, villa.y, villa.width, villa.depth, '#e0c99b', '#647e91', 100);
      addBox(this.scene, villa.x - 22, 5, villa.y + villa.depth * 0.55, 44, 9, 54, '#785a3c');
      addBox(this.scene, villa.x - 58, 52, villa.y + villa.depth * 0.51, 27, 28, 4, '#78a8b0');
      addBox(this.scene, villa.x + 58, 52, villa.y + villa.depth * 0.51, 27, 28, 4, '#78a8b0');
    }
    const tents = COMMUNE_HANGOUTS.filter((hangout) => hangout.kind === 'tent');
    if (tents[0]) addTent(this.scene, tents[0].x, tents[0].y, '#c88757');
    if (tents[1]) addTent(this.scene, tents[1].x, tents[1].y, '#7e9a68');

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
    this.swayMaterials.push(...addWorldScatter(this.scene));
  }

  /**
   * Bake every remaining opaque Lambert mesh (buildings, paths, benches,
   * mini-game props, lantern posts…) into one vertex-colored draw call —
   * cutting the static world from a few hundred draw calls to ~2. Dynamic
   * objects (cars, mower, pins, bulbs, markers, water, sky) are untouched.
   */
  private mergeStaticWorld(): void {
    const skipObjects = new Set<THREE.Object3D>([
      this.skyMesh,
      this.boundaryGroup,
      this.mowerGroup,
      this.firstPersonArms,
      this.buildPreviewMesh,
      this.soccerBallMesh,
      this.golfBallMesh,
      this.bowlingBallMesh,
      ...this.bowlingPins,
      ...this.lanternBulbs,
      ...this.lanternHalos,
    ]);
    for (const car of this.cars.values()) skipObjects.add(car);
    this.scene.updateMatrixWorld(true);
    const lit: THREE.BufferGeometry[] = [];
    const doubleSided: THREE.BufferGeometry[] = [];
    const color = new THREE.Color();
    const walk = (object: THREE.Object3D): void => {
      if (skipObjects.has(object)) return;
      if (object.name === 'destination-marker' || object.name === 'click-marker') return;
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh) {
        for (const child of object.children) walk(child);
        return;
      }
      const entry = object.material;
      if (!(entry instanceof THREE.MeshLambertMaterial) || entry.transparent) return;
      if (object.userData.communeKeepSeparate) return;
      const geometry = (object.geometry.index
        ? object.geometry.toNonIndexed()
        : object.geometry.clone()
      ).applyMatrix4(object.matrixWorld);
      if (!geometry.getAttribute('uv')) {
        geometry.setAttribute('uv', new THREE.BufferAttribute(
          new Float32Array(geometry.getAttribute('position').count * 2), 2
        ));
      }
      const vertexCount = geometry.getAttribute('position').count;
      color.copy(entry.color);
      const colors = new Float32Array(vertexCount * 3);
      for (let index = 0; index < vertexCount; index++) {
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      (entry.side === THREE.DoubleSide ? doubleSided : lit).push(geometry);
      object.geometry.dispose();
      entry.dispose();
      object.removeFromParent();
    };
    for (const child of [...this.scene.children]) walk(child);

    const buildMergedMesh = (sources: THREE.BufferGeometry[], name: string, castShadow: boolean): void => {
      if (sources.length === 0) return;
      const merged = mergeGeometries(sources, false);
      sources.forEach((geometry) => geometry.dispose());
      if (!merged) return;
      const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({
        vertexColors: true,
        flatShading: true,
      }));
      mesh.name = name;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    };
    buildMergedMesh(lit, 'static-world', true);
    buildMergedMesh(doubleSided, 'static-world-double-sided', false);
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
      const shimmer = 0.94
        + Math.sin(time * 2.2 + index * 1.7) * 0.05
        + Math.sin(time * 13.7 + index * 3.1) * 0.03;
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
    this.addWaterPond(800, 600, 71, 71, 5.4);
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
    this.addCarModel({
      id: 'meadow-cruiser', x: 0, y: 0, heading: 0, body: '#6288a4', trim: '#d5e2e7',
    });
    this.addCarModel({
      id: 'orchard-wagon', x: 0, y: 0, heading: 0, body: '#b76552', trim: '#f0d7b3',
    });
  }

  private addCarModel(car: RenderCar): THREE.Group {
    const group = new THREE.Group();
    if (car.style === 'electric-sport') {
      addBox(group, 0, 5, 0, 88, 18, 136, car.body);
      addBox(group, 0, 14, -42, 76, 12, 46, car.body);
      addBox(group, 0, 14, 42, 76, 12, 42, car.body);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(62, 22, 64), new THREE.MeshLambertMaterial({
        color: '#526b77',
        transparent: true,
        opacity: 0.82,
        flatShading: true,
      }));
      glass.position.set(0, 34, -3);
      glass.castShadow = true;
      group.add(glass);
      addBox(group, 0, 47, -5, 49, 5, 54, car.trim);
      for (const x of [-46, 46]) {
        for (const z of [-44, 45]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 8, 8), material('#252c31'));
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(x, 14, z);
          group.add(wheel);
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 8.5, 8), material('#cbd2d3'));
          hub.rotation.z = Math.PI / 2;
          hub.position.set(x, 14, z);
          group.add(hub);
        }
      }
      addBox(group, -25, 20, -66, 22, 5, 4, '#fff2cc');
      addBox(group, 25, 20, -66, 22, 5, 4, '#fff2cc');
      addBox(group, -24, 18, 67, 20, 5, 4, '#e87667');
      addBox(group, 24, 18, 67, 20, 5, 4, '#e87667');
      addBox(group, 0, 9, -71, 66, 8, 5, '#34434a');
      addBox(group, 0, 9, 71, 66, 8, 5, '#34434a');
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(64, 25, 102), material(car.body));
      body.position.y = 24;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(42, 24, 50), material(car.trim));
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
    }
    group.visible = false;
    this.cars.set(car.id, group);
    this.scene.add(group);
    return group;
  }

  private updateCars(cars: readonly RenderCar[], buildables: readonly CommuneBuildable[]): void {
    const visibleIds = new Set(cars.map((car) => car.id));
    for (const car of cars) {
      let group = this.cars.get(car.id);
      if (!group) group = this.addCarModel(car);
      group.visible = true;
      group.position.set(car.x, 0, car.y);
      group.rotation.y = -car.heading;
      const buildable = car.buildId ? buildables.find((item) => item.id === car.buildId) : undefined;
      setConstructionOpacity(group, buildable && communeBuildIsUnderConstruction(buildable) ? 0.46 : 1);
    }
    for (const [id, group] of this.cars) {
      if (!id.startsWith('buildcar-') || visibleIds.has(id)) continue;
      this.scene.remove(group);
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((entry) => entry.dispose());
      });
      this.cars.delete(id);
    }
  }

  private updateBuildableModels(buildables: readonly CommuneBuildable[], preview: RenderBuildPreview | null): void {
    const liveIds = new Set<string>();
    for (const item of buildables) {
      if (item.kind === 'sports-car') continue;
      liveIds.add(item.id);
      let group = this.buildableModels.get(item.id);
      if (!group) {
        group = createBuildableModel(item);
        this.buildableModels.set(item.id, group);
        this.scene.add(group);
      }
      group.position.set(item.x, 0, item.y);
      group.rotation.y = -item.rotation;
      setConstructionOpacity(group, communeBuildIsUnderConstruction(item) ? 0.46 : 1);
    }
    for (const [id, group] of this.buildableModels) {
      if (liveIds.has(id)) continue;
      this.scene.remove(group);
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((entry) => entry.dispose());
      });
      this.buildableModels.delete(id);
    }
    const entry = preview ? COMMUNE_BUILD_CATALOG.find((item) => item.kind === preview.kind) : null;
    this.buildPreviewMesh.visible = !!preview && !!entry;
    if (preview && entry) {
      this.buildPreviewMesh.position.set(preview.x, 4, preview.y);
      this.buildPreviewMesh.scale.set(entry.width / 2, entry.depth / 2, 1);
      this.buildPreviewMesh.rotation.set(-Math.PI / 2, 0, -preview.rotation);
      (this.buildPreviewMesh.material as THREE.MeshBasicMaterial).color.set(preview.valid ? '#67df8b' : '#ff5c5c');
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
      const headingX = actor.headingX ?? 0;
      const headingY = actor.headingY ?? 1;
      const heading = Math.atan2(headingX, headingY);
      const hideActor = !!actor.hangoutId;
      const shirtColor = actor.avatar?.shirt ?? actor.hue;
      const hairColor = actor.avatar?.hair ?? '#493a33';
      const bottomColor = actor.avatar?.bottomColor ?? '#424a4e';
      const sleeveColor = typeof shirtColor === 'number'
        ? new THREE.Color().setHSL(((shirtColor % 360) + 360) % 360 / 360, 0.52, 0.48)
        : new THREE.Color(shirtColor);
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
          this.actorArms.setColorAt(index * 2 + leg, sleeveColor);
          this.actorHands.setColorAt(index * 2 + leg, TEMP_COLOR.set('#eec39a'));
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
      this.transform.rotation.set(0, heading, 0);
      const hideFirstPersonHead = index === 0 && frame.zoom >= 5;
      const visibleScale = hideActor || hideFirstPersonHead ? 0 : car ? 0.74 : 1;
      this.transform.scale.set(visibleScale, visibleScale, visibleScale);
      setInstance(this.actorBody, index, this.transform);

      this.transform.position.set(x, 43 + bob, z);
      this.transform.rotation.set(0, heading, 0);
      this.transform.scale.setScalar(hideActor || hideFirstPersonHead ? 0 : 1);
      setInstance(this.actorHead, index, this.transform);

      this.transform.position.set(x - headingX, 51 + bob, z - headingY);
      this.transform.rotation.set(0, heading, 0);
      this.transform.scale.set(
        hideActor || hideFirstPersonHead ? 0 : 1.02,
        hideActor || hideFirstPersonHead ? 0 : 0.34,
        hideActor || hideFirstPersonHead ? 0 : 0.92,
      );
      setInstance(this.actorHair, index, this.transform);

      this.transform.position.set(x, 2, z);
      this.transform.rotation.set(-Math.PI / 2, 0, 0);
      this.transform.scale.setScalar(hideActor ? 0 : 1);
      setInstance(this.actorShadows, index, this.transform);

      for (let leg = 0; leg < 2; leg++) {
        const limbIndex = index * 2 + leg;
        const side = leg ? 10 : -10;
        const step = leg ? stride : -stride;
        this.transform.position.set(
          x - headingY * side + headingX * step,
          25 + bob,
          z + headingX * side + headingY * step
        );
        this.transform.rotation.set(0, heading, 0);
        this.transform.scale.setScalar(hideActor ? 0 : 1);
        setInstance(this.actorArms, limbIndex, this.transform);
        this.transform.position.y = 16 + bob + Math.abs(step) * 0.35;
        setInstance(this.actorHands, limbIndex, this.transform);

        this.transform.position.set(
          x - headingY * (leg ? 4 : -4) + headingX * step,
          9 + bob,
          z + headingX * (leg ? 4 : -4) + headingY * step
        );
        this.transform.scale.setScalar(hideActor ? 0 : 1);
        setInstance(this.actorLegs, limbIndex, this.transform);
      }
    }
    this.actorBody.count = count;
    this.actorHead.count = count;
    this.actorHair.count = count;
    this.actorShadows.count = count;
    this.actorLegs.count = count * 2;
    this.actorArms.count = count * 2;
    this.actorHands.count = count * 2;
    for (const mesh of [this.actorBody, this.actorHead, this.actorHair, this.actorLegs, this.actorArms, this.actorHands, this.actorShadows]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (colorsChanged) {
      for (const mesh of [this.actorBody, this.actorHair, this.actorLegs, this.actorArms, this.actorHands]) {
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
      const headingX = pet.headingX ?? (pet.facingLeft ? -1 : 1);
      const headingY = pet.headingY ?? 0;
      const heading = Math.atan2(-headingY, headingX);
      const offset = (forward: number, side = 0) => ({
        x: pet.x + forward * headingX - side * headingY,
        z: pet.y + forward * headingY + side * headingX,
      });
      const hop = !reduceMotion && pet.pose === 'play' ? Math.abs(Math.sin(time * 7 + index)) * 6 : 0;
      const walkBob = walking ? Math.abs(Math.sin(phase)) * 2 : 0;
      const idleBreath = reduceMotion ? 0 : Math.sin(time * 1.7 + index * 1.9) * 0.45;
      const bob = hop + walkBob + idleBreath;
      const bodyY = 9 + bob;
      const loafing = pet.pose === 'loaf';
      const sitting = pet.pose === 'sit';
      const bodyScaleY = loafing ? 0.62 : sitting ? 0.82 : 0.95;
      const bodyScaleX = loafing ? 1.3 : sitting ? 1.1 : 1.15;
      const headY = bodyY + (loafing ? 7 : sitting ? 11 : 13);
      const sniffDip = !reduceMotion && pet.pose === 'sniff' ? Math.sin(time * 4 + index) * 1.3 : 0;
      const tailSwish = reduceMotion ? 0 : Math.sin(time * 2.8 + index * 1.6) * 0.42;
      const earFlick = !reduceMotion && Math.sin(time * 1.25 + index * 2.3) > 0.94 ? 0.16 : 0;
      const stageScale = pet.stage === 'Kitten' ? 0.78 : pet.stage === 'Elder' ? 1.04 : 0.92;

      this.transform.position.set(pet.x, bodyY, pet.y);
      this.transform.rotation.set(0, heading, 0);
      this.transform.scale.set(bodyScaleX * stageScale, bodyScaleY * stageScale, stageScale);
      setInstance(this.petBodies, index, this.transform);

      const firstPatch = offset(-4, 2.5);
      this.transform.position.set(firstPatch.x, bodyY + 3.5, firstPatch.z);
      this.transform.rotation.set(0, heading, 0);
      this.transform.scale.set(0.5, 0.6, 0.54);
      setInstance(this.petPatches, patchCount++, this.transform);
      const secondPatch = offset(2, -2);
      this.transform.position.set(secondPatch.x, bodyY + 3.8, secondPatch.z);
      this.transform.rotation.set(0, heading, 0);
      this.transform.scale.set(0.42, 0.5, 0.46);
      setInstance(this.petPatches, patchCount++, this.transform);

      const head = offset(4, 2);
      this.transform.position.set(head.x, headY - sniffDip, head.z);
      this.transform.rotation.set(0, heading, sniffDip * 0.05);
      this.transform.scale.set(0.78 * stageScale, 0.78 * stageScale, 0.78 * stageScale);
      setInstance(this.petHeads, index, this.transform);

      for (let ear = 0; ear < 2; ear++) {
        const earIndex = index * 2 + ear;
        const earPosition = offset(4, ear ? 2.4 : -2.4);
        const earTilt = ear === 0 ? -0.12 : 0.12;
        this.transform.position.set(earPosition.x, headY + 4.5 - sniffDip, earPosition.z);
        this.transform.rotation.set(earTilt + earFlick, heading, earTilt);
        this.transform.scale.set(stageScale, stageScale, stageScale);
        setInstance(this.petEars, earIndex, this.transform);
        const innerEar = offset(4, ear ? 3.3 : -3.3);
        this.transform.position.set(innerEar.x, headY + 5.4 - sniffDip, innerEar.z);
        this.transform.rotation.set(earTilt + earFlick, heading, earTilt);
        this.transform.scale.set(stageScale, stageScale, stageScale);
        setInstance(this.petInnerEars, earIndex, this.transform);
      }

      const muzzle = offset(6.5, 0);
      this.transform.position.set(muzzle.x, headY - 0.8 - sniffDip, muzzle.z);
      this.transform.rotation.set(0, heading, 0);
      this.transform.scale.set(stageScale, stageScale, stageScale);
      setInstance(this.petMuzzles, index, this.transform);
      for (let eye = 0; eye < 2; eye++) {
        const eyeIndex = eyeCount++;
        const eyePosition = offset(6, eye ? 1.9 : -1.9);
        this.transform.position.set(eyePosition.x, headY + 1.1 - sniffDip, eyePosition.z);
        this.transform.rotation.set(0, heading, 0);
        this.transform.scale.set(stageScale, stageScale, stageScale);
        setInstance(this.petEyes, eyeIndex, this.transform, '#252a32');
      }

      const tail = offset(-8.5, 0);
      this.transform.position.set(tail.x, bodyY + 10, tail.z);
      this.transform.rotation.set(0, heading, 1.05 + tailSwish);
      this.transform.scale.set(stageScale, stageScale * 1.25, stageScale);
      setInstance(this.petTails, index, this.transform);

      for (let leg = 0; leg < 4; leg++) {
        const legIndex = index * 4 + leg;
        const side = leg % 2 ? 1 : -1;
        const front = leg < 2;
        const stride = walking ? Math.sin(phase + (front === (side < 0) ? 0 : Math.PI)) * 2.1 : 0;
        const lift = walking ? Math.max(0, Math.sin(phase + (front === (side < 0) ? 0 : Math.PI))) * 1.3 : 0;
        const legPosition = offset((front ? 4 : -4) + stride, side * 3);
        this.transform.position.set(
          legPosition.x,
          3.6 + lift + (loafing ? -1.4 : 0),
          legPosition.z
        );
        this.transform.rotation.set(0, heading, stride * 0.08);
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
          const sparklePosition = offset(9 + Math.cos(orbit) * radius, 5 + Math.sin(orbit) * radius * 0.45);
          this.transform.position.set(
            sparklePosition.x,
            headY + 8 + Math.sin(orbit) * 2,
            sparklePosition.z
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

  /* ── Husko the giant husky (model + rig live in three-husko.ts) ──────────── */

  private updateHusko(frame: CommuneThreeFrame, time: number): void {
    if (!this.huskoRig) this.huskoRig = createHuskoRig(this.scene);
    updateHuskoRig(this.huskoRig, frame.husko, time);
  }

  /** Project a world coordinate to CSS pixels on the label overlay. */
  projectWorldToScreen(x: number, y: number, height = 70): { x: number; y: number; visible: boolean } {
    this.projectedPoint.set(x, height, y).project(this.activeCamera);
    const point = this.projectedPoint;
    const visible = point.z >= -1 && point.z <= 1
      && Math.abs(point.x) <= 1.05 && Math.abs(point.y) <= 1.05;
    return {
      x: (point.x * 0.5 + 0.5) * this.width,
      y: (-point.y * 0.5 + 0.5) * this.height,
      visible,
    };
  }

  private updateMarkers(frame: CommuneThreeFrame, time: number): void {
    this.updateHusko(frame, time);
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
      this.projectedPoint.set(landmark.x, landmark.height, landmark.z).project(this.activeCamera);
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
    this.projectedPoint.set(mower.x, 55, mower.y).project(this.activeCamera);
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
    if (frame.husko) {
      const spot = this.projectWorldToScreen(frame.husko.x, frame.husko.y, 110);
      if (spot.visible) {
        drawLabel(ctx, spot.x, spot.y, 'Husko 🐺');
        if (frame.husko.says && frame.husko.says.until > Date.now()) {
          drawLabel(ctx, spot.x, spot.y - 24, frame.husko.says.text.slice(0, 48), true);
        }
      }
    }
    const drawActorLabel = (actor: RenderActor) => {
      if (actor.carId || actor.hangoutId) return;
      const visual = this.visualPositions.get(actor.name);
      const actorX = visual?.x ?? actor.x;
      const actorZ = visual?.z ?? actor.y;
      const bob = actor.moving && !frame.reduceMotion
        ? Math.abs(Math.sin(frame.time * 10 + (actor.bobPhase ?? 0))) * 2
        : 0;
      if (actor === frame.player && frame.zoom >= 5) return;
      this.projectedPoint.set(actorX, 66 + bob, actorZ).project(this.activeCamera);
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
    for (const car of frame.cars) {
      const buildable = car.buildId
        ? frame.buildables.find((item) => item.id === car.buildId)
        : undefined;
      if (!buildable) continue;
      const underConstruction = communeBuildIsUnderConstruction(buildable);
      const hovered = frame.hoveredBuildId === buildable.id;
      if (!underConstruction && !hovered) continue;
      this.projectedPoint.set(car.x, 82, car.y).project(this.activeCamera);
      const point = this.projectedPoint;
      if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1.08 || Math.abs(point.y) > 1.1) continue;
      const screenX = (point.x * 0.5 + 0.5) * this.width;
      const screenY = (-point.y * 0.5 + 0.5) * this.height;
      if (underConstruction) drawLabel(ctx, screenX, screenY, 'UNDER CONSTRUCTION', true);
      if (hovered) drawLabel(ctx, screenX, screenY - (underConstruction ? 20 : 0), `Owner · ${buildable.owner}`, true);
    }
    for (const hangout of COMMUNE_HANGOUTS) {
      const occupants = [frame.player, ...frame.remotes]
        .filter((actor) => actor.hangoutId === hangout.id)
        .map((actor) => actor.name)
        .slice(0, hangout.capacity);
      const height = hangout.kind === 'villa' ? 122 : 90;
      this.projectedPoint.set(hangout.x, height, hangout.y).project(this.activeCamera);
      const point = this.projectedPoint;
      if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1.08 || Math.abs(point.y) > 1.1) continue;
      drawHangoutLabel(
        ctx,
        (point.x * 0.5 + 0.5) * this.width,
        (-point.y * 0.5 + 0.5) * this.height,
        hangout.label.toUpperCase(),
        occupants,
        hangout.capacity,
      );
    }
    for (const building of frame.buildables) {
      if (building.kind === 'sports-car') continue;
      const catalog = COMMUNE_BUILD_CATALOG.find((item) => item.kind === building.kind);
      if (!catalog) continue;
      const underConstruction = communeBuildIsUnderConstruction(building);
      const hovered = frame.hoveredBuildId === building.id;
      if (!underConstruction && !hovered) continue;
      const height = building.kind === 'tree' ? 110
        : building.kind === 'beach-umbrella' ? 96
          : building.kind === 'paper-lantern' ? 96
            : building.kind === 'tent' ? 82 : 62;
      this.projectedPoint.set(building.x, height, building.y).project(this.activeCamera);
      const point = this.projectedPoint;
      if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1.08 || Math.abs(point.y) > 1.1) continue;
      const screenX = (point.x * 0.5 + 0.5) * this.width;
      const screenY = (-point.y * 0.5 + 0.5) * this.height;
      if (underConstruction) drawLabel(ctx, screenX, screenY, 'UNDER CONSTRUCTION', true);
      if (hovered) drawLabel(ctx, screenX, screenY - (underConstruction ? 20 : 0), `Owner · ${building.owner}`, true);
    }
    if (frame.buildPreview) {
      const preview = frame.buildPreview;
      const catalog = COMMUNE_BUILD_CATALOG.find((item) => item.kind === preview.kind);
      if (catalog) {
        const corners = [
          [-catalog.width / 2, -catalog.depth / 2],
          [catalog.width / 2, -catalog.depth / 2],
          [catalog.width / 2, catalog.depth / 2],
          [-catalog.width / 2, catalog.depth / 2],
        ].map(([localX, localY]) => {
          const cos = Math.cos(preview.rotation);
          const sin = Math.sin(preview.rotation);
          return new THREE.Vector3(
            preview.x + (localX ?? 0) * cos - (localY ?? 0) * sin,
            4,
            preview.y + (localX ?? 0) * sin + (localY ?? 0) * cos,
          ).project(this.activeCamera);
        });
        ctx.save();
        ctx.beginPath();
        corners.forEach((point, index) => {
          const screenX = (point.x * 0.5 + 0.5) * this.width;
          const screenY = (-point.y * 0.5 + 0.5) * this.height;
          if (index === 0) ctx.moveTo(screenX, screenY);
          else ctx.lineTo(screenX, screenY);
        });
        ctx.closePath();
        ctx.fillStyle = preview.valid ? 'rgba(73,210,115,0.24)' : 'rgba(245,79,79,0.25)';
        ctx.strokeStyle = preview.valid ? '#6de59a' : '#ff6262';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
        this.projectedPoint.set(preview.x, 105, preview.y).project(this.activeCamera);
        if (Math.abs(this.projectedPoint.x) <= 1.08 && Math.abs(this.projectedPoint.y) <= 1.1) {
          drawLabel(
            ctx,
            (this.projectedPoint.x * 0.5 + 0.5) * this.width,
            (-this.projectedPoint.y * 0.5 + 0.5) * this.height,
            preview.valid ? 'CLICK TO BUILD' : 'BLOCKED SPOT',
            true,
          );
        }
        ctx.restore();
      }
    }
  }
}
