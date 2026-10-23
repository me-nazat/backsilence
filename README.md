# BackSilence

> *"It can't see you. It hears the water."*

A browser-based 3D survival-horror game inspired by the Backrooms "Poolrooms" level. Wade through an endless flooded tile complex. An entity lives here that **cannot see you but hears everything that touches the water**. Stay still, stay on dry tiled platforms, move quietly, and solve the exit puzzle without making a splash.

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open in browser
open http://localhost:5173/
```

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite development server |
| `npm run build` | Build optimized production bundle (`dist/`) |
| `npm run preview` | Preview production build on port 4173 |
| `npm run dev:api` | Run local zero-credential FakeLibsql API proxy on port 8787 |
| `npm run typecheck` | Run TypeScript strict type checking |
| `npm run lint` | Run ESLint verification |
| `npm run test` | Run Vitest unit & integration test suite (233 tests across 19 files) |
| `npm run balance` | Run Headless Balance Bot Swarm (13,200 simulated runs across all 11 maps) |
| `npm run smoke` | Run Headless CDP Smoke Bot covering all 14 end-to-end scenarios (S1–S14) |
| `npm run secret:scan` | Scan repository, git history, and built bundles for exposed credentials |
| `npm run audit` | Audit production bundle sizes (boot chunk $\le 35\text{ KB}$ gz, total $\le 450\text{ KB}$ gz) |
| `npm run verify` | Complete release gate: typecheck → lint → test → build → audit → secret:scan |

---

## Release Gates & Verification

Run the full verification pipeline before any production deployment:

```bash
npm run verify
npm run smoke
npm run balance
```

All 14 headless Chrome CDP smoke scenarios validate real DOM interactions, WebGL shader execution, monster hearing physics, results score breakdown, Turso proxy run submissions, WebRTC multiplayer coordination, and offline IndexedDB synchronization.

---

## URL Parameters & Deep-Linking Routes

| Parameter | Example | Description |
|---|---|---|
| `?v=<view>` | `?v=hub` | Navigate directly to a screen: `home`, `hub`, `maps`, `bestiary`, `leaderboards`, `champions`, `profile`, `lobby`, `credits`, `about`, `changelog` |
| `?mode=solo` | `?mode=solo&map=natatorium` | Launch directly into a playable solo game session |
| `?room=XXXX` | `?room=K7QX` | Join a multiplayer room |
| `?lab=1` | `?lab=1` | Open the procedural texture/material/audio lab |
| `?lab=ui` | `?lab=ui` | Open the living UI Design System Component Lab |
| `?debug=1` | `?debug=1` | Enable debug logging and telemetry overlays |
| `?god=1` | `?god=1` | Enable god mode (infinite stamina, death immunity) for QA |

---

## Tech Stack & Architecture

- **Three.js** — 3D rendering (sole runtime dependency; zero external models/textures by default).
- **TypeScript** — Strict typing, zero `any`.
- **Procedural Synthesis** — 100% runtime procedural textures, normal maps, and Web Audio API synthesis (26 voices).
- **Online Platform** — Turso proxy architecture (`api/core/`) with zero browser-exposed credentials, WebCrypto ECDSA P-256 player identity, PBKDF2 + AES-GCM recovery codes, and IndexedDB offline queue.
- **PWA Ready** — Standalone Web App Manifest, Service Worker caching, and offline play support.

---

## Project Structure

```
src/
├─ main.ts              # Boot entry point & early platform initialization
├─ app/                  # EventBus, Store, StateMachine, Router, Config, Palette, Settings
├─ types/                # Shared type contracts & interfaces
├─ ui/                   # DOM-based UI & Design System
│   ├─ kit/              # The Archive tokens, inline-SVG icons, and component kit
│   ├─ motion/           # 12 signature CSS/WAAPI motion animations
│   └─ screens/          # Home, Hub, Maps, Bestiary, Leaderboards, Champions, Profile, Lobby
├─ engine/               # Rendering loop, input, quality adaptation, disposal
├─ procedural/           # Procedural textures, caustics, shaders, geometry
├─ audio/                # Web Audio synthesis engine & spatial sound propagation
├─ game/                 # Player controller, acoustic physics, water sim, monster AI, Director
├─ world/                # 11 procedural maps, layout generators, environmental puzzles
├─ meta/                 # Identity, scoring, contracts, achievements, offline queue
└─ net/                  # Network adapters (TursoProxy, LocalTab, BroadcastChannel, WebRTC)
api/
└─ core/                 # Serverless proxy: Auth, Endpoints, RateLimiter, TursoClient, FakeLibsql
```

---

## Documentation

- [UPGRADE_PROTOCOL.md](UPGRADE_PROTOCOL.md) — Release rules, evidence verification, and safety protocol
- [ARCHITECTURE.md](ARCHITECTURE.md) — System diagram and data flow
- [ACOUSTIC_RULEBOOK.md](ACOUSTIC_RULEBOOK.md) — Monster hearing mechanics & noise levels
- [BALANCE.md](BALANCE.md) — Win-rate targets, par times, and tuning philosophy
- [BALANCE_REPORT.md](BALANCE_REPORT.md) — Latest 13,200-run balance swarm verification report
- [SECURITY.md](SECURITY.md) — Threat model, database credential quarantine, and audit rules
- [DEPLOY.md](DEPLOY.md) — Production deployment guide (Cloudflare, Vercel, Netlify)
- [COPY.md](COPY.md) — UI microcopy, narrative voice, and error messaging
- [CREDITS.md](CREDITS.md) — CC BY 4.0 asset licenses and engine attributions
- [CHANGELOG.md](CHANGELOG.md) — Milestone changelog from Batch 1 through Batch 8
