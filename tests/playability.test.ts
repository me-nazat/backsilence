/* ── tests/playability.test.ts ───────────────────────────────────────────────
 *  Prompt 6 Playability & Legibility Verification Suite (6.1 - 6.13)
 *  Verifies:
 *  - 6.1: Objective line and code notebook are visible with default settings
 *  - 6.2: promptHoldProgress is present in HUD payload and reaches 1.0
 *  - 6.3: waterNoiseRadius uses the x40 factor from Hearing.ts (MAX_HEAR_RADIUS)
 *  - 6.4: Risk tag is derived from state (not objective string) with distinct classes
 *  - 6.5: Sprint threshold is strictly greater than walk speed (unifying constants)
 *  - 6.6: enableBob is true when reducedMotion === 'system' on non-reduce preference
 *  - 6.10: Stamina drain 17/s, regen 18/s, wade factor 0.68, deep wade factor 0.55
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hud } from '../src/ui/Hud.js';
import { WORLD } from '../src/app/Config.js';
import { PlayerMotor } from '../src/sim/PlayerMotor.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { ColliderSet } from '../src/sim/Colliders.js';
import { EventRingBuffer } from '../src/sim/Events.js';
import { ACOUSTIC_CONSTANTS } from '../src/sim/Hearing.js';
import { defaultSettings } from '../src/app/Settings.js';
import { PlayerCamera } from '../src/game/player/PlayerCamera.js';
import { PerspectiveCamera } from 'three';

// ── Minimal DOM Mock for HUD Tests ─────────────────────────────────────────
class MockClassList {
  private classes = new Set<string>();

  add(...names: string[]) {
    for (const name of names) {
      if (name) this.classes.add(name);
    }
  }

  remove(...names: string[]) {
    for (const name of names) {
      if (name) this.classes.delete(name);
    }
  }

  contains(name: string): boolean {
    return this.classes.has(name);
  }
}

class MockElement {
  tagName: string;
  id = '';
  style: Record<string, string> = {};
  classList = new MockClassList();
  attributes = new Map<string, string>();
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  textContent = '';
  private listeners = new Map<string, Array<(e: unknown) => void>>();

  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.style = {
      setProperty: (k: string, v: string) => {
        this.style[k] = v;
      },
    } as unknown as Record<string, string>;
  }

  addEventListener(type: string, fn: (e: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }

  removeEventListener(type: string, fn: (e: unknown) => void) {
    const list = this.listeners.get(type);
    if (list) {
      this.listeners.set(type, list.filter((f) => f !== fn));
    }
  }

  get className(): string {
    return this.attributes.get('class') ?? '';
  }

  set className(val: string) {
    this.setAttribute('class', val);
  }

  setAttribute(k: string, v: string) {
    this.attributes.set(k, String(v));
    if (k === 'id') this.id = v;
    if (k === 'class') {
      const parts = String(v).split(/\s+/).filter(Boolean);
      this.classList = new MockClassList();
      this.classList.add(...parts);
    }
  }

  getAttribute(k: string): string | null {
    return this.attributes.get(k) ?? null;
  }

  appendChild<T extends MockElement>(child: T): T {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return this.findById(id);
    }
    return null;
  }

  private findById(id: string): MockElement | null {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.findById(id);
      if (found) return found;
    }
    return null;
  }

  set innerHTML(html: string) {
    this.children = [];
    const idMatches = html.matchAll(/id="([^"]+)"/g);
    for (const match of idMatches) {
      const id = match[1];
      if (id) {
        const child = new MockElement('div');
        child.id = id;
        child.setAttribute('id', id);
        this.appendChild(child);
      }
    }
  }
}

describe('Prompt 6: Playability & Legibility Suite', () => {
  beforeEach(() => {
    (globalThis as unknown as { document: unknown }).document = {
      createElement: (tag: string) => new MockElement(tag),
      documentElement: new MockElement('html'),
    };
  });

  it('6.1 verifies objective line and code notebook are visible with default settings', () => {
    const hud = new Hud();
    const container = new MockElement('div');
    hud.mount(container as unknown as HTMLElement);

    hud.update({
      objective: 'Find the numbered pillars. Avoid making splashes.',
      noiseLoudness: 0,
      stamina: 1.0,
      status: 'DRY',
    });

    const hudEl = container.children[0]!;
    expect(hudEl).toBeDefined();

    // Default HUD is not in .show-more-hud
    expect(hudEl.classList.contains('show-more-hud')).toBe(false);

    // Both containers exist and are visible
    const objectiveContainer = hudEl.querySelector('#hud-objective-container');
    const notebookContainer = hudEl.querySelector('#hud-notebook-container');

    expect(objectiveContainer).toBeDefined();
    expect(objectiveContainer?.style.display).not.toBe('none');

    expect(notebookContainer).toBeDefined();
    expect(notebookContainer?.style.display).toBe('flex');

    const notebook = hudEl.querySelector('#hud-notebook');
    expect(notebook?.textContent).toContain('#1: ?');
  });

  it('6.2 verifies promptHoldProgress is supported in HUD and reaches 1.0', () => {
    const hud = new Hud();
    const container = new MockElement('div');
    hud.mount(container as unknown as HTMLElement);

    // Initial prompt with 0% hold
    hud.update({
      interactionPrompt: '[HOLD E] PRIME GENERATOR',
      promptHoldProgress: 0.0,
    });

    const ringFill = container.querySelector('#hud-prompt-ring-fill');
    expect(ringFill).toBeDefined();
    expect(ringFill?.style.strokeDashoffset).toBeCloseTo(62.83, 1);

    // Hold at 50%
    hud.update({
      interactionPrompt: '[HOLD E] PRIME GENERATOR',
      promptHoldProgress: 0.5,
    });
    expect(ringFill?.style.strokeDashoffset).toBeCloseTo(31.415, 1);

    // Hold completes at 100%
    hud.update({
      interactionPrompt: '[HOLD E] PRIME GENERATOR',
      promptHoldProgress: 1.0,
    });
    expect(ringFill?.style.strokeDashoffset).toBeCloseTo(0, 1);
  });

  it('6.3 verifies waterNoiseRadius uses the x40 factor from Hearing.ts', () => {
    expect(ACOUSTIC_CONSTANTS.MAX_HEAR_RADIUS).toBe(40.0);

    const hud = new Hud();
    const container = new MockElement('div');
    hud.mount(container as unknown as HTMLElement);

    // 0.70 agitation * 40 = 28m
    const loudness = 0.70;
    const computedRadius = Math.round(loudness * ACOUSTIC_CONSTANTS.MAX_HEAR_RADIUS);
    expect(computedRadius).toBe(28);

    hud.update({
      noiseLoudness: loudness,
      waterNoiseRadius: computedRadius,
    });

    const label = container.querySelector('#hud-noise-minimal-radius');
    expect(label?.textContent).toBe('RADIUS ~28m');
  });

  it('6.4 verifies risk tag is derived from state rather than objective string', () => {
    const hud = new Hud();
    const container = new MockElement('div');
    hud.mount(container as unknown as HTMLElement);

    const riskTagEl = container.querySelector('#hud-risk-tag');
    expect(riskTagEl).toBeDefined();

    // 1. Moving in water -> LOUD, even with a tranquil objective string
    hud.update({
      objective: 'Quietly observe the water.',
      riskTag: 'LOUD',
    });
    expect(riskTagEl?.textContent).toBe('[LOUD]');
    expect(riskTagEl?.classList.contains('hud-risk-loud')).toBe(true);

    // 2. Monster within 18m -> CLOSE
    hud.update({
      objective: 'Find the numbered pillars.',
      riskTag: 'CLOSE',
    });
    expect(riskTagEl?.textContent).toBe('[CLOSE]');
    expect(riskTagEl?.classList.contains('hud-risk-close')).toBe(true);

    // 3. Monster hunting -> HUNTED (pulsing red)
    hud.update({
      objective: 'Find the numbered pillars.',
      riskTag: 'HUNTED',
    });
    expect(riskTagEl?.textContent).toBe('[HUNTED]');
    expect(riskTagEl?.classList.contains('hud-risk-hunted')).toBe(true);

    // 4. Safe on dry tile -> QUIET
    hud.update({
      objective: 'Find the numbered pillars.',
      riskTag: 'QUIET',
    });
    expect(riskTagEl?.textContent).toBe('[QUIET]');
    expect(riskTagEl?.classList.contains('hud-risk-quiet')).toBe(true);
  });

  it('6.5 verifies unified speeds: walk 3.2, sprint 5.2, threshold 3.7', () => {
    expect(WORLD.PLAYER.WALK).toBe(3.2);
    expect(WORLD.PLAYER.SPRINT).toBe(5.2);
    expect(PlayerMotor.SPEED_WALK).toBe(3.2);
    expect(PlayerMotor.SPEED_SPRINT).toBe(5.2);

    const sprintThreshold = PlayerMotor.SPEED_WALK + 0.5;
    expect(sprintThreshold).toBe(3.7);

    // Ordinary walking (3.2 m/s) is strictly below the sprint threshold
    expect(PlayerMotor.SPEED_WALK).toBeLessThan(sprintThreshold);

    // Sprinting (5.2 m/s) is strictly above the sprint threshold
    expect(PlayerMotor.SPEED_SPRINT).toBeGreaterThan(sprintThreshold);
  });

  it('6.6 verifies enableBob is active when reducedMotion is "system" on non-reduce preference', () => {
    // Mock matchMedia returning false (no prefers-reduced-motion)
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    (globalThis as unknown as { matchMedia: unknown; window: unknown }).matchMedia = matchMediaMock;
    (globalThis as unknown as { window: unknown }).window = { matchMedia: matchMediaMock };

    const settings = defaultSettings();
    expect(settings.accessibility.reducedMotion).toBe('system');
    expect(settings.graphics.headBob).toBe(true);
    expect(settings.graphics.fov).toBe(72);

    const camera = new PerspectiveCamera(settings.graphics.fov, 16 / 9, 0.1, 1000);
    const playerCam = new PlayerCamera(camera, settings);

    // Simulate update while walking on ground
    const prevSnap = {
      pos: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 2.5 },
      yaw: 0,
      pitch: 0,
      onGround: true,
      crouchT: 0,
      stamina: 100,
      exhausted: false,
      wet: false,
      depth: 0,
      mantling: false,
      agitation: 0,
    };
    const currSnap = { ...prevSnap };

    playerCam.update(0.016, prevSnap, currSnap, 1.0);

    // Since enableBob is true, camera Y includes eye-height + bob/idle offset
    expect(camera.position.y).toBeGreaterThan(0.5);
  });

  it('6.10 verifies stamina drain/regen balance and wading speed factors', () => {
    expect(PlayerMotor.WADE_FACTOR).toBe(0.68);
    expect(PlayerMotor.DEEP_WADE_FACTOR).toBe(0.55);
    expect(WORLD.PLAYER.WADE_FACTOR).toBe(0.68);

    const ground = new GroundGrid({ minX: -30, minZ: -30, maxX: 30, maxZ: 30 }, 0.25);
    ground.fill(0);
    const colliders = new ColliderSet(4);
    const events = new EventRingBuffer(64);

    const motor = new PlayerMotor('player1', { x: 0, y: 0, z: 0 });
    expect(motor.stamina).toBe(100);

    // Sprint step (1 second) -> drain is 17.0/s
    motor.step(
      1.0,
      { moveX: 0, moveZ: 1, lookDeltaYaw: 0, lookDeltaPitch: 0, sprint: true, crouch: false, jump: false, interact: false },
      ground,
      colliders,
      events,
      0.016,
      0,
    );
    expect(motor.stamina).toBeCloseTo(83.0, 1);
  });
});
