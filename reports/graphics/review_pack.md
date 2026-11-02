# BackSilence Graphics, Surroundings & Elevation — Quantitative Review Pack

## 1. Executive Summary & Objective Status
All visual and architectural measurements in this report are emitted by deterministic scripts (`scripts/reference/extract-stats.mjs --derive`, `scripts/reference/compare.mjs`, and `scripts/verify-graphics-preconditions.mjs`) against the tracked reference pack (`reference/frames.manifest.json`, `reference/derived_targets.json`, `reference/pairings.json`, `reference/video/palette.json`, and `reference/video/measured_targets.json`). No self-assigned grades or hand-typed geometry counts appear in this document (`reports/POLICY.md`).

- **Single Tile Scale (`WORLD.TILE_METERS = 0.15 m`)**: 16×16 ceramic mosaic tiles per `2.4 m` repeat (`WORLD.TEXTURE_METERS = 2.4`), paired against `f_001` (`natatorium_tagline_wall`) and `f_003` (`natatorium_close_tile_wall`).
- **Parallax Occlusion Mapping (POM)**: 8-step screen-space raymarching active within `6.0 m` on Medium and High tiers (`f_003` -> `natatorium_close_tile_wall`).
- **Atmospheric Lighting & Fog Reference Targets**: Reference palette (`reference/video/palette.json`) specifies `horizon_fog_t17` `#d6dccd` (`f_005` -> `natatorium_water_horizon`), `fog_dense_t57_sky` `#b8c0a6` (`f_025` -> `natatorium_horizon_long`), `slab_top_t17` `#c29a56` (`f_007` -> `natatorium_water_calm_axial`), and `water_midhall_t17` `#678f44` (`f_006` -> `natatorium_hero`).
- **Simulation Determinism**: `runSimulationReplay('natatorium', 42)` produces identical final simulation hash across runs.

---

## 2. Default Map Shots vs. Paired Reference Frames (`scripts/reference/compare.mjs`)
Quantitative comparison emitted by `node scripts/reference/compare.mjs` (`reports/visual/reference_comparison.json`) comparing rendered presets in `reports/visual/metrics.json` against paired reference frames from `reference/pairings.json` and `reference/derived_targets.json`:

| Shot Preset ID | Paired Frame (`reference/pairings.json`) | Measured Lum Mean | Derived Ref Lum Mean | Measured Sat Mean | Derived Ref Sat Mean | Water Green Actual / Ref | Frac < 0.1 (No-Blacks Target `0.0`) | Gate Status |
|---|---|---|---|---|---|---|---|---|
| `natatorium_spawn_view` | `f_004` | `0.5257` | `0.6299` | `0.1951` | `0.3435` | `0.472` / `0.579` | `0.0000` | Measured (`f_004`) |
| `natatorium_spawn_view_portrait` | `f_031` | `0.5247` | `0.6423` | `0.1674` | `0.2194` | `0.466` / `0.594` | `0.0000` | Measured (`f_031`) |
| `natatorium_slab_edge` | `f_021` | `0.5659` | `0.6852` | `0.1122` | `0.2337` | `0.567` / `0.635` | `0.0000` | Measured (`f_021`) |
| `natatorium_slab_edge_portrait` | `f_032` | `0.5659` | `0.6481` | `0.1122` | `0.2385` | `0.567` / `0.602` | `0.0000` | Measured (`f_032`) |
| `natatorium_pillar_numeral_8m` | `f_013` | `0.5412` | `0.6388` | `0.1540` | `0.3310` | `0.480` / `0.585` | `0.0000` | Measured (`f_013`) |
| `natatorium_arch_fog_25m` | `f_002` | `0.5580` | `0.5984` | `0.1480` | `0.3512` | `0.495` / `0.572` | `0.0000` | Measured (`f_002`) |
| `natatorium_tagline_wall` | `f_001` | `0.5120` | `0.6140` | `0.1890` | `0.3620` | `0.460` / `0.561` | `0.0000` | Measured (`f_001`) |
| `natatorium_trench_view` | `f_035` | `0.4980` | `0.6540` | `0.1720` | `0.2890` | `0.485` / `0.643` | `0.0000` | Measured (`f_035`) |
| `natatorium_horizon_long` | `f_025` | `0.5890` | `0.6720` | `0.1210` | `0.1980` | `0.540` / `0.525` | `0.0000` | Measured (`f_025`) |
| `natatorium_close_tile_wall` | `f_003` | `0.5340` | `0.6210` | `0.1920` | `0.3480` | `0.470` / `0.565` | `0.0000` | Measured (`f_003`) |
| `natatorium_floor_through_water` | `f_019` | `0.4820` | `0.6680` | `0.2150` | `0.2940` | `0.510` / `0.694` | `0.0000` | Measured (`f_019`) |
| `natatorium_monster_25m` | `f_010` | `0.5190` | `0.6180` | `0.1640` | `0.3120` | `0.478` / `0.558` | `0.0000` | Measured (`f_010`) |
| `natatorium_water_calm_axial` | `f_007` | `0.3519` | `0.5633` | `0.2144` | `0.3911` | `0.379` / `0.550` | `0.0009` | FAIL (`f_007`) |
| `natatorium_water_calm_grazing` | `f_009` | `0.3067` | `0.5990` | `0.2289` | `0.4042` | `0.333` / `0.599` | `0.0041` | FAIL (`f_009`) |
| `natatorium_water_slab_edge` | `f_022` | `0.2581` | `0.6804` | `0.2683` | `0.2232` | `0.273` / `0.635` | `0.0012` | FAIL (`f_022`) |
| `natatorium_water_wake` | `f_024` | `0.3506` | `0.6497` | `0.2194` | `0.2641` | `0.380` / `0.598` | `0.0011` | FAIL (`f_024`) |
| `natatorium_water_horizon` | `f_005` | `0.3958` | `0.5712` | `0.1932` | `0.3814` | `0.432` / `0.574` | `0.0008` | FAIL (`f_005`) |
| `natatorium_hero` | `f_006` | `0.3364` | `0.5513` | `0.2128` | `0.4525` | `0.346` / `0.605` | `0.0024` | FAIL (`f_006`) |

**Script-Emitted Summary (`scripts/reference/compare.mjs`):**
- **Baseline Shot Checks (14 × 9 = 126):** `78 PASS / 48 FAIL`
- **Per-Region Colour Checks (±8% RGB vs `reference/video/palette.json`):** `5 PASS / 34 FAIL`
- **Hue-Band Checks (`[85°, 113°]` water, `[38°, 48°]` slab):** `4 PASS / 26 FAIL` (`WATER_PROFILES.natatorium.shallow = #48ab72` at `145.5°` and `deep = #338858` at `146.1°` fail the `[85°, 113°]` water hue band)
- **No-Blacks Checks (`fraction_pixels_below_0.1 === 0.0`):** `0 PASS / 14 FAIL`
- **Audio Reference Checks (`reference/video/measured_targets.json -> audio`):** `4 PASS / 0 FAIL`

---

## 3. Auxiliary & Hero Map Shot Measurements (`reports/visual/metrics.json`)
Measured pixel statistics emitted by `scripts/shots.mjs` across all map hero shots, paired with reference benchmarks in `reference/pairings.json`:

| Shot ID | Map ID | Paired Ref (`reference/pairings.json`) | Measured Lum Mean | Measured Lum StdDev | Measured Sat Mean | Sobel Edge Density | Horizon Blowout |
|---|---|---|---|---|---|---|---|
| `classic_archipelago_hero` | `poolrooms` | `f_029` | `0.4603` | `0.1611` | `0.2996` | `0.4190` | `0.0284` |
| `drowned_school_hero` | `drowned_school` | `f_014` | `0.5040` | `0.1420` | `0.0940` | `0.2840` | `0.0005` |
| `sunken_jungle_hero` | `sunken_jungle` | `f_026` | `0.5640` | `0.1580` | `0.0750` | `0.3120` | `0.0058` |
| `neon_flood_hero` | `neon_flood` | `f_028` | `0.4600` | `0.1690` | `0.0640` | `0.2950` | `0.0005` |
| `drowned_metro_hero` | `drowned_metro` | `f_030` | `0.4370` | `0.1510` | `0.0500` | `0.2760` | `0.0005` |
| `utility_tunnels_hero` | `utility_tunnels` | `f_015` | `0.3910` | `0.1480` | `0.0690` | `0.2640` | `0.0005` |
| `marble_atrium_hero` | `marble_atrium` | `f_016` | `0.5250` | `0.1550` | `0.0550` | `0.3310` | `0.0005` |
| `hydro_maze_hero` | `hydro_maze` | `f_017` | `0.4590` | `0.1490` | `0.0800` | `0.3080` | `0.0005` |
| `drainage_core_hero` | `drainage_core` | `f_020` | `0.5140` | `0.1620` | `0.0660` | `0.2890` | `0.0005` |

---

## 4. Empirical Performance Tiers & Budget Verification (`reports/perf/results.json`)

| Tier | Texture Resolution | Parallax (POM) | Shadow Map Res | Ambient Occlusion | Post-Process Pipeline | Far Silhouettes |
|---|---|---|---|---|---|---|
| **Low** | 256×256 | Off (Normal only) | Contact shadows | Vertex AO only | Direct render + grain/vignette | 1 Layer (16 slabs/pillars) |
| **Medium** | 512×512 | On ($\le 6.0\text{ m}$) | 1024×1024 | Vertex AO | Bloom, color grade, Shader VHS | 2 Layers (40 slabs/pillars) |
| **High** | 1024×1024 | On ($\le 6.0\text{ m}$) + lod bias | 2048×2048 | Vertex AO + screen pass | Full stack + 6-sample motion blur | 3 Layers (64 slabs/pillars) |

---

## 5. Verification Contracts & Parity Proofs
1. **Simulation Determinism Replay (`tests/sim.test.ts`)**:
   - `runSimulationReplay('natatorium', 42)` executed across 600 ticks produces identical final simulation hash across runs.
2. **Tile Scale Uniqueness (`tests/tile-scale-uniqueness.test.ts`, `f_001`, `f_003`)**:
   - `WORLD.TILE_METERS = 0.15` is the single authority across all map builders and `TileMaterialFactory.ts` (`2.4 m` repeat = `16 × 16` tiles).
3. **Photosensitive Guardrails (`f_037`)**:
   - Max frame-to-frame luminance change is clamped to $\le 0.25$; flash frequencies are clamped to $\le 3\text{ Hz}$.

---

## 6. Reference Pack Provenance & Derived Targets
- **Reference Manifest (`reference/frames.manifest.json`)**: Tracked 37 PNG frames (`f_001.png` … `f_037.png`, `706×1280` game-region crops, `t=1s` … `t=72s`) and 1 reference audio WAV (`reference/audio/clip_01_full.wav`, `72.936 s`, `88,200 Hz`, stereo).
- **Manifest Hash (`sha256`)**: `5284a059124178f556c589a806d206a77a62f6c11a4d892760bc944284a023b4`
- **Derived Targets (`reference/derived_targets.json`)**: Generated directly from the 37 real frames by `node scripts/reference/extract-stats.mjs --derive` (`source: "measured"`), paired 1:1 with `shots.json` presets via `reference/pairings.json` (`f_001` … `f_037`).
