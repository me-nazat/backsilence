/* ── net-core.test.ts ──────────────────────────────────────────────────────
 *  Unit tests for BackSilence pure network core:
 *  - Codec & snapshot quantization (< 1cm, < 0.001 rad, fuzz 5000 frames)
 *  - Runtime validators (rejection of NaN/Infinity/oversized/illegal noise)
 *  - ClockSync (asymmetric RTT convergence, 20ms/s max slew)
 *  - Interp (linear lerp, shortest-arc angular wrap, damped extrapolation, 2m snap)
 *  - Reliable (out-of-order recovery, deduplication, retry queues)
 *  - RoomCode (alphabet purity, collision retry with fake DB, TTL)
 *  - RateLimiter (token buckets, sustained abuse detection)
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import {
  encodeSnapshot,
  decodeSnapshot,
  encodeFrame,
  decodeFrame,
  createWireFrame,
  type WireFrame,
} from '../src/net/core/Codec.js';
import {
  isValidWireFrame,
  isValidNetEvent,
  isValidNoiseEvent,
  isPlausibleMovement,
  sanitizePlayerName,
  isValidVec3,
} from '../src/net/core/Validate.js';
import { ClockSync } from '../src/net/core/ClockSync.js';
import {
  EntityInterpBuffer,
  normalizeAngle,
  lerpAngle,
  calculateAdaptiveInterpDelay,
} from '../src/net/core/Interp.js';
import { ReliableSender, ReliableReceiver } from '../src/net/core/Reliable.js';
import {
  isValidRoomCode,
  generateRoomCode,
  createWithRetry,
  ROOM_CODE_LENGTH,
  ROOM_EXPIRES_AFTER_MS,
} from '../src/net/core/RoomCode.js';
import { RateLimiter } from '../src/net/core/RateLimiter.js';
import { SAFE_ALPHABET, type NetPlayerSnapshot } from '../src/types/contracts.js';

describe('RoomCode', () => {
  it('generates 4-character codes using only SAFE_ALPHABET', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(isValidRoomCode(code)).toBe(true);
      for (const ch of code) {
        expect(SAFE_ALPHABET.includes(ch)).toBe(true);
      }
    }
  });

  it('rejects invalid codes (wrong length, illegal characters)', () => {
    expect(isValidRoomCode('ABC')).toBe(false);
    expect(isValidRoomCode('ABCDE')).toBe(false);
    expect(isValidRoomCode('AB01')).toBe(false); // 0 and 1 not in SAFE_ALPHABET
    expect(isValidRoomCode('ABIO')).toBe(false); // I and O not in SAFE_ALPHABET
  });

  it('retries on collision up to max retries', async () => {
    let attempts = 0;
    const fakeDbCreate = async (code: string) => {
      attempts++;
      if (attempts < 5) {
        const err = new Error('Collision (409 Conflict)');
        (err as unknown as Record<string, unknown>)['status'] = 409;
        throw err;
      }
      return { success: true, code };
    };

    const res = await createWithRetry(fakeDbCreate, 6);
    expect(res.success).toBe(true);
    expect(attempts).toBe(5);
  });

  it('verifies 6-hour room TTL constant', () => {
    expect(ROOM_EXPIRES_AFTER_MS).toBe(6 * 3600 * 1000);
  });
});

describe('Codec & Quantization', () => {
  it('encodes and decodes snapshots with quantization error <= 1 cm and <= 0.001 rad', () => {
    const original: NetPlayerSnapshot = {
      id: 'p-1',
      name: 'Alice',
      t: 12.345,
      pos: { x: 14.5678, y: -0.8912, z: 42.1234 },
      yaw: 1.234567,
      pitch: -0.456789,
      crouch: true,
      inWater: true,
      flashlightOn: false,
      alive: true,
      escaped: false,
      seq: 104,
      carrying: 'core-1',
      colorIndex: 3,
    };

    const encoded = encodeSnapshot(original);
    const decoded = decodeSnapshot('p-1', 'Alice', encoded, 'core-1');

    // Error <= 1cm (0.01m)
    expect(Math.abs(decoded.pos.x - original.pos.x)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(decoded.pos.y - original.pos.y)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(decoded.pos.z - original.pos.z)).toBeLessThanOrEqual(0.01);

    // Angular error <= 0.001 rad
    expect(Math.abs(decoded.yaw - original.yaw)).toBeLessThanOrEqual(0.001);
    expect(Math.abs(decoded.pitch - original.pitch)).toBeLessThanOrEqual(0.001);

    // Flags preserved
    expect(decoded.crouch).toBe(true);
    expect(decoded.inWater).toBe(true);
    expect(decoded.flashlightOn).toBe(false);
    expect(decoded.alive).toBe(true);
    expect(decoded.escaped).toBe(false);
    expect(decoded.seq).toBe(104);
    expect(decoded.colorIndex).toBe(3);
    expect(decoded.carrying).toBe('core-1');
  });

  it('round-trips full WireFrames through JSON serialization', () => {
    const frame: WireFrame = createWireFrame(
      'p-host',
      42,
      1700000000,
      {
        'p-1': [100, 200, 300, 500, -200, 11, 42, 1700000, 1],
      },
      [
        {
          type: 'noise',
          noise: {
            id: 'n-1',
            kind: 'splash',
            position: { x: 5, y: -0.5, z: 10 },
            loudness: 0.6,
            sourcePlayerId: 'p-1',
            t: 4.2,
          },
        },
      ],
      40,
    );

    const json = encodeFrame(frame);
    const decoded = decodeFrame(json);
    expect(decoded).not.toBeNull();
    expect(decoded!.from).toBe('p-host');
    expect(decoded!.seq).toBe(42);
    expect(decoded!.snaps?.['p-1']).toHaveLength(9);
    expect(decoded!.ev).toHaveLength(1);
    expect(decoded!.ack).toBe(40);
  });

  it('fuzzes 5,000 random frames: never throws, rejects corrupt data cleanly', () => {
    let validatedCount = 0;
    for (let i = 0; i < 5000; i++) {
      const isCorrupt = i % 2 === 0;
      const x = isCorrupt ? (i % 4 === 0 ? NaN : Infinity) : (i % 100) - 50;
      const snapArr = [x, 0, 0, 0, 0, 0, i, 1000];

      const rawObj = {
        v: isCorrupt ? 'invalid' : 1,
        from: isCorrupt && i % 3 === 0 ? 1234 : 'peer',
        seq: isCorrupt && i % 5 === 0 ? NaN : i,
        t: 100000 + i,
        snaps: { 'p-test': snapArr },
      };

      const json = JSON.stringify(rawObj);
      expect(() => {
        const decoded = decodeFrame(json);
        if (decoded && isValidWireFrame(decoded)) {
          validatedCount++;
        }
      }).not.toThrow();
    }
    // Only uncorrupted frames should validate
    expect(validatedCount).toBeGreaterThan(0);
    expect(validatedCount).toBeLessThan(5000);
  });
});

describe('Validate', () => {
  it('sanitizes player names and clamps to 16 chars', () => {
    expect(sanitizePlayerName('  NormalName  ')).toBe('NormalName');
    expect(sanitizePlayerName('A'.repeat(30))).toBe('A'.repeat(16));
    expect(sanitizePlayerName('Evil\x00Name\x1FTest')).toBe('EvilNameTest');
    expect(sanitizePlayerName('')).toBe('Player');
  });

  it('validates positions within map bounds and rejects NaN/Inf', () => {
    expect(isValidVec3({ x: 10, y: 0, z: -20 })).toBe(true);
    expect(isValidVec3({ x: NaN, y: 0, z: 0 })).toBe(false);
    expect(isValidVec3({ x: 0, y: Infinity, z: 0 })).toBe(false);
    expect(isValidVec3({ x: 9999, y: 0, z: 0 })).toBe(false); // exceeds MAX_MAP_BOUND
  });

  it('enforces legal loudness ranges per noise kind', () => {
    expect(
      isValidNoiseEvent({
        id: 'n-1',
        kind: 'clack',
        position: { x: 0, y: 0, z: 0 },
        loudness: 0.2,
        sourcePlayerId: 'p-1',
        t: 1.0,
      }),
    ).toBe(true);

    // clack cannot be 0.9 (max 0.35)
    expect(
      isValidNoiseEvent({
        id: 'n-2',
        kind: 'clack',
        position: { x: 0, y: 0, z: 0 },
        loudness: 0.9,
        sourcePlayerId: 'p-1',
        t: 1.0,
      }),
    ).toBe(false);
  });

  it('guards against teleportation jumps', () => {
    const posA = { x: 0, y: 0, z: 0 };
    const posB = { x: 0.5, y: 0, z: 0 };
    const posTeleport = { x: 50, y: 0, z: 0 };

    expect(isPlausibleMovement(posA, posB, 0.1)).toBe(true);
    expect(isPlausibleMovement(posA, posTeleport, 0.1)).toBe(false);
  });

  it('validates NetEvent shapes', () => {
    expect(
      isValidNetEvent({
        type: 'escape',
        playerId: 'p-1',
        t: 15.0,
      }),
    ).toBe(true);

    expect(
      isValidNetEvent({
        type: 'start',
        startAtMs: 12345678,
        layoutHash: 'abc123',
        playerCount: 2,
      }),
    ).toBe(true);

    expect(isValidNetEvent({ type: 'unknown_garbage' })).toBe(false);
  });
});

describe('ClockSync', () => {
  it('converges within 15 ms under asymmetric latency and jitter', () => {
    const sync = new ClockSync();
    const trueServerOffset = 1500; // Server is 1500 ms ahead of client

    // Simulate 15 NTP round trips
    let clientNow = 10000;
    for (let i = 0; i < 15; i++) {
      const t0 = clientNow;
      const oneWayClientToServer = 30 + (i % 3) * 5; // 30-40ms
      const t1 = t0 + trueServerOffset + oneWayClientToServer;
      const serverProcessing = 2;
      const t2 = t1 + serverProcessing;
      const oneWayServerToClient = 40 + (i % 2) * 8; // 40-48ms
      const t3 = t0 + oneWayClientToServer + serverProcessing + oneWayServerToClient;

      sync.recordSample(t0, t1, t2, t3);
      clientNow += 500;
      sync.update(0.5);
    }

    const calculatedServerNow = sync.serverNow(clientNow);
    const expectedServerNow = clientNow + trueServerOffset;
    const errorMs = Math.abs(calculatedServerNow - expectedServerNow);
    expect(errorMs).toBeLessThanOrEqual(15);
  });

  it('slews offset smoothly and never jumps > 20 ms per second', () => {
    const sync = new ClockSync(1000);
    // Sudden shift in latency/target offset by +100ms
    sync.recordSample(0, 1150, 1150, 100); // target jumps by +50ms

    const offsetBefore = sync.getOffset();
    sync.update(1.0); // 1.0 second elapsed
    const offsetAfter = sync.getOffset();

    const delta = Math.abs(offsetAfter - offsetBefore);
    expect(delta).toBeLessThanOrEqual(20.01);
  });
});

describe('Interp', () => {
  it('correctly interpolates positions and angles along shortest arc', () => {
    const buffer = new EntityInterpBuffer();
    buffer.addSnapshot(
      {
        id: 'p-1',
        name: 'Bob',
        t: 1.0,
        pos: { x: 0, y: 0, z: 0 },
        yaw: 3.10, // ~177 deg
        pitch: 0,
        crouch: false,
        inWater: false,
        flashlightOn: false,
        alive: true,
      },
      1000,
    );

    buffer.addSnapshot(
      {
        id: 'p-1',
        name: 'Bob',
        t: 2.0,
        pos: { x: 2, y: 0, z: 4 },
        yaw: -3.10, // ~ -177 deg (shortest arc is across PI boundary: only 0.08 rad diff!)
        pitch: 0.4,
        crouch: true,
        inWater: false,
        flashlightOn: true,
        alive: true,
      },
      2000,
    );

    const mid = buffer.sample(1500);
    expect(mid).not.toBeNull();
    expect(mid!.pos.x).toBeCloseTo(1.0, 1);
    expect(mid!.pos.z).toBeCloseTo(2.0, 1);
    expect(mid!.pitch).toBeCloseTo(0.2, 1);

    // Shortest arc midpoint between 3.10 and -3.10 is PI (~3.14159) or -PI
    expect(Math.abs(Math.abs(mid!.yaw) - Math.PI)).toBeLessThan(0.1);

    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(lerpAngle(0, Math.PI / 2, 0.5)).toBeCloseTo(Math.PI / 4);
  });

  it('damps velocity during extrapolation up to 250ms and caps beyond', () => {
    const buffer = new EntityInterpBuffer();
    buffer.addSnapshot(
      {
        id: 'p-1',
        name: 'Bob',
        t: 1.0,
        pos: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        crouch: false,
        inWater: false,
        flashlightOn: false,
        alive: true,
      },
      1000,
    );

    buffer.addSnapshot(
      {
        id: 'p-1',
        name: 'Bob',
        t: 2.0,
        pos: { x: 10, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        crouch: false,
        inWater: false,
        flashlightOn: false,
        alive: true,
      },
      2000,
    );

    // Sample at 2100ms (100ms into starvation) -> should extrapolate forward
    const extrap1 = buffer.sample(2100);
    expect(extrap1!.isExtrapolated).toBe(true);
    expect(extrap1!.pos.x).toBeGreaterThan(10.0);

    // Sample at 2500ms (> 250ms starvation) -> clamped, does not fly into infinity
    const extrapBeyond = buffer.sample(2500);
    expect(extrapBeyond!.isExtrapolated).toBe(true);
    expect(extrapBeyond!.pos.x).toBe(10.0);
  });

  it('snaps position when distance exceeds 2.0m threshold', () => {
    const buffer = new EntityInterpBuffer();
    buffer.addSnapshot(
      {
        id: 'p-1',
        name: 'Bob',
        t: 1.0,
        pos: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        crouch: false,
        inWater: false,
        flashlightOn: false,
        alive: true,
      },
      1000,
    );

    // Sudden 15-meter teleport
    buffer.addSnapshot(
      {
        id: 'p-1',
        name: 'Bob',
        t: 1.1,
        pos: { x: 15, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        crouch: false,
        inWater: false,
        flashlightOn: false,
        alive: true,
      },
      1100,
    );

    const mid = buffer.sample(1050);
    expect(mid!.pos.x).toBe(15); // Snapped directly to new pos without interpolating across the 15m
  });

  it('adapts interpolation delay to jitter', () => {
    expect(calculateAdaptiveInterpDelay(120, 10)).toBe(120);
    expect(calculateAdaptiveInterpDelay(120, 60)).toBe(160); // 2 * 60 + 40
    expect(calculateAdaptiveInterpDelay(120, 500)).toBe(700); // capped at 700ms
  });
});

describe('Reliable', () => {
  it('delivers sequenced events in order, handles gaps, and drops duplicates', () => {
    const receiver = new ReliableReceiver();

    const ev1 = { type: 'escape' as const, playerId: 'p-1', t: 1.0 };
    const ev2 = { type: 'escape' as const, playerId: 'p-2', t: 2.0 };
    const ev3 = { type: 'escape' as const, playerId: 'p-3', t: 3.0 };

    // Arrive out of order: seq 1, then seq 3, then seq 2
    const res1 = receiver.receive(1, ev1);
    expect(res1).toHaveLength(1);
    expect(res1[0]!.type).toBe('escape');
    expect(receiver.getAckSeq()).toBe(1);

    // Gap: receives 3 before 2
    const res3 = receiver.receive(3, ev3);
    expect(res3).toHaveLength(0); // buffered!
    expect(receiver.getAckSeq()).toBe(1);

    // Duplicate seq 1 arrives
    const dup = receiver.receive(1, ev1);
    expect(dup).toHaveLength(0);

    // Missing packet 2 arrives -> drains both 2 and 3 in order!
    const res2 = receiver.receive(2, ev2);
    expect(res2).toHaveLength(2);
    expect((res2[0] as { playerId: string }).playerId).toBe('p-2');
    expect((res2[1] as { playerId: string }).playerId).toBe('p-3');
    expect(receiver.getAckSeq()).toBe(3);
  });

  it('retransmits unacknowledged events after 2 * RTT', () => {
    const sender = new ReliableSender();
    const ev = { type: 'escape' as const, playerId: 'p-1', t: 1.0 };

    const packet = sender.enqueue(ev, 1000);
    expect(packet.seq).toBe(1);

    // At 1050ms with RTT 50ms (timeout = 100ms) -> not timed out
    expect(sender.checkRetransmissions(1050, 50)).toHaveLength(0);

    // At 1150ms -> timed out, triggers retransmission
    const resend = sender.checkRetransmissions(1150, 50);
    expect(resend).toHaveLength(1);
    expect(resend[0]!.seq).toBe(1);

    // Receiver acks seq 1
    sender.handleAck(1);
    expect(sender.getPendingCount()).toBe(0);
    expect(sender.checkRetransmissions(1500, 50)).toHaveLength(0);
  });
});

describe('RateLimiter', () => {
  it('enforces snapshot, event, and ping token buckets', () => {
    const limiter = new RateLimiter();
    const peer = 'peer-spammer';
    const now = 10000;

    // Ping: 1 per 1.5s
    expect(limiter.checkEvent(peer, 'ping_marker', now)).toBe(true);
    expect(limiter.checkEvent(peer, 'ping_marker', now + 100)).toBe(false); // rejected!
    expect(limiter.checkEvent(peer, 'ping_marker', now + 1600)).toBe(true); // refilled!

    // Snapshots: up to 30 bursts
    for (let i = 0; i < 30; i++) {
      expect(limiter.checkSnapshot(peer, now + 1600)).toBe(true);
    }
    // 31st snapshot rejected
    expect(limiter.checkSnapshot(peer, now + 1600)).toBe(false);
  });

  it('flags shouldKick after sustained abuse', () => {
    const limiter = new RateLimiter();
    const peer = 'malicious-peer';
    const now = 20000;

    // Cause 45 violations rapidly
    for (let i = 0; i < 45; i++) {
      limiter.checkEvent(peer, 'ping_marker', now + i);
    }

    expect(limiter.shouldKick(peer)).toBe(true);
  });
});
