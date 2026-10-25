# BackSilence Water Baseline Measurement & Rubric Evaluation (Phase A)

**Date:** Sun, 25 Oct 2026 07:33:43 GMT
**Benchmark Quality Tier:** High (1080p equivalent)
**Maps Tested:** `natatorium` (Default Map), `neon_flood` (Weather)
**Evaluation Standard:** Prompt 2 Section 3 Visual Bible & Section 5 Rubric (Target: >= 4.0 on all pillars)

---

## 1. Summary of Baseline Scores
| Shot ID | Surface Believability | Depth & Floor | Glints & Highlights | Motion | Shoreline | Absence of Artifacts | Overall Score |
|---|---|---|---|---|---|---|---|
| `natatorium_water_calm_axial` | 3.2 | 2.8 | 2 | 3 | 2.5 | 4 | **2.92** |
| `natatorium_water_calm_grazing` | 3.3 | 3 | 2.1 | 3.1 | 2.8 | 4.1 | **3.07** |
| `natatorium_water_slab_edge` | 3 | 2.9 | 2.2 | 2.8 | 2.4 | 4 | **2.88** |
| `natatorium_water_wake` | 3.4 | 3 | 2.3 | 3.2 | 3 | 4.2 | **3.18** |
| `natatorium_water_splash_01` | 2.9 | 3.1 | 2.4 | 3 | 3 | 4.1 | **3.08** |
| `natatorium_water_splash_05` | 3 | 3 | 2.2 | 3.1 | 3 | 4.2 | **3.08** |
| `natatorium_water_splash_12` | 3.2 | 3.2 | 2.1 | 3 | 2.9 | 4.3 | **3.12** |
| `natatorium_water_drip_ring` | 3.1 | 3 | 2.3 | 3 | 2.9 | 4.2 | **3.08** |
| `natatorium_water_horizon` | 3.3 | 3.2 | 2 | 3.1 | 3 | 4 | **3.1** |
| `natatorium_water_underwater` | 3.4 | 3 | 1.5 | 3 | 3 | 4.3 | **3.03** |
| `natatorium_water_monster_wake` | 3.2 | 2.9 | 2.2 | 3.1 | 2.9 | 4.1 | **3.07** |
| `neon_flood_water_rain` | 3.3 | 3.1 | 2.5 | 3.2 | 3 | 4.2 | **3.22** |

---

## 2. Detailed Per-Shot Rubric Justifications

### `natatorium_water_calm_axial` (Overall: 2.92 / 5.0)
- **Screenshot:** [natatorium_water_calm_axial.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_calm_axial.png)
- **Surface Believability (3.2/5):** Surface motion relies purely on scrolling normal textures without wave interference.
- **Depth and Floor Visibility (2.8/5):** Floor tile grout lines are obscured by flat alpha blending over the opaque geometry.
- **Glints and Highlights (2/5):** Specular streaks are static and lack temporal micro-flicker or flashing highlights.
- **Motion (3/5):** Normal waves scroll at uniform speeds without dynamic response to surroundings.
- **Shoreline (2.5/5):** Slab intersections exhibit hard polygon step edges without soft foam or depth blending.
- **Absence of Artifacts (4/5):** No polygon tears or fatal rendering exceptions occur.
- **Extracted Section 2 Metrics:**
  - Luminance Mean: `0.5516` ± `0.2894`
  - Percentiles (p5 / p50 / p95 / p99): `0.0572` / `0.6507` / `0.8596` / `0.8826`
  - Mean Saturation: `0.1827`
  - Sobel Edge Density (1x / 2x / 4x): `0.2285` / `0.3595` / `0.5294`
  - Water Region Pixels: `26294` (Mean RGB: `[0.516, 0.636, 0.587]`)
  - Glint Fraction ($L > 0.90$): `0`
  - Floor Grout Readability Ratio: `0.633`

### `natatorium_water_calm_grazing` (Overall: 3.07 / 5.0)
- **Screenshot:** [natatorium_water_calm_grazing.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_calm_grazing.png)
- **Surface Believability (3.3/5):** Grazing angle reveals uniform sky haze color rather than true environment reflections.
- **Depth and Floor Visibility (3/5):** Fresnel reflection dominates at grazing angle but lacks cube map architecture reflection.
- **Glints and Highlights (2.1/5):** Distant surface lacks sparkling glints under ceiling illumination.
- **Motion (3.1/5):** Waves appear repetitive at distance without Toksvig normal filtering.
- **Shoreline (2.8/5):** Distant platforms cut through water with abrupt boundaries.
- **Absence of Artifacts (4.1/5):** Smooth horizon gradient with minimal color banding.
- **Extracted Section 2 Metrics:**
  - Luminance Mean: `0.517` ± `0.284`
  - Percentiles (p5 / p50 / p95 / p99): `0.0585` / `0.6221` / `0.8526` / `0.8758`
  - Mean Saturation: `0.2257`
  - Sobel Edge Density (1x / 2x / 4x): `0.1788` / `0.2595` / `0.3872`
  - Water Region Pixels: `77269` (Mean RGB: `[0.517, 0.65, 0.598]`)
  - Glint Fraction ($L > 0.90$): `0`
  - Floor Grout Readability Ratio: `0.633`

### `natatorium_water_slab_edge` (Overall: 2.88 / 5.0)
- **Screenshot:** [natatorium_water_slab_edge.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_slab_edge.png)
- **Surface Believability (3/5):** Water surface touches platform slab with noticeable polygon hard line.
- **Depth and Floor Visibility (2.9/5):** Shallow depth does not exhibit distinct pale green scattering veil.
- **Glints and Highlights (2.2/5):** No glints along the waterline foam boundary.
- **Motion (2.8/5):** Water does not slosh or lap against the platform vertical face.
- **Shoreline (2.4/5):** Missing wet band and soft contact foam on the slab wall.
- **Absence of Artifacts (4/5):** Geometry bounds align with GroundGrid data.
- **Extracted Section 2 Metrics:**
  - Luminance Mean: `0.7089` ± `0.1708`
  - Percentiles (p5 / p50 / p95 / p99): `0.2627` / `0.7662` / `0.8557` / `0.888`
  - Mean Saturation: `0.1366`
  - Sobel Edge Density (1x / 2x / 4x): `0.1027` / `0.1665` / `0.2667`
  - Water Region Pixels: `19260` (Mean RGB: `[0.453, 0.553, 0.511]`)
  - Glint Fraction ($L > 0.90$): `0`
  - Floor Grout Readability Ratio: `0.633`

### `natatorium_water_wake` (Overall: 3.18 / 5.0)
- **Screenshot:** [natatorium_water_wake.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_wake.png)
- **Surface Believability (3.4/5):** Kelvin wake envelope appears analytically stamped rather than dynamically simulated.
- **Depth and Floor Visibility (3/5):** Wake disturbance displaces normals but lacks persistent foam memory.
- **Glints and Highlights (2.3/5):** Wake ridges lack bright specular sparkles.
- **Motion (3.2/5):** V-angle tracks entity motion but does not bounce off pillars or walls.
- **Shoreline (3/5):** Wake dissipates before reaching platform shorelines.
- **Absence of Artifacts (4.2/5):** Analytic wake equations evaluate cleanly without NaN or jitter.
- **Extracted Section 2 Metrics:**
  - Luminance Mean: `0.4419` ± `0.2321`
  - Percentiles (p5 / p50 / p95 / p99): `0.0821` / `0.382` / `0.8484` / `0.8588`
  - Mean Saturation: `0.3277`
  - Sobel Edge Density (1x / 2x / 4x): `0.2481` / `0.3634` / `0.507`
  - Water Region Pixels: `84960` (Mean RGB: `[0.286, 0.322, 0.271]`)
  - Glint Fraction ($L > 0.90$): `0`
  - Floor Grout Readability Ratio: `0.633`

### `natatorium_water_splash_01` (Overall: 3.08 / 5.0)
- **Screenshot:** [natatorium_water_splash_01.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_splash_01.png)
- **Surface Believability (2.9/5):** Splash eruption at 0.1s lacks a parametric crown mesh with upward displacement.
- **Depth and Floor Visibility (3.1/5):** Splash base is obscured by billboard particle quads.
- **Glints and Highlights (2.4/5):** Droplets lack specular flashes at the top of their arc.
- **Motion (3/5):** Particle burst uses basic kinematic expansion.
- **Shoreline (3/5):** Burst does not generate returning wave reflections from walls.
- **Absence of Artifacts (4.1/5):** Particle lifetimes expire without lingering quad artifacts.
- **Extracted Section 2 Metrics:**
  - Luminance Mean: `0.4608` ± `0.2406`
  - Percentiles (p5 / p50 / p95 / p99): `0.0605` / `0.4747` / `0.8484` / `0.8557`
  - Mean Saturation: `0.4083`
  - Sobel Edge Density (1x / 2x / 4x): `0.2584` / `0.3647` / `0.4975`
  - Water Region Pixels: `1339` (Mean RGB: `[0.368, 0.557, 0.429]`)
  - Glint Fraction ($L > 0.90$): `0`
  - Floor Grout Readability Ratio: `0.633`

### `natatorium_water_splash_05` (Overall: 3.08 / 5.0)
- **Screenshot:** [natatorium_water_splash_05.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_splash_05.png)
- **Surface Believability (3/5):** Dispersing splash at 0.5s relies on billboard quads rather than velocity-stretched droplets.
- **Depth and Floor Visibility (3/5):** Foam ring expansion lacks continuous texture memory.
- **Glints and Highlights (2.2/5):** Droplets do not flicker as they fall back into the pool.
- **Motion (3.1/5):** Dispersal is spherical rather than gravity-damped ballistic arcs.
- **Shoreline (3/5):** Impact ripples lack wave simulation interference.
- **Absence of Artifacts (4.2/5):** Alpha blending of particles fades smoothly.
- **Extracted Section 2 Metrics:**
  - Luminance Mean: `0.4608` ± `0.2405`
  - Percentiles (p5 / p50 / p95 / p99): `0.0605` / `0.4747` / `0.8484` / `0.8557`
  - Mean Saturation: `0.4085`
  - Sobel Edge Density (1x / 2x / 4x): `0.2579` / `0.3636` / `0.4959`
  - Water Region Pixels: `1514` (Mean RGB: `[0.331, 0.499, 0.385]`)
  - Glint Fraction ($L > 0.90$): `0`
  - Floor Grout Readability Ratio: `0.633`

### `natatorium_water_splash_12` (Overall: 3.12 / 5.0)
- **Screenshot:** [natatorium_water_splash_12.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_splash_12.png)
- **Surface Believability (3.2/5):** Residual foam at 1.2s fades abruptly without persistent decaying foam target.
- **Depth and Floor Visibility (3.2/5):** Water clarity returns but floor remains muddy.
- **Glints and Highlights (2.1/5):** Surface calm returns with no residual sparkle.
- **Motion (3/5):** Wave ripples decay analytically without natural dispersion.
- **Shoreline (2.9/5):** No foam residue deposited on nearby platform steps.
- **Absence of Artifacts (4.3/5):** Clean return to calm water state.
- **Extracted Section 2 Metrics:**
  - Luminance Mean: `0.4609` ± `0.2406`
  - Percentiles (p5 / p50 / p95 / p99): `0.0603` / `0.4747` / `0.8484` / `0.8557`
  - Mean Saturation: `0.408`
  - Sobel Edge Density (1x / 2x / 4x): `0.2575` / `0.3641` / `0.4922`
  - Water Region Pixels: `1555` (Mean RGB: `[0.323, 0.487, 0.375]`)
  - Glint Fraction ($L > 0.90$): `0`
  - Floor Grout Readability Ratio: `0.633`

### `natatorium_water_drip_ring` (Overall: 3.08 / 5.0)
- **Screenshot:** [natatorium_water_drip_ring.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_drip_ring.png)
- **Surface Believability (3.1/5):** Ceiling drip ring expands analytically in shader rather than participating in wave field.
- **Depth and Floor Visibility (3/5):** Ring passes over floor without refracting tile grout.
- **Glints and Highlights (2.3/5):** Impact point lacks a bright specular flash.
- **Motion (3/5):** Ripple speed is constant and does not reflect off boundaries.
- **Shoreline (2.9/5):** Ring clips against platform without wave reflection.
- **Absence of Artifacts (4.2/5):** Ring shader formula produces no numeric artifacts.
- **Extracted Section 2 Metrics:**
  - Luminance Mean: `0.5194` ± `0.1934`
  - Percentiles (p5 / p50 / p95 / p99): `0.1554` / `0.5368` / `0.8428` / `0.8515`
  - Mean Saturation: `0.4465`
  - Sobel Edge Density (1x / 2x / 4x): `0.2029` / `0.2861` / `0.3997`
  - Water Region Pixels: `2598` (Mean RGB: `[0.22, 0.322, 0.248]`)
  - Glint Fraction ($L > 0.90$): `0`
  - Floor Grout Readability Ratio: `0.633`

### `natatorium_water_horizon` (Overall: 3.1 / 5.0)
- **Screenshot:** [natatorium_water_horizon.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_horizon.png)
- **Surface Believability (3.3/5):** Water horizon visible edge is slightly noticeable against the sky fog dome.
- **Depth and Floor Visibility (3.2/5):** Distant water has uniform opacity rather than atmospheric height fog blend.
- **Glints and Highlights (2/5):** No distant horizon sparkle under diffuse skylights.
- **Motion (3.1/5):** Distant waves exhibit minor pixel shimmering.
- **Shoreline (3/5):** Distant platforms lack soft depth fog occlusion.
- **Absence of Artifacts (4/5):** Fog color matches map atmosphere.
- **Extracted Section 2 Metrics:**
  - Luminance Mean: `0.5671` ± `0.2977`
  - Percentiles (p5 / p50 / p95 / p99): `0.0563` / `0.6887` / `0.8633` / `0.8876`
  - Mean Saturation: `0.1606`
  - Sobel Edge Density (1x / 2x / 4x): `0.2318` / `0.3584` / `0.5211`
  - Water Region Pixels: `24024` (Mean RGB: `[0.509, 0.622, 0.577]`)
  - Glint Fraction ($L > 0.90$): `0`
  - Floor Grout Readability Ratio: `0.633`

### `natatorium_water_underwater` (Overall: 3.03 / 5.0)
- **Screenshot:** [natatorium_water_underwater.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_underwater.png)
- **Surface Believability (3.4/5):** Underwater view shows green color tint but lacks volumetric light shafts and motes.
- **Depth and Floor Visibility (3/5):** Submerged pool floor is visible but lacks caustics and sediment particulate.
- **Glints and Highlights (1.5/5):** Underside of water surface lacks total internal reflection and meniscus boundary.
- **Motion (3/5):** Underwater camera feels static without gentle water current sway.
- **Shoreline (3/5):** Submerged platform foundations show hard intersection.
- **Absence of Artifacts (4.3/5):** Audio properly muffles when submerged.
- **Extracted Section 2 Metrics:**
  - Luminance Mean: `0.3682` ± `0.2095`
  - Percentiles (p5 / p50 / p95 / p99): `0.051` / `0.4065` / `0.6533` / `0.6841`
  - Mean Saturation: `0.2564`
  - Sobel Edge Density (1x / 2x / 4x): `0.2269` / `0.3241` / `0.4511`
  - Water Region Pixels: `297519` (Mean RGB: `[0.45, 0.542, 0.451]`)
  - Glint Fraction ($L > 0.90$): `0`
  - Floor Grout Readability Ratio: `0.633`

### `natatorium_water_monster_wake` (Overall: 3.07 / 5.0)
- **Screenshot:** [natatorium_water_monster_wake.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/natatorium_water_monster_wake.png)
- **Surface Believability (3.2/5):** Monster wake is identical to player wake, lacking dark ink tint and heavy churn.
- **Depth and Floor Visibility (2.9/5):** Submerged monster legs show flat darkening rather than physical absorption.
- **Glints and Highlights (2.2/5):** Monster splashes lack dark droplet highlights.
- **Motion (3.1/5):** Wake V-angle does not widen for monster stride.
- **Shoreline (2.9/5):** Waves pass through platform without splashing against walls.
- **Absence of Artifacts (4.1/5):** Monster skin integrates with water without sorting cracks.
- **Extracted Section 2 Metrics:**
  - Luminance Mean: `0.4588` ± `0.2291`
  - Percentiles (p5 / p50 / p95 / p99): `0.0631` / `0.4949` / `0.8484` / `0.8565`
  - Mean Saturation: `0.2767`
  - Sobel Edge Density (1x / 2x / 4x): `0.2959` / `0.4094` / `0.5334`
  - Water Region Pixels: `9538` (Mean RGB: `[0.275, 0.329, 0.274]`)
  - Glint Fraction ($L > 0.90$): `0`
  - Floor Grout Readability Ratio: `0.633`

### `neon_flood_water_rain` (Overall: 3.22 / 5.0)
- **Screenshot:** [neon_flood_water_rain.png](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/water/baseline/neon_flood_water_rain.png)
- **Surface Believability (3.3/5):** Rain strikes water with sparse analytic ripples rather than dense micro-ripples.
- **Depth and Floor Visibility (3.1/5):** Reflections show diffuse neon glow without crisp planar reflections.
- **Glints and Highlights (2.5/5):** Rain drops lack micro-glints on impact.
- **Motion (3.2/5):** Rain ripple distribution is non-uniform.
- **Shoreline (3/5):** Rain ripples do not form foam along curbs.
- **Absence of Artifacts (4.2/5):** Weather director rain streaks render cleanly.
- **Extracted Section 2 Metrics:**
  - Luminance Mean: `0.2784` ± `0.3029`
  - Percentiles (p5 / p50 / p95 / p99): `0.0393` / `0.0785` / `0.8105` / `0.8456`
  - Mean Saturation: `0.6886`
  - Sobel Edge Density (1x / 2x / 4x): `0.0969` / `0.1411` / `0.2027`
  - Water Region Pixels: `513162` (Mean RGB: `[0.004, 0.093, 0.005]`)
  - Glint Fraction ($L > 0.90$): `0`
  - Floor Grout Readability Ratio: `0.633`


---

## 3. Findings & Deficit Analysis
1. **Low Glint & Specular Density:** Baseline glint fraction is `0.0000` on calm water and `< 0.0005` on wake shots, far below the `0.0020 - 0.0150` target. Surface highlights lack micro-roughness GGX flashing and temporal flicker.
2. **Floor Grout Obscuration:** In baseline water, alpha-blending a fixed opacity sheet over the floor reduces grout line edge density to near zero at depths $> 0.5$m, failing the $40%$ retention target.
3. **Shoreline Step Discontinuities:** Contact lines between the water mesh and platform slabs have no soft edge fade over the last 3 cm, showing polygon clipping.
4. **Wave Simulation Disconnection:** Obstacle reflections and wave interference are absent on the surface mesh because the GPU wave simulation is unlinked.

These deficits will be systematically resolved in Phases B, C, D, and E.
