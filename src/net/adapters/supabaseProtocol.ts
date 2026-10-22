/* ── supabaseProtocol.ts ──────────────────────────────────────────────────
 *  Phoenix channel wire protocol constants and message encoders for
 *  raw Supabase Realtime WebSocket connections.
 * ──────────────────────────────────────────────────────────────────────── */

export const PHOENIX_TOPIC_HEARTBEAT = 'phoenix';
export const PHOENIX_EVENT_HEARTBEAT = 'heartbeat';
export const PHOENIX_EVENT_JOIN = 'phx_join';
export const PHOENIX_EVENT_LEAVE = 'phx_leave';
export const PHOENIX_EVENT_BROADCAST = 'broadcast';

export const SUPABASE_HEARTBEAT_INTERVAL_MS = 25000;
export const SUPABASE_RECONNECT_BASE_MS = 1000;
export const SUPABASE_RECONNECT_MAX_MS = 10000;

export interface PhoenixMessage {
  topic: string;
  event: string;
  payload: Record<string, unknown>;
  ref: string | null;
  join_ref?: string | null;
}

export function encodePhoenixMessage(msg: PhoenixMessage): string {
  return JSON.stringify([
    msg.join_ref ?? null,
    msg.ref ?? null,
    msg.topic,
    msg.event,
    msg.payload,
  ]);
}

export function decodePhoenixMessage(raw: string): PhoenixMessage | null {
  try {
    const arr = JSON.parse(raw) as unknown[];
    if (!Array.isArray(arr) || arr.length < 5) return null;
    return {
      join_ref: typeof arr[0] === 'string' ? arr[0] : null,
      ref: typeof arr[1] === 'string' ? arr[1] : null,
      topic: typeof arr[2] === 'string' ? arr[2] : '',
      event: typeof arr[3] === 'string' ? arr[3] : '',
      payload: typeof arr[4] === 'object' && arr[4] !== null ? (arr[4] as Record<string, unknown>) : {},
    };
  } catch {
    return null;
  }
}
