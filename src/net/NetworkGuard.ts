/* ── NetworkGuard.ts ──────────────────────────────────────────────────────
 *  Dev-time network guard for BackSilence.
 *  Enforces the Zero-Network Guarantee for solo play.
 *  Monkey-patches browser networking APIs to throw and record violations
 *  if called while in solo mode.
 * ──────────────────────────────────────────────────────────────────────── */

export interface NetworkGuardStats {
  violations: number;
  calls: Array<{ type: string; url?: string; time: number }>;
}

let violationCount = 0;
const recordedCalls: Array<{ type: string; url?: string; time: number }> = [];
let installed = false;

export function installNetworkGuard(isSoloActive: () => boolean): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // 1. fetch
  const originalFetch = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    if (isSoloActive()) {
      violationCount++;
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      recordedCalls.push({ type: 'fetch', url: urlStr, time: Date.now() });
      const err = new Error(`[NetworkGuard] Zero-Network Violation: fetch called in solo mode (${urlStr})`);
      console.error(err);
      throw err;
    }
    return originalFetch.call(window, input, init);
  };

  // 2. XMLHttpRequest
  if (typeof XMLHttpRequest !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...args: [boolean?, string?, string?]
    ) {
      if (isSoloActive()) {
        violationCount++;
        const urlStr = typeof url === 'string' ? url : url.href;
        recordedCalls.push({ type: 'xhr', url: urlStr, time: Date.now() });
        const err = new Error(`[NetworkGuard] Zero-Network Violation: XMLHttpRequest called in solo mode (${urlStr})`);
        console.error(err);
        throw err;
      }
      return originalOpen.apply(this, [method, url, ...(args as [boolean, string, string])]);
    };
  }

  // 3. WebSocket
  if (typeof WebSocket !== 'undefined') {
    const OriginalWebSocket = window.WebSocket;
    const GuardedWebSocket = function (this: WebSocket, url: string | URL, protocols?: string | string[]) {
      if (isSoloActive()) {
        violationCount++;
        const urlStr = typeof url === 'string' ? url : url.href;
        recordedCalls.push({ type: 'websocket', url: urlStr, time: Date.now() });
        const err = new Error(`[NetworkGuard] Zero-Network Violation: WebSocket created in solo mode (${urlStr})`);
        console.error(err);
        throw err;
      }
      return new OriginalWebSocket(url, protocols);
    } as unknown as typeof WebSocket;
    GuardedWebSocket.prototype = OriginalWebSocket.prototype;
    window.WebSocket = GuardedWebSocket;
  }

  // 4. EventSource
  if (typeof EventSource !== 'undefined') {
    const OriginalEventSource = window.EventSource;
    const GuardedEventSource = function (this: EventSource, url: string | URL, eventSourceInitDict?: EventSourceInit) {
      if (isSoloActive()) {
        violationCount++;
        const urlStr = typeof url === 'string' ? url : url.href;
        recordedCalls.push({ type: 'eventsource', url: urlStr, time: Date.now() });
        const err = new Error(`[NetworkGuard] Zero-Network Violation: EventSource created in solo mode (${urlStr})`);
        console.error(err);
        throw err;
      }
      return new OriginalEventSource(url, eventSourceInitDict);
    } as unknown as typeof EventSource;
    GuardedEventSource.prototype = OriginalEventSource.prototype;
    window.EventSource = GuardedEventSource;
  }

  // 5. RTCPeerConnection
  if (typeof RTCPeerConnection !== 'undefined') {
    const OriginalRTC = window.RTCPeerConnection;
    const GuardedRTC = function (this: RTCPeerConnection, configuration?: RTCConfiguration) {
      if (isSoloActive()) {
        violationCount++;
        recordedCalls.push({ type: 'webrtc', time: Date.now() });
        const err = new Error('[NetworkGuard] Zero-Network Violation: RTCPeerConnection created in solo mode');
        console.error(err);
        throw err;
      }
      return new OriginalRTC(configuration);
    } as unknown as typeof RTCPeerConnection;
    GuardedRTC.prototype = OriginalRTC.prototype;
    window.RTCPeerConnection = GuardedRTC;
  }

  // 6. sendBeacon
  if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url: string | URL, data?: BodyInit | null) {
      if (isSoloActive()) {
        violationCount++;
        const urlStr = typeof url === 'string' ? url : url.href;
        recordedCalls.push({ type: 'sendBeacon', url: urlStr, time: Date.now() });
        const err = new Error(`[NetworkGuard] Zero-Network Violation: sendBeacon called in solo mode (${urlStr})`);
        console.error(err);
        throw err;
      }
      return origBeacon(url, data);
    };
  }
}

export function getNetworkGuardStats(): NetworkGuardStats {
  return {
    violations: violationCount,
    calls: [...recordedCalls],
  };
}

export function resetNetworkGuardStats(): void {
  violationCount = 0;
  recordedCalls.length = 0;
}
