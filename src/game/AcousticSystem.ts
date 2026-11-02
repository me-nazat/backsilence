/* ── AcousticSystem.ts ──────────────────────────────────────────────────────
 *  Presentation-only acoustic consumer & tension controller.
 *  Subscribes to AcousticBus events (src/sim/AcousticBus.ts) and monsters'
 *  snapshots to drive audio tension, sound-visualizer captions, and HUD
 *  directional arcs. Never generates loudness or simulation events of its own.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3, NoiseEvent, Settings } from '../types/contracts.js';
import type { MonsterBrain } from '../sim/MonsterBrain.js';
import type { AcousticBus, AcousticEvent } from '../sim/AcousticBus.js';
import type { AudioEngine } from '../audio/AudioEngine.js';
import type { Hud } from '../ui/Hud.js';

export class AcousticSystem {
  private readonly audio: AudioEngine;
  private readonly hud: Hud;
  private settings: Settings;

  private currentTension = 0;
  private lastRippleTickTime = 0;
  private unsubscribeBus: (() => void) | null = null;
  private readonly pendingBusEvents: AcousticEvent[] = [];

  constructor(audio: AudioEngine, hud: Hud, settings: Settings, acousticBus?: AcousticBus) {
    this.audio = audio;
    this.hud = hud;
    this.settings = settings;
    if (acousticBus) {
      this.bindAcousticBus(acousticBus);
    }
  }

  /**
   * Subscribes this presentation consumer to the simulation's AcousticBus.
   */
  bindAcousticBus(acousticBus: AcousticBus): void {
    if (this.unsubscribeBus) {
      this.unsubscribeBus();
      this.unsubscribeBus = null;
    }
    this.unsubscribeBus = acousticBus.subscribe((ev) => {
      this.pendingBusEvents.push(ev);
    });
  }

  dispose(): void {
    if (this.unsubscribeBus) {
      this.unsubscribeBus();
      this.unsubscribeBus = null;
    }
    this.pendingBusEvents.length = 0;
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
  }

  get tension(): number {
    return this.currentTension;
  }

  update(
    dt: number,
    playerPos: Vec3,
    playerYaw: number,
    monsters: MonsterBrain[],
    recentNoises: NoiseEvent[] = [],
  ): void {
    // 1. Compute target tension across all monsters
    let maxTension = 0;
    let minMonsterDist = Infinity;

    for (let i = 0; i < monsters.length; i++) {
      const m = monsters[i]!;
      const snap = m.getSnapshot();
      const dx = snap.pos.x - playerPos.x;
      const dy = snap.pos.y - playerPos.y;
      const dz = snap.pos.z - playerPos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < minMonsterDist) {
        minMonsterDist = dist;
      }

      let stateWeight = 0;
      switch (snap.state) {
        case 'HUNT':
          stateWeight = 1.0;
          break;
        case 'ALERTED':
          stateWeight = 0.8;
          break;
        case 'BLOCKED':
          stateWeight = 0.7;
          break;
        case 'INVESTIGATE':
          stateWeight = 0.6;
          break;
        case 'WANDER':
          if (dist <= 25.0) {
            stateWeight = 0.15 + (1.0 - dist / 25.0) * 0.20;
          }
          break;
        case 'DORMANT':
        default:
          stateWeight = 0.0;
          break;
      }

      const proximityWeight = Math.max(0.1, 1.0 - Math.min(1.0, dist / 40.0));
      const monsterTension = stateWeight * (snap.state === 'HUNT' ? 1.0 : proximityWeight);
      if (monsterTension > maxTension) {
        maxTension = monsterTension;
      }
    }

    const clampedTarget = Math.min(1.0, Math.max(0.0, maxTension));

    // Smooth tension: attack 0.4s, release 2.5s
    const rate = clampedTarget > this.currentTension ? 1.0 / 0.4 : 1.0 / 2.5;
    this.currentTension += (clampedTarget - this.currentTension) * Math.min(1.0, dt * rate);
    this.audio.setTension(this.currentTension);

    // Proximity ducking as monster closes inside 18m so creature footsteps dominate
    if (minMonsterDist < 18.0) {
      const proxT = Math.max(0, Math.min(1.0, (18.0 - minMonsterDist) / 18.0));
      const ambientDuck = 1.0 - 0.65 * proxT;
      this.audio.duckBus('ambient', ambientDuck, 0.1, 0.5);
    }

    // 2. Consume subscribed AcousticBus events alongside any presentation noise cues
    const combinedCues: Array<{ position: Vec3; loudness: number; kind: string }> = [];
    while (this.pendingBusEvents.length > 0) {
      const ev = this.pendingBusEvents.shift()!;
      combinedCues.push({
        position: ev.pos,
        loudness: ev.loudness,
        kind: ev.kind === 'THROWN_STONE_SPLASH' ? 'pebble' : ev.kind === 'MANTLE' ? 'mantle' : 'splash',
      });
    }
    for (let i = 0; i < recentNoises.length; i++) {
      const n = recentNoises[i]!;
      combinedCues.push({
        position: n.position,
        loudness: n.loudness,
        kind: n.kind,
      });
    }

    const visualizerEnabled = this.settings.audio.soundVisualizer;
    if (visualizerEnabled && combinedCues.length > 0) {
      const reducedMotion =
        this.settings.accessibility.reducedMotion === 'on' ||
        (this.settings.accessibility.reducedMotion === 'system' &&
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches);

      for (let i = 0; i < combinedCues.length; i++) {
        const noise = combinedCues[i]!;
        const dx = noise.position.x - playerPos.x;
        const dz = noise.position.z - playerPos.z;
        const dist = Math.hypot(dx, dz);

        const worldAngle = Math.atan2(-dx, -dz);
        let relAngle = worldAngle - playerYaw;
        while (relAngle > Math.PI) relAngle -= Math.PI * 2;
        while (relAngle < -Math.PI) relAngle += Math.PI * 2;

        if (noise.loudness >= 0.5) {
          this.hud.flashDirectionArc(relAngle, noise.loudness, reducedMotion);
          const now = performance.now();
          if (now - this.lastRippleTickTime >= 1500) {
            this.audio.play('ripple_tick', { gain: 0.08 });
            this.lastRippleTickTime = now;
          }
        }

        const dir = this.getDirectionLabel(relAngle);
        const distM = Math.max(1, Math.round(dist));
        const kindLabel = this.formatKindLabel(noise.kind);

        const caption = `[${kindLabel} ~${distM}m ${dir.toUpperCase()}]`;
        this.hud.addCaption(caption);
      }
    }
  }

  private getDirectionLabel(relAngle: number): string {
    const phi = relAngle;
    const eighth = Math.PI / 8;

    if (Math.abs(phi) < eighth) return 'ahead';
    if (phi >= eighth && phi < 3 * eighth) return 'front-right';
    if (phi >= 3 * eighth && phi < 5 * eighth) return 'right';
    if (phi >= 5 * eighth && phi < 7 * eighth) return 'back-right';
    if (Math.abs(phi) >= 7 * eighth) return 'behind';
    if (phi <= -5 * eighth && phi > -7 * eighth) return 'back-left';
    if (phi <= -3 * eighth && phi > -5 * eighth) return 'left';
    return 'front-left';
  }

  private formatKindLabel(kind: string): string {
    switch (kind) {
      case 'jump_in':
      case 'splash':
        return 'Splash';
      case 'roar':
        return 'Roar';
      case 'snarl':
        return 'Growl';
      case 'footstep_wet':
        return 'Slosh';
      case 'door':
        return 'Metal Clang';
      case 'mantle':
        return 'Mantle';
      default:
        return kind.charAt(0).toUpperCase() + kind.slice(1);
    }
  }
}
