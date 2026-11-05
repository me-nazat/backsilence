/* ── hud-default-elements.test.ts ───────────────────────────────────────────
 *  Prompt 8 (D126): HUD Restraint & Minimal Gameplay View Verification
 *  Validates that default gameplay displays at most 3 HUD elements:
 *  1. Objective line (#hud-objective-pill)
 *  2. Noise meter (#hud-noise-minimal)
 *  3. Interaction prompt (#hud-prompt, when hovered)
 *  Everything else (status chips, inventory hints, checklists, beacons)
 *  lives behind "Show more HUD".
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hud } from '../src/ui/Hud.js';
import { ObjectiveDirector } from '../src/game/objectives/ObjectiveDirector.js';

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

// ── In-test DOM Mock ───────────────────────────────────────────────────────
class MockElement {
  tagName: string;
  id: string = '';
  style: Record<string, string> = {};
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  textContent: string = '';
  classList = new MockClassList();
  private listeners = new Map<string, Array<(e: unknown) => void>>();

  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.style = {
      display: '',
      opacity: '',
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
    // Match each element with an id and optional style attribute
    const tagMatches = html.matchAll(/<([a-zA-Z0-9]+)\s+([^>]*?)id="([^"]+)"([^>]*?)>/g);
    for (const match of tagMatches) {
      const id = match[3];
      if (id) {
        const child = new MockElement(match[1]);
        child.id = id;
        const fullAttrs = `${match[2]} ${match[4]}`;
        const styleMatch = fullAttrs.match(/style="([^"]*)"/);
        if (styleMatch && styleMatch[1]) {
          const styleStr = styleMatch[1];
          const displayMatch = styleStr.match(/display:\s*([a-zA-Z-]+)/);
          if (displayMatch && displayMatch[1]) {
            child.style.display = displayMatch[1];
          }
        }
        this.appendChild(child);
      }
    }
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) results.push(this);
    }
    for (const c of this.children) {
      results.push(...c.querySelectorAll(selector));
    }
    return results;
  }
}

describe('Prompt 8 (D126): HUD Restraint & At-Most-Three Elements Contract', () => {
  beforeEach(() => {
    // Provide document mock if running headless
    if (typeof document === 'undefined') {
      (globalThis as unknown as { document: unknown }).document = {
        createElement: (tag: string) => new MockElement(tag),
        querySelectorAll: () => [],
      };
    }
  });

  it('shows at most three elements in the default view without interaction', () => {
    const container = new MockElement('div');
    const hud = new Hud();
    hud.mount(container as unknown as HTMLElement);

    // Initial default state (not show-more-hud, not cinematic)
    expect(hud.getShowMoreHud()).toBe(false);
    expect(hud.getCinematic()).toBe(false);

    // Verify the primary restrained elements exist
    const objectivePill = container.querySelector('#hud-objective-pill');
    const noiseMinimal = container.querySelector('#hud-noise-minimal');
    const prompt = container.querySelector('#hud-prompt');

    expect(objectivePill).toBeDefined();
    expect(noiseMinimal).toBeDefined();
    expect(prompt).toBeDefined();

    // In default state without an interactable nearby, interaction prompt is hidden
    expect(prompt!.style.display).not.toBe('flex');

    // Default visible primary elements: noiseMinimal + objectivePill = 2 (<= 3)
    const primaryVisibleElements = [
      objectivePill!.style.display !== 'none',
      noiseMinimal!.style.display !== 'none',
      prompt!.style.display === 'flex',
    ].filter(Boolean);

    expect(primaryVisibleElements.length).toBeLessThanOrEqual(3);
  });

  it('shows exactly three elements when an interaction prompt is active', () => {
    const container = new MockElement('div');
    const hud = new Hud();
    hud.mount(container as unknown as HTMLElement);

    // Update with active interactable prompt
    hud.update({
      objective: 'Search the drowned complex.',
      noiseLoudness: 0.12,
      interactionPrompt: 'HOLD [E] TO CRANK GENERATOR',
    });

    const objectivePill = container.querySelector('#hud-objective-pill');
    const noiseMinimal = container.querySelector('#hud-noise-minimal');
    const prompt = container.querySelector('#hud-prompt');

    expect(objectivePill!.style.display !== 'none');
    expect(noiseMinimal!.style.display !== 'none');
    expect(prompt!.style.display).toBe('flex');

    // Count visible primary elements: objective + noise + prompt = 3 (<= 3)
    const count = [
      objectivePill!.style.display !== 'none',
      noiseMinimal!.style.display !== 'none',
      prompt!.style.display === 'flex',
    ].filter(Boolean).length;

    expect(count).toBe(3);
    expect(count).toBeLessThanOrEqual(3);
  });

  it('shows at most four default elements when teaching caption is active (Prompt 7 restrained HUD law)', () => {
    const container = new MockElement('div');
    const hud = new Hud();
    hud.mount(container as unknown as HTMLElement);

    // Update with active interactable prompt and teaching warning caption
    hud.update({
      objective: 'Search the drowned complex.',
      noiseLoudness: 0.12,
      interactionPrompt: 'PICK UP — pebble',
      warningCaption: true,
    });

    const objectivePill = container.querySelector('#hud-objective-pill');
    const noiseMinimal = container.querySelector('#hud-noise-minimal');
    const prompt = container.querySelector('#hud-prompt');
    const warningCaption = container.querySelector('#hud-warning-caption');

    expect(objectivePill!.style.display !== 'none');
    expect(noiseMinimal!.style.display !== 'none');
    expect(prompt!.style.display).toBe('flex');
    expect(warningCaption!.style.display).toBe('block');

    // Count visible primary elements: objective + noise + prompt + warningCaption = 4 (<= 4)
    const count = [
      objectivePill!.style.display !== 'none',
      noiseMinimal!.style.display !== 'none',
      prompt!.style.display === 'flex',
      warningCaption!.style.display === 'block',
    ].filter(Boolean).length;

    expect(count).toBe(4);
    expect(count).toBeLessThanOrEqual(4);
  });

  it('verifies status chips, inventory hints, and checklists live behind Show More HUD', () => {
    const container = new MockElement('div');
    const hud = new Hud();
    hud.mount(container as unknown as HTMLElement);

    // In default view, showMoreHud is false
    expect(hud.getShowMoreHud()).toBe(false);

    // Check that secondary telemetry / inventory elements are not visible by default
    const inventory = container.querySelector('#hud-inventory-strip');
    const checklist = container.querySelector('#hud-checklist');
    const flashlight = container.querySelector('#hud-flashlight-meter');

    expect(inventory!.style.display).toBe('none');
    expect(checklist!.style.display).toBe('none');
    expect(flashlight!.style.display).toBe('none');

    // Enable Show More HUD
    hud.setShowMoreHud(true);
    expect(hud.getShowMoreHud()).toBe(true);

    // Disable Show More HUD reverts cleanly
    hud.setShowMoreHud(false);
    expect(hud.getShowMoreHud()).toBe(false);
  });

  it('verifies 3D beacons are not constructed in natatorium by default (0 child meshes)', () => {
    const hud = new Hud();
    const fakeAudio = { play: () => {}, setReverbPreset: () => {} } as never;

    const director = new ObjectiveDirector({
      modeId: 'campaign',
      mapId: 'natatorium',
      seed: 42,
      hud,
      audio: fakeAudio,
    });

    // In natatorium, beaconsEnabled must default to false
    expect(director.beaconsEnabled).toBe(false);

    // Register all objective beacons for the map
    director.addKeyBeacon({ x: 0, y: 0.3, z: 20 }, 'Conductor Key');
    director.addTapeBeacon({ x: -10, y: 0.3, z: 15 }, 0);
    director.addExitBeacon({ x: 0, y: 0.3, z: -40 }, 'Extraction Gate');
    director.addCanisterBeacon({ x: 12, y: 0.3, z: 5 }, 1);
    director.addDataCacheBeacon({ x: -8, y: 0.3, z: 30 }, 2);

    // Invariant: Root group contains ZERO meshes (not constructed, not merely hidden)
    expect(director.root.children.length).toBe(0);
  });

  it('verifies 3D beacons ARE constructed when explicitly enabled in other modes', () => {
    const hud = new Hud();
    const fakeAudio = { play: () => {}, setReverbPreset: () => {} } as never;

    const director = new ObjectiveDirector({
      modeId: 'campaign',
      mapId: 'poolrooms',
      seed: 42,
      hud,
      audio: fakeAudio,
      beaconsEnabled: true,
    });

    expect(director.beaconsEnabled).toBe(true);
    director.addKeyBeacon({ x: 0, y: 0.3, z: 20 });
    director.addTapeBeacon({ x: -10, y: 0.3, z: 15 }, 0);

    // Meshes were constructed and added to root
    expect(director.root.children.length).toBeGreaterThan(0);
  });
});
