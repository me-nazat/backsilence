# Preconditions v3 — Creature Screen-Space Readability & Anatomy Baseline

**Date:** 2026-11-05  
**Baseline Commit:** `259eb8e` (`feat(world): depth layers, sightlines and trench lanes per map (Prompt 4)`)  
**Scope:** Pre-flight audit of creature visual mass, silhouette coverage, Michelson contrast, and frame contract fidelity for Prompt 5.

---

## §1 Problem Analysis & Audit Evidence

While structural FK assertions in `tests/monster-silhouette-contract.test.ts` pass, screen-space visual audit and live-scene testing reveal that the creature suffers from severe scale, presence, and mass deficiencies:
1. **Under-scaled Silhouette Coverage:** In `creature_close_6m`, the creature occupies only **2.215%** of frame pixels (target $\ge 3.0\%$). At close range ($6\text{ m}$), the creature lacks visceral physical presence compared to reference frame `f_018` (*"Creature very close (3 to 5 m) in SHALLOW water. Creature: pale brown-grey skin with reddish blotches, big rounded head with dark pits like a seed pod... thick forearms"*).
2. **Speck-in-Distance Defect:** `reports/monster/screenshots/show_me_15m.png` logged defect **C2 (P1)** in `reports/glitch/CENSUS.md` ("Indistinct low-contrast speck against fog; fails visual contract compared to reference frames `f_008`/`f_009`"). In live scenes, fog attenuation without silhouette mass compensation causes the creature to collapse into an unreadable silhouette.
3. **Missing Jumpscare Board:** `creature_jumpscare` (contract shot for `f_037` at $0.82\text{ m}$ face distance with $\ge 25\%$ coverage in $0.20\text{ s}$) does not exist in `reports/visual/`.
4. **Gait Stride Disconnect:** The quadrupedal wading animation lacks heavy mass transfer, fluid displacement drag, and dedicated state transitions for `wade-stalk`, `listen-freeze`, `trench-pace`, and `lunge`.

---

## §2 Baseline Screen-Space Metrics (`scripts/creature/readability-probe.mjs`)

Audit executed via `node scripts/creature/readability-probe.mjs` against current contract renders in `reports/visual/`:

| Shot ID | Distance | Target Ref | Mask Pixels | Frame Coverage | Target Coverage | Bounding Box | Height % | Mask Lum | BG Lum | Michelson Contrast | Contrast Target | Status |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `creature_close_6m` | $6.0\text{ m}$ | `f_018` | 20,409 | **2.215%** | $\ge 3.0\%$ | $219 \times 182\text{ px}$ | 25.28% | 0.3106 | 0.6692 | **0.3660** | $\ge 0.35$ | **FAIL (Coverage)** |
| `creature_mid_15m` | $15.0\text{ m}$ | `f_010` | 5,494 | **0.596%** | $\ge 0.55\%$ | $114 \times 95\text{ px}$ | 13.19% | 0.3106 | 0.6558 | **0.3572** | $\ge 0.35$ | **MARGINAL PASS** |
| `creature_far_35m` | $35.0\text{ m}$ | `f_025` | 1,371 | **0.149%** | $\ge 0.12\%$ | $57 \times 47\text{ px}$ | 6.53% | 0.3104 | 0.6575 | **0.3586** | $\ge 0.35$ | **PASS** |
| `creature_jumpscare` | $0.82\text{ m}$ | `f_037` | N/A | **N/A** | $\ge 25.0\%$ | N/A | N/A | N/A | N/A | N/A | N/A | **MISSING** |

---

## §3 Horizontal Silhouette Profile Baseline

Measured horizontal span width across 10 vertical slices (top of dome head to waterline contact):

### `creature_close_6m` (182 px total height, $y \in [293, 474]$)
- Slice 1 (Apex Dome): $y \in [293, 311]$, width = $43\text{ px}$, pixels = 612
- Slice 2 (Upper Head): $y \in [311, 329]$, width = $91\text{ px}$, pixels = 1,480
- Slice 3 (Mid Head & Jaw): $y \in [329, 348]$, width = $111\text{ px}$, pixels = 2,014
- Slice 4 (Neck & Shoulders): $y \in [348, 366]$, width = $147\text{ px}$, pixels = 2,492
- Slice 5 (Upper Thorax): $y \in [366, 384]$, width = $183\text{ px}$, pixels = 2,910
- Slice 6 (Mid Torso & Ribs): $y \in [384, 402]$, width = $219\text{ px}$, pixels = 3,185
- Slice 7 (Lower Torso & Tail): $y \in [402, 420]$, width = $195\text{ px}$, pixels = 2,836
- Slice 8 (Forelimbs & Pelvis): $y \in [420, 438]$, width = $159\text{ px}$, pixels = 2,240
- Slice 9 (Forearms Wading): $y \in [438, 456]$, width = $131\text{ px}$, pixels = 1,590
- Slice 10 (Water Entry Claws): $y \in [456, 474]$, width = $99\text{ px}$, pixels = 1,050

---

## §4 Execution Roadmap

1. **Phase A — Mass & Posture:**
   - Retune bone lengths and geometry scales in `MonsterRig.ts` and `MonsterBody.ts` so that $6\text{ m}$ mask coverage reaches $\ge 3.0\%$ (height $\ge 14\%$ of frame) and $15\text{ m}$ mask coverage reaches $\ge 0.55\%$ (height $\ge 6\%$ of frame).
   - Solidify the seed-pod head dome with 32 recessed occlusion pits and small dark mouth slit (`f_018`–`f_020`).
   - Implement the named posture library in `MonsterAnimator.ts`: `wade-stalk`, `listen-freeze`, `trench-pace`, `lunge`, and `jumpscare-bracket`.
   - Update `tests/monster-silhouette-contract.test.ts` to assert the screen-space readability law.
2. **Phase B — Dermis Texture & Shading:**
   - Procedural wet skin in `FleshTexture.ts`: `#5a5035` body, `#59462d` head, 8–20 reddish-brown blotches (chroma delta $\le 0.05$, coverage $\le 12\%$).
   - Specular roughness tuning ($0.35–0.50$), enhanced sheen below waterline, strict contrast against pale mint fog.
3. **Phase C — Locomotion & Water Interaction:**
   - Heavy, slow wading gait ($1.1\text{ s}$ prowl cadence) in `MonsterGait.ts` with water drag and knee abduction.
   - Maintain waterline intersection rules at depths $0.45\text{ m}$, $0.75\text{ m}$, and $1.05\text{ m}$ with ink splashes (`#1e1a14`) and feet-only foam (`#e8f2e6`).
4. **Phase D — Jumpscare Body (`f_037`):**
   - Verify framing lock at $0.82\text{ m}$, torso+head filling $\ge 65\%$ lower frame, arms bracketing viewport, water rise $+0.42\text{ m}$ with draining droplets.
   - Add `creature_jumpscare` to `shots.json` and generate verified board.
5. **Phase E — Evidence & Verification:**
   - Re-run `readability-probe.mjs`, generate `reports/monster/creature_v2.md`, verify 60 FPS in `run-perf.mjs`, close census row C2.
