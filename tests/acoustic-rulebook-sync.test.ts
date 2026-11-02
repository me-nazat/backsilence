import { describe, it, expect } from 'vitest';
import { WORLD } from '../src/app/Config.js';
import { AcousticBus } from '../src/sim/AcousticBus.js';
import { SimWorld } from '../src/sim/SimWorld.js';
import { ColliderSet } from '../src/sim/Colliders.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';

interface FsModule {
  readFileSync: (p: string, enc: string) => string;
}
interface PathModule {
  resolve: (...parts: string[]) => string;
  join: (...parts: string[]) => string;
}
declare const process: { cwd: () => string };

function parseRulebookTable(markdown: string): Array<{
  action: string;
  surface: string;
  loudness: number;
  maxRadiusMeters: number;
}> {
  const rows: Array<{
    action: string;
    surface: string;
    loudness: number;
    maxRadiusMeters: number;
  }> = [];
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 4) continue;
    if (cells[0] === 'Player Action' || cells[0] === 'Action' || cells[0]?.startsWith('---')) continue;
    const loudnessMatch = cells[2]!.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (!loudnessMatch) continue;
    const loudness = Number.parseFloat(loudnessMatch[1]!);
    const radiusMatch = cells[3]!.match(/Within\s+~?([0-9]+(?:\.[0-9]+)?)/i);
    const maxRadiusMeters = radiusMatch ? Number.parseFloat(radiusMatch[1]!) : 0;
    rows.push({
      action: cells[0]!,
      surface: cells[1]!,
      loudness,
      maxRadiusMeters,
    });
  }
  return rows;
}

describe('Acoustic Rulebook Sync (One Acoustic Path)', () => {
  it('declares src/sim/AcousticBus.ts in ACOUSTIC_RULEBOOK.md and syncs all 29 table rows', async () => {
    const fsModName = 'node:fs';
    const pathModName = 'node:path';
    const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;
    const rulebookPath = path.resolve(process.cwd(), 'ACOUSTIC_RULEBOOK.md');
    const rulebookMd = fs.readFileSync(rulebookPath, 'utf8');

    expect(rulebookMd).toContain('src/sim/AcousticBus.ts');

    const parsedRows = parseRulebookTable(rulebookMd);
    expect(parsedRows.length).toBeGreaterThanOrEqual(29);

    const busModule = AcousticBus as unknown as {
      RULEBOOK_NOISE_TABLE?: Array<{
        action: string;
        surface: string;
        loudness: number;
        maxRadiusMeters: number;
      }>;
    };
    expect(busModule.RULEBOOK_NOISE_TABLE).toBeDefined();

    for (const row of parsedRows) {
      const match = busModule.RULEBOOK_NOISE_TABLE?.find(
        (entry) => entry.action === row.action && entry.surface === row.surface,
      );
      expect(
        match,
        `Missing rulebook entry in AcousticBus.RULEBOOK_NOISE_TABLE for "${row.action}" on "${row.surface}"`,
      ).toBeDefined();
      expect(match?.loudness).toBeCloseTo(row.loudness, 4);
      if (row.maxRadiusMeters > 0) {
        expect(match?.maxRadiusMeters).toBeGreaterThanOrEqual(row.maxRadiusMeters);
      } else {
        expect(match?.maxRadiusMeters).toBe(0);
      }
    }
  });

  it('drives every player action and matches rulebook continuous loudness and hearing radius (dry tile = 0)', () => {
    const bus = new AcousticBus();

    expect(typeof bus.computeHearingRadius).toBe('function');

    // 1. Dry tile actions: still, crouch-walk, walk, sprint, jump, land -> ALL must emit 0
    for (const dryState of [
      { horizSpeed: 0.0, crouching: false, sprinting: false, justJumped: false },
      { horizSpeed: 1.5, crouching: true, sprinting: false, justJumped: false },
      { horizSpeed: 3.2, crouching: false, sprinting: false, justJumped: false },
      { horizSpeed: 5.2, crouching: false, sprinting: true, justJumped: false },
      { horizSpeed: 3.2, crouching: false, sprinting: false, justJumped: true },
    ]) {
      bus.updatePlayerSplash({
        dt: 0.05,
        position: { x: 0, y: 0.38, z: 0 },
        horizSpeed: dryState.horizSpeed,
        inWater: false,
        waterDepth: 0,
        crouching: dryState.crouching,
        sprinting: dryState.sprinting,
        justJumped: dryState.justJumped,
      });

      expect(bus.waterNoiseLevel).toBe(0);
      expect(bus.computeHearingRadius(bus.waterNoiseLevel, 1.0, 0)).toBe(0);
    }

    // 2. Still in water (Freeze Rule) -> loudness 0.00, hearing radius 0.0m
    bus.updatePlayerSplash({
      dt: 0.05,
      position: { x: 0, y: -0.75, z: 0 },
      horizSpeed: 0.0,
      inWater: true,
      waterDepth: 0.55,
      crouching: false,
      sprinting: false,
    });
    expect(bus.waterNoiseLevel).toBe(0.0);
    expect(bus.computeHearingRadius(bus.waterNoiseLevel, 1.0, 0)).toBe(0.0);

    // 3. Crouch-Wade in water -> loudness 0.12, hearing radius 4.8m (<= 5m)
    bus.updatePlayerSplash({
      dt: 0.05,
      position: { x: 0, y: -0.75, z: 0 },
      horizSpeed: 1.2,
      inWater: true,
      waterDepth: 0.55,
      crouching: true,
      sprinting: false,
    });
    expect(bus.waterNoiseLevel).toBeCloseTo(0.12, 4);
    expect(bus.computeHearingRadius(bus.waterNoiseLevel, 1.0, 0)).toBeCloseTo(
      0.12 * WORLD.AUDIO.MAX_HEAR_RADIUS,
      4,
    );

    // 4. Wade in water -> loudness 0.35, hearing radius 14.0m
    bus.updatePlayerSplash({
      dt: 0.05,
      position: { x: 0, y: -0.75, z: 0 },
      horizSpeed: 2.5,
      inWater: true,
      waterDepth: 0.55,
      crouching: false,
      sprinting: false,
    });
    expect(bus.waterNoiseLevel).toBeCloseTo(0.35, 4);
    expect(bus.computeHearingRadius(bus.waterNoiseLevel, 1.0, 0)).toBeCloseTo(14.0, 4);

    // 5. Sprint-Wade in water -> loudness 0.75, hearing radius 30.0m
    bus.updatePlayerSplash({
      dt: 0.05,
      position: { x: 0, y: -0.75, z: 0 },
      horizSpeed: 4.2,
      inWater: true,
      waterDepth: 0.55,
      crouching: false,
      sprinting: true,
    });
    expect(bus.waterNoiseLevel).toBeCloseTo(0.75, 4);
    expect(bus.computeHearingRadius(bus.waterNoiseLevel, 1.0, 0)).toBeCloseTo(30.0, 4);

    // 6. Mantle (Water -> Dry) -> loudness 0.50, hearing radius 20.0m
    bus.updatePlayerSplash({
      dt: 0.05,
      position: { x: 0, y: 0.1, z: 0 },
      horizSpeed: 1.5,
      inWater: false,
      waterDepth: 0.0,
      mantling: true,
    });
    expect(bus.waterNoiseLevel).toBeCloseTo(0.50, 4);
    expect(bus.computeHearingRadius(bus.waterNoiseLevel, 1.0, 0)).toBeCloseTo(20.0, 4);

    // 7. Jump / Dive in water -> loudness 1.00, hearing radius 40.0m
    bus.updatePlayerSplash({
      dt: 0.05,
      position: { x: 0, y: -0.75, z: 0 },
      horizSpeed: 2.0,
      inWater: true,
      waterDepth: 0.55,
      justJumped: true,
    });
    expect(bus.waterNoiseLevel).toBeCloseTo(1.0, 4);
    expect(bus.computeHearingRadius(bus.waterNoiseLevel, 1.0, 0)).toBeCloseTo(40.0, 4);

    // 8. Wall occlusion (0.5 per wall, max 2 walls)
    expect(bus.computeHearingRadius(1.0, 1.0, 1)).toBeCloseTo(20.0, 4);
    expect(bus.computeHearingRadius(1.0, 1.0, 2)).toBeCloseTo(10.0, 4);
    expect(bus.computeHearingRadius(1.0, 1.0, 5)).toBeCloseTo(10.0, 4);
  });

  it('drives SimWorld player stepping on dry platform vs water and verifies AcousticSystem is presentation-only', async () => {
    const fsModName = 'node:fs';
    const pathModName = 'node:path';
    const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;

    const bounds = { minX: -20, minZ: -20, maxX: 20, maxZ: 20 };
    const ground = new GroundGrid(bounds, 0.25);
    ground.fill(-0.75);
    // Dry slab around (0, 0)
    ground.setRectHeight(-4, -4, 4, 4, 0.38);

    const colliders = new ColliderSet();
    const sim = new SimWorld({
      seed: 42,
      bounds,
      ground,
      colliders,
      waterY: 0.0,
      playerSpawn: { x: 0, y: 0.38, z: 0 },
    });

    // Step player walking on dry slab
    sim.step(1 / 60, {
      moveX: 0,
      moveZ: 1,
      sprint: true,
      crouch: false,
      jump: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    });
    expect(sim.acousticBus.waterNoiseLevel).toBe(0);
    expect(sim.acousticBus.effectiveLoudness).toBe(0);
    expect(sim.acousticBus.currentHearingRadius).toBe(0);

    // Verify AcousticSystem does not generate loudness of its own
    const acousticSystemSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/game/AcousticSystem.ts'),
      'utf8',
    );
    expect(acousticSystemSrc).toContain('AcousticBus');
    expect(acousticSystemSrc).not.toMatch(/emitFootstep\s*\([^)]*\)\s*:\s*void\s*\{[^}]*0\.35/);
  });
});
