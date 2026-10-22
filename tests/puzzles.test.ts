/* ── puzzles.test.ts ────────────────────────────────────────────────────────
 *  Unit tests for all 5 BackSilence puzzle state machines:
 *  - SequenceKeypadNode (correct, wrong, lockout timing)
 *  - ValveSequenceNode (order, early release reset, surge reset, gate)
 *  - ResonanceSequenceNode (progress, wrong ring reset, solve)
 *  - FuseCoresNode (carry, insert, serialize)
 *  - GeneratorGridNode (priming, pull-start mistiming, runtimes, 5s simultaneous rule)
 *  - Headless solveLayoutPuzzleHeadless across all 5 generated map layouts
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import type { PuzzleCtx } from '../src/sim/puzzle/PuzzleTypes.js';
import { SequenceKeypadNode } from '../src/sim/puzzle/SequenceKeypadNode.js';
import { ValveSequenceNode } from '../src/sim/puzzle/ValveSequenceNode.js';
import { ResonanceSequenceNode } from '../src/sim/puzzle/ResonanceSequenceNode.js';
import { FuseCoresNode } from '../src/sim/puzzle/FuseCoresNode.js';
import { GeneratorGridNode } from '../src/sim/puzzle/GeneratorGridNode.js';
import { solveLayoutPuzzleHeadless, type SolveResult } from '../src/world/validate/PuzzleSolver.js';
import { PoolroomsMap } from '../src/world/maps/PoolroomsMap.js';
import { UtilityTunnelsMap } from '../src/world/maps/UtilityTunnelsMap.js';
import { MarbleAtriumMap } from '../src/world/maps/MarbleAtriumMap.js';
import { HydroMazeMap } from '../src/world/maps/HydroMazeMap.js';
import { DrainageCoreMap } from '../src/world/maps/DrainageCoreMap.js';
import { NatatoriumMap } from '../src/world/maps/NatatoriumMap.js';
import { DrownedSchoolMap } from '../src/world/maps/DrownedSchoolMap.js';
import { SunkenJungleMap } from '../src/world/maps/SunkenJungleMap.js';
import { NeonFloodMap } from '../src/world/maps/NeonFloodMap.js';
import { DrownedMetroMap } from '../src/world/maps/DrownedMetroMap.js';
import { generateValidLayout } from '../src/world/validate/LayoutValidator.js';

function makeCtx(now = 0, playerCount = 1): PuzzleCtx {
  return {
    now,
    rng: () => 0.5,
    playerCount,
    emitNoise: () => {},
    emitWorldEvent: () => {},
  };
}

describe('Puzzle Nodes: State Machine & Solvability', () => {
  describe('SequenceKeypadNode (Map 1)', () => {
    it('solves on entering correct 4-digit code', () => {
      const node = new SequenceKeypadNode('keypad_1', [4, 2, 7, 9], { x: 0, y: 0, z: 0 });
      const ctx = makeCtx();

      expect(node.solved).toBe(false);

      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 4, actor: 'p1', t: 0 }, ctx);
      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 2, actor: 'p1', t: 0.5 }, ctx);
      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 7, actor: 'p1', t: 1.0 }, ctx);
      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 9, actor: 'p1', t: 1.5 }, ctx);

      expect(node.solved).toBe(true);
      expect(node.doorOpen).toBe(true);
    });

    it('locks out for 20s after 3 wrong attempts', () => {
      let noiseEmitted = false;
      const ctx: PuzzleCtx = {
        now: 0,
        rng: () => 0.5,
        playerCount: 1,
        emitNoise: () => {
          noiseEmitted = true;
        },
        emitWorldEvent: () => {},
      };

      const node = new SequenceKeypadNode('keypad_1', [1, 2, 3, 4], { x: 0, y: 0, z: 0 });

      // Wrong attempt 1
      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 9, actor: 'p1', t: 0 }, ctx);
      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 9, actor: 'p1', t: 0 }, ctx);
      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 9, actor: 'p1', t: 0 }, ctx);
      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 9, actor: 'p1', t: 0 }, ctx);
      expect(node.solved).toBe(false);
      expect(node.attempts).toBe(1);
      expect(noiseEmitted).toBe(true);

      // Wrong attempt 2
      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 9, actor: 'p1', t: 0 }, ctx);
      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 9, actor: 'p1', t: 0 }, ctx);
      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 9, actor: 'p1', t: 0 }, ctx);
      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 9, actor: 'p1', t: 0 }, ctx);
      expect(node.attempts).toBe(2);

      // Wrong attempt 3 -> triggers 20s lockout
      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 9, actor: 'p1', t: 0 }, ctx);
      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 9, actor: 'p1', t: 0 }, ctx);
      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 9, actor: 'p1', t: 0 }, ctx);
      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 9, actor: 'p1', t: 0 }, ctx);
      expect(node.attempts).toBe(3);
      expect(node.lockedOut).toBe(true);
      expect(node.lockTimer).toBeCloseTo(20.0, 1);

      // During lockout, even correct digits are rejected
      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 1, actor: 'p1', t: 0 }, ctx);
      expect(node.currentInput).toHaveLength(0);

      // Advance time by 20.1s
      node.tick(20.1, ctx);
      expect(node.lockedOut).toBe(false);
      expect(node.attempts).toBe(0);

      // Now inputs work again
      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 1, actor: 'p1', t: 21 }, ctx);
      expect(node.currentInput).toHaveLength(1);
    });

    it('serializes and hydrates losslessly', () => {
      const node = new SequenceKeypadNode('keypad_1', [7, 3, 1, 9], { x: 5, y: 1, z: 2 });
      const ctx = makeCtx();
      node.apply({ puzzleId: 'keypad_1', op: 'set', value: 7, actor: 'p1', t: 0 }, ctx);

      const serialized = node.serialize();
      const node2 = new SequenceKeypadNode('keypad_1', [7, 3, 1, 9], { x: 5, y: 1, z: 2 });
      node2.hydrate(serialized);

      expect(node2.currentInput).toEqual([7]);
      expect(node2.solved).toBe(false);
    });
  });

  describe('ValveSequenceNode (Map 2)', () => {
    it('turns valves in order, unlocks gate, and handles surge on wrong valve', () => {
      const node = new ValveSequenceNode(
        'valves',
        ['C', 'A', 'B'],
        { x: 0, y: 0, z: 0 },
        { A: { x: 1, y: 0, z: 0 }, B: { x: 2, y: 0, z: 0 }, C: { x: 3, y: 0, z: 0 } },
      );
      const ctx = makeCtx();

      // Early release on C (< 4s) resets
      node.apply({ puzzleId: 'valves', op: 'progress', value: { valve: 'C', dt: 2.0 }, actor: 'p1', t: 0 }, ctx);
      expect(node.valveProgress['C']).toBe(2.0);
      node.apply({ puzzleId: 'valves', op: 'reset', value: { valve: 'C' }, actor: 'p1', t: 0 }, ctx);
      expect(node.valveProgress['C']).toBe(0);

      // Complete C (4.1s)
      node.apply({ puzzleId: 'valves', op: 'progress', value: { valve: 'C', dt: 4.1 }, actor: 'p1', t: 0 }, ctx);
      expect(node.valvesCompleted).toEqual(['C']);

      // Wrong valve next: turn B instead of A -> SURGE reset!
      node.apply({ puzzleId: 'valves', op: 'progress', value: { valve: 'B', dt: 4.1 }, actor: 'p1', t: 1 }, ctx);
      expect(node.valvesCompleted).toHaveLength(0); // reset!

      // Now complete in proper sequence: C -> A -> B
      node.apply({ puzzleId: 'valves', op: 'progress', value: { valve: 'C', dt: 4.1 }, actor: 'p1', t: 2 }, ctx);
      node.apply({ puzzleId: 'valves', op: 'progress', value: { valve: 'A', dt: 4.1 }, actor: 'p1', t: 3 }, ctx);
      node.apply({ puzzleId: 'valves', op: 'progress', value: { valve: 'B', dt: 4.1 }, actor: 'p1', t: 4 }, ctx);
      expect(node.valvesCompleted).toEqual(['C', 'A', 'B']);
      expect(node.gateUnlocked).toBe(true);

      // Turn hatch wheel 5s
      node.apply({ puzzleId: 'valves', op: 'progress', value: { valve: 'gate', dt: 5.1 }, actor: 'p1', t: 5 }, ctx);
      expect(node.gateOpen).toBe(true);
      expect(node.solved).toBe(true);
    });
  });

  describe('ResonanceSequenceNode (Map 3)', () => {
    it('rings bells in melody order, resets on wrong note', () => {
      const node = new ResonanceSequenceNode('bells', [2, 0, 3, 1], { x: 0, y: 0, z: 0 });
      const ctx = makeCtx();

      // Ring note 2
      node.apply({ puzzleId: 'bells', op: 'progress', value: 2, actor: 'p1', t: 0 }, ctx);
      expect(node.currentIndex).toBe(1);

      // Ring wrong note: 1 instead of 0
      node.apply({ puzzleId: 'bells', op: 'progress', value: 1, actor: 'p1', t: 1 }, ctx);
      expect(node.currentIndex).toBe(0); // reset!

      // Ring full sequence: 2 -> 0 -> 3 -> 1
      node.apply({ puzzleId: 'bells', op: 'progress', value: 2, actor: 'p1', t: 2 }, ctx);
      node.apply({ puzzleId: 'bells', op: 'progress', value: 0, actor: 'p1', t: 3 }, ctx);
      node.apply({ puzzleId: 'bells', op: 'progress', value: 3, actor: 'p1', t: 4 }, ctx);
      node.apply({ puzzleId: 'bells', op: 'progress', value: 1, actor: 'p1', t: 5 }, ctx);

      expect(node.solved).toBe(true);
      expect(node.gateOpen).toBe(true);
    });
  });

  describe('FuseCoresNode (Map 4)', () => {
    it('picks up cores and inserts 3 into bay to unlock shutter', () => {
      const node = new FuseCoresNode(
        'fuse_bay',
        ['core_0', 'core_1', 'core_2'],
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 30 },
      );
      const ctx = makeCtx();

      expect(node.carriedCores).toBe(0);
      expect(node.insertedCount).toBe(0);

      // Lift cores
      node.apply({ puzzleId: 'fuse_bay', op: 'set', value: { action: 'lift', coreId: 'core_0' }, actor: 'p1', t: 0 }, ctx);
      node.apply({ puzzleId: 'fuse_bay', op: 'set', value: { action: 'lift', coreId: 'core_1' }, actor: 'p1', t: 1 }, ctx);
      expect(node.carriedCores).toBe(2);

      // Insert 2 cores
      node.apply({ puzzleId: 'fuse_bay', op: 'set', value: { action: 'insert' }, actor: 'p1', t: 2 }, ctx);
      node.apply({ puzzleId: 'fuse_bay', op: 'set', value: { action: 'insert' }, actor: 'p1', t: 3 }, ctx);
      expect(node.carriedCores).toBe(0);
      expect(node.insertedCount).toBe(2);
      expect(node.shutterOpen).toBe(false);

      // Lift 3rd core and insert
      node.apply({ puzzleId: 'fuse_bay', op: 'set', value: { action: 'lift', coreId: 'core_2' }, actor: 'p1', t: 4 }, ctx);
      node.apply({ puzzleId: 'fuse_bay', op: 'set', value: { action: 'insert' }, actor: 'p1', t: 5 }, ctx);

      expect(node.insertedCount).toBe(3);
      expect(node.shutterOpen).toBe(true);
      expect(node.solved).toBe(true);
    });
  });

  describe('GeneratorGridNode (Map 5)', () => {
    it('handles runtimes per playerCount, simultaneous 5s condition, and co-op extension caps', () => {
      // 1 player runtime = 90s
      const node1P = new GeneratorGridNode('gen_grid', ['G1', 'G2', 'G3'], { x: 0, y: 0, z: 0 });
      expect(node1P.getRuntimeForCount(1)).toBe(90.0);
      expect(node1P.getRuntimeForCount(2)).toBe(65.0);
      expect(node1P.getRuntimeForCount(3)).toBe(50.0);
      expect(node1P.getRuntimeForCount(4)).toBe(40.0);

      const ctx = makeCtx(0, 1);

      // Prime G1 (needs 6s)
      node1P.apply({ puzzleId: 'gen_grid', op: 'progress', value: { genId: 'G1', dt: 3.0 }, actor: 'p1', t: 0 }, ctx);
      expect(node1P.generators['G1']!.state).toBe('priming');
      node1P.apply({ puzzleId: 'gen_grid', op: 'progress', value: { genId: 'G1', dt: 3.1 }, actor: 'p1', t: 3 }, ctx);
      expect(node1P.generators['G1']!.state).toBe('ready_to_start');

      // Pull start G1
      node1P.apply({ puzzleId: 'gen_grid', op: 'set', value: { genId: 'G1', action: 'start' }, actor: 'p1', t: 6 }, ctx);
      expect(node1P.generators['G1']!.state).toBe('running');
      expect(node1P.generators['G1']!.remainingRuntime).toBe(90.0);

      // Co-op extension: extend G1 (+1s/s, max 30s)
      node1P.apply({ puzzleId: 'gen_grid', op: 'progress', value: { genId: 'G1', extendDt: 5.0 }, actor: 'p1', t: 7 }, ctx);
      expect(node1P.generators['G1']!.remainingRuntime).toBeCloseTo(95.0, 1);

      // Start G2 and G3 as well
      node1P.apply({ puzzleId: 'gen_grid', op: 'progress', value: { genId: 'G2', dt: 6.1 }, actor: 'p1', t: 8 }, ctx);
      node1P.apply({ puzzleId: 'gen_grid', op: 'set', value: { genId: 'G2', action: 'start' }, actor: 'p1', t: 8 }, ctx);

      node1P.apply({ puzzleId: 'gen_grid', op: 'progress', value: { genId: 'G3', dt: 6.1 }, actor: 'p1', t: 9 }, ctx);
      node1P.apply({ puzzleId: 'gen_grid', op: 'set', value: { genId: 'G3', action: 'start' }, actor: 'p1', t: 9 }, ctx);

      expect(node1P.allRunning).toBe(true);
      expect(node1P.solved).toBe(false);

      // Advance simultaneous running time by 5.1s
      node1P.tick(5.1, ctx);
      expect(node1P.blastDoorsOpen).toBe(true);
      expect(node1P.solved).toBe(true);
    });
  });

  describe('Headless Puzzle Solvers across All 10 Generated Maps', () => {
    const maps = [
      { id: 'poolrooms' as const, def: PoolroomsMap },
      { id: 'utility_tunnels' as const, def: UtilityTunnelsMap },
      { id: 'marble_atrium' as const, def: MarbleAtriumMap },
      { id: 'hydro_maze' as const, def: HydroMazeMap },
      { id: 'drainage_core' as const, def: DrainageCoreMap },
      { id: 'natatorium' as const, def: NatatoriumMap },
      { id: 'drowned_school' as const, def: DrownedSchoolMap },
      { id: 'sunken_jungle' as const, def: SunkenJungleMap },
      { id: 'neon_flood' as const, def: NeonFloodMap },
      { id: 'drowned_metro' as const, def: DrownedMetroMap },
    ];

    const solverTable: Array<{
      map: string;
      solved: boolean;
      stepCount: number;
      summary: string;
    }> = [];

    for (const m of maps) {
      it(`solves ${m.id} headlessly from generated layout`, () => {
        const layout = generateValidLayout(m.def, {
          seed: 42,
          difficulty: 'normal',
          playerCount: 1,
        });

        const res: SolveResult = solveLayoutPuzzleHeadless(m.id, layout);
        expect(res.solved).toBe(true);
        expect(res.steps.length).toBeGreaterThan(0);

        solverTable.push({
          map: m.id,
          solved: res.solved,
          stepCount: res.steps.length,
          summary: res.steps[res.steps.length - 1] ?? '',
        });
      });
    }

    it('prints the puzzle solver results table', () => {
      console.table(solverTable);
    });
  });
});
