/* ── MapsScreen.ts ───────────────────────────────────────────────────────
 *  Maps Archive View:
 *  10 map cards with live mini-canvas previews, difficulty stars,
 *  best times, and Featured vs Archive tabs.
 * ──────────────────────────────────────────────────────────────────────── */

import { Button, MapCard, Tabs } from '../kit/index.js';

export interface MapEntryInfo {
  id: string;
  name: string;
  difficulty: number;
  tags: string[];
  bestTimeMs?: number;
  isFeatured?: boolean;
}

export const MAPS_CATALOG: MapEntryInfo[] = [
  // Featured (Batch 5)
  { id: 'natatorium', name: 'The Natatorium', difficulty: 2, tags: ['OLYMPIC BASIN', 'ECHOES', 'WIDE STEPS'], isFeatured: true, bestTimeMs: 42300 },
  { id: 'drowned_school', name: 'Drowned School', difficulty: 3, tags: ['SUBMERGED DESKS', 'HALLWAYS', 'LOCKERS'], isFeatured: true, bestTimeMs: 51200 },
  { id: 'sunken_jungle', name: 'Sunken Jungle', difficulty: 4, tags: ['ALGAE OVERGROWTH', 'MURKY WATER', 'FOLIAGE'], isFeatured: true, bestTimeMs: 83400 },
  { id: 'neon_flood', name: 'Neon Flood', difficulty: 5, tags: ['ELECTRICAL SHORT', 'NEON REFLECTION', 'FAST CURRENT'], isFeatured: true, bestTimeMs: 91000 },
  { id: 'drowned_metro', name: 'Drowned Metro', difficulty: 5, tags: ['TRAIN CARS', 'SUBMERGED TRACKS', 'DARK TUNNELS'], isFeatured: true, bestTimeMs: 104200 },
  // Archive & Training (Batch 3 & 7)
  { id: 'orientation', name: 'Orientation Facility', difficulty: 1, tags: ['TUTORIAL', 'GUIDED ACOUSTICS', 'CALM SHALLOWS'], isFeatured: false, bestTimeMs: 25000 },
  { id: 'poolrooms', name: 'Poolrooms Core', difficulty: 1, tags: ['CLASSIC TILES', 'SHALLOW TRENCH', 'SAFE LEDGES'], isFeatured: false, bestTimeMs: 34100 },
  { id: 'marble_atrium', name: 'Marble Atrium', difficulty: 2, tags: ['ROMAN ARCHES', 'HIGH VAULT', 'PERCHES'], isFeatured: false, bestTimeMs: 48900 },
  { id: 'utility_tunnels', name: 'Utility Tunnels', difficulty: 3, tags: ['NARROW PIPES', 'STEAM VENTS', 'LOW CEILING'], isFeatured: false, bestTimeMs: 58200 },
  { id: 'hydro_maze', name: 'Hydro Maze', difficulty: 3, tags: ['T-JUNCTIONS', 'DEAD ENDS', 'HIGH REVERB'], isFeatured: false, bestTimeMs: 65400 },
  { id: 'drainage_core', name: 'Drainage Core', difficulty: 4, tags: ['PUMP TURBINES', 'RAPID DRAINS', 'STRONG TIDE'], isFeatured: false, bestTimeMs: 72100 },
];

export interface MapsScreenCallbacks {
  onSelectMap: (mapId: string) => void;
  onBack: () => void;
}

export class MapsScreen {
  readonly element: HTMLElement;
  private currentFilter: 'featured' | 'all' = 'all';
  private gridContainer!: HTMLElement;

  constructor(private callbacks: MapsScreenCallbacks) {
    this.element = document.createElement('div');
    this.element.id = 'screen-maps';
    this.element.className = 'bs-root bs-screen';
    this.element.style.cssText = `
      position: absolute;
      inset: 0;
      overflow-y: auto;
      z-index: 100;
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: clamp(16px, 4vw, 48px) clamp(16px, 3vw, 24px);
      box-sizing: border-box;
    `;

    this.render();
  }

  private render(): void {
    this.element.innerHTML = `
      <div style="width: min(1100px, 95vw); display: flex; flex-direction: column; gap: 24px;">
        <!-- Top bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--bs-border); padding-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h1 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-2xl); color: var(--bs-cream); margin: 0; letter-spacing: 0.08em;">
              FACILITY MAP ARCHIVE // 11 SECTORS
            </h1>
            <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: var(--bs-tan); margin-top: 4px;">
              SURVEYED HYDROGRAPHIC LAYOUTS
            </div>
          </div>
          <div id="btn-back-wrap"></div>
        </div>

        <!-- Filter Tabs -->
        <div id="tabs-wrap"></div>

        <!-- Maps Grid -->
        <div id="maps-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); gap: 20px;"></div>
      </div>
    `;

    const backBtn = new Button({
      text: '← RETURN',
      variant: 'ghost',
      onClick: () => this.callbacks.onBack(),
    });
    this.element.querySelector('#btn-back-wrap')?.appendChild(backBtn.element);

    const featuredCount = MAPS_CATALOG.filter((m) => m.isFeatured).length;
    const allCount = MAPS_CATALOG.length;
    const tabs = new Tabs({
      items: [
        { id: 'all', label: 'FULL ARCHIVE', count: allCount },
        { id: 'featured', label: 'FEATURED SECTORS', count: featuredCount },
      ],
      activeId: 'all',
      onChange: (id) => {
        this.currentFilter = id as 'featured' | 'all';
        this.renderCards();
      },
    });
    this.element.querySelector('#tabs-wrap')?.appendChild(tabs.element);

    this.gridContainer = this.element.querySelector('#maps-grid')!;
    this.renderCards();
  }

  private renderCards(): void {
    this.gridContainer.innerHTML = '';
    const filtered = this.currentFilter === 'featured'
      ? MAPS_CATALOG.filter((m) => m.isFeatured)
      : MAPS_CATALOG;

    filtered.forEach((m) => {
      const card = new MapCard({
        id: m.id,
        name: m.name,
        difficulty: m.difficulty,
        tags: m.tags,
        bestTimeMs: m.bestTimeMs,
        onClick: (id) => this.callbacks.onSelectMap(id),
      });
      this.gridContainer.appendChild(card.element);
    });
  }
}
