/* ── Mixer.ts ─────────────────────────────────────────────────────────────
 *  Multi-bus audio routing, ducking engine, and priority-based voice limiter.
 *  Enforces voice capacity limits based on quality tier by stealing oldest low-priority voices.
 * ──────────────────────────────────────────────────────────────────────── */

import type { QualityTier } from '../types/contracts.js';

export type AudioBusName = 'sfx' | 'ambient' | 'monster' | 'music' | 'ui';

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
  ambient: 1,
  music: 3,
  sfx: 4,
  ui: 7,
  monster: 9,
};

export const TIER_VOICE_CAPS: Record<QualityTier, number> = {
  low: 24,
  medium: 48,
  high: 96,
  auto: 48,
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

function makeSoftClipCurve(knee: number): Float32Array {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(knee * x) / Math.tanh(knee);
  }
  return curve;
}

export type OutputProfile = 'headphones' | 'speakers' | 'phone' | 'night' | 'mono';

export class Mixer {
  readonly ctx: BaseAudioContext;

  readonly masterGain: GainNode;
  readonly sfxGain: GainNode;
  readonly ambientGain: GainNode;
  readonly monsterGain: GainNode;
  readonly musicGain: GainNode;
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
  readonly masterClipper: WaveShaperNode;
  readonly stereoGain: GainNode;
  readonly monoMixGain: GainNode;
  readonly monoSplitter: ChannelSplitterNode;
  readonly monoSum: GainNode;
  readonly monoMerger: ChannelMergerNode;

  private voiceLimit = 48;
  private activeVoices = new Map<string, ManagedVoice>();
  private currentProfile: OutputProfile = 'headphones';
  private listeningDipActive = false;
  private duckingEnabled = true;

  // Base volume levels configured by user settings (aligned with Settings.ts defaults)
  private baseVolumes: Record<AudioBusName | 'master', number> = {
    master: 0.85,
    sfx: 1.0,
    ambient: 0.70,
    monster: 1.15,
    music: 0.70,
    ui: 0.80,
  };

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;

    this.masterGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.ambientGain = ctx.createGain();
    this.monsterGain = ctx.createGain();
    this.musicGain = ctx.createGain();
    this.uiGain = ctx.createGain();

    // Initialize gains at safe baseline levels
    const now = ctx.currentTime;
    this.masterGain.gain.setValueAtTime(this.baseVolumes.master, now);
    this.sfxGain.gain.setValueAtTime(this.baseVolumes.sfx, now);
    this.ambientGain.gain.setValueAtTime(this.baseVolumes.ambient, now);
    this.monsterGain.gain.setValueAtTime(this.baseVolumes.monster, now);
    this.musicGain.gain.setValueAtTime(this.baseVolumes.music, now);
    this.uiGain.gain.setValueAtTime(this.baseVolumes.ui, now);

    // Ambient HF Tilt Filter (atmospheric tilt driven by dread)
    this.ambientTiltFilter = ctx.createBiquadFilter();
    this.ambientTiltFilter.type = 'lowpass';
    this.ambientTiltFilter.frequency.value = 18000;
    this.ambientTiltFilter.Q.value = 0.707;
    this.ambientGain.connect(this.ambientTiltFilter);

    // 1. 25 Hz 12 dB/oct Sub-Bass Highpass filter
    this.subBassHighpass = ctx.createBiquadFilter();
    this.subBassHighpass.type = 'highpass';
    this.subBassHighpass.frequency.value = 25.0;
    this.subBassHighpass.Q.value = 0.707;

    // Bus routing into sub-bass highpass
    this.sfxGain.connect(this.subBassHighpass);
    this.ambientTiltFilter.connect(this.subBassHighpass);
    this.monsterGain.connect(this.subBassHighpass);
    this.musicGain.connect(this.subBassHighpass);
    this.uiGain.connect(this.subBassHighpass);

    // 2. Main Bus Dynamics Compressor (Prompt 3.7: threshold -14.0, knee 6.0, ratio 4.0, attack 0.010, release 0.250)
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14.0;
    this.compressor.knee.value = 6.0;
    this.compressor.ratio.value = 4.0;
    this.compressor.attack.value = 0.010;
    this.compressor.release.value = 0.250;
    this.subBassHighpass.connect(this.compressor);

    // 3. Underwater lowpass muffle filter
    this.underwaterFilter = ctx.createBiquadFilter();
    this.underwaterFilter.type = 'lowpass';
    this.underwaterFilter.frequency.value = 18000;
    this.underwaterFilter.Q.value = 0.7;
    this.compressor.connect(this.underwaterFilter);

    // 4. Output Profile Equalization filters
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

    // 6. Master Limiter & WaveShaper Soft Clipper (Prompt 3.8)
    this.masterLimiter = ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -3.0;
    this.masterLimiter.knee.value = 0.0;
    this.masterLimiter.ratio.value = 20.0;
    this.masterLimiter.attack.value = 0.0005;
    this.masterLimiter.release.value = 0.080;

    if (typeof ctx.createWaveShaper === 'function') {
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeSoftClipCurve(0.891);
      shaper.oversample = '4x';
      this.masterClipper = shaper;
    } else {
      this.masterClipper = ctx.createGain() as unknown as WaveShaperNode;
    }

    this.normalGain.connect(this.masterLimiter);
    this.nightGain.connect(this.masterLimiter);
    this.masterLimiter.connect(this.masterClipper);

    // 7. Stereo vs Mono Downmix crossfade path (Prompt 3.10)
    this.stereoGain = ctx.createGain();
    this.stereoGain.gain.value = 1.0;
    this.masterClipper.connect(this.stereoGain);
    this.stereoGain.connect(this.masterGain);

    if (typeof ctx.createChannelSplitter === 'function' && typeof ctx.createChannelMerger === 'function') {
      this.monoSplitter = ctx.createChannelSplitter(2);
      this.monoSum = ctx.createGain();
      this.monoSum.gain.value = 0.7071; // -3 dB headroom for L+R sum
      this.monoMerger = ctx.createChannelMerger(2);
      this.monoMixGain = ctx.createGain();
      this.monoMixGain.gain.value = 0.0;

      this.masterClipper.connect(this.monoSplitter);
      this.monoSplitter.connect(this.monoSum, 0); // Left channel
      this.monoSplitter.connect(this.monoSum, 1); // Right channel
      this.monoSum.connect(this.monoMerger, 0, 0); // To Left
      this.monoSum.connect(this.monoMerger, 0, 1); // To Right
      this.monoMerger.connect(this.monoMixGain);
      this.monoMixGain.connect(this.masterGain);
    } else {
      this.monoSplitter = null as unknown as ChannelSplitterNode;
      this.monoSum = null as unknown as GainNode;
      this.monoMerger = null as unknown as ChannelMergerNode;
      this.monoMixGain = ctx.createGain();
      this.monoMixGain.gain.value = 0.0;
    }

    this.updateGains();
  }

  setTier(tier: QualityTier): void {
    this.voiceLimit = TIER_VOICE_CAPS[tier];
  }

  setVolumes(v: {
    master?: number | undefined;
    sfx?: number | undefined;
    ambient?: number | undefined;
    monster?: number | undefined;
    music?: number | undefined;
    ui?: number | undefined;
  }): void {
    if (v.master !== undefined) this.baseVolumes.master = v.master;
    if (v.sfx !== undefined) this.baseVolumes.sfx = v.sfx;
    if (v.ambient !== undefined) this.baseVolumes.ambient = v.ambient;
    if (v.monster !== undefined) this.baseVolumes.monster = v.monster;
    if (v.music !== undefined) this.baseVolumes.music = v.music;
    if (v.ui !== undefined) this.baseVolumes.ui = v.ui;
    this.updateGains();
  }

  setDuckingEnabled(enabled: boolean): void {
    this.duckingEnabled = enabled;
  }

  isDuckingEnabled(): boolean {
    return this.duckingEnabled;
  }

  /**
   * Smooth volume updates via linearRampToValueAtTime over 0.15s to eliminate clicks, pops,
   * and muted state lockups across scenes and configuration changes.
   */
  private rampNodeGain(node: GainNode, target: number, rampSec = 0.15): void {
    const now = this.ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(target, now + rampSec);
  }

  private updateGains(): void {
    const ambTarget = this.listeningDipActive ? this.baseVolumes.ambient * 0.40 : this.baseVolumes.ambient;
    this.rampNodeGain(this.masterGain, this.baseVolumes.master, 0.15);
    this.rampNodeGain(this.sfxGain, this.baseVolumes.sfx, 0.15);
    this.rampNodeGain(this.ambientGain, ambTarget, 0.15);
    this.rampNodeGain(this.monsterGain, this.baseVolumes.monster, 0.15);
    this.rampNodeGain(this.musicGain, this.baseVolumes.music, 0.15);
    this.rampNodeGain(this.uiGain, this.baseVolumes.ui, 0.15);
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
    if (!this.duckingEnabled) return;
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
    if (!this.duckingEnabled) return;
    const buses: AudioBusName[] = ['sfx', 'ambient', 'monster', 'music', 'ui'];
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
   * Configure output profile (Prompt 4 Section 8 D.4, Prompt 3.10 Mono Downmix crossfade).
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
      this.stereoGain.gain.setTargetAtTime(1.0, now, tau);
      this.monoMixGain.gain.setTargetAtTime(0.0, now, tau);
    } else if (profile === 'night') {
      this.profileHighpass.frequency.setTargetAtTime(10.0, now, tau);
      this.profilePresence.gain.setTargetAtTime(0.0, now, tau);
      this.normalGain.gain.setTargetAtTime(0.0, now, tau);
      this.nightGain.gain.setTargetAtTime(1.0, now, tau);
      this.stereoGain.gain.setTargetAtTime(1.0, now, tau);
      this.monoMixGain.gain.setTargetAtTime(0.0, now, tau);
    } else if (profile === 'speakers') {
      this.profileHighpass.frequency.setTargetAtTime(20.0, now, tau);
      this.profilePresence.gain.setTargetAtTime(0.8, now, tau);
      this.normalGain.gain.setTargetAtTime(1.0, now, tau);
      this.nightGain.gain.setTargetAtTime(0.0, now, tau);
      this.stereoGain.gain.setTargetAtTime(1.0, now, tau);
      this.monoMixGain.gain.setTargetAtTime(0.0, now, tau);
    } else if (profile === 'mono') {
      // True Mono Downmix with -3dB headroom and stereo/mono crossfade
      this.profileHighpass.frequency.setTargetAtTime(10.0, now, tau);
      this.profilePresence.gain.setTargetAtTime(0.0, now, tau);
      this.normalGain.gain.setTargetAtTime(1.0, now, tau);
      this.nightGain.gain.setTargetAtTime(0.0, now, tau);
      this.stereoGain.gain.setTargetAtTime(0.0, now, tau);
      this.monoMixGain.gain.setTargetAtTime(1.0, now, tau);
    } else {
      // 'headphones' or flat default
      this.profileHighpass.frequency.setTargetAtTime(10.0, now, tau);
      this.profilePresence.gain.setTargetAtTime(0.0, now, tau);
      this.normalGain.gain.setTargetAtTime(1.0, now, tau);
      this.nightGain.gain.setTargetAtTime(0.0, now, tau);
      this.stereoGain.gain.setTargetAtTime(1.0, now, tau);
      this.monoMixGain.gain.setTargetAtTime(0.0, now, tau);
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
      case 'music':
        return this.musicGain;
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
    this.musicGain.disconnect();
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
    this.masterClipper.disconnect();
    this.stereoGain.disconnect();
    this.monoSplitter.disconnect();
    this.monoSum.disconnect();
    this.monoMerger.disconnect();
    this.monoMixGain.disconnect();
    this.masterGain.disconnect();
  }
}
