/* ── Quality.ts ───────────────────────────────────────────────────────────
 *  Quality tier definitions and auto-detection logic.
 * ──────────────────────────────────────────────────────────────────────── */

import type { QualityTier } from '../types/contracts.js';

export interface QualityConfig {
  dprCap: number;
  tileTexSize: number;
  shadows: 'off' | '1024' | '2048';
  shadowType: 'off' | 'pcfsoft';
  shadowLights: number;
  postFx: 'off' | 'light' | 'full';
  maxAudioVoices: number;
}

export const QUALITY_CONFIGS: Record<Exclude<QualityTier, 'auto'>, QualityConfig> = {
  low: {
    dprCap: 1.0,
    tileTexSize: 256,
    shadows: 'off',
    shadowType: 'off',
    shadowLights: 0,
    postFx: 'off',
    maxAudioVoices: 16,
  },
  medium: {
    dprCap: 1.5,
    tileTexSize: 512,
    shadows: '1024',
    shadowType: 'pcfsoft',
    shadowLights: 1,
    postFx: 'light',
    maxAudioVoices: 24,
  },
  high: {
    dprCap: 2.0,
    tileTexSize: 1024,
    shadows: '2048',
    shadowType: 'pcfsoft',
    shadowLights: 2,
    postFx: 'full',
    maxAudioVoices: 32,
  },
};

/**
 * Auto-detect a starting quality tier from GPU and display hints.
 * Uses devicePixelRatio and WebGL renderer info as heuristics.
 */
export function detectQualityTier(): Exclude<QualityTier, 'auto'> {
  if (typeof window === 'undefined') return 'medium';

  const dpr = window.devicePixelRatio ?? 1;

  // Try to get GPU info from a temporary canvas
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
        const lower = renderer.toLowerCase();

        // Low-end indicators
        if (
          lower.includes('intel') ||
          lower.includes('mesa') ||
          lower.includes('swiftshader') ||
          lower.includes('llvmpipe')
        ) {
          return 'low';
        }
      }
    }
  } catch {
    // WebGL probe failed, continue with DPR heuristic
  }

  // Mobile / touch screen detection (viewport or touch capabilities)
  const isMobile =
    ('ontouchstart' in window ||
      (navigator.maxTouchPoints ?? 0) > 0 ||
      window.innerWidth <= 844 ||
      window.innerHeight <= 844);

  if (isMobile) {
    // Mobile devices with DPR >= 2.5 or throttled cores target medium or low
    const cores = navigator.hardwareConcurrency ?? 4;
    if (cores <= 4 || dpr >= 3) {
      return 'medium';
    }
    return 'medium';
  }

  if (dpr >= 2) return 'high';
  if (dpr >= 1.5) return 'medium';
  return 'low';
}

/**
 * Resolves QualityTier ('auto' | 'low' | 'medium' | 'high') to concrete tier ('low' | 'medium' | 'high').
 */
export function resolveQualityTier(tier: QualityTier): Exclude<QualityTier, 'auto'> {
  return tier === 'auto' ? detectQualityTier() : tier;
}

/**
 * Resolve the quality config: if 'auto', detect; otherwise return as-is.
 */
export function resolveQuality(tier: QualityTier): QualityConfig {
  const resolved = resolveQualityTier(tier);
  return QUALITY_CONFIGS[resolved];
}

/**
 * Manages runtime auto-quality adaptation, dropping a tier after 3s below 45 FPS.
 */
export class AutoQualityAdapter {
  private currentTier: Exclude<QualityTier, 'auto'>;
  private lowFpsDuration = 0;
  private cooldownTimer = 0;
  readonly targetFps = 45;
  readonly requiredDuration = 3.0; // 3 seconds below 45 FPS
  readonly onTierDowngraded?: ((newTier: Exclude<QualityTier, 'auto'>, reason: string) => void) | undefined;

  constructor(
    initialTier: QualityTier = 'auto',
    onTierDowngraded?: ((newTier: Exclude<QualityTier, 'auto'>, reason: string) => void)  ,
  ) {
    this.currentTier = resolveQualityTier(initialTier);
    this.onTierDowngraded = onTierDowngraded;
  }

  getCurrentTier(): Exclude<QualityTier, 'auto'> {
    return this.currentTier;
  }

  setCurrentTier(tier: Exclude<QualityTier, 'auto'>): void {
    this.currentTier = tier;
    this.lowFpsDuration = 0;
  }

  getLowFpsDuration(): number {
    return this.lowFpsDuration;
  }

  update(dt: number, currentFps: number): boolean {
    if (this.cooldownTimer > 0) {
      this.cooldownTimer -= dt;
      return false;
    }

    if (currentFps < this.targetFps) {
      this.lowFpsDuration += dt;
      if (this.lowFpsDuration >= this.requiredDuration) {
        if (this.currentTier === 'high') {
          this.currentTier = 'medium';
          this.lowFpsDuration = 0;
          this.cooldownTimer = 5.0; // 5s grace period
          this.onTierDowngraded?.(this.currentTier, 'FPS below 45 for 3s');
          return true;
        } else if (this.currentTier === 'medium') {
          this.currentTier = 'low';
          this.lowFpsDuration = 0;
          this.cooldownTimer = 5.0;
          this.onTierDowngraded?.(this.currentTier, 'FPS below 45 for 3s');
          return true;
        }
      }
    } else if (currentFps >= 50) {
      this.lowFpsDuration = Math.max(0, this.lowFpsDuration - dt * 2.0);
    }
    return false;
  }
}

