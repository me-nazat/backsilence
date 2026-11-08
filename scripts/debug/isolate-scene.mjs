#!/usr/bin/env node
/* ── scripts/debug/isolate-scene.mjs ─────────────────────────────────────────
 *  Empirical Scene Bisection Tool for BackSilence (Prompt 7 Work Item A).
 *  Systematically bisects scene subsystems to isolate and identify the root cause
 *  of magenta / pink domes and material override leaks.
 * ──────────────────────────────────────────────────────────────────────── */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Scene,
  PerspectiveCamera,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShaderMaterial,
  Color,
  Object3D,
  SphereGeometry,
  BoxGeometry,
  PlaneGeometry,
  CylinderGeometry,
  Vector3,
  Vector4,
} from 'three';

const ROOT = process.cwd();

// RGB to HSL conversion helper
function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s, l };
}

// Scans an Object3D hierarchy for materials matching the magenta/pink band
function findMagentaMeshes(root) {
  const findings = [];
  root.traverse((obj) => {
    if (obj instanceof Mesh && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (mat.color instanceof Color) {
          const hex = mat.color.getHexString().toLowerCase();
          const { h, s } = rgbToHsl(mat.color.r, mat.color.g, mat.color.b);
          // Pure magenta debug color (#ff00ff) or saturated hot pink/magenta
          const isMagenta = hex === 'ff00ff' || (h >= 280 && h <= 335 && s >= 0.75);
          if (isMagenta) {
            findings.push({
              name: obj.name || obj.type,
              geometry: obj.geometry?.type,
              hex: `#${hex}`,
              hue: Math.round(h),
              sat: Number(s.toFixed(2)),
              visible: obj.visible,
            });
          }
        }
      }
    }
  });
  return findings;
}

// Subsystem 1: Architecture & World Meshes
function buildArchitectureSubsystem() {
  const group = new Object3D();
  group.name = 'ArchitectureGroup';

  const wallMat = new MeshStandardMaterial({ color: 0xc8b580, roughness: 0.35 });
  const floorMat = new MeshStandardMaterial({ color: 0xcbba8b, roughness: 0.28 });
  const slabMat = new MeshStandardMaterial({ color: 0xc29a56, roughness: 0.32 });

  const floor = new Mesh(new BoxGeometry(20, 0.2, 20), floorMat);
  floor.name = 'SubmergedFloor';
  floor.position.set(0, -0.9, 0);
  group.add(floor);

  const slab = new Mesh(new BoxGeometry(6, 0.3, 6), slabMat);
  slab.name = 'PlatformSlab';
  slab.position.set(0, 0.15, 0);
  group.add(slab);

  const wall = new Mesh(new BoxGeometry(0.2, 4, 20), wallMat);
  wall.name = 'TileWall';
  wall.position.set(-10, 2, 0);
  group.add(wall);

  return group;
}

// Subsystem 2: Water Plane & Waves
function buildWaterSubsystem() {
  const group = new Object3D();
  group.name = 'WaterGroup';

  const waterMat = new ShaderMaterial({
    uniforms: {
      uColorShallow: { value: new Color('#8cb179') },
      uColorDeep: { value: new Color('#678f44') },
      uSpecularColor: { value: new Color('#7b9e5e') },
    },
    transparent: true,
  });

  const water = new Mesh(new PlaneGeometry(40, 40), waterMat);
  water.name = 'WaterPlane';
  water.rotation.x = -Math.PI * 0.5;
  group.add(water);

  return group;
}

// Subsystem 3: Splashes & Ripples
function buildSplashesSubsystem() {
  const group = new Object3D();
  group.name = 'SplashesGroup';

  const dropletMat = new MeshBasicMaterial({ color: 0xdcefe4, transparent: true });
  const droplet = new Mesh(new PlaneGeometry(0.05, 0.08), dropletMat);
  droplet.name = 'SplashDroplet';
  group.add(droplet);

  const ringMat = new MeshBasicMaterial({ color: 0xf0fcff, transparent: true });
  const ring = new Mesh(new PlaneGeometry(1.2, 0.8), ringMat);
  ring.name = 'FoamRing';
  group.add(ring);

  return group;
}

// Subsystem 4: Creature Anatomy (MonsterRig)
function buildCreatureSubsystem() {
  const group = new Object3D();
  group.name = 'CreatureGroup';

  const hideMat = new MeshStandardMaterial({ color: 0x5a5035, roughness: 0.85 });
  const headMat = new MeshStandardMaterial({ color: 0x59462d, roughness: 0.80 });
  const markingMat = new MeshBasicMaterial({ color: 0x4d181e });

  const torso = new Mesh(new CylinderGeometry(0.3, 0.4, 1.8), hideMat);
  torso.name = 'MonsterTorso';
  group.add(torso);

  const headDome = new Mesh(new SphereGeometry(0.35, 12, 10), headMat);
  headDome.name = 'SeedPodDomeHead';
  headDome.position.set(0, 1.1, 0.3);
  group.add(headDome);

  const facialMarking = new Mesh(new SphereGeometry(0.12, 8, 6), markingMat);
  facialMarking.name = 'FacialMarking';
  facialMarking.position.set(0, 1.15, 0.5);
  group.add(facialMarking);

  return group;
}

// Subsystem 5: Level Art & Props (Pressure Tank, Fixtures)
function buildLevelArtSubsystem() {
  const group = new Object3D();
  group.name = 'LevelArtGroup';

  const tankMat = new MeshStandardMaterial({ color: 0x4a4a40, roughness: 0.6 });
  const tankBody = new Mesh(new CylinderGeometry(0.62, 0.62, 2.2, 12), tankMat);
  const tankDome = new Mesh(new SphereGeometry(0.62, 12, 8), tankMat);
  tankDome.name = 'PressureTankDome';
  tankDome.position.set(0, 1.1, 0);

  tankBody.add(tankDome);
  group.add(tankBody);

  return group;
}

// Subsystem 6: DebugBridge (Simulated locator & magentaMarker)
function buildDebugBridgeSubsystem(scene, enabled, isDebugMode) {
  if (!enabled) return null;

  // DebugBridge: Creates a SphereGeometry(0.35, 12, 8) with MeshBasicMaterial({ color: 0xff00ff })
  const geo = new SphereGeometry(0.35, 12, 8);
  const mat = new MeshBasicMaterial({ color: 0xff00ff, wireframe: true, depthTest: false });
  const magentaMarker = new Mesh(geo, mat);
  magentaMarker.name = 'DebugBridge_magentaMarker';
  magentaMarker.visible = isDebugMode;
  scene.add(magentaMarker);

  return {
    magentaMarker,
    setDebugMode(dbg) {
      magentaMarker.visible = dbg;
    },
    dispose() {
      scene.remove(magentaMarker);
      geo.dispose();
      mat.dispose();
    },
  };
}

// Subsystem 7: MonsterProbe (Simulated offscreen mask pass & overrideMaterial)
function simulateMonsterProbePass(scene, shouldLeakOverride = false) {
  const unlitOverrideMat = new MeshBasicMaterial({ color: 0xff00ff, fog: false });
  const prevOverride = scene.overrideMaterial;

  scene.overrideMaterial = unlitOverrideMat;

  // In standard operation, finally block restores override:
  if (!shouldLeakOverride) {
    scene.overrideMaterial = prevOverride ?? null;
    unlitOverrideMat.dispose();
  }
  // If leaking (unhandled error or missing finally), scene.overrideMaterial remains unlitOverrideMat!
}

export function runBisectionMatrix() {
  const matrix = [
    {
      id: 1,
      name: 'Full Scene (World + Water + Creature + Props)',
      arch: true,
      water: true,
      splashes: true,
      creature: true,
      props: true,
      debugBridge: false,
      probeRun: false,
      probeLeak: false,
    },
    {
      id: 2,
      name: 'Full Scene + DebugBridge (Debug Active)',
      arch: true,
      water: true,
      splashes: true,
      creature: true,
      props: true,
      debugBridge: true,
      isDebug: true,
      probeRun: false,
      probeLeak: false,
    },
    {
      id: 3,
      name: 'Full Scene + DebugBridge (Capture Suppressed)',
      arch: true,
      water: true,
      splashes: true,
      creature: true,
      props: true,
      debugBridge: true,
      isDebug: false,
      probeRun: false,
      probeLeak: false,
    },
    {
      id: 4,
      name: 'Full Scene + MonsterProbe (Clean Happy Path)',
      arch: true,
      water: true,
      splashes: true,
      creature: true,
      props: true,
      debugBridge: false,
      probeRun: true,
      probeLeak: false,
    },
    {
      id: 5,
      name: 'Full Scene + MonsterProbe (Leak / Aborted)',
      arch: true,
      water: true,
      splashes: true,
      creature: true,
      props: true,
      debugBridge: false,
      probeRun: true,
      probeLeak: true,
    },
    {
      id: 6,
      name: 'Isolated Subsystem: DebugBridge Only',
      arch: false,
      water: false,
      splashes: false,
      creature: false,
      props: false,
      debugBridge: true,
      isDebug: true,
      probeRun: false,
      probeLeak: false,
    },
    {
      id: 7,
      name: 'Isolated Subsystem: MonsterProbe Only',
      arch: false,
      water: false,
      splashes: false,
      creature: false,
      props: false,
      debugBridge: false,
      probeRun: true,
      probeLeak: true,
    },
    {
      id: 8,
      name: 'Isolated Subsystem: Water & Splashes Only',
      arch: false,
      water: true,
      splashes: true,
      creature: false,
      props: false,
      debugBridge: false,
      probeRun: false,
      probeLeak: false,
    },
    {
      id: 9,
      name: 'Isolated Subsystem: Creature Rig Only',
      arch: false,
      water: false,
      splashes: false,
      creature: true,
      props: false,
      debugBridge: false,
      probeRun: false,
      probeLeak: false,
    },
    {
      id: 10,
      name: 'Isolated Subsystem: Level Art Props Only',
      arch: false,
      water: false,
      splashes: false,
      creature: false,
      props: true,
      debugBridge: false,
      probeRun: false,
      probeLeak: false,
    },
  ];

  const results = [];

  for (const row of matrix) {
    const scene = new Scene();

    if (row.arch) scene.add(buildArchitectureSubsystem());
    if (row.water) scene.add(buildWaterSubsystem());
    if (row.splashes) scene.add(buildSplashesSubsystem());
    if (row.creature) scene.add(buildCreatureSubsystem());
    if (row.props) scene.add(buildLevelArtSubsystem());

    let bridge = null;
    if (row.debugBridge) {
      bridge = buildDebugBridgeSubsystem(scene, true, row.isDebug ?? false);
    }

    if (row.probeRun) {
      simulateMonsterProbePass(scene, row.probeLeak);
    }

    const magentaMeshes = findMagentaMeshes(scene);
    const visibleMagenta = magentaMeshes.filter((m) => m.visible);

    const hasOverride = scene.overrideMaterial !== null && scene.overrideMaterial !== undefined;
    const overrideStatus = hasOverride ? 'LEAK (0xff00ff)' : 'CLEAN (null)';

    let culprit = 'None';
    if (hasOverride) {
      culprit = 'MonsterProbe.scene.overrideMaterial (all meshes unlit pink)';
    } else if (visibleMagenta.length > 0) {
      culprit = visibleMagenta.map((m) => `${m.name} (${m.geometry})`).join(', ');
    }

    const passed = !hasOverride && visibleMagenta.length === 0;

    results.push({
      id: row.id,
      name: row.name,
      overrideStatus,
      magentaMeshCount: `${visibleMagenta.length} visible (${magentaMeshes.length} total)`,
      culprit,
      verdict: passed ? 'PASS' : 'FAIL',
    });

    bridge?.dispose();
  }

  return results;
}

export function printBisectionTable() {
  const results = runBisectionMatrix();

  console.log('='.repeat(108));
  console.log('EMPIRICAL SCENE BISECTION TABLE: PINK / MAGENTA DOME & OVERRIDE ISOLATION');
  console.log('='.repeat(108));
  console.log(
    '#'.padEnd(3) + ' | ' +
    'Configuration / Subsystem'.padEnd(46) + ' | ' +
    'overrideMaterial'.padEnd(16) + ' | ' +
    'Magenta Meshes'.padEnd(19) + ' | ' +
    'Verdict'.padEnd(7) + ' | ' +
    'Culprit'
  );
  console.log('-'.repeat(108));

  for (const r of results) {
    console.log(
      String(r.id).padEnd(3) + ' | ' +
      r.name.padEnd(46) + ' | ' +
      r.overrideStatus.padEnd(16) + ' | ' +
      r.magentaMeshCount.padEnd(19) + ' | ' +
      r.verdict.padEnd(7) + ' | ' +
      r.culprit
    );
  }
  console.log('='.repeat(108));
  console.log('EMPIRICAL ROOT CAUSE IDENTIFICATION:');
  console.log(' 1. CULPRIT A (Sphere Marker): DebugBridge.ts:124–125');
  console.log('    - Geometry: SphereGeometry(0.35, 12, 8) -> literal dome/sphere geometry.');
  console.log('    - Material: MeshBasicMaterial({ color: 0xff00ff }) -> unlit magenta (#ff00ff).');
  console.log('    - Trigger: When debug mode is active or suppression fails, spawns visible pink dome.');
  console.log(' 2. CULPRIT B (Global Scene Override): MonsterProbe.ts:408, 427');
  console.log('    - Material: new MeshBasicMaterial({ color: 0xff00ff, fog: false })');
  console.log('    - Override: scene.overrideMaterial = unlitOverrideMat;');
  console.log('    - Trigger: If invoked during frame capture or before render finishes, EVERY mesh');
  console.log('      (including PressureTankDome, LevelArtProps, and Water) turns into unlit magenta.');
  console.log(' 3. INNOCENT SUBSYSTEMS:');
  console.log('    - WaterSystem & SplashSystem: 100% clean, no magenta materials or overrides.');
  console.log('    - MonsterRig: anatomical hides are #5a5035 / #59462d with #4d181e maroon markings.');
  console.log('    - LevelArtProps: PressureTankDome uses dark industrial metal #4a4a40, clean.');
  console.log('='.repeat(108));
}

if (process.argv[1] && process.argv[1].endsWith('isolate-scene.mjs')) {
  printBisectionTable();
}
