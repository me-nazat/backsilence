/* ── AmbienceProcessor.ts ──────────────────────────────────────────────────
 *  Prompt 4 Section 6 B3: AudioWorkletProcessor for Liminal Ambience Bed.
 *  Runs continuous pink/brown noise, slow Poisson liquid bubble chirps,
 *  lapping fluid modulation, and tile resonance completely off the main thread.
 * ──────────────────────────────────────────────────────────────────────── */

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}
declare function registerProcessor(name: string, processorCtor: unknown): void;
declare const sampleRate: number;

class AmbienceProcessor extends AudioWorkletProcessor {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private b3 = 0;
  private b4 = 0;
  private b5 = 0;
  private b6 = 0;
  private lastBrown = 0;

  // Lapping LFO phases
  private lfoPhase1 = 0;
  private lfoPhase2 = 0;

  // Active Poisson bubbles (up to 8 concurrent)
  private bubbles: Array<{
    f0: number;
    d: number;
    age: number;
    maxAge: number;
    amp: number;
    pan: number;
  }> = [];

  // Lowpass filter state for underwater submersion
  private lpLeft = 0;
  private lpRight = 0;

  static get parameterDescriptors() {
    return [
      { name: 'dread', defaultValue: 0.0, minValue: 0.0, maxValue: 1.0 },
      { name: 'submersion', defaultValue: 0.0, minValue: 0.0, maxValue: 1.0 },
      { name: 'lappingGain', defaultValue: 0.28, minValue: 0.0, maxValue: 1.0 },
    ];
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean {
    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const outL = output[0]!;
    const outR = output[1]!;
    const blockSize = outL.length;
    const sRate = typeof sampleRate !== 'undefined' ? sampleRate : 48000;

    const dreadParam = parameters.dread;
    const submersionParam = parameters.submersion;
    const lappingGainParam = parameters.lappingGain;

    const dread = dreadParam && dreadParam.length > 0 ? dreadParam[0]! : 0.0;
    const submersion = submersionParam && submersionParam.length > 0 ? submersionParam[0]! : 0.0;
    const lapGain = lappingGainParam && lappingGainParam.length > 0 ? lappingGainParam[0]! : 0.28;

    // LFO step increments
    const lfoInc1 = (2.0 * Math.PI * 0.07) / sRate;
    const lfoInc2 = (2.0 * Math.PI * 0.11) / sRate;

    // Submersion cutoff filter coefficient (submerged = 600 Hz, air = 18000 Hz)
    const cutoff = 18000.0 * Math.pow(600.0 / 18000.0, submersion);
    const alpha = (2.0 * Math.PI * cutoff) / sRate;
    const lpCoeff = Math.min(1.0, alpha);

    for (let i = 0; i < blockSize; i++) {
      // 1. White noise (-1..1)
      const w = Math.random() * 2.0 - 1.0;

      // 2. Paul Kellet's pink noise filter (-3 dB / octave)
      this.b0 = 0.99886 * this.b0 + w * 0.0555179;
      this.b1 = 0.99332 * this.b1 + w * 0.0750759;
      this.b2 = 0.96900 * this.b2 + w * 0.1538520;
      this.b3 = 0.86650 * this.b3 + w * 0.3104856;
      this.b4 = 0.55000 * this.b4 + w * 0.5329522;
      this.b5 = -0.7616 * this.b5 - w * 0.0168980;
      const pink = (this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + w * 0.5362) * 0.11;
      this.b6 = w * 0.115926;

      // 3. Brown noise (-6 dB / octave)
      this.lastBrown = (this.lastBrown + 0.04 * w) / 1.02;
      const brown = this.lastBrown * 2.5;

      // 4. Lapping wave modulation
      this.lfoPhase1 += lfoInc1;
      this.lfoPhase2 += lfoInc2;
      if (this.lfoPhase1 > 2 * Math.PI) this.lfoPhase1 -= 2 * Math.PI;
      if (this.lfoPhase2 > 2 * Math.PI) this.lfoPhase2 -= 2 * Math.PI;

      const mod1 = 0.5 + 0.5 * Math.sin(this.lfoPhase1);
      const mod2 = 0.5 + 0.5 * Math.sin(this.lfoPhase2);
      const lapSignalL = pink * mod1 * lapGain;
      const lapSignalR = pink * mod2 * lapGain;

      // 5. Electrical 60 Hz hum + dread sub-bass
      const humPhase = (i * 2.0 * Math.PI * 60.0) / sRate;
      const subPhase = (i * 2.0 * Math.PI * 40.0) / sRate;
      const hum = Math.sin(humPhase) * 0.018;
      const dreadThrum = Math.sin(subPhase) * (0.04 * dread);

      let sampleL = lapSignalL + brown * 0.06 + hum + dreadThrum;
      let sampleR = lapSignalR + brown * 0.06 + hum + dreadThrum;

      // 6. Poisson water bubble generation (average 1.5 drops / sec)
      if (Math.random() < 1.5 / sRate && this.bubbles.length < 8) {
        const radius = 0.0016 + Math.random() * 0.0022; // 1.6mm - 3.8mm
        const f0 = 3.0 / radius;
        const d = 0.043 * f0 + 0.0014 * Math.pow(f0, 1.5);
        this.bubbles.push({
          f0,
          d,
          age: 0,
          maxAge: Math.min(0.08, 4.0 / d),
          amp: 0.04 + Math.random() * 0.06,
          pan: Math.random() * 2.0 - 1.0,
        });
      }

      // Render active bubbles
      for (let b = this.bubbles.length - 1; b >= 0; b--) {
        const bub = this.bubbles[b]!;
        bub.age += 1.0 / sRate;
        if (bub.age >= bub.maxAge) {
          this.bubbles.splice(b, 1);
          continue;
        }

        // Rising pitch: f(t) = f0 * (1 + 0.1 * d * t)
        const phase = 2.0 * Math.PI * bub.f0 * (bub.age + 0.05 * bub.d * bub.age * bub.age);
        const env = Math.exp(-bub.d * bub.age) * Math.min(1.0, bub.age / 0.001);
        const bSig = Math.sin(phase) * env * bub.amp;

        const panL = 0.5 * (1.0 - bub.pan);
        const panR = 0.5 * (1.0 + bub.pan);
        sampleL += bSig * panL;
        sampleR += bSig * panR;
      }

      // 7. Submersion low-pass filter
      this.lpLeft += lpCoeff * (sampleL - this.lpLeft);
      this.lpRight += lpCoeff * (sampleR - this.lpRight);

      outL[i] = this.lpLeft;
      outR[i] = this.lpRight;
    }

    return true;
  }
}

registerProcessor('ambience-processor', AmbienceProcessor);
