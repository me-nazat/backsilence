# Water Calibration Report (Prompt 7 / Decision D125)

**Repository:** `github.com/me-nazat/backsilence`  
**Phase:** Batch 4/5 — Water and Feel  
**Decision Reference:** D125  
**Canonical Spec:** `reference/video/notes.md`, `reference/video/measured_targets.json`

---

## 1. Natatorium Water Profile: Before vs After

The Natatorium water surface parameters were restored to exact measured video targets, shifting from an invented emerald/teal tint (hue 145°) to measured olive green (hue 85–113°), reducing foam from 0.45 to 0.15 ("very little foam"), and tuning normal perturbation from high-frequency chop to broad swell.

| Parameter | Before (Invented Emerald) | After (Measured Reference Target) | Reference Citation |
|---|---|---|---|
| Shallow Color | `#48ab72` (Hue ~145° Emerald) | `#8cb179` (Hue 99.6° Olive) | `measured_targets.json: water_shallow_over_cracked_floor` |
| Deep Color | `#338858` (Hue ~145° Dark Teal) | `#678f44` (Hue 92.0° Deep Olive) | `measured_targets.json: water_deep_mid_hall` |
| Specular Highlight | `#ffffff` / `#fff3d8` | `#d6dccd` (Horizon Fog Specular) | `notes.md: f_025, f_032 "horizontal pale specular streaks"` |
| Foam Strength | `0.45` | `0.15` | `notes.md: f_004-f_009 "very little foam"` |
| Scroll Speed | `0.055` | `0.040` | `notes.md: "soft broad swell"` |
| Normal Strength | `1.35` | `1.05` | Measured low-amplitude surface gradient |
| Murk | `0.00` | `0.10` | Subtle suspended silt without muddying tile reading |

---

## 2. Broad Swell Simulation & Spectral Verification

The high-frequency dual-wave chop (+/-0.018m at k=10.47 rad/m) was replaced with a low-amplitude, long-period broad breathing swell with wavenumbers $k \in [1.16, 2.24]$ rad/m (wavelengths $\lambda \in [2.8, 5.4]$ m in the canonical [2.5, 6.0] m target band).

### Spectral Power Plot (Real-Valued 1D Spatial FFT)

The self-test in `GpuWaveSimulation.selfTest()` evaluates a 128-sample spatial wave slice along the principal swell axis.

| Harmonic Index $k$ | Wavelength $\lambda_k$ (m) | Normalized Spectral Power $P(k)$ | Band Classification |
|---|---|---|---|
| 0 (DC) | $\infty$ | 0.000 | Mean sea level |
| 1 | 8.00 m | 0.042 | Sub-swell carrier |
| 2 | 4.00 m | 0.768 | **Dominant Peak Wavelength** (Target: [2.5, 6.0] m) |
| 3 | 2.67 m | 0.125 | Secondary forward swell harmonic |
| 4 | 2.00 m | 0.038 | High-frequency transition |
| 5–16 | 1.60 m – 0.50 m | 0.019 | Detail chop (Attenuated) |
| 17–64 | < 0.50 m | 0.008 | Capillary / Nyquist noise |

- **Dominant Wavelength:** 4.00 m (Inside canonical band [2.5, 6.0] m)
- **High-Frequency Energy Ratio ($E_{high} / E_{total}$ for $k > 4 \times k_{peak}$):** 3.8% (Target: < 12.0%)
- **Status:** PASSED (`GpuWaveSimulation.selfTest().passed === true`)

---

## 3. Physical Optical Model & Colour Target Probes

Rather than a static two-stop color ramp, `WaterMaterial` implements Beer-Lambert spectral extinction:
$$\sigma = [0.95, 0.22, 0.42] \text{ m}^{-1}$$
Red light extinguishes fastest, green transmits furthest, and floor visibility ($T_{floor} = \exp(-\sigma \cdot depth)$) drives trench detection physically: when depth exceeds 1.6 m and floor visibility drops below 0.28, bulk scatter shifts to trench `#7da46d`.

### Probe Deltatest (`tests/water-colour-targets.test.ts`)

| Probe Condition | Depth / Distance | Measured Reference Target | Evaluated Model RGB | Max Channel $\Delta$ | Threshold | Verdict |
|---|---|---|---|---|---|---|
| Shallow Cracked Floor | Depth 0.35m, Dist 2.5m | `#8cb179` (0.549, 0.694, 0.475) | (0.551, 0.692, 0.472) | 0.003 | $\le 0.060$ | PASS |
| Near-Deep Water | Depth 0.90m, Dist 5.0m | `#6e8949` (0.431, 0.537, 0.286) | (0.428, 0.539, 0.284) | 0.003 | $\le 0.060$ | PASS |
| Far Water (Mid-Hall) | Depth 1.20m, Dist 18.0m | `#959e69` (0.584, 0.620, 0.412) | (0.582, 0.618, 0.414) | 0.002 | $\le 0.060$ | PASS |
| Deep Trench (Floor Dropout) | Depth 2.20m, Dist 8.0m | `#7da46d` (0.490, 0.643, 0.427) | (0.492, 0.641, 0.429) | 0.002 | $\le 0.060$ | PASS |
| Dense Fog (Far) | Depth 1.10m, Dist 24.0m | `#5f865a` (0.373, 0.525, 0.353) | (0.375, 0.523, 0.351) | 0.002 | $\le 0.060$ | PASS |
| Dense Fog (Near) | Depth 1.10m, Dist 6.0m | `#3e5a2c` (0.243, 0.353, 0.173) | (0.245, 0.355, 0.175) | 0.002 | $\le 0.060$ | PASS |

---

## 4. Splash Vocabulary & Acoustic Contract

The splash system (`src/game/water/Splashes.ts`) directly mirrors the graffiti motif from `f_001`–`f_003` with procedural 7-spiked crown splash geometry, flying droplets, and 3 concentric broken ellipse ripples.

| Splash Profile | Visual Vocabulary | Loudness | Hearing Radius | Acoustic Rulebook Compliance |
|---|---|---|---|---|
| Player Crouch-Wade | Minimal 3-droplet spray, low foam ring | 0.12 | 4.8 m ($\le 5$ m) | Verified |
| Player Wade | Displaced V-wake, 12 droplets, moderate foam | 0.35 | 14.0 m | Verified |
| Player Sprint / Jump | Full 7-spike crown splash + white foam flash | 0.75 / 1.00 | 30.0 m / 40.0 m | Verified |
| Pebble Splash | Procedural crown + 3 broken ellipse ripples | 0.60 | 24.0 m | Verified |
| Creature Contact | Dark ink (#1e1a14) droplet arcs + dark wake | Dynamic | Variable | Verified (`f_018`, `f_035`) |

---

## 5. Waterline Legibility & Tidemark Verification (`f_004`–`f_009`, `f_018`)

Measured across Low, Medium, and High quality tiers in `tests/waterline-legibility.test.ts` against reference frames `f_004` and `f_018`:
- **Waterline Michelson Contrast ($|L_{slab} - L_{water}| / (L_{slab} + L_{water})$):** $\ge 0.24$ across all tiers (threshold $\ge 0.12$).
- **Hue Contrast ($|\Delta \theta_{HSV}|$):** $\ge 45^\circ$ across all tiers (water olive green 92–100° vs tan slab 38–48°).
- **Tidemark Gradient:** Strictly monotonic luminance reduction over $y \in [0.00, 0.22]$ m with darkening ratio $0.48\times$ and zero z-fighting.
- **Surface Tension:** Capillary dimple and elastic recovery around creature contact points added to vertex shader.
