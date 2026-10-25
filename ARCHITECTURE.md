# BackSilence — Architecture

> *"It can't see you. It hears the water."*

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        index.html                                │
│  Inline critical CSS · Splash · Boot bar · SVG favicon          │
└──────────────────────────┬──────────────────────────────────────┘
                           │  <script type="module" src="main.ts">
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     main.ts (boot)                               │
│  Parse route → Load settings → Init EventBus/Store/StateMachine │
│  Drive boot bar → Transition BOOT→MENU → Dynamic imports        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
┌──────────────────┐┌────────────┐┌──────────────┐
│   App Shell      ││  UI Layer  ││  Engine      │
│                  ││            ││              │
│  EventBus.ts     ││  MainMenu  ││  Renderer.ts │
│  Store.ts        ││  HUD       ││  Loop.ts     │
│  StateMachine.ts ││  Settings  ││  Input.ts    │
│  Router.ts       ││  Pause     ││  Quality.ts  │
│  Settings.ts     ││  Death     ││  PostFX.ts   │
│  Config.ts       ││  Toasts    ││  Disposal.ts │
│  Palette.ts      ││            ││  Perf.ts     │
└──────────────────┘└────────────┘└──────────────┘
              │                         │
              │    ┌────────────────────┤
              │    │                    │
              ▼    ▼                    ▼
┌──────────────────┐  ┌──────────┐  ┌──────────────┐
│   Procedural     │  │  Audio   │  │     Net      │
│                  │  │          │  │              │
│  core/           │  │ Engine   │  │ Adapters     │
│    prng.ts       │  │ Mixer    │  │   Null       │
│    noise.ts      │  │ Reverb   │  │   Supabase   │
│    color.ts      │  │ Noise    │  │   Firebase   │
│    canvasPool.ts │  │ voices/  │  │ Lobby.ts     │
│    scheduler.ts  │  │ Director │  │ Replication  │
│  textures/       │  │          │  │              │
│  shaders/        │  └──────────┘  └──────────────┘
│  geometry/       │
└──────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Game Layer                                  │
│                                                                  │
│  player/   physics/   water/   monster/   interaction/           │
│                                                                  │
│  world/                                                          │
│    maps/   puzzles/   props/                                     │
│                                                                  │
│  lab/                                                            │
│    LabScene.ts                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **User input** → `Input.ts` → actions dispatched to `EventBus`
2. **EventBus** carries typed events between decoupled systems
3. **Store** holds observable state (`settings`, `session`, `ui`)
4. **StateMachine** enforces legal state transitions, emits `app:state`
5. **Loop** runs fixed-timestep update (60 Hz) + render with interpolation
6. **Procedural** generators create textures/geometry/audio on demand, cached by `(kind, params, seed)`
7. **Net** adapter abstracts multiplayer; `NullNetworkAdapter` for offline, real adapters for online
8. **Monster AI** is acoustically driven: listens for `NoiseEvent`s, never sees players

## Module Boundaries

- **No system imports another system's internals.** Communication is through `EventBus` and `Store`.
- **No per-frame allocations.** Scratch objects are reused.
- **Every system exposes `dispose()`.** Tracked by `DisposableBag`.
- **All procedural content uses seeded PRNG.** Same `(seed, mapId)` = identical worlds.

## Code Splitting Strategy

```
boot chunk:  index.html + main.ts + app/* (< 35 KB gzip)
three chunk: three.js (separate via manualChunks)
engine chunk: engine/* + procedural/* + audio/*
game chunk:  game/* + world/* + lab/*
```

Chunks load in parallel after first paint via dynamic `import()`.

## State Machine Transitions

```
BOOT ──→ MENU ──→ MODE_SELECT ──→ LOBBY ──→ LOADING ──→ PLAYING
                       │                        ↑          │   │
                       └─ LOADING ──────────────┘          │   │
                                                           ▼   ▼
                                            MENU ←── PAUSED   DEAD
                                              ↑                │  │
                                              │                ▼  ▼
                                          RESULTS ←── SPECTATING  │
                                              ↑                   │
                                              └───────────────────┘
```

---

## Batch 2 Additions: Sim / Presentation Split

To ensure deterministic 60 Hz physics, zero-DOM headless simulation testing, and authoritative host replication for future multiplayer, the architecture is strictly split into two layers:

```
┌─────────────────────────────────────────────────────────────────┐
│               src/sim/ (Pure TypeScript Kernel)                 │
│  • GroundGrid.ts      Rasterized heights + chamfer distToDry    │
│  • Colliders.ts       AABB, cylinder colliders, 4m spatial hash │
│  • PlayerMotor.ts     Deterministic character kinematics (60Hz) │
│  • NavGrid.ts         0.5m clearance grid & connected components│
│  • AStar.ts           Resumable binary-heap A* + string pulling │
│  • Hearing.ts         Acoustic formula, occlusion & boundary    │
│  • MonsterBrain.ts    Deterministic state machine & net sync    │
│  • SimWorld.ts        60 Hz tick container & event ring buffers │
│  • Events.ts          Allocation-free ring buffer for SimEvents │
│  * ENFORCED: Zero imports of Three.js, DOM, or Web Audio APIs   │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                   SimState snapshots & SimEvents
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              src/game/ (Presentation & Three.js)                │
│  • GameSession.ts     Interpolates SimState, render loop glue   │
│  • water/             WaterSystem, WaterMaterial, RippleBuffer, │
│                       WakeEmitters, Splashes                    │
│  • monster/           MonsterManager, MonsterMesh, MonsterIK,   │
│                       MonsterGait, MonsterBody, Jumpscare       │
│  • player/            PlayerCamera, PlayerInput, TouchControls, │
│                       Footsteps audio pacing                    │
│  • interaction/       InteractionSystem raycasts & HUD prompts  │
│  • AcousticSystem.ts  Tension curve, directional arcs, captions │
└─────────────────────────────────────────────────────────────────┘
```

### Water Simulation Architecture (Water v3)
1. **Pass Order & Framebuffer Decoupling**:
   - **Step 1 (Opaque Pass)**: All opaque scene geometry (platforms, walls, columns, props) is rendered into `sceneRT` (`opaqueDepthTarget`, containing RGBA color plus a hardware `DepthTexture`). The water mesh is hidden (`water.mesh.visible = false`).
   - **Step 2 (Texture Binding)**: `sceneRT.texture` (color) and `sceneRT.depthTexture` (linear view-space depth) are bound as input uniforms (`uSceneColor`, `uSceneDepth`) to the water material.
   - **Step 3 (Water Compositing)**: Water mesh is unhidden (`water.mesh.visible = true`) and rendered into `finalRT` (the PostFX / EffectComposer buffer). Crucially, a texture is **never** sampled from the active framebuffer currently being written to, eliminating WebGL feedback loops.
   - **Step 4 (Depth Reconstruction & Discard)**: Fragment shader transforms hardware non-linear depth to linear view distance. If opaque scene depth is closer than the water surface by $>0.05\text{m}$ (`diffZ < -0.05`), the fragment is immediately discarded (`discard`).
2. **GPU Wave Simulation (Medium & High Tiers)**:
   - Ping-pong half-float render targets simulating the 2D damped wave equation:
     $$\frac{\partial^2 h}{\partial t^2} = c^2 \nabla^2 h - \gamma v$$
   - CFL stability condition enforced with dynamic substeps: $n = \lceil c \cdot \Delta t / (0.7 \cdot \Delta x) \rceil$ (2 substeps at 512x512 over 32m; 1 substep at 256x256).
   - Toroidal window centered on camera coordinates with zero-seam edge fade.
   - Obstacle reflections baked from `GroundGrid`: solid neighbor cells are mirrored ($h_{\text{neighbor}} = h_{\text{center}}$) for perfect wave reflection off platform walls and pillars.
3. **Analytic Fallback (Low Tier & CPU Reference)**:
   - Evaluates analytic expanding ring formulas and Kelvin wakes for ultra-low power devices without floating-point texture support.
4. **Physical Shading**:
   - 4-wave Gerstner swell combined with scrolling normal maps.
   - Beer-Lambert spectral absorption: $T = \exp(-\sigma \cdot d)$, $C = C_{\text{refract}} T + C_{\text{scatter}} (1 - T)$.
   - Clamped screen-space refraction with foreground leak rejection (`refractLinearZ >= vViewPos.z`).
   - Schlick Fresnel reflection with $F_0 = 0.02$.
   - Procedural caustics, wake foam, crest foam, shoreline contact foam, and underwater immersion grading.

### Monster Architecture
1. **Perception**: Completely blind. Senses exclusively via `NoiseEvent`s exceeding threshold through `Hearing.ts` and physical touch collision (`TOUCH_RANGE = 0.9 m`).
2. **Clearance Navigation**: Navigation cells require `depth >= 0.45 m` and `distToDry > 1.2 m`. Trenches $\le 2.4\text{m}$ wide are impassable, triggering `BLOCKED` state.
3. **Procedural Body & IK**: Procedural organic flesh mesh with 14-vertebra instanced spine cones, elongated skull, moving jaw with teeth, animated ear-fins, and analytic two-bone law-of-cosines IK for knuckles and feet. Zero external `.glb` models.
4. **L0-L5 Presence Probe (`src/game/monster/MonsterProbe.ts`)**:
   - Multi-layer diagnostic probe evaluating monster existence and presentation without guesswork:
     - **L0 (Sim Layer)**: Finiteness of positions, velocity, speed multiplier, hearing multiplier, path validity, and connected component size.
     - **L1 (Scene Graph Layer)**: Root existence, hierarchical visibility, finite world matrices, non-zero scale, child meshes, and triangle counts.
     - **L2 (Camera Layer)**: Frustum containment (via up-to-date camera matrices), distance to camera, view angle, and Beer-Lambert fog transmittance.
     - **L3 (Silhouette Mask Pass Layer)**: Hardware offscreen unlit render target rasterization; measures true silhouette coverage and screen bounding box.
     - **L4 (Full Frame Delta Layer)**: Dual-frame subtraction (Frame A with monster shown vs Frame B with monster hidden); measures exact visible screen fraction and isolates occluding passes (water/fog/post).
5. **Runtime Monster Watchdog (`src/game/monster/MonsterWatchdog.ts`)**:
   - Continuous runtime guardrail active in both debug and production.
   - Monitors each monster within 45m of the camera, inside the view frustum, and having fog transmittance $\ge 0.05$.
   - If presentation or sim reports invisible (`root.visible === false`), empty mesh hierarchy (`children.length === 0`), non-finite values, skin load error, or continuous update exceptions for $\ge 3.0$ seconds:
     - Resets visibility and finite scale.
     - Reloads procedural skin hierarchy (`body.reloadProceduralSkin()`) cleanly without modifying scene graph attachments.
     - Logs the incident into an in-memory ring buffer (max 32 entries) and surfaces summary data to `ErrorBoundary.generateDiagnostics()`.
     - Completely seamless for the player: zero gameplay freezes, no popups, zero frame drops.
6. **Dual-Skin Pipeline & Safe Fallback**:
   - `creatures.waterMonsterSkin: 'auto' | 'model' | 'procedural'`.
   - `validateAndFetchGlb()` enforces 8s timeout, checks HTTP status, Content-Type against HTML/JSON, and validates `glTF` magic bytes (`0x46546C67`).
   - If GLB fetch fails or is rejected, immediately falls back to procedural skinned hierarchy with zero thrown errors.

---

### Internationalization & In-World Lettering Architecture
1. **Engine Architecture**: UI text, menus, navigation screens, toasts, announcements, and subtitles are fully localized across 15 launch locales (including Arabic RTL and pseudo-locales) using `src/i18n/I18n.ts` and native ECMAScript `Intl` APIs (`PluralRules`, `NumberFormat`, `DateTimeFormat`, `RelativeTimeFormat`, `ListFormat`).
2. **In-World Lettering**: In-world lettering (stenciled wall signage, sector codes, tape cartridge serials, and vector CRT terminal stroke fonts) remains strictly Latin and numeric. This is an intentional architectural and art direction decision: the procedural vector stroke font generator is mathematically calibrated for high-speed hardware line drawing of ASCII alphanumerics, preserving the dry 1994 municipal archive aesthetic across all active locales without bloating the zero-dependency runtime.



