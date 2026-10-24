/* ── MatchmakerPort.ts ──────────────────────────────────────────────────────
 *  Pure interface and local implementation for quick-play room matchmaking and ranked pairing.
 *  Returns an open public room for a mode by age or instructs room creation.
 *  Pure, serializable, deterministic. Zero DOM or Three.js dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

import type { GameModeId } from './ModeRules.js';

export interface PublicRoomListing {
  roomCode: string;
  mode: GameModeId;
  mapId: string;
  playerCount: number;
  maxPlayers: number;
  createdAt: number;
  isRanked: boolean;
  minSr?: number;
  maxSr?: number;
}

export interface MatchmakerMatchResult {
  action: 'join' | 'create';
  roomCode: string;
  room?: PublicRoomListing;
}

export interface MatchmakerPort {
  findMatch(
    mode: GameModeId,
    playerId: string,
    playerSr?: number,
    isRanked?: boolean,
  ): MatchmakerMatchResult;
  registerRoom(room: PublicRoomListing): void;
  unregisterRoom(roomCode: string): void;
  listRooms(mode?: GameModeId): readonly PublicRoomListing[];
}

export class LocalMatchmaker implements MatchmakerPort {
  private rooms = new Map<string, PublicRoomListing>();

  registerRoom(room: PublicRoomListing): void {
    this.rooms.set(room.roomCode, { ...room });
  }

  unregisterRoom(roomCode: string): void {
    this.rooms.delete(roomCode);
  }

  updatePlayerCount(roomCode: string, count: number): void {
    const r = this.rooms.get(roomCode);
    if (r) {
      r.playerCount = count;
      if (r.playerCount <= 0) {
        this.rooms.delete(roomCode);
      }
    }
  }

  listRooms(mode?: GameModeId): readonly PublicRoomListing[] {
    const list = Array.from(this.rooms.values());
    if (mode) {
      return list.filter((r) => r.mode === mode);
    }
    return list;
  }

  /**
   * Find an available open room for a mode.
   * If ranked, filters rooms within +/- 250 SR.
   * Sorts candidate rooms by oldest (first open room by age).
   */
  findMatch(
    mode: GameModeId,
    playerId: string,
    playerSr = 1000,
    isRanked = false,
  ): MatchmakerMatchResult {
    const candidates = Array.from(this.rooms.values()).filter((r) => {
      if (r.mode !== mode) return false;
      if (r.isRanked !== isRanked) return false;
      if (r.playerCount >= r.maxPlayers) return false;

      // Ranked SR tolerance (+/- 250 SR)
      if (isRanked && r.minSr !== undefined && r.maxSr !== undefined) {
        if (playerSr < r.minSr || playerSr > r.maxSr) return false;
      }
      return true;
    });

    if (candidates.length > 0) {
      // Sort oldest first (lowest createdAt)
      candidates.sort((a, b) => a.createdAt - b.createdAt);
      const chosen = candidates[0]!;
      return {
        action: 'join',
        roomCode: chosen.roomCode,
        room: { ...chosen },
      };
    }

    // No existing matching room; instruct client to create one
    // Deterministic room code generation
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    let hash = 0;
    const str = `${playerId}_${mode}_${isRanked}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    for (let i = 0; i < 4; i++) {
      code += chars[(hash >>> (i * 5)) % chars.length];
    }

    return {
      action: 'create',
      roomCode: code,
    };
  }
}
