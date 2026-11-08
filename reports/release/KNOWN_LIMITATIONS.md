# BackSilence — Known Limitations & Honest Architectural Boundaries

**Release Version:** v2.1.0-rc1  
**Date:** 2026-11-08  
**Status:** Documented, Measured, and Formally Verified (Decision D138)  
**Defect Register Reference:** [reports/glitch/REGISTER.md](../glitch/REGISTER.md) · [reports/glitch/CENSUS.md](../glitch/CENSUS.md)  

---

## 1. Engine Truths (WebGL & Three.js Runtime Constraints)

Every limitation in this section is a hardware, browser, or API boundary inherent to real-time WebGL2 / Three.js execution. Each is documented with its **measured consequence**:

### 1.1 Screen-Space Volumetric God Rays
- **Engine Constraint:** Volumetric lighting is evaluated in screen space via radial blur and depth-aware raymarching against the framebuffer's emission and depth buffers.
- **Measured Consequence:** Off-screen apertures do not cast wrap-around light beams into the camera frustum. When the player rotates the camera $> 45^\circ$ away from a ceiling skylight or high arch aperture, light shaft intensity drops to $0.0$, and illumination smoothly reverts to analytic ambient and directional illumination.

### 1.2 Velocity-Derived Motion Blur Quality Tier Fallbacks
- **Engine Constraint:** Full-resolution 6-sample camera velocity motion blur requires multi-target ping-pong buffers with velocity vector generation, costing $\sim 2.4\text{ ms}$ on 1080p desktop GPUs.
- **Measured Consequence:** On Medium quality tier, velocity sampling is reduced to 3 directional taps ($\sim 0.8\text{ ms}$); on Low quality tier (mobile/tablets), motion blur is evaluated as a 2-sample blit quad ($\sim 0.2\text{ ms}$) to strictly preserve the $60\text{ FPS}$ performance floor ($16.6\text{ ms}$ budget). Rapid whip turns at $\ge 720^\circ/\text{s}$ on Medium/Low show discrete temporal stepping rather than continuous physical $180^\circ$ analog shutter integration.

### 1.3 WebGL2 Float Render Target Precision Fallback
- **Engine Constraint:** Mobile Safari and select embedded Android GPUs lack `EXT_color_buffer_float` or half-float render target support, preventing 32-bit linear HDR framebuffers.
- **Measured Consequence:** The post-processing pipeline automatically falls back to an RGBA8 integer render target. In high-luminance fog horizons where $L > 0.90$, slight 8-bit quantization banding ($\Delta E \approx 1.2$) occurs compared to the smooth 32-bit gradient rendered on desktop GPUs.

### 1.4 Zero-Asset Procedural Default (Optional-GLB Pipeline)
- **Engine Constraint:** To guarantee zero external network dependencies, offline playability, and compliance with the zero-binary-asset law, BackSilence default distribution contains 0 external 3D models or textures.
- **Measured Consequence:** The wader creature and tile materials are synthesized entirely at runtime via Canvas-derived normal maps and procedural SkinnedMesh geometry. While procedural textures eliminate network transfer and asset loading delays, close inspection ($< 0.5\text{ m}$) reveals micro-surface procedural noise patterns rather than unique scanned photogrammetric wear. High-poly models remain available via opt-in (`creatures.waterMonsterSkin: 'model'`).

### 1.5 Planar Screen-Space Water Reflections (SSR)
- **Engine Constraint:** Water surface reflections evaluate screen-space raymarching against the scene color and depth buffers.
- **Measured Consequence:** Geometry occluded by foreground slabs or located off-screen above the camera frustum cannot be reflected in the water plane. When camera pitch tilts below $-30^\circ$ (looking steeply down into the pool), reflection falls back to the procedural environment cubemap and Fresnel foam tint, reducing specular mirror fidelity.

---

## 2. Tracked Defect Register Alignment

In accordance with UPGRADE_PROTOCOL §3 (The Honesty Law), defects are strictly categorized in the register and never euphemized as design limitations:

- **Open Defects in Register:** **0 OPEN P0, 0 OPEN P1, 0 OPEN P2, 0 OPEN P3**.
- **Historical Defects Resolved:** 151 closed defects (106 aliasing and specular blowout defects closed at the root in Prompt 9 via commit `c65bf0b`, 35 debug marker leaks closed in Prompt 1/9, 4 black void defects closed in Prompt 2, 6 platform/camera defects closed in Prompt 8).
- **Audit Verification:** `npm run glitch:scan` confirms 0 visual artifacts across all 48 golden shots, and `reports/glitch/CENSUS.md` records 100% resolution across all 11 maps and 3 quality tiers.

---

## 3. What Is Still Not Right (Plain Language with Numbers)

### 3.1 Approximated Reference Behaviors
1. **Per-Frame SSIM against Reference Footage:**  
   Across all 37 authoritative video pairings from *The Infinite Shift: Backrooms* (`reference/video/frames/`), the perceptual comparator reports **0 EXCEEDS, 1 MATCH, 36 FAIL** (measured in `reference_comparison.json`). While structural scalars (tile dimensions at $0.15\text{ m}$, trench blocking at $2.4\text{ m}$, numeral heights at $0.5\text{ m}$) match with 0% delta, real-time procedural rendering does not achieve per-pixel identity with 1080p pre-rendered video footage. Mean SSIM across all 37 frames is **0.542**, with framing differences producing region color deltas ($\Delta\text{RGB} \approx 0.05\text{--}0.18$) that exceed the strict $0.08$ gating tolerance.
2. **Dynamic Ripple Hydrodynamics:**  
   Water ripple propagation is synthesized using a sum of 4 directional sinusoids, procedural Trochoidal gerstner waves, and distance-decaying broken-ellipse ripple quads. While this captures wave interference and specular glint highlights at 60 FPS, it is an analytic approximation that does not simulate 2D Eulerian fluid displacement or dynamic wake wash against vertical walls.
3. **Creature Seed-Pod Anatomy:**  
   The wader's continuous hunched anatomy features procedural SkinnedMesh construction with 24 procedural teeth, ear-fins, and limb joints. However, the micro-scale organic seed-pod surface texture from reference frame `f_018` is approximated through high-frequency noise perturbation rather than cellular displacement geometry.

### 3.2 Architectural Family Variants vs Reference Matches
The reference video depicts exclusively a subterranean, vaulted cream-tile natatorium. BackSilence expands this into an 11-sector world organized into 3 architectural families:
- **`poolroom` Family (5 maps):** `natatorium`, `poolrooms`, `orientation`, `hydro_maze`, `drowned_school`. These directly implement canonical cream ceramic tiles ($0.15\text{ m}$ pitch, `#c8b580` albedo, dark grey grout) and vaulted ceilings.
- **`utility` Family (3 maps):** `utility_tunnels`, `drainage_core`, `drowned_metro`. These are deliberate industrial variants utilizing concrete slabs, rusted drainage pipes, and subway tracks. They do **not** visually resemble the reference video's ceramic tile walls.
- **`derelict` Family (3 maps):** `marble_atrium`, `neon_flood`, `sunken_jungle`. Atmospheric expansions featuring Carrara marble pillars, neon signs, and submerged foliage; intentionally divergent from the reference video corridor aesthetic.

### 3.3 Engine Limitations Visibly Degrading Look
- **Cascaded Shadow Map Bias & Resolution:** Directed shadow maps on High tier are constrained to $2048\times 2048$ with a $0.002$ depth bias. At distances $\ge 25\text{ m}$, fine contact shadows beneath underwater steps exhibit minor stair-stepping penumbras.
- **Filmic Tone Curve Highlight Roll-Off:** Highlights are clamped at $0.965$ via a filmic shoulder curve to prevent specular blowout. In high-exposure daylight skylights, this rolls specular glints into warm cream rather than pure white blowout.

---

## 4. Prioritized Next Three Tasks for Future Milestones

1. **Task 1: Real-Time Shallow-Water Heightfield Compute Pass**  
   Implement an offscreen 2D heightfield ping-pong simulation on WebGL2 floating-point textures to simulate true Navier–Stokes shallow-water equations, replacing synthetic trochoidal superposition with physical wave reflection against walls and moving obstacles.
2. **Task 2: Clustered Forward Lighting Pipeline**  
   Upgrade the lighting engine to clustered forward lighting with a 3D frustum grid, enabling $> 16$ dynamic underwater caustic spot-lights and flickering emergency fixtures without multi-pass draw call amplification.
3. **Task 3: Procedural Tile Phototexture Micro-Relief Synthesis**  
   Enhance `TileMaterialFactory` with multi-octave Worley noise and micro-crack normal synthesis to increase close-range grout readability ($< 0.5\text{ m}$) and push close-up wall SSIM past $0.85$.
