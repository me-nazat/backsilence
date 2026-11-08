# Creature Behaviour, Acoustic Encounter & Spatial Presence Contract (Decision D134)

> **Antigravity Prompt 6 / 10 · Batch 3 of 5 — THE CREATURE**  
> **Reference Video:** *The Infinite Shift: Backrooms* (Steam `app/5200480`) — frames `f_008`, `f_009`, `f_010`, `f_018`, `f_021`, `f_035`, `f_036`, `f_037`  
> **Stack Contract:** three.js `0.170.0` · TypeScript strict · zero binary assets · procedural audio + shaders · deterministic `simHash`

---

## 1. Executive Summary & Design Invariants

Prompt 6 enforces the complete physical, perceptual, acoustic, and cinematic contract of the entity encounter in *BackSilence*. The creature is a blind, terrifying liminal predator that stalks the player entirely through acoustic signals and water displacement.

### Core Architectural Invariants
1. **Total Optical Blindness:** The entity possesses zero visual sensors or visual raycasts. Its only perception input is deterministic `NoiseEvent` propagation through the acoustic air-and-wall transmission model.
2. **Nav-Level Trench Blocking Guarantee:** Water trenches with width $\le 2.4\text{ m}$ form impassable navigation barriers. The guarantee is enforced strictly at the `NavGrid` level with an invariant floor of $1.2\text{ m}$ clearance, preventing any crossing.
3. **Pacing, Not Leaping:** The creature wades organically; the airborne `leap-cross` variant is eliminated. Approach speed is constrained to a readable $2.2–2.6\text{ m/s}$ stalk (`SPEED_STALK = 2.4\text{ m/s}`), reserving $7.2\text{ m/s}$ strictly for terminal lunges from $\le 4\text{ m}$.
4. **Procedural Glottal Roar:** The vocalisation engine implements a continuous Rosenberg C glottal pulse, subharmonic period doubling ($f_0 / 2$), three moving resonant formants ($F_1, F_2, F_3$), guttural body energy $> 50\%$ in $150–1200\text{ Hz}$, pharyngeal screech bite in $2.4–3.0\text{ kHz}$, and silence-information ambient ducking.
5. **Reference Final Frame (`f_037`):** Jumpscare camera framing adopts a low camera height ($y \approx 0.45\text{ m}$), upward pitch ($+0.12\text{ rad}$), $65^\circ$ FOV, wide-splayed arms, and `#d6dccd` pale mint fog, resolving within $1.5\text{ s}$ with post-FX glitch buffers fully zeroed (`resetGlitch()`).

---

## 2. Blindness Guarantee & Perception Model

### A. Static Codebase Auditing
`tests/monster-blindness.test.ts` statically verifies that `MonsterBrain.ts` and `MonsterAI.ts` contain no visual perception vectors:
- **Forbidden keywords:** `camera`, `raycast`, `frustum`, `lookAt(player)`, `isPlayerVisible`.
- **Sole perception input:** `NoiseEvent` delivered via `onNoiseEvent(event: NoiseEvent)`.
- Acoustic propagation respects attenuation:
  $$\text{effective\_loudness} = \text{loudness} \times 40 \times \text{difficulty\_factor} - 0.5 \times \text{walls}$$

### B. 60-Second Silent Control
A silent player positioned directly $3\text{ m}$ ahead of the creature for 60 simulated seconds ($1800\text{ ticks}$ at $30\text{ Hz}$) triggers zero attacks, zero alerts, and zero stalks. The entity remains in wander/dormant cycles without closing distance.

---

## 3. Nav-Level Trench Blocking Guarantee

### A. Mathematical Threshold & Clearance Invariant
In `src/sim/NavGrid.ts`:
- Canonical trench blocking threshold: `TRENCH_BLOCK_WIDTH = 2.4\text{ m}`.
- Clearance requirement: `TRENCH_BLOCK_CLEARANCE = 1.2\text{ m}` ($\text{width} / 2$).
- Invariant floor:
  ```ts
  reqPlatformClearance = Math.max(NavGrid.TRENCH_BLOCK_CLEARANCE, clear.platform * clearanceMultiplier);
  ```
  Even under relaxed clearance fallback multiplier ($0.65$), the platform clearance floor never falls below $1.2\text{ m}$.

### B. Boundary Exactness
- **$2.3\text{ m}$ trench:** The central trench cells are marked non-walkable; the north and south water basins belong to separate connected components. The entity cannot find any path and remains blocked.
- **$2.5\text{ m}$ trench:** The central cells exceed the clearance threshold; connected component connectivity is preserved; the creature successfully paths and crosses.

### C. Diegetic Lip-Pacing Behaviour (`f_035`/`f_036`)
When blocked across a trench from a noise source:
- State enters `BLOCKED` with an $8.0\text{ s}$ timer.
- Entity paces laterally along the lip perpendicular to the target vector.
- Pacing cadence emits diegetic footfalls (`monster_footfall`), water thrashing (`monster_wade`), snarls (`monster_snarl`), and frustrated roars (`creature_roar`).
- `lipPaceCount` tracks along-edge travel distance ($> 2.0\text{ m}$).

---

## 4. Pacing, Speed Bands & Water Displacement

### A. Speed Bands & Gait Dynamics

| Speed Band | Nominal Velocity | Stride Interval | Trailing Wake Width | Wake Strength | `monster_wade` Audio Gain | Gait Dynamic |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Wander** | $1.6\text{ m/s}$ | $0.45\text{ s}$ | $0.6\text{ m}$ | $0.45$ | $0.35$ | Calm, heavy prowl; shallow displacement ripples |
| **Stalk** | $2.4\text{ m/s}$ | $0.28\text{ s}$ | $0.9\text{ m}$ | $0.95$ | $0.65$ | Focused forward wade; visible v-wake; steady footfall pacing |
| **Terminal Lunge** | $7.2\text{ m/s}$ | $0.16\text{ s}$ | $1.4\text{ m}$ | $1.65$ | $0.95$ | High-speed water thrashing; spray burst; violent gallop |

### B. Elimination of Airborne Leaps
The airborne `leap-cross` ballistic trajectory has been removed. The creature stays grounded in water at all times ($y = -0.15\text{ m}$), matching footage `f_008`–`f_021`.

### C. Director 10–15 m Reference Sighting Band (`f_008`/`f_009`)
In `src/sim/Director.ts:422`:
```ts
const candidateDists = [12.0, 11.5, 13.5, 10.5, 14.5, 15.0];
```
All candidate distances fall within $[10.0, 15.0]\text{ m}$, aligning with the first appearance of the creature in the reference footage.

---

## 5. Procedural Roar & Acoustic Synthesis Contract

### A. Vocalisation Architecture (`playMonsterRoar`)
1. **Glottal Excitation (Rosenberg C Model):**
   Computed derivative coefficients of Rosenberg C glottal pulse over 64 harmonics:
   $$a_n = \frac{1}{n^{1.45}} \sin\left(\frac{n\pi}{3}\right)$$
2. **Subharmonic Period Doubling:**
   Secondary oscillator running at $f_0 / 2 = 72.5 \to 47.5\text{ Hz}$ injected into vocal tract to simulate pathological vocal fold desynchronisation and biological terror.
3. **Three Moving Vocal Tract Formants:**
   - **$F_1$:** Bandpass sweeping $700 \to 400\text{ Hz}$ ($Q = 4.0$).
   - **$F_2$:** Bandpass sweeping $1100 \to 800\text{ Hz}$ ($Q = 4.0$).
   - **$F_3$:** Bandpass stationary at $2400\text{ Hz}$ ($Q = 3.8$) providing the pharyngeal screech bite.
4. **Master Lowpass Filter:**
   Brickwall roll-off at $3000\text{ Hz}$ ($Q = 0.707$) preserving acoustic resonance while eliminating aliasing.

### B. Spectral Analysis on Baseline (`reports/audio/baseline/creature_roar.json`)
- **Spectral Centroid:** $876.7\text{ Hz}$ (target $400–1200\text{ Hz}$): **PASS**.
- **Guttural Body Energy ($150–1200\text{ Hz}$):** $51.43\%$ of total spectral power ($> 50\%$ requirement): **PASS**.
- **Pharyngeal Screech Bite ($2.4–3.0\text{ kHz}$):** $2500\text{ Hz}$ band is $-29.52\text{ dB}$, exceeding adjacent bands $-31.75\text{ dB}$ ($2.0\text{ kHz}$) and $-37.19\text{ dB}$ ($4.0\text{ kHz}$): **PASS**.

### C. Ear Localisation & Silence-Information Ducking
- Footfalls (`monster_footfall`) and wade audio (`monster_wade`) pass the creature's world $(x, y, z)$ position directly to Web Audio `PannerNode`.
- Mixer ducks the `ambient` bus by $50\%$ to $95\%$ based on monster distance, producing an acoustic void that allows the player to pin-point footsteps by ear before sighting.

---

## 6. Jumpscare Framing & Death Sequence (`f_037`)

### A. Framing Contract
- **Camera Height:** $y \approx 0.45\text{ m}$ (low vantage looking up).
- **Camera Pitch:** $+0.12\text{ rad}$ upward tilt.
- **Field of View:** $65^\circ$.
- **Creature Pose:** Torso and head fill the lower $\approx 65\%$ of the frame; arms spread wide across the field of view.
- **Atmosphere:** Pale mint fog background (`#d6dccd`), dark silhouetted torso (`#5a5035`) and seed-pod dome head (`#59462d`).

### B. Death Resolution Budget
- Strike impact resolves in $\le 1.5\text{ s}$ into the death screen.
- On death transition, `PostFX.resetGlitch()` explicitly sets `glitch = 0` and `uGlitch.value = 0`, ensuring zero persistent green/black scanline artefacts linger on screen.

---

## 7. Automated Test Suite & Empirical Evidence

| Test Suite / Artifact | Metric / Assertion | Status | Evidence File |
| :--- | :--- | :--- | :--- |
| **Monster Blindness** | Zero optical raycasts/cameras in AI; 60s silent immunity | **PASS (3/3)** | `tests/monster-blindness.test.ts` |
| **Trench Blocking** | 2.3m blocks, 2.5m crosses; 30s zero crossings; lip-pacing | **PASS (3/3)** | `tests/monster-trench-blocking.test.ts` |
| **Vocalisation Contract** | Rosenberg C wave, $f_0/2$ doubling, $F_1/F_2/F_3$ formants, centroid $876.7\text{ Hz}$ | **PASS (4/4)** | `tests/monster-vocalisation.test.ts` |
| **Sighting Distance Band** | All candidate dists in $[10.0, 15.0]\text{ m}$; ambush verification | **PASS (3/3)** | `tests/monster-sighting-band.test.ts` |
| **200-Seed × 11-Map Trace** | 200 runs; sightings in $[10.05, 14.90]\text{ m}$; 0 crossings; 20 pacing events | **ALL PASS** | `reports/monster/trace_summary.json` |
| **Jumpscare Board** | Side-by-side composite against reference `f_037` ($1856 \times 720$) | **PASS** | `reports/monster/jumpscare_board.png` |
