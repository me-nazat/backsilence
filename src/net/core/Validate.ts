/* ── Validate.ts ──────────────────────────────────────────────────────────
 *  Defensive runtime validators for network frames and events.
 *  Guarantees:
 *  - Strips control characters from text, clamps names to 16 characters
 *  - Verifies finite numbers and sensible boundaries
 *  - Enforces acoustic loudness ranges per NoiseKind
 *  - Teleport detection guard for player movements
 * ──────────────────────────────────────────────────────────────────────── */

import type {
  NetEvent,
  NoiseEvent,
  NoiseKind,
  Vec3,
} from '../../types/contracts.js';
import type { WireFrame } from './Codec.js';

export const MAX_PLAYER_NAME_LENGTH = 16;
export const MAX_MAP_BOUND = 250; // Absolute max boundary limit in meters (-250 to 250)
export const MAX_FRAME_EVENTS = 64;

/** Sanitize incoming player name: strips non-printable/control chars and truncates to 16 chars. */
export function sanitizePlayerName(raw: string): string {
  if (typeof raw !== 'string') return 'Player';
  let cleaned = '';
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if ((code >= 0x00 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f)) {
      continue;
    }
    cleaned += raw[i];
  }
  cleaned = cleaned.trim();
  if (cleaned.length === 0) return 'Player';
  return cleaned.slice(0, MAX_PLAYER_NAME_LENGTH);
}

/** Check if a Vec3 is well-formed with finite numbers within reasonable bounds. */
export function isValidVec3(v: unknown, maxBound = MAX_MAP_BOUND): v is Vec3 {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p['x'] === 'number' &&
    Number.isFinite(p['x']) &&
    Math.abs(p['x']) <= maxBound &&
    typeof p['y'] === 'number' &&
    Number.isFinite(p['y']) &&
    Math.abs(p['y']) <= maxBound &&
    typeof p['z'] === 'number' &&
    Number.isFinite(p['z']) &&
    Math.abs(p['z']) <= maxBound
  );
}

/** Validates that noise loudness does not exceed legal limits specified in ACOUSTIC_RULEBOOK.md. */
export function isValidNoiseLoudness(kind: NoiseKind, loudness: number): boolean {
  if (!Number.isFinite(loudness) || loudness < 0 || loudness > 1.0) return false;

  // Maximum allowed thresholds with 0.1 headroom for attenuation/multipliers
  switch (kind) {
    case 'wade':
      return loudness <= 0.65;
    case 'splash':
      return loudness <= 0.85;
    case 'jump_in':
      return loudness <= 1.0;
    case 'mantle':
      return loudness <= 0.55;
    case 'pebble':
      return loudness <= 0.75;
    case 'clack':
      return loudness <= 0.35;
    case 'clang':
      return loudness <= 0.45;
    case 'valve':
      return loudness <= 0.95;
    case 'generator':
      return loudness <= 1.0;
    case 'door':
      return loudness <= 0.85;
    case 'alarm':
      return loudness <= 1.0;
    case 'bell':
      return loudness <= 1.0;
    case 'beacon':
      return loudness <= 0.85;
    case 'scream':
    case 'roar':
      return loudness <= 1.0;
    default:
      return loudness <= 1.0;
  }
}

/** Validate individual NoiseEvent payload. */
export function isValidNoiseEvent(noise: unknown): noise is NoiseEvent {
  if (typeof noise !== 'object' || noise === null) return false;
  const n = noise as Record<string, unknown>;
  if (typeof n['id'] !== 'string' || typeof n['kind'] !== 'string') return false;
  if (!isValidVec3(n['position'])) return false;
  if (typeof n['loudness'] !== 'number' || !isValidNoiseLoudness(n['kind'] as NoiseKind, n['loudness'])) {
    return false;
  }
  if (typeof n['sourcePlayerId'] !== 'string') return false;
  if (typeof n['t'] !== 'number' || !Number.isFinite(n['t']) || n['t'] < 0) return false;
  return true;
}

/** Validate individual NetEvent payload. */
export function isValidNetEvent(ev: unknown): ev is NetEvent {
  if (typeof ev !== 'object' || ev === null) return false;
  const e = ev as Record<string, unknown>;
  const type = e['type'];
  if (typeof type !== 'string') return false;

  switch (type) {
    case 'noise':
      return isValidNoiseEvent(e['noise']);
    case 'ripple': {
      const r = e['ripple'] as Record<string, unknown> | undefined;
      return (
        typeof r === 'object' &&
        r !== null &&
        isValidVec3(r['position']) &&
        typeof r['strength'] === 'number' &&
        Number.isFinite(r['strength']) &&
        r['strength'] >= 0 &&
        r['strength'] <= 1.0
      );
    }
    case 'puzzle':
      return (
        typeof e['puzzleId'] === 'string' &&
        ['set', 'toggle', 'progress', 'reset'].includes(e['op'] as string) &&
        typeof e['t'] === 'number'
      );
    case 'puzzle_req': {
      const op = e['op'] as Record<string, unknown> | undefined;
      return (
        typeof op === 'object' &&
        op !== null &&
        typeof op['puzzleId'] === 'string' &&
        typeof op['actor'] === 'string' &&
        ['set', 'toggle', 'progress', 'reset'].includes(op['op'] as string)
      );
    }
    case 'death':
      return typeof e['playerId'] === 'string' && typeof e['t'] === 'number';
    case 'escape':
      return typeof e['playerId'] === 'string' && typeof e['t'] === 'number';
    case 'monster':
      return (
        typeof e['id'] === 'string' &&
        typeof e['state'] === 'string' &&
        isValidVec3(e['pos']) &&
        typeof e['yaw'] === 'number' &&
        Number.isFinite(e['yaw'])
      );
    case 'start':
      return (
        typeof e['startAtMs'] === 'number' &&
        typeof e['layoutHash'] === 'string' &&
        typeof e['playerCount'] === 'number'
      );
    case 'checkpoint':
      return typeof e['simT'] === 'number' && typeof e['seq'] === 'number';
    case 'projectile':
      return (
        typeof e['id'] === 'string' &&
        typeof e['item'] === 'string' &&
        isValidVec3(e['origin']) &&
        isValidVec3(e['vel']) &&
        typeof e['owner'] === 'string'
      );
    case 'ping_marker':
      return (
        typeof e['owner'] === 'string' &&
        isValidVec3(e['position']) &&
        typeof e['t'] === 'number'
      );
    case 'host_change':
      return typeof e['hostId'] === 'string';
    case 'round':
      return typeof e['state'] === 'string';
    default:
      return false;
  }
}

/**
 * Validates a parsed WireFrame. Returns true if frame is well-formed.
 */
export function isValidWireFrame(frame: unknown): frame is WireFrame {
  if (typeof frame !== 'object' || frame === null) return false;
  const f = frame as Record<string, unknown>;
  if (typeof f['v'] !== 'number' || typeof f['from'] !== 'string' || typeof f['seq'] !== 'number') {
    return false;
  }
  if (typeof f['t'] !== 'number' || !Number.isFinite(f['t'])) return false;

  if (f['snaps'] !== undefined) {
    if (typeof f['snaps'] !== 'object' || f['snaps'] === null) return false;
    for (const [id, snapData] of Object.entries(f['snaps'])) {
      if (typeof id !== 'string') return false;
      if (!Array.isArray(snapData) || snapData.length < 6) return false;
      for (let i = 0; i < snapData.length; i++) {
        if (typeof snapData[i] !== 'number' || !Number.isFinite(snapData[i])) return false;
      }
    }
  }

  if (f['ev'] !== undefined) {
    if (!Array.isArray(f['ev']) || f['ev'].length > MAX_FRAME_EVENTS) return false;
    for (const ev of f['ev']) {
      if (!isValidNetEvent(ev)) return false;
    }
  }

  if (f['ack'] !== undefined && (typeof f['ack'] !== 'number' || !Number.isFinite(f['ack']))) {
    return false;
  }

  return true;
}

/**
 * Guard against teleportation:
 * Rejects jumps larger than maxSprintSpeed * 1.5 * dt + 1.0m tolerance.
 */
export function isPlausibleMovement(
  lastPos: Vec3,
  newPos: Vec3,
  dt: number,
  maxSprintSpeed = 6.0,
): boolean {
  if (dt <= 0) return true;
  const dx = newPos.x - lastPos.x;
  const dy = newPos.y - lastPos.y;
  const dz = newPos.z - lastPos.z;
  const distSq = dx * dx + dy * dy + dz * dz;

  const maxAllowedDist = maxSprintSpeed * 1.5 * dt + 1.2;
  return distSq <= maxAllowedDist * maxAllowedDist;
}
