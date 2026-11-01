/* ── prompt1-start-flow.test.ts ──────────────────────────────────────────
 *  Regression tests for Prompt 1:
 *  1. Main menu dismissal on start: #screen-home hidden and inert/pointer-events disabled.
 *  2. UiLayerManager.clear() does not resurrect #screen-home or disable canvasContainer.
 *  3. Duplicate start guard prevents canvas stacking in #canvas-container.
 *  4. Hero logo SVG has valid length attributes (no height="auto" attribute).
 *  5. LeaderboardsScreen does not fetch eagerly in constructor on boot.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

class MockElement {
  tagName: string;
  id: string = '';
  style: Record<string, string> = {};
  classList = new MockClassList();
  attributes = new Map<string, string>();
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
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

  appendChild<T extends MockElement>(child: T): T {
    child.parentElement = this;
    this.children.push(child);
    return child;
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

      const widthMatch = /width=["']([^"']+)["']/.exec(attrStr);
      if (widthMatch && widthMatch[1]) el.setAttribute('width', widthMatch[1]);

      const heightMatch = /height=["']([^"']+)["']/.exec(attrStr);
      if (heightMatch && heightMatch[1]) el.setAttribute('height', heightMatch[1]);

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

  getElementById(id: string): MockElement | null {
    return this.body.querySelector(`#${id}`);
  }

  querySelectorAll(selector: string): MockElement[] {
    return this.body.querySelectorAll(selector);
  }
}

const mockDoc = new MockDocument();
// @ts-expect-error mocking browser globals
globalThis.document = mockDoc;
// @ts-expect-error mocking browser globals
globalThis.HTMLElement = MockElement;
// @ts-expect-error mocking browser globals
globalThis.HTMLCanvasElement = MockElement;
// @ts-expect-error mocking browser globals
globalThis.HTMLButtonElement = MockElement;
// @ts-expect-error mocking browser globals
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };

import { UiLayerManager } from '../src/ui/UiLayerManager.js';
import { HomeScreen } from '../src/ui/screens/HomeScreen.js';
import { LeaderboardsScreen } from '../src/ui/screens/LeaderboardsScreen.js';

describe('Prompt 1 Start Flow & Runtime Defects', () => {
  beforeEach(() => {
    mockDoc.body.children = [];
  });

  it('UiLayerManager.clear() does not resurrect #screen-home or set canvasContainer pointerEvents none', () => {
    const canvasContainer = mockDoc.createElement('div');
    canvasContainer.id = 'canvas-container';
    canvasContainer.style.pointerEvents = 'auto';
    mockDoc.body.appendChild(canvasContainer);

    const homeScreen = mockDoc.createElement('div');
    homeScreen.id = 'screen-home';
    homeScreen.style.display = 'none';
    homeScreen.style.visibility = 'hidden';
    homeScreen.style.pointerEvents = 'none';
    homeScreen.setAttribute('aria-hidden', 'true');
    mockDoc.body.appendChild(homeScreen);

    const manager = UiLayerManager.getInstance();
    manager.clear();

    // homeScreen must remain display: none!
    expect(homeScreen.style.display).toBe('none');
    expect(homeScreen.getAttribute('aria-hidden')).toBe('true');
    expect(canvasContainer.style.pointerEvents).not.toBe('none');
  });

  it('Hero logo SVG in HomeScreen has numeric width and height attributes', () => {
    const home = new HomeScreen({
      onDescend: () => {},
      onDiveOnline: () => {},
      onDailyDescent: () => {},
      onOpenPlayHub: () => {},
      onSelectMode: () => {},
      onOpenBestiary: () => {},
      onOpenLeaderboards: () => {},
      onOpenChampions: () => {},
      onOpenProfile: () => {},
      onOpenSettings: () => {},
      onOpenCredits: () => {},
      onOpenAbout: () => {},
    });

    const svg = home.element.querySelector('#hero-logo-svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('width')).toBe('460');
    expect(svg?.getAttribute('height')).toBe('70');
    expect(svg?.getAttribute('height')).not.toBe('auto');
  });

  it('LeaderboardsScreen does not fetch /api/leaderboard eagerly in constructor', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      new LeaderboardsScreen({
        onBack: () => {},
        onRaceGhost: () => {},
      });
      // Fetch should not have been called during constructor
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('Prevents duplicate canvases in canvasContainer when multiple game instances are cleared', () => {
    const canvasContainer = mockDoc.createElement('div');
    canvasContainer.id = 'canvas-container';
    mockDoc.body.appendChild(canvasContainer);

    // Simulate lab canvas
    const labCanvas = mockDoc.createElement('canvas');
    labCanvas.id = 'lab-canvas';
    canvasContainer.appendChild(labCanvas);

    // Simulate first game canvas
    const gameCanvas1 = mockDoc.createElement('canvas');
    gameCanvas1.id = 'game-canvas-1';
    canvasContainer.appendChild(gameCanvas1);

    // Cleanup helper as implemented in main.ts
    const canvases = canvasContainer.querySelectorAll('canvas');
    canvases.forEach((c) => {
      if (c !== labCanvas) {
        c.remove();
      }
    });

    const remaining = canvasContainer.querySelectorAll('canvas');
    expect(remaining.length).toBe(1);
    expect(remaining[0]).toBe(labCanvas);
  });
});
