/* ── Events.ts ───────────────────────────────────────────────────────────
 *  Preallocated, allocation-free event ring buffer and event contracts
 *  for the pure simulation layer.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3, NoiseKind, NoiseEvent, RippleEvent, PlayerId } from '../types/contracts.js';

export interface FootfallEvent {
  entityId: string;
  position: Vec3;
  force: number;
  isWater: boolean;
  t: number;
}

export interface DamageEvent {
  targetId: string;
  sourceId: string;
  amount: number;
  t: number;
}

export interface MantleEvent {
  playerId: string;
  from: Vec3;
  to: Vec3;
  t: number;
}

export type SimEvent =
  | { type: 'noise'; data: NoiseEvent }
  | { type: 'ripple'; data: RippleEvent }
  | { type: 'footfall'; data: FootfallEvent }
  | { type: 'damage'; data: DamageEvent }
  | { type: 'mantle'; data: MantleEvent };

/**
 * High-performance reusable ring buffer holding preallocated event slots.
 * Zero per-frame allocations during gameplay.
 */
export class EventRingBuffer {
  private readonly capacity: number;
  private readonly buffer: SimEvent[];
  private head = 0;
  private tail = 0;
  private count = 0;

  constructor(capacity = 256) {
    this.capacity = capacity;
    this.buffer = new Array<SimEvent>(capacity);
    // Pre-populate with default placeholder objects to avoid hidden-class transitions
    for (let i = 0; i < capacity; i++) {
      this.buffer[i] = {
        type: 'noise',
        data: {
          id: '',
          kind: 'wade',
          position: { x: 0, y: 0, z: 0 },
          loudness: 0,
          sourcePlayerId: 'world',
          t: 0,
        },
      };
    }
  }

  pushNoise(
    id: string,
    kind: NoiseKind,
    x: number,
    y: number,
    z: number,
    loudness: number,
    sourcePlayerId: PlayerId | 'world',
    t: number,
  ): void {
    const slot = this.buffer[this.head];
    if (!slot) return;
    slot.type = 'noise';
    const d = slot.data as NoiseEvent;
    d.id = id;
    d.kind = kind;
    d.position.x = x;
    d.position.y = y;
    d.position.z = z;
    d.loudness = loudness;
    d.sourcePlayerId = sourcePlayerId;
    d.t = t;

    this.advanceHead();
  }

  pushRipple(
    x: number,
    y: number,
    z: number,
    strength: number,
    sourcePlayerId: PlayerId | 'world',
    t: number,
  ): void {
    const slot = this.buffer[this.head];
    if (!slot) return;
    slot.type = 'ripple';
    let d = slot.data as RippleEvent;
    if (!d || !d.position) {
      d = { position: { x: 0, y: 0, z: 0 }, strength: 0, t: 0, sourcePlayerId: 'world' };
      slot.data = d;
    }
    d.position.x = x;
    d.position.y = y;
    d.position.z = z;
    d.strength = strength;
    d.sourcePlayerId = sourcePlayerId;
    d.t = t;

    this.advanceHead();
  }

  pushFootfall(
    entityId: string,
    x: number,
    y: number,
    z: number,
    force: number,
    isWater: boolean,
    t: number,
  ): void {
    const slot = this.buffer[this.head];
    if (!slot) return;
    slot.type = 'footfall';
    let d = slot.data as FootfallEvent;
    if (!d || !d.position) {
      d = { entityId: '', position: { x: 0, y: 0, z: 0 }, force: 0, isWater: false, t: 0 };
      slot.data = d;
    }
    d.entityId = entityId;
    d.position.x = x;
    d.position.y = y;
    d.position.z = z;
    d.force = force;
    d.isWater = isWater;
    d.t = t;

    this.advanceHead();
  }

  pushDamage(targetId: string, sourceId: string, amount: number, t: number): void {
    const slot = this.buffer[this.head];
    if (!slot) return;
    slot.type = 'damage';
    let d = slot.data as DamageEvent;
    if (!d) {
      d = { targetId: '', sourceId: '', amount: 0, t: 0 };
      slot.data = d;
    }
    d.targetId = targetId;
    d.sourceId = sourceId;
    d.amount = amount;
    d.t = t;

    this.advanceHead();
  }

  private advanceHead(): void {
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    } else {
      // Overwrote oldest item
      this.tail = (this.tail + 1) % this.capacity;
    }
  }

  /**
   * Inspect all pending events in chronological order without draining them.
   */
  peek(consumer: (event: SimEvent) => void): void {
    let idx = this.tail;
    for (let i = 0; i < this.count; i++) {
      const event = this.buffer[idx];
      if (event) {
        consumer(event);
      }
      idx = (idx + 1) % this.capacity;
    }
  }

  /**
   * Drain all pending events in chronological order, calling the consumer.
   * Clears count back to 0.
   */
  drain(consumer: (event: SimEvent) => void): void {
    while (this.count > 0) {
      const event = this.buffer[this.tail];
      if (event) {
        consumer(event);
      }
      this.tail = (this.tail + 1) % this.capacity;
      this.count--;
    }
    this.head = 0;
    this.tail = 0;
  }

  get length(): number {
    return this.count;
  }

  /**
   * Direct zero-allocation index accessor (0 = oldest, length - 1 = newest).
   */
  getAt(index: number): SimEvent | undefined {
    if (index < 0 || index >= this.count) return undefined;
    const idx = (this.tail + index) % this.capacity;
    return this.buffer[idx];
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }
}
