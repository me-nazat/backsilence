/* ── MapsScreen.ts ───────────────────────────────────────────────────────
 *  Maps Archive View:
 *  11 Master Sectors in sequential order with live procedural mini-canvas previews,
 *  difficulty stars, best times, category tabs, and 1-click deployment.
 * ──────────────────────────────────────────────────────────────────────── */

import { Button, MapCard, Tabs } from '../kit/index.js';
import { SECTOR_PROGRESSION, type SectorEntry } from '../../world/SectorProgression.js';

export interface MapEntryInfo {
  id: string;
  aliasId?: string | undefined;
  name: string;
  sectorNumber: number;
  difficulty: number;
  tags: string[];
  bestTimeMs?: number | undefined;
  isFeatured?: boolean | undefined;
  category: 'facility' | 'urban' | 'wilderness';
}

export const MAPS_CATALOG: MapEntryInfo[] = SECTOR_PROGRESSION.map((s: SectorEntry) => ({
  id: s.id,
  aliasId: s.aliasId,
  name: `SECTOR ${String(s.sectorNumber).padStart(2, '0')}: ${s.name}`,
  sectorNumber: s.sectorNumber,
  difficulty: s.difficulty,
  tags: s.tags,
  bestTimeMs: s.bestTimeMs,
  isFeatured: s.sectorNumber <= 6,
  category: s.category,
}));

export interface MapsScreenCallbacks {
  onSelectMap: (mapId: string) => void;
  onBack: () => void;
}

export class MapsScreen {
  readonly element: HTMLElement;
  private currentFilter: 'all' | 'facility' | 'urban' | 'wilderness' = 'all';
  private gridContainer!: HTMLElement;

  constructor(private callbacks: MapsScreenCallbacks) {
    this.element = document.createElement('div');
    this.element.id = 'screen-maps';
    this.element.className = 'bs-root bs-screen subpage-modal';
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
      <div style="width: min(1140px, 95vw); display: flex; flex-direction: column; gap: 24px;">
        <!-- Top bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--bs-border); padding-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h1 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-2xl); color: var(--bs-cream); margin: 0; letter-spacing: 0.08em;">
              OPERATIONAL SECTOR ARCHIVE // 11 MAPS
            </h1>
            <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: var(--bs-tan); margin-top: 4px;">
              ACOUSTIC HYDROGRAPHIC SURVEYS — SELECT SECTOR TO DEPLOY IMMEDIATELY
            </div>
          </div>
          <div id="btn-back-wrap"></div>
        </div>

        <!-- Filter Tabs -->
        <div id="tabs-wrap"></div>

        <!-- Maps Grid -->
        <div id="maps-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); gap: 20px;"></div>
      </div>
    `;

    const backBtn = new Button({
      text: '← RETURN HOME',
      variant: 'ghost',
      onClick: () => this.callbacks.onBack(),
    });
    this.element.querySelector('#btn-back-wrap')?.appendChild(backBtn.element);

    const tabs = new Tabs({
      items: [
        { id: 'all', label: 'ALL 11 SECTORS', count: MAPS_CATALOG.length },
        { id: 'facility', label: 'FACILITY & MUNICIPAL', count: MAPS_CATALOG.filter((m) => m.category === 'facility').length },
        { id: 'urban', label: 'URBAN & METRO', count: MAPS_CATALOG.filter((m) => m.category === 'urban').length },
        { id: 'wilderness', label: 'WILDERNESS & LAKES', count: MAPS_CATALOG.filter((m) => m.category === 'wilderness').length },
      ],
      activeId: 'all',
      onChange: (id) => {
        this.currentFilter = id as 'all' | 'facility' | 'urban' | 'wilderness';
        this.renderCards();
      },
    });
    this.element.querySelector('#tabs-wrap')?.appendChild(tabs.element);

    this.gridContainer = this.element.querySelector('#maps-grid')!;
    this.renderCards();
  }

  private renderCards(): void {
    this.gridContainer.innerHTML = '';
    const filtered = this.currentFilter === 'all'
      ? MAPS_CATALOG
      : MAPS_CATALOG.filter((m) => m.category === this.currentFilter);

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
