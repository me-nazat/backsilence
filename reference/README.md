# BackSilence Look-Dev Reference Stills (`reference/README.md`)

This directory holds visual reference stills captured from the original footage to guide shader calibration, lighting balance, and visual rubric evaluation.

Files in this folder are dev-only and excluded from production builds and bundle audits.

---

## Required Reference Stills

To benchmark visual fidelity in `npm run shots`, place the following four reference PNG images in this directory:

1. `reference/01_tagline_wall.png`:
   - **Scene:** The starting room wall texture featuring the distressed red/black tagline: *"IF YOU ARE SILENT, IT CANNOT HEAR YOU."*
   - **Visual targets:** Plaster grime, uneven decal stenciling, subtle tile grout reflection, VHS tape grain and scanline warping.

2. `reference/02_tan_tile_milky_water.png`:
   - **Scene:** Shallow flooded corridor showing pale beige/tan pool tiles submerged under milky pale-green water.
   - **Visual targets:** Beer-Lambert absorption showing tile grid clearly in shallow regions, turning soft opaque turquoise-green at 0.5–1.0 m depth, gentle caustics, soft shoreline foam line.

3. `reference/03_numbered_pillar.png`:
   - **Scene:** Giant weathered concrete/tile column with faded roman/arabic numerals (e.g., "4" or "7") submerged at the base.
   - **Visual targets:** Wet-darkening tide mark with noisy meniscus, grime streaks, specular highlights from ceiling skylights, vertical depth fog layering.

4. `reference/04_monster_wading.png`:
   - **Scene:** The predatory water monster wading through the distance (25–45 m) in thick chlorine haze.
   - **Visual targets:** Distinct silhouette boosted against fog (~40% reduced attenuation), bow wake V-angle, dark splash droplets, hunched posture, submerged leg darkening.

---

## Evaluation Workflow

When running `npm run shots`, the visual test harness compares deterministic renders against these reference targets across 7 rubric pillars:
- Composition
- Depth Layering
- Material Richness
- Lighting & Atmosphere
- Water Believability
- Creature Readability
- Absence of Artifacts
