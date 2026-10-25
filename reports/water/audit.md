# BackSilence Water System Line-by-Line Code Audit (Phase A4)

**Date:** Sun Oct 25 07:13:24 UTC 2026
**Target Files:**
- `src/game/water/WaterMaterial.ts`
- `src/game/water/WaterSystem.ts`
- `src/game/water/GpuWaveSimulation.ts`
- `src/game/water/RippleBuffer.ts`
- `src/game/water/WakeEmitters.ts`
- `src/game/water/Splashes.ts`
- `src/game/water/WaterMapData.ts`

---

## 1. Executive Summary
The repository contains an initial implementation of a water shader and wave simulation classes, but several critical subsystems are disconnected, simplified to static analytical approximations, or exhibit shading artifacts. Most notably:
1. `GpuWaveSimulation.initGpu()` is never called in production or presentation updates, meaning the GPU ping-pong simulation pass is completely dormant at runtime;
2. `WaterMaterial` does not sample any wave simulation texture, relying strictly on 32 uniform ripple slots and 6 wake slots;
3. Shading relies on alpha-blending flat color ranges over the floor geometry rather than true physical Beer-Lambert absorption and scattering;
4. Normal maps lack distance filtering / Toksvig anti-aliasing, leading to distant pixel shimmering;
5. Environment reflections are limited to a flat uniform sky-haze vector rather than cube-map or planar reflections;
6. Specular glints lack micro-roughness GGX flashing and temporal flicker;
7. Splashes lack a rising/collapsing animated crown mesh, and droplets allocate memory dynamically rather than using an instanced mesh pool.

---

## 2. Line-by-Line Detailed Audit

### A. `WaterMaterial.ts` (Shaders & Shading Model)

1. **Alpha-Blending Tinted Sheet Artifact (Lines 384–387):**
   - **Current Code:**
     ```glsl
     vec3 baseWaterColor = sceneSample * T + scatter * (1.0 - T);
     vec3 waterColor = mix(mix(uColorShallow, baseWaterColor, 0.75), sceneSample * T, 0.45);
     float alpha = mix(uOpacityMin, uOpacityMax, 1.0 - exp(-waterDepth * 1.8));
     ```
   - **Flaw:** Fixed opacity blending (`uOpacityMin = 0.55`, `uOpacityMax = 0.93`) over the floor turns the water into a semi-transparent colored plastic sheet rather than a volume that absorbs light exponentially. When looking through water, the refracted scene color is already physically attenuated by transmittance $T = \exp(-\sigma \cdot d)$; blending an opaque material alpha on top creates double-attenuation, muddiness, and loss of floor tile grout readability.
   - **Fix for Phase B1:** Pure physical Beer-Lambert presentation:
     $C_{\text{water}} = C_{\text{refracted}} \cdot T + C_{\text{scatter}} \cdot (1 - T) + k_{\text{milky}} \cdot (1 - \text{lum}(T))$, with $\alpha = 1.0$ (except for the 3 cm shoreline soft edge).

2. **Beer-Lambert Absorption Coefficient Hardcoding (Line 380):**
   - **Current Code:**
     `vec3 sigma = -log(max(vec3(0.001), uColorDeep / max(vec3(0.001), uColorShallow))) * 0.85;`
   - **Flaw:** Deriving $\sigma$ from profile color ratios does not match the milky chlorinated green reference footage ($R$ absorbed fast, $G$ absorbed slowly, $B$ absorbed moderately).
   - **Fix for Phase B1:** Calibrate per-channel spectral absorption to $\sigma = (0.90, 0.25, 0.45)\,\text{m}^{-1}$.

3. **Absence of Distance Normal Filtering & Toksvig Anti-Aliasing (Lines 304–313):**
   - **Current Code:**
     Samples 3 detail normal maps at uniform frequencies regardless of distance from camera or viewing angle.
   - **Flaw:** High-frequency normal detail creates severe subpixel aliasing and specular shimmering in mid-to-far water planes under camera motion.
   - **Fix for Phase B2:** Implement Toksvig roughness increase based on normal map variance and fade detail normal slopes to flat with distance.

4. **Missing Environment & Planar Reflections (Lines 388–394):**
   - **Current Code:**
     `vec3 skyHazeColor = vec3(0.95, 0.92, 0.84);`
     `waterColor = mix(waterColor, skyHazeColor, fresnel * 0.68);`
   - **Flaw:** Surfaces at grazing angles reflect a uniform cream color. Platforms, pillars, archways, and lights do not reflect.
   - **Fix for Phase B3:** Tiered reflections: Low = sky/fog gradient; Medium = 64px prefiltered `CubeCamera` rendered once at water height; High = half-resolution planar reflection blurred by wave slopes.

5. **Specular Glints and Highlights (Lines 407–432):**
   - **Current Code:**
     Standard Blinn-Phong term with uniform exponent.
   - **Flaw:** Glints slide across the surface like smooth plastic without the rapid sparkle and flashing seen in real poolrooms footage.
   - **Fix for Phase B4:** Light proxies (up to 16) with GGX micro-specular (roughness 0.06–0.12), modulated by an 8–14 Hz temporal micro-flicker on the 3rd detail normal.

6. **Shoreline Intersection Hard Line (Lines 294–297):**
   - **Current Code:**
     `if (diffZ < -0.05) discard;`
   - **Flaw:** Intersection between water plane and vertical walls or steps produces a hard polygon step discontinuity.
   - **Fix for Phase B3:** Fade water opacity smoothly to 0 over the last 3 cm of depth thickness.

---

### B. `WaterSystem.ts` & `GpuWaveSimulation.ts` (Wave Simulation)

7. **Dormant GPU Ping-Pong Simulation Pass:**
   - **Audit Finding:** In `WaterSystem.ts` (lines 88–92), `this.waveSim = new GpuWaveSimulation(...)` is instantiated, but `this.waveSim.initGpu(renderer)` is NEVER invoked.
   - **Impact:** `this.isGpuReady` remains `false`. In `this.waveSim.step()`, only the CPU fallback solver (`stepCpu`) executes on a 128x128 array. The half-float render targets (`rtA`, `rtB`, `outputTarget`) are never updated, and `WaterMaterial` has no uniform to receive wave heights or normals.
   - **Fix for Phase C:** Wire `waveSim.initGpu(renderer)` in `WaterSystem`, step GPU wave simulation with half-float render targets (512x512 High, 256x256 Med), bind output texture as uniform `uWaveSimTexture`, and sample slopes in `WaterMaterial`.

8. **Missing Wave Obstacle Interference in Material:**
   - **Audit Finding:** Because GPU wave simulation is unlinked, wave ripples currently pass through solid pillars and platforms instead of bouncing off and creating constructive interference patterns.
   - **Fix for Phase C:** Mirror boundary condition in the wave simulation shader using the rasterized `GroundGrid` obstacle mask.

---

### C. `Splashes.ts` & `WakeEmitters.ts` (Particles & Interaction)

9. **Absence of Crown Mesh:**
   - **Audit Finding:** `SplashSystem` creates expanding 2D billboard quads and simple foam discs. There is no 3D animated splash crown mesh.
   - **Fix for Phase D:** Construct a parametric crown mesh with upward vertex displacement that erupts and collapses over 0.4s.

10. **Dynamic Allocation & Droplet Pooling:**
    - **Audit Finding:** Particles are pushed and spliced into JavaScript arrays during burst calls, inducing Garbage Collection overhead.
    - **Fix for Phase D:** Implement an `InstancedMesh` pool of 256 velocity-stretched droplet quads with zero per-frame heap allocations.

11. **Dark Splashes for Monster Impacts:**
    - **Audit Finding:** Monster splash events currently use the same white particle color as player footsteps.
    - **Fix for Phase D:** Tint monster droplets and splash crown with a 30% ink-black attenuation.

---

### D. Surroundings, Elevation & Wet Marks

12. **Surrounding Wet Band & Caustics:**
    - **Audit Finding:** Tiles touching the water surface lack a distinct darkened wet band (`waterY + 0.35m`). Caustics are only computed inside the water fragment shader and do not project onto adjacent dry walls or steps.
    - **Fix for Phase E:** Apply wetness darkening and specular boost to walls below `waterY + 0.35m` with procedural tidemark noise and wall caustics projection.

---

## 3. Prioritized Action Plan
- **Phase B:** Shading model upgrade (Beer-Lambert $\sigma = (0.90, 0.25, 0.45)$, Toksvig AA, reflections, GGX glints, horizon fade).
- **Phase C:** Connect GPU half-float wave simulation ping-pong targets, toroidal window tracking, obstacle reflection.
- **Phase D:** Splash crown mesh, 256 instanced droplets pool, monster dark ink tint, persistent foam target.
- **Phase E:** Tile wet band, caustics on walls, elevation audit.
- **Phase F & G:** Tier performance matrix, `waterSelfTest()` validation, replay hash determinism, golden shots SSIM $\ge 0.97$.
