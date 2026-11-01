/* ── tests/batch5-menu-physics-modes.test.ts ───────────────────────────────
 *  Comprehensive verification suite for ANTIGRAVITY BATCH 5:
 *  - PROMPT 5A: Main Menu / Configuration Save Deadlock Fixes & 8 Play Hub Modes
 *  - PROMPT 5B: Swept Capsule Player Physics, 60 FPS Optimization, and Decal Caching
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsPanel } from '../src/ui/SettingsPanel.js';
import { defaultSettings } from '../src/app/Settings.js';
import { UIController } from '../src/ui/UIController.js';
import { UIManager } from '../src/ui/UIManager.js';
import { PlayerMotor } from '../src/sim/PlayerMotor.js';
import { PlayerPhysics } from '../src/sim/PlayerPhysics.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { ColliderSet } from '../src/sim/Colliders.js';
import { EventRingBuffer } from '../src/sim/Events.js';
import {
  makeTaglineDecal,
  makePuzzleDigitDecal,
  makeWarningDecal,
  makePillarWayfindingArrow,
  clearDecalCache,
} from '../src/procedural/textures/GraffitiDecals.js';
import type { PlayerIntent } from '../src/sim/PlayerMotor.js';
import { AppStateMachine } from '../src/app/StateMachine.js';
import { createEventBus } from '../src/app/EventBus.js';
import { createStore } from '../src/app/Store.js';

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class MockWebGLRenderer {
    domElement: unknown;
    constructor() {
      this.domElement = document.createElement('canvas');
    }
    setSize() {}
    setPixelRatio() {}
    render() {}
    dispose() {}
    setClearColor() {}
  }
  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer as unknown as typeof actual.WebGLRenderer,
  };
});

// ── In-test DOM Shim for Node environment ──────────────────────────────────
class MockCanvasRenderingContext2D {
  fillStyle: string | unknown = '#000000';
  strokeStyle: string | unknown = '#000000';
  lineWidth = 1;
  font = '10px sans-serif';
  textAlign = 'start';
  textBaseline = 'alphabetic';
  shadowColor = 'transparent';
  shadowBlur = 0;
  globalAlpha = 1;

  clearRect() {}
  fillRect() {}
  strokeRect() {}
  drawImage() {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  arc() {}
  rect() {}
  stroke() {}
  fill() {}
  save() {}
  restore() {}
  translate() {}
  rotate() {}
  scale() {}
  fillText() {}
  strokeText() {}
  measureText(_str: string) {
    return { width: 100, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 };
  }
  createLinearGradient() {
    return { addColorStop: () => {} };
  }
  createRadialGradient() {
    return { addColorStop: () => {} };
  }
  createImageData(w = 100, h = 100) {
    return { data: new Uint8ClampedArray(w * h * 4) };
  }
  getImageData(_sx = 0, _sy = 0, sw = 100, sh = 100) {
    return { data: new Uint8ClampedArray(sw * sh * 4) };
  }
  putImageData() {}
}

class MockClassList {
  private classes = new Set<string>();

  add(...names: string[]) {
    for (const name of names) {
      if (name) this.classes.add(name);
    }
  }

  remove(...names: string[]) {
    for (const name of names) {
      this.classes.delete(name);
    }
  }

  contains(name: string): boolean {
    return this.classes.has(name);
  }
}

class MockStyle {
  [key: string]: unknown;
  setProperty(prop: string, val: string) {
    this[prop] = val;
  }
  removeProperty(prop: string) {
    Reflect.deleteProperty(this, prop);
  }
}

class MockElement {
  tagName: string;
  id = '';
  style = new MockStyle() as Record<string, string> & MockStyle;
  classList = new MockClassList();
  attributes = new Map<string, string>();
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  width = 512;
  height = 512;
  private _ctx2d: MockCanvasRenderingContext2D | null = null;
  private listeners = new Map<string, Array<(e: unknown) => void>>();
  private _innerHTML = '';
  private _textContent = '';

  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
  }

  getContext(type: string): MockCanvasRenderingContext2D | null {
    if (type === '2d') {
      if (!this._ctx2d) this._ctx2d = new MockCanvasRenderingContext2D();
      return this._ctx2d;
    }
    return null;
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

  hasAttribute(k: string): boolean {
    return this.attributes.has(k);
  }

  removeAttribute(k: string) {
    this.attributes.delete(k);
    if (k === 'id') this.id = '';
    if (k === 'class') this.classList = new MockClassList();
  }

  addEventListener(type: string, fn: (e: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }

  removeEventListener(type: string, fn: (e: unknown) => void) {
    const list = this.listeners.get(type);
    if (list) {
      this.listeners.set(type, list.filter(f => f !== fn));
    }
  }

  dispatchEvent(event: { type: string }): boolean {
    const list = this.listeners.get(event.type);
    if (list) {
      for (const fn of list) fn(event);
    }
    return true;
  }

  click() {
    this.dispatchEvent({ type: 'click' });
  }

  focus() {}

  appendChild<T extends MockElement>(child: T): T {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  prepend(...children: MockElement[]) {
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i]!;
      child.parentElement = this;
      this.children.unshift(child);
    }
  }

  removeChild<T extends MockElement>(child: T): T {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(html: string) {
    this._innerHTML = html;
    this.children = [];
    const tagRegex = /<([a-zA-Z0-9]+)([^>]*)>/g;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(html)) !== null) {
      const tag = match[1] ?? '';
      const attrStr = match[2] ?? '';
      if (!tag || tag.startsWith('/')) continue;
      const el = new MockElement(tag);
      el.parentElement = this;
      const idMatch = /id=["']([^"']+)["']/.exec(attrStr);
      if (idMatch && idMatch[1]) el.setAttribute('id', idMatch[1]);
      const classMatch = /class=["']([^"']+)["']/.exec(attrStr);
      if (classMatch && classMatch[1]) el.className = classMatch[1];
      this.children.push(el);
    }
  }

  get textContent(): string {
    return this._textContent;
  }

  set textContent(text: string) {
    this._textContent = text;
    this._innerHTML = text;
  }

  querySelector(selector: string): MockElement | null {
    const matchFn = (el: MockElement): boolean => {
      if (selector.startsWith('#') && el.id === selector.slice(1)) return true;
      if (selector.startsWith('.') && el.classList.contains(selector.slice(1))) return true;
      if (el.tagName.toLowerCase() === selector.toLowerCase()) return true;
      return false;
    };

    for (const child of this.children) {
      if (matchFn(child)) return child;
      const sub = child.querySelector(selector);
      if (sub) return sub;
    }
    return null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const matchFn = (el: MockElement): boolean => {
      if (selector.startsWith('#') && el.id === selector.slice(1)) return true;
      if (selector.startsWith('.') && el.classList.contains(selector.slice(1))) return true;
      if (el.tagName.toLowerCase() === selector.toLowerCase()) return true;
      return false;
    };

    for (const child of this.children) {
      if (matchFn(child)) results.push(child);
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }
}

class MockDocument {
  documentElement = new MockElement('html');
  body = new MockElement('body');

  createElement(tag: string): MockElement {
    return new MockElement(tag);
  }

  createElementNS(_ns: string, tag: string): MockElement {
    return new MockElement(tag);
  }

  getElementById(id: string): MockElement | null {
    if (this.body.id === id) return this.body;
    return this.body.querySelector(`#${id}`);
  }

  querySelectorAll(selector: string): MockElement[] {
    return this.body.querySelectorAll(selector);
  }

  querySelector(selector: string): MockElement | null {
    return this.body.querySelector(selector);
  }

  exitPointerLock() {}

  addEventListener(_type: string, _fn: unknown) {}
  removeEventListener(_type: string, _fn: unknown) {}
  dispatchEvent(_event: unknown): boolean {
    return true;
  }
}

const mockDoc = new MockDocument();
globalThis.document = mockDoc as unknown as Document;

const mockLocation = {
  origin: 'http://localhost:3000',
  href: 'http://localhost:3000',
  search: '',
  pathname: '/',
  hash: '',
} as unknown as Location;

const mockWindow = {
  location: mockLocation,
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: () => ({
    matches: false,
    media: '',
    onchange: null,
    dispatchEvent: () => false,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  } as unknown as MediaQueryList),
};

globalThis.window = mockWindow as unknown as Window & typeof globalThis;
globalThis.location = mockLocation;

if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = (fn: (time: number) => void) =>
    setTimeout(() => fn(Date.now()), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

describe('Batch 5: Menu/Modal Deadlock Fixes & Play Hub Modes (Prompt 5A)', () => {
  beforeEach(() => {
    mockDoc.body.children = [];
  });

  it('1.1 SettingsPanel mounts with .modal class and aria-hidden true when closed', () => {
    const container = new MockElement('div');
    mockDoc.body.appendChild(container);

    const panel = new SettingsPanel(defaultSettings(), {
      onBack: vi.fn(),
      onApplySettings: vi.fn(),
      onOpenAudioTest: vi.fn(),
    });

    // @ts-expect-error MockElement compatible
    panel.mount(container);
    const el = mockDoc.getElementById('settings-panel-view');
    expect(el).not.toBeNull();
    expect(el!.classList.contains('modal')).toBe(true);
    expect(el!.getAttribute('aria-hidden')).toBe('true');
  });

  it('1.2 SettingsPanel show() adds .is-open and removes aria-hidden; hide() removes .is-open and sets aria-hidden', () => {
    const container = new MockElement('div');
    mockDoc.body.appendChild(container);

    const panel = new SettingsPanel(defaultSettings(), {
      onBack: vi.fn(),
      onApplySettings: vi.fn(),
      onOpenAudioTest: vi.fn(),
    });

    // @ts-expect-error MockElement compatible
    panel.mount(container);
    const el = mockDoc.getElementById('settings-panel-view')!;

    panel.show();
    expect(el.classList.contains('is-open')).toBe(true);
    expect(el.getAttribute('aria-hidden')).toBeNull();
    expect(el.style.pointerEvents).toBe('auto');

    panel.hide();
    expect(el.classList.contains('is-open')).toBe(false);
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.style.pointerEvents).toBe('none');
  });

  it('1.3 saveAndExitConfiguration synchronously closes modal and restores pointer-events on Main Menu', () => {
    const mainMenuEl = new MockElement('div');
    mainMenuEl.id = 'screen-home';
    mainMenuEl.style.pointerEvents = 'none';
    mockDoc.body.appendChild(mainMenuEl);

    const onBackMock = vi.fn();
    const onApplyMock = vi.fn();

    const panel = new SettingsPanel(defaultSettings(), {
      onBack: onBackMock,
      onApplySettings: onApplyMock,
      onOpenAudioTest: vi.fn(),
    });

    // @ts-expect-error MockElement compatible
    panel.mount(mockDoc.body);
    panel.show();

    const panelEl = mockDoc.getElementById('settings-panel-view')!;
    expect(panelEl.classList.contains('is-open')).toBe(true);

    panel.saveAndExitConfiguration();

    expect(panelEl.classList.contains('is-open')).toBe(false);
    expect(panelEl.getAttribute('aria-hidden')).toBe('true');
    expect(panelEl.style.pointerEvents).toBe('none');
    expect(mainMenuEl.style.pointerEvents).toBe('auto');
    expect(mainMenuEl.getAttribute('inert')).toBeNull();
    expect(onApplyMock).toHaveBeenCalledTimes(1);
    expect(onBackMock).toHaveBeenCalledTimes(1);
  });

  it('1.4 UIController export alias is defined and matches UIManager', () => {
    expect(UIController).toBeDefined();
    expect(UIController).toBe(UIManager);
  });

  it('1.5 All 8 Play Hub modes launch into authentic Poolrooms natatorium map', () => {
    const startConfigs: Array<{ mapId: string; subMode?: string | undefined; difficulty: number }> = [];

    const bus = createEventBus();
    const store = createStore({
      settings: defaultSettings(),
      session: { mode: 'single', mapId: 'natatorium', seed: 1, room: null },
      ui: { showFps: false, debugMode: false, labMode: false },
    });
    const sm = new AppStateMachine(bus, 'MENU');

    const appContainer = new MockElement('div');
    appContainer.id = 'app';
    mockDoc.body.appendChild(appContainer);

    const ui = new UIManager({
      // @ts-expect-error MockElement compatible
      container: appContainer,
      bus,
      store,
      stateMachine: sm,
      onStartGame: (cfg) => {
        startConfigs.push({
          mapId: cfg.mapId,
          subMode: cfg.subMode,
          difficulty: cfg.difficulty,
        });
      },
    });

    // Test all 8 Play Hub modes
    const modes = [
      { id: 'campaign', expectedSubMode: 'campaign' },
      { id: 'daily', expectedSubMode: 'daily' },
      { id: 'endless', expectedSubMode: 'endless' },
      { id: 'ghost', expectedSubMode: 'ghost' },
      { id: 'training', expectedSubMode: 'training' },
      { id: 'coop', expectedSubMode: 'coop' },
      { id: 'race', expectedSubMode: 'race' },
      { id: 'last_dry', expectedSubMode: 'last_dry' },
    ];

    for (const m of modes) {
      // Trigger via playHubScreen or selectMode callback
      // @ts-expect-error Access private callback for unit testing
      ui.playHubScreen.callbacks.onSelectMode(m.id);
      const last = startConfigs[startConfigs.length - 1]!;
      expect(last.mapId).toBe('natatorium');
      expect(last.subMode).toBe(m.expectedSubMode);
    }
  });
});

describe('Batch 5: Swept Capsule Player Physics & Auto-Mantle (Prompt 5B)', () => {
  it('2.1 PlayerMotor exposes parkour tuning constants matching reference specs', () => {
    expect(PlayerMotor.PARKOUR_DRY_SPEED).toBe(5.5);
    expect(PlayerMotor.PARKOUR_WADE_SPEED).toBe(3.4);
    expect(PlayerMotor.PARKOUR_JUMP_V).toBe(6.3);
    expect(PlayerMotor.PARKOUR_GRAVITY).toBe(16.8);
    expect(PlayerMotor.PARKOUR_COYOTE).toBe(0.12);
    expect(PlayerMotor.PARKOUR_JUMP_BUFFER).toBe(0.12);
    expect(PlayerMotor.PARKOUR_STAND_HEIGHT).toBe(1.75);
    expect(PlayerMotor.PARKOUR_EYE_STAND).toBe(1.58);
  });

  it('2.2 PlayerPhysics export alias is defined and matches PlayerMotor', () => {
    expect(PlayerPhysics).toBeDefined();
    expect(PlayerPhysics).toBe(PlayerMotor);
  });

  it('2.3 Auto-Mantle Ledge Assist smoothly steps player up onto dry platform y=0.38m when jumping from water within 0.18m', () => {
    // Water floor at -0.75m, platform top at +0.38m
    const bounds = { minX: -10, minZ: -10, maxX: 10, maxZ: 10 };
    const ground = new GroundGrid(bounds, 0.25);
    ground.fill(-0.75);
    ground.setRectHeight(-2, 1.0, 2, 3.0, 0.38);

    const colliders = new ColliderSet(4);
    colliders.addBox('platform_1', { x: -2, y: -0.75, z: 1.0 }, { x: 2, y: 0.38, z: 3.0 });
    const events = new EventRingBuffer(64);

    // Player in water at z = 0.6, facing north towards platform (yaw = Math.PI -> forward is +Z)
    // Feet at y = 0.22m (within 0.18m of 0.38m platform top)
    const motor = new PlayerMotor('parkour_player', { x: 0, y: 0.22, z: 0.6 }, { parkourMode: true });
    motor.setYaw(Math.PI);

    const intent: PlayerIntent = {
      moveX: 0,
      moveZ: -1, // Forward towards +Z
      sprint: false,
      crouch: false,
      jump: true,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };

    // Step motor - Auto-Mantle should trigger and place player on the platform at y = 0.38
    motor.step(1 / 60, intent, ground, colliders, events, 0, 0);

    expect(motor.pos.y).toBeCloseTo(0.38, 2);
    expect(motor.onGround).toBe(true);
    expect(motor.wet).toBe(false);
  });

  it('2.4 Solid platform sides block horizontal movement into the platform body', () => {
    const bounds = { minX: -10, minZ: -10, maxX: 10, maxZ: 10 };
    const ground = new GroundGrid(bounds, 0.25);
    ground.fill(-0.75);
    ground.setRectHeight(-2, 1.0, 2, 3.0, 0.38);

    const colliders = new ColliderSet(4);
    colliders.addBox('platform_1', { x: -2, y: -0.75, z: 1.0 }, { x: 2, y: 0.38, z: 3.0 });
    const events = new EventRingBuffer(64);

    // Player deep in water at y = -0.75m (step height 1.13m > STEP_LIMIT 0.45m)
    const motor = new PlayerMotor('swimmer', { x: 0, y: -0.75, z: 0.5 }, { parkourMode: true });
    motor.setYaw(Math.PI); // Facing +Z towards platform

    const intent: PlayerIntent = {
      moveX: 0,
      moveZ: -1, // Forward into solid wall
      sprint: true,
      crouch: false,
      jump: false,
      interact: false,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
    };

    // Step forward 10 frames
    for (let i = 0; i < 10; i++) {
      motor.step(1 / 60, intent, ground, colliders, events, i / 60, 0);
    }

    // Player should not penetrate inside z >= 1.0 platform body (must be blocked by side barrier)
    expect(motor.pos.z).toBeLessThan(1.0);
    expect(motor.pos.y).toBeCloseTo(-0.75, 2);
  });
});

describe('Batch 5: Decal Texture Caching & Zero-Allocation Performance', () => {
  beforeEach(() => {
    clearDecalCache();
  });

  it('3.1 makeTaglineDecal returns identical cached texture on repeated calls', () => {
    const t1 = makeTaglineDecal({ seed: 77, width: 512, height: 256 });
    const t2 = makeTaglineDecal({ seed: 77, width: 512, height: 256 });
    expect(t1).toBe(t2);
  });

  it('3.2 makePuzzleDigitDecal returns identical cached texture for same digit and seed', () => {
    const p1 = makePuzzleDigitDecal('1', true, 505, '#1e88e5');
    const p2 = makePuzzleDigitDecal('1', true, 505, '#1e88e5');
    expect(p1).toBe(p2);
  });

  it('3.3 makeWarningDecal and makePillarWayfindingArrow return cached textures', () => {
    const w1 = makeWarningDecal('arrow', { seed: 55, size: 256 });
    const w2 = makeWarningDecal('arrow', { seed: 55, size: 256 });
    expect(w1).toBe(w2);

    const a1 = makePillarWayfindingArrow('right', false, 99);
    const a2 = makePillarWayfindingArrow('right', false, 99);
    expect(a1).toBe(a2);
  });
});
