# BackSilence Map Family Contract — Architecture, Optical Bands & Vocabulary

## 1. Overview & Governing Principles

The authoritative reference footage establishes a single physical world: a flooded tiled natatorium environment rendered across varying architectural spaces and atmospheric states. Rather than inventing distinct art styles (such as cyberpunk neon, sci-fi cyan bioluminescence, or dark void horror), all eleven maps are strictly governed by **three stylistic families**:

1. **Poolroom Family**: `natatorium`, `poolrooms`, `orientation`, `hydro_maze`, `drowned_school`
2. **Utility Family**: `utility_tunnels`, `drainage_core`, `drowned_metro`
3. **Derelict Family**: `marble_atrium`, `neon_flood`, `sunken_jungle`

Every map expresses its thematic identity solely through **spatial arrangement**, **structural decay**, and **functional props**, while adhering without exception to the measured optical and physical bands:
- **Single Tile Pitch (`WORLD.TILE_METERS`)**: Exactly `0.15 m` everywhere (16×16 ceramic tiles per 2.4 m world texture repeat). Zero UV distortion.
- **Slab Grammar**: Exposed stepping-stone top at `WORLD.PLATFORM_TOP_Y = 0.30 m` above water, with `0.04 m` bullnose bevel edge catching light rim. Waterline contact darkening at `y = 0.0 m`.
- **Water Column**: Pool floor at `y = -0.75 m` (or deeper sumps), with spidery cracked grout fissures legible through the water.
- **Measured Water HSV Band**: Hue `85°–113°` (olive to leaf green; **NEVER teal or cyan**), Saturation `0.32–0.52`, Value `0.35–0.69`. Specular highlights are neutral/pale mint (`#d6dccd` or `#b3bb9f`), never blown pure white or electric cyan.
- **Measured Surface HSV Band**: Slabs and walls hue `38°–48°` (warm tan ceramic), Saturation `0.30–0.56`, Value `0.35–1.0`.

---

## 2. Three Stylistic Families

### Family A: Poolroom
- **Maps**: `natatorium`, `poolrooms`, `orientation`, `hydro_maze`, `drowned_school`
- **Slab Grammar**: Tan ceramic tile platforms (`#c29b56`), 0.30 m top Y, bullnose edges with wet waterline tidemark.
- **Ceiling Architecture**: Barrel-vaulted ceilings with structural ribs (`y = 9.0 m` hall vault, `6.0 m` foyer vault, or `5.0 m` training vault), pierced by large Roman archways (6.5 m × 6.0 m) and recessed rectangular skylights with warm daylight shafts.
- **Prop Vocabulary**: Standard pool equipment — lifeguard observation chairs, stainless steel pool access ladders, buoy lane lines, starting blocks, pace wall clocks, trophy cases, diving towers, color panels, warning markers.
- **Atmospheric Fog**: Neutral pale mint fog (`#d6dccd` / `#b3bb9f`), density `0.0145–0.035`, zero unrendered voids.
- **Mandatory Landmarks (Prompt 6.8)**:
  1. The Tagline Wall: *"IT CAN'T SEE YOU. IT HEARS THE WATER."*
  2. At least one spray numeral on a pillar or wall (`~0.5 m` glyph height).
  3. Hand-painted `'#1'` corner marker.
  4. Three-colour decorative panel (Blue `#2c6bb2`, Yellow `#d9b036`, Green `#3a8c52`).
  5. At least one creature-blockable trench (`width <= 2.4 m`, `overlap >= 3.0 m`).
  6. Submerged cracked-grout floor tile visible through shallow water.

### Family B: Utility
- **Maps**: `utility_tunnels`, `drainage_core`, `drowned_metro`
- **Slab Grammar**: Industrial municipal concrete and tile platforms with yellow hazard safety stripes (`#d9a738`) and dark drainage grates.
- **Ceiling Architecture**: Cast-iron segmented tunnel rings (`r = 3.2–3.8 m`), exposed structural lintels, heavy conduit trays, overhead steam manifolds.
- **Prop Vocabulary**: Industrial fittings — multi-pipe steam manifold headers, riveted cylindrical pressure tanks, hydro-turbine housings, vortex grates, weirs, rail tracks, station signage, ticket machines, turnstiles, cable spools.
- **Atmospheric Fog**: Hazy subterranean mist (`#b9bb9a` / `#a9b08e`), density `0.013–0.025`.
- **Water Profile**: Deep industrial olive (`#5a6b38` / `#485c2c`), with muted olive-toned bioluminescence/effluence in Drainage Core (`#8ea05a`, hue 76°–90°), completely removing all legacy cyan `#3ff2c8`.

### Family C: Derelict
- **Maps**: `marble_atrium`, `neon_flood`, `sunken_jungle`
- **Slab Grammar**: Weathered architectural slabs, sunken paving stones, submerged stone steps.
- **Ceiling Architecture**: Deteriorated glass trusses (`span = 14.0 m`), fallen architectural obelisks, high decayed vaults with fractured skylights.
- **Prop Vocabulary**: Weathered and organic fittings — eroded face plaster formations, classical stone braziers, marble urns, balustrade rails, decayed wooden benches, cable drums, hazard cones, hanging vines, bio-fungi, fern clusters.
- **Atmospheric Fog**: Damp atmospheric haze (`#d6dccd` / `#c9d6b4`), density `0.016–0.04`.
- **Water Profile**: Murky calm olive green (`#769352` / `#566d3a`), with soft ripples and natural water-depth absorption.

---

## 3. Map Analogue & Scope Specification Matrix

| Map ID | Family | Reference Footage Analogue | Status Label | Permitted Architectural & Color Deltas |
|---|---|---|---|---|
| `natatorium` | Poolroom | `f_001`–`f_037` (Video 1 00:00–02:51, Video 2 00:00–00:15) | **CANONICAL REFERENCE** | Exact reference baseline: 9.0m vault, 6.0m foyer, dry side room with spray '2', tagline wall. |
| `poolrooms` | Poolroom | `f_004`–`f_009`, `f_021`–`f_024` | **CANONICAL REFERENCE** | Stepping-stone archipelago across open pool hall; large soft swell, distant arch silhouettes. |
| `orientation` | Poolroom | `f_001`–`f_003`, `f_013`–`f_015` | **CANONICAL REFERENCE** | Compact training basin with 5.0m ceiling, spawn deck, tether demonstrator, 1.2m blockable trench. |
| `hydro_maze` | Poolroom | *None (Synthesized from poolroom hall)* | `FAMILY VARIANT` | High ceramic tile maze partitions (`4.4 m`), blind corners, sump trenches; uses natatorium palette. |
| `drowned_school` | Poolroom | *None (Synthesized institutional variant)* | `FAMILY VARIANT` | Institutional tile wainscot (hue -2° cooler), submerged school desks, stacked chairs, chalkboards. |
| `utility_tunnels` | Utility | *None (Synthesized subterranean variant)* | `FAMILY VARIANT` | Narrow maintenance crawlways (1.8m clearance), steam valve wheels, pipe runs, concrete walls. |
| `drainage_core` | Utility | *None (Synthesized pump cistern variant)* | `FAMILY VARIANT` | Deep pump reservoir, giant turbine grates; bioluminescence re-scoped to dim olive `#8ea05a`. |
| `drowned_metro` | Utility | *None (Synthesized transit terminus)* | `FAMILY VARIANT` | Submerged train platform, vaulted terminus arch, rail tracks, departure boards, iron tunnel rings. |
| `marble_atrium` | Derelict | *None (Synthesized classical variant)* | `FAMILY VARIANT` | Weathered classical atrium, sinking paving stones, bronze bells, eroded plaster formations. |
| `neon_flood` | Derelict | *None (Re-scoped from cyberpunk)* | `FAMILY VARIANT` | **RE-SCOPED**: Replaced neon cyberpunk with flooded commercial atrium, emergency tungsten lamps, olive water. |
| `sunken_jungle` | Derelict | *None (Re-scoped botanical conservatory)* | `FAMILY VARIANT` | **RE-SCOPED**: Overgrown municipal conservatory; natural river foliage, vine canopies, mossy tile. |

---

## 4. Explicit Re-Scoping Decisions

### 1. `neon_flood` (Cyberpunk District -> Flooded Commercial Atrium)
- **Legacy Issue**: Attempted an electric cyberpunk neon aesthetic (`#19f0ff` cyan specular, `#00d8ff` neon lights, blue void fog `#0b1020`), directly contradicting the BackSilence visual contract (*"It is NOT teal or cyan"*).
- **Re-scoping**: Re-scoped as a storm-damaged, abandoned municipal commercial sector. Water is retuned to calibrated olive green (`shallow #5c734a`, `deep #3d4f2b`, `specular #c9d6b4`). Electric cyan lights are replaced with warm emergency sodium/tungsten illumination (`#d9a738`). All geometry is composed of standard LevelArtProps (bollards, barriers, street lamps, signage).

### 2. `drainage_core` (Sci-Fi Bioluminescence -> Subterranean Pumping Cistern)
- **Legacy Issue**: Emitted bright electric cyan bioluminescence (`#3ff2c8`), creating glowing saturated blue water.
- **Re-scoping**: Re-scoped as a municipal deep-water drainage and turbine core. Bioluminescent effluence is dimmed and re-anchored to an olive-compatible organic tone (`#8ea05a`, hue 88°), with ambient emission reduced to `0.06` and ripple gain to `0.45`.

### 3. `sunken_jungle` (Fantasy Flora -> Flooded Botanical Conservatory)
- **Legacy Issue**: Saturated emerald green water (`#4f8f6a`, hue 145°) and un-grounded tropical foliage.
- **Re-scoping**: Re-scoped as a decaying, flooded municipal botanical conservatory. Water retuned to measured leaf-olive (`shallow #53943b`, `deep #31661f`). Slabs use standard bullnose ceramic edges covered with decaying organic matter and hanging vines.
