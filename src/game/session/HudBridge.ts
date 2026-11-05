/* ── HudBridge.ts ──────────────────────────────────────────────────────────
 *  Bridge between GameSession simulation state and the UI HUD layer.
 *  Enforces the <= 4-element HUD law:
 *  1. Stamina meter
 *  2. Noise meter (with acoustic truth)
 *  3. Active objective chip & beacon
 *  4. Flashlight / throwable status
 * ──────────────────────────────────────────────────────────────────────── */

import type { Hud, HudData, InventorySlot, RosterMember } from '../../ui/Hud.js';
import type { Settings, PlayerId } from '../../types/contracts.js';

export interface HudBridgeConfig {
  hud: Hud;
  settings: Settings;
}

export class HudBridge {
  readonly hud: Hud;
  private readonly settings: Settings;

  constructor(config: HudBridgeConfig) {
    this.hud = config.hud;
    this.settings = config.settings;

    this.hud.setMinimalHud(Boolean(this.settings.accessibility.minimalHud));
    this.hud.setUiScale(this.settings.accessibility.uiScale ?? 1.0);
  }

  updateFrame(data: Partial<HudData>): void {
    this.hud.update(data);
  }

  setWorkOrderCard(state: 'normal' | 'hidden' | 'glitch'): void {
    this.hud.setWorkOrderCard(state);
  }

  showThreeRulesOverlay(durationMs = 5000): void {
    this.hud.showThreeRulesOverlay(durationMs);
  }

  setInventory(slots: InventorySlot[]): void {
    this.hud.update({ inventory: slots });
  }

  setInteractionPrompt(prompt: string | null): void {
    this.hud.update({ interactionPrompt: prompt });
  }

  setWarningCaption(show: boolean): void {
    this.hud.update({ warningCaption: show });
  }

  updateRosterHud(members: RosterMember[], _noiseSpikeId?: PlayerId): void {
    this.hud.update({
      roster: members,
    });
  }

  updateSpectatorHud(targetName: string, _aliveCount: number, _totalCount: number): void {
    this.hud.update({
      spectator: {
        active: true,
        targetName,
        mode: 'follow',
        canCycle: true,
      },
    });
  }

  setSettings(newSettings: Settings): void {
    this.hud.setMinimalHud(Boolean(newSettings.accessibility.minimalHud));
    this.hud.setUiScale(newSettings.accessibility.uiScale ?? 1.0);
  }
}
