/* ── Hud.ts ───────────────────────────────────────────────────────────────
 *  In-game HUD overlay: reactive Noise Meter, stamina bar, status chips,
 *  notebook sequence strip, inventory strip, battery meter, level-shift timer,
 *  VHS OSD, interaction prompt, and directional sound captions.
 * ──────────────────────────────────────────────────────────────────────── */

import type { PostFXOsdState } from '../engine/PostFX.js';
import { I18nEngine } from '../i18n/I18n.js';

export interface InventorySlot {
  kind: 'pebble' | 'noisemaker' | 'fuse_core';
  count: number;
}

export interface RosterMember {
  id: string;
  name: string;
  status: 'alive' | 'escaped' | 'dead' | 'lagging';
  pingMs?: number | undefined;
  noiseSpike?: boolean | undefined;
  isLocal?: boolean | undefined;
  colorIndex?: number | undefined;
}

export interface SpectatorHudData {
  active: boolean;
  targetName: string;
  mode: 'follow' | 'freeroam';
  canCycle: boolean;
}

export interface ObjectiveChecklistItem {
  text: string;
  done: boolean;
  distanceM?: number | null;
}

export interface HudData {
  noiseLoudness: number; // 0..1
  stamina: number;       // 0..1
  status: 'DRY' | 'WET' | 'CROUCHED' | 'EXHAUSTED';
  objective: string;
  sectorTitle?: string;
  checklist?: ObjectiveChecklistItem[];
  interactionPrompt?: string | null;
  notebookNumbers: string[]; // e.g. ['#1: 4', '#2: 2', '#3: ?']
  soundVisualizerCaption?: string | null;
  damageVignette: number; // 0..1
  vhsTime?: string;
  showVhsOsd?: boolean;
  vhsOsdState?: PostFXOsdState;
  multiplayerRoster?: Array<{ name: string; alive: boolean }>;
  roster?: RosterMember[] | undefined;
  spectator?: SpectatorHudData | undefined;

  // Batch 3 Interactive HUD Additions
  inventory?: InventorySlot[];
  selectedItemIndex?: number;
  flashlight?: {
    active: boolean;
    battery: number; // 0..1
  };
  levelShift?: {
    timeRemaining: number;
    phase: 'LOW' | 'RISE' | 'HIGH' | 'FALL' | 'low' | 'rise' | 'high' | 'fall';
    warning: boolean;
  } | null;
  sinkingWarning?: boolean;
  steamWarning?: boolean;
  generatorStatus?: Array<{ id: string; running: boolean; remaining: number }>;
  blastDoorsRemaining?: number | null;

  // Batch 5 Map Overlays
  tideLevel?: number | null;
  isPerched?: boolean | null;
  wobblyChairWarning?: { tipping: boolean; timeRemaining: number } | null;
  paStatus?: { charges: number; maxCharges: number; cooldownRemaining: number } | null;

  sluiceGatesRemaining?: number | null;
  riverFlow?: { angleRad: number; speed: number } | null;
  faunaHushState?: 'safe' | 'alert' | 'hushed' | null;

  uplinksRemaining?: number | null;
  stormWindow?: { active: boolean; timeRemaining: number; nextStormIn: number } | null;
  sightings?: number;
  lastSightingTime?: number;
  visFrac?: number;
  droneLockWarning?: { locked: boolean; angleDeg: number } | null;
  empCount?: number | null;

  ghostTrainSchedule?: { timeToTrain: number; trainDurationRemaining: number; active: boolean; warning: boolean } | null;
  boardingCountdown?: number | null;
  bottleCount?: number | null;
  pointerLockHint?: boolean | undefined;

  // Phase E Clarity of the Screen
  riskTag?: 'QUIET' | 'AUDIBLE' | 'LOUD' | 'CLOSE' | 'HUNTED' | 'TIMED' | 'ESCAPE' | null;
  promptHoldProgress?: number | null; // 0..1
  waterNoiseRadius?: number | null;
  minimalHud?: boolean;
  uiScale?: number;
  objectiveIndicator?: {
    visible: boolean;
    angleRad: number;
    distanceMeters: number;
    label: string;
  } | null;

  // Batch 4 Prompt 4B Additions
  runTimeMs?: number;
  pebbleCount?: number;
  pebbleEquipped?: boolean;
  checkpointSaved?: boolean;

  // Prompt 7 Additions: Warning Caption, Work Order Card, and Chlorine Cell Chip
  warningCaption?: boolean | string | null;
  workOrderState?: 'normal' | 'glitch' | 'hidden' | null;
  chlorineCells?: number;
  showCellChip?: boolean;
}

export function formatRunTimer(ms: number): string {
  const totalSeconds = Math.max(0, ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds * 10) % 10);
  const mStr = String(minutes).padStart(2, '0');
  const sStr = String(seconds).padStart(2, '0');
  return `${mStr}:${sStr}.${tenths}`;
}

export class Hud {
  private el: HTMLElement | null = null;
  private noiseBarEl: HTMLElement | null = null;
  private noiseIconEl: HTMLElement | null = null;
  private noiseRadiusLabelEl: HTMLElement | null = null;
  private minimalNoiseRadiusEl: HTMLElement | null = null;
  private compassArcEl: HTMLElement | null = null;
  private compassNotchEl: SVGElement | null = null;
  private compassTextEl: HTMLElement | null = null;
  private waterRadiusRingEl: SVGElement | null = null;
  private staminaBarEl: HTMLElement | null = null;
  private statusChipEl: HTMLElement | null = null;
  private objectiveEl: HTMLElement | null = null;
  private sectorTitleEl: HTMLElement | null = null;
  private checklistEl: HTMLElement | null = null;
  private riskTagEl: HTMLElement | null = null;
  private promptEl: HTMLElement | null = null;
  private promptRingSvgEl: SVGElement | null = null;
  private promptRingFillEl: SVGElement | null = null;
  private promptTextEl: HTMLElement | null = null;
  private notebookEl: HTMLElement | null = null;
  private captionEl: HTMLElement | null = null;
  private vignetteEl: HTMLElement | null = null;
  private vhsOsdEl: HTMLElement | null = null;
  private pointerLockHintEl: HTMLElement | null = null;
  private minimalNoiseFillEl: HTMLElement | null = null;
  private quietHintEl: HTMLElement | null = null;
  private quietHintTimeout: ReturnType<typeof setTimeout> | null = null;
  private objectivePillEl: HTMLElement | null = null;
  private objectivePillTextEl: HTMLElement | null = null;
  private bottomStackEl: HTMLElement | null = null;
  private throwableHintEl: HTMLElement | null = null;
  private showMoreHud = false;
  private cinematic = false;
  private streamerMode = false;
  private nearMissEl: HTMLElement | null = null;
  private screenReaderLiveEl: HTMLElement | null = null;
  private debugSightingEl: HTMLElement | null = null;
  private nearMissTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastAnnouncedStatus = '';
  private lastAnnouncedObjective = '';

  // Batch 3 Elements
  private inventoryEl: HTMLElement | null = null;
  private flashlightEl: HTMLElement | null = null;
  private batteryBarEl: HTMLElement | null = null;
  private batteryPctEl: HTMLElement | null = null;
  private levelShiftEl: HTMLElement | null = null;
  private levelBorderEl: HTMLElement | null = null;
  private hazardAlertEl: HTMLElement | null = null;
  private generatorStatusEl: HTMLElement | null = null;

  // Batch 4 Elements
  private rosterEl: HTMLElement | null = null;
  private spectatorContainerEl: HTMLElement | null = null;
  private spectatorNameEl: HTMLElement | null = null;

  // Batch 5 Elements
  private perchChipEl: HTMLElement | null = null;
  private schoolStatusEl: HTMLElement | null = null;
  private jungleStatusEl: HTMLElement | null = null;
  private neonStatusEl: HTMLElement | null = null;
  private metroStatusEl: HTMLElement | null = null;

  // Batch 4 Prompt 4B Elements
  private runTimerEl: HTMLElement | null = null;
  private reticleEl: HTMLElement | null = null;
  private minimalNoiseEl: HTMLElement | null = null;
  private checkpointSavedEl: HTMLElement | null = null;
  private throwableHotbarEl: HTMLElement | null = null;
  private pebbleCountEl: HTMLElement | null = null;
  private slot1El: HTMLElement | null = null;
  private hotbarSlot1El: HTMLElement | null = null;
  private checkpointTimeout: ReturnType<typeof setTimeout> | null = null;
  private objectivePillFadeTimer: ReturnType<typeof setTimeout> | null = null;
  private sectorToastEl: HTMLElement | null = null;
  private sectorToastTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastSectorTitle = '';

  // Prompt 7 Elements
  private warningCaptionEl: HTMLElement | null = null;
  private workOrderCardEl: HTMLElement | null = null;
  private workOrderAuthorityEl: HTMLElement | null = null;
  private workOrderTitleEl: HTMLElement | null = null;
  private workOrderTasksEl: HTMLElement | null = null;
  private workOrderSkipEl: HTMLElement | null = null;
  private threeRulesEl: HTMLElement | null = null;
  private rule1El: HTMLElement | null = null;
  private rule2El: HTMLElement | null = null;
  private rule3El: HTMLElement | null = null;
  private threeRulesTimeout: ReturnType<typeof setTimeout> | null = null;
  private promptVerbEl: HTMLElement | null = null;
  private promptQualifierEl: HTMLElement | null = null;
  private cellChipEl: HTMLElement | null = null;
  private cellCounterEl: HTMLElement | null = null;

  showWarningCaption(visible: boolean, text?: string): void {
    if (!this.warningCaptionEl) return;
    if (visible) {
      if (text) {
        this.warningCaptionEl.textContent = text;
      }
      this.warningCaptionEl.style.display = 'block';
      this.warningCaptionEl.style.opacity = '1';
    } else {
      this.warningCaptionEl.style.opacity = '0';
      this.warningCaptionEl.style.display = 'none';
    }
  }

  setWorkOrderCard(state: 'normal' | 'glitch' | 'hidden'): void {
    if (!this.workOrderCardEl) return;
    const i18n = I18nEngine.getInstance();
    if (state === 'normal') {
      if (this.workOrderAuthorityEl) this.workOrderAuthorityEl.textContent = i18n.t('coldOpen.workOrder.authority');
      if (this.workOrderTitleEl) {
        this.workOrderTitleEl.textContent = i18n.t('coldOpen.workOrder.title');
        this.workOrderTitleEl.style.color = '#1a1a18';
      }
      if (this.workOrderTasksEl) {
        this.workOrderTasksEl.textContent = i18n.t('coldOpen.workOrder.tasks');
        this.workOrderTasksEl.style.color = '#2b2721';
      }
      if (this.workOrderSkipEl) this.workOrderSkipEl.textContent = i18n.t('coldOpen.skipPrompt');
      this.workOrderCardEl.style.background = '#f4f0e6';
      this.workOrderCardEl.style.filter = 'none';
      this.workOrderCardEl.style.display = 'block';
      this.workOrderCardEl.style.opacity = '1';
    } else if (state === 'glitch') {
      if (this.workOrderTitleEl) {
        this.workOrderTitleEl.textContent = i18n.t('coldOpen.workOrder.glitchTitle');
        this.workOrderTitleEl.style.color = '#d32f2f';
      }
      if (this.workOrderTasksEl) {
        this.workOrderTasksEl.textContent = i18n.t('coldOpen.workOrder.glitchBody');
        this.workOrderTasksEl.style.color = '#b71c1c';
      }
      this.workOrderCardEl.style.background = '#fff0f0';
      this.workOrderCardEl.style.filter = 'drop-shadow(0 0 10px rgba(211,47,47,0.5))';
      this.workOrderCardEl.style.display = 'block';
      this.workOrderCardEl.style.opacity = '1';
    } else {
      this.workOrderCardEl.style.opacity = '0';
      this.workOrderCardEl.style.display = 'none';
    }
  }

  showThreeRulesOverlay(durationMs = 5000): void {
    if (!this.threeRulesEl) return;
    const i18n = I18nEngine.getInstance();
    if (this.rule1El) this.rule1El.textContent = i18n.t('coldOpen.rule1');
    if (this.rule2El) this.rule2El.textContent = i18n.t('coldOpen.rule2');
    if (this.rule3El) this.rule3El.textContent = i18n.t('coldOpen.rule3');

    this.threeRulesEl.style.display = 'flex';
    this.threeRulesEl.style.opacity = '1';

    if (this.threeRulesTimeout !== null) {
      clearTimeout(this.threeRulesTimeout);
    }
    this.threeRulesTimeout = setTimeout(() => {
      if (this.threeRulesEl) {
        this.threeRulesEl.style.opacity = '0';
        setTimeout(() => {
          if (this.threeRulesEl) this.threeRulesEl.style.display = 'none';
        }, 500);
      }
      this.threeRulesTimeout = null;
    }, durationMs);
  }

  showSectorToast(title: string, durationMs = 2000): void {
    if (!this.sectorToastEl) return;
    this.sectorToastEl.textContent = title;
    this.sectorToastEl.style.opacity = '1';
    if (this.sectorToastTimeout !== null) {
      clearTimeout(this.sectorToastTimeout);
    }
    this.sectorToastTimeout = setTimeout(() => {
      if (this.sectorToastEl) {
        this.sectorToastEl.style.opacity = '0';
      }
      this.sectorToastTimeout = null;
    }, durationMs);
  }

  getReticleElement(): HTMLElement | null {
    return this.reticleEl;
  }

  getBottomStackElement(): HTMLElement | null {
    return this.bottomStackEl;
  }

  getObjectivePillElement(): HTMLElement | null {
    return this.objectivePillEl;
  }

  getHotbarElement(): HTMLElement | null {
    return this.throwableHotbarEl;
  }

  showCheckpointSaved(durationMs = 2200): void {
    if (!this.checkpointSavedEl) return;
    this.checkpointSavedEl.style.opacity = '1';
    if (this.checkpointTimeout !== null) {
      clearTimeout(this.checkpointTimeout);
    }
    this.checkpointTimeout = setTimeout(() => {
      if (this.checkpointSavedEl) {
        this.checkpointSavedEl.style.opacity = '0';
      }
      this.checkpointTimeout = null;
    }, durationMs);
  }

  private onCycleInventoryCallback?: (() => void) | undefined;
  private onSpectatorLeaveCallback?: (() => void) | undefined;
  private onSpectatorCyclePrevCallback?: (() => void) | undefined;
  private onSpectatorCycleNextCallback?: (() => void) | undefined;
  private onSpectatorFreeRoamCallback?: (() => void) | undefined;

  setInventoryCycleCallback(cb: () => void): void {
    this.onCycleInventoryCallback = cb;
  }

  setSpectatorCallbacks(cbs: {
    onLeave?: () => void;
    onCyclePrev?: () => void;
    onCycleNext?: () => void;
    onToggleFreeRoam?: () => void;
  }): void {
    this.onSpectatorLeaveCallback = cbs.onLeave;
    this.onSpectatorCyclePrevCallback = cbs.onCyclePrev;
    this.onSpectatorCycleNextCallback = cbs.onCycleNext;
    this.onSpectatorFreeRoamCallback = cbs.onToggleFreeRoam;
  }

  setMinimalHud(minimal: boolean): void {
    if (!this.el) return;
    if (minimal) {
      this.el.classList.add('minimal-hud');
    } else {
      this.el.classList.remove('minimal-hud');
    }
  }

  setShowMoreHud(show: boolean): void {
    this.showMoreHud = show;
    if (!this.el) return;
    if (show) {
      this.el.classList.add('show-more-hud');
    } else {
      this.el.classList.remove('show-more-hud');
    }
    if (this.runTimerEl) this.runTimerEl.style.display = (show || this.streamerMode) ? 'block' : 'none';
    if (this.reticleEl) this.reticleEl.style.display = (show || this.streamerMode) ? 'block' : 'none';
    if (this.throwableHotbarEl) this.throwableHotbarEl.style.display = (show || this.streamerMode) ? 'flex' : 'none';
    if (this.minimalNoiseEl) this.minimalNoiseEl.style.display = (show || this.streamerMode) ? 'flex' : 'none';
  }

  getShowMoreHud(): boolean {
    return this.showMoreHud;
  }

  setCinematic(cinematic: boolean): void {
    this.cinematic = cinematic;
    if (!this.el) return;
    if (cinematic) {
      this.el.classList.add('cinematic');
    } else {
      this.el.classList.remove('cinematic');
    }
  }

  getCinematic(): boolean {
    return this.cinematic;
  }

  setStreamerMode(streamer: boolean): void {
    this.streamerMode = streamer;
    if (!this.el) return;
    if (streamer) {
      this.el.classList.add('streamer-mode');
    } else {
      this.el.classList.remove('streamer-mode');
    }
    if (this.runTimerEl) this.runTimerEl.style.display = (this.showMoreHud || streamer) ? 'block' : 'none';
    if (this.reticleEl) this.reticleEl.style.display = (this.showMoreHud || streamer) ? 'block' : 'none';
    if (this.throwableHotbarEl) this.throwableHotbarEl.style.display = (this.showMoreHud || streamer) ? 'flex' : 'none';
    if (this.minimalNoiseEl) this.minimalNoiseEl.style.display = (this.showMoreHud || streamer) ? 'flex' : 'none';
    this.updateFacecamOverlayVisibility();
  }

  isStreamerMode(): boolean {
    return this.streamerMode;
  }

  private currentHudStyle: 'hidden' | 'minimal' | 'full' = 'minimal';

  setHudStyle(style: 'hidden' | 'minimal' | 'full'): void {
    this.currentHudStyle = style;
    if (!this.el) return;
    this.el.classList.remove('hud-style-hidden', 'hud-style-minimal', 'hud-style-full');
    this.el.classList.add(`hud-style-${style}`);
    if (style === 'full') {
      this.setShowMoreHud(true);
      this.setStreamerMode(true);
    } else {
      this.setShowMoreHud(false);
      this.setStreamerMode(false);
    }
  }

  private updateFacecamOverlayVisibility(): void {
    const isDebug = typeof window !== 'undefined' && Boolean(window.location?.search?.includes('debug=1'));
    const facecam = this.el?.querySelector<HTMLElement>('#debug-facecam-overlay');
    if (facecam) {
      facecam.style.display = (this.streamerMode || isDebug) ? 'block' : 'none';
    }
  }

  showQuietHint(text: string, durationMs = 3000): void {
    if (!this.quietHintEl) return;
    this.quietHintEl.textContent = text;
    this.quietHintEl.style.display = 'block';
    // 1.5s fade-in
    setTimeout(() => {
      if (this.quietHintEl) this.quietHintEl.style.opacity = '1';
    }, 10);

    if (this.quietHintTimeout !== null) {
      clearTimeout(this.quietHintTimeout);
    }
    // Hold for durationMs (default 3s), then fade out
    this.quietHintTimeout = setTimeout(() => {
      if (this.quietHintEl) {
        this.quietHintEl.style.opacity = '0';
        setTimeout(() => {
          if (this.quietHintEl) this.quietHintEl.style.display = 'none';
        }, 1500);
      }
      this.quietHintTimeout = null;
    }, durationMs + 1500);
  }

  hideQuietHint(): void {
    if (this.quietHintTimeout !== null) {
      clearTimeout(this.quietHintTimeout);
      this.quietHintTimeout = null;
    }
    if (this.quietHintEl) {
      this.quietHintEl.style.opacity = '0';
      this.quietHintEl.style.display = 'none';
    }
  }

  dismissThrowableHint(): void {
    if (this.throwableHintEl) {
      this.throwableHintEl.style.display = 'none';
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('backsilence_throwable_hint_used', 'true');
      } catch {
        /* ignore */
      }
    }
  }

  getObjective(): string {
    return this.currentData.objective || 'Find the numbered pillars. Avoid making splashes.';
  }

  setUiScale(scale: number): void {
    if (!this.el) return;
    this.el.style.setProperty('--hud-scale', String(scale));
  }

  showNearMiss(distanceM: number): void {
    if (!this.el) return;
    const el = this.nearMissEl;
    if (!el) return;

    el.textContent = `[ CLOSE CALL — ${distanceM.toFixed(1)} m ]`;
    el.style.display = 'block';
    el.style.opacity = '1';

    this.announceToScreenReader(`Warning: Monster close call, ${distanceM.toFixed(1)} meters away.`);

    if (this.nearMissTimeout !== null) {
      clearTimeout(this.nearMissTimeout);
    }
    this.nearMissTimeout = setTimeout(() => {
      if (el) {
        el.style.opacity = '0';
        setTimeout(() => {
          if (el) el.style.display = 'none';
        }, 250);
      }
      this.nearMissTimeout = null;
    }, 2000);
  }

  private announceToScreenReader(message: string): void {
    if (!this.el) return;
    const liveEl = this.screenReaderLiveEl;
    if (liveEl) {
      liveEl.textContent = message;
    }
  }

  mount(container: HTMLElement): void {
    const el = document.createElement('div');
    el.id = 'hud-overlay';
    el.className = 'bs-hud';
    el.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 150;
      user-select: none;
      font-family: monospace;
      color: var(--fog, #d9d3a2);
      --hud-scale: 1.0;
    `;

    el.innerHTML = `
      <style>
        .bs-hud {
          --hud-scale: 1.0;
        }
        /* Clean picture: Default HUD is empty except thin noise line, persistent top-left objective and interaction prompt */
        .bs-hud:not(.show-more-hud) #hud-vhs-osd,
        .bs-hud:not(.show-more-hud) #hud-notebook-container,
        .bs-hud:not(.show-more-hud) #hud-notebook,
        .bs-hud:not(.show-more-hud) #hud-roster,
        .bs-hud:not(.show-more-hud) #hud-level-shift,
        .bs-hud:not(.show-more-hud) #hud-school-status,
        .bs-hud:not(.show-more-hud) #hud-jungle-status,
        .bs-hud:not(.show-more-hud) #hud-neon-status,
        .bs-hud:not(.show-more-hud) #hud-metro-status,
        .bs-hud:not(.show-more-hud) #hud-bottom-center,
        .bs-hud:not(.show-more-hud) #hud-status,
        .bs-hud:not(.show-more-hud) #hud-stamina-bar,
        .bs-hud:not(.show-more-hud) #hud-generator-status,
        .bs-hud:not(.show-more-hud) #hud-inventory-strip,
        .bs-hud:not(.show-more-hud) #hud-flashlight-meter,
        .bs-hud:not(.show-more-hud) #hud-objective-container,
        .bs-hud:not(.show-more-hud) #hud-ping-hint,
        .bs-hud:not(.show-more-hud) #hud-near-miss {
          display: none !important;
        }

        @keyframes pulse-hunted {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.06); }
        }
        .hud-risk-quiet {
          border-color: #86cfa0 !important;
          color: #86cfa0 !important;
          background: rgba(134,207,160,0.18) !important;
        }
        .hud-risk-audible {
          border-color: #ffb300 !important;
          color: #ffb300 !important;
          background: rgba(255,179,0,0.18) !important;
        }
        .hud-risk-loud {
          border-color: #ff9100 !important;
          color: #ff9100 !important;
          background: rgba(255,145,0,0.22) !important;
        }
        .hud-risk-close {
          border-color: #ff1744 !important;
          color: #ff1744 !important;
          background: rgba(255,23,68,0.25) !important;
        }
        .hud-risk-hunted {
          border-color: #ff0033 !important;
          color: #ff0033 !important;
          background: rgba(255,0,51,0.35) !important;
          animation: pulse-hunted 0.8s infinite ease-in-out;
        }
        .hud-risk-escape {
          border-color: #86cfa0 !important;
          color: #86cfa0 !important;
          background: rgba(134,207,160,0.18) !important;
        }
        .hud-risk-timed {
          border-color: #ffd54f !important;
          color: #ffd54f !important;
          background: rgba(255,213,79,0.18) !important;
        }

        .bs-hud.minimal-hud #hud-compass-arc,
        .bs-hud.minimal-hud #hud-ping-hint {
          display: none !important;
        }

        .bs-hud.high-contrast #hud-compass-notch polygon {
          fill: #ffeb3b !important;
        }
        .bs-hud.high-contrast #hud-compass-text {
          color: #ffeb3b !important;
        }

        .bs-hud.show-more-hud #hud-noise-minimal {
          display: none !important;
        }

        .bs-hud.show-more-hud #hud-objective-pill {
          display: none !important;
        }

        .bs-hud.cinematic #hud-bottom-stack,
        .bs-hud.cinematic #hud-noise-minimal {
          display: none !important;
        }

        /* Default zero-HUD presentation matching reference video (clean game footage) */
        .bs-hud:not(.show-more-hud):not(.streamer-mode):not(.hud-style-full) #hud-run-timer,
        .bs-hud:not(.show-more-hud):not(.streamer-mode):not(.hud-style-full) #hud-reticle,
        .bs-hud:not(.show-more-hud):not(.streamer-mode):not(.hud-style-full) #hud-throwable-hotbar,
        .bs-hud:not(.show-more-hud):not(.streamer-mode):not(.hud-style-full) #hud-noise-minimal,
        .bs-hud:not(.show-more-hud):not(.streamer-mode):not(.hud-style-full) #hud-bottom-stack,
        .bs-hud:not(.show-more-hud):not(.streamer-mode):not(.hud-style-full) #hud-pointer-lock-hint {
          display: none !important;
        }

        .bs-hud.minimal-hud #hud-vhs-osd,
        .bs-hud.minimal-hud #hud-roster,
        .bs-hud.minimal-hud #hud-level-shift,
        .bs-hud.minimal-hud #hud-school-status,
        .bs-hud.minimal-hud #hud-jungle-status,
        .bs-hud.minimal-hud #hud-neon-status,
        .bs-hud.minimal-hud #hud-metro-status,
        .bs-hud.minimal-hud #hud-bottom-center {
          display: none !important;
        }
        @media (max-width: 480px) {
          #hud-objective-container {
            max-width: calc(100vw - 32px) !important;
          }
          #hud-objective {
            font-size: 11px !important;
          }
        }

        .bs-hud.streamer-mode #hud-run-timer {
          top: max(18px, calc(28% + 12px)) !important;
        }
        @media (max-aspect-ratio: 1/1) {
          .bs-hud #hud-run-timer {
            top: max(18px, calc(28% + 12px));
          }
        }
        #debug-facecam-overlay {
          position: absolute; top: 0; left: 0; width: 100%; height: 28%;
          background: #d113; border-bottom: 2px dashed #f55d;
          pointer-events: none; display: none; z-index: 50; padding: 10px 14px; box-sizing: border-box;
        }
        #debug-facecam-overlay > span {
          font-family: monospace; font-size: 10px; color: #ffdc; background: #000a; padding: 2px 8px;
        }
      </style>

      <div id="debug-facecam-overlay"><span>FACECAM ZONE (28%)</span></div>

      <!-- Screen Reader Off-screen Live Region -->
      <div id="hud-screen-reader-live" aria-live="polite" aria-atomic="true" style="
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      "></div>

      <!-- Red / Jumpscare Damage Vignette -->
      <div id="hud-vignette" style="
        position: absolute;
        inset: 0;
        background: radial-gradient(circle, transparent 50%, rgba(179,38,30,0.8) 100%);
        opacity: 0;
        display: none;
        transition: opacity 0.15s ease-out;
      "></div>

      <!-- Level Shift Warning Border (Map 4) -->
      <div id="hud-level-border" style="
        position: absolute;
        inset: 0;
        box-shadow: inset 0 0 35px rgba(255,59,48,0.7);
        opacity: 0;
        transition: opacity 0.3s ease-in-out;
        pointer-events: none;
      "></div>

      <!-- Near-Miss Alert ("CLOSE, 1.8 m") -->
      <div id="hud-near-miss" style="
        position: absolute;
        top: max(72px, calc(env(safe-area-inset-top, 20px) + 52px));
        left: 50%;
        transform: translateX(-50%);
        font-size: 13px;
        font-weight: bold;
        color: #ffb300;
        background: rgba(8, 6, 3, 0.94);
        border: 1.5px solid #ffb300;
        box-shadow: 0 0 16px rgba(255, 179, 0, 0.6);
        padding: 6px 16px;
        border-radius: 4px;
        letter-spacing: 0.12em;
        display: none;
        pointer-events: none;
        transition: opacity 0.25s ease;
        z-index: 200;
      "></div>

      <!-- Top-Right Chlorine Cell Counter Chip (Prompt 7) -->
      <div id="hud-cell-chip" style="
        position: absolute;
        top: 18px;
        right: 24px;
        display: none;
        align-items: center;
        gap: 6px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: #86cfa0;
        background: rgba(8, 6, 3, 0.85);
        border: 1px solid rgba(134, 207, 160, 0.4);
        padding: 4px 10px;
        border-radius: 14px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.7);
        letter-spacing: 0.04em;
        pointer-events: none;
        z-index: 100;
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#86cfa0" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="7" y="4" width="10" height="16" rx="2"/>
          <path d="M10 2h4"/>
          <path d="M10 9h4"/>
          <path d="M10 14h4"/>
        </svg>
        <span id="hud-cell-counter">0/7</span>
      </div>

      <!-- Top-Center Run Timer (Prompt 4B Section 1) -->
      <div id="hud-run-timer" style="
        position: absolute;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        font-size: 26px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: #ffffff;
        text-shadow: 0 2px 8px rgba(0,0,0,0.75);
        letter-spacing: 0.04em;
        pointer-events: none;
        z-index: 100;
      ">00:00.0</div>

      <!-- Teaching Caption (Prompt 7 / Video-1: "Do not touch the water 💔") -->
      <div id="hud-warning-caption" style="
        position: absolute;
        top: 56px;
        left: 50%;
        transform: translateX(-50%);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        font-size: 16px;
        font-weight: 700;
        color: #ffffff;
        text-shadow: 0 2px 10px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.8);
        letter-spacing: 0.06em;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        display: none;
        transition: opacity 0.5s ease;
        z-index: 105;
      ">Do not touch the water 💔</div>

      <!-- Work Order Clipboard Card (Prompt 7 / Cold Open) -->
      <div id="hud-work-order-card" style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 380px;
        max-width: calc(100vw - 32px);
        background: #f4f0e6;
        color: #1a1a18;
        border: 2px solid #8c8270;
        border-radius: 6px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.85);
        padding: 24px 20px 18px 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Courier New', monospace;
        pointer-events: none;
        display: none;
        opacity: 0;
        transition: opacity 0.4s ease, transform 0.4s ease;
        z-index: 250;
      ">
        <div id="hud-work-order-clip" style="
          position: absolute;
          top: -14px;
          left: 50%;
          transform: translateX(-50%);
          width: 90px;
          height: 24px;
          background: #4a453e;
          border: 1px solid #2b2824;
          border-radius: 4px;
          box-shadow: 0 3px 8px rgba(0,0,0,0.4);
        "></div>
        <div id="hud-work-order-authority" style="
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.14em;
          color: #595349;
          text-align: center;
          border-bottom: 1.5px solid #d1c9b6;
          padding-bottom: 8px;
          margin-bottom: 14px;
          text-transform: uppercase;
        ">MUNICIPAL WATER &amp; POOLS AUTHORITY</div>
        <div id="hud-work-order-title" style="
          font-size: 15px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-align: center;
          margin-bottom: 12px;
          color: #1a1a18;
        ">SHIFT 07:00 — ROUTINE MAINTENANCE</div>
        <div id="hud-work-order-tasks" style="
          font-size: 13px;
          line-height: 1.8;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: #2b2721;
          margin-bottom: 16px;
          white-space: pre-line;
        ">• CHECK POOL CHEMISTRY&#10;• EMPTY SKIMMER BASKETS&#10;• LOG GAUGE READINGS</div>
        <div id="hud-work-order-skip" style="
          font-size: 11px;
          color: #7a7365;
          text-align: center;
          border-top: 1px dashed #d1c9b6;
          padding-top: 10px;
          letter-spacing: 0.08em;
        ">Press any key to skip</div>
      </div>

      <!-- Three Rules Overlay (Prompt 7 / Cold Open Skip or Completion) -->
      <div id="hud-three-rules" style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: none;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.5s ease;
        z-index: 250;
        text-align: center;
      ">
        <div id="hud-rule-1" style="font-size: 20px; font-weight: 700; color: #f2ecd8; text-shadow: 0 2px 12px rgba(0,0,0,0.9); letter-spacing: 0.08em;">It can't see you.</div>
        <div id="hud-rule-2" style="font-size: 20px; font-weight: 700; color: #f2ecd8; text-shadow: 0 2px 12px rgba(0,0,0,0.9); letter-spacing: 0.08em;">It hears the water.</div>
        <div id="hud-rule-3" style="font-size: 22px; font-weight: 800; color: #ff5252; text-shadow: 0 2px 14px rgba(0,0,0,0.95); letter-spacing: 0.08em;">Do not touch the water 💔</div>
      </div>

      <!-- Center Reticle (Prompt 4B Section 1: 3px x 3px solid white dot) -->
      <div id="hud-reticle" style="
        position: absolute;
        top: 50%;
        left: 50%;
        width: 3px;
        height: 3px;
        border-radius: 50%;
        background-color: rgba(255, 255, 255, 0.85);
        box-shadow: 0 0 2px rgba(0,0,0,0.8);
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 90;
      "></div>

      <!-- Sleek Sector Title Center Toast (2.0s Fade) -->
      <div id="hud-sector-toast" style="position: absolute; top: 38%; left: 50%; transform: translate(-50%, -50%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 22px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #ffffff; text-shadow: 0 2px 14px rgba(0,0,0,0.95), 0 0 20px rgba(134,207,160,0.3); opacity: 0; pointer-events: none; transition: opacity 0.4s ease-out; z-index: 120; text-align: center; white-space: nowrap;"></div>

      <!-- Center Crosshair and Directional Arc Ring -->
      <div id="hud-crosshair-container" style="
        position: absolute;
        top: 50%;
        left: 50%;
        width: 48px;
        height: 48px;
        transform: translate(-50%, -50%);
        pointer-events: none;
      ">
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--fog, #d9d3a2);
          box-shadow: 0 0 4px rgba(0,0,0,0.8);
          transform: translate(-50%, -50%);
          opacity: 0.7;
        "></div>
        <svg id="hud-sound-arc-svg" width="48" height="48" viewBox="0 0 48 48" style="position: absolute; inset: 0; opacity: 0; transition: opacity 0.2s ease-out;">
          <circle cx="24" cy="24" r="20" stroke="rgba(217, 211, 162, 0.25)" stroke-width="1.5" fill="none"/>
          <path id="hud-sound-arc-path" d="" stroke="#ff8a80" stroke-width="3" fill="none" stroke-linecap="round"/>
        </svg>
      </div>

      <!-- Interaction Prompt with Circular Hold Ring -->
      <div id="hud-prompt" style="
        position: absolute;
        top: 55%;
        left: 50%;
        transform: translateX(-50%);
        font-size: 14px;
        font-weight: bold;
        color: var(--water, #86cfa0);
        background: rgba(8, 6, 3, 0.92);
        padding: 6px 14px;
        border: 1px solid rgba(134,207,160,0.4);
        border-radius: 20px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.8);
        display: none;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
      ">
        <svg id="hud-prompt-ring" width="22" height="22" viewBox="0 0 24 24" style="display: none; flex-shrink: 0;">
          <circle cx="12" cy="12" r="10" stroke="rgba(217,211,162,0.2)" stroke-width="2.5" fill="none"/>
          <circle id="hud-prompt-ring-fill" cx="12" cy="12" r="10" stroke="#00e5ff" stroke-width="2.5" fill="none"
            stroke-dasharray="62.83" stroke-dashoffset="62.83" stroke-linecap="round" transform="rotate(-90 12 12)"/>
        </svg>
        <div id="hud-prompt-text" style="display: flex; flex-direction: column; align-items: center; line-height: 1.25;">
          <span id="hud-prompt-verb"></span>
          <span id="hud-prompt-qualifier" style="font-size: 11px; opacity: 0.85; font-weight: 500; letter-spacing: 0.05em; display: none;"></span>
        </div>
      </div>

      <!-- VHS OSD Elements -->
      <div id="hud-vhs-osd" style="display: block;">
        <div style="position: absolute; top: max(20px, env(safe-area-inset-top, 20px)); left: max(20px, env(safe-area-inset-left, 20px)); font-size: 13px; letter-spacing: 0.1em; display: flex; align-items: center; gap: 8px; background: rgba(8,6,3,0.7); padding: 3px 8px; border-radius: 3px;">
          <span id="vhs-rec-dot" style="color: var(--danger, #b3261e); font-size: 16px;">●</span>
          <span id="vhs-rec-label">REC</span>
          <span id="vhs-timestamp" style="margin-left: 8px; opacity: 0.85;">AUG 14 1998  00:12:44</span>
        </div>
        <div style="position: absolute; top: max(64px, calc(env(safe-area-inset-top, 20px) + 44px)); right: max(20px, env(safe-area-inset-right, 20px)); font-size: 12px; opacity: 0.85; letter-spacing: 0.1em; background: rgba(8,6,3,0.7); padding: 3px 8px; border-radius: 3px;">
          SP [■■■□] · BACKSILENCE
        </div>
        <div id="vhs-play-mode" style="position: absolute; bottom: max(24px, env(safe-area-inset-bottom, 24px)); left: max(20px, env(safe-area-inset-left, 20px)); font-size: 12px; opacity: 0.85; letter-spacing: 0.1em; background: rgba(8,6,3,0.7); padding: 3px 8px; border-radius: 3px;">
          PLAY ▶
        </div>
      </div>

      <!-- Top-Right Notebook Sequence Strip -->
      <div id="hud-notebook-container" style="
        position: absolute;
        top: max(20px, env(safe-area-inset-top, 20px));
        right: max(20px, env(safe-area-inset-right, 20px));
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        z-index: 10;
      ">
        <div style="font-size: 10px; opacity: 0.6; letter-spacing: 0.1em;">PILLAR SEQUENCE</div>
        <div id="hud-notebook" style="
          background: #080603;
          border: 1px solid #5b4526;
          border-radius: 3px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: bold;
          color: var(--water, #86cfa0);
          letter-spacing: 0.2em;
        ">#1: ? · #2: ? · #3: ? · #4: ?</div>
      </div>

      <!-- Top-Right Level Shift Timer (Map 4) -->
      <div id="hud-level-shift" style="
        position: absolute;
        top: max(72px, calc(env(safe-area-inset-top, 20px) + 52px));
        right: max(20px, env(safe-area-inset-right, 20px));
        display: none;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        background: #0d0b06;
        border: 1px solid #3d2f18;
        padding: 6px 12px;
        border-radius: 4px;
      ">
        <div style="font-size: 10px; opacity: 0.6; letter-spacing: 0.1em;">HYDRO-PUMP CYCLE</div>
        <div id="hud-level-timer-text" style="font-size: 13px; font-weight: bold; color: var(--water, #86cfa0); letter-spacing: 0.1em;">
          LEVEL SHIFT 0:37
        </div>
      </div>

      <!-- Top-Right Generator Status (Map 5) -->
      <div id="hud-generator-status" style="
        position: absolute;
        top: max(56px, calc(env(safe-area-inset-top, 20px) + 36px));
        right: max(20px, env(safe-area-inset-right, 20px));
        display: none;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        background: #0d0b06;
        border: 1px solid #3d2f18;
        padding: 6px 12px;
        border-radius: 4px;
      ">
        <div style="font-size: 10px; opacity: 0.6; letter-spacing: 0.1em;">CORE GENERATORS</div>
        <div id="hud-generator-text" style="font-size: 12px; font-weight: bold; color: var(--water, #86cfa0); letter-spacing: 0.15em;">
          G1 ○  G2 ○  G3 ○
        </div>
        <div id="hud-blastdoors-text" style="font-size: 11px; color: #ffeb3b; display: none;">
          Blast Doors: 5.0s
        </div>
      </div>

      <!-- Top-Right Schoolhouse Status -->
      <div id="hud-school-status" style="
        position: absolute;
        top: max(56px, calc(env(safe-area-inset-top, 20px) + 36px));
        right: max(20px, env(safe-area-inset-right, 20px));
        display: none;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        background: #0d0b06;
        border: 1px solid #3d2f18;
        padding: 6px 12px;
        border-radius: 4px;
      ">
        <div style="font-size: 10px; opacity: 0.6; letter-spacing: 0.1em;">FLOOD LEVEL</div>
        <div id="hud-school-tide-text" style="font-size: 13px; font-weight: bold; color: var(--water, #86cfa0); letter-spacing: 0.1em;">
          TIDE +0.00 m
        </div>
        <div id="hud-school-pa-text" style="font-size: 10px; color: #d8b36a;">
          PA LURE: [■■□]
        </div>
      </div>

      <!-- Top-Right Jungle Status -->
      <div id="hud-jungle-status" style="
        position: absolute;
        top: max(56px, calc(env(safe-area-inset-top, 20px) + 36px));
        right: max(20px, env(safe-area-inset-right, 20px));
        display: none;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        background: #0d0b06;
        border: 1px solid #3d2f18;
        padding: 6px 12px;
        border-radius: 4px;
      ">
        <div style="font-size: 10px; opacity: 0.6; letter-spacing: 0.1em;">SLUICE GATES</div>
        <div id="hud-jungle-gates-text" style="font-size: 13px; font-weight: bold; color: var(--water, #86cfa0); letter-spacing: 0.1em;">
          GATES 0/3 ALIGNED
        </div>
        <div id="hud-jungle-flow-text" style="font-size: 10px; color: var(--fog, #d9d3a2);">
          FLOW: ➔ 1.2 m/s
        </div>
        <div id="hud-jungle-fauna-text" style="font-size: 10px; color: #86cfa0;">
          FAUNA HUSH: ACTIVE
        </div>
      </div>

      <!-- Top-Right Neon Flood District Status -->
      <div id="hud-neon-status" style="
        position: absolute;
        top: max(56px, calc(env(safe-area-inset-top, 20px) + 36px));
        right: max(20px, env(safe-area-inset-right, 20px));
        display: none;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        background: #0d0b06;
        border: 1px solid #3d2f18;
        padding: 6px 12px;
        border-radius: 4px;
      ">
        <div style="font-size: 10px; opacity: 0.6; letter-spacing: 0.1em;">GRID UPLINKS & STORM</div>
        <div id="hud-neon-uplinks-text" style="font-size: 13px; font-weight: bold; color: #00e5ff; letter-spacing: 0.1em;">
          UPLINKS 0/3
        </div>
        <div id="hud-neon-storm-text" style="font-size: 10px; color: #ffeb3b;">
          STORM: 0:24
        </div>
        <div id="hud-neon-emp-text" style="font-size: 10px; color: #d8b36a;">
          EMP: x2
        </div>
      </div>

      <!-- Top-Right Metro Status -->
      <div id="hud-metro-status" style="
        position: absolute;
        top: max(56px, calc(env(safe-area-inset-top, 20px) + 36px));
        right: max(20px, env(safe-area-inset-right, 20px));
        display: none;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        background: #0d0b06;
        border: 1px solid #3d2f18;
        padding: 6px 12px;
        border-radius: 4px;
      ">
        <div style="font-size: 10px; opacity: 0.6; letter-spacing: 0.1em;">EXPRESS TRACK T2</div>
        <div id="hud-metro-train-text" style="font-size: 13px; font-weight: bold; color: var(--water, #86cfa0); letter-spacing: 0.1em;">
          GHOST TRAIN: 0:45
        </div>
        <div id="hud-metro-bottle-text" style="font-size: 10px; color: var(--fog, #d9d3a2);">
          BOTTLES: x3
        </div>
        <div id="hud-metro-depart-text" style="font-size: 11px; color: #ffeb3b; display: none;">
          DEPARTURE: 20.0s
        </div>
      </div>

      <!-- Top-Left Objective Line with Risk Tag & Telemetry Checklist -->
      <div id="hud-objective-container" class="sector-briefing-box" style="
        position: absolute;
        top: max(20px, env(safe-area-inset-top, 20px));
        left: max(20px, env(safe-area-inset-left, 20px));
        display: flex;
        flex-direction: column;
        gap: 6px;
        background: rgba(8, 6, 3, 0.92);
        border: 1px solid rgba(217, 211, 162, 0.35);
        padding: 8px 14px;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.7);
        max-width: min(92vw, 560px);
        box-sizing: border-box;
        z-index: 10;
        pointer-events: none;
      ">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid rgba(217,211,162,0.18); padding-bottom: 4px;">
          <span id="hud-sector-title" style="font-size: 11px; font-weight: bold; letter-spacing: 0.12em; color: #ffb000; text-transform: uppercase;">SECTOR 01 // DROWNED METRO</span>
          <span id="hud-risk-tag" class="hud-risk-quiet" style="
            font-size: 10px;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 3px;
            letter-spacing: 0.1em;
            flex-shrink: 0;
          ">[QUIET]</span>
        </div>
        <span id="hud-objective" style="
          font-size: 12px;
          color: var(--fog, #d9d3a2);
          letter-spacing: 0.05em;
          white-space: normal;
          line-height: 1.35;
          max-width: 560px;
          overflow: hidden;
        ">Find the numbered pillars. Avoid making splashes.</span>
        <div id="hud-checklist" style="display: none; flex-direction: column; gap: 4px; margin-top: 2px;"></div>
      </div>

      <!-- Top-Center Diegetic Direction Finder / Compass Arc -->
      <div id="hud-compass-arc" style="
        position: absolute;
        top: max(16px, env(safe-area-inset-top, 16px));
        left: 50%;
        transform: translateX(-50%);
        display: none;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        pointer-events: none;
        z-index: 15;
      ">
        <svg width="120" height="20" viewBox="0 0 120 20" style="overflow: visible;">
          <path d="M 10 14 Q 60 4 110 14" fill="none" stroke="rgba(217, 211, 162, 0.25)" stroke-width="1.5" />
          <g id="hud-compass-notch" transform="translate(60, 9)">
            <polygon points="-5,-4 5,-4 0,3" fill="#00e5ff" />
          </g>
        </svg>
        <span id="hud-compass-text" style="
          font-size: 10px;
          font-weight: bold;
          letter-spacing: 0.1em;
          color: #00e5ff;
          text-shadow: 0 1px 4px rgba(0,0,0,0.8);
          font-family: monospace;
        ">PILLAR #2 · 28m</span>
      </div>

      <!-- Hazard / Mask Alert Icon (Map 2 steam / Map 3 sinking) -->
      <div id="hud-hazard-alert" style="
        position: absolute;
        top: max(60px, calc(env(safe-area-inset-top, 20px) + 40px));
        left: 50%;
        transform: translateX(-50%);
        font-size: 11px;
        font-weight: bold;
        padding: 4px 10px;
        border-radius: 4px;
        display: none;
        letter-spacing: 0.1em;
      "></div>

      <!-- Multiplayer Roster HUD (Top-Right) -->
      <div id="hud-roster" style="
        position: absolute;
        top: max(20px, env(safe-area-inset-top, 20px));
        right: max(20px, env(safe-area-inset-right, 20px));
        display: none;
        flex-direction: column;
        gap: 6px;
        background: rgba(13, 11, 6, 0.85);
        border: 1px solid rgba(217, 211, 162, 0.25);
        padding: 8px 12px;
        border-radius: 4px;
        min-width: 140px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      ">
        <div style="font-size: 10px; opacity: 0.6; letter-spacing: 0.1em; margin-bottom: 2px;">EXPEDITION ROSTER</div>
        <div id="hud-roster-list" style="display: flex; flex-direction: column; gap: 4px;"></div>
      </div>

      <!-- Spectator Overlay Banner (Top-Center) -->
      <div id="hud-spectator-container" style="
        position: absolute;
        top: max(60px, calc(env(safe-area-inset-top, 20px) + 40px));
        left: 50%;
        transform: translateX(-50%);
        display: none;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        background: rgba(13, 11, 6, 0.9);
        border: 1px solid rgba(134, 207, 160, 0.4);
        padding: 8px 18px;
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.6);
        pointer-events: auto;
      ">
        <div style="display: flex; align-items: center; gap: 12px;">
          <button id="btn-spectate-prev" class="analog-btn" style="width: auto; padding: 2px 8px; font-size: 12px; cursor: pointer;">◀ Q</button>
          <div id="hud-spectator-name" style="font-size: 13px; font-weight: bold; color: var(--water, #86cfa0); letter-spacing: 0.1em;">SPECTATING: TEAMMATE</div>
          <button id="btn-spectate-next" class="analog-btn" style="width: auto; padding: 2px 8px; font-size: 12px; cursor: pointer;">E ▶</button>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; font-size: 10px; opacity: 0.8;">
          <button id="btn-spectate-freeroam" class="analog-btn" style="width: auto; padding: 3px 8px; font-size: 10px; cursor: pointer;">[F] FREE ROAM</button>
          <button id="btn-spectate-leave" class="analog-btn" style="width: auto; padding: 3px 8px; font-size: 10px; border-color: var(--danger, #b3261e); color: #f4c2c0; cursor: pointer;">LEAVE TO MENU</button>
        </div>
      </div>

      <!-- Left Bottom: Inventory Strip & Flashlight Battery -->
      <div style="
        position: absolute;
        bottom: max(24px, env(safe-area-inset-bottom, 24px));
        left: max(20px, env(safe-area-inset-left, 20px));
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: auto;
      ">
        <!-- Inventory Strip -->
        <div id="hud-inventory-strip" style="
          display: none;
          gap: 6px;
          background: rgba(13, 11, 6, 0.85);
          border: 1px solid #3d2f18;
          padding: 6px;
          border-radius: 4px;
          cursor: pointer;
        ">
          <!-- Populated dynamically -->
        </div>

        <!-- Flashlight Battery Meter (Map 5) -->
        <div id="hud-flashlight-meter" style="
          display: none;
          flex-direction: column;
          gap: 3px;
          background: rgba(13, 11, 6, 0.85);
          border: 1px solid #3d2f18;
          padding: 6px 10px;
          border-radius: 4px;
          width: 140px;
        ">
          <div style="display: flex; justify-content: space-between; font-size: 10px; opacity: 0.75;">
            <span>FLASHLIGHT [F]</span>
            <span id="hud-battery-pct">100%</span>
          </div>
          <div style="width: 100%; height: 4px; background: rgba(217,211,162,0.15); border-radius: 2px; overflow: hidden;">
            <div id="hud-battery-bar" style="width: 100%; height: 100%; background: var(--water, #86cfa0); transition: width 0.1s linear;"></div>
          </div>
          <div style="font-size: 9px; opacity: 0.6; text-align: right;">HOLD [C] TO CRANK</div>
        </div>
      </div>

      <!-- Bottom-Center: The Acoustic Noise Meter, Radius Ring & Stamina -->
      <div id="hud-bottom-center" style="
        position: absolute;
        bottom: max(24px, env(safe-area-inset-bottom, 24px));
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        pointer-events: none;
      ">
        <!-- Status & Stamina -->
        <div style="display: flex; align-items: center; gap: 12px; width: 230px; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span id="hud-status" class="badge" style="border-color: #86cfa0; color: #86cfa0; font-size: 11px; background: rgba(8, 6, 3, 0.9); font-weight: bold; padding: 2px 7px;">DRY</span>
            <span id="hud-perch-chip" class="badge" style="display: none; border-color: #b388ff; color: #b388ff; font-size: 11px; background: rgba(8, 6, 3, 0.9); font-weight: bold; padding: 2px 7px;">PERCHED</span>
          </div>
          
          <!-- Stamina bar -->
          <div style="width: 120px; height: 4px; background: rgba(217,211,162,0.18); border-radius: 2px; overflow: hidden;">
            <div id="hud-stamina-bar" style="width: 100%; height: 100%; background: var(--water, #86cfa0); border-radius: 2px; transition: width 0.1s linear;"></div>
          </div>
        </div>

        <!-- Central Noise Meter Card with Numeric Ticks and Radius Ring -->
        <div style="
          display: flex;
          flex-direction: column;
          gap: 4px;
          background: rgba(8, 6, 3, 0.92);
          border: 1px solid rgba(217, 211, 162, 0.35);
          padding: 8px 16px;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.7);
        ">
          <!-- Top Row: Icon, Water Radius readout & Title -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 10px; letter-spacing: 0.08em; opacity: 0.9;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <svg id="hud-noise-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #00e5ff; transition: color 0.15s, transform 0.15s; flex-shrink: 0;">
                <circle id="hud-water-radius-ring" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 3" opacity="0.45" />
                <path d="M12 4v16M8 8v8M4 11v2M16 7v10M20 10v4"/>
              </svg>
              <span id="hud-noise-title" style="font-weight: bold; color: var(--fog, #d9d3a2);">ACOUSTIC LEVEL</span>
            </div>
            <span id="hud-noise-radius-label" style="font-size: 10px; color: #00e5ff; font-weight: bold;">RADIUS ~0m</span>
          </div>

          <!-- Noise loudness bar track with ticks -->
          <div style="position: relative; width: 190px; height: 8px; background: rgba(217,211,162,0.18); border-radius: 4px; overflow: hidden;">
            <div id="hud-noise-bar" style="
              width: 0%;
              height: 100%;
              background: #00e5ff;
              border-radius: 4px;
              transition: width 0.08s ease-out, background-color 0.15s;
            "></div>
          </div>

          <!-- Numeric Tick Marks: 0.12, 0.35, 0.75, 1.0 -->
          <div style="position: relative; width: 190px; height: 14px; font-size: 9px; opacity: 0.75; font-family: monospace;">
            <div style="position: absolute; left: 12%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center;">
              <span style="display: block; width: 1px; height: 3px; background: rgba(217,211,162,0.5);"></span>
              <span>.12</span>
            </div>
            <div style="position: absolute; left: 35%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center;">
              <span style="display: block; width: 1px; height: 3px; background: rgba(217,211,162,0.5);"></span>
              <span>.35</span>
            </div>
            <div style="position: absolute; left: 75%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center;">
              <span style="display: block; width: 1px; height: 3px; background: rgba(217,211,162,0.5);"></span>
              <span>.75</span>
            </div>
            <div style="position: absolute; left: 100%; transform: translateX(-100%); display: flex; flex-direction: column; align-items: flex-end;">
              <span style="display: block; width: 1px; height: 3px; background: rgba(217,211,162,0.5);"></span>
              <span>1.0</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Sound Visualizer Caption -->
      <div id="hud-caption" style="
        position: absolute;
        bottom: max(68px, calc(env(safe-area-inset-bottom, 24px) + 44px));
        left: max(20px, env(safe-area-inset-left, 20px));
        font-size: 13px;
        color: var(--water, #86cfa0);
        background: rgba(8, 6, 3, 0.92);
        border: 1px solid rgba(217, 211, 162, 0.35);
        padding: 5px 12px;
        border-radius: 4px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.7);
        display: none;
        max-width: min(85vw, 360px);
      "></div>

      <!-- Bottom-Center Unified Non-Overlapping Vertical Flex Stack (Prompt 1B Fix) -->
      <div id="hud-bottom-stack" style="
        position: absolute;
        bottom: max(16px, env(safe-area-inset-bottom, 16px));
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        pointer-events: none;
        z-index: 100;
        width: max-content;
        max-width: min(92vw, 560px);
      ">
        <!-- Minimal Noise Indicator (220x6 px with numeric radius readout) -->
        <div id="hud-noise-minimal" style="
          display: flex;
          align-items: center;
          gap: 10px;
          pointer-events: none;
          margin-bottom: 8px;
        ">
          <div style="
            width: 220px;
            height: 6px;
            background: rgba(238, 222, 194, 0.18);
            border-radius: 3px;
            overflow: hidden;
            box-shadow: 0 1px 4px rgba(0,0,0,0.5);
          ">
            <div id="hud-noise-minimal-fill" style="
              width: 0%;
              height: 100%;
              background: #eedec2;
              border-radius: 3px;
              transition: width 0.08s ease-out, background-color 0.15s;
            "></div>
          </div>
          <span id="hud-noise-minimal-radius" style="
            font-size: 11px;
            font-weight: bold;
            font-family: monospace;
            color: rgba(238, 222, 194, 0.9);
            letter-spacing: 0.05em;
            white-space: nowrap;
            text-shadow: 0 1px 3px rgba(0,0,0,0.8);
          ">RADIUS ~0m</span>
        </div>

        <!-- Row 1 (Top of stack, bottom: 84px): Temporary toast / caption / checkpoint saved (margin-bottom: 10px) -->
        <div id="hud-toast-row" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 10px;
          min-height: 20px;
        ">
          <!-- Checkpoint Notification (Prompt 4B Section 1) -->
          <div id="hud-checkpoint-saved" style="
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 18px;
            font-weight: 500;
            color: #ffffff;
            text-shadow: 0 2px 10px rgba(0,0,0,0.85);
            letter-spacing: 0.05em;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.4s ease;
          ">Progress saved</div>

          <!-- Minimal Objective Line Pill (auto-fading after 3.5s) -->
          <div id="hud-objective-pill" style="
            font-size: 12px;
            color: var(--fog, #d9d3a2);
            background: rgba(8, 6, 3, 0.85);
            border: 1px solid rgba(217, 211, 162, 0.22);
            padding: 4px 12px;
            border-radius: 12px;
            letter-spacing: 0.05em;
            white-space: nowrap;
            max-width: min(90vw, 520px);
            overflow: hidden;
            text-overflow: ellipsis;
            text-align: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.6);
            opacity: 0;
            transition: opacity 0.5s ease-out;
          ">
            <span id="hud-objective-text">Find the numbered pillars. Avoid making splashes.</span>
          </div>

          <!-- Quiet In-World Hint -->
          <div id="hud-quiet-hint" style="
            font-family: var(--bs-font-mono, monospace);
            font-size: 12px;
            color: rgba(242, 236, 220, 0.92);
            letter-spacing: 0.12em;
            text-transform: uppercase;
            pointer-events: none;
            opacity: 0;
            display: none;
            transition: opacity 1.5s ease;
            text-align: center;
            white-space: nowrap;
            text-shadow: 0 2px 8px rgba(0,0,0,0.85);
          "></div>
        </div>

        <!-- Row 2 (bottom: 58px): Control prompt (font-size: 12.5px, color: #ffffff) -->
        <!-- Row 3 (bottom: 12px): The 44px x 44px square pebble slot box (#hotbar-slot-1) -->
        <div id="hud-throwable-hotbar" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          pointer-events: none;
        ">
          <div id="hud-throwable-hint" style="
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 12.5px;
            font-weight: 400;
            color: #ffffff;
            text-shadow: 0 1px 4px rgba(0,0,0,0.85), 0 2px 8px rgba(0,0,0,0.7);
            letter-spacing: 0.03em;
            white-space: nowrap;
          ">1-9 pick • again to put away • CLICK to throw / push</div>

          <div style="display: flex; gap: 8px;">
            <div id="hotbar-slot-1" style="
              width: 44px;
              height: 44px;
              background: rgba(0, 0, 0, 0.45);
              border: 1.5px solid rgba(255, 255, 255, 0.6);
              border-radius: 4px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.5);
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              position: relative;
              box-sizing: border-box;
            ">
              <div id="hud-slot-1" style="
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                position: relative;
                box-sizing: border-box;
                border-radius: 3px;
              ">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="opacity: 0.95;">
                  <ellipse cx="12" cy="13" rx="7" ry="5" fill="#757575" stroke="#ffffff" stroke-width="1.5"/>
                </svg>
                <span id="hud-pebble-count" style="
                  position: absolute;
                  bottom: 2px;
                  right: 5px;
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  font-size: 12px;
                  font-weight: bold;
                  color: #ffffff;
                  text-shadow: 0 1px 3px #000;
                ">2</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Persistent Ping Control Hint -->
      <div id="hud-ping-hint" style="
        position: absolute;
        bottom: max(20px, env(safe-area-inset-bottom, 20px));
        right: max(20px, env(safe-area-inset-right, 20px));
        font-size: 11px;
        color: var(--fog, #d9d3a2);
        opacity: 0.75;
        letter-spacing: 0.08em;
        background: rgba(8, 6, 3, 0.7);
        padding: 4px 8px;
        border-radius: 3px;
        border: 1px solid rgba(217, 211, 162, 0.2);
        pointer-events: none;
        z-index: 20;
      ">[V] MARK LOCATION</div>

      <!-- Debug Sighting Line (only visible with ?debug=1) -->
      <div id="hud-debug-sighting" style="
        position: absolute;
        bottom: 8px;
        left: 8px;
        font-family: monospace;
        font-size: 11px;
        color: #00e5ff;
        background: rgba(0,0,0,0.6);
        padding: 2px 6px;
        border-radius: 3px;
        pointer-events: none;
        display: none;
        z-index: 999;
      "></div>

      <!-- Pointer Lock Hint: single small centered line shown only while pointer unlocked -->
      <div id="hud-pointer-lock-hint" style="
        position: absolute;
        bottom: max(22px, env(safe-area-inset-bottom, 22px));
        left: 50%;
        transform: translateX(-50%);
        font-family: var(--bs-font-mono, monospace);
        font-size: 11px;
        letter-spacing: 0.12em;
        color: rgba(238, 222, 194, 0.65);
        pointer-events: none;
        opacity: 0;
        display: none;
        transition: opacity 0.25s ease;
        text-transform: uppercase;
        white-space: nowrap;
        z-index: 55;
      ">[ Click to lock mouse look ]</div>
    `;

    container.appendChild(el);
    this.el = el;
    this.updateFacecamOverlayVisibility();

    this.screenReaderLiveEl = el.querySelector('#hud-screen-reader-live');
    this.debugSightingEl = el.querySelector('#hud-debug-sighting');
    this.nearMissEl = el.querySelector('#hud-near-miss');
    this.pointerLockHintEl = el.querySelector('#hud-pointer-lock-hint');
    this.bottomStackEl = el.querySelector('#hud-bottom-stack');
    this.objectivePillEl = el.querySelector('#hud-objective-pill');
    this.objectivePillTextEl = el.querySelector('#hud-objective-text');
    this.minimalNoiseFillEl = el.querySelector('#hud-noise-minimal-fill');
    this.minimalNoiseRadiusEl = el.querySelector('#hud-noise-minimal-radius');
    this.compassArcEl = el.querySelector('#hud-compass-arc');
    this.compassNotchEl = el.querySelector('#hud-compass-notch');
    this.compassTextEl = el.querySelector('#hud-compass-text');
    this.quietHintEl = el.querySelector('#hud-quiet-hint');
    this.noiseBarEl = el.querySelector('#hud-noise-bar');
    this.noiseIconEl = el.querySelector('#hud-noise-icon');
    this.noiseRadiusLabelEl = el.querySelector('#hud-noise-radius-label');
    this.waterRadiusRingEl = el.querySelector('#hud-water-radius-ring');
    this.staminaBarEl = el.querySelector('#hud-stamina-bar');
    this.statusChipEl = el.querySelector('#hud-status');
    this.objectiveEl = el.querySelector('#hud-objective');
    this.sectorTitleEl = el.querySelector('#hud-sector-title');
    this.checklistEl = el.querySelector('#hud-checklist');
    this.riskTagEl = el.querySelector('#hud-risk-tag');
    this.promptEl = el.querySelector('#hud-prompt');
    this.promptRingSvgEl = el.querySelector('#hud-prompt-ring');
    this.promptRingFillEl = el.querySelector('#hud-prompt-ring-fill');
    this.promptTextEl = el.querySelector('#hud-prompt-text');
    this.notebookEl = el.querySelector('#hud-notebook');
    this.captionEl = el.querySelector('#hud-caption');
    this.vignetteEl = el.querySelector('#hud-vignette');
    this.vhsOsdEl = el.querySelector('#hud-vhs-osd');

    this.inventoryEl = el.querySelector('#hud-inventory-strip');
    this.flashlightEl = el.querySelector('#hud-flashlight-meter');
    this.batteryBarEl = el.querySelector('#hud-battery-bar');
    this.batteryPctEl = el.querySelector('#hud-battery-pct');
    this.levelShiftEl = el.querySelector('#hud-level-shift');
    this.levelBorderEl = el.querySelector('#hud-level-border');
    this.hazardAlertEl = el.querySelector('#hud-hazard-alert');
    this.generatorStatusEl = el.querySelector('#hud-generator-status');

    this.perchChipEl = el.querySelector('#hud-perch-chip');
    this.schoolStatusEl = el.querySelector('#hud-school-status');
    this.jungleStatusEl = el.querySelector('#hud-jungle-status');
    this.neonStatusEl = el.querySelector('#hud-neon-status');
    this.metroStatusEl = el.querySelector('#hud-metro-status');

    this.rosterEl = el.querySelector('#hud-roster');
    this.spectatorContainerEl = el.querySelector('#hud-spectator-container');
    this.spectatorNameEl = el.querySelector('#hud-spectator-name');

    // Batch 4 Prompt 4B Elements
    this.runTimerEl = el.querySelector('#hud-run-timer');
    this.reticleEl = el.querySelector('#hud-reticle');
    this.minimalNoiseEl = el.querySelector('#hud-noise-minimal');
    this.checkpointSavedEl = el.querySelector('#hud-checkpoint-saved');
    this.throwableHotbarEl = el.querySelector('#hud-throwable-hotbar');

    // Prompt 7 Elements
    this.warningCaptionEl = el.querySelector('#hud-warning-caption');
    this.workOrderCardEl = el.querySelector('#hud-work-order-card');
    this.workOrderAuthorityEl = el.querySelector('#hud-work-order-authority');
    this.workOrderTitleEl = el.querySelector('#hud-work-order-title');
    this.workOrderTasksEl = el.querySelector('#hud-work-order-tasks');
    this.workOrderSkipEl = el.querySelector('#hud-work-order-skip');
    this.threeRulesEl = el.querySelector('#hud-three-rules');
    this.rule1El = el.querySelector('#hud-rule-1');
    this.rule2El = el.querySelector('#hud-rule-2');
    this.rule3El = el.querySelector('#hud-rule-3');
    this.promptVerbEl = el.querySelector('#hud-prompt-verb');
    this.promptQualifierEl = el.querySelector('#hud-prompt-qualifier');
    this.cellChipEl = el.querySelector('#hud-cell-chip');
    this.cellCounterEl = el.querySelector('#hud-cell-counter');

    // Default zero-HUD presentation matching reference video
    if (!this.showMoreHud && !this.streamerMode) {
      if (this.runTimerEl) this.runTimerEl.style.display = 'none';
      if (this.reticleEl) this.reticleEl.style.display = 'none';
      if (this.throwableHotbarEl) this.throwableHotbarEl.style.display = 'none';
      if (this.minimalNoiseEl) this.minimalNoiseEl.style.display = 'none';
      if (this.pointerLockHintEl) this.pointerLockHintEl.style.display = 'none';
    }
    this.throwableHintEl = el.querySelector('#hud-throwable-hint');
    if (typeof localStorage !== 'undefined') {
      try {
        if (localStorage.getItem('backsilence_throwable_hint_used')) {
          if (this.throwableHintEl) this.throwableHintEl.style.display = 'none';
        }
      } catch {
        /* ignore */
      }
    }
    this.pebbleCountEl = el.querySelector('#hud-pebble-count');
    this.slot1El = el.querySelector('#hud-slot-1');
    this.hotbarSlot1El = el.querySelector('#hotbar-slot-1');
    if (this.objectivePillEl) {
      this.objectivePillEl.style.opacity = '1';
      if (this.objectivePillFadeTimer !== null) {
        clearTimeout(this.objectivePillFadeTimer);
      }
      this.objectivePillFadeTimer = setTimeout(() => {
        if (this.objectivePillEl) {
          this.objectivePillEl.style.opacity = '0';
        }
        this.objectivePillFadeTimer = null;
      }, 3500);
    }
    this.sectorToastEl = el.querySelector('#hud-sector-toast');

    el.querySelector('#btn-spectate-prev')?.addEventListener('click', () => {
      this.onSpectatorCyclePrevCallback?.();
    });
    el.querySelector('#btn-spectate-next')?.addEventListener('click', () => {
      this.onSpectatorCycleNextCallback?.();
    });
    el.querySelector('#btn-spectate-freeroam')?.addEventListener('click', () => {
      this.onSpectatorFreeRoamCallback?.();
    });
    el.querySelector('#btn-spectate-leave')?.addEventListener('click', () => {
      this.onSpectatorLeaveCallback?.();
    });

    this.inventoryEl?.addEventListener('click', () => {
      if (this.onCycleInventoryCallback) {
        this.onCycleInventoryCallback();
      }
    });
  }

  private currentData: HudData = {
    noiseLoudness: 0,
    stamina: 1,
    status: 'DRY',
    objective: '',
    interactionPrompt: null,
    notebookNumbers: [],
    soundVisualizerCaption: null,
    damageVignette: 0,
    vhsTime: 'REC ● 00:00:00',
    showVhsOsd: false,
  };

  update(incoming: Partial<HudData>): void {
    if (!this.el) return;
    this.currentData = { ...this.currentData, ...incoming };
    const data = this.currentData;

    // Debug sighting line (only visible with ?debug=1)
    if (this.debugSightingEl) {
      const isDebug = typeof location !== 'undefined' && (location.search.includes('debug=1') || location.search.includes('debug=true'));
      if (isDebug) {
        this.debugSightingEl.style.display = 'block';
        const sCount = data.sightings ?? 0;
        const lastT = data.lastSightingTime !== undefined && data.lastSightingTime > 0 ? `${data.lastSightingTime.toFixed(1)} s` : 'n/a';
        const vf = (data.visFrac ?? 0).toFixed(2);
        this.debugSightingEl.textContent = `sightings: ${sCount}, last: ${lastT}, visFrac: ${vf}`;
      } else {
        this.debugSightingEl.style.display = 'none';
      }
    }

    // 1. Noise Meter update (Color-blind safe palette + Numeric Ticks + Water Noise Radius)
    const loudnessPct = Math.min(100, Math.max(0, data.noiseLoudness * 100));
    const noiseColor = data.noiseLoudness < 0.35 ? '#00e5ff' : data.noiseLoudness < 0.75 ? '#ffb300' : '#ff1744';

    if (this.noiseBarEl) {
      this.noiseBarEl.style.width = `${loudnessPct}%`;
      this.noiseBarEl.style.background = noiseColor;
    }

    if (this.noiseIconEl) {
      this.noiseIconEl.style.color = noiseColor;
      if (data.noiseLoudness >= 0.75) {
        this.noiseIconEl.style.transform = 'scale(1.25)';
      } else if (data.noiseLoudness >= 0.35) {
        this.noiseIconEl.style.transform = 'scale(1.1)';
      } else {
        this.noiseIconEl.style.transform = 'scale(1.0)';
      }
    }

    if (this.waterRadiusRingEl) {
      this.waterRadiusRingEl.style.color = noiseColor;
      this.waterRadiusRingEl.style.opacity = String(Math.max(0.35, Math.min(1.0, data.noiseLoudness * 1.5)));
    }

    if (this.noiseRadiusLabelEl) {
      const radiusM = data.waterNoiseRadius !== undefined && data.waterNoiseRadius !== null
        ? Math.round(data.waterNoiseRadius)
        : Math.round(data.noiseLoudness * 40);
      this.noiseRadiusLabelEl.textContent = `RADIUS ~${radiusM}m`;
      this.noiseRadiusLabelEl.style.color = noiseColor;
    }

    // 1b. Minimal Noise Indicator (220x6 px, cream -> amber -> red)
    if (this.minimalNoiseEl) {
      if (this.currentHudStyle === 'hidden') {
        this.minimalNoiseEl.style.display = 'none';
      } else if (data.noiseLoudness > 0 || this.showMoreHud || this.streamerMode) {
        this.minimalNoiseEl.style.display = 'flex';
      } else {
        this.minimalNoiseEl.style.display = 'none';
      }
    }
    if (this.minimalNoiseFillEl) {
      this.minimalNoiseFillEl.style.width = `${loudnessPct}%`;
      const minColor = data.noiseLoudness < 0.35 ? '#eedec2' : data.noiseLoudness < 0.75 ? '#e5c158' : '#ff3b30';
      this.minimalNoiseFillEl.style.backgroundColor = minColor;
    }
    if (this.minimalNoiseRadiusEl) {
      const radiusM = data.waterNoiseRadius !== undefined && data.waterNoiseRadius !== null
        ? Math.round(data.waterNoiseRadius)
        : Math.round(data.noiseLoudness * 40);
      const minColor = data.noiseLoudness < 0.35 ? '#eedec2' : data.noiseLoudness < 0.75 ? '#e5c158' : '#ff3b30';
      this.minimalNoiseRadiusEl.textContent = `RADIUS ~${radiusM}m`;
      this.minimalNoiseRadiusEl.style.color = minColor;
    }

    // 2. Stamina Bar
    if (this.staminaBarEl) {
      this.staminaBarEl.style.width = `${Math.round(data.stamina * 100)}%`;
    }

    // 3. Status Chip & Screen Reader Announcement
    if (this.statusChipEl) {
      this.statusChipEl.textContent = data.status;
      if (data.status === 'EXHAUSTED') {
        this.statusChipEl.style.borderColor = '#ff1744';
        this.statusChipEl.style.color = '#ff5252';
        this.statusChipEl.style.background = 'rgba(255,23,68,0.2)';
      } else if (data.status === 'WET') {
        this.statusChipEl.style.borderColor = '#00e5ff';
        this.statusChipEl.style.color = '#00e5ff';
        this.statusChipEl.style.background = 'rgba(0,229,255,0.2)';
      } else if (data.status === 'CROUCHED') {
        this.statusChipEl.style.borderColor = '#ffd54f';
        this.statusChipEl.style.color = '#ffd54f';
        this.statusChipEl.style.background = 'rgba(255,213,79,0.2)';
      } else {
        this.statusChipEl.style.borderColor = '#86cfa0';
        this.statusChipEl.style.color = '#86cfa0';
        this.statusChipEl.style.background = 'rgba(134,207,160,0.2)';
      }

      if (data.status !== this.lastAnnouncedStatus) {
        this.lastAnnouncedStatus = data.status;
        let desc = 'Dry ground';
        if (data.status === 'WET') desc = 'Wading in water. Splashes will alert monsters.';
        else if (data.status === 'CROUCHED') desc = 'Crouched. Movement noise is quieted.';
        else if (data.status === 'EXHAUSTED') desc = 'Exhausted. Cannot sprint.';
        this.announceToScreenReader(`Status: ${data.status} — ${desc}`);
      }
    }

    // 4. Objective with Risk Tag & Screen Reader Announcement
    if (data.objective) {
      if (this.objectiveEl) {
        this.objectiveEl.textContent = data.objective;
      }
      if (this.objectivePillTextEl) {
        this.objectivePillTextEl.textContent = data.objective;
      }
      if (this.objectivePillEl) {
        this.objectivePillEl.style.opacity = '1';
        if (this.objectivePillFadeTimer !== null) {
          clearTimeout(this.objectivePillFadeTimer);
        }
        this.objectivePillFadeTimer = setTimeout(() => {
          if (this.objectivePillEl) {
            this.objectivePillEl.style.opacity = '0';
          }
          this.objectivePillFadeTimer = null;
        }, 3500);
      }

      if (this.riskTagEl) {
        let tag = data.riskTag;
        if (!tag) {
          const lower = data.objective.toLowerCase();
          if (lower.includes('escape') || lower.includes('exit') || lower.includes('gate opened') || lower.includes('unlocked')) {
            tag = 'ESCAPE';
          } else if (lower.includes('timed') || lower.includes('shift') || lower.includes('countdown') || lower.includes('departure') || lower.includes('blast doors')) {
            tag = 'TIMED';
          } else if (lower.includes('surge') || lower.includes('alarm') || lower.includes('loud') || lower.includes('siren') || lower.includes('train')) {
            tag = 'LOUD';
          } else {
            tag = 'QUIET';
          }
        }

        this.riskTagEl.textContent = `[${tag}]`;
        this.riskTagEl.className = `hud-risk-${tag.toLowerCase()}`;
      }

      if (data.objective !== this.lastAnnouncedObjective) {
        this.lastAnnouncedObjective = data.objective;
        this.announceToScreenReader(`New Objective: ${data.objective}`);
      }
    }

    if (data.sectorTitle) {
      if (this.sectorTitleEl) {
        this.sectorTitleEl.textContent = data.sectorTitle;
      }
      if (data.sectorTitle !== this.lastSectorTitle) {
        this.lastSectorTitle = data.sectorTitle;
        this.showSectorToast(data.sectorTitle);
      }
    }

    if (this.checklistEl) {
      if (data.checklist && data.checklist.length > 0) {
        this.checklistEl.style.display = 'flex';
        this.checklistEl.innerHTML = data.checklist
          .map((item) => {
            if (item.done) {
              return `<div style="font-size: 11px; color: #86cfa0; opacity: 0.8; text-decoration: line-through;">[✓] ${item.text}</div>`;
            }
            const dist = item.distanceM !== undefined && item.distanceM !== null ? ` <span style="color: #ffb000; font-family: monospace;">(${item.distanceM}m)</span>` : '';
            return `<div style="font-size: 11px; color: #fff4d0; font-weight: 500;">[ ] ${item.text}${dist}</div>`;
          })
          .join('');
      } else {
        this.checklistEl.style.display = 'none';
      }
    }

    // 4a. Interaction Prompt & Circular Hold Ring (Two-Line Grammar)
    if (this.promptEl) {
      if (data.interactionPrompt) {
        this.promptEl.style.display = 'flex';
        let verb = data.interactionPrompt;
        let qualifier = '';

        if (data.interactionPrompt.includes(' — ')) {
          const parts = data.interactionPrompt.split(' — ');
          verb = parts[0]?.trim() ?? '';
          qualifier = parts.slice(1).join(' — ').trim();
        } else if (data.interactionPrompt.includes(' - ')) {
          const parts = data.interactionPrompt.split(' - ');
          verb = parts[0]?.trim() ?? '';
          qualifier = parts.slice(1).join(' - ').trim();
        }

        if (this.promptVerbEl) {
          this.promptVerbEl.textContent = verb;
          if (this.promptQualifierEl) {
            if (qualifier) {
              this.promptQualifierEl.textContent = qualifier;
              this.promptQualifierEl.style.display = 'block';
            } else {
              this.promptQualifierEl.style.display = 'none';
            }
          }
        } else if (this.promptTextEl) {
          this.promptTextEl.textContent = data.interactionPrompt;
        } else {
          this.promptEl.textContent = data.interactionPrompt;
        }

        const hasProgress = data.promptHoldProgress !== undefined && data.promptHoldProgress !== null;
        const isHolding = hasProgress && data.promptHoldProgress! >= 0;
        const requiresHold = data.interactionPrompt.toUpperCase().includes('HOLD') || data.interactionPrompt.toUpperCase().includes('CRANK');

        if (this.promptRingSvgEl && (isHolding || requiresHold)) {
          this.promptRingSvgEl.style.display = 'block';
          if (this.promptRingFillEl) {
            const circ = 62.83; // 2 * pi * 10
            const progress = hasProgress ? Math.max(0, Math.min(1, data.promptHoldProgress!)) : 0;
            this.promptRingFillEl.style.strokeDashoffset = String(circ * (1 - progress));
          }
        } else if (this.promptRingSvgEl) {
          this.promptRingSvgEl.style.display = 'none';
        }
      } else {
        this.promptEl.style.display = 'none';
      }
    }

    // 4a-2. Teaching Warning Caption & Work Order Card
    if (data.warningCaption !== undefined) {
      if (typeof data.warningCaption === 'string') {
        this.showWarningCaption(true, data.warningCaption);
      } else {
        this.showWarningCaption(Boolean(data.warningCaption));
      }
    }
    if (data.workOrderState !== undefined && data.workOrderState !== null) {
      this.setWorkOrderCard(data.workOrderState);
    }

    // 4a-3. Chlorine Cell Counter Chip
    if (data.showCellChip !== undefined && this.cellChipEl) {
      this.cellChipEl.style.display = data.showCellChip ? 'flex' : 'none';
    }
    if (data.chlorineCells !== undefined && this.cellCounterEl) {
      this.cellCounterEl.textContent = `${data.chlorineCells}/7`;
      if (this.cellChipEl && data.showCellChip === undefined) {
        this.cellChipEl.style.display = 'flex';
      }
    }

    // 4b. Pointer Lock Hint
    if (this.pointerLockHintEl) {
      this.pointerLockHintEl.style.opacity = data.pointerLockHint ? '0.85' : '0';
      this.pointerLockHintEl.style.display = data.pointerLockHint ? 'block' : 'none';
    }

    // 5. Notebook sequence strip
    const notebookContainer = this.el.querySelector<HTMLElement>('#hud-notebook-container');
    if (notebookContainer) {
      notebookContainer.style.display = 'flex';
      if (this.notebookEl) {
        if (data.notebookNumbers && data.notebookNumbers.length > 0) {
          this.notebookEl.textContent = data.notebookNumbers.join(' · ');
        } else {
          this.notebookEl.textContent = '#1: ? · #2: ? · #3: ? · #4: ?';
        }
      }
    }

    // 5b. Diegetic Objective Indicator (Compass Arc)
    if (this.compassArcEl) {
      if (data.objectiveIndicator && data.objectiveIndicator.visible && !data.minimalHud) {
        this.compassArcEl.style.display = 'flex';
        if (this.compassNotchEl) {
          const clampedAngle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, data.objectiveIndicator.angleRad));
          const notchX = 60 + (clampedAngle / (Math.PI / 2)) * 45;
          this.compassNotchEl.setAttribute('transform', `translate(${notchX.toFixed(1)}, 9)`);
        }
        if (this.compassTextEl) {
          this.compassTextEl.textContent = `${data.objectiveIndicator.label} · ${data.objectiveIndicator.distanceMeters}m`;
        }
      } else {
        this.compassArcEl.style.display = 'none';
      }
    }

    // 6. Sound visualizer caption
    if (this.captionEl) {
      if (data.soundVisualizerCaption) {
        this.captionEl.textContent = data.soundVisualizerCaption;
        this.captionEl.style.display = 'block';
      } else if (this.captionStack.length === 0) {
        this.captionEl.style.display = 'none';
      }
    }

    // 7. Damage Vignette
    if (this.vignetteEl) {
      const dmg = typeof data.damageVignette === 'number' && Number.isFinite(data.damageVignette) ? data.damageVignette : 0;
      if (dmg >= 0.1) {
        this.vignetteEl.style.display = 'block';
        this.vignetteEl.style.opacity = String(dmg);
      } else {
        this.vignetteEl.style.display = 'none';
        this.vignetteEl.style.opacity = '0';
      }
    }

    // 8. VHS OSD
    if (this.vhsOsdEl) {
      this.vhsOsdEl.style.display = data.showVhsOsd === false ? 'none' : 'block';
    }
    if (data.vhsOsdState) {
      const timeSpan = this.el?.querySelector('#vhs-timestamp');
      if (timeSpan) timeSpan.textContent = data.vhsOsdState.timestamp;
      const recDot = this.el?.querySelector<HTMLElement>('#vhs-rec-dot');
      if (recDot) recDot.style.opacity = data.vhsOsdState.recBlink ? '1.0' : '0.1';
      const playMode = this.el?.querySelector('#vhs-play-mode');
      if (playMode) {
        switch (data.vhsOsdState.mode) {
          case 'REW':
            playMode.textContent = '◀◀ REW';
            break;
          case 'EJECT':
            playMode.textContent = '⏏ EJECT';
            break;
          case 'TRACKING':
            playMode.textContent = 'TRACKING…';
            break;
          case 'SIGNAL_LOST':
            playMode.textContent = 'SIGNAL LOST';
            break;
          default:
            playMode.textContent = 'PLAY ▶';
            break;
        }
      }
    } else if (data.vhsTime) {
      const timeSpan = this.el?.querySelector('#vhs-timestamp');
      if (timeSpan) timeSpan.textContent = data.vhsTime;
    }

    // 9. Inventory Strip Update
    if (this.inventoryEl) {
      if (data.inventory && data.inventory.length > 0) {
        this.inventoryEl.style.display = 'flex';
        const activeIdx = data.selectedItemIndex ?? 0;
        this.inventoryEl.innerHTML = data.inventory
          .map((item, idx) => {
            const isSelected = idx === activeIdx;
            const label = item.kind.replace('_', ' ').toUpperCase();
            return `
              <div style="
                padding: 4px 8px;
                border: 1px solid ${isSelected ? 'var(--water, #86cfa0)' : 'rgba(217,211,162,0.2)'};
                background: ${isSelected ? 'rgba(134,207,160,0.15)' : 'transparent'};
                color: ${isSelected ? 'var(--water, #86cfa0)' : 'var(--fog, #d9d3a2)'};
                font-size: 11px;
                border-radius: 2px;
                display: flex;
                gap: 6px;
                align-items: center;
              ">
                <span>${label}</span>
                <span style="font-weight: bold; opacity: 0.8;">x${item.count}</span>
              </div>
            `;
          })
          .join('');
      } else {
        this.inventoryEl.style.display = 'none';
      }
    }

    // 10. Flashlight Battery Update
    if (this.flashlightEl) {
      if (data.flashlight) {
        this.flashlightEl.style.display = 'flex';
        const pct = Math.round(data.flashlight.battery * 100);
        if (this.batteryPctEl) this.batteryPctEl.textContent = `${pct}%`;
        if (this.batteryBarEl) {
          this.batteryBarEl.style.width = `${pct}%`;
          if (pct < 15) {
            this.batteryBarEl.style.background = 'var(--danger, #b3261e)';
          } else {
            this.batteryBarEl.style.background = 'var(--water, #86cfa0)';
          }
        }
      } else {
        this.flashlightEl.style.display = 'none';
      }
    }

    // 11. Level Shift Timer Update (Map 4)
    if (this.levelShiftEl) {
      if (data.levelShift) {
        this.levelShiftEl.style.display = 'flex';
        const timerText = this.el.querySelector<HTMLElement>('#hud-level-timer-text');
        if (timerText) {
          const s = Math.ceil(data.levelShift.timeRemaining);
          const pUpper = data.levelShift.phase.toUpperCase();
          const icon = pUpper === 'RISE' ? '▲ RISING' : pUpper === 'FALL' ? '▼ FALLING' : pUpper;
          timerText.textContent = `${icon} 0:${String(s).padStart(2, '0')}`;
          timerText.style.color = data.levelShift.warning ? '#ff3b30' : 'var(--water, #86cfa0)';
        }
        if (this.levelBorderEl) {
          this.levelBorderEl.style.opacity = data.levelShift.warning ? '1' : '0';
        }
      } else {
        this.levelShiftEl.style.display = 'none';
        if (this.levelBorderEl) this.levelBorderEl.style.opacity = '0';
      }
    }

    // 12. Hazard Alert (Sinking Platform, Steam Burst, Chair Tipping, Drone Lock, Ghost Train)
    if (this.hazardAlertEl) {
      if (data.wobblyChairWarning?.tipping) {
        this.hazardAlertEl.style.display = 'block';
        this.hazardAlertEl.style.background = 'rgba(216,179,106,0.9)';
        this.hazardAlertEl.style.border = '1px solid #ffeb3b';
        this.hazardAlertEl.style.color = '#000000';
        this.hazardAlertEl.textContent = `⚠ CHAIR TIPPING (${data.wobblyChairWarning.timeRemaining.toFixed(1)}s) — JUMP!`;
      } else if (data.droneLockWarning?.locked) {
        this.hazardAlertEl.style.display = 'block';
        this.hazardAlertEl.style.background = 'rgba(255,59,48,0.9)';
        this.hazardAlertEl.style.border = '1px solid #ff3b30';
        this.hazardAlertEl.style.color = '#ffffff';
        this.hazardAlertEl.textContent = '⚠ DRONE SEARCHLIGHT LOCK — SIREN ACTIVE';
      } else if (data.ghostTrainSchedule?.active) {
        this.hazardAlertEl.style.display = 'block';
        this.hazardAlertEl.style.background = 'rgba(179,38,30,0.95)';
        this.hazardAlertEl.style.border = '1px solid #ff3b30';
        this.hazardAlertEl.style.color = '#ffffff';
        this.hazardAlertEl.textContent = '⚡ GHOST TRAIN KILL ZONE ACTIVE — STAY IN REFUGES! ⚡';
      } else if (data.sinkingWarning) {
        this.hazardAlertEl.style.display = 'block';
        this.hazardAlertEl.style.background = 'rgba(179,38,30,0.85)';
        this.hazardAlertEl.style.border = '1px solid #ff3b30';
        this.hazardAlertEl.style.color = '#ffffff';
        this.hazardAlertEl.textContent = '⚠ PLATFORM SINKING — MOVE';
      } else if (data.steamWarning) {
        this.hazardAlertEl.style.display = 'block';
        this.hazardAlertEl.style.background = 'rgba(134,207,160,0.85)';
        this.hazardAlertEl.style.border = '1px solid #86cfa0';
        this.hazardAlertEl.style.color = '#000000';
        this.hazardAlertEl.textContent = '☁ STEAM BURST ZONE (ACOUSTIC MASK ACTIVE)';
      } else {
        this.hazardAlertEl.style.display = 'none';
      }
    }

    // 13. Generator Status (Map 5)
    if (this.generatorStatusEl) {
      if (data.generatorStatus && data.generatorStatus.length > 0) {
        this.generatorStatusEl.style.display = 'flex';
        const genText = this.el.querySelector('#hud-generator-text');
        if (genText) {
          genText.innerHTML = data.generatorStatus
            .map((g) => {
              const dot = g.running ? '●' : '○';
              const color = g.running ? '#86cfa0' : '#888888';
              const rem = g.running ? ` (${Math.ceil(g.remaining)}s)` : '';
              return `<span style="color: ${color};">${g.id.toUpperCase()} ${dot}${rem}</span>`;
            })
            .join('&nbsp;&nbsp;');
        }
        const blastEl = this.el.querySelector<HTMLElement>('#hud-blastdoors-text');
        if (blastEl) {
          if (data.blastDoorsRemaining !== undefined && data.blastDoorsRemaining !== null && data.blastDoorsRemaining > 0) {
            blastEl.style.display = 'block';
            blastEl.textContent = `Blast doors opening in: ${data.blastDoorsRemaining.toFixed(1)}s`;
          } else {
            blastEl.style.display = 'none';
          }
        }
      } else {
        this.generatorStatusEl.style.display = 'none';
      }
    }

    // 14. Multiplayer Roster HUD
    if (this.rosterEl) {
      if (data.roster && data.roster.length > 0) {
        this.rosterEl.style.display = 'flex';
        const listEl = this.rosterEl.querySelector('#hud-roster-list');
        if (listEl) {
          listEl.innerHTML = '';
          for (const member of data.roster) {
            const item = document.createElement('div');
            item.style.cssText = `
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 11px;
              gap: 8px;
              padding: 2px 4px;
              border-radius: 2px;
              transition: background 0.15s ease;
            `;

            if (member.noiseSpike) {
              item.style.background = 'rgba(216, 179, 106, 0.3)';
              item.style.boxShadow = '0 0 6px rgba(216, 179, 106, 0.4)';
            }

            const left = document.createElement('div');
            left.style.display = 'flex';
            left.style.alignItems = 'center';
            left.style.gap = '6px';

            const statusDot = document.createElement('span');
            statusDot.style.fontSize = '9px';
            if (member.status === 'alive') {
              statusDot.textContent = '●';
              statusDot.style.color = 'var(--water, #86cfa0)';
            } else if (member.status === 'escaped') {
              statusDot.textContent = '✓';
              statusDot.style.color = '#86cfa0';
            } else if (member.status === 'dead') {
              statusDot.textContent = '✕';
              statusDot.style.color = 'var(--danger, #b3261e)';
            } else {
              statusDot.textContent = '▲';
              statusDot.style.color = '#d8b36a';
            }

            const nameSpan = document.createElement('span');
            nameSpan.textContent = member.name + (member.isLocal ? ' (You)' : '');
            nameSpan.style.opacity = member.status === 'dead' ? '0.5' : '1.0';

            left.appendChild(statusDot);
            left.appendChild(nameSpan);

            const right = document.createElement('div');
            right.style.fontSize = '9px';
            right.style.opacity = '0.6';
            if (member.pingMs !== undefined) {
              right.textContent = `${Math.round(member.pingMs)}ms`;
            }

            item.appendChild(left);
            item.appendChild(right);
            listEl.appendChild(item);
          }
        }
      } else {
        this.rosterEl.style.display = 'none';
      }
    }

    // 15. Spectator Banner & Controls
    if (this.spectatorContainerEl) {
      if (data.spectator?.active) {
        this.spectatorContainerEl.style.display = 'flex';
        if (this.spectatorNameEl) {
          this.spectatorNameEl.textContent =
            data.spectator.mode === 'freeroam'
              ? 'SPECTATING: FREE ROAM'
              : `SPECTATING: ${data.spectator.targetName}`;
        }
      } else {
        this.spectatorContainerEl.style.display = 'none';
      }
    }

    // 16. Perch Status Chip
    if (this.perchChipEl) {
      this.perchChipEl.style.display = data.isPerched ? 'inline-block' : 'none';
    }

    // 17. Schoolhouse Flood Level & PA Status
    if (this.schoolStatusEl) {
      if (data.tideLevel !== undefined && data.tideLevel !== null) {
        this.schoolStatusEl.style.display = 'flex';
        const tideText = this.schoolStatusEl.querySelector<HTMLElement>('#hud-school-tide-text');
        if (tideText) {
          const sign = data.tideLevel >= 0 ? '+' : '';
          tideText.textContent = `TIDE ${sign}${data.tideLevel.toFixed(2)} m`;
        }
        const paText = this.schoolStatusEl.querySelector<HTMLElement>('#hud-school-pa-text');
        if (paText && data.paStatus) {
          const blocks = '■'.repeat(data.paStatus.charges) + '□'.repeat(data.paStatus.maxCharges - data.paStatus.charges);
          const cd = data.paStatus.cooldownRemaining > 0 ? ` (${Math.ceil(data.paStatus.cooldownRemaining)}s)` : ' READY';
          paText.textContent = `PA LURE: [${blocks}]${cd}`;
          paText.style.color = data.paStatus.charges > 0 ? 'var(--water, #86cfa0)' : '#d8b36a';
        }
      } else {
        this.schoolStatusEl.style.display = 'none';
      }
    }

    // 18. Jungle Sluice Gates & River Flow
    if (this.jungleStatusEl) {
      if (data.sluiceGatesRemaining !== undefined && data.sluiceGatesRemaining !== null) {
        this.jungleStatusEl.style.display = 'flex';
        const gatesText = this.jungleStatusEl.querySelector<HTMLElement>('#hud-jungle-gates-text');
        if (gatesText) {
          gatesText.textContent = `GATES ${3 - data.sluiceGatesRemaining}/3 ALIGNED`;
          gatesText.style.color = data.sluiceGatesRemaining === 0 ? 'var(--water, #86cfa0)' : '#d8b36a';
        }
        const flowText = this.jungleStatusEl.querySelector<HTMLElement>('#hud-jungle-flow-text');
        if (flowText && data.riverFlow) {
          flowText.textContent = `FLOW: ➔ ${data.riverFlow.speed.toFixed(1)} m/s`;
        }
        const faunaText = this.jungleStatusEl.querySelector<HTMLElement>('#hud-jungle-fauna-text');
        if (faunaText) {
          if (data.faunaHushState === 'hushed') {
            faunaText.textContent = 'FAUNA HUSH: SILENT (MONSTER NEAR)';
            faunaText.style.color = 'var(--danger, #b3261e)';
          } else if (data.faunaHushState === 'alert') {
            faunaText.textContent = 'FAUNA HUSH: THINNED';
            faunaText.style.color = '#ffeb3b';
          } else {
            faunaText.textContent = 'FAUNA HUSH: CHIRPING (SAFE)';
            faunaText.style.color = 'var(--water, #86cfa0)';
          }
        }
      } else {
        this.jungleStatusEl.style.display = 'none';
      }
    }

    // 19. Neon Flood District Grid & Storm Windows
    if (this.neonStatusEl) {
      if (data.uplinksRemaining !== undefined && data.uplinksRemaining !== null) {
        this.neonStatusEl.style.display = 'flex';
        const uplinksText = this.neonStatusEl.querySelector<HTMLElement>('#hud-neon-uplinks-text');
        if (uplinksText) {
          uplinksText.textContent = `UPLINKS ${3 - data.uplinksRemaining}/3 HACKED`;
          uplinksText.style.color = data.uplinksRemaining === 0 ? '#00e5ff' : '#d8b36a';
        }
        const stormText = this.neonStatusEl.querySelector<HTMLElement>('#hud-neon-storm-text');
        if (stormText && data.stormWindow) {
          if (data.stormWindow.active) {
            const rem = Math.ceil(data.stormWindow.timeRemaining);
            stormText.textContent = `STORM MASK: 0:${String(rem).padStart(2, '0')}`;
            stormText.style.color = '#00e5ff';
          } else {
            const next = Math.ceil(data.stormWindow.nextStormIn);
            stormText.textContent = `NEXT STORM: 0:${String(next).padStart(2, '0')}`;
            stormText.style.color = '#ffeb3b';
          }
        }
        const empText = this.neonStatusEl.querySelector<HTMLElement>('#hud-neon-emp-text');
        if (empText && data.empCount !== undefined && data.empCount !== null) {
          empText.textContent = `EMP CHARGES: x${data.empCount}`;
        }
      } else {
        this.neonStatusEl.style.display = 'none';
      }
    }

    // 20. Metro Express Track T2 & Ghost Train Schedule
    if (this.metroStatusEl) {
      if (data.ghostTrainSchedule) {
        this.metroStatusEl.style.display = 'flex';
        const trainText = this.metroStatusEl.querySelector<HTMLElement>('#hud-metro-train-text');
        if (trainText) {
          if (data.ghostTrainSchedule.active) {
            trainText.textContent = '⚡ TRAIN PASSING (KILL ZONE) ⚡';
            trainText.style.color = '#ff3b30';
          } else if (data.ghostTrainSchedule.warning) {
            const s = Math.ceil(data.ghostTrainSchedule.timeToTrain);
            trainText.textContent = `⚠ RUMBLE DETECTED: 0:${String(s).padStart(2, '0')} ⚠`;
            trainText.style.color = '#ffeb3b';
          } else {
            const s = Math.ceil(data.ghostTrainSchedule.timeToTrain);
            trainText.textContent = `GHOST TRAIN: 0:${String(s).padStart(2, '0')}`;
            trainText.style.color = 'var(--water, #86cfa0)';
          }
        }
        const bottleText = this.metroStatusEl.querySelector<HTMLElement>('#hud-metro-bottle-text');
        if (bottleText && data.bottleCount !== undefined && data.bottleCount !== null) {
          bottleText.textContent = `BOTTLES: x${data.bottleCount}`;
        }
        const departText = this.metroStatusEl.querySelector<HTMLElement>('#hud-metro-depart-text');
        if (departText) {
          if (data.boardingCountdown !== undefined && data.boardingCountdown !== null && data.boardingCountdown > 0) {
            departText.style.display = 'block';
            departText.textContent = `DEPARTURE: ${data.boardingCountdown.toFixed(1)}s`;
          } else {
            departText.style.display = 'none';
          }
        }
      } else {
        this.metroStatusEl.style.display = 'none';
      }
    }

    // 19. Run Timer, Pebble Hotbar, and Checkpoint Notification (Prompt 4B)
    if (data.runTimeMs !== undefined && this.runTimerEl) {
      this.runTimerEl.textContent = formatRunTimer(data.runTimeMs);
    }
    if (data.pebbleCount !== undefined && this.pebbleCountEl) {
      this.pebbleCountEl.textContent = String(Math.max(0, data.pebbleCount));
    }
    if (data.pebbleEquipped !== undefined) {
      const border = data.pebbleEquipped ? '#00e5ff' : 'rgba(255, 255, 255, 0.6)';
      const shadow = data.pebbleEquipped ? '0 0 10px rgba(0, 229, 255, 0.6)' : '0 2px 10px rgba(0,0,0,0.5)';
      if (this.slot1El) {
        this.slot1El.style.borderColor = border;
        this.slot1El.style.boxShadow = shadow;
      }
      if (this.hotbarSlot1El) {
        this.hotbarSlot1El.style.borderColor = border;
        this.hotbarSlot1El.style.boxShadow = shadow;
      }
      if (data.pebbleEquipped) {
        this.dismissThrowableHint();
      }
    }
    if (data.checkpointSaved) {
      this.showCheckpointSaved();
    }
  }

  private captionStack: { text: string; expires: number }[] = [];

  addCaption(text: string): void {
    const now = performance.now();
    this.captionStack.push({ text, expires: now + 2000 });
    if (this.captionStack.length > 3) {
      this.captionStack.shift();
    }
    this.renderCaptionStack();
  }

  private renderCaptionStack(): void {
    if (!this.captionEl) return;
    const now = performance.now();
    this.captionStack = this.captionStack.filter((c) => c.expires > now);

    if (this.captionStack.length > 0) {
      this.captionEl.innerHTML = this.captionStack
        .map((c) => `<div style="margin-bottom: 2px;">${c.text}</div>`)
        .join('');
      this.captionEl.style.display = 'block';
    } else {
      this.captionEl.style.display = 'none';
    }
  }

  flashDirectionArc(angleRad: number, _intensity = 1.0, reducedMotion = false): void {
    if (!this.el) return;
    const svgEl = this.el.querySelector<SVGElement>('#hud-sound-arc-svg');
    const pathEl = this.el.querySelector<SVGPathElement>('#hud-sound-arc-path');
    if (!svgEl || !pathEl) return;

    const r = 20;
    const cx = 24;
    const cy = 24;
    const halfSpan = Math.PI / 8; // 22.5 deg either side
    const a1 = angleRad - Math.PI / 2 - halfSpan;
    const a2 = angleRad - Math.PI / 2 + halfSpan;

    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy + r * Math.sin(a2);

    pathEl.setAttribute('d', `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`);
    svgEl.style.opacity = '1.0';

    if (reducedMotion) {
      setTimeout(() => {
        if (svgEl) svgEl.style.opacity = '0';
      }, 500);
    } else {
      setTimeout(() => {
        if (svgEl) svgEl.style.opacity = '0';
      }, 250);
    }
  }

  show(): void {
    if (this.el) this.el.style.display = 'block';
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none';
  }

  dispose(): void {
    if (this.el?.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}
