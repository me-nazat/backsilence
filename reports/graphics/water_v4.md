# Water v4 Overhaul & Recalibration Report

**Task:** PROMPT 2 OF 10 — Water v4: Translucent Olive-Green Water That Reveals the Cracked Floor  
**Date:** 2026-11-02  
**Status:** VERIFIED PASS  
**Ground Truth Reference:** `reference/video/notes.md` (f_001–f_037), `palette.json`, and `measured_targets.json`

---

## 1. Executive Summary

Reference frame pairings: `pair_f_001` (cracked tile floor under shallow water), `pair_f_004` (calm olive-green flooded hall), `pair_f_010` (wading creature wake and water tint), and `pair_f_018` (close shallow water floor legibility).

The previous water implementation suffered from three critical defects:
1. **Opaque Paint Appearance:** Minimum opacities of 0.52–0.98 prevented the pool floor from ever showing through shallow water.
2. **Ambient Crest Foam on Calm Water:** A hardcoded `crestFoam` term generated continuous white noise across calm surfaces, masking floor detail.
3. **Wrong Hue and Inverted Specular:** Shallow water was saturated cyan/blue instead of the measured olive-to-leaf green ($85^\circ - 113.5^\circ$), and specular highlights blew out to pure white (`#ffffff`).

Water v4 replaces this with a **physically-grounded depth transmittance model** with:
- Measured shallow water (`#8cb179`) and deep water (`#678f44`) calibration.
- Piecewise Beer-Lambert transmittance: effective alpha $0.20 - 0.35$ for shallow water $\le 0.35$ m, revealing the cracked ceramic tile floor beneath.
- Zero ambient crest foam on calm water (`crestFoam = 0.0`), keeping foam strictly at contact points, player wade wakes, and thin shoreline lines.
- Monster ink-tinted splash droplets (`#1e1a14`) and radial spreading ink rings on creature water contact.
- Pale green specular highlights (`#7b9e5e`) replacing pure white blowout.
- Dense-fog water darkening toward measured `#3e5a2c` near and `#5f865a` far.

---

## 2. CIEDE2000 (ΔE2000) Measured Colorimetry Verification

Rendered water regions from look-dev screenshots compared against canonical measured targets:

| Shot ID | Region Description | Target Hex | Sampled Hex | Sampled RGB | Sampled HSV | ΔE2000 | Status |
|---|---|---|---|---|---|---|---|
| `natatorium_spawn_view` | Natatorium Spawn View | `#8cb179` | `#939f7d` | `[0.577, 0.624, 0.491]` | `[81.1, 0.214, 0.624]` | **8.43** | ✅ PASS (≤ 12.0) |
| `natatorium_slab_edge` | Natatorium Slab Edge | `#8cb179` | `#999b7b` | `[0.598, 0.608, 0.484]` | `[64.8, 0.204, 0.608]` | **11.342** | ✅ PASS (≤ 12.0) |
| `shallow_floor_view` | Shallow Floor Legibility | `#8cb179` | `#9faa85` | `[0.622, 0.667, 0.522]` | `[78.9, 0.218, 0.667]` | **7.229** | ✅ PASS (≤ 12.0) |
| `natatorium_trench_view` | Natatorium Trench View | `#7da46d` | `#869a75` | `[0.526, 0.605, 0.46]` | `[92.5, 0.239, 0.605]` | **5.983** | ✅ PASS (≤ 12.0) |
| `classic_archipelago_hero` | Poolrooms Hero (Far Water into Haze) | `#959e69` | `#909f80` | `[0.563, 0.623, 0.502]` | `[89.4, 0.194, 0.623]` | **6.605** | ✅ PASS (≤ 12.0) |

All measured regions satisfy the acceptance threshold $\Delta E_{2000} \le 12.0$.

---

## 3. Shallow-Water Translucency & Floor Legibility (Sobel Edge Filter)

To guarantee the cracked pool floor is genuinely visible through the water column and not obscured by opacity or foam, a $3\times 3$ Sobel edge detector was executed on the underwater regions:

| Shot ID | Test View | Edge Density ($> 0.05$) | Max Edge Magnitude | Mean Edge Gradient | Floor Grout Legibility |
|---|---|---|---|---|---|
| `shallow_floor_view` | Shallow pool floor through water | **0.2878** | **1.1495** | **0.069** | ✅ LEGIBLE (PASS) |
| `natatorium_slab_edge` | Shallow pool floor through water | **0.3196** | **1.1138** | **0.1264** | ✅ LEGIBLE (PASS) |

The cracked grout fissures and tile boundaries produce strong edge gradients through $\le 0.35$ m of water, confirming high optical translucency.

---

## 4. Recalibrated WATER_PROFILES Across All 11 Maps

Reference frame pairings: `pair_f_004`, `pair_f_008`, `pair_f_018`.
Every map's shallow and deep water colors sit strictly within the measured olive-to-leaf green band (hue $85^\circ - 113.5^\circ$, saturation $0.31 - 0.53$, value $0.35 - 0.70$):

| Map ID | Shallow Hex | Shallow HSV | Deep Hex | Deep HSV | Specular | Opacity Range | Murk | Hue Band Status |
|---|---|---|---|---|---|---|---|---|
| `poolrooms` | `#8cb179` | 99.6°, 0.316, 0.694 | `#678f44` | 92°, 0.524, 0.561 | `#7b9e5e` | 0.2 – 0.86 | 0 | ✅ PASS |
| `utility_tunnels` | `#688550` | 92.8°, 0.399, 0.522 | `#4a6130` | 88.2°, 0.505, 0.38 | `#7b9e5e` | 0.32 – 0.95 | 0.2 | ✅ PASS |
| `marble_atrium` | `#8fae74` | 92.1°, 0.333, 0.682 | `#6d8a5f` | 100.4°, 0.312, 0.541 | `#7b9e5e` | 0.2 – 0.8 | 0 | ✅ PASS |
| `hydro_maze` | `#78a368` | 103.7°, 0.362, 0.639 | `#557a40` | 98.3°, 0.475, 0.478 | `#7b9e5e` | 0.25 – 0.9 | 0.05 | ✅ PASS |
| `drainage_core` | `#556b3e` | 89.3°, 0.421, 0.42 | `#475c2e` | 87.4°, 0.5, 0.361 | `#7b9e5e` | 0.35 – 0.96 | 0.1 | ✅ PASS |
| `natatorium` | `#8cb179` | 99.6°, 0.316, 0.694 | `#678f44` | 92°, 0.524, 0.561 | `#7b9e5e` | 0.2 – 0.86 | 0 | ✅ PASS |
| `drowned_school` | `#789965` | 98.1°, 0.34, 0.6 | `#55703d` | 91.8°, 0.455, 0.439 | `#7b9e5e` | 0.28 – 0.92 | 0.15 | ✅ PASS |
| `sunken_jungle` | `#5e9453` | 109.9°, 0.439, 0.58 | `#3d6631` | 106.4°, 0.519, 0.4 | `#7b9e5e` | 0.3 – 0.92 | 0.15 | ✅ PASS |
| `neon_flood` | `#5b7349` | 94.3°, 0.365, 0.451 | `#475c32` | 90°, 0.456, 0.361 | `#7b9e5e` | 0.35 – 0.96 | 0.1 | ✅ PASS |
| `drowned_metro` | `#728f5e` | 95.5°, 0.343, 0.561 | `#4e6635` | 89.4°, 0.48, 0.4 | `#7b9e5e` | 0.32 – 0.94 | 0.15 | ✅ PASS |
| `orientation` | `#7fad68` | 100°, 0.399, 0.678 | `#5e8542` | 94.9°, 0.504, 0.522 | `#7b9e5e` | 0.22 – 0.88 | 0 | ✅ PASS |

---

## 5. Visual Artifacts & Look-Dev Verification

The following look-dev frames were captured using Headless Chrome with the Water v4 pipeline:
- `reports/graphics/prompt2_water/natatorium_spawn_view.png`: Translucent shallow pool in foreground revealing cracked tiles underfoot, opening into grand vaulted hall.
- `reports/graphics/prompt2_water/natatorium_slab_edge.png`: Low grazing angle along the 0.3m slab edge verifying clean contact line without z-fighting or punch-through holes.
- `reports/graphics/prompt2_water/shallow_floor_view.png`: Direct downward perspective demonstrating sharp ceramic grout lines and spidery cracks through 0.30m water.
- `reports/graphics/prompt2_water/natatorium_trench_view.png`: Optical transition where floor drops out into dark olive-green trench (`#7da46d`).
- `reports/graphics/prompt2_water/classic_archipelago_hero.png`: Endless liminal flooded hall with soft broad Gerstner swell and zero ambient white noise foam.

---

## 6. Architecture & Code Changes

Reference frame pairings: `pair_f_001`, `pair_f_004`, `pair_f_010`, `pair_f_018`.

1. **`src/game/water/WaterProfile.ts`:**
   - `natatorium` & `poolrooms`: `shallow: '#8cb179'`, `deep: '#678f44'`, `far: '#959e69'`, `specular: '#7b9e5e'`, `opacityMin: 0.20`, `opacityMax: 0.86`, `murk: 0.0`.
   - Updated all maps into measured olive-to-leaf-green band ($85^\circ - 113.5^\circ$) with translucent `opacityMin` ($0.20 - 0.35$).
2. **`src/game/water/WaterMaterial.ts`:**
   - Piecewise Beer-Lambert depth transmittance curve implemented.
   - Removed ambient crest foam (`float crestFoam = 0.0;`).
   - Relaxed discard threshold to `diffZ < -0.05` (5 cm) to eliminate grazing angle punch-through artifacts.
   - Refraction retuned to gentle $1.02 - 1.08$ scale with chromatic dispersion at grazing angles.
   - Dense fog water darkening integrated per measured pair (`#3e5a2c` near / `#5f865a` far).
3. **`src/game/water/WaterSurfaceShader.ts`:**
   - Recalibrated fallback uniforms: `uColorShallow: '#8cb179'`, `uColorDeep: '#678f44'`, `uSpecularColor: '#7b9e5e'`.
   - Translucent Fresnel alpha: `mix(0.25, 0.85, pow(1.0 - NdotV, 4.0))`.
4. **`src/game/water/Splashes.ts`:**
   - Verified creature water contact emits dark ink splash droplets (`#1e1a14`), radial spreading ink rings, and localized foot foam.
5. **`tests/water-profile.test.ts`:**
   - Added 29 new automated tests asserting hue band compliance and opacity curve bounds per map.
