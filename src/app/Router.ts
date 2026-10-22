/* ── Router.ts ────────────────────────────────────────────────────────────
 *  Parses location.search once at boot. Never uses hash/path routing.
 *  Never reloads the page.
 * ──────────────────────────────────────────────────────────────────────── */

import { SAFE_ALPHABET, type MapId } from '../types/contracts.js';
import type { RoomCode } from '../types/contracts.js';

export interface ParsedRoute {
  /** Room code from ?room=XXXX, or null if absent/invalid. */
  room: RoomCode | null;
  /** Whether ?lab=1 was set. */
  lab: boolean;
  /** Whether ?debug=1 was set. */
  debug: boolean;
  /** Map from ?map=<id> */
  map?: MapId | null;
  /** Seed from ?seed=<n> */
  seed?: number | null;
}

/**
 * Validate a room code: must be exactly 4 chars from SAFE_ALPHABET.
 */
export function isValidRoomCode(code: string): code is RoomCode {
  if (code.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    if (!SAFE_ALPHABET.includes(code[i]!)) return false;
  }
  return true;
}

/**
 * Generate a random room code using the given PRNG.
 */
export function generateRoomCode(rng: () => number): RoomCode {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += SAFE_ALPHABET[Math.floor(rng() * SAFE_ALPHABET.length)];
  }
  return code;
}

/**
 * Parse the URL query string once at boot.
 * Accepts an optional search string for testing (defaults to location.search).
 */
export function parseRoute(search?: string): ParsedRoute {
  const raw = search ?? (typeof location !== 'undefined' ? location.search : '');
  const params = new URLSearchParams(raw);

  const roomRaw = params.get('room')?.toUpperCase() ?? null;
  const room = roomRaw !== null && isValidRoomCode(roomRaw) ? roomRaw : null;

  const lab = params.get('lab') === '1';
  const debug = params.get('debug') === '1';
  const mapRaw = params.get('map') as MapId | null;
  const seedRaw = params.get('seed');
  const seed = seedRaw !== null ? parseInt(seedRaw, 10) : null;

  return { room, lab, debug, map: mapRaw, seed };
}
