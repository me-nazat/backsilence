# BackSilence

> *"It can't see you. It hears the water."*

A browser-based 3D survival-horror game inspired by the Backrooms "Poolrooms" level. Wade through an endless flooded tile complex. An entity lives here that **cannot see you but hears everything that touches the water**. Stay still, stay on dry tiled platforms, move quietly, and solve the exit puzzle without making a splash.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open in browser
open http://localhost:5173/
```

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest tests |
| `npm run audit` | Audit the production bundle (sizes, forbidden assets) |
| `npm run verify` | Run all checks: typecheck → lint → test → build → audit |

## URL Parameters

| Parameter | Example | Description |
|---|---|---|
| `?room=XXXX` | `?room=K7QX` | Join a multiplayer room |
| `?debug=1` | `?debug=1` | Enable debug logging |
| `?lab=1` | `?lab=1` | Open the texture/material/audio lab |

## Tech Stack

- **Three.js** — 3D rendering (sole runtime dependency)
- **TypeScript** — strict mode, zero `any`
- **Vite** — build tooling
- **Vitest** — testing
- **Zero external assets** — all textures, audio, and models are procedurally generated

## Project Structure

```
src/
├─ main.ts              # Boot entry point
├─ app/                  # Core: EventBus, Store, StateMachine, Router, Config, Palette, Settings
├─ types/                # Shared type contracts
├─ ui/                   # DOM-based UI components
├─ engine/               # Rendering, game loop, input, quality, disposal
├─ procedural/           # Procedural generation: textures, shaders, geometry
├─ audio/                # Web Audio synthesis engine
├─ game/                 # Player, physics, water, monster, interaction
├─ world/                # Maps, puzzles, props
├─ net/                  # Network adapters for multiplayer
└─ lab/                  # Debug lab scene
```

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — System diagram and data flow
- [CODING_STANDARDS.md](CODING_STANDARDS.md) — TypeScript rules, performance guidelines
- [ACOUSTIC_RULEBOOK.md](ACOUSTIC_RULEBOOK.md) — Monster hearing mechanics
- [DECISIONS.md](DECISIONS.md) — Design decision log with rationale
