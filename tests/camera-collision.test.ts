/* ── camera-collision.test.ts ────────────────────────────────────────────────
 *  Prompt 8 (Decision D136): Camera Collision Sweeps, Near-Plane S19 Safety,
 *  and 720°/s Whip-Turn Stepping Verification.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { PerspectiveCamera, MathUtils } from 'three';
import { PlayerCamera } from '../src/game/player/PlayerCamera.js';
import type { PlayerSnapshot } from '../src/sim/PlayerMotor.js';
import { ColliderSet } from '../src/sim/Colliders.js';
import { defaultSettings } from '../src/app/Settings.js';
import { WORLD } from '../src/app/Config.js';

describe('Prompt 8 (D136): Camera Collision, Near-Plane S19 & 720°/s Turn Suite', () => {
  function makeSnapshot(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
    return {
      pos: { x: 0, y: 0.30, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      onGround: true,
      crouchT: 0,
      stamina: 100,
      exhausted: false,
      wet: false,
      depth: 0,
      mantling: false,
      agitation: 0,
      ...overrides,
    };
  }

  it('1. Camera collision sweep prevents clipping into solid box walls', () => {
    const camera = new PerspectiveCamera(75, 16 / 9, 0.05, 200);
    const settings = defaultSettings();
    const playerCam = new PlayerCamera(camera, settings);

    const colliders = new ColliderSet(2.0);
    // Solid wall from x in [-2.0, 0.0], y in [0, 4], z in [-5, 5]
    colliders.addBox('west_wall', { x: -2.0, y: 0, z: -5 }, { x: 0.0, y: 4.0, z: 5 });

    // Player standing very close to the wall at x = 0.15m (head bob / shake could push camera into wall)
    const snap = makeSnapshot({
      pos: { x: 0.15, y: 0.0, z: 0 },
      vel: { x: 3.2, y: 0, z: 0 }, // moving, head bob active
    });

    for (let i = 0; i < 30; i++) {
      playerCam.update(0.016, snap, snap, 1.0, undefined, undefined, colliders);
      // Camera X position must never penetrate into the wall (x <= 0)
      expect(camera.position.x).toBeGreaterThan(0.08);
    }
  });

  it('2. Camera collision sweep prevents clipping into cylindrical pillars', () => {
    const camera = new PerspectiveCamera(75, 16 / 9, 0.05, 200);
    const settings = defaultSettings();
    const playerCam = new PlayerCamera(camera, settings);

    const colliders = new ColliderSet(2.0);
    // Cylinder pillar at origin with radius 1.0m, height 0 to 6m
    colliders.addCylinder('center_pillar', 0, 0, 1.0, 0, 6.0);

    // Player right outside pillar at (1.15, 0, 0)
    const snap = makeSnapshot({
      pos: { x: 1.15, y: 0.0, z: 0 },
      vel: { x: 3.2, y: 0, z: 0 },
    });

    for (let i = 0; i < 30; i++) {
      playerCam.update(0.016, snap, snap, 1.0, undefined, undefined, colliders);
      const distToAxis = Math.hypot(camera.position.x, camera.position.z);
      // Must stay outside pillar cylinder radius with margin
      expect(distToAxis).toBeGreaterThanOrEqual(1.05);
    }
  });

  it('3. Camera collision sweep prevents clipping into low vault ribs / overhead lintels', () => {
    const camera = new PerspectiveCamera(75, 16 / 9, 0.05, 200);
    const settings = defaultSettings();
    const playerCam = new PlayerCamera(camera, settings);

    const colliders = new ColliderSet(2.0);
    // Overhead lintel with bottom at y = 1.90m, top at y = 4.0m
    colliders.addBox('lintel', { x: -2, y: 1.90, z: -2 }, { x: 2, y: 4.0, z: 2 });

    // Player standing at y = 0.30m, eye stand = 1.65m -> nominal eye height = 1.95m (penetrates lintel at 1.90m)
    const snap = makeSnapshot({
      pos: { x: 0, y: 0.30, z: 0 },
    });

    playerCam.update(0.016, snap, snap, 1.0, undefined, undefined, colliders);
    // Camera Y is clamped below the lintel
    expect(camera.position.y).toBeLessThanOrEqual(1.82);
  });

  it('4. S19 Near-plane invariant: near plane never intersects water surface when standing in shallow water', () => {
    const camera = new PerspectiveCamera(75, 16 / 9, 0.05, 200);
    const settings = defaultSettings();
    const playerCam = new PlayerCamera(camera, settings);

    // G7 / S19 invariant: near plane is strictly 0.05m
    expect(camera.near).toBe(0.05);

    // Standing in shallow water (pool floor -0.42m, water level 0.0m)
    const snap = makeSnapshot({
      pos: { x: 0, y: WORLD.POOL_FLOOR_Y, z: 0 },
      wet: true,
      depth: 0.42,
      crouchT: 0.0,
    });

    // Test across full pitch range from -85 deg (-1.48 rad) looking straight down to +85 deg looking straight up
    const pitchAngles = [-1.48, -1.0, -0.5, 0, 0.5, 1.0, 1.48];
    for (const p of pitchAngles) {
      snap.pitch = p;
      playerCam.update(0.016, snap, snap, 1.0, undefined, WORLD.WATER_Y);

      // Camera near frustum lowest point
      const lowestFrustumPoint = camera.position.y - camera.near;
      expect(lowestFrustumPoint).toBeGreaterThan(WORLD.WATER_Y + 0.15);
    }
  });

  it('5. S19 Near-plane invariant: near plane never intersects water surface when crouched in shallow water', () => {
    const camera = new PerspectiveCamera(75, 16 / 9, 0.05, 200);
    const settings = defaultSettings();
    const playerCam = new PlayerCamera(camera, settings);

    // Crouched in shallow water
    const snap = makeSnapshot({
      pos: { x: 0, y: WORLD.POOL_FLOOR_Y, z: 0 },
      wet: true,
      depth: 0.42,
      crouchT: 1.0,
    });

    const pitchAngles = [-1.48, -1.0, -0.5, 0, 0.5, 1.0, 1.48];
    for (const p of pitchAngles) {
      snap.pitch = p;
      playerCam.update(0.016, snap, snap, 1.0, undefined, WORLD.WATER_Y);

      const lowestFrustumPoint = camera.position.y - camera.near;
      expect(lowestFrustumPoint).toBeGreaterThan(WORLD.WATER_Y + 0.15);
    }
  });

  it('6. Whip turn continuity: a 720°/s turn exhibits zero stepping and uniform per-frame yaw progression', () => {
    const camera = new PerspectiveCamera(75, 16 / 9, 0.05, 200);
    const settings = defaultSettings();
    const playerCam = new PlayerCamera(camera, settings);

    const turnRateRadPerSec = MathUtils.degToRad(720); // 720 deg/s ~ 12.566 rad/s
    const dt = 1 / 60;
    const expectedDeltaPerFrame = turnRateRadPerSec * dt; // ~0.2094 rad/frame

    let currentYaw = 0;
    const renderedYaws: number[] = [];

    // Simulate 60 frames (1 full second = 720 degrees rotation)
    for (let frame = 0; frame < 60; frame++) {
      currentYaw += expectedDeltaPerFrame;
      const snap = makeSnapshot({ yaw: currentYaw });

      playerCam.update(dt, snap, snap, 1.0);

      // Extract yaw from camera quaternion
      const camEuler = new PerspectiveCamera().rotation;
      camEuler.setFromQuaternion(camera.quaternion, 'YXZ');
      renderedYaws.push(camEuler.y);
    }

    // Verify delta between every consecutive frame
    for (let i = 1; i < renderedYaws.length; i++) {
      const prev = renderedYaws[i - 1]!;
      const curr = renderedYaws[i]!;

      // Shortest angle difference
      const delta = Math.atan2(Math.sin(curr - prev), Math.cos(curr - prev));

      // Assert no dropped frames (delta > 0)
      expect(delta).toBeGreaterThan(0.15);

      // Assert no quantization steps or double-jumps (close to 0.2094 rad)
      expect(delta).toBeCloseTo(expectedDeltaPerFrame, 3);
    }
  });
});
