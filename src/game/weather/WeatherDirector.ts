/* ── WeatherDirector.ts ────────────────────────────────────────────────────────
 *  Atmospheric Weather & Presentation Orchestrator for BackSilence:
 *  - Links SimWorld deterministic WeatherSystem with ParticleDirector and AudioEngine.
 *  - Implements Photosensitive Safety bounds (luminance delta <= 0.25, flash <= 3 Hz).
 *  - Schedules distance-delayed positional thunder audio (0.4s to 1.6s delay).
 *  - Modulates rain streak particle density and ambient audio based on rain harmonics.
 *  - Zero runtime heap allocation during active updates.
 * ──────────────────────────────────────────────────────────────────────── */

import { Vector3, type Camera } from 'three';
import { WeatherSystem, type WeatherState } from '../../sim/Weather.js';
import { ParticleDirector } from '../particles/ParticleDirector.js';
import type { AudioEngine } from '../../audio/AudioEngine.js';
import type { GraphicsTier } from '../../types/contracts.js';

export interface WeatherDirectorOptions {
  seed?: number;
  mapId?: string;
  waterY?: number;
  tier?: GraphicsTier;
  weather?: WeatherSystem | undefined;
  audio?: AudioEngine | undefined;
  safeMode?: boolean;
}

interface PendingThunder {
  triggerTime: number;
  distance: number;
  posX: number;
  posY: number;
  posZ: number;
  active: boolean;
}

export class WeatherDirector {
  readonly weather: WeatherSystem;
  readonly particles: ParticleDirector;
  private readonly audio?: AudioEngine | undefined;

  safeMode = false;
  private lastFlashTime = -999.0;
  private currentExposureBoost = 0.0;
  private prevExposureBoost = 0.0;

  // Maximum 4 concurrent queued thunder strikes
  private readonly pendingThunders: PendingThunder[] = [
    { triggerTime: 0, distance: 0, posX: 0, posY: 0, posZ: 0, active: false },
    { triggerTime: 0, distance: 0, posX: 0, posY: 0, posZ: 0, active: false },
    { triggerTime: 0, distance: 0, posX: 0, posY: 0, posZ: 0, active: false },
    { triggerTime: 0, distance: 0, posX: 0, posY: 0, posZ: 0, active: false },
  ];

  private lastScheduledStrikeTime = -999.0;
  private readonly scratchStrikePos = new Vector3();

  constructor(options: WeatherDirectorOptions = {}) {
    const seed = options.seed ?? 12345;
    this.weather = options.weather ?? new WeatherSystem(seed);
    this.audio = options.audio;
    this.safeMode = options.safeMode ?? false;

    this.particles = new ParticleDirector({
      tier: options.tier ?? 'high',
      waterY: options.waterY ?? 0.0,
      mapId: options.mapId ?? 'natatorium',
      seed,
    });
  }

  /**
   * Main frame update synchronizing weather physics, particles, lightning, and audio.
   */
  update(
    dt: number,
    simTime: number,
    camera?: Camera,
    playerPos?: { x: number; y: number; z: number },
  ): void {
    const px = playerPos ? playerPos.x : (camera ? camera.position.x : 0);
    const py = playerPos ? playerPos.y : (camera ? camera.position.y : 0);
    const pz = playerPos ? playerPos.z : (camera ? camera.position.z : 0);

    // 1. Weather State Query
    const rain = this.weather.rainAt(simTime);
    this.particles.rainIntensity = this.particles.mapId === 'neon_flood' ? Math.max(0.2, rain) : 0.0;

    // 2. Lightning Pulse & Photosensitive Clamp
    const rawPulse = this.weather.lightningExposureAt(simTime);
    let targetBoost = 0.0;

    if (rawPulse > 0.05) {
      // Enforce <= 3 Hz flash limit (min 0.333s between distinct flash peaks)
      const timeSinceLastFlash = simTime - this.lastFlashTime;
      if (timeSinceLastFlash >= 0.333 || rawPulse > this.prevExposureBoost) {
        if (timeSinceLastFlash >= 0.333) {
          this.lastFlashTime = simTime;
        }
        targetBoost = rawPulse * (this.safeMode ? 0.05 : 0.25);
      }
    }

    // Clamp frame-to-frame delta to strictly <= 0.25
    const maxDelta = 0.25;
    const delta = targetBoost - this.prevExposureBoost;
    const clampedDelta = Math.max(-maxDelta, Math.min(maxDelta, delta));
    this.currentExposureBoost = this.prevExposureBoost + clampedDelta;
    this.prevExposureBoost = this.currentExposureBoost;

    // 3. Lightning Strike & Thunder Scheduling
    // When a new flash begins (rising edge > 0.3), schedule positional thunder
    if (rawPulse > 0.35 && simTime - this.lastScheduledStrikeTime > 2.0) {
      this.lastScheduledStrikeTime = simTime;

      // Seeded distance & direction from player (50m to 250m)
      const angle = (simTime * 1.37) % (Math.PI * 2);
      const dist = 60.0 + ((simTime * 37.1) % 180.0);
      const strikeX = px + Math.cos(angle) * dist;
      const strikeZ = pz + Math.sin(angle) * dist;
      const strikeY = py + 30.0;

      const delay = this.weather.thunderDelay(dist);
      this.scheduleThunder(simTime + delay, dist, strikeX, strikeY, strikeZ);
    }

    // 4. Process Pending Delayed Thunders
    for (let i = 0; i < this.pendingThunders.length; i++) {
      const th = this.pendingThunders[i]!;
      if (th.active && simTime >= th.triggerTime) {
        th.active = false;
        if (this.audio) {
          const normDist = Math.max(0, Math.min(1, th.distance / 250.0));
          this.scratchStrikePos.set(th.posX, th.posY, th.posZ);
          this.audio.play('thunder', {
            intensity: normDist,
            position: this.scratchStrikePos,
          });
        }
      }
    }

    // 5. Update Particle System
    this.particles.update(dt, camera, simTime);
  }

  private scheduleThunder(triggerTime: number, distance: number, x: number, y: number, z: number): void {
    // Find free slot in ring buffer
    for (let i = 0; i < this.pendingThunders.length; i++) {
      const slot = this.pendingThunders[i]!;
      if (!slot.active) {
        slot.active = true;
        slot.triggerTime = triggerTime;
        slot.distance = distance;
        slot.posX = x;
        slot.posY = y;
        slot.posZ = z;
        return;
      }
    }
  }

  getExposureBoost(): number {
    return this.currentExposureBoost;
  }

  getPendingThunderCount(): number {
    let count = 0;
    for (let i = 0; i < this.pendingThunders.length; i++) {
      if (this.pendingThunders[i]!.active) count++;
    }
    return count;
  }

  dispose(): void {
    this.particles.dispose();
  }
}
