/* ── WakeEmitters.ts ───────────────────────────────────────────────────────
 *  Tracks up to 6 moving wake sources (player, monsters, remote entities).
 *  Uploads uniforms uWakes[6] and uWakeParams[6] for V-shaped Kelvin wakes.
 * ──────────────────────────────────────────────────────────────────────── */

import { Vector4 } from 'three';

export interface WakeSource {
  id: string;
  posX: number;
  posZ: number;
  dirX: number;
  dirZ: number;
  speed: number;
  width: number;
  length: number;
  strength: number;
  active: boolean;
}

export class WakeEmitters {
  static readonly MAX_WAKES = 6;
  readonly wakesUniform: Vector4[];
  readonly paramsUniform: Vector4[];
  private readonly sources: Map<string, WakeSource> = new Map();

  constructor() {
    this.wakesUniform = new Array<Vector4>(WakeEmitters.MAX_WAKES);
    this.paramsUniform = new Array<Vector4>(WakeEmitters.MAX_WAKES);

    for (let i = 0; i < WakeEmitters.MAX_WAKES; i++) {
      this.wakesUniform[i] = new Vector4(0, 0, 0, 0);
      this.paramsUniform[i] = new Vector4(0, 0, 0, 0);
    }
  }

  updateSource(
    id: string,
    posX: number,
    posZ: number,
    dirX: number,
    dirZ: number,
    speed: number,
    strength = 1.0,
    width = 0.8,
    length = 6.0,
  ): void {
    let src = this.sources.get(id);
    if (!src) {
      src = {
        id,
        posX,
        posZ,
        dirX,
        dirZ,
        speed,
        width,
        length,
        strength,
        active: true,
      };
      this.sources.set(id, src);
    } else {
      src.posX = posX;
      src.posZ = posZ;
      src.dirX = dirX;
      src.dirZ = dirZ;
      src.speed = speed;
      src.width = width;
      src.length = length;
      src.strength = strength;
      src.active = speed > 0.1;
    }
  }

  setInactive(id: string): void {
    const src = this.sources.get(id);
    if (src) src.active = false;
  }

  upload(): void {
    let slot = 0;
    for (const src of this.sources.values()) {
      if (!src.active || slot >= WakeEmitters.MAX_WAKES) continue;

      this.wakesUniform[slot]!.set(src.posX, src.posZ, src.dirX, src.dirZ);
      this.paramsUniform[slot]!.set(src.speed, src.width, src.length, src.strength);
      slot++;
    }

    // Zero out unused slots
    for (let i = slot; i < WakeEmitters.MAX_WAKES; i++) {
      this.wakesUniform[i]!.set(0, 0, 0, 0);
      this.paramsUniform[i]!.set(0, 0, 0, 0);
    }
  }
}
