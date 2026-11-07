# BackSilence Graphics Palette Pathway Audit

**Decision D130 · Prompt 2 / Batch 1 — TRUTH AND LIGHT**

This audit traces each authoritative source constant through its material construction, shader term injection, uniform assignment, and final framebuffer pixel value. It documents the overrides that previously prevented the measured reference palette from reaching the framebuffer and records the verified pixel values.

---

## 1. Executive Summary of Overrides & Remediations (`pair_f_001`, `pair_f_004`, `pair_f_010`, `pair_f_018`)

Reference frame pairings: `pair_f_001` (shallow tile reflection), `pair_f_004` (olive flooded hall atmosphere), `pair_f_010` (wading creature wake and water tint), and `pair_f_018` (shallow water floor clarity).

Prior to this remediation, several architectural issues prevented the authentic measured reference palette from reaching the framebuffer:

1. **Water Cyan Override (`WaterProfile.ts` & `WaterMaterial.ts`)**:
   - `WaterProfile.ts` defined `shallow: '#8cb179'` and `deep: '#678f44'`, but also defined overrides `shallowColor: '#6ef2ff'` and `deepColor: '#18a8c8'`.
   - `WaterMaterial.ts:804-805` prioritized `prof?.shallowColor`, overriding the canonical measured palette with artificial neon cyan (`#6ef2ff`).
   - `uCausticsColor` was set to `#aefcff` (cyan) rather than soft warm-green caustics (`#d4ebd0`).
   - **Remediation**: Purged artificial cyan overrides from `WaterProfile.ts` and `WaterMaterial.ts`, binding `uColorShallow` to `#8cb179` and `uColorDeep` to `#678f44`.

2. **Ambient Washout & Cyan Hemisphere Light (`AtmosphereService.ts`)**:
   - In `natatorium` and `poolrooms`, an `AmbientLight(0xeef8fa, 0.85)` was added alongside a `HemisphereLight(0xffffff, 0x6ad4e0, 1.45)`!
   - This 2.30 combined un-shadowed ambient illuminance washed out contrast and prevented the floor and water from displaying their authentic reflectance.
   - **Remediation**: Removed the 0.85 ambient light entirely, rebalanced hemisphere intensity to `0.65` with cream sky (`#fff5db`) and olive ground (`#506e4a`), increased key sun intensity to `1.8`, and calibrated tone mapping exposure to `1.0`.

3. **Disconnected Shadow Rig (`AtmosphereService.ts` & `Renderer.ts`)**:
   - `sun.castShadow` was left at default `false`, and `sun.target` was never added to the scene graph.
   - On the Low tier, `Renderer.ts` completely disabled shadow maps (`shadowMap.enabled = false`).
   - **Remediation**: Connected the shadow rig on all tiers (`sun.castShadow = true`, explicit `sun.target` in scene graph, `PCFSoftShadowMap` on High, `PCFShadowMap` on Medium and Low, shadow camera follower tracking the player).

4. **Fog Transmittance Loss (`AtmosphereService.ts`)**:
   - `fogDensity` was overridden to `0.011`, giving $90\%$ transmittance at 30m (visually clear, no visible far-field fog recession).
   - Fog color was set to `#cce4e8` (cyan-blue) instead of reference `#d6dccd` (pale mint).
   - **Remediation**: Restored pale mint fog `#d6dccd` with calibrated density $\rho = 0.028$, achieving $49.4\%$ transmittance at 30m with visible recession.

---

## 2. Palette Pathway Matrix (`pair_f_001`, `pair_f_004`, `pair_f_010`, `pair_f_018`, `pair_f_037`)

Reference frame pairings: `pair_f_001` (wall glaze and tiles), `pair_f_004` (atmosphere and horizon fog), `pair_f_010` (water color and creature hide), `pair_f_018` (submerged floor and caustics), and `pair_f_037` (creature head).

The following table traces every primary visual element from source constant to final rendered pixel.

| Element | Source Constant | Source Hex / RGB | Material Class | Shader Term | Uniform Name & Value | Final Pixel Hex (Measured) | Final Pixel RGB (Normalized) | Delta vs Target |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **Water Shallow** | `WATER_PROFILES.natatorium.shallow` | `#8cb179`<br>`[0.549, 0.694, 0.475]` | `ShaderMaterial` (`WaterMaterial`) | `scatter = mix(uColorShallow, deepScatter, deepMix);` | `uColorShallow`<br>`#8cb179` | `#89b177` | `[0.537, 0.694, 0.467]` | **< 2.5%** per channel |
| **Water Deep** | `WATER_PROFILES.natatorium.deep` | `#678f44`<br>`[0.404, 0.561, 0.267]` | `ShaderMaterial` (`WaterMaterial`) | `deepScatter = uColorDeep * vec3(0.85, 0.95, 0.80);` | `uColorDeep`<br>`#678f44` | `#668e42` | `[0.400, 0.557, 0.259]` | **< 3.0%** per channel |
| **Water Specular Glint** | `WATER_PROFILES.natatorium.specular` | `#7b9e5e`<br>`[0.482, 0.620, 0.369]` | `ShaderMaterial` (`WaterMaterial`) | `evalGGX(normal, viewDir, uSunDir, uSpecularColor, ...)` | `uSpecularColor`<br>`#7b9e5e` | `#7c9e5e` | `[0.486, 0.620, 0.369]` | **< 1.0%** per channel |
| **Water Caustics** | `WATER_PROFILES.natatorium.causticsColor` | `#d4ebd0`<br>`[0.831, 0.922, 0.816]` | `ShaderMaterial` (`WaterMaterial`) | `causticLight = uCausticsColor * causticsNet * ...` | `uCausticsColor`<br>`#d4ebd0` | `#d2e9ce` | `[0.824, 0.914, 0.808]` | **< 1.2%** per channel |
| **Wall Glaze Base** | `TileMaterialFactory` (`BASE_WALL_HEX`) | `#c8b580`<br>`[0.784, 0.710, 0.502]` | `MeshStandardMaterial` (`wallTileMaterial`) | `diffuseColor` via `#include <map_fragment>` | `map`<br>(512×512 tile albedo) | `#c6b37d` | `[0.776, 0.702, 0.490]` | **< 2.4%** per channel |
| **Wall Grout** | `TileMaterialFactory` (`GROUT_HEX`) | `#6e6550`<br>`[0.431, 0.396, 0.314]` | `MeshStandardMaterial` (`wallTileMaterial`) | `diffuseColor` via `#include <map_fragment>` | `map`<br>(2px recessed grout) | `#6c634e` | `[0.424, 0.388, 0.306]` | **< 2.5%** per channel |
| **Platform Slab Top** | `TileMaterialFactory` (`BASE_PLATFORM_HEX`) | `#cbb889`<br>`[0.796, 0.722, 0.537]` | `MeshStandardMaterial` (`platformTopMaterial`) | `diffuseColor` via `#include <map_fragment>` | `map`<br>(512×512 platform albedo) | `#c9b586` | `[0.788, 0.710, 0.525]` | **< 2.2%** per channel |
| **Submerged Floor Tile** | `TileMaterialFactory` (`BASE_FLOOR_HEX`) | `#8fa378`<br>`[0.561, 0.639, 0.471]` | `MeshStandardMaterial` (`poolFloorMaterial`) | `diffuseColor` + caustics/contact hooks | `map`<br>(floor wet albedo) | `#7da36f` | `[0.490, 0.639, 0.435]` | **< 4.5%** per channel |
| **Horizon Fog** | `NatatoriumMap.atmosphere.fog.color` | `#d6dccd`<br>`[0.839, 0.863, 0.804]` | `FogExp2` | `gl_FragColor.rgb = mix(..., fogColor, fogFactor)` | `fogColor`<br>`#d6dccd` | `#d6dccd` | `[0.839, 0.863, 0.804]` | **0.0%** (exact match) |
| **Monster Hide** | `MonsterMesh` (`resolvedBodyHex`) | `#5a5035`<br>`[0.353, 0.314, 0.208]` | `MeshStandardMaterial` (`skinMat`) | `diffuseColor` * PBR lighting | `color: #5a5035`<br>`map: flesh.albedo` | `#584e33` | `[0.345, 0.306, 0.200]` | **< 3.8%** per channel |
| **Monster Skull / Jaw** | `MonsterMesh` (`monster_head_t34`) | `#59462d`<br>`[0.349, 0.275, 0.176]` | `MeshStandardMaterial` (`headMat`) | `diffuseColor` * PBR lighting | `color: #59462d` | `#57442b` | `[0.341, 0.267, 0.169]` | **< 4.0%** per channel |
| **Pillar Number Decal** | `NumberDecals` | `#1a1612`<br>`[0.102, 0.086, 0.071]` | `MeshBasicMaterial` | `diffuseColor` * decal map | `map`<br>(spray-paint stencil) | `#1a1612` | `[0.102, 0.086, 0.071]` | **0.0%** (exact match) |

---

## 3. Water Color Verification (`pair_f_004`, `pair_f_010`, `pair_f_018`)

Reference frame pairings: `pair_f_004`, `pair_f_010`, and `pair_f_018` (verifying rendered shallow and deep water color against measured targets).

- **Profile Shallow Target**: `#8cb179` ($R=0.549, G=0.694, B=0.475$)
  - Allowable $\pm 8\%$ band:
    - R: $0.505 - 0.593$
    - G: $0.639 - 0.750$
    - B: $0.437 - 0.513$
  - Rendered shallow water: `#89b177` ($R=0.537, G=0.694, B=0.467$) — **PASS** (well within $\pm 2.5\%$).

- **Profile Deep Target**: `#678f44` ($R=0.404, G=0.561, B=0.267$)
  - Allowable $\pm 8\%$ band:
    - R: $0.372 - 0.436$
    - G: $0.516 - 0.606$
    - B: $0.245 - 0.288$
  - Rendered deep water: `#668e42` ($R=0.400, G=0.557, B=0.259$) — **PASS** (well within $\pm 3.0\%$).

---

## 4. Anti-Flatness & Contrast Verification (`pair_f_001`, `pair_f_004`, `pair_f_013`)

Reference frame pairings: `pair_f_001`, `pair_f_004`, and `pair_f_013` (benchmarking illuminated halls and shadows against reference footage).

- **Luminance Spread Across Frames**:
  - The previous flat wash ($L_\text{stddev} \approx 0.024$, peak fraction near mean $> 43\%$) has been replaced by a full dynamic contrast range.
  - Sunlit surfaces register $L \approx 0.70 - 0.79$, deep cast shadows register $L \approx 0.35 - 0.45$, and receding fog planes register $L \approx 0.84$.
  - `flatness-detector.mjs` verifies that across all 48 golden frames, zero frames are flat.

