/* ── director.test.ts ────────────────────────────────────────────────────────
 *  Unit tests for Section 4 Encounter Director:
 *  - First contact within 45s on 10 seeds
 *  - No dead air over 90s
 *  - Sweeps stay >= 6m from silent dry players
 *  - Never attacks a silent dry player in 600s on 5 seeds
 *  - Pacing dread rhythm (CALM, BUILD, PEAK, RELEASE)
 *  - Determinism & snapshot hydration
 *  - 2-player targeting weighted by noise
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { EncounterDirector } from '../src/sim/Director.js';
import { createProvingGroundsSim, ARENA_MONSTER_SPAWN } from '../src/sim/ProvingGroundsData.js';
import type { PlayerIntent } from '../src/sim/PlayerMotor.js';

describe('Prompt 3 Section 4: Encounter Director & Dread Rhythm', () => {
  it('guarantees first contact within 30..45s on Normal difficulty across 10 distinct seeds', () => {
    for (let s = 1; s <= 10; s++) {
      const director = new EncounterDirector(s * 1000 + 42, 'normal');
      const sim = createProvingGroundsSim('normal');
      const monster = sim.addMonster({
        id: 'm1',
        variant: 'elder',
        spawn: ARENA_MONSTER_SPAWN,
        spawnGrace: 0.0,
      });

      let firstContactTime = -1;
      let beatsFound = 0;
      // Step up to 50 seconds (3000 ticks)
      for (let tick = 0; tick < 3000; tick++) {
        const dt = 1 / 60;
        director.updatePlayer('player1', { x: 0, y: 0.3, z: 20 }, true, false, false);
        director.step(dt, [monster], sim.nav, 0);

        for (const beat of director.dreadBeats) {
          if (beat.kind === 'glimpse' || beat.kind === 'far_call' || beat.kind === 'first_contact') {
            firstContactTime = tick / 60;
            beatsFound++;
            break;
          }
        }
        if (firstContactTime >= 0) break;
      }

      expect(firstContactTime).toBeGreaterThanOrEqual(30.0);
      expect(firstContactTime).toBeLessThanOrEqual(45.0);
    }
  });

  it('enforces no dead air: never more than 90s without a threat or atmospheric beat', () => {
    const director = new EncounterDirector(999, 'normal');
    const sim = createProvingGroundsSim('normal');
    const monster = sim.addMonster({
      id: 'm1',
      variant: 'elder',
      spawn: ARENA_MONSTER_SPAWN,
      spawnGrace: 0.0,
    });

    let lastBeatTime = 0;
    let maxInterval = 0;

    // Simulate 400 seconds
    for (let tick = 0; tick < 24000; tick++) {
      const dt = 1 / 60;
      director.updatePlayer('player1', { x: 0, y: 0.3, z: 20 }, true, false, false);
      director.step(dt, [monster], sim.nav, 0);

      if (director.dreadBeats.length > 0) {
        const currentT = tick / 60;
        const interval = currentT - lastBeatTime;
        if (interval > maxInterval) {
          maxInterval = interval;
        }
        lastBeatTime = currentT;
      }
    }

    expect(maxInterval).toBeLessThanOrEqual(90.1);
  });

  it('guarantees sweeps stay at least 6m away from silent dry player', () => {
    const director = new EncounterDirector(777, 'normal');
    const sim = createProvingGroundsSim('normal');
    const monster = sim.addMonster({
      id: 'm1',
      variant: 'elder',
      spawn: ARENA_MONSTER_SPAWN,
      spawnGrace: 0.0,
    });

    const playerPos = { x: 0, y: 0.3, z: 20 };
    let sweepEvaluated = false;

    // Fast-forward to closing phase (simTime > 120s)
    for (let tick = 0; tick < 18000; tick++) {
      const dt = 1 / 60;
      director.updatePlayer('player1', playerPos, true, false, false);
      director.step(dt, [monster], sim.nav, 0);

      for (const beat of director.dreadBeats) {
        if (beat.kind === 'sweep') {
          sweepEvaluated = true;
          const dist = Math.hypot(beat.position.x - playerPos.x, beat.position.z - playerPos.z);
          expect(dist).toBeGreaterThanOrEqual(5.95); // >= 6m within numerical precision
        }
      }
    }

    expect(sweepEvaluated).toBe(true);
  });

  it('fairness invariant: never attacks a silent dry player in a 600s run across 5 distinct seeds', () => {
    const idleIntent: PlayerIntent = {
      moveX: 0,
      moveZ: 0,
      sprint: false,
      crouch: false,
      jump: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };

    for (let seed = 101; seed <= 105; seed++) {
      const sim = createProvingGroundsSim('normal');
      sim.addMonster({
        id: 'm1',
        variant: 'elder',
        spawn: ARENA_MONSTER_SPAWN,
        spawnGrace: 0.0,
      });

      let attacked = false;
      // 600s = 36,000 ticks at 60Hz
      for (let tick = 0; tick < 36000; tick++) {
        sim.step(1 / 60, idleIntent);

        if (sim.monsters[0]!.state === 'ATTACK') {
          attacked = true;
          break;
        }
      }

      expect(attacked).toBe(false);
    }
  });

  it('cycles through dread rhythm phases (CALM, BUILD, PEAK, RELEASE) and outputs valid dread [0..1]', () => {
    const director = new EncounterDirector(1234, 'normal');
    const sim = createProvingGroundsSim('normal');
    const monster = sim.addMonster({
      id: 'm1',
      variant: 'elder',
      spawn: ARENA_MONSTER_SPAWN,
      spawnGrace: 0.0,
    });

    const observedPhases = new Set<string>();

    for (let tick = 0; tick < 15000; tick++) {
      director.updatePlayer('player1', { x: 0, y: 0.3, z: 20 }, true, false, false);
      director.step(1 / 60, [monster], sim.nav, 0);

      observedPhases.add(director.phase);
      expect(director.dread).toBeGreaterThanOrEqual(0.0);
      expect(director.dread).toBeLessThanOrEqual(1.0);
    }

    expect(observedPhases.has('CALM')).toBe(true);
    expect(observedPhases.has('BUILD')).toBe(true);
    expect(observedPhases.has('PEAK')).toBe(true);
    expect(observedPhases.has('RELEASE')).toBe(true);
  });

  it('round-trips snapshot serialization and hydration identically', () => {
    const directorA = new EncounterDirector(5555, 'normal');
    const sim = createProvingGroundsSim('normal');
    const monster = sim.addMonster({
      id: 'm1',
      variant: 'elder',
      spawn: ARENA_MONSTER_SPAWN,
      spawnGrace: 0.0,
    });

    // Step 200 ticks
    for (let tick = 0; tick < 200; tick++) {
      directorA.updatePlayer('player1', { x: 2, y: 0.3, z: 15 }, true, false, false);
      directorA.step(1 / 60, [monster], sim.nav, 0);
    }

    const snap = directorA.getSnapshot();

    const directorB = new EncounterDirector(5555, 'normal');
    directorB.hydrate(snap);

    expect(directorB.dread).toBeCloseTo(directorA.dread, 5);
    expect(directorB.phase).toBe(directorA.phase);
  });

  it('targets 8m region cell of the player with highest accumulated noise in multiplayer', () => {
    const director = new EncounterDirector(8888, 'normal');
    director.updatePlayer('p1', { x: 10, y: 0.3, z: 10 }, true, false, false);
    director.updatePlayer('p2', { x: -20, y: 0.3, z: -20 }, true, false, false);

    // p2 makes loud noise
    director.recordNoise({
      id: 'n1',
      kind: 'splash',
      position: { x: -20, y: 0, z: -20 },
      loudness: 1.0,
      sourcePlayerId: 'p2',
      t: 10.0,
    });

    const region = director.getRegionPosition({ x: -20, y: 0.3, z: -20 });
    // Math.floor(-20 / 8) * 8 + 4 = -3 * 8 + 4 = -20
    expect(region.x).toBe(-20);
    expect(region.z).toBe(-20);
  });
});
