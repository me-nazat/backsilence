/* ── prompt4-tile-grids-monster-beast.test.ts ─────────────────────────────
 *  Verification suite for Prompt 4A (Themed Ceramic Tile Grids & UVs) and
 *  Prompt 4B (Articulated Quadrupedal Horror Monster Rig & Water Shaders).
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { BoxGeometry, CylinderGeometry, Vector3, Vector4, Texture } from 'three';
import {
  TileMaterialFactory,
  SECTOR_THEMES,
  applyWorldSpaceBoxUVs,
  applyWorldSpaceCylinderUVs,
} from '../src/procedural/textures/TileMaterialFactory.js';
import { DrainageCoreMap } from '../src/world/maps/DrainageCoreMap.js';
import { MonsterRig, buildCurvedClawGeometry } from '../src/game/monster/MonsterRig.js';
import { MonsterAnimator } from '../src/game/monster/MonsterAnimator.js';
import { MonsterBody } from '../src/game/monster/MonsterBody.js';
import { createWaterMaterial } from '../src/game/water/WaterMaterial.js';

describe('Prompt 4A: Authentic Themed Ceramic Tile Grids and World-Space UVs', () => {
  it('defines 3 distinct high-contrast ceramic tile sector themes', () => {
    // Theme 1: Natatorium
    const nat = SECTOR_THEMES.natatorium;
    expect(nat).toBeDefined();
    expect(nat.platformTop.base.toLowerCase()).toBe('#d6b878');
    expect(nat.wall.base.toLowerCase()).toBe('#eae2c6');
    expect(nat.poolFloor.base.toLowerCase()).toBe('#c8d4ba');

    // Theme 2: Station / Drainage Core / Drowned Metro
    const station = SECTOR_THEMES.station;
    expect(station).toBeDefined();
    expect(station.platformTop.base.toLowerCase()).toBe('#e4e6df');
    expect(station.platformTop.safetyStripe?.toLowerCase()).toBe('#d9a738');
    expect(station.wall.base.toLowerCase()).toBe('#f0f2ec');
    expect(station.wall.stripeBase?.toLowerCase()).toBe('#2b5c47');
    expect(station.poolFloor.base.toLowerCase()).toBe('#bac2b8');

    // Theme 3: School
    const school = SECTOR_THEMES.school;
    expect(school).toBeDefined();
    expect(school.platformTop.base.toLowerCase()).toBe('#dfd7be');
    expect(school.platformTop.checkered?.toLowerCase()).toBe('#c7b68b');
    expect(school.wall.base.toLowerCase()).toBe('#eeeadd');
    expect(school.wall.lowerBase?.toLowerCase()).toBe('#a8c2ad');
    expect(school.poolFloor.base.toLowerCase()).toBe('#98a89c');
  });

  it('TileMaterialFactory creates and returns distinct theme kits', () => {
    const factory = TileMaterialFactory.getInstance();
    const natKit = factory.getThemeKit('natatorium');
    const stationKit = factory.getThemeKit('station');
    const schoolKit = factory.getThemeKit('school');

    expect(natKit.platformTopMaterial).toBeDefined();
    expect(stationKit.platformTopMaterial).toBeDefined();
    expect(schoolKit.platformTopMaterial).toBeDefined();

    expect(natKit.platformTopMaterial).not.toBe(stationKit.platformTopMaterial);
    expect(stationKit.platformTopMaterial).not.toBe(schoolKit.platformTopMaterial);
  });

  it('applies world-space UVs to BoxGeometry so 1 tile = 0.25m x 0.25m', () => {
    // 2.0m x 1.0m x 4.0m platform (8 tiles wide = 2.0m repeat)
    const box = new BoxGeometry(2.0, 1.0, 4.0);
    applyWorldSpaceBoxUVs(box, 0.25, { isPlatformSide: true, topY: 1.0, floorY: -0.75 });

    const uvAttr = box.getAttribute('uv');
    expect(uvAttr).toBeDefined();
    const uvs = uvAttr.array as Float32Array;

    // Verify non-zero repeat coordinates
    let maxU = 0;
    let maxV = 0;
    for (let i = 0; i < uvs.length; i += 2) {
      maxU = Math.max(maxU, uvs[i]!);
      maxV = Math.max(maxV, uvs[i + 1]!);
    }
    expect(maxU).toBeGreaterThanOrEqual(1.0);
    expect(maxV).toBeGreaterThanOrEqual(1.0);
    box.dispose();
  });

  it('applies world-space UVs to CylinderGeometry for columns & pillars', () => {
    const cylinder = new CylinderGeometry(0.5, 0.5, 4.0, 24);
    applyWorldSpaceCylinderUVs(cylinder, 0.5, 4.0, 0.25);

    const uvAttr = cylinder.getAttribute('uv');
    expect(uvAttr).toBeDefined();
    const uvs = uvAttr.array as Float32Array;

    let maxU = 0;
    let maxV = 0;
    for (let i = 0; i < uvs.length; i += 2) {
      maxU = Math.max(maxU, uvs[i]!);
      maxV = Math.max(maxV, uvs[i + 1]!);
    }
    expect(maxU).toBeGreaterThan(1.0); // circumference / 2.0m
    expect(maxV).toBeGreaterThanOrEqual(2.0); // 4.0m / 2.0m = 2.0 repeat
    cylinder.dispose();
  });

  it('verifies Drainage Core fog density is reduced to <= 0.014 with atmospheric humid mist color', () => {
    expect(DrainageCoreMap.atmosphere.fog.density).toBeLessThanOrEqual(0.014);
    expect(DrainageCoreMap.atmosphere.fog.color.toLowerCase()).toBe('#cfe0d5');
  });
});

describe('Prompt 4B: Quadrupedal Horror Monster Rig & Eliminating Wake Streaks', () => {
  it('verifies water shader eliminates wakeEnergy multiplier from bioluminescent glow', () => {
    const mat = createWaterMaterial({
      tier: 'medium',
      waterY: 0.0,
      normalTexture: new Texture(),
      mapDataTexture: new Texture(),
      mapBounds: new Vector4(-50, -50, 50, 50),
      ripples: [],
      wakes: [],
      wakeParams: [],
      streaks: [],
    });
    // Bioluminescence block should not multiply wakeEnergy with glow
    expect(mat.fragmentShader).not.toContain('wakeEnergy * 0.8');
    expect(mat.fragmentShader).toContain('uBiolumColor * glow');
    mat.dispose();
  });

  it('constructs hulking horror creature in MonsterRig with 10 dorsal vertebrae, 4-petal jaws, and 36 teeth', () => {
    const rig = new MonsterRig(1.0, '#221916');

    // 10 protruding dorsal vertebrae
    expect(rig.dorsalRidges.length).toBe(10);
    expect(rig.dorsalRidges[9]!.name).toBe('DorsalRidge_10');

    // Gaunt necrotic charcoal-brown flesh material
    expect(rig.monsterSkinMat.color.getHexString().toLowerCase()).toBe('221916');
    expect(rig.monsterSkinMat.roughness).toBeCloseTo(0.22, 2);

    // Outer carapace shell material
    expect(rig.shellMat.color.getHexString().toLowerCase()).toBe('732a1e');

    // 4-petal split jaws
    expect(rig.leftJawLobe).toBeDefined();
    expect(rig.rightJawLobe).toBeDefined();
    expect(rig.topJawLobe).toBeDefined();
    expect(rig.bottomJawLobe).toBeDefined();

    // 36 teeth total in double concentric ring
    expect(rig.teethMesh).toBeDefined();
    expect(rig.teethMesh.count).toBe(36);

    // 4 curved claws on each hand of length 0.32m
    const clawGeom = buildCurvedClawGeometry(0.32, 0.024);
    expect(clawGeom.getAttribute('position')).toBeDefined();
    expect(rig.clawsL.children.length).toBe(4);
    expect(rig.clawsR.children.length).toBe(4);

    // 4-petal jaw flare
    rig.setJawSplit(0.65);
    expect(rig.leftJawLobe.rotation.y).toBeCloseTo(0.65, 2);
    expect(rig.rightJawLobe.rotation.y).toBeCloseTo(-0.65, 2);
    expect(rig.topJawLobe.rotation.x).toBeCloseTo(-0.65, 2);
    expect(rig.bottomJawLobe.rotation.x).toBeCloseTo(0.65, 2);

    rig.dispose();
  });

  it('hides primitive mesh hierarchy in MonsterBody so only MonsterRig renders', () => {
    const body = new MonsterBody('test_beast', 1.0, '#221916');

    expect(body.mesh.lod0.visible).toBe(false);
    expect(body.mesh.lod1.visible).toBe(false);
    expect(body.rig.rootGroup.parent).toBe(body.mesh.root);

    // Calling setLOD preserves invisibility of primitive meshes when using procedural rig
    body.mesh.setLOD(10.0);
    expect(body.mesh.lod0.visible).toBe(false);
    body.mesh.setLOD(50.0);
    expect(body.mesh.lod1.visible).toBe(false);

    body.rig.dispose();
  });

  it('drives velocity-locked stride, heavy roll, lateral spine undulation, and 75° jaw flare in MonsterAnimator', () => {
    const rig = new MonsterRig(1.0, '#221916');
    const animator = new MonsterAnimator(rig);

    // Prowl walk: roll and spine undulation
    animator.update(0.1, 2.0, 'WANDER');
    expect(animator.getState()).toBe('PROWL_WALK');
    expect(Math.abs(rig.upperChest.rotation.z)).toBeGreaterThan(0.0); // roll coupled
    expect(Math.abs(rig.upperChest.rotation.y)).toBeGreaterThan(0.0); // lateral spine undulation
    expect(Math.abs(rig.neck.rotation.y)).toBeGreaterThan(0.0); // head listening pan

    // Charge: bounding gallop heave
    animator.update(0.1, 11.5, 'HUNT');
    expect(animator.getState()).toBe('GALLOP_CHARGE');
    expect(rig.pelvis.position.y).toBeGreaterThanOrEqual(0.70);

    // Rear-up roar
    animator.triggerRearUpRoar();
    expect(animator.isRoaring()).toBe(true);
    // Stage 1 upright stance
    for (let t = 0; t < 0.35; t += 0.016) {
      animator.update(0.016, 0.0, 'ALERTED', new Vector3(0, 1.6, 5.0));
    }
    expect(rig.getJawSplit()).toBeCloseTo(0.65, 1);
    expect(rig.shoulderL.rotation.z).toBeGreaterThan(0.8);
    expect(rig.shoulderR.rotation.z).toBeLessThan(-0.8);

    rig.dispose();
  });
});
