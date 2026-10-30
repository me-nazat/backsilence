/* ── QualityBenchmark.ts ──────────────────────────────────────────────────
 *  Quality Auto-Detection & Adaptive Session Ceiling:
 *  1. 2-second loading-time microbenchmark & hardware capability evaluation
 *  2. Categorizes hardware into 'low' | 'medium' | 'high'
 *  3. Invariant: Never raise the tier during a session after a drop
 *  4. Provides a 1-tap changeable summary chip
 * ──────────────────────────────────────────────────────────────────────── */

import { loadSettings, saveSettings } from '../app/Settings.js';

export type EffectiveQuality = 'low' | 'medium' | 'high';

export class QualityBenchmark {
  private static instance: QualityBenchmark | null = null;
  private effectiveTier: EffectiveQuality = 'medium';
  private choiceReason = 'Default baseline';
  private hasDropped = false;
  private benchmarkFinished = false;

  private constructor() {
    this.detectHardwareBaseline();
  }

  static getInstance(): QualityBenchmark {
    if (!QualityBenchmark.instance) {
      QualityBenchmark.instance = new QualityBenchmark();
    }
    return QualityBenchmark.instance;
  }

  private detectHardwareBaseline(): void {
    if (typeof window === 'undefined') return;

    let score = 50; // 0-100 scale

    // Check device memory (GB)
    const nav = navigator as unknown as { deviceMemory?: number; hardwareConcurrency?: number };
    if (typeof nav.deviceMemory === 'number') {
      if (nav.deviceMemory <= 2) score -= 35;
      else if (nav.deviceMemory <= 4) score -= 15;
      else if (nav.deviceMemory >= 8) score += 20;
    }

    // Check CPU concurrency
    if (typeof nav.hardwareConcurrency === 'number') {
      if (nav.hardwareConcurrency <= 2) score -= 30;
      else if (nav.hardwareConcurrency <= 4) score -= 10;
      else if (nav.hardwareConcurrency >= 8) score += 15;
    }

    // Check Mobile / Touch
    const isMobile = window.innerWidth <= 844 || ('ontouchstart' in window && window.innerWidth < 1024);
    if (isMobile) score -= 15;

    // Check WebGL renderer
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
        if (ext) {
          const raw: unknown = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
          const renderer = typeof raw === 'string' ? raw : '';
          const lower = renderer.toLowerCase();
          if (lower.includes('swiftshader') || lower.includes('software') || lower.includes('llvmpipe')) {
            score -= 40;
          } else if (lower.includes('apple m') || lower.includes('rtx') || lower.includes('radeon rx') || lower.includes('gtx 1080') || lower.includes('geforce')) {
            score += 25;
          }
        }
      }
    } catch {
      /* ignore */
    }

    if (score < 30) {
      this.effectiveTier = 'low';
    } else if (score > 65) {
      this.effectiveTier = 'high';
    } else {
      this.effectiveTier = 'medium';
    }
    this.choiceReason = `Hardware baseline score: ${score} (cores=${nav.hardwareConcurrency ?? 'N/A'}, mem=${nav.deviceMemory ?? 'N/A'}GB, mobile=${isMobile})`;
  }

  /**
   * Run a 2-second rAF sample loop during loading to verify sustained frame timing.
   */
  async runLoadingBenchmark(maxDurationMs = 1500): Promise<EffectiveQuality> {
    if (this.benchmarkFinished) return this.effectiveTier;

    return new Promise((resolve) => {
      let count = 0;
      let totalMs = 0;
      const start = performance.now();
      let last = start;

      const loop = (now: number) => {
        const delta = now - last;
        last = now;
        totalMs += delta;
        count++;

        if (now - start < maxDurationMs && count < 90) {
          requestAnimationFrame(loop);
        } else {
          const avgFrameMs = count > 0 ? totalMs / count : 16.6;
          // If frame time is worse than 33ms (under 30fps), downgrade
          if (avgFrameMs > 30) {
            this.effectiveTier = 'low';
          } else if (avgFrameMs > 19 && this.effectiveTier === 'high') {
            this.effectiveTier = 'medium';
          }
          this.choiceReason = `Loading benchmark avgFrameMs=${avgFrameMs.toFixed(1)}ms (${this.choiceReason})`;
          this.benchmarkFinished = true;
          this.applyToSettings();
          resolve(this.effectiveTier);
        }
      };

      requestAnimationFrame(loop);
    });
  }

  /**
   * Downgrade tier during gameplay due to sustained lag or thermal throttling.
   * Invariant: Never raise the tier during a session after a drop.
   */
  dropTier(reason: string): void {
    if (this.effectiveTier === 'high') {
      this.effectiveTier = 'medium';
      this.hasDropped = true;
      this.choiceReason = `Downgraded to MEDIUM: ${reason}`;
      console.warn(`[QualityBenchmark] Quality dropped to MEDIUM: ${reason}`);
      this.applyToSettings();
    } else if (this.effectiveTier === 'medium') {
      this.effectiveTier = 'low';
      this.hasDropped = true;
      this.choiceReason = `Downgraded to LOW: ${reason}`;
      console.warn(`[QualityBenchmark] Quality dropped to LOW: ${reason}`);
      this.applyToSettings();
    }
  }

  /**
   * Manual user override: user can explicitly change tier at any time.
   */
  setUserOverride(tier: EffectiveQuality): void {
    this.effectiveTier = tier;
    this.choiceReason = `User manual override to ${tier}`;
    this.applyToSettings();
  }

  getEffectiveTier(): EffectiveQuality {
    return this.effectiveTier;
  }

  getChoiceReason(): string {
    return this.choiceReason;
  }

  getTierReport(): { tier: EffectiveQuality; reason: string; hasDropped: boolean } {
    return {
      tier: this.effectiveTier,
      reason: this.choiceReason,
      hasDropped: this.hasDropped,
    };
  }

  getHasDropped(): boolean {
    return this.hasDropped;
  }

  cycleTier(): EffectiveQuality {
    const next: Record<EffectiveQuality, EffectiveQuality> = {
      low: 'medium',
      medium: 'high',
      high: 'low',
    };
    this.effectiveTier = next[this.effectiveTier];
    this.applyToSettings();
    return this.effectiveTier;
  }

  private applyToSettings(): void {
    try {
      const s = loadSettings();
      s.graphics.quality = this.effectiveTier;
      saveSettings(s);
    } catch {
      /* ignore */
    }
  }
}
