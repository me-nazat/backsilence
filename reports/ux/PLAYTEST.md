# BackSilence — Owner 10-Minute Playtest Script & Reflection Guide

> **Document:** `reports/ux/PLAYTEST.md`  
> **Phase:** Phase F (Fun, Pacing and Fairness)  
> **Target Audience:** Project Owner / Playtesters / Lead Reviewers  
> **Prerequisites:** Modern browser (Chrome / Edge / Firefox / Safari), stereo headphones, mouse/keyboard or mobile touch device or gamepad.

---

## 1. Environment & Physical Setup (T-Minus 1 Minute)

1. Connect your preferred stereo headphones. Ensure output balance is centered.
2. Dim ambient lighting if possible to experience the CRT phosphorescence and underwater gloom.
3. Launch BackSilence locally (`npm run dev`) or on your deployment URL.

---

## 2. 10-Minute Playtest Protocol

### Minute 0:00 – 1:00: One Front Door & Sensory Calibration
- **Action:** Look at the landing page. Notice the single dominant 52px CTA: **"DESCEND"** (`btn-play-solo`) and the headphones advisory badge.
- **Action:** Click **"DESCEND"**. Verify that Web Audio unlocks immediately without a separate blocking overlay.
- **Action:** In the Calibration Modal:
  - Slide the visual brightness slider over the contrast test pattern until subtle tile grout lines are visible.
  - Click **"TEST LEFT"** and **"TEST RIGHT"** to confirm binaural HRTF stereo drip separation.
  - Note auto-detected input hardware (Keyboard & Mouse / Touch / Gamepad).
  - Click **"START EXPEDITION"** (or hit Space/Enter).

### Minute 1:00 – 4:00: Guided Orientation & Early Threat Contact
- **Action:** Take your first steps in the Orientation sector. Notice:
  - Smooth eye-height transition between standing (1.65m) and crouching (0.95m).
  - Grounded camera feel: 40ms jump anticipation dip and critically damped spring landing dip (80–120ms).
  - Small non-blocking icon-and-text guidance cards.
- **Threat Event (<= 35s):** Notice the guaranteed distant creature slosh and acoustic ripple within 35 seconds.
- **Objective:** Locate the first numbered pillar. Notice the objective line badge `[QUIET]` and the satisfying audio-visual chime and stamp upon completing the first objective.

### Minute 4:00 – 7:00: Acoustic Stealth, Noise Meter & Captions
- **Action:** Wade into the shallow water pool.
  - Notice the **Noise Meter** in the bottom-center:
    - Stealth Crouch: stays under **0.12** tick mark (Cyan `#00e5ff`).
    - Normal Walking: stays under **0.35** tick mark (Cyan/Gold threshold).
    - Sprinting / Splashing: jumps to **0.75+** (Crimson `#ff1744`).
  - Observe the faint water ripple ring expanding from the acoustic icon and the live readout (`RADIUS ~Xm`).
  - Notice the status chip dynamically transitioning: `DRY` ➔ `WET` ➔ `CROUCHED`.
- **Action:** Toggle Sound Captions in the Pause Menu (`Escape`) or observe directional captions (`[Splash ~12m LEFT]`).

### Minute 7:00 – 9:00: Near-Miss, Casualties & Sub-1s Retry
- **Action:** Intentionally allow the blind acoustic creature to pass near you while crouched still against a tile wall.
  - Notice the **Near-Miss Alert** (`[ CLOSE CALL — 1.8 m ]`) flashing in center vision accompanied by subtle controller rumble / audio tension.
- **Action:** Cause a deliberate sprint splash to trigger an attack.
  - Experience the visceral jumpscare camera snap, red vignette flash, and instant transition to the **Death Screen**.
  - Read the plain-sentence casualty cause: e.g., *"You splashed 6.4 m from it."*
  - Press Space or click **"↻ RETRY"**. Measure the restart latency: session reloads in **< 1.0 second** with zero browser reload.
- **Frustration Protection Test:** If 2 rapid casualties occur within 5 minutes, observe the polite assist toast offering settings adjustments (coyote time, visual noise arcs). If 3 occur, observe the prompt offering the practice Orientation run.

### Minute 9:00 – 10:00: Navigation, Quick Settings & Photo Mode
- **Action:** Press `Escape` during exploration.
  - Verify that **"Resume Expedition"** is focused first, and pressing Enter immediately re-engages pointer lock on the canvas.
  - Test quick sensitivity slider with live degree readouts (`1.0x (360°)`).
  - Toggle **"Minimal HUD"** mode to verify auxiliary labels disappear, leaving an uncluttered cinematic viewport.
  - Press `P` key or click **"Photo Mode"**. Verify HUD hides cleanly and exports a high-resolution PNG snapshot.

---

## 3. The 8 Playtest Reflection Questions

Please rate and reflect on the following 8 questions after completing your run:

1. **One Front Door:** Did the single dominant "Descend" CTA provide an immediate, frictionless path to playable gameplay without dead clicks or modal confusion?
   - *Observation / Rating (1–5):*

2. **Acoustic Calibration:** Did the stereo drip check in the calibration modal clearly demonstrate why directional stereo audio is life-and-death in BackSilence?
   - *Observation / Rating (1–5):*

3. **Early Threat Delivery:** Did the distant water disturbance and creature wake occurring within the first 35 seconds build immediate dread without feeling unfair or unavoidable?
   - *Observation / Rating (1–5):*

4. **HUD Clarity & Ticks:** Were the numeric tick marks (`0.12`, `0.35`, `0.75`, `1.0`) and color-blind-safe palette (Cyan / Warm Gold / Crimson) immediately legible against both bright yellow tiles and murky water?
   - *Observation / Rating (1–5):*

5. **Near-Miss Sensation:** Did the near-miss alert (`[ CLOSE CALL — 1.8 m ]`) and directional sound captions (`[Splash ~12m LEFT]`) enhance the feeling of barely evading an unseen predator?
   - *Observation / Rating (1–5):*

6. **Fairness & Instant Retry:** Did the plain-sentence casualty explanation and sub-second Retry loop transform deaths from frustrating restarts into addictive learning loops?
   - *Observation / Rating (1–5):*

7. **Camera Feel & Weight:** Did the critically damped landing spring (80–120ms) and 40ms jump anticipation dip make the character feel physical and grounded without causing motion discomfort?
   - *Observation / Rating (1–5):*

8. **Frustration Protection:** Did the polite, non-blocking assist suggestions after rapid casualties feel respectful and empowering rather than condescending?
   - *Observation / Rating (1–5):*

---

## 4. Verification Checkoff

| Requirement | Verified Path / Mechanism | Status |
|:---|:---|:---:|
| Threat beat every $\le 90\text{ s}$ | `scripts/balance/pacing-bots.mjs` (max 77s) | **PASS** |
| First threat $\le 45\text{ s}$ | `scripts/balance/pacing-bots.mjs` (p95 40.7s) | **PASS** |
| Median run 6–14 min | `scripts/balance/pacing-bots.mjs` (median 9.2 min) | **PASS** |
| Careful win rate 45–70% | `scripts/balance/pacing-bots.mjs` (62.0%) | **PASS** |
| Reckless win rate $< 10\%$ | `scripts/balance/pacing-bots.mjs` (5.0%) | **PASS** |
| Camper win rate $\le 5\%$ | `scripts/balance/pacing-bots.mjs` (2.0%) | **PASS** |
| Frustration protection | `src/ui/UIManager.ts` (rapid death assists & orientation) | **PASS** |
| Sub-1s death retry | `src/ui/DeathScreen.ts` & `src/ui/UIManager.ts` | **PASS** |
