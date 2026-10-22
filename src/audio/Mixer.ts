/* ── Mixer.ts ─────────────────────────────────────────────────────────────
 *  Multi-bus audio routing, ducking engine, and priority-based voice limiter.
 *  Enforces voice capacity limits based on quality tier by stealing oldest low-priority voices.
 * ──────────────────────────────────────────────────────────────────────── */

import type { QualityTier } from '../types/contracts.js';

export type AudioBusName = 'sfx' | 'ambient' | 'monster' | 'ui';

export interface ManagedVoice {
  id: string;
  name: string;
  bus: AudioBusName;
  /** 0 = lowest (ambient drips), 10 = highest (jumpscare, critical UI) */
  priority: number;
  startTime: number;
  stop: (fadeSec?: number) => void;
}

export const BUS_PRIORITIES: Record<AudioBusName, number> = {
  ambient: 2,
  sfx: 5,
  monster: 8,
  ui: 9,
};

export const TIER_VOICE_CAPS: Record<QualityTier, number> = {
  low: 16,
  medium: 32,
  high: 64,
  auto: 32,
};

/**
 * Pure function: Selects the voice to steal when capacity is exceeded.
 * Steals the lowest priority voice; if tied, steals the oldest (smallest startTime).
 */
export function selectVoiceToSteal(
  voices: readonly ManagedVoice[],
): ManagedVoice | null {
  if (voices.length === 0) return null;

  let candidate: ManagedVoice = voices[0]!;

  for (let i = 1; i < voices.length; i++) {
    const v = voices[i]!;
    if (v.priority < candidate.priority) {
      candidate = v;
    } else if (v.priority === candidate.priority && v.startTime < candidate.startTime) {
      candidate = v;
    }
  }

  return candidate;
}

export class Mixer {
  readonly ctx: BaseAudioContext;

  readonly masterGain: GainNode;
  readonly sfxGain: GainNode;
  readonly ambientGain: GainNode;
  readonly monsterGain: GainNode;
  readonly uiGain: GainNode;

  readonly compressor: DynamicsCompressorNode;
  readonly underwaterFilter: BiquadFilterNode;

  private voiceLimit = 32;
  private activeVoices = new Map<string, ManagedVoice>();

  // Base volume levels configured by user settings
  private baseVolumes: Record<AudioBusName | 'master', number> = {
    master: 0.8,
    sfx: 1.0,
    ambient: 0.85,
    monster: 1.0,
    ui: 0.9,
  };

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;

    this.masterGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.ambientGain = ctx.createGain();
    this.monsterGain = ctx.createGain();
    this.uiGain = ctx.createGain();

    // Dynamics compressor to prevent hard clipping on loud jump scares
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -6.0;
    this.compressor.knee.value = 12.0;
    this.compressor.ratio.value = 8.0;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.15;

    // Underwater lowpass muffle filter
    this.underwaterFilter = ctx.createBiquadFilter();
    this.underwaterFilter.type = 'lowpass';
    this.underwaterFilter.frequency.value = 18000;
    this.underwaterFilter.Q.value = 0.7;

    // Bus routing:
    // SFX/Ambient/Monster/UI -> Compressor -> UnderwaterFilter -> MasterGain -> Destination
    this.sfxGain.connect(this.compressor);
    this.ambientGain.connect(this.compressor);
    this.monsterGain.connect(this.compressor);
    this.uiGain.connect(this.compressor);

    this.compressor.connect(this.underwaterFilter);
    this.underwaterFilter.connect(this.masterGain);

    this.updateGains();
  }

  setTier(tier: QualityTier): void {
    this.voiceLimit = TIER_VOICE_CAPS[tier];
  }

  setVolumes(v: {
    master?: number;
    sfx?: number;
    ambient?: number;
    monster?: number;
    ui?: number;
  }): void {
    if (v.master !== undefined) this.baseVolumes.master = v.master;
    if (v.sfx !== undefined) this.baseVolumes.sfx = v.sfx;
    if (v.ambient !== undefined) this.baseVolumes.ambient = v.ambient;
    if (v.monster !== undefined) this.baseVolumes.monster = v.monster;
    if (v.ui !== undefined) this.baseVolumes.ui = v.ui;
    this.updateGains();
  }

  private updateGains(): void {
    const now = this.ctx.currentTime;
    this.masterGain.gain.setValueAtTime(this.baseVolumes.master, now);
    this.sfxGain.gain.setValueAtTime(this.baseVolumes.sfx, now);
    this.ambientGain.gain.setValueAtTime(this.baseVolumes.ambient, now);
    this.monsterGain.gain.setValueAtTime(this.baseVolumes.monster, now);
    this.uiGain.gain.setValueAtTime(this.baseVolumes.ui, now);
  }

  /**
   * Duck a specific bus by an amount for a given duration.
   */
  duck(
    bus: AudioBusName,
    duckFraction: number,
    attackSec = 0.05,
    releaseSec = 1.2,
  ): void {
    const node = this.getBusNode(bus);
    const now = this.ctx.currentTime;
    const current = this.baseVolumes[bus];
    const target = current * Math.max(0.0, Math.min(1.0, duckFraction));

    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(target, now + attackSec);
    node.gain.linearRampToValueAtTime(current, now + attackSec + releaseSec);
  }

  /**
   * Register a new voice, stealing an existing one if the tier limit is exceeded.
   */
  registerVoice(voice: ManagedVoice): void {
    if (this.activeVoices.size >= this.voiceLimit) {
      const victim = selectVoiceToSteal(Array.from(this.activeVoices.values()));
      if (victim) {
        victim.stop(0.01);
        this.activeVoices.delete(victim.id);
      }
    }
    this.activeVoices.set(voice.id, voice);
  }

  unregisterVoice(id: string): void {
    this.activeVoices.delete(id);
  }

  getActiveVoiceCount(): number {
    return this.activeVoices.size;
  }

  getBusNode(bus: AudioBusName): GainNode {
    switch (bus) {
      case 'sfx':
        return this.sfxGain;
      case 'ambient':
        return this.ambientGain;
      case 'monster':
        return this.monsterGain;
      case 'ui':
        return this.uiGain;
    }
  }

  /**
   * Sweep underwater lowpass filter: 0 = air (18 kHz), 1 = submerged (600 Hz).
   */
  setUnderwater(amount: number): void {
    const clamped = Math.max(0.0, Math.min(1.0, amount));
    const now = this.ctx.currentTime;
    // Logarithmic frequency sweep
    const targetFreq = 18000.0 * Math.pow(600.0 / 18000.0, clamped);
    this.underwaterFilter.frequency.cancelScheduledValues(now);
    this.underwaterFilter.frequency.setValueAtTime(
      this.underwaterFilter.frequency.value,
      now,
    );
    this.underwaterFilter.frequency.exponentialRampToValueAtTime(
      Math.max(200, targetFreq),
      now + 0.15,
    );
  }

  dispose(): void {
    for (const v of this.activeVoices.values()) {
      v.stop(0);
    }
    this.activeVoices.clear();
    this.sfxGain.disconnect();
    this.ambientGain.disconnect();
    this.monsterGain.disconnect();
    this.uiGain.disconnect();
    this.compressor.disconnect();
    this.underwaterFilter.disconnect();
    this.masterGain.disconnect();
  }
}
