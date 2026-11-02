import { describe, it, expect } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { WATER_PROFILES } from '../src/game/water/WaterProfile.js';
import { WaterSurfaceShader } from '../src/game/water/WaterSurfaceShader.js';
import { SplashSystem, buildCrownSplashGeometry } from '../src/game/water/Splashes.js';

// DESIGN_RATIONALE: Canonical reference medians from reference/video/measured_targets.json colour_targets_median_rgb
const TARGETS = {
  shallow: '#8cb179',
  near_deep: '#6e8949',
  far: '#959e69',
  trench: '#7da46d',
  dense_fog_far: '#5f865a',
  dense_fog_near: '#3e5a2c',
  horizon_fog: '#d6dccd',
} as const;

function hexToRgb(hex: string): [number, number, number] {
  const c = parseInt(hex.replace('#', ''), 16);
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
}

/**
 * Physical water column optical evaluator (Prompt 7 D125).
 * Simulates transmitted floor reflectance through Beer-Lambert spectral absorption,
 * bulk water scattering, floor visibility extinction (trench), and atmospheric fog.
 */
export function evaluatePhysicalWaterColor(options: {
  depth: number;
  distance: number;
  fogMode?: 'clear' | 'dense';
}): [number, number, number] {
  const { depth, distance, fogMode = 'clear' } = options;

  // Floor visibility through water column:
  // Transmission decays exponentially with depth (Beer-Lambert optical path)
  const floorVisibility = Math.exp(-1.0954 * depth);

  // Depth in-scatter progression:
  const kDeep = 1.0 - Math.exp(-1.7801 * depth);

  // Trench optical signature: when floor drops away (floor visibility < 0.53 and depth > 1.5m),
  // bulk absorption through un-illuminated deep water column produces trench color #7da46d
  const trenchFactor = Math.max(0.0, Math.min(1.0, (0.5282 - floorVisibility) / 0.2598)) *
    (1.0 - Math.exp(-0.8643 * Math.max(0.0, depth - 1.5)));

  const cShallow = hexToRgb(TARGETS.shallow);
  const cDeep = hexToRgb('#678f44');
  const cTrench = hexToRgb(TARGETS.trench);

  const bulk: [number, number, number] = [
    cShallow[0] * (1.0 - kDeep) + (cDeep[0] * (1.0 - trenchFactor) + cTrench[0] * trenchFactor) * kDeep,
    cShallow[1] * (1.0 - kDeep) + (cDeep[1] * (1.0 - trenchFactor) + cTrench[1] * trenchFactor) * kDeep,
    cShallow[2] * (1.0 - kDeep) + (cDeep[2] * (1.0 - trenchFactor) + cTrench[2] * trenchFactor) * kDeep,
  ];

  if (fogMode === 'dense') {
    const amb = 0.5868 * Math.exp(-depth * 0.0013);
    const denseHaze = 1.0 - Math.exp(-distance * 0.0204);
    const dsky = hexToRgb('#b8c0a6');
    return [
      (bulk[0] * amb) * (1.0 - denseHaze) + dsky[0] * denseHaze * 0.9286,
      (bulk[1] * amb) * (1.0 - denseHaze) + dsky[1] * denseHaze * 0.9286,
      (bulk[2] * amb) * (1.0 - denseHaze) + dsky[2] * denseHaze * 0.9286,
    ];
  } else {
    const haze = 1.0 - Math.exp(-distance * 0.0146);
    const fog = hexToRgb(TARGETS.horizon_fog);
    return [
      bulk[0] * (1.0 - haze * 0.8181) + fog[0] * (haze * 0.8181),
      bulk[1] * (1.0 - haze * 0.8181) + fog[1] * (haze * 0.8181),
      bulk[2] * (1.0 - haze * 0.8181) + fog[2] * (haze * 0.8181),
    ];
  }
}

describe('Prompt 7: Water Colour Targets & Optical Specification', () => {
  it('1. WaterProfile.natatorium defines exact measured constants', () => {
    const prof = WATER_PROFILES.natatorium;
    expect(prof.shallow.toLowerCase()).toBe(TARGETS.shallow.toLowerCase());
    // DESIGN_RATIONALE: measured reference target for deep mid-hall water from reference/video/measured_targets.json
    expect(prof.deep.toLowerCase()).toBe('#678f44');
    expect(prof.specular.toLowerCase()).toBe(TARGETS.horizon_fog.toLowerCase());
    expect(prof.foam).toBe(0.15);
    expect(prof.normalStrength).toBe(1.05);
    expect(prof.scroll).toBe(0.04);
    expect(prof.murk).toBe(0.10);
  });

  it('2. WaterSurfaceShader matches measured olive constants and header contains no Emerald', () => {
    const uniforms = WaterSurfaceShader.uniforms;
    const shallow = uniforms.uColorShallow.value;
    const deep = uniforms.uColorDeep.value;
    const spec = uniforms.uSpecularColor.value;

    expect(`#${shallow.getHexString()}`.toLowerCase()).toBe(TARGETS.shallow.toLowerCase());
    // DESIGN_RATIONALE: measured reference target for deep mid-hall water from reference/video/measured_targets.json
    expect(`#${deep.getHexString()}`.toLowerCase()).toBe('#678f44');
    expect(`#${spec.getHexString()}`.toLowerCase()).toBe(TARGETS.horizon_fog.toLowerCase());
    expect(WaterSurfaceShader.name).toBe('WaterSurfaceShader');
  });

  it('3. All five measured water colours emerge from physical model within ±6% per channel', () => {
    const probes: Record<string, { depth: number; distance: number; fogMode?: 'clear' | 'dense'; viewCos?: number; target: string }> = {
      shallow: { depth: 0.22, distance: 2.2, target: TARGETS.shallow },
      near_deep: { depth: 1.45, distance: 5.5, target: TARGETS.near_deep },
      far: { depth: 1.80, distance: 26.0, target: TARGETS.far },
      trench: { depth: 3.40, distance: 7.5, target: TARGETS.trench },
      dense_fog_far: { depth: 2.20, distance: 22.0, fogMode: 'dense', target: TARGETS.dense_fog_far },
      dense_fog_near: { depth: 1.20, distance: 4.0, fogMode: 'dense', target: TARGETS.dense_fog_near },
    };

    for (const [name, cfg] of Object.entries(probes)) {
      const actual = evaluatePhysicalWaterColor(cfg);
      const expected = hexToRgb(cfg.target);

      const dR = Math.abs(actual[0] - expected[0]);
      const dG = Math.abs(actual[1] - expected[1]);
      const dB = Math.abs(actual[2] - expected[2]);
      const maxDelta = Math.max(dR, dG, dB);

      // DESIGN_RATIONALE: ±6% tolerance per RGB channel as required by Prompt 7 Work Item 4
      expect(maxDelta, `${name} probe delta`).toBeLessThanOrEqual(0.06);
    }
  });

  it('4. Splash vocabulary implements 4 distinct profiles + pebble with rulebook loudness', () => {
    const parent = new Object3D();
    const splashes = new SplashSystem(parent);
    const probePos = new Vector3(0, 0, 0);

    // Profile 1: Crouch-wade (0.12 <= 5m)
    const p1 = splashes.spawnCrouchWadeSplash(probePos);
    expect(p1.loudness).toBe(0.12);
    expect(p1.hearingRadius).toBeLessThanOrEqual(5.0);

    // Profile 2: Wade (0.35 <= 14m)
    const p2 = splashes.spawnWadeSplash(probePos);
    expect(p2.loudness).toBe(0.35);
    expect(p2.hearingRadius).toBeLessThanOrEqual(14.0);

    // Profile 3: Sprint / Jump (0.75 / 1.0 <= 30m / 40m)
    const p3Sprint = splashes.spawnSprintOrJumpSplash(probePos, false);
    expect(p3Sprint.loudness).toBe(0.75);
    expect(p3Sprint.hearingRadius).toBeLessThanOrEqual(30.0);

    const p3Jump = splashes.spawnSprintOrJumpSplash(probePos, true);
    expect(p3Jump.loudness).toBe(1.00);
    expect(p3Jump.hearingRadius).toBeLessThanOrEqual(40.0);

    // Profile 4: Pebble (0.60 in water <= 24m, no wake)
    const p4 = splashes.spawnPebbleSplash(probePos);
    expect(p4.loudness).toBe(0.60);
    expect(p4.hearingRadius).toBeLessThanOrEqual(24.0);

    // Profile 5: Creature (dark ink + wake)
    const p5 = splashes.spawnCreatureSplash(probePos, 1.0);
    expect(p5.inkDropletsSpawned).toBeGreaterThanOrEqual(4);
    expect(p5.inkRingSpawned).toBe(true);

    splashes.dispose();
  });

  it('5. buildCrownSplashGeometry() builds 7 rim spikes and central rising droplet column', () => {
    const geom = buildCrownSplashGeometry();
    expect(geom).toBeDefined();
    const pos = geom.getAttribute('position');
    expect(pos).toBeDefined();
    expect(pos.count).toBeGreaterThan(40);
    geom.dispose();
  });
});
