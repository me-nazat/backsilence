/* ── CupBracket.ts ──────────────────────────────────────────────────────────
 *  Silent Cup 8-player tournament bracket system.
 *  Produces heats from a seeded shuffle, scores heats with Silent Race points,
 *  seeds the final of the top 4 by cup points, and handles dropouts/byes.
 *  Pure, serializable, deterministic. Zero DOM or Three.js dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

import { mulberry32 } from '../sim/rng.js';
import { PLACEMENT_POINTS } from './ModeRules.js';

export interface CupPlayer {
  id: string;
  name: string;
  heatPoints: number;
  finalPoints: number;
  totalPoints: number;
  eliminated: boolean;
  isBye?: boolean;
}

export interface CupHeat {
  heatId: string;
  name: string;
  playerIds: string[];
  completed: boolean;
  results: Array<{
    playerId: string;
    placement: number;
    points: number;
  }>;
}

export interface CupBracketSnapshot {
  cupId: string;
  seed: number;
  status: 'pending' | 'heats' | 'final' | 'completed';
  players: Record<string, CupPlayer>;
  heat1: CupHeat;
  heat2: CupHeat;
  finalHeat: CupHeat;
  championId: string | null;
}

export class CupBracket {
  cupId: string;
  readonly seed: number;
  private status: 'pending' | 'heats' | 'final' | 'completed' = 'pending';
  private players = new Map<string, CupPlayer>();
  private heat1: CupHeat;
  private heat2: CupHeat;
  private finalHeat: CupHeat;
  private championId: string | null = null;

  constructor(cupId: string, seed: number, playerList: Array<{ id: string; name?: string }> = []) {
    this.cupId = cupId;
    this.seed = seed;

    // Register up to 8 players, filling missing slots with BYE entries
    const playersFull: CupPlayer[] = [];
    for (let i = 0; i < 8; i++) {
      const p = playerList[i];
      if (p) {
        playersFull.push({
          id: p.id,
          name: p.name ?? p.id,
          heatPoints: 0,
          finalPoints: 0,
          totalPoints: 0,
          eliminated: false,
          isBye: false,
        });
      } else {
        playersFull.push({
          id: `bye_${i + 1}`,
          name: `[BYE ${i + 1}]`,
          heatPoints: 0,
          finalPoints: 0,
          totalPoints: 0,
          eliminated: true,
          isBye: true,
        });
      }
    }

    // Seeded shuffle of 8 players into two heats of 4
    const rng = mulberry32(seed);
    for (let i = playersFull.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const temp = playersFull[i]!;
      playersFull[i] = playersFull[j]!;
      playersFull[j] = temp;
    }

    for (const p of playersFull) {
      this.players.set(p.id, p);
    }

    this.heat1 = {
      heatId: `${cupId}_heat_1`,
      name: 'Heat 1 (Semifinal A)',
      playerIds: playersFull.slice(0, 4).map((p) => p.id),
      completed: false,
      results: [],
    };

    this.heat2 = {
      heatId: `${cupId}_heat_2`,
      name: 'Heat 2 (Semifinal B)',
      playerIds: playersFull.slice(4, 8).map((p) => p.id),
      completed: false,
      results: [],
    };

    this.finalHeat = {
      heatId: `${cupId}_final`,
      name: 'Silent Cup Grand Final',
      playerIds: [],
      completed: false,
      results: [],
    };

    this.status = 'heats';
  }

  recordHeatResult(heatIndex: 1 | 2, finishOrder: string[]): boolean {
    const heat = heatIndex === 1 ? this.heat1 : this.heat2;
    if (heat.completed) return false;

    // Award points (100, 65, 40, 20) ignoring BYE players
    const filteredOrder = finishOrder.filter((id) => heat.playerIds.includes(id));
    heat.results = [];

    for (let i = 0; i < filteredOrder.length; i++) {
      const pid = filteredOrder[i]!;
      const player = this.players.get(pid);
      const points = PLACEMENT_POINTS[i] ?? 20;

      if (player && !player.isBye) {
        player.heatPoints = points;
        player.totalPoints += points;
      }

      heat.results.push({
        playerId: pid,
        placement: i + 1,
        points: player?.isBye ? 0 : points,
      });
    }

    heat.completed = true;

    // If both heats are complete, seed the Grand Final with the top 4
    if (this.heat1.completed && this.heat2.completed) {
      this.seedGrandFinal();
    }

    return true;
  }

  private seedGrandFinal(): void {
    // Sort all active players by heat points (descending)
    const active = Array.from(this.players.values()).filter((p) => !p.isBye);
    active.sort((a, b) => {
      if (b.heatPoints !== a.heatPoints) {
        return b.heatPoints - a.heatPoints;
      }
      return a.id.localeCompare(b.id);
    });

    // Top 4 advance to the final
    const finalists = active.slice(0, 4);
    for (const p of active.slice(4)) {
      p.eliminated = true;
    }

    this.finalHeat.playerIds = finalists.map((p) => p.id);
    this.status = 'final';
  }

  recordFinalResult(finishOrder: string[]): boolean {
    if (this.status !== 'final' || this.finalHeat.completed) return false;

    const filteredOrder = finishOrder.filter((id) => this.finalHeat.playerIds.includes(id));
    this.finalHeat.results = [];

    for (let i = 0; i < filteredOrder.length; i++) {
      const pid = filteredOrder[i]!;
      const player = this.players.get(pid);
      const points = PLACEMENT_POINTS[i] ?? 20;

      if (player) {
        player.finalPoints = points;
        player.totalPoints += points;
      }

      this.finalHeat.results.push({
        playerId: pid,
        placement: i + 1,
        points,
      });
    }

    this.finalHeat.completed = true;
    this.status = 'completed';
    this.championId = filteredOrder[0] ?? null;

    return true;
  }

  getChampion(): CupPlayer | null {
    if (!this.championId) return null;
    return this.players.get(this.championId) ?? null;
  }

  getStatus(): 'pending' | 'heats' | 'final' | 'completed' {
    return this.status;
  }

  getHeat(heatIndex: 1 | 2): Readonly<CupHeat> {
    return heatIndex === 1 ? this.heat1 : this.heat2;
  }

  getFinalHeat(): Readonly<CupHeat> {
    return this.finalHeat;
  }

  getAllPlayers(): CupPlayer[] {
    return Array.from(this.players.values());
  }

  serialize(): CupBracketSnapshot {
    const players: Record<string, CupPlayer> = {};
    for (const [k, v] of this.players.entries()) {
      players[k] = { ...v };
    }
    return {
      cupId: this.cupId,
      seed: this.seed,
      status: this.status,
      players,
      heat1: {
        ...this.heat1,
        playerIds: [...this.heat1.playerIds],
        results: this.heat1.results.map((r) => ({ ...r })),
      },
      heat2: {
        ...this.heat2,
        playerIds: [...this.heat2.playerIds],
        results: this.heat2.results.map((r) => ({ ...r })),
      },
      finalHeat: {
        ...this.finalHeat,
        playerIds: [...this.finalHeat.playerIds],
        results: this.finalHeat.results.map((r) => ({ ...r })),
      },
      championId: this.championId,
    };
  }

  hydrate(snap: CupBracketSnapshot): void {
    this.cupId = snap.cupId;
    this.status = snap.status;
    this.championId = snap.championId;
    this.players.clear();
    for (const [k, v] of Object.entries(snap.players)) {
      this.players.set(k, { ...v });
    }
    this.heat1 = {
      ...snap.heat1,
      playerIds: [...snap.heat1.playerIds],
      results: snap.heat1.results.map((r) => ({ ...r })),
    };
    this.heat2 = {
      ...snap.heat2,
      playerIds: [...snap.heat2.playerIds],
      results: snap.heat2.results.map((r) => ({ ...r })),
    };
    this.finalHeat = {
      ...snap.finalHeat,
      playerIds: [...snap.finalHeat.playerIds],
      results: snap.finalHeat.results.map((r) => ({ ...r })),
    };
  }
}
