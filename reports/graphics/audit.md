# Graphics Render Path & Material Audit

**Date:** Sun, 25 Oct 2026 09:55:00 GMT  
**Target:** BackSilence Visual Presentation & Graphics Pipeline  
**Auditor:** Antigravity Autonomous Graphics System  

---

## 1. Tone Mapping & Color Space Handling

### 1.1 Tone Mapping Audit
- **Renderer Tone Mapping:** `src/engine/Renderer.ts` specifies `this.renderer.toneMapping = ACESFilmicToneMapping`.
- **Composer Chain:** `src/engine/PostFX.ts` employs `EffectComposer` with a terminal `OutputPass`.
- **Double Tone Mapping Risk:** When `OutputPass` is active in `EffectComposer`, if `renderer.toneMapping` remains active, tone mapping can be applied twice unless properly coordinated.
  - *Current State:* `PostFX.ts` configures `OutputPass`. In Three.js r170, `OutputPass` performs tone mapping and color space conversion using the renderer's `toneMapping` and `outputColorSpace` properties. When rendering via `composer.render()`, intermediate render passes operate on linear color values, and only `OutputPass` applies the tone mapping curve.
  - *Direct Path Parity:* On `low` quality tier where composer is bypassed, `renderer.render(scene, camera)` directly evaluates `ACESFilmicToneMapping` during the final framebuffer draw.
  - *Recommendation:* Ensure `OutputPass` is the sole point of tone mapping in the composer chain, and enforce parity test between direct and composer paths (mean absolute error $< 1.5\%$).

### 1.2 Color Space Handling
- **Output Color Space:** `this.renderer.outputColorSpace = SRGBColorSpace`.
- **Texture Color Spaces:**
  - Albedo / Diffuse textures (`TileTexture.ts`, `ConcreteTexture.ts`, `MarbleTexture.ts`): Set to `SRGBColorSpace`.
  - Normal, Roughness, Height, Metalness, Caustics masks: Must remain `NoColorSpace` (linear raw data).
  - *Verification:* Verified in `src/procedural/textures/PbrMaterialKit.ts` and `TileTexture.ts` — raw data maps use `NoColorSpace` preventing gamma distortion.

---

## 2. Atmospheric Fog & Shader Chunk Integration

### 2.1 Fog Architecture
- **Fog Model:** Exponential squared fog (`FogExp2`) with density $\approx 0.034 - 0.05$ across maps (`#d9d3a2` on `natatorium`).
- **Shader Chunk Integration:** Standard Three.js PBR surfaces (`MeshStandardMaterial`) utilize `<fog_pars_fragment>` and `<fog_fragment>` chunks.
- **Water Shader Integration:** `WaterMaterial.ts` implements analytic volumetric exponential squared extinction in world space, matching `scene.fog`.
- **In-Scatter Glow Deficit:** Current standard fog chunks lack forward solar in-scattering (Mie-like scattering). Distant fog appears flat rather than luminous when looking toward the sun/skylight.
  - *Phase D Requirement:* Add an in-scatter term $\mathbf{L}_{\text{fog}} = \mathbf{C}_{\text{fog}} \cdot (1 + g \cdot (\mathbf{v} \cdot \mathbf{l})^2)$ to brighten fog towards the key light direction, creating the glowing horizon haze seen in the Visual Bible.

---

## 3. Shadow Mapping & Shadow Biasing

### 3.1 Shadow Rig Audit
- **Shadow Map Type:** `PCFSoftShadowMap` on High tier; `PCFShadowMap` on Medium; contact shadows / disabled on Low tier.
- **Directional Key Light:** In `NatatoriumMap.ts`, sun light position: `{ x: 0.35, y: 0.9, z: 0.25 }` with intensity 1.3.
- **Shadow Acne & Peter-Panning:**
  - Standard bias currently defaults to 0.0 in several lights, risking shadow acne on large flat tile floors at grazing angles.
  - *Required Tuning:* Configure `light.shadow.bias = -0.0004` and `light.shadow.normalBias = 0.02` with texel snapping to the directional shadow camera orthographic grid.

---

## 4. Textures, Filtering, Anisotropy & LOD Bias

### 4.1 Texture Filtering & Anisotropy
- **Tile Texture Resolution:**
  - Low tier: 256x256
  - Medium tier: 512x512
  - High tier: 1024x1024
- **Anisotropy:** Currently defaults to 1 or 4. At grazing angles along long pool decks (e.g. 40m views), low anisotropy causes tile grout lines to blur into muddy soup.
  - *Action:* High tier must query `renderer.capabilities.getMaxAnisotropy()` (typically 8–16), Medium tier set to 4, Low tier set to 1.
- **Texture LOD Bias (Mip Bias):**
  - Mip bias of -0.5 on tile materials ensures 0.15m tiles remain legible up to 20m distance without introducing high-frequency shimmering.

---

## 5. Geometry, Budgets, Draw Calls & Overdraw

### 5.1 Geometry & Draw Call Metrics
- **Measured on Default Map:** 170,128 triangles and 174 draw calls on Low tier.
- **Budget Limits:**
  - Triangles: $\le 300\text{k}$ max ($\ge 120\text{k}$ target for default map richness).
  - Draw Calls: $\le 240$ max ($\ge 120$ target).
  - Texture Memory: $\le 36\text{ MB}$.
- **Batching Opportunities:**
  - Repeated architectural props (pillars, brass railings, floor vents, ladders) currently rendered as individual meshes.
  - Grouping into `InstancedMesh` for repeated fittings will reduce draw call pressure while allowing rich 3-depth-layer set dressing.

### 5.2 Overdraw & Depth Pre-Pass
- `GameSession.ts` utilizes an opaque depth pre-pass (`opaqueDepthTarget`) for depth-aware water rendering.
- Opaque meshes render with `depthWrite: true` and `depthTest: true` sorted front-to-back by Three.js default renderer.
- Water surface rejects underwater refraction samples that lie in front of the water plane.

---

## 6. External Overlays & Non-Pipeline Shading

### 6.1 Static CSS Scanline Overlay Audit
- **Problem Statement:** An external `vhs-css-fallback` overlay element sits in the DOM outside the WebGL pipeline:
  ```css
  background-image: repeating-linear-gradient(0deg, rgba(0,0,0,0.18), rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px), radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%);
  ```
  - It applies a static non-linear darkening over the entire canvas, ignores per-map lighting, flattens luminance contrast, and cannot scale with player tension or dread.
- **Remediation Plan (Phase E):**
  - Replace CSS scanlines with a procedural shader pass in `vhs.glsl.ts` that directly reads `vhsIntensity`, `tension`, and `dread`.
  - Remove or hide the DOM element entirely when the shader pipeline is active.
  - Enforce photosensitivity limits: frame-to-frame luminance delta $\le 0.25$, flash frequency $\le 3\text{ Hz}$.
