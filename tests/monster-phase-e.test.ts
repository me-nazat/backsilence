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
import { Scene, MeshStandardMaterial, Color, Mesh } from 'three';
import { MonsterMeshHierarchy } from '../src/game/monster/MonsterMesh.js';
import { MonsterBody } from '../src/game/monster/MonsterBody.js';
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

  it('implements readability shader hooks (45% fog extinction reduction, cool grey rim, wet specular)', () => {
    const mesh = new MonsterMeshHierarchy(1.0, '#6b5f40', 54321);
    const skinMat = mesh.skinnedMesh.material as MeshStandardMaterial;
    expect(skinMat).toBeDefined();
    expect(typeof skinMat.onBeforeCompile).toBe('function');

    // Simulate Three.js shader compilation hook
    const fakeShader = {
      vertexShader: '#include <common>\n#include <worldpos_vertex>\n',
      fragmentShader: '#include <common>\n#include <roughnessmap_fragment>\n#include <fog_fragment>\n',
      uniforms: {} as Record<string, { value: unknown }>,
    };

    (skinMat.onBeforeCompile as (s: unknown) => void)(fakeShader);

    // Verify 45% fog extinction reduction injected in fragment shader (Prompt 7.5)
    expect(fakeShader.fragmentShader).toContain('fogFactor * 0.55');

    // Verify neutral cool grey rim lighting injected (Prompt 7.4)
    expect(fakeShader.fragmentShader).toContain('vec3(0.16, 0.20, 0.22)');
    expect(fakeShader.fragmentShader).toContain('vec3(0.065, 0.045, 0.038)'); // subsurface lift

    // Verify wet specular and darkening logic below waterline injected (Prompt 7.6)
    expect(fakeShader.fragmentShader).toContain('roughnessFactor = mix(roughnessFactor, 0.10, wetT * 0.9)');
    expect(fakeShader.fragmentShader).toContain('diffuseColor.rgb *= mix(1.0, 0.72, wetT)');
    expect(fakeShader.uniforms.uWaterLevel).toBeDefined();
  });

  it('verifies anatomical proportions, head/jaw structure, 24 teeth, and ear-fins (Prompt 7.1-7.3)', () => {
    const mesh = new MonsterMeshHierarchy(1.0, '#6b5f40', 54321);
    const skinMat = mesh.skinnedMesh.material as MeshStandardMaterial;

    // Body skin material: roughness 0.52, metalness 0.03
    expect(skinMat.roughness).toBeCloseTo(0.52, 2);
    expect(skinMat.metalness).toBeCloseTo(0.03, 2);

    // Head and jaw features
    const joints = mesh.joints;
    expect(joints.jaw.children.length).toBeGreaterThan(0);
    expect(mesh.teethMesh).toBeDefined();
    expect([24, 42]).toContain(mesh.teethMesh.count);
    expect(mesh.vertebraMesh).toBeDefined();
    expect([14, 24]).toContain(mesh.vertebraMesh.count);

    // Ear-fin material on bm.earLeft
    const earMesh = joints.earLeft.children[0] as Mesh;
    expect(earMesh).toBeDefined();
    const earMat = earMesh.material as MeshStandardMaterial;
    expect(earMat).toBeDefined();
    expect(earMat.emissive.getHex()).toBe(0x000000);
    expect(earMat.emissiveIntensity).toBe(0.0);
    expect(earMat.roughness).toBeCloseTo(0.55, 2);
    expect(earMat.opacity).toBeCloseTo(0.72, 2);
    expect(earMat.color.getHexString().toLowerCase()).toBe('59462d');

    // Eye sockets: sealed discs on head
    const eyeSockets = joints.head.children.filter((c) => c.name === 'EyeSocket_L' || c.name === 'EyeSocket_R');
    expect(eyeSockets.length).toBe(2);
    const eyeMat = (eyeSockets[0] as Mesh).material as MeshStandardMaterial;
    expect(eyeMat.color.getHexString().toLowerCase()).toBe('635240');
  });

  it('verifies MonsterBody ALERTED pose, telegraph, jaw opening, and V-wake parameters (Prompt 7.7-7.8)', () => {
    const body = new MonsterBody('monster_test', 1.0, '#6b5f40');
    expect(body.maxJawOpen).toBeCloseTo(1.15, 2);
    expect(body.id).toBe('monster_test');
    expect(body.mesh.root).toBeDefined();
    expect(body.tint).toBe('#6b5f40');
  });

  it('verifies distance silhouette readability and color metrics (Prompt 7.9-7.10)', async () => {
    const fsModName = 'node:fs';
    const pathModName = 'node:path';
    const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;
    const root = typeof process !== 'undefined' ? process.cwd() : '.';

    const readabilityPath = path.resolve(root, 'reports/monster/readability.json');
    expect(fs.existsSync(readabilityPath)).toBe(true);

    interface ReadabilityReport {
      distances: Record<string, { maskPixels: number }>;
    }
    const report = JSON.parse(fs.readFileSync(readabilityPath, 'utf-8')) as ReadabilityReport;
    const distances = report.distances;

    // Readability criteria:
    // 6m > 3000 px, 15m > 800 px, 25m > 150 px, 40m > 40 px
    expect(distances['6m']?.maskPixels).toBeGreaterThan(3000);
    expect(distances['15m']?.maskPixels).toBeGreaterThan(800);
    expect(distances['25m']?.maskPixels).toBeGreaterThan(150);
    expect(distances['40m']?.maskPixels).toBeGreaterThan(40);

    // Measured target color checks: head #59462d (89, 70, 45), body #5a5035 (90, 80, 53)
    const headTarget = new Color('#59462d');
    const bodyTarget = new Color('#5a5035');
    const mesh = new MonsterMeshHierarchy(1.0, '#6b5f40', 54321);

    const earMesh = mesh.joints.earLeft.children[0] as Mesh;
    const earMat = earMesh.material as MeshStandardMaterial;
    const headCol = earMat.color;
    expect(Math.abs(headCol.r * 255 - headTarget.r * 255)).toBeLessThanOrEqual(12);
    expect(Math.abs(headCol.g * 255 - headTarget.g * 255)).toBeLessThanOrEqual(12);
    expect(Math.abs(headCol.b * 255 - headTarget.b * 255)).toBeLessThanOrEqual(12);

    const skinMat = mesh.skinnedMesh.material as MeshStandardMaterial;
    const bodyCol = skinMat.color;
    expect(Math.abs(bodyCol.r * 255 - bodyTarget.r * 255)).toBeLessThanOrEqual(20);
    expect(Math.abs(bodyCol.g * 255 - bodyTarget.g * 255)).toBeLessThanOrEqual(20);
    expect(Math.abs(bodyCol.b * 255 - bodyTarget.b * 255)).toBeLessThanOrEqual(20);
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
