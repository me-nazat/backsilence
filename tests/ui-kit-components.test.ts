/* ── ui-kit-components.test.ts ─────────────────────────────────────────────
 *  Tests for Phase B: Component Kit, Screens & UiLabPage.
 *  Uses a lightweight in-test DOM shim for Node environment (no external jsdom).
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';

// ── Lightweight in-test DOM shim ───────────────────────────────────────────
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
  id: string = '';
  style: Record<string, string> = {};
  classList = new MockClassList();
  attributes = new Map<string, string>();
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  private listeners = new Map<string, Array<(e: unknown) => void>>();
  private _innerHTML: string = '';
  private _textContent: string = '';

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
      this.listeners.set(type, list.filter(f => f !== fn));
    }
  }

  prepend<T extends MockElement>(child: T): T {
    child.parentElement = this;
    this.children.unshift(child);
    return child;
  }

  getContext(_type: string) {
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
    return this.children.some(c => c.contains(child));
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

      // Extract id
      const idMatch = /id=["']([^"']+)["']/.exec(attrStr);
      if (idMatch && idMatch[1]) el.setAttribute('id', idMatch[1]);

      // Extract class
      const classMatch = /class=["']([^"']+)["']/.exec(attrStr);
      if (classMatch && classMatch[1]) el.className = classMatch[1];

      // Extract role
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

  getElementById(id: string): MockElement | null {
    return this.body.querySelector(`#${id}`);
  }
}

class MockWindow {
  private listeners = new Map<string, Array<(e: unknown) => void>>();

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
}

// Install mock DOM onto globalThis if in Node
const mockDoc = new MockDocument();
const mockWin = new MockWindow();

// @ts-expect-error mocking minimal browser globals for test
globalThis.document = mockDoc;
// @ts-expect-error mocking minimal browser globals for test
globalThis.window = mockWin;
// @ts-expect-error mocking minimal browser globals for test
globalThis.HTMLElement = MockElement;
// @ts-expect-error mocking minimal browser globals for test
globalThis.HTMLButtonElement = MockElement;
// @ts-expect-error mocking minimal browser globals for test
globalThis.HTMLCanvasElement = MockElement;
// @ts-expect-error mocking minimal browser globals for test
globalThis.KeyboardEvent = class KeyboardEvent {
  key: string;
  type: string;
  preventDefault = () => {};
  stopPropagation = () => {};
  constructor(type: string, init?: { key?: string }) {
    this.type = type;
    this.key = init?.key ?? '';
  }
};

// ── Component Imports ──────────────────────────────────────────────────────
import {
  Button,
  EmptyState,
  ErrorState,
  Banner,
  Stepper,
  Accordion,
  UiLabPage,
} from '../src/ui/kit/index.js';
import { UiLayerManager } from '../src/ui/UiLayerManager.js';

describe('Prompt 4 Phase B: Complete Component Kit & Lab Page', () => {
  beforeEach(() => {
    mockDoc.body = new MockElement('body');
    const canvasCont = new MockElement('div');
    canvasCont.id = 'canvas-container';
    const appEl = new MockElement('div');
    appEl.id = 'app';
    mockDoc.body.appendChild(canvasCont);
    mockDoc.body.appendChild(appEl);
  });

  it('instantiates Button variants and hold-to-confirm behavior', () => {
    let clicked = false;
    const btn = new Button({
      text: 'CONFIRM',
      variant: 'primary',
      onClick: () => { clicked = true; },
    });
    expect(btn.element.classList.contains('bs-btn-primary')).toBe(true);
    btn.element.click();
    expect(clicked).toBe(true);

    const holdBtn = new Button({
      text: 'ABANDON',
      variant: 'danger',
      holdSeconds: 1.5,
    });
    expect(holdBtn.element.classList.contains('bs-btn-danger')).toBe(true);
    expect(holdBtn.element.querySelector('.bs-btn-hold-fill')).not.toBeNull();
  });

  it('instantiates EmptyState and ErrorState components', () => {
    let queried = false;
    const empty = new EmptyState({
      title: 'EMPTY ARCHIVE',
      description: 'No tapes found.',
      icon: 'tape',
      actionText: 'QUERY',
      onAction: () => { queried = true; },
    });
    expect(empty.element.getAttribute('role')).toBe('status');
    expect(empty.element.innerHTML).toContain('EMPTY ARCHIVE');
    empty.element.querySelector('button')?.click();
    expect(queried).toBe(true);

    let retried = false;
    const err = new ErrorState({
      title: 'TRACKING DISRUPTED',
      code: 'VCO_ERR',
      message: 'Video signal lost.',
      retryText: 'RETRY',
      onRetry: () => { retried = true; },
    });
    expect(err.element.getAttribute('role')).toBe('alert');
    expect(err.element.innerHTML).toContain('VCO_ERR');
    err.element.querySelector('button')?.click();
    expect(retried).toBe(true);
  });

  it('instantiates Banner with dismiss action', () => {
    let dismissed = false;
    const banner = new Banner({
      message: 'Acoustic warning',
      variant: 'warning',
      dismissible: true,
      onDismiss: () => { dismissed = true; },
    });
    mockDoc.body.appendChild(banner.element as unknown as MockElement);
    banner.element.querySelector('button')?.click();
    expect(dismissed).toBe(true);
    expect(mockDoc.body.contains(banner.element as unknown as MockElement)).toBe(false);
  });

  it('instantiates Stepper and tracks sequential steps', () => {
    let activeStep = 0;
    const stepper = new Stepper({
      steps: [
        { id: '1', label: 'Step 1' },
        { id: '2', label: 'Step 2' },
        { id: '3', label: 'Step 3' },
      ],
      activeStep: 0,
      onStepChange: (idx) => { activeStep = idx; },
    });

    expect(stepper.getStep()).toBe(0);
    stepper.setStep(2);
    expect(stepper.getStep()).toBe(2);
    expect(activeStep).toBe(2);
  });

  it('instantiates Accordion and toggles expansion with ARIA', () => {
    let toggledId = '';
    let isOpenState = false;
    const accordion = new Accordion({
      items: [
        { id: 'item1', title: 'Header 1', content: 'Content 1', open: false },
        { id: 'item2', title: 'Header 2', content: 'Content 2', open: false },
      ],
      onToggle: (id, open) => {
        toggledId = id;
        isOpenState = open;
      },
    });

    const header = accordion.element.querySelector('#bs-acc-header-item1') as unknown as MockElement;
    expect(header).not.toBeNull();
    expect(header.getAttribute('aria-expanded')).toBe('false');

    header.click();
    expect(toggledId).toBe('item1');
    expect(isOpenState).toBe(true);
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });

  it('mounts UiLabPage completely with all 7 living sections', () => {
    const lab = new UiLabPage();
    expect(lab.element.classList.contains('bs-screen')).toBe(true);
    expect(lab.element.querySelector('#sec-buttons')).not.toBeNull();
    expect(lab.element.querySelector('#sec-cards')).not.toBeNull();
    expect(lab.element.querySelector('#sec-inputs')).not.toBeNull();
    expect(lab.element.querySelector('#sec-indicators')).not.toBeNull();
    expect(lab.element.querySelector('#sec-social')).not.toBeNull();
    expect(lab.element.querySelector('#sec-overlays')).not.toBeNull();
    expect(lab.element.querySelector('#sec-structural')).not.toBeNull();
  });

  it('UiLayerManager sets inert on lower layers and handles Escape pop', () => {
    const mgr = UiLayerManager.getInstance();

    const baseScreen = mockDoc.createElement('div');
    baseScreen.id = 'base-screen';
    mockDoc.body.appendChild(baseScreen);
    mgr.pushLayer(baseScreen as unknown as HTMLElement, false);

    const modalEl = mockDoc.createElement('div');
    modalEl.id = 'modal-layer';
    mockDoc.body.appendChild(modalEl);
    mgr.pushLayer(modalEl as unknown as HTMLElement, true);

    // Underlying base layer and canvas container should be inert
    expect(baseScreen.hasAttribute('inert')).toBe(true);
    expect(mockDoc.getElementById('canvas-container')?.hasAttribute('inert')).toBe(true);

    // Escape pops top modal
    mockWin.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    // Underlying base layer should no longer be inert
    expect(baseScreen.hasAttribute('inert')).toBe(false);
  });

  it('ProfileScreen renders official Email/Password CTA buttons and preserves legacy DOM hooks', async () => {
    const { ProfileScreen } = await import('../src/ui/screens/ProfileScreen.js');
    const { IdentityManager } = await import('../src/meta/Identity.js');
    await IdentityManager.clearIdentity();

    const screen = new ProfileScreen({ onBack: () => {} });
    // Wait for async render() to complete
    await new Promise((r) => setTimeout(r, 30));

    expect(screen.element.innerHTML).toContain('btn-rename-wrap');
    expect(screen.element.innerHTML).toContain('btn-export-wrap');
    expect(screen.element.innerHTML).toContain('btn-import-wrap');
    expect(screen.element.innerHTML).toContain('btn-create-account');
    expect(screen.element.innerHTML).toContain('btn-sign-in');
    expect(screen.element.innerHTML).toContain('UNREGISTERED FIELD OPERATOR (LOCAL ONLY)');
  });
});
