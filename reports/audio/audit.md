# BackSilence Audio Code Audit (Prompt 4 Phase A)

**Date**: 2026-10-25  
**Auditor**: Antigravity Audio Engineering  
**Scope**: Full line-by-line audit of procedural Web Audio synthesis engine (`src/audio/**`)  
**Baseline Health**: 3 / 13 bible criteria passing (23%); 60 active nodes in busiest scene; compute speedup 21.11x real-time.

---

## 1. Executive Summary

BackSilence's audio architecture is 100% procedural with zero runtime asset dependencies, meeting strict deployment invariants. However, the initial synthesis implementation exhibits classic early-stage Web Audio synthesis flaws:
1. **Dynamic node allocation churn**: Every splash, step, and drip instantiates 5 to 28 discrete Web Audio nodes without object pooling or buffer baking.
2. **Zipper noise**: User volume and bus parameter updates directly use `setValueAtTime()` without interpolation time constants or linear ramps.
3. **Disconnection leaks**: Intermediate filters and oscillators are stopped but not disconnected, relying solely on garbage collection.
4. **Physical synthesis gaps**: Splashes and drips utilize arbitrary linear/exponential sweeps instead of the fluid physics (van den Doel bubble model); the creature uses naive sawtooth/square waveforms without glottal flow modeling, period doubling, or throat amplitude modulation.
5. **Reverb mismatch**: Impulse responses have fixed exponential decay (~1.8–2.0s T60) rather than image-source early reflections + octave-band filtered diffuse tails matching the 3.4s pool-hall target.

---

## 2. Detailed Findings by Category

### 2.1 Zipper Noise & Abrupt Parameter Jumps
- **`src/audio/Mixer.ts:138-142` (`updateGains`)**:
  - `this.masterGain.gain.setValueAtTime(this.baseVolumes.master, now);`
  - When the player adjusts the master, sfx, ambient, or monster sliders in Settings, the volume changes discontinuously within a single audio quantum (128 samples), producing audible clicks and zipper distortion.
  - *Remediation*: Replace `setValueAtTime` with `setTargetAtTime(target, now, 0.020)` (20 ms smoothing).
- **`src/audio/AudioEngine.ts:462` (position updates)**:
  - Positional updates directly assign or rapidly jump panner coordinates without smoothing ramps.
  - *Remediation*: Use 30 ms linear ramps on positional audio and listener orientation.

### 2.2 Click Discontinuities at Voice Start & End
- **`src/audio/voices/Splashes.ts:35`**:
  - `voiceGain.gain.setValueAtTime(0.7 * intensity, now);`
  - Starts abruptly at 0.7 amplitude without a 3 ms zero-crossing fade-in envelope. If the underlying noise source phase aligns with a non-zero sample, an audible transient click is injected.
  - *Remediation*: Always start gain at 0.0001 at `now` and `linearRampToValueAtTime` to target over 3–5 ms.
- **`src/audio/voices/Footsteps.ts:28, 57`**:
  - Footstep click and low thump gain start at 0.8 and 0.5 instantaneously without attack ramps.
  - *Remediation*: Add 2 ms linear attack ramp.

### 2.3 Waveshaper Distortion & Oscillator Aliasing
- **`src/audio/voices/Monster.ts:58, 74, 95-97`**:
  - Uses native `'sawtooth'` and `'square'` oscillators directly feeding an overdriven `WaveShaperNode` with `oversample = '2x'`.
  - While native Web Audio oscillators use bandlimited tables internally, driving them into a non-linear transfer function ($k=18$) generates high-order harmonics that wrap around Nyquist (24 kHz / 48 kHz).
  - *Remediation*: Upgrade `shaper.oversample` to `'4x'`, insert an anti-aliasing 12 kHz lowpass filter before the shaper, and use band-limited PeriodicWave tables for custom harmonic series.

### 2.4 Physical Modeling Deficits
- **`src/audio/voices/Splashes.ts:78-83` & `Footsteps.ts:227`**:
  - Drips currently sweep downward: `freq * 0.9` (falling pitch). In real hydrodynamics (Minnaert / van den Doel 2005), water cavity surface tension causes bubble pitch to *rise* over its lifetime ($f(t) = f_0(1 + 0.1 d t)$).
  - Splash bubble clouds currently use 3–12 random sine sweeps with uncalibrated frequencies rather than radius-dependent bubble statistics ($f_0 = 3/r$, damping $d = 0.043 f_0 + 0.0014 f_0^{1.5}$).
- **`src/audio/voices/Monster.ts:42-125`**:
  - Monster roar is modeled as a simple FM synth with parallel bandpasses, sounding like an electronic synth lead rather than an organic, terrifying liminal predator.
  - Missing: Rosenberg C glottal pulse, pitch jitter (1.2%), amplitude shimmer (2.5%), subharmonic period doubling (bifurcation), and 25–35 Hz AM throat growl.

### 2.5 Reverb Architecture & Acoustic Space
- **`src/audio/Reverb.ts:80-133` (`createImpulseResponse`)**:
  - Reverb impulse responses are generated purely from decaying white noise with exponential decay ($e^{-t \cdot decay}$).
  - Lacks image-source early reflections (< 80 ms) for geometric wall cues.
  - Diffuse tail is not band-split, resulting in uniform decay across frequencies rather than long bass resonance (3.8s at 125 Hz) and air-absorbed high-frequency rolloff (1.4s at 8 kHz).
- **Constant Reverb Send**:
  - Multiple voices (`Splashes.ts:37`, `Footsteps.ts:30`, `Monster.ts:54`) connect directly to `reverbSend` with a fixed static gain (0.5), ignoring the player's physical distance from reflecting walls.

### 2.6 Dynamic Node Allocation & Resource Pooling
- **`Splashes.ts`, `Footsteps.ts`, `Interactables.ts`**:
  - Every single sound event allocates new AudioNodes and connects them into the graph.
  - At 60 steps/minute or frequent wading in water, this generates continuous object allocations and triggers garbage collection pauses on the main audio thread.
  - *Remediation*: Implement `AudioBufferPool.ts` containing 16 MB pre-baked procedural one-shot buffers (splashes, wade steps, drips, wet footsteps) rendered during warmup in $\le 6$ ms idle slices, played via pooled `AudioBufferSourceNode`s with $\pm 3\%$ pitch jitter.

### 2.7 Scheduling & Node Disconnection Leaks
- **`Splashes.ts:117-129`, `Monster.ts:144-147`, `Footsteps.ts:70-73`**:
  - All voices rely on JavaScript `setTimeout()` for cleanup. If the browser tab loses focus, `setTimeout` is throttled by Chrome (down to 1000 ms), delaying node destruction and leaking voice graph memory.
  - Oscillators and internal filters are stopped but never called with `.disconnect()`.
  - *Remediation*: Disconnect all internal nodes explicitly on stop, and hook into `AudioBufferSourceNode.onended` or scheduled AudioContext timestamps.

### 2.8 Busiest Scene Profile & Node Budget
- **Measured in Headless Chrome**:
  - Active nodes: 60 (well within the $\le 128$ node budget).
  - Compute speedup: 21.11x real-time (30s rendered in 1.42s; well within the $\le 12$s budget).
  - Voice stealing priority: Tier limits set at 16 (low), 32 (medium/auto), 64 (high). Works correctly via `Mixer.selectVoiceToSteal`.

---

## 3. Action Items by Phase

| Category | Finding | Target Phase | Status |
|---|---|---|---|
| Liquid Physics | van den Doel bubble model ($f_0 = 3/r$, pitch rise) | Phase B.1 | Pending |
| Node Churn | Pre-rendered 16 MB AudioBuffer pool for one-shots | Phase B.2 | Pending |
| Main Thread Hitch | AudioWorklet for pink/brown continuous beds | Phase B.3 | Pending |
| Distortion & Aliasing | 4x oversampling, PeriodicWave, $\ge 5$ms ramps | Phase B.4 | Pending |
| Creature Synthesis | Glottal pulse source, formants, throat growl | Phase B.5 | Pending |
| Reverb Impulse | Image-source early reflections + octave decay | Phase C.1 | Pending |
| Distance & Space | Inverse distance, air absorption, wall occlusion | Phase C.2-C.4 | Pending |
| Dynamic Range | Bus highpass 25 Hz, Master brickwall limiter | Phase D.1-D.3 | Pending |
| Output Profiles | Headphones, Speakers, Phone, Night mode | Phase D.4 | Pending |
| Map Ambiences | 9 distinct beds with sparse event generators | Phase E.2 | Pending |
