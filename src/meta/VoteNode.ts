/* ── VoteNode.ts ───────────────────────────────────────────────────────────
 *  Pure, deterministic map/mode voting node for Series and multiplayer lobbies.
 *  Handles player submissions, tallying, and deterministic tie-breaking.
 * ──────────────────────────────────────────────────────────────────────── */

export interface VoteOption {
  id: string;
  label: string;
}

export class VoteNode {
  private votes = new Map<string, string>(); // playerId -> optionId
  private options: VoteOption[];

  constructor(options: VoteOption[]) {
    this.options = [...options];
  }

  castVote(playerId: string, optionId: string): boolean {
    if (!this.options.some((opt) => opt.id === optionId)) {
      return false;
    }
    this.votes.set(playerId, optionId);
    return true;
  }

  getTally(): Record<string, number> {
    const tally: Record<string, number> = {};
    for (const opt of this.options) {
      tally[opt.id] = 0;
    }
    for (const optId of this.votes.values()) {
      tally[optId] = (tally[optId] ?? 0) + 1;
    }
    return tally;
  }

  resolveWinner(tieBreakSeed = 0): VoteOption {
    const tally = this.getTally();
    let maxVotes = -1;
    let candidates: VoteOption[] = [];

    for (const opt of this.options) {
      const v = tally[opt.id] ?? 0;
      if (v > maxVotes) {
        maxVotes = v;
        candidates = [opt];
      } else if (v === maxVotes) {
        candidates.push(opt);
      }
    }

    if (candidates.length === 1) {
      return candidates[0]!;
    }

    // Deterministic tie-breaker
    const idx = Math.abs(tieBreakSeed) % candidates.length;
    return candidates[idx]!;
  }

  reset(): void {
    this.votes.clear();
  }
}
