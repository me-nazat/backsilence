# Prompt 2 Pre-flight Audit & Baseline Comparison (v5)

**Date:** 2026-11-03  
**Commit:** `3677b40` (Prompt 1 baseline)  
**Baseline Category Checks:** 126 total | **67 PASS** | **59 FAIL**  
**Extended Gating Checks:** 213 total | **93 PASS** | **120 FAIL**  

---

## 1. Failing Checks by Metric Breakdown (Citing Authoritative Pack Pairings: f_001..f_037, natatorium_hero)

| Metric | Failures | Typical Problem |
|:---|:---:|:---|
| `Saturation Mean` | 14 / 14 | Render pipeline draining color; grey-milky wash instead of mint-olive |
| `Sobel Edge (scale 1x)` | 13 / 14 | Up to +1287% excessive high-frequency edge noise (normal chatter, foam, grout) |
| `Hue Histogram EMD` | 13 / 14 | Color distribution skewed away from warm cream-tan and mint-olive |
| `Luminance StdDev` | 8 / 14 | Violent contrast: pure black voids against harsh specular hotspots |
| `Water Green Channel` | 5 / 14 | Water reads desaturated grey-slate rather than olive green |
| `Floor Grout Readability (0.9m)` | 3 / 14 | Underwater floor contrast / visibility out of tolerance |
| `Luminance Mean` | 3 / 14 | Horizon water, underwater, and neon rain render too dark |

---

## 2. Complete Ranked Table of All 59 Failing Checks (Sorted by |Δ%| Descending)

| # | Category | Metric | Actual | Target | Δ (Diff) | Δ % | Priority Phase |
|:---:|:---|:---|:---:|:---:|:---:|:---:|:---|
| 1 | `natatorium_water_splash_12` | `Sobel Edge (scale 1x)` | 0.3608 | 0.026 | 0.3348 | 1287.7% | Phase B (Smoothness) |
| 2 | `natatorium_water_splash_01` | `Sobel Edge (scale 1x)` | 0.3533 | 0.026 | 0.3273 | 1258.8% | Phase B (Smoothness) |
| 3 | `natatorium_water_splash_05` | `Sobel Edge (scale 1x)` | 0.3529 | 0.026 | 0.3269 | 1257.3% | Phase B (Smoothness) |
| 4 | `natatorium_water_drip_ring` | `Sobel Edge (scale 1x)` | 0.3162 | 0.0249 | 0.2913 | 1169.9% | Phase B (Smoothness) |
| 5 | `natatorium_water_slab_edge` | `Sobel Edge (scale 1x)` | 0.2951 | 0.0473 | 0.2478 | 523.9% | Phase B (Smoothness) |
| 6 | `natatorium_water_calm_axial` | `Sobel Edge (scale 1x)` | 0.3278 | 0.0543 | 0.2735 | 503.7% | Phase B (Smoothness) |
| 7 | `natatorium_water_calm_grazing` | `Sobel Edge (scale 1x)` | 0.3642 | 0.0982 | 0.266 | 270.9% | Phase B (Smoothness) |
| 8 | `classic_archipelago_hero` | `Sobel Edge (scale 1x)` | 0.0805 | 0.0222 | 0.0583 | 262.6% | Phase B (Smoothness) |
| 9 | `neon_flood_water_rain` | `Sobel Edge (scale 1x)` | 0.0388 | 0.0108 | 0.028 | 259.3% | Phase B (Smoothness) |
| 10 | `natatorium_water_monster_wake` | `Sobel Edge (scale 1x)` | 0.3364 | 0.114 | 0.2224 | 195.1% | Phase B (Smoothness) |
| 11 | `natatorium_water_wake` | `Sobel Edge (scale 1x)` | 0.3799 | 0.13 | 0.2499 | 192.2% | Phase B (Smoothness) |
| 12 | `natatorium_hero` | `Sobel Edge (scale 1x)` | 0.2247 | 0.0909 | 0.1338 | 147.2% | Phase B (Smoothness) |
| 13 | `natatorium_hero` | `Luminance StdDev` | 0.1809 | 0.0872 | 0.0937 | 107.5% | Phase C (Lighting/Luminance) |
| 14 | `neon_flood_water_rain` | `Saturation Mean` | 0.0232 | 0.3196 | 0.2964 | 92.7% | Phase A (Color/Sat) |
| 15 | `natatorium_water_calm_axial` | `Luminance StdDev` | 0.1987 | 0.1038 | 0.0949 | 91.4% | Phase C (Lighting/Luminance) |
| 16 | `natatorium_water_horizon` | `Sobel Edge (scale 1x)` | 0.0143 | 0.111 | 0.0967 | 87.1% | Phase B (Smoothness) |
| 17 | `natatorium_hero` | `Saturation Mean` | 0.1201 | 0.4577 | 0.3376 | 73.8% | Phase A (Color/Sat) |
| 18 | `natatorium_water_calm_axial` | `Saturation Mean` | 0.1069 | 0.3965 | 0.2896 | 73% | Phase A (Color/Sat) |
| 19 | `natatorium_water_horizon` | `Luminance StdDev` | 0.0429 | 0.1561 | 0.1132 | 72.5% | Phase C (Lighting/Luminance) |
| 20 | `natatorium_water_calm_grazing` | `Saturation Mean` | 0.1151 | 0.4076 | 0.2925 | 71.8% | Phase A (Color/Sat) |
| 21 | `natatorium_water_horizon` | `Saturation Mean` | 0.1155 | 0.3388 | 0.2233 | 65.9% | Phase A (Color/Sat) |
| 22 | `natatorium_water_wake` | `Saturation Mean` | 0.1205 | 0.3356 | 0.2151 | 64.1% | Phase A (Color/Sat) |
| 23 | `natatorium_water_splash_01` | `Saturation Mean` | 0.1266 | 0.302 | 0.1754 | 58.1% | Phase A (Color/Sat) |
| 24 | `natatorium_water_splash_05` | `Saturation Mean` | 0.1268 | 0.302 | 0.1752 | 58% | Phase A (Color/Sat) |
| 25 | `natatorium_water_splash_12` | `Saturation Mean` | 0.1273 | 0.302 | 0.1747 | 57.8% | Phase A (Color/Sat) |
| 26 | `natatorium_water_slab_edge` | `Saturation Mean` | 0.1137 | 0.226 | 0.1123 | 49.7% | Phase A (Color/Sat) |
| 27 | `classic_archipelago_hero` | `Saturation Mean` | 0.128 | 0.252 | 0.124 | 49.2% | Phase A (Color/Sat) |
| 28 | `natatorium_water_drip_ring` | `Saturation Mean` | 0.1302 | 0.2538 | 0.1236 | 48.7% | Phase A (Color/Sat) |
| 29 | `natatorium_water_underwater` | `Saturation Mean` | 0.1709 | 0.3243 | 0.1534 | 47.3% | Phase A (Color/Sat) |
| 30 | `classic_archipelago_hero` | `Luminance StdDev` | 0.0978 | 0.1826 | 0.0848 | 46.4% | Phase C (Lighting/Luminance) |
| 31 | `natatorium_water_horizon` | `Luminance Mean` | 0.3502 | 0.6418 | 0.2916 | 45.4% | Phase C (Lighting/Luminance) |
| 32 | `natatorium_water_monster_wake` | `Saturation Mean` | 0.1949 | 0.3475 | 0.1526 | 43.9% | Phase A (Color/Sat) |
| 33 | `natatorium_water_monster_wake` | `Luminance StdDev` | 0.164 | 0.1157 | 0.0483 | 41.7% | Phase C (Lighting/Luminance) |
| 34 | `neon_flood_water_rain` | `Luminance StdDev` | 0.1224 | 0.1968 | 0.0744 | 37.8% | Phase C (Lighting/Luminance) |
| 35 | `natatorium_water_calm_axial` | `Water Green Channel` | 0.76 | 0.552 | 0.208 | 37.7% | Phase A (Color/Sat) |
| 36 | `natatorium_water_calm_grazing` | `Luminance StdDev` | 0.1776 | 0.1308 | 0.0468 | 35.8% | Phase C (Lighting/Luminance) |
| 37 | `natatorium_water_drip_ring` | `Water Green Channel` | 0.766 | 0.577 | 0.189 | 32.8% | Phase A (Color/Sat) |
| 38 | `neon_flood_water_rain` | `Luminance Mean` | 0.3765 | 0.5586 | 0.1821 | 32.6% | Phase C (Lighting/Luminance) |
| 39 | `natatorium_water_splash_01` | `Water Green Channel` | 0.763 | 0.578 | 0.185 | 32% | Phase A (Color/Sat) |
| 40 | `natatorium_water_splash_05` | `Water Green Channel` | 0.763 | 0.578 | 0.185 | 32% | Phase A (Color/Sat) |
| 41 | `natatorium_water_splash_12` | `Water Green Channel` | 0.762 | 0.578 | 0.184 | 31.8% | Phase A (Color/Sat) |
| 42 | `natatorium_water_underwater` | `Luminance Mean` | 0.4409 | 0.6323 | 0.1914 | 30.3% | Phase C (Lighting/Luminance) |
| 43 | `natatorium_water_slab_edge` | `Luminance StdDev` | 0.1653 | 0.128 | 0.0373 | 29.1% | Phase C (Lighting/Luminance) |
| 44 | `natatorium_water_calm_axial` | `Hue Histogram EMD` | 0.336 | 0 | 0.336 | 0% | Phase A (Color/Sat) |
| 45 | `natatorium_water_calm_grazing` | `Hue Histogram EMD` | 0.3257 | 0 | 0.3257 | 0% | Phase A (Color/Sat) |
| 46 | `natatorium_water_slab_edge` | `Floor Grout Readability (0.9m)` | 0.3872 | 0.5038 | 0.1166 | 0% | Phase C (Lighting/Luminance) |
| 47 | `natatorium_water_slab_edge` | `Hue Histogram EMD` | 0.2973 | 0 | 0.2973 | 0% | Phase A (Color/Sat) |
| 48 | `natatorium_water_wake` | `Hue Histogram EMD` | 0.2938 | 0 | 0.2938 | 0% | Phase A (Color/Sat) |
| 49 | `natatorium_water_splash_01` | `Hue Histogram EMD` | 0.2909 | 0 | 0.2909 | 0% | Phase A (Color/Sat) |
| 50 | `natatorium_water_splash_05` | `Hue Histogram EMD` | 0.2908 | 0 | 0.2908 | 0% | Phase A (Color/Sat) |
| 51 | `natatorium_water_splash_12` | `Hue Histogram EMD` | 0.2909 | 0 | 0.2909 | 0% | Phase A (Color/Sat) |
| 52 | `natatorium_water_drip_ring` | `Floor Grout Readability (0.9m)` | 0.3877 | 0.4471 | 0.0594 | 0% | Phase C (Lighting/Luminance) |
| 53 | `natatorium_water_drip_ring` | `Hue Histogram EMD` | 0.2927 | 0 | 0.2927 | 0% | Phase A (Color/Sat) |
| 54 | `natatorium_water_horizon` | `Hue Histogram EMD` | 0.4724 | 0 | 0.4724 | 0% | Phase A (Color/Sat) |
| 55 | `natatorium_water_underwater` | `Hue Histogram EMD` | 0.2363 | 0 | 0.2363 | 0% | Phase A (Color/Sat) |
| 56 | `natatorium_water_monster_wake` | `Hue Histogram EMD` | 0.3392 | 0 | 0.3392 | 0% | Phase A (Color/Sat) |
| 57 | `neon_flood_water_rain` | `Floor Grout Readability (0.9m)` | 0.2884 | 0.1077 | 0.1807 | 0% | Phase C (Lighting/Luminance) |
| 58 | `neon_flood_water_rain` | `Hue Histogram EMD` | 0.437 | 0 | 0.437 | 0% | Phase A (Color/Sat) |
| 59 | `natatorium_hero` | `Hue Histogram EMD` | 0.3549 | 0 | 0.3549 | 0% | Phase A (Color/Sat) |
