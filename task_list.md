# Task List — Batch 3: The Five Maps, Scenarios & Multi-Stage Puzzles (50% → 75%)

- [x] **Phase 1: Shared Contracts & Core Dynamic Sim Extensions**
  - [x] Implement `src/world/MapTypes.ts` with pure `LayoutData`, `LayoutCtx`, `MapDefinition`, and `MapInstance`
  - [x] Implement `src/sim/WaterLevelCycle.ts` (90s dynamic water cycle: 37s LOW, 8s RISE, 37s HIGH, 8s FALL)
  - [x] Extend `GroundGrid.ts` with `DynamicTop` provider support and `computeDistToDryField`
  - [x] Implement `src/sim/SinkingPlatformNode.ts` (7s stand threshold, 1.5s grace, 3s sink, 10s submerged, 4s rise)
  - [x] Implement `src/sim/Projectile.ts` (pure ballistic integration, 0.2s..1.0s hold, water vs dry landing classification)
  - [x] Extend `Hearing.ts` with `MaskZoneManager` (mask zones with 0.45 factor reduction)
  - [x] Extend `MonsterBrain.ts` with stranded monster retreat at hunt speed and nav per level

- [x] **Phase 2: Modular Geometry Kit & Procedural Textures**
  - [x] Implement pure geometry builders: `ArchBuilder`, `ColonnadeBuilder`, `StairBuilder`, `PipeBuilder`, `CatwalkBuilder`, `ValveWheel`, `Keypad`, `BlastDoor`, `Generator`, `FilterDrum`, `Bell`, `Fountain`, `LightFixture`
  - [x] Implement procedural textures: `ConcreteTexture` (tunnel & filtration variants), `RustMetalTexture`, `GrateTexture`, `MarbleTexture`, `BronzeTexture`, `AlgaeGlowMask`, `PaintedLabel`, `NumberDecals`

- [x] **Phase 3: Multi-Stage Pure Puzzle State Machines**
  - [x] `SequenceKeypadNode` (Map 1: 4-digit ordinal code, wrong code alarm 0.8, 20s lockout after 3 attempts)
  - [x] `ValveSequenceNode` (Map 2: 3-valve sequence A/B/C, 4s hold, sustained noise, pressure surge reset, 5s gate)
  - [x] `ResonanceSequenceNode` (Map 3: 4-note melody console, 4 bronze bells with 0.9 noise, dissonance reset)
  - [x] `FuseCoresNode` (Map 4: 3 fuse cores, 8% sprint penalty per core, bay sockets, shutter door unlock)
  - [x] `GeneratorGridNode` (Map 5: 3 generators, 6s prime, pull-start, solo 90s runtime, 5s concurrent run win condition)
  - [x] `PuzzleSystem` (deterministic router, event dispatcher, serialize / hydrate support)

- [x] **Phase 4: Water Profiles, Audio Voices & Atmosphere**
  - [x] Implement `WaterProfile.ts` and update `WaterMaterial.ts` with bioluminescent emission shader & murk
  - [x] Synthesize machinery voices: `steam_hiss`, `pipe_groan`, `valve_turn`, `valve_release`, `water_inflow_loop`, `crank_loop`, `generator_loop`, `generator_cord`, `alarm_klaxon`, `shutter_rumble`, `socket_clunk`
  - [x] Synthesize interactable & ambient voices: `bell`, `stone_creak`, `pebble_clack`, `flashlight_click`, `keypad_buzz`, `monster_ambient_far`, `escaped`
  - [x] Synthesize per-map ambience beds: `ambience_tunnels`, `ambience_atrium`, `ambience_filtration`, `ambience_drain`

- [x] **Phase 5: The Five Procedural Maps**
  - [x] Map 1: The Flooded Poolrooms (`PoolroomsMap.ts`) — 14-18 slabs, 4 ordinal code pillars + 5 decoys
  - [x] Map 2: Sub-Aquatic Utility Tunnels (`UtilityTunnelsMap.ts`) — spine & ribs, catwalks, steam mask zones
  - [x] Map 3: The Echoing Marble Atrium (`MarbleAtriumMap.ts`) — tiered atrium, sinking platforms, pebble lures
  - [x] Map 4: The Hydro-Filtration Maze (`HydroMazeMap.ts`) — 9x9 maze, 90s water shift, 2 nav grids
  - [x] Map 5: The Abyssal Drainage Core (`DrainageCoreMap.ts`) — concentric rings, darkness, flashlight, 3 monsters

- [x] **Phase 6: Validation, Determinism & Headless Solvers**
  - [x] `LayoutValidator.ts`: reachability validation across silent & wade edges for all 5 maps
  - [x] `PuzzleSolver.ts`: headless programmatic solvers proving winnability for all 5 maps
  - [x] `tests/maps.test.ts`: 50 seeds per map tested (100% pass, 0 retries, byte-identical hash determinism)
  - [x] `tests/puzzles.test.ts`: unit tests for all puzzle nodes and headless solver table
  - [x] `tests/mechanics.test.ts`: water cycles, nav per level, sinking platforms, projectiles, acoustic extras

- [x] **Phase 7: UI, Verification & Walkthrough**
  - [x] Dynamic Map Picker with thumbnail previews drawn from `LayoutData`
  - [x] Keypad modal overlay, Results screen with `localStorage` persistence (`backsilence.progress.v1`)
  - [x] Run `npm run verify` (`typecheck`, `lint`, `test`, `build`, `audit` — all PASS, bundle 248.16 KB)
  - [x] Headless Chrome CDP automation: captured screenshots across all 5 maps, verified FPS (60), draw calls ($\le 90$), triangles ($\le 85\text{k}$), memory switch hygiene
  - [x] Completed milestone git commit and published `walkthrough.md`
