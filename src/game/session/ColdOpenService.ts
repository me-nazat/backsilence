/* ── ColdOpenService.ts ───────────────────────────────────────────────────
 *  First-time narrative intro and cold open sequence coordinator:
 *  - Work order card display and dismiss handling
 *  - Three rules overlay trigger
 *  - Player input freeze and unfreeze during cold open
 * ──────────────────────────────────────────────────────────────────────── */

import type { MapId } from '../../types/contracts.js';
import { ProfileStore } from '../../meta/ProfilePersistence.js';
import type { InputRig } from './InputRig.js';
import type { HudBridge } from './HudBridge.js';

export class ColdOpenService {
  isActive = false;
  timer = 0;
  step: 'work_order' | 'wrongness' | 'done' = 'work_order';
  private keyHandler: ((e: KeyboardEvent | PointerEvent) => void) | null = null;

  checkAndStart(mapId: MapId, inputRig: InputRig, hudBridge: HudBridge): void {
    const profile = ProfileStore.load();
    const isUrlForced =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('cold_open') === '1';
    const isFirstTimeCampaign =
      (mapId === 'natatorium' || mapId === 'poolrooms') && !profile.coldOpenSeen;

    if (!isUrlForced && !isFirstTimeCampaign) return;

    this.isActive = true;
    this.timer = 0;
    this.step = 'work_order';
    inputRig.setFreeze(true);
    hudBridge.setWorkOrderCard('normal');

    const handleSkip = (e: Event) => {
      if (this.timer < 0.5) return;
      e.preventDefault();
      e.stopPropagation();
      this.finish(inputRig, hudBridge);
    };

    this.keyHandler = handleSkip as (e: KeyboardEvent | PointerEvent) => void;
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleSkip, { capture: true });
      window.addEventListener('pointerdown', handleSkip, { capture: true });
    }
  }

  update(dt: number, hudBridge: HudBridge): void {
    if (!this.isActive) return;
    this.timer += dt;

    if (this.timer >= 3.0 && this.step === 'work_order') {
      this.step = 'wrongness';
      hudBridge.setWorkOrderCard('glitch');
    }
  }

  finish(inputRig: InputRig, hudBridge: HudBridge): void {
    if (!this.isActive && this.step === 'done') return;
    this.isActive = false;
    this.step = 'done';

    if (this.keyHandler && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keyHandler, { capture: true } as EventListenerOptions);
      window.removeEventListener('pointerdown', this.keyHandler, { capture: true } as EventListenerOptions);
      this.keyHandler = null;
    }

    inputRig.setFreeze(false);
    hudBridge.setWorkOrderCard('hidden');
    hudBridge.showThreeRulesOverlay(5000);

    const profile = ProfileStore.load();
    profile.coldOpenSeen = true;
    ProfileStore.save(profile);
  }

  dispose(): void {
    if (this.keyHandler && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keyHandler, { capture: true } as EventListenerOptions);
      window.removeEventListener('pointerdown', this.keyHandler, { capture: true } as EventListenerOptions);
      this.keyHandler = null;
    }
    this.isActive = false;
  }
}
