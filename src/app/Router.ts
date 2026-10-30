/* ── Router.ts ────────────────────────────────────────────────────────────
 *  Parses location.search once at boot. Never uses hash/path routing.
 *  Never reloads the page.
 * ──────────────────────────────────────────────────────────────────────── */

import { SAFE_ALPHABET, type MapId } from '../types/contracts.js';
import type { RoomCode } from '../types/contracts.js';

export interface ParsedRoute {
  /** Room code from ?room=XXXX, or null if absent/invalid. */
  room: RoomCode | null;
  /** Whether ?lab=1 or ?lab=ui was set. */
  lab: boolean;
  /** Specific lab identifier if ?lab=<name> */
  labMode?: string | null | undefined;
  /** Whether ?debug=1 was set. */
  debug: boolean;
  /** Current archive view from ?v=<view> */
  view?: string | null | undefined;
  /** Map from ?map=<id> */
  map?: MapId | null | undefined;
  /** Seed from ?seed=<n> */
  seed?: number | null | undefined;
  /** Whether ?sightlog=1 was set to monitor monster sightings. */
  sightlog?: boolean | undefined;
  /** Whether ?god=1 was set. */
  god?: boolean | undefined;
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

  const labParam = params.get('lab');
  const lab = labParam !== null && labParam !== '0';
  const labMode = labParam;

  const debug = params.get('debug') === '1';
  const view = params.get('v');
  const mapRaw = params.get('map') as MapId | null;
  const seedRaw = params.get('seed');
  const seed = seedRaw !== null ? parseInt(seedRaw, 10) : null;
  const sightlog = params.get('sightlog') === '1';
  const god = params.get('god') === '1';

  return { room, lab, labMode, debug, view, map: mapRaw, seed, sightlog, god };
}

/**
 * Update URL view using history.pushState while preserving ?room= and ?map=
 */
export function navigateToView(view: string, extraParams?: Record<string, string>): void {
  if (typeof window === 'undefined' || !window.history) return;
  const current = new URLSearchParams(window.location.search);
  current.set('v', view);
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      current.set(k, v);
    }
  }
  const newUrl = `${window.location.pathname}?${current.toString()}`;
  window.history.pushState({ view }, '', newUrl);
}
