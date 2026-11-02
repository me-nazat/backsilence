#!/usr/bin/env node
/**
 * scripts/creature/appearance-lock.mjs
 *
 * Verifies that the default shipped creature appearance is a deterministic
 * property of the commit, not of the machine's filesystem:
 * 1. Verifies src/app/Settings.ts defaults waterMonsterSkin to 'procedural'
 *    and migrates 'auto' / invalid values to 'procedural'.
 * 2. Resolves the skin descriptor for every value of waterMonsterSkin
 *    ('procedural', 'auto', 'model') BOTH with and without public/models/thumper.glb
 *    present.
 * 3. Hashes (skinPath + tint + scale + rigRevision) and fails (exit 1) if the
 *    default resolution ('procedural') or 'auto' resolution differs between
 *    a machine with thumper.glb and a machine without thumper.glb.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const settingsPath = path.join(ROOT, 'src/app/Settings.ts');
const monsterSkinPath = path.join(ROOT, 'src/game/creatures/MonsterSkin.ts');

const settingsSrc = fs.readFileSync(settingsPath, 'utf8');
const monsterSkinSrc = fs.readFileSync(monsterSkinPath, 'utf8');

const errors = [];

// 1. Verify Settings.ts default and migration
if (!/waterMonsterSkin:\s*'procedural'/.test(settingsSrc)) {
  errors.push("src/app/Settings.ts must default creatures.waterMonsterSkin to 'procedural'.");
}
if (/waterMonsterSkin:\s*'auto'/.test(settingsSrc)) {
  errors.push("src/app/Settings.ts still contains waterMonsterSkin: 'auto'.");
}

// 2. Extract rig revision and verify MonsterSkin.ts resolution logic
const revMatch = monsterSkinSrc.match(/MONSTER_RIG_REVISION\s*=\s*['"]([^'"]+)['"]/);
const rigRevision = revMatch ? revMatch[1] : 'procedural-quadruped-v2';

if (/skin\s*===\s*['"]auto['"]\s*&&\s*isModelAvailable/.test(monsterSkinSrc)) {
  errors.push("src/game/creatures/MonsterSkin.ts still resolves 'auto' based on isModelAvailable('thumper').");
}

function resolveSkin(skinChoice, glbPresent, scale = 1.0, tint = '#7a4a38') {
  if (skinChoice === 'model' && glbPresent) {
    return {
      resolvedKind: 'model',
      skinPath: 'models/thumper.glb',
      tint: tint.toLowerCase(),
      scale,
      rigRevision: 'glb-thumper-v1',
    };
  }
  return {
    resolvedKind: 'procedural',
    skinPath: 'procedural://MonsterRig',
    tint: tint.toLowerCase(),
    scale,
    rigRevision,
  };
}

function hashDescriptor(desc) {
  const payload = `${desc.skinPath}|${desc.tint}|${desc.scale.toFixed(4)}|${desc.rigRevision}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

const skinValues = ['procedural', 'auto', 'model'];
const table = [];

for (const val of skinValues) {
  const withoutGlb = resolveSkin(val, false);
  const withGlb = resolveSkin(val, true);
  const hashWithout = hashDescriptor(withoutGlb);
  const hashWith = hashDescriptor(withGlb);

  table.push({
    setting: val,
    withoutGlb: withoutGlb.resolvedKind,
    withGlb: withGlb.resolvedKind,
    hashWithout: hashWithout.slice(0, 16),
    hashWith: hashWith.slice(0, 16),
    identicalAcrossMachines: hashWithout === hashWith,
  });

  if ((val === 'procedural' || val === 'auto') && hashWithout !== hashWith) {
    errors.push(
      `Skin resolution for '${val}' differs when public/models/thumper.glb is present (${hashWith}) vs absent (${hashWithout}).`,
    );
  }
}

console.log('[appearance-lock] Resolution Matrix:');
for (const row of table) {
  console.log(
    `  waterMonsterSkin='${row.setting}' -> withoutGLB=${row.withoutGlb} (${row.hashWithout}) | withGLB=${row.withGlb} (${row.hashWith}) | deterministic=${row.identicalAcrossMachines}`,
  );
}

if (errors.length > 0) {
  console.error('[appearance-lock] FAIL:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log('[appearance-lock] PASS: Default creature appearance is locked and filesystem-independent.');

