/* ── ValveSequenceNode.ts ──────────────────────────────────────────────────
 *  Map 2: Utility Tunnels 3-Valve Sequence pure state machine.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../../types/contracts.js';
import type { PuzzleNode, PuzzleOp, PuzzleCtx } from './PuzzleTypes.js';

export interface ValveSequenceSnapshot {
  expectedOrder: string[];
  completedValves: string[];
  activeValveId: string | null;
  activeValveHold: number;
  gateHold: number;
  gateUnlocked: boolean;
  solved: boolean;
}

export class ValveSequenceNode implements PuzzleNode {
  readonly id: string;
  readonly type = 'valve_sequence';
  readonly expectedOrder: string[]; // e.g. ['B', 'A', 'C']
  readonly gatePosition: Vec3;
  readonly valvePositions: Record<string, Vec3>;

  completedValves: string[] = [];
  activeValveId: string | null = null;
  activeValveHold = 0;
  gateHold = 0;
  gateUnlocked = false;
  solved = false;

  private noiseTimer = 0;

  constructor(
    id: string,
    expectedOrder: string[],
    gatePosition: Vec3,
    valvePositions: Record<string, Vec3>,
  ) {
    this.id = id;
    this.expectedOrder = [...expectedOrder];
    this.gatePosition = { ...gatePosition };
    this.valvePositions = { ...valvePositions };
  }

  get valveProgress(): Record<string, number> {
    const prog: Record<string, number> = {};
    for (const v of this.expectedOrder) {
      if (this.completedValves.includes(v)) {
        prog[v] = 4.0;
      } else if (this.activeValveId === v) {
        prog[v] = this.activeValveHold;
      } else {
        prog[v] = 0;
      }
    }
    return prog;
  }

  get valvesCompleted(): string[] {
    return this.completedValves;
  }

  get gateOpen(): boolean {
    return this.solved;
  }

  apply(op: PuzzleOp, ctx: PuzzleCtx): void {
    if (this.solved) return;

    if (op.op === 'progress' && typeof op.value === 'object' && op.value !== null) {
      const val = op.value as {
        target?: 'valve' | 'gate';
        valveId?: string;
        valve?: string;
        dt?: number;
        finished?: boolean;
        cancelled?: boolean;
      };

      const rawVid = val.valveId ?? val.valve;
      const isGate = val.target === 'gate' || rawVid === 'gate';

      if (isGate && this.gateUnlocked) {
        if (val.cancelled) {
          this.gateHold = 0;
          return;
        }

        const dt = val.dt ?? 0.1;
        this.gateHold += dt;

        this.noiseTimer += dt;
        if (this.noiseTimer >= 0.5) {
          this.noiseTimer = 0;
          ctx.emitNoise('door', this.gatePosition, 0.8);
        }

        if (this.gateHold >= 5.0 || val.finished) {
          this.solved = true;
          this.gateHold = 0;
          ctx.emitNoise('door', this.gatePosition, 0.8);
          ctx.emitWorldEvent('gate_opened', { pos: this.gatePosition });
        }
      } else if (!isGate && rawVid) {
        const vid = rawVid;
        const vpos = this.valvePositions[vid] ?? this.gatePosition;

        if (val.cancelled) {
          this.activeValveId = null;
          this.activeValveHold = 0;
          return;
        }

        // Advance hold
        this.activeValveId = vid;
        const dt = val.dt ?? 0.1;
        this.activeValveHold += dt;

        // Sustained noise every 0.5s
        this.noiseTimer += dt;
        if (this.noiseTimer >= 0.5) {
          this.noiseTimer = 0;
          ctx.emitNoise('valve', vpos, 0.8);
        }

        if (this.activeValveHold >= 4.0 || val.finished) {
          this.activeValveHold = 0;
          this.activeValveId = null;

          // Check if already completed
          if (this.completedValves.includes(vid)) return;

          const nextExpected = this.expectedOrder[this.completedValves.length];
          if (vid === nextExpected) {
            this.completedValves.push(vid);
            ctx.emitWorldEvent('valve_completed', { valveId: vid, count: this.completedValves.length });

            if (this.completedValves.length === this.expectedOrder.length) {
              this.gateUnlocked = true;
              ctx.emitWorldEvent('gate_ready', {});
            }
          } else {
            // Pressure surge: wrong valve order
            this.completedValves = [];
            this.gateUnlocked = false;
            ctx.emitNoise('alarm', vpos, 0.9);
            ctx.emitWorldEvent('steam_surge', { duration: 4.0 });
          }
        }
      }
    } else if (op.op === 'reset') {
      const val = (op.value as { valve?: string; valveId?: string } | undefined);
      const vid = val?.valve ?? val?.valveId;
      if (vid && this.activeValveId === vid) {
        this.activeValveId = null;
        this.activeValveHold = 0;
      } else if (!vid) {
        this.completedValves = [];
        this.activeValveId = null;
        this.activeValveHold = 0;
        this.gateHold = 0;
        this.gateUnlocked = false;
      }
    }
  }

  tick(_dt: number, _ctx: PuzzleCtx): void {}

  serialize(): ValveSequenceSnapshot {
    return {
      expectedOrder: [...this.expectedOrder],
      completedValves: [...this.completedValves],
      activeValveId: this.activeValveId,
      activeValveHold: this.activeValveHold,
      gateHold: this.gateHold,
      gateUnlocked: this.gateUnlocked,
      solved: this.solved,
    };
  }

  hydrate(s: unknown): void {
    const snap = s as ValveSequenceSnapshot;
    this.completedValves = [...snap.completedValves];
    this.activeValveId = snap.activeValveId;
    this.activeValveHold = snap.activeValveHold;
    this.gateHold = snap.gateHold;
    this.gateUnlocked = snap.gateUnlocked;
    this.solved = snap.solved;
  }
}
