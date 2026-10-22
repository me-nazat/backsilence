/* ── Codec.ts ─────────────────────────────────────────────────────────────
 *  Quantization and serialization for BackSilence network wire frames.
 *  Positions: 1 cm (x100 int)
 *  Angles: 1/1000 rad (x1000 int)
 *  Booleans/flags: Bit-packed into an unsigned integer
 * ──────────────────────────────────────────────────────────────────────── */

import {
  PROTOCOL_VERSION,
  type NetPlayerSnapshot,
  type NetEvent,
  type PlayerId,
} from '../../types/contracts.js';

/** Bit flags for player state. */
export const SNAP_FLAG_CROUCH = 1 << 0;
export const SNAP_FLAG_IN_WATER = 1 << 1;
export const SNAP_FLAG_FLASHLIGHT = 1 << 2;
export const SNAP_FLAG_ALIVE = 1 << 3;
export const SNAP_FLAG_ESCAPED = 1 << 4;

export interface WireFrame {
  v: number;
  from: PlayerId;
  seq: number;
  t: number;
  snaps?: Record<string, number[]>;
  ev?: NetEvent[];
  ack?: number;
}

/**
 * Encodes a NetPlayerSnapshot into a compact number array:
 * [x, y, z, yaw, pitch, flags, seq, t, colorIndex]
 * - x, y, z: in cm (1m = 100 units)
 * - yaw, pitch: in milliradians (1 rad = 1000 units)
 */
export function encodeSnapshot(s: NetPlayerSnapshot): number[] {
  const x = Math.round(s.pos.x * 100);
  const y = Math.round(s.pos.y * 100);
  const z = Math.round(s.pos.z * 100);
  const yaw = Math.round(s.yaw * 1000);
  const pitch = Math.round(s.pitch * 1000);

  let flags = 0;
  if (s.crouch) flags |= SNAP_FLAG_CROUCH;
  if (s.inWater) flags |= SNAP_FLAG_IN_WATER;
  if (s.flashlightOn) flags |= SNAP_FLAG_FLASHLIGHT;
  if (s.alive) flags |= SNAP_FLAG_ALIVE;
  if (s.escaped) flags |= SNAP_FLAG_ESCAPED;

  const seq = s.seq ?? 0;
  const t = Math.round(s.t * 1000);
  const colorIndex = s.colorIndex ?? 0;

  return [x, y, z, yaw, pitch, flags, seq, t, colorIndex];
}

/**
 * Decodes a compact number array back into a NetPlayerSnapshot.
 */
export function decodeSnapshot(
  id: PlayerId,
  name: string,
  arr: number[],
  carrying?: string,
): NetPlayerSnapshot {
  const x = (arr[0] ?? 0) / 100;
  const y = (arr[1] ?? 0) / 100;
  const z = (arr[2] ?? 0) / 100;
  const yaw = (arr[3] ?? 0) / 1000;
  const pitch = (arr[4] ?? 0) / 1000;
  const flags = arr[5] ?? 0;
  const seq = arr[6] ?? 0;
  const t = (arr[7] ?? 0) / 1000;
  const colorIndex = arr[8] ?? 0;

  return {
    id,
    name,
    t,
    pos: { x, y, z },
    yaw,
    pitch,
    crouch: (flags & SNAP_FLAG_CROUCH) !== 0,
    inWater: (flags & SNAP_FLAG_IN_WATER) !== 0,
    flashlightOn: (flags & SNAP_FLAG_FLASHLIGHT) !== 0,
    alive: (flags & SNAP_FLAG_ALIVE) !== 0,
    escaped: (flags & SNAP_FLAG_ESCAPED) !== 0,
    seq,
    carrying,
    colorIndex,
  };
}

/**
 * Serializes a WireFrame to a JSON string.
 */
export function encodeFrame(frame: WireFrame): string {
  return JSON.stringify(frame);
}

/**
 * Deserializes a raw JSON string to a WireFrame.
 * Returns null if parsing fails.
 */
export function decodeFrame(raw: string): WireFrame | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const f = parsed as Record<string, unknown>;
    if (typeof f['v'] !== 'number' || typeof f['from'] !== 'string' || typeof f['seq'] !== 'number') {
      return null;
    }
    return parsed as WireFrame;
  } catch {
    return null;
  }
}

export function createWireFrame(
  from: PlayerId,
  seq: number,
  t: number,
  snaps?: Record<string, number[]>,
  ev?: NetEvent[],
  ack?: number,
): WireFrame {
  const frame: WireFrame = {
    v: PROTOCOL_VERSION,
    from,
    seq,
    t,
  };
  if (snaps && Object.keys(snaps).length > 0) frame.snaps = snaps;
  if (ev && ev.length > 0) frame.ev = ev;
  if (ack !== undefined) frame.ack = ack;
  return frame;
}
