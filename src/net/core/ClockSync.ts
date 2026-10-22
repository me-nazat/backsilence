/* ── ClockSync.ts ────────────────────────────────────────────────────────
 *  NTP-style clock synchronization against the room host.
 *  - Calculates round-trip time (RTT) and one-way clock offset
 *  - Keeps median of last 9 samples, weighted towards lowest RTT
 *  - Slews offset smoothly (never jumps > 20 ms per second)
 * ──────────────────────────────────────────────────────────────────────── */

export interface ClockSample {
  rtt: number;
  offset: number;
  t: number;
}

export class ClockSync {
  private samples: ClockSample[] = [];
  private readonly maxSamples = 9;
  private currentOffset = 0;
  private targetOffset = 0;
  private initialized = false;
  private readonly maxSlewPerSecond = 20.0; // max 20 ms adjustment per second

  private minRtt = 0;
  private smoothedJitter = 0;

  constructor(initialOffset = 0) {
    this.currentOffset = initialOffset;
    this.targetOffset = initialOffset;
  }

  /**
   * Records an NTP ping/pong round trip:
   * @param t0 Client transmit time (local)
   * @param t1 Host receive time (server)
   * @param t2 Host transmit time (server)
   * @param t3 Client receive time (local)
   */
  recordSample(t0: number, t1: number, t2: number, t3: number): void {
    const rtt = Math.max(0, (t3 - t0) - (t2 - t1));
    const offset = ((t1 - t0) + (t2 - t3)) / 2;

    this.samples.push({ rtt, offset, t: t3 });
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    this.recalculateTarget();
  }

  /**
   * Recalculates target offset using median of lowest-RTT samples.
   */
  private recalculateTarget(): void {
    if (this.samples.length === 0) return;

    // Sort by RTT ascending to find lowest RTTs
    const sortedByRtt = [...this.samples].sort((a, b) => a.rtt - b.rtt);
    this.minRtt = sortedByRtt[0]!.rtt;

    // Take the best 60% of samples (lowest RTT)
    const bestCount = Math.max(1, Math.ceil(sortedByRtt.length * 0.6));
    const bestSamples = sortedByRtt.slice(0, bestCount);

    // Sort those best samples by offset to get the median
    bestSamples.sort((a, b) => a.offset - b.offset);
    const medianSample = bestSamples[Math.floor(bestSamples.length / 2)]!;
    this.targetOffset = medianSample.offset;

    // Calculate jitter as mean absolute difference from minRtt
    let sumJitter = 0;
    for (const s of this.samples) {
      sumJitter += Math.abs(s.rtt - this.minRtt);
    }
    this.smoothedJitter = sumJitter / this.samples.length;

    // If uninitialized, snap immediately
    if (!this.initialized) {
      this.currentOffset = this.targetOffset;
      this.initialized = true;
    }
  }

  /**
   * Slews the clock offset towards target by at most maxSlewPerSecond.
   */
  update(dt: number): void {
    if (!this.initialized) return;

    const diff = this.targetOffset - this.currentOffset;
    if (Math.abs(diff) < 0.001) {
      this.currentOffset = this.targetOffset;
      return;
    }

    const maxDelta = this.maxSlewPerSecond * Math.max(0, dt);
    if (Math.abs(diff) <= maxDelta) {
      this.currentOffset = this.targetOffset;
    } else {
      this.currentOffset += Math.sign(diff) * maxDelta;
    }
  }

  /**
   * Translates current local time (Date.now()) to synchronized server time in ms.
   */
  serverNow(localNow?: number): number {
    const now = localNow ?? Date.now();
    return now + this.currentOffset;
  }

  getOffset(): number {
    return this.currentOffset;
  }

  getRtt(): number {
    return this.minRtt;
  }

  getJitter(): number {
    return this.smoothedJitter;
  }

  reset(): void {
    this.samples = [];
    this.initialized = false;
    this.currentOffset = 0;
    this.targetOffset = 0;
  }
}
