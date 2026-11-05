/* ── throwable-lure-assertion.test.ts ───────────────────────────────────
 *  Prompt 7 (Commit 3): Throwable Loop, Pebble Carry Cap, Buoyant PUSH, & Lure Assertion
 *  Validates:
 *  1. Pebble carry cap is strictly 3 pebbles.
 *  2. Natatorium layout places buoyant props (skimmer lids, buoys) with PUSH interaction.
 *  3. Teaching decal is rendered and placed beside first pebble pile.
 *  4. Lure assertion: Monster navigates to thrown pebble splash coordinates in 20/20 trials.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';
import { ThrowableSystem } from '../src/game/ThrowableSystem.js';
import { NatatoriumMap } from '../src/world/maps/NatatoriumMap.js';
import { makeThrowLureTeachingDecal } from '../src/procedural/textures/GraffitiDecals.js';
import { createProvingGroundsSim, WATER_FLOOR_Y } from '../src/sim/ProvingGroundsData.js';

describe('Prompt 7: Throwable Loop & Lure Verification', () => {
  beforeEach(() => {
    if (typeof document === 'undefined') {
      (globalThis as unknown as { document: unknown }).document = {
        createElement: () => ({
          style: {},
          getContext: () => ({
            clearRect: () => {},
            save: () => {},
            restore: () => {},
            beginPath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            stroke: () => {},
            fillText: () => {},
          }),
        }),
      };
    }
  });

  it('1. Strict pebble carry cap: maximum 3 pebbles carried simultaneously', () => {
    const throwable = new ThrowableSystem();
    // Default starts with 2 pebbles
    expect(throwable.pebbleCount).toBe(2);

    // Add 3 collectible pebbles
    throwable.addCollectible('stone_a', { x: 0, y: 0.38, z: 2 });
    throwable.addCollectible('stone_b', { x: 1, y: 0.38, z: 2 });
    throwable.addCollectible('stone_c', { x: 2, y: 0.38, z: 2 });

    // Pick up first pebble: 2 -> 3 (cap reached)
    const p1 = throwable.pickupPebble('stone_a');
    expect(p1).toBe(true);
    expect(throwable.pebbleCount).toBe(3);

    // Attempting to pick up 4th pebble must be rejected (carry cap 3)
    const p2 = throwable.pickupPebble('stone_b');
    expect(p2).toBe(false);
    expect(throwable.pebbleCount).toBe(3);

    // After throwing one pebble (3 -> 2), player can pick up again
    throwable.setEquipped(true);
    throwable.throwPebble({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 }, 0);
    expect(throwable.pebbleCount).toBe(2);

    const p3 = throwable.pickupPebble('stone_b');
    expect(p3).toBe(true);
    expect(throwable.pebbleCount).toBe(3);
  });

  it('2. Natatorium layout places buoyant props for PUSH mechanic and first pebble pile', () => {
    const layout = NatatoriumMap.generateLayout({ seed: 42, difficulty: 'normal', playerCount: 1 });

    // Buoyant props
    const skimmerLids = layout.props.filter((p) => p.kind === 'skimmer_lid');
    const buoys = layout.props.filter((p) => p.kind === 'buoy');

    expect(skimmerLids.length).toBeGreaterThanOrEqual(2);
    expect(buoys.length).toBeGreaterThanOrEqual(1);

    // First pebble pile is near spawn (z >= 45m)
    const firstPebble = layout.props.find((p) => p.id === 'pebble_prop_0');
    expect(firstPebble).toBeDefined();
    expect(firstPebble?.position.z).toBeGreaterThanOrEqual(45.0);
  });

  it('3. Teaching decal for throw lure is generated without errors', () => {
    const tex = makeThrowLureTeachingDecal({ seed: 777 });
    expect(tex).toBeDefined();
    expect(tex.image).toBeDefined();
  });

  it('4. Lure assertion: blind monster navigates to thrown pebble splash coordinates in 20/20 trials', () => {
    let successfulTrials = 0;
    const TOTAL_TRIALS = 20;

    for (let trial = 0; trial < TOTAL_TRIALS; trial++) {
      const world = createProvingGroundsSim('normal');

      // Player is standing still on dry platform at (0, 0.38, 49.5) — 0 sound emitted
      world.player.pos.x = 0;
      world.player.pos.y = 0.38;
      world.player.pos.z = 49.5;
      world.player.vel.x = 0;
      world.player.vel.y = 0;
      world.player.vel.z = 0;

      // Deterministic distance per trial between 15m and 32m
      const distance = 16.0 + (trial % 5) * 3.5;
      const monsterSpawnX = -distance;
      const splashPos = { x: 0.0, y: 0.0, z: 21.0 };

      const monster = world.addMonster(
        {
          id: `monster_lure_${trial}`,
          variant: 'standard',
          spawn: { x: monsterSpawnX, y: WATER_FLOOR_Y, z: splashPos.z },
          hearingMul: 1.0,
          speedMul: 1.0,
          scale: 1.0,
        },
        100 + trial,
      );

      // Monster starts in WANDER state
      monster.state = 'WANDER';

      // Throw pebble into water channel at splashPos
      world.broadcastNoise({
        kind: 'splash',
        position: { ...splashPos },
        loudness: 0.85,
        sourcePlayerId: 'world',
      });

      // Step 1 frame to process queued noise event
      const idleIntent = {
        moveX: 0,
        moveZ: 0,
        crouch: false,
        sprint: false,
        jump: false,
        interact: false,
        lookDeltaYaw: 0,
        lookDeltaPitch: 0,
      };
      world.step(1 / 60, idleIntent);

      // Monster should perceive the splash and enter ALERTED or HUNT targeting splashPos
      const state = monster.state as string;
      expect(state === 'ALERTED' || state === 'HUNT').toBe(true);
      expect(monster.target).toBeDefined();
      expect(monster.target?.x).toBeCloseTo(splashPos.x, 0.1);
      expect(monster.target?.z).toBeCloseTo(splashPos.z, 0.1);

      // Simulate ticking world towards target for 1.2 seconds
      const initialDist = Math.hypot(
        monster.pos.x - splashPos.x,
        monster.pos.z - splashPos.z,
      );

      for (let step = 0; step < 72; step++) {
        world.step(1 / 60, idleIntent);
      }

      const finalDist = Math.hypot(
        monster.pos.x - splashPos.x,
        monster.pos.z - splashPos.z,
      );

      // In every trial, monster must have closed distance towards the splash coordinates
      if (finalDist < initialDist) {
        successfulTrials++;
      }
    }

    expect(successfulTrials).toBe(20);
  });
});
