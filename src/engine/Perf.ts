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
  private lastHeavyStatsTime = 0;
  private cachedTexStatsMB = '0.0';
  private cachedJsHeap = 'N/A';
  private cachedSnapshot: PerfSnapshot = {
    fps: 60,
    frameTimeMs: 16.6,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
    textureMemoryMB: '0.0',
    jsHeapMB: 'N/A',
    menuInteractiveMs: 0,
    budgetExceeded: {
      drawCalls: false,
      triangles: false,
      programs: false,
      textures: false,
      frameTime: false,
    },
  };

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
    const now = performance.now();
    if (now - this.lastHeavyStatsTime >= 500) {
      this.lastHeavyStatsTime = now;
      this.cachedTexStatsMB = TextureRegistry.getInstance().stats().memoryMB;
      if (
        typeof performance !== 'undefined' &&
        (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
      ) {
        const used = (
          performance as unknown as { memory: { usedJSHeapSize: number } }
        ).memory.usedJSHeapSize;
        this.cachedJsHeap = (used / (1024 * 1024)).toFixed(1) + ' MB';
      }
    }

    const calls = (renderer as unknown as { lastFrameCalls?: number })?.lastFrameCalls ?? renderer?.info.render.calls ?? 0;
    const triangles = (renderer as unknown as { lastFrameTriangles?: number })?.lastFrameTriangles ?? renderer?.info.render.triangles ?? 0;
    const geometries = renderer?.info.memory.geometries ?? 0;
    const textures = renderer?.info.memory.textures ?? 0;
    const programs = renderer?.info.programs?.length ?? 0;

    const s = this.cachedSnapshot;
    s.fps = Math.round(this.rollingFps);
    s.frameTimeMs = parseFloat(this.rollingFrameTime.toFixed(1));
    s.drawCalls = calls;
    s.triangles = triangles;
    s.geometries = geometries;
    s.textures = textures;
    s.programs = programs;
    s.textureMemoryMB = this.cachedTexStatsMB;
    s.jsHeapMB = this.cachedJsHeap;
    s.menuInteractiveMs = this.menuInteractiveTime;
    if (s.budgetExceeded) {
      s.budgetExceeded.drawCalls = calls > PERF_BUDGET.drawCalls;
      s.budgetExceeded.triangles = triangles > PERF_BUDGET.triangles;
      s.budgetExceeded.programs = programs > PERF_BUDGET.programs;
      s.budgetExceeded.textures = textures > PERF_BUDGET.textures;
      s.budgetExceeded.frameTime = this.rollingFrameTime > PERF_BUDGET.frameTimeLowMs;
    }

    return s;
  }
}
