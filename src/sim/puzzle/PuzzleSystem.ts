/* ── PuzzleSystem.ts ───────────────────────────────────────────────────────
 *  Container managing pure puzzle nodes, event routing, serialization,
 *  and win-state verification across all BackSilence maps.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3, PlayerId, NoiseKind } from '../../types/contracts.js';
import { Rng } from '../rng.js';
import type { PuzzleNode, PuzzleOp, PuzzleCtx } from './PuzzleTypes.js';

export class PuzzleSystem {
  private readonly nodes = new Map<string, PuzzleNode>();
  private readonly rng: Rng;
  private readonly nextRandom: () => number;

  /** Creates an isolated deterministic random stream for puzzle nodes. */
  constructor(seed = 0) {
    this.rng = new Rng(seed);
    this.nextRandom = this.rng.next.bind(this.rng);
  }

  registerNode(node: PuzzleNode): void {
    this.nodes.set(node.id, node);
  }

  getNode(id: string): PuzzleNode | undefined {
    return this.nodes.get(id);
  }

  getAllNodes(): PuzzleNode[] {
    return Array.from(this.nodes.values());
  }

  isSolved(id?: string): boolean {
    if (id) {
      return this.nodes.get(id)?.solved ?? false;
    }
    if (this.nodes.size === 0) return true;
    for (const node of this.nodes.values()) {
      if (!node.solved) return false;
    }
    return true;
  }

  dispatch(op: PuzzleOp, ctx: PuzzleCtx): void;
  dispatch(
    puzzleId: string,
    op: PuzzleOp['op'],
    value: unknown,
    actor: PlayerId,
    ctx: PuzzleCtx,
  ): void;
  dispatch(
    first: string | PuzzleOp,
    second?: PuzzleOp['op'] | PuzzleCtx,
    value?: unknown,
    actor?: PlayerId,
    ctx?: PuzzleCtx,
  ): void {
    if (typeof first === 'object') {
      const op = first;
      const puzzleCtx = second as PuzzleCtx;
      const node = this.nodes.get(op.puzzleId);
      if (node && puzzleCtx) {
        node.apply(op, puzzleCtx);
      }
      return;
    }
    const node = this.nodes.get(first);
    if (!node || !ctx) return;
    node.apply(
      {
        puzzleId: first,
        op: second as PuzzleOp['op'],
        value,
        actor: actor ?? 'player_local',
        t: ctx.now,
      },
      ctx,
    );
  }

  tick(dt: number, ctx: PuzzleCtx): void {
    for (const node of this.nodes.values()) {
      node.tick(dt, ctx);
    }
  }

  serialize(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [id, node] of this.nodes.entries()) {
      out[id] = node.serialize();
    }
    return out;
  }

  hydrate(data: Record<string, unknown>): void {
    for (const [id, snap] of Object.entries(data)) {
      const node = this.nodes.get(id);
      if (node) {
        node.hydrate(snap);
      }
    }
  }

  createDefaultContext(
    simTime: number,
    playerCount = 1,
    emitNoiseCb?: (kind: NoiseKind, pos: Vec3, loudness: number) => void,
    emitEventCb?: (type: string, data: unknown) => void,
  ): PuzzleCtx {
    return {
      now: simTime,
      playerCount,
      rng: this.nextRandom,
      emitNoise: emitNoiseCb ?? (() => {}),
      emitWorldEvent: emitEventCb ?? (() => {}),
    };
  }
}
