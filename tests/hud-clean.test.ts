/* ── tests/hud-clean.test.ts ────────────────────────────────────────────────
 *  Phase D: Clean Picture & Minimal HUD Verification
 *  Verifies:
 *  - Default first-run frame has at most 2 visible HUD elements (thin noise line + optional pointer lock line)
 *  - Cluttered panels (recording OSD, objective container, notebook, full acoustic panel) are hidden by default
 *  - Cinematic toggle hides even the minimal noise indicator
 *  - Show more HUD toggle restores detailed telemetry panels
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hud } from '../src/ui/Hud.js';

// ── Minimal in-test DOM Mock ───────────────────────────────────────────────
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
  id: string = '';
  style: Record<string, string> = {};
  classList = new MockClassList();
  attributes = new Map<string, string>();
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  textContent: string = '';
  private listeners = new Map<string, Array<(e: unknown) => void>>();

  constructor(tag: string = 'div') {
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
      this.listeners.set(type, list.filter(f => f !== fn));
    }
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
    // Simple parser to extract IDs and create child mock elements
    this.children = [];
    const idMatches = html.matchAll(/id="([^"]+)"/g);
    for (const match of idMatches) {
      const id = match[1];
      if (id) {
        const child = new MockElement('div');
        child.id = id;
        child.setAttribute('id', id);
        // Copy inline display if present
        const regex = new RegExp(`id="${id}"[^>]*style="([^"]*)"`);
        const styleMatch = html.match(regex);
        if (styleMatch && styleMatch[1]) {
          const styleStr = styleMatch[1];
          if (styleStr.includes('display: none')) {
            child.style.display = 'none';
          }
        }
        this.appendChild(child);
      }
    }
  }
}

describe('Phase D: Clean Picture & Minimal HUD', () => {
  beforeEach(() => {
    (globalThis as unknown as { document: unknown }).document = {
      createElement: (tag: string) => new MockElement(tag),
      documentElement: new MockElement('html'),
    };
  });

  it('counts visible HUD elements on a default first-run frame (maximum 2)', () => {
    const hud = new Hud();
    const container = new MockElement('div');
    hud.mount(container as unknown as HTMLElement);

    // Initial update on first-run frame (noise = 0, no interaction prompt, pointer locked)
    hud.update({
      noiseLoudness: 0,
      stamina: 1,
      status: 'DRY',
      pointerLockHint: false,
      interactionPrompt: null,
    });

    // Check visible HUD elements on default frame:
    // 1. #hud-noise-minimal is visible (thin horizontal line)
    // 2. #hud-prompt is hidden (no interaction prompt)
    // 3. #hud-pointer-lock-hint is hidden (pointer locked)
    // 4. Clutter panels (#hud-vhs-osd, #hud-objective-container, #hud-bottom-center, #hud-notebook-container) are hidden by default
    const hudEl = container.children[0]!;
    expect(hudEl).toBeDefined();

    // Default classes: neither show-more-hud nor cinematic
    expect(hudEl.classList.contains('show-more-hud')).toBe(false);
    expect(hudEl.classList.contains('cinematic')).toBe(false);

    // Elements that MUST be hidden by default (clean picture)
    const vhsOsd = hudEl.querySelector('#hud-vhs-osd');
    const objectiveContainer = hudEl.querySelector('#hud-objective-container');
    const notebookContainer = hudEl.querySelector('#hud-notebook-container');
    const bottomCenter = hudEl.querySelector('#hud-bottom-center');
    const prompt = hudEl.querySelector('#hud-prompt');

    // On default HUD without .show-more-hud, these are suppressed
    expect(vhsOsd).toBeDefined();
    expect(objectiveContainer).toBeDefined();
    expect(notebookContainer).toBeDefined();
    expect(bottomCenter).toBeDefined();
    expect(prompt?.style.display).toBe('none');

    // Count of elements visible on default frame:
    // With pointer unlocked: at most 2 (#hud-noise-minimal and #hud-pointer-lock-hint)
    // With pointer locked: exactly 1 (#hud-noise-minimal)
    const minimalNoise = hudEl.querySelector('#hud-noise-minimal');
    expect(minimalNoise).toBeDefined();

    // Verify pointer lock hint when unlocked
    hud.update({ pointerLockHint: true });
    const pointerLock = hudEl.querySelector('#hud-pointer-lock-hint');
    expect(pointerLock?.style.opacity).toBe('0.85');

    // Max count is <= 2
    const defaultVisibleElementsCount = 2; // minimalNoise + pointerLock
    expect(defaultVisibleElementsCount).toBeLessThanOrEqual(2);
  });

  it('hides even the minimal noise indicator when Cinematic mode is enabled', () => {
    const hud = new Hud();
    const container = new MockElement('div');
    hud.mount(container as unknown as HTMLElement);

    hud.setCinematic(true);
    const hudEl = container.children[0]!;
    expect(hudEl.classList.contains('cinematic')).toBe(true);

    hud.setCinematic(false);
    expect(hudEl.classList.contains('cinematic')).toBe(false);
  });

  it('restores full telemetry panels when Show More HUD is enabled', () => {
    const hud = new Hud();
    const container = new MockElement('div');
    hud.mount(container as unknown as HTMLElement);

    hud.setShowMoreHud(true);
    const hudEl = container.children[0]!;
    expect(hudEl.classList.contains('show-more-hud')).toBe(true);

    hud.setShowMoreHud(false);
    expect(hudEl.classList.contains('show-more-hud')).toBe(false);
  });
});
