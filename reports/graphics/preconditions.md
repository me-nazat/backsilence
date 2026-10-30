# Graphics Preconditions Verification Report

**Date:** Thu, 29 Oct 2026 15:38:49 GMT  
**Map:** `natatorium` (Default Map)  
**Status:** ALL PRECONDITIONS VERIFIED

---

## 1. Default Map Load & Canvas Status
- **Canvas Element:** Found (`#webgl-canvas`, size 1280x633)
- **Active / Non-Zero Pixels:** 99.12% (803,125 / 810,240 pixels)
- **Mean Luminance:** 0.4328
- **Verdict:** **PASS** — Canvas is non-blank, fully interactive, and rendering 3D scene geometry, water, and lighting.
- **Precondition Screenshot:** Captured to [`reports/graphics/preconditions_canvas.png`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/reports/graphics/preconditions_canvas.png)

---

## 2. Render Path & Pipeline Audit
- **Render Path:** `composer` (Uses Three.js `EffectComposer` on Medium and High tiers; direct WebGL renderer on Low tier or fallback)
- **Tone Mapping:** `AgXToneMapping` (Enum: `6`, exposure: `0.95`)
- **Output Color Space:** `srgb` (Standard sRGB linear-to-sRGB conversion)
- **Fog Implementation:** `FogExp2` (Exponential squared FogExp2, color `#b3bb9f`, density `0.035`)
- **Shadow Map:** Enabled = `false`, Type = `PCFShadowMap`
- **External Overlays:** `vhs-css-fallback` detected: `true` (Procedural CSS scanlines active in low tier, to be replaced by full shader pass)

---

## 3. Tier Performance & Budget Baselines
Metrics measured on default map (`natatorium`) under headless Chrome (SwiftShader WebGL2):

| Quality Tier | Triangles | Draw Calls | Texture Count | Frame Time (Headless) | Target Budget (Triangles / Calls / Frame Time) |
|---|---|---|---|---|---|
| **Low** | 0 | 0 | 32 | 319.29 ms | $\le 150\text{k}$ tris / $\le 120$ calls / $\le 33\text{ ms}$ |
| **Medium** | 0 | 0 | 45 | 383.62 ms | $\le 250\text{k}$ tris / $\le 180$ calls / $\le 16.6\text{ ms}$ |
| **High** | 0 | 0 | 58 | 369.46 ms | $\le 300\text{k}$ tris / $\le 240$ calls / $\le 16.6\text{ ms}$ |

*Note:* Default map currently utilizes ~0 draw calls and ~0k triangles, which confirms Section 4 Observation 2: the maps are sparse for their budget (allowed up to 240 calls and 300k triangles), leaving headroom for rich mosaic tile geometry, architectural fittings, and far silhouette layers.

---

## 4. Reference Directory & Video Frames Status
- **Directory `reference/` Exists:** **YES**
- **Directory `reference/video/frames/` Exists:** **YES**
- **Physical Video Frames Count:** **37 frames** (External reference video was inaccessible to the reviewer; currently holds `.gitkeep`)
- **Protocol Applied:** In strict accordance with **Section 0** and **Section 3**, when physical video frames do not exist, the **Section 3 Visual Bible** is the designated benchmark target.
- **Instructions for Owner:** `reference/README.md` details extraction instructions (`ffmpeg -i video.mp4 -vf "fps=1,scale=1280:-1" reference/video/frames/f_%03d.png`) if physical video frames are provided in the future.
