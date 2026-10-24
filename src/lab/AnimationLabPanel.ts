/* ── AnimationLabPanel.ts ───────────────────────────────────────────────────
 *  Phase G: Animation Lab panel (?lab=anim).
 *  - Loops every creature mode with interactive sliders (speed, turn rate, wading depth)
 *  - Live Foot-Slide Metric: measured world-space displacement rate during planted phase
 *  - Foot-slide gate: must stay below 0.03 m/s while foot is planted
 *  - Overhead flying skulls flock preview (5 skulls)
 *  - First-person ViewModel preview with all 9 states (sway, swing, interact, crank, etc.)
 *  - Pause and scrub timeline controls
 *  - Automated regression test suite
 * ──────────────────────────────────────────────────────────────────────── */

import { Vector3, type Scene } from 'three';
import { createMonsterSkin, type MonsterSkin, type LocomotionState } from '../game/creatures/MonsterSkin.js';
import { FlockDirector } from '../game/creatures/FlockDirector.js';
import { ViewModel, type ViewModelState } from '../game/player/ViewModel.js';

export class AnimationLabPanel {
  private panelEl: HTMLElement | null = null;
  private isVisible = false;

  // Lab creature instance
  private monsterSkin: MonsterSkin | null = null;
  private flock: FlockDirector | null = null;
  private viewModel: ViewModel | null = null;
  private readonly scene: Scene;

  // State
  private speed = 1.8;
  private turnRate = 0.0;
  private waterDepth = 0.35;
  private isFlockActive = true;
  private isViewModelActive = true;
  private skinChoice: 'auto' | 'model' | 'procedural' = 'auto';

  // Scrub & Playback
  private isPaused = false;
  private scrubPhase = 0.0; // 0..1
  private manualAnimTime = 0.0;

  // Metrics
  private footSlideSpeed = 0.0;
  private prevFootPositions = new Map<string, Vector3>();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  mount(container: HTMLElement): void {
    const panel = document.createElement('div');
    panel.id = 'animation-lab-panel';
    panel.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      width: min(440px, 94vw);
      max-height: 90vh;
      background: rgba(10, 13, 18, 0.96);
      border: 1px solid #5bc0be;
      border-radius: 8px;
      padding: 16px;
      color: #e2e8f0;
      font-family: monospace;
      font-size: 12px;
      z-index: 10002;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0,0,0,0.88);
      display: none;
    `;

    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid rgba(91,192,190,0.3); padding-bottom:8px;">
        <span style="font-weight:bold; color:#5bc0be; font-size:14px;">[ ANIMATION LAB / ?lab=anim ]</span>
        <button id="anim-lab-close" style="background:none; border:none; color:#e2e8f0; cursor:pointer; font-size:16px;">✕</button>
      </div>

      <!-- Playback Pause & Scrub Control -->
      <div style="background:#090a0d; border:1px solid #232734; border-radius:6px; padding:10px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="color:#5bc0be; font-weight:bold;">PLAYBACK TIMELINE:</span>
          <button id="btn-play-pause" style="padding:4px 10px; background:#22333b; border:1px solid #5bc0be; color:#5bc0be; font-weight:bold; cursor:pointer; border-radius:4px;">
            ⏸ PAUSE
          </button>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span>SCRUB PHASE:</span>
          <span id="scrub-val">0.00</span>
        </div>
        <input id="slider-scrub" type="range" min="0" max="1.0" step="0.01" value="0.0" style="width:100%;" />
        <div style="font-size:10px; color:#8a92a0; margin-top:4px;">
          Freeze and scrub locomotion cycles to inspect joints with zero motion blur.
        </div>
      </div>

      <!-- Live Foot-Slide Gate Gauge -->
      <div style="background:#090a0d; border:1px solid #232734; border-radius:6px; padding:10px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span>PLANTED FOOT-SLIDE RATE:</span>
          <span id="slide-val" style="font-weight:bold; color:#4ade80;">0.000 m/s</span>
        </div>
        <div style="width:100%; height:8px; background:#1e222d; border-radius:4px; overflow:hidden;">
          <div id="slide-bar" style="width:5%; height:100%; background:#4ade80; transition:width 0.1s, background 0.2s;"></div>
        </div>
        <div style="font-size:10px; color:#8a92a0; margin-top:4px;">
          Gate condition: while planted, world speed must stay below &lt; 0.030 m/s.
        </div>
      </div>

      <!-- Creature Mode Selector -->
      <div style="margin-bottom:12px;">
        <label style="display:block; margin-bottom:4px; color:#5bc0be;">CREATURE LOCOMOTION MODE:</label>
        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px;">
          <button class="anim-mode-btn" data-mode="WANDER" style="padding:6px 4px; background:#2a4347; border:1px solid #333; color:#fff; cursor:pointer; border-radius:4px;">WANDER</button>
          <button class="anim-mode-btn" data-mode="INVESTIGATE" style="padding:6px 4px; background:#1e222d; border:1px solid #333; color:#fff; cursor:pointer; border-radius:4px;">INVEST</button>
          <button class="anim-mode-btn" data-mode="STALK" style="padding:6px 4px; background:#1e222d; border:1px solid #333; color:#fff; cursor:pointer; border-radius:4px;">STALK</button>
          <button class="anim-mode-btn" data-mode="LURK" style="padding:6px 4px; background:#1e222d; border:1px solid #333; color:#fff; cursor:pointer; border-radius:4px;">LURK</button>
          <button class="anim-mode-btn" data-mode="ALERTED" style="padding:6px 4px; background:#1e222d; border:1px solid #333; color:#fff; cursor:pointer; border-radius:4px;">ALERT</button>
          <button class="anim-mode-btn" data-mode="HUNT" style="padding:6px 4px; background:#1e222d; border:1px solid #333; color:#fff; cursor:pointer; border-radius:4px;">HUNT</button>
          <button class="anim-mode-btn" data-mode="ATTACK" style="padding:6px 4px; background:#1e222d; border:1px solid #333; color:#fff; cursor:pointer; border-radius:4px;">ATTACK</button>
          <button class="anim-mode-btn" data-mode="ROAR" style="padding:6px 4px; background:#1e222d; border:1px solid #333; color:#fff; cursor:pointer; border-radius:4px;">ROAR</button>
        </div>
      </div>

      <!-- Sliders: Speed, Turn Rate, Depth -->
      <div style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span>LOCOMOTION SPEED:</span>
          <span id="speed-val">1.8 m/s</span>
        </div>
        <input id="slider-speed" type="range" min="0" max="6.0" step="0.1" value="1.8" style="width:100%;" />
      </div>

      <div style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span>TURN RATE:</span>
          <span id="turn-val">0.0 rad/s</span>
        </div>
        <input id="slider-turn" type="range" min="-3.0" max="3.0" step="0.1" value="0.0" style="width:100%;" />
      </div>

      <div style="margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span>WADING DEPTH:</span>
          <span id="depth-val">0.35 m</span>
        </div>
        <input id="slider-depth" type="range" min="0" max="1.5" step="0.05" value="0.35" style="width:100%;" />
      </div>

      <!-- Viewmodel States Preview -->
      <div style="margin-bottom:12px; background:#090a0d; border:1px solid #232734; border-radius:6px; padding:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="color:#5bc0be; font-weight:bold;">VIEWMODEL PREVIEW:</span>
          <button id="btn-toggle-vm" style="padding:2px 8px; background:#1e222d; border:1px solid #5bc0be; color:#5bc0be; cursor:pointer; border-radius:4px;">ON</button>
        </div>
        <select id="select-vm-state" style="width:100%; padding:4px; background:#1e222d; border:1px solid #333; color:#fff; border-radius:4px;">
          <option value="IDLE">IDLE Sway</option>
          <option value="WALK">WALK Swing</option>
          <option value="SPRINT">SPRINT Swing</option>
          <option value="CROUCH">CROUCH Lowering</option>
          <option value="JUMP">JUMP Reaction</option>
          <option value="LANDING">LANDING Dip</option>
          <option value="WADING">WADING Drag</option>
          <option value="FLASHLIGHT_TOGGLE">FLASHLIGHT Toggle</option>
          <option value="INTERACT">INTERACT Reach & Retract</option>
          <option value="CRANK">CRANK Two-Handed Rotation</option>
        </select>
      </div>

      <!-- Skin selector & Flock Toggle -->
      <div style="margin-bottom:12px; display:flex; gap:10px;">
        <label style="flex:1;">
          SKIN SOURCE:
          <select id="select-skin" style="width:100%; margin-top:4px; padding:4px; background:#1e222d; border:1px solid #333; color:#fff; border-radius:4px;">
            <option value="auto">Auto (GLB if present)</option>
            <option value="procedural">Procedural SkinnedMesh</option>
            <option value="model">Thumper GLB</option>
          </select>
        </label>
        <label style="flex:1;">
          FLOCK PREVIEW:
          <button id="btn-flock" style="width:100%; margin-top:4px; padding:6px; background:#1e222d; border:1px solid #5bc0be; color:#5bc0be; cursor:pointer; border-radius:4px;">ON (5 Skulls)</button>
        </label>
      </div>

      <!-- Automated Test Button -->
      <div style="margin-top:14px; border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;">
        <button id="btn-run-anim-test" style="width:100%; padding:8px; background:#233538; border:1px solid #5bc0be; color:#5bc0be; font-weight:bold; cursor:pointer; border-radius:4px;">
          RUN FOOT-SLIDE SELF-TEST
        </button>
        <div id="test-output" style="margin-top:6px; font-size:11px; color:#cbd5e1;"></div>
      </div>
    `;

    container.appendChild(panel);
    this.panelEl = panel;

    this.setupEvents();
    this.initCreatures();
  }

  private initCreatures(): void {
    // Monster skin centered in lab scene
    this.monsterSkin = createMonsterSkin(this.skinChoice);
    this.monsterSkin.root.position.set(0, 0, 0);
    this.scene.add(this.monsterSkin.root);

    // Overhead ambient flock preview
    this.flock = new FlockDirector({
      seed: 0,
      anchor: new Vector3(0, 0, 0),
      waterY: 0.0,
      count: 5,
    });
    this.scene.add(this.flock.root);

    // ViewModel preview in scene
    this.viewModel = new ViewModel();
    this.viewModel.root.position.set(0, 1.2, 1.5);
    this.scene.add(this.viewModel.root);
  }

  private setupEvents(): void {
    if (!this.panelEl) return;

    this.panelEl.querySelector('#anim-lab-close')?.addEventListener('click', () => {
      this.hide();
    });

    // Play/Pause
    const playPauseBtn = this.panelEl.querySelector('#btn-play-pause') as HTMLButtonElement;
    playPauseBtn?.addEventListener('click', () => {
      this.isPaused = !this.isPaused;
      playPauseBtn.textContent = this.isPaused ? '▶ PLAY' : '⏸ PAUSE';
      playPauseBtn.style.background = this.isPaused ? '#3d2626' : '#22333b';
    });

    // Scrub slider
    const scrubSlider = this.panelEl.querySelector('#slider-scrub') as HTMLInputElement;
    const scrubVal = this.panelEl.querySelector('#scrub-val') as HTMLElement;
    scrubSlider?.addEventListener('input', () => {
      this.isPaused = true;
      if (playPauseBtn) {
        playPauseBtn.textContent = '▶ PLAY';
        playPauseBtn.style.background = '#3d2626';
      }
      this.scrubPhase = parseFloat(scrubSlider.value);
      this.manualAnimTime = this.scrubPhase * 2.0; // 2s cycle
      if (scrubVal) scrubVal.textContent = this.scrubPhase.toFixed(2);
    });

    // Mode buttons
    const btns = this.panelEl.querySelectorAll('.anim-mode-btn');
    btns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const mode = target.getAttribute('data-mode') || 'WANDER';
        this.setMode(mode);
        btns.forEach((b) => ((b as HTMLElement).style.background = '#1e222d'));
        target.style.background = '#2a4347';
      });
    });

    // Speed slider
    const speedSlider = this.panelEl.querySelector('#slider-speed') as HTMLInputElement;
    const speedVal = this.panelEl.querySelector('#speed-val') as HTMLElement;
    speedSlider?.addEventListener('input', () => {
      this.speed = parseFloat(speedSlider.value);
      if (speedVal) speedVal.textContent = `${this.speed.toFixed(1)} m/s`;
    });

    // Turn rate slider
    const turnSlider = this.panelEl.querySelector('#slider-turn') as HTMLInputElement;
    const turnVal = this.panelEl.querySelector('#turn-val') as HTMLElement;
    turnSlider?.addEventListener('input', () => {
      this.turnRate = parseFloat(turnSlider.value);
      if (turnVal) turnVal.textContent = `${this.turnRate.toFixed(1)} rad/s`;
    });

    // Depth slider
    const depthSlider = this.panelEl.querySelector('#slider-depth') as HTMLInputElement;
    const depthVal = this.panelEl.querySelector('#depth-val') as HTMLElement;
    depthSlider?.addEventListener('input', () => {
      this.waterDepth = parseFloat(depthSlider.value);
      if (depthVal) depthVal.textContent = `${this.waterDepth.toFixed(2)} m`;
    });

    // Viewmodel state dropdown
    const vmSelect = this.panelEl.querySelector('#select-vm-state') as HTMLSelectElement;
    vmSelect?.addEventListener('change', () => {
      const state = vmSelect.value as ViewModelState;
      if (this.viewModel) {
        this.viewModel.setState(state);
        if (state === 'FLASHLIGHT_TOGGLE') this.viewModel.setFlashlightOn(true);
        if (state === 'INTERACT') this.viewModel.triggerInteract();
        if (state === 'CRANK') this.viewModel.triggerCrank(2.0);
      }
    });

    // Viewmodel toggle
    const vmBtn = this.panelEl.querySelector('#btn-toggle-vm') as HTMLButtonElement;
    vmBtn?.addEventListener('click', () => {
      this.isViewModelActive = !this.isViewModelActive;
      vmBtn.textContent = this.isViewModelActive ? 'ON' : 'OFF';
      if (this.viewModel) this.viewModel.root.visible = this.isViewModelActive;
    });

    // Skin select
    const skinSelect = this.panelEl.querySelector('#select-skin') as HTMLSelectElement;
    skinSelect?.addEventListener('change', () => {
      this.skinChoice = skinSelect.value as 'auto' | 'model' | 'procedural';
      if (this.monsterSkin) {
        this.scene.remove(this.monsterSkin.root);
        this.monsterSkin.dispose();
      }
      this.monsterSkin = createMonsterSkin(this.skinChoice);
      this.scene.add(this.monsterSkin.root);
    });

    // Flock toggle
    const flockBtn = this.panelEl.querySelector('#btn-flock') as HTMLButtonElement;
    flockBtn?.addEventListener('click', () => {
      this.isFlockActive = !this.isFlockActive;
      flockBtn.textContent = this.isFlockActive ? 'ON (5 Skulls)' : 'OFF';
      if (this.flock) this.flock.root.visible = this.isFlockActive;
    });

    // Self test
    this.panelEl.querySelector('#btn-run-anim-test')?.addEventListener('click', () => {
      this.runSelfTest();
    });
  }

  setMode(mode: string): void {
    this.monsterSkin?.setMode(mode);
  }

  update(dt: number, simTime: number): void {
    if (!this.monsterSkin) return;

    const actualDt = this.isPaused ? 0 : dt;
    const currentSimTime = this.isPaused ? this.manualAnimTime : simTime;

    const locomotion: LocomotionState = {
      speed: this.speed,
      isGrounded: true,
      isWading: this.waterDepth > 0.1,
      waterDepth: this.waterDepth,
    };

    // Apply turn rate rotation
    this.monsterSkin.root.rotation.y += this.turnRate * actualDt;

    this.monsterSkin.update(actualDt > 0 ? actualDt : 0.016, locomotion);

    if (this.flock && this.isFlockActive) {
      this.flock.update(actualDt, currentSimTime);
    }

    if (this.viewModel && this.isViewModelActive) {
      this.viewModel.update(
        actualDt > 0 ? actualDt : 0.016,
        locomotion,
        currentSimTime * 6.0,
        0.0,
      );
    }

    // Compute foot-slide metric
    const feet = this.monsterSkin.getFootBones();
    let maxPlantedSlide = 0.0;

    for (const foot of feet) {
      if (foot.isPlanted) {
        const prev = this.prevFootPositions.get(foot.boneId);
        if (prev) {
          const dist = Math.hypot(foot.pos.x - prev.x, foot.pos.z - prev.z);
          const rate = dist / Math.max(0.001, actualDt > 0 ? actualDt : 0.016);
          if (rate > maxPlantedSlide) maxPlantedSlide = rate;
        }
        this.prevFootPositions.set(foot.boneId, foot.pos.clone());
      } else {
        this.prevFootPositions.delete(foot.boneId);
      }
    }

    this.footSlideSpeed = maxPlantedSlide;
    this.updateUiMetrics();
  }

  private updateUiMetrics(): void {
    if (!this.panelEl || !this.isVisible) return;
    const slideVal = this.panelEl.querySelector('#slide-val') as HTMLElement;
    const slideBar = this.panelEl.querySelector('#slide-bar') as HTMLElement;

    if (slideVal && slideBar) {
      slideVal.textContent = `${this.footSlideSpeed.toFixed(3)} m/s`;
      const pct = Math.min(100, (this.footSlideSpeed / 0.06) * 100);
      slideBar.style.width = `${pct}%`;

      if (this.footSlideSpeed <= 0.03) {
        slideVal.style.color = '#4ade80';
        slideBar.style.background = '#4ade80';
      } else {
        slideVal.style.color = '#ef4444';
        slideBar.style.background = '#ef4444';
      }
    }
  }

  runSelfTest(): { passed: boolean; maxFootSlide: number; details: string } {
    const modes = ['WANDER', 'INVESTIGATE', 'STALK', 'ALERTED', 'HUNT'];
    let maxObservedSlide = 0.0;

    for (const mode of modes) {
      this.setMode(mode);
      for (let f = 0; f < 30; f++) {
        this.update(1 / 60, f * (1 / 60));
        if (this.footSlideSpeed > maxObservedSlide) {
          maxObservedSlide = this.footSlideSpeed;
        }
      }
    }

    const passed = maxObservedSlide <= 0.030;
    const out = this.panelEl?.querySelector('#test-output') as HTMLElement | null;
    if (out) {
      out.textContent = passed
        ? `PASS: Max planted foot slide = ${maxObservedSlide.toFixed(4)} m/s (<= 0.030 m/s)`
        : `FAIL: Max planted foot slide = ${maxObservedSlide.toFixed(4)} m/s (> 0.030 m/s)`;
      out.style.color = passed ? '#4ade80' : '#ef4444';
    }

    return {
      passed,
      maxFootSlide: maxObservedSlide,
      details: `Max slide: ${maxObservedSlide.toFixed(4)} m/s across 5 modes`,
    };
  }

  show(): void {
    this.isVisible = true;
    if (this.panelEl) this.panelEl.style.display = 'block';
  }

  hide(): void {
    this.isVisible = false;
    if (this.panelEl) this.panelEl.style.display = 'none';
  }

  toggle(): void {
    if (this.isVisible) this.hide();
    else this.show();
  }

  dispose(): void {
    if (this.monsterSkin) {
      this.scene.remove(this.monsterSkin.root);
      this.monsterSkin.dispose();
      this.monsterSkin = null;
    }
    if (this.flock) {
      this.scene.remove(this.flock.root);
      this.flock.dispose();
      this.flock = null;
    }
    if (this.viewModel) {
      this.scene.remove(this.viewModel.root);
      this.viewModel.dispose();
      this.viewModel = null;
    }
    this.panelEl?.remove();
  }
}
