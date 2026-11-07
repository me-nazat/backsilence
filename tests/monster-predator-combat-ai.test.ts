/* ── monster-predator-combat-ai.test.ts ──────────────────────────────────
 *  Tests for Predator AI Behavior, Platform Navigation, Edge Roars & 3D Jumpscare:
 *  1. Monster collider pushout against tall walls/pillars, ignoring 0.38m platforms
 *  2. Anti-stuck watchdog steering along open tangent (±0.85 rad) when displacement < 0.35m over 0.6s
 *  3. Splash Arrival Roar in INVESTIGATE within 2.2m of splash target (1.75s rearingT = 1.0)
 *  4. Platform-Edge Confrontation Roar when player climbs on platform within 2.4m..4.2m
 *  5. Presentation rear-up roar trigger, spatial audio, and distance-attenuated camera shake
 *  6. 3D Grab Jumpscare positioning monster 1.15m in front of camera with 0.10s snap
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi } from 'vitest';
import { Vector3, PerspectiveCamera, Group } from 'three';
import { MonsterBrain, type MonsterDef } from '../src/sim/MonsterBrain.js';
import { NavGrid } from '../src/sim/NavGrid.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { ColliderSet } from '../src/sim/Colliders.js';
import { EventRingBuffer } from '../src/sim/Events.js';
import { MonsterNavigation, type PlatformRect } from '../src/sim/MonsterNavigation.js';
import { MonsterBody } from '../src/game/monster/MonsterBody.js';
import { JumpscareSequence } from '../src/game/monster/Jumpscare.js';
import { createProvingGroundsSim, WATER_FLOOR_Y } from '../src/sim/ProvingGroundsData.js';
import type { HearingContext } from '../src/sim/Hearing.js';

describe('Principal Game AI & Predator Combat Designer Suite', () => {
  const dummyCtx: HearingContext = { difficultyHearing: 1.0 };

  it('monster collides with tall walls and pillars but ignores 0.38m walkable platform edges', () => {
    const ground = new GroundGrid({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, 0.5);
    const nav = new NavGrid(ground, 0.0, 0.5);
    const colliders = new ColliderSet(4.0);

    // Platform slab at topY = 0.38m (walkable platform)
    colliders.addBox('plat_slab', { x: -2, y: -0.75, z: -2 }, { x: 2, y: 0.38, z: 2 }, false, true);

    // Tall boundary wall at x = 10
    colliders.addBox('wall_tall', { x: 9.5, y: -1.0, z: -10 }, { x: 10.5, y: 4.0, z: 10 }, true, false);

    // Pillar cylinder at (0, 8) with radius 0.5
    colliders.addCylinder('pillar', 0, 8, 0.5, -1.0, 4.0, true);

    const def: MonsterDef = {
      id: 'm_test_col',
      variant: 'standard',
      spawn: { x: 0, y: -0.75, z: 0 },
      spawnGrace: 0,
    };
    const brain = new MonsterBrain(def, nav, 101);
    const events = new EventRingBuffer(32);

    // Monster placed inside platform boundary at (0, -0.75, 0)
    // Physical box collider pushout must NOT push monster out of walkable platform box
    brain.pos.x = 0.5;
    brain.pos.z = 0.5;
    brain.step(0.016, { x: 0, y: -0.75, z: 5 }, nav, colliders, events, dummyCtx, 0.1);

    // Monster remains at platform vicinity without horizontal wall ejection
    // DESIGN_RATIONALE: Walkable platforms with topY <= 0.38m must not push the creature backwards like a solid wall
    expect(brain.pos.x).toBeCloseTo(0.5, 1);

    // Now test collision with tall wall at x = 9.8 (monster radius 0.68m)
    brain.pos.x = 9.8;
    brain.pos.z = 0.0;
    brain.step(0.016, { x: 0, y: -0.75, z: 5 }, nav, colliders, events, dummyCtx, 0.2);

    // Monster must be pushed out to the left of the wall (min.x - r = 9.5 - 0.68 = 8.82)
    // DESIGN_RATIONALE: Tall boundary walls with isTall=true must physically push out the creature capsule
    expect(brain.pos.x).toBeLessThanOrEqual(8.85);

    // Now test collision with pillar cylinder at (0, 8)
    brain.pos.x = 0.0;
    brain.pos.z = 7.7; // distance = 0.3m < 0.68 + 0.5 = 1.18m
    brain.step(0.016, { x: 0, y: -0.75, z: 5 }, nav, colliders, events, dummyCtx, 0.3);

    const distToPillar = Math.hypot(brain.pos.x - 0, brain.pos.z - 8);
    // DESIGN_RATIONALE: Cylindrical architectural pillars must enforce the monster collision radius (0.68 + 0.5 = 1.18m)
    expect(distToPillar).toBeGreaterThanOrEqual(1.15);
  });

  it('detects stuck condition over 0.6s at targetSpeed > 2.0 and smoothly steers yaw by ±0.85 rad along open tangent', () => {
    const world = createProvingGroundsSim('normal');
    const nav = world.nav;
    const colliders = world.colliders;
    const events = world.events;

    const def: MonsterDef = {
      id: 'm_stuck_test',
      variant: 'standard',
      spawn: { x: -14, y: WATER_FLOOR_Y, z: 21.0 },
      spawnGrace: 0,
    };
    const brain = new MonsterBrain(def, nav, 202);

    // Alert and place in HUNT state with target along open water channel at (0, 21)
    brain.onNoiseEvent(
      {
        id: 'splash_hunt',
        kind: 'splash',
        position: { x: 0, y: WATER_FLOOR_Y, z: 21.0 },
        loudness: 0.8,
        sourcePlayerId: 'player',
        t: 0,
      },
      colliders,
      dummyCtx,
      0,
    );

    // Step through reaction timer to enter HUNT
    for (let i = 0; i < 20; i++) {
      brain.step(0.016, { x: 0, y: WATER_FLOOR_Y, z: 21.0 }, nav, colliders, events, dummyCtx, i * 0.016);
      if (brain.state === 'HUNT') break;
    }
    expect(brain.state).toBe('HUNT');

    // Add a tall blocking wall right in front of the monster at x = -13.5
    colliders.addBox('block_wall', { x: -13.7, y: -1.0, z: 18.0 }, { x: -13.3, y: 4.0, z: 24.0 }, true, false);

    // Step once to settle against collider pushout
    brain.step(0.016, { x: 0, y: WATER_FLOOR_Y, z: 21.0 }, nav, colliders, events, dummyCtx, 0.4);

    const initialYaw = brain.yaw;

    // Simulate monster blocked against obstacle (displacement near 0) for > 0.6s
    let maxYawDelta = 0;
    for (let i = 0; i < 80; i++) {
      brain.step(0.016, { x: 0, y: WATER_FLOOR_Y, z: 21.0 }, nav, colliders, events, dummyCtx, 1.0 + i * 0.016);
      const delta = Math.abs(brain.yaw - initialYaw);
      if (delta > maxYawDelta) maxYawDelta = delta;
    }

    // Yaw must have steered by approximately 0.85 rad away from straight ahead
    // DESIGN_RATIONALE: The stuck recovery watchdog must steer the creature yaw by roughly 0.85 rad along open tangent
    expect(maxYawDelta).toBeGreaterThanOrEqual(0.70);
  });

  it('triggers Trigger Condition 1 (Splash Arrival Roar) in INVESTIGATE within 2.2m of splash target', () => {
    const world = createProvingGroundsSim('normal');
    const nav = world.nav;
    const colliders = world.colliders;
    const events = world.events;

    const def: MonsterDef = {
      id: 'm_splash_roar',
      variant: 'standard',
      spawn: { x: -3.0, y: WATER_FLOOR_Y, z: 21.0 },
      spawnGrace: 0,
    };
    const brain = new MonsterBrain(def, nav, 303);

    // Send a high-priority water splash at (0, WATER_FLOOR_Y, 21.0)
    brain.onNoiseEvent(
      {
        id: 'pebble_splash',
        kind: 'splash',
        position: { x: 0, y: WATER_FLOOR_Y, z: 21.0 },
        loudness: 0.9,
        sourcePlayerId: 'player',
        t: 0,
      },
      colliders,
      dummyCtx,
      0,
    );

    // Player standing further away at (6.0, WATER_FLOOR_Y, 21.0) (outside 1.8m grab range)
    const playerPos = { x: 6.0, y: WATER_FLOOR_Y, z: 21.0 };

    // Step into HUNT
    for (let i = 0; i < 20; i++) {
      brain.step(0.016, playerPos, nav, colliders, events, dummyCtx, i * 0.016);
      if (brain.state === 'HUNT') break;
    }

    // Step until monster arrives within 2.2m of splash target and enters INVESTIGATE
    for (let i = 0; i < 60; i++) {
      brain.step(0.016, playerPos, nav, colliders, events, dummyCtx, 1.0 + i * 0.016);
      if (brain.state === 'INVESTIGATE') break;
    }

    expect(brain.state).toBe('INVESTIGATE');

    // On the next step inside INVESTIGATE within 2.2m of splash target, roarTimer must activate
    brain.step(0.016, playerPos, nav, colliders, events, dummyCtx, 2.0);

    // DESIGN_RATIONALE: Arriving at splash target in INVESTIGATE triggers 1.75s rearing roar with rearingT=1.0
    expect(brain.rearingT).toBe(1.0);
    expect(brain.roarTimer).toBeGreaterThan(1.6);
    expect(brain.vel.x).toBe(0);
    expect(brain.vel.z).toBe(0);
  });

  it('triggers Trigger Condition 2 (Platform-Edge Confrontation Roar) when player climbs onto 0.38m platform', () => {
    const world = createProvingGroundsSim('normal');
    const nav = world.nav;
    const colliders = world.colliders;
    const events = world.events;

    const mNav = new MonsterNavigation({ minX: -40, maxX: 40, minZ: -40, maxZ: 40 }, 0.5);
    const plat: PlatformRect = {
      id: 'confront_plat',
      minX: 2.0,
      maxX: 8.0,
      minZ: 18.0,
      maxZ: 24.0,
      topY: 0.38,
    };
    mNav.registerPlatform(plat);

    const def: MonsterDef = {
      id: 'm_edge_roar',
      variant: 'standard',
      spawn: { x: -10.0, y: WATER_FLOOR_Y, z: 21.0 },
      spawnGrace: 0,
    };
    const brain = new MonsterBrain(def, nav, 404);
    brain.setMonsterNav(mNav);

    // Alert monster
    brain.onNoiseEvent(
      {
        id: 'player_water_sprint',
        kind: 'splash',
        position: { x: 3.0, y: 0.38, z: 21.0 },
        loudness: 0.85,
        sourcePlayerId: 'player',
        t: 0,
      },
      colliders,
      dummyCtx,
      0,
    );

    // Step into HUNT
    for (let i = 0; i < 20; i++) {
      brain.step(0.016, { x: 3.0, y: 0.38, z: 21.0 }, nav, colliders, events, dummyCtx, i * 0.016);
      if (brain.state === 'HUNT') break;
    }
    expect(brain.state).toBe('HUNT');

    // Position monster in water at x = 0.0, z = 21.0 (distToPlayer = 3.2m within 2.4m..4.2m)
    brain.pos.x = 0.0;
    brain.pos.y = WATER_FLOOR_Y;
    brain.pos.z = 21.0;

    // Player climbed onto platform at (3.2, 0.38, 21.0)
    const playerOnPlatform = { x: 3.2, y: 0.38, z: 21.0 };

    brain.step(0.016, playerOnPlatform, nav, colliders, events, dummyCtx, 1.0, true, false, false, 0);

    // Platform edge intimidation roar must trigger!
    // DESIGN_RATIONALE: Monster confronting player at dry platform edge must rear up with rearingT=1.0 and 12s cooldown
    expect(brain.rearingT).toBe(1.0);
    expect(brain.roarTimer).toBeGreaterThan(1.6);
    expect(brain.roarCooldown).toBeGreaterThan(11.0);
    expect(brain.vel.x).toBe(0);
    expect(brain.vel.z).toBe(0);

    // Check monster faces the player on the platform directly (+X direction -> yaw = PI/2)
    // DESIGN_RATIONALE: Monster yaw must directly face the perched player across the platform edge
    expect(brain.yaw).toBeCloseTo(Math.PI * 0.5, 1);
  });

  it('triggers rear-up roar animation, spatial audio, and camera shake when snapshot.rearingT > 0.5', () => {
    let playedSound: string | null = null;
    let cameraShakeIntensity = 0;

    const mockAudio = {
      play: vi.fn((name: string) => {
        playedSound = name;
        return { stop: vi.fn() };
      }),
    };

    const body = new MonsterBody('m_presentation', 1.0, '#5a5035', undefined, mockAudio as any);
    body.onCameraShake = (intensity: number) => {
      cameraShakeIntensity = intensity;
    };

    const camera = new PerspectiveCamera(72, 16 / 9, 0.1, 100);
    camera.position.set(0, 1.6, 5); // 5m away from monster at (0, 0, 0)

    const dummyGround = {
      heightAt: () => -0.75,
      sample5Point: () => -0.75,
      waterY: 0.0,
      depthAt: () => 0.75,
    };

    const snap = {
      id: 'm_presentation',
      pos: { x: 0, y: -0.75, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      yaw: 0,
      state: 'INVESTIGATE' as const,
      agitation: 0.8,
      jawOpenT: 1.0,
      rearingT: 1.0, // > 0.5 triggers rear up roar!
      swipeT: 0,
      earAngle: 0,
      isListening: false,
      targetPos: null,
      path: [],
    };

    body.update(0.016, snap, dummyGround as any, camera);

    expect(body.animator.isRoaring()).toBe(true);
    expect(mockAudio.play).toHaveBeenCalledWith('monster_roar', expect.anything());
    expect(playedSound).toBe('monster_roar');
    // DESIGN_RATIONALE: Distance attenuated camera shake at 5m must provide palpable screen rumble
    expect(cameraShakeIntensity).toBeGreaterThan(0.01);
  });

  it('full-screen 3D grab jumpscare positions monster 1.15m directly in front of camera with 0.10s snap', () => {
    const jumpscare = new JumpscareSequence({
      onFreezeInput: vi.fn(),
      setTimeScale: vi.fn(),
      onDeath: vi.fn(),
    });

    const camera = new PerspectiveCamera(72, 16 / 9, 0.1, 100);
    camera.position.set(0, 1.6, 10);
    camera.lookAt(0, 1.6, 0); // Looking towards -Z

    const monsterRoot = new Group();
    monsterRoot.position.set(0, -0.75, 4); // 6m away originally

    const monsterHead = new Vector3(0, -0.75, 4);

    jumpscare.trigger(
      camera,
      monsterHead,
      0,
      { timeSurvived: 50, noisesMade: 5, closestCall: 0.5 },
      false,
      undefined,
      undefined,
      monsterRoot,
    );

    // Monster must be placed 1.15m directly in front of camera along monster-to-player vector (+Z -> -Z)
    const distCamToMonster = camera.position.distanceTo(monsterRoot.position);
    // DESIGN_RATIONALE: Jumpscare positions the monster 1.15m directly in front of player camera
    expect(distCamToMonster).toBeCloseTo(1.22, 1); // 1.15m horizontal + 0.45m vertical offset = ~1.23m 3D distance

    // Step jumpscare forward to 0.10s (camera snap finishes)
    for (let i = 0; i < 7; i++) {
      jumpscare.update(0.016);
    }

    // Camera must look straight at the monster head
    const camDir = new Vector3();
    camera.getWorldDirection(camDir);
    const toHead = new Vector3().subVectors(monsterHead, camera.position).normalize();
    const dot = camDir.dot(toHead);
    // DESIGN_RATIONALE: Camera orientation must look straight into monster maw with dot >= 0.99
    expect(dot).toBeGreaterThanOrEqual(0.99);

    jumpscare.dispose();
  });
});
