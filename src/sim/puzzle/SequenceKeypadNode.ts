/* ── SequenceKeypadNode.ts ────────────────────────────────────────────────
 *  Map 1: Sequence Keypad puzzle pure state machine.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../../types/contracts.js';
import type { PuzzleNode, PuzzleOp, PuzzleCtx } from './PuzzleTypes.js';

export interface SequenceKeypadSnapshot {
  code: number[];
  input: number[];
  attempts: number;
  lockoutTimer: number;
  solved: boolean;
}

export class SequenceKeypadNode implements PuzzleNode {
  readonly id: string;
  readonly type = 'sequence_keypad';
  readonly code: number[];
  readonly position: Vec3;

  input: number[] = [];
  attempts = 0;
  lockoutTimer = 0;
  solved = false;

  constructor(id: string, code: number[], position: Vec3) {
    this.id = id;
    this.code = [...code];
    this.position = { ...position };
  }

  get doorOpen(): boolean {
    return this.solved;
  }

  get currentInput(): number[] {
    return this.input;
  }

  get lockedOut(): boolean {
    return this.lockoutTimer > 0;
  }

  get lockTimer(): number {
    return this.lockoutTimer;
  }

  apply(op: PuzzleOp, ctx: PuzzleCtx): void {
    if (this.solved) return;

    if (op.op === 'reset') {
      this.input = [];
      return;
    }

    if ((op.op === 'progress' || op.op === 'set') && typeof op.value === 'number') {
      if (this.lockoutTimer > 0) return;

      const digit = Math.floor(op.value);
      if (digit < 0 || digit > 9) return;

      this.input.push(digit);

      if (this.input.length === this.code.length) {
        // Validate sequence
        let matches = true;
        for (let i = 0; i < this.code.length; i++) {
          if (this.input[i] !== this.code[i]) {
            matches = false;
            break;
          }
        }

        if (matches) {
          this.solved = true;
          ctx.emitNoise('door', this.position, 0.7);
          ctx.emitWorldEvent('door_unlocked', { id: this.id, pos: this.position });
        } else {
          this.input = [];
          this.attempts++;
          ctx.emitNoise('alarm', this.position, 0.8);
          ctx.emitWorldEvent('keypad_buzz', { attempts: this.attempts });

          if (this.attempts >= 3) {
            this.lockoutTimer = 20.0;
            ctx.emitWorldEvent('keypad_lockout', { duration: 20.0 });
          }
        }
      }
    }
  }

  tick(dt: number, _ctx: PuzzleCtx): void {
    if (this.lockoutTimer > 0) {
      this.lockoutTimer = Math.max(0, this.lockoutTimer - dt);
      if (this.lockoutTimer === 0) {
        this.attempts = 0;
      }
    }
  }

  serialize(): SequenceKeypadSnapshot {
    return {
      code: [...this.code],
      input: [...this.input],
      attempts: this.attempts,
      lockoutTimer: this.lockoutTimer,
      solved: this.solved,
    };
  }

  hydrate(s: unknown): void {
    const snap = s as SequenceKeypadSnapshot;
    this.input = [...snap.input];
    this.attempts = snap.attempts;
    this.lockoutTimer = snap.lockoutTimer;
    this.solved = snap.solved;
  }
}
