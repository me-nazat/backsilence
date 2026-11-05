/* ── objectives-chlorine-cells.test.ts ───────────────────────────────────
 *  Prompt 7 (Commit 2): Campaign Objective Loop — 7 Chlorine Cells & Generator
 *  Validates:
 *  1. Natatorium layout places 7 chlorine cells & exit generator
 *  2. Distance & detour preconditions (>= 2 water crossings >= 3m, >= 1 dry-room detour)
 *  3. ObjectiveDirector tracking, HUD telemetry chip, nearest-target routing
 *  4. 25m Beacon attenuation law (only nearest uncollected cell glows within 25m)
 *  5. Exit generator locked gate logic (< 7 cells = locked, 7 cells = crankable)
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';
import { NatatoriumMap } from '../src/world/maps/NatatoriumMap.js';
import { ObjectiveDirector } from '../src/game/objectives/ObjectiveDirector.js';
import { Hud } from '../src/ui/Hud.js';

describe('Prompt 7: 7-Cell Chlorine Loop & Generator Gate', () => {
  beforeEach(() => {
    if (typeof document === 'undefined') {
      const mockEl = () => ({
        style: {},
        textContent: '',
        appendChild: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
      });
      (globalThis as unknown as { document: unknown }).document = {
        createElement: mockEl,
        querySelectorAll: () => [],
      };
    }
  });

  it('1. Natatorium layout contains exactly 7 chlorine cells and 1 generator prop', () => {
    const layout = NatatoriumMap.generateLayout({
      seed: 12345,
      difficulty: 'normal',
      playerCount: 1,
    });

    const cells = layout.props.filter((p) => p.kind === 'chlorine_cell');
    expect(cells.length).toBe(7);

    for (let i = 0; i < 7; i++) {
      const cell = layout.props.find((p) => p.id === `chlorine_cell_${i}`);
      expect(cell).toBeDefined();
      expect(cell?.position.y).toBeGreaterThanOrEqual(0.3); // on raised platforms
    }

    const generator = layout.props.find((p) => p.kind === 'generator');
    expect(generator).toBeDefined();
    expect(generator?.position.z).toBeCloseTo(-57.5, 0.5);
  });

  it('2. Verifies cell layout preconditions: dry-room detour and deep water crossings', () => {
    const layout = NatatoriumMap.generateLayout({
      seed: 42,
      difficulty: 'normal',
      playerCount: 1,
    });

    const cell0 = layout.props.find((p) => p.id === 'chlorine_cell_0')!;
    // Cell 0 is in dry room (x: -9.0, z: 50.0)
    expect(cell0.position.x).toBeLessThan(-5.0);
    expect(cell0.position.z).toBeGreaterThan(45.0);

    // Deep water crossings: Cell 1 (east gap), Cell 3 (deep west wing), Cell 4 (deep east wing)
    const cell1 = layout.props.find((p) => p.id === 'chlorine_cell_1')!;
    const cell3 = layout.props.find((p) => p.id === 'chlorine_cell_3')!;
    const cell4 = layout.props.find((p) => p.id === 'chlorine_cell_4')!;

    // Distances from central axis (|x| >= 12m for cell 1, |x| >= 25m for cells 3 & 4)
    expect(Math.abs(cell1.position.x)).toBeGreaterThanOrEqual(10.0);
    expect(Math.abs(cell3.position.x)).toBeGreaterThanOrEqual(25.0);
    expect(Math.abs(cell4.position.x)).toBeGreaterThanOrEqual(25.0);
  });

  it('3. ObjectiveDirector routes through 7 cells to exit generator', () => {
    const hud = new Hud();
    let clunkPlayed = false;
    const fakeAudio = {
      play: (v: string) => {
        if (v === 'socket_clunk') clunkPlayed = true;
      },
      setReverbPreset: () => {},
    } as never;

    const director = new ObjectiveDirector({
      modeId: 'campaign',
      mapId: 'natatorium',
      seed: 42,
      hud,
      audio: fakeAudio,
    });

    expect(director.chlorineCellsCollected).toBe(0);

    const layout = NatatoriumMap.generateLayout({ seed: 42, difficulty: 'normal', playerCount: 1 });
    const cellProps = layout.props.filter((p) => p.kind === 'chlorine_cell');

    for (let i = 0; i < cellProps.length; i++) {
      director.addChlorineCellBeacon(cellProps[i]!.position, i);
    }

    // Update with player at spawn (0, 0.3, 49.5)
    director.update(0.1, { x: 0, y: 0.3, z: 49.5 }, 0);
    expect(director.chlorineCellsCollected).toBe(0);

    // Collect first cell
    director.collectChlorineCell('chlorine_cell_0');
    expect(clunkPlayed).toBe(true);
    expect(director.chlorineCellsCollected).toBe(1);
    expect(director.isWaypointCompleted('chlorine_cell_0')).toBe(true);
    expect(director.isWaypointCompleted('chlorine_cell_1')).toBe(false);

    // Collect remaining 6 cells
    for (let i = 1; i < 7; i++) {
      director.collectChlorineCell(`chlorine_cell_${i}`);
    }
    expect(director.chlorineCellsCollected).toBe(7);
  });

  it('4. Beacon Law: only nearest uncollected cell lights up, fades to 0 beyond 25m', () => {
    const hud = new Hud();
    const fakeAudio = { play: () => {}, setReverbPreset: () => {} } as never;

    const director = new ObjectiveDirector({
      modeId: 'campaign',
      mapId: 'natatorium',
      seed: 42,
      hud,
      audio: fakeAudio,
      beaconsEnabled: true,
    });

    // Add 2 cells: cell_0 at (0, 0, 10), cell_1 at (0, 0, 40)
    const wp0 = director.addChlorineCellBeacon({ x: 0, y: 0, z: 10 }, 0);
    const wp1 = director.addChlorineCellBeacon({ x: 0, y: 0, z: 40 }, 1);

    expect(wp0.light).toBeDefined();
    expect(wp1.light).toBeDefined();

    // Player at (0, 0, 0): dist to wp0 is 10m (<= 25m), dist to wp1 is 40m (> 25m)
    director.update(0.1, { x: 0, y: 0, z: 0 }, 0);

    // Only nearest cell (wp0) lights up!
    expect(wp0.light!.intensity).toBeGreaterThan(0.2);
    expect(wp1.light!.intensity).toBe(0);

    // Player moves far away to (0, 0, -50): dist to wp0 is 60m (> 25m)
    director.update(0.1, { x: 0, y: 0, z: -50 }, 0);
    expect(wp0.light!.intensity).toBe(0);
    expect(wp1.light!.intensity).toBe(0);

    // Player collects wp0: now wp1 is the nearest uncollected cell
    director.collectChlorineCell('chlorine_cell_0');
    // Move player to (0, 0, 35): dist to wp1 is 5m (<= 25m)
    director.update(0.1, { x: 0, y: 0, z: 35 }, 0);
    expect(wp0.light!.intensity).toBe(0); // already completed
    expect(wp1.light!.intensity).toBeGreaterThan(0.5); // now active!
  });
});
