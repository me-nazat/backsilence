/* ── RateLimiter.ts ───────────────────────────────────────────────────────
 *  Token-bucket rate limiter and flood protection per peer and per event type.
 *  - Snapshots: <= 30/s
 *  - Events: <= 40/s
 *  - Ping markers: <= 1 per 1.5s
 *  - Tracks violations and recommends host kick after sustained abuse
 * ──────────────────────────────────────────────────────────────────────── */

import type { PlayerId } from '../../types/contracts.js';

interface Bucket {
  tokens: number;
  capacity: number;
  refillRate: number; // tokens per second
  lastRefillMs: number;
}

function createBucket(capacity: number, refillRate: number, nowMs: number): Bucket {
  return {
    tokens: capacity,
    capacity,
    refillRate,
    lastRefillMs: nowMs,
  };
}

function tryConsume(bucket: Bucket, count: number, nowMs: number): boolean {
  const dt = Math.max(0, (nowMs - bucket.lastRefillMs) / 1000);
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + dt * bucket.refillRate);
  bucket.lastRefillMs = nowMs;

  if (bucket.tokens >= count) {
    bucket.tokens -= count;
    return true;
  }
  return false;
}

export interface PeerRateState {
  snapBucket: Bucket;
  eventBucket: Bucket;
  pingBucket: Bucket;
  violations: number;
  lastViolationMs: number;
}

export class RateLimiter {
  private peers = new Map<PlayerId, PeerRateState>();
  private readonly maxViolationsBeforeKick = 40;
  private readonly violationCooldownMs = 10000; // 10s window

  private getOrCreate(peerId: PlayerId, nowMs: number): PeerRateState {
    let state = this.peers.get(peerId);
    if (!state) {
      state = {
        snapBucket: createBucket(30, 30, nowMs),
        eventBucket: createBucket(40, 40, nowMs),
        pingBucket: createBucket(1, 1 / 1.5, nowMs),
        violations: 0,
        lastViolationMs: 0,
      };
      this.peers.set(peerId, state);
    }
    return state;
  }

  checkSnapshot(peerId: PlayerId, nowMs: number): boolean {
    const s = this.getOrCreate(peerId, nowMs);
    const ok = tryConsume(s.snapBucket, 1, nowMs);
    if (!ok) {
      this.recordViolation(s, nowMs);
    }
    return ok;
  }

  checkEvent(peerId: PlayerId, eventType: string, nowMs: number): boolean {
    const s = this.getOrCreate(peerId, nowMs);

    // Special check for ping
    if (eventType === 'ping_marker') {
      const ok = tryConsume(s.pingBucket, 1, nowMs);
      if (!ok) {
        this.recordViolation(s, nowMs);
        return false;
      }
    }

    const ok = tryConsume(s.eventBucket, 1, nowMs);
    if (!ok) {
      this.recordViolation(s, nowMs);
    }
    return ok;
  }

  checkFrameSize(peerId: PlayerId, sizeBytes: number, maxBytes: number, nowMs: number): boolean {
    if (sizeBytes > maxBytes) {
      const s = this.getOrCreate(peerId, nowMs);
      this.recordViolation(s, nowMs);
      return false;
    }
    return true;
  }

  private recordViolation(state: PeerRateState, nowMs: number): void {
    if (nowMs - state.lastViolationMs > this.violationCooldownMs) {
      state.violations = 0;
    }
    state.violations++;
    state.lastViolationMs = nowMs;
  }

  shouldKick(peerId: PlayerId): boolean {
    const s = this.peers.get(peerId);
    if (!s) return false;
    return s.violations >= this.maxViolationsBeforeKick;
  }

  removePeer(peerId: PlayerId): void {
    this.peers.delete(peerId);
  }

  clear(): void {
    this.peers.clear();
  }
}
