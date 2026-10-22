/* ── WaterSystem.ts ────────────────────────────────────────────────────────
 *  Master presentation water manager integrating camera-following displaced mesh,
 *  analytic ripples, Kelvin wakes, map data texture, foam, and underwater detection.
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
} from 'three';
import type { GroundGrid } from '../../sim/GroundGrid.js';
import type { GraphicsTier, RippleEvent } from '../../types/contracts.js';
import { RippleBuffer } from './RippleBuffer.js';
import { WakeEmitters } from './WakeEmitters.js';
import { buildWaterMapData, type WaterMapResult } from './WaterMapData.js';
import { createWaterMaterial } from './WaterMaterial.js';
import { SplashSystem } from './Splashes.js';
import { makeWaterNormalMap } from '../../procedural/textures/WaterNormal.js';
import type { AudioEngine } from '../../audio/AudioEngine.js';

export interface WaterSystemOptions {
  scene: Scene;
  ground: GroundGrid;
  tier?: GraphicsTier;
  waterY?: number;
  audio?: AudioEngine | undefined;
}

export class WaterSystem {
  readonly root: Object3D;
  readonly mesh: Mesh;
  readonly material: ReturnType<typeof createWaterMaterial>;
  readonly ripples: RippleBuffer;
  readonly wakes: WakeEmitters;
  readonly splashes: SplashSystem;
  readonly mapData: WaterMapResult;

  readonly waterY: number;
  private readonly planeSize = 192.0;
  private readonly segStep: number;
  private readonly audio?: AudioEngine | undefined;

  // Underwater state tracking
  private isUnderwater = false;
  private underwaterT = 0;
  private defaultFogDensity = 0.035;
  private defaultFogColor = new Color('#eedec2');
  private underwaterFogColor = new Color('#123b3a');

  constructor(parent: Object3D, options: WaterSystemOptions) {
    this.root = parent;
    this.waterY = options.waterY ?? 0.0;
    this.audio = options.audio;
    const tier = options.tier ?? 'high';

    // Segments: 192 (high), 160 (medium), 128 (low)
    const segments = tier === 'low' ? 128 : tier === 'medium' ? 160 : 192;
    this.segStep = this.planeSize / segments;

    // 1. Buffers & Subsystems
    this.ripples = new RippleBuffer(tier);
    this.wakes = new WakeEmitters();
    this.splashes = new SplashSystem(parent);
    this.mapData = buildWaterMapData(options.ground, tier);

    const normalTex = makeWaterNormalMap();

    // 2. Water Material
    this.material = createWaterMaterial({
      tier,
      normalTexture: normalTex,
      mapDataTexture: this.mapData.texture,
      mapBounds: this.mapData.boundsUniform,
      ripples: this.ripples.uniformArray,
      wakes: this.wakes.wakesUniform,
      wakeParams: this.wakes.paramsUniform,
      waterY: this.waterY,
    });

    // 3. Water Plane Geometry (XZ plane rotated from XY)
    const geom = new PlaneGeometry(this.planeSize, this.planeSize, segments, segments);
    geom.rotateX(-Math.PI / 2);

    this.mesh = new Mesh(geom, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10; // Render after opaque geometry
    parent.add(this.mesh);
  }

  onRipple(ev: RippleEvent): void {
    this.ripples.addRipple(ev.position.x, ev.position.z, ev.strength, ev.t);
  }

  onSplash(pos: { x: number; y: number; z: number }, strength = 1.0, isMonster = false): void {
    this.splashes.burst(pos, strength, isMonster);
  }

  update(dt: number, time: number, camera: Camera, sceneFog?: FogExp2): void {
    // 1. Camera-following grid snapping to avoid vertex swimming
    const snapX = Math.floor(camera.position.x / this.segStep) * this.segStep;
    const snapZ = Math.floor(camera.position.z / this.segStep) * this.segStep;
    this.mesh.position.set(snapX, 0, snapZ);

    // 2. Update shader uniforms
    const u = this.material.uniforms;
    if (u['uTime']) u['uTime'].value = time;
    if (u['uRippleCount']) u['uRippleCount'].value = this.ripples.count;

    // 3. Upload wake uniforms
    this.wakes.upload();

    // 4. Update splash particles
    this.splashes.update(dt, camera.position);

    // 5. Underwater camera check
    const isCameraBelow = camera.position.y < this.waterY;
    if (isCameraBelow !== this.isUnderwater) {
      this.isUnderwater = isCameraBelow;
      this.material.side = isCameraBelow ? DoubleSide : FrontSide;
      if (u['uUnderwater']) u['uUnderwater'].value = isCameraBelow ? 1.0 : 0.0;
      if (this.audio) {
        this.audio.setUnderwater(isCameraBelow ? 1.0 : 0.0);
      }
    }

    // 6. Smooth underwater fog transition if scene has fog
    if (sceneFog) {
      const targetT = this.isUnderwater ? 1.0 : 0.0;
      this.underwaterT += (targetT - this.underwaterT) * Math.min(1.0, dt * 5.0);

      if (this.underwaterT > 0.01) {
        sceneFog.density = this.defaultFogDensity * (1.0 - this.underwaterT) + 0.16 * this.underwaterT;
        sceneFog.color.copy(this.defaultFogColor).lerp(this.underwaterFogColor, this.underwaterT);
      } else {
        sceneFog.density = this.defaultFogDensity;
        sceneFog.color.copy(this.defaultFogColor);
      }
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mapData.texture.dispose();
    this.splashes.dispose();
    this.mesh.removeFromParent();
  }
}
