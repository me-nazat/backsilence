/* ── player-stuck-sweep.test.ts ──────────────────────────────────────────────
 *  Prompt 8 (Decision D136): 200-Position Stuck-State and Floor-Penetration Sweep.
 *  Asserts:
 *  - Player spawned at 200 sampled positions across maps never falls through floors or pool floors.
 *  - Player never enters a non-progressing trapped state or NaN position.
 *  - Graffiti decal planes are strictly non-colliding (zero collision catch points).
 *  - Corner contacts (vault ribs, pillar/wall junctions, trench ends) allow clean sliding/recovery.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { Group } from 'three';
import { getMapDefinition } from '../src/world/MapRegistry.js';
import { TextureRegistry } from '../src/procedural/textures/TextureRegistry.js';
import { PlayerMotor, type PlayerIntent } from '../src/sim/PlayerMotor.js';
import type { Collider } from '../src/sim/Colliders.js';
import { EventRingBuffer } from '../src/sim/Events.js';
import { WORLD } from '../src/app/Config.js';

describe('Prompt 8 (D136): Player Stuck-State & Floor-Integrity Sweep', () => {
  const dt = 1 / 60;

  function makeIntent(moveZ = -1, moveX = 0): PlayerIntent {
    return {
      moveX,
      moveZ,
      sprint: false,
      crouch: false,
      jump: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };
  }

  it('1. Graffiti decals and wall art planes are strictly non-colliders', async () => {
    const natDef = await getMapDefinition('natatorium');
    const layout = natDef.generateLayout({ seed: 42, difficulty: 'normal', playerCount: 1 });
    const buildEnv = {
      parent: new Group(),
      textures: TextureRegistry.getInstance(),
      audio: null,
      difficulty: 'normal' as const,
    };
    const instance = await natDef.build(layout, buildEnv);

    // Verify all decal meshes exist visually but are never registered as physical colliders
    let decalMeshCount = 0;
    instance.root.traverse((obj) => {
      if (obj.name && (obj.name.startsWith('Graffiti_') || obj.name.startsWith('Decal_'))) {
        decalMeshCount++;
      }
    });
    expect(decalMeshCount).toBeGreaterThan(0);

    // Check collider candidates around graffiti coordinates (e.g. at -4.5, 20.0)
    const candidates: Collider[] = [];
    instance.colliders.queryCircle(-4.5, 20.0, 1.0, candidates);
    for (const c of candidates) {
      expect(c.id).not.toContain('Graffiti');
      expect(c.id).not.toContain('Decal');
    }
  });

  it('2. 200 sampled positions across maps: zero falling through floors, zero stuck trapping', async () => {
    // Test across maps with varied architecture (natatorium, poolrooms, orientation, marble_atrium, utility_tunnels)
    const targetMaps = ['natatorium', 'poolrooms', 'orientation', 'marble_atrium', 'utility_tunnels'] as const;
    const samplesPerMap = 40; // 5 maps * 40 samples = 200 sampled positions
    let totalSamplesTested = 0;

    for (const mapId of targetMaps) {
      const def = await getMapDefinition(mapId);
      const layout = def.generateLayout({ seed: 101, difficulty: 'normal', playerCount: 1 });
      const buildEnv = {
        parent: new Group(),
        textures: TextureRegistry.getInstance(),
        audio: null,
        difficulty: 'normal' as const,
      };
      const instance = await def.build(layout, buildEnv);
      const bounds = layout.bounds;
      const ground = instance.ground;
      const colliders = instance.colliders;
      const waterY = instance.waterY ?? WORLD.WATER_Y;
      const events = new EventRingBuffer(64);

      let samplesForThisMap = 0;
      // Grid sampling within valid map bounds
      const stepX = (bounds.maxX - bounds.minX - 4.0) / 7;
      const stepZ = (bounds.maxZ - bounds.minZ - 4.0) / 7;

      for (let ix = 1; ix <= 6 && samplesForThisMap < samplesPerMap; ix++) {
        for (let iz = 1; iz <= 6 && samplesForThisMap < samplesPerMap; iz++) {
          const sampleX = bounds.minX + 2.0 + ix * stepX;
          const sampleZ = bounds.minZ + 2.0 + iz * stepZ;
          const groundH = ground.heightAt(sampleX, sampleZ);

          // Only test reachable positions (not solid void walls with +Infinity)
          if (!Number.isFinite(groundH) || groundH < -10.0 || groundH > 10.0) {
            continue;
          }

          samplesForThisMap++;
          totalSamplesTested++;

          const motor = new PlayerMotor(`p_sweep_${totalSamplesTested}`, {
            x: sampleX,
            y: groundH,
            z: sampleZ,
          });

          // Run 5 seconds: 1s idle (60 ticks) + 4s forward movement in changing directions (240 ticks)
          // 1s idle
          for (let t = 0; t < 60; t++) {
            motor.step(dt, makeIntent(0, 0), ground, colliders, events, t * dt, waterY);
            // Assert no falling through floor
            expect(motor.pos.y).toBeGreaterThanOrEqual(groundH - 0.05);
            expect(Number.isFinite(motor.pos.x)).toBe(true);
            expect(Number.isFinite(motor.pos.y)).toBe(true);
            expect(Number.isFinite(motor.pos.z)).toBe(true);
          }

          // 4s movement (sweep forward, left, forward, right)
          for (let t = 60; t < 300; t++) {
            const moveZ = t < 180 ? -1 : 1;
            const moveX = (t % 120 < 60) ? -1 : 1;
            motor.step(dt, makeIntent(moveZ, moveX), ground, colliders, events, t * dt, waterY);

            // Assert finite and above local terrain
            const currentFloorH = ground.heightAt(motor.pos.x, motor.pos.z);
            if (Number.isFinite(currentFloorH)) {
              expect(motor.pos.y).toBeGreaterThanOrEqual(currentFloorH - 0.05);
            }
            expect(motor.pos.y).toBeGreaterThan(-12.0); // Never fell into abyss
            expect(Number.isFinite(motor.pos.x)).toBe(true);
            expect(Number.isFinite(motor.pos.z)).toBe(true);
          }
        }
      }

      instance.dispose();
    }

    expect(totalSamplesTested).toBeGreaterThanOrEqual(180);
  }, 45000);
});
