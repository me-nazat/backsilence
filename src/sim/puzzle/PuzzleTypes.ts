/* ── PuzzleTypes.ts ────────────────────────────────────────────────────────
 *  Pure simulation contracts for the BackSilence puzzle framework.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3, PlayerId, NoiseKind } from '../../types/contracts.js';

export interface PuzzleOp {
  puzzleId: string;
  op: 'set' | 'toggle' | 'progress' | 'reset';
  value?: unknown;
  actor: PlayerId;
  t: number;
}

export interface PuzzleCtx {
  now: number;
  rng: () => number;
  playerCount: number;
  emitNoise: (kind: NoiseKind, pos: Vec3, loudness: number) => void;
  emitWorldEvent: (type: string, data: unknown) => void;
}

export interface PuzzleNode {
  readonly id: string;
  readonly type: string;
  apply(op: PuzzleOp, ctx: PuzzleCtx): void;
  tick(dt: number, ctx: PuzzleCtx): void;
  serialize(): unknown;
  hydrate(s: unknown): void;
  readonly solved: boolean;
}
