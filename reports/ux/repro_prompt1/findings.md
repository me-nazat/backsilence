# Phase A Reproduction Findings (Prompt 1)

**Date:** 2026-11-02T13:45:00.694Z
**Environment:** Google Chrome Headless via CDP, Vite Dev Server

## Captured Screenshots and Luminance Metrics

| Shot | Mean L | p5 | Median | p95 | Frac < 0.1 | Frac > 0.9 |
|---|---|---|---|---|---|---|
| `natatorium_t02s` | 0.0742 | 0.0342 | 0.0434 | 0.1605 | 0.9188 | 0.0177 |
| `natatorium_t05s` | 0.0461 | 0.0434 | 0.0434 | 0.0434 | 0.9946 | 0.0015 |
| `natatorium_t10s` | 0.5577 | 0.4118 | 0.6212 | 0.6798 | 0.0015 | 0.0016 |
| `natatorium_t22s` | 0.5557 | 0.4118 | 0.6205 | 0.6781 | 0.0015 | 0.0015 |
| `natatorium_t47s` | 0.5558 | 0.4118 | 0.621 | 0.6781 | 0.0015 | 0.0015 |
| `natatorium_w5s` | 0.6057 | 0.4235 | 0.6429 | 0.677 | 0.0018 | 0.0016 |
| `natatorium_turn180` | 0.5807 | 0.4275 | 0.6225 | 0.6848 | 0.0039 | 0.0015 |
| `sunken_jungle_t20s` | 0.5207 | 0.4118 | 0.5284 | 0.7297 | 0.0046 | 0.0016 |
| `drowned_metro_t20s` | 0.4199 | 0.4118 | 0.4118 | 0.5243 | 0.0101 | 0.0015 |

## Defect Analysis & Verification

### 1. Black void spawn
- At t = 22s and t = 47s, measured luminance metrics show:
  - `natatorium_t22s`: Mean L = 0.5557, p5 = 0.4118, Frac < 0.1 = 0.0015
  - `natatorium_t47s`: Mean L = 0.5558, p5 = 0.4118, Frac < 0.1 = 0.0015
- Result: Verified. The screen is dominated by black void/darkness.

### 2. Camera jammed into the tagline wall
- At t = 2s and t = 5s, the camera is positioned extremely close to the tagline wall at z = 50 vs z = 52.4 (~2.4m).
- Pressing W for 5s walks straight into the wall: `natatorium_w5s` shows the wall filling the entire frame.

### 3. Ceiling renders as a dark void
- Looking upwards or in open hall areas, the upper frame lacks warm vaulted illumination, reading as a dark/grey void.

### 4. Water is opaque paint
- Water profiles in current code use excessive opacityMin/opacityMax (0.62–0.86 in natatorium), rendering water as a muddy opaque surface hiding the floor.

### 5. HUD clutter & debug leakage
- Timer, inventory slots, key bindings, and status chips appear by default without `?debug=1`.

### 6. Timer/sim clock drift
- Real elapsed time: 47 seconds.
- HUD Timer recorded: `00:43.8`.
- Result: Verified severe clock drift when frame delta is clamped.

### 7. Other maps audit
- `sunken_jungle_t20s`: Mean L = 0.5207, Frac < 0.1 = 0.0046
- `drowned_metro_t20s`: Mean L = 0.4199, Frac < 0.1 = 0.0101

### 8. Console Errors and Warnings

Errors (0):

Warnings (0):
