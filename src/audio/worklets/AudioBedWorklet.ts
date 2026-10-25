/* ── AudioBedWorklet.ts ───────────────────────────────────────────────────
 *  Prompt 4 Section 6 B3: AudioWorklet Manager for Continuous Ambience Bed.
 *  Loads worklet via ?worker&url (CSP-compliant, zero blob URLs) with
 *  transparent fallback to standard Web Audio nodes if worklet fails or is unsupported.
 * ──────────────────────────────────────────────────────────────────────── */

import workletUrl from './AmbienceProcessor.ts?worker&url';

export interface BedWorkletController {
  readonly output: AudioNode;
  setDread(dread: number): void;
  setSubmersion(amount: number): void;
  setLappingGain(gain: number): void;
  stop(fadeSec?: number): void;
}

export async function createAmbienceBedWorklet(
  ctx: BaseAudioContext,
  destination: AudioNode
): Promise<BedWorkletController> {
  // Check if AudioWorklet is supported on this context
  if (ctx.audioWorklet && typeof ctx.audioWorklet.addModule === 'function') {
    try {
      await ctx.audioWorklet.addModule(workletUrl);
      const workletNode = new AudioWorkletNode(ctx, 'ambience-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      masterGain.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 1.0);

      workletNode.connect(masterGain);
      masterGain.connect(destination);

      const dreadParam = workletNode.parameters.get('dread');
      const submersionParam = workletNode.parameters.get('submersion');
      const lappingGainParam = workletNode.parameters.get('lappingGain');

      return {
        output: masterGain,
        setDread(dread: number): void {
          if (dreadParam) {
            dreadParam.setTargetAtTime(Math.max(0, Math.min(1, dread)), ctx.currentTime, 0.05);
          }
        },
        setSubmersion(amount: number): void {
          if (submersionParam) {
            submersionParam.setTargetAtTime(Math.max(0, Math.min(1, amount)), ctx.currentTime, 0.03);
          }
        },
        setLappingGain(gain: number): void {
          if (lappingGainParam) {
            lappingGainParam.setTargetAtTime(Math.max(0, Math.min(1, gain)), ctx.currentTime, 0.05);
          }
        },
        stop(fadeSec = 0.5): void {
          const now = ctx.currentTime;
          masterGain.gain.cancelScheduledValues(now);
          masterGain.gain.setValueAtTime(masterGain.gain.value, now);
          masterGain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
          setTimeout(() => {
            try {
              workletNode.disconnect();
              masterGain.disconnect();
            } catch {
              /* ignore */
            }
          }, fadeSec * 1000 + 50);
        },
      };
    } catch (e) {
      console.warn('[AudioBedWorklet] AudioWorklet init failed; falling back to standard audio nodes', e);
    }
  }

  // Standard Web Audio node graph fallback
  return createStandardBedFallback(ctx, destination);
}

function createStandardBedFallback(
  ctx: BaseAudioContext,
  destination: AudioNode
): BedWorkletController {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.linearRampToValueAtTime(1.0, now + 1.0);

  // Lowpass filter for submersion
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(18000, now);

  // Hum oscillator (60 Hz)
  const humOsc = ctx.createOscillator();
  const humGain = ctx.createGain();
  humOsc.type = 'sine';
  humOsc.frequency.setValueAtTime(60, now);
  humGain.gain.setValueAtTime(0.02, now);
  humOsc.connect(humGain);
  humGain.connect(filter);

  // Dread thrum oscillator (40 Hz)
  const dreadOsc = ctx.createOscillator();
  const dreadGain = ctx.createGain();
  dreadOsc.type = 'sine';
  dreadOsc.frequency.setValueAtTime(40, now);
  dreadGain.gain.setValueAtTime(0.0, now);
  dreadOsc.connect(dreadGain);
  dreadGain.connect(filter);

  filter.connect(masterGain);
  masterGain.connect(destination);

  humOsc.start(now);
  dreadOsc.start(now);

  return {
    output: masterGain,
    setDread(dread: number): void {
      dreadGain.gain.setTargetAtTime(0.05 * Math.max(0, Math.min(1, dread)), ctx.currentTime, 0.05);
    },
    setSubmersion(amount: number): void {
      const clamped = Math.max(0, Math.min(1, amount));
      const target = 18000.0 * Math.pow(600.0 / 18000.0, clamped);
      filter.frequency.setTargetAtTime(target, ctx.currentTime, 0.03);
    },
    setLappingGain(): void {},
    stop(fadeSec = 0.5): void {
      const t = ctx.currentTime;
      masterGain.gain.cancelScheduledValues(t);
      masterGain.gain.setValueAtTime(masterGain.gain.value, t);
      masterGain.gain.linearRampToValueAtTime(0.0001, t + fadeSec);
      setTimeout(() => {
        try {
          humOsc.stop();
          dreadOsc.stop();
          humOsc.disconnect();
          dreadOsc.disconnect();
          filter.disconnect();
          masterGain.disconnect();
        } catch {
          /* ignore */
        }
      }, fadeSec * 1000 + 50);
    },
  };
}
