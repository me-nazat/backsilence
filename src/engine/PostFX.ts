/* ── PostFX.ts ──────────────────────────────────────────────────────────
 *  Analog-horror VHS / CRT post-processing pipeline using Three.js EffectComposer.
 *  Pipeline: RenderPass -> BloomLite -> TapeSmear -> VHSPass -> OutputPass.
 *
 *  Features:
 *  - Tension-driven tape degradation (jitter, chroma aberration, dropouts)
 *  - Jumpscare glitch (1.0 decaying over 0.4s)
 *  - Death rewind (1.2s REW with tracking band, noise & OSD ◀◀ REW)
 *  - Per-map color grading (lift, gamma, gain, saturation, tint)
 *  - Quality tiers: high, medium, and low (CSS overlay fallback)
 *  - Photosensitive safe mode & reduced motion clamps
 *  - Exact passthrough parity test (MAE < 1.5%)
 * ──────────────────────────────────────────────────────────────────────── */

import {
  WebGLRenderer,
  Scene,
  Camera,
  Vector2,
  Vector3,
  Color,
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  ShaderMaterial,
  Texture,
  WebGLRenderTarget,
  HalfFloatType,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { TexturePass } from 'three/examples/jsm/postprocessing/TexturePass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { VHSShader } from '../procedural/shaders/vhs.glsl.js';
import type { Settings, PostGrade } from '../types/contracts.js';

export interface PostFXOsdState {
  mode: 'PLAY' | 'REW' | 'EJECT' | 'TRACKING' | 'SIGNAL_LOST';
  recBlink: boolean;
  timestamp: string;
}

export type PostFXMode = 'composer' | 'css-fallback' | 'headless';

export interface PostFXStatus {
  mode: PostFXMode;
  reason?: 'low-quality' | 'headless' | 'composer-failed';
}

export interface PostFXOptions {
  onDegraded?: (status: PostFXStatus) => void;
}

interface VHSUniforms {
  uIntensity: { value: number };
  uTime: { value: number };
  uResolution: { value: Vector2 };
  uGlitch: { value: number };
  uTension: { value: number };
  uRewind: { value: number };
  uSignalLost: { value: number };
  uLines: { value: number };
  uSafeMode: { value: number };
  uCurvature: { value: number };
  uLift: { value: Vector3 };
  uGamma: { value: Vector3 };
  uGain: { value: Vector3 };
  uSaturation: { value: number };
  uTint: { value: Vector3 };
  uVelocity?: { value: Vector2 };
  tDiffuse: { value: unknown };
}

export class PostFX {
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private texturePass: TexturePass | null = null;
  private copyQuad: FullScreenQuad | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private tapeSmearPass: AfterimagePass | null = null;
  private vhsPass: ShaderPass | null = null;
  private outputPass: OutputPass | null = null;

  private cssOverlay: HTMLDivElement | null = null;

  private settings: Settings;
  private postGrade: PostGrade | null = null;
  private width = 1920;
  private height = 1080;

  // Camera Motion Blur tracking
  private prevCameraPos = new Vector3();
  private prevCameraRot = new Vector3();
  private hasPrevCamera = false;

  // Transient State
  private tension = 0; // 0..1
  private glitch = 0; // 0..1
  private glitchDecayRate = 2.5; // decays in ~0.4s
  private rewindTimer = 0; // 1.2s countdown
  private isRewinding = false;
  private onRewindComplete: (() => void) | null = null;
  private signalLost = false;
  private trackingTimer = 0;
  private isTracking = false;
  private isEjected = false;
  private totalTime = 0;
  private osdMode: 'PLAY' | 'REW' | 'EJECT' | 'TRACKING' | 'SIGNAL_LOST' = 'PLAY';

  // Quality management
  private lowFpsTimer = 0;
  private currentTier: 'high' | 'medium' | 'low' = 'high';
  private status: PostFXStatus = { mode: 'css-fallback', reason: 'low-quality' };

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly container: HTMLElement,
    settings: Settings,
    private readonly options: PostFXOptions = {},
  ) {
    this.settings = settings;
    const viewportWidth = typeof window === 'undefined' ? 1920 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 1080 : window.innerHeight;
    this.width = container.clientWidth || viewportWidth || 1920;
    this.height = container.clientHeight || viewportHeight || 1080;

    this.resolveQualityTier();
    this.initComposer();
    this.createCssOverlay();
    this.applySettings(settings);
  }

  private resolveQualityTier(): void {
    const q = this.settings.graphics.quality;
    if (q === 'low') {
      this.currentTier = 'low';
    } else if (q === 'medium') {
      this.currentTier = 'medium';
    } else {
      this.currentTier = 'high';
    }
  }

  private initComposer(): void {
    if (this.currentTier === 'low') {
      this.disposeComposer();
      this.status = { mode: 'css-fallback', reason: 'low-quality' };
      this.options.onDegraded?.(this.status);
      return;
    }

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      this.disposeComposer();
      this.status = { mode: 'headless', reason: 'headless' };
      return;
    }

    try {
      const composerTarget = new WebGLRenderTarget(this.width, this.height, {
        type: HalfFloatType,
        samples: 4,
      });
      this.composer = new EffectComposer(this.renderer, composerTarget);
      this.composer.setSize(this.width, this.height);

      // 1. TexturePass (single-pass texture input, does not render 3D scene)
      this.texturePass = new TexturePass(new Texture());
      this.texturePass.enabled = false;
      this.composer.addPass(this.texturePass);

      // 2. RenderPass (fallback for full 3D scene input)
      this.renderPass = new RenderPass(new Scene(), new Camera());
      this.composer.addPass(this.renderPass);

      this.copyQuad = new FullScreenQuad(new ShaderMaterial(CopyShader));

      // 2. BloomLitePass (half-res, cheap - Prompt 4.12: 0.55, 0.70, 0.85)
      const bloomRes = new Vector2(Math.floor(this.width / 2), Math.floor(this.height / 2));
      this.bloomPass = new UnrealBloomPass(bloomRes, 0.55, 0.70, 0.85);
      this.bloomPass.enabled = this.currentTier === 'high' || this.currentTier === 'medium';
      this.composer.addPass(this.bloomPass);

      // 3. TapeSmearPass (AfterimagePass, enabled only in high tier)
      this.tapeSmearPass = new AfterimagePass(0.18);
      this.tapeSmearPass.enabled = this.currentTier === 'high';
      this.composer.addPass(this.tapeSmearPass);

      // 4. VHSPass
      this.vhsPass = new ShaderPass(VHSShader);
      this.composer.addPass(this.vhsPass);

      // 5. OutputPass (Tone mapping and sRGB color space conversion)
      this.outputPass = new OutputPass();
      this.composer.addPass(this.outputPass);
      this.status = { mode: 'composer' };
    } catch {
      this.currentTier = 'low';
      this.disposeComposer();
      this.status = { mode: 'css-fallback', reason: 'composer-failed' };
      this.options.onDegraded?.(this.status);
    }
  }

  getStatus(): PostFXStatus {
    return this.status;
  }

  private createCssOverlay(): void {
    if (typeof document === 'undefined') return;

    // Check if already present
    let overlay = document.getElementById('vhs-css-fallback') as HTMLDivElement | null;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'vhs-css-fallback';
      overlay.style.position = 'absolute';
      overlay.style.inset = '0';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '5';
      overlay.style.mixBlendMode = 'overlay';

      // Procedural scanlines CSS
      overlay.style.backgroundImage =
        'repeating-linear-gradient(0deg, rgba(0,0,0,0.18), rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px), ' +
        'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%)';
      this.container.appendChild(overlay);
    }
    this.cssOverlay = overlay;
    this.updateCssOverlayVisibility();
  }

  private updateCssOverlayVisibility(): void {
    if (!this.cssOverlay) return;
    if (this.currentTier === 'low' && this.settings.graphics.vhsIntensity > 0) {
      this.cssOverlay.style.display = 'block';
      this.cssOverlay.style.opacity = String(this.settings.graphics.vhsIntensity);
    } else {
      this.cssOverlay.style.display = 'none';
    }
  }

  applySettings(s: Settings): void {
    this.settings = s;
    const prevTier = this.currentTier;
    this.resolveQualityTier();

    if (this.currentTier !== prevTier) {
      this.initComposer();
    }

    this.updateCssOverlayVisibility();

    const u = this.getVhsUniforms();
    if (!u) return;

    const isSafe =
      s.graphics.photosensitiveSafe ||
      s.accessibility.reducedMotion === 'on' ||
      (s.accessibility.reducedMotion === 'system' &&
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const baseIntensity = s.graphics.vhsIntensity;
    if (baseIntensity > 0) {
      const dynamicGrade = baseIntensity * (0.6 + 0.4 * this.tension);
      u.uIntensity.value = isSafe ? Math.min(0.25, dynamicGrade) : dynamicGrade;
    } else {
      u.uIntensity.value = 0.0;
    }
    u.uLines.value = s.graphics.vhsLines ?? 240.0;
    u.uSafeMode.value = isSafe ? 1.0 : 0.0;
    u.uCurvature.value = isSafe ? 0.0 : 0.02;

    if (this.bloomPass) {
      this.bloomPass.strength = isSafe ? 0.2 : 0.55;
    }
    if (this.tapeSmearPass) {
      this.tapeSmearPass.enabled = this.currentTier === 'high' && !isSafe;
    }
  }

  private getVhsUniforms(): VHSUniforms | null {
    if (!this.vhsPass) return null;
    return this.vhsPass.uniforms as unknown as VHSUniforms;
  }

  getPostGrade(): PostGrade | null {
    return this.postGrade;
  }

  setPostGrade(grade?: PostGrade): void {
    this.postGrade = grade ?? null;
    const u = this.getVhsUniforms();
    if (!u) return;

    if (grade) {
      if (grade.lift) {
        u.uLift.value.set(grade.lift[0], grade.lift[1], grade.lift[2]);
      } else {
        u.uLift.value.set(0, 0, 0);
      }

      if (grade.gamma) {
        u.uGamma.value.set(grade.gamma[0], grade.gamma[1], grade.gamma[2]);
      } else {
        u.uGamma.value.set(1, 1, 1);
      }

      if (grade.gain) {
        u.uGain.value.set(grade.gain[0], grade.gain[1], grade.gain[2]);
      } else {
        u.uGain.value.set(1, 1, 1);
      }

      u.uSaturation.value = grade.saturation ?? 1.0;

      if (grade.tint) {
        u.uTint.value.set(grade.tint[0], grade.tint[1], grade.tint[2]);
      } else {
        u.uTint.value.set(1, 1, 1);
      }
    } else {
      u.uLift.value.set(0, 0, 0);
      u.uGamma.value.set(1, 1, 1);
      u.uGain.value.set(1, 1, 1);
      u.uSaturation.value = 1.0;
      u.uTint.value.set(1, 1, 1);
    }
  }

  setTension(tension: number): void {
    this.tension = Math.max(0, Math.min(1, tension));
    const u = this.getVhsUniforms();
    if (u) {
      u.uTension.value = this.tension;
      const baseIntensity = this.settings.graphics.vhsIntensity;
      if (baseIntensity > 0) {
        const dynamicGrade = baseIntensity * (0.6 + 0.4 * this.tension);
        u.uIntensity.value = this.isSafeMode() ? Math.min(0.25, dynamicGrade) : dynamicGrade;
      }
    }
  }

  // Photosensitive & flash safety tracking
  private lastFlashTime = -100;
  private currentLuminance = 1.0;

  /**
   * Process a requested luminance / flash change under photosensitive safety rules:
   * 1. Clamps frame-to-frame luminance change to at most 0.25
   * 2. Clamps flash frequency to at most 3 Hz (min 0.333s interval between flashes)
   */
  filterFlashLuminance(targetLuminance: number): number {
    if (!this.isSafeMode()) {
      this.currentLuminance = targetLuminance;
      return targetLuminance;
    }

    const now = this.totalTime;
    const isFlash = Math.abs(targetLuminance - this.currentLuminance) > 0.15;

    // 1. Flash frequency throttle: at most 3 Hz (>= 0.333s interval)
    if (isFlash) {
      if (now - this.lastFlashTime < 0.333) {
        // Suppress rapid flash, keep current safe luminance
        return this.currentLuminance;
      }
      this.lastFlashTime = now;
    }

    // 2. Clamp luminance change between frames to at most 0.25
    const delta = targetLuminance - this.currentLuminance;
    const clampedDelta = Math.max(-0.25, Math.min(0.25, delta));
    this.currentLuminance += clampedDelta;
    return this.currentLuminance;
  }

  triggerGlitch(intensity = 1.0): void {
    const isSafe = this.isSafeMode();
    this.glitch = isSafe ? Math.min(intensity, 0.25) : Math.min(1.0, intensity);
  }

  triggerJumpscare(): void {
    const isSafe = this.isSafeMode();
    if (isSafe) {
      const now = this.totalTime;
      if (now - this.lastFlashTime < 0.333) return; // 3 Hz limit
      this.lastFlashTime = now;
      this.glitch = 0.25; // Clamped to 0.25
    } else {
      this.glitch = 1.0;
    }
    this.resetSmear();
  }

  triggerDeathRewind(onComplete?: () => void): void {
    this.isRewinding = true;
    this.rewindTimer = 1.2;
    this.osdMode = 'REW';
    this.onRewindComplete = onComplete ?? null;
    this.resetSmear();
  }

  triggerSignalLost(active: boolean): void {
    this.signalLost = active;
    this.osdMode = active ? 'SIGNAL_LOST' : 'PLAY';
    const u = this.getVhsUniforms();
    if (u) {
      u.uSignalLost.value = active ? 0.8 : 0.0;
    }
  }

  triggerTracking(duration = 0.8): void {
    this.isTracking = true;
    this.trackingTimer = duration;
    this.osdMode = 'TRACKING';
    this.triggerGlitch(0.6);
  }

  triggerTapeEjected(): void {
    this.isEjected = true;
    this.osdMode = 'EJECT';
    this.triggerGlitch(0.4);
  }

  resetSmear(): void {
    if (this.tapeSmearPass && 'uniforms' in this.tapeSmearPass) {
      // Temporarily set damp to 0 for this cut frame
      const uniforms = (this.tapeSmearPass as unknown as { uniforms: Record<string, { value: number }> }).uniforms;
      if (uniforms && uniforms['damp']) {
        uniforms['damp'].value = 0.0;
      }
    }
  }

  update(dt: number, cameraSpeed = 0): void {
    this.totalTime += dt;

    // Decay transient glitch
    if (this.glitch > 0) {
      this.glitch = Math.max(0, this.glitch - this.glitchDecayRate * dt);
    }

    // Death rewind countdown
    if (this.isRewinding) {
      this.rewindTimer -= dt;
      if (this.rewindTimer <= 0) {
        this.isRewinding = false;
        this.osdMode = 'PLAY';
        const cb = this.onRewindComplete;
        this.onRewindComplete = null;
        cb?.();
      }
    }

    // Tracking countdown
    if (this.isTracking) {
      this.trackingTimer -= dt;
      if (this.trackingTimer <= 0) {
        this.isTracking = false;
        if (this.osdMode === 'TRACKING') {
          this.osdMode = 'PLAY';
        }
      }
    }

    // Update VHS uniforms
    const u = this.getVhsUniforms();
    if (u) {
      u.uTime.value = this.totalTime;
      u.uGlitch.value = this.glitch;
      u.uRewind.value = this.isRewinding ? 1.0 : 0.0;
      u.uSignalLost.value = this.signalLost ? 0.8 : 0.0;
      const isSafe = this.isSafeMode();
      u.uCurvature.value = isSafe
        ? 0.0
        : 0.02 + 0.015 * this.tension * Math.sin(this.totalTime * 1.5);
    }

    // Tape smear dynamic factor based on camera speed
    if (this.tapeSmearPass && this.currentTier === 'high' && !this.isSafeMode()) {
      const uniforms = (this.tapeSmearPass as unknown as { uniforms: Record<string, { value: number }> }).uniforms;
      if (uniforms && uniforms['damp']) {
        // Base mix 0.14, scaled by camera speed up to 0.28
        const dynamicSmear = Math.min(0.28, Math.max(0.1, 0.14 + cameraSpeed * 0.04));
        uniforms['damp'].value = dynamicSmear;
      }
    }

    // Auto-quality degradation check: if FPS < 45 for 3s
    if (this.settings.graphics.quality === 'auto' && dt > 0.022) {
      this.lowFpsTimer += dt;
      if (this.lowFpsTimer > 3.0) {
        this.lowFpsTimer = 0;
        this.dropQualityTier();
      }
    } else {
      this.lowFpsTimer = Math.max(0, this.lowFpsTimer - dt);
    }
  }

  private dropQualityTier(): void {
    if (this.currentTier === 'high') {
      this.currentTier = 'medium';
      if (this.tapeSmearPass) this.tapeSmearPass.enabled = false;
    } else if (this.currentTier === 'medium' && !this.renderer.capabilities?.isWebGL2) {
      this.currentTier = 'low';
      this.disposeComposer();
      this.updateCssOverlayVisibility();
    }
  }

  copyTexture(src: Texture, dst: WebGLRenderTarget | null): void {
    if (!this.copyQuad) {
      this.copyQuad = new FullScreenQuad(new ShaderMaterial(CopyShader));
    }
    (this.copyQuad.material as ShaderMaterial).uniforms['tDiffuse']!.value = src;
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(dst);
    this.copyQuad.render(this.renderer);
    this.renderer.setRenderTarget(prevTarget);
  }

  render(scene: Scene, camera: Camera, dt = 0.016, inputTexture?: Texture | null): void {
    if (this.currentTier === 'low' || !this.composer) {
      if (inputTexture) {
        if (!this.copyQuad) {
          this.copyQuad = new FullScreenQuad(new ShaderMaterial(CopyShader));
        }
        (this.copyQuad.material as ShaderMaterial).uniforms['tDiffuse']!.value = inputTexture;
        this.renderer.setRenderTarget(null);
        this.copyQuad.render(this.renderer);
      } else {
        this.renderer.render(scene, camera);
      }
      return;
    }

    // Camera Motion Blur: calculate velocity from camera position & rotation deltas
    if (this.hasPrevCamera && dt > 0.0001) {
      const deltaX = (camera.position.x - this.prevCameraPos.x) + (camera.rotation.y - this.prevCameraRot.y) * 2.5;
      const deltaY = (camera.position.y - this.prevCameraPos.y) - (camera.rotation.x - this.prevCameraRot.x) * 2.5;
      const speed = Math.hypot(deltaX, deltaY);
      const u = this.getVhsUniforms();
      if (u && u.uVelocity) {
        if (this.isSafeMode() || speed < 0.001) {
          u.uVelocity.value.set(0, 0);
        } else {
          const factor = Math.min(0.055, speed * 0.032);
          u.uVelocity.value.set((deltaX / (speed || 1)) * factor, (deltaY / (speed || 1)) * factor);
        }
      }
    }
    this.prevCameraPos.copy(camera.position);
    this.prevCameraRot.set(camera.rotation.x, camera.rotation.y, camera.rotation.z);
    this.hasPrevCamera = true;

    if (inputTexture && this.texturePass) {
      this.texturePass.enabled = true;
      this.texturePass.map = inputTexture;
      if (this.renderPass) this.renderPass.enabled = false;
    } else {
      if (this.texturePass) this.texturePass.enabled = false;
      if (this.renderPass) {
        this.renderPass.enabled = true;
        this.renderPass.scene = scene;
        this.renderPass.camera = camera;
      }
    }

    this.composer.render(dt);
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.bloomPass) {
      this.bloomPass.setSize(Math.floor(width / 2), Math.floor(height / 2));
    }
    const u = this.getVhsUniforms();
    if (u) {
      u.uResolution.value.set(width, height);
    }
  }

  getOsdState(): PostFXOsdState {
    const isBlinking = Math.floor(this.totalTime * 2) % 2 === 0;
    const hours = Math.floor(this.totalTime / 3600);
    const mins = Math.floor((this.totalTime % 3600) / 60);
    const secs = Math.floor(this.totalTime % 60);
    const timestamp = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const mode = this.isEjected ? 'EJECT' : this.osdMode;

    return {
      mode,
      recBlink: isBlinking,
      timestamp: `AUG 14 1998  ${timestamp}`,
    };
  }

  private isSafeMode(): boolean {
    return (
      this.settings.graphics.photosensitiveSafe ||
      this.settings.accessibility.reducedMotion === 'on' ||
      (this.settings.accessibility.reducedMotion === 'system' &&
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    );
  }

  /**
   * Browser self-test for VHS parity:
   * Compares direct render vs composer render with intensity 0 (MAE < 1.5%),
   * tests glitch decay and safe-mode clamping.
   */
  async postSelfTest(): Promise<{
    parityMAE: number;
    parityPass: boolean;
    glitchDecayPass: boolean;
    safeModeClampPass: boolean;
    allPassed: boolean;
  }> {
    // 1. Create a test scene with distinct colored quadrants
    const testScene = new Scene();
    const testCamera = new Camera();
    const planeGeom = new PlaneGeometry(2, 2);
    const planeMat = new MeshBasicMaterial({ color: new Color(0.7, 0.4, 0.2) });
    const quad = new Mesh(planeGeom, planeMat);
    testScene.add(quad);

    const testW = 256;
    const testH = 256;
    this.setSize(testW, testH);

    // Direct render readback
    this.renderer.setSize(testW, testH, false);
    this.renderer.render(testScene, testCamera);
    const directPixels = new Uint8Array(testW * testH * 4);
    const gl = this.renderer.getContext();
    gl.readPixels(0, 0, testW, testH, gl.RGBA, gl.UNSIGNED_BYTE, directPixels);

    // Composer render with intensity 0
    const prevIntensity = this.settings.graphics.vhsIntensity;
    this.settings.graphics.vhsIntensity = 0.0;
    this.applySettings(this.settings);
    this.render(testScene, testCamera, 0.016);

    const composerPixels = new Uint8Array(testW * testH * 4);
    gl.readPixels(0, 0, testW, testH, gl.RGBA, gl.UNSIGNED_BYTE, composerPixels);

    // Calculate MAE (Mean Absolute Error)
    let totalDiff = 0;
    const sampleCount = testW * testH * 3;
    for (let i = 0; i < directPixels.length; i += 4) {
      totalDiff += Math.abs(directPixels[i]! - composerPixels[i]!);
      totalDiff += Math.abs(directPixels[i + 1]! - composerPixels[i + 1]!);
      totalDiff += Math.abs(directPixels[i + 2]! - composerPixels[i + 2]!);
    }
    const mae = totalDiff / sampleCount / 255.0; // 0..1 scale
    const parityPass = mae < 0.015; // < 1.5%

    // 2. Glitch decay assertion
    this.triggerGlitch(1.0);
    const initialGlitch = this.glitch;
    this.update(0.2); // 200ms decay
    const decayedGlitch = this.glitch;
    const glitchDecayPass = initialGlitch === 1.0 && decayedGlitch < initialGlitch && decayedGlitch > 0;

    // 3. Safe mode clamp assertion
    this.settings.graphics.photosensitiveSafe = true;
    this.applySettings(this.settings);
    this.triggerGlitch(1.0);
    const safeGlitch = this.glitch;
    const safeModeClampPass = safeGlitch <= 0.35;

    // Restore settings
    this.settings.graphics.photosensitiveSafe = false;
    this.settings.graphics.vhsIntensity = prevIntensity;
    this.applySettings(this.settings);
    planeGeom.dispose();
    planeMat.dispose();

    const allPassed = parityPass && glitchDecayPass && safeModeClampPass;

    return {
      parityMAE: mae,
      parityPass,
      glitchDecayPass,
      safeModeClampPass,
      allPassed,
    };
  }

  dispose(): void {
    this.disposeComposer();
    if (this.cssOverlay && this.cssOverlay.parentElement) {
      this.cssOverlay.parentElement.removeChild(this.cssOverlay);
      this.cssOverlay = null;
    }
  }

  private disposeComposer(): void {
    if (this.composer) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
      this.composer = null;
    }
    if (this.bloomPass) {
      this.bloomPass.dispose();
      this.bloomPass = null;
    }
    if (this.texturePass) {
      this.texturePass.dispose?.();
      this.texturePass = null;
    }
    if (this.copyQuad) {
      this.copyQuad.dispose();
      this.copyQuad = null;
    }
    this.renderPass = null;
    this.tapeSmearPass = null;
    this.vhsPass = null;
    this.outputPass = null;
  }
}
