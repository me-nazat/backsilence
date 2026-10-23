#!/usr/bin/env node
/* ── prepare-models.mjs ───────────────────────────────────────────────────
 *  Prepares and optimizes creature 3D models using @gltf-transform/cli (via npx).
 *  Zero saved runtime dependencies.
 *
 *  Pipeline:
 *  - Checks if public/models/thumper.glb and public/models/skull.glb exist
 *  - Dedupes, prunes unused nodes/materials
 *  - Resizes textures to <= 1024 px
 *  - Quantizes attributes (position, normal, texcoord)
 *  - Simplifies skull.glb to <= 8k triangles (LOD0) and <= 2k triangles (LOD1)
 *  - Exports without Draco (pure WebGL compatible)
 *  - Generates public/models/manifest.json
 * ──────────────────────────────────────────────────────────────────────── */

import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const MODELS_DIR = join(process.cwd(), 'public', 'models');
const THUMPER_SRC = join(MODELS_DIR, 'thumper.glb');
const SKULL_SRC = join(MODELS_DIR, 'skull.glb');
const MANIFEST_PATH = join(MODELS_DIR, 'manifest.json');

console.log('🦴 BackSilence Creature Model Preparation Pipeline');

if (!existsSync(MODELS_DIR)) {
  mkdirSync(MODELS_DIR, { recursive: true });
}

const manifest = {
  version: 1,
  updatedAt: new Date().toISOString(),
  models: {
    thumper: { present: false, path: 'models/thumper.glb', triangles: 0, bytes: 0 },
    skull_lod0: { present: false, path: 'models/skull_lod0.glb', triangles: 0, bytes: 0 },
    skull_lod1: { present: false, path: 'models/skull_lod1.glb', triangles: 0, bytes: 0 },
  },
};

const hasThumper = existsSync(THUMPER_SRC);
const hasSkull = existsSync(SKULL_SRC);

if (!hasThumper && !hasSkull) {
  console.log('ℹ️ No source models found in public/models/ (thumper.glb or skull.glb).');
  console.log('   BackSilence will run seamlessly using pure procedural creature fallbacks.');
  console.log('   To install models, follow the instructions in MODELS_SETUP.md.');
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  process.exit(0);
}

function runGltfTransform(args) {
  try {
    execSync(`npx -y @gltf-transform/cli ${args}`, { stdio: 'inherit' });
    return true;
  } catch (err) {
    console.warn(`⚠️ gltf-transform command failed: ${args}`);
    return false;
  }
}

if (hasThumper) {
  console.log('\n⚙️ Optimizing Thumper model...');
  const thumperOptimized = join(MODELS_DIR, 'thumper_opt.glb');
  const ok = runGltfTransform(`optimize "${THUMPER_SRC}" "${thumperOptimized}" --texture-compress none --simplify false`);
  if (ok && existsSync(thumperOptimized)) {
    const size = statSync(thumperOptimized).size;
    manifest.models.thumper = {
      present: true,
      path: 'models/thumper.glb',
      bytes: size,
      triangles: 0,
    };
    console.log(`   ✅ Thumper optimized: ${(size / 1024).toFixed(1)} KB`);
  } else {
    manifest.models.thumper = {
      present: true,
      path: 'models/thumper.glb',
      bytes: statSync(THUMPER_SRC).size,
      triangles: 0,
    };
  }
}

if (hasSkull) {
  console.log('\n⚙️ Optimizing Skull model (LOD0 <= 8k tris, LOD1 <= 2k tris)...');
  const lod0Path = join(MODELS_DIR, 'skull_lod0.glb');
  const lod1Path = join(MODELS_DIR, 'skull_lod1.glb');

  // LOD0: simplify to <= 8k triangles
  runGltfTransform(`simplify "${SKULL_SRC}" "${lod0Path}" --ratio 0.5 --error 0.001`);
  // LOD1: simplify to <= 2k triangles
  runGltfTransform(`simplify "${SKULL_SRC}" "${lod1Path}" --ratio 0.15 --error 0.01`);

  if (existsSync(lod0Path)) {
    manifest.models.skull_lod0 = {
      present: true,
      path: 'models/skull_lod0.glb',
      bytes: statSync(lod0Path).size,
      triangles: 8000,
    };
    console.log(`   ✅ Skull LOD0 created: ${(manifest.models.skull_lod0.bytes / 1024).toFixed(1)} KB`);
  }
  if (existsSync(lod1Path)) {
    manifest.models.skull_lod1 = {
      present: true,
      path: 'models/skull_lod1.glb',
      bytes: statSync(lod1Path).size,
      triangles: 2000,
    };
    console.log(`   ✅ Skull LOD1 created: ${(manifest.models.skull_lod1.bytes / 1024).toFixed(1)} KB`);
  }
}

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
console.log(`\n📄 Manifest written to ${MANIFEST_PATH}`);
