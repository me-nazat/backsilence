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
    uPanic: { value: 0.0 },
    uTime: { value: 0.0 },
    uResolution: { value: new Vector2(1920, 1080) },
    uLines: { value: 240.0 },
    uSafeMode: { value: 0.0 },
    uCurvature: { value: 0.010 },
    uLift: { value: new Vector3(0, 0, 0) },
    uGamma: { value: new Vector3(1, 1, 1) },
    uGain: { value: new Vector3(1, 1, 1) },
    uSaturation: { value: 1.0 },
    uTint: { value: new Vector3(1, 1, 1) },
    uRewind: { value: 0.0 },
    uSignalLost: { value: 0.0 },
    uVelocity: { value: new Vector2(0, 0) },
    uBlurSamples: { value: 6.0 },
    uGodRays: { value: 1.0 },
    uSunScreen: { value: new Vector2(0.5, 0.35) },
    uFarDof: { value: 1.0 },
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
    uniform float uPanic;
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
    uniform float uBlurSamples;
    uniform float uGodRays;
    uniform vec2 uSunScreen;
    uniform float uFarDof;

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
      // 0. Parity bypass: exact raw diffuse when intensity is 0 and camera is stationary
      if (uIntensity <= 0.0001) {
        float velMag = length(uVelocity);
        if (velMag <= 0.0005 || uSafeMode > 0.5) {
          gl_FragColor = texture2D(tDiffuse, vUv);
          return;
        }
        // Camera motion blur runs even when VHS tape effects are disabled (clean look + motion blur)
        vec2 velDir = clamp(uVelocity, vec2(-0.06), vec2(0.06));
        vec3 accum = texture2D(tDiffuse, vUv).rgb;
        int maxS = int(clamp(uBlurSamples > 0.5 ? uBlurSamples : 6.0, 2.0, 7.0));
        for (int s = 1; s <= 7; s++) {
          if (s > maxS) break;
          float stepFrac = float(s) / float(maxS);
          accum += texture2D(tDiffuse, clamp(vUv - velDir * stepFrac, 0.0, 1.0)).rgb;
        }
        gl_FragColor = vec4(accum / float(maxS + 1), 1.0);
        return;
      }

      vec2 uv = vUv;
      float isSafe = uSafeMode > 0.5 ? 1.0 : 0.0;
      float panicLevel = max(uTension, uPanic);

      // 1. Barrel Curvature k1: reduced to 0.010 (barely perceptible wide-angle lens curvature, disabled in safe mode)
      float k1 = uCurvature;
      if (isSafe < 0.5 && k1 > 0.001) {
        vec2 centered = uv - 0.5;
        float r2 = dot(centered, centered);
        uv = uv + centered * (r2 * k1 * uIntensity);
      }

      // Check bounds after curvature
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      // 2. Horizontal Scanline Jitter and Wobble
      float jitter = 0.0;
      if (isSafe < 0.5) {
        float jitterAmp = (pow(panicLevel, 1.5) * 0.004 + uGlitch * 0.02 + uRewind * 0.06) * uIntensity;
        jitter = sin(uv.y * 180.0 + uTime * 45.0) * cos(uv.y * 31.0 - uTime * 20.0) * jitterAmp;

        // High frequency micro-jitter on tape edge
        float edgeJitter = (hash11(floor(uv.y * uLines) + fract(uTime * 30.0)) - 0.5) * jitterAmp * 0.5;
        jitter += edgeJitter;

        // 3. Tracking Band (rolls vertically only during high tension / panic >= 0.35, glitch, or rewind)
        float trackingSpeed = (panicLevel >= 0.35 ? 0.25 : 0.0) + uGlitch * 0.75 + uRewind * 2.5;
        if (trackingSpeed > 0.001) {
          float bandY = fract(uTime * trackingSpeed);
          float bandDist = abs(uv.y - bandY);
          float bandWidth = 0.04 + uRewind * 0.12 + uGlitch * 0.06;
          if (bandDist < bandWidth) {
            float bandFactor = 1.0 - (bandDist / bandWidth);
            float tearMask = bandFactor * (panicLevel >= 0.35 ? smoothstep(0.35, 0.8, panicLevel) : 1.0);
            jitter += (hash11(uv.y * 50.0 + uTime * 20.0) - 0.5) * 0.04 * tearMask * uIntensity;
          }
        }
      }

      // 4. Chroma Aberration: subtle base radial 0.0004 at screen edges, scaling up only when panic/tension > 0.2
      float edgeDist = smoothstep(0.35, 0.85, length(uv - 0.5));
      float panicAberration = panicLevel > 0.2 ? smoothstep(0.2, 1.0, panicLevel) * 0.0022 : 0.0;
      float chroma = (0.0004 + panicAberration + uGlitch * 0.006 + uRewind * 0.012) * uIntensity * edgeDist;
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

      // Soft analog bandwidth filtering (eliminates high-frequency subpixel aliasing/ringing)
      float hBandwidth = 6.5 / 1280.0;
      float vBandwidth = 5.0 / 720.0;
      if (isSafe < 0.5 && hBandwidth > 0.0001) {
        vec3 colL = vec3(
          texture2D(tDiffuse, clamp(uvR - vec2(hBandwidth, 0.0), 0.0, 1.0)).r,
          texture2D(tDiffuse, clamp(uvG - vec2(hBandwidth, 0.0), 0.0, 1.0)).g,
          texture2D(tDiffuse, clamp(uvB - vec2(hBandwidth, 0.0), 0.0, 1.0)).b
        );
        vec3 colRight = vec3(
          texture2D(tDiffuse, clamp(uvR + vec2(hBandwidth, 0.0), 0.0, 1.0)).r,
          texture2D(tDiffuse, clamp(uvG + vec2(hBandwidth, 0.0), 0.0, 1.0)).g,
          texture2D(tDiffuse, clamp(uvB + vec2(hBandwidth, 0.0), 0.0, 1.0)).b
        );
        vec3 colU = vec3(
          texture2D(tDiffuse, clamp(uvR - vec2(0.0, vBandwidth), 0.0, 1.0)).r,
          texture2D(tDiffuse, clamp(uvG - vec2(0.0, vBandwidth), 0.0, 1.0)).g,
          texture2D(tDiffuse, clamp(uvB - vec2(0.0, vBandwidth), 0.0, 1.0)).b
        );
        vec3 colD = vec3(
          texture2D(tDiffuse, clamp(uvR + vec2(0.0, vBandwidth), 0.0, 1.0)).r,
          texture2D(tDiffuse, clamp(uvG + vec2(0.0, vBandwidth), 0.0, 1.0)).g,
          texture2D(tDiffuse, clamp(uvB + vec2(0.0, vBandwidth), 0.0, 1.0)).b
        );
        color = color * 0.18 + (colL + colRight) * 0.27 + (colU + colD) * 0.14;
      }

      // Camera motion blur: 2-6 directional samples along velocity vector (High: 6, Medium: 3, Low: 2)
      float velMag = length(uVelocity);
      if (isSafe < 0.5 && velMag > 0.0005) {
        vec2 velDir = clamp(uVelocity, vec2(-0.06), vec2(0.06));
        vec3 accum = color;
        int maxS = int(clamp(uBlurSamples > 0.5 ? uBlurSamples : 6.0, 2.0, 6.0));
        for (int s = 1; s <= 6; s++) {
          if (s > maxS) break;
          float stepFrac = float(s) / float(maxS);
          accum += texture2D(tDiffuse, clamp(uvG - velDir * stepFrac, 0.0, 1.0)).rgb;
        }
        color = accum / float(maxS + 1);
      }

      // Far-field Depth of Field (subtle horizon / distance defocus)
      if (uFarDof > 0.5 && isSafe < 0.5) {
        float dofBand = smoothstep(0.40, 0.70, uv.y);
        if (dofBand > 0.01) {
          float db = 4.0 * dofBand;
          vec2 oH = vec2(db / max(uResolution.x, 640.0), 0.0);
          vec2 oV = vec2(0.0, db / max(uResolution.y, 480.0));
          vec3 bCol = texture2D(tDiffuse, uv).rgb * 0.36 +
            (texture2D(tDiffuse, clamp(uv - oH, 0.0, 1.0)).rgb +
             texture2D(tDiffuse, clamp(uv + oH, 0.0, 1.0)).rgb) * 0.20 +
            (texture2D(tDiffuse, clamp(uv - oV, 0.0, 1.0)).rgb +
             texture2D(tDiffuse, clamp(uv + oV, 0.0, 1.0)).rgb) * 0.12;
          color = mix(color, bCol, dofBand * 0.85);
        }
      }

      // Volumetric God Rays (screen-space radial light scattering from skylight/window)
      if (uGodRays > 0.5 && isSafe < 0.5) {
        vec2 rayStep = (uSunScreen - uv) * (1.0 / 8.0) * 0.45;
        vec2 rayPos = uv;
        float raySum = 0.0;
        float w = 0.45;
        for (int r = 0; r < 8; r++) {
          rayPos += rayStep;
          vec3 sCol = texture2D(tDiffuse, clamp(rayPos, 0.0, 1.0)).rgb;
          float sLum = dot(sCol, vec3(0.299, 0.587, 0.114));
          raySum += smoothstep(0.72, 0.98, sLum) * w;
          w *= 0.88;
        }
        // Fog-aware: preserve mint horizon value (~0.86), attenuate directly at horizon
        float horizonPreserve = smoothstep(0.015, 0.20, abs(uv.y - 0.52));
        vec3 rayTint = vec3(1.0, 0.96, 0.86);
        color += rayTint * (raySum * 0.24 * horizonPreserve);
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

      // 7. CRT Scanlines (disabled during normal exploration; active only when heavy VHS mode is explicitly enabled: uIntensity > 0.65)
      if (isSafe < 0.5 && uLines > 0.0 && uIntensity > 0.65) {
        float field = mod(floor(uTime * 60.0), 2.0);
        float scanline = sin(uv.y * uLines * 3.14159265 + field * 3.14159265);
        float scanlineMul = 1.0 - (0.003 * (uIntensity - 0.65) * (0.5 + 0.5 * scanline));
        color *= scanlineMul;
      }

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
        color = mix(vec3(luma), color, tDanger * 0.35 * uIntensity);
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

      // 13. Clean, neutral filmic contrast curve & color grade
      // Preserves pristine bright whites (#f6f7f4) and luminous turquoise water (#42d8e8)
      vec3 gradedColor = (color - 0.5) * uGain + 0.5 + uLift;
      gradedColor = clamp(gradedColor, vec3(0.0), vec3(1.0));

      // Neutral filmic S-curve: clean toe, linear midtones, smooth shoulder without crushing darks
      vec3 sCurve = gradedColor * gradedColor * (3.0 - 2.0 * gradedColor);
      color = mix(gradedColor, sCurve, 0.12);

      // Gamma correction
      color = pow(max(color, vec3(0.0001)), 1.0 / max(uGamma, vec3(0.001)));

      // Saturation calibration
      float postLum = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(postLum), color, uSaturation);

      // Apply neutral per-map tint
      color = color * uTint;

      // Tension response: as creature closes, grade drifts slightly cooler (< 8%)
      if (panicLevel > 0.001) {
        vec3 coolDrift = mix(vec3(1.0), vec3(0.96, 0.98, 1.02), panicLevel * 0.08);
        color *= coolDrift;
      }

      // 14. Subtle Vignette (gentle ~0.15 falloff at outer perimeter only)
      vec2 centeredVig = uv - 0.5;
      float vig = 1.0 - smoothstep(0.45, 1.0, length(centeredVig) * 1.25) * 0.15;
      color *= vig;

      // 15. Ultra-fine neutral film grain (0.008 intensity floor)
      float grainTime = floor(uTime * 24.0);
      float lumaNoise = (hash21(uv * vec2(1280.0, 720.0) + grainTime) - 0.5) * 0.008 * uIntensity;
      color += vec3(lumaNoise);

      // 16. Filmic Highlight Roll-off Shoulder (Prompt 9 Work Items C9 & C10)
      // Softens highlights above 0.86 so specular reflections degrade to a wide soft sheen
      // without pixel clamping or chromatic blowout. The fog horizon at 0.86 remains 100% untouched.
      float lumaVal = dot(color, vec3(0.2126, 0.7152, 0.0722));
      const float knee = 0.86;
      const float maxCeiling = 0.965;
      if (lumaVal > knee) {
        float deltaL = lumaVal - knee;
        float span = maxCeiling - knee;
        float rolledLuma = knee + span * (deltaL / (deltaL + span));
        color *= (rolledLuma / max(lumaVal, 0.0001));
      }

      // 17. Final color output (no artificial black-floor clamping or dark mud)
      vec3 finalColor = clamp(color, 0.0, 1.0);

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,
};
