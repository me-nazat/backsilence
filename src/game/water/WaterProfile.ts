/* ── WaterProfile.ts ───────────────────────────────────────────────────────
 *  Water profiles specifying optical absorption, opacity, foam, normal scaling,
 *  murk, and bioluminescent emission per map. Every colour sits inside the measured
 *  water band (hue 85–113°, sat 0.32–0.52, val 0.35–0.69); see tests/map-colour-bands.test.ts.
 * ──────────────────────────────────────────────────────────────────────── */

import type { MapId } from '../../types/contracts.js';

export interface WaterProfile {
  shallow: string;
  deep: string;
  far?: string;
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
  shallowColor?: string;
  deepColor?: string;
  foamColor?: string;
  causticsColor?: string;
  causticsIntensity?: number;
  reflectionStrength?: number;
  fresnelPower?: number;
  fresnelBias?: number;
  waveAmplitude?: number;
  rippleStrength?: number;
}

export const NATATORIUM_WATER_PROFILE: WaterProfile = {
  shallow: '#8cb179',
  deep: '#678f44',
  far: '#959e69',
  shallowColor: '#8cb179',
  deepColor: '#678f44',
  foamColor: '#f4feff',
  causticsColor: '#d4ebd0',
  causticsIntensity: 1.35,
  reflectionStrength: 0.58,
  fresnelPower: 3.8,
  fresnelBias: 0.06,
  waveAmplitude: 0.014,
  rippleStrength: 1.15,
  opacityMin: 0.20,
  opacityMax: 0.86,
  foam: 0.15,
  normalStrength: 1.05,
  scroll: 0.04,
  specular: '#7b9e5e',
  murk: 0.0,
};

export const WATER_PROFILES: Record<MapId, WaterProfile> = {
  poolrooms: {
    shallow: '#8cb179',
    deep: '#678f44',
    far: '#959e69',
    shallowColor: '#8cb179',
    deepColor: '#678f44',
    foamColor: '#f4feff',
    causticsColor: '#d4ebd0',
    causticsIntensity: 1.35,
    reflectionStrength: 0.58,
    fresnelPower: 3.8,
    fresnelBias: 0.06,
    waveAmplitude: 0.014,
    rippleStrength: 1.15,
    opacityMin: 0.20,
    opacityMax: 0.86,
    foam: 0.25,
    normalStrength: 1.0,
    scroll: 0.04,
    specular: '#7b9e5e',
    murk: 0.0,
  },
  utility_tunnels: {
    shallow: '#688550',
    deep: '#4a6130',
    far: '#959e69',
    opacityMin: 0.32,
    opacityMax: 0.95,
    foam: 0.15,
    normalStrength: 0.8,
    scroll: 0.03,
    specular: '#7b9e5e',
    murk: 0.20,
  },
  marble_atrium: {
    shallow: '#8fae74',
    deep: '#6a8a5b',
    far: '#959e69',
    opacityMin: 0.20,
    opacityMax: 0.80,
    foam: 0.2,
    normalStrength: 1.2,
    scroll: 0.05,
    specular: '#7b9e5e',
    murk: 0.0,
  },
  hydro_maze: {
    shallow: '#78a368',
    deep: '#557a40',
    far: '#959e69',
    opacityMin: 0.25,
    opacityMax: 0.90,
    foam: 0.35,
    normalStrength: 1.1,
    scroll: 0.06,
    specular: '#7b9e5e',
    murk: 0.05,
  },
  drainage_core: {
    shallow: '#556b3e',
    deep: '#475c2e',
    far: '#959e69',
    opacityMin: 0.35,
    opacityMax: 0.96,
    foam: 0.1,
    normalStrength: 0.7,
    scroll: 0.02,
    specular: '#7b9e5e',
    murk: 0.1,
    bioluminescence: {
      color: '#8ea05a',
      ripple: 0.45,
      ambient: 0.06,
      motes: 40,
    },
  },
  natatorium: {
    ...NATATORIUM_WATER_PROFILE,
  },
  drowned_school: {
    shallow: '#789965',
    deep: '#55703d',
    far: '#959e69',
    opacityMin: 0.28,
    opacityMax: 0.92,
    foam: 0.2,
    normalStrength: 0.8,
    scroll: 0.02,
    specular: '#7b9e5e',
    murk: 0.15,
  },
  sunken_jungle: {
    shallow: '#5e9453',
    deep: '#3d6631',
    far: '#959e69',
    opacityMin: 0.30,
    opacityMax: 0.92,
    foam: 0.45,
    normalStrength: 1.3,
    scroll: 0.06,
    specular: '#7b9e5e',
    murk: 0.15,
  },
  neon_flood: {
    shallow: '#5b7349',
    deep: '#475c32',
    far: '#959e69',
    opacityMin: 0.35,
    opacityMax: 0.96,
    foam: 0.1,
    normalStrength: 0.9,
    scroll: 0.03,
    specular: '#7b9e5e',
    murk: 0.1,
  },
  drowned_metro: {
    shallow: '#728f5e',
    deep: '#4e6635',
    far: '#959e69',
    opacityMin: 0.32,
    opacityMax: 0.94,
    foam: 0.2,
    normalStrength: 0.9,
    scroll: 0.03,
    specular: '#7b9e5e',
    murk: 0.15,
  },
  orientation: {
    shallow: '#7fad68',
    deep: '#5e8542',
    far: '#959e69',
    shallowColor: '#7fad68',
    deepColor: '#5e8542',
    foamColor: '#f4feff',
    causticsColor: '#d4ebd0',
    causticsIntensity: 1.35,
    reflectionStrength: 0.58,
    fresnelPower: 3.8,
    fresnelBias: 0.06,
    waveAmplitude: 0.014,
    rippleStrength: 1.15,
    opacityMin: 0.22,
    opacityMax: 0.88,
    foam: 0.35,
    normalStrength: 1.25,
    scroll: 0.08,
    specular: '#7b9e5e',
    murk: 0.0,
  },
};
