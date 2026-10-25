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

export type OutputProfile = 'headphones' | 'speakers' | 'phone' | 'night' | 'mono';

export class Mixer {
  readonly ctx: BaseAudioContext;

  readonly masterGain: GainNode;
  readonly sfxGain: GainNode;
  readonly ambientGain: GainNode;
  readonly monsterGain: GainNode;
  readonly uiGain: GainNode;

  readonly subBassHighpass: BiquadFilterNode;
  readonly ambientTiltFilter: BiquadFilterNode;
  readonly compressor: DynamicsCompressorNode;
  readonly underwaterFilter: BiquadFilterNode;
  readonly profileHighpass: BiquadFilterNode;
  readonly profilePresence: BiquadFilterNode;
  readonly nightCompressor: DynamicsCompressorNode;
  readonly nightGain: GainNode;
  readonly normalGain: GainNode;
  readonly masterLimiter: DynamicsCompressorNode;

  private voiceLimit = 32;
  private activeVoices = new Map<string, ManagedVoice>();
  private currentProfile: OutputProfile = 'headphones';
  private listeningDipActive = false;

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

    // Ambient HF Tilt Filter (Prompt 4 Section 9 E.1: atmospheric tilt driven by dread)
    this.ambientTiltFilter = ctx.createBiquadFilter();
    this.ambientTiltFilter.type = 'lowpass';
    this.ambientTiltFilter.frequency.value = 18000;
    this.ambientTiltFilter.Q.value = 0.707;
    this.ambientGain.connect(this.ambientTiltFilter);

    // 1. 25 Hz 12 dB/oct Sub-Bass Highpass filter (Section 8 D.1)
    this.subBassHighpass = ctx.createBiquadFilter();
    this.subBassHighpass.type = 'highpass';
    this.subBassHighpass.frequency.value = 25.0;
    this.subBassHighpass.Q.value = 0.707;

    // Bus routing into sub-bass highpass
    this.sfxGain.connect(this.subBassHighpass);
    this.ambientTiltFilter.connect(this.subBassHighpass);
    this.monsterGain.connect(this.subBassHighpass);
    this.uiGain.connect(this.subBassHighpass);

    // 2. Main Bus Dynamics Compressor
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -6.0;
    this.compressor.knee.value = 12.0;
    this.compressor.ratio.value = 8.0;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.15;
    this.subBassHighpass.connect(this.compressor);

    // 3. Underwater lowpass muffle filter
    this.underwaterFilter = ctx.createBiquadFilter();
    this.underwaterFilter.type = 'lowpass';
    this.underwaterFilter.frequency.value = 18000;
    this.underwaterFilter.Q.value = 0.7;
    this.compressor.connect(this.underwaterFilter);

    // 4. Output Profile Equalization filters (Section 8 D.4)
    this.profileHighpass = ctx.createBiquadFilter();
    this.profileHighpass.type = 'highpass';
    this.profileHighpass.frequency.value = 10.0;
    this.profileHighpass.Q.value = 0.707;

    this.profilePresence = ctx.createBiquadFilter();
    this.profilePresence.type = 'peaking';
    this.profilePresence.frequency.value = 3000.0;
    this.profilePresence.Q.value = 1.2;
    this.profilePresence.gain.value = 0.0;

    this.underwaterFilter.connect(this.profileHighpass);
    this.profileHighpass.connect(this.profilePresence);

    // 5. Night Mode Dynamic Range Compression (14 dB dynamic range)
    this.nightCompressor = ctx.createDynamicsCompressor();
    this.nightCompressor.threshold.value = -18.0;
    this.nightCompressor.knee.value = 6.0;
    this.nightCompressor.ratio.value = 8.0;
    this.nightCompressor.attack.value = 0.005;
    this.nightCompressor.release.value = 0.100;

    this.nightGain = ctx.createGain();
    this.nightGain.gain.value = 0.0;
    this.normalGain = ctx.createGain();
    this.normalGain.gain.value = 1.0;

    this.profilePresence.connect(this.normalGain);
    this.profilePresence.connect(this.nightCompressor);
    this.nightCompressor.connect(this.nightGain);

    // 6. Master Brickwall Peak Limiter calibrated to -1.0 dBTP (Section 8 D.1)
    this.masterLimiter = ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -1.0;
    this.masterLimiter.knee.value = 1.0;
    this.masterLimiter.ratio.value = 20.0;
    this.masterLimiter.attack.value = 0.001;
    this.masterLimiter.release.value = 0.040;

    this.normalGain.connect(this.masterLimiter);
    this.nightGain.connect(this.masterLimiter);
    this.masterLimiter.connect(this.masterGain);

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

  /**
   * Smooth volume updates via setTargetAtTime to eliminate zipper noise (Prompt 4 Section 8 D.1).
   */
  private updateGains(): void {
    const now = this.ctx.currentTime;
    const tau = 0.020; // 20ms smoothing time constant
    this.masterGain.gain.setTargetAtTime(this.baseVolumes.master, now, tau);
    this.sfxGain.gain.setTargetAtTime(this.baseVolumes.sfx, now, tau);
    const ambTarget = this.listeningDipActive ? this.baseVolumes.ambient * 0.40 : this.baseVolumes.ambient;
    this.ambientGain.gain.setTargetAtTime(ambTarget, now, tau);
    this.monsterGain.gain.setTargetAtTime(this.baseVolumes.monster, now, tau);
    this.uiGain.gain.setTargetAtTime(this.baseVolumes.ui, now, tau);
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
    const current = bus === 'ambient' && this.listeningDipActive
      ? this.baseVolumes.ambient * 0.40
      : this.baseVolumes[bus];
    const target = current * Math.max(0.0, Math.min(1.0, duckFraction));

    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(target, now + attackSec);
    node.gain.linearRampToValueAtTime(current, now + attackSec + releaseSec);
  }

  /**
   * Duck all buses except the specified exempt bus (used for jumpscares).
   */
  duckAllExcept(
    exemptBus: AudioBusName,
    duckFraction: number,
    attackSec = 0.02,
    releaseSec = 1.2,
  ): void {
    const buses: AudioBusName[] = ['sfx', 'ambient', 'monster', 'ui'];
    for (const b of buses) {
      if (b !== exemptBus) {
        this.duck(b, duckFraction, attackSec, releaseSec);
      }
    }
  }

  /**
   * Player stillness listening dip (Prompt 4 Section 8 D.2):
   * When player remains still for >= 1.5s, drops ambience bed to 40% so subtle sounds emerge.
   */
  setListeningDip(active: boolean): void {
    this.listeningDipActive = active;
    const now = this.ctx.currentTime;
    const target = active ? this.baseVolumes.ambient * 0.40 : this.baseVolumes.ambient;
    this.ambientGain.gain.setTargetAtTime(target, now, 0.05);
  }

  /**
   * Modulate ambient high-frequency tilt based on dread (Prompt 4 Section 9 E.1):
   * Rolls off highs from 18 kHz down to 3.8 kHz as dread increases (0..1) to create claustrophobic dread.
   */
  setAmbientHfTilt(dread: number): void {
    const d = Math.max(0, Math.min(1.0, dread));
    const now = this.ctx.currentTime;
    const cutoff = 18000.0 * Math.pow(3800.0 / 18000.0, d);
    this.ambientTiltFilter.frequency.setTargetAtTime(cutoff, now, 0.05);
  }

  /**
   * Configure output profile (Prompt 4 Section 8 D.4).
   */
  setOutputProfile(profile: OutputProfile): void {
    this.currentProfile = profile;
    const now = this.ctx.currentTime;
    const tau = 0.030;

    if (profile === 'phone') {
      this.profileHighpass.frequency.setTargetAtTime(120.0, now, tau);
      this.profilePresence.gain.setTargetAtTime(3.5, now, tau);
      this.normalGain.gain.setTargetAtTime(1.0, now, tau);
      this.nightGain.gain.setTargetAtTime(0.0, now, tau);
    } else if (profile === 'night') {
      this.profileHighpass.frequency.setTargetAtTime(10.0, now, tau);
      this.profilePresence.gain.setTargetAtTime(0.0, now, tau);
      this.normalGain.gain.setTargetAtTime(0.0, now, tau);
      this.nightGain.gain.setTargetAtTime(1.0, now, tau);
    } else if (profile === 'speakers') {
      this.profileHighpass.frequency.setTargetAtTime(20.0, now, tau);
      this.profilePresence.gain.setTargetAtTime(0.8, now, tau);
      this.normalGain.gain.setTargetAtTime(1.0, now, tau);
      this.nightGain.gain.setTargetAtTime(0.0, now, tau);
    } else {
      // 'headphones', 'mono' or flat default
      this.profileHighpass.frequency.setTargetAtTime(10.0, now, tau);
      this.profilePresence.gain.setTargetAtTime(0.0, now, tau);
      this.normalGain.gain.setTargetAtTime(1.0, now, tau);
      this.nightGain.gain.setTargetAtTime(0.0, now, tau);
    }
  }

  getOutputProfile(): OutputProfile {
    return this.currentProfile;
  }

  getProfile(): OutputProfile {
    return this.currentProfile;
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
    this.subBassHighpass.disconnect();
    this.compressor.disconnect();
    this.underwaterFilter.disconnect();
    this.profileHighpass.disconnect();
    this.profilePresence.disconnect();
    this.nightCompressor.disconnect();
    this.nightGain.disconnect();
    this.normalGain.disconnect();
    this.masterLimiter.disconnect();
    this.masterGain.disconnect();
  }
}
