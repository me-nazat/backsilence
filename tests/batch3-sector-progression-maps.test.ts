/* ── batch3-sector-progression-maps.test.ts ──────────────────────────────
 *  Batch 3 Prompts 3A & 3B Verification Suite:
 *  - 11-Sector Master Registry & default map rule (Map 01: The Natatorium)
 *  - Alias resolution & normalization (map_01_poolrooms -> natatorium)
 *  - Sequential sector progression & localStorage unlock persistence
 *  - Exit trigger volume (< 2.2m) & reachability clearance checks
 *  - Dynamic map loading speed (< 100ms)
 *  - UI Map Selector button wiring (HomeScreen & PlayHubScreen)
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── In-Test Lightweight DOM Shim for Node Environment ─────────────────────
class MockClassList {
  private classes = new Set<string>();
  add(...names: string[]) {
    for (const name of names) if (name) this.classes.add(name);
  }
  remove(...names: string[]) {
    for (const name of names) this.classes.delete(name);
  }
  contains(name: string): boolean {
    return this.classes.has(name);
  }
}

class MockElement {
  tagName: string;
  id = '';
  style: Record<string, string> = {};
  classList = new MockClassList();
  attributes = new Map<string, string>();
  dataset: Record<string, string> = {};
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  textContent = '';
  private listeners = new Map<string, Array<(e: unknown) => void>>();
  private _innerHTML = '';

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

  click() {
    const list = this.listeners.get('click');
    if (list) {
      for (const fn of list) {
        fn({
          type: 'click',
          target: this,
          currentTarget: this,
          stopPropagation: () => {},
          preventDefault: () => {},
        });
      }
    }
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

  getBoundingClientRect() {
    return { left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40, x: 0, y: 0 };
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
      fillText: () => {},
      measureText: () => ({ width: 0 }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
    };
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
  body = new MockElement('body');
  createElement(tag: string): MockElement {
    return new MockElement(tag);
  }
  querySelector(sel: string): MockElement | null {
    return this.body.querySelector(sel);
  }
}

const doc = new MockDocument();
(globalThis as unknown as { document: MockDocument }).document = doc;
(globalThis as unknown as { window: { document: MockDocument } }).window = { document: doc };

import {
  SECTOR_PROGRESSION,
  DEFAULT_MAP_ID,
  MAP_SEQUENCE,
  normalizeMapId,
  getUnlockedSector,
  unlockSector,
  isSectorUnlocked,
  getSectorByNumber,
  getNextSector,
  getNextMapId,
  isExitTriggered,
  validateMapReachability,
} from '../src/world/SectorProgression.js';
import { getMapDefinition } from '../src/world/MapRegistry.js';
import { MAPS_CATALOG, MapsScreen } from '../src/ui/screens/MapsScreen.js';
import { HomeScreen } from '../src/ui/screens/HomeScreen.js';
import { PlayHubScreen } from '../src/ui/screens/PlayHubScreen.js';

describe('Batch 3 — 11-Sector Master Registry & Default Map Rules', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
  });

  it('1. SECTOR_PROGRESSION defines exactly 11 distinct sequential sectors', () => {
    expect(SECTOR_PROGRESSION).toHaveLength(11);
    const numbers = SECTOR_PROGRESSION.map((s) => s.sectorNumber);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    const ids = SECTOR_PROGRESSION.map((s) => s.id);
    expect(ids).toEqual([
      'natatorium',
      'drowned_metro',
      'neon_flood',
      'drowned_school',
      'marble_atrium',
      'drainage_core',
      'sunken_jungle',
      'hydro_maze',
      'utility_tunnels',
      'poolrooms',
      'orientation',
    ]);
  });

  it('2. Default map is Sector 01: The Natatorium (Liminal Poolrooms)', () => {
    expect(DEFAULT_MAP_ID).toBe('natatorium');
    const sec1 = getSectorByNumber(1);
    expect(sec1).toBeDefined();
    expect(sec1?.id).toBe('natatorium');
    expect(sec1?.aliasId).toBe('map_01_poolrooms');
    expect(sec1?.name).toContain('Natatorium');
  });

  it('3. normalizeMapId resolves aliases and canonical IDs correctly', () => {
    expect(normalizeMapId('map_01_poolrooms')).toBe('natatorium');
    expect(normalizeMapId('map_02_station_row')).toBe('drowned_metro');
    expect(normalizeMapId('map_03_neon_city')).toBe('neon_flood');
    expect(normalizeMapId('map_04_high_school')).toBe('drowned_school');
    expect(normalizeMapId('map_05_university')).toBe('marble_atrium');
    expect(normalizeMapId('map_06_drainage_core')).toBe('drainage_core');
    expect(normalizeMapId('map_07_jungle_ruins')).toBe('sunken_jungle');
    expect(normalizeMapId('map_08_mangrove_swamp')).toBe('hydro_maze');
    expect(normalizeMapId('map_09_mountain_reservoir')).toBe('utility_tunnels');
    expect(normalizeMapId('map_10_mirror_lake')).toBe('poolrooms');
    expect(normalizeMapId('map_11_canyon_rapids')).toBe('orientation');

    // Canonical IDs resolve directly
    expect(normalizeMapId('natatorium')).toBe('natatorium');
    expect(normalizeMapId('neon_flood')).toBe('neon_flood');

    // Unknown or empty fallbacks to DEFAULT_MAP_ID
    expect(normalizeMapId('')).toBe('natatorium');
    expect(normalizeMapId('unknown_sector_xyz')).toBe('natatorium');
    expect(normalizeMapId(null)).toBe('natatorium');
  });

  it('4. Sequential sector progression tracks unlocks and advances 1 -> 2 -> ... -> 11', () => {
    // Default unlocked sector is 1
    expect(getUnlockedSector()).toBe(1);
    expect(isSectorUnlocked(1)).toBe(true);
    expect(isSectorUnlocked(2)).toBe(false);

    // Advancing sequentially
    let currentMap: string = 'natatorium';
    for (let step = 1; step <= 10; step++) {
      const next = getNextMapId(currentMap);
      expect(next).toBeDefined();
      expect(next).toBe(MAP_SEQUENCE[step]);

      const nextSec = getNextSector(currentMap);
      expect(nextSec?.sectorNumber).toBe(step + 1);

      unlockSector(step + 1);
      expect(getUnlockedSector()).toBe(step + 1);
      expect(isSectorUnlocked(step + 1)).toBe(true);

      currentMap = next!;
    }

    // At sector 11, getNextMapId returns null
    expect(currentMap).toBe('orientation');
    expect(getNextMapId(currentMap)).toBeNull();
    expect(getNextSector(11)).toBeNull();
  });

  it('5. isExitTriggered detects corridor threshold (< 2.2m)', () => {
    const exitPos = { x: 0.0, y: 0.38, z: -55.0 };

    // Outside trigger volume
    expect(isExitTriggered({ x: 0.0, y: 0.38, z: -50.0 }, exitPos, 2.2)).toBe(false); // 5.0m
    expect(isExitTriggered({ x: 3.0, y: 0.38, z: -55.0 }, exitPos, 2.2)).toBe(false); // 3.0m

    // Inside trigger volume
    expect(isExitTriggered({ x: 0.0, y: 0.38, z: -53.5 }, exitPos, 2.2)).toBe(true);  // 1.5m
    expect(isExitTriggered({ x: 1.0, y: 0.38, z: -55.5 }, exitPos, 2.2)).toBe(true);  // 1.12m
  });

  it('6. validateMapReachability verifies platform gaps and vertical clearances', () => {
    const validLayout = {
      mapId: 'natatorium' as const,
      seed: 12345,
      bounds: { minX: -50, minZ: -50, maxX: 50, maxZ: 50 },
      platforms: [
        { id: 'p1', rect: [-2, -2, 2, 2] as [number, number, number, number], topY: 0.38, kind: 'tile' as const },
        { id: 'p2', rect: [-2, 4, 2, 8] as [number, number, number, number], topY: 0.38, kind: 'tile' as const }, // gap = 2m
      ],
      walls: [
        { id: 'header_lintel', min: { x: -3, y: 4.2, z: 2 }, max: { x: 3, y: 14.0, z: 4 }, isWall: true }, // clearance = 4.2 - 0.38 = 3.82m
      ],
      pillars: [],
      stairs: [],
      waterBodies: [],
      props: [],
      puzzles: [],
      spawns: { player: [{ x: 0, y: 0.38, z: 0 }], monsters: [] },
      exit: { id: 'exit', position: { x: 0, y: 0.38, z: 7 } },
      meta: {},
    };

    const result = validateMapReachability(validLayout);
    expect(result.traversable).toBe(true);
    expect(result.maxGap).toBeLessThanOrEqual(3.8);
    expect(result.minClearance).toBeGreaterThanOrEqual(3.5);
    expect(result.warnings).toHaveLength(0);
  });

  it('7. All 11 map definitions load dynamically in < 100ms', async () => {
    // Warmup loaders
    for (const sector of SECTOR_PROGRESSION) {
      await getMapDefinition(sector.id);
    }

    for (const sector of SECTOR_PROGRESSION) {
      const t0 = performance.now();
      const def = await getMapDefinition(sector.id);
      const dt = performance.now() - t0;
      expect(def).toBeDefined();
      expect(def.id).toBe(sector.id);
      expect(dt).toBeLessThan(100);
    }
  });

  it('8. MapsScreen displays all 11 sectors with 1-click select actions', () => {
    const onSelectMap = vi.fn();
    const onBack = vi.fn();
    const screen = new MapsScreen({ onSelectMap, onBack });

    expect(MAPS_CATALOG).toHaveLength(11);
    expect(MAPS_CATALOG[0]?.name).toContain('SECTOR 01: The Natatorium');
    expect(MAPS_CATALOG[1]?.name).toContain('SECTOR 02: Drowned Station Row');
    expect(MAPS_CATALOG[2]?.name).toContain('SECTOR 03: Neon Flood City');

    const cards = screen.element.querySelectorAll('.bs-map-card');
    expect(cards.length).toBe(11);

    // Clicking a card invokes onSelectMap with the map ID
    (cards[0] as unknown as MockElement).click();
    expect(onSelectMap).toHaveBeenCalledWith('natatorium');
  });

  it('9. HomeScreen provides prominent SELECT MAP (11 SECTORS) buttons', () => {
    const onOpenMaps = vi.fn();
    const home = new HomeScreen({
      onDescend: vi.fn(),
      onDiveOnline: vi.fn(),
      onDailyDescent: vi.fn(),
      onOpenPlayHub: vi.fn(),
      onOpenMaps,
      onOpenBestiary: vi.fn(),
      onOpenLeaderboards: vi.fn(),
      onOpenChampions: vi.fn(),
      onOpenProfile: vi.fn(),
      onOpenSettings: vi.fn(),
      onOpenCredits: vi.fn(),
      onOpenAbout: vi.fn(),
    });

    const navBtn = home.element.querySelector('#nav-btn-maps') as unknown as MockElement;
    expect(navBtn).not.toBeNull();
    navBtn.click();
    expect(onOpenMaps).toHaveBeenCalledTimes(1);

    const heroBtn = home.element.querySelector('#btn-hero-maps') as unknown as MockElement;
    expect(heroBtn).not.toBeNull();
    heroBtn.click();
    expect(onOpenMaps).toHaveBeenCalledTimes(2);
  });

  it('10. PlayHubScreen contains direct SELECT MAP (11 SECTORS) button', () => {
    const onOpenMaps = vi.fn();
    const playHub = new PlayHubScreen({
      onSelectMode: vi.fn(),
      onOpenMaps,
      onBack: vi.fn(),
    });

    const mapsBtn = playHub.element.querySelector('#btn-open-maps-from-hub') as unknown as MockElement;
    expect(mapsBtn).not.toBeNull();
    mapsBtn.click();
    expect(onOpenMaps).toHaveBeenCalledTimes(1);
  });
});
