# Architecture of the Infinite Pool: Preconditions Audit Report (Prompt 4)

**Date:** 2026-11-04  
**Author:** Autonomous Senior Graphics & World Systems Engineer  
**Status:** PRE-FLIGHT AUDIT COMPLETE (Prompt 4)  
**Artifact Path:** `reports/world/preconditions_v2.md`  
**Pairing Citations:** `f_001`, `f_004`, `f_006`, `f_007`, `f_008`, `f_009`, `f_013`, `f_014`, `f_015`, `f_016`, `f_017`, `f_022`, `f_024`, `f_025`, `f_028`, `f_029`, `f_030`, `f_032`, `f_034`, `f_035`, `f_036`

---

## §0 Architectural Pre-flight Audit Summary

The pre-flight audit establishes the baseline architectural state across all 11 maps prior to the unification pass (Prompt 4). While `natatorium` and `poolrooms` have been partially aligned to the reference language, substantial gaps exist across the remaining 9 maps:
- Ceilings on 7 of 11 maps are either unrendered sky voids or flat non-vault boxes, failing the continuous vaulted cream intrados language of `f_004`–`f_007`.
- Arch openings (`buildArchGeometry`) are present only in `natatorium` (8) and `poolrooms` (8), and missing across the remaining 9 maps, preventing gate-arch silhouettes at 25m in fog (`f_008`–`f_009`).
- Slab bullnose edge profiles are absent from `TiledBox.ts`, producing sharp planar edges instead of the rounded bullnose tile rim observed in `f_004`–`f_007` and `f_035`–`f_036`.
- Tiled round pillars with spray-painted black numerals (0.5m digit height) are fully implemented only on `natatorium` (15) and `poolrooms` (9), but absent or limited to a single landmark on other maps (`f_013`–`f_015`).
- Dry room moments (cream plaster walls `#ae9e6c`, small tile feature wall `#c8b580`, dry floor `#cbba8b`, archway to flooded hall beyond) are missing from pure poolroom and industrial maps (`f_013`–`f_015`).
- Strategic 2.4m jumpable trenches (`TRENCH_BLOCK_WIDTH = 2.4m`, `f_035`–`f_036`) are defined only in `natatorium` (2) and `orientation` (2), but missing on the remaining 9 maps.

---

## §1 Per-Map Architectural Preconditions Table (Citing Frames f_004, f_006, f_007, f_008, f_013, f_022, f_025, f_029, f_035)

Audited via `scripts/world/audit-maps-preconditions.mjs`, `measure-natatorium.mjs`, `shots.json`, and `reports/glitch/CENSUS.md`:

| Map ID | Hero Shot Exists? | Ceiling Type | Arch Count | Slab Bullnose? | Pillar Numerals? | Dry Room? | Trench? | Silhouette Layers | Open Census Defects |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `natatorium` | `natatorium_hero` | Vaulted Barrel (9.0m apex) | 8 | No (Sharp) | 15 (Legible 0.5m) | Yes (3) | Yes (2) | 3 Layers (Far) | C6, C10, C120..C151 |
| `poolrooms` | `classic_archipelago_hero` | Open / Unrendered Sky | 8 | No (Sharp) | 9 (Legible 0.5m) | No (0) | No (0) | 3 Layers (Far) | C5, C75, C85, C100..C102 |
| `orientation` | None (`map_orientation_high`) | Flat 5.0m Box | 0 | No (Sharp) | 1 (Spawn Code) | Yes (1) | Yes (2) | 3 Layers (Far) | C73, C82, C84, C109 |
| `hydro_maze` | `hydro_maze_hero` | Flat 5.0m Box | 0 | No (Sharp) | 1 (Exit Code) | No (0) | No (0) | 3 Layers (Far) | C19, C20, C65, C105, C106 |
| `drowned_school` | `drowned_school_hero` | Flat 5.0m Box | 0 | No (Sharp) | 1 (Stage Code) | No (0) | No (0) | 3 Layers (Far) | C12, C17, C18, C63, C104 |
| `utility_tunnels` | `utility_tunnels_hero` | Flat 5.0m Box | 0 | No (Sharp) | 0 (None) | No (0) | No (0) | 3 Layers (Far) | C50, C80 |
| `drainage_core` | `drainage_core_hero` | Flat 8.5m Box | 0 | No (Sharp) | 0 (None) | No (0) | No (0) | 3 Layers (Far) | C13, C14, C59 |
| `drowned_metro` | `drowned_metro_hero` | Flat 5.0m Box | 0 | No (Sharp) | 0 (Plain Columns) | No (0) | No (0) | 3 Layers (Far) | C15, C16, C61, C103 |
| `marble_atrium` | `marble_atrium_hero` | Flat 5.0m Box | 0 | No (Sharp) | 0 (Plain Columns) | No (0) | No (0) | 3 Layers (Far) | C67, C107 |
| `neon_flood` | `neon_flood_hero` | Open / Dark Void | 0 | No (Sharp) | 0 (None) | No (0) | No (0) | 3 Layers (Far) | C46, C47, C48, C71, C108 |
| `sunken_jungle` | `sunken_jungle_hero` | Open / Canyon Canopy | 0 | No (Sharp) | 1 (Exit Code) | No (0) | No (0) | 3 Layers (Far) | C49, C77, C79 |

---

## §2 Dimensional Verification Baseline (`measure-natatorium.mjs`) (Citing Frames f_004, f_007, f_008, f_013, f_018, f_035)

Audited against `reports/world/natatorium_vs_footage.md` following calibration:
- **Hall Vault Apex:** $9.0\text{ m}$ (Reference $9.0\text{ m}$, Delta $0.0\%$, **MATCH**)
- **Foyer Ceiling Height:** $6.0\text{ m}$ (Reference $6.0\text{ m}$, Delta $0.0\%$, **MATCH**)
- **Arch Opening Width:** $6.5\text{ m}$ (Reference $6.5\text{ m}$, Delta $0.0\%$, **MATCH**)
- **Arch Opening Height:** $6.0\text{ m}$ (Reference $6.0\text{ m}$, Delta $0.0\%$, **MATCH**)
- **Slab Top Y Above Water:** $0.30\text{ m}$ (Reference $0.30\text{ m}$, Delta $0.0\%$, **MATCH**)
- **Slab Exposed Thickness:** $0.30\text{ m}$ (Reference $0.30\text{ m}$, Delta $0.0\%$, **MATCH**)
- **Tile Pitch:** $0.15\text{ m}$ (Reference $0.15\text{ m}$, Delta $0.0\%$, **MATCH**)
- **Pillar Diameter:** $1.50\text{ m}$ (Reference $1.50\text{ m}$, Delta $0.0\%$, **MATCH**)
- **Spray Numeral Height:** $0.484\text{ m}$ (Reference $0.50\text{ m}$, Delta $3.1\%$, **MATCH**)
- **Water Depth over Floor:** $0.75\text{ m}$ (Reference $0.75\text{ m}$, Delta $0.0\%$, **MATCH**)
- **Trench Width:** $1.05\text{ m}$ (Reference $1.05\text{ m}$, Delta $0.0\%$, **MATCH**)
- **Camera Eye Height:** $1.65\text{ m}$ (Reference $1.65\text{ m}$, Delta $0.0\%$, **MATCH**)

---

## §3 Architectural Implementation Strategy (Prompt 4 Phases A–E) (Citing Frames f_001, f_004, f_008, f_013, f_022, f_028, f_032, f_035)

1. **Phase A — Unified Canonical Kit:**
   - **Vault Module (`CommonMapBuilder.ts`):** Codify cream barrel/groin vault geometry (color `#b7a775`, apex $9.0\text{ m}$, springline $4.5–5.0\text{ m}$, 16x16 0.15m tile grid) with continuous UV mapping across all maps.
   - **Arch Opening (`ArchBuilder.ts`):** Round-headed arches ($2.4–4.8\text{ m}$ width, soft-filleted reveals radius $0.5\text{ m}$) ensuring arch silhouettes read cleanly at $25\text{ m}$ in fog (`f_008`–`f_009`).
   - **Bullnose Slab Geometry (`TiledBox.ts`):** Implement rounded bullnose edge profile on all exposed slab rims with $0.30\text{ m}$ exposed face showing 4–6 tile rows above water (`f_035`).
   - **Tiled Pillar & Numeral Decals (`TiledCylinder.ts`, `NumberDecals.ts`):** Seamless whole-tile quantization ($U = \text{integer} \times 0.0625$) eliminating vertical rear seam (Glitch C10), with spray-painted black numerals ($0.5\text{ m}$ digit height) seeded per map.
   - **Dry Room Kit:** Plaster walls (`#ae9e6c`), feature tile wall (`#c8b580`), dry floor (`#cbba8b`), and arched portal to flooded hall (`f_013`–`f_015`).
   - **Graffiti & Signage:** Crispy rendered canonical wall texts ("IT CAN'T SEE YOU. / IT HEARS THE WATER.", "#1" / "#2" corner markers, "DON'T SPLASH, IT KNOWS").
   - **Tricolor Far Prop (`LevelArtProps.ts`):** Blue/yellow/green accent prop (`f_032`–`f_034`).

2. **Phase B — Depth Layers & Sightlines:**
   - Enforce 3 depth layers (foreground $< 6\text{ m}$, midground $6–25\text{ m}$, background $\ge 25\text{ m}$) with clean $10–15\text{ m}$ monster sighting lanes on all maps.
   - Verify horizon blowout and far silhouettes at $\ge 25\text{ m}$.

3. **Phase C — 11-Map Propagation:**
   - Upgrade all 11 maps to the canonical kit: vaulted ceilings, gated arch openings, dry room moments, and jumpable $\ge 2.4\text{ m}$ trenches (`TRENCH_BLOCK_WIDTH`).
   - Strengthen `LayoutValidator.ts` with assertions for graph connectivity, trench widths, dry room reachability, and sightline lanes.

4. **Phase D & E — Traversal, Performance & Gating:**
   - Confirm collider congruence, zero ghost walls, and maintain $\ge 60\text{ FPS}$ on medium tier.
   - Close all architecture-class rows in `reports/glitch/CENSUS.md`.
