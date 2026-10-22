/* ── HowToPlay.ts ─────────────────────────────────────────────────────────
 *  Acoustic horror illustrated rules guide:
 *  "Stay dry", "Water is loud", "Listen", "Find the numbers".
 * ──────────────────────────────────────────────────────────────────────── */

import { AudioEngine } from '../audio/AudioEngine.js';

export class HowToPlay {
  private el: HTMLElement | null = null;
  private onBack: () => void;

  constructor(onBack: () => void) {
    this.onBack = onBack;
  }

  mount(container: HTMLElement): void {
    const el = document.createElement('div');
    el.id = 'how-to-play-view';
    el.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(13, 11, 6, 0.95);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: clamp(20px, 4vw, 40px) 20px;
      overflow-y: auto;
      z-index: 300;
      box-sizing: border-box;
      color: var(--fog, #d9d3a2);
      font-family: monospace;
    `;

    el.innerHTML = `
      <div style="width: min(840px, 95vw); display: flex; flex-direction: column; gap: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(134,207,160,0.3); padding-bottom: 12px;">
          <div>
            <h2 style="font-size: clamp(1.4rem, 3vw, 2.0rem); color: var(--water, #86cfa0); margin: 0;">ACOUSTIC RULEBOOK</h2>
            <div style="font-size: 11px; opacity: 0.7;">SURVIVAL PROTOCOLS INSIDE THE POOLROOMS</div>
          </div>
          <button id="btn-htp-back" class="analog-btn" style="width: auto; padding: 6px 16px;">ESC BACK</button>
        </div>

        <!-- Central Credo -->
        <div style="text-align: center; background: #080603; border: 1px solid #3d2f18; padding: 14px; border-radius: 4px;">
          <div style="font-size: 16px; color: var(--water, #86cfa0); font-weight: bold; letter-spacing: 0.1em;">
            "Dry tiles are silent. Water is not."
          </div>
          <div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">The creature is entirely blind. It navigates exclusively by hearing water disturbances.</div>
        </div>

        <!-- 4 Cards Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
          <!-- Card 1 -->
          <div class="htp-card" style="background: rgba(0,0,0,0.4); border: 1px solid #3d2f18; border-radius: 4px; padding: 16px;">
            <div style="height: 48px; display: flex; align-items: center; color: var(--water); margin-bottom: 10px;">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            </div>
            <div style="font-weight: bold; font-size: 13px; color: var(--fog); margin-bottom: 6px;">1. STAY DRY</div>
            <div style="font-size: 11px; opacity: 0.8; line-height: 1.4;">
              Walking and jumping across dry tiled platforms produces <strong>0 noise</strong>. The entity cannot hear dry movement under any circumstance.
            </div>
          </div>

          <!-- Card 2 -->
          <div class="htp-card" style="background: rgba(0,0,0,0.4); border: 1px solid #3d2f18; border-radius: 4px; padding: 16px;">
            <div style="height: 48px; display: flex; align-items: center; color: #d8b36a; margin-bottom: 10px;">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
            </div>
            <div style="font-weight: bold; font-size: 13px; color: var(--fog); margin-bottom: 6px;">2. WATER IS LOUD</div>
            <div style="font-size: 11px; opacity: 0.8; line-height: 1.4;">
              Every step in water sends acoustic waves through the fog. Wading crouched is quiet (5m radius); sprinting in water can be heard <strong>30 meters away</strong>.
            </div>
          </div>

          <!-- Card 3 -->
          <div class="htp-card" style="background: rgba(0,0,0,0.4); border: 1px solid #3d2f18; border-radius: 4px; padding: 16px;">
            <div style="height: 48px; display: flex; align-items: center; color: var(--water); margin-bottom: 10px;">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
            </div>
            <div style="font-weight: bold; font-size: 13px; color: var(--fog); margin-bottom: 6px;">3. LISTEN CAREFULLY</div>
            <div style="font-size: 11px; opacity: 0.8; line-height: 1.4;">
              Stereo acoustic cues reveal creature proximity: distant guttural breathing, heavy sloshes, or an alerting roar when it locks onto your splashes.
            </div>
          </div>

          <!-- Card 4 -->
          <div class="htp-card" style="background: rgba(0,0,0,0.4); border: 1px solid #3d2f18; border-radius: 4px; padding: 16px;">
            <div style="height: 48px; display: flex; align-items: center; color: #d8b36a; margin-bottom: 10px;">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 21"/></svg>
            </div>
            <div style="font-weight: bold; font-size: 13px; color: var(--fog); margin-bottom: 6px;">4. FIND THE NUMBERS</div>
            <div style="font-size: 11px; opacity: 0.8; line-height: 1.4;">
              Locate giant spray-painted numbers on submerged pillars (#1, #2, #3). Collect the sequence to unlock the floodgate exit code.
            </div>
          </div>
        </div>
      </div>
    `;

    container.appendChild(el);
    this.el = el;

    this.el.querySelector('#btn-htp-back')?.addEventListener('click', () => {
      AudioEngine.getInstance().play('ui_click');
      this.onBack();
    });
  }

  show(): void {
    if (this.el) this.el.style.display = 'flex';
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
