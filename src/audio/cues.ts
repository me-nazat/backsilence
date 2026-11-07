/* ── cues.ts ───────────────────────────────────────────────────────────────
 *  Acoustic Cue Specifications & Profile Registry.
 *  Defines exact synthesized physical frequency bands, damping factors,
 *  and reverb profiles for natatorium sound design:
 *  - wade_step: 400 Hz – 2800 Hz filtered transients with cathedral reverb decay
 *  - splash_jump: 400 Hz – 2800 Hz filtered transients with cathedral reverb decay
 *  - splash_big: 400 Hz – 2800 Hz filtered transients with cathedral reverb decay
 *  - monster_roar: sub-bass chest rumble (55–110 Hz), wet guttural formant growl (220–680 Hz),
 *    and echoing high-frequency screech (2400–3600 Hz) for REAR_UP_ROAR
 * ──────────────────────────────────────────────────────────────────────── */

export interface AudioCueProfile {
  id: string;
  minFreq: number;
  maxFreq: number;
  resonanceQ?: number;
  decayType: 'cathedral' | 'dry' | 'damped';
  reverbSendGain: number;
  subBassRumble?: [number, number];
  formantGrowl?: [number, number];
  screechSfx?: [number, number];
}

export const AUDIO_CUES: Record<string, AudioCueProfile> = {
  wade_step: {
    id: 'wade_step',
    minFreq: 400,
    maxFreq: 2800,
    resonanceQ: 2.2,
    decayType: 'cathedral',
    reverbSendGain: 0.48,
  },
  splash_jump: {
    id: 'splash_jump',
    minFreq: 400,
    maxFreq: 2800,
    resonanceQ: 2.2,
    decayType: 'cathedral',
    reverbSendGain: 0.65,
  },
  splash_big: {
    id: 'splash_big',
    minFreq: 400,
    maxFreq: 2800,
    resonanceQ: 2.2,
    decayType: 'cathedral',
    reverbSendGain: 0.68,
  },
  monster_roar: {
    id: 'monster_roar',
    minFreq: 55,
    maxFreq: 3600,
    decayType: 'cathedral',
    reverbSendGain: 0.65,
    subBassRumble: [55, 110],
    formantGrowl: [220, 680],
    screechSfx: [2400, 3600],
  },
};

export function getAudioCueProfile(cueName: string): AudioCueProfile | undefined {
  return AUDIO_CUES[cueName];
}

