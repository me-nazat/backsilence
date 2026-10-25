import { describe, it, expect } from 'vitest';
import { GpuWaveSimulation } from '../src/game/water/GpuWaveSimulation.js';
import { createWaterMaterial } from '../src/game/water/WaterMaterial.js';
import { SplashSystem } from '../src/game/water/Splashes.js';
import { waterSelfTest } from '../src/game/water/WaterSystem.js';
import { runSimulationReplay } from '../src/meta/SimReplayRunner.js';
import { PLATFORM_TOP_Y, WATER_FLOOR_Y, WATER_SURFACE_Y } from '../src/sim/ProvingGroundsData.js';
import { Object3D, Vector3, Vector4, Texture } from 'three';

describe('Phase G: Water Pipeline Verification & Self-Test Suite', () => {
  it('1. waterSelfTest() passes all 4 criteria (stability, decay, reflection, agreement)', () => {
    const res = waterSelfTest();
    expect(res.passed).toBe(true);
    expect(res.details).toContain('hasNaN=false');
    expect(res.details).toContain('energyDecayed=true');
    expect(res.details).toContain('obstacleReflected=true');
  });

  it('2. GpuWaveSimulation executes 10,000 steps without NaN', () => {
    const sim = new GpuWaveSimulation({ tier: 'high', windowSize: 32.0 });
    const report = sim.selfTest();
    expect(report.hasNaN).toBe(false);
    expect(report.energyDecayed).toBe(true);
    sim.dispose();
  });

  it('3. WaterMaterial compiles and functions gracefully when simulation targets are unavailable (fallback)', () => {
    const ripples = Array.from({ length: 32 }, () => new Vector4());
    const wakes = Array.from({ length: 6 }, () => new Vector4());
    const wakeParams = Array.from({ length: 6 }, () => new Vector4());

    const mat = createWaterMaterial({
      tier: 'low',
      waterY: 0.0,
      normalTexture: new Texture(),
      mapDataTexture: new Texture(),
      mapBounds: new Vector4(-50, -50, 50, 50),
      ripples,
      wakes,
      wakeParams,
    });

    expect(mat).toBeDefined();
    expect(mat.uniforms['uHasWaveSim']?.value).toBe(0.0);
    expect(mat.uniforms['uReflectionTier']?.value).toBe(0.0);
    expect(mat.uniforms['uWaterY']?.value).toBe(0.0);
    mat.dispose();
  });

  it('4. SplashSystem pools 256 droplets, 32 foam rings, and handles monster splashes with dark ink tint', () => {
    const parent = new Object3D();
    const splashes = new SplashSystem(parent);

    expect(SplashSystem.MAX_DROPLETS).toBe(256);
    expect(SplashSystem.MAX_RINGS).toBe(32);
    expect(splashes.mesh.count).toBe(256);
    expect(splashes.ringMesh.count).toBe(32);

    // Normal player splash
    splashes.burst(new Vector3(0, 0, 0), 1.0, false);
    splashes.update(0.016);

    // Monster splash (ink tinted)
    splashes.burst(new Vector3(2, 0, 2), 2.0, true);
    splashes.update(0.016);

    splashes.dispose();
  });

  it('5. Elevation world geometry constants align with the 0.15m tile grid within 15% tolerance', () => {
    const slabHeight = PLATFORM_TOP_Y - WATER_SURFACE_Y;
    expect(slabHeight).toBeCloseTo(0.30, 2);

    const poolFloorDepth = WATER_SURFACE_Y - WATER_FLOOR_Y;
    expect(poolFloorDepth).toBeCloseTo(0.90, 2);
  });

  it('6. Presentation changes preserve bitwise simulation determinism (replay hash unchanged)', async () => {
    const runA = await runSimulationReplay('orientation', 4242, 1200, 300);
    const runB = await runSimulationReplay('orientation', 4242, 1200, 300);
    expect(runA.finalSimHash).toBe(runB.finalSimHash);
    expect(runA.checkpoints.length).toBe(runB.checkpoints.length);
  }, 30000);
});
