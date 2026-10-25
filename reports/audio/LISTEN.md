# BackSilence Two-Minute Audio Listening Checklist

**Purpose**: Rapid verification of spatial audio, physical modeling, dynamic range, and psychoacoustic cues by the human ear.  
**Rule**: An AI browser agent cannot hear. Every subjective listening check is strictly marked **UNVERIFIED by ear** until confirmed by human listening.

---

## Instructions for the Owner

You can test these in normal gameplay or in the interactive Audio Lab by navigating to:
```
http://localhost:5173/?lab=audio
```
Wear stereo headphones with volume set to a comfortable medium level.

---

## The 12 Two-Minute Listening Checks

### 1. Water Splash (Near vs Far)
- **Status**: `UNVERIFIED by ear`
- **How to test**: Walk up to pool edge and jump into water (near), then throw pebble or listen to distant drip ripple (far).
- **What a good result sounds like**: Near splash has an immediate low-frequency cavity thump (60–100 Hz), wide stereo droplet spray, and rising bubble chirps ($f_0$ rising as cavity collapses). Far splash is filtered by distance (dulled high frequencies), softer, and has delayed early reflections before the pool hall reverberation tail.

---

### 2. Wading Through Shallow Water
- **Status**: `UNVERIFIED by ear`
- **How to test**: Walk steadily through ankle-deep water in Natatorium.
- **What a good result sounds like**: A continuous fluid slosh with discrete leg-impact thumps, followed by a wake of small trailing bubbles and water displacement. Pitch and texture jitter slightly with each stride so it never sounds like a repeating canned sample.

---

### 3. Spatial Droplet (Left vs Right Panning)
- **Status**: `UNVERIFIED by ear`
- **How to test**: Stand still in Natatorium and slowly rotate your view 360° while listening to ceiling drips.
- **What a good result sounds like**: A drip falling to your left sounds crisply in the left ear with subtle interaural time difference (ITD) and high-frequency head shadow in the right ear. As you face it, it centers smoothly with zero zipper clicks or sudden panning jumps.

---

### 4. Acoustic Space: Pool Hall vs Utility Tunnel
- **Status**: `UNVERIFIED by ear`
- **How to test**: Switch between `natatorium` and `utility_tunnels` (or walk through the connecting threshold).
- **What a good result sounds like**: Natatorium has a cavernous 3.4-second decay with long warm low-mid persistence (warm bathroom/pool tile resonance). The Utility Tunnel has a tight, claustrophobic 1.6-second decay with prominent metallic flutter and rapid high-frequency dampening.

---

### 5. Submersion / Underwater Transition
- **Status**: `UNVERIFIED by ear`
- **How to test**: Submerge camera underwater in deep pool.
- **What a good result sounds like**: Instantaneous psychoacoustic shift — highs above 600 Hz are aggressively rolled off, ambient room reverb vanishes, leaving deep, close, muffled low-frequency gurgles, fluid pressure thrum, and isolated heartbeat/internal sounds.

---

### 6. Creature Roar & Vocalization
- **Status**: `UNVERIFIED by ear`
- **How to test**: Trigger monster alert or trigger `monster_roar` in Audio Lab.
- **What a good result sounds like**: A terrifying organic vocal tract resonance: deep glottal pulse onset (80 -> 55 Hz), period doubling (subharmonic roughness), 25–35 Hz throat amplitude flutter, and sweeping vocal formants (F1: 700->400 Hz, F2: 1100->800 Hz) that sound like an agonizing scream rather than a synthetic synth lead.

---

### 7. Wet Tile Footstep Squelch
- **Status**: `UNVERIFIED by ear`
- **How to test**: Step out of the pool onto dry tile.
- **What a good result sounds like**: A dual-contact sound: crisp ceramic heel tap (1.8–3 kHz) followed 15 ms later by a soft rubber sole suction/squelch release. Zero hollow synthetic beep artifacts.

---

### 8. Physiological Heartbeat (Dread Scaling)
- **Status**: `UNVERIFIED by ear`
- **How to test**: Allow monster to approach or set tension/dread slider in Audio Lab from 0.0 to 1.0.
- **What a good result sounds like**: At low dread, heartbeat is completely silent. As dread exceeds 0.5, a subtle sub-bass "lub-dub" (55 BPM) fades in; at dread 0.9, it accelerates toward 130 BPM with heavier thump and slight chest cavity resonance.

---

### 9. The Quiet Moment (Silence Budget)
- **Status**: `UNVERIFIED by ear`
- **How to test**: Stand still in an empty room for 15 seconds without moving.
- **What a good result sounds like**: Ambient room bed drops to a whisper (below -50 dBFS RMS). You hear only faint distant pipe creaks, subtle air draft, and occasional solitary water drops. The silence feels heavy, anticipatory, and liminal.

---

### 10. UI Interaction Feedback
- **Status**: `UNVERIFIED by ear`
- **How to test**: Hover and click menu buttons or inventory slots.
- **What a good result sounds like**: Soft, wet, organic acoustic clicks (inharmonic glass/water tick) that fit the liminal pool aesthetic rather than generic loud electronic arcade beeps.

---

### 11. Jumpscare Stinger & Dynamic Bus Ducking
- **Status**: `UNVERIFIED by ear`
- **How to test**: Trigger jumpscare stinger in Audio Lab.
- **What a good result sounds like**: A sudden explosive transient peaking cleanly without harsh digital clipping (-1.0 dBTP master limiter). Instantly ducks ambient and music buses by 12 dB for 1.2 seconds, leaving a ringing high-frequency tinnitus tail before ambient sound rushes back in.

---

### 12. Listening Dip (Stillness Reward)
- **Status**: `UNVERIFIED by ear`
- **How to test**: Walk for 5 seconds, then stop dead still and listen.
- **What a good result sounds like**: After 1.5 seconds of stillness, the ambient water drone automatically dips to ~40% volume, making distant creature footsteps or far water splashes sharply distinct and audible.
