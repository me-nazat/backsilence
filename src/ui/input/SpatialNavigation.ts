/* ── SpatialNavigation.ts ───────────────────────────────────────────────────
 *  2D Spatial Focus Navigation for Menus:
 *  Arrow keys and Gamepad D-pad move focus to the nearest interactive element in that direction.
 *  Maintains visible focus rings and optional navigation sound cues.
 * ──────────────────────────────────────────────────────────────────────── */

import { GamepadManager } from '../../engine/input/GamepadManager.js';

export type SpatialDirection = 'up' | 'down' | 'left' | 'right';

export interface SpatialNavigationOptions {
  container?: HTMLElement;
  onNavigate?: (target: HTMLElement, dir: SpatialDirection) => void;
}

export class SpatialNavigation {
  private container: HTMLElement | null = null;
  private onNavigate?: ((target: HTMLElement, dir: SpatialDirection) => void) | undefined;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private isEnabled = true;

  private gamepadRafId: number | null = null;
  private lastGamepadNavTime = 0;
  private lastGpActionTime = 0;
  private wasGpA = false;
  private wasGpB = false;

  constructor(opts?: SpatialNavigationOptions) {
    this.container = opts?.container ?? null;
    this.onNavigate = opts?.onNavigate;
    this.bindEvents();
  }

  setContainer(container: HTMLElement | null): void {
    this.container = container;
  }

  setEnabled(val: boolean): void {
    this.isEnabled = val;
    if (val && !this.gamepadRafId && typeof requestAnimationFrame !== 'undefined') {
      this.gamepadRafId = requestAnimationFrame(() => this.pollGamepadLoop());
    } else if (!val && this.gamepadRafId && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.gamepadRafId);
      this.gamepadRafId = null;
    }
  }

  private bindEvents(): void {
    if (typeof window === 'undefined') return;

    this.keydownHandler = (e: KeyboardEvent) => {
      if (!this.isEnabled) return;

      let dir: SpatialDirection | null = null;
      switch (e.key) {
        case 'ArrowUp':
          dir = 'up';
          break;
        case 'ArrowDown':
          dir = 'down';
          break;
        case 'ArrowLeft':
          dir = 'left';
          break;
        case 'ArrowRight':
          dir = 'right';
          break;
      }

      if (dir) {
        const moved = this.navigate(dir);
        if (moved) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', this.keydownHandler);

    if (typeof requestAnimationFrame !== 'undefined') {
      this.gamepadRafId = requestAnimationFrame(() => this.pollGamepadLoop());
    }
  }

  private pollGamepadLoop(): void {
    if (!this.isEnabled) return;
    const gamepad = GamepadManager.getInstance();
    const pad = gamepad.getPrimaryGamepad();
    if (pad) {
      const now = performance.now();
      const btns = gamepad.pollButtons();
      const axes = gamepad.pollAxes();

      let dir: SpatialDirection | null = null;
      if (btns.dpadUp || axes.moveY < -0.5) dir = 'up';
      else if (btns.dpadDown || axes.moveY > 0.5) dir = 'down';
      else if (btns.dpadLeft || axes.moveX < -0.5) dir = 'left';
      else if (btns.dpadRight || axes.moveX > 0.5) dir = 'right';

      if (dir && now - this.lastGamepadNavTime > 200) {
        this.lastGamepadNavTime = now;
        this.navigate(dir);
      }

      // Button 0 (A / Cross) -> click active element
      if (btns.jump && !this.wasGpA && now - this.lastGpActionTime > 250) {
        this.lastGpActionTime = now;
        const active = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
        if (active && typeof active.click === 'function') {
          active.click();
        }
      }
      this.wasGpA = btns.jump;

      // Button 1 (B / Circle) -> Escape / Cancel
      if (btns.crouch && !this.wasGpB && now - this.lastGpActionTime > 250) {
        this.lastGpActionTime = now;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        }
      }
      this.wasGpB = btns.crouch;
    }

    if (this.isEnabled && typeof requestAnimationFrame !== 'undefined') {
      this.gamepadRafId = requestAnimationFrame(() => this.pollGamepadLoop());
    }
  }

  dispose(): void {
    if (this.gamepadRafId && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.gamepadRafId);
      this.gamepadRafId = null;
    }
    if (this.keydownHandler && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
  }

  getFocusableElements(): HTMLElement[] {
    const root = this.container ?? (typeof document !== 'undefined' ? document.body : null);
    if (!root) return [];

    const selector = 'button:not([disabled]), [tabindex="0"], a[href], input:not([disabled]), select:not([disabled])';
    const elements = Array.from(root.querySelectorAll<HTMLElement>(selector));
    return elements.filter((el) => {
      // Exclude hidden or zero-size elements
      if (el.hasAttribute('disabled') || el.hasAttribute('inert')) return false;
      const rect = el.getBoundingClientRect?.() ?? { width: 1, height: 1 };
      return rect.width > 0 && rect.height > 0;
    });
  }

  navigate(direction: SpatialDirection): boolean {
    const focusables = this.getFocusableElements();
    if (focusables.length === 0) return false;

    const active = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    if (!active || !focusables.includes(active)) {
      // Nothing active yet, focus first candidate
      const first = focusables[0];
      if (first) {
        first.focus();
        this.onNavigate?.(first, direction);
        return true;
      }
      return false;
    }

    const currentRect = active.getBoundingClientRect();
    const currentCx = currentRect.left + currentRect.width / 2;
    const currentCy = currentRect.top + currentRect.height / 2;

    let bestTarget: HTMLElement | null = null;
    let minDistance = Infinity;

    for (const candidate of focusables) {
      if (candidate === active) continue;

      const rect = candidate.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const dx = cx - currentCx;
      const dy = cy - currentCy;

      // Filter by direction quadrant
      let inDirection = false;
      let primaryDist = 0;
      let crossDist = 0;

      switch (direction) {
        case 'up':
          inDirection = dy < -4;
          primaryDist = Math.abs(dy);
          crossDist = Math.abs(dx);
          break;
        case 'down':
          inDirection = dy > 4;
          primaryDist = Math.abs(dy);
          crossDist = Math.abs(dx);
          break;
        case 'left':
          inDirection = dx < -4;
          primaryDist = Math.abs(dx);
          crossDist = Math.abs(dy);
          break;
        case 'right':
          inDirection = dx > 4;
          primaryDist = Math.abs(dx);
          crossDist = Math.abs(dy);
          break;
      }

      if (!inDirection) continue;

      // Weighted distance with penalty for cross-axis deviation
      const distance = primaryDist + crossDist * 1.5;
      if (distance < minDistance) {
        minDistance = distance;
        bestTarget = candidate;
      }
    }

    if (bestTarget) {
      bestTarget.focus();
      this.onNavigate?.(bestTarget, direction);
      return true;
    }

    return false;
  }
}
