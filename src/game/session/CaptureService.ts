/* ── CaptureService.ts ────────────────────────────────────────────────────
 *  Golden shot capture & debug visual suppression service.
 *  Enforces the G5 law:
 *  - When URL contains ?shot= or __BACKSILENCE_CAPTURE__ is true, all debug
 *    visualizations (magenta markers, locator elements, hearing rings, path lines,
 *    nav mesh overlays) are strictly suppressed.
 *  - Capture state is integrated with SessionStateMachine.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Scene, Mesh, Line } from 'three';

export class CaptureService {
  readonly isCapture: boolean;
  readonly isDebug: boolean;

  constructor() {
    const isBrowser = typeof window !== 'undefined';
    const params = isBrowser ? new URLSearchParams(window.location.search) : null;

    this.isCapture = Boolean(
      isBrowser &&
      (params?.has('shot') ||
        (window as unknown as { __BACKSILENCE_CAPTURE__?: boolean }).__BACKSILENCE_CAPTURE__ === true)
    );

    this.isDebug = Boolean(
      !this.isCapture &&
      isBrowser &&
      (params?.get('debug') === '1' ||
        (window as unknown as { __BACKSILENCE_DEBUG__?: boolean }).__BACKSILENCE_DEBUG__ === true)
    );
  }

  /**
   * Evaluates whether debug visualizations are permitted to render.
   * G5 Law: Returns false whenever capture mode is active.
   */
  shouldRenderDebugOverlays(): boolean {
    return this.isDebug && !this.isCapture;
  }

  /**
   * Applies the G5 suppression rule to any debug objects in scene.
   */
  enforceDebugSuppression(
    _scene: Scene,
    magentaMarker?: Mesh | null,
    locatorElement?: HTMLElement | null,
    navMesh?: Mesh | null,
    pathLine?: Line | null,
  ): void {
    if (!this.shouldRenderDebugOverlays()) {
      if (magentaMarker) magentaMarker.visible = false;
      if (locatorElement) locatorElement.style.display = 'none';
      if (navMesh) navMesh.visible = false;
      if (pathLine) pathLine.visible = false;
    }
  }
}
