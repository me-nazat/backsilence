# Water v5 Pre-flight Audit & Preconditions Report

**Date:** 2026-11-04  
**Author:** Autonomous Senior Graphics Engineer  
**Scope:** Water v5 Pre-flight Audit: Failing checks, baseline actuals, contact sheet, and architectural roadmap (Prompt 3).  
**Pairing Citations:** `f_004`, `f_005`, `f_006`, `f_007`, `f_008`, `f_009`, `f_010`, `f_011`, `f_012`, `f_021`, `f_022`, `f_024`, `f_025`, `f_026`, `f_028`, `f_029`, `f_030`, `f_031`, `f_033`, `f_034`, `f_037`

---

## 1. Failing Water Checks Table (Actual / Target / Δ%)

Audited against `reports/visual/reference_comparison.json` and `reference/derived_targets.json` (citing frame pairings `f_007`, `f_008`, `f_009`, `f_012`, `f_022`, `f_024`, `f_026`, `f_028`, `f_029`, `f_030`, `f_031`, `f_033`, `f_034`):

| Category / Preset ID | Paired Frame | Metric | Actual | Target | Delta % | Status | Root Cause |
|:---|:---:|:---|:---:|:---:|:---:|:---:|:---|
| `natatorium_water_calm_axial` | `f_007` | Luminance StdDev | 0.0755 | 0.1038 | 27.3% | FAIL | Narrow water crop vs macro skylight/arch contrast in `f_007` |
| `natatorium_water_calm_axial` | `f_007` | Saturation Mean | 0.2572 | 0.3965 | 35.1% | FAIL | Submerged floor tile albedo and water bulk chroma attenuation |
| `natatorium_water_calm_axial` | `f_007` | Sobel Edge (scale 1x) | 0.0704 | 0.0543 | 29.7% | FAIL | Floor grout readability adding subpixel edge transitions |
| `natatorium_water_calm_grazing` | `f_009` | Luminance StdDev | 0.0759 | 0.1308 | 42.0% | FAIL | Grazing water surface vs wide-angle hall contrast in `f_009` |
| `natatorium_water_calm_grazing` | `f_009` | Saturation Mean | 0.2783 | 0.4076 | 31.7% | FAIL | Distant fog blend desaturates water before horizon melt |
| `natatorium_water_slab_edge` | `f_022` | Luminance StdDev | 0.0557 | 0.1280 | 56.5% | FAIL | Close slab contact vs wide room framing in `f_022` |
| `natatorium_water_slab_edge` | `f_022` | Saturation Mean | 0.2887 | 0.2260 | 27.7% | FAIL | Warm ochre slab proximity slightly inflates local chroma |
| `natatorium_water_wake` | `f_024` | Luminance StdDev | 0.0515 | 0.1591 | 67.6% | FAIL | Single wake ripple vs high-contrast wading sequence in `f_024` |
| `natatorium_water_wake` | `f_024` | Sobel Edge (scale 1x) | 0.0630 | 0.1300 | 51.5% | FAIL | Actual surface has fewer edges than turbulent video wake in `f_024` |
| `natatorium_water_splash_01` | `f_030` | Luminance StdDev | 0.0422 | 0.1573 | 73.2% | FAIL | Local splash crop vs full hall in `f_030` |
| `natatorium_water_splash_01` | `f_030` | Sobel Edge (scale 1x) | 0.0684 | 0.0260 | 163.1% | FAIL | Video frame `f_030` is motion-blurred; render shows sharp floor tiles |
| `natatorium_water_splash_05` | `f_031` | Luminance StdDev | 0.0422 | 0.1573 | 73.2% | FAIL | Local splash crop vs full hall in `f_031` |
| `natatorium_water_splash_05` | `f_031` | Sobel Edge (scale 1x) | 0.0682 | 0.0260 | 162.3% | FAIL | Video frame `f_031` is motion-blurred; render shows sharp floor tiles |
| `natatorium_water_splash_12` | `f_033` | Luminance StdDev | 0.0422 | 0.1573 | 73.2% | FAIL | Local splash crop vs full hall in `f_033` |
| `natatorium_water_splash_12` | `f_033` | Sobel Edge (scale 1x) | 0.0685 | 0.0260 | 163.5% | FAIL | Video frame `f_033` is motion-blurred; render shows sharp floor tiles |
| `natatorium_water_drip_ring` | `f_028` | Luminance StdDev | 0.0369 | 0.1812 | 79.6% | FAIL | Downward drip view vs room wide shot in `f_028` |
| `natatorium_water_drip_ring` | `f_028` | Sobel Edge (scale 1x) | 0.0721 | 0.0249 | 189.6% | FAIL | Floor grout visible through shallow water under drip rings |
| `natatorium_water_horizon` | `f_008` | Luminance StdDev | 0.0272 | 0.1561 | 82.6% | FAIL | Distant fogged water expanse has low variance vs `f_008` arches |
| `natatorium_water_horizon` | `f_008` | Sobel Edge (scale 1x) | 0.0633 | 0.1110 | 43.0% | FAIL | Distant water surface is smoother than video colonnade in `f_008` |
| `natatorium_water_underwater` | `f_034` | Luminance StdDev | 0.0689 | 0.1341 | 48.6% | FAIL | Uniform underwater fog vs high-contrast surface/floor in `f_034` |
| `natatorium_water_underwater` | `f_034` | Sobel Edge (scale 1x) | 0.0598 | 0.1509 | 60.4% | FAIL | Underwater volume is smoother than video caustics in `f_034` |
| `natatorium_water_monster_wake` | `f_012` | Luminance StdDev | 0.0604 | 0.1157 | 47.8% | FAIL | Local wake patch vs high contrast creature silhouette in `f_012` |
| `natatorium_water_monster_wake` | `f_012` | Sobel Edge (scale 1x) | 0.1920 | 0.1140 | 68.4% | FAIL | Droplet particles direct to lens inflate local high-frequency edges |
| `neon_flood_water_rain` | `f_026` | Luminance StdDev | 0.0949 | 0.1968 | 51.8% | FAIL | Slate concrete environment vs illuminated video frame `f_026` |
| `neon_flood_water_rain` | `f_026` | Saturation Mean | 0.0687 | 0.3196 | 78.5% | FAIL | Heavy grey fog washes out green water chroma |
| `neon_flood_water_rain` | `f_026` | Sobel Edge (scale 1x) | 0.0900 | 0.0108 | 733.3% | FAIL | Micro-rain ripples create edge density far higher than `f_026` |
| `classic_archipelago_hero` | `f_029` | Luminance StdDev | 0.0965 | 0.1826 | 47.2% | FAIL | Open water archipelago vs dense interior in `f_029` |
| `classic_archipelago_hero` | `f_029` | Sobel Edge (scale 1x) | 0.0466 | 0.0222 | 109.9% | FAIL | Distant archway silhouettes and tile islands create sharp silhouettes |

---

## 2. Water Reference Shot Presets Contact Sheet

The 8 core water shot presets from `shots.json` establish the baseline for Water v5 visual calibration:

| Shot ID | Preset Name | Camera FOV / Position | Target Appearance (Video Frame) | Screenshot Baseline Link |
|:---|:---|:---:|:---|:---:|
| `natatorium_water_calm_axial` | Calm Water Axial Pool | $70^\circ$, `(4.0, 0.8, -12.0) -> (4.0, 0.1, 12.0)` | `f_007`: Broad rolling swells, translucent green, visible floor | [`calm_axial.png`](reports/water/baseline/natatorium_water_calm_axial.png) |
| `natatorium_water_calm_grazing` | Calm Grazing Angle | $65^\circ$, `(11.0, 0.25, -8.0) -> (11.0, 0.02, 18.0)` | `f_009`: Long pale specular streaks, soft Fresnel, horizon melt | [`calm_grazing.png`](reports/water/baseline/natatorium_water_calm_grazing.png) |
| `natatorium_water_slab_edge` | Platform Slab Edge | $60^\circ$, `(11.0, 0.45, -2.5) -> (11.0, 0.0, 0.5)` | `f_022`: Meniscus line, wet darkening band, zero z-fighting | [`slab_edge.png`](reports/water/baseline/natatorium_water_slab_edge.png) |
| `natatorium_water_wake` | Wading V-Wake | $70^\circ$, `(11.0, 1.2, -3.0) -> (11.0, 0.0, 2.0)` | `f_024`: Soft V-arms, 2–3s decay, viscous rolling displacement | [`wake.png`](reports/water/baseline/natatorium_water_wake.png) |
| `natatorium_water_splash_01` | Splash Crown Eruption | $65^\circ$, `(11.0, 0.65, -2.5) -> (11.0, 0.0, 0.0)` | `f_030`: Ink-blob vocabulary `#1e1a14`, expanding concentric rings | [`splash_01.png`](reports/water/baseline/natatorium_water_splash_01.png) |
| `natatorium_water_drip_ring` | Ceiling Drip Rings | $60^\circ$, `(11.0, 0.65, -2.0) -> (11.0, 0.0, 0.0)` | `f_028`: 3 broken elliptical rings, graffiti motif, slow expansion | [`drip_ring.png`](reports/water/baseline/natatorium_water_drip_ring.png) |
| `natatorium_water_horizon` | Distant Horizon Melt | $70^\circ$, `(0.0, 0.75, 20.0) -> (0.0, 0.65, -40.0)` | `f_008`: Water merges into fog `#d6dccd`, no white horizon line | [`horizon.png`](reports/water/baseline/natatorium_water_horizon.png) |
| `natatorium_water_underwater` | Submerged Mint View | $80^\circ$, `(0.0, -0.4, 0.0) -> (0.0, -0.3, 10.0)` | `f_034`: Inside the mint `#3e5a2c` -> `#2c4420`, floor visible near | [`underwater.png`](reports/water/baseline/natatorium_water_underwater.png) |
| `natatorium_water_monster_wake`| Creature Wake Stalk | $70^\circ$, `(0.0, 1.4, 2.0) -> (0.0, 0.2, 10.0)` | `f_012`: Dark ink trail, spreading foam at feet `#e8f2e6` | [`monster_wake.png`](reports/water/baseline/natatorium_water_monster_wake.png) |
| `neon_flood_water_rain` | Neon Flood Weather Rain | $70^\circ$, `(0.0, 1.2, -5.0) -> (0.0, 0.2, 5.0)` | `f_026`: Fine low-amplitude rain rings, specular reflections | [`neon_rain.png`](reports/water/baseline/neon_flood_water_rain.png) |

---

## 3. Water v5 Architectural Roadmap & Plan

1. **Phase A — Calm Broad Swell (Surface Simulation):** Retune `GpuWaveSimulation.ts` and `WaterNormal.ts` to 2–3 low-frequency swell components ($\lambda \in [3, 8]$ m, amplitude $\le 5$ cm total). Broaden specular lobe to `#7b9e5e`, capping glint fraction $\le 0.03$. Soften player wake in `WakeEmitters.ts` with 2–3s decay and boundary damping.
2. **Phase B — Milky-Green Depth, Floor Legibility & Fog Melt:** Re-tune Beer–Lambert absorption ($\le 0.35$ m cracked floor clearly legible, $0.35 - 0.8$ m ghost tiles, $> 0.8$ m opaque `#678f44` $\to$ `#3e5a2c`). Soften caustics in `caustics.glsl.ts` to low-contrast webs. Blend grazing horizon into fog `#d6dccd`. Implement mint interior for `natatorium_water_underwater` (depth fog `#3e5a2c` $\to$ `#2c4420`).
3. **Phase C — Contact Vocabulary (Ink & Foam):** Implement limb contact dark ink blobs `#1e1a14` and white foam ring only at feet (`#e8f2e6`, max radius 0.32 m, life 0.38 s) extended to player and throwables. Soft billboard/shader decals with alpha falloff.
4. **Phase D — Waterline Integration (Zero Z-Fighting):** Screenspace depth-difference meniscus line (2–4 cm, `#f5fff9`), wet band below `waterY + 0.35 m` (`WetDarkening.ts`), and seamless whole-tile UV wrap on tiled cylinders.
5. **Phase E — Verification & Gating:** Ensure all water categories in `npm run reference:compare` pass, close all water-class census rows in `CENSUS.md`, and verify 60 fps on medium tier.

