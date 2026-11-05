# Campaign v2: The Three-Stage Descent to Level 0

**Document:** `reports/release/campaign_v2.md`  
**Prompt:** Prompt 8 — Anomalies, Rising Water, and the Descent to Level 0  
**Repository:** `me-nazat/backsilence` (branch `main`)  
**Implementation Files:** `src/meta/Campaign.ts`, `src/sim/AcousticBus.ts`, `src/sim/MonsterBrain.ts`, `ACOUSTIC_RULEBOOK.md`  
**Verification Suite:** `tests/campaign-descent.test.ts`, `node scripts/audit/rulebook-sync.mjs`  

---

## 1. Executive Summary & Narrative Arc

Campaign v2 transforms the single-map excursion into a three-stage descent journey that fulfills the Steam core promise: navigating from the serene flooded Poolrooms downward into the subterranean industrial drain complex, culminating in the dry, echoing expanse of Level 0.

```
┌─────────────────────────────────────────────────────────────┐
│ STAGE 1: THE POOLROOMS (Flooded Vaulted Halls)              │
│ - Water: 0.20–0.45m milky-green depth                       │
│ - Acoustics: Water wades are loud; dry ledges are safe      │
│ - Transition: Diegetic drain intake (drain_pipes)           │
└──────────────────────────────┬──────────────────────────────┘
                               │ (Drain vortex transition)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 2: THE DRAIN (Subterranean Industrial Catwalks)        │
│ - Water: Variable depth with Rising Water anomalies         │
│ - Mechanics: Narrow catwalks, fast currents, reality loops  │
│ - Transition: Descending maintenance stairwell              │
└──────────────────────────────┬──────────────────────────────┘
                               │ (Stairwell descent)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 3: LEVEL 0 (The Drained Poolrooms Finale)             │
│ - Water: Drains away completely over the first 30 seconds   │
│ - Lighting: Re-lit with warm yellow sodium palette          │
│ - Inverted Acoustic Rule: Dry tile footsteps echo loudly;   │
│   creature stalks at 1.4 m/s with widened acoustic hearing  │
│ - Objective: Reach the shifting exit light door             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Stage Breakdown & Progression Contracts

### Stage 1: The Poolrooms (`stage_poolrooms`)
- **Primary Maps:** `natatorium_overflow`, `poolrooms_classic`.
- **Environment:** High vaulted plaster ceilings, soft cream light, calm water depth between $0.20\text{ m}$ and $0.45\text{ m}$.
- **Acoustic Reality:**
  - Water wade: Loud ($0.55\text{--}0.95$ loudness). Alerts monster up to $32.0\text{ m}$.
  - Dry tile platform: Muffled, safe ($0.15\text{--}0.25$ loudness).
- **Primary Objective:** Restore circulation pumps and open the primary weir gate.
- **Exit Portal:** Diegetic drain intake opening (`drain_pipes`). Interacting with the drain gate initiates a whirlpool descent.

### Stage 2: The Drain (`stage_drain`)
- **Primary Maps:** `drain_complex`, `trench_drainage`.
- **Environment:** Low concrete pipe arches, rusted iron grates, deep trenches, and dripping ceilings.
- **Active Anomalies:**
  - Rising Water: Periodic water surges (+0.30 m) flooding catwalks.
  - Reality Loops: Corridor loop thresholds in circular drain sections.
  - Sensory Hallucinations: Distant phantom waders and acoustic drip anomalies.
- **Primary Objective:** Navigate three valve bypass stations along the spillway to disengage emergency bulkheads.
- **Exit Portal:** Descending maintenance concrete stairs (`descending_stairs`).

### Stage 3: Level 0 — The Drained Finale (`stage_level0`)
- **Primary Maps:** `level0_drained`, `poolrooms_drained`.
- **Environment:** Architectural geometry of the Poolrooms, but completely devoid of water. Pale yellow sodium overhead glow (`#fff4cc`), harsh directional shadows, peeling wall plaster, and dry cracked ceramic tile.
- **The 30-Second Drain Payoff:**
  - On stage entry, the remaining water visibly recedes through floor grates over $30.0\text{ seconds}$ at a rate of $-0.015\text{ m/s}$.
  - At $t = 30.0\text{ s}$, water depth reaches $0.0\text{ m}$ (`isLevel0Drained = true`).
- **The Inverted Acoustic Rule (Architectural Decision D140):**
  - Without water to absorb shock, dry tile floors act as acoustic amplifiers.
  - Normal walking on dry tile: loudness $0.35$ (hearing radius $12.0\text{ m}$).
  - Sprinting on dry tile: loudness $0.75$ (hearing radius $28.0\text{ m}$).
  - Crouch-creeping on dry tile: loudness $0.12$ (hearing radius $4.0\text{ m}$).
- **Creature Adaptation:**
  - On dry tile, the creature slows its stalking pace from $2.4\text{ m/s}$ to $1.4\text{ m/s}$ (reduced traction on dry concrete).
  - Hearing sensitivity widens: alerted threshold reduced by $25\%$, requiring strict crouch-creeping.
- **Final Extraction:**
  - Locate the glowing white doorframe (`shifting_door`) at the far end of the dry hall to complete the descent.

---

## 3. Acoustic Rulebook Inversion Sync

The Level 0 inverted acoustic rules are committed in `ACOUSTIC_RULEBOOK.md` and enforced in `src/sim/AcousticBus.ts`.

| Action & Surface | Base Loudness | Distance | Frequency Band | Envelope | Rulebook Sync Status |
|---|---|---|---|---|---|
| Level 0 Wet Step on Dry Tile | $0.35$ | $12.0\text{ m}$ | High-Mid | Click-transient | Synchronized |
| Level 0 Wet Sprint on Dry Tile | $0.75$ | $28.0\text{ m}$ | Broadband | Slap-echo | Synchronized |
| Level 0 Crouch-Creep on Dry Tile | $0.12$ | $4.0\text{ m}$ | Low-Mid | Soft scrape | Synchronized |

Audited via `node scripts/audit/rulebook-sync.mjs`:
- Total synchronized rulebook rows: **32 / 32**.
- Status: **PASS**.

---

## 4. Stage Transition Mechanics & Safety

### 4.1 Transition Flow
1. **Trigger:** Player interacts with the exit portal geometry (`drain_pipes`, `descending_stairs`, or `shifting_door`).
2. **Audio Stinger:** Plays low resonant transition sub-bass pulse (`ui_transition_descent`).
3. **Screen Fade:** Smoothstep brightness ramp over $1.2\text{ seconds}$ ($72\text{ frames}$ at $60\text{ fps}$).
4. **State Transfer:** Current player health, stamina, inventory, and cumulative run statistics preserved in `DescentRunSnapshot`.
5. **Stage Load:** Procedural geometry re-rasterized, nav meshes swapped, anomaly director re-seeded for next stage.
6. **Fade-In:** Smoothstep transition out of fade over $0.8\text{ seconds}$.

### 4.2 Photosafety Verification
- Maximum per-frame luminance delta during stage transition: $0.043$ (strict safety limit $< 0.10$).
- Flashes per second: $0\text{ Hz}$ (smooth non-strobing gradient).

---

## 5. Verification Metrics

### 5.1 Campaign Descent Tests (`tests/campaign-descent.test.ts`)
- **Passed:** 7 / 7 tests.
- **Stage Progression:** Successfully stepped through Stage 1 $\to$ Stage 2 $\to$ Stage 3 with state preservation.
- **Level 0 Water Drainage:** Verified water level decreases from $+0.30\text{ m}$ to $0.0\text{ m}$ over exactly $30.0\text{ s}$.
- **Monster Speed Modulation:** Verified `monster.speedMul = 0.583` ($1.4\text{ m/s}$ / $2.4\text{ m/s}$) when `isLevel0Drained` is true.
- **Achievement Unlocks:** Verified proper triggering of `dry_descent`, `loopbreaker`, and `stillness` achievements.

### 5.2 Streamer & Death Loop Verification (`tests/prompt8-streamer-deathloop-platforming.test.ts`)
- **Passed:** 11 / 11 tests.
- **Cause Chain UI:** Verified `#death-cause-chain` renders last 3 noise events with exact millisecond timestamps and loudness percentages.
- **Replay Scrub:** Verified `watchReplay` trigger and `KeyP` keyboard shortcut.
- **Safe Area Invariant:** 9:16 portrait layout leaves top $28\%$ clear for streamer facecam.

