/* ── ModeRules.ts ──────────────────────────────────────────────────────────
 *  Rules, win conditions, and host-authoritative logic for multiplayer & challenge modes:
 *  - 10 Game Modes (Campaign, Daily Descent, Endless Tide, Ghost Run, Training Pool,
 *                   Co-op Escape, Silent Race, Last One Dry, Series, Silent Cup)
 *  - Silent Race halfway catch-up pebble rule (+2 pebbles once)
 *  - Last One Dry (tide rises 0 to 0.5m over 6 mins, platform order, minute 5 final platform)
 *  - Rewind Terminal rescue (Co-op: hold 20s, noise 0.6, restores dead teammate once/run)
 *  - Haunting mechanics (Echo pool, 4/s, 50 Echo, cooldown 20s, max 4/match, >=12m living, <=30m haunter)
 *  - Disconnect (>45s) and AFK (90s warn, 150s drop) handling
 *  - Tie-breaking: lower noise units, earlier finish tick, lower player id
 *  Pure, serializable, deterministic. Zero DOM or Three.js dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3, NoiseEvent } from '../types/contracts.js';
import { dHypot } from '../sim/dmath.js';

export type GameModeId =
  | 'campaign'
  | 'daily_descent'
  | 'endless_tide'
  | 'ghost_run'
  | 'training_pool'
  | 'coop_escape'
  | 'silent_race'
  | 'last_one_dry'
  | 'series'
  | 'silent_cup';

export interface PlayerStatus {
  id: string;
  alive: boolean;
  escaped: boolean;
  score: number;
  timeSurvived: number;
  finishTime?: number;
  finishTick?: number;
  noiseUnits: number;
  placement?: number;
  pos: Vec3;
  pebbles: number;
  echo: number; // 0..100 (for haunting)
  hauntCooldown: number;
  hauntCount: number; // max 4
  catchUpGranted?: boolean;
  isRanked?: boolean;
  disconnected?: boolean;
  disconnectTimer?: number;
  afkTimer?: number;
  afkWarned?: boolean;
  afkRemoved?: boolean;
  onSafeTile?: boolean;
}

export interface HauntAttemptResult {
  allowed: boolean;
  success: boolean;
  reason?: string;
  spiritStirsCue?: boolean;
  noiseEvent?: NoiseEvent;
}

export interface RewindTerminalState {
  available: boolean;
  position: Vec3;
  interactingPlayerId: string | null;
  holdTime: number; // requires 20s
  targetDeadPlayerId: string | null;
  used: boolean;
}

export const PLACEMENT_POINTS = [100, 65, 40, 20];

export interface ModeRulesSnapshot {
  mode: GameModeId;
  simTime: number;
  currentTick: number;
  tideY: number;
  isMatchOver: boolean;
  finalPlatformSpawned: boolean;
  terminal: RewindTerminalState;
  players: Record<string, PlayerStatus>;
  seriesMapIndex?: number;
  seriesScores?: Record<string, number>;
}

export class ModeRulesSession {
  readonly mode: GameModeId;
  private players = new Map<string, PlayerStatus>();
  private simTime = 0;
  private currentTick = 0;
  private tideY = 0; // Last One Dry: 0 -> +0.5m over 360s
  private isMatchOver = false;
  private halfwayTime = 180; // halfway mark for race
  private finalPlatformSpawned = false;
  private isRanked = false;

  // Co-op Rewind Terminal
  private terminal: RewindTerminalState = {
    available: true,
    position: { x: 0, y: 0.3, z: 0 },
    interactingPlayerId: null,
    holdTime: 0,
    targetDeadPlayerId: null,
    used: false,
  };

  // Series match tracking
  private seriesMapIndex = 0;
  private seriesScores = new Map<string, number>();

  constructor(mode: GameModeId, playerIds: string[] = [], isRanked = false) {
    this.mode = mode;
    this.isRanked = isRanked;
    for (const id of playerIds) {
      this.players.set(id, {
        id,
        alive: true,
        escaped: false,
        score: 0,
        timeSurvived: 0,
        noiseUnits: 0,
        pos: { x: 0, y: 0, z: 0 },
        pebbles: 3,
        echo: 0,
        hauntCooldown: 0,
        hauntCount: 0,
        isRanked,
        disconnected: false,
        disconnectTimer: 0,
        afkTimer: 0,
        afkWarned: false,
        afkRemoved: false,
        onSafeTile: true,
      });
      this.seriesScores.set(id, 0);
    }
  }

  getWaterLevelAt(timeSec: number): number {
    return Math.min(0.5, (Math.max(0, timeSec) / 360.0) * 0.5);
  }

  setTerminalPosition(pos: Vec3): void {
    this.terminal.position = { ...pos };
  }

  getTerminalState(): Readonly<RewindTerminalState> {
    return this.terminal;
  }

  step(dt: number): { spiritStirsCue?: boolean; terminalNoise?: NoiseEvent; rescuedPlayerId?: string } {
    if (this.isMatchOver) return {};
    this.simTime += dt;
    this.currentTick++;

    // 1. Last One Dry: tide rises 0 -> +0.5m over 360s (6 mins), platform appears at min 5
    if (this.mode === 'last_one_dry') {
      this.tideY = Math.min(0.5, (this.simTime / 360.0) * 0.5);
      if (this.simTime >= 300.0 && !this.finalPlatformSpawned) {
        this.finalPlatformSpawned = true;
      }
    }

    // 2. Silent Race: halfway catch-up rule (check last-place player at halfway mark)
    if (this.mode === 'silent_race' && this.simTime >= this.halfwayTime) {
      this.checkSilentRaceCatchUp();
    }

    // 3. Rewind Terminal interaction step (Co-op Escape)
    let terminalNoise: NoiseEvent | undefined;
    let rescuedPlayerId: string | undefined;

    if (this.mode === 'coop_escape' && this.terminal.available && !this.terminal.used) {
      if (this.terminal.interactingPlayerId) {
        const actor = this.players.get(this.terminal.interactingPlayerId);
        if (actor && actor.alive) {
          this.terminal.holdTime += dt;
          // Sustained noise 0.6 at the terminal during interaction
          terminalNoise = {
            id: `terminal_noise_${this.currentTick}`,
            kind: 'terminal',
            position: { ...this.terminal.position },
            loudness: 0.6,
            sourcePlayerId: actor.id,
            t: this.simTime,
          };

          if (this.terminal.holdTime >= 20.0) {
            // Restore one dead teammate
            const deadTeammate = Array.from(this.players.values()).find((p) => !p.alive && !p.disconnected);
            if (deadTeammate) {
              deadTeammate.alive = true;
              deadTeammate.pos = { ...this.terminal.position };
              rescuedPlayerId = deadTeammate.id;
            }
            this.terminal.used = true;
            this.terminal.available = false;
            this.terminal.interactingPlayerId = null;
          }
        } else {
          this.terminal.interactingPlayerId = null;
          this.terminal.holdTime = 0;
        }
      }
    }

    // 4. Update player statuses, AFK timers, Disconnect timers & Echo generation
    for (const p of this.players.values()) {
      if (p.disconnected || p.afkRemoved) continue;

      if (p.alive && !p.escaped) {
        p.timeSurvived += dt;

        // AFK tracking
        if (!p.onSafeTile) {
          p.afkTimer = (p.afkTimer ?? 0) + dt;
          if (p.afkTimer >= 90.0 && !p.afkWarned) {
            p.afkWarned = true;
          }
          if (p.afkTimer >= 150.0) {
            p.afkRemoved = true;
            p.alive = false;
          }
        } else {
          p.afkTimer = 0;
        }
      } else if (!p.alive) {
        // Eliminated player generates +4 Echo/sec up to 100
        p.echo = Math.min(100, p.echo + dt * 4.0);
        if (p.hauntCooldown > 0) {
          p.hauntCooldown = Math.max(0, p.hauntCooldown - dt);
        }
      }

      // Disconnect timeout check
      if (p.disconnectTimer && p.disconnectTimer > 0) {
        p.disconnectTimer += dt;
        if (p.disconnectTimer >= 45.0) {
          p.disconnected = true;
          p.alive = false;
        }
      }
    }

    this.checkWinConditions();

    const res: { spiritStirsCue?: boolean; terminalNoise?: NoiseEvent; rescuedPlayerId?: string } = {};
    if (terminalNoise) res.terminalNoise = terminalNoise;
    if (rescuedPlayerId) res.rescuedPlayerId = rescuedPlayerId;
    return res;
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
        noiseUnits: 0,
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

  startTerminalInteract(playerId: string): boolean {
    if (this.mode !== 'coop_escape') return false;
    if (!this.terminal.available || this.terminal.used) return false;
    const actor = this.players.get(playerId);
    if (!actor || !actor.alive) return false;

    // Check if there is any dead player to restore
    const hasDead = Array.from(this.players.values()).some((p) => !p.alive && !p.disconnected);
    if (!hasDead) return false;

    this.terminal.interactingPlayerId = playerId;
    return true;
  }

  cancelTerminalInteract(playerId: string): void {
    if (this.terminal.interactingPlayerId === playerId) {
      this.terminal.interactingPlayerId = null;
      this.terminal.holdTime = 0;
    }
  }

  private checkSilentRaceCatchUp(): void {
    const living = Array.from(this.players.values()).filter((p) => p.alive && !p.escaped && !p.disconnected);
    if (living.length < 2) return;

    // Find player in last place (least distance or lowest score)
    living.sort((a, b) => a.pos.z - b.pos.z);
    const lastPlace = living[0]!;

    if (!lastPlace.catchUpGranted) {
      lastPlace.pebbles += 2;
      lastPlace.catchUpGranted = true;
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
        noiseUnits: 0,
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

  recordPlayerInput(id: string, onSafeTile = false): void {
    const p = this.players.get(id);
    if (p) {
      p.afkTimer = 0;
      p.onSafeTile = onSafeTile;
    }
  }

  recordPlayerPacket(id: string): void {
    const p = this.players.get(id);
    if (p) {
      p.disconnectTimer = 0;
      p.disconnected = false;
    }
  }

  markPlayerDisconnected(id: string): void {
    const p = this.players.get(id);
    if (p) {
      p.disconnectTimer = 0.001;
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

  recordPlayerNoise(id: string, loudness: number): void {
    const p = this.players.get(id);
    if (p) {
      p.noiseUnits += loudness;
    }
  }

  recordPlayerEscape(id: string, score: number): void {
    const p = this.players.get(id);
    if (p && p.alive && !p.escaped) {
      p.escaped = true;
      p.score = score;
      p.finishTime = this.simTime;
      p.finishTick = this.currentTick;
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

  /**
   * Haunting mechanics:
   * Enabled in Last One Dry and Silent Race.
   * Disabled in Co-op and Ranked modes.
   * 50 Echo creates a 0.5 loudness noise event at a water spot >= 12m from all living players and <= 30m from haunter.
   * Cooldown 20s, max 4 per match.
   */
  attemptHaunt(
    haunterId: string,
    simTimeOrPos: number | Vec3,
    targetWaterPos?: Vec3,
    livingPositions?: Vec3[],
  ): HauntAttemptResult {
    let targetPos: Vec3;
    if (typeof simTimeOrPos === 'number') {
      targetPos = targetWaterPos!;
    } else {
      targetPos = simTimeOrPos;
    }

    if (this.isRanked) {
      return { allowed: false, success: false, reason: 'Haunting is disabled in Ranked mode' };
    }
    if (this.mode === 'coop_escape') {
      return { allowed: false, success: false, reason: 'Haunting is disabled in co-op escape' };
    }

    const haunter = this.players.get(haunterId);
    if (!haunter || haunter.alive) {
      return { allowed: false, success: false, reason: 'Only eliminated spectators can haunt' };
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

    // Constraint: within 30m of haunter position
    const distToHaunter = dHypot(targetPos.x - haunter.pos.x, targetPos.z - haunter.pos.z);
    if (distToHaunter > 30.0) {
      return { allowed: false, success: false, reason: `Target too far from haunter spectator camera (${distToHaunter.toFixed(1)}m > 30m limit)` };
    }

    // Constraint: at least 12m from every living player
    const checkPositions: Vec3[] =
      livingPositions ??
      Array.from(this.players.values())
        .filter((p) => p.alive && !p.escaped)
        .map((p) => p.pos);

    for (const otherPos of checkPositions) {
      const dist = dHypot(targetPos.x - otherPos.x, targetPos.z - otherPos.z);
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
      spiritStirsCue: true,
      noiseEvent: {
        id: `haunt_${this.currentTick}_${haunterId}`,
        kind: 'haunt',
        position: { ...targetPos },
        loudness: 0.5,
        sourcePlayerId: haunterId,
        t: this.simTime,
      },
    };
  }

  private checkWinConditions(): void {
    const all = Array.from(this.players.values()).filter((p) => !p.afkRemoved);
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

      case 'series': {
        const allDone = all.every((p) => !p.alive || p.escaped);
        if (allDone) {
          this.isMatchOver = true;
          this.calculatePlacements();
        }
        break;
      }

      default:
        break;
    }
  }

  /**
   * Tie-breaker rule from Section 7:
   * 1. Lower noise units
   * 2. Earlier finish tick
   * 3. Lower player id
   */
  private compareTies(a: PlayerStatus, b: PlayerStatus): number {
    if (a.noiseUnits !== b.noiseUnits) {
      return a.noiseUnits - b.noiseUnits;
    }
    const aTick = a.finishTick ?? 9999999;
    const bTick = b.finishTick ?? 9999999;
    if (aTick !== bTick) {
      return aTick - bTick;
    }
    return a.id.localeCompare(b.id);
  }

  private calculatePlacements(): void {
    const list = Array.from(this.players.values());

    if (this.mode === 'silent_race') {
      // Order by escaped first (fastest finishTime), break ties with compareTies
      list.sort((a, b) => {
        if (a.escaped && b.escaped) {
          const dt = (a.finishTime ?? 9999) - (b.finishTime ?? 9999);
          if (Math.abs(dt) > 0.001) return dt;
          return this.compareTies(a, b);
        }
        if (a.escaped) return -1;
        if (b.escaped) return 1;
        const survDiff = b.timeSurvived - a.timeSurvived;
        if (Math.abs(survDiff) > 0.001) return survDiff;
        return this.compareTies(a, b);
      });
    } else if (this.mode === 'last_one_dry') {
      // Order by longest survival time, then tie breaker
      list.sort((a, b) => {
        const survDiff = b.timeSurvived - a.timeSurvived;
        if (Math.abs(survDiff) > 0.001) return survDiff;
        return this.compareTies(a, b);
      });
    } else {
      // Co-op or general: order by score, then tie breaker
      list.sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (scoreDiff !== 0) return scoreDiff;
        return this.compareTies(a, b);
      });
    }

    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      p.placement = i + 1;
      const pts = PLACEMENT_POINTS[i] ?? 20;
      p.score += pts;
      const prevSeries = this.seriesScores.get(p.id) ?? 0;
      this.seriesScores.set(p.id, prevSeries + pts);
    }
  }

  isOver(): boolean {
    return this.isMatchOver;
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

  serialize(): ModeRulesSnapshot {
    const players: Record<string, PlayerStatus> = {};
    for (const [k, v] of this.players.entries()) {
      players[k] = { ...v, pos: { ...v.pos } };
    }
    const seriesScores: Record<string, number> = {};
    for (const [k, v] of this.seriesScores.entries()) {
      seriesScores[k] = v;
    }
    return {
      mode: this.mode,
      simTime: this.simTime,
      currentTick: this.currentTick,
      tideY: this.tideY,
      isMatchOver: this.isMatchOver,
      finalPlatformSpawned: this.finalPlatformSpawned,
      terminal: {
        ...this.terminal,
        position: { ...this.terminal.position },
      },
      players,
      seriesMapIndex: this.seriesMapIndex,
      seriesScores,
    };
  }

  hydrate(snap: ModeRulesSnapshot): void {
    this.simTime = snap.simTime;
    this.currentTick = snap.currentTick;
    this.tideY = snap.tideY;
    this.isMatchOver = snap.isMatchOver;
    this.finalPlatformSpawned = snap.finalPlatformSpawned;
    this.terminal = {
      ...snap.terminal,
      position: { ...snap.terminal.position },
    };
    this.players.clear();
    for (const [k, v] of Object.entries(snap.players)) {
      this.players.set(k, { ...v, pos: { ...v.pos } });
    }
    if (snap.seriesScores) {
      this.seriesScores.clear();
      for (const [k, v] of Object.entries(snap.seriesScores)) {
        this.seriesScores.set(k, v);
      }
    }
    this.seriesMapIndex = snap.seriesMapIndex ?? 0;
  }
}

export type ModeRulesEngine = ModeRulesSession;
export const ModeRulesEngine = ModeRulesSession;
