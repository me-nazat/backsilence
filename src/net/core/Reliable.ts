/* ── Reliable.ts ──────────────────────────────────────────────────────────
 *  Reliable ordered event delivery over unreliable packet transports.
 *  - Sequence numbering on events
 *  - Receiver tracks highest contiguous sequence and acks
 *  - Retransmission on unacked events after 2 * RTT (up to 5 retries)
 *  - Duplicate rejection and in-order gap recovery
 * ──────────────────────────────────────────────────────────────────────── */

import type { NetEvent } from '../../types/contracts.js';

export interface ReliableMessage {
  seq: number;
  event: NetEvent;
}

interface PendingEvent {
  seq: number;
  event: NetEvent;
  lastSentMs: number;
  retries: number;
}

export class ReliableSender {
  private nextSeq = 1;
  private pending: PendingEvent[] = [];

  /**
   * Packages a new event with an incrementing sequence number.
   */
  enqueue(event: NetEvent, nowMs: number): ReliableMessage {
    const seq = this.nextSeq++;
    this.pending.push({
      seq,
      event,
      lastSentMs: nowMs,
      retries: 0,
    });
    return { seq, event };
  }

  /**
   * Acknowledges all events up to and including ackSeq.
   */
  handleAck(ackSeq: number): void {
    this.pending = this.pending.filter((p) => p.seq > ackSeq);
  }

  /**
   * Returns events that have not been acked within (2 * rttMs) timeout.
   */
  checkRetransmissions(nowMs: number, rttMs: number, maxRetries = 5): ReliableMessage[] {
    const timeout = Math.max(80, 2 * rttMs);
    const toResend: ReliableMessage[] = [];

    const remaining: PendingEvent[] = [];
    for (const item of this.pending) {
      if (nowMs - item.lastSentMs >= timeout) {
        if (item.retries < maxRetries) {
          item.retries++;
          item.lastSentMs = nowMs;
          toResend.push({ seq: item.seq, event: item.event });
          remaining.push(item);
        } else {
          // Exceeded max retries — drop
        }
      } else {
        remaining.push(item);
      }
    }
    this.pending = remaining;
    return toResend;
  }

  getPendingCount(): number {
    return this.pending.length;
  }

  clear(): void {
    this.pending = [];
    this.nextSeq = 1;
  }
}

export class ReliableReceiver {
  private highestContiguousSeq = 0;
  private outOfOrder = new Map<number, NetEvent>();

  /**
   * Processes an incoming sequenced event:
   * Returns list of ordered events ready for consumption (if in-order or gap filled),
   * or empty array if duplicate or buffered out-of-order.
   */
  receive(seq: number, event: NetEvent): NetEvent[] {
    // 1. Duplicate check
    if (seq <= this.highestContiguousSeq || this.outOfOrder.has(seq)) {
      return [];
    }

    // 2. Immediate next in-order
    if (seq === this.highestContiguousSeq + 1) {
      this.highestContiguousSeq = seq;
      const ready: NetEvent[] = [event];

      // Drain contiguous buffered events
      let check = this.highestContiguousSeq + 1;
      while (this.outOfOrder.has(check)) {
        const buffered = this.outOfOrder.get(check)!;
        this.outOfOrder.delete(check);
        ready.push(buffered);
        this.highestContiguousSeq = check;
        check++;
      }
      return ready;
    }

    // 3. Out-of-order arrival -> Buffer it
    if (this.outOfOrder.size < 128) {
      this.outOfOrder.set(seq, event);
    }
    return [];
  }

  getAckSeq(): number {
    return this.highestContiguousSeq;
  }

  clear(): void {
    this.highestContiguousSeq = 0;
    this.outOfOrder.clear();
  }
}
