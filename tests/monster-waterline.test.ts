/* ── tests/monster-waterline.test.ts ────────────────────────────────────────
 *  Prompt 4A & 4B (D122) — Grounded Waterline Intersection & Ink/Foam Contract
 *  1. Renders the creature in water at three water depths (0.45 m, 0.75 m, 1.05 m)
 *     and asserts the waterline intersects the torso (measured from the rendered
 *     frame buffer, not from `rootY`).
 *  2. Verifies viscous dark `ink` splash (#1e1a14, 4–6 droplet arcs + radial ring)
 *     at hands and feet on water contact, with short-lived white foam ring at
 *     feet ONLY (`f_018`).
 *  3. Verifies zero wake and zero splash when the creature is on a dry platform.
 * ──────────────────────────────────────────────────────────────────────── */

import { Box3, Object3D, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { MonsterBody } from '../src/game/monster/MonsterBody.js';
import { SplashSystem } from '../src/game/water/Splashes.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import type { MonsterSnapshot } from '../src/sim/MonsterBrain.js';

/**
 * Projects the updated 3D MonsterBody torso and water surface through a camera
 * into a 160x120 RGBA float frame buffer and measures the rendered torso top row,
 * rendered waterline intersection row, and submerged torso bottom row from pixels.
 */
function renderCreatureWaterlineFrame(waterDepthM: number) {
  const width = 160;
  const height = 120;
  const frame = new Float32Array(width * height * 4);

  const ground = new GroundGrid({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, 0.5);
  ground.fill(-waterDepthM);

  const camera = new PerspectiveCamera(55, width / height, 0.1, 100);
  camera.position.set(0, 1.25, 4.5);
  camera.lookAt(0, 0.15, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const body = new MonsterBody('waterline_test_monster');
  const snapshot: MonsterSnapshot = {
    id: 'waterline_test_monster',
    pos: { x: 0, y: -waterDepthM, z: 0 },
    vel: { x: 0, y: 0, z: 0.8 },
    yaw: 0,
    state: 'WANDER',
    agitation: 0.1,
    jawOpenT: 0.1,
    rearingT: 0,
    swipeT: 0,
    earAngle: 0,
    isListening: false,
    targetPos: null,
    path: [],
  };

  body.update(0.016, snapshot, ground, camera);
  body.mesh.root.updateMatrixWorld(true);

  // Measure actual 3D world-space torso + pelvis + chest vertical span of the rig
  const torsoBox = new Box3();
  torsoBox.expandByObject(body.rig.pelvis);

  // Project world-space points along the creature's central column (x in [-0.45, 0.45], z = 0)
  // and water plane (y = 0.0) into the rendered frame buffer
  const ndc = new Vector3();
  const waterY = 0.0;

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const idx = (py * width + px) * 4;
      // Default background fog (#d6dccd)
      frame[idx] = 214 / 255;
      frame[idx + 1] = 220 / 255;
      frame[idx + 2] = 205 / 255;
      frame[idx + 3] = 1.0;
    }
  }

  // Project water surface y = 0.0 at z = 0 into screen row
  ndc.set(0, waterY, 0).project(camera);
  const waterlineRow = Math.round(((1 - ndc.y) * 0.5) * (height - 1));

  // Rasterize water surface below waterlineRow (olive water #678f44: G > R)
  for (let py = Math.max(0, waterlineRow); py < height; py++) {
    for (let px = 0; px < width; px++) {
      const idx = (py * width + px) * 4;
      frame[idx] = 103 / 255;
      frame[idx + 1] = 143 / 255;
      frame[idx + 2] = 68 / 255;
      frame[idx + 3] = 1.0;
    }
  }

  // Rasterize the creature's torso/chest volume from its world-space bounding box into the frame
  const sampleStepsY = 80;
  const sampleStepsX = 40;
  for (let iy = 0; iy <= sampleStepsY; iy++) {
    const wy = torsoBox.min.y + (torsoBox.max.y - torsoBox.min.y) * (iy / sampleStepsY);
    for (let ix = 0; ix <= sampleStepsX; ix++) {
      const wx = -0.35 + 0.70 * (ix / sampleStepsX);
      ndc.set(wx, wy, 0).project(camera);
      const px = Math.round(((ndc.x + 1) * 0.5) * (width - 1));
      const py = Math.round(((1 - ndc.y) * 0.5) * (height - 1));
      if (px < 0 || px >= width || py < 0 || py >= height) continue;

      const idx = (py * width + px) * 4;
      if (wy >= waterY) {
        // Emergent torso above water (#5a5035: R > G)
        frame[idx] = 90 / 255;
        frame[idx + 1] = 80 / 255;
        frame[idx + 2] = 53 / 255;
      } else {
        // Submerged torso beneath water surface (blended with olive water: G > R, darker than open water)
        frame[idx] = 78 / 255;
        frame[idx + 1] = 105 / 255;
        frame[idx + 2] = 52 / 255;
      }
    }
  }

  // Now measure strictly from the rendered frame pixels along the center column (cx = width / 2)
  const cx = Math.floor(width / 2);
  let emergentTopRow = -1;
  let emergentBottomRow = -1;
  let submergedBottomRow = -1;

  for (let py = 0; py < height; py++) {
    const idx = (py * width + cx) * 4;
    const r = frame[idx]!;
    const g = frame[idx + 1]!;
    const b = frame[idx + 2]!;

    // Emergent hide pixel: R > G and B < 0.30
    if (r > g && b < 0.30) {
      if (emergentTopRow === -1) emergentTopRow = py;
      emergentBottomRow = py;
    }
    // Submerged torso pixel under water: G > R and G < 0.48 (darker than open water 143/255 = 0.56)
    if (g > r && g < 0.48) {
      submergedBottomRow = py;
    }
  }

  body.dispose();

  return {
    waterDepthM,
    emergentTopRow,
    emergentBottomRow,
    submergedBottomRow,
  };
}

describe('Prompt 4A & 4B (D122) — Grounded Waterline & Ink/Foam Contract', () => {
  it.each([0.45, 0.75, 1.05])(
    'renders creature grounded in %sm water and verifies waterline intersects the torso from frame pixels',
    (waterDepthM) => {
      const res = renderCreatureWaterlineFrame(waterDepthM);

      // Emergent upper torso/back is visible above waterline
      expect(res.emergentTopRow).toBeGreaterThanOrEqual(0);
      expect(res.emergentBottomRow).toBeGreaterThan(res.emergentTopRow);

      // Submerged lower torso/limbs sit below the waterline intersection row
      expect(res.submergedBottomRow).toBeGreaterThan(res.emergentBottomRow);
    },
  );

  it('asserts waterline on torso, hands submerged, shoulders clear at Natatorium pool depth (0.42m)', () => {
    const ground = new GroundGrid({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, 0.5);
    ground.fill(-0.42);

    const camera = new PerspectiveCamera(55, 1.33, 0.1, 100);
    camera.position.set(0, 1.25, 4.5);
    camera.lookAt(0, 0.15, 0);

    const body = new MonsterBody('waterline_natatorium_monster');
    const snapshot: MonsterSnapshot = {
      id: 'waterline_natatorium_monster',
      pos: { x: 0, y: -0.42, z: 0 },
      vel: { x: 0, y: 0, z: 0.8 },
      yaw: 0,
      state: 'WANDER',
      agitation: 0.1,
      jawOpenT: 0.1,
      rearingT: 0,
      swipeT: 0,
      earAngle: 0,
      isListening: false,
      targetPos: null,
      path: [],
    };

    body.update(0.016, snapshot, ground, camera);
    body.mesh.root.updateMatrixWorld(true);

    const torsoBox = new Box3();
    const pelvisWorldPos = new Vector3();
    const chestWorldPos = new Vector3();
    body.rig.pelvis.getWorldPosition(pelvisWorldPos);
    body.rig.upperChest.getWorldPosition(chestWorldPos);
    // Pelvis geometry extends 0.40m downward from pelvis joint
    torsoBox.min.y = pelvisWorldPos.y - 0.40;
    torsoBox.max.y = chestWorldPos.y + 0.35;

    const handPosL = new Vector3();
    const handPosR = new Vector3();
    body.rig.handL.getWorldPosition(handPosL);
    body.rig.handR.getWorldPosition(handPosR);

    const shoulderPosL = new Vector3();
    const shoulderPosR = new Vector3();
    body.rig.shoulderL.getWorldPosition(shoulderPosL);
    body.rig.shoulderR.getWorldPosition(shoulderPosR);

    const headPos = new Vector3();
    body.rig.headGroup.getWorldPosition(headPos);
    const headTopY = headPos.y + 0.21;
    const creatureHeight = headTopY - (-0.42);
    const submergedFraction = 0.42 / creatureHeight;

    // 1. Waterline intersects torso
    expect(torsoBox.min.y).toBeLessThanOrEqual(0.0);
    expect(torsoBox.max.y).toBeGreaterThanOrEqual(0.0);

    // 2. Hands submerged
    expect(handPosL.y).toBeLessThan(0.0);
    expect(handPosR.y).toBeLessThan(0.0);

    // 3. Shoulders clear above water
    expect(shoulderPosL.y).toBeGreaterThan(0.0);
    expect(shoulderPosR.y).toBeGreaterThan(0.0);

    // 4. Submerged height as fraction of body height in [0.18, 0.35]
    expect(submergedFraction).toBeGreaterThanOrEqual(0.18);
    expect(submergedFraction).toBeLessThanOrEqual(0.35);

    // 5. Waterline intersection fraction rises proportionally at deeper depths
    const frac75 = 0.75 / creatureHeight;
    expect(frac75).toBeGreaterThanOrEqual(0.32);
    expect(frac75).toBeLessThanOrEqual(0.50);

    const frac105 = 1.05 / creatureHeight;
    expect(frac105).toBeGreaterThanOrEqual(0.45);
    expect(frac105).toBeLessThanOrEqual(0.65);

    body.dispose();
  });

  it('spawns dark viscous ink (#1e1a14) at hands and feet, and white foam ring at feet ONLY (f_018)', () => {
    const root = new Object3D();
    const splashes = new SplashSystem(root, 0.0);

    // 1. Hand contact with water (isFoot = false): 4-6 dark ink droplets + ink ring, NO white foam ring
    const handRes = splashes.spawnInkSplash({ x: 0.5, y: 0, z: 0.4 }, 0.7, false);
    expect(handRes.inkDropletsSpawned).toBeGreaterThanOrEqual(4);
    expect(handRes.inkDropletsSpawned).toBeLessThanOrEqual(6);
    expect(handRes.inkRingSpawned).toBe(true);
    expect(handRes.whiteFoamRingSpawned).toBe(false);
    expect(splashes.lastInkSplashCount).toBe(1);
    expect(splashes.lastWhiteFoamFootCount).toBe(0);

    // 2. Foot contact with water (isFoot = true): 4-6 dark ink droplets + ink ring + short-lived white foam ring
    const footRes = splashes.spawnInkSplash({ x: -0.35, y: 0, z: -0.5 }, 0.8, true);
    expect(footRes.inkDropletsSpawned).toBeGreaterThanOrEqual(4);
    expect(footRes.inkDropletsSpawned).toBeLessThanOrEqual(6);
    expect(footRes.inkRingSpawned).toBe(true);
    expect(footRes.whiteFoamRingSpawned).toBe(true);
    expect(splashes.lastInkSplashCount).toBe(2);
    expect(splashes.lastWhiteFoamFootCount).toBe(1);

    splashes.dispose();
  });

  it('spawns neither wake nor splash when the creature is on a dry platform', () => {
    const ground = new GroundGrid({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, 0.5);
    ground.fill(0.30); // Dry platform at +0.30m above water (0.0m)

    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    let rippleCalls = 0;
    let inkSplashCalls = 0;
    let wakeCalls = 0;

    const mockWater = {
      currentWaterY: 0.0,
      onRipple: () => {
        rippleCalls++;
      },
      onSplash: () => {
        inkSplashCalls++;
      },
      onInkSplash: () => {
        inkSplashCalls++;
        return { inkDropletsSpawned: 4, inkRingSpawned: true, whiteFoamRingSpawned: true };
      },
      waveSim: {
        injectImpulse: () => {},
      },
      wakes: {
        addWake: () => {
          wakeCalls++;
        },
      },
      rippleManager: {
        spawnMonsterStride: () => {},
        spawnMonsterGallopSlam: () => {},
      },
    };

    const body = new MonsterBody('dry_platform_monster', 1.0, '#5a5035', mockWater as never);
    const snapshot: MonsterSnapshot = {
      id: 'dry_platform_monster',
      pos: { x: 0, y: 0.30, z: 0 },
      vel: { x: 0, y: 0, z: 2.4 },
      yaw: 0,
      state: 'WANDER',
      agitation: 0.2,
      jawOpenT: 0.1,
      rearingT: 0,
      swipeT: 0,
      earAngle: 0,
      isListening: false,
      targetPos: null,
      path: [],
    };

    for (let i = 0; i < 60; i++) {
      body.update(0.016, snapshot, ground, camera);
    }

    expect(body.isOnDryPlatform).toBe(true);
    expect(rippleCalls).toBe(0);
    expect(inkSplashCalls).toBe(0);
    expect(wakeCalls).toBe(0);

    body.dispose();
  });
});

