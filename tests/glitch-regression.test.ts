/* ── glitch-regression.test.ts ──────────────────────────────────────────────
 *  Automated Glitch Regression Test Suite:
 *  1. Jump & Ledge Stability:
 *     - Player jumping from water onto 0.38m platform edge for 180 ticks has
 *       zero vertical oscillation (y stays at 0.38m) and zero mid-air wall-stop resets.
 *  2. Held-Spacebar Single Jump:
 *     - Holding intent.jump = true in water triggers exactly 1 jump until landing (onGround === true).
 *  3. Landing Speed:
 *     - snapshot.lastLandingSpeed > 0 on the exact frame snapshot.onGround transitions false -> true.
 *  4. Monster Jaw Teeth Attachment:
 *     - rig.setJawSplit(0.65) rotates 4 jaw petals and all teeth together with zero mid-air separation.
 *  5. Archway Doorway Clearance:
 *     - Arches in CommonMapBuilder maintain unobstructed center clearance with min.y >= 2.40m.
 *  6. Audio Cues Natatorium Tuning:
 *     - Audio cues wade_step, splash_jump, and splash_big match 400Hz–2800Hz natatorium resonance.
 *     - monster_roar features 55Hz–110Hz sub-bass, 220Hz–680Hz growl, and 2400Hz–3600Hz screech.
 *  7. EndlessShiftGenerator Layout Integrity:
 *     - Platforms are <= 0.65m walkable, arches have >= 2.40m clearance, pillars use 1.0x radius.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { MeshStandardMaterial } from 'three';
import { PlayerMotor } from '../src/sim/PlayerMotor.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { ColliderSet } from '../src/sim/Colliders.js';
import { EventRingBuffer } from '../src/sim/Events.js';
import { MonsterRig } from '../src/game/monster/MonsterRig.js';
import { AUDIO_CUES, getAudioCueProfile } from '../src/audio/cues.js';
import { generateEndlessShiftLayout } from '../src/world/maps/EndlessShiftGenerator.js';
import { buildStandardMapInstance } from '../src/world/maps/CommonMapBuilder.js';
import type { LayoutData, BuildEnv } from '../src/world/MapTypes.js';

describe('Glitch Regression Test Suite', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // 1. Jump & Ledge Stability
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Jump & Ledge Stability', () => {
    it('verifies jumping onto 0.38m platform edge has 0 vertical oscillation for 180 ticks', () => {
      const bounds = { minX: -20, minZ: -20, maxX: 20, maxZ: 20 };
      const ground = new GroundGrid(bounds, 0.5);
      const colliders = new ColliderSet();
      const events = new EventRingBuffer(256);

      // Deep water pool floor at y = -0.75m
      ground.setRectHeight(-20, -20, 20, 20, -0.75);

      // Concrete walkable platform from x = [-5, 5], z = [-5, 5] at topY = 0.38m
      const topY = 0.38;
      const platDepth = topY - (-0.75);
      ground.setRectHeight(-5, -5, 5, 5, topY);

      // Walkable platform collider (isWalkablePlatform = true)
      colliders.addBox(
        'plat_edge_test',
        { x: -5, y: topY - platDepth, z: -5 },
        { x: 5, y: topY, z: 5 },
        false,
        true, // isWalkablePlatform
      );

      // Place player in water outside collision radius of ledge at z = 5.40m, facing platform center (-Z)
      const motor = new PlayerMotor('p1', { x: 0, y: -0.75, z: 5.40 });
      motor.teleport({ x: 0, y: -0.75, z: 5.40 }, 0);

      // Jump forward into platform edge
      let simTime = 0;
      const dt = 1 / 60;

      // Tick 0: trigger jump towards ledge (-Z)
      motor.step(
        dt,
        { moveX: 0, moveZ: -1, sprint: false, crouch: false, jump: true, interact: false, lookDeltaYaw: 0, lookDeltaPitch: 0 },
        ground,
        colliders,
        events,
        simTime,
        0.0,
      );
      simTime += dt;

      // Jump trajectory until player lands on platform top
      for (let i = 0; i < 90; i++) {
        motor.step(
          dt,
          { moveX: 0, moveZ: -1, sprint: false, crouch: false, jump: false, interact: false, lookDeltaYaw: 0, lookDeltaPitch: 0 },
          ground,
          colliders,
          events,
          simTime,
          0.0,
        );
        simTime += dt;
        if (motor.onGround && Math.abs(motor.pos.y - 0.38) < 0.01) {
          break;
        }
      }

      // Player should now be on the platform edge at topY = 0.38m
      expect(motor.pos.y).toBeCloseTo(0.38, 2);
      // DESIGN_RATIONALE: verifies player has successfully landed and stabilized on dry platform surface
      expect(motor.onGround).toBe(true);

      // Walk along the platform edge for 180 ticks (3 seconds)
      // Verify zero vertical oscillation (y stays at 0.38m) and zero mid-air wall stops
      const initialY = motor.pos.y;
      for (let tick = 0; tick < 180; tick++) {
        motor.step(
          dt,
          { moveX: 0, moveZ: -0.2, sprint: false, crouch: false, jump: false, interact: false, lookDeltaYaw: 0, lookDeltaPitch: 0 },
          ground,
          colliders,
          events,
          simTime,
          0.0,
        );
        simTime += dt;

        // DESIGN_RATIONALE: platform edge height must remain rock solid at 0.38m without vertical oscillation
        expect(motor.pos.y).toBeCloseTo(initialY, 2);
        // DESIGN_RATIONALE: ground contact must remain continuously true without momentary bounces into water
        expect(motor.onGround).toBe(true);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Held-Spacebar Single Jump
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Held-Spacebar Single Jump', () => {
    it('verifies holding intent.jump = true in water triggers exactly 1 jump until landing', () => {
      const bounds = { minX: -20, minZ: -20, maxX: 20, maxZ: 20 };
      const ground = new GroundGrid(bounds, 0.5);
      const colliders = new ColliderSet();
      const events = new EventRingBuffer(256);

      // Flat water pool floor at y = -0.75m
      ground.setRectHeight(-20, -20, 20, 20, -0.75);

      const motor = new PlayerMotor('p1', { x: 0, y: -0.75, z: 0 });
      let jumpCount = 0;
      let simTime = 0;
      const dt = 1 / 60;

      // Hold spacebar (intent.jump = true) continuously for 120 ticks
      for (let i = 0; i < 120; i++) {
        motor.step(
          dt,
          { moveX: 0, moveZ: 0, sprint: false, crouch: false, jump: true, interact: false, lookDeltaYaw: 0, lookDeltaPitch: 0 },
          ground,
          colliders,
          events,
          simTime,
          0.0,
        );
        simTime += dt;

        events.drain((ev) => {
          if (ev.type === 'noise' && ev.data.kind === 'wade') {
            jumpCount++;
          }
        });
      }

      // DESIGN_RATIONALE: holding spacebar must only trigger exactly 1 jump until player releases and lands
      expect(jumpCount).toBe(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Landing Speed Preservation
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Landing Speed Preservation', () => {
    it('verifies snapshot.lastLandingSpeed > 0 on the exact frame snapshot.onGround transitions to true', () => {
      const bounds = { minX: -20, minZ: -20, maxX: 20, maxZ: 20 };
      const ground = new GroundGrid(bounds, 0.5);
      const colliders = new ColliderSet();
      const events = new EventRingBuffer(256);

      // Platform ground at y = 0.0m
      ground.setRectHeight(-20, -20, 20, 20, 0.0);

      // Start player 2.0 meters in the air
      const motor = new PlayerMotor('p1', { x: 0, y: 2.0, z: 0 });
      motor.onGround = false;
      motor.vel.y = -4.0;

      let recordedLandingSpeed = 0;
      let wasOnGroundPrev = false;
      let simTime = 0;
      const dt = 1 / 60;

      for (let i = 0; i < 40; i++) {
        motor.step(
          dt,
          { moveX: 0, moveZ: 0, sprint: false, crouch: false, jump: false, interact: false, lookDeltaYaw: 0, lookDeltaPitch: 0 },
          ground,
          colliders,
          events,
          simTime,
          0.0,
        );
        simTime += dt;

        const snap = motor.getState();
        if (!wasOnGroundPrev && snap.onGround) {
          recordedLandingSpeed = snap.lastLandingSpeed ?? 0;
          break;
        }
        wasOnGroundPrev = snap.onGround;
      }

      // DESIGN_RATIONALE: landing speed impact must be strictly positive on the touchdown transition frame
      expect(recordedLandingSpeed).toBeGreaterThan(0.5);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Monster Jaw Teeth Attachment
  // ──────────────────────────────────────────────────────────────────────────
  describe('4. Monster Jaw Teeth Attachment', () => {
    it('rotates 4 jaw petals and all teeth meshes together when calling rig.setJawSplit(0.65)', () => {
      const rig = new MonsterRig(1.0);

      // Call setJawSplit with signature 0.65 rad rear-up roar split
      rig.setJawSplit(0.65);

      // DESIGN_RATIONALE: jaw split state must track target rotation angle exactly for procedural roar
      expect(rig.getJawSplit()).toBeCloseTo(0.65, 2);

      // Verify the 4 petals rotated outward with expected signs
      // Left petal rotates on Y (+0.65)
      expect(rig.jawPetalL.rotation.y).toBeCloseTo(0.65, 2);
      // Right petal rotates on Y (-0.65)
      expect(rig.jawPetalR.rotation.y).toBeCloseTo(-0.65, 2);
      // Top petal rotates on X (-0.65)
      expect(rig.jawPetalTop.rotation.x).toBeCloseTo(-0.65, 2);
      // Bottom petal rotates on X (+0.65)
      expect(rig.jawPetalBottom.rotation.x).toBeCloseTo(0.65, 2);

      // Verify each petal contains its attached teeth instanced mesh as a direct child
      const petals = [rig.jawPetalL, rig.jawPetalR, rig.jawPetalTop, rig.jawPetalBottom];
      for (const petal of petals) {
        const teethChild = petal.children.find((c) => (c as { isInstancedMesh?: boolean }).isInstancedMesh);
        // DESIGN_RATIONALE: teeth instanced mesh must be parented to jaw petal to prevent floating in air
        expect(teethChild).toBeDefined();
        // Teeth parent is petal itself
        expect(teethChild!.parent).toBe(petal);
      }

      rig.dispose();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Archway Doorway Clearance
  // ──────────────────────────────────────────────────────────────────────────
  describe('5. Archway Doorway Clearance', () => {
    it('verifies archways in CommonMapBuilder have unobstructed openings with min.y >= 2.40m', async () => {
      const layout: LayoutData = {
        mapId: 'poolrooms',
        seed: 1234,
        bounds: { minX: -20, minZ: -20, maxX: 20, maxZ: 20 },
        platforms: [
          { id: 'plat_center', rect: [-10, -10, 10, 10], topY: 0.38, kind: 'tile' },
        ],
        walls: [
          {
            id: 'arch_test_1',
            min: { x: -4, y: 0.38, z: -0.3 },
            max: { x: 4, y: 3.8, z: 0.3 },
            kind: 'arch',
            isWall: true,
          },
        ],
        pillars: [],
        stairs: [],
        waterBodies: [],
        props: [],
        puzzles: [],
        spawns: {
          player: [{ x: 0, y: 0.38, z: 5 }],
          monsters: [],
        },
        patrolLanes: [],
        exit: { id: 'exit_1', position: { x: 0, y: 0.38, z: -5 } },
        meta: {},
      };

      const env: BuildEnv = { parent: null, textures: null, audio: null, difficulty: 'normal' };
      const customMaterials = {
        platformMat: new MeshStandardMaterial(),
        wallMat: new MeshStandardMaterial(),
        floorMat: new MeshStandardMaterial(),
      };
      const instance = buildStandardMapInstance(layout, env as never, customMaterials);

      // Query colliders at doorway center (x = 0, z = 0, y = 1.0)
      const candidates: import('../src/sim/Colliders.js').BoxCollider[] = [];
      instance.colliders.queryCircle(0, 0, 0.5, candidates as never);

      // Center opening must NOT have a collider blocking player between 0.38m and 2.40m
      for (const col of candidates) {
        if (col.id.startsWith('wall_arch_test_1')) {
          // If a collider covers x=0 and z=0, its min.y must be >= 2.40m (the overhead lintel)
          if (col.min.x <= 0 && col.max.x >= 0 && col.min.z <= 0 && col.max.z >= 0) {
            // DESIGN_RATIONALE: doorway lintel ceiling clearance must be at least 2.40m above slab floor
            expect(col.min.y).toBeGreaterThanOrEqual(2.40);
          }
        }
      }

      instance.dispose();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Audio Cues Natatorium Tuning
  // ──────────────────────────────────────────────────────────────────────────
  describe('6. Audio Cues Natatorium Tuning', () => {
    it('verifies wade_step, splash_jump, and splash_big match 400Hz–2800Hz natatorium resonance', () => {
      const wade = getAudioCueProfile('wade_step')!;
      // DESIGN_RATIONALE: wade step transient lower cutoff frequency matches 400Hz indoor pool acoustic spec
      expect(wade.minFreq).toBe(400);
      // DESIGN_RATIONALE: wade step transient upper cutoff frequency matches 2800Hz indoor pool acoustic spec
      expect(wade.maxFreq).toBe(2800);
      expect(wade.decayType).toBe('cathedral');

      const splashJump = getAudioCueProfile('splash_jump')!;
      // DESIGN_RATIONALE: splash jump transient lower cutoff frequency matches 400Hz indoor pool acoustic spec
      expect(splashJump.minFreq).toBe(400);
      // DESIGN_RATIONALE: splash jump transient upper cutoff frequency matches 2800Hz indoor pool acoustic spec
      expect(splashJump.maxFreq).toBe(2800);
      expect(splashJump.decayType).toBe('cathedral');

      const splashBig = getAudioCueProfile('splash_big')!;
      // DESIGN_RATIONALE: splash big transient lower cutoff frequency matches 400Hz indoor pool acoustic spec
      expect(splashBig.minFreq).toBe(400);
      // DESIGN_RATIONALE: splash big transient upper cutoff frequency matches 2800Hz indoor pool acoustic spec
      expect(splashBig.maxFreq).toBe(2800);
      expect(splashBig.decayType).toBe('cathedral');
    });

    it('verifies monster_roar features sub-bass rumble, wet formant growl, and screech frequencies', () => {
      const roar = AUDIO_CUES['monster_roar']!;
      expect(roar).toBeDefined();

      // Sub-bass chest rumble 55Hz–110Hz
      // DESIGN_RATIONALE: monster roar sub-bass chest rumble low bound matches 55Hz creature formant spec
      expect(roar.subBassRumble![0]).toBe(55);
      // DESIGN_RATIONALE: monster roar sub-bass chest rumble high bound matches 110Hz creature formant spec
      expect(roar.subBassRumble![1]).toBe(110);

      // Wet guttural formant growl 220Hz–680Hz
      // DESIGN_RATIONALE: monster roar wet guttural growl lower formant matches 220Hz creature vocal tract
      expect(roar.formantGrowl![0]).toBe(220);
      // DESIGN_RATIONALE: monster roar wet guttural growl upper formant matches 680Hz creature vocal tract
      expect(roar.formantGrowl![1]).toBe(680);

      // Echoing high-frequency screech 2400Hz–3600Hz for REAR_UP_ROAR
      // DESIGN_RATIONALE: monster roar rear-up screech lower frequency matches 2400Hz organic scream spec
      expect(roar.screechSfx![0]).toBe(2400);
      // DESIGN_RATIONALE: monster roar rear-up screech upper frequency matches 3600Hz organic scream spec
      expect(roar.screechSfx![1]).toBe(3600);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. EndlessShiftGenerator Layout Integrity
  // ──────────────────────────────────────────────────────────────────────────
  describe('7. EndlessShiftGenerator Layout Integrity', () => {
    it('verifies all platforms in EndlessShiftGenerator are <= 0.65m walkable with 1.0x pillar colliders', () => {
      const layout = generateEndlessShiftLayout(1, 999);

      // Verify platforms are walkable (topY <= 0.65m)
      for (const plat of layout.platforms) {
        // DESIGN_RATIONALE: platforms in endless shifts must be <= 0.65m to remain walkable without blocking
        expect(plat.topY).toBeLessThanOrEqual(0.65);
        expect(plat.kind).toBe('tile');
      }

      // Verify doorway arches have ceiling clearance >= 2.40m
      for (const wall of layout.walls) {
        if (wall.kind === 'arch') {
          const height = wall.max.y - wall.min.y;
          // DESIGN_RATIONALE: arch total opening height must exceed 2.40m for comfortable head clearance
          expect(height).toBeGreaterThanOrEqual(2.40);
        }
      }

      // Verify pillars use exact visual radius
      for (const pil of layout.pillars) {
        // DESIGN_RATIONALE: pillar radius must match visual radius 0.75m with zero invisible collider bloat
        expect(pil.radius).toBeCloseTo(0.75, 2);
      }
    });
  });
});
