# BackSilence — Known Limitations

**Release Version:** v2.0.0  
**Date:** 2026-11-02  
**Status:** Documented & Verified

This document records technical limitations, platform boundaries, and intentional trade-offs in BackSilence.

---

## 1. WebGL Platform & Tier Fallbacks
- **Low Tier Forward Rendering:** On low-end mobile devices or contexts lacking WebGL2 floating-point texture support, the post-processing multi-target pipeline (screen-space volumetric god rays, camera velocity motion blur, far-field depth of field) is bypassed. The engine falls back to direct single-pass forward rendering with analytic fog and procedural caustics.
- **Screen-Space Radial Ray Occlusion:** God rays are evaluated in screen space from visible ceiling skylights and high apertures. Light sources occluded off-screen do not project wrap-around rays into the camera frustum (inherent screen-space limitation; avoids heavy 3D volumetric raymarching overhead).

---

## 2. Audio Engine & Browser Policy
- **Autoplay Gesture Requirement:** In accordance with browser security policies (Chrome/Safari/Firefox), Web Audio synthesis graphs remain suspended until the player delivers the first user interaction (mouse click, key press, or touch). Visual telemetry runs synchronously while audio initializes instantly upon gesture.
- **Convolution Reverb Tail Allocation:** On Low quality tier, the long ceramic tile convolution reverb tail is replaced with an efficient feedback delay network (FDN) to conserve CPU cycles on lower-powered devices.

---

## 3. Input & Platform Traversal
- **Precision Platforming on Touch:** While BackSilence supports mobile touch input with virtual joysticks and touch looking, the physics model and trench sprint-jumps are calibrated primarily for desktop mouse + keyboard (WASD + Space) and standard gamepads (Xbox / PlayStation / generic HID).
- **Pointer Lock Security:** Pointer lock is tied to fullscreen or dedicated user clicks. In embedded iframe previews, pointer lock requires explicit user activation inside the frame.

---

## 4. Replay & Simulation Determinism
- **Cross-Browser Float Precision:** The 60 Hz simulation loop uses deterministic fixed-point math (`DMath`) and fixed timesteps for position, velocity, and acoustic hearing propagation. However, minor IEEE 754 float32 trigonometric rounding differences in WebGL shader rasterizers across different GPU vendors (AMD vs. NVIDIA vs. Apple Silicon) may produce single-pixel color variations in golden visual diffs while maintaining bitwise simulation hash invariance.

