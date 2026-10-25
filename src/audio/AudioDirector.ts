/* ── AudioDirector.ts ───────────────────────────────────────────────────────
 *  Dynamic tension coordinator and ambient soundscape director.
 *  Modulates subterranean drone, HF tilt, heartbeat BPM (55–140), hum brightness,
 *  reverb sends, and per-map procedural beds with randomized sparse events.
 * ──────────────────────────────────────────────────────────────────────── */

import type { AudioEngine, VoiceHandle, VoiceName } from './AudioEngine.js';
import type { MapId } from '../types/contracts.js';
import { Rng } from '../procedural/core/prng.js';

interface MapAudioConfig {
  bedType: 'triad' | 'neon_duo' | 'metro_duo' | 'single';
  singleVoice?: VoiceName;
  sparseEvents: VoiceName[];
}

export const MAP_AUDIO_CONFIGS: Record<MapId, MapAudioConfig> = {
  natatorium: {
    bedType: 'triad', // lap_loop + hum_loop + drone_loop
    sparseEvents: [
      'drip',
      'sparse_pipe_clank',
      'sparse_water_surge',
      'sparse_cavern_draft',
      'sparse_electrical_crackle',
      'monster_ambient_far',
    ],
  },
  poolrooms: {
    bedType: 'triad',
    sparseEvents: [
      'drip',
      'sparse_pipe_clank',
      'sparse_water_surge',
      'sparse_cavern_draft',
      'sparse_electrical_crackle',
      'monster_ambient_far',
    ],
  },
  orientation: {
    bedType: 'triad',
    sparseEvents: [
      'drip',
      'sparse_pipe_clank',
      'sparse_water_surge',
      'sparse_cavern_draft',
      'sparse_electrical_crackle',
    ],
  },
  utility_tunnels: {
    bedType: 'single',
    singleVoice: 'ambience_tunnels',
    sparseEvents: [
      'sparse_pipe_clank',
      'sparse_steam_hiss',
      'sparse_electrical_crackle',
      'sparse_metal_creak',
      'sparse_water_surge',
      'monster_ambient_far',
    ],
  },
  marble_atrium: {
    bedType: 'single',
    singleVoice: 'ambience_atrium',
    sparseEvents: [
      'sparse_cavern_draft',
      'sparse_pebble_fall',
      'sparse_sub_shudder',
      'sparse_pipe_clank',
      'drip',
      'monster_ambient_far',
    ],
  },
  hydro_maze: {
    bedType: 'single',
    singleVoice: 'ambience_filtration',
    sparseEvents: [
      'sparse_water_surge',
      'sparse_pipe_clank',
      'sparse_steam_hiss',
      'sparse_metal_creak',
      'drip',
      'monster_ambient_far',
    ],
  },
  drainage_core: {
    bedType: 'single',
    singleVoice: 'ambience_drain',
    sparseEvents: [
      'sparse_sub_shudder',
      'sparse_metal_creak',
      'sparse_cavern_draft',
      'sparse_water_surge',
      'monster_ambient_far',
    ],
  },
  drowned_school: {
    bedType: 'single',
    singleVoice: 'ambience_school',
    sparseEvents: [
      'creak',
      'chalk_scratch',
      'piano_clunk',
      'pa_chime',
      'pa_garble',
      'sparse_electrical_crackle',
    ],
  },
  sunken_jungle: {
    bedType: 'single',
    singleVoice: 'ambience_jungle',
    sparseEvents: [
      'bird_call',
      'insect_drone',
      'wind_leaves',
      'drip',
      'sparse_water_surge',
    ],
  },
  neon_flood: {
    bedType: 'neon_duo', // rain_loop + neon_buzz_loop
    sparseEvents: [
      'thunder',
      'siren_wail',
      'sparse_electrical_crackle',
      'drip',
      'sparse_water_surge',
    ],
  },
  drowned_metro: {
    bedType: 'metro_duo', // rail_sing_loop + train_rumble_loop
    sparseEvents: [
      'train_horn',
      'lever_clunk',
      'bottle_shatter',
      'station_announce_chime',
      'sparse_metal_creak',
    ],
  },
};

export class AudioDirector {
  private engine: AudioEngine;
  private tension = 0.0;
  private currentMapId: MapId = 'natatorium';

  private activeLoops: VoiceHandle[] = [];
  private droneLoop: VoiceHandle | null = null;

  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private sparseTimer: ReturnType<typeof setTimeout> | null = null;
  private dipTimer: ReturnType<typeof setTimeout> | null = null;

  private isAmbienceRunning = false;
  private rng = new Rng(808);
  private recentSparseEvents: string[] = [];

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  get currentTension(): number {
    return this.tension;
  }

  get currentDread(): number {
    return this.tension;
  }

  get activeMapId(): MapId {
    return this.currentMapId;
  }

  /**
   * Set game dread / tension (0..1) smoothly driving drone volume, HF tilt,
   * heartbeat BPM (55–140), and psychological "listening silence" dips.
   */
  setTension(amount: number): void {
    const prev = this.tension;
    this.tension = Math.max(0.0, Math.min(1.0, amount));

    // 1. Modulate subterranean drone
    if (this.droneLoop) {
      this.droneLoop.setParam('tension', this.tension);
    }

    // 2. Modulate ambient high-frequency tilt (Prompt 4 Section 9 E.1)
    this.engine.setAmbientHfTilt(this.tension);

    // 3. Heartbeat logic: activates at tension >= 0.25 (55 to 140 BPM)
    if (this.tension >= 0.25 && prev < 0.25) {
      this.scheduleNextHeartbeat();
    } else if (this.tension < 0.25 && this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // 4. High tension: occasional eerie "listening silence" dip
    if (this.tension >= 0.7 && !this.dipTimer) {
      this.scheduleListeningDip();
    }
  }

  /**
   * Alias for setTension matching Sound Bible terminology.
   */
  setDread(level: number): void {
    this.setTension(level);
  }

  private scheduleNextHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
    }
    if (this.tension < 0.25 || !this.isAmbienceRunning) return;

    // BPM scales from 55 to 140
    const bpm = 55.0 + this.tension * 85.0;
    const intervalMs = (60.0 / bpm) * 1000.0;

    this.engine.play('heartbeat', {
      bus: 'monster',
      intensity: 0.5 + this.tension * 0.5,
    });

    this.heartbeatTimer = setTimeout(() => {
      this.scheduleNextHeartbeat();
    }, intervalMs);
  }

  private scheduleListeningDip(): void {
    const delay = this.rng.range(15000, 35000);
    this.dipTimer = setTimeout(() => {
      if (this.tension >= 0.7 && this.isAmbienceRunning) {
        // Briefly duck ambient bus to 40% for 1.5s
        this.engine.duckBus('ambient', 0.4, 0.3, 1.5);
      }
      this.dipTimer = null;
      if (this.tension >= 0.7) {
        this.scheduleListeningDip();
      }
    }, delay);
  }

  /**
   * Start default ambience (natatorium).
   */
  startAmbience(): void {
    this.startMapAmbience(this.currentMapId);
  }

  /**
   * Start procedural map ambience bed and sparse event scheduler (Prompt 4 Section 9 E.2).
   */
  startMapAmbience(mapId?: MapId): void {
    if (mapId) {
      this.currentMapId = mapId;
    }

    // Stop existing loops
    for (const loop of this.activeLoops) {
      loop.stop(0.5);
    }
    this.activeLoops = [];
    this.droneLoop = null;

    this.isAmbienceRunning = true;
    const config = MAP_AUDIO_CONFIGS[this.currentMapId] ?? MAP_AUDIO_CONFIGS.natatorium;

    if (config.bedType === 'triad') {
      const lap = this.engine.play('lap_loop', { bus: 'ambient' });
      const hum = this.engine.play('hum_loop', { bus: 'ambient' });
      const drone = this.engine.play('drone_loop', { bus: 'ambient' });
      drone.setParam('tension', this.tension);
      this.activeLoops.push(lap, hum, drone);
      this.droneLoop = drone;
    } else if (config.bedType === 'neon_duo') {
      const rain = this.engine.play('rain_loop', { bus: 'ambient' });
      const neon = this.engine.play('neon_buzz_loop', { bus: 'ambient' });
      const drone = this.engine.play('drone_loop', { bus: 'ambient' });
      drone.setParam('tension', this.tension);
      this.activeLoops.push(rain, neon, drone);
      this.droneLoop = drone;
    } else if (config.bedType === 'metro_duo') {
      const rail = this.engine.play('rail_sing_loop', { bus: 'ambient' });
      const train = this.engine.play('train_rumble_loop', { bus: 'ambient' });
      const drone = this.engine.play('drone_loop', { bus: 'ambient' });
      drone.setParam('tension', this.tension);
      this.activeLoops.push(rail, train, drone);
      this.droneLoop = drone;
    } else if (config.singleVoice) {
      const bed = this.engine.play(config.singleVoice, { bus: 'ambient' });
      const drone = this.engine.play('drone_loop', { bus: 'ambient' });
      drone.setParam('tension', this.tension);
      this.activeLoops.push(bed, drone);
      this.droneLoop = drone;
    }

    // Initialize HF tilt
    this.engine.setAmbientHfTilt(this.tension);

    // Schedule sparse environmental events
    this.scheduleNextSparseEvent();

    if (this.tension >= 0.25) {
      this.scheduleNextHeartbeat();
    }
  }

  private scheduleNextSparseEvent(): void {
    if (this.sparseTimer) {
      clearTimeout(this.sparseTimer);
      this.sparseTimer = null;
    }
    if (!this.isAmbienceRunning) return;

    const config = MAP_AUDIO_CONFIGS[this.currentMapId] ?? MAP_AUDIO_CONFIGS.natatorium;
    const events = config.sparseEvents;
    if (events.length === 0) return;

    // Base interval scales down as tension mounts (14–26s at rest down to 7–14s in danger)
    const baseDelay = this.rng.range(14000, 26000);
    const delay = Math.max(5000, Math.floor(baseDelay * (1.0 - this.tension * 0.45)));

    this.sparseTimer = setTimeout(() => {
      if (!this.isAmbienceRunning) return;

      // Pick an event not in the recent history to prevent loop repetition within 3 minutes
      const candidates = events.filter((e) => !this.recentSparseEvents.includes(e));
      const pool = candidates.length > 0 ? candidates : events;
      const chosen = pool[this.rng.int(0, pool.length - 1)]!;

      this.engine.play(chosen, {
        bus: 'ambient',
        seed: this.rng.int(1, 99999),
      });

      this.recentSparseEvents.push(chosen);
      if (this.recentSparseEvents.length > 3) {
        this.recentSparseEvents.shift();
      }

      this.scheduleNextSparseEvent();
    }, delay);
  }

  stopAmbience(fade = 1.0): void {
    this.isAmbienceRunning = false;
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.sparseTimer) {
      clearTimeout(this.sparseTimer);
      this.sparseTimer = null;
    }
    if (this.dipTimer) {
      clearTimeout(this.dipTimer);
      this.dipTimer = null;
    }

    for (const loop of this.activeLoops) {
      loop.stop(fade);
    }
    this.activeLoops = [];
    this.droneLoop = null;
  }

  dispose(): void {
    this.stopAmbience(0);
  }
}
