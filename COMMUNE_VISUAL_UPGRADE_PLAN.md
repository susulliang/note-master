# Commune 3D Visual Upgrade Plan

> Goal: transform the Commune world from "programmer-art low-poly" to a polished,
> cozy stylized diorama look — **without giving up the current performance posture**
> (already instanced, DPR-budgeted, dispose-clean). Grounded in the current
> implementation of `src/lib/commune-three-renderer.ts` (2287 lines) and web
> research on shipped Three.js games (Bruno Simon's portfolio, HexGL, Astray,
> Krunker, recent pmndrs-style dioramas).

**tl;dr of the research:** good-looking Three.js games are *not* high-poly — they win on
(1) one locked palette, (2) a real lighting rig (hemisphere + one tight shadow light),
(3) fog + sky + tone mapping for atmosphere, (4) one or two signature effects
(water, grass sway, bloom), and (5) a minimal post stack (bloom + vignette + grain + SMAA,
~0.5–2 ms GPU combined). Detail comes from silhouette and shadow, not triangle count.

---

## 1. Current-state audit

Facts from `src/lib/commune-three-renderer.ts` (line refs approximate but stable):

| Area | Today | Verdict |
|---|---|---|
| Renderer | WebGL2, `antialias: false` (L648–653), output sRGB, **no tone mapping** (default NoToneMapping) | Jaggies + washed-out saturated colors |
| Resolution | Dynamic pixel ratio, 3 MP budget, cap 1.35 (L641, L884–911) | Good — keep |
| Camera | Ortho isometric (fixed 1150/1450/1150 offset, zoom 1–4.95), perspective only for first-person laser mode (L930–969) | Good — keep as the game's identity |
| Materials | Single helper `material()` → `MeshLambertMaterial({ color, flatShading })` (L185–187). **Zero textures, zero env maps** in the whole scene | The #1 "basic" cause: untextured flat color, no surface variation |
| Lighting | `AmbientLight 1.35` + `DirectionalLight 1.5` (L714–728). High ambient = flat, shadowless-feeling world | Ambient washes out form; needs hemisphere + rebalance |
| Shadows | One 1024² PCFSoft map covering the **entire 3200×2400 world** (frustum ±1350, L717–726) → ~2.6 world units/texel | Blobby, low-res shadows; frustum is 4–6× larger than the visible area |
| Sky | Gradient shader dome, but `skyMesh.visible = firstPerson` only (L937); top-down mode uses a flat `scene.background` color lerp (L982) | Near-free win hiding in plain sight |
| Fog | **None** | No depth cueing, hard map-edge cutoff |
| Post FX | **None** (no EffectComposer / postprocessing) | No bloom, grading, AA, vignette — the "unfinished" feel |
| World | ~200–400 individual primitive meshes (boxes/cones/discs via `addBox`/`addGroundDisc`/`addBuilding`), each its own draw call | Probably the largest draw-call source; mergeable |
| Instancing | Actors, pets, trees, flowers, drops — already `InstancedMesh` with `setColorAt` | Excellent — keep and extend |
| Characters | Husko = 16 boxes (L1934–1964); actors = instanced capsule+dodecahedron | Charming voxel identity, but silhouette/palette need a pass |
| Water | Ponds are flat teal `CylinderGeometry` discs (L1123–1126); no animation | Fishing is a core activity — water is the biggest missed signature moment |
| Labels | 2D canvas overlay at `min(pixelRatio, 1)` DPR (L897) | Soft text on retina; cheap win |
| Lanterns | 4 `PointLight`s + halo spheres (L1343–1375) | Fine; add flicker for life |
| Perf hygiene | `dispose()` on unmount, temp objects reused, no per-frame allocations | Good |

**Diagnosis:** the scene's "basic" look is ~80% pipeline, ~20% models. Palette discipline,
lighting rebalance, fog/sky, tone mapping, and a small post stack will transform it more
than any model swap — and cost almost nothing. Models matter most for the hero (Husko).

---

## 2. Art-direction target

One locked direction, applied across every workstream below:

- **Look:** cozy stylized diorama (A Short Hike / Animal Crossing adjacency) — soft warm
  daylight, gentle depth fog, saturated-but-controlled palette, crisp soft shadows.
- **Palette:** 12–16 shared colors in a single module (`commune-palette.ts`), consumed by
  materials, sky shader, fog, labels, and particles. No ad-hoc hex anywhere.
- **One dominant light** (sun) + hemisphere fill; fog and sky horizon share the same color.
- **One signature moment:** living water at the ponds (scrolling normals + bobber ripple),
  plus instanced grass sway. No SSAO, no DoF, no planar reflections — measured costs
  outweigh benefit at our zoom levels.

---

## 3. Workstreams

### A. Palette & tone mapping — "not programmer art" (Phase 0)

- Create `src/shared/commune-palette.ts`: ground tiers, path, roof/wall sets, water,
  sky day/night horizon+zenith, fog, lantern. Port the existing hexes first
  (`DAY_BACKGROUND` L14, ground `#78976b`, paths `#c6b58a`, …), then *tune once*.
- `renderer.toneMapping = THREE.NeutralToneMapping` (Khronos PBR Neutral, r162+):
  preserves saturated stylized colors best; ACES hue-shifts, AgX desaturates. One line,
  but ship **together with** the palette tune since exposure response changes.
- Keep `outputColorSpace = SRGBColorSpace`.

**Cost:** ~0 GPU. **Risk:** color shift — fix by tuning, not by reverting.

### B. Lighting & shadows — biggest image-quality jump (Phase 1)

- Replace `AmbientLight 1.35` with `HemisphereLight(skyColor, groundColor, ~0.9)`;
  drop sun to ~1.15. Ambient-to-form ratio is what makes the world flat today.
- **Tight, zoom-aware shadow frustum:** today ±1350 covers the whole world at 1024²
  (~2.6 u/texel). The ortho view shows `2 × height × 1.05 / zoom` world units vertically
  (L904–908) — size `sun.shadow.camera` to the visible rect + 20% margin, recompute only
  when zoom changes. Same 1024² map, but ~1 u/texel at zoom 2+: visibly crisper contact
  shadows. Keep `PCFSoftShadowMap`, `normalBias ≈ 0.03`.
- Shadow pass re-renders the scene every frame (sun follows focus, L978–980) — acceptable,
  but set `sun.shadow.autoUpdate = true` only while anything moves; when the frame is
  fully static (no actors moving, reduceMotion, nothing animating), skip
  `shadow.needsUpdate` for a free idle-path win.
- Optional: bump `mapSize` to 2048 only if `renderer.info` shows shadow pass < 1.5 ms.

**Cost:** ~0 net GPU (same map, better allocation). **Risk:** shadow clipping at zoom 1 —
mitigated by the +20% margin formula.

### C. Atmosphere: sky + fog, always on (Phase 0)

- Show the existing gradient dome in top-down too (`skyMesh.visible = true`, L937) and
  re-grade its uniforms from the palette; add a **sun disc** (billboard or shader spot)
  and a few shader-cheap **stars** at night (`step(hash(uv), 0.002) * night`).
- Add `scene.fog = new THREE.Fog(fogColor, ~1600, ~3400)` — camera-to-focus distance is
  ~2180, so fog mostly affects far map edges and vertical drop-off: soft horizon, no
  hard world-edge cutoff, instant depth. `ShaderMaterial` sky ignores fog by default —
  match colors manually.
- `scene.background` becomes irrelevant (dome covers it) — keep as fallback color.

**Cost:** ~0. **Risk:** fog washing the play area — tune near/far at zoom 1 vs 4.95.

### D. Ground & map detail (Phase 1–2)

- **Static-world merge (perf foundation):** buildings, benches, fences, bowling lanes,
  mini-game props are individual meshes → convert each primitive's `material()` color to
  a **vertex color attribute** and `mergeGeometries` (three/examples `BufferGeometryUtils`)
  into a handful of buffers (e.g. `flat-lit`, `unlit-emissive`). Whole static world ≈ 5–15
  draw calls instead of ~200–400. `flatShading` still works (shader derivatives).
  Static = anything that never moves or fades; buildables/cars stay as groups.
- **Ground variation:** single-color plane today (L1093–1100). Add (a) vertex-color
  patches under terrain discs/paths blending outward, and (b) one procedural
  `CanvasTexture` (noise mottling, subtle blade flecks) generated once at init and
  uploaded once — **never per-frame** (WKWebView canvas→WebGL uploads are pathologically
  slow, WebKit #315417). ~512², NearestMipmapLinear, repeat 40×.
- **Instanced scatter:** extend the existing pattern (`addTreeInstances` L461, flowers
  L1418) with grass tufts (2-triangle cross-quads, vertex-shader wind sway via
  `onBeforeCompile`, respecting `frame.reduceMotion`), rocks, reeds around ponds.
  Thousands of instances = 1–3 draw calls.

### E. Models — hero first, kit assets second (Phase 2–3)

- **Husko (hero):** keep the voxel identity but (1) improve silhouette — chest ruff,
  haunches, angled snout wedge, ear rotation; (2) palette-grade the coat
  (`#93a1ad` family) with rim-light: cheap inverted-hull outline (`BackSide` duplicate,
  scale 1.04, dark navy) or Fresnel rim via `onBeforeCompile` — ~2 extra draw calls;
  (3) eye+snout detail boxes already exist — refine placement.
- **Actors/pets (instanced):** swap `DodecahedronGeometry` heads for rounded low-poly
  (`SphereGeometry(…, 8, 6)` with flatShading reads friendlier), add instanced backpack/
  scarf color slots. Zero architecture change.
- **Buildings:** either a detail pass on current prisms (roof overhang slabs, chimney,
  window boxes as merged geometry — still one draw call after D-merge) **or** replace
  with 3–5 CC0 kit assets (Kenney "City/Nature", KayKit town). If importing glTF:
  **meshopt** compression (2–3× faster decode than Draco, 32 KB decoder; gltf-transform
  CLI), load via `GLTFLoader` + `MeshoptDecoder`; skip KTX2 until we ship textured
  models (vertex-color assets need no textures). License: prefer CC0 (Kenney,
  Quaternius — has animated CC0 dogs if we ever want a rigged Husko; Poly Pizza
  filterable).

### F. Living water — the signature moment (Phase 3)

- Replace pond discs (L1123–1126) with a dedicated `MeshPhongMaterial` water plane:
  two scrolling procedural normal layers (math-generated canvas normal map, uploaded
  once), fresnel tint toward sky-horizon color, depth tint (darker center), specular
  glint from the sun direction. No planar reflection (three's `Water` doubles draw
  calls — measured 83→139 even at half-res reflection), no refraction.
- **Bobber ripple:** expanding ring mesh at the fishing spot + occasional sparkle
  instanced glints. Ripple only near the bobber — the rest is just scrolling normals.
- Ortho top-down: fresnel is weak — normals + spec carry the effect; validate at zoom 4.95.

**Cost:** ~1 extra fullscreen-ish pass worth of fragments over pond area only. **Risk:** low.

### G. Post pipeline — the "finished game" feel (Phase 4)

- Add **pmndrs `postprocessing`** (not raw EffectComposer): merges effects into one
  `EffectPass`, single-triangle blits, WebGL2 multisampling support, selective bloom.
- Minimal stack (measured +0.5–2.2 ms GPU at 1440×900 on a recent GPU):
  `RenderPass → Bloom(threshold ~1.0, low intensity → lanterns, water glints, laser
  emitter only) → Vignette+Noise (merged) → SMAA`. SMAA fixes the `antialias:false`
  jaggies; FXAA is the cheaper fallback.
- **Resolution is the multiplier** (same stack = 10 ms at 4K): integrate with the
  existing 3 MP budget — composer size follows `resize()` L884; adaptive DPR steps down
  if frametime > 16.7 ms for N frames.
- **Graceful fallback:** keep the current direct `renderer.render` path; wrap composer
  creation in try/catch → fall back on any failure (Tauri/WebView variance).
- Do **not** add: DoF, SSAO/N8AO (~2.7–3.3 ms even on strong GPUs), god rays, planar
  reflections.

### H. Guardrails & telemetry (Phase 0, then continuous)

- Dev-only overlay (query param): fps + `renderer.info.render.calls/triangles` sampled
  1×/sec; assert budgets: **< 150 draw calls, < 1.5 M tris, flat memory**.
- WKWebView specifics (macOS Tauri): ANGLE injects `[[sample_mask]]` on Apple GPUs →
  all shaders pay discard-like overdraw cost — **minimize transparent overdraw**
  (halo spheres, preview ring, water alpha); macOS ≤ 15 caps WKWebView at 60 fps
  (macOS 26 lifts it) — don't chase 120 Hz; never upload 2D-canvas textures per frame.
- Keep `dispose()` coverage for every new resource (composer, render targets, merged
  geometries, scatter instanced meshes).

---

## 4. Phased rollout

| Phase | Contents | Effort | Impact | Perf delta |
|---|---|---|---|---|
| **0 — Quick wins** | Palette module + tone mapping (A), sky always-on + fog (C), label DPR 1→1.5 (H), lantern flicker, dev telemetry (H) | S (~1 day) | Big | ~0 |
| **1 — Light & merge** | Hemisphere rig + zoom-aware shadow frustum (B), static-world vertex-color merge (D), ground texture + vertex patches (D) | M (2–3 days) | **Biggest** | Draw calls ↓↓ (200–400 → <50), headroom for Phase 4 |
| **2 — Scatter & models** | Grass/rocks/reeds instanced sway (D), tree variety (2–3 canopy types, autumn accents), building trim pass or kit assets (E), actor/pet shape upgrades (E) | M (2–3 days) | Big | Draw calls +3–6 |
| **3 — Hero & water** | Husko silhouette + outline/rim (E), stylized water + bobber ripple (F) | M (2 days) | Big (signature) | +1 small pass over ponds |
| **4 — Post stack** | `postprocessing`: Bloom + Vignette + Noise + SMAA, adaptive DPR, fallback (G) | S–M (1–2 days) | Big ("finished" feel) | +0.5–2 ms GPU, gated on Phase 1 headroom |
| **5 — Grading & polish** | Day/night graded variants of everything, reduce-motion audit, final budget assertion (H) | S (1 day) | Medium | ~0 |

**Acceptance criteria (each phase):** 60 fps sustained on Apple-Silicon WKWebView at
default zoom with 64 actors + Husko active; draw calls/triangles within budget via the
dev overlay; no regression in `dispose()` cleanliness; day *and* night variants look
intentional (screenshots reviewed).

**Non-goals:** SSAO, DoF, planar-reflection water, WebGPU migration, animated rigged
characters (revisit only if we adopt a CC0 rigged Husko later), PBR texture maps on the
world.

---

## 5. Key file touch map

| File | Changes |
|---|---|
| `src/lib/commune-three-renderer.ts` | All renderer-side workstreams (A–G) |
| `src/shared/commune-palette.ts` (new) | Single palette source of truth (A) |
| `src/components/CommunePanel.tsx` | Label canvas DPR, telemetry overlay mount, fishing ripple hook (only thin touches — panel logic untouched) |
| `public/assets/commune/` (new, optional) | meshopt-compressed CC0 glTF kit assets (E) |
| `package.json` | + `postprocessing` (G); + `three/examples` utils already in `three` |

---

## 6. Research references

- Games/demos: [Bruno Simon portfolio](https://bruno-simon.com/), [HexGL](https://github.com/BKcore/HexGL),
  [Astray](https://wwwtyro.github.io/Astray/), [SEELE: 7 Three.js games](https://www.seeles.ai/resources/blogs/three-js-games-examples-how-to-build.html),
  [webgamedev.com demos](https://www.webgamedev.com/games-demos), [threejs.org examples](https://threejs.org/examples/).
- Assets: [Kenney](https://kenney.nl/assets) (CC0), [Quaternius](https://quaternius.com/faq.html) (CC0, animated animals incl. dogs),
  [Poly Pizza](https://poly.pizza/) (CC0/CC-BY + API), [Poly Haven](https://polyhaven.com/) (CC0 HDRIs), KayKit (itch.io).
- Optimization: [gltf-transform](https://gltf-transform.dev/), [Draco vs meshopt/KTX2 — 132 loading trials](https://dev.to/alicia_lu/draco-vs-meshopt-and-ktx2-132-loading-trials-in-threejs-lhm),
  [3D model optimization guide](https://threejsresources.com/3d-model-optimization).
- Shading: [MeshToonMaterial](https://threejs.org/docs/#api/en/materials/MeshToonMaterial),
  [toon walkthrough](https://design.solhun.com/en/three/toon-shading/), [inverted-hull outlines](https://moonjump.com/game-dev-mechanics-toon-shading-cel-shading-how-it-works/).
- Environment: [Sky](https://threejs.org/docs/pages/Sky.html), [instanced grass guide](https://threejsresources.com/guides/grass),
  [water shader notes](https://www.shanebrumback.com/tutorials/water-shader-effects.html).
- Lighting/shadows: [LightShadow docs](https://threejs.org/docs/#api/en/lights/shadows/LightShadow),
  [Threejs Journey — Shadows](https://threejs-journey.com/lessons/shadows), [drei ContactShadows](https://drei.docs.pmnd.rs/shadows/contact-shadows).
- Post: [postprocessing (npm)](https://www.npmjs.com/package/postprocessing),
  [192-trial post-FX benchmark (per-pass ms)](https://dev.to/alicia_lu/threejs-post-processing-192-desktop-trials-beyond-the-fps-counter-4jcl),
  [tone mapping overview](https://discourse.threejs.org/t/tone-mapping-overview/75204/1).
- Perf: [Three.js performance guide](https://www.hontran.dev/blog/three-js-performance-optimization),
  [stats.js](https://github.com/mrdoob/stats.js), [Spector.js](https://spector.babylonjs.com/).
- WKWebView/Tauri: [ANGLE sample_mask overdraw (WebKit #326660)](https://bugs.webkit.org/show_bug.cgi?id=326660),
  [canvas→WebGL upload slowness (#315417)](https://bugs.webkit.org/show_bug.cgi?id=315417),
  [60 fps cap until macOS 26 (tauri-plugin-macos-fps)](https://crates.io/crates/tauri-plugin-macos-fps).
