import { describe, it, expect } from 'vitest';
import { SimWorld } from '../src/sim/SimWorld.js';
import type { PlayerIntent } from '../src/sim/PlayerMotor.js';
import { mulberry32 } from '../src/procedural/core/prng.js';

describe('Simulation Fuzz Testing (10,000 Ticks)', () => {
  it('random intents for 10,000 ticks never produce NaN, Infinity, out-of-bounds, or negative stamina', () => {
    const bounds = {
      minX: -60,
      maxX: 60,
      minZ: -60,
      maxZ: 60,
    };

    const world = new SimWorld({
      seed: 849204,
      bounds,
      playerSpawn: { x: 0, y: 0.3, z: 0 },
      waterY: 0.0,
    });

    // Populate several dry platforms and stepping stones
    world.ground.rasterizePlatform(-10, -10, 10, 10, 0.4);
    world.ground.rasterizePlatform(-30, -30, -15, -15, 0.6);
    world.ground.rasterizePlatform(15, 15, 35, 35, 0.8);
    world.finalizeTerrain();

    // Add monster
    world.addMonster({
      id: 'fuzz_monster',
      variant: 'standard',
      spawn: { x: 20, y: 0.0, z: 20 },
      spawnGrace: 5.0,
    });

    const prng = mulberry32(1337);
    const dt = 1 / 60;
    const TOTAL_TICKS = 10000;

    for (let tick = 0; tick < TOTAL_TICKS; tick++) {
      const intent: PlayerIntent = {
        moveX: prng() * 2 - 1,
        moveZ: prng() * 2 - 1,
        sprint: prng() > 0.5,
        crouch: prng() > 0.8,
        jump: prng() > 0.9,
        interact: prng() > 0.95,
        lookDeltaYaw: (prng() * 2 - 1) * 0.1,
        lookDeltaPitch: (prng() * 2 - 1) * 0.1,
      };

      world.step(dt, intent);

      const p = world.player.pos;
      const v = world.player.vel;
      const stamina = world.player.stamina;

      // 1. Check for NaN or Infinity in Player transform and kinematics
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
        throw new Error(`Tick ${tick}: Non-finite player position (${p.x}, ${p.y}, ${p.z})`);
      }
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
        throw new Error(`Tick ${tick}: Non-finite player velocity (${v.x}, ${v.y}, ${v.z})`);
      }

      // 2. Stamina must never be negative
      if (stamina < 0) {
        throw new Error(`Tick ${tick}: Negative stamina (${stamina})`);
      }

      // 3. Player position must stay within world bounds (+ margin for collision boundary)
      const margin = 2.0;
      if (
        p.x < bounds.minX - margin ||
        p.x > bounds.maxX + margin ||
        p.z < bounds.minZ - margin ||
        p.z > bounds.maxZ + margin
      ) {
        throw new Error(`Tick ${tick}: Player out of bounds (${p.x}, ${p.z})`);
      }

      // 4. Check all active monsters for finite state and bounds
      for (const m of world.monsters) {
        if (!Number.isFinite(m.pos.x) || !Number.isFinite(m.pos.y) || !Number.isFinite(m.pos.z)) {
          throw new Error(`Tick ${tick}: Non-finite monster position (${m.pos.x}, ${m.pos.y}, ${m.pos.z})`);
        }
        if (
          m.pos.x < bounds.minX - margin ||
          m.pos.x > bounds.maxX + margin ||
          m.pos.z < bounds.minZ - margin ||
          m.pos.z > bounds.maxZ + margin
        ) {
          throw new Error(`Tick ${tick}: Monster out of bounds (${m.pos.x}, ${m.pos.z})`);
        }
      }
    }

    expect(world.simTime).toBeCloseTo(TOTAL_TICKS * dt, 2);
    expect(world.player.stamina).toBeGreaterThanOrEqual(0);
  });
});
