/* ── vhs.glsl.ts ────────────────────────────────────────────────────────
 *  Analog-horror VHS / CRT post-processing shader.
 *  Features:
 *  - Per-scanline horizontal jitter and wobble (tension & glitch driven)
 *  - Tracking band rolling vertically on glitches & rewinds
 *  - Chroma aberration + YIQ horizontal chroma bleed
 *  - Virtual scanlines with interlace-field flicker
 *  - Procedural tape grain & dropout streaks
 *  - Barrel curvature & vignette
 *  - Per-map lift / gamma / gain / saturation / tint color grade
 *  - Photosensitive safe mode / reduced motion clamp
 *  - Exact passthrough when uIntensity == 0.0 (MAE < 1.5% parity)
 * ──────────────────────────────────────────────────────────────────────── */

import { Vector2, Vector3 } from 'three';

export const VHSShader = {
  name: 'VHSShader',
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },
    uBloomStrength: { value: 0.0 },
    uIntensity: { value: 1.0 },
    uGlitch: { value: 0.0 },
    uTension: { value: 0.0 },
    uTime: { value: 0.0 },
    uResolution: { value: new Vector2(1920, 1080) },
    uLines: { value: 240.0 },
    uSafeMode: { value: 0.0 },
    uCurvature: { value: 0.02 },
    uLift: { value: new Vector3(0, 0, 0) },
    uGamma: { value: new Vector3(1, 1, 1) },
    uGain: { value: new Vector3(1, 1, 1) },
    uSaturation: { value: 1.0 },
    uTint: { value: new Vector3(1, 1, 1) },
    uRewind: { value: 0.0 },
    uSignalLost: { value: 0.0 },
    uVelocity: { value: new Vector2(0, 0) },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tBloom;
    uniform float uBloomStrength;
    uniform float uIntensity;
    uniform float uGlitch;
    uniform float uTension;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uLines;
    uniform float uSafeMode;
    uniform float uCurvature;
    uniform vec3 uLift;
    uniform vec3 uGamma;
    uniform vec3 uGain;
    uniform float uSaturation;
    uniform vec3 uTint;
    uniform float uRewind;
    uniform float uSignalLost;
    uniform vec2 uVelocity;

    varying vec2 vUv;

    // High quality 2D hash
    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    // 1D hash
    float hash11(float p) {
      p = fract(p * 0.1031);
      p *= p + 33.33;
      p *= p + p;
      return fract(p);
    }

    // RGB to YIQ
    vec3 rgb2yiq(vec3 c) {
      return vec3(
        0.299 * c.r + 0.587 * c.g + 0.114 * c.b,
        0.596 * c.r - 0.274 * c.g - 0.322 * c.b,
        0.211 * c.r - 0.523 * c.g + 0.312 * c.b
      );
    }

    // YIQ to RGB
    vec3 yiq2rgb(vec3 yiq) {
      return vec3(
        yiq.x + 0.956 * yiq.y + 0.621 * yiq.z,
        yiq.x - 0.272 * yiq.y - 0.647 * yiq.z,
        yiq.x - 1.106 * yiq.y + 1.703 * yiq.z
      );
    }

    void main() {
      // 0. Parity bypass: exact raw diffuse when intensity is 0
      if (uIntensity <= 0.0001) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      vec2 uv = vUv;
      float isSafe = uSafeMode > 0.5 ? 1.0 : 0.0;

      // 1. Barrel Curvature (disabled in safe mode)
      if (isSafe < 0.5 && uCurvature > 0.001) {
        vec2 centered = uv - 0.5;
        float r2 = dot(centered, centered);
        uv = uv + centered * (r2 * uCurvature * uIntensity);
      }

      // Check bounds after curvature
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      // 2. Horizontal Scanline Jitter and Wobble
      float jitter = 0.0;
      if (isSafe < 0.5) {
        float jitterAmp = (pow(uTension, 1.5) * 0.004 + uGlitch * 0.02 + uRewind * 0.06) * uIntensity;
        jitter = sin(uv.y * 180.0 + uTime * 45.0) * cos(uv.y * 31.0 - uTime * 20.0) * jitterAmp;

        // High frequency micro-jitter on tape edge
        float edgeJitter = (hash11(floor(uv.y * uLines) + fract(uTime * 30.0)) - 0.5) * jitterAmp * 0.5;
        jitter += edgeJitter;

        // 3. Tracking Band (rolls vertically)
        float trackingSpeed = 0.25 + uGlitch * 0.75 + uRewind * 2.5;
        float bandY = fract(uTime * trackingSpeed);
        float bandDist = abs(uv.y - bandY);
        float bandWidth = 0.04 + uRewind * 0.12 + uGlitch * 0.06;
        if (bandDist < bandWidth) {
          float bandFactor = 1.0 - (bandDist / bandWidth);
          jitter += (hash11(uv.y * 50.0 + uTime * 20.0) - 0.5) * 0.04 * bandFactor * uIntensity;
        }
      }

      // 4. Chroma Aberration
      float chroma = (0.0006 + 0.0025 * uTension + uGlitch * 0.008 + uRewind * 0.015) * uIntensity;
      if (isSafe > 0.5) {
        chroma = min(chroma, 0.0008);
      }

      vec2 uvR = vec2(clamp(uv.x + jitter + chroma, 0.0, 1.0), uv.y);
      vec2 uvG = vec2(clamp(uv.x + jitter, 0.0, 1.0), uv.y);
      vec2 uvB = vec2(clamp(uv.x + jitter - chroma, 0.0, 1.0), uv.y);

      vec4 colR = texture2D(tDiffuse, uvR);
      vec4 colG = texture2D(tDiffuse, uvG);
      vec4 colB = texture2D(tDiffuse, uvB);

      vec3 color = vec3(colR.r, colG.g, colB.b);

      // Camera motion blur: 6 directional samples along velocity vector
      float velMag = length(uVelocity);
      if (isSafe < 0.5 && velMag > 0.0005) {
        vec2 velDir = clamp(uVelocity, vec2(-0.02), vec2(0.02));
        vec3 accum = color;
        for (int s = 1; s <= 6; s++) {
          float stepFrac = float(s) / 6.0;
          accum += texture2D(tDiffuse, clamp(uvG - velDir * stepFrac, 0.0, 1.0)).rgb;
        }
        color = accum / 7.0;
      }

      // 5. Chroma Bleed (YIQ horizontal blur)
      if (isSafe < 0.5 && uIntensity > 0.1) {
        float bleedOffset = 0.003 * uIntensity;
        vec3 colLeft = texture2D(tDiffuse, vec2(clamp(uv.x + jitter - bleedOffset, 0.0, 1.0), uv.y)).rgb;
        vec3 colRight = texture2D(tDiffuse, vec2(clamp(uv.x + jitter + bleedOffset, 0.0, 1.0), uv.y)).rgb;

        vec3 yiqCenter = rgb2yiq(color);
        vec3 yiqLeft = rgb2yiq(colLeft);
        vec3 yiqRight = rgb2yiq(colRight);

        // Keep center luma Y, blur I and Q horizontally
        vec2 blurredIQ = (yiqCenter.yz * 0.5) + (yiqLeft.yz * 0.25) + (yiqRight.yz * 0.25);
        color = yiq2rgb(vec3(yiqCenter.x, blurredIQ.x, blurredIQ.y));
      }

      // 6. Add Bloom if present
      if (uBloomStrength > 0.0) {
        vec3 bloom = texture2D(tBloom, uv).rgb * uBloomStrength;
        color += bloom;
      }

      // 7. Scanlines & Interlace Field Flicker
      if (isSafe < 0.5 && uLines > 0.0) {
        float field = mod(floor(uTime * 60.0), 2.0);
        float scanline = sin(uv.y * uLines * 3.14159265 + field * 3.14159265);
        float scanlineMul = 1.0 - (0.08 * uIntensity * (0.5 + 0.5 * scanline));
        color *= scanlineMul;
      }

      // 8. Tape Grain (Luma + Coarse Chroma Noise)
      float grainTime = floor(uTime * 24.0);
      float lumaNoise = (hash21(uv * vec2(800.0, 600.0) + grainTime) - 0.5) * 0.06 * uIntensity;
      float chromaNoise = (hash21(floor(uv * vec2(120.0, 90.0)) + grainTime) - 0.5) * 0.04 * uIntensity;

      color += vec3(lumaNoise + chromaNoise * 0.5, lumaNoise, lumaNoise - chromaNoise * 0.5);

      // 9. Dropout Streaks (Horizontal white needle blips)
      if (isSafe < 0.5) {
        float dropoutRate = (6.0 * uTension + uGlitch * 25.0 + uRewind * 50.0);
        float dropoutHash = hash21(vec2(floor(uv.y * 360.0), floor(uTime * 30.0)));
        if (dropoutHash < (dropoutRate / 360.0) * uIntensity) {
          float streakX = hash11(floor(uv.y * 360.0) + floor(uTime * 30.0));
          if (abs(uv.x - streakX) < 0.08) {
            color = mix(color, vec3(0.9, 0.95, 1.0), 0.85);
          }
        }
      }

      // 10. Tension Degradation (> 0.8: Cold Static & Desaturation)
      if (uTension > 0.8) {
        float tDanger = (uTension - 0.8) / 0.2; // 0..1
        float staticNoise = (hash21(uv * 1200.0 + uTime * 90.0) - 0.5) * 0.2 * tDanger * uIntensity;
        color += vec3(staticNoise * 0.8, staticNoise, staticNoise * 1.2);
        // Desaturate slightly under panic
        float luma = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(color, vec3(luma), tDanger * 0.35 * uIntensity);
      }

      // 11. Rewind Overlay Static
      if (uRewind > 0.0) {
        float rewindNoise = (hash21(uv * vec2(600.0, 100.0) + floor(uTime * 60.0)) - 0.5) * 0.35 * uRewind;
        color = mix(color, vec3(0.1, 0.12, 0.15) + vec3(rewindNoise), uRewind * 0.4);
      }

      // 12. Signal Lost Static
      if (uSignalLost > 0.0) {
        float lostNoise = hash21(uv * 1000.0 + fract(uTime * 50.0));
        color = mix(color, vec3(lostNoise * 0.7), uSignalLost);
      }

      // 13. Per-map Color Grade (Lift, Gamma, Gain, Saturation, Tint)
      // Gain & Lift
      color = (color - 0.5) * uGain + 0.5 + uLift;
      // Gamma
      color = pow(max(color, vec3(0.0)), 1.0 / max(uGamma, vec3(0.001)));
      // Saturation
      float lum = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(lum), color, uSaturation);
      // Tint
      color *= uTint;

      // 14. Vignette
      vec2 centeredVig = uv - 0.5;
      float vig = 1.0 - smoothstep(0.45, 0.95, length(centeredVig) * 1.35) * (0.35 * uIntensity);
      color *= vig;

      // 15. Overall Flicker (±1.5%, disabled in safe mode)
      if (isSafe < 0.5) {
        float flicker = 1.0 + (hash11(floor(uTime * 30.0)) - 0.5) * 0.03 * uIntensity;
        color *= flicker;
      }

      // 16. Blend final with raw diffuse based on uIntensity
      vec3 rawColor = texture2D(tDiffuse, vUv).rgb;
      vec3 finalColor = mix(rawColor, color, uIntensity);

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,
};
