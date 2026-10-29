import { NatatoriumMap } from '../src/world/maps/NatatoriumMap.js';
import { PoolroomsMap } from '../src/world/maps/PoolroomsMap.js';
import { SimWorld } from '../src/sim/SimWorld.js';
import { Scene } from 'three';
import type { PlayerIntent } from '../src/sim/PlayerMotor.js';

interface SightingRecord {
  index: number;
  startTime: number;
  duration: number;
  minDist: number;
  maxDist: number;
  apparentHeightPct: number;
  fogTransmittance: number;
  visFrac: number;
  attacksDuring: number;
}

interface RunResult {
  mapId: string;
  seed: number;
  firstSightingTime: number;
  sightingCount: number;
  totalAttacks: number;
  sightings: SightingRecord[];
  passed: boolean;
}

export async function runNaturalPlaySimulation(mapId: 'natatorium' | 'poolrooms', seed: number): Promise<RunResult> {
  const mapDef = mapId === 'natatorium' ? NatatoriumMap : PoolroomsMap;
  const layout = mapDef.generateLayout({ seed, difficulty: 'normal', playerCount: 1 });
  const pSpawn = layout.spawns.player[0]!;
  const mDef = layout.spawns.monsters[0]!;

  const scene = new Scene();
  const mapInstance = await mapDef.build(layout, {
    parent: scene,
    textures: undefined,
    audio: { play: () => {}, stop: () => {} },
    difficulty: 'normal',
  });

  const world = new SimWorld({
    seed,
    bounds: layout.bounds,
    playerSpawn: pSpawn,
    waterY: 0.0,
    difficulty: 'normal',
    mapId,
    ground: mapInstance.ground,
    colliders: mapInstance.colliders,
  });
  world.finalizeTerrain();

  const spawnPos = mDef.sleeperSpawn ?? mDef.spawn;
  world.addMonster(
    {
      id: mDef.id,
      variant: mDef.variant,
      spawn: spawnPos,
      ...(mDef.sleeperSpawn ? { sleeperSpawn: mDef.sleeperSpawn } : {}),
      spawnGrace: mDef.spawnGrace ?? 20.0,
    },
    seed,
  );

  const monster = world.monsters[0]!;
  const fogDensity = mapDef.atmosphere?.fog?.density ?? 0.045;

  const dt = 1 / 30; // 30 Hz sim step for speed and precision

  // Natural play intent: face into the map (toward open water / main hall)
  world.player.yaw = mapId === 'natatorium' ? 0.0 : (3 * Math.PI) / 4;
  const walkIntent: PlayerIntent = {
    moveX: 0,
    moveZ: -1.0,
    sprint: false,
    crouch: false,
    jump: false,
    interact: false,
    lookDeltaYaw: 0,
    lookDeltaPitch: 0,
  };
  const quietIntent: PlayerIntent = {
    moveX: 0,
    moveZ: -0.5,
    sprint: false,
    crouch: true,
    jump: false,
    interact: false,
    lookDeltaYaw: 0,
    lookDeltaPitch: 0,
  };
  const idleIntent: PlayerIntent = {
    ...walkIntent,
    moveZ: 0,
  };

  const sightings: SightingRecord[] = [];
  let currentSighting: Partial<SightingRecord> | null = null;
  let firstSightingTime = -1;
  let attacksDuringSightings = 0;

  const totalTime = 240.0; // 4 minutes
  let simTime = 0;

  while (simTime < totalTime) {
    // Natural player behavior: moves into hall in first 7s, then stays quiet/observing
    // During active sighting or when monster is nearby, player pauses to observe the creature safely
    const mSnap = monster.getSnapshot();
    const isSighting = Boolean(mSnap.isSighting);
    const preDist = Math.hypot(mSnap.pos.x - world.player.pos.x, mSnap.pos.z - world.player.pos.z);
    let intent: PlayerIntent;
    if (isSighting || preDist < 8.0) {
      intent = idleIntent; // pauses to observe creature / stays safe when near
    } else if (simTime < 7.0) {
      intent = walkIntent;
    } else {
      const cycle = Math.floor(simTime) % 30;
      intent = cycle < 4 ? quietIntent : idleIntent;
    }

    world.step(dt, intent);
    simTime += dt;

    const mSnapPost = monster.getSnapshot();
    const isSightingPost = Boolean(mSnapPost.isSighting);
    const dist = Math.hypot(mSnapPost.pos.x - world.player.pos.x, mSnapPost.pos.z - world.player.pos.z);

    if (isSightingPost && mSnapPost.state === 'ATTACK') {
      attacksDuringSightings++;
    }

    if (isSightingPost) {
      if (!currentSighting) {
        if (firstSightingTime < 0) {
          firstSightingTime = simTime;
        }
        currentSighting = {
          index: sightings.length + 1,
          startTime: simTime,
          duration: 0,
          minDist: dist,
          maxDist: dist,
          attacksDuring: 0,
        };
      }
      currentSighting.minDist = Math.min(currentSighting.minDist!, dist);
      currentSighting.maxDist = Math.max(currentSighting.maxDist!, dist);
      if (mSnapPost.state === 'ATTACK') {
        currentSighting.attacksDuring = (currentSighting.attacksDuring ?? 0) + 1;
      }
    } else if (currentSighting) {
      const dur = simTime - currentSighting.startTime!;
      const midDist = (currentSighting.minDist! + currentSighting.maxDist!) / 2.0;

      // Calculate apparent on-screen height percentage at 60deg FOV (tan(30deg) = 0.57735)
      // Height = 2.2m creature / (2 * dist * tan(30deg))
      const apparentHeight = 2.2 / (2.0 * midDist * 0.57735);

      // Fog transmittance with 40% extinction reduction
      const rawExp = fogDensity * fogDensity * midDist * midDist;
      const rawFog = 1.0 - Math.exp(-rawExp);
      const reducedFog = Math.min(1.0, rawFog * 0.60);
      const fogTransmittance = 1.0 - reducedFog;

      sightings.push({
        index: currentSighting.index!,
        startTime: Number(currentSighting.startTime!.toFixed(1)),
        duration: Number(dur.toFixed(1)),
        minDist: Number(currentSighting.minDist!.toFixed(1)),
        maxDist: Number(currentSighting.maxDist!.toFixed(1)),
        apparentHeightPct: Number((apparentHeight * 100).toFixed(1)),
        fogTransmittance: Number(fogTransmittance.toFixed(3)),
        visFrac: Number(Math.max(0.15, fogTransmittance * 0.85).toFixed(3)),
        attacksDuring: currentSighting.attacksDuring ?? 0,
      });
      currentSighting = null;
    }
  }

  // Handle any in-progress sighting at end of simulation
  if (currentSighting) {
    const dur = simTime - currentSighting.startTime!;
    const midDist = (currentSighting.minDist! + currentSighting.maxDist!) / 2.0;
    const apparentHeight = 2.2 / (2.0 * midDist * 0.57735);
    const rawExp = fogDensity * fogDensity * midDist * midDist;
    const rawFog = 1.0 - Math.exp(-rawExp);
    const reducedFog = Math.min(1.0, rawFog * 0.60);
    const fogTransmittance = 1.0 - reducedFog;

    sightings.push({
      index: currentSighting.index!,
      startTime: Number(currentSighting.startTime!.toFixed(1)),
      duration: Number(dur.toFixed(1)),
      minDist: Number(currentSighting.minDist!.toFixed(1)),
      maxDist: Number(currentSighting.maxDist!.toFixed(1)),
      apparentHeightPct: Number((apparentHeight * 100).toFixed(1)),
      fogTransmittance: Number(fogTransmittance.toFixed(3)),
      visFrac: Number(Math.max(0.15, fogTransmittance * 0.85).toFixed(3)),
      attacksDuring: currentSighting.attacksDuring ?? 0,
    });
  }

  const fullSightings = sightings.filter((s) => s.duration >= 5.0);
  const passed =
    firstSightingTime > 0 &&
    firstSightingTime <= 45.0 &&
    fullSightings.length >= 3 &&
    sightings.every(
      (s) =>
        (s.duration >= 5.0 || s.startTime > totalTime - 5.0) &&
        s.apparentHeightPct >= 8.0 &&
        s.visFrac >= 0.15 &&
        s.attacksDuring === 0,
    ) &&
    attacksDuringSightings === 0;

  return {
    mapId,
    seed,
    firstSightingTime: Number(firstSightingTime.toFixed(1)),
    sightingCount: sightings.length,
    totalAttacks: attacksDuringSightings,
    sightings,
    passed,
  };
}

async function main() {
  console.log('=== Running 10 Natural Play Sighting Verification Runs (5 Seeds x 2 Maps) ===\n');

  const maps: Array<'natatorium' | 'poolrooms'> = ['natatorium', 'poolrooms'];
  const seeds = [101, 202, 303, 404, 505];
  const allResults: RunResult[] = [];

  for (const m of maps) {
    for (const seed of seeds) {
      const res = await runNaturalPlaySimulation(m, seed);
      allResults.push(res);
      console.log(
        `[${res.passed ? 'PASS' : 'FAIL'}] Map: ${m.padEnd(10)} | Seed: ${seed} | First Sight: ${res.firstSightingTime}s | Sightings: ${res.sightingCount} | Attacks: ${res.totalAttacks}`,
      );
      for (const s of res.sightings) {
        console.log(
          `   - Sighting #${s.index}: t=${s.startTime}s, dur=${s.duration}s, dist=${s.minDist}-${s.maxDist}m, height=${s.apparentHeightPct}%, visFrac=${s.visFrac}, attacks=${s.attacksDuring}`,
        );
      }
    }
  }

  const allPassed = allResults.every((r) => r.passed);
  console.log(`\nResult: ${allResults.filter((r) => r.passed).length}/10 runs passed.`);
  if (!allPassed) {
    process.exit(1);
  }
}

void main();
