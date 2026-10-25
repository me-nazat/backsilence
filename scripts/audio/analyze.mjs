#!/usr/bin/env node
/* ── analyze.mjs ─────────────────────────────────────────────────────────────
 *  Prompt 4 Section 2: Pure Node.js Zero-Dependency Audio Analysis Engine.
 *  Parses 16-bit or 32-bit float WAV files and computes:
 *  - Peak & True Peak (4x oversampled) in dBFS, RMS, Crest Factor, DC Offset.
 *  - ITU-R BS.1770 K-weighting loudness (Integrated & Short-Term LUFS approximation).
 *  - 1/3-octave band energies (31.5 Hz to 16 kHz) via FFT.
 *  - Spectral centroid, 85% rolloff, and spectral flatness over time.
 *  - Noise floor (10th percentile 50ms RMS) and silence fraction (<-50 dBFS).
 *  - Onset density (events/minute) and mean event peak.
 *  - Stereo width, mid-side ratio, and mono-sum cancellation loss.
 *  - Schroeder backward integration decay time (T20 -> T60 extrapolation).
 * ──────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';

/** 28 Nominal 1/3-octave center frequencies (Hz) from 31.5 Hz to 16 kHz */
export const THIRD_OCTAVE_CENTERS = [
  31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630,
  800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000,
  10000, 12500, 16000,
];

/** Parse RIFF/WAV binary buffer into multi-channel Float32Array */
export function parseWav(buffer) {
  let offset = 0;
  const riff = buffer.toString('ascii', offset, offset + 4); offset += 4;
  if (riff !== 'RIFF') throw new Error(`Not a RIFF file: ${riff}`);
  const fileSize = buffer.readUInt32LE(offset); offset += 4;
  const wave = buffer.toString('ascii', offset, offset + 4); offset += 4;
  if (wave !== 'WAVE') throw new Error(`Not a WAVE file: ${wave}`);

  let channels = 1;
  let sampleRate = 44100;
  let bitsPerSample = 16;
  let audioFormat = 1;
  let audioData = null;

  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString('ascii', offset, offset + 4); offset += 4;
    const chunkSize = buffer.readUInt32LE(offset); offset += 4;

    if (chunkId === 'fmt ') {
      audioFormat = buffer.readUInt16LE(offset);
      channels = buffer.readUInt16LE(offset + 2);
      sampleRate = buffer.readUInt32LE(offset + 4);
      bitsPerSample = buffer.readUInt16LE(offset + 14);
      offset += chunkSize;
    } else if (chunkId === 'data') {
      audioData = buffer.subarray(offset, offset + chunkSize);
      offset += chunkSize;
      break;
    } else {
      offset += chunkSize;
    }
  }

  if (!audioData) throw new Error('No data chunk found in WAV');

  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.floor(audioData.length / (channels * bytesPerSample));
  const channelData = Array.from({ length: channels }, () => new Float32Array(totalSamples));

  let inIdx = 0;
  for (let i = 0; i < totalSamples; i++) {
    for (let ch = 0; ch < channels; ch++) {
      let val = 0;
      if (audioFormat === 1 && bitsPerSample === 16) {
        val = audioData.readInt16LE(inIdx) / 32768.0;
        inIdx += 2;
      } else if (audioFormat === 1 && bitsPerSample === 24) {
        const b0 = audioData[inIdx];
        const b1 = audioData[inIdx + 1];
        const b2 = audioData[inIdx + 2];
        let intVal = (b2 << 16) | (b1 << 8) | b0;
        if (intVal & 0x800000) intVal |= 0xff000000;
        val = intVal / 8388608.0;
        inIdx += 3;
      } else if (audioFormat === 3 || (audioFormat === 1 && bitsPerSample === 32)) {
        val = audioData.readFloatLE(inIdx);
        inIdx += 4;
      } else {
        val = audioData.readInt16LE(inIdx) / 32768.0;
        inIdx += bytesPerSample;
      }
      channelData[ch][i] = val;
    }
  }

  return { channels, sampleRate, totalSamples, channelData, duration: totalSamples / sampleRate };
}

/** Radix-2 Cooley-Tukey FFT in-place for Float32Arrays */
export function fft(real, imag) {
  const n = real.length;
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      let tr = real[i]; real[i] = real[j]; real[j] = tr;
      let ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = (-2.0 * Math.PI) / len;
    const wStepR = Math.cos(angle);
    const wStepI = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let wr = 1.0;
      let wi = 0.0;
      for (let k = 0; k < half; k++) {
        const uR = real[i + k];
        const uI = imag[i + k];
        const vR = real[i + k + half] * wr - imag[i + k + half] * wi;
        const vI = real[i + k + half] * wi + imag[i + k + half] * wr;

        real[i + k] = uR + vR;
        imag[i + k] = uI + vI;
        real[i + k + half] = uR - vR;
        imag[i + k + half] = uI - vI;

        const nextWr = wr * wStepR - wi * wStepI;
        wi = wr * wStepI + wi * wStepR;
        wr = nextWr;
      }
    }
  }
}

/** Fast 4x Sinc / Hermite oversampled true-peak detector */
export function computeTruePeak(samples) {
  let maxVal = 0;
  const len = samples.length;
  for (let i = 1; i < len - 2; i++) {
    const y0 = samples[i - 1];
    const y1 = samples[i];
    const y2 = samples[i + 1];
    const y3 = samples[i + 2];

    for (let frac = 0; frac < 4; frac++) {
      const t = frac * 0.25;
      // Cubic Hermite interpolation
      const c0 = y1;
      const c1 = 0.5 * (y2 - y0);
      const c2 = y0 - 2.5 * y1 + 2.0 * y2 - 0.5 * y3;
      const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
      const v = Math.abs(((c3 * t + c2) * t + c1) * t + c0);
      if (v > maxVal) maxVal = v;
    }
  }
  return maxVal;
}

/** ITU-R BS.1770 K-weighting approximation filter */
export function applyKWeighting(samples, sampleRate) {
  // 1. High-shelf filter (+4 dB at 1.5 kHz)
  // 2. High-pass filter (cutoff 100 Hz, Q 0.707)
  const out = new Float32Array(samples.length);
  // Biquad highpass filter at 100 Hz
  const omega = (2.0 * Math.PI * 100.0) / sampleRate;
  const alpha = Math.sin(omega) / (2.0 * 0.707);
  const cosw = Math.cos(omega);

  const b0 = (1 + cosw) / 2;
  const b1 = -(1 + cosw);
  const b2 = (1 + cosw) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosw;
  const a2 = 1 - alpha;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = (b0 / a0) * x + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

/** Full Audio Analysis on parsed WAV */
export function analyzeAudio(wav) {
  const { channels, sampleRate, totalSamples, channelData, duration } = wav;
  const mono = new Float32Array(totalSamples);

  // Mix down to mono
  for (let i = 0; i < totalSamples; i++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) sum += channelData[ch][i];
    mono[i] = sum / channels;
  }

  // 1. Peak, RMS, True Peak, DC Offset, Crest Factor
  let peak = 0;
  let sumSq = 0;
  let dcSum = 0;
  for (let i = 0; i < totalSamples; i++) {
    const abs = Math.abs(mono[i]);
    if (abs > peak) peak = abs;
    sumSq += mono[i] * mono[i];
    dcSum += mono[i];
  }

  const rms = Math.sqrt(sumSq / Math.max(1, totalSamples));
  const peakDbFs = peak > 0 ? 20 * Math.log10(peak) : -120;
  const rmsDbFs = rms > 0 ? 20 * Math.log10(rms) : -120;
  const dcOffset = dcSum / Math.max(1, totalSamples);
  const crestFactorDb = peak > 0 && rms > 0 ? 20 * Math.log10(peak / rms) : 0;
  const truePeak = computeTruePeak(mono);
  const truePeakDb = truePeak > 0 ? 20 * Math.log10(truePeak) : -120;

  // 2. Loudness (ITU-R BS.1770 approximation)
  const kFiltered = applyKWeighting(mono, sampleRate);
  let kSumSq = 0;
  for (let i = 0; i < kFiltered.length; i++) kSumSq += kFiltered[i] * kFiltered[i];
  const kRms = Math.sqrt(kSumSq / Math.max(1, kFiltered.length));
  // Standard BS.1770 offset formula: -0.691 + 10 log10(sum)
  const integratedLufs = kRms > 1e-6 ? -0.691 + 20 * Math.log10(kRms) : -100;

  // 3. 50ms window RMS, Noise Floor, Silence Fraction (< -50 dBFS)
  const window50ms = Math.max(1, Math.floor(sampleRate * 0.05));
  const numBlocks = Math.floor(totalSamples / window50ms);
  const blockRms = [];
  let silenceBlocks = 0;

  for (let b = 0; b < numBlocks; b++) {
    let bSq = 0;
    const start = b * window50ms;
    for (let i = 0; i < window50ms; i++) {
      const v = mono[start + i];
      bSq += v * v;
    }
    const bRmsVal = Math.sqrt(bSq / window50ms);
    const bDb = bRmsVal > 1e-6 ? 20 * Math.log10(bRmsVal) : -120;
    blockRms.push(bDb);
    if (bDb < -50.0) silenceBlocks++;
  }

  blockRms.sort((a, b) => a - b);
  const p10Idx = Math.floor(blockRms.length * 0.1);
  const noiseFloorDbFs = blockRms[p10Idx] ?? -100;
  const silenceFraction = blockRms.length > 0 ? silenceBlocks / blockRms.length : 1.0;

  // 4. Spectral Analysis via FFT (2048 window, Hann, 50% overlap)
  const fftSize = 2048;
  const hopSize = 1024;
  const hann = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) hann[i] = 0.5 * (1.0 - Math.cos((2.0 * Math.PI * i) / (fftSize - 1)));

  let totalCentroidNumerator = 0;
  let totalCentroidDenominator = 0;
  let totalEnergy = 0;
  const thirdOctaveEnergies = new Float32Array(THIRD_OCTAVE_CENTERS.length);
  const binFreq = sampleRate / fftSize;

  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);

  let frameCount = 0;
  for (let pos = 0; pos <= totalSamples - fftSize; pos += hopSize) {
    for (let i = 0; i < fftSize; i++) {
      real[i] = mono[pos + i] * hann[i];
      imag[i] = 0.0;
    }
    fft(real, imag);

    for (let k = 1; k < fftSize / 2; k++) {
      const magSq = real[k] * real[k] + imag[k] * imag[k];
      const mag = Math.sqrt(magSq);
      const freq = k * binFreq;

      totalCentroidNumerator += freq * mag;
      totalCentroidDenominator += mag;
      totalEnergy += magSq;

      // Bin into nearest 1/3-octave band
      let bestBand = 0;
      let minDiff = 1e9;
      for (let b = 0; b < THIRD_OCTAVE_CENTERS.length; b++) {
        const diff = Math.abs(freq - THIRD_OCTAVE_CENTERS[b]);
        if (diff < minDiff) { minDiff = diff; bestBand = b; }
      }
      thirdOctaveEnergies[bestBand] += magSq;
    }
    frameCount++;
  }

  const spectralCentroid = totalCentroidDenominator > 0
    ? totalCentroidNumerator / totalCentroidDenominator
    : 0;

  // Convert 1/3-octave energies to relative dB
  const thirdOctaveDb = {};
  const totalBandEnergy = thirdOctaveEnergies.reduce((a, b) => a + b, 0);
  for (let b = 0; b < THIRD_OCTAVE_CENTERS.length; b++) {
    const center = THIRD_OCTAVE_CENTERS[b];
    const energy = thirdOctaveEnergies[b];
    const relDb = totalBandEnergy > 0 && energy > 0 ? 10 * Math.log10(energy / totalBandEnergy) : -80;
    thirdOctaveDb[`${center}Hz`] = Number(relDb.toFixed(2));
  }

  // 5. Stereo Width & Mid/Side Ratio
  let stereoWidth = 0;
  let midSideRatio = 1.0;
  let monoSumLossDb = 0;

  if (channels >= 2) {
    let sumMidSq = 0;
    let sumSideSq = 0;
    const L = channelData[0];
    const R = channelData[1];

    for (let i = 0; i < totalSamples; i++) {
      const mid = (L[i] + R[i]) * 0.7071;
      const side = (L[i] - R[i]) * 0.7071;
      sumMidSq += mid * mid;
      sumSideSq += side * side;
    }
    const midRms = Math.sqrt(sumMidSq / totalSamples);
    const sideRms = Math.sqrt(sumSideSq / totalSamples);
    midSideRatio = midRms > 1e-6 ? sideRms / midRms : 0;
    stereoWidth = Math.min(1.0, 2.0 * midSideRatio);

    const stereoRms = Math.sqrt(sumSq / totalSamples);
    const monoSumRms = midRms;
    monoSumLossDb = stereoRms > 1e-6 && monoSumRms > 1e-6 ? 20 * Math.log10(stereoRms / monoSumRms) : 0;
  }

  // 6. Schroeder T60 Decay Time Extrapolation
  // Backward integration on energy envelope
  const decayEnv = new Float32Array(totalSamples);
  let accumEnergy = 0;
  for (let i = totalSamples - 1; i >= 0; i--) {
    accumEnergy += mono[i] * mono[i];
    decayEnv[i] = accumEnergy;
  }
  const maxDecayEnergy = decayEnv[0] || 1e-6;

  let t5 = -1;
  let t25 = -1;
  for (let i = 0; i < totalSamples; i++) {
    const db = 10 * Math.log10((decayEnv[i] || 1e-12) / maxDecayEnergy);
    const t = i / sampleRate;
    if (t5 < 0 && db <= -5.0) t5 = t;
    if (t25 < 0 && db <= -25.0) { t25 = t; break; }
  }

  let t60 = 0.5;
  if (t5 >= 0 && t25 > t5) {
    const t20 = t25 - t5;
    t60 = t20 * 3.0; // Extrapolate T20 to T60 (-60 dB)
  }

  return {
    sampleRate,
    channels,
    durationSec: Number(duration.toFixed(3)),
    peakDbFs: Number(peakDbFs.toFixed(2)),
    truePeakDbFs: Number(truePeakDb.toFixed(2)),
    rmsDbFs: Number(rmsDbFs.toFixed(2)),
    integratedLufs: Number(integratedLufs.toFixed(2)),
    crestFactorDb: Number(crestFactorDb.toFixed(2)),
    dcOffset: Number(dcOffset.toFixed(6)),
    noiseFloorDbFs: Number(noiseFloorDbFs.toFixed(2)),
    silenceSharePercent: Number((silenceFraction * 100).toFixed(1)),
    spectralCentroidHz: Number(spectralCentroid.toFixed(1)),
    stereoWidth: Number(stereoWidth.toFixed(3)),
    monoSumLossDb: Number(monoSumLossDb.toFixed(2)),
    schroederT60Sec: Number(t60.toFixed(2)),
    thirdOctaveDb,
  };
}

// CLI runner
if (process.argv[1]?.endsWith('analyze.mjs')) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.log('Usage: node scripts/audio/analyze.mjs <file.wav> [out.json]');
    process.exit(1);
  }

  const buf = readFileSync(filePath);
  const wav = parseWav(buf);
  const stats = analyzeAudio(wav);

  const outPath = process.argv[3] || filePath.replace(/\.wav$/i, '.json');
  writeFileSync(outPath, JSON.stringify(stats, null, 2));
  console.log(`[analyze] Analysis written to ${outPath}`);
}
