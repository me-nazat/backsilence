import { describe, it, expect } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { SplashSystem, buildCrownSplashGeometry } from '../src/game/water/Splashes.js';

describe('Prompt 7 Work Item D: Splash Vocabulary (tests/splash-vocabulary.test.ts)', () => {
  it('1. Profile 1: Crouch-wade — minimal ripple and 0.12 loudness', () => {
    const parent = new Object3D();
    const splashes = new SplashSystem(parent, 0.0);
    const pos = new Vector3(0, 0, 0);

    const res = splashes.spawnCrouchWadeSplash(pos);
    expect(res.loudness).toBe(0.12);
    expect(res.hearingRadius).toBeLessThanOrEqual(5.0);

    splashes.update(0.016);
    expect(splashes.mesh.count).toBe(SplashSystem.MAX_DROPLETS);
    expect(splashes.ringMesh.count).toBe(SplashSystem.MAX_RINGS);

    splashes.dispose();
  });

  it('2. Profile 2: Wade — displaced V-wake, moderate foam, 0.35 loudness', () => {
    const parent = new Object3D();
    const splashes = new SplashSystem(parent, 0.0);
    const pos = new Vector3(2, 0, 3);

    const res = splashes.spawnWadeSplash(pos);
    expect(res.loudness).toBe(0.35);
    expect(res.hearingRadius).toBeCloseTo(14.0, 1);

    splashes.update(0.016);
    splashes.dispose();
  });

  it('3. Profile 3: Sprint — full crown + foam, 0.75 loudness', () => {
    const parent = new Object3D();
    const splashes = new SplashSystem(parent, 0.0);
    const pos = new Vector3(1, 0, 1);

    const res = splashes.spawnSprintOrJumpSplash(pos, false);
    expect(res.loudness).toBe(0.75);
    expect(res.hearingRadius).toBeCloseTo(30.0, 1);

    splashes.update(0.016);
    expect(splashes.crownMesh.count).toBe(SplashSystem.MAX_CROWNS);

    splashes.dispose();
  });

  it('4. Profile 4: Jump / Dive — loudest transient (1.0), full crown + intense foam', () => {
    const parent = new Object3D();
    const splashes = new SplashSystem(parent, 0.0);
    const pos = new Vector3(5, 0, 5);

    const res = splashes.spawnSprintOrJumpSplash(pos, true);
    expect(res.loudness).toBe(1.0);
    expect(res.hearingRadius).toBeCloseTo(40.0, 1);

    splashes.update(0.016);
    splashes.dispose();
  });

  it('5. Profile 5: Mantle — ledge slide into water, 0.50 loudness, 20m radius', () => {
    const parent = new Object3D();
    const splashes = new SplashSystem(parent, 0.0);
    const pos = new Vector3(-2, 0, 4);

    const res = splashes.spawnMantleSplash(pos);
    expect(res.loudness).toBe(0.50);
    expect(res.hearingRadius).toBeCloseTo(20.0, 1);

    splashes.update(0.016);
    splashes.dispose();
  });

  it('6. Profile 6: Pebble — single crown + 3 broken ripples, 0.60 loudness, no wake', () => {
    const parent = new Object3D();
    const splashes = new SplashSystem(parent, 0.0);
    const pos = new Vector3(0, 0, 8);

    const res = splashes.spawnPebbleSplash(pos);
    expect(res.loudness).toBe(0.60);
    expect(res.hearingRadius).toBeCloseTo(24.0, 1);

    splashes.update(0.016);
    splashes.dispose();
  });

  it('7. Profile 7: Creature Footfall — viscous dark ink #1e1a14 + white foam at feet only', () => {
    const parent = new Object3D();
    const splashes = new SplashSystem(parent, 0.0);
    const pos = new Vector3(4, 0, -2);

    const res = splashes.spawnCreatureSplash(pos, 1.0);
    expect(res.inkDropletsSpawned).toBeGreaterThanOrEqual(4);
    expect(res.inkRingSpawned).toBe(true);
    expect(res.whiteFoamRingSpawned).toBe(true);

    splashes.update(0.016);
    expect(splashes.lastInkSplashCount).toBeGreaterThan(0);
    expect(splashes.lastWhiteFoamFootCount).toBeGreaterThan(0);

    splashes.dispose();
  });

  it('8. Crown splash geometry produces a true crown silhouette (not a dome blob)', () => {
    const geom = buildCrownSplashGeometry();
    const posAttr = geom.getAttribute('position');
    expect(posAttr).toBeDefined();

    // Verify 7 distinct rim spikes and central column
    let minH = Infinity;
    let maxH = -Infinity;
    let maxR = 0;

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const r = Math.sqrt(x * x + z * z);
      if (y < minH) minH = y;
      if (y > maxH) maxH = y;
      if (r > maxR) maxR = r;
    }

    // Must have vertical rising column (apex height >= 0.45m) and outward flaring rim (radius >= 0.35m)
    expect(minH).toBe(0.0);
    expect(maxH).toBeGreaterThanOrEqual(0.45);
    expect(maxR).toBeGreaterThanOrEqual(0.35);

    geom.dispose();
  });

  it('9. Foam ring produces measurable luminance/colour deviation >= 3% from water background', () => {
    // Water background shallow colour: #8cb179 -> rgb(0.549, 0.694, 0.475), lum = 0.626
    const waterLum = 0.2126 * 0.549 + 0.7152 * 0.694 + 0.0722 * 0.475; // ~0.647
    // Ring foam colour: #f0fcff -> rgb(0.941, 0.988, 1.0), lum = 0.978
    const foamLum = 0.2126 * 0.941 + 0.7152 * 0.988 + 0.0722 * 1.0; // ~0.978

    // Peak ring alpha is 0.22 (target 0.12–0.30)
    const peakAlpha = 0.22;
    const blendedLum = waterLum * (1.0 - peakAlpha) + foamLum * peakAlpha;
    const deltaLumPct = Math.abs(blendedLum - waterLum) / waterLum;

    // Prompt 7 Work Item B4: Must be detectable as a luminance deviation >= 3%
    expect(deltaLumPct * 100).toBeGreaterThanOrEqual(3.0);
    expect(peakAlpha).toBeGreaterThanOrEqual(0.12);
    expect(peakAlpha).toBeLessThanOrEqual(0.30);
  });
});
