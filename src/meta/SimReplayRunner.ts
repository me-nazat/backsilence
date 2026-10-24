/* ── SimReplayRunner.ts ────────────────────────────────────────────────────────
 *  Deterministic simulation runner for cross-engine validation and replay integrity.
 *  Executes identical 5-minute runs (18,000 ticks) across JavaScript engines
 *  (Node.js V8, Headless Chrome V8, Firefox SpiderMonkey, WebKit).
 * ──────────────────────────────────────────────────────────────────────── */

import { SimWorld } from '../sim/SimWorld.js';
import type { PlayerIntent } from '../sim/PlayerMotor.js';
import { mulberry32 } from '../procedural/core/prng.js';
import { getMapDefinition } from '../world/MapRegistry.js';
import type { MapId } from '../types/contracts.js';

export interface CheckpointHash {
  tick: number;
  hash: string;
}

export interface ReplayRunResult {
  mapId: string;
  seed: number;
  totalTicks: number;
  checkpoints: CheckpointHash[];
  finalSimHash: string;
  finalPosition: { x: number; y: number; z: number };
}

/** 32-bit FNV-1a hash function */
export function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export async function runSimulationReplay(
  mapId: MapId,
  seed: number,
  totalTicks = 18000, // 5 minutes at 60Hz
  checkpointInterval = 600, // every 10 seconds (30 checkpoints)
): Promise<ReplayRunResult> {
  const mapDef = await getMapDefinition(mapId);
  const layout = mapDef.generateLayout({
    seed,
    difficulty: 'normal',
    playerCount: 1,
  });

  const waterY = layout.waterBodies[0]?.waterY ?? 0;

  const world = new SimWorld({
    seed,
    bounds: layout.bounds,
    playerSpawn: layout.spawns.player[0] ?? { x: 0, y: 0.3, z: 0 },
    waterY,
    difficulty: 'normal',
  });

  for (const plat of layout.platforms) {
    world.ground.rasterizePlatform(plat.rect[0], plat.rect[1], plat.rect[2], plat.rect[3], plat.topY);
  }
  world.finalizeTerrain();

  for (const m of layout.spawns.monsters) {
    world.addMonster({
      id: m.id,
      variant: m.variant ?? 'standard',
      spawn: m.spawn,
      spawnGrace: m.spawnGrace ?? 15.0,
    });
  }

  const checkpoints: CheckpointHash[] = [];
  const intentPrng = mulberry32(seed ^ 0x5a5a5a5a);
  const dt = 1 / 60;

  for (let tick = 1; tick <= totalTicks; tick++) {
    const intent: PlayerIntent = {
      moveX: intentPrng() * 2 - 1,
      moveZ: intentPrng() * 2 - 1,
      sprint: intentPrng() > 0.6,
      crouch: intentPrng() > 0.85,
      jump: intentPrng() > 0.92,
      interact: intentPrng() > 0.96,
      lookDeltaYaw: (intentPrng() * 2 - 1) * 0.05,
      lookDeltaPitch: (intentPrng() * 2 - 1) * 0.02,
    };

    world.step(dt, intent);

    if (tick % checkpointInterval === 0 || tick === totalTicks) {
      const p = world.player.pos;
      const monsterParts = world.monsters
        .map((m) => `${m.id}:${m.pos.x.toFixed(3)},${m.pos.z.toFixed(3)}:${m.state}`)
        .join('|');
      const hashStr = `${tick}:${p.x.toFixed(3)}:${p.y.toFixed(3)}:${p.z.toFixed(3)}:${world.player.stamina.toFixed(3)}:${monsterParts}`;
      const hash = fnv1a(hashStr);
      checkpoints.push({ tick, hash });
    }
  }

  const finalPos = {
    x: Number(world.player.pos.x.toFixed(3)),
    y: Number(world.player.pos.y.toFixed(3)),
    z: Number(world.player.pos.z.toFixed(3)),
  };

  const finalHashStr = `${mapId}:${seed}:${totalTicks}:${finalPos.x}:${finalPos.y}:${finalPos.z}:${checkpoints[checkpoints.length - 1]?.hash}`;
  const finalSimHash = fnv1a(finalHashStr);

  return {
    mapId,
    seed,
    totalTicks,
    checkpoints,
    finalSimHash,
    finalPosition: finalPos,
  };
}
