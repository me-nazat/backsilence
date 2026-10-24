/* ── InputGlyphs.ts ──────────────────────────────────────────────────────────
 *  Dynamic Prompt Glyph Switching:
 *  Automatically tracks last used input device (keyboard, gamepad, touch).
 *  Renders matching inline SVG symbols for Xbox, PlayStation, Switch, and Keyboard.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Action } from '../../types/contracts.js';
import { GamepadManager, type GamepadType } from '../../engine/input/GamepadManager.js';

export type InputDevice = 'keyboard' | 'gamepad' | 'touch';

export class InputGlyphs {
  private static instance: InputGlyphs | null = null;
  private currentDevice: InputDevice = 'keyboard';
  private listeners = new Set<(device: InputDevice) => void>();

  static getInstance(): InputGlyphs {
    if (!this.instance) {
      this.instance = new InputGlyphs();
    }
    return this.instance;
  }

  constructor() {
    this.bindDeviceDetection();
  }

  getCurrentDevice(): InputDevice {
    return this.currentDevice;
  }

  setDevice(device: InputDevice): void {
    if (this.currentDevice !== device) {
      this.currentDevice = device;
      this.listeners.forEach((cb) => cb(device));
    }
  }

  onDeviceChange(cb: (device: InputDevice) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private bindDeviceDetection(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', () => this.setDevice('keyboard'), { passive: true });
    window.addEventListener('mousemove', () => this.setDevice('keyboard'), { passive: true });
    window.addEventListener('touchstart', () => this.setDevice('touch'), { passive: true });

    // Gamepad connection or button polling detects gamepad
    window.addEventListener('gamepadconnected', () => this.setDevice('gamepad'));
  }

  /**
   * Renders prompt glyph inline SVG for a specific Action based on active device.
   */
  renderGlyph(action: Action, defaultKey = 'E'): string {
    if (this.currentDevice === 'touch') {
      return this.renderTouchGlyph(action);
    }

    if (this.currentDevice === 'gamepad') {
      const padType = GamepadManager.getInstance().detectGamepadType();
      return this.renderGamepadGlyph(action, padType);
    }

    // Default: Keyboard Keycap
    return this.renderKeyCap(defaultKey);
  }

  private renderKeyCap(key: string): string {
    return `
      <span class="bs-keycap" style="display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px; padding: 0 6px; font-family: var(--bs-font-mono); font-size: 11px; font-weight: 700; color: var(--bs-cream); background: var(--bs-surface1); border: 1px solid var(--bs-border-strong); border-radius: 3px; box-shadow: 0 2px 0 var(--bs-ink); vertical-align: middle;">
        ${key.toUpperCase()}
      </span>
    `;
  }

  private renderTouchGlyph(action: Action): string {
    return `
      <span class="bs-touch-glyph" style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; color: var(--bs-water); vertical-align: middle;" title="Tap for ${action}">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <circle cx="12" cy="12" r="3" fill="currentColor"/>
        </svg>
      </span>
    `;
  }

  private renderGamepadGlyph(action: Action, layout: GamepadType): string {
    switch (action) {
      case 'jump':
        return layout === 'playstation' ? this.svgCross() : layout === 'switch' ? this.svgBtn('B') : this.svgBtn('A', '#107c10');
      case 'crouch':
        return layout === 'playstation' ? this.svgCircle() : layout === 'switch' ? this.svgBtn('A') : this.svgBtn('B', '#e81123');
      case 'interact':
        return layout === 'playstation' ? this.svgSquare() : layout === 'switch' ? this.svgBtn('Y') : this.svgBtn('X', '#0078d7');
      case 'flashlight':
        return layout === 'playstation' ? this.svgTriangle() : layout === 'switch' ? this.svgBtn('X') : this.svgBtn('Y', '#ffb900');
      case 'sprint':
        return layout === 'playstation' ? this.svgTrigger('R2') : layout === 'switch' ? this.svgTrigger('ZR') : this.svgTrigger('RT');
      case 'throw':
        return layout === 'playstation' ? this.svgTrigger('L2') : layout === 'switch' ? this.svgTrigger('ZL') : this.svgTrigger('LT');
      case 'pause':
        return layout === 'playstation' ? this.svgTrigger('OPT') : layout === 'switch' ? this.svgTrigger('+') : this.svgTrigger('START');
      default:
        return this.svgBtn('A');
    }
  }

  private svgBtn(label: string, color?: string): string {
    const strokeColor = color ?? 'var(--bs-water)';
    return `
      <svg class="bs-gamepad-glyph" viewBox="0 0 24 24" width="20" height="20" style="vertical-align: middle;">
        <circle cx="12" cy="12" r="9.5" fill="var(--bs-surface1)" stroke="${strokeColor}" stroke-width="1.8"/>
        <text x="12" y="15.5" font-family="var(--bs-font-mono)" font-size="10" font-weight="900" fill="${strokeColor}" text-anchor="middle">${label}</text>
      </svg>
    `;
  }

  private svgCross(): string {
    return `
      <svg class="bs-gamepad-glyph" viewBox="0 0 24 24" width="20" height="20" style="vertical-align: middle;">
        <circle cx="12" cy="12" r="9.5" fill="var(--bs-surface1)" stroke="#0070d1" stroke-width="1.8"/>
        <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" stroke="#0070d1" stroke-width="2"/>
        <line x1="15.5" y1="8.5" x2="8.5" y2="15.5" stroke="#0070d1" stroke-width="2"/>
      </svg>
    `;
  }

  private svgCircle(): string {
    return `
      <svg class="bs-gamepad-glyph" viewBox="0 0 24 24" width="20" height="20" style="vertical-align: middle;">
        <circle cx="12" cy="12" r="9.5" fill="var(--bs-surface1)" stroke="#df0024" stroke-width="1.8"/>
        <circle cx="12" cy="12" r="4.5" fill="none" stroke="#df0024" stroke-width="1.8"/>
      </svg>
    `;
  }

  private svgSquare(): string {
    return `
      <svg class="bs-gamepad-glyph" viewBox="0 0 24 24" width="20" height="20" style="vertical-align: middle;">
        <circle cx="12" cy="12" r="9.5" fill="var(--bs-surface1)" stroke="#e4007f" stroke-width="1.8"/>
        <rect x="8" y="8" width="8" height="8" fill="none" stroke="#e4007f" stroke-width="1.8"/>
      </svg>
    `;
  }

  private svgTriangle(): string {
    return `
      <svg class="bs-gamepad-glyph" viewBox="0 0 24 24" width="20" height="20" style="vertical-align: middle;">
        <circle cx="12" cy="12" r="9.5" fill="var(--bs-surface1)" stroke="#00aa9e" stroke-width="1.8"/>
        <polygon points="12,7.5 16.5,15.5 7.5,15.5" fill="none" stroke="#00aa9e" stroke-width="1.8"/>
      </svg>
    `;
  }

  private svgTrigger(text: string): string {
    return `
      <svg class="bs-gamepad-glyph" viewBox="0 0 32 20" width="28" height="18" style="vertical-align: middle;">
        <rect x="1" y="2" width="30" height="16" rx="4" fill="var(--bs-surface1)" stroke="var(--bs-border-strong)" stroke-width="1.5"/>
        <text x="16" y="13.5" font-family="var(--bs-font-mono)" font-size="9" font-weight="700" fill="var(--bs-cream)" text-anchor="middle">${text}</text>
      </svg>
    `;
  }
}
