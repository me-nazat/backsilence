/* ── ModeRules.ts ──────────────────────────────────────────────────────────
 *  Rules, win conditions, and host-authoritative logic for multiplayer & challenge modes:
 *  - Co-op Escape
 *  - Silent Race (with halfway catch-up pebble rule)
 *  - Last One Dry (rising tide & progressive platform submergence)
 *  - Series match scoring
 *  - Spectator Haunting mechanics (Echo pool, anti-grief constraints)
 *  Pure, serializable, deterministic. Zero DOM or Three.js dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../types/contracts.js';

export type GameModeId =
  | 'campaign'
  | 'daily_descent'
  | 'endless_tide'
  | 'training_pool'
  | 'coop_escape'
  | 'silent_race'
  | 'last_one_dry'
  | 'series';

export interface PlayerStatus {
  id: string;
  alive: boolean;
  escaped: boolean;
  score: number;
  timeSurvived: number;
  finishTime?: number;
  placement?: number;
  pos: Vec3;
  pebbles: number;
  echo: number; // 0..100 (for haunting)
  hauntCooldown: number;
  hauntCount: number; // max 4
  catchUpGranted?: boolean;
}

export interface HauntAttemptResult {
  success: boolean;
  reason?: string;
  noiseEvent?: {
    position: Vec3;
    loudness: number;
    kind: 'splash';
  };
}

export const PLACEMENT_POINTS = [100, 65, 40, 20];

export class ModeRulesSession {
  readonly mode: GameModeId;
  private players: Map<string, PlayerStatus> = new Map();
  private simTime = 0;
  private tideY = 0; // for Last One Dry: 0 -> +0.5m over 360s
  private isMatchOver = false;
  private halfwayTime = 180; // halfway mark for 6 min race
  private finalPlatformSpawned = false;

  constructor(mode: GameModeId, playerIds: string[] = []) {
    this.mode = mode;
    for (const id of playerIds) {
      this.players.set(id, {
        id,
        alive: true,
        escaped: false,
        score: 0,
        timeSurvived: 0,
        pos: { x: 0, y: 0, z: 0 },
        pebbles: 3,
        echo: 0,
        hauntCooldown: 0,
        hauntCount: 0,
      });
    }
  }

  getWaterLevelAt(timeSec: number): number {
    return Math.min(0.5, (Math.max(0, timeSec) / 360) * 0.5);
  }

  setHauntState(
    playerId: string,
    state: { echo: number; lastHauntTime?: number; hauntCount?: number; hauntCooldown?: number },
  ): void {
    let p = this.players.get(playerId);
    if (!p) {
      p = {
        id: playerId,
        alive: false,
        escaped: false,
        score: 0,
        timeSurvived: 0,
        pos: { x: 0, y: 0, z: 0 },
        pebbles: 3,
        echo: state.echo,
        hauntCooldown: state.hauntCooldown ?? 0,
        hauntCount: state.hauntCount ?? 0,
      };
      this.players.set(playerId, p);
    } else {
      p.alive = false;
      p.echo = state.echo;
      if (state.hauntCount !== undefined) p.hauntCount = state.hauntCount;
      if (state.hauntCooldown !== undefined) p.hauntCooldown = state.hauntCooldown;
    }
  }

  checkSilentRaceCatchup(playerId: string, progress: number): { grantBonusPebbles: boolean; pebbleCount: number } {
    let p = this.players.get(playerId);
    if (!p) {
      p = {
        id: playerId,
        alive: true,
        escaped: false,
        score: 0,
        timeSurvived: 0,
        pos: { x: 0, y: 0, z: 0 },
        pebbles: 3,
        echo: 0,
        hauntCooldown: 0,
        hauntCount: 0,
      };
      this.players.set(playerId, p);
    }

    if (progress >= 0.5 && !p.catchUpGranted) {
      p.catchUpGranted = true;
      p.pebbles += 2;
      return { grantBonusPebbles: true, pebbleCount: 2 };
    }
    return { grantBonusPebbles: false, pebbleCount: 0 };
  }

  getPlayer(id: string): PlayerStatus | undefined {
    return this.players.get(id);
  }

  getAllPlayers(): PlayerStatus[] {
    return Array.from(this.players.values());
  }

  getTideY(): number {
    return this.tideY;
  }

  isFinalPlatformSpawned(): boolean {
    return this.finalPlatformSpawned;
  }

  step(dt: number): void {
    if (this.isMatchOver) return;
    this.simTime += dt;

    // Last One Dry: tide rises 0 -> +0.5m over 360s (6 mins)
    if (this.mode === 'last_one_dry') {
      this.tideY = Math.min(0.5, (this.simTime / 360.0) * 0.5);
      if (this.simTime >= 300.0 && !this.finalPlatformSpawned) {
        this.finalPlatformSpawned = true;
      }
    }

    // Silent Race: halfway catch-up rule (check last-place player at halfway mark)
    if (this.mode === 'silent_race' && this.simTime >= this.halfwayTime) {
      this.checkSilentRaceCatchUp();
    }

    // Update player statuses & Haunting Echo generation
    for (const p of this.players.values()) {
      if (p.alive && !p.escaped) {
        p.timeSurvived += dt;
      } else if (!p.alive) {
        // Eliminated player generates +4 Echo/sec up to 100
        p.echo = Math.min(100, p.echo + dt * 4.0);
        if (p.hauntCooldown > 0) {
          p.hauntCooldown = Math.max(0, p.hauntCooldown - dt);
        }
      }
    }

    this.checkWinConditions();
  }

  private checkSilentRaceCatchUp(): void {
    const living = Array.from(this.players.values()).filter((p) => p.alive && !p.escaped);
    if (living.length < 2) return;

    // Find the player with lowest Z progress (or lowest score)
    living.sort((a, b) => a.pos.z - b.pos.z);
    const lastPlace = living[0]!;

    if (!lastPlace.catchUpGranted) {
      lastPlace.pebbles += 2;
      lastPlace.catchUpGranted = true;
    }
  }

  recordPlayerPosition(id: string, pos: Vec3): void {
    const p = this.players.get(id);
    if (p) {
      p.pos.x = pos.x;
      p.pos.y = pos.y;
      p.pos.z = pos.z;
    }
  }

  recordPlayerEscape(id: string, score: number): void {
    const p = this.players.get(id);
    if (p && p.alive && !p.escaped) {
      p.escaped = true;
      p.score = score;
      p.finishTime = this.simTime;
      this.checkWinConditions();
    }
  }

  recordPlayerDeath(id: string): void {
    const p = this.players.get(id);
    if (p && p.alive && !p.escaped) {
      p.alive = false;
      this.checkWinConditions();
    }
  }

  attemptHaunt(
    haunterId: string,
    simTimeOrPos: number | Vec3,
    targetWaterPos?: Vec3,
    livingPositions?: Vec3[],
  ): {
    allowed: boolean;
    success: boolean;
    reason?: string;
    noiseEvent?: {
      position: Vec3;
      loudness: number;
      kind: 'splash';
    };
  } {
    let targetPos: Vec3;
    if (typeof simTimeOrPos === 'number') {
      targetPos = targetWaterPos!;
    } else {
      targetPos = simTimeOrPos;
    }

    const haunter = this.players.get(haunterId);
    if (!haunter || haunter.alive) {
      return { allowed: false, success: false, reason: 'Only eliminated spectators can haunt' };
    }
    if (this.mode === 'coop_escape') {
      return { allowed: false, success: false, reason: 'Haunting is disabled in co-op escape' };
    }
    if (haunter.hauntCount >= 4) {
      return { allowed: false, success: false, reason: 'Maximum hauntings (4) reached for this match' };
    }
    if (haunter.hauntCooldown > 0) {
      return { allowed: false, success: false, reason: `Haunt on cooldown (${haunter.hauntCooldown.toFixed(1)}s remaining)` };
    }
    if (haunter.echo < 50) {
      return { allowed: false, success: false, reason: 'Insufficient Echo (50 required)' };
    }

    // Check distance to living players
    const checkPositions: Vec3[] =
      livingPositions ??
      Array.from(this.players.values())
        .filter((p) => p.alive && !p.escaped)
        .map((p) => p.pos);

    for (const otherPos of checkPositions) {
      const dist = Math.hypot(targetPos.x - otherPos.x, targetPos.z - otherPos.z);
      if (dist < 12.0) {
        return { allowed: false, success: false, reason: `Target too close to a living player (${dist.toFixed(1)}m < 12m limit)` };
      }
    }

    haunter.echo -= 50;
    haunter.hauntCooldown = 20.0;
    haunter.hauntCount++;

    return {
      allowed: true,
      success: true,
      noiseEvent: {
        position: { ...targetPos },
        loudness: 0.5,
        kind: 'splash',
      },
    };
  }

  private checkWinConditions(): void {
    const all = Array.from(this.players.values());
    const aliveAndPlaying = all.filter((p) => p.alive && !p.escaped);

    switch (this.mode) {
      case 'coop_escape': {
        const anyEscaped = all.some((p) => p.escaped);
        const allDead = all.every((p) => !p.alive);
        if (anyEscaped || allDead) {
          this.isMatchOver = true;
          this.calculatePlacements();
        }
        break;
      }

      case 'silent_race': {
        const anyEscaped = all.some((p) => p.escaped);
        const allDone = all.every((p) => !p.alive || p.escaped);
        if (anyEscaped || allDone) {
          this.isMatchOver = true;
          this.calculatePlacements();
        }
        break;
      }

      case 'last_one_dry': {
        if (aliveAndPlaying.length <= 1) {
          this.isMatchOver = true;
          this.calculatePlacements();
        }
        break;
      }

      default:
        break;
    }
  }

  private calculatePlacements(): void {
    const list = Array.from(this.players.values());

    if (this.mode === 'silent_race') {
      // Order by escaped first (fastest finishTime), then by timeSurvived
      list.sort((a, b) => {
        if (a.escaped && b.escaped) return (a.finishTime ?? 9999) - (b.finishTime ?? 9999);
        if (a.escaped) return -1;
        if (b.escaped) return 1;
        return b.timeSurvived - a.timeSurvived;
      });
    } else if (this.mode === 'last_one_dry') {
      // Order by longest survival time
      list.sort((a, b) => b.timeSurvived - a.timeSurvived);
    } else {
      // Co-op or general: order by score
      list.sort((a, b) => b.score - a.score);
    }

    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      p.placement = i + 1;
      const pts = PLACEMENT_POINTS[i] ?? 10;
      p.score += pts;
    }
  }

  isOver(): boolean {
    return this.isMatchOver;
  }
}

export type ModeRulesEngine = ModeRulesSession;
export const ModeRulesEngine = ModeRulesSession;

