import { describe, it, expect } from 'vitest';
import { GpuWaveSimulation } from '../src/game/water/GpuWaveSimulation.js';
import { FlockDirector } from '../src/game/creatures/FlockDirector.js';
import { ProceduralSkin } from '../src/game/creatures/MonsterSkin.js';
import { Vector3 } from 'three';
import { GroundGrid } from '../src/sim/GroundGrid.js';

describe('Batch 6: Water v2 & Creatures Test Suite', () => {
  it('GpuWaveSimulation selfTest passes (energy decay, obstacle reflection, no NaNs)', () => {
    const sim = new GpuWaveSimulation({
      tier: 'medium',
      windowSize: 32.0,
      waterY: 0.0,
    });

    const result = sim.selfTest();
    expect(result.hasNaN).toBe(false);
    expect(result.energyDecayed).toBe(true);
    expect(result.obstacleReflected).toBe(true);
    expect(result.passed).toBe(true);
    sim.dispose();
  });

  it('FlockDirector evaluates deterministic flight paths for all 5 skulls', () => {
    const flockA = new FlockDirector({
      seed: 0,
      anchor: new Vector3(0, 0, 0),
      waterY: 0.0,
      count: 5,
    });
    const flockB = new FlockDirector({
      seed: 0,
      anchor: new Vector3(0, 0, 0),
      waterY: 0.0,
      count: 5,
    });

    const posA = new Vector3();
    const dirA = new Vector3();
    const posB = new Vector3();
    const dirB = new Vector3();

    // Check at simTime = 40.0s (active flight phase)
    const activeA = flockA.evaluateFlockPosition(40.0, 0, posA, dirA);
    const activeB = flockB.evaluateFlockPosition(40.0, 0, posB, dirB);

    expect(activeA).toBe(true);
    expect(activeB).toBe(true);
    expect(posA.x).toBeCloseTo(posB.x, 5);
    expect(posA.y).toBeCloseTo(posB.y, 5);
    expect(posA.z).toBeCloseTo(posB.z, 5);

    // Skulls fly above water level (min altitude >= 1.5m above waterY)
    expect(posA.y).toBeGreaterThanOrEqual(1.5);
    flockA.dispose();
    flockB.dispose();
  });

  it('ProceduralSkin instantiates procedural fallback cleanly and tracks foot contacts', () => {
    const skin = new ProceduralSkin(1.0, '#7a4a38', 54321);
    expect(skin.root).toBeDefined();

    // Update with locomotion
    skin.update(0.016, { speed: 2.5, isGrounded: true, isWading: true, waterDepth: 0.4 }, new Vector3(0, 0, 10));
    const footBones = skin.getFootBones();
    expect(footBones.length).toBeGreaterThanOrEqual(2);

    // Feet must have valid transforms
    const footPos = new Vector3();
    footPos.copy(footBones[0]!.pos);
    expect(Number.isFinite(footPos.x)).toBe(true);
    expect(Number.isFinite(footPos.y)).toBe(true);

    skin.dispose();
  });
});
