/* ── Hud.ts ───────────────────────────────────────────────────────────────
 *  In-game HUD overlay: reactive Noise Meter, stamina bar, status chips,
 *  notebook sequence strip, inventory strip, battery meter, level-shift timer,
 *  VHS OSD, interaction prompt, and directional sound captions.
 * ──────────────────────────────────────────────────────────────────────── */

import type { PostFXOsdState } from '../engine/PostFX.js';

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

export interface HudData {
  noiseLoudness: number; // 0..1
  stamina: number;       // 0..1
  status: 'DRY' | 'WET' | 'CROUCHED' | 'EXHAUSTED';
  objective: string;
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
  droneLockWarning?: { locked: boolean; angleDeg: number } | null;
  empCount?: number | null;

  ghostTrainSchedule?: { timeToTrain: number; trainDurationRemaining: number; active: boolean; warning: boolean } | null;
  boardingCountdown?: number | null;
  bottleCount?: number | null;
  pointerLockHint?: boolean | undefined;
}

export class Hud {
  private el: HTMLElement | null = null;
  private noiseBarEl: HTMLElement | null = null;
  private noiseIconEl: HTMLElement | null = null;
  private staminaBarEl: HTMLElement | null = null;
  private statusChipEl: HTMLElement | null = null;
  private objectiveEl: HTMLElement | null = null;
  private promptEl: HTMLElement | null = null;
  private notebookEl: HTMLElement | null = null;
  private captionEl: HTMLElement | null = null;
  private vignetteEl: HTMLElement | null = null;
  private vhsOsdEl: HTMLElement | null = null;
  private pointerLockHintEl: HTMLElement | null = null;

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
    `;

    el.innerHTML = `
      <!-- Red / Jumpscare Damage Vignette -->
      <div id="hud-vignette" style="
        position: absolute;
        inset: 0;
        background: radial-gradient(circle, transparent 50%, rgba(179,38,30,0.8) 100%);
        opacity: 0;
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

      <!-- Interaction Prompt -->
      <div id="hud-prompt" style="
        position: absolute;
        top: 55%;
        left: 50%;
        transform: translateX(-50%);
        font-size: 13px;
        color: var(--water, #86cfa0);
        background: rgba(13, 11, 6, 0.75);
        padding: 4px 10px;
        border: 1px solid rgba(134,207,160,0.3);
        border-radius: 3px;
        display: none;
      "></div>

      <!-- VHS OSD Elements -->
      <div id="hud-vhs-osd" style="display: block;">
        <div style="position: absolute; top: 24px; left: 24px; font-size: 13px; letter-spacing: 0.1em; display: flex; align-items: center; gap: 8px;">
          <span id="vhs-rec-dot" style="color: var(--danger, #b3261e); font-size: 16px;">●</span>
          <span id="vhs-rec-label">REC</span>
          <span id="vhs-timestamp" style="margin-left: 8px; opacity: 0.85;">AUG 14 1998  00:12:44</span>
        </div>
        <div style="position: absolute; top: 24px; right: 24px; font-size: 12px; opacity: 0.75; letter-spacing: 0.1em;">
          SP [■■■□] · BACKSILENCE
        </div>
        <div id="vhs-play-mode" style="position: absolute; bottom: 24px; left: 24px; font-size: 12px; opacity: 0.75; letter-spacing: 0.1em;">
          PLAY ▶
        </div>
      </div>

      <!-- Top-Right Notebook Sequence Strip -->
      <div id="hud-notebook-container" style="position: absolute; top: 56px; right: 24px; display: none; flex-direction: column; align-items: flex-end; gap: 4px;">
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
        top: 56px;
        right: 24px;
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
        top: 56px;
        right: 24px;
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
        top: 56px;
        right: 24px;
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
        top: 56px;
        right: 24px;
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
        top: 56px;
        right: 24px;
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
        top: 56px;
        right: 24px;
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

      <!-- Top-Center Objective Line -->
      <div id="hud-objective" style="
        position: absolute;
        top: 24px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 12px;
        background: rgba(13, 11, 6, 0.7);
        border: 1px solid rgba(217, 211, 162, 0.2);
        padding: 5px 14px;
        border-radius: 12px;
        color: var(--fog, #d9d3a2);
        letter-spacing: 0.05em;
        white-space: nowrap;
      ">Find the numbered pillars. Avoid making splashes.</div>

      <!-- Hazard / Mask Alert Icon (Map 2 steam / Map 3 sinking) -->
      <div id="hud-hazard-alert" style="
        position: absolute;
        top: 60px;
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
        top: 24px;
        right: 24px;
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
        top: 60px;
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
        bottom: 28px;
        left: 24px;
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

      <!-- Bottom-Center: The Acoustic Noise Meter & Stamina -->
      <div style="
        position: absolute;
        bottom: 28px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
      ">
        <!-- Status & Stamina -->
        <div style="display: flex; align-items: center; gap: 12px; width: 220px; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span id="hud-status" class="badge" style="border-color: var(--water); color: var(--water); font-size: 10px;">DRY</span>
            <span id="hud-perch-chip" class="badge" style="display: none; border-color: #86cfa0; color: #86cfa0; font-size: 10px;">PERCHED</span>
          </div>
          
          <!-- Stamina bar -->
          <div style="width: 120px; height: 3px; background: rgba(217,211,162,0.15); border-radius: 2px; overflow: hidden;">
            <div id="hud-stamina-bar" style="width: 100%; height: 100%; background: var(--water); border-radius: 2px; transition: width 0.1s linear;"></div>
          </div>
        </div>

        <!-- Central Noise Meter -->
        <div style="
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(13, 11, 6, 0.85);
          border: 1px solid #3d2f18;
          padding: 6px 14px;
          border-radius: 20px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.6);
        ">
          <!-- Waveform / Ripple Icon -->
          <svg id="hud-noise-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--fog); transition: color 0.15s, transform 0.15s;">
            <path d="M12 3v18M8 8v8M4 11v2M16 6v12M20 9v6"/>
          </svg>

          <!-- Noise loudness bar -->
          <div style="width: 150px; height: 6px; background: rgba(217,211,162,0.15); border-radius: 3px; overflow: hidden;">
            <div id="hud-noise-bar" style="
              width: 0%;
              height: 100%;
              background: var(--fog, #d9d3a2);
              border-radius: 3px;
              transition: width 0.08s ease-out, background-color 0.15s;
            "></div>
          </div>
        </div>
      </div>

      <!-- Sound Visualizer Caption -->
      <div id="hud-caption" style="
        position: absolute;
        bottom: 60px;
        left: 24px;
        font-size: 12px;
        color: var(--water, #86cfa0);
        background: rgba(13, 11, 6, 0.7);
        padding: 4px 8px;
        border-radius: 3px;
        display: none;
      "></div>

      <!-- Pointer Lock Hint -->
      <div id="hud-pointer-lock-hint" style="
        position: absolute;
        bottom: 28px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(14, 18, 16, 0.78);
        border: 1px solid rgba(217, 211, 162, 0.45);
        border-radius: 4px;
        padding: 6px 14px;
        font-size: 11px;
        letter-spacing: 0.08em;
        color: #eedec2;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.25s ease;
        text-transform: uppercase;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
      ">[ Click screen to lock mouse look ]</div>
    `;

    container.appendChild(el);
    this.el = el;

    this.pointerLockHintEl = el.querySelector('#hud-pointer-lock-hint');
    this.noiseBarEl = el.querySelector('#hud-noise-bar');
    this.noiseIconEl = el.querySelector('#hud-noise-icon');
    this.staminaBarEl = el.querySelector('#hud-stamina-bar');
    this.statusChipEl = el.querySelector('#hud-status');
    this.objectiveEl = el.querySelector('#hud-objective');
    this.promptEl = el.querySelector('#hud-prompt');
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

    // 1. Noise Meter update
    const loudnessPct = Math.min(100, Math.max(0, data.noiseLoudness * 100));
    if (this.noiseBarEl) {
      this.noiseBarEl.style.width = `${loudnessPct}%`;
      if (data.noiseLoudness < 0.35) {
        this.noiseBarEl.style.background = 'var(--fog, #d9d3a2)';
      } else if (data.noiseLoudness < 0.7) {
        this.noiseBarEl.style.background = '#d8b36a';
      } else {
        this.noiseBarEl.style.background = 'var(--danger, #b3261e)';
      }
    }

    if (this.noiseIconEl) {
      if (data.noiseLoudness > 0.4) {
        this.noiseIconEl.style.color = data.noiseLoudness > 0.7 ? 'var(--danger)' : '#d8b36a';
        this.noiseIconEl.style.transform = 'scale(1.2)';
      } else {
        this.noiseIconEl.style.color = 'var(--fog)';
        this.noiseIconEl.style.transform = 'scale(1.0)';
      }
    }

    // 2. Stamina Bar
    if (this.staminaBarEl) {
      this.staminaBarEl.style.width = `${Math.round(data.stamina * 100)}%`;
    }

    // 3. Status Chip
    if (this.statusChipEl) {
      this.statusChipEl.textContent = data.status;
      if (data.status === 'EXHAUSTED') {
        this.statusChipEl.style.borderColor = 'var(--danger, #b3261e)';
        this.statusChipEl.style.color = 'var(--danger, #b3261e)';
      } else if (data.status === 'WET') {
        this.statusChipEl.style.borderColor = '#d8b36a';
        this.statusChipEl.style.color = '#d8b36a';
      } else if (data.status === 'CROUCHED') {
        this.statusChipEl.style.borderColor = 'var(--fog)';
        this.statusChipEl.style.color = 'var(--fog)';
      } else {
        this.statusChipEl.style.borderColor = 'var(--water)';
        this.statusChipEl.style.color = 'var(--water)';
      }
    }

    // 4. Objective & Interaction Prompt
    if (this.objectiveEl && data.objective) {
      this.objectiveEl.textContent = data.objective;
    }

    if (this.promptEl) {
      if (data.interactionPrompt) {
        this.promptEl.textContent = data.interactionPrompt;
        this.promptEl.style.display = 'block';
      } else {
        this.promptEl.style.display = 'none';
      }
    }

    // 4b. Pointer Lock Hint
    if (this.pointerLockHintEl) {
      this.pointerLockHintEl.style.opacity = data.pointerLockHint ? '0.85' : '0';
    }

    // 5. Notebook sequence strip
    const notebookContainer = this.el.querySelector<HTMLElement>('#hud-notebook-container');
    if (notebookContainer) {
      if (data.notebookNumbers && data.notebookNumbers.length > 0) {
        notebookContainer.style.display = 'flex';
        if (this.notebookEl) {
          this.notebookEl.textContent = data.notebookNumbers.join(' · ');
        }
      } else {
        notebookContainer.style.display = 'none';
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
      this.vignetteEl.style.opacity = String(data.damageVignette);
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
