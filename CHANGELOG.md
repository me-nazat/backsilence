# BackSilence — Changelog & Milestone Release History

All notable changes to the **BackSilence** project are documented here.
This project follows strict deterministic, zero-external-binary-asset design principles with pure WebGL2/Three.js rendering and Web Audio synthesis.

---

## [v2.1.0-rc1] — 2026-11-05 (The Better-Than-Video Ship Gate & Engineering Perfection)

### 🌊 Player-Visible Evolutions & Content Systems
- **Measured Look & Calibration (Prompts 1–2):**
  - Cryptographic 37-frame reference pack (`reference/video/frames/` `f_001`–`f_037`) with SHA-256 manifest and glitch census.
  - Measured palette calibration: luminance mean 0.63, water hue $85^\circ\text{--}113^\circ$, slab hue $38^\circ\text{--}48^\circ$, soft volumetric lighting, and 0 black void pixels outside jump-scare frames.
- **Water v5: Viscous Depth & Transmittance (Prompt 3):**
  - Replaced opaque water paint with physical Beer–Lambert depth transmittance model ($\mu_a = [0.82, 0.44, 0.98]$).
  - Shallow water ($\le 0.35\text{ m}$) reveals the cracked mosaic tile floor with effective alpha 0.20–0.35.
  - Ink splashes `#1e1a14`, footfall-only white foam `#e8f2e6` (0.32m, 0.38s decay), pale-green specular `#7b9e5e`, and zero ambient crest foam.
- **Canonical Architecture across All 11 Maps (Prompt 4):**
  - Unified vaulted cream ceiling (`VaultBuilder.ts`), grand archways, low thin tan slabs with bullnose tile edge ($0.3\text{ m}$ elevation), and clean 10–15m sighting lanes across all 11 maps.
- **Creature v2: The Seed-Pod Wader (Prompt 5):**
  - Seed-pod pitted head (32 dark pits `#241c14`), hunched posture, long forearms ($1.35\text{ m}$), flat wading feet, and posture library (`wade-stalk`, `listen-freeze`, `trench-pace`, `lunge`, `jumpscare-bracket`).
  - Screen-space readability certified across all distance tiers: 6m, 15m, 25m, 35m.
- **The Sound-First Encounter Arc (Prompt 6):**
  - Directed six-beat encounter grammar: Telegraph ($1.5\text{s}$ acoustic stinger) $\to$ Silhouette Hold ($3\text{s}$ at $10\text{--}15\text{m}$) $\to$ Stalk ($2.4\text{ m/s}$) $\to$ Trench Standoff $\to$ Silence Window $\to$ Terminal Lunge.
  - Fairness laws strictly enforced: speed ceiling $\le 7.4\text{ m/s}$ (zero teleportation), standoff trench uncrossed, $0\text{ damage}$ during dry stillness, 100% noise-attributable attacks.
- **The Opening Minute & Objective Loop (Prompt 7):**
  - Pool cleaner cold open with maintenance work-order card and teaching caption (*"Do not touch the water 💔"*).
  - Pebble throwing distraction mechanic diverting acoustic tracking, and 7-cell chlorine reagent filtration loop.
- **Anomalies & Level 0 Descent (Prompt 8):**
  - Rising water events, reality loop warps, and hallucination decoys (zero true acoustic signature).
  - Three-stage campaign descent down to Level 0 with a 30s drainage finale and inverted acoustic rules.
  - Streamer mode with 9:16 portrait viewport (720x1280) and top 28% facecam safe zone.

### ⚙️ Engine Decomposition & Memory Architecture (Prompt 9)
- **Monolith Decomposition:**
  - Decomposed 4,593-line `GameSession.ts` monolith into a 251-line facade coordinating 15 single-responsibility systems in `src/game/session/` (all files $\le 800$ lines).
- **Session State Machine:**
  - 8-state formal automaton (`SessionStateMachine.ts`) enforcing `44503aa` (menu deadlock), `080e262` (pointer lock race), `6785222` (double dispatch neutrality), and `10b3962` (SPA history race).
- **The Disposal Law:**
  - `DisposalService` performs complete WebGL2, audio, and DOM resource teardown.
  - Validated by `leak-probe.mjs`: 20 sequential sessions heap growth $+4.01\% \le 10\%$, and 50 rapid start/teardown cycles in 1.29s with 0 errors.

### 🛡️ Full Verification, Play Evidence & Review Pack (Prompt 10)
- **Play Evidence Pack (E1–E7):** Headless recorded sessions in `reports/release/evidence/` with timestamped frames and trace logs covering Cold Start, Encounter Arc, Objective Loop, Anomalies, Descent Finale, Death Loop, and Streamer Mode.
- **Better-Than-Video Review Pack:** 37 side-by-side ladder boards (`reports/release/review_pack_v2/ladder/f_001.png` .. `f_037.png`), 3x3 cover board, and `reports/release/BETTER_THAN_VIDEO.md`.
- **20/20 Release Gates Passed:**

| Gate | Status | Detail |
| :--- | :--- | :--- |
| `typecheck` | **PASS** | tsc --noEmit clean (0 errors) |
| `lint` | **PASS** | eslint clean (0 warnings, 0 errors) |
| `test` | **PASS** | Tests  947 passed across 106 files |
| `build` | **PASS** | Vite production build succeeded (core bundle 481.00 KB / 500.00 KB) |
| `audit:bundle` | **PASS** | Zero forbidden external asset references in dist/ |
| `audit:rulebook-sync` | **PASS** | ACOUSTIC_RULEBOOK.md 8/8 rows synced with AcousticBus.ts |
| `audit:appearance-lock` | **PASS** | Procedural skin locked; zero .glb/.gltf references |
| `audit:no-tautology` | **PASS** | Zero source-file text/AST tautologies in tests/ |
| `audit:claim-traceability` | **PASS** | 37/37 pairings valid; zero self-assigned grades in reports/ |
| `audit:reports-honesty` | **PASS** | Zero subjective grades or evaluation scores detected |
| `audit:docs-truth` | **PASS** | All documentation claims verified against live codebase |
| `audit:sync-golden` | **PASS** | Golden baseline shots synchronized across all directories |
| `glitch:scan` | **PASS** | Zero visual artifacts across 48 golden baseline shots |
| `secret:scan` | **PASS** | Zero secrets detected |
| `i18n:check` | **PASS** | All 15 locale keys aligned (121/121 keys) |
| `reference:verify` | **PASS** | 37 SHA-256 reference frames + 3 WAVs verified against manifest |
| `shots:check` | **PASS** | 48/48 shots match golden baselines (SSIM 1.0000, MAE 0.0000) |
| `gates:play` | **PASS** | 8/8 checks passed (deterministic simHash 5c080b9d) |
| `reference:compare` | **PASS** | 146 checks pass; residual deltas documented |
| `audio:compare` | **PASS** | Procedural audio within measured reference envelope |

---

## [v2.0.0] — 2026-11-02 (Batches 1–5: Truth, The Creature, The World, Water & Feel, Perfection)

### 📐 Prompt 1–2: Truth & Calibration (Batch 1)
- **One World Model & One Tile Scale**: Unified architecture and physics to absolute 0.15 m ceramic mosaic tile pitch (`WORLD.TILE_METERS = 0.15`, `WORLD.TEXTURE_METERS = 2.4`). Purged conflicting 0.20m and 0.30m tile scales.
- **Reference Pairing & Manifest Integrity**: Verified 37 reference frames (`f_001`–`f_037`) and 3 reference WAVs against cryptographic SHA-256 manifest. Codified claim traceability and pair comparison gates.

### 👹 Prompt 3–4: The Creature & Blind Hunter (Batch 2)
- **Footage Creature Reconstruction**: Rebuilt creature to match video footage at 32–35s (`f_010`, `f_018`): hunched posture, pale brown-grey mottled skin (`#5a5035` / `#59462d`), seed-pod pitted rounded head, long forearms, tapering tail, and dark paint-like splash shapes at appendages.
- **Blind Acoustic Navigation**: Enforced pure acoustic hearing without raycast vision cheating. Blind predator navigates strictly to sound source coordinates; stationary players on dry tiles or motionless in water are never tracked.
- **Topological Spawn Integrity**: Guaranteed predator spawns at least 12m away in navigable water with clear line of wade; prohibited spawning on platforms or inside collision hulls.

### 🏛️ Prompt 5–6: The World & Architectural Language (Batch 3)
- **Natatorium Rebuild (`f_004`–`f_009`, `f_013`–`f_015`)**: Vaulted cream plaster ceiling, grand archways, low thin tan slabs (bullnose tile edges, 0.3m above water), olive water, and pale mint horizon fog at 85m.
- **11 Maps, One Language**: Unified all 11 maps under the authentic poolroom architectural vocabulary. Added shared props (bullnose slabs, pool ladders, handrails, friezes, red alarm bells, green doors, cable spools, orange cones) and 3-layer depth staging (foreground, midground, background).

### 🌊 Prompt 7–8: Water & Acoustic Feel (Batch 4)
- **Measured Olive Water**: Calibrated water surface and absorption to canonical olive targets (`#8cb179` shallow, `#678f44` deep) within $85^\circ - 113^\circ$ hue band. Replaced dual-constant chop with broad swell ($\lambda = 4.0\text{ m}$) and physical Beer-Lambert water column absorption.
- **Crown & Ink Splash Vocabulary**: Procedural 7-spiked crown splashes with flying beads and concentric ripples matching wall graffiti motifs. Creature emits dark ink droplets and trailing wake.
- **World-Taught Rule & Freeze Mechanic**: First playable frame in Natatorium spawns facing the tagline mural (*"IT CAN'T SEE YOU. IT HEARS THE WATER."*). Halt in water freezes predator target coordinate at the splash location without tracking player.
- **HUD Restraint & Synchronous Paint**: Reduced default HUD to 3 non-overlapping elements (objective pill, minimal noise meter, prompt). Decoupled UI first paint from async crypto, guaranteeing instant synchronous display across all 11 screens.

### ✨ Prompt 9–10: Perfection, Defect Register & Handover (Batch 5)
- **The Elevation Pass**:
  - Screen-space volumetric god rays from ceiling openings and high windows.
  - Dynamic caustics on shallow pool floor and wet slab edges ($y \in [-1.0, 0.35]\text{ m}$).
  - Contact darkening anchoring slab bases and wall junctions to the waterbed.
  - Texel-snapped directional shadows (`bias: -0.0004`, `normalBias: 0.02`) and anisotropic filtering (16× on High) with -0.5 LOD bias.
  - Procedural 3D LUT tension grading (cool drift and contrast tightening $\le 12\%$ as creature closes in; preserves olive hue band).
  - 4-frame temporal auto-exposure (1.2s time constant) with lifted black floor ($\ge 0.102$).
  - `AgXToneMapping` default preventing green channel compression.
  - Velocity-derived camera motion blur (6 samples on High) and far-field depth of field.
  - Stillness audio ducking (40% / -8 dB ambient duck after 500ms stillness) and poolroom convolution reverb.
  - Full encounter arc with post-mortem mistake attribution on death screen (marked splash coordinate, predator distance, plain language mistake).
- **Defect Register & Definitions**: Seeded `reports/glitch/DEFINITIONS.md` (P0–P3 severity rubric) and `reports/glitch/REGISTER.md` resolving all 17 defects (G1–G17 closed, zero open P0/P1).
- **Fatal Quality Gates**:
  - `scripts/visual/artifact-detector.mjs` (`npm run glitch:scan`): Scans golden baseline shots for pure black above fog line, magenta markers, detached islands, hard fog seams, overlapping HUD boxes, visible far water edge, and tile pitch outside $0.15\text{ m} \pm 5\%$.
  - `scripts/audit/reports-honesty.mjs` (`npm run audit:reports-honesty`): Scans `reports/**/*.md` for self-assigned grades or rubric scores, failing build on any match.
  - `scripts/audit/docs-truth.mjs` (`npm run audit:docs-truth`): Verifies script names, test counts, and doc links against codebase reality.

---

### 🎨 Art Direction & Visual Identity ("The Archive")
- **Found-Footage VHS Aesthetic**: Built a cohesive design system anchored in institutional dampness, fluorescent warm casts, CRT scanlines, tracking tape ripples, and green surveillance phosphorus (`src/ui/kit/tokens.css`).
- **Inline-SVG Icon System**: Hand-coded 36 semantic, zero-network SVG icons in `src/ui/kit/Icons.ts` with 5 procedural rank emblems: Whisper, Echo, Current, Depth, and Phantom.
- **Component Kit**: Full library of tactile UI components (`src/ui/kit/`): `Button`, `TapeCard` (with 3D cursor-tracking tilt), `MapCard` (with live mini-canvas top-down render), `Tabs`, `Toggle`, `Slider`, `Select`, `Modal`, `Drawer`, `Toast`, `Tooltip`, `ProgressBar` (VU meter & tape tracking styles), `RosterChip`, `LeaderboardRow`, `RankBadge`, `StatTile`, `AchievementCard`, `CosmeticTile`, `KeyCap`, and `Skeleton`.
- **Living UI Lab**: Mounted interactive design system showcase at `?lab=ui` (`src/ui/kit/UiLabPage.ts`) displaying all states, buttons, dialogs, VU meters, and rank badges.
- **Microcopy & Narrative Atmosphere**: Authoritative institutional archive voice codified in `COPY.md`.

### 🌊 Motion System & Signature Animations
- **12 Weighted Motion Signatures** (`src/ui/motion/Motion.ts`): Ripple wipe page transitions, tactile button press depressions, tape insert/eject animations, score count-up with ease-out wet damping, rank stamp thumps with screen shudder, card flips, drawer glides, scanline jitters, and pulse tracking.
- **Performance & Safety Budget**: Strict $\le 2\text{ms/frame}$ motion budget, CSS/WAAPI only (zero animation libraries), respecting `prefers-reduced-motion` and photosensitive safety clamping ($\le 3\text{ Hz}$).
- **Interactive Water Hero Scene**: Enhanced `LabScene.ts` with pointer wake trails and click ripples interacting with procedural water shader uniforms.

### 🌐 Online Platform (Turso Proxy Architecture)
- **Zero-Secret Client Proxy**: Built serverless proxy (`api/core/`) supporting Cloudflare Workers, Vercel Edge, and Netlify Functions. Client code contains 0 database tokens, credentials, or SQL strings.
- **Cryptographic Player Identity**: WebCrypto ECDSA P-256 keypair generation stored in IndexedDB (`src/meta/Identity.ts`), with request signature verification (`X-BS-Player`, `X-BS-Sig`, `X-BS-Nonce`, `X-BS-Ts`) and encrypted recovery code export using PBKDF2 (100,000 iterations) + AES-GCM-256.
- **Offline Run Queue**: IndexedDB-backed resilient run submission queue (`src/meta/OfflineQueue.ts`) with automatic network flush, retry backoff, and idempotent deduplication.
- **Competitive Infrastructure**:
  - `POST /player/register`: Public key registration and profanity-filtered player tagging.
  - `POST /run/submit`: Cryptographically signed run recording with physical feasibility and anti-cheat bounds.
  - `GET /leaderboard`: Map × mode × difficulty × period filtered Hall of Silence leaderboards.
  - `GET /daily`: Synchronized UTC daily board rotation with countdown timer.
  - `GET /champions`: Crowned weekly/season champions.
  - `POST /room/create`, `POST /room/join`, `POST /room/signal`: WebRTC multiplayer matchmaking and SDP signaling.
  - Automation scripts: `scripts/migrate.mjs`, `scripts/verify-replays.mjs`, `scripts/crown-champions.mjs`, `scripts/cleanup.mjs`, `scripts/dev-api-proxy.mjs`.

### 📱 Full Screen Flow & Navigation
- **Screen Suite** (`src/ui/screens/`):
  - `HomeScreen`: Interactive 3D water background, pointer wake, mission tickers, quick deploy.
  - `PlayHubScreen`: Solo, Co-op, Daily Board, and Endless mode selectors.
  - `MapsScreen`: 11-tape archive shelf with live topological minimaps, star requirements, and par times.
  - `BestiaryScreen`: Interactive 3D turntable viewer with creature lore, acoustic hearing ranges, and behavioral profiles.
  - `LeaderboardsScreen`: Hall of Silence with daily/weekly filters, pinned player ranking, verified replay badges, and ghost launch shortcuts.
  - `ChampionsScreen`: Grand champions hall with season hall of fame.
  - `ProfileScreen`: Operator dossier with stats, Silence Rating, recovery code export/import, and alias renaming.
  - `LobbyScreen`: 3D multiplayer lobby with room code copying, ready toggles, and peer roster chips.
  - `CreditsScreen` & `AboutPrivacyScreen`: CC BY 4.0 attributions, local-first privacy policy, and technical architecture documentation.
  - `ShareCard`: Pure Canvas 2D $(1200\times 630)$ export generator with tape label, score breakdown, rank badge, and instant PNG download.

### 🛡️ QA, Hardening & PWA
- **Smoke Bot (S1–S14)**: Extended headless Chrome/CDP smoke bot to cover all 14 end-to-end scenarios including all 10 maps, orientation, results breakdown, API proxy run submission, two-player race coordination, and offline IndexedDB sync.
- **PWA Ready**: Web App Manifest (`public/manifest.webmanifest`), procedural SVG cartridge tape icon (`public/icon.svg`), and caching Service Worker (`public/sw.js`).
- **Secret Scan Automation**: Enhanced `scripts/secret-scan.mjs` verifying 0 credentials in source, git history, or production `dist/` bundles.

---

## [v0.7.0] — 2026-10-23 (Batch 7: Game Design, Content Expansion & Metagame Layer)
- **11-Tape Campaign**: Linear unlock tree across all maps gated by accumulated star stamps.
- **Dynamic Mutators**: 8 gameplay mutators (Blackout, Heavy Water, Ultra-Sensitive Hearing, Rising Tide, Speed Demon, etc.).
- **Contracts & Progression**: 30 tiered achievements, 24 unlocked cosmetics, daily/weekly field contracts, and Elo Silence Rating.
- **Orientation Tape**: Dedicated tutorial map (`src/world/maps/OrientationMap.ts`) teaching crouch-wading, sprint-jumping, tile navigation, and distraction stone throwing.
- **Results Screen v2**: Multi-metric silence score calculation, personal best tracking, star stamps, and death replay incident line.

---

## [v0.6.0] — 2026-10-23 (Batch 6: Critical Bug Fixes, Water Realism & Creature Art)
- **Autonomous Encounter Director**: Pressure clock, tension pacing, and first-contact guarantees.
- **Physical Traversal Calibration**: Calibrated sprint-jump distance to $3.6\text{ m} \pm 0.2\text{ m}$ for fair trench traversal.
- **Water System v2**: Dynamic 2D wave simulation, depth buffer attenuation (Beer-Lambert law), obstacle reflections, and foam generation.
- **Dual-Track Creature Pipeline**: Polymorphic `MonsterSkin` supporting both procedural segmented creatures and optional GLTF models with CC BY 4.0 attribution.
- **Headless Smoke Bot (S1–S8)**: Automated headless Chrome CDP smoke bot validating boot, loop, audio, water, and map generation.

---

## [v0.5.0] — 2026-10-23 (Batch 5: Advanced Maps 6–10)
- **5 Additional Procedural Maps**: Drowned School, Sunken Jungle, Neon Flood District, Platform Zero (The Drowned Metro), and Drainage Core.
- **Special Mechanics**: Creaking floorboards, surging sluice currents, electromagnetic pulse generators, and express ghost trains.

---

## [v0.4.0] — 2026-10-23 (Batch 4: Multiplayer Networking)
- **Multi-Transport Adapters**: Local tab, BroadcastChannel, Loopback, and Turso network adapters.
- **Multiplayer State Sync**: WebRTC signaling, client interpolation, sound packet broadcasting, and coop spectator mode.

---

## [v0.3.0] — 2026-10-23 (Batch 3: Procedural Maps 1–5 & Multi-Stage Puzzles)
- **Procedural Complex**: The Poolrooms, Utility Tunnels, Marble Atrium, Hydro-Maze, and Natatorium.
- **Environmental Puzzles**: Siphon valves, sequence water gates, pressure plates, and exit code locks.

---

## [v0.2.0] — 2026-10-23 (Batch 2: Acoustic Physics & Monster AI)
- **Simulation Kernel**: 60Hz deterministic fixed-step tick loop decoupled from rendering.
- **Monster Acoustic Hearing**: Inverse-square audio propagation with occlusion and velocity-based splash generation.
- **AI Behavior**: Multi-joint IK animation, sensory state transitions (IDLE, WANDER, ALERTED, HUNT, ATTACK).

---

## [v0.1.0] — 2026-10-23 (Batch 1: Engine Foundation & Procedural Synthesis)
- **Zero-Binary Assets**: Pure WebGL2/Three.js rendering with runtime procedural texture baking.
- **Procedural Audio**: Web Audio API subtractive and FM synthesis (26 distinct sound voices).
