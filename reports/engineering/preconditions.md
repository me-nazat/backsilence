# Engineering Preconditions: The Monolith Must Fall

**Document:** `reports/engineering/preconditions.md`  
**Prompt:** Prompt 9 of 10 — GameSession Decomposition and the End of the Glitch Class  
**Repository:** `me-nazat/backsilence` (branch `main`)  
**Date:** 2026-11-05T09:45:00Z  

---

## 1. Executive Summary & Context

`src/game/GameSession.ts` has grown into a 4,817-line monolith encompassing session lifecycle, GPU warmup, map loading, atmosphere, puzzle logic, player input, camera control, throwables/projectiles, encounter directing, anomaly coordination, spectator/multiplayer netplay, debug tooling, golden screenshot capture, and resource disposal.

Over the project's commit history, a recurring class of defects has emerged repeatedly: state machine deadlocks (e.g. `44503aa`), disposal crashes and memory leaks (`6785222`, `bc4a3ad`), pointer lock race conditions (`080e262`), double-dispatch events (`6785222`), SPA history desynchronization (`10b3962`), and camera/collision submersion glitches (`53dcf6e`). All of these belong to the same root failure mode: uncoordinated, distributed lifecycle state.

This refactor decomposes `GameSession.ts` into isolated, single-responsibility systems under `src/game/session/`, regulated by a formal, deadlock-immune `SessionStateMachine` and a centralized `DisposalService`.

---

## 2. Monolith Responsibility Map (`src/game/GameSession.ts`)

| Concern | Line Range | Responsibilities | Target Owner in `src/game/session/` |
|---|---|---|---|
| **Session Lifecycle & Warmup** | 100–435, 2196–2313 | Session construction, GPU pipeline shader pre-compilation, restart/reset flows, pause/resume state toggling, run timer tracking. | `SessionHost`, `SessionStateMachine` |
| **World Setup & Spawn Validation** | 436–850 | Map definition retrieval, layout generation, ground/nav grid instantiation, light/fog setup, player and monster spawn positioning with collision clearance checks (G9 law). | `SpawnService`, `SessionHost` |
| **Atmosphere & Cold Open** | 851–979 | Shift clipboard intro sequence, routine maintenance teaching caption, directional & hemisphere lighting, fog parameters. | `SessionHost`, `SubsystemBridge` |
| **Map Puzzle Mechanics** | 980–2135 | Code pillars, keypad modal triggers, sequence validation, valve rotations, resonance bells, generator grids, fuse cores, levers, and uplinks. | `PuzzleBridge` |
| **Input & Locomotion Wiring** | 2136–2195, 2314–2550 | Keyboard, mouse, gamepad, and touch controls input sampling, pointer-lock request/release, crouch/sprint modifiers, flashlight toggle, inventory cycling. | `InputRig` |
| **Camera & Viewport Management** | 2551–2800, 3059–3243 | First-person camera positioning, near-plane clipping guard (G7 law: 0.05m), post-processing passes, depth texture passes, caustics, and water refraction. | `CameraRig` |
| **Throwables & Projectiles** | 3649–3838 | Pebble tossing ballistics, parabolic trajectory arc preview, splash impact events, buoyant object pushes. | `ThrowableBridge` |
| **Subsystem Stepping & Direction** | 3244–3624 | Flocking fish/drones, weather transitions, AnomalyDirector stepping, audio reverb snapshots, listener spatial orientation, monster AI stepping. | `SubsystemBridge`, `EncounterBridge`, `AnomalyBridge` |
| **Encounter & Death Framing** | 3625–3648 | Jumpscare sequence initiation, camera lock at 0.8m, death cause chain compilation, death screen triggers. | `EncounterBridge` |
| **Multiplayer & Networking** | 3898–4168 | NetSession coordination, remote avatar interpolation, ping markers, spectator camera, co-op win conditions. | `NetBridge` |
| **Debug Tools & Golden Capture** | 4241–4640 | Debug hotkeys, freecam, golden screenshot capture (`?shot=`), G5 debug marker suppression, hearing ring overlays. | `CaptureService`, `DebugBridge` |
| **Resource Disposal & Teardown** | 4641–4765 | WebGL context cleanup, geometry/material disposal, audio node termination, event listener unbinding, rAF handle cancellation. | `DisposalService` |

---

## 3. Large File Inventory (> 800 Lines)

The following files currently exceed the 800-line threshold:

```
  4817 src/game/GameSession.ts                     (Gameplay monolith — primary decomposition target)
  2615 src/ui/Hud.ts                               (UI layer — HUD elements & indicators)
  2119 src/world/levelart/LevelArtProps.ts         (Asset catalog — static geometry definitions)
  1788 src/procedural/textures/TileMaterialFactory.ts (Texture generator)
  1669 src/world/maps/NatatoriumMap.ts             (Map layout generator)
  1480 src/sim/MonsterBrain.ts                     (Simulation AI — state machine)
  1336 src/world/maps/CommonMapBuilder.ts          (World builder — secondary extraction target)
  1283 src/audio/AudioEngine.ts                    (Audio synthesis engine)
  1277 src/ui/UIManager.ts                         (UI layer — screen routing)
  1268 src/game/monster/MonsterRig.ts              (Creature procedural geometry)
  1197 src/meta/Campaign.ts                        (Campaign progression & stages)
  1156 src/world/levelart/MapLevelArtPass.ts       (Level art decoration passes)
  1124 src/game/water/Splashes.ts                  (Water splash particle effects)
  1093 src/meta/Identity.ts                        (Player identity & profile)
   900 src/game/objectives/ObjectiveDirector.ts    (Objective loop logic)
   814 src/game/water/WaterMaterial.ts             (Water shader materials)
```

Target for Prompt 9:
- `src/game/GameSession.ts` is fully decomposed into `src/game/session/*` files, each $\le 800$ lines.
- `GameSession.ts` becomes a thin backwards-compatible facade $\le 300$ lines.
- In `CommonMapBuilder.ts` (1,336 lines), the static prop/kit registry is extracted into `src/world/maps/PropKitRegistry.ts` to reduce `CommonMapBuilder.ts` below 800 lines.

---

## 4. Historical Bug Mapping & Owner Systems

| Commit / Bug | Historical Defect Description | Root Cause | Target Owning System | Invariant Law Implemented |
|---|---|---|---|---|
| `44503aa` | Pause menu deadlock during rapid start/load | Menu allowed to toggle during `LOADING` state, desynchronizing DOM and loop | `SessionStateMachine` | Menu open strictly rejected unless in `RUNNING` or `PAUSED` |
| `080e262` | Pointer lock leaked into menus and background tabs | Pointer lock requested without verifying session active state | `SessionStateMachine`, `InputRig` | Pointer lock request only permitted in `RUNNING`; auto-releases on pause/blur |
| `6785222` | Double-click start button double-dispatched sessions | Multiple `initAsync()` calls ran concurrently on rapid clicks | `SessionStateMachine`, `SessionHost` | `LOADING` state transition is atomic; redundant start calls rejected |
| `10b3962` | SPA history navigation desynchronized game session | Popstate triggered during gameplay without pausing/disposing | `SessionStateMachine` | History routing guards enforce clean transition to `PAUSED`/`DISPOSED` before route switch |
| `bc4a3ad` | Canvas and WebGL context leaks across session restarts | WebGL contexts and canvas elements left detached in DOM | `DisposalService` | Explicit context loss simulation and DOM node pruning on session teardown |
| `53dcf6e` | Submersion glitch and camera clipping through water bounds | Camera near plane and water boundary checks desynchronized | `CameraRig`, `SubsystemBridge` | Enforced near-plane distance ($0.05\text{ m}$) and smooth surface transition |
| `G5 Law` | Debug markers leaked into golden screenshot captures | Debug visualization flags active during screenshot render | `CaptureService` | `?shot=` transitions state to `CAPTURE`, automatically forcing all debug visuals off |
| `G9 Law` | Monster spawned inside geometry or directly adjacent to player | Unvalidated spawn coordinates in non-standard seeds | `SpawnService` | Rigorous distance and line-of-sight spawn verification before session enters `RUNNING` |

---

## 5. Pre-flight Baseline Verification Outputs

- **Vitest Unit & Integration Suite:** 104 files, 927 tests passing.
- **TypeScript Typecheck:** `tsc --noEmit` exited with code 0 (0 errors).
- **ESLint:** `eslint .` exited with code 0 (0 warnings, 0 errors).
- **State Audit:** `scripts/audit/generate-state-audit.mjs` executed cleanly, logging 324 tracked file records.
- **Smoke Runner (S1–S14):** Baseline scenarios operational; natural play sightings passing 9/10 seeds on cold starts.
