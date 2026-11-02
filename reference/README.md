# BackSilence Reference Pack Policy (Real Footage & Zero-Asset Rule)

## External Pack Policy

To preserve both the **zero-asset git policy** (no large binary `.png` or `.wav` blobs committed to git history) and **single-source-of-truth verification**, the reference pack is governed as follows:

1. **Tracked Cryptographic Manifest (`reference/frames.manifest.json`)**:
   - Committed to git and un-ignored in `.gitignore`.
   - Declares all 37 real video frames (`f_001.png` … `f_037.png`) with exact `sha256`, `bytes`, `width`, `height`, and video timestamp (`t=1s` … `t=72s` matching `reference/video/notes.md`), plus the reference soundtrack (`audio/clip_01_full.wav`) with `sha256`, `duration_s`, `sampleRate`, and `channels`.
2. **Tracked Authoritative Measurements**:
   - `reference/video/palette.json` — 17 measured median RGB/HSV colours from the owner's footage.
   - `reference/video/measured_targets.json` — measured luminance percentiles (`p5`, `median`, `p95`), saturation, black-pixel fraction (`0.0`), and audio targets.
   - `reference/video/notes.md` and `reference/audio/notes.md` — frame-by-frame and audio annotations.
3. **Untracked Local Binary Pack**:
   - `reference/video/frames/f_001.png` … `f_037.png` (first 3 frames full 720×1280 portrait; frames 4–37 cropped to the 720×910 game region).
   - `reference/audio/clip_01_full.wav` (72.94 s, 44.1 kHz, 2-channel stereo).
   - Kept out of git via `.gitignore` (`reference/video/frames/*`, `reference/audio/*.wav`).

## Installing & Verifying the Pack

- **Install from an owner-supplied directory or archive extraction**:
  ```bash
  node scripts/reference/fetch-reference.mjs --source <path-to-reference-pack>
  ```
  `fetch-reference.mjs` copies real frames into `reference/video/frames/`, verifies every PNG and WAV header, regenerates `reference/frames.manifest.json`, and **never fabricates frames**.

- **Verify the installed pack (or point to an external location via `BACKSILENCE_REFERENCE_DIR`)**:
  ```bash
  npm run reference:verify
  # or with an external pack directory:
  BACKSILENCE_REFERENCE_DIR=/path/to/reference/video/frames npm run reference:verify
  ```
  Exits `1` with an actionable remedy if any frame is missing, corrupted, or fails SHA-256 verification.
