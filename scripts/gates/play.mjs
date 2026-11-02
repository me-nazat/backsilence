#!/usr/bin/env node
/* ── scripts/gates/play.mjs ─────────────────────────────────────────────────
 *  Prompt 2 Item 10: 5-minute automated play-through gate on `natatorium`.
 *  Asserts:
 *    1. First sighting occurs at 10–15 m within 15–20 s.
 *    2. Second sighting occurs within 60 s.
 *    3. The exit is reachable from player spawn.
 *    4. The monster never path-crosses a <= 2.4 m trench.
 *    5. `simHash` is identical across two deterministic runs.
 *    6. `p95` frame/step time is within budget (<= 16.6 ms).
 *    7. Zero console errors are emitted.
 * ──────────────────────────────────────────────────────────────────────── */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';

const ROOT = process.cwd();

if (!process.env.BACKSILENCE_VITE_NODE) {
  const viteNodeBin = resolve(ROOT, 'node_modules/.bin/vite-node');
  const res = spawnSync(viteNodeBin, [resolve(ROOT, 'scripts/gates/play.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, BACKSILENCE_VITE_NODE: '1' },
  });
  process.exit(res.status ?? 1);
}

const consoleErrors = [];
const origConsoleError = console.error.bind(console);
console.error = (...args) => {
  consoleErrors.push(args.map((a) => String(a)).join(' '));
  origConsoleError(...args);
};

const { SimWorld } = await import('../../src/sim/SimWorld.ts');
const { getMapDefinition } = await import('../../src/world/MapRegistry.ts');
const { mulberry32 } = await import('../../src/procedural/core/prng.ts');
const { fnv1a } = await import('../../src/meta/SimReplayRunner.ts');

const SEED = 424242;
const TOTAL_TICKS = 18000; // 5 minutes at 60 Hz
const DT = 1 / 60;
const FRAME_BUDGET_MS = 16.6;

function buildNatatoriumWorld(seed) {
  return getMapDefinition('natatorium').then((mapDef) => {
    const layout = mapDef.generateLayout({
      seed,
      difficulty: 'normal',
      playerCount: 1,
    });
    const waterY = layout.waterBodies[0]?.waterY ?? 0;
    const floorY = layout.waterBodies[0]?.floorY ?? -0.75;
    const world = new SimWorld({
      seed,
      bounds: layout.bounds,
      playerSpawn: layout.spawns.player[0] ?? { x: 0, y: 0.38, z: 50 },
      waterY,
      difficulty: 'normal',
    });
    world.director.setMapId('natatorium');
    world.ground.fill(floorY);

    for (const plat of layout.platforms) {
      world.ground.rasterizePlatform(plat.rect[0], plat.rect[1], plat.rect[2], plat.rect[3], plat.topY);
      world.ground.markObstacleRect(plat.rect[0], plat.rect[1], plat.rect[2], plat.rect[3], 'platform');
    }
    for (const wall of layout.walls) {
      if ((wall.min.y ?? -1) <= 1.2) {
        world.ground.markObstacleRect(wall.min.x, wall.min.z, wall.max.x, wall.max.z, 'wall');
      }
    }
    for (const pillar of layout.pillars) {
      world.ground.markObstacleCircle(pillar.x, pillar.z, pillar.radius, 'wall');
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

    return { world, layout };
  });
}

function checkExitReachable(layout, ground) {
  const start = layout.spawns.player[0] ?? { x: 0, y: 0.38, z: 50 };
  const exit = layout.spawns.exit ?? { x: 0, y: 0.38, z: -58 };
  const step = 1.0;
  const minX = Math.floor(layout.bounds.minX);
  const maxX = Math.ceil(layout.bounds.maxX);
  const minZ = Math.floor(layout.bounds.minZ);
  const maxZ = Math.ceil(layout.bounds.maxZ);
  const width = Math.floor((maxX - minX) / step) + 1;
  const depth = Math.floor((maxZ - minZ) / step) + 1;

  const toIdx = (wx, wz) => {
    const gx = Math.round((wx - minX) / step);
    const gz = Math.round((wz - minZ) / step);
    if (gx < 0 || gx >= width || gz < 0 || gz >= depth) return -1;
    return gz * width + gx;
  };

  const startIdx = toIdx(start.x, start.z);
  const exitIdx = toIdx(exit.x, exit.z);
  if (startIdx < 0 || exitIdx < 0) return false;

  const visited = new Uint8Array(width * depth);
  const queue = [startIdx];
  visited[startIdx] = 1;
  let head = 0;

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (head < queue.length) {
    const curr = queue[head++];
    if (curr === exitIdx) return true;
    const cz = Math.floor(curr / width);
    const cx = curr % width;

    for (const [dx, dz] of dirs) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nx >= width || nz < 0 || nz >= depth) continue;
      const nIdx = nz * width + nx;
      if (visited[nIdx]) continue;
      const wx = minX + nx * step;
      const wz = minZ + nz * step;
      if (ground.distToClass(wx, wz, 'wall') <= 0.25) continue;
      visited[nIdx] = 1;
      queue.push(nIdx);
    }
  }
  return false;
}

async function runFiveMinutePlaythrough(seed) {
  const { world, layout } = await buildNatatoriumWorld(seed);
  const prng = mulberry32(seed ^ 0x5a5a5a5a);

  let firstSightingTime = null;
  let firstSightingDist = null;
  let secondSightingTime = null;
  let trenchViolations = 0;
  const stepTimesMs = [];
  const checkpoints = [];

  // Narrow water trench safe-zone in Natatorium: x in [-1.05, 0.0], z in [-35.0, -27.0] (width 1.05m <= 2.4m)
  const trenchRect = { minX: -1.05, maxX: 0.0, minZ: -35.0, maxZ: -27.0 };

  for (let tick = 1; tick <= TOTAL_TICKS; tick++) {
    // Player stays calm/observant on spawn platform during first 60s to observe scheduled sightings cleanly,
    // then navigates across the hall for the remainder of the 5-minute run.
    const simTimeSec = tick * DT;
    const intent = simTimeSec <= 60.0
      ? {
          moveX: 0,
          moveZ: 0,
          sprint: false,
          crouch: false,
          jump: false,
          interact: false,
          lookDeltaYaw: 0,
          lookDeltaPitch: 0,
        }
      : {
          moveX: (prng() * 2 - 1) * 0.5,
          moveZ: -0.6,
          sprint: prng() > 0.85,
          crouch: prng() > 0.5,
          jump: false,
          interact: false,
          lookDeltaYaw: (prng() * 2 - 1) * 0.03,
          lookDeltaPitch: 0,
        };

    const prevSightings = world.director.sightings;
    const t0 = performance.now();
    world.step(DT, intent);
    const t1 = performance.now();
    stepTimesMs.push(t1 - t0);

    const m = world.monsters[0];
    if (m) {
      if (world.director.sightings > prevSightings) {
        const dist = Math.hypot(m.pos.x - world.player.pos.x, m.pos.z - world.player.pos.z);
        if (firstSightingTime === null) {
          firstSightingTime = simTimeSec;
          firstSightingDist = dist;
        } else if (secondSightingTime === null) {
          secondSightingTime = simTimeSec;
        }
      }

      // Check monster never enters the <= 2.4m trench or any unwalkable trench cell
      const inTrench =
        m.pos.x >= trenchRect.minX &&
        m.pos.x <= trenchRect.maxX &&
        m.pos.z >= trenchRect.minZ &&
        m.pos.z <= trenchRect.maxZ;
      if (inTrench) {
        trenchViolations++;
      }
    }

    if (tick % 600 === 0 || tick === TOTAL_TICKS) {
      const p = world.player.pos;
      const monsterParts = world.monsters
        .map((mon) => `${mon.id}:${mon.pos.x.toFixed(3)},${mon.pos.z.toFixed(3)}:${mon.state}`)
        .join('|');
      const hashStr = `${tick}:${p.x.toFixed(3)}:${p.y.toFixed(3)}:${p.z.toFixed(3)}:${world.player.stamina.toFixed(3)}:${monsterParts}`;
      checkpoints.push({ tick, hash: fnv1a(hashStr) });
    }
  }

  // Also verify NavGrid marks the <= 2.4 m trench interior as unwalkable
  const trenchMidWalkable = world.nav.isWalkableWorld(-0.525, -31.0);
  if (trenchMidWalkable) {
    trenchViolations++;
  }

  const exitReachable = checkExitReachable(layout, world.ground);
  const sortedSteps = [...stepTimesMs].sort((a, b) => a - b);
  const p95FrameTimeMs = sortedSteps[Math.floor(sortedSteps.length * 0.95)] ?? 0;

  const finalPos = {
    x: Number(world.player.pos.x.toFixed(3)),
    y: Number(world.player.pos.y.toFixed(3)),
    z: Number(world.player.pos.z.toFixed(3)),
  };
  const finalSimHash = fnv1a(
    `natatorium:${seed}:${TOTAL_TICKS}:${finalPos.x}:${finalPos.y}:${finalPos.z}:${checkpoints[checkpoints.length - 1]?.hash}`,
  );

  return {
    firstSightingTime: firstSightingTime !== null ? Number(firstSightingTime.toFixed(3)) : null,
    firstSightingDist: firstSightingDist !== null ? Number(firstSightingDist.toFixed(3)) : null,
    secondSightingTime: secondSightingTime !== null ? Number(secondSightingTime.toFixed(3)) : null,
    exitReachable,
    trenchViolations,
    p95FrameTimeMs: Number(p95FrameTimeMs.toFixed(4)),
    finalSimHash,
    checkpointsCount: checkpoints.length,
  };
}

const run1 = await runFiveMinutePlaythrough(SEED);
const run2 = await runFiveMinutePlaythrough(SEED);

const checks = [
  {
    id: 'first_sighting_time_15_20s',
    passed: run1.firstSightingTime !== null && run1.firstSightingTime >= 15.0 && run1.firstSightingTime <= 20.0,
    actual: run1.firstSightingTime,
    expected: '15.0..20.0 s',
  },
  {
    id: 'first_sighting_dist_10_15m',
    passed: run1.firstSightingDist !== null && run1.firstSightingDist >= 10.0 && run1.firstSightingDist <= 15.0,
    actual: run1.firstSightingDist,
    expected: '10.0..15.0 m',
  },
  {
    id: 'second_sighting_within_60s',
    passed: run1.secondSightingTime !== null && run1.secondSightingTime <= 60.0,
    actual: run1.secondSightingTime,
    expected: '<= 60.0 s',
  },
  {
    id: 'exit_reachable',
    passed: run1.exitReachable === true,
    actual: run1.exitReachable,
    expected: true,
  },
  {
    id: 'trench_2_4m_never_crossed',
    passed: run1.trenchViolations === 0,
    actual: run1.trenchViolations,
    expected: 0,
  },
  {
    id: 'sim_hash_deterministic',
    passed: Boolean(run1.finalSimHash && run1.finalSimHash === run2.finalSimHash),
    actual: `${run1.finalSimHash} === ${run2.finalSimHash}`,
    expected: 'identical simHash across 2 runs',
  },
  {
    id: 'p95_frame_time_budget',
    passed: run1.p95FrameTimeMs <= FRAME_BUDGET_MS,
    actual: `${run1.p95FrameTimeMs} ms`,
    expected: `<= ${FRAME_BUDGET_MS} ms`,
  },
  {
    id: 'zero_console_errors',
    passed: consoleErrors.length === 0,
    actual: consoleErrors.length,
    expected: 0,
  },
];

const allPassed = checks.every((c) => c.passed);
const report = {
  mapId: 'natatorium',
  seed: SEED,
  totalTicks: TOTAL_TICKS,
  durationSeconds: TOTAL_TICKS * DT,
  status: allPassed ? 'PASS' : 'FAIL',
  run1,
  run2SimHash: run2.finalSimHash,
  consoleErrors,
  checks,
};

const outDir = resolve(ROOT, 'reports/release');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'play_gate.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`[gates:play] Natatorium 5-minute playthrough (${TOTAL_TICKS} ticks): ${report.status}`);
for (const c of checks) {
  console.log(`  [${c.passed ? 'PASS' : 'FAIL'}] ${c.id}: actual=${c.actual} (expected ${c.expected})`);
}

if (!allPassed) {
  process.exit(1);
}
