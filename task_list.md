# Task List — BackSilence Water System Matching Reference Footage (Prompt 2 of 5)

- [x] **Preconditions & Setup (Section 0 & 2)**
  - [x] 0.1 Verify headless Chrome default map load and canvas non-blank
  - [x] 0.2 Capture water program compile logs and verify no fallback material
  - [x] 0.3 Verify player ripple events reach water uniforms or simulation texture
  - [x] 0.4 Document active water implementation (analytic rings vs GPU simulation)
  - [x] 0.5 Write results to `reports/water/preconditions.md`
  - [x] 0.6 Create `reference/` structure (`README.md`, `video/notes.md`, `targets.json`, git-ignore `video/frames/`)
  - [x] 0.7 Implement `scripts/reference/extract-stats.mjs` and `scripts/reference/compare.mjs` (`npm run reference:compare`)
  - [x] 0.8 Record Decision D079 in `DECISIONS.md`

- [x] **Phase A: Baseline Measurement & Audit (Section 5)**
  - [x] A.1 Add water camera presets to `shots.json` (axial calm, grazing calm, slab edge, wading wake, splashes 0.1/0.5/1.2s, drip ring, horizon, underwater, monster wake, rain)
  - [x] A.2 Render baseline shots and compute stats in `reports/water/baseline/`
  - [x] A.3 Score shots 0–5 across rubric with 1-sentence justifications
  - [x] A.4 Conduct line-by-line audit of water code into `reports/water/audit.md`
  - [x] A.5 Commit Phase A

- [x] **Phase B: Shading Model (Section 6)**
  - [x] B.1 Depth & Absorption (scene depth copy, thickness, Beer-Lambert $\sigma = (0.90, 0.25, 0.45)$, milky veil, $\ge 40\%$ grout line edge density at 0.9m)
  - [x] B.2 Surface Normals (4 Gerstner waves, 3 scrolling detail normals, Toksvig AA, wave sim gradient)
  - [x] B.3 Reflection & Refraction (Fresnel $F_0=0.02$, tiered reflection: gradient / 64px CubeCamera / planar reflection, depth-safe refraction offset, 3cm shoreline soft edge)
  - [x] B.4 Glints & Flashing (up to 16 light proxies, GGX specular roughness 0.06–0.12, 8–14Hz micro-flicker, bloom thresholding, 0.2%–1.5% glints, scrub alias test)
  - [x] B.5 Fog & Horizon (height fog integration, seamless blown-out cream horizon fade)
  - [x] B.6 Record Decision D081 and commit Phase B

- [x] **Phase C: Wave Simulation & Interaction (Section 7)**
  - [x] C.1 Half-float $(h, v)$ ping-pong wave equation (512x512 High, 256x256 Med, substeps $n = \lceil c \cdot dt / (0.7 \cdot dx) \rceil$)
  - [x] C.2 Toroidal camera-following window snapping with newly exposed strip clearing and edge fade
  - [x] C.3 Solid obstacle mask from `GroundGrid` with boundary mirroring for wave reflections
  - [x] C.4 Dynamic impulses: player wading V-wake, footsteps, monster heavy splashes, ceiling drips, rain
  - [x] C.5 CPU reference simulation on 64x64 grid for unit tests
  - [x] C.6 Record Decision D082 and commit Phase C

- [x] **Phase D: Splashes, Drops & Foam (Section 8)**
  - [x] D.1 Animated splash crown mesh (0.4s vertical displacement), simulation ring impulse, 256 pooled instanced droplets
  - [x] D.2 Monster dark droplets (ink tint 30%) and heavier crown splashes
  - [x] D.3 Sparse seeded ceiling drips synced with audio engine
  - [x] D.4 Shoreline foam from thickness, crest foam from negative curvature, persistent 4s decay foam render target on High
  - [x] D.5 Rising bubble particles from splashes and underwater movement
  - [x] D.6 Meniscus transition line and camera lens droplets (1.5s fade, photosensitive-safe)
  - [x] D.7 Record Decision D083 and commit Phase D

- [x] **Phase E: Surroundings & Elevation (Section 9)**
  - [x] E.1 Wet band: tile darkening and gloss below `waterY + 0.35m` with noisy tidemark
  - [x] E.2 Floor and wall caustics (2 samples Med/High, 1 sample Low, depth fading)
  - [x] E.3 Contact shadows / ambient occlusion at slab-water intersection
  - [x] E.4 Underwater presentation: milky green grade, particulate, light shafts, bubbles, muffled audio
  - [x] E.5 Tile-grid elevation audit against `WORLD` constants; document in `reports/water/elevation.md`
  - [x] E.6 Record Decision D083 and commit Phase E

- [x] **Phase F: Quality Tiers, Performance & Mobile (Section 10)**
  - [x] F.1 Low/Medium/High configuration matrix implementation and validation
  - [x] F.2 Measure frame costs at 1080p ($\le 1.0$ms Low, $\le 2.0$ms Med, $\le 3.5$ms High) and mobile 390x844 $\ge 30$ FPS
  - [x] F.3 Pre-compile water shader during initial map loading
  - [x] F.4 Record Decision D084 and commit Phase F

- [x] **Phase G: Tests & Verification (Section 11)**
  - [x] G.1 `waterSelfTest()` (10,000 steps no NaN, energy decay, CPU/GPU agreement $< 1e-3$, wall reflection)
  - [x] G.2 Determinism replay hash verification before vs after
  - [x] G.3 Golden shots SSIM $\ge 0.97$
  - [x] G.4 Reference compare test in-band across all 4 benchmark maps
  - [x] G.5 Fallback test when simulation render targets are unavailable
  - [x] G.6 Record Decision D085 and commit Phase G

- [x] **Review Pack & Final Delivery (Section 12)**
  - [x] Before/after contact sheet with rubric scores ($\ge 4.0$ for all water shots)
  - [x] `reference:compare` table or visual bible compliance statement
  - [x] `reports/water/elevation.md` with measured vs chosen heights
  - [x] Frame strips (splash 0.1/0.5/1.2s, wading wake, drip ring, glint flicker)
  - [x] `waterSelfTest()` logs and timing per tier
  - [x] Limitations report and final git publish command
