/* ── PuzzleSolver.ts ────────────────────────────────────────────────────────
 *  Headless automated puzzle solver for BackSilence.
 *  Uses the pure PuzzleSystem and PuzzleNode state machine API to solve every
 *  map's multi-stage puzzle in Node / Vitest and assert winnability.
 * ──────────────────────────────────────────────────────────────────────── */

import type { MapId } from '../../types/contracts.js';
import type { LayoutData } from '../MapTypes.js';
import type { PuzzleCtx } from '../../sim/puzzle/PuzzleTypes.js';
import { PuzzleSystem } from '../../sim/puzzle/PuzzleSystem.js';
import { SequenceKeypadNode } from '../../sim/puzzle/SequenceKeypadNode.js';
import { ValveSequenceNode } from '../../sim/puzzle/ValveSequenceNode.js';
import { ResonanceSequenceNode } from '../../sim/puzzle/ResonanceSequenceNode.js';
import { FuseCoresNode } from '../../sim/puzzle/FuseCoresNode.js';
import { GeneratorGridNode } from '../../sim/puzzle/GeneratorGridNode.js';

export interface SolveResult {
  mapId: MapId;
  solved: boolean;
  steps: string[];
  finalState: unknown;
}

function createDummyCtx(now = 0, playerCount = 1): PuzzleCtx {
  return {
    now,
    rng: () => 0.5,
    playerCount,
    emitNoise: () => {},
    emitWorldEvent: () => {},
  };
}

/**
 * Headlessly solves the puzzle for a given layout using pure sim mechanics.
 */
export function solveLayoutPuzzleHeadless(mapId: MapId, layout: LayoutData): SolveResult {
  const steps: string[] = [];
  const system = new PuzzleSystem();

  switch (mapId) {
    case 'poolrooms': {
      // 1. SequenceKeypad
      const codeStr = (layout.meta['code'] as string) ?? '1234';
      const codeDigits = codeStr.split('').map(Number);
      const keypad = new SequenceKeypadNode('keypad_exit', codeDigits, { x: 0, y: 0.3, z: 0 });
      system.registerNode(keypad);

      steps.push(`Discovered 4-digit code: ${codeStr}`);

      for (let i = 0; i < codeDigits.length; i++) {
        const digit = codeDigits[i]!;
        system.dispatch(
          {
            puzzleId: 'keypad_exit',
            op: 'set',
            value: digit,
            actor: 'player_local',
            t: i * 0.5,
          },
          createDummyCtx(i * 0.5),
        );
        steps.push(`Entered keypad digit: ${digit}`);
      }

      return {
        mapId,
        solved: system.isSolved('keypad_exit'),
        steps,
        finalState: keypad.serialize(),
      };
    }

    case 'utility_tunnels': {
      // 2. ValveSequence
      const order = (layout.meta['valveOrder'] as string[]) ?? ['A', 'B', 'C'];
      const valves = new ValveSequenceNode(
        'valve_puzzle',
        order,
        { x: 44, y: 0.45, z: 0 },
        {
          A: { x: -30, y: 0.45, z: 16 },
          B: { x: -5, y: 0.45, z: 16 },
          C: { x: 22, y: 0.45, z: 16 },
        },
      );
      system.registerNode(valves);

      steps.push(`Read pipe diagram panel: order is ${order.join(' -> ')}`);

      let simTime = 0;
      for (const v of order) {
        // Complete 4s hold
        system.dispatch(
          {
            puzzleId: 'valve_puzzle',
            op: 'progress',
            value: { valve: v, dt: 4.1 },
            actor: 'player_local',
            t: simTime,
          },
          createDummyCtx(simTime),
        );
        steps.push(`Turned valve ${v} for 4.1s (complete)`);
        simTime += 5;
      }

      // Turn main gate for 5s
      system.dispatch(
        {
          puzzleId: 'valve_puzzle',
          op: 'progress',
          value: { valve: 'gate', dt: 5.1 },
          actor: 'player_local',
          t: simTime,
        },
        createDummyCtx(simTime),
      );
      steps.push('Turned main gate wheel for 5.1s (hatch open)');

      return {
        mapId,
        solved: system.isSolved('valve_puzzle'),
        steps,
        finalState: valves.serialize(),
      };
    }

    case 'marble_atrium': {
      // 3. ResonanceSequence
      const melody = (layout.meta['melody'] as number[]) ?? [0, 2, 1, 3];
      const resonance = new ResonanceSequenceNode(
        'melody_puzzle',
        melody,
        { x: 15.5, y: 0.3, z: 0 },
        [
          { x: -5, y: 1.7, z: 9 },
          { x: 5, y: 1.7, z: -9 },
          { x: -14, y: 1.7, z: 0 },
          { x: 0, y: 4.4, z: 17.5 },
        ],
      );
      system.registerNode(resonance);

      steps.push(`Listened to console melody: [${melody.join(', ')}]`);

      let simTime = 0;
      for (let i = 0; i < melody.length; i++) {
        const note = melody[i]!;
        system.dispatch(
          {
            puzzleId: 'melody_puzzle',
            op: 'progress',
            value: { noteIndex: note },
            actor: 'player_local',
            t: simTime,
          },
          createDummyCtx(simTime),
        );
        steps.push(`Rang bell with note index ${note}`);
        simTime += 2;
      }

      return {
        mapId,
        solved: system.isSolved('melody_puzzle'),
        steps,
        finalState: resonance.serialize(),
      };
    }

    case 'hydro_maze': {
      // 4. FuseCores
      const cores = new FuseCoresNode(
        'fuse_puzzle',
        { x: 0, y: 0.9, z: 0 },
        { x: 35.5, y: 0.9, z: 0 },
        {
          core_1: { x: 28, y: 1.4, z: -28 },
          core_2: { x: -28, y: 1.4, z: 28 },
          core_3: { x: 28, y: 1.4, z: 20 },
        },
      );
      system.registerNode(cores);

      steps.push('Navigated filtration maze and collected 3 fuse cores');

      let simTime = 0;
      for (let i = 1; i <= 3; i++) {
        const coreId = `core_${i}`;
        system.dispatch(
          {
            puzzleId: 'fuse_puzzle',
            op: 'progress',
            value: { action: 'pickup', coreId },
            actor: 'player_local',
            t: simTime,
          },
          createDummyCtx(simTime),
        );
        steps.push(`Picked up fuse core ${coreId}`);

        system.dispatch(
          {
            puzzleId: 'fuse_puzzle',
            op: 'progress',
            value: { action: 'insert', coreId },
            actor: 'player_local',
            t: simTime + 5,
          },
          createDummyCtx(simTime + 5),
        );
        steps.push(`Inserted fuse core ${coreId} into bay socket`);
        simTime += 10;
      }

      return {
        mapId,
        solved: system.isSolved('fuse_puzzle'),
        steps,
        finalState: cores.serialize(),
      };
    }

    case 'drainage_core': {
      // 5. GeneratorGrid
      const playerCount = (layout.meta['playerCount'] as number) ?? 1;
      const genGrid = new GeneratorGridNode(
        'gen_puzzle',
        { x: 0, y: 0.3, z: -21 },
        [
          { id: 'gen_1', pos: { x: -48, y: 0.3, z: 48 } },
          { id: 'gen_2', pos: { x: 48, y: 0.3, z: 48 } },
          { id: 'gen_3', pos: { x: 48, y: 0.3, z: -48 } },
        ],
      );
      system.registerNode(genGrid);

      steps.push(`Starting 3 abyssal generators (solo runtime ${playerCount <= 1 ? 90 : 65}s)`);

      const genIds = ['gen_1', 'gen_2', 'gen_3'];
      let simTime = 0;

      for (const gid of genIds) {
        // Prime for 6.1s
        system.dispatch(
          {
            puzzleId: 'gen_puzzle',
            op: 'progress',
            value: { genId: gid, action: 'prime', dt: 6.1 },
            actor: 'player_local',
            t: simTime,
          },
          createDummyCtx(simTime, playerCount),
        );
        steps.push(`Primed ${gid} for 6.1s`);

        // 3 successful pull starts
        for (let p = 0; p < 3; p++) {
          system.dispatch(
            {
              puzzleId: 'gen_puzzle',
              op: 'progress',
              value: { genId: gid, action: 'pull' },
              actor: 'player_local',
              t: simTime + 0.1 * p,
            },
            createDummyCtx(simTime + 0.1 * p, playerCount),
          );
        }
        steps.push(`Pull-started ${gid} (running)`);
        simTime += 5;
      }

      // Tick 5.1s while all 3 are running to trigger simultaneous running win condition
      system.tick(5.1, createDummyCtx(simTime + 5.1, playerCount));
      steps.push('All 3 generators ran concurrently for 5.1s -> blast doors unlocked');

      return {
        mapId,
        solved: system.isSolved('gen_puzzle'),
        steps,
        finalState: genGrid.serialize(),
      };
    }
  }
}
