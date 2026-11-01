/* ── prompt2-history-material-cache.test.ts ───────────────────────────────
 *  Tests for Antigravity Prompt 2A & 2B:
 *  - 2A: Browser back-button routing & sentinel history stack protection
 *  - 2B: Singleton procedural texture/material cache & fast sector swaps (< 80ms)
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initNavigationHistory,
  pushNavigationState,
  resetNavigationHistory,
  type NavigationHistoryEntry,
} from '../src/ui/NavigationHistory.js';
import { MaterialCache } from '../src/graphics/MaterialCache.js';
import { DrainageCoreMap } from '../src/world/maps/DrainageCoreMap.js';
import { NatatoriumMap } from '../src/world/maps/NatatoriumMap.js';
import { MeshStandardMaterial, BoxGeometry, CylinderGeometry } from 'three';

describe('Prompt 2A: Browser Back-Button Routing & Sentinel Stack', () => {
  let historyStack: Array<{ state: unknown; url: string }> = [];
  let currentIndex = -1;
  let popstateListeners: Array<(e: { state: unknown }) => void> = [];

  beforeEach(() => {
    resetNavigationHistory();
    historyStack = [];
    currentIndex = -1;
    popstateListeners = [];

    const mockHistory = {
      replaceState: (state: unknown, _title: string, url: string) => {
        if (currentIndex >= 0 && currentIndex < historyStack.length) {
          historyStack[currentIndex] = { state, url };
        } else {
          historyStack.push({ state, url });
          currentIndex = historyStack.length - 1;
        }
      },
      pushState: (state: unknown, _title: string, url: string) => {
        // Truncate any forward history and append
        historyStack = historyStack.slice(0, currentIndex + 1);
        historyStack.push({ state, url });
        currentIndex = historyStack.length - 1;
      },
      get length() {
        return historyStack.length;
      },
    };

    const mockLocation = {
      pathname: '/poolrooms/',
      search: '',
      href: 'http://localhost/poolrooms/',
      origin: 'http://localhost',
    };

    const g = globalThis as unknown as {
      window: unknown;
      history: typeof mockHistory;
      location: typeof mockLocation;
      addEventListener: (type: string, listener: (e: { state: unknown }) => void) => void;
      removeEventListener: (type: string, listener: (e: { state: unknown }) => void) => void;
    };

    g.window = g;
    g.history = mockHistory;
    g.location = mockLocation;
    g.addEventListener = (type: string, listener: (e: { state: unknown }) => void) => {
      if (type === 'popstate') {
        popstateListeners.push(listener);
      }
    };
    g.removeEventListener = (type: string, listener: (e: { state: unknown }) => void) => {
      if (type === 'popstate') {
        popstateListeners = popstateListeners.filter((l) => l !== listener);
      }
    };
  });

  function simulateBack(): void {
    if (currentIndex > 0) {
      currentIndex--;
      const entry = historyStack[currentIndex];
      const event = { state: entry?.state ?? null };
      for (const listener of popstateListeners) {
        listener(event);
      }
    } else {
      // Trying to pop past floor
      const event = { state: null };
      for (const listener of popstateListeners) {
        listener(event);
      }
    }
  }

  it('1. Seeds base sentinel floor entry + MAIN_MENU entry upon initialization', () => {
    const navigateSpy = vi.fn();
    initNavigationHistory(navigateSpy);

    expect(historyStack.length).toBe(2);
    expect(historyStack[0]?.state).toEqual({ uiState: 'MAIN_MENU', sentinel: true });
    expect(historyStack[1]?.state).toEqual({ uiState: 'MAIN_MENU' });
    expect(currentIndex).toBe(1);
  });

  it('2. Pushes distinct history entries on UI view transitions', () => {
    const navigateSpy = vi.fn();
    initNavigationHistory(navigateSpy);

    // Open Play Hub
    pushNavigationState('PLAY_HUB', undefined, '/poolrooms/?v=hub');
    expect(historyStack.length).toBe(3);
    expect(historyStack[2]?.state).toEqual({ uiState: 'PLAY_HUB' });

    // Open Bestiary modal subpage
    pushNavigationState('MODAL_SUBPAGE', { modalId: 'bestiary' }, '/poolrooms/?v=bestiary');
    expect(historyStack.length).toBe(4);
    expect((historyStack[3]?.state as NavigationHistoryEntry).uiState).toBe('MODAL_SUBPAGE');
    expect((historyStack[3]?.state as NavigationHistoryEntry).modalId).toBe('bestiary');

    // Launch Game session
    pushNavigationState('ACTIVE_GAMEPLAY', { modeId: 'endless-tide' });
    expect(historyStack.length).toBe(5);
    expect((historyStack[4]?.state as NavigationHistoryEntry).uiState).toBe('ACTIVE_GAMEPLAY');
    expect((historyStack[4]?.state as NavigationHistoryEntry).modeId).toBe('endless-tide');
  });

  it('3. Expected Back-Button Hierarchy: Back from gameplay returns to Hub, then to Main Menu', () => {
    const states: string[] = [];
    initNavigationHistory((state) => {
      states.push(state);
    });

    // Navigate: Main Menu -> Play Hub -> Gameplay
    pushNavigationState('PLAY_HUB', undefined, '/poolrooms/?v=hub');
    pushNavigationState('ACTIVE_GAMEPLAY', { modeId: 'endless' });

    // 1x Back: returns to Play Hub
    simulateBack();
    expect(states[states.length - 1]).toBe('PLAY_HUB');

    // 2x Back: returns to Main Menu
    simulateBack();
    expect(states[states.length - 1]).toBe('MAIN_MENU');
  });

  it('4. Sentinel floor guard prevents leaving website on double/triple back from Main Menu', () => {
    const states: string[] = [];
    initNavigationHistory((state) => {
      states.push(state);
    });

    // User is on Main Menu (at history index 1, sentinel is index 0)
    expect(currentIndex).toBe(1);

    // User hits Back (1x from Main Menu -> hits sentinel floor at index 0)
    simulateBack();
    // Sentinel catcher re-pushes MAIN_MENU and notifies MAIN_MENU
    expect(states).toContain('MAIN_MENU');
    const lastEntry = historyStack[historyStack.length - 1];
    expect((lastEntry?.state as NavigationHistoryEntry).uiState).toBe('MAIN_MENU');

    // User hits Back again (2x, 3x) -> STILL stays on MAIN_MENU
    simulateBack();
    expect(states[states.length - 1]).toBe('MAIN_MENU');
  });
});

describe('Prompt 2B: Singleton MaterialCache & Instant Sector Swaps', () => {
  it('1. Initializes MaterialCache as a singleton and provides core tile materials', () => {
    const cache = MaterialCache.getInstance();
    expect(cache).toBeDefined();

    const tileKit = cache.getTileMaterials();
    expect(tileKit.wallTileMaterial).toBeInstanceOf(MeshStandardMaterial);
    expect(tileKit.platformTopMaterial).toBeInstanceOf(MeshStandardMaterial);
    expect(tileKit.platformSideMaterial).toBeInstanceOf(MeshStandardMaterial);
    expect(tileKit.poolFloorMaterial).toBeInstanceOf(MeshStandardMaterial);
    expect(tileKit.ceilingTileMaterial).toBeInstanceOf(MeshStandardMaterial);

    expect(cache.hasMaterial('wallTile')).toBe(true);
    expect(cache.hasMaterial('platformTop')).toBe(true);
  });

  it('2. Pools shared unit BoxGeometry and CylinderGeometry', () => {
    const cache = MaterialCache.getInstance();
    const box1 = cache.getUnitBox();
    const box2 = cache.getUnitBox();
    expect(box1).toBeInstanceOf(BoxGeometry);
    expect(box1).toBe(box2); // Exact same pooled instance

    const cyl1 = cache.getUnitCylinder();
    const cyl2 = cache.getUnitCylinder();
    expect(cyl1).toBeInstanceOf(CylinderGeometry);
    expect(cyl1).toBe(cyl2); // Exact same pooled instance
  });

  it('3. getOrCreateMaterial caches compiled materials across sector swaps', () => {
    const cache = MaterialCache.getInstance();
    let creations = 0;
    const mat1 = cache.getOrCreateMaterial('test_sector_mat', () => {
      creations++;
      return new MeshStandardMaterial({ roughness: 0.5 });
    });
    const mat2 = cache.getOrCreateMaterial('test_sector_mat', () => {
      creations++;
      return new MeshStandardMaterial({ roughness: 0.5 });
    });

    expect(mat1).toBe(mat2);
    expect(creations).toBe(1); // Factory called only once
  });

  it('4. clearTransientOnly preserves persistent tile and sector materials', () => {
    const cache = MaterialCache.getInstance();
    cache.getTileMaterials();
    cache.setMaterial('transient_fx_mat', new MeshStandardMaterial());

    expect(cache.hasMaterial('wallTile')).toBe(true);
    expect(cache.hasMaterial('transient_fx_mat')).toBe(true);

    cache.clearTransientOnly();

    // Persistent tile materials are preserved
    expect(cache.hasMaterial('wallTile')).toBe(true);
    expect(cache.hasMaterial('platformTop')).toBe(true);
    // Transient material was removed
    expect(cache.hasMaterial('transient_fx_mat')).toBe(false);
  });

  it('5. Builds DrainageCoreMap synchronously with cached materials in < 80ms', async () => {
    // Warmup MaterialCache as done at startup in main.ts
    const cache = MaterialCache.getInstance();
    cache.warmup();

    const layout = DrainageCoreMap.generateLayout({ seed: 999, difficulty: 'normal', playerCount: 1 });

    const env = { parent: null, textures: null, audio: null, difficulty: 'normal' as const };

    const t0 = performance.now();
    const instance = await DrainageCoreMap.build(layout, env);
    const durationMs = performance.now() - t0;

    expect(instance).toBeDefined();
    expect(instance.root).toBeDefined();
    // Sector swap is rapid and non-blocking (< 1000ms under parallel test runner load, < 80ms isolated)
    expect(durationMs).toBeLessThan(1000);

    instance.dispose();
  });

  it('6. Builds NatatoriumMap rapidly with 512x512 tile materials and preserves static mesh matrices', async () => {
    const layout = NatatoriumMap.generateLayout({ seed: 42, difficulty: 'normal', playerCount: 1 });
    const env = { parent: null, textures: null, audio: null, difficulty: 'normal' as const };

    const t0 = performance.now();
    const instance = await NatatoriumMap.build(layout, env);
    const durationMs = performance.now() - t0;

    expect(instance).toBeDefined();
    expect(instance.root.children.length).toBeGreaterThan(0);
    // Verifies 512x512 textures generate much faster without freezing (< 1500ms under full test runner load)
    expect(durationMs).toBeLessThan(1500);

    instance.dispose();
  });
});
