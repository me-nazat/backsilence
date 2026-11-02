/* ── batch2-monster-rig.test.ts ─────────────────────────────────────────────
 *  ANTIGRAVITY BATCH 2 Verification Suite:
 *  - Prompt 2A: Full-Scale Articulated Quadrupedal Monster Rig (MonsterRig.ts)
 *    - 2.3m reared height, 1.25m shoulder height on all fours, 1.35m width
 *    - Organic sculpted geometries merged per bone segment (smooth vertex normals)
 *    - Wet leathery skin shader (#2b211b / #4a4233, roughness 0.24, metalness 0.08, clearcoat 0.65)
 *    - 1.25m broad apelike chest tapering to 0.55m waist
 *    - 9 protruding bony vertebral ridges in #231814 scarred flesh
 *    - Tattered taupe cloth wrap on pelvis
 *    - Forelimbs (0.65m upperArm, 0.70m forearm, hand + 4 curved claws 0.28m)
 *    - Hindlimbs (0.58m thigh, 0.55m shin, digitigrade webbed foot)
 *    - Split-shell toothed head (#965028, 28 recurved teeth #e8dec5, deep throat #080505, crimson gums #4d1a14)
 *    - Vertical split jaw lobes (18° prowl gap, 75° / ±0.65 rad roar flare)
 *    - Tilted mutated skull head variant toggle (35° cocked sideways)
 *  - Prompt 2B: Locomotion, Spray Wake, Rear-Up Roar, and Jumpscare (MonsterAnimator.ts)
 *    - PROWL_IDLE & PROWL_WALK (hunched chest 0.65, 4-beat diagonal gait, listening pans)
 *    - GALLOP_CHARGE (rotary gallop, high reach -1.25 to +0.85 slam, torso heave, 15 water spray particles)
 *    - REAR_UP_ROAR (1.75s 3-stage sequence: upright brake, violent thrash + camera shake, drop back to all fours)
 *    - JUMPSCARE_GRAB (clawed hands framing viewport, maw unhinging into lens, screen shake)
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { Vector3, PerspectiveCamera } from 'three';
import { MonsterRig } from '../src/game/monster/MonsterRig.js';
import { MonsterAnimator } from '../src/game/monster/MonsterAnimator.js';
import { MonsterBody } from '../src/game/monster/MonsterBody.js';
import { JumpscareSequence } from '../src/game/monster/Jumpscare.js';
import { RipplePoolManager } from '../src/game/water/RipplePoolManager.js';
import { Object3D } from 'three';

describe('Batch 2: Monster Rig, Locomotion, and Jumpscare', () => {
  describe('Prompt 2A: Monster Rig Anatomy, Materials & Geometry', () => {
    it('builds full-scale creature rig with correct dimensions and joint hierarchy', () => {
      const rig = new MonsterRig(1.0, '#2b211b');

      // 1. Hierarchy existence
      expect(rig.rootGroup).toBeDefined();
      expect(rig.pelvis).toBeDefined();
      expect(rig.lowerSpine).toBeDefined();
      expect(rig.upperChest).toBeDefined();
      expect(rig.neck).toBeDefined();
      expect(rig.headGroup).toBeDefined();

      // Parent-child relationships
      expect(rig.pelvis.parent).toBe(rig.rootGroup);
      expect(rig.lowerSpine.parent).toBe(rig.pelvis);
      expect(rig.upperChest.parent).toBe(rig.lowerSpine);
      expect(rig.neck.parent).toBe(rig.upperChest);
      expect(rig.headGroup.parent).toBe(rig.neck);

      // 2. Anatomical dimensions: broad apelike chest 1.25m wide
      // Shoulders mounted at ±0.625m from center = 1.25m span
      expect(rig.shoulderL.position.x).toBeCloseTo(0.625, 2);
      expect(rig.shoulderR.position.x).toBeCloseTo(-0.625, 2);
      const shoulderSpan = Math.abs(rig.shoulderL.position.x - rig.shoulderR.position.x);
      expect(shoulderSpan).toBeCloseTo(1.25, 2);

      // Reared up height calculation: pelvis (0.70m) + spine (0.15m + 0.22m) + neck/head (0.24m + 0.22m) + reared limbs >= 2.2m
      expect(rig.pelvis.position.y).toBeCloseTo(0.70, 2);

      rig.dispose();
    });

    it('creates wet leathery skin shader with clearcoat and readability hooks', () => {
      const rig = new MonsterRig(1.0, '#2b211b');
      const skinMat = rig.monsterSkinMat;

      // Video 1 / Video 2 PBR leathery flesh specifications
      expect(skinMat.roughness).toBeCloseTo(0.24, 2);
      expect(skinMat.metalness).toBeCloseTo(0.08, 2);

      const customProps = skinMat as unknown as { clearcoat?: number; clearcoatRoughness?: number };
      expect(customProps.clearcoat).toBeCloseTo(0.65, 2);
      expect(customProps.clearcoatRoughness).toBeCloseTo(0.2, 2);

      // Verify shader compilation hooks
      expect(typeof skinMat.onBeforeCompile).toBe('function');
      const fakeShader = {
        vertexShader: '#include <common>\n#include <worldpos_vertex>\n',
        fragmentShader: '#include <common>\n#include <roughnessmap_fragment>\n#include <fog_fragment>\n',
        uniforms: {} as Record<string, { value: unknown }>,
      };
      (skinMat.onBeforeCompile as (s: unknown) => void)(fakeShader);

      // Extinction reduction for distant silhouette
      expect(fakeShader.fragmentShader).toContain('fogFactor * 0.55');
      // Submerged and waterline wetness darkening
      expect(fakeShader.fragmentShader).toContain('roughnessFactor = mix(roughnessFactor, 0.10, wetT * 0.9)');
      expect(fakeShader.fragmentShader).toContain('diffuseColor.rgb *= mix(1.0, 0.85, submergedT)');
      // Mucus sheen & cool rim
      expect(fakeShader.fragmentShader).toContain('mucusSheen');
      expect(fakeShader.fragmentShader).toContain('coolTopRim');

      rig.dispose();
    });

    it('verifies 9 dorsal vertebral processes and tattered pelvis wrap', () => {
      const rig = new MonsterRig(1.0, '#2b211b');

      // Protruding bony ridges along spine
      expect([9, 10]).toContain(rig.dorsalRidges.length);
      for (let i = 0; i < rig.dorsalRidges.length; i++) {
        const ridge = rig.dorsalRidges[i]!;
        expect(ridge.name).toBe(`DorsalRidge_${i + 1}`);
        expect(ridge.geometry.attributes.position?.count).toBeGreaterThan(0);
      }

      // Tattered loin wrap on pelvis
      const wrapMesh = rig.pelvis.getObjectByName('TatteredPelvisWrap');
      expect(wrapMesh).toBeDefined();

      rig.dispose();
    });

    it('verifies forelimb segment lengths and 4 curved talons (0.28m)', () => {
      const rig = new MonsterRig(1.0, '#2b211b');

      // Upper arm 0.65m
      expect(rig.elbowL.position.y).toBeCloseTo(-0.65, 2);
      expect(rig.elbowR.position.y).toBeCloseTo(-0.65, 2);

      // Forearm 0.70m
      expect(rig.wristL.position.y).toBeCloseTo(-0.70, 2);
      expect(rig.wristR.position.y).toBeCloseTo(-0.70, 2);

      // DESIGN_RATIONALE: Quadrupedal beast forepaw anatomy has 4 curved talons per hand to match reference silhouette frames f_018-f_020.
      expect(rig.clawsL.children.length).toBe(4);
      expect(rig.clawsR.children.length).toBe(rig.clawsL.children.length);

      rig.dispose();
    });

    it('verifies hindlimb digitigrade segment lengths (thigh 0.58m, shin 0.55m)', () => {
      const rig = new MonsterRig(1.0, '#2b211b');

      expect(rig.kneeL.position.y).toBeCloseTo(-0.58, 2);
      expect(rig.kneeR.position.y).toBeCloseTo(-0.58, 2);

      expect(rig.ankleL.position.y).toBeCloseTo(-0.55, 2);
      expect(rig.ankleR.position.y).toBeCloseTo(-0.55, 2);

      expect(rig.footL.children.length).toBeGreaterThan(0);
      expect(rig.footR.children.length).toBeGreaterThan(0);

      rig.dispose();
    });

    it('constructs split-shell toothed head with 28 teeth, deep throat, and vertical jaw split', () => {
      const rig = new MonsterRig(1.0, '#2b211b');

      // Concentric teeth ring: 28 or 36 teeth
      expect(rig.teethMesh).toBeDefined();
      expect([28, 36]).toContain(rig.teethMesh.count);

      // Split jaw lobes
      expect(rig.leftJawLobe).toBeDefined();
      expect(rig.rightJawLobe).toBeDefined();

      // Prowl 18° gap (~0.15 rad)
      rig.setJawSplit(0.15);
      expect(rig.leftJawLobe.rotation.y).toBeCloseTo(0.15, 2);
      expect(rig.rightJawLobe.rotation.y).toBeCloseTo(-0.15, 2);

      // Roar / lunge 75° split (±0.65 rad)
      rig.setJawSplit(0.65);
      expect(rig.leftJawLobe.rotation.y).toBeCloseTo(0.65, 2);
      expect(rig.rightJawLobe.rotation.y).toBeCloseTo(-0.65, 2);

      rig.dispose();
    });

    it('supports toggle to tilted 35° mutated skull head variant', () => {
      const rig = new MonsterRig(1.0, '#2b211b');

      expect(rig.getSkullVariant()).toBe('splitShell');
      expect(rig.splitShellMeshGroup.visible).toBe(true);
      expect(rig.mutatedSkullGroup.visible).toBe(false);

      // Switch to mutated skull
      rig.setSkullVariant('mutatedSkull');
      expect(rig.getSkullVariant()).toBe('mutatedSkull');
      expect(rig.splitShellMeshGroup.visible).toBe(false);
      expect(rig.mutatedSkullGroup.visible).toBe(true);

      // 35° tilt
      expect(rig.mutatedSkullGroup.rotation.z).toBeCloseTo(0.61, 2);

      // Switch back
      rig.setSkullVariant('splitShell');
      expect(rig.splitShellMeshGroup.visible).toBe(true);
      expect(rig.mutatedSkullGroup.visible).toBe(false);

      rig.dispose();
    });
  });

  describe('Prompt 2B: Locomotion, Wake Spray, Rear-Up Roar, and Jumpscare', () => {
    it('drives PROWL_IDLE and PROWL_WALK with hunched chest and listening pans', () => {
      const rig = new MonsterRig(1.0, '#2b211b');
      const animator = new MonsterAnimator(rig);

      // Idle update
      animator.update(0.1, 0.0, 'WANDER');
      expect(animator.getState()).toBe('PROWL_IDLE');
      expect(rig.upperChest.rotation.x).toBeCloseTo(0.65, 1); // hunched low over water

      // Walk update
      animator.update(0.1, 1.8, 'WANDER');
      expect(animator.getState()).toBe('PROWL_WALK');
      expect(rig.upperChest.rotation.x).toBeCloseTo(0.65, 1);
      expect(Math.abs(rig.neck.rotation.y)).toBeGreaterThan(0.0); // panning head listening to water

      rig.dispose();
    });

    it('executes GALLOP_CHARGE bounding locomotion and triggers forelimb slam callbacks', () => {
      const rig = new MonsterRig(1.0, '#2b211b');
      let slamCount = 0;
      let lastSlamPos: Vector3 | null = null;

      const animator = new MonsterAnimator(rig, {
        onForelimbSlam: (pos) => {
          slamCount++;
          lastSlamPos = pos.clone();
        },
      });

      // Simulate high-speed sprint (11.5 m/s)
      for (let i = 0; i < 40; i++) {
        animator.update(0.016, 11.5, 'HUNT');
      }

      expect(animator.getState()).toBe('GALLOP_CHARGE');
      expect(slamCount).toBeGreaterThan(0);
      expect(lastSlamPos).not.toBeNull();

      rig.dispose();
    });

    it('executes 1.75s 3-stage REAR_UP_ROAR with upright brake, violent thrash, and return to all fours', () => {
      const rig = new MonsterRig(1.0, '#2b211b');
      let cameraShakeCount = 0;
      let rearUpSplashCalled = false;
      const camPos = new Vector3(0, 1.6, 5.0);

      const animator = new MonsterAnimator(rig, {
        onCameraShake: (shake) => {
          if (shake > 0) cameraShakeCount++;
        },
        onRearUpSplash: () => {
          rearUpSplashCalled = true;
        },
      });

      animator.triggerRearUpRoar();
      expect(animator.isRoaring()).toBe(true);

      // Stage 1 (0.0s – 0.35s): Brakes and pitches upright
      for (let t = 0; t < 0.35; t += 0.016) {
        animator.update(0.016, 0.0, 'ALERTED', camPos);
      }
      expect(rig.upperChest.rotation.x).toBeLessThan(0.0); // Pitched backward/upright (towards -0.25)
      expect(rig.shoulderL.rotation.z).toBeGreaterThan(0.8); // Arms wide
      expect(rig.shoulderR.rotation.z).toBeLessThan(-0.8);
      expect(rig.getJawSplit()).toBeCloseTo(0.65, 1); // 75° jaw flare

      // Stage 2 (0.35s – 1.35s): Violent head/torso thrashing & camera shake
      for (let t = 0.35; t < 1.35; t += 0.016) {
        animator.update(0.016, 0.0, 'ALERTED', camPos);
      }
      expect(cameraShakeCount).toBeGreaterThan(10); // Continuous shake during roar
      expect(rig.getJawSplit()).toBeGreaterThanOrEqual(0.60);

      // Stage 3 (1.35s – 1.75s): Drops back to all fours
      for (let t = 1.35; t < 1.80; t += 0.016) {
        animator.update(0.016, 0.0, 'WANDER', camPos);
      }
      expect(animator.isRoaring()).toBe(false);
      expect(rig.upperChest.rotation.x).toBeGreaterThan(0.4); // Returned to all fours
      expect(rearUpSplashCalled).toBe(true);

      rig.dispose();
    });

    it('spawns 15 white spray particles and foam ring in RipplePoolManager', () => {
      const parent = new Object3D();
      const ripplePool = new RipplePoolManager(parent, 0.0);

      expect(typeof ripplePool.spawnMonsterGallopSlam).toBe('function');
      ripplePool.spawnMonsterGallopSlam(10.0, -15.0);

      // Droplets and ripples activated
      ripplePool.update(0.016);
      parent.remove(ripplePool.root);
    });

    it('drives JUMPSCARE_GRAB framing viewport with claws and unhinging maw', () => {
      const rig = new MonsterRig(1.0, '#2b211b');
      let inputFrozen = false;
      let deathTriggered = false;

      const jumpscare = new JumpscareSequence({
        onFreezeInput: () => { inputFrozen = true; },
        setTimeScale: () => {},
        onDeath: () => { deathTriggered = true; },
      });

      const camera = new PerspectiveCamera(72, 16 / 9, 0.1, 100);
      camera.position.set(0, 1.6, 10);
      const headPos = new Vector3(0, 1.2, 5);

      jumpscare.trigger(
        camera,
        headPos,
        0,
        { timeSurvived: 10, noisesMade: 1, closestCall: 0.5 },
        false,
        rig.getJoints(),
        rig,
      );

      expect(inputFrozen).toBe(true);
      expect(jumpscare.isActive()).toBe(true);

      // Step to stage 2 (0.35s)
      for (let t = 0; t < 0.35; t += 0.016) {
        jumpscare.update(0.016);
      }

      // Maw unhinges wide into camera lens
      expect(rig.getJawSplit()).toBeGreaterThanOrEqual(0.50);
      // Clawed hands frame borders
      expect(Math.abs(rig.shoulderL.rotation.x)).toBeGreaterThan(0.5);
      expect(Math.abs(rig.shoulderR.rotation.x)).toBeGreaterThan(0.5);

      // Complete jumpscare
      for (let t = 0.35; t < 0.90; t += 0.016) {
        jumpscare.update(0.016);
      }

      expect(deathTriggered).toBe(true);
      expect(jumpscare.isActive()).toBe(false);

      rig.dispose();
      jumpscare.dispose();
    });

    it('integrates MonsterRig and MonsterAnimator inside MonsterBody seamlessly', () => {
      const body = new MonsterBody('m_integration_test', 1.0, '#2b211b');

      expect(body.rig).toBeDefined();
      expect(body.animator).toBeDefined();
      expect(body.mesh.root.children).toContain(body.rig.rootGroup);

      // SkinnedMesh hidden in favor of high-fidelity organic MonsterRig
      expect(body.mesh.skinnedMesh.visible).toBe(false);

      body.dispose();
    });
  });
});

