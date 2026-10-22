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
