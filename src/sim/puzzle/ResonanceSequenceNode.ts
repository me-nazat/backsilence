/* ── ResonanceSequenceNode.ts ──────────────────────────────────────────────
 *  Map 3: Echoing Marble Atrium 4-Bell Resonance sequence pure state machine.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../../types/contracts.js';
import type { PuzzleNode, PuzzleOp, PuzzleCtx } from './PuzzleTypes.js';

export interface ResonanceSequenceSnapshot {
  melody: number[];
  progress: number;
  solved: boolean;
}

export class ResonanceSequenceNode implements PuzzleNode {
  readonly id: string;
  readonly type = 'resonance_sequence';
  readonly melody: number[]; // Array of 4 note indices 0..3
  readonly exitGatePosition: Vec3;
  readonly bellPositions: Vec3[];

  progress = 0;
  solved = false;

  constructor(
    id: string,
    melody: number[],
    exitGatePosition: Vec3 = { x: 0, y: 0, z: 0 },
    bellPositions: Vec3[] = [],
  ) {
    this.id = id;
    this.melody = [...melody];
    this.exitGatePosition = { ...exitGatePosition };
    this.bellPositions = (bellPositions ?? []).map((p) => ({ ...p }));
  }

  get currentIndex(): number {
    return this.progress;
  }

  get gateOpen(): boolean {
    return this.solved;
  }

  apply(op: PuzzleOp, ctx: PuzzleCtx): void {
    if (this.solved) return;

    if (op.op === 'progress' || op.op === 'set') {
      let note: number;
      let bpos: Vec3;

      if (typeof op.value === 'number') {
        note = op.value;
        bpos = this.bellPositions[note] ?? this.exitGatePosition;
      } else if (typeof op.value === 'object' && op.value !== null) {
        const val = op.value as { noteIndex: number; bellPos?: Vec3 };
        note = val.noteIndex;
        bpos = val.bellPos ?? this.bellPositions[note] ?? this.exitGatePosition;
      } else {
        return;
      }

      // Ringing the bell always emits loud bell noise 0.9
      ctx.emitNoise('bell', bpos, 0.9);

      if (note === this.melody[this.progress]) {
        this.progress++;
        ctx.emitWorldEvent('bell_hit_correct', { noteIndex: note, progress: this.progress });

        if (this.progress === this.melody.length) {
          this.solved = true;
          ctx.emitNoise('door', this.exitGatePosition, 0.7);
          ctx.emitWorldEvent('gate_opened', { pos: this.exitGatePosition });
        }
      } else {
        // Wrong note: reset and emit alarm 0.5
        this.progress = 0;
        ctx.emitNoise('alarm', bpos, 0.5);
        ctx.emitWorldEvent('bell_hit_wrong', { noteIndex: note });
      }
    } else if (op.op === 'reset') {
      this.progress = 0;
    }
  }

  tick(_dt: number, _ctx: PuzzleCtx): void {}

  serialize(): ResonanceSequenceSnapshot {
    return {
      melody: [...this.melody],
      progress: this.progress,
      solved: this.solved,
    };
  }

  hydrate(s: unknown): void {
    const snap = s as ResonanceSequenceSnapshot;
    this.progress = snap.progress;
    this.solved = snap.solved;
  }
}
