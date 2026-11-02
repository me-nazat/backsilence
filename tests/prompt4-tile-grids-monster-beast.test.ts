/* ── prompt4-tile-grids-monster-beast.test.ts ─────────────────────────────
 *  Verification suite for Prompt 4A (Themed Ceramic Tile Grids & UVs) and
 *  Prompt 4B (Articulated Quadrupedal Horror Monster Rig & Water Shaders).
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { BoxGeometry, CylinderGeometry, Vector3, Vector4, Texture } from 'three';
import { WORLD } from '../src/app/Config.js';
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
import rawPalette from '../reference/video/palette.json';

const paletteJson = rawPalette as unknown as Record<
  string,
  { hex?: string; rgb?: [number, number, number]; hsv?: [number, number, number] }
>;

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const c = parseInt(hex.replace('#', ''), 16);
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

describe('Prompt 4A: Authentic Themed Ceramic Tile Grids and World-Space UVs', () => {
  it('defines 3 distinct high-contrast ceramic tile sector themes aligned to reference palette and WORLD.TILE_METERS', () => {
    expect(paletteJson.slab_top_t17?.hsv).toBeDefined();
    const refSlabHue = paletteJson.slab_top_t17!.hsv![0];

    // Theme 1: Natatorium — compare warm tan hue/saturation against reference/video/palette.json (hue 38..48 deg)
    const nat = SECTOR_THEMES.natatorium;
    expect(nat).toBeDefined();
    expect(nat.grid).toBe(16);
    expect(nat.tileSize).toBe(WORLD.TILE_METERS);
    const natSlabHsv = hexToHsv(nat.platformTop.base);
    expect(Math.abs(natSlabHsv.h - refSlabHue)).toBeLessThanOrEqual(6);
    const natWallHsv = hexToHsv(nat.wall.base);
    expect(natWallHsv.h).toBeGreaterThanOrEqual(38);
    expect(natWallHsv.h).toBeLessThanOrEqual(50);

    // Theme 2: Station / Drainage Core / Drowned Metro (non-natatorium institutional subway palette)
    const station = SECTOR_THEMES.station;
    expect(station).toBeDefined();
    expect(station.grid).toBe(16);
    expect(station.tileSize).toBe(WORLD.TILE_METERS);
    expect(station.platformTop.base).not.toBe(nat.platformTop.base);
    expect(station.platformTop.safetyStripe).toBeDefined();
    expect(station.wall.stripeBase).toBeDefined();

    // Theme 3: School (institutional two-tone dado wall and checkered floor)
    const school = SECTOR_THEMES.school;
    expect(school).toBeDefined();
    expect(school.grid).toBe(16);
    expect(school.tileSize).toBe(WORLD.TILE_METERS);
    expect(school.platformTop.checkered).toBeDefined();
    expect(school.wall.lowerBase).toBeDefined();
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

  it('applies world-space UVs to BoxGeometry so 1 tile = WORLD.TILE_METERS (0.15m x 0.15m)', () => {
    // 2.4m x 1.0m x 4.8m platform (16 tiles = 2.4m repeat at WORLD.TILE_METERS = 0.15m)
    const box = new BoxGeometry(2.4, 1.0, 4.8);
    applyWorldSpaceBoxUVs(box, WORLD.TILE_METERS, { isPlatformSide: true, topY: 1.0, floorY: -0.75 });

    const uvAttr = box.getAttribute('uv');
    expect(uvAttr).toBeDefined();
    const uvs = uvAttr.array as Float32Array;

    // Top face (+Y, face 2 -> vertices 8..11) has width=2.4m (1.0 repeat) and depth=4.8m (2.0 repeats)
    let topMaxU = 0;
    let topMaxV = 0;
    for (let v = 8; v < 12; v++) {
      topMaxU = Math.max(topMaxU, uvs[v * 2]!);
      topMaxV = Math.max(topMaxV, uvs[v * 2 + 1]!);
    }
    expect(topMaxU).toBeCloseTo(2.4 / (16 * WORLD.TILE_METERS), 3);
    expect(topMaxV).toBeCloseTo(4.8 / (16 * WORLD.TILE_METERS), 3);
    box.dispose();
  });

  it('applies world-space UVs to CylinderGeometry for columns & pillars at WORLD.TILE_METERS', () => {
    const cylinder = new CylinderGeometry(0.5, 0.5, 4.8, 24);
    applyWorldSpaceCylinderUVs(cylinder, 0.5, 4.8, WORLD.TILE_METERS);

    const uvAttr = cylinder.getAttribute('uv');
    expect(uvAttr).toBeDefined();
    const uvs = uvAttr.array as Float32Array;

    let maxU = 0;
    let maxV = 0;
    for (let i = 0; i < uvs.length; i += 2) {
      maxU = Math.max(maxU, uvs[i]!);
      maxV = Math.max(maxV, uvs[i + 1]!);
    }
    expect(maxU).toBeCloseTo((2 * Math.PI * 0.5) / (16 * WORLD.TILE_METERS), 3);
    expect(maxV).toBeCloseTo(4.8 / (16 * WORLD.TILE_METERS), 3);
    cylinder.dispose();
  });

  it('verifies Drainage Core fog density is reduced to <= 0.014 with atmospheric humid mist color', () => {
    expect(DrainageCoreMap.atmosphere.fog.density).toBeLessThanOrEqual(0.014);
    const fogHsv = hexToHsv(DrainageCoreMap.atmosphere.fog.color);
    // Low-saturation pale green-mint fog matching reference atmosphere family
    expect(fogHsv.s).toBeLessThanOrEqual(0.20);
    expect(fogHsv.v).toBeGreaterThanOrEqual(0.75);
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

  it('constructs reference footage creature in MonsterRig with seed-pod pitted head, long forelimbs, tapering tail, and palette.json skin colours (#5a5035 / #59462d)', () => {
    const rig = new MonsterRig(1.0);

    // Zero dorsal ridges per reference footage (`f_010`, `f_018`, `f_037`)
    expect(rig.dorsalRidges.length).toBe(0);
    expect(rig.headPitsMesh.count).toBeGreaterThanOrEqual(28);
    expect(rig.tailLengthM).toBeGreaterThanOrEqual(0.95);
    expect(rig.forelimbLengthM / rig.torsoLengthM).toBeGreaterThanOrEqual(1.85);

    // Compare body and head skin colours against `reference/video/palette.json` (`monster_body_t34` #5a5035, `monster_head_t34` #59462d)
    const refBodyHex = paletteJson.monster_body_t34!.hex!.toLowerCase();
    const refHeadHex = paletteJson.monster_head_t34!.hex!.toLowerCase();
    expect(`#${rig.monsterSkinMat.color.getHexString().toLowerCase()}`).toBe(refBodyHex);
    expect(`#${rig.headSkinMat.color.getHexString().toLowerCase()}`).toBe(refHeadHex);
    expect(rig.monsterSkinMat.color.r).toBeGreaterThan(rig.monsterSkinMat.color.b);
    expect(rig.headSkinMat.color.r).toBeGreaterThan(rig.headSkinMat.color.b);

    // Single hinged lower jaw & small dark mouth (no 4-petal split shell meshes)
    expect(rig.lowerJaw).toBeDefined();
    expect(rig.leftJawLobe.children.length).toBe(0);
    expect(rig.rightJawLobe.children.length).toBe(0);

    // Curved claws on each hand
    const clawGeom = buildCurvedClawGeometry(0.28, 0.022);
    expect(clawGeom.getAttribute('position')).toBeDefined();
    expect(rig.clawsL.children.length).toBeGreaterThanOrEqual(4);
    expect(rig.clawsR.children.length).toBe(rig.clawsL.children.length);

    // Jaw hinge updates cleanly
    rig.setJawSplit(0.65);
    expect(rig.lowerJaw.rotation.x).toBeCloseTo(0.65 * 0.45, 3);

    rig.dispose();
  });

  it('hides primitive mesh hierarchy in MonsterBody so only MonsterRig renders', () => {
    const body = new MonsterBody('test_beast', 1.0);

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

  it('drives velocity-locked stride, heavy roll, lateral spine undulation, and jaw flare in MonsterAnimator', () => {
    const rig = new MonsterRig(1.0);
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
    expect(rig.getJawSplit()).toBeGreaterThan(0.5);
    expect(rig.shoulderL.rotation.z).toBeGreaterThan(0.8);
    expect(rig.shoulderR.rotation.z).toBeLessThan(-0.8);

    rig.dispose();
  });
});
