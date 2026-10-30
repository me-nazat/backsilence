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
  /** Game mode descriptor (e.g. endless-tide, archive, daily-descent) */
  mode?: string | null | undefined;
  /** Archive tape identifier if ?tape=<id> */
  tape?: string | null | undefined;
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
  const mode = params.get('mode');
  const tape = params.get('tape');

  return { room, lab, labMode, debug, view, map: mapRaw, seed, sightlog, god, mode, tape };
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

/**
 * Clear the ?v= parameter using history.replaceState while preserving session parameters.
 */
export function clearViewParam(): void {
  if (typeof window === 'undefined' || !window.history) return;
  const current = new URLSearchParams(window.location.search);
  if (!current.has('v')) return;
  current.delete('v');
  const query = current.toString();
  const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, '', newUrl);
}

/**
 * Format game mode and tape parameters for granular URL query strings
 */
export function formatGameModeParam(mapId?: string, subMode?: string): { mode: string; tape?: string } {
  if (subMode === 'endless' || mapId === 'drainage_core') {
    return { mode: 'endless-tide' };
  }
  if (subMode === 'daily') {
    return { mode: 'daily-descent' };
  }
  if (subMode === 'training' || mapId === 'orientation') {
    return { mode: 'guided-practice' };
  }
  if (subMode === 'coop') {
    return { mode: 'co-op' };
  }
  if (subMode === 'race') {
    return { mode: 'silent-race' };
  }
  if (subMode === 'last_dry') {
    return { mode: 'last-one-dry' };
  }
  if (subMode === 'ghost') {
    return { mode: 'ghost-run' };
  }
  return { mode: 'archive', tape: mapId ?? 'natatorium' };
}

/**
 * Set the menu route to clean root URL '/' (or preserve room if present)
 */
export function setMenuRoute(push = true): void {
  if (typeof window === 'undefined' || !window.history) return;
  const current = new URLSearchParams(window.location.search);
  current.delete('v');
  current.delete('mode');
  current.delete('tape');
  current.delete('map');
  current.delete('seed');
  const room = current.get('room');
  const net = current.get('net');
  const god = current.get('god');
  const clean = new URLSearchParams();
  if (room) clean.set('room', room);
  if (net) clean.set('net', net);
  if (god) clean.set('god', god);
  const query = clean.toString();
  const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  if (push && window.location.search.length > 0) {
    window.history.pushState({ view: 'MENU' }, '', newUrl);
  } else {
    window.history.replaceState({ view: 'MENU' }, '', newUrl);
  }
}

/**
 * Set active gameplay route: '/?v=play&mode=<mode>&tape=<tape>&map=<mapId>&seed=<seed>'
 */
export function setGameRoute(mapId?: string, seed?: number, subMode?: string): void {
  if (typeof window === 'undefined' || !window.history) return;
  const current = new URLSearchParams(window.location.search);
  current.set('v', 'play');

  const { mode, tape } = formatGameModeParam(mapId, subMode);
  current.set('mode', mode);
  if (tape) {
    current.set('tape', tape);
  } else {
    current.delete('tape');
  }
  if (mapId) current.set('map', mapId);
  if (seed !== undefined && seed !== null) current.set('seed', String(seed));

  const query = current.toString();
  const newUrl = `${window.location.pathname}?${query}`;
  window.history.pushState({ state: 'PLAYING', view: 'play', map: mapId, seed, subMode, mode, tape }, '', newUrl);
}
