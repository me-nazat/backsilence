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

### Water Simulation Architecture
1. **Analytic Ripples**: Ring buffer (`uRipples[32]`) uploaded to GLSL. Vertex and fragment shaders evaluate expanding sinusoidal rings with gaussian envelope decay.
2. **Kelvin Wakes**: Tracks up to 6 moving sources (`uWakes[6]`). Generates two trailing ridges at 19.5° angles behind waders.
3. **Map Data Texture**: World-aligned RGBA8 `DataTexture` encoding ground height in R channel and `distToDry` in G channel.
4. **Instanced Splashes**: 256-droplet pooled `InstancedMesh` with billboard alpha and dark ink tinting on monster impacts.

### Monster Architecture
1. **Perception**: Completely blind. Senses exclusively via `NoiseEvent`s exceeding threshold through `Hearing.ts` and physical touch collision (`TOUCH_RANGE = 0.9 m`).
2. **Clearance Navigation**: Navigation cells require `depth >= 0.45 m` and `distToDry > 1.2 m`. Trenches $\le 2.4\text{m}$ wide are impassable, triggering `BLOCKED` state.
3. **Procedural Body & IK**: Procedural organic flesh mesh with 14-vertebra instanced spine cones, elongated skull, moving jaw with teeth, animated ear-fins, and analytic two-bone law-of-cosines IK for knuckles and feet. Zero external `.glb` models.

