# Task List — BackSilence Graphics, Surroundings & Elevation (Prompt 3 of 5)

- [x] **Preconditions & Setup (Section 0 & 2)**
  - [x] 0.1 Verify headless Chrome default map load and canvas non-blank
  - [x] 0.2 Inspect render path (direct vs composer), tone mapping, color space, fog, shadows
  - [x] 0.3 Measure triangle count, draw calls, texture memory, frame times across tiers
  - [x] 0.4 Check `reference/` status and frame count
  - [x] 0.5 Write results to `reports/graphics/preconditions.md`
  - [x] 0.6 Extend `scripts/reference/extract-stats.mjs` and `compare.mjs` for tile autocorrelation & fog curve
  - [x] 0.7 Record Decision D086 in `DECISIONS.md`

- [x] **Phase A: Baseline Measurement & Audit (Section 5)**
  - [x] A.1 Add graphics look-dev camera presets in `shots.json` (spawn view, along slab edge, pillar numeral at 8m, arch in fog at 25m, tagline wall, trench from slab, long horizon view, close tile wall, floor through water, monster at 25m, 9:16 portrait)
  - [x] A.2 Render baseline shots and metrics into `reports/graphics/baseline/`
  - [x] A.3 Score shots 0–5 across rubric pillars with 1-sentence justifications
  - [x] A.4 Conduct line-by-line render path audit in `reports/graphics/audit.md`
  - [x] A.5 Commit Phase A

- [x] **Phase B: Scale, Elevation & Scale Lab (Section 6)**
  - [x] B.1 Measure reference frames / Visual Bible using 0.15m tile grid; write `reports/graphics/elevation.md`
  - [x] B.2 Confirm or adjust `WORLD` constants if > 15% divergence
  - [x] B.3 Implement interactive Scale Lab at `?lab=scale` (1.65m silhouette, 0.15m grid overlay, rulers)
  - [x] B.4 Verify sightlines (numeral at 10m, arch silhouette at 25m, >=2 horizon silhouette layers)
  - [x] B.5 Record Decision D088 and commit Phase B

- [x] **Phase C: PBR Mosaic Tiles, Decals & Surroundings (Section 7)**
  - [x] C.1 Procedural mosaic tiles (16x16 per 2.4m, 1-2px grout at 512px, lightness/hue/sat variation, mottling, bevels, cracks)
  - [x] C.2 Full PBR set (albedo, normal from heightfield, roughness, AO, mipmaps, anisotropy, LOD bias)
  - [x] C.3 Parallax occlusion mapping within 6m (Medium and High)
  - [x] C.4 Slabs & fittings (bullnose edges, drain grates, handrails, ladders, lane ropes, markers, numerals, vents, friezes, pipe runs)
  - [x] C.5 Shared wet shader chunk (below `waterY + 0.35m` darken diffuse, lower roughness, noisy tidemark; damp streaks above)
  - [x] C.6 Instanced decal quads (stains, cracks, drips, black marker graffiti, giant spray-painted numerals)
  - [x] C.7 Baked vertex AO and contact darkening at slab bases
  - [x] C.8 Record Decision D089 and commit Phase C

- [x] **Phase D: Lighting Rig, Fog In-Scatter & Horizon Blowout (Section 8)**
  - [x] D.1 Lighting rig (warm hemisphere, soft directional key with texel-snapped shadow, faint fill, water bounce)
  - [x] D.2 Atmospheric fog + in-scatter term forward toward key light
  - [x] D.3 Horizon blowout with 2-3 layers of instanced far silhouettes in haze
  - [x] D.4 Tone mapping comparison (ACES vs AgX vs Neutral) with `reference:compare`, single `OutputPass`
  - [x] D.5 Auto exposure (4-frame luminance chain, 1.2s easing)
  - [x] D.6 Procedural 3D LUT color grade per map (warm cream lift, teal shadows, +6% to +8% sat)
  - [x] D.7 Light shafts and vertical dust motes at ceiling openings
  - [x] D.8 Record Decision D090 and commit Phase D

- [x] **Phase E: Camera Stack, Lens Effects & Shader VHS (Section 9)**
  - [x] E.1 Resolution scale & clean upsampling (0.75-0.90)
  - [x] E.2 Thresholded bloom pass on highlights and fog
  - [x] E.3 Camera motion blur (velocity from depth and previous VP matrix)
  - [x] E.4 Lens stack: chromatic aberration (0.0006-0.0031), vignette, film grain, barrel distortion (0-0.03)
  - [x] E.5 Replace static CSS scanlines with procedural shader VHS pass scaling with dread; remove CSS overlay when active
  - [x] E.6 Photosensitive safety verification (< 0.25 frame delta, <= 3 Hz flash)
  - [x] E.7 9:16 Portrait camera mode and golden framing
  - [x] E.8 Record Decision D091 and commit Phase E

- [x] **Phase F: Set Dressing & 10 Maps Elevation (Section 10)**
  - [x] F.1 3 depth layers per view (foreground clutter, midground architecture, background silhouettes)
  - [x] F.2 Points of interest in every 16m cell (>= 12 prop types per map, <= 3 draw calls per material per batch)
  - [x] F.3 Leading lines check on hero views
  - [x] F.4 Hero shot suite for default map + 9 other maps with written briefs (rubric average >= 4.0)
  - [x] F.5 Record Decision D092 and commit Phase F

- [x] **Phase G & H: Performance Tiers, Tests & Review Pack (Sections 11–13)**
  - [x] G.1 Performance tier configuration matrix & profiling (draw calls, tris, frame times)
  - [x] H.1 Replay determinism verification before vs after
  - [x] H.2 Composer vs direct render parity test (MAE < 1.5%)
  - [x] H.3 Photosensitive synthetic flash test
  - [x] H.4 Tile moire grazing angle test
  - [x] H.5 Automated test suite in `tests/graphics-pipeline.test.ts`
  - [x] H.6 Contact sheet before/after with rubric scores
  - [x] H.7 Elevation report, scale lab screenshots, limitations report
  - [x] H.8 Final git commit and push command
