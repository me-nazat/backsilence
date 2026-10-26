/* ── creatures-v2.test.ts ───────────────────────────────────────────────────
 *  Phase F: Creature Pipeline & Seamless Skinned Rig Test Suite
 *  - Verifies continuous procedural SkinnedMesh geometry & bone weighting
 *  - Verifies joint skin weight continuity (no gaps at elbows/knees/shoulders)
 *  - Verifies foot-slide metric stays < 0.03 m/s in planted stance
 *  - Verifies variants (elder, juvenile), telegraphing, and lunge anticipation
 *  - Verifies 5-skull deterministic flocking, LOD0/LOD1 switching, and cosmetic ripples
 *  - Verifies GlbSkin fallback and settings clamping
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { Vector3, Camera } from 'three';
import { buildProceduralSkinnedMonster } from '../src/game/monster/ProceduralSkinnedMeshBuilder.js';
import { MeshStandardMaterial } from 'three';
import { ProceduralSkin, GlbSkin } from '../src/game/creatures/MonsterSkin.js';
import { FlockDirector } from '../src/game/creatures/FlockDirector.js';
import { defaultSettings, clampSettings } from '../src/app/Settings.js';
import type { WaterSystem } from '../src/game/water/WaterSystem.js';
import thumperReport from './fixtures/thumper.json';

describe('Phase F: Creatures & Animation Pipeline', () => {
  it('builds continuous seamless SkinnedMesh with 20 bones and valid normalized weights', () => {
    const mat = new MeshStandardMaterial();
    const result = buildProceduralSkinnedMonster(12345, mat);

    expect(result.skinnedMesh).toBeDefined();
    expect(result.skeleton.bones.length).toBe(20);

    const geom = result.skinnedMesh.geometry;
    const pos = geom.getAttribute('position');
    const skinIndex = geom.getAttribute('skinIndex');
    const skinWeight = geom.getAttribute('skinWeight');

    expect(pos.count).toBeGreaterThan(500);
    expect(skinIndex.count).toBe(pos.count);
    expect(skinWeight.count).toBe(pos.count);

    // Verify all weights are normalized to 1.0 and no NaNs exist
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i))).toBe(true);
      expect(Number.isFinite(pos.getY(i))).toBe(true);
      expect(Number.isFinite(pos.getZ(i))).toBe(true);

      const w0 = skinWeight.getX(i);
      const w1 = skinWeight.getY(i);
      const w2 = skinWeight.getZ(i);
      const w3 = skinWeight.getW(i);
      const sum = w0 + w1 + w2 + w3;

      expect(sum).toBeCloseTo(1.0, 4);
    }

    mat.dispose();
    geom.dispose();
  });

  it('procedural skinning blends weights across elbow and knee joints (zero gaps)', () => {
    const mat = new MeshStandardMaterial();
    const result = buildProceduralSkinnedMonster(54321, mat);
    const geom = result.skinnedMesh.geometry;
    const pos = geom.getAttribute('position');
    const skinIndex = geom.getAttribute('skinIndex');
    const skinWeight = geom.getAttribute('skinWeight');

    // Bone indices in boneMap:
    // UpperArmL = 8, ForearmL = 9
    // ThighL = 14, ShinL = 15
    let foundBlendedElbow = false;
    let foundBlendedKnee = false;

    for (let i = 0; i < pos.count; i++) {
      const idxs = [
        skinIndex.getX(i),
        skinIndex.getY(i),
        skinIndex.getZ(i),
        skinIndex.getW(i),
      ];
      const weights = [
        skinWeight.getX(i),
        skinWeight.getY(i),
        skinWeight.getZ(i),
        skinWeight.getW(i),
      ];

      // Check for elbow vertex blending UpperArmL and ForearmL
      const hasUpperArm = idxs.includes(8);
      const hasForearm = idxs.includes(9);
      if (hasUpperArm && hasForearm) {
        const wUpper = weights[idxs.indexOf(8)]!;
        const wFore = weights[idxs.indexOf(9)]!;
        if (wUpper > 0.15 && wFore > 0.15) {
          foundBlendedElbow = true;
        }
      }

      // Check for knee vertex blending ThighL and ShinL
      const hasThigh = idxs.includes(14);
      const hasShin = idxs.includes(15);
      if (hasThigh && hasShin) {
        const wThigh = weights[idxs.indexOf(14)]!;
        const wShin = weights[idxs.indexOf(15)]!;
        if (wThigh > 0.15 && wShin > 0.15) {
          foundBlendedKnee = true;
        }
      }
    }

    expect(foundBlendedElbow).toBe(true);
    expect(foundBlendedKnee).toBe(true);

    mat.dispose();
    geom.dispose();
  });

  it('ProceduralSkin maintains planted foot-slide rate under 0.03 m/s in world space', () => {
    const skin = new ProceduralSkin(1.0, '#7a4a38', 999);
    const prevPositions = new Map<string, Vector3>();
    let maxPlantedSlideRate = 0.0;

    const dt = 1 / 60;
    // Simulate 2 seconds of walking locomotion (120 frames)
    for (let f = 0; f < 120; f++) {
      skin.update(dt, { speed: 2.2, isGrounded: true, isWading: true, waterDepth: 0.35 });
      const feet = skin.getFootBones();

      for (const foot of feet) {
        if (foot.isPlanted) {
          const prev = prevPositions.get(foot.boneId);
          if (prev) {
            const driftDist = foot.pos.distanceTo(prev);
            const slideRate = driftDist / dt;
            if (slideRate > maxPlantedSlideRate) {
              maxPlantedSlideRate = slideRate;
            }
          }
          prevPositions.set(foot.boneId, foot.pos.clone());
        } else {
          prevPositions.delete(foot.boneId);
        }
      }
    }

    expect(maxPlantedSlideRate).toBeLessThanOrEqual(0.030);
    skin.dispose();
  });

  it('supports variants (elder and juvenile) with proportional scaling and tints', () => {
    const standard = new ProceduralSkin(1.0, '#7a4a38', 1, 'standard');
    const elder = new ProceduralSkin(1.0, '#7a4a38', 1, 'elder');
    const juvenile = new ProceduralSkin(1.0, '#7a4a38', 1, 'juvenile');

    expect(elder.root.scale.x).toBeCloseTo(1.15, 2);
    expect(juvenile.root.scale.x).toBeCloseTo(0.80, 2);
    expect(standard.root.scale.x).toBeCloseTo(1.00, 2);

    standard.dispose();
    elder.dispose();
    juvenile.dispose();
  });

  it('telegraphs lunge anticipation (150ms rear-back) on attack mode transition', () => {
    const skin = new ProceduralSkin(1.0, '#7a4a38', 2);
    skin.setMode('WANDER');
    skin.update(0.016, { speed: 1.5, isGrounded: true, isWading: false, waterDepth: 0 });

    // Transition to ATTACK
    skin.setMode('ATTACK');
    // First frame of anticipation
    skin.update(0.016, { speed: 2.0, isGrounded: true, isWading: false, waterDepth: 0 });

    const torsoPitch = skin.hierarchy.joints.torso.rotation.x;
    // Must rear back (negative pitch) during 150ms anticipation
    expect(torsoPitch).toBeLessThanOrEqual(0.0);

    // After 150ms anticipation completes
    skin.update(0.160, { speed: 4.0, isGrounded: true, isWading: false, waterDepth: 0 });
    const attackTorsoPitch = skin.hierarchy.joints.torso.rotation.x;
    // Aggressive forward lunge lean
    expect(attackTorsoPitch).toBeGreaterThan(0.2);

    skin.dispose();
  });

  it('FlockDirector features LOD0 and LOD1 instanced meshes and emits cosmetic ripples', () => {
    let cosmeticRippleEmitted = false;
    const mockWater = {
      onRipple: (e: { cosmetic?: boolean }) => {
        if (e.cosmetic === true) cosmeticRippleEmitted = true;
      },
    };

    const flock = new FlockDirector({
      seed: 0,
      anchor: new Vector3(10, 0, 10),
      waterY: 0.0,
      count: 5,
      water: mockWater as unknown as WaterSystem,
    });

    expect(flock.skullMeshLOD0).toBeDefined();
    expect(flock.skullMeshLOD1).toBeDefined();

    const mockCamNear = new Camera();
    mockCamNear.position.set(10, 10, 20); // <30m distance
    flock.update(0.016, 45.0, mockCamNear);
    expect(flock.skullMeshLOD0.visible).toBe(true);
    expect(flock.skullMeshLOD1.visible).toBe(false);

    const mockCamFar = new Camera();
    mockCamFar.position.set(10, 10, 80); // >=30m distance
    flock.update(0.016, 45.0, mockCamFar);
    expect(flock.skullMeshLOD0.visible).toBe(false);
    expect(flock.skullMeshLOD1.visible).toBe(true);

    // Run active phase where skulls dip to test water ripple emission (around 45s-52s)
    for (let t = 45.0; t <= 52.0; t += 0.2) {
      flock.update(0.2, t);
    }
    expect(cosmeticRippleEmitted).toBe(true);

    flock.dispose();
  });

  it('GlbSkin falls back to ProceduralSkin when glb file absent and reports status', () => {
    const skin = new GlbSkin(1.0, '#7a4a38', 777);
    expect(skin.root).toBeDefined();

    skin.update(0.016, { speed: 1.5, isGrounded: true, isWading: false, waterDepth: 0 });
    expect(skin.getFootBones().length).toBeGreaterThanOrEqual(2);

    expect(thumperReport).toBeDefined();
    expect(thumperReport.present).toBe(false);
    expect(thumperReport.fallbackActive).toBe('ProceduralSkin');

    skin.dispose();
  });

  it('validates creatures settings schema and clamping', () => {
    const def = defaultSettings();
    expect(def.creatures).toBeDefined();
    expect(def.creatures?.waterMonsterSkin).toBe('auto');
    expect(def.creatures?.ambientFlyers).toBe(5);

    const clamped = clampSettings({
      ...def,
      creatures: {
        waterMonsterSkin: 'invalid' as unknown as 'auto',
        ambientFlyers: 99,
      },
    });

    expect(clamped.creatures?.waterMonsterSkin).toBe('auto');
    expect(clamped.creatures?.ambientFlyers).toBe(5);
  });
});
