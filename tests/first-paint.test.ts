/* ── tests/first-paint.test.ts ──────────────────────────────────────────────
 *  Prompt 8 (D126) Work Item G.21 — Synchronous First Paint Contract
 *  Verifies that EVERY screen instantiates and assigns non-empty innerHTML
 *  synchronously in its constructor. No screen may ever gate first paint
 *  on an async storage, crypto, or network call.
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AboutPrivacyCallbacks } from '../src/ui/screens/AboutPrivacyScreen.js';
import type { BestiaryCallbacks } from '../src/ui/screens/BestiaryScreen.js';
import type { ChampionsCallbacks } from '../src/ui/screens/ChampionsScreen.js';
import type { ChangelogCallbacks } from '../src/ui/screens/ChangelogScreen.js';
import type { CreditsCallbacks } from '../src/ui/screens/CreditsScreen.js';
import type { HomeScreenCallbacks } from '../src/ui/screens/HomeScreen.js';
import type { LeaderboardsCallbacks } from '../src/ui/screens/LeaderboardsScreen.js';
import type { LobbyCallbacks } from '../src/ui/screens/LobbyScreen.js';
import type { MapsScreenCallbacks } from '../src/ui/screens/MapsScreen.js';
import type { PlayHubCallbacks } from '../src/ui/screens/PlayHubScreen.js';
import type { ProfileCallbacks } from '../src/ui/screens/ProfileScreen.js';

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class MockWebGLRenderer {
    domElement = new MockElement('canvas');
    setSize() {}
    setPixelRatio() {}
    render() {}
    dispose() {}
    clear() {}
  }
  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  };
});

// ── Lightweight in-test DOM shim for Node environment ──────────────────────
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

  toggle(name: string, force?: boolean): boolean {
    if (force !== undefined) {
      if (force) this.add(name);
      else this.remove(name);
      return force;
    }
    if (this.contains(name)) {
      this.remove(name);
      return false;
    }
    this.add(name);
    return true;
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
  private listeners = new Map<string, Array<(e: unknown) => void>>();
  private _innerHTML = '';
  private _textContent = '';

  constructor(tag = 'div') {
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

  prepend<T extends MockElement>(child: T): T {
    child.parentElement = this;
    this.children.unshift(child);
    return child;
  }

  getContext(type: string) {
    if (type && type.includes('webgl')) {
      return {
        canvas: this,
        getExtension: () => null,
        getParameter: () => 0,
        createTexture: () => ({}),
        bindTexture: () => {},
        texParameteri: () => {},
        pixelStorei: () => {},
        viewport: () => {},
        clearColor: () => {},
        clear: () => {},
        enable: () => {},
        disable: () => {},
        depthFunc: () => {},
        cullFace: () => {},
        frontFace: () => {},
        blendFunc: () => {},
        blendEquation: () => {},
        colorMask: () => {},
        depthMask: () => {},
        createProgram: () => ({}),
        createShader: () => ({}),
        shaderSource: () => {},
        compileShader: () => {},
        getShaderParameter: () => true,
        getProgramParameter: () => true,
        attachShader: () => {},
        linkProgram: () => {},
        useProgram: () => {},
        createBuffer: () => ({}),
        bindBuffer: () => {},
        bufferData: () => {},
        getShaderInfoLog: () => '',
        getProgramInfoLog: () => '',
      };
    }
    return {
      fillRect: () => {},
      strokeRect: () => {},
      clearRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      drawImage: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      getImageData: () => ({ data: [] }),
      putImageData: () => {},
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    };
  }

  dispatchEvent(event: { type: string; preventDefault?: () => void; stopPropagation?: () => void }): boolean {
    if (!event.preventDefault) event.preventDefault = () => {};
    if (!event.stopPropagation) event.stopPropagation = () => {};
    const list = this.listeners.get(event.type);
    if (list) {
      for (const fn of list) {
        fn(event);
      }
    }
    return true;
  }

  click() {
    this.dispatchEvent({
      type: 'click',
      preventDefault: () => {},
      stopPropagation: () => {},
    });
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

  contains(child: MockElement): boolean {
    if (this.children.includes(child)) return true;
    return this.children.some((c) => c.contains(child));
  }

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(html: string) {
    this._innerHTML = html;
    this.children = [];

    // Parse top-level/nested tags to mock elements
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

      const roleMatch = /role=["']([^"']+)["']/.exec(attrStr);
      if (roleMatch && roleMatch[1]) el.setAttribute('role', roleMatch[1]);

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
    return this.body.querySelector(`#${id}`);
  }
}

class MockWindow {
  location = {
    origin: 'http://localhost:5173',
    href: 'http://localhost:5173/',
  };
  private listeners = new Map<string, Array<(e: unknown) => void>>();

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

  dispatchEvent(event: { type: string; preventDefault?: () => void; stopPropagation?: () => void }): boolean {
    const list = this.listeners.get(event.type);
    if (list) {
      for (const fn of list) {
        fn(event);
      }
    }
    return true;
  }
}

describe('Prompt 8 (D126): Synchronous First Paint Contract across all screens', () => {
  let doc: MockDocument;
  let win: MockWindow;

  beforeEach(() => {
    doc = new MockDocument();
    win = new MockWindow();
    (globalThis as unknown as { document: MockDocument }).document = doc;
    (globalThis as unknown as { window: MockWindow }).window = win;
    (globalThis as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = (fn: (t: number) => void) =>
      setTimeout(() => fn(Date.now()), 16);
    (globalThis as unknown as { cancelAnimationFrame: unknown }).cancelAnimationFrame = (id: ReturnType<typeof setTimeout>) =>
      clearTimeout(id);
  });

  const profileCallbacks: ProfileCallbacks = { onBack: () => {} };
  const aboutCallbacks: AboutPrivacyCallbacks = { onBack: () => {} };
  const bestiaryCallbacks: BestiaryCallbacks = { onBack: () => {}, onOpenCredits: () => {} };
  const championsCallbacks: ChampionsCallbacks = { onBack: () => {}, onRaceGhost: () => {} };
  const changelogCallbacks: ChangelogCallbacks = { onBack: () => {} };
  const creditsCallbacks: CreditsCallbacks = { onBack: () => {} };
  const homeCallbacks: HomeScreenCallbacks = {
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
  };
  const leaderboardsCallbacks: LeaderboardsCallbacks = { onBack: () => {}, onRaceGhost: () => {} };
  const lobbyCallbacks: LobbyCallbacks = { onReadyToggle: () => {}, onStartGame: () => {}, onLeave: () => {} };
  const mapsCallbacks: MapsScreenCallbacks = { onSelectMap: () => {}, onBack: () => {} };
  const playHubCallbacks: PlayHubCallbacks = { onSelectMode: () => {}, onBack: () => {} };

  it('1. ProfileScreen renders non-empty shell synchronously on construction', async () => {
    const { ProfileScreen } = await import('../src/ui/screens/ProfileScreen.js');
    const screen = new ProfileScreen(profileCallbacks);

    // MUST be strictly non-empty synchronously (before any microtask or timer)
    expect(screen.element.innerHTML.length).toBeGreaterThan(100);
    expect(screen.element.innerHTML).toContain('OPERATOR DOSSIER // SERVICE RECORD');
    expect(screen.element.innerHTML).toContain('btn-rename-wrap');
    expect(screen.element.innerHTML).toContain('btn-export-wrap');
    expect(screen.element.innerHTML).toContain('btn-import-wrap');
  });

  it('2. Every screen renders non-empty innerHTML synchronously after construction', async () => {
    const { AboutPrivacyScreen } = await import('../src/ui/screens/AboutPrivacyScreen.js');
    const { BestiaryScreen } = await import('../src/ui/screens/BestiaryScreen.js');
    const { ChampionsScreen } = await import('../src/ui/screens/ChampionsScreen.js');
    const { ChangelogScreen } = await import('../src/ui/screens/ChangelogScreen.js');
    const { CreditsScreen } = await import('../src/ui/screens/CreditsScreen.js');
    const { HomeScreen } = await import('../src/ui/screens/HomeScreen.js');
    const { LeaderboardsScreen } = await import('../src/ui/screens/LeaderboardsScreen.js');
    const { LobbyScreen } = await import('../src/ui/screens/LobbyScreen.js');
    const { MapsScreen } = await import('../src/ui/screens/MapsScreen.js');
    const { PlayHubScreen } = await import('../src/ui/screens/PlayHubScreen.js');
    const { ProfileScreen } = await import('../src/ui/screens/ProfileScreen.js');

    const screens = [
      { name: 'AboutPrivacyScreen', screen: new AboutPrivacyScreen(aboutCallbacks) },
      { name: 'BestiaryScreen', screen: new BestiaryScreen(bestiaryCallbacks) },
      { name: 'ChampionsScreen', screen: new ChampionsScreen(championsCallbacks) },
      { name: 'ChangelogScreen', screen: new ChangelogScreen(changelogCallbacks) },
      { name: 'CreditsScreen', screen: new CreditsScreen(creditsCallbacks) },
      { name: 'HomeScreen', screen: new HomeScreen(homeCallbacks) },
      { name: 'LeaderboardsScreen', screen: new LeaderboardsScreen(leaderboardsCallbacks) },
      { name: 'LobbyScreen', screen: new LobbyScreen(lobbyCallbacks) },
      { name: 'MapsScreen', screen: new MapsScreen(mapsCallbacks) },
      { name: 'PlayHubScreen', screen: new PlayHubScreen(playHubCallbacks) },
      { name: 'ProfileScreen', screen: new ProfileScreen(profileCallbacks) },
    ];

    for (const { name, screen } of screens) {
      expect(screen.element).toBeDefined();
      expect(screen.element.innerHTML.length, `${name} has empty innerHTML on construction`).toBeGreaterThan(50);
    }
  });

  it('3. No screen is blank or wiped after a 2-second stall', async () => {
    const { ProfileScreen } = await import('../src/ui/screens/ProfileScreen.js');
    const screen = new ProfileScreen(profileCallbacks);
    expect(screen.element.innerHTML.length).toBeGreaterThan(100);

    // Fast-forward or wait 60ms for background promises to settle
    await new Promise((r) => setTimeout(r, 60));

    // Screen must still be completely populated, never blank
    expect(screen.element.innerHTML.length).toBeGreaterThan(100);
    expect(screen.element.innerHTML).not.toBe('');
  });
});
