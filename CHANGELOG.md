# BackSilence — Changelog & Milestone Release History

All notable changes to the **BackSilence** project are documented here.
This project follows strict deterministic, zero-external-binary-asset design principles with pure WebGL2/Three.js rendering and Web Audio synthesis.

---

## [v2.1.0] — 2026-11-08 (Release: A Gate That Blocks, Evidence You Can Trust, and an Honest Ledger — Prompt 10 / Decision D138)

### ⚖️ What Changed
- **Unforgiving Fatal Release Gate Suite:** Expanded `npm run verify` to sequentially run all 21 verification gates with zero swallowed exit codes. Updated `scripts/gates/summary.mjs` to derive gate status from child reported failure counts, outputting `FAIL (N failures)` and exiting non-zero whenever any child fails.
- **Cryptographic Reference-Pack Integrity Verification:** Added `scripts/audit/reference-integrity.mjs`, asserting that every JSON file under `reference/` recording a `manifestHash` strictly matches the canonical manifest hash `94e00f1eff14c185906da61201cc3044cc50454ea812590c7ce853e82aeec772`. Integrated check into `scripts/reference/verify-reference.mjs` and `npm run audit`. Added `tests/reference-integrity.test.ts`.
- **Machine-Checked Documentation Truth Gate:** Upgraded `scripts/audit/docs-truth.mjs` to fatal status, machine-verifying all numeric claims in `README.md`, `CHANGELOG.md`, `HANDOFF.md`, `KNOWN_ISSUES.md`, `KNOWN_LIMITATIONS.md`, and `BALANCE_REPORT.md` (1,108 tests across 134 files, S1–S8 smoke scenarios, 11 maps across 3 architectural families, 37 reference frames, and gzip budgets).
- **Honest Review Pack & Verdict Integrity:** Maintained machine-evaluated ground truth in `reports/release/BETTER_THAN_VIDEO.md` with explicit SSIM and region deltas on all 37 reference pairings (0 EXCEEDS, 1 MATCH, 36 FAIL). Extended `audit:reports-honesty` and `audit:verdict-honesty` across `reports/release/`, `reports/glitch/`, `reports/graphics/`, and `reports/world/`.
- **Honest Limitations Ledger:** Completely rewrote `reports/release/KNOWN_LIMITATIONS.md` to classify every entry as an engine truth with measured consequences or an open defect in the register. Documented what is still approximate in plain language with measured metrics.
- **Production Handover & Decision Log:** Produced comprehensive `HANDOFF.md` architecture map with `file:line` entry points, gate catalogue, map family assignments, creature/acoustic contracts, and next 3 priorities. Recorded Decision D138 and retroactively corrected misleading historical claims in Decision D116.

### 🛑 What Did Not Change
- **Perceptual Reference Parity Gap:** Real-time procedural WebGL2 rendering does not achieve 1:1 pixel equivalence with 1080p pre-rendered video footage from *The Infinite Shift: Backrooms* (36 of 37 pairings remain FAIL in `reference_comparison.json`, with mean SSIM $0.542$ and framing color deltas $\Delta\text{RGB} \approx 0.05\text{--}0.18$).
- **Screen-Space God Ray Frustum Limit:** Volumetric god rays remain evaluated in screen space from visible ceiling apertures; off-screen apertures do not wrap light beams around occluders when looking $> 45^\circ$ away.
- **Analytic Wave Superposition:** Water ripples remain an analytic superposition of 4 trochoidal sinusoids and radial ellipse quads; full 2D Navier–Stokes shallow-water heightfield fluid simulation remains a future milestone task.
- **Procedural Creature Skin:** Wader creature skin remains procedural Canvas-generated normal maps rather than scanned organic seed-pod meshes.
- **Architectural Family Variants:** 6 of the 11 sectors (`utility` and `derelict` families) remain industrial and neoclassical variants that intentionally diverge from the reference video natatorium tile corridor.

### 📉 What Got Worse
- **Release Gating Now Formally Blocks:** Gating is no longer toothless; `npm run gates:summary` now halts CI/CD by honestly reporting `FAIL (103 failures)` over reference comparison deltas rather than printing fabricated pass banners.
- **Highlight Compression:** Filmic highlight shoulder roll-off clamps highlights at $\le 0.965$ to eliminate specular blowout, resulting in warm cream highlights rather than pure brilliant white reflections in high-exposure daylight skylights.
- **Lower-Tier Motion Blur Sampling:** Velocity motion blur sampling on Medium (3 taps) and Low (2 taps) was constrained to guarantee the 60 FPS performance floor, causing rapid camera whip turns ($\ge 720^\circ/\text{s}$) to exhibit discrete temporal stepping on lower-end devices.

---

## [v2.1.0-rc1] — 2026-11-05 (The Better-Than-Video Ship Gate & Engineering Perfection)

### 🌊 Player-Visible Evolutions & Content Systems
- **Visual Glitch Census Burndown & Rebuilt Artifact Detector (Prompt 9 — Decision D137):**
  - Rebuilt `scripts/visual/artifact-detector.mjs` to comprehensively scan 10 visual defect classes per frame: aliasing, specular blowout, black voids, debug text leaks, flatness, z-fighting, hard fog seams, visible water edges, untextured primitives, and HUD overlap.
  - Added 24 unit test fixtures in `tests/artifact-detector.test.ts` verifying positive detection on corrupted frames and clean pass on production frames.
  - Closed all 65 aliasing defects via distance-based tile grid dissolve (10–25m) to flat cream (`#c8b580`), normal map attenuation (85%), far-field roughness stabilization (0.32), tiered anisotropy (16/4/1), and multisampled composer render targets (MSAA 8x High, 4x Medium, FXAA Low).
  - Closed all 41 specular blowout defects via wet ceramic roughness floor raised to 0.22, ripple rim specular tuning, and a filmic highlight roll-off shoulder capping highlights at $\le 0.965$ while preserving the reference 0.86 pale-mint fog horizon.
  - Closed all 151 tracked defects in `reports/glitch/CENSUS.md` and `reports/glitch/REGISTER.md` (**0 OPEN P0, 0 OPEN P1, 0 OPEN P2, 0 OPEN P3**).
  - Added Rule §8 to `reports/POLICY.md` mandating defect registration, root cause, fix, and regression test.
  - Produced `reports/glitch/regression_capture.md` documenting the 90-second comparative reel and 60 FPS performance before/after table.
- **Measured Look & Calibration (Prompts 1–2):**
  - Cryptographic 37-frame reference pack (`reference/video/frames/` `f_001`–`f_037`) with SHA-256 manifest and glitch census.
  - Measured palette calibration: luminance mean 0.63, water hue $85^\circ\text{--}113^\circ$, slab hue $38^\circ\text{--}48^\circ$, soft volumetric lighting, and 0 black void pixels outside jump-scare frames.
- **Water v5: Viscous Depth & Transmittance (Prompt 3):**
  - Replaced opaque water paint with physical Beer–Lambert depth transmittance model ($\mu_a = [0.82, 0.44, 0.98]$).
  - Shallow water ($\le 0.35\text{ m}$) reveals the cracked mosaic tile floor with effective alpha 0.20–0.35.
  - Ink splashes `#1e1a14`, footfall-only white foam `#e8f2e6` (0.32m, 0.38s decay), pale-green specular `#7b9e5e`, and zero ambient crest foam.
- **Canonical Architecture across All 11 Maps (Prompt 4):**
  - Unified vaulted cream ceiling (`VaultBuilder.ts`), grand archways, low thin tan slabs with bullnose tile edge ($0.3\text{ m}$ elevation), and clean 10–15m sighting lanes across all 11 maps.
- **Architecture, Vault & Props (Prompt 3):**
  - Rebuilt `VaultBuilder.ts` with continuous inward-facing segmental/barrel curvature, integrated shallow cove ribs every ~4m, and cream vertex coloring (`#b7a775`), eliminating ceiling blade artifacts.
  - Purged detached parabolic rib fins from `MapLevelArtPass.ts` overhead and padding batches.
  - Procedural hand-painted tagline mural (`"IT CAN'T SEE YOU. IT HEARS THE WATER."`) in `GraffitiDecals.ts` using `strokeFont.ts` and `drawMarker` with hand-drawn underlines and water droplet crown splash motif.
  - Replaced generator crank and status light with designed metal and indicator bezel props.
  - Oriented numeral '2' on `pil_dry_room_2` to face $+Z$ for 8–10m legibility at $\ge 24\text{px}$ projected height.
  - Added `tests/tagline-wall.test.ts`, `tests/no-untextured-props.test.ts`, extended `tests/no-void.test.ts` to 11 maps, and created `scripts/world/depth-layer-audit.mjs`.
- **Recessed Ceramic Grout, Occlusion, Wet Band, and Decay (Prompt 4 — Decision D132):**
  - Built procedural 5-channel PBR texture sets (`albedo`, `normal`, `roughness`, `ao`, `height`) with zero binary assets.
  - Height field models 1.2mm recessed grout channels at 0.15m scale, $C^1$ cubic hermite micro-bevels (resolving aliasing defect C5), hairline tile cracks, and chipped corners (~4% rate).
  - Derived normals and self-shadowing ambient occlusion via finite difference analysis; tempered clearcoat to 0.30 / 0.28 resolving specular blowout (defect C6).
  - Implemented baked vertex ambient occlusion (`bakeVertexAO`, `bakeJunctionContactAO`) with $\ge 12\%$ contact darkening along slab bases, wall/floor junctions, and pillar feet.
  - Enabled screen-space ambient occlusion (`SSAOPass`) on Medium and High tiers in `PostFX`.
  - Implemented dynamic wet band with irregular sinusoidal tidemark ($0.0 \le \Delta Y \le 0.25\text{ m}$) driven by `globalWaterLevelUniform` (18% luminance drop at 3m down to ~10% at 20m), thin bright specular meniscus contact at $|\Delta Y| < 0.012\text{ m}$, and roughness lowering to 0.12.
  - Added `tests/ao-presence.test.ts`, `tests/wet-band.test.ts`, and extended `tests/tile-pitch.test.ts` (1030 tests across 120 files, 100% passing).
- **Continuous Anatomical Creature Rebuild, Grounded Locomotion Waterline, and World Lighting (Prompt 5 — Decision D133):**
  - Rebuilt creature as continuous organic anatomy (`ProceduralSkinnedMeshBuilder.ts`, `MonsterRig.ts`) mapping gaunt ribcage, sunken starved abdomen, rounded seed-pod head with 32 recessed pits and small dark mouth, long forelimbs (1.35m) with 4 curved sickle talons, clavicle/pelvic bridging musculature, digitigrade haunches with Achilles cord, and tapering tail to a 21-bone skeleton with inverse-cube distance skinning.
  - Replaced artificial torso elevation with pure locomotion-driven ground tracking (`targetBaseRootY = groundY`); at pool depth (-0.42m), waterline intersects torso ($y \in [-0.15, +0.65\text{ m}]$), hands are submerged, shoulders are clear, and submerged fraction scales proportionally across water depths.
  - Integrated into world lighting rig with directional key sun (`#fff5e4`), upward olive water bounce (`#5a8c50`), and scene fog (`#c5d4be`, 0.045); zero emissive rim shortcuts; shadow casting and receiving enabled on skinned mesh.
  - Added `tests/creature-silhouette-integrity.test.ts` (1 connected component, zero detached shards >5cm), `tests/creature-lighting-integration.test.ts` (world illumination, luminance in $[0.15, 0.65]$, min luminance $\ge 0.055$), extended `tests/monster-waterline.test.ts`, and verified `scripts/creature/appearance-lock.mjs` (1036 tests across 122 files, 100% passing).
- **The Sound-First Encounter Arc & Blind Hunter Realism (Prompt 6 — Decision D134):**
  - **Optical Blindness Proven:** Verified through static AST/text inspection of `MonsterBrain.ts` and `MonsterAI.ts` (0 raycasts, 0 cameras, 0 frustum tests) and a 60s runtime control where a silent player in front of the creature is never approached or attacked (`tests/monster-blindness.test.ts`).
  - **Nav-Level Trench Blocking Guarantee:** Enforced `TRENCH_BLOCK_WIDTH = 2.4m` and `TRENCH_BLOCK_CLEARANCE = 1.2m` invariant floor in `NavGrid.ts`. Verified boundary exactness (2.3m blocks, 2.5m crosses), 0 crossings over 30s across a 2.0m trench, and diegetic lip pacing with lateral motion $> 2.0\text{ m}$ (`tests/monster-trench-blocking.test.ts`).
  - **Readable Stalk Pacing & 10–15m Sighting Band:** Purged airborne `leap-cross` ballistic variant; creature remains permanently grounded. Constrained approach to a readable $2.2–2.6\text{ m/s}$ stalk (`SPEED_STALK = 2.4\text{ m/s}`), reserving $7.2\text{ m/s}$ exclusively for terminal lunges from $\le 4\text{ m}$. Aligned `Director.ts:422` candidate distances strictly to `[12.0, 11.5, 13.5, 10.5, 14.5, 15.0]` (`tests/monster-sighting-band.test.ts`).
  - **Procedural Glottal Roar & Ear Localisation:** Synthesised voice using 64-harmonic Rosenberg C derivative `PeriodicWave`, subharmonic period doubling ($f_0 / 2$), and 3 moving formants ($F_1: 700 \to 400\text{ Hz}$, $F_2: 1100 \to 800\text{ Hz}$, $F_3: 2400\text{ Hz}$ pharyngeal screech bite). Verified on baseline: spectral centroid $876.7\text{ Hz}$, guttural body energy $51.43\% > 50\%$ in $150–1200\text{ Hz}$, and silence-information ambient ducking. 3D spatialisation verified by footfall/wade audio passing exact $(x, y, z)$ coordinates to `PannerNode` (`tests/monster-vocalisation.test.ts`).
  - **Reference Jump-Scare Framing against `f_037`:** Low camera vantage looking up ($0.45\text{ m}$ above creature base), torso and head filling lower frame, arms wide, `#d6dccd` pale mint fog. Resolves in $\le 1.5\text{ s}$ with `PostFX.resetGlitch()` zeroing glitch buffer on death screen transition. Composited side-by-side jump-scare board (`reports/monster/jumpscare_board.png`).
  - **200-Seed × 11-Map Simulation Trace:** Verified across 200 runs on all 11 maps: first sightings in $[10.05, 14.90]\text{ m}$ (mean $12.48\text{ m}$), 0 trench crossings, and 20 verified trench-pacing events (`reports/monster/trace_summary.json`).
- **Water, Visible Ripples, Splash Vocabulary & Zero Magenta Domes (Prompt 7 — Decision D135):**
  - **Empirical Bisection of Pink/Magenta Domes:** Executed `scripts/debug/isolate-scene.mjs` across 10 scene configurations, empirically isolating `DebugBridge.ts:125` (unconditional `0xff00ff` sphere) and `MonsterProbe.ts:408` (unguarded `scene.overrideMaterial = 0xff00ff`). Hardened probe with `finally` block ensuring `scene.overrideMaterial` is restored to `null` and `unlitOverrideMat` disposed. Added guard test asserting `scene.overrideMaterial === null` outside probe render. Built zero-tolerance magenta artefact detector (`scripts/visual/magenta-artefact-detector.mjs`, `tests/magenta-artefact-detector.test.ts`), verifying 0 findings across all 48 golden baselines.
  - **Visible Ripples & Crown Splash:** Raised foam ring peak alpha from 0.015 to 0.22 (target 0.12–0.30) with age fade, achieving $\ge 3\%$ measurable luminance/color contrast against water background. Preserved 3-gap broken ellipse ripple motif matching `f_001` graffiti drawing. Restored full 7-spike `buildCrownSplashGeometry()` with rising central column and apex bead driven by live `crownMesh`.
  - **Depth-Graded Water Optics & Shadow Reception:** Implemented Beer-Lambert extinction ($\boldsymbol{\sigma} = (1.6, 0.55, 0.95)$) and depth-graded in-scatter satisfying all 5 measured targets simultaneously (shallow `#8cb179`, near-deep `#6e8949`, far `#959e69`, trench `#7da46d`, dense fog `#3e5a2c`/`#5f865a`). Deep trench optical signature emerges physically from water column thickness ($d > 1.0\text{ m}$) where floor drops out. Enabled directional & architectural shadow reception on water via `lights: true` and `getShadowMask()`. Traced full pipeline in `reports/water/palette_pathway.md`.
  - **Closed Submerged Floor Z-Fighting (Defect C4):** Applied `polygonOffset: true, factor: 1.0, units: 4.0` to `poolFloorMaterial` and `-1.0, -2.0` to `WaterMaterial`, resolving depth buffer conflict with zero scanline oscillation across Medium and Low tiers.
  - **Complete Splash Vocabulary:** Implemented and verified all 7 splash profiles in `tests/splash-vocabulary.test.ts`: crouch-wade (0.12), wade (0.35), sprint (0.75), jump/dive (1.0), mantle (0.50), pebble (0.60), and creature footfall (dark ink `#1e1a14` + white foam at feet only).
  - **Comparison Boards:** Composited `reports/water/f_018_board.png` and `reports/water/f_035_board.png` ($1856 \times 720$) side-by-side against reference footage frames `f_018.png` and `f_035.png` via `scripts/water/render-water-boards.mjs`.
- **Jump Buffering, Anti-Bounce Stability, Camera Tracking & Collision Sweeps (Prompt 8 — Decision D136):**
  - **Jump Buffering & Coyote Time:** Added `JUMP_BUFFER: 0.10` and `COYOTE_TIME: 0.15` to `Config.ts`. Fully documented jump state machine with `file:line` references for every transition in `PlayerMotor.ts`. Harmonized `WATER_GRAVITY = 14.0` with dry land gravity while preserving `WATER_JUMP_V = 5.65` for water surface breach.
  - **Bouncing Elimination:** Enumerated all 7 upward velocity mechanisms; identified and eliminated crude unprovoked $+3.8\text{ m/s}$ spring boost (`vel.y = Math.max(vel.y, 3.8)`). Restricted auto-step-up to forward movement intent (`inputLen > 0.05`) with capsule leading-edge probe and headroom clearance check. Disabled edge snapping while idle.
  - **Render-Rate Camera Tracking:** Applied mouse look deltas immediately at render rate to `PlayerMotor.applyLookDelta()`, eliminating sub-tick delta dropping; uncoupled camera orientation from `renderAlpha` tick lag, eliminating stepping and quantization on $720^\circ/\text{s}$ whip turns.
  - **Tier Parity Motion Blur:** Added `uBlurSamples` uniform to VHS shader (High: 6 samples, Medium: 3 samples) and lightweight 2-sample directional motion blur in `LowMotionBlurShader` for the Low tier `copyQuad` pass.
  - **Camera Collision Sweeps & S19 Safety:** Added collision sweeps against walls, slabs, cylinder pillars, and overhead vault ribs. Verified S19 near-plane distance ($0.05\text{ m}$) never intersects water in standing or crouched shallow water stances.
  - **Stuck-State & Traversal Sweep:** Added `tests/player-traversal.test.ts` (dry walk, shallow wade, crouch wade, dry jump, water jump, water mantle, sprint jump, 0.9m crouch clearance) and `tests/player-stuck-sweep.test.ts` (200 sampled positions across 5 maps: zero floor falling, zero stuck trapping, non-colliding graffiti planes). Preserved zero dry-tile walking noise.
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
