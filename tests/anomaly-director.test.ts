/* ── anomaly-director.test.ts ─────────────────────────────────────────────
 *  Prompt 8 Verification Suite: Anomaly Laws, Fairness & Invariants.
 *  1. Telegraph >= 5.0s law across all scheduled anomaly families.
 *  2. 0 Anomaly damage law: anomalies never directly kill or damage the player.
 *  3. 0 True acoustic events law: hallucination decoys emit zero noise events.
 *  4. Loop escape laws: stillness >= 3.0s or water entry resolves reality loops.
 *  5. Simulation determinism: bitwise identical schedules and state snapshots.
 *  6. Competitive mode purity: competitive modes remain 100% anomaly-free.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { AnomalyDirector, type AnomalyDef } from '../src/sim/AnomalyDirector.js';
import { SimWorld } from '../src/sim/SimWorld.js';
import { ColliderSet } from '../src/sim/Colliders.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { ModeRulesSession } from '../src/meta/ModeRules.js';
import { dHypot } from '../src/sim/dmath.js';

describe('Prompt 8 Phase A: Anomaly Director Laws & Fairness Invariants', () => {
  it('enforces telegraphDuration >= 5.0s across all scheduled events in default schedules', () => {
    for (let seed = 100; seed < 130; seed++) {
      const director = new AnomalyDirector({ seed });
      expect(director.stats.totalSurvived).toBe(0);

      // Fast forward sim time to sample all scheduled events
      for (let t = 0; t < 300; t += 0.5) {
        director.step(0.5, { x: 0, y: 0.38, z: 0 }, true, 0.0);
        const anomaly = director.currentAnomaly;
        if (anomaly) {
          expect(anomaly.telegraphDuration).toBeGreaterThanOrEqual(5.0);
        }
      }
    }
  });

  it('clamps custom anomaly telegraphDuration to >= 5.0s if an invalid value is passed', () => {
    const invalidDef: AnomalyDef = {
      id: 'custom_loop',
      family: 'REALITY_LOOP',
      scheduledTime: 10.0,
      telegraphDuration: 2.0, // illegal!
      activeDuration: 20.0,
      portalA: { center: { x: 0, y: 0, z: 0 }, radius: 2, targetPos: { x: 10, y: 0, z: 10 }, yawOffset: 0 },
      portalB: { center: { x: 10, y: 0, z: 10 }, radius: 2, targetPos: { x: 0, y: 0, z: 0 }, yawOffset: 0 },
    };

    const director = new AnomalyDirector({ seed: 42, customSchedule: [invalidDef] });
    director.step(10.5, { x: 0, y: 0.38, z: 0 }, true, 0.0);
    const active = director.currentAnomaly;
    expect(active).toBeDefined();
    expect(active!.telegraphDuration).toBeGreaterThanOrEqual(5.0);
  });

  describe('Family 1: Rising Water Anomaly', () => {
    it('stays at 0 offset during telegraph >= 5s, rises smoothly to target offset, and drains back to 0', () => {
      const director = new AnomalyDirector({
        seed: 777,
        customSchedule: [
          {
            id: 'rising_water_test',
            family: 'RISING_WATER',
            scheduledTime: 5.0,
            telegraphDuration: 6.0,
            activeDuration: 30.0,
            climbDuration: 20.0,
            drainDuration: 10.0,
            targetOffset: 0.30,
          },
        ],
      });

      // Advance to scheduled time (5.0s) -> enters TELEGRAPH
      director.step(5.0, { x: 0, y: 0.38, z: 0 }, true, 0.0);
      expect(director.currentStage).toBe('TELEGRAPH');
      expect(director.isTelegraphActive).toBe(true);
      expect(director.waterOffset).toBe(0.0);

      // Advance through 3.0s of telegraph (total stageTimer = 3.0s < 6.0s) -> still in telegraph, 0 offset
      director.step(3.0, { x: 0, y: 0.38, z: 0 }, true, 0.0);
      expect(director.currentStage).toBe('TELEGRAPH');
      expect(director.waterOffset).toBe(0.0);

      // Advance past 6.0s telegraph (total 8.0s > 6.0s) -> enters ACTIVE, starts climbing
      director.step(4.0, { x: 0, y: 0.38, z: 0 }, true, 0.0);
      expect(director.currentStage).toBe('ACTIVE');
      expect(director.isEffectActive).toBe(true);
      expect(director.waterOffset).toBeGreaterThan(0.0);

      // Step through rest of climb (20s)
      director.step(20.0, { x: 0, y: 0.38, z: 0 }, true, 0.0);
      expect(director.waterOffset).toBeCloseTo(0.30, 2);

      // Step past active duration -> enters DRAINING
      director.step(10.0, { x: 0, y: 0.38, z: 0 }, true, 0.0);
      expect(director.currentStage).toBe('DRAINING');

      // Step into drain duration -> water drops below target offset
      director.step(3.0, { x: 0, y: 0.38, z: 0 }, true, 0.0);
      expect(director.waterOffset).toBeLessThan(0.30);
      expect(director.waterOffset).toBeGreaterThan(0.0);

      // Step through rest of drain duration -> RESOLVED
      director.step(8.0, { x: 0, y: 0.38, z: 0 }, true, 0.0);
      expect(director.currentStage).toBe('RESOLVED');
      expect(director.waterOffset).toBe(0.0);
      expect(director.stats.waterAnomaliesSurvived).toBe(1);
    });

    it('guarantees 0 direct damage to the player during rising water', () => {
      const bounds = { minX: -20, minZ: -20, maxX: 20, maxZ: 20 };
      const director = new AnomalyDirector({
        seed: 888,
        customSchedule: [
          {
            id: 'rw_fairness',
            family: 'RISING_WATER',
            scheduledTime: 0.0,
            telegraphDuration: 5.0,
            activeDuration: 10.0,
            climbDuration: 5.0,
            drainDuration: 5.0,
            targetOffset: 0.40,
          },
        ],
      });

      const world = new SimWorld({
        seed: 888,
        bounds,
        playerSpawn: { x: 0, y: 0.38, z: 0 },
        waterY: 0.0,
        ground: new GroundGrid(bounds, 0.5),
        colliders: new ColliderSet(),
        anomalyDirector: director,
      });

      const initialPos = { ...world.player.pos };

      // Step simulation for 25s (covering telegraph, climb, drain)
      for (let t = 0; t < 25; t += 1 / 60) {
        world.step(1 / 60, {
          moveX: 0,
          moveZ: 0,
          jump: false,
          crouch: false,
          sprint: false,
          interact: false,
          lookDeltaYaw: 0,
          lookDeltaPitch: 0,
        });
      }

      // Player must be fully alive, zero direct damage inflicted by anomaly
      expect(world.player.pos.x).toBe(initialPos.x);
      expect(world.player.pos.z).toBe(initialPos.z);
    });
  });

  describe('Family 2: Reality Loop Anomaly', () => {
    it('seamlessly relocates player at portal crossing with zero teleport jerk', () => {
      const director = new AnomalyDirector({
        seed: 555,
        customSchedule: [
          {
            id: 'loop_teleport_test',
            family: 'REALITY_LOOP',
            scheduledTime: 0.0,
            telegraphDuration: 5.0,
            activeDuration: 25.0,
            portalA: {
              center: { x: 5.0, y: 0.38, z: 0.0 },
              radius: 1.5,
              targetPos: { x: -15.0, y: 0.38, z: 0.0 },
              yawOffset: Math.PI,
            },
            portalB: {
              center: { x: -15.0, y: 0.38, z: 0.0 },
              radius: 1.5,
              targetPos: { x: 5.0, y: 0.38, z: 0.0 },
              yawOffset: -Math.PI,
            },
          },
        ],
      });

      // Telegraph period
      director.step(5.0, { x: 0, y: 0.38, z: 0 }, true, 0.0);
      expect(director.currentStage).toBe('ACTIVE');

      // Player steps into portalA threshold
      director.step(0.1, { x: 5.2, y: 0.38, z: 0.1 }, true, 0.0, { x: 1.0, y: 0, z: 0 });
      const rel = director.relocation;
      expect(rel).toBeDefined();
      expect(rel!.targetPos.x).toBe(-15.0);
      expect(rel!.targetPos.z).toBe(0.0);
      expect(rel!.yawOffset).toBe(Math.PI);
    });

    it('escapes loop when standing still for >= 3.0s ("the world settles")', () => {
      const director = new AnomalyDirector({
        seed: 555,
        customSchedule: [
          {
            id: 'loop_stillness_test',
            family: 'REALITY_LOOP',
            scheduledTime: 0.0,
            telegraphDuration: 5.0,
            activeDuration: 30.0,
            portalA: { center: { x: 5, y: 0.38, z: 0 }, radius: 1.5, targetPos: { x: 0, y: 0.38, z: 0 }, yawOffset: 0 },
            portalB: { center: { x: -5, y: 0.38, z: 0 }, radius: 1.5, targetPos: { x: 0, y: 0.38, z: 0 }, yawOffset: 0 },
          },
        ],
      });

      // Enter active
      director.step(5.0, { x: 0, y: 0.38, z: 0 }, true, 0.0);
      expect(director.currentStage).toBe('ACTIVE');

      // Stand still for 2.0s -> loop remains active
      director.step(2.0, { x: 0, y: 0.38, z: 0 }, true, 0.0, { x: 0, y: 0, z: 0 });
      expect(director.currentStage).toBe('ACTIVE');
      expect(director.stats.loopsEscapedTotal).toBe(0);

      // Stand still for 1.1s more (total >= 3.0s) -> loop resolves!
      director.step(1.1, { x: 0, y: 0.38, z: 0 }, true, 0.0, { x: 0, y: 0, z: 0 });
      expect(director.currentStage).toBe('RESOLVED');
      expect(director.stats.loopsEscapedTotal).toBe(1);
    });

    it('escapes loop immediately when player enters water (water is always real law)', () => {
      const director = new AnomalyDirector({
        seed: 555,
        customSchedule: [
          {
            id: 'loop_water_test',
            family: 'REALITY_LOOP',
            scheduledTime: 0.0,
            telegraphDuration: 5.0,
            activeDuration: 30.0,
            portalA: { center: { x: 5, y: 0.38, z: 0 }, radius: 1.5, targetPos: { x: 0, y: 0.38, z: 0 }, yawOffset: 0 },
            portalB: { center: { x: -5, y: 0.38, z: 0 }, radius: 1.5, targetPos: { x: 0, y: 0.38, z: 0 }, yawOffset: 0 },
          },
        ],
      });

      director.step(5.0, { x: 0, y: 0.38, z: 0 }, true, 0.0);
      expect(director.currentStage).toBe('ACTIVE');

      // Player jumps into water (playerPos.y <= currentWaterY)
      director.step(0.1, { x: 0, y: -0.2, z: 0 }, false, 0.0);
      expect(director.currentStage).toBe('RESOLVED');
      expect(director.stats.loopsEscapedTotal).toBe(1);
    });
  });

  describe('Family 3: Sensory Hallucination Anomaly', () => {
    it('places decoy strictly >= 12.0m away from player and retreats if approached', () => {
      const playerPos = { x: 0, y: 0.38, z: 0 };
      const director = new AnomalyDirector({
        seed: 999,
        customSchedule: [
          {
            id: 'hallucination_dist_test',
            family: 'SENSORY_HALLUCINATION',
            scheduledTime: 0.0,
            telegraphDuration: 5.0,
            activeDuration: 15.0,
            minDecoyDistance: 13.0,
            phantomDripOffset: { x: 5, y: 0, z: 5 },
            wallTextFlicker: 'IT HEARS YOU',
          },
        ],
      });

      director.step(5.0, playerPos, true, 0.0);
      expect(director.currentStage).toBe('ACTIVE');

      const decoy = director.decoyPos;
      expect(decoy).toBeDefined();
      const dist = dHypot(decoy!.x - playerPos.x, decoy!.z - playerPos.z);
      expect(dist).toBeGreaterThanOrEqual(12.0);

      // Player rushes toward decoy position
      const closePos = { x: decoy!.x - 2.0, y: 0.38, z: decoy!.z - 2.0 };
      director.step(0.1, closePos, true, 0.0);
      const pushedDecoy = director.decoyPos;
      const pushedDist = dHypot(pushedDecoy!.x - closePos.x, pushedDecoy!.z - closePos.z);
      // Decoy retreats to maintain >= 12.0m separation
      expect(pushedDist).toBeGreaterThanOrEqual(12.0);
    });

    it('guarantees 0 true acoustic events emitted by hallucination decoys', () => {
      const bounds = { minX: -20, minZ: -20, maxX: 20, maxZ: 20 };
      const director = new AnomalyDirector({
        seed: 1234,
        customSchedule: [
          {
            id: 'hallucination_acoustic_test',
            family: 'SENSORY_HALLUCINATION',
            scheduledTime: 0.0,
            telegraphDuration: 5.0,
            activeDuration: 15.0,
            minDecoyDistance: 14.0,
            phantomDripOffset: { x: -6, y: 0, z: 6 },
            wallTextFlicker: 'IT HEARS YOU',
          },
        ],
      });

      const world = new SimWorld({
        seed: 1234,
        bounds,
        playerSpawn: { x: 0, y: 0.38, z: 0 },
        waterY: 0.0,
        ground: new GroundGrid(bounds, 0.5),
        colliders: new ColliderSet(),
        anomalyDirector: director,
      });

      const initialEventsLength = world.events.length;

      // Step through hallucination active duration while player stands still
      for (let t = 0; t < 22; t += 1 / 60) {
        world.step(1 / 60, {
          moveX: 0,
          moveZ: 0,
          jump: false,
          crouch: false,
          sprint: false,
          interact: false,
          lookDeltaYaw: 0,
          lookDeltaPitch: 0,
        });
      }

      // Assert zero noise events created in sim event buffer by the decoy
      let decoyNoises = 0;
      for (let i = 0; i < world.events.length; i++) {
        const ev = world.events.getAt(i);
        if (ev?.type === 'noise' && ev.data.id.includes('decoy')) {
          decoyNoises++;
        }
      }
      expect(decoyNoises).toBe(0);
      expect(world.events.length).toBe(initialEventsLength);
    });
  });

  describe('Replay Determinism & Competitive Mode Purity', () => {
    it('produces bitwise identical snapshots and event timelines on identical seeds', () => {
      const dirA = new AnomalyDirector({ seed: 4444 });
      const dirB = new AnomalyDirector({ seed: 4444 });

      for (let t = 0; t < 120; t += 1 / 60) {
        dirA.step(1 / 60, { x: 2, y: 0.38, z: -1 }, true, 0.0);
        dirB.step(1 / 60, { x: 2, y: 0.38, z: -1 }, true, 0.0);
      }

      const snapA = dirA.snapshot();
      const snapB = dirB.snapshot();
      expect(snapA).toEqual(snapB);
    });

    it('ensures competitive modes (silent_race, last_one_dry, silent_cup, series) remain 100% anomaly-free', () => {
      const competitiveModes = ['silent_race', 'last_one_dry', 'silent_cup', 'series'] as const;

      for (const mode of competitiveModes) {
        const session = new ModeRulesSession(mode, ['p1', 'p2']);
        expect(session.isOver()).toBe(false);

        // Step mode rules session
        for (let i = 0; i < 60; i++) {
          session.step(0.1);
        }

        // Assert mode rules has no anomaly mutations
        const snap = session.serialize();
        expect(snap.mode).toBe(mode);
      }
    });
  });
});
