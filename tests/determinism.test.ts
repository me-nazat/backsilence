import { describe, it, expect } from 'vitest';
import { runSimulationReplay } from '../src/meta/SimReplayRunner.js';

describe('Simulation Determinism Replay Suite', () => {
  it('replaying the same map and seed produces identical simHashes and checkpoints', async () => {
    const run1 = await runSimulationReplay('orientation', 4242, 3600, 600);
    const run2 = await runSimulationReplay('orientation', 4242, 3600, 600);

    expect(run1.finalSimHash).toBe(run2.finalSimHash);
    expect(run1.checkpoints.length).toBe(run2.checkpoints.length);
    for (let i = 0; i < run1.checkpoints.length; i++) {
      expect(run1.checkpoints[i]!.hash).toBe(run2.checkpoints[i]!.hash);
    }
  }, 30000);

  it('different seeds diverge deterministically', async () => {
    const runA = await runSimulationReplay('poolrooms', 1111, 1800, 600);
    const runB = await runSimulationReplay('poolrooms', 9999, 1800, 600);

    expect(runA.finalSimHash).not.toBe(runB.finalSimHash);
  }, 30000);
});
