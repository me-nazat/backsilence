# BackSilence Water Baseline Measurement Report (Phase A)

**Date:** Thu, 29 Oct 2026 12:50:18 GMT
**Benchmark Quality Tier:** High (1080p equivalent)
**Maps Tested:** `natatorium` (Default Map), `neon_flood` (Weather)
**Reference Pack Manifest Hash:** `5284a059124178f556c589a806d206a77a62f6c11a4d892760bc944284a023b4` (`reference/derived_targets.json`)

---

## 1. Summary of Baseline Pixel Measurements (`reports/water/baseline/metrics.json`)

| Shot ID | Paired Frame (`reference/pairings.json`) | Lum Mean | Lum StdDev | Sat Mean | Sobel Edge (1x) | Water Mean RGB | Glint Fraction | Floor Grout Ratio |
|---|---|---|---|---|---|---|---|---|
| `natatorium_water_calm_axial` | `f_007` | `0.4159` | `0.1773` | `0.3903` | `0.0782` | `[0.386, 0.504, 0.312]` | `0.0000` | `0.633` |
| `natatorium_water_calm_grazing` | `f_009` | `0.4266` | `0.1610` | `0.3848` | `0.0908` | `[0.376, 0.513, 0.315]` | `0.0000` | `0.633` |
| `natatorium_water_slab_edge` | `f_022` | `0.4230` | `0.1256` | `0.3823` | `0.0514` | `[0.384, 0.519, 0.318]` | `0.0000` | `0.633` |
| `natatorium_water_wake` | `f_024` | `0.4425` | `0.1535` | `0.3885` | `0.1015` | `[0.403, 0.514, 0.318]` | `0.0000` | `0.633` |
| `natatorium_water_splash_01` | `f_011` | `0.4502` | `0.1445` | `0.3890` | `0.0996` | `[0.375, 0.508, 0.308]` | `0.0000` | `0.633` |
| `natatorium_water_splash_05` | `f_012` | `0.4519` | `0.1439` | `0.3874` | `0.1001` | `[0.376, 0.509, 0.309]` | `0.0000` | `0.633` |
| `natatorium_water_splash_12` | `f_023` | `0.4543` | `0.1444` | `0.3855` | `0.0959` | `[0.380, 0.513, 0.314]` | `0.0000` | `0.633` |
| `natatorium_water_drip_ring` | `f_008` | `0.4574` | `0.1469` | `0.3865` | `0.1187` | `[0.380, 0.512, 0.312]` | `0.0000` | `0.633` |
| `natatorium_water_horizon` | `f_005` | `0.4695` | `0.1718` | `0.3745` | `0.0723` | `[0.441, 0.538, 0.343]` | `0.0000` | `0.633` |
| `natatorium_water_underwater` | `f_027` | `0.2651` | `0.1669` | `0.4077` | `0.0200` | `[0.235, 0.305, 0.241]` | `0.0000` | `0.633` |
| `natatorium_water_monster_wake` | `f_033` | `0.2789` | `0.1890` | `0.4848` | `0.2287` | `[0.271, 0.307, 0.256]` | `0.0000` | `0.633` |
| `neon_flood_water_rain` | `f_028` | `0.1846` | `0.2306` | `0.3483` | `0.0526` | `[0.044, 0.065, 0.052]` | `0.0000` | `0.633` |

---

## 2. Per-Shot Extracted Metrics (`scripts/reference/extract-stats.mjs`)

### `natatorium_water_calm_axial` (Paired Frame: `f_007`)
- **Screenshot:** [natatorium_water_calm_axial.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_calm_axial.png)
- **Extracted Metrics (`f_007`):**
  - Luminance Mean: `0.4159` ± `0.1773` (Derived Target `f_007`: `0.5633`)
  - Percentiles (p5 / p50 / p95 / p99): `0.1083` / `0.4723` / `0.7097` / `0.7137`
  - Mean Saturation: `0.3903`
  - Sobel Edge Density (1x / 2x / 4x): `0.0782` / `0.1202` / `0.2257`
  - Water Region Pixels: `268340` (Mean RGB: `[0.386, 0.504, 0.312]`)

### `natatorium_water_calm_grazing` (Paired Frame: `f_009`)
- **Screenshot:** [natatorium_water_calm_grazing.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_calm_grazing.png)
- **Extracted Metrics (`f_009`):**
  - Luminance Mean: `0.4266` ± `0.1610` (Derived Target `f_009`: `0.5990`)
  - Percentiles (p5 / p50 / p95 / p99): `0.1476` / `0.4575` / `0.6904` / `0.6935`
  - Mean Saturation: `0.3848`
  - Sobel Edge Density (1x / 2x / 4x): `0.0908` / `0.1341` / `0.1924`
  - Water Region Pixels: `302881` (Mean RGB: `[0.376, 0.513, 0.315]`)

### `natatorium_water_slab_edge` (Paired Frame: `f_022`)
- **Screenshot:** [natatorium_water_slab_edge.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_slab_edge.png)
- **Extracted Metrics (`f_022`):**
  - Luminance Mean: `0.4230` ± `0.1256` (Derived Target `f_022`: `0.6804`)
  - Percentiles (p5 / p50 / p95 / p99): `0.1943` / `0.4572` / `0.5859` / `0.6214`
  - Mean Saturation: `0.3823`
  - Sobel Edge Density (1x / 2x / 4x): `0.0514` / `0.0915` / `0.1425`
  - Water Region Pixels: `461995` (Mean RGB: `[0.384, 0.519, 0.318]`)

### `natatorium_water_wake` (Paired Frame: `f_024`)
- **Screenshot:** [natatorium_water_wake.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_wake.png)
- **Extracted Metrics (`f_024`):**
  - Luminance Mean: `0.4425` ± `0.1535` (Derived Target `f_024`: `0.6497`)
  - Percentiles (p5 / p50 / p95 / p99): `0.1409` / `0.4819` / `0.6417` / `0.6943`
  - Mean Saturation: `0.3885`
  - Sobel Edge Density (1x / 2x / 4x): `0.1015` / `0.1440` / `0.2374`
  - Water Region Pixels: `285078` (Mean RGB: `[0.403, 0.514, 0.318]`)

### `natatorium_water_splash_01` (Paired Frame: `f_011`)
- **Screenshot:** [natatorium_water_splash_01.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_splash_01.png)
- **Extracted Metrics (`f_011`):**
  - Luminance Mean: `0.4502` ± `0.1445`
  - Percentiles (p5 / p50 / p95 / p99): `0.1389` / `0.4754` / `0.6339` / `0.6945`
  - Mean Saturation: `0.3890`
  - Sobel Edge Density (1x / 2x / 4x): `0.0996` / `0.1482` / `0.2157`
  - Water Region Pixels: `367163` (Mean RGB: `[0.375, 0.508, 0.308]`)

### `natatorium_water_splash_05` (Paired Frame: `f_012`)
- **Screenshot:** [natatorium_water_splash_05.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_splash_05.png)
- **Extracted Metrics (`f_012`):**
  - Luminance Mean: `0.4519` ± `0.1439`
  - Percentiles (p5 / p50 / p95 / p99): `0.1389` / `0.4771` / `0.6339` / `0.6935`
  - Mean Saturation: `0.3874`
  - Sobel Edge Density (1x / 2x / 4x): `0.1001` / `0.1484` / `0.2121`
  - Water Region Pixels: `365949` (Mean RGB: `[0.376, 0.509, 0.309]`)

### `natatorium_water_splash_12` (Paired Frame: `f_023`)
- **Screenshot:** [natatorium_water_splash_12.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_splash_12.png)
- **Extracted Metrics (`f_023`):**
  - Luminance Mean: `0.4543` ± `0.1444`
  - Percentiles (p5 / p50 / p95 / p99): `0.1383` / `0.4779` / `0.6341` / `0.6999`
  - Mean Saturation: `0.3855`
  - Sobel Edge Density (1x / 2x / 4x): `0.0959` / `0.1445` / `0.2086`
  - Water Region Pixels: `366700` (Mean RGB: `[0.380, 0.513, 0.314]`)

### `natatorium_water_drip_ring` (Paired Frame: `f_008`)
- **Screenshot:** [natatorium_water_drip_ring.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_drip_ring.png)
- **Extracted Metrics (`f_008`):**
  - Luminance Mean: `0.4574` ± `0.1469`
  - Percentiles (p5 / p50 / p95 / p99): `0.1333` / `0.4844` / `0.6251` / `0.7022`
  - Mean Saturation: `0.3865`
  - Sobel Edge Density (1x / 2x / 4x): `0.1187` / `0.1776` / `0.2470`
  - Water Region Pixels: `416069` (Mean RGB: `[0.380, 0.512, 0.312]`)

### `natatorium_water_horizon` (Paired Frame: `f_005`)
- **Screenshot:** [natatorium_water_horizon.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_horizon.png)
- **Extracted Metrics (`f_005`):**
  - Luminance Mean: `0.4695` ± `0.1718`
  - Percentiles (p5 / p50 / p95 / p99): `0.1535` / `0.5113` / `0.7212` / `0.7288`
  - Mean Saturation: `0.3745`
  - Sobel Edge Density (1x / 2x / 4x): `0.0723` / `0.1081` / `0.1700`
  - Water Region Pixels: `259358` (Mean RGB: `[0.441, 0.538, 0.343]`)

### `natatorium_water_underwater` (Paired Frame: `f_027`)
- **Screenshot:** [natatorium_water_underwater.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_underwater.png)
- **Extracted Metrics (`f_027`):**
  - Luminance Mean: `0.2651` ± `0.1669`
  - Percentiles (p5 / p50 / p95 / p99): `0.0249` / `0.2528` / `0.4770` / `0.4770`
  - Mean Saturation: `0.4077`
  - Sobel Edge Density (1x / 2x / 4x): `0.0200` / `0.0292` / `0.0385`
  - Water Region Pixels: `841903` (Mean RGB: `[0.235, 0.305, 0.241]`)

### `natatorium_water_monster_wake` (Paired Frame: `f_033`)
- **Screenshot:** [natatorium_water_monster_wake.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_monster_wake.png)
- **Extracted Metrics (`f_033`):**
  - Luminance Mean: `0.2789` ± `0.1890`
  - Percentiles (p5 / p50 / p95 / p99): `0.0644` / `0.2072` / `0.6179` / `0.6933`
  - Mean Saturation: `0.4848`
  - Sobel Edge Density (1x / 2x / 4x): `0.2287` / `0.2874` / `0.3645`
  - Water Region Pixels: `16990` (Mean RGB: `[0.271, 0.307, 0.256]`)

### `neon_flood_water_rain` (Paired Frame: `f_028`)
- **Screenshot:** [neon_flood_water_rain.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/neon_flood_water_rain.png)
- **Extracted Metrics (`f_028`):**
  - Luminance Mean: `0.1846` ± `0.2306`
  - Percentiles (p5 / p50 / p95 / p99): `0.0039` / `0.0488` / `0.6937` / `0.8043`
  - Mean Saturation: `0.3483`
  - Sobel Edge Density (1x / 2x / 4x): `0.0526` / `0.0860` / `0.1427`
  - Water Region Pixels: `391553` (Mean RGB: `[0.044, 0.065, 0.052]`)

---

## 3. Findings & Deficit Analysis (`f_007`, `f_009`, `f_019`, `f_022`)
1. **Glint & Specular Density (`f_007`, `f_009`):** Baseline glint fraction is `0.0000` on calm water (`natatorium_water_calm_axial` and `natatorium_water_calm_grazing`).
2. **Floor Grout Readability (`f_019`):** In `natatorium_floor_through_water` (`f_019`), alpha-blending a fixed opacity sheet over the floor reduces grout line contrast at `0.9 m` depth.
3. **Shoreline Contact (`f_021`, `f_022`):** Contact lines between the water mesh and platform slabs (`natatorium_slab_edge` / `natatorium_water_slab_edge`) require a soft depth fade.
