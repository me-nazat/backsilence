#!/usr/bin/env node
/* ── depth-layer-audit.mjs ───────────────────────────────────────────────────
 *  Depth Layer Audit for BackSilence Hero Shots.
 *  Verifies that every hero shot in shots.json features three populated
 *  depth layers:
 *  - Foreground: < 5.0m (immediate stepping slabs, water clutter, railings)
 *  - Midground: 5.0m .. 20.0m (arches, pillars, key gameplay architecture)
 *  - Far / Silhouette: > 20.0m (distant vaults, horizon fog silhouettes)
 * ──────────────────────────────────────────────────────────────────────── */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// If run directly with node (no vite-node loader for .ts files), respawn with vite-node
if (!process.env.VITE_NODE_EXEC && !process.env.VITEST) {
  process.env.VITE_NODE_EXEC = '1';
  const res = spawnSync('npx', ['vite-node', resolve(process.cwd(), 'scripts/world/depth-layer-audit.mjs'), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(res.status ?? 0);
}

const { Mesh, Vector3, Box3 } = await import('three');
const { NatatoriumMap } = await import('../../src/world/maps/NatatoriumMap.ts');
const { PoolroomsMap } = await import('../../src/world/maps/PoolroomsMap.ts');
const { OrientationMap } = await import('../../src/world/maps/OrientationMap.ts');
const { HydroMazeMap } = await import('../../src/world/maps/HydroMazeMap.ts');
const { DrownedSchoolMap } = await import('../../src/world/maps/DrownedSchoolMap.ts');
const { UtilityTunnelsMap } = await import('../../src/world/maps/UtilityTunnelsMap.ts');
const { DrainageCoreMap } = await import('../../src/world/maps/DrainageCoreMap.ts');
const { DrownedMetroMap } = await import('../../src/world/maps/DrownedMetroMap.ts');
const { MarbleAtriumMap } = await import('../../src/world/maps/MarbleAtriumMap.ts');
const { NeonFloodMap } = await import('../../src/world/maps/NeonFloodMap.ts');
const { SunkenJungleMap } = await import('../../src/world/maps/SunkenJungleMap.ts');

const ROOT = process.cwd();
const SHOTS_PATH = resolve(ROOT, 'shots.json');

const MAPS = {
  natatorium: NatatoriumMap,
  poolrooms: PoolroomsMap,
  orientation: OrientationMap,
  hydro_maze: HydroMazeMap,
  drowned_school: DrownedSchoolMap,
  utility_tunnels: UtilityTunnelsMap,
  drainage_core: DrainageCoreMap,
  drowned_metro: DrownedMetroMap,
  marble_atrium: MarbleAtriumMap,
  neon_flood: NeonFloodMap,
  sunken_jungle: SunkenJungleMap,
};

function getTriangles(geom) {
  if (geom.index) return geom.index.count / 3;
  if (geom.attributes.position) return geom.attributes.position.count / 3;
  return 0;
}

async function runDepthLayerAudit() {
  const shotsDef = JSON.parse(readFileSync(SHOTS_PATH, 'utf8'));
  const heroShots = shotsDef.filter((s) => s.id.includes('hero'));

  console.log(`\n========================================================================================`);
  console.log(`          BACKSILENCE HERO SHOTS DEPTH-LAYER POPULATION AUDIT REPORT                    `);
  console.log(`========================================================================================\n`);

  const results = [];
  let totalErrors = 0;

  for (const shot of heroShots) {
    const def = MAPS[shot.mapId];
    if (!def) {
      console.error(`[depth-layer-audit] Unknown mapId "${shot.mapId}" for shot ${shot.id}`);
      totalErrors++;
      continue;
    }

    const seed = shot.seed ?? 42;
    const layout = def.generateLayout({ seed, difficulty: 'normal', playerCount: 1 });
    const env = { parent: null, textures: null, audio: null, difficulty: 'normal' };
    const instance = await def.build(layout, env);

    const camPos = new Vector3(shot.camera.x, shot.camera.y, shot.camera.z);
    const tgtPos = new Vector3(shot.camera.target.x, shot.camera.target.y, shot.camera.target.z);
    const fwd = new Vector3().subVectors(tgtPos, camPos).normalize();

    let fgMeshes = 0;
    let fgTriangles = 0;
    let mgMeshes = 0;
    let mgTriangles = 0;
    let farMeshes = 0;
    let farTriangles = 0;

    instance.root.updateMatrixWorld(true);

    instance.root.traverse((obj) => {
      if (obj instanceof Mesh) {
        const tri = getTriangles(obj.geometry);
        if (!obj.geometry.boundingBox) {
          obj.geometry.computeBoundingBox();
        }

        let dist = Infinity;
        if (obj.geometry.boundingBox) {
          const box = new Box3().copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
          dist = box.distanceToPoint(camPos);
        } else {
          const objPos = new Vector3();
          obj.getWorldPosition(objPos);
          dist = camPos.distanceTo(objPos);
        }

        const centerPos = new Vector3();
        obj.getWorldPosition(centerPos);
        const toObj = new Vector3().subVectors(centerPos, camPos);
        const projDepth = toObj.dot(fwd);

        // Discard objects strictly behind camera
        if (projDepth < -3.0 && dist > 5.0) return;

        if (dist < 5.0) {
          fgMeshes++;
          fgTriangles += tri;
        } else if (dist < 20.0) {
          mgMeshes++;
          mgTriangles += tri;
        } else {
          farMeshes++;
          farTriangles += tri;
        }
      }
    });

    const hasFg = fgMeshes > 0;
    const hasMg = mgMeshes > 0;
    const hasFar = farMeshes > 0;
    const pass = hasFg && hasMg && hasFar;

    if (!pass) totalErrors++;

    results.push({
      shotId: shot.id,
      mapId: shot.mapId,
      'FG (<5m)': `${fgMeshes} meshes (${fgTriangles.toLocaleString()} tris)`,
      'MG (5-20m)': `${mgMeshes} meshes (${mgTriangles.toLocaleString()} tris)`,
      'Far (>20m)': `${farMeshes} meshes (${farTriangles.toLocaleString()} tris)`,
      status: pass ? 'PASS' : 'FAIL',
    });

    instance.dispose();
  }

  console.table(results);

  if (totalErrors > 0) {
    console.error(`\n[depth-layer-audit] FAIL: ${totalErrors} shot(s) missing populated depth layers.`);
    process.exit(1);
  }

  console.log(`\n[depth-layer-audit] PASS: All ${heroShots.length} hero shots report three populated depth layers.`);
}

runDepthLayerAudit().catch((err) => {
  console.error('[depth-layer-audit] Fatal error:', err);
  process.exit(1);
});
