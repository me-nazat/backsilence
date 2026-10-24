/* ── SinkingPlatformNode.ts ────────────────────────────────────────────────
 *  Pure deterministic simulation for sinking stepping-stones in Map 3.
 *  Handles stand accumulation, grace timer, tilt warning, sinking,
 *  submerged duration, and rising phases. Implements DynamicTop for GroundGrid.
 * ──────────────────────────────────────────────────────────────────────── */

import type { DynamicTop } from './GroundGrid.js';
import { dSin, D_PI } from './dmath.js';

export type SinkingPlatformState =
  | 'UP'
  | 'WARNING'
  | 'SINKING'
  | 'SUBMERGED'
  | 'RISING';

export interface SinkingPlatformConfig {
  id: string;
  rect: [number, number, number, number]; // [minX, minZ, maxX, maxZ]
  baseY?: number; // default +0.3
  sinkY?: number; // default -0.55
  standThreshold?: number; // default 7.0s
  graceTime?: number; // default 1.5s
  sinkDuration?: number; // default 3.0s
  submergedDuration?: number; // default 10.0s
  riseDuration?: number; // default 4.0s
}

export interface SinkingPlatformSnapshot {
  id: string;
  state: SinkingPlatformState;
  height: number;
  standTimer: number;
  graceTimer: number;
  phaseTimer: number;
}

export type SinkingPlatformEvent =
  | { type: 'warning_start'; id: string; x: number; z: number }
  | { type: 'sink_start'; id: string; x: number; z: number }
  | { type: 'rise_start'; id: string; x: number; z: number }
  | { type: 'rise_complete'; id: string; x: number; z: number };

export class SinkingPlatformNode implements DynamicTop {
  readonly id: string;
  readonly rect: [number, number, number, number];
  readonly baseY: number;
  readonly sinkY: number;
  readonly standThreshold: number;
  readonly graceTime: number;
  readonly sinkDuration: number;
  readonly submergedDuration: number;
  readonly riseDuration: number;

  state: SinkingPlatformState = 'UP';
  currentHeight: number;
  standTimer = 0;
  graceTimer = 0;
  phaseTimer = 0;
  tiltAngle = 0; // degrees, for presentation tilt wobble

  constructor(config: SinkingPlatformConfig) {
    this.id = config.id;
    this.rect = config.rect;
    this.baseY = config.baseY ?? 0.3;
    this.sinkY = config.sinkY ?? -0.55;
    this.standThreshold = config.standThreshold ?? 7.0;
    this.graceTime = config.graceTime ?? 1.5;
    this.sinkDuration = config.sinkDuration ?? 3.0;
    this.submergedDuration = config.submergedDuration ?? 10.0;
    this.riseDuration = config.riseDuration ?? 4.0;
    this.currentHeight = this.baseY;
  }

  contains(x: number, z: number): boolean {
    return (
      x >= this.rect[0] &&
      x <= this.rect[2] &&
      z >= this.rect[1] &&
      z <= this.rect[3]
    );
  }

  getTopAt(x: number, z: number): number | null {
    if (this.contains(x, z)) {
      return this.currentHeight;
    }
    return null;
  }

  heightAt(_t = 0): number {
    return this.currentHeight;
  }

  tick(
    dt: number,
    isPlayerOn: boolean,
    simTime = 0,
  ): SinkingPlatformEvent[] {
    const events: SinkingPlatformEvent[] = [];
    const centerX = (this.rect[0] + this.rect[2]) * 0.5;
    const centerZ = (this.rect[1] + this.rect[3]) * 0.5;

    switch (this.state) {
      case 'UP':
      case 'WARNING': {
        if (isPlayerOn) {
          this.standTimer += dt;
          this.graceTimer = this.graceTime; // Refresh grace
        } else if (this.standTimer > 0) {
          this.graceTimer -= dt;
          if (this.graceTimer <= 0) {
            this.standTimer = Math.max(0, this.standTimer - dt * 2.0); // Decay
          }
        }

        // Warning activates in the last 2.0s of standThreshold
        const warningStart = Math.max(0, this.standThreshold - 2.0);
        if (this.standTimer >= warningStart && this.standTimer < this.standThreshold) {
          if (this.state !== 'WARNING') {
            this.state = 'WARNING';
            events.push({
              type: 'warning_start',
              id: this.id,
              x: centerX,
              z: centerZ,
            });
          }
          // Tilt oscillation ±3 degrees at 3 Hz
          this.tiltAngle = dSin(simTime * D_PI * 6.0) * 3.0;
        } else {
          this.state = 'UP';
          this.tiltAngle = 0;
        }

        if (this.standTimer >= this.standThreshold) {
          this.state = 'SINKING';
          this.phaseTimer = 0;
          this.tiltAngle = 0;
          events.push({
            type: 'sink_start',
            id: this.id,
            x: centerX,
            z: centerZ,
          });
        }
        break;
      }

      case 'SINKING': {
        this.phaseTimer += dt;
        const progress = Math.min(1.0, this.phaseTimer / this.sinkDuration);
        // Smoothstep interpolation down to sinkY
        const smooth = progress * progress * (3 - 2 * progress);
        this.currentHeight = this.baseY + smooth * (this.sinkY - this.baseY);

        if (progress >= 1.0) {
          this.state = 'SUBMERGED';
          this.phaseTimer = 0;
          this.currentHeight = this.sinkY;
        }
        break;
      }

      case 'SUBMERGED': {
        this.phaseTimer += dt;
        this.currentHeight = this.sinkY;

        if (this.phaseTimer >= this.submergedDuration) {
          this.state = 'RISING';
          this.phaseTimer = 0;
          events.push({
            type: 'rise_start',
            id: this.id,
            x: centerX,
            z: centerZ,
          });
        }
        break;
      }

      case 'RISING': {
        this.phaseTimer += dt;
        const progress = Math.min(1.0, this.phaseTimer / this.riseDuration);
        const smooth = progress * progress * (3 - 2 * progress);
        this.currentHeight = this.sinkY + smooth * (this.baseY - this.sinkY);

        if (progress >= 1.0) {
          this.state = 'UP';
          this.currentHeight = this.baseY;
          this.standTimer = 0;
          this.phaseTimer = 0;
          events.push({
            type: 'rise_complete',
            id: this.id,
            x: centerX,
            z: centerZ,
          });
        }
        break;
      }
    }

    return events;
  }

  serialize(): SinkingPlatformSnapshot {
    return {
      id: this.id,
      state: this.state,
      height: this.currentHeight,
      standTimer: this.standTimer,
      graceTimer: this.graceTimer,
      phaseTimer: this.phaseTimer,
    };
  }

  hydrate(snap: SinkingPlatformSnapshot): void {
    this.state = snap.state;
    this.currentHeight = snap.height;
    this.standTimer = snap.standTimer;
    this.graceTimer = snap.graceTimer;
    this.phaseTimer = snap.phaseTimer;
  }
}
