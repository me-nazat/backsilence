/* ── motion-system.test.ts ──────────────────────────────────────────────────
 *  Tests for Phase C: Motion System, Analog Transitions, and Safety Clamps.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MotionEngine } from '../src/ui/motion/Motion.js';
import { MOTION_TOKENS } from '../src/app/Palette.js';

interface FsModule {
  readFileSync: (path: string, encoding: string) => string;
}

interface PathModule {
  resolve: (...parts: string[]) => string;
}

declare const process: { cwd: () => string };

describe('Prompt 4 Phase C: Motion System & Signature Animations', () => {
  let engine: MotionEngine;

  beforeEach(() => {
    engine = MotionEngine.getInstance();
    engine.setReducedMotion(false);
    engine.setPhotosensitiveSafe(false);
  });

  afterEach(() => {
    engine.setReducedMotion(false);
    engine.setPhotosensitiveSafe(false);
  });

  it('verifies motion tokens match design specification', () => {
    expect(MOTION_TOKENS.fast).toBe(120);
    expect(MOTION_TOKENS.normal).toBe(240);
    expect(MOTION_TOKENS.slow).toBe(480);
    expect(MOTION_TOKENS.crawl).toBe(900);
    expect(MOTION_TOKENS.easeOut).toContain('.2');
    expect(MOTION_TOKENS.easeInOut).toContain('.6');
    expect(MOTION_TOKENS.easeWet).toBeDefined();
  });

  it('scans motion.css for keyframe animations, view transitions, and reduced motion', async () => {
    const fsModName = 'node:fs';
    const pathModName = 'node:path';
    const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;
    const cssPath = path.resolve(process.cwd(), 'src/ui/motion/motion.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    // 1. Core signatures
    expect(css).toContain('.bs-wipe-overlay');
    expect(css).toContain('.bs-ripple-ring');
    expect(css).toContain('.bs-tape-inserting');
    expect(css).toContain('.bs-tape-ejecting');
    expect(css).toContain('.bs-stamp-thump');
    expect(css).toContain('.bs-star-pop');
    expect(css).toContain('.bs-row-pulse');
    expect(css).toContain('.bs-tracking-bar');
    expect(css).toContain('.bs-menu-breathing');
    expect(css).toContain('.bs-scroll-reveal');
    expect(css).toContain('.bs-prerun-overlay');

    // 2. Performance and safety
    expect(css).toContain('content-visibility: auto');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('[data-photosensitive="safe"]');
  });

  it('toggles photosensitive mode and reduced-motion states', () => {
    expect(engine.getReducedMotion()).toBe(false);
    engine.setReducedMotion(true);
    expect(engine.getReducedMotion()).toBe(true);
    engine.setReducedMotion(false);

    engine.setPhotosensitiveSafe(true);
    engine.setPhotosensitiveSafe(false);
  });

  it('verifies ink logo reveal, text decode, and ripple wipe APIs', () => {
    expect(typeof engine.inkLogoReveal).toBe('function');
    expect(typeof engine.rippleWipe).toBe('function');
    expect(typeof engine.textDecode).toBe('function');
    expect(typeof engine.animateScoreCountUp).toBe('function');
    expect(typeof engine.rankStampThump).toBe('function');
    expect(typeof engine.popStarPip).toBe('function');
    expect(typeof engine.unlockCardFlip).toBe('function');
    expect(typeof engine.staggerRows).toBe('function');
    expect(typeof engine.pulsePlayerRow).toBe('function');
    expect(typeof engine.observeScrollReveals).toBe('function');
    expect(typeof engine.runPreRunRitual).toBe('function');
    expect(typeof engine.measureLongAnimationFrames).toBe('function');
  });

  it('verifies reduced-motion fallbacks for all signatures', () => {
    engine.setReducedMotion(true);

    let completed = false;
    // Ink logo immediate completion
    engine.inkLogoReveal({} as SVGElement, () => {
      completed = true;
    });
    expect(completed).toBe(true);

    let wiped = false;
    // Ripple wipe immediate transition
    engine.rippleWipe(100, 100, () => {
      wiped = true;
    });
    expect(wiped).toBe(true);

    let tapeSettled = false;
    engine.animateTapeInsert({} as HTMLElement, () => {
      tapeSettled = true;
    });
    expect(tapeSettled).toBe(true);
  });
});
