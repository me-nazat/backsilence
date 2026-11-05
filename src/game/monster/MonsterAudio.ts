/* ── MonsterAudio.ts ────────────────────────────────────────────────────────
 *  Positional audio manager for a single monster instance.
 *  Maintains continuous breathing loop and triggers roars, snarls, sniffs,
 *  and footfall audio synchronized with state transitions and footsteps.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../../types/contracts.js';
import type { AudioEngine, VoiceHandle } from '../../audio/AudioEngine.js';
import type { MonsterBrainState, MonsterSnapshot } from '../../sim/MonsterBrain.js';

export class MonsterAudio {
  readonly id: string;
  private readonly audio: AudioEngine;
  private breathLoop: VoiceHandle | null = null;
  private lastState: MonsterBrainState = 'DORMANT';
  private gallopTimer = 0;
  private snarlTimer = 0;
  private sniffTimer = 0;
  private stalkTimer = 4.0;
  private closeHeartbeatTimer = 0.8;
  private standoffTimer = 1.0;

  constructor(id: string, audio: AudioEngine) {
    this.id = id;
    this.audio = audio;
  }

  /**
   * Telegraph acoustic cue (Prompt 6 Phase C):
   * Sub-bass pulse + low wade stinger ~1.5s pre-sight.
   */
  playTelegraph(pos?: Vec3): void {
    const p = pos ?? { x: 0, y: 0, z: 0 };
    this.audio.play('heartbeat', {
      position: p,
      gain: 0.50,
      bus: 'monster',
    });
    this.audio.play('monster_wade', {
      position: p,
      gain: 0.60,
      bus: 'monster',
    });
  }

  /**
   * Post-encounter quiet bed (Prompt 6 Phase C):
   * Ducks mix into tinnitus-quiet snapshot.
   */
  triggerTinnitusQuiet(): void {
    this.audio.applySnapshot('tinnitus_quiet', 0.40);
  }

  update(dt: number, snapshot: MonsterSnapshot, listenerPos: Vec3): void {
    const pos = snapshot.pos;
    const dx = pos.x - listenerPos.x;
    const dy = pos.y - listenerPos.y;
    const dz = pos.z - listenerPos.z;
    const dist = Math.hypot(dx, dy, dz);

    // 1. Maintain breath loop with 3D HRTF spatial panner
    if (!this.breathLoop) {
      this.breathLoop = this.audio.play('monster_breath_loop', {
        position: pos,
        gain: 0.25,
        monsterDistance: dist,
        bus: 'monster',
      });
    }

    if (this.breathLoop) {
      this.breathLoop.setPosition(pos);

      // Louder when listening or stalking close (Prompt 3.4: state gains 0.30/0.80/1.00/0.65)
      let targetGain = 0.30;
      if (snapshot.state === 'WANDER' && Math.hypot(snapshot.vel.x, snapshot.vel.z) < 0.1) {
        // Listening pause
        targetGain = 0.80;
      } else if (snapshot.state === 'ALERTED' || snapshot.state === 'HUNT') {
        targetGain = 1.00;
      } else if (snapshot.state === 'INVESTIGATE') {
        targetGain = 0.65;
      }

      // Close proximity (< 6m): Introduce organic rattle / sub-vocal tension, capped at -10 dBFS (~0.316)
      if (dist < 6.0) {
        targetGain = Math.min(0.316, targetGain * 1.25);
      }

      this.breathLoop.setParam('volume', targetGain);
    }

    // 2. Far/Mid Stalking acoustic cues (8m – 20m): subtle wet clicks & faint displacement ripples
    if (dist >= 8.0 && dist <= 20.0) {
      this.stalkTimer -= dt;
      if (this.stalkTimer <= 0) {
        this.audio.play('pebble_plink', {
          position: pos,
          gain: 0.18,
          monsterDistance: dist,
          bus: 'monster',
        });
        this.stalkTimer = 4.5 + Math.random() * 4.0;
      }
    } else {
      this.stalkTimer = 3.0;
    }

    // 3. Close Proximity acoustic cues (< 6m): soft muffled heartbeat pulse and sub-vocal growl
    if (dist < 6.0) {
      this.closeHeartbeatTimer -= dt;
      if (this.closeHeartbeatTimer <= 0) {
        this.audio.play('heartbeat', {
          position: listenerPos,
          gain: 0.28, // -10 dBFS max cap
          bus: 'monster',
        });
        this.closeHeartbeatTimer = 0.85;
      }
    } else {
      this.closeHeartbeatTimer = 0.4;
    }

    // 3.5. High-Speed Water-Thrashing Gallop (Section 4.1):
    // ~3.2 times per second during ALERT_AND_CHARGE / HUNT
    // ~1.1 times per second during PATROL / WANDER / RETREAT_PROWL
    const speed = Math.hypot(snapshot.vel.x, snapshot.vel.z);
    const isCharging = snapshot.state === 'ALERT_AND_CHARGE' || snapshot.state === 'HUNT';
    const isPatrolling = snapshot.state === 'PATROL' || snapshot.state === 'WANDER' || snapshot.state === 'RETREAT_PROWL';

    if (speed > 0.4 && (isCharging || isPatrolling)) {
      this.gallopTimer -= dt;
      if (this.gallopTimer <= 0) {
        const strideInterval = isCharging ? (1.0 / 3.2) : (1.0 / 1.1);
        this.gallopTimer = strideInterval;
        this.audio.play('monster_gallop_slam', {
          position: pos,
          gain: isCharging ? 0.95 : 0.65,
          monsterDistance: dist,
          bus: 'monster',
        });
        // Prompt 6 Phase C Layer (c): spatialized low wet clicks alongside steady 1.1s stalk footfalls
        if (!isCharging) {
          this.audio.play('pebble_plink', {
            position: pos,
            gain: 0.15,
            monsterDistance: dist,
            bus: 'monster',
          });
        }
      }
    } else {
      this.gallopTimer = 0.08;
    }

    // 4. State transition sounds (Roar on ALERT, ALERT_AND_CHARGE, ARRIVE_AND_ROAR, HUNT lunge)
    if (snapshot.state !== this.lastState) {
      if (
        snapshot.state === 'ALERTED' ||
        snapshot.state === 'ALERT_AND_CHARGE' ||
        snapshot.state === 'ARRIVE_AND_ROAR'
      ) {
        this.audio.play('creature_roar', {
          position: pos,
          gain: 1.0,
          monsterDistance: dist,
          bus: 'monster',
        });
      } else if (snapshot.state === 'HUNT' || snapshot.state === 'ATTACK') {
        // Prompt 6 Phase C Layer (e): lunge riser / jumpscare snapshot ducking
        this.audio.applySnapshot('jumpscare', 0.25);
        this.audio.play('creature_roar', {
          position: pos,
          gain: 1.0,
          monsterDistance: dist,
          bus: 'monster',
        });
      }
      this.lastState = snapshot.state;
    }

    // 5. Periodic behavioral sounds (Prompt 3.12: snarl 4.0+rand*3.0s, sniff 3.5+rand*2.5s)
    if (snapshot.state === 'BLOCKED') {
      // Prompt 6 Phase C Layer (d): Standoff agitated click bursts + water disturbance
      this.standoffTimer -= dt;
      if (this.standoffTimer <= 0) {
        this.audio.play('pebble_plink', {
          position: pos,
          gain: 0.20,
          monsterDistance: dist,
          bus: 'monster',
        });
        this.audio.play('splash_small', {
          position: pos,
          gain: 0.35,
          monsterDistance: dist,
          bus: 'monster',
        });
        this.standoffTimer = 1.6 + Math.random() * 0.8;
      }

      this.snarlTimer -= dt;
      if (this.snarlTimer <= 0) {
        this.audio.play('monster_snarl', {
          position: pos,
          gain: 0.8,
          monsterDistance: dist,
          bus: 'monster',
        });
        this.snarlTimer = 4.0 + Math.random() * 3.0;
      }
    } else {
      this.snarlTimer = 0.5;
      this.standoffTimer = 1.0;
    }

    if (snapshot.state === 'INVESTIGATE') {
      this.sniffTimer -= dt;
      if (this.sniffTimer <= 0) {
        this.audio.play('monster_sniff', {
          position: pos,
          gain: 0.7,
          monsterDistance: dist,
          bus: 'monster',
        });
        this.sniffTimer = 3.5 + Math.random() * 2.5;
      }
    } else {
      this.sniffTimer = 1.0;
    }
  }

  dispose(): void {
    if (this.breathLoop) {
      this.breathLoop.stop(0.2);
      this.breathLoop = null;
    }
  }
}
