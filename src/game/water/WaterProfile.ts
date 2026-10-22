/* ── WaterProfile.ts ───────────────────────────────────────────────────────
 *  Water profiles specifying optical absorption, opacity, foam, normal scaling,
 *  murk, and bioluminescent emission per map.
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
    shallow: '#72bca5',
    deep: '#2e6358',
    opacityMin: 0.55,
    opacityMax: 0.93,
    foam: 0.25,
    normalStrength: 1.0,
    scroll: 0.04,
    specular: '#f5edd6',
    murk: 0.0,
  },
  utility_tunnels: {
    shallow: '#5a5a32',
    deep: '#26301c',
    opacityMin: 0.8,
    opacityMax: 0.97,
    foam: 0.15,
    normalStrength: 0.8,
    scroll: 0.03,
    specular: '#8a7a50',
    murk: 0.25,
  },
  marble_atrium: {
    shallow: '#a9d4cf',
    deep: '#5da3a0',
    opacityMin: 0.4,
    opacityMax: 0.8,
    foam: 0.2,
    normalStrength: 1.2,
    scroll: 0.05,
    specular: '#ffffff',
    murk: 0.0,
  },
  hydro_maze: {
    shallow: '#7fb8b0',
    deep: '#356b6a',
    opacityMin: 0.5,
    opacityMax: 0.9,
    foam: 0.35,
    normalStrength: 1.1,
    scroll: 0.06,
    specular: '#d0f0ec',
    murk: 0.05,
  },
  drainage_core: {
    shallow: '#0c2a2a',
    deep: '#021210',
    opacityMin: 0.9,
    opacityMax: 0.99,
    foam: 0.1,
    normalStrength: 0.7,
    scroll: 0.02,
    specular: '#104038',
    murk: 0.1,
    bioluminescence: {
      color: '#3ff2c8',
      ripple: 1.4,
      ambient: 0.25,
      motes: 160,
    },
  },
};
