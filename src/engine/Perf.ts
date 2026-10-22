/* ── Perf.ts ──────────────────────────────────────────────────────────────
 *  Rolling FPS, frame time, draw call, and GPU memory metrics tracker.
 * ──────────────────────────────────────────────────────────────────────── */

import type { WebGLRenderer } from 'three';
import { TextureRegistry } from '../procedural/textures/TextureRegistry.js';

export interface PerfSnapshot {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  textureMemoryMB: string;
  jsHeapMB: string;
  menuInteractiveMs: number;
}

export class PerfTracker {
  private frameCount = 0;
  private lastTime = performance.now();
  private rollingFps = 60.0;
  private rollingFrameTime = 16.6;

  private menuInteractiveTime = 0;

  constructor() {
    this.recordMenuInteractive();
  }

  recordMenuInteractive(): void {
    const entries = performance.getEntriesByName('menu:interactive');
    if (entries.length > 0 && entries[0]) {
      this.menuInteractiveTime = Math.round(entries[0].startTime);
    } else {
      this.menuInteractiveTime = Math.round(performance.now());
    }
  }

  update(deltaMs: number): void {
    this.frameCount++;
    this.rollingFrameTime = this.rollingFrameTime * 0.9 + deltaMs * 0.1;

    const now = performance.now();
    if (now - this.lastTime >= 500) {
      this.rollingFps = (this.frameCount * 1000.0) / (now - this.lastTime);
      this.frameCount = 0;
      this.lastTime = now;
    }
  }

  getSnapshot(renderer?: WebGLRenderer): PerfSnapshot {
    const texStats = TextureRegistry.getInstance().stats();

    let jsHeap = 'N/A';
    if (
      typeof performance !== 'undefined' &&
      (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    ) {
      const used = (
        performance as unknown as { memory: { usedJSHeapSize: number } }
      ).memory.usedJSHeapSize;
      jsHeap = (used / (1024 * 1024)).toFixed(1) + ' MB';
    }

    return {
      fps: Math.round(this.rollingFps),
      frameTimeMs: parseFloat(this.rollingFrameTime.toFixed(1)),
      drawCalls: renderer?.info.render.calls ?? 0,
      triangles: renderer?.info.render.triangles ?? 0,
      geometries: renderer?.info.memory.geometries ?? 0,
      textures: renderer?.info.memory.textures ?? 0,
      textureMemoryMB: texStats.memoryMB,
      jsHeapMB: jsHeap,
      menuInteractiveMs: this.menuInteractiveTime,
    };
  }
}
