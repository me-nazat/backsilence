/* ── SimBot.ts ─────────────────────────────────────────────────────────────
 *  Scripted intent bot for headless simulation testing and scenario runs.
 *  Zero Three.js, DOM, or Audio imports.
 * ──────────────────────────────────────────────────────────────────────── */

import type { PlayerIntent } from './PlayerMotor.js';
import type { SimWorld } from './SimWorld.js';

export interface ScriptedStep {
  duration: number; // in seconds
  intent: Partial<PlayerIntent>;
}

export class SimBot {
  private readonly world: SimWorld;
  private readonly defaultIntent: PlayerIntent = {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    crouch: false,
    jump: false,
    interact: false,
    lookDeltaYaw: 0,
    lookDeltaPitch: 0,
  };

  constructor(world: SimWorld) {
    this.world = world;
  }

  /**
   * Run a single tick with optional custom intent.
   */
  tick(dt = 1 / 60, customIntent: Partial<PlayerIntent> = {}): void {
    const intent: PlayerIntent = {
      ...this.defaultIntent,
      ...customIntent,
    };
    this.world.step(dt, intent);
  }

  /**
   * Run the simulation for a specific duration with a given intent.
   */
  run(duration: number, intent: Partial<PlayerIntent> = {}, dt = 1 / 60): void {
    const fullIntent: PlayerIntent = {
      ...this.defaultIntent,
      ...intent,
    };
    let elapsed = 0;
    while (elapsed < duration) {
      const stepDt = Math.min(dt, duration - elapsed);
      this.world.step(stepDt, fullIntent);
      elapsed += stepDt;
    }
  }

  /**
   * Execute an array of sequential scripted actions.
   */
  runSequence(sequence: ScriptedStep[], dt = 1 / 60): void {
    for (let i = 0; i < sequence.length; i++) {
      const step = sequence[i]!;
      this.run(step.duration, step.intent, dt);
    }
  }

  /**
   * Wait while standing still.
   */
  idle(duration: number, dt = 1 / 60): void {
    this.run(duration, {}, dt);
  }
}
