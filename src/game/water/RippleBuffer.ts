/* ── RippleBuffer.ts ───────────────────────────────────────────────────────
 *  Preallocated ring buffer managing active expanding ripple rings on the GPU.
 *  N = 8 / 16 / 32 by quality tier. Uploaded as uniform vec4 uRipples[32].
 * ──────────────────────────────────────────────────────────────────────── */

import { Vector4 } from 'three';
import type { GraphicsTier } from '../../types/contracts.js';

export class RippleBuffer {
  readonly capacity: number;
  readonly uniformArray: Vector4[];
  private head = 0;
  private activeCount = 0;

  constructor(tier: GraphicsTier = 'high') {
    this.capacity = tier === 'low' ? 8 : tier === 'medium' ? 16 : 32;
    this.uniformArray = new Array<Vector4>(32);
    // Initialize all 32 uniform vectors to prevent shader array undefined errors
    for (let i = 0; i < 32; i++) {
      this.uniformArray[i] = new Vector4(0, 0, -100, 0); // t0 in past = inactive
    }
  }

  addRipple(x: number, z: number, strength: number, t0: number): void {
    const slot = this.uniformArray[this.head]!;
    slot.set(x, z, t0, strength);

    this.head = (this.head + 1) % this.capacity;
    if (this.activeCount < this.capacity) {
      this.activeCount++;
    }

    // Strong events (strength near 1.0) spawn a second trailing ring
    if (strength >= 0.85) {
      const trailingSlot = this.uniformArray[this.head]!;
      trailingSlot.set(x, z, t0 + 0.12, strength * 0.55);

      this.head = (this.head + 1) % this.capacity;
      if (this.activeCount < this.capacity) {
        this.activeCount++;
      }
    }
  }

  get count(): number {
    return Math.min(this.activeCount, this.capacity);
  }

  clear(): void {
    this.head = 0;
    this.activeCount = 0;
    for (let i = 0; i < 32; i++) {
      this.uniformArray[i]!.set(0, 0, -100, 0);
    }
  }
}
