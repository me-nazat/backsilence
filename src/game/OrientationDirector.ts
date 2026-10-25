/* ── OrientationDirector.ts ───────────────────────────────────────────────
 *  Phase B: Orientation Run (< 4 min guided onboarding experience).
 *  1. Persistent visible Skip button
 *  2. Step-by-step cueing: Look & Move -> Dry tiles silent -> Water loud ->
 *     Crouch quiet -> Jump trench -> Throw pebble -> Perch / High ground -> Airlock escape
 *  3. Non-blocking icon-and-word hint cards with "Don't show again" toggle
 *  4. Guaranteed early creature encounter (<= 35s, non-lethal acoustic/wake presence)
 *  5. Early reward: confirmation sound, on-screen stamp, and score count-up invitation
 * ──────────────────────────────────────────────────────────────────────── */

import { AudioEngine } from '../audio/AudioEngine.js';
import type { SimWorld } from '../sim/SimWorld.js';
import type { Hud } from '../ui/Hud.js';
import { renderIcon } from '../ui/kit/index.js';

export interface OrientationCallbacks {
  onComplete: () => void;
  onSkip: () => void;
}

export interface HintCardDef {
  id: string;
  icon: 'walk' | 'drop' | 'wave' | 'crouch' | 'jump' | 'pebble' | 'perch' | 'door';
  title: string;
  detail: string;
}

export class OrientationDirector {
  private activeStep = 0;
  private stepTimer = 0;
  private totalElapsed = 0;
  private earlyThreatTriggered = false;
  private firstRewardTriggered = false;
  private containerEl: HTMLElement | null = null;
  private cardEl: HTMLElement | null = null;
  private skipBtnEl: HTMLElement | null = null;
  private stampEl: HTMLElement | null = null;
  private hintDismissTimer: ReturnType<typeof setTimeout> | null = null;

  private static readonly STEPS: HintCardDef[] = [
    {
      id: 'look_move',
      icon: 'walk',
      title: 'LOOK & MOVE',
      detail: 'Move with WASD / Left Stick. Look with Mouse / Right Stick. Explore the dry entrance platform.',
    },
    {
      id: 'dry_silent',
      icon: 'drop',
      title: 'DRY TILES ARE SILENT',
      detail: 'Notice your noise meter at the bottom remains at zero on dry ceramic. You are completely inaudible.',
    },
    {
      id: 'water_loud',
      icon: 'wave',
      title: 'WATER RADIATES SOUND',
      detail: 'Step into the shallow pool. Every normal step radiates acoustic ripple waves through the complex.',
    },
    {
      id: 'crouch_quiet',
      icon: 'crouch',
      title: 'CROUCH TO BE QUIET',
      detail: 'Press C / Crouch button. Wading while crouched halves water displacement and muffles echoes.',
    },
    {
      id: 'jump_trench',
      icon: 'jump',
      title: 'JUMP ACROSS GAPS',
      detail: 'Press Space / Jump button to clear deep drainage trenches without splashing.',
    },
    {
      id: 'throw_pebble',
      icon: 'pebble',
      title: 'ACOUSTIC DIVERSION',
      detail: 'Right Click / F / Throw button to fling a pebble into distant water, pulling attention away from you.',
    },
    {
      id: 'perch_high',
      icon: 'perch',
      title: 'HIGH GROUND & PERCH',
      detail: 'Climb onto elevated slabs or ledges. The blind lurker cannot reach platforms or perches.',
    },
    {
      id: 'airlock_escape',
      icon: 'door',
      title: 'AIRLOCK EXTRACTION',
      detail: 'Approach the reinforced airlock door and hold [E] / Interact to certify your tape and escape.',
    },
  ];

  constructor(
    private simWorld: SimWorld,
    private hud: Hud,
    private audio: AudioEngine,
    private callbacks: OrientationCallbacks
  ) {
    this.mountOverlay();
    this.showStep(0);
  }

  private mountOverlay(): void {
    const existing = document.getElementById('bs-orientation-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'bs-orientation-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 550;
      pointer-events: none;
      font-family: monospace;
      color: var(--fog, #d9d3a2);
    `;

    overlay.innerHTML = `
      <!-- Persistent Visible Skip Button -->
      <div style="position: absolute; top: clamp(16px, 3vw, 24px); right: clamp(16px, 3vw, 24px); pointer-events: auto;">
        <button id="btn-orientation-skip" class="analog-btn" style="
          padding: 6px 14px;
          font-size: 11px;
          background: rgba(13, 11, 6, 0.85);
          border: 1px solid rgba(134, 207, 160, 0.4);
          color: var(--water, #86cfa0);
          letter-spacing: 0.1em;
          border-radius: 2px;
          cursor: pointer;
        ">
          SKIP ORIENTATION [ESC]
        </button>
      </div>

      <!-- Non-blocking Hint Card (Bottom Center / Off-axis) -->
      <div id="orientation-hint-card" style="
        position: absolute;
        bottom: clamp(75px, 12vh, 110px);
        left: 50%;
        transform: translateX(-50%);
        width: min(340px, 90vw);
        background: rgba(14, 18, 16, 0.90);
        border: 1px solid var(--water, #86cfa0);
        border-radius: 4px;
        padding: 12px 14px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.7);
        display: flex;
        flex-direction: column;
        gap: 6px;
        pointer-events: auto;
        opacity: 0;
        transition: opacity 0.3s ease-out, transform 0.3s ease-out;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div id="hint-icon" style="color: var(--water, #86cfa0);"></div>
            <div id="hint-title" style="font-size: 12px; font-weight: 700; color: #ffffff; letter-spacing: 0.1em;"></div>
          </div>
          <button id="hint-dont-show-btn" style="background: none; border: none; font-size: 10px; color: var(--bs-tan, #a89d78); opacity: 0.75; cursor: pointer; text-decoration: underline;">
            Don't show
          </button>
        </div>
        <div id="hint-detail" style="font-size: 11px; opacity: 0.85; line-height: 1.4;"></div>
      </div>

      <!-- Objective Stamp Overlay -->
      <div id="orientation-stamp" style="
        position: absolute;
        top: 25%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.85);
        background: rgba(13, 11, 6, 0.92);
        border: 2px solid var(--water, #86cfa0);
        border-radius: 4px;
        padding: 12px 28px;
        color: var(--water, #86cfa0);
        font-size: 15px;
        font-weight: 900;
        letter-spacing: 0.2em;
        text-align: center;
        opacity: 0;
        pointer-events: none;
        transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        box-shadow: 0 0 30px rgba(134,207,160,0.4);
      ">
        OBJECTIVE VERIFIED // TAPE CERTIFIED
      </div>
    `;

    document.body.appendChild(overlay);
    this.containerEl = overlay;
    this.cardEl = overlay.querySelector('#orientation-hint-card');
    this.skipBtnEl = overlay.querySelector('#btn-orientation-skip');
    this.stampEl = overlay.querySelector('#orientation-stamp');

    this.skipBtnEl?.addEventListener('click', () => {
      this.callbacks.onSkip();
    });

    overlay.querySelector('#hint-dont-show-btn')?.addEventListener('click', () => {
      const step = OrientationDirector.STEPS[this.activeStep];
      if (step) {
        try {
          localStorage.setItem(`backsilence_hint_disabled_${step.id}`, 'true');
        } catch {
          /* ignore */
        }
      }
      this.hideCard();
    });
  }

  showStep(index: number): void {
    if (index >= OrientationDirector.STEPS.length) return;
    this.activeStep = index;
    this.stepTimer = 0;

    const step = OrientationDirector.STEPS[index];
    if (!step) return;

    // Check if user disabled this hint
    try {
      if (localStorage.getItem(`backsilence_hint_disabled_${step.id}`) === 'true') {
        return;
      }
    } catch {
      /* ignore */
    }

    if (this.cardEl) {
      const iconWrap = this.cardEl.querySelector('#hint-icon');
      const titleEl = this.cardEl.querySelector('#hint-title');
      const detailEl = this.cardEl.querySelector('#hint-detail');

      if (iconWrap) iconWrap.innerHTML = renderIcon(step.icon === 'walk' ? 'tape' : step.icon === 'wave' ? 'wave' : step.icon === 'drop' ? 'drop' : step.icon === 'crouch' ? 'ghost' : step.icon === 'jump' ? 'ghost' : 'ear', 18);
      if (titleEl) titleEl.textContent = step.title;
      if (detailEl) detailEl.textContent = step.detail;

      this.cardEl.style.opacity = '1';
      this.cardEl.style.transform = 'translateX(-50%) translateY(0)';

      if (this.hintDismissTimer) clearTimeout(this.hintDismissTimer);
      // Auto-hide card after 5s so it never blocks the view
      this.hintDismissTimer = setTimeout(() => {
        this.hideCard();
      }, 5000);
    }
  }

  hideCard(): void {
    if (this.cardEl) {
      this.cardEl.style.opacity = '0';
      this.cardEl.style.transform = 'translateX(-50%) translateY(12px)';
    }
  }

  triggerEarlyReward(label = 'OBJECTIVE VERIFIED // TAPE CERTIFIED'): void {
    if (this.firstRewardTriggered) return;
    this.firstRewardTriggered = true;

    // Play warm confirmation chime
    this.audio.play('ui_confirm');

    // Display on-screen stamp
    if (this.stampEl) {
      this.stampEl.textContent = label;
      this.stampEl.style.opacity = '1';
      this.stampEl.style.transform = 'translate(-50%, -50%) scale(1.05)';
      setTimeout(() => {
        if (this.stampEl) {
          this.stampEl.style.opacity = '0';
          this.stampEl.style.transform = 'translate(-50%, -50%) scale(0.9)';
        }
      }, 2000);
    }
  }

  update(dt: number): void {
    this.totalElapsed += dt;
    this.stepTimer += dt;

    const player = this.simWorld.player;
    if (!player) return;

    // Guaranteed early moment within 35s
    if (!this.earlyThreatTriggered && (this.totalElapsed >= 20 || (player.wet && this.totalElapsed >= 8))) {
      this.earlyThreatTriggered = true;
      // Creature wakes, sends distant low acoustic rumble and water splash across the grate
      this.audio.play('monster_ambient_far', { gain: 0.8 });
      this.simWorld.broadcastNoise({
        kind: 'splash',
        position: { x: 0, y: 0, z: -14 },
        loudness: 0.9,
        sourcePlayerId: 'entity_demonstrator',
      });
      this.hud.update({
        soundVisualizerCaption: '[ DISTANT HEAVY WATER SLOSH — SECTOR GRATE ]',
      });
    }

    // Step state machine
    switch (this.activeStep) {
      case 0: // Look & move
        if (this.stepTimer > 2.0 && (Math.abs(player.vel.x) > 0.5 || Math.abs(player.vel.z) > 0.5)) {
          this.triggerEarlyReward('MOVEMENT VERIFIED');
          this.showStep(1);
        }
        break;

      case 1: // Dry tiles silent
        if (!player.wet && this.stepTimer > 3.0) {
          this.showStep(2);
        }
        break;

      case 2: // Water loud
        if (player.wet) {
          this.showStep(3);
        }
        break;

      case 3: // Crouch quiet
        if (player.crouchT > 0.5 && player.wet) {
          this.triggerEarlyReward('CROUCH-WADING CERTIFIED');
          this.showStep(4);
        }
        break;

      case 4: // Jump trench
        if (!player.onGround && player.vel.y > 1.0) {
          this.showStep(5);
        }
        break;

      case 5: // Throw pebble
        if (this.stepTimer > 8.0) {
          this.showStep(6);
        }
        break;

      case 6: // Perch high ground
        if (player.pos.y > 1.2 || this.stepTimer > 10.0) {
          this.showStep(7);
        }
        break;
    }
  }

  dispose(): void {
    if (this.hintDismissTimer) clearTimeout(this.hintDismissTimer);
    if (this.containerEl?.parentElement) {
      this.containerEl.parentElement.removeChild(this.containerEl);
    }
    this.containerEl = null;
  }
}
