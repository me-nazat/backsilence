/* ── GeneratorGridNode.ts ──────────────────────────────────────────────────
 *  Map 5: Abyssal Drainage Core 3-Generator Grid pure state machine.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../../types/contracts.js';
import type { PuzzleNode, PuzzleOp, PuzzleCtx } from './PuzzleTypes.js';

export type GeneratorState = 'idle' | 'priming' | 'pull_start' | 'ready_to_start' | 'running' | 'cooldown';

export interface GeneratorSlot {
  id: string;
  position: Vec3;
  state: GeneratorState;
  primeTimer: number;
  remainingRuntime: number;
  pullBeats: number;
  beatWindow: number;
  coopExtension: number; // Max 30s per cycle
}

export interface GeneratorGridSnapshot {
  generators: GeneratorSlot[];
  simultaneousTimer: number;
  solved: boolean;
}

export class GeneratorGridNode implements PuzzleNode {
  readonly id: string;
  readonly type = 'generator_grid';
  readonly blastDoorPosition: Vec3;

  generators: GeneratorSlot[] & Record<string, GeneratorSlot>;
  simultaneousTimer = 0;
  solved = false;

  private noiseTimer = 0;

  constructor(
    id: string,
    arg2: string[] | Vec3,
    arg3: Vec3 | { id: string; pos: Vec3 }[],
  ) {
    this.id = id;
    if (Array.isArray(arg2)) {
      this.blastDoorPosition = { ...(arg3 as Vec3) };
      const raw: GeneratorSlot[] = arg2.map((gid) => ({
        id: gid,
        position: { x: 0, y: 0, z: 0 },
        state: 'idle',
        primeTimer: 0,
        remainingRuntime: 0,
        pullBeats: 0,
        beatWindow: 0,
        coopExtension: 0,
      }));
      const record = Object.fromEntries(raw.map((g) => [g.id, g]));
      this.generators = Object.assign(raw, record);
    } else {
      this.blastDoorPosition = { ...arg2 };
      const raw: GeneratorSlot[] = (arg3 as { id: string; pos: Vec3 }[]).map((g) => ({
        id: g.id,
        position: { ...g.pos },
        state: 'idle',
        primeTimer: 0,
        remainingRuntime: 0,
        pullBeats: 0,
        beatWindow: 0,
        coopExtension: 0,
      }));
      const record = Object.fromEntries(raw.map((g) => [g.id, g]));
      this.generators = Object.assign(raw, record);
    }
  }

  getRuntimeForCount(playerCount: number): number {
    return this.getMaxRuntime(playerCount);
  }

  get allRunning(): boolean {
    return this.generators.every((g) => g.state === 'running');
  }

  get blastDoorsOpen(): boolean {
    return this.solved;
  }

  private getMaxRuntime(playerCount: number): number {
    if (playerCount <= 1) return 90.0;
    if (playerCount === 2) return 65.0;
    if (playerCount === 3) return 50.0;
    return 40.0;
  }

  apply(op: PuzzleOp, ctx: PuzzleCtx): void {
    if (this.solved) return;

    if ((op.op === 'progress' || op.op === 'set') && typeof op.value === 'object' && op.value !== null) {
      const val = op.value as {
        action?: 'prime' | 'pull' | 'pull_beat' | 'start' | 'extend' | 'cancel_prime';
        genId: string;
        dt?: number;
        extendDt?: number;
      };

      const gen = this.generators.find((g) => g.id === val.genId);
      if (!gen) return;

      if (val.extendDt !== undefined || val.action === 'extend') {
        const dt = val.extendDt ?? val.dt ?? 0.1;
        if (gen.coopExtension < 30.0) {
          const added = Math.min(dt, 30.0 - gen.coopExtension);
          gen.coopExtension += added;
          gen.remainingRuntime += added;
        }
        return;
      }

      if (val.action === 'cancel_prime') {
        if (gen.state === 'priming') {
          gen.state = 'idle';
          gen.primeTimer = 0;
        }
        return;
      }

      const isPrime =
        val.action === 'prime' ||
        (!val.action && val.dt !== undefined && gen.state !== 'running' && val.extendDt === undefined);

      if (isPrime) {
        if (gen.state === 'idle') {
          gen.state = 'priming';
          gen.primeTimer = 0;
        }

        if (gen.state === 'priming') {
          const dt = val.dt ?? 0.1;
          gen.primeTimer += dt;

          // Priming noise 0.5 every 0.5s
          this.noiseTimer += dt;
          if (this.noiseTimer >= 0.5) {
            this.noiseTimer = 0;
            ctx.emitNoise('generator', gen.position, 0.5);
          }

          if (gen.primeTimer >= 6.0) {
            gen.state = 'ready_to_start';
            gen.primeTimer = 0;
            gen.pullBeats = 0;
            gen.beatWindow = 2.0;
            ctx.emitWorldEvent('pull_start_ready', { genId: gen.id });
          }
        }
        return;
      }

      if (val.action === 'start' || val.action === 'pull' || val.action === 'pull_beat') {
        if (val.action === 'start') {
          gen.state = 'running';
          gen.remainingRuntime = this.getMaxRuntime(ctx.playerCount);
          gen.coopExtension = 0;
          ctx.emitNoise('generator', gen.position, 0.9);
          ctx.emitWorldEvent('generator_started', {
            genId: gen.id,
            runtime: gen.remainingRuntime,
          });
        } else if (val.action === 'pull') {
          gen.pullBeats++;
          if (gen.pullBeats >= 3 || gen.state === 'ready_to_start' || gen.state === 'pull_start') {
            gen.state = 'running';
            gen.remainingRuntime = this.getMaxRuntime(ctx.playerCount);
            gen.coopExtension = 0;
            ctx.emitNoise('generator', gen.position, 0.9);
            ctx.emitWorldEvent('generator_started', {
              genId: gen.id,
              runtime: gen.remainingRuntime,
            });
          }
        } else if (val.action === 'pull_beat') {
          if ((gen.state === 'pull_start' || gen.state === 'ready_to_start') && gen.beatWindow > 0) {
            gen.pullBeats++;
            gen.beatWindow = 1.5;

            ctx.emitWorldEvent('pull_beat_hit', { genId: gen.id, beat: gen.pullBeats });

            if (gen.pullBeats >= 3) {
              gen.state = 'running';
              gen.remainingRuntime = this.getMaxRuntime(ctx.playerCount);
              gen.coopExtension = 0;
              ctx.emitNoise('generator', gen.position, 0.9);
              ctx.emitWorldEvent('generator_started', {
                genId: gen.id,
                runtime: gen.remainingRuntime,
              });
            }
          } else if (gen.state === 'pull_start' || gen.state === 'ready_to_start') {
            gen.state = 'idle';
            gen.pullBeats = 0;
            ctx.emitNoise('alarm', gen.position, 0.6);
            ctx.emitWorldEvent('pull_beat_failed', { genId: gen.id });
          }
        }
      }
    } else if (op.op === 'reset') {
      for (const gen of this.generators) {
        gen.state = 'idle';
        gen.primeTimer = 0;
        gen.remainingRuntime = 0;
        gen.pullBeats = 0;
        gen.beatWindow = 0;
        gen.coopExtension = 0;
      }
      this.simultaneousTimer = 0;
    }
  }

  tick(dt: number, ctx: PuzzleCtx): void {
    if (this.solved) return;

    let allRunning = true;

    for (const gen of this.generators) {
      if (gen.state === 'pull_start') {
        gen.beatWindow -= dt;
        if (gen.beatWindow <= 0) {
          gen.state = 'idle';
          gen.pullBeats = 0;
          ctx.emitWorldEvent('pull_beat_failed', { genId: gen.id });
        }
      } else if (gen.state === 'running') {
        gen.remainingRuntime -= dt;

        // Sustained generator noise 0.9 every 0.5s
        this.noiseTimer += dt;
        if (this.noiseTimer >= 0.5) {
          this.noiseTimer = 0;
          ctx.emitNoise('generator', gen.position, 0.9);
        }

        if (gen.remainingRuntime <= 0) {
          gen.state = 'cooldown';
          gen.remainingRuntime = 0;
          ctx.emitWorldEvent('generator_stopped', { genId: gen.id });
        }
      } else if (gen.state === 'cooldown') {
        gen.remainingRuntime -= dt;
        if (gen.remainingRuntime <= -3.0) {
          gen.state = 'idle';
          gen.remainingRuntime = 0;
        }
      }

      if (gen.state !== 'running') {
        allRunning = false;
      }
    }

    if (allRunning) {
      this.simultaneousTimer += dt;
      if (this.simultaneousTimer >= 5.0) {
        this.solved = true;
        ctx.emitNoise('door', this.blastDoorPosition, 0.7);
        ctx.emitWorldEvent('blast_doors_opened', { pos: this.blastDoorPosition });
      }
    } else {
      this.simultaneousTimer = 0;
    }
  }

  serialize(): GeneratorGridSnapshot {
    return {
      generators: this.generators.map((g) => ({ ...g, position: { ...g.position } })),
      simultaneousTimer: this.simultaneousTimer,
      solved: this.solved,
    };
  }

  hydrate(s: unknown): void {
    const snap = s as GeneratorGridSnapshot;
    const raw: GeneratorSlot[] = snap.generators.map((g) => ({ ...g, position: { ...g.position } }));
    const record = Object.fromEntries(raw.map((g) => [g.id, g]));
    this.generators = Object.assign(raw, record);
    this.simultaneousTimer = snap.simultaneousTimer;
    this.solved = snap.solved;
  }
}
