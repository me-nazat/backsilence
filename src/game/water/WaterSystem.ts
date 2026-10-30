/* ── WaterSystem.ts ────────────────────────────────────────────────────────
 *  Master presentation water manager integrating camera-following displaced mesh,
 *  GpuWaveSimulation (2D wave equation with obstacle reflections),
 *  analytic ripples, Kelvin wakes, map data texture, scene depth texture pass,
 *  Beer-Lambert depth absorption, CubeCamera / Planar reflections, GGX glints,
 *  foam, underwater detection, dynamic water levels, and Map 5 bioluminescence.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Mesh,
  PlaneGeometry,
  DoubleSide,
  FrontSide,
  Object3D,
  type Camera,
  type Scene,
  type FogExp2,
  Color,
  InstancedMesh,
  Matrix4,
  DynamicDrawUsage,
  MeshBasicMaterial,
  CircleGeometry,
  type Texture,
  CubeCamera,
  WebGLCubeRenderTarget,
  LinearMipmapLinearFilter,
  WebGLRenderTarget,
  PerspectiveCamera,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three';
import type { GroundGrid } from '../../sim/GroundGrid.js';
import type { GraphicsTier, RippleEvent } from '../../types/contracts.js';
import type { WaterProfile } from './WaterProfile.js';
import { RippleBuffer } from './RippleBuffer.js';
import { WakeEmitters } from './WakeEmitters.js';
import { buildWaterMapData, type WaterMapResult } from './WaterMapData.js';
import { createWaterMaterial, type LightStreak } from './WaterMaterial.js';
import { SplashSystem } from './Splashes.js';
import { GpuWaveSimulation } from './GpuWaveSimulation.js';
import { makeWaterNormalMap } from '../../procedural/textures/WaterNormal.js';
import type { AudioEngine } from '../../audio/AudioEngine.js';

const _scratchForward = new Vector3();
const _scratchLookTarget = new Vector3();

export interface WaterSystemOptions {
  scene: Scene;
  ground: GroundGrid;
  tier?: GraphicsTier;
  waterY?: number;
  audio?: AudioEngine | undefined;
  profile?: WaterProfile;
  streaks?: LightStreak[];
  sunDir?: Vector3 | undefined;
}

export class WaterSystem {
  readonly root: Object3D;
  readonly mesh: Mesh;
  readonly material: ReturnType<typeof createWaterMaterial>;
  readonly ripples: RippleBuffer;
  readonly wakes: WakeEmitters;
  readonly splashes: SplashSystem;
  readonly waveSim: GpuWaveSimulation;
  readonly mapData: WaterMapResult;
  readonly tier: GraphicsTier;
  public currentTier: GraphicsTier;

  currentWaterY: number;
  private readonly planeSize = 192.0;
  private readonly segStep: number;
  private readonly audio?: AudioEngine | undefined;

  // Reflection subsystems
  private cubeRenderTarget: WebGLCubeRenderTarget | null = null;
  private cubeCamera: CubeCamera | null = null;
  private planarRenderTarget: WebGLRenderTarget | null = null;
  private planarCamera: PerspectiveCamera | null = null;
  private hasCapturedEnvCube = false;

  // Bioluminescent floating motes (Map 5)
  public motesMesh: InstancedMesh | null = null;
  private motesData: Array<{ x: number; y: number; z: number; phase: number; speed: number }> = [];
  private readonly motesDummy = new Matrix4();

  // Underwater state tracking
  private isUnderwater = false;
  private underwaterT = 0;
  private fogInitialized = false;
  private defaultFogDensity = 0.035;
  private defaultFogColor = new Color('#eedec2');
  private underwaterFogColor = new Color('#163f33');

  constructor(parent: Object3D, options: WaterSystemOptions) {
    this.root = parent;
    this.currentWaterY = options.waterY ?? 0.0;
    this.audio = options.audio;
    const tier = options.tier ?? 'high';
    this.tier = tier;
    this.currentTier = tier;

    // Segments: 192 (high), 160 (medium), 96 (low) (Prompt 8.8)
    const segments = tier === 'low' ? 96 : tier === 'medium' ? 160 : 192;
    this.segStep = this.planeSize / segments;

    // 1. Buffers & Subsystems
    this.ripples = new RippleBuffer(tier);
    this.wakes = new WakeEmitters();
    this.splashes = new SplashSystem(parent, this.currentWaterY);
    this.mapData = buildWaterMapData(options.ground, tier);
    this.waveSim = new GpuWaveSimulation({
      tier,
      ground: options.ground,
      waterY: this.currentWaterY,
    });

    const normalTex = makeWaterNormalMap();

    // 2. Setup reflection targets by tier
    if (tier === 'medium' || tier === 'high') {
      try {
        this.cubeRenderTarget = new WebGLCubeRenderTarget(64, {
          generateMipmaps: true,
          minFilter: LinearMipmapLinearFilter,
        });
        this.cubeCamera = new CubeCamera(0.1, 80.0, this.cubeRenderTarget);
        this.cubeCamera.position.set(0, this.currentWaterY + 0.15, 0);
      } catch {
        // Fallback gracefully in headless/test environments without WebGLCubeRenderTarget
      }
    }

    if (tier === 'high') {
      try {
        this.planarRenderTarget = new WebGLRenderTarget(640, 360);
        this.planarCamera = new PerspectiveCamera(60, 640 / 360, 0.1, 120.0);
      } catch {
        // Fallback gracefully
      }
    }

    // 3. Water Material
    this.material = createWaterMaterial({
      tier,
      normalTexture: normalTex,
      mapDataTexture: this.mapData.texture,
      mapBounds: this.mapData.boundsUniform,
      ripples: this.ripples.uniformArray,
      wakes: this.wakes.wakesUniform,
      wakeParams: this.wakes.paramsUniform,
      waterY: this.currentWaterY,
      profile: options.profile,
      streaks: options.streaks,
      sunDir: options.sunDir,
      envCube: this.cubeRenderTarget?.texture ?? null,
      planarReflection: this.planarRenderTarget?.texture ?? null,
    });

    // 4. Water Plane Geometry (XZ plane rotated from XY)
    const geom = new PlaneGeometry(this.planeSize, this.planeSize, segments, segments);
    geom.rotateX(-Math.PI / 2);

    this.mesh = new Mesh(geom, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10; // Render after opaque geometry
    parent.add(this.mesh);

    // 5. Bioluminescent Motes for Map 5
    const motesCount = options.profile?.bioluminescence?.motes ?? 0;
    if (motesCount > 0) {
      const moteGeom = new CircleGeometry(0.04, 6);
      const moteMat = new MeshBasicMaterial({
        color: new Color(options.profile?.bioluminescence?.color ?? '#3ff2c8'),
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      });

      this.motesMesh = new InstancedMesh(moteGeom, moteMat, motesCount);
      this.motesMesh.instanceMatrix.setUsage(DynamicDrawUsage);
      this.motesMesh.renderOrder = 11;

      const dummy = new Matrix4();
      for (let i = 0; i < motesCount; i++) {
        const x = (Math.random() - 0.5) * 60.0;
        const z = (Math.random() - 0.5) * 60.0;
        const y = this.currentWaterY + 0.1 + Math.random() * 0.8;
        const phase = Math.random() * Math.PI * 2.0;
        const speed = 0.5 + Math.random() * 0.8;

        this.motesData.push({ x, y, z, phase, speed });
        dummy.setPosition(x, y, z);
        this.motesMesh.setMatrixAt(i, dummy);
      }
      this.motesMesh.instanceMatrix.needsUpdate = true;
      parent.add(this.motesMesh);
    }
  }

  get waterY(): number {
    return this.currentWaterY;
  }

  updateWaterY(newY: number): void {
    this.currentWaterY = newY;
    if (this.material.uniforms['uWaterY']) {
      this.material.uniforms['uWaterY'].value = newY;
    }
  }

  private planarFrameCount = 0;

  setQuality(tier: GraphicsTier): void {
    this.currentTier = tier;
    if (this.material.uniforms['uTier']) {
      this.material.uniforms['uTier'].value = tier === 'low' ? 0.0 : tier === 'medium' ? 1.0 : 2.0;
    }
    if (this.motesMesh) {
      this.motesMesh.visible = tier !== 'low';
    }
  }

  /** Capture 64px CubeCamera reflection once at map load (Medium & High) */
  captureEnvMap(renderer: WebGLRenderer, scene: Scene): void {
    if (this.currentTier === 'low' || !this.cubeCamera || !this.cubeRenderTarget || this.hasCapturedEnvCube) return;
    this.mesh.visible = false;
    this.cubeCamera.update(renderer, scene);
    this.mesh.visible = true;
    this.hasCapturedEnvCube = true;
    if (this.material.uniforms['uEnvCube']) {
      this.material.uniforms['uEnvCube'].value = this.cubeRenderTarget.texture;
    }
  }

  /** Update half-res planar reflection (High tier only, every 2nd frame) */
  updatePlanarReflection(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
    if (this.currentTier !== 'high' || !this.planarRenderTarget || !this.planarCamera) return;
    if (this.planarFrameCount++ % 2 !== 0) return;
    if (camera instanceof PerspectiveCamera) {
      this.planarCamera.fov = camera.fov;
      this.planarCamera.aspect = camera.aspect;
      this.planarCamera.near = camera.near;
      this.planarCamera.far = camera.far;
      this.planarCamera.updateProjectionMatrix();

      const d = 2.0 * (camera.position.y - this.currentWaterY);
      this.planarCamera.position.set(camera.position.x, camera.position.y - d, camera.position.z);

      camera.getWorldDirection(_scratchForward);
      _scratchForward.y = -_scratchForward.y;
      _scratchLookTarget.copy(this.planarCamera.position).add(_scratchForward);
      this.planarCamera.lookAt(_scratchLookTarget);
      this.planarCamera.updateMatrixWorld();

      this.mesh.visible = false;
      const prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(this.planarRenderTarget);
      renderer.render(scene, this.planarCamera);
      renderer.setRenderTarget(prevTarget);
      this.mesh.visible = true;

      if (this.material.uniforms['uPlanarReflection']) {
        this.material.uniforms['uPlanarReflection'].value = this.planarRenderTarget.texture;
      }
    }
  }

  /** Step and render GPU wave simulation (Medium & High) */
  renderWaveSim(renderer: WebGLRenderer): void {
    if (this.currentTier === 'low') return;
    if (!this.waveSim.isReady) {
      this.waveSim.initGpu(renderer);
    }
    if (this.waveSim.isReady) {
      this.waveSim.renderGpu(renderer);
      const tex = this.waveSim.texture;
      const u = this.material.uniforms;
      if (tex && u['uWaveSimTexture']) {
        u['uWaveSimTexture'].value = tex;
        if (u['uHasWaveSim']) u['uHasWaveSim'].value = 1.0;
        if (u['uWaveSimCenter']) (u['uWaveSimCenter'].value as Vector2).set(
          this.waveSim.windowCenter.x,
          this.waveSim.windowCenter.y,
        );
        if (u['uWaveSimSize']) u['uWaveSimSize'].value = this.waveSim.windowSize;
        if (u['uWaveSimResolution']) u['uWaveSimResolution'].value = this.waveSim.resolution;
      }
    }
  }

  /** Upload scene depth & color textures from opaque pre-pass */
  setDepthTextures(
    depthTexture: Texture | null,
    colorTexture: Texture | null,
    near: number,
    far: number,
    width: number,
    height: number,
  ): void {
    const u = this.material.uniforms;
    if (depthTexture && colorTexture) {
      if (u['uSceneDepth']) u['uSceneDepth'].value = depthTexture;
      if (u['uSceneColor']) u['uSceneColor'].value = colorTexture;
      if (u['uHasSceneDepth']) u['uHasSceneDepth'].value = 1.0;
    } else {
      if (u['uHasSceneDepth']) u['uHasSceneDepth'].value = 0.0;
    }
    if (u['uCameraNear']) u['uCameraNear'].value = near;
    if (u['uCameraFar']) u['uCameraFar'].value = far;
    if (u['uResolution']) (u['uResolution'].value as Vector2).set(width, height);
  }

  setLightStreaks(streaks: LightStreak[]): void {
    const u = this.material.uniforms;
    const count = Math.min(16, streaks.length);
    if (u['uStreakCount']) u['uStreakCount'].value = count;
    for (let i = 0; i < count; i++) {
      const s = streaks[i]!;
      (u['uStreakPos']!.value as Vector3[])[i]!.copy(s.pos);
      (u['uStreakDir']!.value as Vector3[])[i]!.copy(s.dir).normalize();
      (u['uStreakSize']!.value as Float32Array)[i] = s.size;
      (u['uStreakColor']!.value as Vector3[])[i]!.set(s.color.r, s.color.g, s.color.b);
      (u['uStreakIntensity']!.value as Float32Array)[i] = s.intensity;
    }
  }

  onRipple(ev: RippleEvent): void {
    this.ripples.addRipple(ev.position.x, ev.position.z, ev.strength, ev.t);
    this.waveSim.injectImpulse(ev.position.x, ev.position.z, 0.6, ev.strength * 0.08);
  }

  onSplash(pos: { x: number; y: number; z: number }, strength = 1.0, isMonster = false): void {
    this.splashes.burst(pos, strength, isMonster);
  }

  update(dt: number, time: number, camera: Camera, sceneFog?: FogExp2): void {
    // 1. Camera-following grid snapping to avoid vertex swimming
    const snapX = Math.floor(camera.position.x / this.segStep) * this.segStep;
    const snapZ = Math.floor(camera.position.z / this.segStep) * this.segStep;
    this.mesh.position.set(snapX, 0, snapZ);

    // 2. Step 2D Wave Equation
    this.waveSim.step(dt, camera.position.x, camera.position.z);

    // 3. Update shader uniforms
    const u = this.material.uniforms;
    if (u['uTime']) u['uTime'].value = time;
    if (u['uRippleCount']) u['uRippleCount'].value = this.ripples.count;

    // 4. Upload wake uniforms
    this.wakes.upload();

    // 5. Update splash particles & foam rings
    this.splashes.update(dt, camera.position);

    // 6. Update bioluminescent motes
    if (this.motesMesh && this.motesData.length > 0) {
      for (let i = 0; i < this.motesData.length; i++) {
        const m = this.motesData[i]!;
        const driftY = m.y + Math.sin(time * m.speed + m.phase) * 0.15;
        const driftX = m.x + Math.cos(time * 0.4 + m.phase) * 0.2;
        const driftZ = m.z + Math.sin(time * 0.3 + m.phase) * 0.2;
        this.motesDummy.setPosition(driftX, driftY, driftZ);
        this.motesMesh.setMatrixAt(i, this.motesDummy);
      }
      this.motesMesh.instanceMatrix.needsUpdate = true;
    }

    // 7. Underwater camera check
    const isCameraBelow = camera.position.y < this.currentWaterY;
    if (isCameraBelow !== this.isUnderwater) {
      this.isUnderwater = isCameraBelow;
      this.material.side = isCameraBelow ? DoubleSide : FrontSide;
      if (u['uUnderwater']) u['uUnderwater'].value = isCameraBelow ? 1.0 : 0.0;
      if (this.audio) {
        this.audio.setUnderwater(isCameraBelow ? 1.0 : 0.0);
      }
    }

    // 8. Smooth underwater fog transition if scene has fog
    if (sceneFog) {
      if (!this.fogInitialized) {
        this.defaultFogDensity = sceneFog.density;
        this.defaultFogColor.copy(sceneFog.color);
        this.fogInitialized = true;
      }
      const targetT = this.isUnderwater ? 1.0 : 0.0;
      this.underwaterT += (targetT - this.underwaterT) * Math.min(1.0, dt * 5.0);

      if (this.underwaterT > 0.01) {
        sceneFog.density = this.defaultFogDensity * (1.0 - this.underwaterT) + 0.11 * this.underwaterT;
        sceneFog.color.copy(this.defaultFogColor).lerp(this.underwaterFogColor, this.underwaterT);
      } else {
        sceneFog.density = this.defaultFogDensity;
        sceneFog.color.copy(this.defaultFogColor);
      }
    }
  }

  /** Run Water v2 self-test suite */
  selfTest(): {
    passed: boolean;
    hasNaN: boolean;
    energyDecayed: boolean;
    obstacleReflected: boolean;
    maxAgreementError: number;
    details: string;
  } {
    return this.waveSim.selfTest();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mapData.texture.dispose();
    this.splashes.dispose();
    this.waveSim.dispose();
    this.cubeRenderTarget?.dispose();
    this.planarRenderTarget?.dispose();
    this.mesh.removeFromParent();

    if (this.motesMesh) {
      this.motesMesh.geometry.dispose();
      (this.motesMesh.material as MeshBasicMaterial).dispose();
      this.motesMesh.removeFromParent();
    }
  }
}

/** Standalone waterSelfTest function for Debug/window harness */
export function waterSelfTest(): {
  passed: boolean;
  hasNaN: boolean;
  energyDecayed: boolean;
  obstacleReflected: boolean;
  maxAgreementError: number;
  details: string;
} {
  const sim = new GpuWaveSimulation({ tier: 'high' });
  const result = sim.selfTest();
  sim.dispose();
  return result;
}
