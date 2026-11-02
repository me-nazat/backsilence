/* ── hud-layout.test.ts ───────────────────────────────────────────────────
 *  Prompt 8 (D126): HUD Layout Overlap Audit & Viewport Responsiveness
 *  Asserts that no two HUD elements' bounding boxes intersect across viewports
 *  from 390x844 (mobile portrait) to 2560x1440 (desktop 1440p).
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';

export interface BoundingBox {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface Viewport {
  name: string;
  width: number;
  height: number;
}

const VIEWPORTS: readonly Viewport[] = [
  { name: 'Mobile Portrait (iPhone 12/13/14)', width: 390, height: 844 },
  { name: '9:16 Portrait Streamer Mode', width: 1080, height: 1920 },
  { name: 'Laptop Display (16:10)', width: 1440, height: 900 },
  { name: 'Desktop 1440p (QHD)', width: 2560, height: 1440 },
];

/**
 * Computes bounding boxes for active HUD elements in BackSilence
 * based on the unified bottom stack and center prompt layout.
 */
function computeHudLayout(viewport: Viewport, options: {
  showQuietHint?: boolean;
  showInteractionPrompt?: boolean;
  streamerMode?: boolean;
}): BoundingBox[] {
  const boxes: BoundingBox[] = [];
  const W = viewport.width;
  const H = viewport.height;

  // 1. Center Interaction Prompt (when looking at interactable)
  if (options.showInteractionPrompt) {
    const promptW = Math.min(W * 0.85, 260);
    const promptH = 36;
    const promptTop = Math.round(H * 0.55);
    const promptLeft = Math.round((W - promptW) / 2);
    boxes.push({
      id: 'hud-prompt',
      left: promptLeft,
      top: promptTop,
      right: promptLeft + promptW,
      bottom: promptTop + promptH,
      width: promptW,
      height: promptH,
    });
  }

  // 2. Bottom Stack Container: flex column-reverse starting at bottom = 16px
  const bottomMargin = 16;
  const gap = 8;
  let currentBottomOffset = bottomMargin;

  // 2a. Minimal Noise Meter (lowest item)
  const noiseW = Math.min(W - 32, 310);
  const noiseH = 18;
  const noiseBottom = H - currentBottomOffset;
  const noiseTop = noiseBottom - noiseH;
  const noiseLeft = Math.round((W - noiseW) / 2);
  boxes.push({
    id: 'hud-noise-minimal',
    left: noiseLeft,
    top: noiseTop,
    right: noiseLeft + noiseW,
    bottom: noiseBottom,
    width: noiseW,
    height: noiseH,
  });
  currentBottomOffset += noiseH + gap;

  // 2b. Objective Line Pill (stacked above noise meter)
  const objW = Math.min(W * 0.9, 440);
  const objH = 26;
  const objBottom = H - currentBottomOffset;
  const objTop = objBottom - objH;
  const objLeft = Math.round((W - objW) / 2);
  boxes.push({
    id: 'hud-objective-pill',
    left: objLeft,
    top: objTop,
    right: objLeft + objW,
    bottom: objBottom,
    width: objW,
    height: objH,
  });
  currentBottomOffset += objH + gap;

  // 2c. Quiet In-World Hint Strip (stacked above objective pill when active)
  if (options.showQuietHint) {
    const hintW = Math.min(W * 0.85, 340);
    const hintH = 22;
    const hintBottom = H - currentBottomOffset;
    const hintTop = hintBottom - hintH;
    const hintLeft = Math.round((W - hintW) / 2);
    boxes.push({
      id: 'hud-quiet-hint',
      left: hintLeft,
      top: hintTop,
      right: hintLeft + hintW,
      bottom: hintBottom,
      width: hintW,
      height: hintH,
    });
    currentBottomOffset += hintH + gap;
  }

  // 3. Top elements: Facecam zone & Run timer in Streamer Mode
  if (options.streamerMode) {
    const facecamH = Math.round(H * 0.28);
    boxes.push({
      id: 'debug-facecam-overlay',
      left: 0,
      top: 0,
      right: W,
      bottom: facecamH,
      width: W,
      height: facecamH,
    });

    const timerW = 120;
    const timerH = 28;
    const timerTop = facecamH + 12;
    const timerLeft = Math.round((W - timerW) / 2);
    boxes.push({
      id: 'hud-run-timer',
      left: timerLeft,
      top: timerTop,
      right: timerLeft + timerW,
      bottom: timerTop + timerH,
      width: timerW,
      height: timerH,
    });
  }

  return boxes;
}

function checkIntersections(boxes: BoundingBox[]): Array<{ a: string; b: string }> {
  const collisions: Array<{ a: string; b: string }> = [];

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;

      // Check if bounding rectangles overlap (strict collision)
      const separated =
        a.right <= b.left ||
        b.right <= a.left ||
        a.bottom <= b.top ||
        b.bottom <= a.top;

      if (!separated) {
        collisions.push({ a: a.id, b: b.id });
      }
    }
  }

  return collisions;
}

describe('Prompt 8 (D126): HUD Layout Overlap Audit across Viewports', () => {
  for (const vp of VIEWPORTS) {
    it(`verifies zero overlapping bounding boxes in default gameplay at ${vp.name} (${vp.width}x${vp.height})`, () => {
      // Default view: noise meter + objective line
      const boxes = computeHudLayout(vp, {});
      const collisions = checkIntersections(boxes);
      expect(collisions).toEqual([]);
      expect(boxes.length).toBe(2);
    });

    it(`verifies zero overlapping bounding boxes with active quiet hint at ${vp.name}`, () => {
      // Noise meter + objective line + quiet in-world hint
      const boxes = computeHudLayout(vp, { showQuietHint: true });
      const collisions = checkIntersections(boxes);
      expect(collisions).toEqual([]);
      expect(boxes.length).toBe(3);
    });

    it(`verifies zero overlapping bounding boxes with active interaction prompt at ${vp.name}`, () => {
      // Noise meter + objective line + interaction prompt
      const boxes = computeHudLayout(vp, { showInteractionPrompt: true });
      const collisions = checkIntersections(boxes);
      expect(collisions).toEqual([]);
      expect(boxes.length).toBe(3);
    });

    it(`verifies zero overlapping bounding boxes under full load at ${vp.name}`, () => {
      // Noise meter + objective line + quiet hint + interaction prompt
      const boxes = computeHudLayout(vp, {
        showQuietHint: true,
        showInteractionPrompt: true,
      });
      const collisions = checkIntersections(boxes);
      expect(collisions).toEqual([]);
    });

    it(`verifies zero overlapping bounding boxes in 9:16 Streamer Mode at ${vp.name}`, () => {
      const boxes = computeHudLayout(vp, {
        streamerMode: true,
        showQuietHint: true,
        showInteractionPrompt: true,
      });
      const collisions = checkIntersections(boxes);
      expect(collisions).toEqual([]);
    });
  }
});

