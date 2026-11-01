/* ── prompt1-ui-state-pointerlock.test.ts ──────────────────────────────────
 *  Tests for Antigravity Prompt 1A & Prompt 1B:
 *  1. Strict Single-Source-of-Truth UI State Controller (MAIN_MENU, PLAY_HUB, MODAL_SUBPAGE, ACTIVE_GAMEPLAY, PAUSED).
 *  2. document.body.dataset.uiState sync across all views and transitions.
 *  3. Instant ACTIVE_GAMEPLAY transition on all game start triggers (Continue, Daily, 8 Play Hub modes).
 *  4. Strict PointerLock guards: blocked during menus and interactive UI clicks; enabled in active gameplay.
 *  5. Minimalist HUD and center sector title toast.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  setProperty(key: string, val: string) {
    this[key] = val;
  }
  getPropertyValue(key: string): string {
    return (this[key] as string) ?? '';
  }
  removeProperty(key: string) {
    Reflect.deleteProperty(this, key);
  }
}

function findClosest(el: MockElement | null, selector: string): MockElement | null {
  const parts = selector.split(',').map((s) => s.trim());
  const matches = (target: MockElement): boolean => {
    for (const part of parts) {
      if (part.startsWith('.') && target.classList.contains(part.slice(1))) return true;
      if (part.startsWith('#') && target.id === part.slice(1)) return true;
      if (target.tagName.toLowerCase() === part.toLowerCase()) return true;
    }
    return false;
  };

  let cur: MockElement | null = el;
  while (cur) {
    if (matches(cur)) return cur;
    cur = cur.parentElement;
  }
  return null;
}

class MockElement {
  tagName: string;
  id: string = '';
  style = new MockStyle() as unknown as Record<string, string> & MockStyle;
  classList = new MockClassList();
  attributes = new Map<string, string>();
  dataset: Record<string, string> = {};
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  textContent: string = '';
  private listeners = new Map<string, Array<(e: unknown) => void>>();
  private _innerHTML: string = '';

  constructor(tag: string = 'div') {
    this.tagName = tag.toUpperCase();
  }

  get className(): string {
    return this.attributes.get('class') ?? '';
  }

  set className(val: string) {
    this.setAttribute('class', val);
    const parts = val.split(/\s+/).filter(Boolean);
    this.classList = new MockClassList();
    this.classList.add(...parts);
  }

  setAttribute(k: string, v: string) {
    this.attributes.set(k, String(v));
    if (k === 'id') this.id = v;
    if (k === 'style') {
      const rules = v.split(';');
      for (const rule of rules) {
        const parts = rule.split(':');
        if (parts.length >= 2) {
          const prop = parts[0]!.trim();
          const val = parts.slice(1).join(':').trim();
          if (prop && val) {
            const camelK = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
            this.style[camelK] = val;
            this.style[prop] = val;
          }
        }
      }
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
  }

  closest(selector: string): MockElement | null {
    return findClosest(this, selector);
  }

  addEventListener(type: string, fn: (e: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }

  removeEventListener(type: string, fn: (e: unknown) => void) {
    const list = this.listeners.get(type);
    if (!list) return;
    const idx = list.indexOf(fn);
    if (idx !== -1) list.splice(idx, 1);
  }

  dispatchEvent(event: { type: string; [key: string]: unknown }): boolean {
    const list = this.listeners.get(event.type);
    if (list) {
      for (const fn of list) fn(event);
    }
    return true;
  }

  appendChild<T extends MockElement>(child: T): T {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  prepend<T extends MockElement>(child: T): T {
    child.parentElement = this;
    this.children.unshift(child);
    return child;
  }

  getContext() {
    return {
      fillRect: () => {},
      clearRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      fillText: () => {},
      strokeText: () => {},
      measureText: () => ({ width: 0 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      putImageData: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      createImageData: () => ({ data: new Uint8ClampedArray(4) }),
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
    };
  }

  removeChild<T extends MockElement>(child: T): T {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  focus() {}
  blur() {}

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
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

      const styleMatch = /style="([^"]*)"/s.exec(attrStr) ?? /style='([^']*)'/s.exec(attrStr);
      const styleContent = styleMatch ? (styleMatch[1] ?? styleMatch[2] ?? '') : '';
      if (styleContent) el.setAttribute('style', styleContent);

      this.children.push(el);
    }
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
  pointerLockElement: MockElement | null = null;
  private listeners = new Map<string, Array<(e: unknown) => void>>();

  addEventListener(type: string, fn: (e: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }

  removeEventListener(type: string, fn: (e: unknown) => void) {
    const list = this.listeners.get(type);
    if (!list) return;
    const idx = list.indexOf(fn);
    if (idx !== -1) list.splice(idx, 1);
  }

  dispatchEvent(event: { type: string; [key: string]: unknown }): boolean {
    const list = this.listeners.get(event.type);
    if (list) {
      for (const fn of list) fn(event);
    }
    return true;
  }

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

  exitPointerLock() {
    this.pointerLockElement = null;
  }
}

const mockDoc = new MockDocument();
const g = globalThis as unknown as Record<string, unknown>;
g.document = mockDoc;
g.HTMLElement = MockElement;
g.HTMLCanvasElement = MockElement;
g.HTMLButtonElement = MockElement;
g.location = { origin: 'http://localhost', pathname: '/', search: '', href: 'http://localhost/' };
g.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  location: g.location,
  navigator: typeof navigator !== 'undefined' ? navigator : {},
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  requestAnimationFrame: (cb: (time: number) => void) => setTimeout(cb, 16) as unknown as number,
  cancelAnimationFrame: (id: number) => clearTimeout(id),
};
g.requestAnimationFrame = (cb: (time: number) => void) => setTimeout(cb, 16) as unknown as number;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);

import { UIManager } from '../src/ui/UIManager.js';
import { HomeScreen } from '../src/ui/screens/HomeScreen.js';
import { PlayHubScreen } from '../src/ui/screens/PlayHubScreen.js';
import { Hud } from '../src/ui/Hud.js';
import { createEventBus } from '../src/app/EventBus.js';
import { createStore } from '../src/app/Store.js';
import { AppStateMachine } from '../src/app/StateMachine.js';
import { safeRequestPointerLock } from '../src/engine/input/PointerLock.js';
import { loadSettings } from '../src/app/Settings.js';

describe('Prompt 1A & 1B: UI State Machine, PointerLock Guards, and Clean HUD', () => {
  let container: MockElement;
  let bus: ReturnType<typeof createEventBus>;
  let store: ReturnType<typeof createStore>;
  let stateMachine: AppStateMachine;
  let ui: UIManager;

  beforeEach(() => {
    mockDoc.body = new MockElement('body');
    mockDoc.body.dataset.uiState = 'MAIN_MENU';
    mockDoc.pointerLockElement = null;

    container = new MockElement('div');
    container.id = 'app';
    mockDoc.body.appendChild(container);

    bus = createEventBus();
    store = createStore({
      settings: loadSettings(),
      session: { mode: 'single', mapId: 'natatorium', seed: 1234, room: null },
      ui: { showFps: false, debugMode: false, labMode: false },
    });
    stateMachine = new AppStateMachine(bus, 'MENU');

    ui = new UIManager({
      container: container as unknown as HTMLElement,
      bus,
      store,
      stateMachine,
    });
  });

  describe('Prompt 1A: Strict UI State Machine Controller', () => {
    it('initializes in MAIN_MENU and synchronizes document.body.dataset.uiState', () => {
      expect(ui.getUIState()).toBe('MAIN_MENU');
      expect(mockDoc.body.dataset.uiState).toBe('MAIN_MENU');
    });

    it('transitions to PLAY_HUB when opening play hub modal', () => {
      ui.navigateTo('PLAY_HUB');
      expect(ui.getUIState()).toBe('PLAY_HUB');
      expect(mockDoc.body.dataset.uiState).toBe('PLAY_HUB');
    });

    it('transitions to MODAL_SUBPAGE when navigating to bestiary, leaderboards, champions, profile', () => {
      ui.navigateTo('LEADERBOARDS');
      expect(ui.getUIState()).toBe('MODAL_SUBPAGE');
      expect(mockDoc.body.dataset.uiState).toBe('MODAL_SUBPAGE');

      ui.navigateTo('PROFILE');
      expect(ui.getUIState()).toBe('MODAL_SUBPAGE');
      expect(mockDoc.body.dataset.uiState).toBe('MODAL_SUBPAGE');

      ui.navigateTo('CHAMPIONS');
      expect(ui.getUIState()).toBe('MODAL_SUBPAGE');
      expect(mockDoc.body.dataset.uiState).toBe('MODAL_SUBPAGE');

      ui.navigateTo('BESTIARY');
      expect(ui.getUIState()).toBe('MODAL_SUBPAGE');
      expect(mockDoc.body.dataset.uiState).toBe('MODAL_SUBPAGE');
    });

    it('transitions to ACTIVE_GAMEPLAY when navigating to GAME view', () => {
      ui.navigateTo('GAME');
      expect(ui.getUIState()).toBe('ACTIVE_GAMEPLAY');
      expect(mockDoc.body.dataset.uiState).toBe('ACTIVE_GAMEPLAY');
    });

    it('transitions to PAUSED on showPause() and returns to ACTIVE_GAMEPLAY on resumeGame()', () => {
      ui.navigateTo('GAME');
      expect(ui.getUIState()).toBe('ACTIVE_GAMEPLAY');

      ui.showPause();
      expect(ui.getUIState()).toBe('PAUSED');
      expect(mockDoc.body.dataset.uiState).toBe('PAUSED');

      ui.resumeGame();
      expect(ui.getUIState()).toBe('ACTIVE_GAMEPLAY');
      expect(mockDoc.body.dataset.uiState).toBe('ACTIVE_GAMEPLAY');
    });

    it('transitions back to MAIN_MENU on goBack() from subpages', () => {
      ui.navigateTo('LEADERBOARDS');
      expect(ui.getUIState()).toBe('MODAL_SUBPAGE');

      ui.goBack();
      expect(ui.getUIState()).toBe('MAIN_MENU');
      expect(mockDoc.body.dataset.uiState).toBe('MAIN_MENU');
    });

    it('verifies HomeScreen renders #top-navbar, #main-menu-card, and #bottom-dossier-bar', () => {
      const noop = () => {};
      const home = new HomeScreen({
        onDescend: noop,
        onDiveOnline: noop,
        onDailyDescent: noop,
        onOpenPlayHub: noop,
        onOpenBestiary: noop,
        onOpenLeaderboards: noop,
        onOpenChampions: noop,
        onOpenProfile: noop,
        onOpenSettings: noop,
        onOpenCredits: noop,
        onOpenAbout: noop,
      });

      const topNav = home.element.querySelector('#top-navbar');
      const menuCard = home.element.querySelector('#main-menu-card');
      const bottomDossier = home.element.querySelector('#bottom-dossier-bar');

      expect(topNav).toBeDefined();
      expect(topNav?.classList.contains('top-bar')).toBe(true);

      expect(menuCard).toBeDefined();
      expect(menuCard?.classList.contains('hero-panel')).toBe(true);

      expect(bottomDossier).toBeDefined();
      expect(bottomDossier?.classList.contains('dossier-strip')).toBe(true);
    });

    it('verifies PlayHubScreen root has id="play-hub-modal" and class="subpage-modal"', () => {
      const hub = new PlayHubScreen({
        onSelectMode: () => {},
        onBack: () => {},
      });

      expect(hub.element.id).toBe('play-hub-modal');
      expect(hub.element.classList.contains('subpage-modal')).toBe(true);
    });
  });

  describe('Prompt 1B: PointerLock Guard & Modal Conflict Prevention', () => {
    it('strictly blocks safeRequestPointerLock when uiState is not ACTIVE_GAMEPLAY', async () => {
      const canvas = new MockElement('canvas') as unknown as HTMLElement & {
        requestPointerLock: () => Promise<void>;
      };
      const lockSpy = vi.fn().mockResolvedValue(undefined);
      canvas.requestPointerLock = lockSpy;

      mockDoc.body.dataset.uiState = 'MAIN_MENU';
      const resultMenu = await safeRequestPointerLock(canvas);
      expect(resultMenu).toBe(false);
      expect(lockSpy).not.toHaveBeenCalled();

      mockDoc.body.dataset.uiState = 'MODAL_SUBPAGE';
      const resultModal = await safeRequestPointerLock(canvas);
      expect(resultModal).toBe(false);
      expect(lockSpy).not.toHaveBeenCalled();

      mockDoc.body.dataset.uiState = 'PLAY_HUB';
      const resultHub = await safeRequestPointerLock(canvas);
      expect(resultHub).toBe(false);
      expect(lockSpy).not.toHaveBeenCalled();
    });

    it('allows safeRequestPointerLock when uiState is ACTIVE_GAMEPLAY', async () => {
      const canvas = new MockElement('canvas') as unknown as HTMLElement & {
        requestPointerLock: () => Promise<void>;
      };
      const lockSpy = vi.fn().mockResolvedValue(undefined);
      canvas.requestPointerLock = lockSpy;

      mockDoc.body.dataset.uiState = 'ACTIVE_GAMEPLAY';
      const result = await safeRequestPointerLock(canvas);
      expect(result).toBe(true);
      expect(lockSpy).toHaveBeenCalled();
    });

    it('exits pointer lock immediately when transitioning away from ACTIVE_GAMEPLAY', () => {
      mockDoc.pointerLockElement = new MockElement('canvas');
      expect(mockDoc.pointerLockElement).not.toBeNull();

      ui.setUIState('ACTIVE_GAMEPLAY');
      ui.setUIState('MODAL_SUBPAGE');

      expect(mockDoc.pointerLockElement).toBeNull();
    });
  });

  describe('Prompt 1B: Minimal HUD & Sector Title Toast', () => {
    it('verifies Hud renders minimal core elements and sector toast element', () => {
      const hud = new Hud();
      const mountContainer = new MockElement('div');
      hud.mount(mountContainer as unknown as HTMLElement);

      const overlay = mountContainer.children[0];
      expect(overlay).toBeDefined();

      const runTimer = overlay?.querySelector('#hud-run-timer');
      const reticle = overlay?.querySelector('#hud-reticle');
      const hotbar = overlay?.querySelector('#hud-throwable-hotbar');
      const sectorToast = overlay?.querySelector('#hud-sector-toast');
      const objectiveBox = overlay?.querySelector('#hud-objective-container');

      expect(runTimer).toBeDefined();
      expect(reticle).toBeDefined();
      expect(hotbar).toBeDefined();
      expect(sectorToast).toBeDefined();
      expect(objectiveBox).toBeDefined();
      expect(objectiveBox?.classList.contains('sector-briefing-box')).toBe(true);
    });

    it('displays 2.0s fade toast when sectorTitle updates', () => {
      vi.useFakeTimers();
      const hud = new Hud();
      const mountContainer = new MockElement('div');
      hud.mount(mountContainer as unknown as HTMLElement);

      const toast = mountContainer.children[0]?.querySelector('#hud-sector-toast');
      expect(toast).toBeDefined();
      expect(toast?.style.opacity).toBe('0');

      hud.update({ sectorTitle: 'THE ARCHIVE TAPES // SECTOR 01' });

      expect(toast?.textContent).toBe('THE ARCHIVE TAPES // SECTOR 01');
      expect(toast?.style.opacity).toBe('1');

      // After 2.0s duration, fades out
      vi.advanceTimersByTime(2100);
      expect(toast?.style.opacity).toBe('0');
      vi.useRealTimers();
    });
  });
});
