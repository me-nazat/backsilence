/* ── rendering-clarity-minimal-hud.test.ts ──────────────────────────────────
 *  Rendering Clarity & Minimalist Diegetic HUD Test Suite.
 *  Verifies:
 *  1. VHS shader removes horizontal tape tear during normal exploration (uPanic < 0.35)
 *  2. VHS base curvature k1 <= 0.010 and chromatic aberration is ultra-low (0.0004)
 *  3. Clean neutral filmic contrast curve without muddy dark tint or black floor lifts
 *  4. Subtle 3px translucent center reticle (opacity 0.25) expanding on interactable hover
 *  5. Auto-hiding stamina and noise indicators (opacity 0 when full/quiet, opacity 1 when active)
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';
import { VHSShader } from '../src/procedural/shaders/vhs.glsl.js';
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

  get firstElementChild(): MockElement | null {
    return this.children[0] ?? null;
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

describe('Rendering Clarity & Minimal Diegetic HUD Suite', () => {
  beforeEach(() => {
    if (typeof document === 'undefined') {
      (globalThis as unknown as { document: unknown }).document = {
        createElement: (tag: string) => new MockElement(tag),
        querySelectorAll: () => [],
      };
    }
  });

  it('1. Verifies VHS shader eliminates horizontal tear line and reduces barrel distortion during normal exploration', () => {
    const frag = VHSShader.fragmentShader;

    // Fragment shader checks panic level before enabling tracking speed
    expect(frag).toContain('panicLevel >= 0.35');
    expect(frag).toContain('tearMask');

    // Default barrel distortion curvature uniform is reduced to 0.010 for subtle wide-angle feel
    // DESIGN_RATIONALE: Curvature k1 reduced to 0.010 for optical clarity without fisheye distortion
    expect(VHSShader.uniforms.uCurvature.value).toBe(0.010);

    // Fragment shader uses reduced 0.010 base curvature and bounds check
    expect(frag).toContain('float k1 = uCurvature;');

    // Base chromatic aberration is reduced to 0.0004 at screen edges
    expect(frag).toContain('0.0004 + panicAberration');
    expect(frag).toContain('panicLevel > 0.2');
  });

  it('2. Verifies VHS shader uses neutral filmic contrast curve and disables scanlines during normal exploration', () => {
    const frag = VHSShader.fragmentShader;

    // Clean neutral filmic curve replaces crushed dark tint col * 0.94 + vec3(0.018, 0.022, 0.016)
    expect(frag).not.toContain('col * 0.94');
    expect(frag).not.toContain('0.018, 0.022, 0.016');
    expect(frag).not.toContain('vec3(0.102)'); // Old black floor clamping is removed
    expect(frag).toContain('sCurve');

    // Visible CRT scanlines are suppressed unless heavy VHS mode is explicitly enabled (uIntensity > 0.65)
    expect(frag).toContain('uIntensity > 0.65');

    // Ultra-fine film grain intensity is set to 0.008 floor
    expect(frag).toContain('0.008 * uIntensity');
  });

  it('3. Verifies center reticle renders as subtle 3px dot and expands on interactable hover', () => {
    const container = new MockElement('div');
    const hud = new Hud();
    hud.mount(container as unknown as HTMLElement);

    // Initial update without interactables
    hud.update({
      stamina: 1.0,
      noiseLoudness: 0.0,
      interactionPrompt: null,
    });

    const reticle = container.children[0]?.querySelector('#hud-reticle');
    expect(reticle).toBeDefined();

    // In default clean view without interactables, reticle is hidden or 1.0 scale with 0.25 opacity
    // DESIGN_RATIONALE: Default reticle opacity is set to 0.25 to prevent viewport distraction
    expect(reticle?.style.opacity).toBe('0.25');
    expect(reticle?.style.transform).toBe('translate(-50%, -50%) scale(1.0)');

    // When hovering over an interactable item, reticle expands and brightens
    hud.update({
      interactionPrompt: 'PICK UP — keycard',
    });

    // DESIGN_RATIONALE: Reticle scale expands to 2.2 on interactable hover for tactile focus
    expect(reticle?.style.transform).toBe('translate(-50%, -50%) scale(2.2)');
    // DESIGN_RATIONALE: Reticle opacity brightens to 0.85 when hovering over usable items
    expect(reticle?.style.opacity).toBe('0.85');
    expect(reticle?.style.display).toBe('block');
  });

  it('4. Verifies stamina and noise indicators auto-hide completely when player is full/quiet', () => {
    const container = new MockElement('div');
    const hud = new Hud();
    hud.mount(container as unknown as HTMLElement);

    // Update with full stamina and quiet movement
    hud.update({
      stamina: 1.0,
      noiseLoudness: 0.0,
      status: 'DRY',
    });

    const staminaContainer = container.children[0]?.querySelector('#hud-stamina-container');
    const noiseCard = container.children[0]?.querySelector('#hud-noise-card');
    const minimalNoise = container.children[0]?.querySelector('#hud-noise-minimal');

    // Both indicators auto-hide completely (opacity 0)
    // DESIGN_RATIONALE: Stamina container opacity is 0 when fully charged to keep screen clear
    expect(staminaContainer?.style.opacity).toBe('0');
    // DESIGN_RATIONALE: Acoustic noise card opacity is 0 when moving quietly to minimize clutter
    expect(noiseCard?.style.opacity).toBe('0');
    // DESIGN_RATIONALE: Minimal noise indicator opacity is 0 when quiet for zero HUD clutter
    expect(minimalNoise?.style.opacity).toBe('0');

    // When sprinting (stamina drains < 0.99), stamina indicator fades in
    hud.update({
      stamina: 0.82,
      noiseLoudness: 0.0,
    });
    // DESIGN_RATIONALE: Stamina container opacity is 1 during active sprint to give feedback
    expect(staminaContainer?.style.opacity).toBe('1');

    // When splashing or noisy (noise > 0.05), noise indicator fades in
    hud.update({
      stamina: 1.0,
      noiseLoudness: 0.45,
    });
    // DESIGN_RATIONALE: Noise indicator opacity is 1 when splashing to warn of acoustic radius
    expect(noiseCard?.style.opacity).toBe('1');
    // DESIGN_RATIONALE: Minimal noise indicator opacity is 1 when noisy for acoustic awareness
    expect(minimalNoise?.style.opacity).toBe('1');
  });
});
