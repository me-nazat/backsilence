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

  if (dpr >= 2) return 'high';
  if (dpr >= 1.5) return 'medium';
  return 'low';
}

/**
 * Resolve the quality tier: if 'auto', detect; otherwise return as-is.
 */
export function resolveQuality(tier: QualityTier): QualityConfig {
  const resolved = tier === 'auto' ? detectQualityTier() : tier;
  return QUALITY_CONFIGS[resolved];
}
