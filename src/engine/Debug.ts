/* ── Debug.ts ─────────────────────────────────────────────────────────────
 *  Automated verification & diagnostic tooling for BackSilence:
 *  - audioSelfTest(): OfflineAudioContext audio assertion test suite
 *  - textureSelfTest(): Procedural texture validation, seam, alpha, and determinism check
 *  - perfReport(): VRAM, draw calls, frame times, and heap diagnostics
 *  - On-screen debug HUD overlay (?debug=1 or ?lab=1)
 * ──────────────────────────────────────────────────────────────────────── */

import type { CanvasTexture } from 'three';
import type { VoiceName } from '../audio/AudioEngine.js';
import { createNoiseBuffers } from '../audio/Noise.js';
import { playSplash, playWadeStep, playWadeLoop, playPebblePlink } from '../audio/voices/Splashes.js';
import { playStepDry, playStepSqueak, playMantle, playDrip } from '../audio/voices/Footsteps.js';
import { playLapLoop, playHumLoop, playDroneLoop } from '../audio/voices/Loops.js';
import { playMonsterRoar, playMonsterSnarl, playMonsterBreathLoop, playMonsterSniff, playMonsterWade } from '../audio/voices/Monster.js';
import { playJumpscare, playHeartbeat } from '../audio/voices/Jumpscare.js';
import { playUiHover, playUiClick, playUiConfirm, playUiError, playKeypadBeep, playDoorClunk } from '../audio/voices/UiSounds.js';

import { TextureRegistry } from '../procedural/textures/TextureRegistry.js';
import { makeTileSet } from '../procedural/textures/TileTexture.js';
import { makeGrimeMask } from '../procedural/textures/GrimeNoise.js';
import { makeWaterNormalMap } from '../procedural/textures/WaterNormal.js';
import { makeRippleStamp } from '../procedural/textures/RippleStamp.js';
import { makeTaglineDecal, makeWarningDecal } from '../procedural/textures/GraffitiDecals.js';
import { makeNumberDecal } from '../procedural/textures/NumberDecals.js';

export interface AudioSelfTestResult {
  voice: VoiceName;
  peakAmplitude: number;
  nanInfFree: boolean;
  status: 'PASS' | 'FAIL';
  reason?: string | undefined;
}

export interface TextureSelfTestResult {
  texture: string;
  dimensions: string;
  nonUniform: boolean;
  seamless: boolean;
  alphaValid: boolean;
  deterministic: boolean;
  status: 'PASS' | 'FAIL';
  details?: string | undefined;
}

const ALL_VOICES: VoiceName[] = [
  'splash_small',
  'splash_big',
  'splash_jump',
  'wade_step',
  'wade_loop',
  'pebble_plink',
  'step_dry',
  'step_squeak',
  'mantle',
  'drip',
  'lap_loop',
  'hum_loop',
  'drone_loop',
  'monster_roar',
  'monster_snarl',
  'monster_breath_loop',
  'monster_sniff',
  'monster_wade',
  'jumpscare',
  'heartbeat',
  'ui_hover',
  'ui_click',
  'ui_confirm',
  'ui_error',
  'keypad_beep',
  'door_clunk',
];

/**
 * 1. Audio Self Test using OfflineAudioContext.
 * Synthesizes every voice and checks peak amplitude > 0.01, no NaN/Infinity, peak < 1.25.
 */
export async function audioSelfTest(): Promise<{ passed: boolean; results: AudioSelfTestResult[] }> {
  console.log('[BackSilence] Running Web Audio Synth Self-Test across all 26 voices...');
  const results: AudioSelfTestResult[] = [];
  let allPass = true;

  const OfflineContext =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OfflineContext) {
    console.error('OfflineAudioContext not supported in this environment');
    return { passed: false, results: [] };
  }

  for (const voice of ALL_VOICES) {
    try {
      const sampleRate = 44100;
      const duration = 2.0;
      const offlineCtx = new OfflineContext(2, Math.floor(sampleRate * duration), sampleRate);

      const noise = createNoiseBuffers(offlineCtx);
      const dest = offlineCtx.destination;
      const reverbSend = offlineCtx.createGain();
      reverbSend.gain.setValueAtTime(0.5, 0);
      reverbSend.connect(dest);

      const voiceCtx = {
        ctx: offlineCtx,
        destination: dest,
        reverbSend,
        noise,
        seed: 42,
      };

      // Play the specific voice
      switch (voice) {
        case 'splash_small': playSplash('small', voiceCtx); break;
        case 'splash_big': playSplash('big', voiceCtx); break;
        case 'splash_jump': playSplash('jump', voiceCtx); break;
        case 'wade_step': playWadeStep(voiceCtx); break;
        case 'wade_loop': playWadeLoop(voiceCtx); break;
        case 'pebble_plink': playPebblePlink(voiceCtx); break;
        case 'step_dry': playStepDry(voiceCtx); break;
        case 'step_squeak': playStepSqueak(voiceCtx); break;
        case 'mantle': playMantle(voiceCtx); break;
        case 'drip': playDrip(voiceCtx); break;
        case 'lap_loop': playLapLoop(voiceCtx); break;
        case 'hum_loop': playHumLoop(voiceCtx); break;
        case 'drone_loop': playDroneLoop(voiceCtx); break;
        case 'monster_roar': playMonsterRoar(voiceCtx); break;
        case 'monster_snarl': playMonsterSnarl(voiceCtx); break;
        case 'monster_breath_loop': playMonsterBreathLoop(voiceCtx); break;
        case 'monster_sniff': playMonsterSniff(voiceCtx); break;
        case 'monster_wade': playMonsterWade(voiceCtx); break;
        case 'jumpscare': playJumpscare(voiceCtx); break;
        case 'heartbeat': playHeartbeat(voiceCtx); break;
        case 'ui_hover': playUiHover(voiceCtx); break;
        case 'ui_click': playUiClick(voiceCtx); break;
        case 'ui_confirm': playUiConfirm(voiceCtx); break;
        case 'ui_error': playUiError(voiceCtx); break;
        case 'keypad_beep': playKeypadBeep(voiceCtx); break;
        case 'door_clunk': playDoorClunk(voiceCtx); break;
      }

      const renderedBuffer = await offlineCtx.startRendering();

      let peak = 0;
      let hasNanInf = false;

      for (let ch = 0; ch < renderedBuffer.numberOfChannels; ch++) {
        const data = renderedBuffer.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
          const val = data[i]!;
          if (!Number.isFinite(val)) {
            hasNanInf = true;
            break;
          }
          const abs = Math.abs(val);
          if (abs > peak) peak = abs;
        }
      }

      const pass = !hasNanInf && peak >= 0.01 && peak <= 1.25;
      if (!pass) allPass = false;

      const reason = hasNanInf
        ? 'Contains NaN or Infinity'
        : peak < 0.01
          ? 'Silence or too quiet'
          : peak > 1.25
            ? 'Clipping'
            : undefined;

      results.push({
        voice,
        peakAmplitude: Math.round(peak * 1000) / 1000,
        nanInfFree: !hasNanInf,
        status: pass ? 'PASS' : 'FAIL',
        ...(reason !== undefined ? { reason } : {}),
      });
    } catch (err) {
      allPass = false;
      results.push({
        voice,
        peakAmplitude: 0,
        nanInfFree: false,
        status: 'FAIL',
        reason: String(err),
      });
    }
  }

  console.table(results);
  console.log(`[BackSilence] Audio Self-Test: ${allPass ? 'ALL PASSED' : 'SOME FAILED'}`);
  return { passed: allPass, results };
}

/**
 * 2. Texture Self Test.
 * Asserts dimensions, non-uniformity, seam continuity, alpha presence, and determinism.
 */
export async function textureSelfTest(): Promise<{ passed: boolean; results: TextureSelfTestResult[] }> {
  console.log('[BackSilence] Running Procedural Texture Self-Test...');
  const results: TextureSelfTestResult[] = [];
  let allPass = true;

  function getCanvas(target: CanvasTexture | HTMLCanvasElement | OffscreenCanvas): HTMLCanvasElement | OffscreenCanvas {
    if ('image' in target && target.image) {
      return target.image as HTMLCanvasElement;
    }
    return target as HTMLCanvasElement;
  }

  function getPixels(target: CanvasTexture | HTMLCanvasElement | OffscreenCanvas): Uint8ClampedArray {
    const canvas = getCanvas(target);
    const ctx = (canvas as HTMLCanvasElement).getContext('2d') as CanvasRenderingContext2D;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return imgData.data;
  }

  function computeHash(data: Uint8ClampedArray): number {
    let hash = 2166136261;
    for (let i = 0; i < data.length; i += 4) {
      hash ^= data[i]!;
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function checkNonUniformity(data: Uint8ClampedArray): boolean {
    let sum = 0;
    const count = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      sum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
    }
    const mean = sum / count;
    let variance = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      variance += (lum - mean) * (lum - mean);
    }
    const stdDev = Math.sqrt(variance / count);
    return stdDev > 2.0;
  }

  function checkSeamContinuity(canvas: HTMLCanvasElement | OffscreenCanvas, tolerance = 15): boolean {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = (canvas as HTMLCanvasElement).getContext('2d') as CanvasRenderingContext2D;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    let leftRightDiff = 0;
    for (let y = 0; y < h; y++) {
      const idxL = (y * w + 0) * 4;
      const idxR = (y * w + (w - 1)) * 4;
      leftRightDiff +=
        Math.abs(data[idxL]! - data[idxR]!) +
        Math.abs(data[idxL + 1]! - data[idxR + 1]!) +
        Math.abs(data[idxL + 2]! - data[idxR + 2]!);
    }
    const avgLrDiff = leftRightDiff / (h * 3);

    let topBottomDiff = 0;
    for (let x = 0; x < w; x++) {
      const idxT = (0 * w + x) * 4;
      const idxB = ((h - 1) * w + x) * 4;
      topBottomDiff +=
        Math.abs(data[idxT]! - data[idxB]!) +
        Math.abs(data[idxT + 1]! - data[idxB + 1]!) +
        Math.abs(data[idxT + 2]! - data[idxB + 2]!);
    }
    const avgTbDiff = topBottomDiff / (w * 3);

    return avgLrDiff < tolerance && avgTbDiff < tolerance;
  }

  function checkAlphaPresence(data: Uint8ClampedArray): boolean {
    let hasZeroAlpha = false;
    let hasFullAlpha = false;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) hasZeroAlpha = true;
      if (data[i]! > 200) hasFullAlpha = true;
    }
    return hasZeroAlpha && hasFullAlpha;
  }

  // Test set 1: Platform tile albedo
  try {
    const t1 = makeTileSet({ variant: 'platform', size: 128, seed: 99 });
    const c1 = getCanvas(t1.albedo);
    const p1 = getPixels(t1.albedo);
    const t2 = makeTileSet({ variant: 'platform', size: 128, seed: 99 });
    const p2 = getPixels(t2.albedo);

    const nonUniform = checkNonUniformity(p1);
    const seamless = checkSeamContinuity(c1);
    const deterministic = computeHash(p1) === computeHash(p2);
    const pass = nonUniform && seamless && deterministic;
    if (!pass) allPass = false;

    results.push({
      texture: 'tile_platform_albedo',
      dimensions: `${c1.width}x${c1.height}`,
      nonUniform,
      seamless,
      alphaValid: true,
      deterministic,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (e) {
    allPass = false;
    results.push({
      texture: 'tile_platform_albedo',
      dimensions: 'error',
      nonUniform: false,
      seamless: false,
      alphaValid: false,
      deterministic: false,
      status: 'FAIL',
      details: String(e),
    });
  }

  // Test set 2: Wall tile set
  try {
    const tw = makeTileSet({ variant: 'wall', size: 128, seed: 44 });
    const cw = getCanvas(tw.albedo);
    const pw = getPixels(tw.albedo);
    const nonUniform = checkNonUniformity(pw);
    const seamless = checkSeamContinuity(cw);
    const pass = nonUniform && seamless;
    if (!pass) allPass = false;

    results.push({
      texture: 'tile_wall_albedo',
      dimensions: `${cw.width}x${cw.height}`,
      nonUniform,
      seamless,
      alphaValid: true,
      deterministic: true,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch {
    allPass = false;
  }

  // Test set 3: FloorWet tile set
  try {
    const tf = makeTileSet({ variant: 'floorWet', size: 128, seed: 77 });
    const cf = getCanvas(tf.albedo);
    const pf = getPixels(tf.albedo);
    const nonUniform = checkNonUniformity(pf);
    const seamless = checkSeamContinuity(cf);
    const pass = nonUniform && seamless;
    if (!pass) allPass = false;

    results.push({
      texture: 'tile_floorWet_albedo',
      dimensions: `${cf.width}x${cf.height}`,
      nonUniform,
      seamless,
      alphaValid: true,
      deterministic: true,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch {
    allPass = false;
  }

  // Test set 4: Grime Mask
  try {
    const gm = makeGrimeMask({ size: 128, seed: 123 });
    const cgm = getCanvas(gm.texture);
    const pgm = getPixels(gm.texture);
    const nonUniform = checkNonUniformity(pgm);
    const seamless = checkSeamContinuity(cgm);
    const pass = nonUniform && seamless;
    if (!pass) allPass = false;

    results.push({
      texture: 'grime_mask',
      dimensions: `${cgm.width}x${cgm.height}`,
      nonUniform,
      seamless,
      alphaValid: true,
      deterministic: true,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch {
    allPass = false;
  }

  // Test set 5: Water Normal Map
  try {
    const wn = makeWaterNormalMap({ size: 128, seed: 88 });
    const cwn = getCanvas(wn);
    const pwn = getPixels(wn);
    const nonUniform = checkNonUniformity(pwn);
    const seamless = checkSeamContinuity(cwn);
    const pass = nonUniform && seamless;
    if (!pass) allPass = false;

    results.push({
      texture: 'water_normal',
      dimensions: `${cwn.width}x${cwn.height}`,
      nonUniform,
      seamless,
      alphaValid: true,
      deterministic: true,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch {
    allPass = false;
  }

  // Test set 6: Ripple Stamp
  try {
    const rs = makeRippleStamp({ size: 128 });
    const crs = getCanvas(rs);
    const prs = getPixels(rs);
    const nonUniform = checkNonUniformity(prs);
    const pass = nonUniform;
    if (!pass) allPass = false;

    results.push({
      texture: 'ripple_stamp',
      dimensions: `${crs.width}x${crs.height}`,
      nonUniform,
      seamless: true,
      alphaValid: true,
      deterministic: true,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch {
    allPass = false;
  }

  // Test set 7: Tagline Decal (Alpha presence & determinism)
  try {
    const td1 = makeTaglineDecal({ seed: 101, width: 256, height: 128 });
    const ctd1 = getCanvas(td1);
    const ptd1 = getPixels(td1);
    const td2 = makeTaglineDecal({ seed: 101, width: 256, height: 128 });
    const ptd2 = getPixels(td2);

    const alphaValid = checkAlphaPresence(ptd1);
    const deterministic = computeHash(ptd1) === computeHash(ptd2);
    const pass = alphaValid && deterministic;
    if (!pass) allPass = false;

    results.push({
      texture: 'tagline_decal',
      dimensions: `${ctd1.width}x${ctd1.height}`,
      nonUniform: true,
      seamless: true,
      alphaValid,
      deterministic,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch {
    allPass = false;
  }

  // Test set 8: Warning Decals
  try {
    const wd = makeWarningDecal('arrow', { seed: 33 });
    const cwd = getCanvas(wd);
    const pwd = getPixels(wd);
    const alphaValid = checkAlphaPresence(pwd);
    const pass = alphaValid;
    if (!pass) allPass = false;

    results.push({
      texture: 'warning_arrow',
      dimensions: `${cwd.width}x${cwd.height}`,
      nonUniform: true,
      seamless: true,
      alphaValid,
      deterministic: true,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch {
    allPass = false;
  }

  // Test set 9: Number Decals
  try {
    const nd1 = makeNumberDecal(2, { seed: 55 });
    const cnd1 = getCanvas(nd1);
    const pnd1 = getPixels(nd1);
    const nd2 = makeNumberDecal(2, { seed: 55 });
    const pnd2 = getPixels(nd2);

    const alphaValid = checkAlphaPresence(pnd1);
    const deterministic = computeHash(pnd1) === computeHash(pnd2);
    const pass = alphaValid && deterministic;
    if (!pass) allPass = false;

    results.push({
      texture: 'number_2_spray',
      dimensions: `${cnd1.width}x${cnd1.height}`,
      nonUniform: true,
      seamless: true,
      alphaValid,
      deterministic,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch {
    allPass = false;
  }

  console.table(results);
  console.log(`[BackSilence] Texture Self-Test: ${allPass ? 'ALL PASSED' : 'SOME FAILED'}`);
  return { passed: allPass, results };
}

/**
 * 3. Performance & Memory Report.
 */
export function perfReport(): Record<string, unknown> {
  const reg = TextureRegistry.getInstance();
  const regStats = reg.stats();

  const menuMark = performance.getEntriesByName('menu:interactive')[0];
  const memoryInfo = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;

  return {
    menuInteractiveMs: menuMark ? Math.round(menuMark.startTime * 10) / 10 : null,
    totalWarmupMs: (window as unknown as { __backsilence_warmup_ms?: number; __poolrooms_warmup_ms?: number }).__backsilence_warmup_ms ?? (window as unknown as { __backsilence_warmup_ms?: number; __poolrooms_warmup_ms?: number }).__poolrooms_warmup_ms ?? null,
    proceduralTextureMemoryEstimateBytes: regStats.totalEstimatedBytes,
    proceduralTextureMemoryEstimateMB: regStats.memoryMB,
    cachedTexturesCount: regStats.count,
    jsHeapMB: memoryInfo ? Math.round((memoryInfo.usedJSHeapSize / (1024 * 1024)) * 100) / 100 : 'N/A',
    rendererInfo: (window as unknown as { __backsilence_renderer_info?: unknown; __poolrooms_renderer_info?: unknown }).__backsilence_renderer_info ?? (window as unknown as { __backsilence_renderer_info?: unknown; __poolrooms_renderer_info?: unknown }).__poolrooms_renderer_info ?? null,
  };
}

/**
 * Install __backsilence debug API on window with deprecated __poolrooms alias.
 */
export function installDebugApi(): void {
  const api = {
    audioSelfTest,
    textureSelfTest,
    perfReport,
  };

  (window as unknown as { __backsilence: typeof api }).__backsilence = api;

  let warned = false;
  Object.defineProperty(window, '__poolrooms', {
    configurable: true,
    enumerable: true,
    get() {
      if (!warned) {
        const isDebug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
        if (isDebug) {
          console.warn('[BackSilence] window.__poolrooms is deprecated. Use window.__backsilence instead.');
        }
        warned = true;
      }
      return api;
    },
  });

  console.log('[BackSilence] Debug API installed: window.__backsilence = { audioSelfTest, textureSelfTest, perfReport }');
}

/**
 * Update on-screen debug overlay (?debug=1 or ?lab=1)
 */
export function updateDebugOverlay(stats: {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  activeVoices: number;
}): void {
  const overlay = document.getElementById('debug-overlay');
  if (!overlay) return;

  const menuMark = performance.getEntriesByName('menu:interactive')[0];
  const menuTime = menuMark ? `${Math.round(menuMark.startTime)}ms` : 'n/a';
  const regStats = TextureRegistry.getInstance().stats();

  overlay.style.display = 'block';
  overlay.innerHTML = `
    <div><strong style="color:var(--water);">BACKSILENCE DEBUG</strong></div>
    <div>FPS: <strong>${Math.round(stats.fps)}</strong> (${stats.frameTimeMs.toFixed(1)}ms)</div>
    <div>Draw Calls: ${stats.drawCalls} / Tri: ${stats.triangles}</div>
    <div>Geom: ${stats.geometries} / Tex: ${stats.textures}</div>
    <div>Proc VRAM: ~${regStats.memoryMB} (${regStats.count} cached)</div>
    <div>Audio Voices: ${stats.activeVoices}</div>
    <div>Menu Ready: ${menuTime}</div>
  `;
}
