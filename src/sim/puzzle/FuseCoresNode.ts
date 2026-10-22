/* ── FuseCoresNode.ts ──────────────────────────────────────────────────────
 *  Map 4: Hydro-Filtration Maze 3-Fuse Core collection and socketing pure state machine.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../../types/contracts.js';
import type { PuzzleNode, PuzzleOp, PuzzleCtx } from './PuzzleTypes.js';

export interface FuseCoresSnapshot {
  totalCores: number;
  uncollectedCores: string[];
  carriedCores: number;
  insertedCores: number;
  shutterTimer: number;
  solved: boolean;
}

export class FuseCoresNode implements PuzzleNode {
  readonly id: string;
  readonly type = 'fuse_cores';
  readonly totalCores = 3;
  readonly bayPosition: Vec3;
  readonly shutterPosition: Vec3;
  readonly corePositions: Record<string, Vec3>;

  uncollectedCores: string[];
  carriedCores = 0;
  insertedCores = 0;
  shutterTimer = 0;
  solved = false;

  constructor(
    id: string,
    arg2: string[] | Vec3,
    arg3: Vec3,
    arg4?: Record<string, Vec3> | Vec3,
  ) {
    this.id = id;
    if (Array.isArray(arg2)) {
      this.uncollectedCores = [...arg2];
      this.bayPosition = { ...arg3 };
      this.shutterPosition = arg4 ? { ...(arg4 as Vec3) } : { x: 0, y: 0, z: 0 };
      this.corePositions = {};
      for (const cid of arg2) {
        this.corePositions[cid] = { x: 0, y: 0, z: 0 };
      }
    } else {
      this.bayPosition = { ...arg2 };
      this.shutterPosition = { ...arg3 };
      this.corePositions = arg4 ? { ...(arg4 as Record<string, Vec3>) } : {};
      this.uncollectedCores = Object.keys(this.corePositions);
    }
  }

  get insertedCount(): number {
    return this.insertedCores;
  }

  get shutterOpen(): boolean {
    return this.solved;
  }

  apply(op: PuzzleOp, ctx: PuzzleCtx): void {
    if (this.solved) return;

    if ((op.op === 'progress' || op.op === 'set') && typeof op.value === 'object' && op.value !== null) {
      const val = op.value as { action: 'pickup' | 'lift' | 'insert'; coreId?: string };

      if ((val.action === 'pickup' || val.action === 'lift') && val.coreId) {
        const idx = this.uncollectedCores.indexOf(val.coreId);
        if (idx >= 0) {
          this.uncollectedCores.splice(idx, 1);
          this.carriedCores++;
          ctx.emitWorldEvent('core_picked_up', {
            coreId: val.coreId,
            carried: this.carriedCores,
          });
        }
      } else if (val.action === 'insert') {
        if (this.carriedCores > 0 && this.insertedCores < this.totalCores) {
          this.carriedCores--;
          this.insertedCores++;

          // Emits door noise 0.4 at the bay
          ctx.emitNoise('door', this.bayPosition, 0.4);
          ctx.emitWorldEvent('core_inserted', {
            inserted: this.insertedCores,
            carried: this.carriedCores,
          });

          if (this.insertedCores === this.totalCores) {
            this.solved = true;
            this.shutterTimer = 6.0;
            ctx.emitNoise('door', this.shutterPosition, 0.7);
            ctx.emitWorldEvent('shutter_opened', { pos: this.shutterPosition });
          }
        }
      }
    } else if (op.op === 'reset') {
      this.uncollectedCores = Object.keys(this.corePositions);
      this.carriedCores = 0;
      this.insertedCores = 0;
      this.solved = false;
    }
  }

  tick(dt: number, ctx: PuzzleCtx): void {
    if (this.shutterTimer > 0) {
      this.shutterTimer = Math.max(0, this.shutterTimer - dt);
      if (this.shutterTimer > 0 && Math.floor((this.shutterTimer + dt) * 2) !== Math.floor(this.shutterTimer * 2)) {
        ctx.emitNoise('door', this.shutterPosition, 0.7);
      }
    }
  }

  serialize(): FuseCoresSnapshot {
    return {
      totalCores: this.totalCores,
      uncollectedCores: [...this.uncollectedCores],
      carriedCores: this.carriedCores,
      insertedCores: this.insertedCores,
      shutterTimer: this.shutterTimer,
      solved: this.solved,
    };
  }

  hydrate(s: unknown): void {
    const snap = s as FuseCoresSnapshot;
    this.uncollectedCores = [...snap.uncollectedCores];
    this.carriedCores = snap.carriedCores;
    this.insertedCores = snap.insertedCores;
    this.shutterTimer = snap.shutterTimer;
    this.solved = snap.solved;
  }
}
