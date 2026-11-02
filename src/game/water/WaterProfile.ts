/* ── WaterProfile.ts ───────────────────────────────────────────────────────
 *  Water profiles specifying optical absorption, opacity, foam, normal scaling,
 *  murk, and bioluminescent emission per map. Every colour sits inside the measured
 *  water band (hue 85–113°, sat 0.32–0.52, val 0.35–0.69); see tests/map-colour-bands.test.ts.
 * ──────────────────────────────────────────────────────────────────────── */

import type { MapId } from '../../types/contracts.js';

export interface WaterProfile {
  shallow: string;
  deep: string;
  opacityMin: number;
  opacityMax: number;
  foam: number;
  normalStrength: number;
  scroll: number;
  specular: string;
  murk: number; // extra depth-independent opacity (Map 2)
  bioluminescence?: {
    color: string;
    ripple: number;
    ambient: number;
    motes: number;
  };
}

export const WATER_PROFILES: Record<MapId, WaterProfile> = {
  poolrooms: {
    shallow: '#7ea868',
    deep: '#5c8042',
    opacityMin: 0.55,
    opacityMax: 0.93,
    foam: 0.25,
    normalStrength: 1.0,
    scroll: 0.04,
    specular: '#b3bb9f',
    murk: 0.0,
  },
  utility_tunnels: {
    shallow: '#688550',
    deep: '#4a6130',
    opacityMin: 0.8,
    opacityMax: 0.97,
    foam: 0.15,
    normalStrength: 0.8,
    scroll: 0.03,
    specular: '#b9bb9a',
    murk: 0.25,
  },
  marble_atrium: {
    shallow: '#7ead72',
    deep: '#5a854a',
    opacityMin: 0.4,
    opacityMax: 0.8,
    foam: 0.2,
    normalStrength: 1.2,
    scroll: 0.05,
    specular: '#d6dccd',
    murk: 0.0,
  },
  hydro_maze: {
    shallow: '#78a368',
    deep: '#557a40',
    opacityMin: 0.5,
    opacityMax: 0.9,
    foam: 0.35,
    normalStrength: 1.1,
    scroll: 0.06,
    specular: '#cdd6bd',
    murk: 0.05,
  },
  drainage_core: {
    shallow: '#556b3e',
    deep: '#475c2e',
    opacityMin: 0.9,
    opacityMax: 0.99,
    foam: 0.1,
    normalStrength: 0.7,
    scroll: 0.02,
    specular: '#a9b08e',
    murk: 0.1,
    bioluminescence: {
      color: '#8ea05a',
      ripple: 0.45,
      ambient: 0.06,
      motes: 40,
    },
  },
  natatorium: {
    shallow: '#8cb179',
    deep: '#678f44',
    opacityMin: 0.62,
    opacityMax: 0.86,
    foam: 0.15,
    normalStrength: 1.05,
    scroll: 0.04,
    specular: '#d6dccd',
    murk: 0.10,
  },
  drowned_school: {
    shallow: '#789965',
    deep: '#55703d',
    opacityMin: 0.7,
    opacityMax: 0.93,
    foam: 0.2,
    normalStrength: 0.8,
    scroll: 0.02,
    specular: '#c4cdb0',
    murk: 0.2,
  },
  sunken_jungle: {
    shallow: '#5e9453',
    deep: '#3d6631',
    opacityMin: 0.65,
    opacityMax: 0.95,
    foam: 0.45,
    normalStrength: 1.3,
    scroll: 0.06,
    specular: '#d0dcc0',
    murk: 0.15,
  },
  neon_flood: {
    shallow: '#5b7349',
    deep: '#475c32',
    opacityMin: 0.88,
    opacityMax: 0.98,
    foam: 0.1,
    normalStrength: 0.9,
    scroll: 0.03,
    specular: '#c9d6b4',
    murk: 0.1,
  },
  drowned_metro: {
    shallow: '#728f5e',
    deep: '#4e6635',
    opacityMin: 0.75,
    opacityMax: 0.96,
    foam: 0.2,
    normalStrength: 0.9,
    scroll: 0.03,
    specular: '#c0c9aa',
    murk: 0.15,
  },
  orientation: {
    shallow: '#7fad68',
    deep: '#5e8542',
    opacityMin: 0.52,
    opacityMax: 0.94,
    foam: 0.35,
    normalStrength: 1.25,
    scroll: 0.08,
    specular: '#d6dccd',
    murk: 0.0,
  },
};
