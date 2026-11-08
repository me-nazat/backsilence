/* ── tests/monster-blindness.test.ts ───────────────────────────────────────
 *  Prompt 6 (D134) Work Item A: Monster Blindness Verification.
 *  1. Static Code Analysis: Asserts MonsterBrain has zero camera reference,
 *     zero raycast, zero frustum or visibility test, and zero lookAt(player).
 *     Asserts the only perception input is a NoiseEvent / acoustic context.
 *  2. Runtime Control: Places the player directly in front of the creature
 *     with zero noise for 60 simulated seconds and asserts the creature
 *     does not approach or attack the player.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { NavGrid } from '../src/sim/NavGrid.js';
import { ColliderSet } from '../src/sim/Colliders.js';
import { EventRingBuffer } from '../src/sim/Events.js';
import { MonsterBrain } from '../src/sim/MonsterBrain.js';
import { SimWorld } from '../src/sim/SimWorld.js';
import type { PlayerIntent } from '../src/sim/PlayerMotor.js';

interface FsModule {
  readFileSync: (p: string, enc: string) => string;
}
interface PathModule {
  resolve: (...parts: string[]) => string;
}
declare const process: { cwd: () => string };

describe('Prompt 6 (D134) — Monster Blindness Verification', () => {
  it('Work Item A.1: Static Source Scan asserts zero visual perception inputs in MonsterBrain', async () => {
    const fsMod = 'node:fs';
    const pathMod = 'node:path';
    const fs = (await import(/* @vite-ignore */ fsMod)) as unknown as FsModule;
    const path = (await import(/* @vite-ignore */ pathMod)) as unknown as PathModule;
    const brainSourcePath = path.resolve(process.cwd(), 'src/sim/MonsterBrain.ts');
    const brainSrc = fs.readFileSync(brainSourcePath, 'utf8');

    // 1. Assert no camera reference
    expect(brainSrc).not.toMatch(/camera/i);
    // 2. Assert no raycast
    expect(brainSrc).not.toMatch(/raycast/i);
    // 3. Assert no frustum or visibility tests
    expect(brainSrc).not.toMatch(/frustum/i);
    expect(brainSrc).not.toMatch(/visibility/i);
    // 4. Assert no lookAt(player)
    expect(brainSrc).not.toMatch(/lookAt\s*\(\s*player/i);
    expect(brainSrc).not.toMatch(/\.lookAt\s*\(/i);

    // 5. Assert only perception input is acoustic (NoiseEvent / HearingContext)
    expect(brainSrc).toMatch(/onNoiseEvent\s*\(/);
    expect(brainSrc).toMatch(/HearingContext/);

    // Also check MonsterAI.ts
    const aiSourcePath = path.resolve(process.cwd(), 'src/sim/MonsterAI.ts');
    const aiSrc = fs.readFileSync(aiSourcePath, 'utf8');
    expect(aiSrc).not.toMatch(/camera/i);
    expect(aiSrc).not.toMatch(/raycast/i);
    expect(aiSrc).not.toMatch(/frustum/i);
    expect(aiSrc).not.toMatch(/visibility/i);
    expect(aiSrc).not.toMatch(/lookAt\s*\(\s*player/i);
  });

  it('Work Item A.2: 60-Second Runtime Control — silent player directly in front of creature is never approached', () => {
    const bounds = { minX: -30, maxX: 30, minZ: -30, maxZ: 30 };
    const ground = new GroundGrid(bounds, 0.25);
    ground.fill(-0.9);
    // Dry island for player
    ground.setRectHeight(-4, -4, 4, 4, 0.35);
    ground.computeDistanceTransform(0);

    const colliders = new ColliderSet(4.0);
    const world = new SimWorld({
      seed: 42,
      bounds,
      playerSpawn: { x: 0, y: 0.35, z: 0 },
      waterY: 0.0,
      difficulty: 'normal',
      ground,
      colliders,
    });
    world.finalizeTerrain();

    // Place the monster 8m directly in front of the player (facing each other in open water)
    const monster = world.addMonster({
      id: 'blind_test_monster',
      variant: 'standard',
      spawn: { x: 0, y: -0.9, z: 8.0 },
      spawnGrace: 0.0,
    });

    const silentIntent: PlayerIntent = {
      moveX: 0,
      moveZ: 0,
      jump: false,
      sprint: false,
      crouch: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };

    const initialDistance = Math.hypot(monster.pos.x - 0, monster.pos.z - 0);
    expect(initialDistance).toBeCloseTo(8.0, 1);

    const dt = 1 / 60;
    const totalTicks = 60 * 60; // 60 simulated seconds

    let minDistanceToPlayer = 999;
    let attackTriggered = false;

    for (let frame = 0; frame < totalTicks; frame++) {
      world.step(dt, silentIntent);

      const d = Math.hypot(monster.pos.x - 0, monster.pos.z - 0);
      if (d < minDistanceToPlayer) {
        minDistanceToPlayer = d;
      }

      if (monster.state === 'ATTACK') {
        attackTriggered = true;
        break;
      }
    }

    // Creature must NEVER approach player into attack range (1.6m) or trigger attack
    expect(attackTriggered).toBe(false);
    expect(minDistanceToPlayer).toBeGreaterThan(2.0);
    expect(monster.state).not.toBe('ATTACK');
  });

  it('Work Item A.2 (direct brain test): creature 3m away with 0 noise never triggers HUNT or ATTACK over 60s', () => {
    const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
    const ground = new GroundGrid(bounds, 0.25);
    ground.fill(-0.9);
    ground.computeDistanceTransform(0);
    const nav = new NavGrid(ground, 0, 0.25);
    const colliders = new ColliderSet(4);
    const events = new EventRingBuffer(64);

    const brain = new MonsterBrain(
      { id: 'm_direct_blind', variant: 'standard', spawn: { x: 0, y: -0.9, z: 3.5 }, spawnGrace: 0 },
      nav,
      100,
    );

    const playerPos = { x: 0, y: -0.9, z: 0 };
    const ctx = { difficultyHearing: 1.0 };

    let attacked = false;
    let hunted = false;

    for (let i = 0; i < 3600; i++) {
      const t = i / 60;
      brain.step(1 / 60, playerPos, nav, colliders, events, ctx, t, true, false, false);

      if (brain.state === 'ATTACK') attacked = true;
      if (brain.state === 'HUNT') hunted = true;
    }

    expect(attacked).toBe(false);
    expect(hunted).toBe(false);
    expect(brain.state === 'WANDER' || brain.state === 'DORMANT' || brain.state === 'INVESTIGATE').toBe(true);
  });
});
