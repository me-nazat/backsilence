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

## Fallback: Visual Bible (Section 3)
When external video footage is inaccessible or reference frames are not provided, the harness automatically falls back to the written visual bible in Section 3 of Prompt 2 and `reference/targets.json`:
1. Milky chlorinated green water, semi-opaque, brighter/paler shallow, darker deep.
2. Tiled pool floor visible through water, cracked grout lines (darker grout, larger tiles than walls).
3. Soft white specular streaks, fine bright glints flickering with motion.
4. V-shaped wake trails behind moving entities; heavy dark splashes for monster limbs.
5. Raised slabs ~0.3m above waterline with thin wet band and soft contact foam.
6. Dense warm fog fading water and distant slabs to blown-out cream white at horizon.
7. Soft camera aesthetic with bloom and gentle motion blur.
