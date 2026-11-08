# BackSilence — Production Engineering Handover (v2.1.0-rc1)

> **Antigravity Phase 5 Handover & Architecture Map**  
> **Repository:** `github.com/me-nazat/backsilence` · **Base Commit:** `fa93751` · **Decision:** D138  
> **Stack Contract:** Three.js `0.170.0` · TypeScript Strict · Zero Binary Assets · Procedural Synthesis + Web Audio  

---

## 1. Subsystem Architecture Map & `file:line` Entry Points

BackSilence is organized into decoupled engine, simulation, procedural synthesis, and UI layers. Every subsystem has a designated entry point and contract file:

| Subsystem | Core Entry Point (`file:line`) | Description & Architecture Role | Contract File |
|:---|:---|:---|:---|
| **Boot & Lifecycle** | `src/main.ts:1` | Platform initialization, query parameter routing, early WebGL context creation | `src/types/contracts.ts` |
| **UI & Design System** | `src/ui/UIManager.ts:40` | DOM-based responsive UI, 12 CSS/WAAPI motion choreographies, living Component Kit | `src/ui/kit/tokens.ts` |
| **Engine & Renderer** | `src/engine/Renderer.ts:25` | Three.js WebGL2 renderer setup, hardware antialiasing, tier quality manager | `src/engine/QualityBenchmark.ts` |
| **Post-Processing** | `src/engine/PostFX.ts:50` | Multi-pass effect composer: screen-space god rays, camera velocity motion blur, VHS grade | `src/procedural/shaders/vhs.glsl.ts` |
| **Simulation Loop** | `src/sim/SimWorld.ts:55` | 60 Hz deterministic fixed-timestep simulation, entity registry, collision broadphase | `src/meta/SimReplayRunner.ts` |
| **Player Controller** | `src/sim/PlayerMotor.ts:60` | Fixed-point physics: jump buffering ($0.10\text{s}$), coyote time ($0.15\text{s}$), zero-bounce edge mantling | `src/app/Config.ts` |
| **Water Simulation** | `src/game/water/WaterSystem.ts:35` | Trochoidal wave superposition, Beer–Lambert depth extinction, dynamic broken-ellipse ripples | `src/game/water/WaterProfile.ts` |
| **Procedural Textures** | `src/procedural/textures/TileMaterialFactory.ts:40` | Runtime Canvas tile synthesis, recessed grout normals, ambient occlusion, distance dissolve | `src/procedural/textures/DecalPlacer.ts` |
| **Creature Anatomy** | `src/game/monster/MonsterRig.ts:20` | Procedural SkinnedMesh wader, 24 teeth, ear-fins, hunched forward kinematics, cool grey rim | `src/game/monster/CreatureProceduralSkin.ts` |
| **Monster AI & Director**| `src/sim/MonsterAI.ts:45` | Blind acoustic tracker, trench path avoidance, 6-beat directed encounter pacing | `src/sim/EncounterDirector.ts` |
| **Acoustic Physics** | `src/sim/AcousticBus.ts:30` | Medium-aware sound propagation: dry tiles ($0\text{ m}$), crouch wade ($4\text{ m}$), sprint ($16\text{ m}$) | `ACOUSTIC_RULEBOOK.md` |
| **Procedural Audio** | `src/audio/AudioEngine.ts:35` | 26 procedural Web Audio API synthesis voices, spatial binaural panning, room impulse reverb | `src/audio/ProceduralAudio.ts` |
| **World Maps** | `src/world/MapRegistry.ts:25` | Dynamic lazy loader for 11 sector maps across 3 architectural families | `src/world/SectorProgression.ts` |
| **Network & Session** | `src/net/NetworkHost.ts:30` | P2P WebRTC data channels, BroadcastChannel local tab sync, SessionStateMachine | `src/game/session/SessionStateMachine.ts` |
| **Serverless API Proxy**| `api/core/index.ts:15` | Zero-credential client architecture, Turso proxy endpoints, in-memory FakeLibsql | `api/core/TursoClient.ts` |

---

## 2. Release & Verification Gate Catalogue

The release harness contains **21 machine-checked gates**. Every gate exits non-zero on failure. The suite is verified via `npm run verify` and aggregated via `node scripts/gates/summary.mjs`:

| Gate Command | Implementation Script | What It Machine-Checks | Exit Failure Invariant |
|:---|:---|:---|:---|
| `npm run typecheck` | `tsc --noEmit` | Strict TypeScript types across `src/`, `tests/`, `api/`, and `scripts/` | $> 0$ type errors |
| `npm run lint` | `eslint .` | Code quality, zero unused variables, formatting invariants | $> 0$ lint warnings or errors |
| `npm run test` | `vitest run` | Unit & integration test suite (1,108 tests across 134 files) | $\ge 1$ failed test assertion |
| `npm run build` | `vite build` | Production rollup bundle generation into `dist/` | Vite build compiler errors |
| `npm run audit:bundle` | `node scripts/audit-bundle.mjs` | Boot chunk $\le 35\text{ KB}$ gz, core bundle $\le 500\text{ KB}$ gz, zero external assets | File size over budget or bad extensions |
| `npm run audit:rulebook-sync`| `node scripts/audit/rulebook-sync.mjs`| 8/8 noise rows in `ACOUSTIC_RULEBOOK.md` match `AcousticBus.ts` constants | Acoustic constant divergence |
| `npm run audit:appearance-lock`| `node scripts/creature/appearance-lock.mjs`| Procedural creature skin default; zero external `.glb`/`.gltf` references in git | External asset leakage in source |
| `npm run audit:no-tautology` | `node scripts/audit/no-tautology.mjs` | Tests execute real code rather than reading `src/` as text strings | Un-annotated text assertions |
| `npm run audit:claim-traceability`| `node scripts/audit/claim-traceability.mjs`| 37/37 pairings valid in `pairings.json`; 0 self-assigned report grades | Unpaired claim or fabricated grade |
| `npm run audit:reports-honesty`| `node scripts/audit/reports-honesty.mjs`| Scans all reports for forbidden subjective rubric grades ($X/5.0$, `Rating: A`) | Subjective rating string detected |
| `npm run audit:verdict-honesty`| `node scripts/audit/verdict-honesty.mjs`| Asserts every published table row has an SSIM value and matches comparator | Overstated verdict or ungrounded 0.0% row |
| `npm run audit:reference-integrity`| `node scripts/audit/reference-integrity.mjs`| Every reference JSON matches canonical manifest hash `94e00f1e...` | Manifest SHA-256 mismatch |
| `npm run audit:docs-truth` | `node scripts/audit/docs-truth.mjs` | README, CHANGELOG, HANDOFF, KNOWN_LIMITATIONS match live codebase | Numeric claim drift against tree |
| `npm run audit:sync-golden` | `node scripts/visual/sync-golden.mjs --check` | 48 shots synchronized between `shots.json`, `tests/golden/`, `reports/visual/` | Missing or orphan shot PNG |
| `npm run glitch:scan` | `node scripts/visual/artifact-detector.mjs`| Scans 48 baseline shots for 10 defect classes (aliasing, blowout, voids, leaks) | Any defect detected across shots |
| `npm run secret:scan` | `node scripts/secret-scan.mjs` | Scans workspace and git history for high-entropy API tokens / credentials | Token pattern match in tree |
| `npm run i18n:check` | `node scripts/i18n/check.mjs` | 15 locales with 100% key parity (121/121 keys) including RTL and CJK | Missing key or locale divergence |
| `npm run reference:verify` | `node scripts/reference/verify-reference.mjs`| Decodes 37 PNGs; verifies SHA-256 byte hashes and reference WAV audio | Corrupt PNG or altered reference frame |
| `npm run reference:compare`| `node scripts/reference/compare.mjs` | Honest per-frame perceptual comparison against 37 reference video frames | Machine-evaluated gating failures |
| `npm run shots:check` | `node scripts/visual/compare.mjs --check` | 48 golden baseline shots match within $\text{SSIM} \ge 0.97$ and $\text{MAE} \le 0.01$ | Visual regression against golden |
| `npm run gates:play` | `node scripts/gates/play.mjs` | 5-minute automated Natatorium playthrough: sighting pacing, trench, simHash | Any invariant failure or console error |
| `npm run audio:compare` | `node scripts/audio/compare.mjs` | Procedural Web Audio synthesis evaluated against reference audio targets | Audio spectral envelope breach |

---

## 3. The 11-Sector Map Catalogue & Architectural Families

BackSilence structures its procedural world into 11 maps (11 sectors) across 3 architectural families:

```
                  ┌───────────────────────────────────────────────┐
                  │              BackSilence Universe              │
                  │                   (11 Maps)                   │
                  └───────┬───────────────┬───────────────┬───────┘
                          │               │               │
            ┌─────────────┴─────┐  ┌──────┴──────┐  ┌─────┴─────────────┐
            │  poolroom Family  │  │   utility   │  │  derelict Family  │
            │     (5 Maps)      │  │   (3 Maps)  │  │     (3 Maps)      │
            └───────────────────┘  └─────────────┘  └───────────────────┘
```

1. **`poolroom` Family (5 Maps):**
   - **`natatorium`:** Canonical grand natatorium hall ($0.15\text{ m}$ ceramic tiles, `#c8b580` albedo, continuous vaulted ceiling, bullnose slab edges at $+0.30\text{ m}$, central deep trench).
   - **`poolrooms`:** Endless labyrinth of submerged rectangular chambers with archway thresholds.
   - **`orientation`:** Tutorial sector featuring low water ($0.15\text{ m}$), safe perimeter platforms, and acoustic introduction.
   - **`hydro_maze`:** Symmetrical pillared water maze demanding precise sprint-jumps across submerged trenches.
   - **`drowned_school`:** Submerged tile hallways featuring green tiled desks and classroom archways.

2. **`utility` Family (3 Maps — Industrial Variants):**
   - **`utility_tunnels`:** Dark concrete subterranean utility conduits, industrial valve wheels, and rusted ceiling conduits.
   - **`drainage_core`:** Cavernous vertical drainage shaft with central spiral catwalks and cascading water runoffs.
   - **`drowned_metro`:** Flooded underground subway terminal with submerged train tracks and concrete passenger platforms.

3. **`derelict` Family (3 Maps — Atmospheric Expansions):**
   - **`marble_atrium`:** Grand neoclassical atrium featuring Carrara marble pillars and reflective black water pools.
   - **`neon_flood`:** High-contrast night sector illuminated by flickering violet/cyan neon signage reflecting on water.
   - **`sunken_jungle`:** Bioluminescent submerged greenhouse with moss-covered columns and overgrown water flora.

---

## 4. Creature & Acoustic Contracts

### 4.1 Monster Anatomical & Silhouette Contract
- **Anatomy:** Continuous hunched SkinnedMesh wader with elongated forelimbs, multi-jointed digitigrade hind legs, a pod-shaped head, 24 sharp procedural teeth, and lateral ear-fins. Zero disconnected floating meshes.
- **Waterline Grounding:** In shallow water ($y = 0.38\text{ m}$), torso sits at the waterline with hands submerged in water and shoulders clear. In deep water, the entity wades with torso partially submerged, never floating above water.
- **Readability Hooks:** At distances $> 10\text{ m}$, custom vertex shader hooks reduce fog extinction by $45\%$ and inject a cool grey rim light (`#8ca0b4`) to preserve silhouette readability against pale mint fog.

### 4.2 Acoustic Physics & Encounter Pacing
- **Blind Predator Rule:** The entity has zero visual detection capabilities. It localizes the player exclusively through noise events in water.
- **Locomotion Noise Schedule:**
  - Dry tiled platform movement: **0.0 m hearing radius** (player is completely safe while still on dry ground).
  - Crouch wading in water: **4.0 m hearing radius**.
  - Standard wading in water: **10.0 m hearing radius**.
  - Sprint wading in water: **16.0 m hearing radius**.
  - Splash landing into water: **18.0 m hearing radius**.
  - Pebble lure impact: **16.0 m diversion radius**.
- **Six-Beat Encounter Arc:**
  1. *Telegraph:* $1.5\text{s}$ low-frequency acoustic grumble ($42\text{ Hz}$).
  2. *Silhouette Hold:* $3.0\text{s}$ static display holding stance at $10\text{--}15\text{ m}$.
  3. *Steady Stalk:* Wading advance at $2.4\text{ m/s}$ along navmesh avoiding trenches $\le 2.4\text{ m}$.
  4. *Standoff:* Pauses at $6.0\text{ m}$ if player becomes completely motionless.
  5. *Silence Window:* $4.0\text{s}$ escape opportunity for player to sneak away.
  6. *Terminal Lunge:* Fast acceleration capped at $7.2\text{ m/s}$ (speed ceiling strictly enforced; zero teleportation).

---

## 5. Defect Census State & Quality Gates

- **Total Tracked Defects:** **151**
- **Closed Defects:** **151 closed (100% resolved)**
- **Open Defects:** **0 open (0 OPEN P0, 0 OPEN P1, 0 OPEN P2, 0 OPEN P3)**
- **Defect Register Reference:** [reports/glitch/REGISTER.md](reports/glitch/REGISTER.md)
- **Defect Census Reference:** [reports/glitch/CENSUS.md](reports/glitch/CENSUS.md)
- **Visual Glitch Scanner:** `npm run glitch:scan` reports 0 findings across all 48 golden baseline shots.

---

## 6. Honest Limitations Summary

In accordance with [reports/release/KNOWN_LIMITATIONS.md](reports/release/KNOWN_LIMITATIONS.md):
1. **Perceptual Reference Match:** The 37 reference video frames represent an external pre-rendered game (*The Infinite Shift: Backrooms*). BackSilence evaluates these honestly: **0 EXCEEDS, 1 MATCH, 36 FAIL** (average SSIM $0.542$).
2. **Screen-Space God Rays:** Evaluated purely from on-screen apertures; light beams disappear when the camera turns away from ceiling skylights.
3. **Motion Blur Quality Tier Scaling:** High tier evaluates 6 samples; Medium tier uses 3 samples; Low tier uses 2-sample blit quad to guarantee 60 FPS ($16.6\text{ ms}$ budget).
4. **WebGL2 Float Fallback:** Mobile devices lacking float render targets drop to RGBA8 integer precision, producing minor color quantization in bright fog.

---

## 7. Prioritized Next Three Tasks for Future Engineering Milestones

1. **Task 1: Real-Time Shallow-Water Heightfield Compute Pass**  
   Replace synthetic trochoidal wave superposition with an offscreen 2D heightfield ping-pong simulation on WebGL2 floating-point textures to model true Navier–Stokes shallow-water equations with physical wave reflections off walls and obstacle wakes.
2. **Task 2: Clustered Forward Lighting Pipeline**  
   Implement a 3D clustered forward lighting grid to support $> 16$ active underwater caustic spot-lights and flickering emergency fixtures without multi-pass draw call overhead.
3. **Task 3: Procedural Tile Phototexture Micro-Relief Synthesis**  
   Incorporate multi-octave Worley cellular noise and procedural micro-fracture displacement into `TileMaterialFactory` to elevate close-range grout readability ($< 0.5\text{ m}$) and achieve close-up tile SSIM $> 0.85$.
