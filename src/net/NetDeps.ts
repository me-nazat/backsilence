/* ── NetDeps.ts ───────────────────────────────────────────────────────────
 *  Dependency injection interface for network adapters and session.
 *  Allows pure headless testing by injecting fake fetch, WebSocket,
 *  EventSource, and RTCPeerConnection implementations.
 * ──────────────────────────────────────────────────────────────────────── */

export interface NetDeps {
  fetch: typeof fetch;
  WebSocket?: typeof WebSocket | undefined;
  EventSource?: typeof EventSource | undefined;
  RTCPeerConnection?: typeof RTCPeerConnection | undefined;
  now: () => number;
  random: () => number;
}

export function defaultNetDeps(): NetDeps {
  return {
    fetch: typeof fetch !== 'undefined' ? fetch.bind(window) : (async () => { throw new Error('fetch unavailable'); }),
    WebSocket: typeof WebSocket !== 'undefined' ? WebSocket : undefined,
    EventSource: typeof EventSource !== 'undefined' ? EventSource : undefined,
    RTCPeerConnection: typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : undefined,
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    random: () => Math.random(),
  };
}
