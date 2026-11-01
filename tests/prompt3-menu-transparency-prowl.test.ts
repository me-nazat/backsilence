/* ── prompt3-menu-transparency-prowl.test.ts ──────────────────────────────
 *  Unit tests for ANTIGRAVITY PROMPT 3A & 3B:
 *  - 3A: Ultra-transparent central BACKSILENCE card, high-contrast title/tagline/description,
 *        and crisp semi-translucent buttons.
 *  - 3B: Main Menu 3D attract scene camera framing (0, 1.85, 8.5) -> (0, 0.65, -6.0),
 *        tall Roman archway at z = -8.0m, overhead skylight (intensity 1.6, 0xfff6dd),
 *        and active monster figure-8 prowl loop with periodic pause & ripples.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi } from 'vitest';
import { Scene } from 'three';

interface FsModule {
  readFileSync: (path: string, encoding: string) => string;
}

interface PathModule {
  resolve: (...parts: string[]) => string;
}

declare const process: { cwd: () => string };

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class MockWebGLRenderer {
    domElement: unknown;
    shadowMap = { enabled: false, type: 0 };
    toneMapping = 0;
    toneMappingExposure = 1.0;
    capabilities = { isWebGL2: true, maxTextures: 16 };
    info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } };
    constructor() {
      this.domElement = typeof document !== 'undefined' ? document.createElement('canvas') : {};
    }
    setSize() {}
    setPixelRatio() {}
    render() {}
    dispose() {}
    setClearColor() {}
    getRenderTarget() {
      return null;
    }
    setRenderTarget() {}
    readRenderTargetPixels() {}
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
      if (name) this.classes.delete(name);
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
  clientWidth: number = 800;
  clientHeight: number = 600;
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

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };
  }

  getContext() {
    return {
      fillRect: () => {},
      clearRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      bezierCurveTo: () => {},
      quadraticCurveTo: () => {},
      closePath: () => {},
      rect: () => {},
      ellipse: () => {},
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
  addEventListener() {}
  removeEventListener() {}
}

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const mockDoc = new MockDocument();
const g = globalThis as unknown as Record<string, unknown>;
g.document = mockDoc;
g.ResizeObserver = MockResizeObserver;
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

import { HomeScreen } from '../src/ui/screens/HomeScreen.js';
import { AnimationLabPanel } from '../src/lab/AnimationLabPanel.js';
import { LabScene } from '../src/lab/LabScene.js';
import { defaultSettings } from '../src/app/Settings.js';
import { WORLD } from '../src/app/Config.js';

describe('ANTIGRAVITY PROMPT 3A: Transparent Central Card & High-Contrast Typography', () => {
  it('1. Verifies HomeScreen renders #main-menu-card with hero-card class and transparent container styling', () => {
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

    const menuCard = home.element.querySelector('#main-menu-card');
    expect(menuCard).toBeDefined();
    expect(menuCard?.classList.contains('hero-card')).toBe(true);
    expect(menuCard?.classList.contains('hero-panel')).toBe(true);
    expect(menuCard?.classList.contains('bs-contrast-panel')).toBe(true);
  });

  it('2. Verifies CSS rules in index.html and kit.css enforce ultra-transparent glass and low blur', async () => {
    const fsModName = 'node:fs';
    const pathModName = 'node:path';
    const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;
    const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/ui/kit/kit.css'), 'utf-8');

    for (const source of [html, css]) {
      expect(source).toContain('rgba(8, 14, 11, 0.26)');
      expect(source).toContain('blur(2.5px)');
      expect(source).toContain('saturate(1.15)');
    }
  });

  it('3. Verifies Wordmark title, primary tagline, and secondary description have high-contrast classes and colors', async () => {
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

    const titleSvg = home.element.querySelector('#hero-logo-svg');
    expect(titleSvg?.classList.contains('hero-title')).toBe(true);

    const tagline = home.element.querySelector('.hero-tagline');
    expect(tagline).toBeDefined();

    const desc = home.element.querySelector('.hero-description');
    expect(desc).toBeDefined();

    // Check CSS defines crisp contrast rules
    const fsModName = 'node:fs';
    const pathModName = 'node:path';
    const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/ui/kit/kit.css'), 'utf-8');
    expect(css).toContain('.hero-title');
    expect(css).toContain('#f4f7f0');
    expect(css).toContain('.hero-tagline');
    expect(css).toContain('#e8f5ec');
    expect(css).toContain('.hero-description');
    expect(css).toContain('#cfe3d6');
  });

  it('4. Verifies the 4 action buttons have hero-btn class and crisp semi-translucent styling', async () => {
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

    const soloBtn = home.element.querySelector('#btn-play-solo');
    const playHubBtn = home.element.querySelector('#btn-hero-playhub');
    const onlineBtn = home.element.querySelector('#btn-play-online');
    const dailyBtn = home.element.querySelector('#btn-daily-descent');

    expect(soloBtn?.classList.contains('hero-btn')).toBe(true);
    expect(playHubBtn?.classList.contains('hero-btn')).toBe(true);
    expect(onlineBtn?.classList.contains('hero-btn')).toBe(true);
    expect(dailyBtn?.classList.contains('hero-btn')).toBe(true);

    const fsModName = 'node:fs';
    const pathModName = 'node:path';
    const fs = (await import(/* @vite-ignore */ fsModName)) as unknown as FsModule;
    const path = (await import(/* @vite-ignore */ pathModName)) as unknown as PathModule;
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/ui/kit/kit.css'), 'utf-8');
    expect(css).toContain('rgba(12, 20, 16, 0.62)');
    expect(css).toContain('rgba(210, 230, 195, 0.55)');
    expect(css).toContain('rgba(32, 64, 48, 0.78)');
    expect(css).toContain('#a8e6c3');
  });
});

describe('ANTIGRAVITY PROMPT 3B: Main Menu 3D Attract Scene & Monster Prowl Loop', () => {
  it('1. AnimationLabPanel exposes getMonsterSkin() returning the creature instance', () => {
    const scene = new Scene();
    const lab = new AnimationLabPanel(scene, { isMenuMode: true });
    const container = new MockElement('div') as unknown as HTMLElement;
    lab.mount(container);

    const skin = lab.getMonsterSkin();
    expect(skin).toBeDefined();
    expect(skin?.root).toBeDefined();

    lab.dispose();
  });

  it('2. LabScene in menu mode sets up camera framing looking down water channel toward Roman archway', () => {
    const container = new MockElement('div') as unknown as HTMLElement;
    const labScene = new LabScene(container, defaultSettings(), { isMenuMode: true });

    labScene.update(0.016);

    // Camera framed near (0, 1.85, 8.5)
    expect(Math.abs(labScene.camera.position.x)).toBeLessThan(0.3);
    expect(Math.abs(labScene.camera.position.y - 1.85)).toBeLessThan(0.1);
    expect(Math.abs(labScene.camera.position.z - 8.5)).toBeLessThan(0.1);

    // Mid-ground Roman Archway exists and is placed at z = -8.0m
    let foundArch = false;
    labScene.scene.traverse((obj) => {
      if (Math.abs(obj.position.z - -8.0) < 0.05 && Math.abs(obj.position.x) < 0.05) {
        foundArch = true;
      }
    });
    expect(foundArch).toBe(true);

    labScene.dispose();
  });

  it('3. LabScene sets up flooded emerald water channel framed by platforms and overhead skylight', () => {
    const container = new MockElement('div') as unknown as HTMLElement;
    const labScene = new LabScene(container, defaultSettings(), { isMenuMode: true });

    let leftSlab = false;
    let rightSlab = false;
    let skylight = false;

    labScene.scene.traverse((obj) => {
      if (Math.abs(obj.position.x - -4.5) < 0.1 && Math.abs(obj.position.z - -3.0) < 0.1) {
        leftSlab = true;
      }
      if (Math.abs(obj.position.x - 4.5) < 0.1 && Math.abs(obj.position.z - -3.0) < 0.1) {
        rightSlab = true;
      }
      if ('isPointLight' in obj && obj.position.y >= 4.0 && Math.abs(obj.position.z - -6.0) < 0.1) {
        skylight = true;
      }
    });

    expect(leftSlab).toBe(true);
    expect(rightSlab).toBe(true);
    expect(skylight).toBe(true);

    labScene.dispose();
  });

  it('4. LabScene keeps 3D monster patrolling in figure-8 path within bounds behind central card', () => {
    const container = new MockElement('div') as unknown as HTMLElement;
    const labScene = new LabScene(container, defaultSettings(), { isMenuMode: true });
    const skin = labScene.animLabPanel.getMonsterSkin();
    expect(skin).toBeDefined();

    for (let i = 0; i < 60; i++) {
      labScene.update(0.05);
      const pos = skin!.root.position;

      // Centered between z = -3.5m and z = -11.0m, x = -4.5m to +4.5m
      expect(pos.x).toBeGreaterThanOrEqual(-4.5);
      expect(pos.x).toBeLessThanOrEqual(4.5);
      expect(pos.z).toBeGreaterThanOrEqual(-11.5);
      expect(pos.z).toBeLessThanOrEqual(-3.0);
      expect(pos.y).toBeCloseTo(WORLD.WATER_Y, 1);
    }

    labScene.dispose();
  });

  it('5. LabScene executes periodic listening pause in center channel (z = -5.5m) and emits ripples', () => {
    const container = new MockElement('div') as unknown as HTMLElement;
    const labScene = new LabScene(container, defaultSettings(), { isMenuMode: true });
    const skin = labScene.animLabPanel.getMonsterSkin();
    expect(skin).toBeDefined();

    let pausedObserved = false;

    for (let i = 0; i < 240; i++) {
      labScene.update(0.05);
      const pos = skin!.root.position;
      if (Math.abs(pos.x) < 0.05 && Math.abs(pos.z - -5.5) < 0.1) {
        pausedObserved = true;
        break;
      }
    }

    expect(pausedObserved).toBe(true);

    labScene.dispose();
  });
});
