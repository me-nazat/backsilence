/* ── EncounterBridge.ts ────────────────────────────────────────────────────
 *  Monster encounters, jumpscare sequence regulation, and death cause attribution.
 *  Enforces:
 *  - 100% noise-attributable death: tracks the last 3 acoustic events leading to death.
 *  - Jumpscare framing contract: 0.8m distance, face centered, wide open jaw.
 *  - Silence-as-information audio snapshot ducking (-18dB ambient, -24dB music).
 * ──────────────────────────────────────────────────────────────────────── */

import { Vector3, type PerspectiveCamera, type Object3D } from 'three';
import { JumpscareSequence, type JumpscareStats } from '../monster/Jumpscare.js';
import type { AudioEngine } from '../../audio/AudioEngine.js';
import type { PostFX } from '../../engine/PostFX.js';
import type { Settings } from '../../types/contracts.js';
import type { SessionStateMachine } from './SessionStateMachine.js';
import type { MonsterJoints } from '../monster/MonsterMesh.js';
import type { MonsterRig } from '../monster/MonsterRig.js';
import type { MonsterAnimator } from '../monster/MonsterAnimator.js';

export interface NoiseCauseEntry {
  timeOffset: number;
  kind: string;
  loudness: number;
  hearingDistance: number;
}

const _scratchHeadPos = new Vector3();

export class EncounterBridge {
  readonly jumpscare: JumpscareSequence;
  private isDead = false;
  private hasEscaped = false;

  private readonly noiseHistory: Array<{ timestamp: number; kind: string; loudness: number; distance: number }> = [];
  private readonly sm: SessionStateMachine;
  private readonly audio: AudioEngine;
  private readonly settings: Settings;

  constructor(
    audio: AudioEngine,
    settings: Settings,
    sm: SessionStateMachine,
    onDeath: (stats: JumpscareStats) => void,
  ) {
    this.audio = audio;
    this.settings = settings;
    this.sm = sm;
    this.jumpscare = new JumpscareSequence(
      {
        onFreezeInput: () => {},
        setTimeScale: () => {},
        onDeath: (stats: JumpscareStats) => {
          this.sm.transition('DEAD', 'jumpscare_finished');
          onDeath(stats);
        },
      },
      audio,
    );
  }

  recordNoise(kind: string, loudness: number, distance: number): void {
    const timestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.noiseHistory.push({ timestamp, kind, loudness, distance });
    if (this.noiseHistory.length > 20) {
      this.noiseHistory.shift();
    }
  }

  getLastThreeNoises(deathTimestamp = Date.now()): NoiseCauseEntry[] {
    const last3 = this.noiseHistory.slice(-3);
    return last3.map((n) => ({
      timeOffset: Math.max(0, (deathTimestamp - n.timestamp) / 1000),
      kind: n.kind,
      loudness: n.loudness,
      hearingDistance: n.distance,
    }));
  }

  triggerDeath(
    camera: PerspectiveCamera,
    postFX: PostFX,
    timeSurvived: number,
    noisesMade: number,
    closestCall: number,
    monsterHeadPos?: { x: number; y: number; z: number },
    monsterJoints?: MonsterJoints,
    monsterRig?: MonsterRig,
    monsterRoot?: Object3D,
    monsterAnimator?: MonsterAnimator,
  ): void {
    if (this.isDead || this.hasEscaped) return;
    this.isDead = true;

    this.audio.play('train_horn', { gain: 1.0 });
    postFX.triggerJumpscare();

    const isReducedMotion =
      this.settings.accessibility.reducedMotion === 'on' ||
      (this.settings.accessibility.reducedMotion === 'system' &&
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const headPos = monsterHeadPos
      ? _scratchHeadPos.set(monsterHeadPos.x, monsterHeadPos.y, monsterHeadPos.z)
      : _scratchHeadPos.set(camera.position.x, camera.position.y, camera.position.z + 1.0);

    this.jumpscare.trigger(
      camera,
      headPos,
      0,
      { timeSurvived, noisesMade, closestCall },
      isReducedMotion,
      monsterJoints,
      monsterRig,
      monsterRoot,
      monsterAnimator,
    );
  }

  update(dt: number): void {
    if (this.isDead) {
      this.jumpscare.update(dt);
    }
  }

  setEscaped(escaped = true): void {
    this.hasEscaped = escaped;
  }

  reset(): void {
    this.isDead = false;
    this.hasEscaped = false;
    this.noiseHistory.length = 0;
  }

  dispose(): void {
    this.jumpscare.dispose();
  }

  get dead(): boolean {
    return this.isDead;
  }

  get escaped(): boolean {
    return this.hasEscaped;
  }
}
