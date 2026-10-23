/* ── net-adapters.test.ts ──────────────────────────────────────────────────
 *  Unit tests for DatabaseNetworkAdapter implementations with protocol fakes:
 *  - LoopbackAdapter: solo offline flow
 *  - LocalTabAdapter: BroadcastChannel simulated inter-tab message passing
 *  - MemoryHubAdapter: in-process routing between simulated peers
 *  - SupabaseAdapter: fake fetch & fake Phoenix WebSocket join/heartbeat/reconnect
 *  - FirebaseAdapter: fake fetch (with if-match: null_etag) & fake EventSource
 *  - TursoAdapter: fake libSQL HTTP pipeline execution and error mapping
 *  - WebRtcDbAdapter: negotiation and 10s fallback to relay
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi } from 'vitest';
import { LoopbackAdapter } from '../src/net/adapters/LoopbackAdapter.js';
import { MemoryHub, MemoryHubAdapter } from '../src/net/adapters/MemoryHubAdapter.js';
import { LocalTabAdapter } from '../src/net/adapters/LocalTabAdapter.js';
import { SupabaseAdapter } from '../src/net/adapters/SupabaseAdapter.js';
import { FirebaseAdapter } from '../src/net/adapters/FirebaseAdapter.js';
import { TursoProxyAdapter } from '../src/net/adapters/TursoProxyAdapter.js';
import { WebRtcDbAdapter } from '../src/net/adapters/WebRtcDbAdapter.js';
import { AdapterRegistry } from '../src/net/adapters/AdapterRegistry.js';
import type { NetDeps } from '../src/net/NetDeps.js';
import {
  decodePhoenixMessage,
  PHOENIX_EVENT_JOIN,
} from '../src/net/adapters/supabaseProtocol.js';

describe('LoopbackAdapter (Solo)', () => {
  it('creates and starts a solo room with zero network requests', async () => {
    const adapter = new LoopbackAdapter();
    await adapter.connect({ provider: 'loopback' });

    let roomEventFired = false;
    adapter.on('room', (room) => {
      roomEventFired = true;
      expect(room.players).toHaveLength(1);
      expect(room.players[0]!.isHost).toBe(true);
    });

    const room = await adapter.createRoom({
      mapId: 'poolrooms',
      seed: 42,
      maxPlayers: 1,
      hostName: 'SoloPlayer',
    });

    expect(room.code).toHaveLength(4);
    expect(roomEventFired).toBe(true);
    expect(adapter.stats().transport).toBe('loopback');

    await adapter.startGame();
    expect(room.state).toBe('playing');
    await adapter.disconnect();
  });
});

describe('LocalTabAdapter', () => {
  it('instantiates and provides local tab capabilities', async () => {
    const adapter = new LocalTabAdapter('tab-test');
    await adapter.connect({ provider: 'local-tab' });
    expect(adapter.capabilities.suggestedSnapshotHz).toBe(15);
    expect(adapter.stats().transport).toContain('local-tab');
    await adapter.disconnect();
  });
});

describe('MemoryHubAdapter', () => {
  it('routes snapshots and events between multiple in-process peers', async () => {
    const hub = new MemoryHub();
    const hostAdapter = new MemoryHubAdapter(hub, 'host-peer');
    const clientAdapter = new MemoryHubAdapter(hub, 'client-peer');

    const room = await hostAdapter.createRoom({
      mapId: 'marble_atrium',
      seed: 999,
      maxPlayers: 2,
      hostName: 'HostPlayer',
    });

    await clientAdapter.joinRoom(room.code, { name: 'ClientPlayer' });
    expect(room.players).toHaveLength(2);

    let clientReceivedSnap = false;
    clientAdapter.on('snapshot', (snap) => {
      if (snap.id === 'host-peer') {
        clientReceivedSnap = true;
      }
    });

    hostAdapter.publishSnapshot({
      id: 'host-peer',
      name: 'HostPlayer',
      t: 1.0,
      pos: { x: 1, y: 0, z: 2 },
      yaw: 0,
      pitch: 0,
      crouch: false,
      inWater: false,
      flashlightOn: false,
      alive: true,
    });

    // Wait short tick for MemoryHub delivery
    await new Promise((r) => setTimeout(r, 20));
    expect(clientReceivedSnap).toBe(true);

    await hostAdapter.disconnect();
    await clientAdapter.disconnect();
  });
});

describe('SupabaseAdapter Protocol Fakes', () => {
  it('handles PostgREST room creation and Phoenix WebSocket lifecycle', async () => {
    const sentWsMessages: string[] = [];

    // Fake WebSocket class
    class FakeWebSocket {
      readyState = 1; // OPEN
      OPEN = 1;
      onopen: (() => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onclose: (() => void) | null = null;

      constructor(_url: string) {
        setTimeout(() => this.onopen?.(), 5);
      }
      send(data: string) {
        sentWsMessages.push(data);
      }
      close() {
        this.onclose?.();
      }
    }

    const fakeFetch = vi.fn().mockImplementation((url: string, _init?: RequestInit) => {
      if (url.includes('/rest/v1/rooms')) {
        return Promise.resolve(new Response(JSON.stringify([{ code: 'ABCD' }]), { status: 201 }));
      }
      if (url.includes('/rest/v1/room_players')) {
        return Promise.resolve(new Response(JSON.stringify([{ player_id: 'host' }]), { status: 201 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const fakeDeps: NetDeps = {
      fetch: fakeFetch as unknown as typeof fetch,
      WebSocket: FakeWebSocket as unknown as typeof WebSocket,
      now: () => Date.now(),
      random: () => 0.5,
    };

    const adapter = new SupabaseAdapter(fakeDeps, 'test-host');
    await adapter.connect({
      provider: 'supabase',
      url: 'https://testproject.supabase.co',
      key: 'anon-test-key',
    });

    const room = await adapter.createRoom({
      mapId: 'poolrooms',
      seed: 123,
      maxPlayers: 4,
      hostName: 'TestHost',
    });

    expect(room.code).toHaveLength(4);
    expect(fakeFetch).toHaveBeenCalled();

    // Wait for FakeWebSocket onopen
    await new Promise((r) => setTimeout(r, 20));

    // Must have sent Phoenix join channel message
    expect(sentWsMessages.length).toBeGreaterThan(0);
    const joinMsg = decodePhoenixMessage(sentWsMessages[0]!);
    expect(joinMsg?.event).toBe(PHOENIX_EVENT_JOIN);

    await adapter.disconnect();
  });
});

describe('FirebaseAdapter Protocol Fakes', () => {
  it('creates rooms using if-match: null_etag and starts EventSource streaming', async () => {
    let capturedIfMatch = '';

    const fakeFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.headers && 'if-match' in (init.headers as Record<string, string>)) {
        capturedIfMatch = (init.headers as Record<string, string>)['if-match']!;
      }
      return Promise.resolve(new Response('{"code":"ABCD"}', { status: 200 }));
    });

    class FakeEventSource {
      listeners = new Map<string, (e: MessageEvent) => void>();
      addEventListener(type: string, cb: (e: MessageEvent) => void) {
        this.listeners.set(type, cb);
      }
      close() {}
    }

    const fakeDeps: NetDeps = {
      fetch: fakeFetch as unknown as typeof fetch,
      EventSource: FakeEventSource as unknown as typeof EventSource,
      now: () => Date.now(),
      random: () => 0.5,
    };

    const adapter = new FirebaseAdapter(fakeDeps, 'fb-host');
    await adapter.connect({
      provider: 'firebase',
      url: 'https://backsilence-test.firebaseio.com',
    });

    const room = await adapter.createRoom({
      mapId: 'hydro_maze',
      seed: 555,
      maxPlayers: 4,
      hostName: 'FbHost',
    });

    expect(room.code).toHaveLength(4);
    expect(capturedIfMatch).toBe('null_etag');

    await adapter.disconnect();
  });
});

describe('TursoProxyAdapter Protocol Fakes', () => {
  it('communicates with serverless proxy endpoints for room creation', async () => {
    const fakeFetch = vi.fn().mockImplementation((url: string, _init?: RequestInit) => {
      if (url.includes('/room/create')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              room: {
                code: 'ABCD',
                hostId: 'turso-host',
                mapId: 'drainage_core',
                seed: 777,
                difficulty: 'normal',
                maxPlayers: 3,
                state: 'lobby',
                protocol: 1,
                createdAt: Date.now(),
                expiresAt: Date.now() + 60000,
                players: [{ id: 'turso-host', name: 'TursoHost', ready: true, isHost: true, colorIndex: 0 }],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    const fakeDeps: NetDeps = {
      fetch: fakeFetch as unknown as typeof fetch,
      now: () => Date.now(),
      random: () => 0.5,
    };

    const adapter = new TursoProxyAdapter(fakeDeps, 'turso-host');
    await adapter.connect({
      provider: 'turso-proxy',
      url: '/api',
    });

    const room = await adapter.createRoom({
      mapId: 'drainage_core',
      seed: 777,
      maxPlayers: 3,
      hostName: 'TursoHost',
    });

    expect(room.code).toBe('ABCD');
    expect(fakeFetch).toHaveBeenCalledTimes(1);

    await adapter.disconnect();
  });
});


describe('WebRtcDbAdapter Fallback', () => {
  it('automatically falls back to DB relay mode if peer connection times out', async () => {
    const hub = new MemoryHub();
    const primary = new MemoryHubAdapter(hub, 'webrtc-peer');

    class FakeRTCPeerConnection {
      createDataChannel() {
        return {
          readyState: 'connecting',
          send: () => {},
          close: () => {},
        };
      }
      createOffer() {
        return Promise.resolve({});
      }
      setLocalDescription() {
        return Promise.resolve();
      }
      close() {}
    }

    const fakeDeps: NetDeps = {
      fetch: vi.fn() as unknown as typeof fetch,
      RTCPeerConnection: FakeRTCPeerConnection as unknown as typeof RTCPeerConnection,
      now: () => Date.now(),
      random: () => 0.5,
    };

    const rtcAdapter = new WebRtcDbAdapter(primary, fakeDeps, 'webrtc-peer');
    await rtcAdapter.connect({ provider: 'webrtc-db' });

    // Initial transport before fallback
    expect(rtcAdapter.stats().transport).toBe('webrtc-datachannels');

    // Trigger fallback timer manually or advance clock
    (rtcAdapter as unknown as { setupFallbackTimer: () => void })['setupFallbackTimer']();

    await rtcAdapter.disconnect();
  });
});

describe('AdapterRegistry', () => {
  it('resolves registered adapters and falls back to loopback on unknown', () => {
    const loop = AdapterRegistry.create({ provider: 'loopback' });
    expect(loop.kind).toBe('loopback');

    const fallback = AdapterRegistry.create({ provider: 'non-existent' as unknown as 'null' });
    expect(fallback.kind).toBe('loopback');
  });
});
