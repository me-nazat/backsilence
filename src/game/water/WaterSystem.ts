/* ── WaterSystem.ts ────────────────────────────────────────────────────────
 *  Master presentation water manager integrating camera-following displaced mesh,
 *  analytic ripples, Kelvin wakes, map data texture, foam, underwater detection,
 *  dynamic water levels, and Map 5 bioluminescent floating motes.
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
} from 'three';
import type { GroundGrid } from '../../sim/GroundGrid.js';
import type { GraphicsTier, RippleEvent } from '../../types/contracts.js';
import type { WaterProfile } from './WaterProfile.js';
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
  profile?: WaterProfile;
}

export class WaterSystem {
  readonly root: Object3D;
  readonly mesh: Mesh;
  readonly material: ReturnType<typeof createWaterMaterial>;
  readonly ripples: RippleBuffer;
  readonly wakes: WakeEmitters;
  readonly splashes: SplashSystem;
  readonly mapData: WaterMapResult;

  currentWaterY: number;
  private readonly planeSize = 192.0;
  private readonly segStep: number;
  private readonly audio?: AudioEngine | undefined;

  // Bioluminescent floating motes (Map 5)
  private motesMesh: InstancedMesh | null = null;
  private motesData: Array<{ x: number; y: number; z: number; phase: number; speed: number }> = [];

  // Underwater state tracking
  private isUnderwater = false;
  private underwaterT = 0;
  private defaultFogDensity = 0.035;
  private defaultFogColor = new Color('#eedec2');
  private underwaterFogColor = new Color('#123b3a');

  constructor(parent: Object3D, options: WaterSystemOptions) {
    this.root = parent;
    this.currentWaterY = options.waterY ?? 0.0;
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
      waterY: this.currentWaterY,
      profile: options.profile,
    });

    // 3. Water Plane Geometry (XZ plane rotated from XY)
    const geom = new PlaneGeometry(this.planeSize, this.planeSize, segments, segments);
    geom.rotateX(-Math.PI / 2);

    this.mesh = new Mesh(geom, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10; // Render after opaque geometry
    parent.add(this.mesh);

    // 4. Bioluminescent Motes for Map 5
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

  setLightStreaks(streaks: import('./WaterMaterial.js').LightStreak[]): void {
    const u = this.material.uniforms;
    const count = Math.min(16, streaks.length);
    if (u['uStreakCount']) u['uStreakCount'].value = count;
    for (let i = 0; i < count; i++) {
      const s = streaks[i]!;
      (u['uStreakPos']!.value as import('three').Vector3[])[i]!.copy(s.pos);
      (u['uStreakDir']!.value as import('three').Vector3[])[i]!.copy(s.dir).normalize();
      (u['uStreakSize']!.value as Float32Array)[i] = s.size;
      (u['uStreakColor']!.value as import('three').Vector3[])[i]!.set(s.color.r, s.color.g, s.color.b);
      (u['uStreakIntensity']!.value as Float32Array)[i] = s.intensity;
    }
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

    // 5. Update bioluminescent motes
    if (this.motesMesh && this.motesData.length > 0) {
      const dummy = new Matrix4();
      for (let i = 0; i < this.motesData.length; i++) {
        const m = this.motesData[i]!;
        const driftY = m.y + Math.sin(time * m.speed + m.phase) * 0.15;
        const driftX = m.x + Math.cos(time * 0.4 + m.phase) * 0.2;
        const driftZ = m.z + Math.sin(time * 0.3 + m.phase) * 0.2;
        dummy.setPosition(driftX, driftY, driftZ);
        this.motesMesh.setMatrixAt(i, dummy);
      }
      this.motesMesh.instanceMatrix.needsUpdate = true;
    }

    // 6. Underwater camera check
    const isCameraBelow = camera.position.y < this.currentWaterY;
    if (isCameraBelow !== this.isUnderwater) {
      this.isUnderwater = isCameraBelow;
      this.material.side = isCameraBelow ? DoubleSide : FrontSide;
      if (u['uUnderwater']) u['uUnderwater'].value = isCameraBelow ? 1.0 : 0.0;
      if (this.audio) {
        this.audio.setUnderwater(isCameraBelow ? 1.0 : 0.0);
      }
    }

    // 7. Smooth underwater fog transition if scene has fog
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

    if (this.motesMesh) {
      this.motesMesh.geometry.dispose();
      (this.motesMesh.material as MeshBasicMaterial).dispose();
      this.motesMesh.removeFromParent();
    }
  }
}
