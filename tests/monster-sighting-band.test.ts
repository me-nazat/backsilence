/* ── monster-sighting-band.test.ts ───────────────────────────────────────
 *  Prompt 6 Section C & Definition of Done: Distance-Band Verification Suite.
 *  Asserts that Director.ts candidate distances and patrol lane sighting nodes
 *  strictly align with the 10–15m reference sighting band (f_008/f_009).
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { EncounterDirector } from '../src/sim/Director.js';
import { NavGrid } from '../src/sim/NavGrid.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { MonsterBrain } from '../src/sim/MonsterBrain.js';

interface FsModule {
  readFileSync: (p: string, enc: string) => string;
}
interface PathModule {
  resolve: (...parts: string[]) => string;
}
declare const process: { cwd: () => string };

describe('Monster Sighting Distance Band Suite (Prompt 6 / f_008-f_009)', () => {
  it('1. Director candidateDists array strictly falls within 10–15m reference band', async () => {
    const fsMod = 'node:fs';
    const pathMod = 'node:path';
    const fs = (await import(/* @vite-ignore */ fsMod)) as unknown as FsModule;
    const path = (await import(/* @vite-ignore */ pathMod)) as unknown as PathModule;
    const directorSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/sim/Director.ts'),
      'utf8',
    );

    const match = directorSource.match(/candidateDists\s*=\s*\[([\d.,\s]+)\]/);
    expect(match).not.toBeNull();
    const rawNumbers = match![1]!.split(',').map((s: string) => parseFloat(s.trim())).filter((n: number) => !isNaN(n));

    expect(rawNumbers.length).toBeGreaterThan(0);
    for (const dist of rawNumbers) {
      expect(dist).toBeGreaterThanOrEqual(10.0);
      expect(dist).toBeLessThanOrEqual(15.0);
    }
  });

  it('2. Director patrol lane sighting nodes are constrained to 10–15m', async () => {
    const fsMod = 'node:fs';
    const pathMod = 'node:path';
    const fs = (await import(/* @vite-ignore */ fsMod)) as unknown as FsModule;
    const path = (await import(/* @vite-ignore */ pathMod)) as unknown as PathModule;
    const directorSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/sim/Director.ts'),
      'utf8',
    );

    // Verify distance check in patrol lane logic
    expect(directorSource).toMatch(/d\s*>=\s*10\.0\s*&&\s*d\s*<=\s*15\.0/);
  });

  it('3. Ambush candidate placement runtime verification falls within 10–15m', () => {
    const bounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
    const ground = new GroundGrid(bounds, 0.25);
    ground.fill(-0.8);
    ground.computeDistanceTransform(0);
    const nav = new NavGrid(ground, 0, 0.25);

    const monster = new MonsterBrain(
      {
        id: 'monster-1',
        variant: 'standard',
        spawn: { x: -35, y: -0.8, z: -35 },
      },
      nav,
      101,
    );

    const director = new EncounterDirector(101, 'normal', 0.045, 'campaign');
    const playerPos = { x: 0, y: -0.8, z: 0 };
    const playerYaw = 0;

    const relocated = director.tryAcousticAmbushRelocation(monster, playerPos, playerYaw, nav);
    expect(relocated).toBe(true);

    const dist = Math.hypot(monster.pos.x - playerPos.x, monster.pos.z - playerPos.z);
    expect(dist).toBeGreaterThanOrEqual(10.0);
    expect(dist).toBeLessThanOrEqual(15.0);
  });
});
