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
| `npm run dev:api` | Run local zero-credential FakeLibsql API proxy on port 8787 |
| `npm run build` | Build optimized production bundle (`dist/`) |
| `npm run preview` | Preview production build on port 4173 |
| `npm run deploy:preview` | Build and preview production build on port 4173 |
| `npm run typecheck` | Run TypeScript strict type checking (`tsc --noEmit`) |
| `npm run lint` | Run ESLint verification (`eslint .`) |
| `npm run test` | Run Vitest unit & integration test suite (1108 tests across 134 files) |
| `npm run audit` | Comprehensive audit gate running all 10 sub-audits |
| `npm run audit:bundle` | Check bundle size budgets (boot <= 35 KB gz, core <= 500 KB gz) and zero external assets |
| `npm run audit:rulebook-sync` | Verify ACOUSTIC_RULEBOOK.md matches AcousticBus.ts acoustic constants |
| `npm run audit:appearance-lock` | Verify creature procedural skin default and zero external `.glb`/`.gltf` references |
| `npm run audit:no-tautology` | Check tests execute real engine code rather than raw string assertions |
| `npm run audit:claim-traceability` | Check 37/37 pairings validity and zero self-assigned grades in reports |
| `npm run audit:reports-honesty` | Fatal check asserting zero self-assigned rubric grades across reports |
| `npm run audit:verdict-honesty` | Assert published table rows have real SSIM values matching comparator |
| `npm run audit:docs-truth` | Verify documentation script names and numeric claims against codebase reality |
| `npm run audit:reference-integrity` | Verify reference manifest hash matches canonical SHA-256 `94e00f1eff14c185906da61201cc3044cc50454ea812590c7ce853e82aeec772` |
| `npm run audit:sync-golden` | Golden baseline shots synchronized across all directories |
| `npm run glitch:scan` | Scan golden shots for 10 visual defect classes (aliasing, blowout, voids, leaks) |
| `npm run secret:scan` | Scan repository, git history, and built bundles for exposed credentials |
| `npm run i18n:check` | Check 15 locales with 100% key parity (121/121 keys) including RTL and CJK |
| `npm run verify` | Complete release gate: typecheck → lint → test → build → audit sub-gates → glitch:scan → secret:scan → i18n:check → reference:verify → reference:compare → shots:check → gates:play → audio:compare |
| `npm run verify:all` | Run verify plus monster-trace, perf, and visual checks |
| `npm run gates:summary` | Aggregate release gate execution results and generate `reports/release/gates.md` |
| `npm run gates:play` | Run 5-minute automated Natatorium playthrough asserting sighting pacing, trench avoidance, deterministic simHash |
| `npm run shots` | Capture visual regression baseline screenshots |
| `npm run shots:check` | Check 48 golden baseline screenshots for pixel regressions (SSIM >= 0.97, MAE <= 0.01) |
| `npm run shots:approve` | Approve new golden baseline screenshots |
| `npm run smoke` | Run Headless CDP Smoke Bot covering scenarios (S1–S8) |
| `npm run test:cross-engine` | Run cross-engine visual and physics compatibility tests |
| `npm run test:natural-sightings` | Run headless sighting distribution simulation across play seeds |
| `npm run balance` | Run Headless Balance Bot Swarm (13,200 simulated runs across all 11 maps) |
| `npm run browser:acceptance` | Run browser acceptance test suite |
| `npm run perf` | Benchmark frame times, draw calls, and memory across quality tiers |
| `npm run reference:verify` | Verify SHA-256 integrity of all 37 reference frames and audio files against manifest `94e00f1eff14c185906da61201cc3044cc50454ea812590c7ce853e82aeec772` |
| `npm run reference:fetch` | Download and cache reference video frames |
| `npm run reference:compare` | Run SSIM, MAE, and colour band comparison against 37 reference frames |
| `npm run audio:compare` | Verify procedural Web Audio synthesis against reference spectrum |

---

## Maps & Architectural Families

BackSilence features 11 procedural maps spanning 3 architectural families:
- **`poolroom` family (5 maps):** `natatorium`, `poolrooms`, `orientation`, `hydro_maze`, `drowned_school`
- **`utility` family (3 maps):** `utility_tunnels`, `drainage_core`, `drowned_metro`
- **`derelict` family (3 maps):** `marble_atrium`, `neon_flood`, `sunken_jungle`

---

## Reference Pack & Performance Budgets

- **Reference Pack:** Evaluated against 37 reference frames from *The Infinite Shift: Backrooms* with canonical manifest SHA-256 `94e00f1eff14c185906da61201cc3044cc50454ea812590c7ce853e82aeec772`.
- **Performance Budgets:** Boot chunk budget <= 35 KB gz (actual: 9.54 KB gz), core bundle budget <= 500 KB gz (actual: 484.70 KB gz).

---

## Release Gates & Verification

Run the full verification pipeline before any production deployment:

```bash
npm run verify
node scripts/gates/summary.mjs
npm run smoke
npm run balance
```

### Gate Summary Table (`v2.1.0-rc1` — 2026-11-08)

| Gate | Status | Detail |
| :--- | :--- | :--- |
| `typecheck` | **PASS** | tsc --noEmit clean (0 errors) |
| `lint` | **PASS** | eslint clean (0 warnings, 0 errors) |
| `test` | **PASS** | Tests 1108 passed across 134 files |
| `build` | **PASS** | vite production build succeeded (core bundle 484.70 KB / 500.00 KB) |
| `audit:bundle` | **PASS** | zero forbidden external asset references in dist/; boot <= 35 KB gz, core <= 500 KB gz |
| `audit:rulebook-sync` | **PASS** | ACOUSTIC_RULEBOOK.md 8/8 rows synced with AcousticBus.ts |
| `audit:appearance-lock` | **PASS** | procedural skin locked; zero .glb/.gltf references |
| `audit:no-tautology` | **PASS** | zero source-file text/AST tautologies in tests/ |
| `audit:claim-traceability` | **PASS** | 37/37 pairings valid; zero self-assigned grades in reports/ |
| `audit:reports-honesty` | **PASS** | zero subjective grades or evaluation scores detected |
| `audit:verdict-honesty` | **PASS** | all report verdicts match computed comparator data |
| `audit:docs-truth` | **PASS** | all documentation claims verified against live codebase |
| `audit:reference-integrity` | **PASS** | manifest hash matches canonical SHA-256 94e00f1eff14c185906da61201cc3044cc50454ea812590c7ce853e82aeec772 |
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
