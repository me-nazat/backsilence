# Task List — BackSilence Audio Quality & Spatial Audio (Prompt 4 of 5)

- [x] **Preconditions & Setup (Section 0 & 2)**
  - [x] 0.1 Verify `audioSelfTest()` exists and runs in headless Chrome
  - [x] 0.2 Confirm `AudioContext` reaches `running` after native gesture
  - [x] 0.3 Catalog every voice name and trigger classification (92 voices)
  - [x] 0.4 Profile busiest scene nodes (60 nodes) and compute speedup (21.1x real-time)
  - [x] 0.5 Write results to `reports/audio/preconditions.md`
  - [x] 0.6 Record Decision D094 in `DECISIONS.md`

- [x] **Phase A: Baseline Measurement & Audit (Section 2 & 5)**
  - [x] A.1 Write `scripts/audio/analyze.mjs` (Node-only WAV analyzer: RMS, peak dBFS, true peak, K-weighting LUFS, 1/3-octave bands, centroid, noise floor, Schroeder T60)
  - [x] A.2 Write `scripts/audio/compare.mjs` and `npm run audio:compare` with tolerances in `reference/audio-targets.json`
  - [x] A.3 Render baseline voices and 60s scene mixes into `reports/audio/baseline/`
  - [x] A.4 Line-by-line audio code audit in `reports/audio/audit.md` (zipper noise, clicks, ramps, pooling, CPU)
  - [x] A.5 Publish 2-minute listening checklist in `reports/audio/LISTEN.md` (12 tests, marked UNVERIFIED by ear)
  - [x] A.6 Record Decision D095 and commit Phase A

- [ ] **Phase B: Synthesis Engine Upgrades (Section 6)**
  - [ ] B.1 van den Doel liquid bubble physics ($f_0 = 3/r$, damping $d$, pitch rise $f(t) = f_0(1+0.1dt)$) for splashes, wade steps, and Poisson drips
  - [ ] B.2 Baked procedural one-shots pool (16 MB buffer pool, 8 splash variants, 6 wade steps, 6 drips, 4 footsteps, 4 monster footfalls rendered at warmup in <= 6ms slices)
  - [ ] B.3 AudioWorklet for beds (pink/brown noise, Poisson bubbles, lapping modulator, loaded via `?worker&url` with node fallback)
  - [ ] B.4 Anti-artifact guardrails (>= 5ms parameter ramps, 3ms fades, band-limited PeriodicWave > 2 kHz, 4x oversampled waveshapers, DC offset < 0.001)
  - [ ] B.5 Creature voice overhaul (glottal pulse source, jitter/shimmer, period doubling, 3 moving formants F1/F2/F3, AM throat growl 20-40 Hz, wet breath)
  - [ ] B.6 Player and interaction sounds (wet tile steps with heel/toe squelch, breath, heartbeat 55-140 BPM, inharmonic bells, clicks, ratchets)
  - [ ] B.7 Record Decision D096 and commit Phase B

- [ ] **Phase C: Space, Reverb and Distance (Section 7)**
  - [ ] C.1 Image-source early reflections (< 80ms) + octave-band filtered diffuse decay impulse responses (pool hall target: 125 Hz 3.8s, 500 Hz 3.4s, 2 kHz 2.6s, 8 kHz 1.4s) across 8 presets
  - [ ] C.2 Physical distance model: inverse distance ($d_{ref} = 2m$) + air absorption lowpass + distance-based reverb send
  - [ ] C.3 Wall occlusion model: up to 2 walls each reducing level by 6 dB and lowpass cutoff to 1.2–3 kHz
  - [ ] C.4 HRTF 3D positional audio with 30ms position ramps; listener driven by camera; wall proximity reflection boost
  - [ ] C.5 Record Decision D097 and commit Phase C

- [ ] **Phase D: Mix, Dynamics and Silence (Section 8)**
  - [ ] D.1 Hierarchical bus architecture (sfx, ambient, monster, ui, music) with 25 Hz highpass, bus gains, master limiter (-1 dBTP) and underwater filter
  - [ ] D.2 Loudness targets & ducking: calm play -34 to -30 LUFS, splash ~ -20, roar ~ -14, jumpscare -1 dBTP ducking other buses by 12 dB for 1.2s; listening dip to 40%
  - [ ] D.3 Silence budget verification: >= 20% of calm 5-minute run sits below -50 dBFS RMS
  - [ ] D.4 Output profiles in Settings: Headphones, Speakers, Phone speaker (120 Hz highpass, 3 kHz presence lift), Night mode, Mono-down
  - [ ] D.5 First-run interactive audio diagnostic test & voice priority stealing (16, 24, 32 voices)
  - [ ] D.6 Record Decision D098 and commit Phase D

- [ ] **Phase E: Adaptive and Per-Map Sound (Section 9)**
  - [ ] E.1 `AudioDirector` taking dread (0..1) driving drone level, HF tilt, heartbeat tempo, reverb send, and sparse events
  - [ ] E.2 9 per-map ambience beds with at least 5 randomized sparse events (zero loop repetition inside 3 minutes)
  - [ ] E.3 Generative menu pad with sparse plucks and pool-hall reverb; soft wet UI feedback
  - [ ] E.4 Record Decision D099 and commit Phase E

- [ ] **Phase F & G: Audio Lab, Automated Tests & Review Pack (Sections 10 & 11)**
  - [ ] F.1 Interactive Audio Lab at `?lab=audio` (voice triggers, live meter, bus mutes, A/B reference, WAV downloader)
  - [ ] F.2 Upgraded `audioSelfTest()` verifying peak < 0.98, RMS floor, finite, DC < 0.001, start/end < 0.002, tail < -60 dB, centroid range, determinism, mono-sum loss < 6 dB, zero orphan nodes
  - [ ] F.3 Automated test suite in `tests/audio-pipeline.test.ts`
  - [ ] F.4 Performance benchmark: 60s busiest scene render in <= 12s in headless Chrome; warmup <= 250ms in <= 6ms slices
  - [ ] F.5 Update `ACOUSTIC_RULEBOOK.md` (ambient fauna, flyers, cosmetic ripples never create noise events)
  - [ ] G.1 Final Review Pack in `reports/audio/review_pack.md` with all tables, LISTEN checklist, limitations, and push command
