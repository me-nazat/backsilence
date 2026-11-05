/* ── tests/monster-silhouette-contract.test.ts ──────────────────────────────
 *  Prompt 3 Item 5: Asserts structural silhouette properties of the creature
 *  (seed-pod pit count & density, forelimb-to-torso ratio, zero dorsal ridge
 *  instances, single hinged jaw, zero visible eyes/horns, long tapering tail,
 *  and flesh blotch coverage/chroma) directly against `reports/monster/creature_spec.md`.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { Box3 } from 'three';
import { MonsterRig } from '../src/game/monster/MonsterRig.js';
import { MonsterMeshHierarchy } from '../src/game/monster/MonsterMesh.js';

interface FsModule {
  readFileSync: (p: string, enc: string) => string;
}
interface PathModule {
  resolve: (...parts: string[]) => string;
}
declare const process: { cwd: () => string };

interface SpecRow {
  id: string;
  target: string;
  rule: string;
  unit: string;
  source: string;
}

async function parseCreatureSpec(): Promise<Map<string, SpecRow>> {
  const fsModName = 'node:fs';
  const pathModName = 'node:path';
  const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
  const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;

  const specPath = path.resolve(process.cwd(), 'reports/monster/creature_spec.md');
  const md = fs.readFileSync(specPath, 'utf8');
  const map = new Map<string, SpecRow>();

  for (const line of md.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('| `')) continue;
    const cols = trimmed
      .split('|')
      .slice(1, -1)
      .map((c: string) => c.trim().replace(/^`|`$/g, ''));
    if (cols.length >= 5) {
      map.set(cols[0]!, {
        id: cols[0]!,
        target: cols[1]!,
        rule: cols[2]!,
        unit: cols[3]!,
        source: cols[4]!,
      });
    }
  }
  return map;
}

describe('Prompt 3A: Reference Creature Silhouette Contract (vs reports/monster/creature_spec.md)', () => {
  it('every row in reports/monster/creature_spec.md cites a reference frame or reference file', async () => {
    const spec = await parseCreatureSpec();
    expect(spec.size).toBeGreaterThanOrEqual(20);
    for (const row of spec.values()) {
      expect(row.source).toMatch(/f_\d{3}|palette\.json|notes\.md/);
    }
  });

  it('asserts seed-pod head pit count, pit density, zero eyes, zero horns, and single mouth against spec', async () => {
    const spec = await parseCreatureSpec();
    const rig = new MonsterRig(1.0);
    const mesh = new MonsterMeshHierarchy(1.0);

    const expectedPitCount = Number(spec.get('head_pit_count')!.target);
    const minPitDensity = Number(spec.get('head_pit_density_min')!.rule.replace('>= ', ''));
    const expectedEyes = Number(spec.get('visible_eye_count')!.target);
    const expectedHorns = Number(spec.get('horn_count')!.target);

    expect(rig.headPitsMesh.count).toBe(expectedPitCount);
    const measuredPitDensity = rig.headPitsMesh.count / rig.headDomeSurfaceAreaM2;
    expect(measuredPitDensity).toBeGreaterThanOrEqual(minPitDensity);

    expect(rig.visibleEyeCount).toBe(expectedEyes);
    expect(rig.hornCount).toBe(expectedHorns);
    expect(rig.jawLobeCount).toBe(1);
    expect(rig.leftJawLobe.children.length).toBe(0);
    expect(rig.rightJawLobe.children.length).toBe(0);
    expect(rig.topJawLobe.children.length).toBe(0);
    expect(rig.bottomJawLobe.children.length).toBe(0);
    expect(rig.lowerJaw.children.length).toBeGreaterThan(0);

    // Rounded dome head aspect check from bounding box
    rig.podHeadMesh.geometry.computeBoundingBox();
    const headBox = rig.podHeadMesh.geometry.boundingBox!;
    const headWidth = headBox.max.x - headBox.min.x;
    const headHeight = headBox.max.y - headBox.min.y;
    const headLength = headBox.max.z - headBox.min.z;
    const headAspect = Math.max(headWidth, headLength) / Math.max(0.01, headHeight);
    expect(headAspect).toBeGreaterThanOrEqual(1.0);
    expect(headAspect).toBeLessThanOrEqual(1.35);

    rig.dispose();
    mesh.dispose();
  });

  it('asserts zero dorsal ridge instances in both MonsterRig and MonsterMeshHierarchy against spec', async () => {
    const spec = await parseCreatureSpec();
    const rig = new MonsterRig(1.0);
    const mesh = new MonsterMeshHierarchy(1.0);

    const expectedDorsalRidges = Number(spec.get('dorsal_ridge_count')!.target);
    expect(rig.dorsalRidges.length).toBe(expectedDorsalRidges);
    expect(rig.dorsalSpineGroup.children.length).toBe(expectedDorsalRidges);
    expect(mesh.vertebraMesh.count).toBe(expectedDorsalRidges);

    rig.dispose();
    mesh.dispose();
  });

  it('asserts disproportionately long forelimb-to-torso ratio, splayed clawed fingers, and tapering tail against spec', async () => {
    const spec = await parseCreatureSpec();
    const rig = new MonsterRig(1.0);

    const minForelimbRatio = Number(spec.get('forelimb_to_torso_ratio')!.rule.replace('>= ', ''));
    const expectedFingerCount = Number(spec.get('finger_count_per_hand')!.target);
    const expectedClawLen = Number(spec.get('finger_claw_length_m')!.target);
    const expectedTailLen = Number(spec.get('tail_length_m')!.target);
    const expectedHunchRad = Number(spec.get('hunch_angle_rad')!.target);

    // Measure actual forelimb segment offsets and torso bounding box height
    const measuredForelimbLen = Math.abs(rig.elbowL.position.y) + Math.abs(rig.wristL.position.y);
    const measuredRatio = measuredForelimbLen / rig.torsoLengthM;
    expect(measuredRatio).toBeGreaterThanOrEqual(minForelimbRatio);

    expect(rig.clawsL.children.length).toBe(expectedFingerCount);
    expect(rig.clawsR.children.length).toBe(expectedFingerCount);
    expect(rig.clawLengthM).toBeCloseTo(expectedClawLen, 2);

    // Verify tail geometry length from bounding box
    rig.tailMesh.geometry.computeBoundingBox();
    const tailBox: Box3 = rig.tailMesh.geometry.boundingBox!;
    const measuredTailLen = tailBox.max.z - tailBox.min.z;
    expect(measuredTailLen).toBeCloseTo(expectedTailLen, 2);
    const measuredTailTaper = rig.tailTipRadiusM / rig.tailBaseRadiusM;
    expect(measuredTailTaper).toBeGreaterThanOrEqual(0.08);
    expect(measuredTailTaper).toBeLessThanOrEqual(0.25);

    expect(rig.upperChest.rotation.x).toBeCloseTo(expectedHunchRad, 2);

    // Verify procedural flesh blotch coverage <= 12% and chroma delta <= 0.05
    const maxBlotchCov = Number(spec.get('blotch_coverage_max')!.rule.replace('<= ', ''));
    const maxChromaDelta = Number(spec.get('blotch_chroma_delta_max')!.rule.replace('<= ', ''));
    expect(rig.fleshTextures.blotchCoverage).toBeGreaterThan(0.01);
    expect(rig.fleshTextures.blotchCoverage).toBeLessThanOrEqual(maxBlotchCov);
    expect(rig.fleshTextures.maxChromaDelta).toBeLessThanOrEqual(maxChromaDelta);

    rig.dispose();
  });

  it('Prompt 5: asserts Screen-Space Readability Law (coverage, height, Michelson contrast) across contract shots', async () => {
    const probeModName = '../scripts/creature/readability-probe.mjs';
    const pathModName = 'node:path';
    const probe = (await import(/* @vite-ignore */ probeModName)) as unknown as {
      measureReadability: (p: string, distM: number) => {
        maskPixels: number;
        coveragePercent: number;
        heightPercent: number;
        michelsonContrast: number;
      };
    };
    const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;

    // 1. creature_close_6m (calibrated vs f_018 reference: hunched silhouette against water)
    // Contract: mask coverage >= 3.0%, height >= 14% of frame, Michelson contrast >= 0.35
    const close6mPath = path.resolve(process.cwd(), 'reports/visual/creature_close_6m.png');
    const res6m = probe.measureReadability(close6mPath, 6.0);
    expect(res6m.coveragePercent).toBeGreaterThanOrEqual(3.0);
    expect(res6m.heightPercent).toBeGreaterThanOrEqual(14.0);
    expect(res6m.michelsonContrast).toBeGreaterThanOrEqual(0.35);

    // 2. creature_mid_15m (calibrated vs f_010 reference: clear vertical band at 6–12m / 15m)
    // Contract: mask coverage >= 0.55%, height >= 6.0% of frame, Michelson contrast >= 0.35
    const mid15mPath = path.resolve(process.cwd(), 'reports/visual/creature_mid_15m.png');
    const res15m = probe.measureReadability(mid15mPath, 15.0);
    expect(res15m.coveragePercent).toBeGreaterThanOrEqual(0.55);
    expect(res15m.heightPercent).toBeGreaterThanOrEqual(6.0);
    expect(res15m.michelsonContrast).toBeGreaterThanOrEqual(0.35);

    // 3. creature_far_35m (calibrated vs f_025 reference: distant dark silhouette in dense fog)
    // Contract: mask coverage >= 0.12% of frame
    const far35mPath = path.resolve(process.cwd(), 'reports/visual/creature_far_35m.png');
    const res35m = probe.measureReadability(far35mPath, 35.0);
    expect(res35m.coveragePercent).toBeGreaterThanOrEqual(0.12);

    // 4. creature_jumpscare (calibrated vs f_037 reference: torso+head fill lower ~65% of frame)
    // Contract: mask coverage >= 25.0% of frame
    const jumpscarePath = path.resolve(process.cwd(), 'reports/visual/creature_jumpscare.png');
    const resJumpscare = probe.measureReadability(jumpscarePath, 0.82);
    expect(resJumpscare.coveragePercent).toBeGreaterThanOrEqual(25.0);
  });
});
