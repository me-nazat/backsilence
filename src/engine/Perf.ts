/* ── Perf.ts ──────────────────────────────────────────────────────────────
 *  Rolling FPS, frame time, draw call, and GPU memory metrics tracker.
 * ──────────────────────────────────────────────────────────────────────── */

import type { WebGLRenderer } from 'three';
import { TextureRegistry } from '../procedural/textures/TextureRegistry.js';

export const PERF_BUDGET = {
  drawCalls: 220,
  triangles: 450000,
  programs: 90,
  textures: 120,
  frameTimeHighMs: 16.7,
  frameTimeLowMs: 33.0,
} as const;

export interface PerfSnapshot {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  textureMemoryMB: string;
  jsHeapMB: string;
  menuInteractiveMs: number;
  budgetExceeded?: {
    drawCalls: boolean;
    triangles: boolean;
    programs: boolean;
    textures: boolean;
    frameTime: boolean;
  };
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

    const calls = (renderer as unknown as { lastFrameCalls?: number })?.lastFrameCalls ?? renderer?.info.render.calls ?? 0;
    const triangles = (renderer as unknown as { lastFrameTriangles?: number })?.lastFrameTriangles ?? renderer?.info.render.triangles ?? 0;
    const geometries = renderer?.info.memory.geometries ?? 0;
    const textures = renderer?.info.memory.textures ?? 0;
    const programs = renderer?.info.programs?.length ?? 0;

    return {
      fps: Math.round(this.rollingFps),
      frameTimeMs: parseFloat(this.rollingFrameTime.toFixed(1)),
      drawCalls: calls,
      triangles,
      geometries,
      textures,
      programs,
      textureMemoryMB: texStats.memoryMB,
      jsHeapMB: jsHeap,
      menuInteractiveMs: this.menuInteractiveTime,
      budgetExceeded: {
        drawCalls: calls > PERF_BUDGET.drawCalls,
        triangles: triangles > PERF_BUDGET.triangles,
        programs: programs > PERF_BUDGET.programs,
        textures: textures > PERF_BUDGET.textures,
        frameTime: this.rollingFrameTime > PERF_BUDGET.frameTimeLowMs,
      },
    };
  }
}
