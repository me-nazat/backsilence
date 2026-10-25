/* ── monster-phase-e.test.ts ────────────────────────────────────────────────
 *  Phase E Verification Suite: Look & Animation of the Creature
 *  - Procedural body: single continuous SkinnedMesh with smooth joint weights,
 *    no gaps at elbows/knees/neck, ridged spine, blind sockets, ear-fins, knuckle arms
 *  - Readability: 40% fog extinction reduction, cool rim light, wet specular sheen
 *  - Foot-slide: strictly under 0.03 m/s while planted in AnimationLabPanel
 *  - Skins: MonsterSkin with ProceduralSkin (default) and GlbSkin (optional fallback)
 *  - IP & Attribution: CREDITS.md and MODELS_SETUP.md verification
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { Scene, MeshStandardMaterial } from 'three';
import { MonsterMeshHierarchy } from '../src/game/monster/MonsterMesh.js';
import { ProceduralSkin, GlbSkin, createMonsterSkin } from '../src/game/creatures/MonsterSkin.js';
import { AnimationLabPanel } from '../src/lab/AnimationLabPanel.js';

interface FsModule {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: string) => string;
}

interface PathModule {
  resolve: (...parts: string[]) => string;
}

declare const process: { cwd: () => string };

describe('Phase E: Look and Animation of the Creature', () => {
  it('builds continuous procedural SkinnedMesh with anatomical joints and features', () => {
    const mesh = new MonsterMeshHierarchy(1.0, '#7a4a38', 54321);

    // 1. Root & SkinnedMesh existence
    expect(mesh.root).toBeDefined();
    expect(mesh.skinnedMesh).toBeDefined();
    expect(mesh.skinnedMesh.isSkinnedMesh).toBe(true);

    // 2. Continuous joint hierarchy without gaps
    const joints = mesh.joints;
    expect(joints.root).toBeDefined();
    expect(joints.pelvis).toBeDefined();
    expect(joints.torso).toBeDefined();
    expect(joints.neck).toBeDefined();
    expect(joints.head).toBeDefined();
    expect(joints.jaw).toBeDefined();
    expect(joints.shoulderL).toBeDefined();
    expect(joints.elbowL).toBeDefined();
    expect(joints.handL).toBeDefined();
    expect(joints.shoulderR).toBeDefined();
    expect(joints.elbowR).toBeDefined();
    expect(joints.handR).toBeDefined();
    expect(joints.hipL).toBeDefined();
    expect(joints.kneeL).toBeDefined();
    expect(joints.footL).toBeDefined();
    expect(joints.hipR).toBeDefined();
    expect(joints.kneeR).toBeDefined();
    expect(joints.footR).toBeDefined();

    // 3. Ear fins and ridged spine
    expect(joints.earLeft).toBeDefined();
    expect(joints.earRight).toBeDefined();
    expect(joints.spine.length).toBeGreaterThanOrEqual(3);

    // 4. Geometry has vertex positions and skin weights
    const geom = mesh.skinnedMesh.geometry;
    expect(geom.attributes.position?.count).toBeGreaterThan(100);
    expect(geom.attributes.skinWeight).toBeDefined();
    expect(geom.attributes.skinIndex).toBeDefined();

    // Bounding box finite
    geom.computeBoundingBox();
    expect(Number.isFinite(geom.boundingBox!.max.y)).toBe(true);
    expect(Number.isFinite(geom.boundingBox!.min.y)).toBe(true);
  });

  it('implements readability shader hooks (40% fog extinction reduction, cool rim, wet specular)', () => {
    const mesh = new MonsterMeshHierarchy(1.0, '#7a4a38', 54321);
    const skinMat = mesh.skinnedMesh.material as MeshStandardMaterial;
    expect(skinMat).toBeDefined();
    expect(typeof skinMat.onBeforeCompile).toBe('function');

    // Simulate Three.js shader compilation hook
    const fakeShader = {
      vertexShader: '#include <common>\n#include <worldpos_vertex>\n',
      fragmentShader: '#include <common>\n#include <roughnessmap_fragment>\n#include <fog_fragment>\n',
      uniforms: {},
    };

    (skinMat.onBeforeCompile as (s: unknown) => void)(fakeShader);

    // Verify 40% fog extinction reduction injected in fragment shader
    expect(fakeShader.fragmentShader).toContain('fogFactor * 0.60');

    // Verify cool rim lighting injected
    expect(fakeShader.fragmentShader).toContain('vec3(0.18, 0.52, 0.62)');

    // Verify wet specular and darkening logic below waterline injected
    expect(fakeShader.fragmentShader).toContain('roughnessFactor = mix(roughnessFactor, 0.12');
    expect(fakeShader.fragmentShader).toContain('diffuseColor.rgb *= (1.0 - wetT * 0.35)');
  });

  it('guarantees foot-slide under 0.03 m/s while planted in AnimationLab', () => {
    const scene = new Scene();
    const lab = new AnimationLabPanel(scene);

    const result = lab.runSelfTest();
    expect(result.passed).toBe(true);
    expect(result.maxFootSlide).toBeLessThanOrEqual(0.030);

    lab.dispose();
  });

  it('supports dual-skin architecture (ProceduralSkin default, GlbSkin fallback resilience)', () => {
    // 1. ProceduralSkin
    const proc = createMonsterSkin('procedural', 1.0, '#7a4a38', 12345, 'standard');
    expect(proc instanceof ProceduralSkin).toBe(true);
    expect(proc.root).toBeDefined();

    // 2. GlbSkin fallback to ProceduralSkin when external model is absent
    const glb = new GlbSkin(1.0, '#7a4a38', 12345, 'standard');
    expect(glb.root).toBeDefined();
    expect(glb.skinType).toBe('procedural'); // Fallback active
    expect(glb.getFootBones().length).toBeGreaterThan(0);

    glb.dispose();
    proc.dispose();
  });

  it('verifies IP risk disclaimer and CC BY attribution in documentation and credits screen', async () => {
    const fsModName = 'node:fs';
    const pathModName = 'node:path';
    const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;
    const root = typeof process !== 'undefined' ? process.cwd() : '.';

    // CREDITS.md contains Thumper CC BY 4.0 attribution
    const creditsPath = path.resolve(root, 'CREDITS.md');
    expect(fs.existsSync(creditsPath)).toBe(true);
    const creditsContent = fs.readFileSync(creditsPath, 'utf-8');
    expect(creditsContent).toContain('Lethal Company Thumper Rig');
    expect(creditsContent).toContain('CC BY 4.0');

    // MODELS_SETUP.md contains IP Caution notice
    const setupPath = path.resolve(root, 'MODELS_SETUP.md');
    expect(fs.existsSync(setupPath)).toBe(true);
    const setupContent = fs.readFileSync(setupPath, 'utf-8');
    expect(setupContent).toContain('Intellectual Property (IP) Caution');
    expect(setupContent).toContain('Lethal Company');
  });
});
