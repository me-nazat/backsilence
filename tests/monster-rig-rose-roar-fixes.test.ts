/* ── monster-rig-rose-roar-fixes.test.ts ──────────────────────────────────
 *  Verifies the 4 Lead Character Rigger & Creature Technical Artist bug fixes:
 *  1. Rose Maw Teeth Attachment: 12 needle teeth & fangs attached per jaw petal
 *     (48 total) that move outward with the petals without mid-air floating,
 *     plus pulsing dark-crimson esophagus/uvula bulb (#4a0d12).
 *  2. Dual-material petals: dark carapace (#241c18) outer shell and wet crimson-pink
 *     mucosal gums (#8f1d24, roughness 0.12, clearcoat 1.0).
 *  3. Roar end-splash latched to fire once at dropProg > 0.88, enhanced rear-up
 *     posture (pelvis.y -> 1.18, spine -> -0.55, chest -> -0.45, arms -> ±1.05, jawSplit -> 0.72).
 *  4. Monster root elevation in water and legacy mesh hierarchy invisibility.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { Vector3, PerspectiveCamera, MeshStandardMaterial } from 'three';
import { MonsterRig } from '../src/game/monster/MonsterRig.js';
import { MonsterAnimator } from '../src/game/monster/MonsterAnimator.js';
import { MonsterBody } from '../src/game/monster/MonsterBody.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import type { MonsterSnapshot } from '../src/sim/MonsterBrain.js';

describe('Monster Rig & Roar Animation Glitch Fixes', () => {
  describe('1 & 2. Rose Maw Teeth Parenting & Crimson-Pink Mucosal Gums', () => {
    it('verifies jaw petals have dual materials: dark outer shell and wet crimson-pink inner gums', () => {
      const rig = new MonsterRig(1.0);

      expect(rig.shellMat).toBeDefined();
      // DESIGN_RATIONALE: matches dark wet charcoal carapace shell required for outer jaw lobes
      expect(`#${rig.shellMat.color.getHexString().toLowerCase()}`).toBe('#241c18');
      // DESIGN_RATIONALE: matches wet organic chitin roughness spec across monster head shell
      expect(rig.shellMat.roughness).toBeCloseTo(0.25, 2);

      expect(rig.gumsMat).toBeDefined();
      // DESIGN_RATIONALE: matches wet mucosal flesh crimson-pink tone lining blooming rose jaw petals
      expect(`#${rig.gumsMat.color.getHexString().toLowerCase()}`).toBe('#8f1d24');
      expect(rig.gumsMat.roughness).toBeCloseTo(0.12, 2);
      const gumsCoat = rig.gumsMat as unknown as { clearcoat?: number; clearcoatRoughness?: number };
      expect(gumsCoat.clearcoat).toBeCloseTo(1.0, 2);

      expect(rig.throatMat).toBeDefined();
      // DESIGN_RATIONALE: matches deep dark-crimson esophagus cavity interior tone for blooming throat
      expect(`#${rig.throatMat.color.getHexString().toLowerCase()}`).toBe('#4a0d12');

      // Pulsing dark-crimson esophagus/uvula mesh inside splitShellMeshGroup
      expect(rig.uvulaMesh).toBeDefined();
      expect(rig.uvulaMesh.parent).toBe(rig.splitShellMeshGroup);
      // DESIGN_RATIONALE: matches deep dark-crimson esophagus cavity interior tone for blooming throat
      expect((rig.uvulaMesh.material as MeshStandardMaterial).color.getHexString().toLowerCase()).toBe('4a0d12');

      rig.dispose();
    });

    it('attaches 12 teeth to each of the 4 petals so teeth move 1:1 with blooming petals and do not float', () => {
      const rig = new MonsterRig(1.0);

      // Verify each petal has outer shell, inner gums, and attached teeth instanced mesh (12 teeth each)
      const petals = [rig.jawPetalL, rig.jawPetalR, rig.jawPetalTop, rig.jawPetalBottom];
      for (const petal of petals) {
        expect(petal.children.length).toBeGreaterThanOrEqual(3);
        const instancedToothMesh = petal.children.find((c) => (c as { isInstancedMesh?: boolean }).isInstancedMesh);
        expect(instancedToothMesh).toBeDefined();
        expect(((instancedToothMesh as unknown) as { count: number }).count).toBe(12);
      }

      // Legacy teethMesh on lowerJaw has count 0 and is invisible
      expect(rig.teethMesh.count).toBe(0);
      expect(rig.teethMesh.visible).toBe(false);

      // Contract check: leftJawLobe, rightJawLobe, etc. remain empty compatibility groups
      expect(rig.leftJawLobe.children.length).toBe(0);
      expect(rig.rightJawLobe.children.length).toBe(0);
      expect(rig.topJawLobe.children.length).toBe(0);
      expect(rig.bottomJawLobe.children.length).toBe(0);

      // Verify petal teeth move in world-space when jaw blooms open
      rig.rootGroup.updateMatrixWorld(true);
      const toothPt = new Vector3(0, 0.02, -0.08);
      const initialToothPos = toothPt.clone().applyMatrix4(rig.jawPetalL.matrixWorld);

      rig.setJawSplit(0.65);
      rig.rootGroup.updateMatrixWorld(true);
      const flaredToothPos = toothPt.clone().applyMatrix4(rig.jawPetalL.matrixWorld);

      // Flaring rotates petal and its attached teeth outward
      expect(rig.jawPetalL.rotation.y).toBeCloseTo(0.65, 3);
      expect(flaredToothPos.distanceTo(initialToothPos)).toBeGreaterThan(0.02);

      // Uvula pulses when jaw split increases
      expect(rig.uvulaMesh.scale.x).toBeGreaterThan(1.0);

      rig.dispose();
    });
  });

  describe('3. Roar Splash Latch & Enhanced Upright Posture', () => {
    it('latches onRearUpSplash to fire strictly once during the roar drop at dropProg > 0.88', () => {
      const rig = new MonsterRig(1.0);
      let splashCalls = 0;
      const animator = new MonsterAnimator(rig, {
        onRearUpSplash: () => {
          splashCalls++;
        },
      });

      animator.triggerRearUpRoar();
      expect(animator.isRoaring()).toBe(true);

      // Advance through stage 1 and stage 2 to stage 3 drop (1.35s – 1.75s)
      for (let t = 0; t < 1.35; t += 0.016) {
        animator.update(0.016, 0.0, 'ALERTED');
      }
      expect(splashCalls).toBe(0);

      // During dropProg > 0.88 (rt > 1.35 + 0.40 * 0.88 = 1.702s), splash should fire exactly once
      for (let t = 1.35; t < 1.80; t += 0.016) {
        animator.update(0.016, 0.0, 'WANDER');
      }

      expect(splashCalls).toBe(1);
      expect(animator.isRoaring()).toBe(false);

      // A subsequent roar can fire splash again once
      animator.triggerRearUpRoar();
      for (let t = 0; t < 1.80; t += 0.016) {
        animator.update(0.016, 0.0, 'ALERTED');
      }
      expect(splashCalls).toBe(2);

      rig.dispose();
    });

    it('verifies enhanced upright posture: pelvis.y -> 1.18, spine -> -0.55, chest -> -0.45, arms -> ±1.05', () => {
      const rig = new MonsterRig(1.0);
      const animator = new MonsterAnimator(rig);

      animator.triggerRearUpRoar();

      // Middle of violent thrash stage (0.35s - 1.35s)
      for (let t = 0; t < 0.85; t += 0.016) {
        animator.update(0.016, 0.0, 'ALERTED');
      }

      // Reared up pelvis standing tall
      expect(rig.pelvis.position.y).toBeCloseTo(1.18, 2);
      // Arched spine and chest
      expect(rig.lowerSpine.rotation.x).toBeCloseTo(-0.55, 1);
      expect(rig.upperChest.rotation.x).toBeCloseTo(-0.45, 1);
      // Arms spread wide ±1.05
      expect(rig.shoulderL.rotation.z).toBeGreaterThan(0.95);
      expect(rig.shoulderR.rotation.z).toBeLessThan(-0.95);
      // Jaw flaring wide
      expect(rig.getJawSplit()).toBeGreaterThanOrEqual(0.68);

      rig.dispose();
    });
  });

  describe('4. Grounded Elevation & Legacy Mesh Invisibility', () => {
    it('disables active rendering of legacy MonsterMeshHierarchy when MonsterRig is present', () => {
      const body = new MonsterBody('body_visibility_test');
      const ground = new GroundGrid({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, 1.0);
      ground.fill(-0.75);
      const camera = new PerspectiveCamera(60, 1, 0.1, 100);

      const snapshot: MonsterSnapshot = {
        id: 'body_visibility_test',
        pos: { x: 0, y: -0.75, z: 0 },
        vel: { x: 0, y: 0, z: 0 },
        yaw: 0,
        state: 'WANDER',
        agitation: 0,
        jawOpenT: 0,
        rearingT: 0,
        swipeT: 0,
        earAngle: 0,
        isListening: false,
        targetPos: null,
        path: [],
      };

      body.update(0.016, snapshot, ground, camera);

      expect(body.mesh.lod0.visible).toBe(false);
      expect(body.mesh.lod1.visible).toBe(false);
      if (body.mesh.skinnedMesh) {
        expect(body.mesh.skinnedMesh.visible).toBe(false);
      }
      expect(body.rig.rootGroup.parent).toBe(body.mesh.root);

      body.dispose();
    });

    it('smooths vertical root elevation via MathUtils.damp across terrain changes', () => {
      const body = new MonsterBody('body_elevation_test');
      const ground = new GroundGrid({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, 1.0);
      ground.fill(-0.75);
      const camera = new PerspectiveCamera(60, 1, 0.1, 100);

      const snapshot: MonsterSnapshot = {
        id: 'body_elevation_test',
        pos: { x: 0, y: -0.75, z: 0 },
        vel: { x: 0, y: 0, z: 0 },
        yaw: 0,
        state: 'WANDER',
        agitation: 0,
        jawOpenT: 0,
        rearingT: 0,
        swipeT: 0,
        earAngle: 0,
        isListening: false,
        targetPos: null,
        path: [],
      };

      // Frame 1: initializes to ground floor (-0.75m)
      body.update(0.016, snapshot, ground, camera);
      expect(body.mesh.root.position.y).toBeCloseTo(-0.75, 2);

      // Step onto concrete platform (+0.38m)
      ground.fill(0.38);
      snapshot.pos.y = 0.38;
      body.update(0.016, snapshot, ground, camera);

      // Root y does not jump 1.13m instantly; it is smoothly damped
      const afterStepY = body.mesh.root.position.y;
      expect(afterStepY).toBeGreaterThan(-0.75);
      expect(afterStepY).toBeLessThan(0.38);

      body.dispose();
    });
  });
});
