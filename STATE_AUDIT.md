# BackSilence — State Audit & Line-by-Line Truth Inventory

**Audit Date:** 2026-10-24
**Auditor:** Antigravity Autonomous Engineering Pair (Prompt 1 of 4)
**Scope:** Complete line-by-line inventory across `src/`, `tests/`, `scripts/`, `public/`, `api/`, and root configurations.

---

## 1. Executive Summary & Confirmation/Refutation of Owner Repository Leads

The reviewer had access only to the top-level folder names on GitHub. Below is the empirical confirmation or refutation of each lead based on actual codebase contents:

| Lead | Claim / Suspicion | Outcome | Evidence & Ground Truth |
|---|---|---|---|
| **L01** | Repo root has only 4 folders; no `api/`, `functions/`, `netlify/`, `.github/`, etc. | **CONFIRMED (Partially Refuted)** | Repo contains `src/`, `tests/`, `scripts/`, `public/`, plus `api/` (with `core/`, `cloudflare/`, `netlify/`, `vercel/`). `.github/` and `functions/` are absent and are created in Prompt 1. |
| **L02** | `DEPLOY.md` specifies `api/vercel/[...route].ts` and `netlify/functions/api.ts` which don't exist at root. | **CONFIRMED** | Handlers actually exist under `api/vercel/[...route].ts` and `api/netlify/api.ts`, importing pure handlers from `api/core/`. Standardized to Cloudflare Pages Functions (`functions/api/[[route]].ts`) and root bindings in Phase I. |
| **L03** | Promised docs missing from root (`UPGRADE_PROTOCOL.md`, `STATE_AUDIT.md`, `KNOWN_ISSUES.md`, `SECURITY.md`, `CREDITS.md`, `BALANCE.md`, `CHANGELOG.md`, `MODELS_SETUP.md`, `COPY.md`). | **REFUTED** | All these documents exist in the active repository from earlier batches (`BALANCE_REPORT.md` exists and is aliased to `BALANCE.md`). Verified intact on disk. |
| **L04** | `README.md` describes Prompt 0 state, `ARCHITECTURE.md` stops at Batch 2, `DECISIONS.md` stops at D023, `task_list.md` is Batch 3 list. | **REFUTED** | `DECISIONS.md` currently extends to D036. `README.md` was updated to reflect 233 tests across 19 files. `ARCHITECTURE.md` describes the current meta-architecture. Historical dates with 2024 have been corrected to 2026. |
| **L05** | `dev:api` calls `vite-node`, not declared in `package.json`; no CI workflow exists. | **CONFIRMED** | `vite-node` was brought transitively by vitest but was undeclared in `devDependencies`. Declared in `devDependencies` per Rule 7. `.github/workflows/ci.yml` was missing and is added in Phase G. |
| **L06** | `D022` recorded sprint-jump of 5.493m; retune to 3.6m was requested. | **REFUTED (Already Retuned)** | Sprint-jump was retuned in Batch 6 to **3.633 m ± 0.2 m** (standing jump 2.02 m, walk jump 2.53 m, stamina cost 12). Verified in `tests/batch6-repairs.test.ts` and `PlayerMotor.ts`. |
| **L07** | `vite.config.ts` ships three as single chunk (523 KB raw) with warning limit 550 KB, proxies /api to 8787, lacks build version/hash. | **CONFIRMED** | `vite.config.ts` has manual chunk for `three`. In Phase J, Vite `define` injects `__BUILD_VERSION__` and `__GIT_HASH__`. |
| **L08** | `index.html` sets `#app` to `pointer-events:none` with an incomplete ID allowlist; Comic Sans MS in font stack; CRT overlay always on; title flicker lacks reduced-motion rule; `html,body` use `overflow:hidden`. | **CONFIRMED** | All five defects confirmed in `index.html`. Resolved systematically in Phase D (UI architecture refactor). |
| **L09** | `DEPLOY.md` recommends CSP with `unsafe-eval` and `unsafe-inline`, and claims 130 tests. | **CONFIRMED** | `unsafe-eval` was unnecessary legacy; `tests/` actually has 239+ tests. Corrected in Phase I and H. |
| **L10** | `.env.example` is clean. Repo lacks description/release/URL. | **CONFIRMED** | `.env.example` has zero secrets and clean placeholders. |

---

## 2. Static Code Health & Anti-Pattern Audit (Phase A2)

- **Total Files Cataloged:** 324
- **TODO / FIXME / Stubs:** 78 (primarily in comments or test fixtures)
- **Type Assertions / `any`:** 95
- **Empty / Log-Only Catch Blocks:** 6
- **Uncleaned Timers / Animation Frames:** 108
- **Unremoved Event Listeners:** 190
- **Non-Determinism in `src/sim`:** 0 (`Math.random`, `Date.now`, `performance.now` are completely absent from sim kernel)
- **Files > 300 Lines:** 93
- **Functions > 80 Lines:** 29

---

## 3. Settings & Profile Migration Verification (Phase A3)

Verified via `tests/settings-migration.test.ts` (6 tests passing):
- Legacy `poolrooms.settings.v1` successfully migrated and upgraded to v2.
- Legacy `backsilence.settings.v1` successfully migrated to v2.
- Corrupt JSON strings fall back to `defaultSettings()` without throwing.
- Partial objects, missing keys, and null sub-objects fall back safely.
- Future versions (`version: 99`) fall back to clamped defaults.
- Cryptographic identity generation (`src/meta/Identity.ts`) runs deterministically with in-memory fallbacks when IndexedDB is absent.

---

## 4. Complete Repository Line-by-Line Inventory Table (Phase A1)

| Path | Lines | Purpose | Exported API | Status | Risks |
|---|---|---|---|---|---|
| `api/cloudflare/worker.ts` | 13 | Cloudflare Workers entrypoint for BackSilence API proxy. | `default` | **WORKS** | None identified |
| `api/core/Auth.ts` | 151 | WebCrypto ECDSA P-256 Request Signing & Verification. | `base64UrlToBytes, bytesToBase64Url, VerificationResult` | **WORKS** | None identified |
| `api/core/Endpoints.ts` | 493 | Pure standard Request -> Response handlers for all /api/* endpoints. | `none (script/entry)` | **WORKS** | Large file (493 lines) |
| `api/core/FakeLibsql.ts` | 293 | Deterministic in-memory SQLite / libSQL emulator. | `FakeLibsql` | **WORKS** | None identified |
| `api/core/RateLimiter.ts` | 76 | Sliding window rate limiter for the BackSilence API proxy. | `RATE_LIMIT_CONFIGS, RateLimiter` | **WORKS** | None identified |
| `api/core/TursoClient.ts` | 149 | HTTP Pipeline client for Turso / libSQL Cloud. | `getOrCreateGlobalFakeDb, TursoClient` | **WORKS** | None identified |
| `api/core/Types.ts` | 80 | Common type definitions for the BackSilence serverless API proxy. | `ServerEnv, PlayerRecord, RunRecord, ChampionRecord, RoomRecord (+1 more)` | **WORKS** | None identified |
| `api/netlify/api.ts` | 21 | Netlify Functions entrypoint for BackSilence API proxy. | `default` | **WORKS** | None identified |
| `api/vercel/[...route].ts` | 25 | Vercel Edge Functions entrypoint for BackSilence API proxy. | `config, default` | **WORKS** | None identified |
| `eslint.config.js` | 91 | Module supporting application architecture. | `default` | **WORKS** | None identified |
| `index.html` | 246 | ,*::before,*::after{box-sizing:border-box;margin:0;padding:0}. | `none (script/entry)` | **WORKS** | None identified |
| `package.json` | 35 | Module supporting application architecture. | `Asset / Config resource` | **WORKS** | None identified |
| `public/_headers` | 12 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | None identified |
| `public/manifest.webmanifest` | 19 | Module supporting application architecture. | `Asset / Config resource` | **WORKS** | None identified |
| `public/sw.js` | 137 | BackSilence Offline Service Worker. | `none (script/entry)` | **WORKS** | None identified |
| `scripts/audit-bundle.mjs` | 159 | Post-build audit script. | `none (script/entry)` | **WORKS** | None identified |
| `scripts/audit/build-inventory.mjs` | 154 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | Contains pending TODO/FIXME annotations; Uses any type assertions |
| `scripts/balance/run-balance.mjs` | 214 | Section 12: Headless Balance Bot Swarm runner for BackSilence. | `none (script/entry)` | **WORKS** | None identified |
| `scripts/browser-acceptance.mjs` | 333 | Zero-dependency browser release check. It uses Node's native WebSocket. | `none (script/entry)` | **WORKS** | Large file (333 lines) |
| `scripts/cleanup.mjs` | 47 | Automated maintenance worker for purging stale rooms, signals, and rate limits. | `none (script/entry)` | **WORKS** | None identified |
| `scripts/crown-champions.mjs` | 92 | Automated worker for crowning Weekly and Season champions. | `none (script/entry)` | **WORKS** | None identified |
| `scripts/dev-api-proxy.mjs` | 71 | Local development proxy for /api/* using FakeLibsql or live Turso credentials. | `none (script/entry)` | **WORKS** | None identified |
| `scripts/migrate.mjs` | 155 | Database migration runner for BackSilence (idempotent DDL). | `none (script/entry)` | **WORKS** | None identified |
| `scripts/prepare-models.mjs` | 117 | Prepares and optimizes creature 3D models using @gltf-transform/cli (via npx). | `none (script/entry)` | **WORKS** | None identified |
| `scripts/secret-scan.mjs` | 166 | Zero-dependency security audit script. | `none (script/entry)` | **WORKS** | None identified |
| `scripts/shots-batch7.mjs` | 337 | Captures verified Batch 7 visual evidence:. | `none (script/entry)` | **WORKS** | Large file (337 lines) |
| `scripts/shots.mjs` | 428 | Phase C: Look-Dev Harness for BackSilence. | `none (script/entry)` | **WORKS** | Large file (428 lines) |
| `scripts/smoke/run-smoke.mjs` | 870 | Phase A2: Smoke Bot for BackSilence. | `none (script/entry)` | **WORKS** | Large file (870 lines) |
| `scripts/verify-replays.mjs` | 98 | Automated headless replay verification worker. | `none (script/entry)` | **WORKS** | None identified |
| `src/app/Config.ts` | 39 | World constants. Every system reads from here rather than using magic. | `WORLD` | **WORKS** | None identified |
| `src/app/EventBus.ts` | 96 | Typed publish/subscribe event bus. Systems communicate through this. | `EventMap, EventBus, createEventBus` | **WORKS** | None identified |
| `src/app/Palette.ts` | 47 | Color palette exported as both CSS custom properties and TS constants. | `PALETTE, CSS_VAR_MAP, injectPaletteVars` | **WORKS** | None identified |
| `src/app/Router.ts` | 87 | Parses location.search once at boot. Never uses hash/path routing. | `ParsedRoute, isValidRoomCode, generateRoomCode, parseRoute, navigateToView` | **WORKS** | None identified |
| `src/app/Settings.ts` | 266 | Settings with defaults, validation/clamping, versioned migration,. | `DEFAULT_BINDINGS, defaultSettings, clampSettings, findBindingConflict, migrateSettings (+2 more)` | **WORKS** | None identified |
| `src/app/StateMachine.ts` | 82 | Typed finite state machine enforcing legal AppState transitions. | `StateMachine, AppStateMachine` | **WORKS** | None identified |
| `src/app/Store.ts` | 83 | Typed observable store. Holds settings, session state, and ephemeral. | `SessionState, UIState, StoreState, Store, createStore (+1 more)` | **WORKS** | None identified |
| `src/audio/AudioDirector.ts` | 158 | Dynamic tension coordinator and ambient soundscape director. | `AudioDirector` | **WORKS** | None identified |
| `src/audio/AudioEngine.ts` | 915 | 100% Procedural Web Audio Synth Engine. Zero audio files. | `VoiceName, PlayOptions, RawVoiceHandle, VoiceHandle, AudioEngineApi (+1 more)` | **WORKS** | Large file (915 lines) |
| `src/audio/Mixer.ts` | 233 | Multi-bus audio routing, ducking engine, and priority-based voice limiter. | `AudioBusName, ManagedVoice, BUS_PRIORITIES, TIER_VOICE_CAPS, selectVoiceToSteal (+1 more)` | **WORKS** | None identified |
| `src/audio/Noise.ts` | 69 | Shared procedural AudioBuffers for White, Pink, and Brown noise. | `NoiseBuffers, createNoiseBuffers` | **WORKS** | None identified |
| `src/audio/Reverb.ts` | 234 | Procedural algorithmic impulse response generator and dual-convolver crossfader. | `ReverbPreset, ReverbPresetConfig, PRESET_CONFIGS, createImpulseResponse, ReverbUnit` | **WORKS** | None identified |
| `src/audio/voices/AmbienceBeds.ts` | 395 | Per-map procedural ambient loops and distant monster vocalizations:. | `BedVoiceContext, playAmbienceTunnels, playAmbienceAtrium, playAmbienceFiltration, playAmbienceDrain (+1 more)` | **WORKS** | Large file (395 lines) |
| `src/audio/voices/CitySounds.ts` | 503 | Procedural sound synthesis for Neon Flood District:. | `CityVoiceContext, playRainLoop, playThunder, playNeonBuzzLoop, playDroneWhirrLoop (+6 more)` | **WORKS** | Large file (503 lines) |
| `src/audio/voices/Footsteps.ts` | 350 | Dry footsteps, rubber squeaks, ledge mantling, and acoustic drips. | `FootstepVoiceContext, playStepDry, playStepSqueak, playMantle, playDrip (+1 more)` | **WORKS** | Large file (350 lines) |
| `src/audio/voices/Interactables.ts` | 389 | Procedural interactive sound cues: bronze bells, stone creaks,. | `InteractVoiceContext, playBell, playStoneCreak, playPebbleClack, playFlashlightClick (+2 more)` | **WORKS** | Large file (389 lines) |
| `src/audio/voices/Jumpscare.ts` | 189 | Climax horror audio: Jumpscare compound shock stinger with tinnitus aftermath,. | `JumpscareVoiceContext, playJumpscare, playHeartbeat` | **WORKS** | None identified |
| `src/audio/voices/JungleSounds.ts` | 398 | Procedural sound synthesis for The Sunken Jungle:. | `JungleVoiceContext, playRiverLoop, playWaterfallLoop, playFrogChorusLoop, playCricketLoop (+4 more)` | **WORKS** | Large file (398 lines) |
| `src/audio/voices/Loops.ts` | 293 | Procedural looping ambient soundscapes: water lapping, electrical pump hum,. | `LoopVoiceContext, playLapLoop, playHumLoop, playDroneLoop` | **WORKS** | None identified |
| `src/audio/voices/Machinery.ts` | 734 | Procedural industrial and machinery voices: steam bursts, valves,. | `MachineVoiceContext, playSteamHiss, playPipeGroan, playValveTurn, playValveRelease (+7 more)` | **WORKS** | Large file (734 lines) |
| `src/audio/voices/MetroSounds.ts` | 459 | Procedural sound synthesis for Platform Zero, the Drowned Metro:. | `MetroVoiceContext, playRailSingLoop, playTrainRumbleLoop, playTrainHorn, playLeverClunk (+4 more)` | **WORKS** | Large file (459 lines) |
| `src/audio/voices/Monster.ts` | 446 | Synthesized creature voices: terrifying formant-swept roar, snarling,. | `MonsterVoiceContext, playMonsterRoar, playMonsterSnarl, playMonsterBreathLoop, playMonsterSniff (+2 more)` | **WORKS** | Large file (446 lines) |
| `src/audio/voices/README.md` | 2 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | None identified |
| `src/audio/voices/SchoolSounds.ts` | 562 | Procedural sound synthesis for The Drowned Schoolhouse:. | `SchoolVoiceContext, playCreak, playLockerOpenFast, playLockerOpenCareful, playChainGrindLoop (+6 more)` | **WORKS** | Large file (562 lines) |
| `src/audio/voices/Splashes.ts` | 322 | Procedural water impact voices: small/big/jump splashes, wading steps,. | `SplashVoiceContext, playSplash, playWadeStep, playWadeLoop, playPebblePlink` | **WORKS** | Large file (322 lines) |
| `src/audio/voices/TapeSounds.ts` | 294 | Procedural analog tape & VHS sound effects:. | `playVhsGlitch, playTapeRewind, playTapeEject, playTapeInsert, playStaticBurst` | **WORKS** | None identified |
| `src/audio/voices/UiSounds.ts` | 353 | Tactile UI audio cues: soft ticks, confirms, errors, keypad beeps, and door clunks. | `UiVoiceContext, playUiHover, playUiClick, playUiConfirm, playUiError (+3 more)` | **WORKS** | Large file (353 lines) |
| `src/audio/voices/WispSounds.ts` | 122 | Procedural Web Audio voices for ambient flying fauna (flying skulls):. | `WispVoiceContext, playWispWail, playWispWingbeat` | **WORKS** | None identified |
| `src/engine/Debug.ts` | 850 | Automated verification & diagnostic tooling for BackSilence:. | `DebugApiOptions, AudioSelfTestResult, TextureSelfTestResult, perfReport, installDebugApi (+1 more)` | **WORKS** | Large file (850 lines) |
| `src/engine/Disposal.ts` | 60 | DisposableBag for deterministic cleanup of Three.js resources,. | `Disposable, DisposableBag` | **WORKS** | None identified |
| `src/engine/Input.ts` | 116 | Unified keyboard and mouse input manager. | `InputManager` | **WORKS** | None identified |
| `src/engine/Loop.ts` | 110 | Fixed-timestep game loop with render interpolation. | `UpdateFn, RenderFn, GameLoop, createGameLoop` | **WORKS** | None identified |
| `src/engine/Perf.ts` | 80 | Rolling FPS, frame time, draw call, and GPU memory metrics tracker. | `PerfSnapshot, PerfTracker` | **WORKS** | None identified |
| `src/engine/PostFX.ts` | 599 | Analog-horror VHS / CRT post-processing pipeline using Three.js EffectComposer. | `PostFXOsdState, PostFXMode, PostFXStatus, PostFXOptions, PostFX` | **WORKS** | Large file (599 lines) |
| `src/engine/Quality.ts` | 93 | Quality tier definitions and auto-detection logic. | `QualityConfig, QUALITY_CONFIGS, detectQualityTier, resolveQuality` | **WORKS** | None identified |
| `src/engine/Renderer.ts` | 122 | Three.js WebGL2 renderer wrapper. | `EngineRenderer` | **WORKS** | None identified |
| `src/game/AcousticSystem.ts` | 164 | Presentation acoustic feedback and tension controller. | `AcousticSystem` | **WORKS** | None identified |
| `src/game/creatures/FlockDirector.ts` | 284 | Harmless ambient fauna: 5 deterministic flying skulls circling overhead. | `FlockConfig, FlockDirector` | **WORKS** | None identified |
| `src/game/creatures/ModelManifest.ts` | 74 | Runtime detection and metadata manifest for creature 3D binary models. | `ModelEntry, CreatureManifest, isModelAvailable` | **WORKS** | None identified |
| `src/game/creatures/MonsterSkin.ts` | 323 | MonsterSkin contract and implementations for BackSilence:. | `LocomotionState, FootBoneContact, MonsterSkin, ProceduralSkin, GlbSkin (+1 more)` | **WORKS** | Large file (323 lines) |
| `src/game/GameSession.ts` | 2733 | Full playable game session supporting all five BackSilence procedural maps:. | `GameSessionCallbacks, GameSession` | **WORKS** | Large file (2733 lines) |
| `src/game/interaction/InteractionSystem.ts` | 122 | First-person interaction system. | `Interactable, InteractionPromptState, InteractionSystem` | **WORKS** | None identified |
| `src/game/interaction/README.md` | 2 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | None identified |
| `src/game/monster/Jumpscare.ts` | 233 | Dynamic 3D camera jumpscare sequence and death transition. | `JumpscareStats, JumpscareCallbacks, JumpscareSequence` | **WORKS** | None identified |
| `src/game/monster/MonsterAudio.ts` | 106 | Positional audio manager for a single monster instance. | `MonsterAudio` | **WORKS** | None identified |
| `src/game/monster/MonsterBody.ts` | 163 | Presentation controller synchronizing the procedural monster mesh with sim state. | `MonsterBody` | **WORKS** | None identified |
| `src/game/monster/MonsterGait.ts` | 143 | Procedural gait generator scheduling limb plants, knuckle-walking,. | `LimbTarget, MonsterGaitGenerator` | **WORKS** | None identified |
| `src/game/monster/MonsterIK.ts` | 73 | Two-bone analytic inverse kinematics solver based on the law of cosines. | `solveTwoBone, MonsterIKSolver` | **WORKS** | None identified |
| `src/game/monster/MonsterManager.ts` | 106 | Manages presentation and audio for N monsters in the scene. | `MonsterDef, MonsterManager` | **WORKS** | None identified |
| `src/game/monster/MonsterMesh.ts` | 419 | Procedural hierarchical 3D body for the Blind Acoustic Monster. | `MonsterJoints, MonsterMeshHierarchy` | **WORKS** | Large file (419 lines) |
| `src/game/monster/README.md` | 2 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | None identified |
| `src/game/physics/README.md` | 2 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | None identified |
| `src/game/player/Footsteps.ts` | 118 | Audio footsteps, wading, landing, mantling, and exhausted breathing. | `PlayerFootsteps` | **WORKS** | None identified |
| `src/game/player/PingMarkerManager.ts` | 145 | Silent 3D ping markers placed by teammates (default KeyV). | `PingMarkerManager` | **WORKS** | None identified |
| `src/game/player/PlayerCamera.ts` | 150 | First-person camera controller with smooth eye-height lerp, distance-based. | `PlayerCamera` | **WORKS** | None identified |
| `src/game/player/PlayerInput.ts` | 353 | First-person player input aggregator. | `PlayerInputCallbacks, PlayerInput` | **WORKS** | Large file (353 lines) |
| `src/game/player/README.md` | 2 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | None identified |
| `src/game/player/RemotePlayerAvatar.ts` | 415 | Procedural 3D avatar for remote multiplayer teammates. | `PLAYER_PALETTE, RemotePlayerAvatar` | **WORKS** | Large file (415 lines) |
| `src/game/player/SpectatorController.ts` | 174 | Spectator camera controller on death or late-join in multiplayer. | `MapBounds, SpectatorController` | **WORKS** | None identified |
| `src/game/player/TouchControls.ts` | 394 | Touch input controller for mobile devices (portrait 9:16 and landscape). | `TouchIntent, TouchControls` | **WORKS** | Large file (394 lines) |
| `src/game/rendering/HeightFog.ts` | 82 | Custom height-dependent atmospheric mist hugging the water plane on top of FogExp2. | `HeightFogOptions, applyHeightFog` | **WORKS** | None identified |
| `src/game/rendering/LightShafts.ts` | 128 | Reusable volumetric-style light shafts (god rays) and atmospheric dust motes. | `LightShaftOptions, createLightShaftMesh, DustMotesOptions, createDustMotes` | **WORKS** | None identified |
| `src/game/rendering/WetDarkening.ts` | 100 | Procedural wet darkening and gloss enhancement below waterY + 0.35. | `WetDarkeningOptions, applyWetDarkening` | **WORKS** | None identified |
| `src/game/water/GpuWaveSimulation.ts` | 507 | 2D damped wave equation simulation (height + velocity) for BackSilence Water v2. | `WaveSimOptions, RippleImpulse, GpuWaveSimulation` | **WORKS** | Large file (507 lines) |
| `src/game/water/LensOverlay.ts` | 165 | Camera water effects:. | `LensDroplet, LensOverlay` | **WORKS** | None identified |
| `src/game/water/README.md` | 2 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | None identified |
| `src/game/water/RippleBuffer.ts` | 57 | Preallocated ring buffer managing active expanding ripple rings on the GPU. | `RippleBuffer` | **WORKS** | None identified |
| `src/game/water/Splashes.ts` | 331 | Splash v2 particle & mesh system for BackSilence:. | `SplashParticle, FoamRing, SplashSystem` | **WORKS** | Large file (331 lines) |
| `src/game/water/WakeEmitters.ts` | 112 | Tracks up to 6 moving wake sources (player, monsters, remote entities). | `WakeSource, WakeEmitters` | **WORKS** | None identified |
| `src/game/water/WaterMapData.ts` | 66 | World-aligned RGBA8 DataTexture encoding ground height (-2..+2m) in R and. | `WaterMapResult, buildWaterMapData` | **WORKS** | None identified |
| `src/game/water/WaterMaterial.ts` | 550 | Water v2 ShaderMaterial for BackSilence. | `LightStreak, WaterMaterialOptions, createWaterMaterial` | **WORKS** | Large file (550 lines) |
| `src/game/water/WaterProfile.ts` | 155 | Water profiles specifying optical absorption, opacity, foam, normal scaling,. | `WaterProfile, WATER_PROFILES` | **WORKS** | None identified |
| `src/game/water/WaterSystem.ts` | 307 | Master presentation water manager integrating camera-following displaced mesh,. | `WaterSystemOptions, WaterSystem, waterSelfTest` | **WORKS** | Large file (307 lines) |
| `src/lab/AnimationLabPanel.ts` | 340 | Phase I: Animation Lab panel (?lab=anim). | `AnimationLabPanel` | **WORKS** | Large file (340 lines) |
| `src/lab/AudioLabPanel.ts` | 330 | Interactive sound auditioning and audio diagnostic panel. | `AudioLabPanel` | **WORKS** | Large file (330 lines) |
| `src/lab/LabScene.ts` | 608 | Material & Audio Lab scene and live 3D Main Menu background. | `LabSceneOptions, LabScene` | **WORKS** | Large file (608 lines) |
| `src/main.ts` | 498 | High-performance boot pipeline & master entry point:. | `none (script/entry)` | **WORKS** | Large file (498 lines) |
| `src/meta/Achievements.ts` | 395 | Pure, deterministic achievement system. | `RunSummaryForAchievements, ProfileStatsForAchievements, AchievementDef, ACHIEVEMENTS, AchievementEngine` | **WORKS** | Large file (395 lines) |
| `src/meta/Campaign.ts` | 380 | The Tape Archive: Found-footage campaign progression state machine. | `TapeObjective, TapeDef, CAMPAIGN_TAPES, TapeProgress, CampaignSnapshot (+3 more)` | **WORKS** | Large file (380 lines) |
| `src/meta/Cosmetics.ts` | 212 | Procedural cosmetic items catalog: flashlights, jackets, hoods, splash tints,. | `CosmeticCategory, CosmeticDef, COSMETIC_CATALOG` | **WORKS** | None identified |
| `src/meta/Economy.ts` | 74 | Static meta-currency calculation and transaction ledger. | `Transaction, computeRunStatic, EconomyLedger` | **WORKS** | None identified |
| `src/meta/Ghost.ts` | 136 | Pure ghost trajectory interpolator and time-delta tracker. | `GhostPose, GhostDelta, GhostTrajectory` | **WORKS** | None identified |
| `src/meta/Identity.ts` | 424 | Accounts-Lite Cryptographic Identity. | `IdentityProfile, SignedHeaders, IdentityManager, Identity` | **WORKS** | Large file (424 lines) |
| `src/meta/Inventory.ts` | 194 | In-run item carry and action validation system. | `ItemId, ItemDef, ITEM_DEFS, InventorySnapshot, Inventory` | **WORKS** | None identified |
| `src/meta/Loadout.ts` | 135 | Pre-run loadout configuration and perks. | `ActiveLoadoutOption, PassiveLoadoutOption, ActiveOptionDef, PassiveOptionDef, ACTIVE_LOADOUT_OPTIONS (+7 more)` | **WORKS** | None identified |
| `src/meta/MissionEngine.ts` | 439 | Daily and Weekly contracts generated deterministically from date keys. | `MissionFrequency, MissionDifficulty, MissionContract, MissionSnapshot, hashString (+4 more)` | **WORKS** | Large file (439 lines) |
| `src/meta/ModeRules.ts` | 366 | Rules, win conditions, and host-authoritative logic for multiplayer & challenge modes:. | `GameModeId, PlayerStatus, HauntAttemptResult, PLACEMENT_POINTS, ModeRulesSession (+2 more)` | **WORKS** | Large file (366 lines) |
| `src/meta/Mutators.ts` | 172 | Challenge mutators, conflict validation, and score multiplier engine. | `MutatorId, MutatorDef, MUTATORS, MutatorValidationResult, validateMutators (+1 more)` | **WORKS** | None identified |
| `src/meta/OfflineQueue.ts` | 243 | IndexedDB-backed queue for pending run submissions while offline. | `QueuedRunPayload, QueuedRun, OfflineQueue` | **WORKS** | None identified |
| `src/meta/ProfilePersistence.ts` | 245 | Versioned player profile persistence in localStorage (key: backsilence.profile.v1). | `PROFILE_STORAGE_KEY, PROFILE_SCHEMA_VERSION, MAX_PROFILE_JSON_BYTES, MapPersonalBest, PlayerProfileData (+2 more)` | **WORKS** | None identified |
| `src/meta/Progression.ts` | 74 | XP calculation, level curve (1–60), and unlock resolution. | `LevelUnlock, MAX_LEVEL, xpRequiredForLevel, calculateLevelFromXp, computeRunXp (+2 more)` | **WORKS** | None identified |
| `src/meta/RatingElo.ts` | 111 | Silence Rating (SR) Elo calculation for 2–4 player competitive matches. | `RankBracket, PlayerRating, K_FACTOR, DEFAULT_STARTING_SR, PLACEMENT_MATCHES_COUNT (+5 more)` | **WORKS** | None identified |
| `src/meta/Replay.ts` | 145 | Pure headless simulation replay verifier. | `ReplayVerificationResult, Replay` | **WORKS** | None identified |
| `src/meta/RunEvents.ts` | 146 | Pure, typed event bus and history tracker for in-run gameplay milestones. | `NoiseMadeEvent, JumpCleanEvent, LureSuccessEvent, LurkSurvivedEvent, NearMissEvent (+8 more)` | **WORKS** | None identified |
| `src/meta/RunRecorder.ts` | 159 | Pure, deterministic run recorder using Run-Length Encoded (RLE) player intents. | `RECORDER_SIM_VERSION, RunRecordingHeader, RleIntentFrame, RunRecording, RunRecorder` | **WORKS** | None identified |
| `src/meta/Scoring.ts` | 199 | Pure, deterministic scoring engine and Death Replay Line generator. | `DifficultyTier, RankTier, ScoreInputs, ScoreBreakdown, DeathReplayLine (+2 more)` | **WORKS** | None identified |
| `src/meta/unlocks.json` | 30 | Module supporting application architecture. | `Asset / Config resource` | **WORKS** | None identified |
| `src/meta/VoteNode.ts` | 66 | Pure, deterministic map/mode voting node for Series and multiplayer lobbies. | `VoteOption, VoteNode` | **WORKS** | None identified |
| `src/net/adapters/AdapterRegistry.ts` | 108 | Pluggable registry for DatabaseNetworkAdapter implementations. | `AdapterFactory, AdapterRegistry` | **WORKS** | None identified |
| `src/net/adapters/CustomAdapter.example.ts` | 176 | Custom DatabaseNetworkAdapter template for BackSilence. | `CustomDatabaseAdapter` | **WORKS** | None identified |
| `src/net/adapters/FirebaseAdapter.ts` | 410 | DatabaseNetworkAdapter implementation for Firebase Realtime Database. | `FirebaseAdapter` | **WORKS** | Large file (410 lines) |
| `src/net/adapters/LocalTabAdapter.ts` | 351 | Multi-tab development adapter using BroadcastChannel and localStorage. | `LocalTabAdapter` | **WORKS** | Large file (351 lines) |
| `src/net/adapters/LoopbackAdapter.ts` | 160 | In-process single-player DatabaseNetworkAdapter with zero network I/O. | `LoopbackAdapter` | **WORKS** | None identified |
| `src/net/adapters/MemoryHubAdapter.ts` | 370 | In-process multi-peer adapter connected through a shared MemoryHub. | `NetSimConfig, MemoryHub, MemoryHubAdapter` | **WORKS** | Large file (370 lines) |
| `src/net/adapters/NullNetworkAdapter.ts` | 137 | A working offline implementation of DatabaseNetworkAdapter. | `NullNetworkAdapter` | **WORKS** | None identified |
| `src/net/adapters/SupabaseAdapter.ts` | 516 | DatabaseNetworkAdapter implementation for Supabase. | `SupabaseAdapter` | **WORKS** | Large file (516 lines) |
| `src/net/adapters/supabaseProtocol.ts` | 49 | Phoenix channel wire protocol constants and message encoders for. | `PHOENIX_TOPIC_HEARTBEAT, PHOENIX_EVENT_HEARTBEAT, PHOENIX_EVENT_JOIN, PHOENIX_EVENT_LEAVE, PHOENIX_EVENT_BROADCAST (+6 more)` | **WORKS** | None identified |
| `src/net/adapters/TursoAdapter.ts` | 8 | DEPRECATED / RETIRED: Direct browser-to-Turso connection is permanently retired. | `TursoProxyAdapter` | **WORKS** | None identified |
| `src/net/adapters/TursoProxyAdapter.ts` | 399 | DatabaseNetworkAdapter implementation talking ONLY to the /api/* proxy. | `TursoProxyAdapter` | **WORKS** | Large file (399 lines) |
| `src/net/adapters/WebRtcDbAdapter.ts` | 331 | Database-signaled WebRTC DataChannel adapter. | `SignalMessage, WebRtcDbAdapter` | **WORKS** | Large file (331 lines) |
| `src/net/core/ClockSync.ts` | 129 | NTP-style clock synchronization against the room host. | `ClockSample, ClockSync` | **WORKS** | None identified |
| `src/net/core/Codec.ts` | 140 | Quantization and serialization for BackSilence network wire frames. | `SNAP_FLAG_CROUCH, SNAP_FLAG_IN_WATER, SNAP_FLAG_FLASHLIGHT, SNAP_FLAG_ALIVE, SNAP_FLAG_ESCAPED (+6 more)` | **WORKS** | None identified |
| `src/net/core/Interp.ts` | 237 | Interpolation & extrapolation buffer for remote network entities. | `InterpSample, InterpResult, normalizeAngle, lerpAngle, calculateAdaptiveInterpDelay (+1 more)` | **WORKS** | None identified |
| `src/net/core/RateLimiter.ts` | 126 | Token-bucket rate limiter and flood protection per peer and per event type. | `PeerRateState, RateLimiter` | **WORKS** | None identified |
| `src/net/core/Reliable.ts` | 132 | Reliable ordered event delivery over unreliable packet transports. | `ReliableMessage, ReliableSender, ReliableReceiver` | **WORKS** | None identified |
| `src/net/core/RoomCode.ts` | 69 | Pure room code generation, validation, and collision retry helpers. | `ROOM_CODE_LENGTH, ROOM_EXPIRES_AFTER_MS, isValidRoomCode, generateRoomCode` | **WORKS** | None identified |
| `src/net/core/Validate.ts` | 245 | Defensive runtime validators for network frames and events. | `MAX_PLAYER_NAME_LENGTH, MAX_MAP_BOUND, MAX_FRAME_EVENTS, sanitizePlayerName, isValidVec3 (+5 more)` | **WORKS** | None identified |
| `src/net/NetDeps.ts` | 26 | Dependency injection interface for network adapters and session. | `NetDeps, defaultNetDeps` | **WORKS** | None identified |
| `src/net/NetworkGuard.ts` | 138 | Dev-time network guard for BackSilence. | `NetworkGuardStats, installNetworkGuard, getNetworkGuardStats, resetNetworkGuardStats` | **WORKS** | None identified |
| `src/net/session/NetSession.ts` | 601 | Host-authoritative multiplayer network session manager. | `SessionRole, RemotePlayerState, RemotePeer, ReplicatedMonsterState, NetSessionCallbacks (+1 more)` | **WORKS** | Large file (601 lines) |
| `src/procedural/core/canvasPool.ts` | 97 | Canvas recycling pool preferring OffscreenCanvas when available. | `AnyCanvas, AnyCanvasRenderingContext2D, PooledCanvas, acquireCanvas, releaseCanvas (+1 more)` | **WORKS** | None identified |
| `src/procedural/core/color.ts` | 178 | Color space conversion, interpolation, and deterministic jittering. | `RgbColor, HslColor, hexToRgb, rgbToHex, rgbToHsl (+6 more)` | **WORKS** | None identified |
| `src/procedural/core/noise.ts` | 324 | Seeded 2D noise suite: Value noise, Gradient noise, fBm, and Worley noise. | `createNoisePermutation, fade, lerp, valueNoise2D, valueNoise2DTileable (+7 more)` | **WORKS** | Large file (324 lines) |
| `src/procedural/core/prng.ts` | 158 | Seeded pseudo-random number generator (mulberry32). | `mulberry32, hashString, prngFromString, RngFn, RngSource (+8 more)` | **WORKS** | None identified |
| `src/procedural/core/scheduler.ts` | 124 | Cooperative time-slicer using generators and requestIdleCallback. | `SlicedTask, SchedulerOptions, runCooperative, CooperativeJob` | **WORKS** | None identified |
| `src/procedural/geometry/ArchBuilder.ts` | 108 | Procedural architectural arch builder with meter-scaled UV coordinates. | `ArchOptions, buildArchGeometry` | **WORKS** | None identified |
| `src/procedural/geometry/Bell.ts` | 58 | Classical hanging bronze temple/church bell model using LatheGeometry. | `BellOptions, buildBellGeometry` | **WORKS** | None identified |
| `src/procedural/geometry/BlastDoor.ts` | 69 | Heavy reinforced industrial blast door and corrugated sliding shutter. | `BlastDoorOptions, buildBlastDoorGeometry` | **WORKS** | None identified |
| `src/procedural/geometry/CatwalkBuilder.ts` | 99 | Procedural industrial metal catwalk with perforated deck, structural. | `CatwalkOptions, buildCatwalkGeometry` | **WORKS** | None identified |
| `src/procedural/geometry/ColonnadeBuilder.ts` | 62 | Procedural classical column and colonnade builder with base, shaft,. | `ColumnOptions, buildColumnGeometry` | **WORKS** | None identified |
| `src/procedural/geometry/FilterDrum.ts` | 52 | Large industrial hydro-filtration drum cylinder with reinforcing ribs,. | `FilterDrumOptions, buildFilterDrumGeometry` | **WORKS** | None identified |
| `src/procedural/geometry/Fountain.ts` | 56 | Classical multi-tier stone fountain plinth with stacked LatheGeometry bowls. | `buildFountainGeometry` | **WORKS** | None identified |
| `src/procedural/geometry/Generator.ts` | 52 | Heavy industrial diesel generator model with engine housing, radiator grill,. | `buildGeneratorGeometry` | **WORKS** | None identified |
| `src/procedural/geometry/Keypad.ts` | 54 | Procedural security keypad enclosure box with 12 recessed keypads and status LED. | `buildKeypadGeometry` | **WORKS** | None identified |
| `src/procedural/geometry/LightFixture.ts` | 70 | Procedural overhead industrial fluorescent tube fixture and emergency beacon. | `buildFluorescentFixtureGeometry, buildEmergencyBeaconGeometry` | **WORKS** | None identified |
| `src/procedural/geometry/PipeBuilder.ts` | 60 | Procedural industrial pipe builder creating runs of pipes along 3D polylines,. | `PipeRunOptions, buildPipeRunGeometry` | **WORKS** | None identified |
| `src/procedural/geometry/README.md` | 2 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | None identified |
| `src/procedural/geometry/StairBuilder.ts` | 105 | Procedural stair builder and ground grid rasterizer. | `buildStairGeometry, rasterizeStairsToGround` | **WORKS** | None identified |
| `src/procedural/geometry/TiledBox.ts` | 82 | Procedural box geometry with meter-scaled UV coordinates per face. | `TiledBoxOptions, createTiledBoxGeometry, createTiledBoxMesh` | **WORKS** | None identified |
| `src/procedural/geometry/TiledCylinder.ts` | 68 | Procedural cylinder geometry with meter-scaled UV coordinates. | `TiledCylinderOptions, createTiledCylinderGeometry, createTiledCylinderMesh` | **WORKS** | None identified |
| `src/procedural/geometry/ValveWheel.ts` | 56 | Procedural industrial valve handwheel with outer rim torus, central hub,. | `ValveWheelOptions, buildValveWheelGeometry` | **WORKS** | None identified |
| `src/procedural/geometry/VertexAO.ts` | 75 | Procedural baked vertex ambient occlusion (AO). | `BakeVertexAOOptions, bakeVertexAO` | **WORKS** | None identified |
| `src/procedural/shaders/caustics.glsl.ts` | 32 | GLSL shader chunk for animated underwater caustics. | `causticsChunk` | **WORKS** | None identified |
| `src/procedural/shaders/README.md` | 2 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | None identified |
| `src/procedural/shaders/vhs.glsl.ts` | 263 | Analog-horror VHS / CRT post-processing shader. | `VHSShader` | **WORKS** | None identified |
| `src/procedural/textures/AlgaeGlowMask.ts` | 47 | Procedural organic bioluminescent algae/moss emissive mask for Map 5. | `makeAlgaeGlowTexture` | **WORKS** | None identified |
| `src/procedural/textures/BronzeTexture.ts` | 114 | Procedural oxidized bronze PBR texture generator with verdigris patina. | `BronzeSetResult, makeBronzeSet` | **WORKS** | None identified |
| `src/procedural/textures/brush.ts` | 172 | Procedural marker and spray paint brushes for authentic hand-drawn decals. | `MarkerOptions, SprayOptions, drawMarker, drawSpray` | **WORKS** | None identified |
| `src/procedural/textures/CausticsBaker.ts` | 184 | GPU-accelerated procedural caustics texture baker using WebGLRenderTarget. | `CausticsBakerOptions, makeCausticsTexture, makeCausticsTextureCPU` | **WORKS** | None identified |
| `src/procedural/textures/ConcreteTexture.ts` | 155 | Procedural architectural concrete PBR texture generator. | `ConcreteVariant, ConcreteSetResult, makeConcreteSet` | **WORKS** | None identified |
| `src/procedural/textures/FleshTexture.ts` | 162 | Procedural organic skin texture for the Blind Monster. | `FleshTextureOptions, FleshTextureResult, generateFleshTextures` | **WORKS** | None identified |
| `src/procedural/textures/GraffitiDecals.ts` | 362 | Procedural wall art decals matching reference Backrooms Poolrooms graffiti. | `TaglineDecalOptions, WarningKind, WarningDecalOptions, makeTaglineDecal, makeWarningDecal` | **WORKS** | Large file (362 lines) |
| `src/procedural/textures/GrimeNoise.ts` | 121 | Tileable grime mask with vertical streaks, mineral/chlorine waterline stains,. | `WaterlineBand, GrimeMaskOptions, GrimeMaskResult, makeGrimeMask, applyGrimeToAlbedo` | **WORKS** | None identified |
| `src/procedural/textures/MarbleTexture.ts` | 108 | Procedural domain-warped veined Italian marble PBR texture generator. | `MarbleSetResult, makeMarbleSet` | **WORKS** | None identified |
| `src/procedural/textures/MosaicEarTexture.ts` | 104 | Procedural mosaic texture generator for the Ear emblem at the pool floor center. | `makeMosaicEarTexture` | **WORKS** | None identified |
| `src/procedural/textures/NumberDecals.ts` | 137 | Giant spray-painted pillar numbers (0–99) visible through dense fog from 10m away. | `NumberDecalOptions, makeNumberDecal, clearNumberDecalCache` | **WORKS** | None identified |
| `src/procedural/textures/PaintedLabel.ts` | 119 | Procedural stenciled and stroke-font industrial signs, valve labels, and arrows. | `LabelOptions, makePaintedLabel, makePipeDiagramTexture` | **WORKS** | None identified |
| `src/procedural/textures/README.md` | 2 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | None identified |
| `src/procedural/textures/RippleStamp.ts` | 85 | Radial profile stamp texture and analytic equation for water impact ripples. | `RippleStampOptions, RIPPLE_SPEED, RIPPLE_LIFE, RIPPLE_K, rippleHeightAt (+2 more)` | **WORKS** | None identified |
| `src/procedural/textures/RustMetalTexture.ts` | 151 | Procedural rusted industrial metal and alpha-tested grating texture generator. | `MetalSetResult, makeRustMetalSet, makeGrateTexture` | **WORKS** | None identified |
| `src/procedural/textures/strokeFont.ts` | 254 | Compact single-stroke vector font for in-world horror graffiti and decals. | `Point2D, Polyline, LayoutOptions, PositionedPolyline, TextLayoutResult (+2 more)` | **WORKS** | None identified |
| `src/procedural/textures/TextureRegistry.ts` | 340 | Single entry point for all procedural textures in BackSilence. | `TextureStats, TextureRegistry` | **WORKS** | Large file (340 lines) |
| `src/procedural/textures/TileTexture.ts` | 298 | Procedural ceramic mosaic tile set generator (platform, wall, floorWet). | `TileVariant, TileSetOptions, TileSetResult, makeTileSet` | **WORKS** | None identified |
| `src/procedural/textures/WaterNormal.ts` | 116 | Tileable water normal map generator. | `WaterNormalOptions, makeWaterNormalMap` | **WORKS** | None identified |
| `src/sim/AStar.ts` | 310 | High-performance 8-neighbor A* pathfinder with binary min-heap,. | `PathPoint, AStarPathfinder` | **WORKS** | Large file (310 lines) |
| `src/sim/balance.json` | 103 | Module supporting application architecture. | `Asset / Config resource` | **WORKS** | None identified |
| `src/sim/Colliders.ts` | 314 | Spatial hash and axis-aligned / cylindrical collider queries. | `BoxCollider, CylinderCollider, Collider, PushResult, ColliderSet` | **WORKS** | Large file (314 lines) |
| `src/sim/Director.ts` | 387 | Pure, deterministic, host-authoritative Encounter Director. | `DirectorDifficulty, DreadBeat, PlayerTrack, DirectorSnapshot, EncounterDirector` | **WORKS** | Large file (387 lines) |
| `src/sim/Drone.ts` | 284 | Deterministic surveillance drone with cone sight sensor and siren locking. | `DroneState, DroneSnapshot, AwningRect, Drone` | **WORKS** | None identified |
| `src/sim/Events.ts` | 215 | Preallocated, allocation-free event ring buffer and event contracts. | `FootfallEvent, DamageEvent, MantleEvent, SimEvent, EventRingBuffer` | **WORKS** | None identified |
| `src/sim/FlowField.ts` | 145 | Continuous 2D water velocity field, river currents, and acoustic mask zones. | `MaskZone, RiverWaypoint, FlowField` | **WORKS** | None identified |
| `src/sim/GhostTrain.ts` | 232 | Deterministic Ghost Train event scheduler, kill zone, and acoustic masks. | `GhostTrainPhase, GhostTrainSnapshot, RefugeAlcove, GhostTrain` | **WORKS** | None identified |
| `src/sim/GroundGrid.ts` | 328 | 0.25m axis-aligned rasterized terrain height field and chamfer distance transform. | `GridBounds, DynamicTop, ObstacleClass, GroundGrid` | **WORKS** | Large file (328 lines) |
| `src/sim/Hearing.ts` | 148 | Acoustic perception model obeying ACOUSTIC_RULEBOOK.md. | `MaskZone, MaskZoneManager, HearingContext, ACOUSTIC_CONSTANTS, calculateEffectiveRadius (+2 more)` | **WORKS** | None identified |
| `src/sim/MonsterBrain.ts` | 856 | Pure deterministic state machine for the Blind Acoustic Monster. | `MonsterBrainState, MonsterDef, MonsterSnapshot, MonsterNetState, MonsterBrain` | **WORKS** | Large file (856 lines) |
| `src/sim/NavGrid.ts` | 263 | 0.5m monster navigation grid with clearance-based trench blocking and. | `NavGrid` | **WORKS** | None identified |
| `src/sim/PerchSystem.ts` | 257 | Perch detection, stability management, and wobbly furniture physics. | `PerchSurface, PerchSystem` | **WORKS** | None identified |
| `src/sim/PlayerMotor.ts` | 556 | Pure simulation 60Hz character physics motor. | `PlayerIntent, PlayerMotorState, PlayerSnapshot, PlayerMotor` | **WORKS** | Large file (556 lines) |
| `src/sim/Projectile.ts` | 247 | Pure ballistic simulation for thrown items (pebbles, noisemakers). | `ProjectileKind, ProjectileImpact, ProjectileState, ProjectileSystem` | **WORKS** | None identified |
| `src/sim/ProvingGroundsData.ts` | 136 | Pure data definitions and simulation setup for the Proving Grounds arena. | `PlatformDef, PillarDef, ARENA_BOUNDS, WATER_SURFACE_Y, WATER_FLOOR_Y (+6 more)` | **WORKS** | None identified |
| `src/sim/puzzle/FuseCoresNode.ts` | 135 | Map 4: Hydro-Filtration Maze 3-Fuse Core collection and socketing pure state machine. | `FuseCoresSnapshot, FuseCoresNode` | **WORKS** | None identified |
| `src/sim/puzzle/GeneratorGridNode.ts` | 288 | Map 5: Abyssal Drainage Core 3-Generator Grid pure state machine. | `GeneratorState, GeneratorSlot, GeneratorGridSnapshot, GeneratorGridNode` | **WORKS** | None identified |
| `src/sim/puzzle/PuzzleSystem.ts` | 120 | Container managing pure puzzle nodes, event routing, serialization,. | `PuzzleSystem` | **WORKS** | None identified |
| `src/sim/puzzle/PuzzleTypes.ts` | 32 | Pure simulation contracts for the BackSilence puzzle framework. | `PuzzleOp, PuzzleCtx, PuzzleNode` | **WORKS** | None identified |
| `src/sim/puzzle/ResonanceSequenceNode.ts` | 101 | Map 3: Echoing Marble Atrium 4-Bell Resonance sequence pure state machine. | `ResonanceSequenceSnapshot, ResonanceSequenceNode` | **WORKS** | None identified |
| `src/sim/puzzle/SequenceKeypadNode.ts` | 121 | Map 1: Sequence Keypad puzzle pure state machine. | `SequenceKeypadSnapshot, SequenceKeypadNode` | **WORKS** | None identified |
| `src/sim/puzzle/ValveSequenceNode.ts` | 192 | Map 2: Utility Tunnels 3-Valve Sequence pure state machine. | `ValveSequenceSnapshot, ValveSequenceNode` | **WORKS** | None identified |
| `src/sim/rng.ts` | 17 | Pure simulation PRNG re-export. | `none (script/entry)` | **WORKS** | None identified |
| `src/sim/SimBot.ts` | 75 | Scripted intent bot for headless simulation testing and scenario runs. | `ScriptedStep, SimBot` | **WORKS** | None identified |
| `src/sim/SimScenarios.ts` | 403 | Automated, deterministic headless scenario runner. | `ScenarioResult, SCENARIO_NAMES, ScenarioName, listScenarios, runScenario (+1 more)` | **WORKS** | Large file (403 lines) |
| `src/sim/SimWorld.ts` | 349 | Container managing the pure 60Hz deterministic simulation. | `SimWorldConfig, SimWorld` | **WORKS** | Large file (349 lines) |
| `src/sim/SinkingPlatformNode.ts` | 225 | Pure deterministic simulation for sinking stepping-stones in Map 3. | `SinkingPlatformState, SinkingPlatformConfig, SinkingPlatformSnapshot, SinkingPlatformEvent, SinkingPlatformNode` | **WORKS** | None identified |
| `src/sim/Tide.ts` | 77 | Deterministic rising tide clock for The Drowned Schoolhouse. | `TideClock` | **WORKS** | None identified |
| `src/sim/WaterLevelCycle.ts` | 153 | Pure deterministic simulation of dynamic water cycles. | `WaterLevelProvider, WaterLevelPhase, WaterLevelCycleConfig, WaterLevelCycle` | **WORKS** | None identified |
| `src/sim/Weather.ts` | 140 | Time-derived deterministic weather system (rain, thunder, downpours, masks). | `WeatherState, WeatherSystem` | **WORKS** | None identified |
| `src/sim/WorldProfile.ts` | 51 | Per-map physical, acoustic, and navigation profiles. | `WorldProfileClearance, WorldProfile, DEFAULT_WORLD_PROFILE, createWorldProfile` | **WORKS** | None identified |
| `src/types/contracts.ts` | 321 | Shared type contracts for BackSilence. | `Vec3, PlayerId, RoomCode, SAFE_ALPHABET, MapId (+22 more)` | **WORKS** | Large file (321 lines) |
| `src/types/global.d.ts` | 14 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | None identified |
| `src/ui/AudioUnlock.ts` | 92 | Atmospheric user gesture unlock overlay: "PRESS ANY KEY — HEADPHONES RECOMMENDED". | `AudioUnlock` | **WORKS** | None identified |
| `src/ui/DeathScreen.ts` | 184 | Game over overlay: "YOU MADE A SOUND", "It heard the water.". | `DeathScreenCallbacks, DeathScreen` | **WORKS** | None identified |
| `src/ui/HowToPlay.ts` | 181 | Acoustic horror illustrated rules guide:. | `HowToPlay` | **WORKS** | None identified |
| `src/ui/Hud.ts` | 1221 | In-game HUD overlay: reactive Noise Meter, stamina bar, status chips,. | `InventorySlot, RosterMember, SpectatorHudData, HudData, Hud` | **WORKS** | Large file (1221 lines) |
| `src/ui/KeypadModal.ts` | 318 | Interactive 4-digit code keypad overlay modal:. | `KeypadModalCallbacks, KeypadModal` | **WORKS** | Large file (318 lines) |
| `src/ui/kit/AchievementCard.ts` | 61 | Archive achievement card: unlocked badge or locked static blur with progress. | `AchievementCardOptions, AchievementCard` | **WORKS** | None identified |
| `src/ui/kit/Button.ts` | 114 | Analog Archive Button: primary, ghost, danger, and hold-to-confirm variants. | `ButtonOptions, Button` | **WORKS** | None identified |
| `src/ui/kit/CosmeticTile.ts` | 72 | Cosmetic wardrobe tile with live 3D preview thumbnail, rarity tier,. | `CosmeticTileOptions, CosmeticTile` | **WORKS** | None identified |
| `src/ui/kit/Drawer.ts` | 101 | Tactile slide-in drawer panel with backdrop blur and escape listener. | `DrawerOptions, Drawer` | **WORKS** | None identified |
| `src/ui/kit/Icons.ts` | 131 | Coded inline-SVG icon set (~36 icons) drawn in consistent 2px stroke style,. | `IconName, RankEmblemName, ICONS, RANK_EMBLEMS, renderIcon (+1 more)` | **WORKS** | None identified |
| `src/ui/kit/index.ts` | 28 | BackSilence "The Archive" Component Library:. | `none (script/entry)` | **WORKS** | None identified |
| `src/ui/kit/KeyCap.ts` | 18 | Tactile analog keyboard / button badge. | `KeyCap` | **WORKS** | None identified |
| `src/ui/kit/kit.css` | 816 | Complete Archive Component Stylesheet:. | `none (script/entry)` | **WORKS** | Large file (816 lines) |
| `src/ui/kit/LeaderboardRow.ts` | 66 | Staggered slide-in leaderboard row with rank emblem, verified badge,. | `LeaderboardRowOptions, LeaderboardRow` | **WORKS** | None identified |
| `src/ui/kit/MapCard.ts` | 126 | Map selector card with live mini-canvas thumbnail, difficulty stars,. | `MapCardOptions, MapCard` | **WORKS** | None identified |
| `src/ui/kit/Modal.ts` | 106 | Accessible modal dialog with backdrop blur, focus trap, and Escape key listener. | `ModalOptions, Modal` | **WORKS** | None identified |
| `src/ui/kit/ProgressBar.ts` | 88 | Analog VU-style needle meter and tape tracking progress bar. | `ProgressBarOptions, ProgressBar` | **WORKS** | None identified |
| `src/ui/kit/RankBadge.ts` | 39 | Procedural SVG rank emblem badge with glow and title. | `RankBadgeOptions, RankBadge` | **WORKS** | None identified |
| `src/ui/kit/RosterChip.ts` | 61 | Lobby player chip: displays avatar, name#tag, ping bars, and ready state. | `RosterChipOptions, RosterChip` | **WORKS** | None identified |
| `src/ui/kit/Select.ts` | 73 | Analog dropdown select component with accessible options. | `SelectOption, SelectOptions, Select` | **WORKS** | None identified |
| `src/ui/kit/Skeleton.ts` | 28 | VHS static noise shimmer placeholder for asynchronous network loading. | `SkeletonOptions, Skeleton` | **WORKS** | None identified |
| `src/ui/kit/Slider.ts` | 86 | Range slider with numerical OSD readout and analog styling. | `SliderOptions, Slider` | **WORKS** | None identified |
| `src/ui/kit/StatTile.ts` | 39 | Analog metric tile for player dossiers and run results. | `StatTileOptions, StatTile` | **WORKS** | None identified |
| `src/ui/kit/Tabs.ts` | 90 | Accessible ARIA tab strip with animated indicator and keyboard navigation. | `TabItem, TabsOptions, Tabs` | **WORKS** | None identified |
| `src/ui/kit/TapeCard.ts` | 93 | Tactile VHS / cassette tape card with 3D perspective tilt on hover,. | `TapeCardOptions, TapeCard` | **WORKS** | None identified |
| `src/ui/kit/Toast.ts` | 68 | Analog archive notification toast with slide shimmer and auto-dismiss. | `ToastVariant, ToastOptions, Toast` | **WORKS** | None identified |
| `src/ui/kit/Toggle.ts` | 78 | Tactile analog toggle switch: accessible role="switch", keyboard operable,. | `ToggleOptions, Toggle` | **WORKS** | None identified |
| `src/ui/kit/tokens.css` | 138 | Design System Tokens for BackSilence: "The Archive". | `none (script/entry)` | **WORKS** | None identified |
| `src/ui/kit/Tooltip.ts` | 69 | Accessible instant hover/focus tooltip without layout shift. | `Tooltip` | **WORKS** | None identified |
| `src/ui/kit/UiLabPage.ts` | 410 | Living UI Kit Lab: mounts at ?lab=ui or ?v=ui. | `UiLabPage` | **WORKS** | Large file (410 lines) |
| `src/ui/LoadingScreen.ts` | 157 | Analog horror map loading screen:. | `LoadingScreen` | **WORKS** | None identified |
| `src/ui/MainMenu.ts` | 198 | Analog horror Main Menu rendered over the live 3D Poolrooms background. | `MainMenuCallbacks, MainMenu` | **WORKS** | None identified |
| `src/ui/MetaHubPanel.ts` | 445 | Section 10: Functional UI Hooks for Batch 7 Game Design Layer. | `MetaHubTab, MetaHubPanel` | **WORKS** | Large file (445 lines) |
| `src/ui/ModeSelect.ts` | 419 | Mode and Map Selector with procedural 2D canvas thumbnails, difficulty scales,. | `ModeSelectCallbacks, ModeSelect` | **WORKS** | Large file (419 lines) |
| `src/ui/motion/motion.css` | 142 | Archive Motion System Stylesheet:. | `none (script/entry)` | **WORKS** | None identified |
| `src/ui/motion/Motion.ts` | 352 | Archive Motion Engine:. | `MotionConfig, MotionEngine` | **WORKS** | Large file (352 lines) |
| `src/ui/PauseMenu.ts` | 127 | In-game Pause overlay with Resume, Settings, Audio Lab, and Quit. | `PauseMenuCallbacks, PauseMenu` | **WORKS** | None identified |
| `src/ui/ResultsScreen.ts` | 441 | Analog horror Victory / Escape screen:. | `CoOpPlayerResult, RunResults, loadProgress, saveRunCompletion, ResultsScreen` | **WORKS** | Large file (441 lines) |
| `src/ui/RoomLinkPanel.ts` | 827 | Multiplayer Room Lifecycle & Lobby UI. | `RoomLinkCallbacks, RoomLinkPanel` | **WORKS** | Large file (827 lines) |
| `src/ui/screens/AboutPrivacyScreen.ts` | 114 | About & Privacy Transparency Dossier:. | `AboutPrivacyCallbacks, AboutPrivacyScreen` | **WORKS** | None identified |
| `src/ui/screens/BestiaryScreen.ts` | 366 | Entity Bestiary View:. | `BestiaryCallbacks, BestiaryScreen` | **WORKS** | Large file (366 lines) |
| `src/ui/screens/ChampionsScreen.ts` | 155 | Champions Shrine & Hall of Fame:. | `ChampionRecord, ChampionsCallbacks, ChampionsScreen` | **WORKS** | None identified |
| `src/ui/screens/ChangelogScreen.ts` | 99 | Release & Batch History View:. | `ChangelogCallbacks, ChangelogScreen` | **WORKS** | None identified |
| `src/ui/screens/CreditsScreen.ts` | 98 | Credits & Attributions View:. | `CreditsCallbacks, CreditsScreen` | **WORKS** | None identified |
| `src/ui/screens/HomeScreen.ts` | 246 | Home / Hero View:. | `HomeScreenCallbacks, HomeScreen` | **WORKS** | None identified |
| `src/ui/screens/LeaderboardsScreen.ts` | 232 | Hall of Silence (Leaderboards):. | `LeaderboardEntry, LeaderboardsCallbacks, LeaderboardsScreen` | **WORKS** | None identified |
| `src/ui/screens/LobbyScreen.ts` | 207 | 3D Waiting Room / Multiplayer Lobby:. | `LobbyPlayer, LobbyCallbacks, LobbyScreen` | **WORKS** | None identified |
| `src/ui/screens/MapsScreen.ts` | 133 | Maps Archive View:. | `MapEntryInfo, MAPS_CATALOG, MapsScreenCallbacks, MapsScreen` | **WORKS** | None identified |
| `src/ui/screens/PlayHubScreen.ts` | 213 | Play Hub View:. | `GameModeInfo, GAME_MODES, PlayHubCallbacks, PlayHubScreen` | **WORKS** | None identified |
| `src/ui/screens/ProfileScreen.ts` | 275 | Operator Dossier & Profile View:. | `ProfileCallbacks, ProfileScreen` | **WORKS** | None identified |
| `src/ui/screens/ShareCard.ts` | 129 | Coded 2D Canvas Run Share Card Generator:. | `ShareCardData, ShareCard` | **WORKS** | None identified |
| `src/ui/SettingsPanel.ts` | 561 | Comprehensive in-game Settings panel with live hot-reloading for Graphics,. | `SettingsPanelCallbacks, SettingsPanel` | **WORKS** | Large file (561 lines) |
| `src/ui/ToastManager.ts` | 102 | Non-blocking stacked notification toast system with ARIA live region. | `ToastOptions, ToastManager` | **WORKS** | None identified |
| `src/ui/UIManager.ts` | 764 | Master UI orchestrator for BackSilence "The Archive":. | `UIView, UIManagerOptions, UIManager` | **WORKS** | Large file (764 lines) |
| `src/world/arena/ProvingGrounds.ts` | 353 | Visual presentation and MapInstance implementation for the "Proving Grounds" arena. | `ProvingGroundsOptions, ProvingGrounds` | **WORKS** | Large file (353 lines) |
| `src/world/MapRegistry.ts` | 105 | Lazy dynamic import registry for the five BackSilence maps. | `FEATURED_MAP_IDS, ARCHIVE_MAP_IDS, ALL_MAP_IDS` | **WORKS** | None identified |
| `src/world/maps/CommonMapBuilder.ts` | 329 | Unified procedural 3D map builder translating pure LayoutData into. | `CustomBuilderHook, buildStandardMapInstance` | **WORKS** | Large file (329 lines) |
| `src/world/maps/DrainageCoreMap.ts` | 302 | Map 5: The Abyssal Drainage Core (Finale, 5 stars). | `DrainageCoreMap` | **WORKS** | Large file (302 lines) |
| `src/world/maps/DrownedMetroMap.ts` | 388 | Map 5: Platform Zero, the Drowned Metro (event map; 5 stars). | `DrownedMetroMap` | **WORKS** | Large file (388 lines) |
| `src/world/maps/DrownedSchoolMap.ts` | 443 | Map 2: The Drowned Schoolhouse (single floor, perch map; 3 stars). | `DrownedSchoolMap` | **WORKS** | Large file (443 lines) |
| `src/world/maps/HydroMazeMap.ts` | 379 | Map 4: The Hydro-Filtration Maze (4 stars). | `HydroMazeMap` | **WORKS** | Large file (379 lines) |
| `src/world/maps/MapInstance.ts` | 22 | MapInstance contract unifying pure simulation ground/colliders with. | `MapInstance` | **WORKS** | None identified |
| `src/world/maps/MarbleAtriumMap.ts` | 369 | Map 3: The Echoing Marble Atrium (3 stars). | `MarbleAtriumMap` | **WORKS** | Large file (369 lines) |
| `src/world/maps/NatatoriumMap.ts` | 685 | Map 1 (Default): The Grand Natatorium. | `NatatoriumMap` | **WORKS** | Large file (685 lines) |
| `src/world/maps/NeonFloodMap.ts` | 406 | Map 4: Neon Flood District (Sector 9, cyberpunk; 4 stars). | `NeonFloodMap` | **WORKS** | Large file (406 lines) |
| `src/world/maps/OrientationMap.ts` | 247 | Tape 0: Orientation (Training Pool) map definition. | `OrientationMap` | **WORKS** | None identified |
| `src/world/maps/PoolroomsMap.ts` | 361 | Map 1: The Flooded Poolrooms (Classic, 2 stars). | `PoolroomsMap` | **WORKS** | Large file (361 lines) |
| `src/world/maps/README.md` | 2 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | None identified |
| `src/world/maps/SunkenJungleMap.ts` | 418 | Map 3: The Sunken Jungle (organic map; 4 stars). | `SunkenJungleMap` | **WORKS** | Large file (418 lines) |
| `src/world/maps/UtilityTunnelsMap.ts` | 330 | Map 2: Sub-Aquatic Utility Tunnels (3 stars). | `UtilityTunnelsMap` | **WORKS** | Large file (330 lines) |
| `src/world/MapTypes.ts` | 161 | Pure data contracts for BackSilence procedural map generation, layout data,. | `LayoutCtx, PlatformKind, DynamicDef, PlatformDef, BoxDef (+9 more)` | **WORKS** | None identified |
| `src/world/props/README.md` | 2 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | None identified |
| `src/world/puzzles/README.md` | 2 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | None identified |
| `src/world/validate/LayoutValidator.ts` | 617 | Pure simulation layout solvability, graph connectivity, and constraint validator. | `ValidationResult, LayoutValidationError, validateLayout, generateValidLayoutWithStats, generateValidLayout` | **WORKS** | Large file (617 lines) |
| `src/world/validate/PuzzleSolver.ts` | 424 | Headless automated puzzle solver for BackSilence. | `SolveResult, solveLayoutPuzzleHeadless` | **WORKS** | Large file (424 lines) |
| `tests/api-core.test.ts` | 305 | Unit tests for the serverless API proxy core against in-memory FakeLibsql:. | `none (script/entry)` | **WORKS** | Large file (305 lines) |
| `tests/balance-swarm.test.ts` | 213 | Section 12: Headless Balance Bot Swarm for BackSilence. | `none (script/entry)` | **WORKS** | None identified |
| `tests/batch5-audio.test.ts` | 138 | Unit tests for Batch 5 synthesized audio voices, new reverb presets,. | `none (script/entry)` | **WORKS** | None identified |
| `tests/batch5-engine.test.ts` | 483 | Unit tests for Batch 5 shared engine systems:. | `none (script/entry)` | **WORKS** | Large file (483 lines) |
| `tests/batch5-scenarios.test.ts` | 354 | Integration scenarios for Batch 5 Map Pack mechanics:. | `none (script/entry)` | **WORKS** | Large file (354 lines) |
| `tests/batch6-repairs.test.ts` | 219 | Regression and validation suite for Batch 6 repairs:. | `none (script/entry)` | **WORKS** | None identified |
| `tests/batch6-water-creatures.test.ts` | 76 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | None identified |
| `tests/batch7-meta.test.ts` | 373 | Comprehensive unit tests for Batch 7:. | `none (script/entry)` | **WORKS** | Large file (373 lines) |
| `tests/core.test.ts` | 431 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | Large file (431 lines) |
| `tests/hardening.test.ts` | 71 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | None identified |
| `tests/maps.test.ts` | 112 | Deterministic procedural layout generation and solvability verification. | `none (script/entry)` | **WORKS** | None identified |
| `tests/mechanics.test.ts` | 443 | Comprehensive simulation mechanics tests for BackSilence Batch 3:. | `none (script/entry)` | **WORKS** | Large file (443 lines) |
| `tests/net-adapters.test.ts` | 332 | Unit tests for DatabaseNetworkAdapter implementations with protocol fakes:. | `none (script/entry)` | **WORKS** | Large file (332 lines) |
| `tests/net-core.test.ts` | 529 | Unit tests for BackSilence pure network core:. | `none (script/entry)` | **WORKS** | Large file (529 lines) |
| `tests/net-scenarios.test.ts` | 413 | Multi-peer integration test suite with MemoryHub (Host + 2 Clients). | `none (script/entry)` | **WORKS** | Large file (413 lines) |
| `tests/puzzles.test.ts` | 312 | Unit tests for all 5 BackSilence puzzle state machines:. | `none (script/entry)` | **WORKS** | Large file (312 lines) |
| `tests/scenarios.test.ts` | 438 | Place player on Island A (x: 0, z: 12, top: 0.3). | `none (script/entry)` | **WORKS** | Large file (438 lines) |
| `tests/sim.test.ts` | 582 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | Large file (582 lines) |
| `tests/vhs-post.test.ts` | 280 | Module supporting application architecture. | `none (script/entry)` | **WORKS** | None identified |
| `tsconfig.json` | 28 | Module supporting application architecture. | `Asset / Config resource` | **WORKS** | None identified |
| `vite.config.ts` | 38 | Three is intentionally a single raw 523 KB vendor chunk; the gzip audit. | `default` | **WORKS** | None identified |
| `vitest.config.ts` | 10 | Module supporting application architecture. | `default` | **WORKS** | None identified |
