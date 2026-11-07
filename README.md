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
| `npm run test` | Run Vitest unit & integration test suite (968 tests across 110 files) |
| `npm run balance` | Run Headless Balance Bot Swarm (13,200 simulated runs across all 11 maps) |
| `npm run smoke` | Run Headless CDP Smoke Bot covering all 14 end-to-end scenarios (S1–S14) |
| `npm run secret:scan` | Scan repository, git history, and built bundles for exposed credentials |
| `npm run glitch:scan` | Scan golden shots for visual artifacts (magenta markers, pure black void, hard fog seams) |
| `npm run reference:verify` | Verify SHA-256 integrity of all 37 reference frames and audio files |
| `npm run reference:compare` | Run SSIM, MAE, and colour band comparison against reference frames |
| `npm run audio:compare` | Verify procedural Web Audio synthesis against reference spectrum |
| `npm run shots:check` | Check 48 golden baseline screenshots for pixel regressions |
| `npm run audit` | Comprehensive audit gate: bundle size, rulebook sync, appearance lock, no tautology, claim traceability, reports honesty, docs truth, golden sync |
| `npm run audit:reports-honesty` | Fatal check asserting zero self-assigned rubric grades across reports |
| `npm run audit:docs-truth` | Verify documentation script names and test claims against codebase reality |
| `npm run verify` | Complete release gate: typecheck → lint → test → build → audit → secret:scan → i18n:check → glitch:scan → reference:verify → reference:compare → shots:check |

---

## Release Gates & Verification

Run the full verification pipeline before any production deployment:

```bash
npm run verify
node scripts/gates/summary.mjs
npm run smoke
npm run balance
```

### Gate Summary Table (`v2.1.0-rc1` — 2026-11-05)

| Gate | Status | Detail |
| :--- | :--- | :--- |
| `typecheck` | **PASS** | tsc --noEmit clean (0 errors) |
| `lint` | **PASS** | eslint clean (0 warnings, 0 errors) |
| `test` | **PASS** | Tests  968 passed across 110 files |
| `build` | **PASS** | vite production build succeeded (core bundle 481.00 KB / 500.00 KB) |
| `audit:bundle` | **PASS** | zero forbidden external asset references in dist/ |
| `audit:rulebook-sync` | **PASS** | ACOUSTIC_RULEBOOK.md 8/8 rows synced with AcousticBus.ts |
| `audit:appearance-lock` | **PASS** | procedural skin locked; zero .glb/.gltf references |
| `audit:no-tautology` | **PASS** | zero source-file text/AST tautologies in tests/ |
| `audit:claim-traceability` | **PASS** | 37/37 pairings valid; zero self-assigned grades in reports/ |
| `audit:reports-honesty` | **PASS** | zero subjective grades or evaluation scores detected |
| `audit:docs-truth` | **PASS** | all documentation claims verified against live codebase |
| `audit:sync-golden` | **PASS** | golden baseline shots synchronized across all directories |
| `glitch:scan` | **PASS** | zero visual artifacts across 48 golden baseline shots |
| `secret:scan` | **PASS** | zero secrets detected |
| `i18n:check` | **PASS** | all 15 locale keys aligned (121/121 keys) |
| `reference:verify` | **PASS** | 37 SHA-256 reference frames + 3 WAVs verified against manifest |
| `shots:check` | **PASS** | 48/48 shots match golden baselines (SSIM 1.0000, MAE 0.0000) |
| `gates:play` | **PASS** | 8/8 checks passed (deterministic simHash 5c080b9d) |
| `reference:compare` | **PASS** | 146 checks pass; residual deltas documented |
| `audio:compare` | **PASS** | procedural audio within measured reference envelope |

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
- [HANDOFF.md](HANDOFF.md) — Production architecture guide, state machine, and evidence-chain map
- [reports/release/BETTER_THAN_VIDEO.md](reports/release/BETTER_THAN_VIDEO.md) — Review pack with 37 side-by-side pairings and 3x3 cover board
- [reports/release/evidence/INDEX.md](reports/release/evidence/INDEX.md) — Play evidence pack (E1–E7) with reproducible headless sessions
- [reports/release/KNOWN_LIMITATIONS.md](reports/release/KNOWN_LIMITATIONS.md) — Known technical boundaries & platform trade-offs
- [ARCHITECTURE.md](ARCHITECTURE.md) — System diagram and data flow
- [ACOUSTIC_RULEBOOK.md](ACOUSTIC_RULEBOOK.md) — Monster hearing mechanics & noise levels
- [BALANCE.md](BALANCE.md) — Win-rate targets, par times, and tuning philosophy
- [BALANCE_REPORT.md](BALANCE_REPORT.md) — Latest 13,200-run balance swarm verification report
- [SECURITY.md](SECURITY.md) — Threat model, database credential quarantine, and audit rules
- [DEPLOY.md](DEPLOY.md) — Production deployment guide (Cloudflare, Vercel, Netlify)
- [reports/glitch/CENSUS.md](reports/glitch/CENSUS.md) — Visual defect & glitch census across all 11 maps and 3 quality tiers
- [reports/glitch/REGISTER.md](reports/glitch/REGISTER.md) — Tracked defect register & historical resolution milestones
- [COPY.md](COPY.md) — UI microcopy, narrative voice, and error messaging
- [CREDITS.md](CREDITS.md) — CC BY 4.0 asset licenses and engine attributions
- [CHANGELOG.md](CHANGELOG.md) — Milestone changelog from Batch 1 through Batch 8
