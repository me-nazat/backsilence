/* ── Replay.ts ────────────────────────────────────────────────────────────
 *  Pure headless simulation replay verifier.
 *  Executes recorded player inputs against the deterministic SimWorld,
 *  validating simulation outcomes and generating a cryptographic simHash.
 *  Zero Three.js and zero DOM dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

import type { RunRecording } from './RunRecorder.js';
import { RECORDER_SIM_VERSION } from './RunRecorder.js';
import { SimWorld } from '../sim/SimWorld.js';
import type { PlayerIntent } from '../sim/PlayerMotor.js';
import type { LayoutData } from '../world/MapTypes.js';
import type { Vec3 } from '../types/contracts.js';

export interface ReplayVerificationResult {
  valid: boolean;
  totalTicks: number;
  escaped: boolean;
  died: boolean;
  finalPosition: Vec3;
  simHash: string;
  error?: string;
}

/** 32-bit FNV-1a hash function */
function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export const Replay = {
  /**
   * Replays a recording headlessly and returns verification metrics and simHash.
   */
  run(recording: RunRecording, layout: LayoutData): ReplayVerificationResult {
    if (!recording.header || recording.header.version !== RECORDER_SIM_VERSION) {
      return {
        valid: false,
        totalTicks: 0,
        escaped: false,
        died: false,
        finalPosition: { x: 0, y: 0, z: 0 },
        simHash: '00000000',
        error: `Incompatible sim version: ${recording.header?.version}. Expected: ${RECORDER_SIM_VERSION}`,
      };
    }

    const bounds = layout.bounds;
    const playerSpawn = layout.spawns.player[0] ?? { x: 0, y: 0.3, z: 0 };

    const world = new SimWorld({
      seed: recording.header.seed,
      bounds,
      playerSpawn,
      waterY: 0,
    });

    // Rasterize platforms
    for (const plat of layout.platforms) {
      world.ground.rasterizePlatform(plat.rect[0], plat.rect[1], plat.rect[2], plat.rect[3], plat.topY);
    }
    world.finalizeTerrain();

    // Add monsters
    for (const m of layout.spawns.monsters) {
      world.addMonster({
        id: m.id,
        variant: m.variant ?? 'standard',
        spawn: m.spawn,
        spawnGrace: m.spawnGrace ?? 15.0,
      });
    }

    const dt = 1 / recording.header.tickRate;
    let escaped = false;
    let died = false;
    let tickCount = 0;

    const exitPos = layout.exit.position;

    // Unpack RLE frames
    for (const frame of recording.frames) {
      const intent: PlayerIntent = {
        moveX: frame.x,
        moveZ: frame.z,
        sprint: (frame.f & 1) !== 0,
        crouch: (frame.f & 2) !== 0,
        jump: (frame.f & 4) !== 0,
        interact: (frame.f & 8) !== 0,
        lookDeltaYaw: frame.y,
        lookDeltaPitch: frame.p,
      };

      for (let c = 0; c < frame.c; c++) {
        tickCount++;
        world.step(dt, intent);

        const playerPos = world.player.pos;

        // Check exit proximity
        const distToExit = Math.hypot(playerPos.x - exitPos.x, playerPos.z - exitPos.z);
        if (distToExit < 2.0) {
          escaped = true;
          break;
        }

        // Check monster contact
        for (const monster of world.monsters) {
          const distToMonster = Math.hypot(playerPos.x - monster.pos.x, playerPos.z - monster.pos.z);
          if (distToMonster < 1.2 && Math.abs(playerPos.y - monster.pos.y) < 1.8) {
            died = true;
            break;
          }
        }

        if (died) break;
      }

      if (escaped || died) break;
    }

    const finalPos = {
      x: Number(world.player.pos.x.toFixed(2)),
      y: Number(world.player.pos.y.toFixed(2)),
      z: Number(world.player.pos.z.toFixed(2)),
    };

    const hashString = `${recording.header.mapId}:${recording.header.seed}:${tickCount}:${finalPos.x}:${finalPos.y}:${finalPos.z}:${escaped ? 'E' : 'N'}:${died ? 'D' : 'A'}`;
    const simHash = fnv1a(hashString);

    return {
      valid: true,
      totalTicks: tickCount,
      escaped,
      died,
      finalPosition: finalPos,
      simHash,
    };
  },
};
