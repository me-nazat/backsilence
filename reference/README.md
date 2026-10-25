# Reference Kit Instructions (`reference/README.md`)

This folder structure stores reference frames and notes for visual calibration of the water system, reflections, lighting, and monster presentation.

## Folder Structure
```
reference/
  README.md
  video/frames/        20 to 40 PNG stills, 1280 px wide or more
  video/notes.md       one line per frame: what it shows and the camera height
  audio/               (used by the sound prompt, ignore here)
```

## How to Fill the Reference Kit

1. Pause the reference video at 20 to 40 moments:
   - Calm water surface looking along axis
   - Calm water surface at grazing angle
   - Close-up of slab edge / shoreline foam
   - Monster wading in water (wake trails, dark droplets)
   - Splash eruptions (crown at 0.1s, dispersing at 0.5s, foam ring at 1.2s)
   - Ceiling drip rings and ripples
   - Close-up of submerged tile floor through water
   - Wall of tiles / pillar waterline tidemark
   - Horizon haze / blown-out sky fade
2. Save screenshots as PNG files in `reference/video/frames/` (e.g. `f_001.png`, `f_002.png`, ...).
3. If `ffmpeg` is installed and you have `video.mp4`:
   ```bash
   ffmpeg -i video.mp4 -vf "fps=1,scale=1280:-1" reference/video/frames/f_%03d.png
   ```
4. For each frame, add a one-line entry in `reference/video/notes.md` detailing:
   `[frame_filename]: [what it shows], camera height: [X.X]m`

## Audio Reference Kit (Prompt 4 Section 2)
```
reference/
  README.md
  audio/clip_01.wav ... clip_08.wav   20 to 60 s each, 44.1 kHz stereo
  audio/notes.md                       one line per clip: what is audible, at what time
```

### How to Extract Audio Clips with ffmpeg:
Extract 20 to 60 second clips (44.1 kHz stereo 16-bit WAV) from source footage:
```bash
# Example extracting a 40-second clip starting at 00:00:10
ffmpeg -i video.mp4 -vn -ac 2 -ar 44100 -ss 00:00:10 -t 40 reference/audio/clip_01.wav
```
Prefer clips with:
- Ambience (pool hall room tone, low hum, water lapping)
- Wading through shallow water
- Water splashes (small, medium, heavy)
- Single dripping bubble tones with reverberant tails
- Distant creature breathing, footfalls, or roars
- Moments of near silence

In `reference/audio/notes.md`, record one line per clip:
`clip_01.wav: Pool hall room tone with distant water drops, no speech, 00:10-00:50`

### Fallback: Sound Bible (Prompt 4 Section 3)
When external reference audio is not provided:
1. Near silence is baseline: room tone sits around -52 to -46 dBFS RMS (low 100/120 Hz hum, air hiss > 4 kHz, slow lapping).
2. Large tiled pool hall reverb: 3.0 to 3.8s at 500 Hz, shorter at high frequencies (1.4s at 8 kHz), early reflections in first 80ms.
3. Liquid bubble physics: van den Doel model $f_0 = 3/r$, damping $d = 0.043 f_0 + 0.0014 f_0^{1.5}$, pitch rise $f(t) = f_0(1+0.1dt)$.
4. Creature voice: glottal pulse source, jitter/shimmer, period doubling, 3 moving formants (F1, F2, F3), AM throat growl 20–40 Hz.
5. Dynamic range: calm -34 to -30 LUFS, splash -20, roar -14, jumpscare peak -1 dBTP ducking other buses.

