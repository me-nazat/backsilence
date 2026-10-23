# BackSilence — Changelog & Milestone Release History

All notable changes to the **BackSilence** project are documented here.
This project follows strict deterministic, zero-external-binary-asset design principles with pure WebGL2/Three.js rendering and Web Audio synthesis.

---

## [v1.0.0-RC] — 2026-10-23 (Batch 8: Website Art Direction, Motion System, Online Platform & Release)

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
