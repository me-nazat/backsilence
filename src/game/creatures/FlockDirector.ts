/* ── FlockDirector.ts ──────────────────────────────────────────────────────
 *  Harmless ambient fauna: 5 deterministic flying skulls circling overhead.
 *  - Category: ambient_fauna (ZERO NoiseEvents, zero collision, replication-free)
 *  - Approach from horizon -> circle at 9-16m altitude -> dip skim -> depart
 *  - InstancedMesh with LOD0 (<30m) and LOD1 (>=30m)
 *  - Wing flap animation via vertex shader, cold emissive eye sockets, faint rim
 *  - Soft moving shadow discs on water surface
 *  - Cosmetic ripples on water skim
 *  - Pure function of (seed, simTime, flockIndex)
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Object3D,
  InstancedMesh,
  ConeGeometry,
  CircleGeometry,
  MeshBasicMaterial,
  ShaderMaterial,
  Color,
  Vector3,
  Quaternion,
  DynamicDrawUsage,
  type Camera,
} from 'three';
import type { AudioEngine } from '../../audio/AudioEngine.js';
import type { WaterSystem } from '../water/WaterSystem.js';

export interface FlockConfig {
  seed: number;
  anchor: Vector3;
  waterY: number;
  count?: number; // default 5 (setting: creatures.ambientFlyers)
  audio?: AudioEngine | undefined;
  water?: WaterSystem | undefined;
}

export class FlockDirector {
  static readonly FLOCK_SIZE = 5;

  readonly root = new Object3D();
  readonly skullMeshLOD0: InstancedMesh;
  readonly skullMeshLOD1: InstancedMesh;
  readonly shadowMesh: InstancedMesh;

  private readonly seed: number;
  private readonly anchor: Vector3;
  private readonly waterY: number;
  private readonly count: number;
  private readonly audio?: AudioEngine | undefined;
  private readonly water?: WaterSystem | undefined;

  private readonly dummy = new Object3D();
  private readonly vPos = new Vector3();
  private readonly vDir = new Vector3();
  private readonly qRot = new Quaternion();
  private lastAudioTime = 0;
  private lastWingbeatTime = 0;
  private lastRippleTime = 0;

  constructor(config: FlockConfig) {
    this.seed = config.seed;
    this.anchor = config.anchor.clone();
    this.waterY = config.waterY;
    this.count = Math.min(FlockDirector.FLOCK_SIZE, config.count ?? FlockDirector.FLOCK_SIZE);
    this.audio = config.audio;
    this.water = config.water;

    this.root.name = 'FlockDirector';

    // 1. Procedural Wing-Skull Shader Material
    // Enforces zero-white emissive bug: base is lit with NdotL, sockets are cyan, faint rim
    const skullMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBoneColor: { value: new Color('#d4cebe') },
        uEyeColor: { value: new Color('#22ecd2') },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vPos;
        varying vec2 vUv;

        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec3 p = position;

          // Wing flap motion: lateral vertices flap vertically with phase offset
          float flap = sin(uTime * 7.5 + p.z * 2.0) * abs(p.x) * 0.45;
          p.y += flap;

          vPos = p;
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uBoneColor;
        uniform vec3 uEyeColor;
        varying vec3 vNormal;
        varying vec3 vPos;
        varying vec2 vUv;

        void main() {
          // Weathered bone lighting
          float NdotL = max(0.18, dot(vNormal, normalize(vec3(0.5, 0.8, 0.3))));
          vec3 col = uBoneColor * NdotL;

          // Cold emissive eye sockets
          if (vPos.z > 0.15 && abs(vPos.x) > 0.08 && abs(vPos.x) < 0.22 && abs(vPos.y) < 0.12) {
            col += uEyeColor * 1.8;
          }

          // Ghostly cold rim lighting
          float rim = 1.0 - max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0)));
          col += uEyeColor * pow(rim, 3.5) * 0.35;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    // LOD0: Detailed skull geometry (< 30m, ~400 tris/skull = 2k tris total)
    const geomLOD0 = new ConeGeometry(0.38, 1.2, 12);
    geomLOD0.rotateX(Math.PI / 2);

    this.skullMeshLOD0 = new InstancedMesh(geomLOD0, skullMat, FlockDirector.FLOCK_SIZE);
    this.skullMeshLOD0.instanceMatrix.setUsage(DynamicDrawUsage);
    this.skullMeshLOD0.frustumCulled = false;
    this.root.add(this.skullMeshLOD0);

    // LOD1: Simplified wedge geometry (>= 30m, 40 tris/skull)
    const geomLOD1 = new ConeGeometry(0.35, 1.0, 5);
    geomLOD1.rotateX(Math.PI / 2);

    this.skullMeshLOD1 = new InstancedMesh(geomLOD1, skullMat, FlockDirector.FLOCK_SIZE);
    this.skullMeshLOD1.instanceMatrix.setUsage(DynamicDrawUsage);
    this.skullMeshLOD1.frustumCulled = false;
    this.skullMeshLOD1.visible = false;
    this.root.add(this.skullMeshLOD1);

    // 2. Soft Shadow Discs on water surface
    const shadowGeom = new CircleGeometry(1.2, 16);
    shadowGeom.rotateX(-Math.PI / 2); // flat on water surface
    const shadowMat = new MeshBasicMaterial({
      color: new Color('#0a1614'),
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });

    this.shadowMesh = new InstancedMesh(shadowGeom, shadowMat, FlockDirector.FLOCK_SIZE);
    this.shadowMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.shadowMesh.frustumCulled = false;
    this.shadowMesh.position.y = this.waterY + 0.01;
    this.root.add(this.shadowMesh);
  }

  /**
   * Deterministic flock trajectory function of (seed, simTime, index).
   */
  evaluateFlockPosition(simTime: number, index: number, outPos: Vector3, outDir: Vector3): boolean {
    const cyclePeriod = 110.0; // 110s recurring cycle
    const cycleTime = (simTime + this.seed * 17.3) % cyclePeriod;

    // First arrival at ~25s, active for ~45s (until ~75s), next visit ~110s later
    if (cycleTime < 22.0 || cycleTime > 75.0) {
      return false; // Flock is beyond horizon
    }

    const t = (cycleTime - 22.0) / (75.0 - 22.0); // 0..1 phase

    // Individual boid offsets
    const angleOffset = (index / FlockDirector.FLOCK_SIZE) * Math.PI * 0.6;
    const radiusOffset = ((index % 3) - 1) * 3.5;
    const heightOffset = ((index % 2) - 0.5) * 2.2;

    let posX = 0;
    let posY = 0;
    let posZ = 0;

    if (t < 0.25) {
      // Phase 1: Approach from horizon
      const entryProgress = t / 0.25;
      const startDist = 90.0;
      const endDist = 24.0;
      const dist = startDist * (1.0 - entryProgress) + endDist * entryProgress;
      const approachAngle = (this.seed * 0.7) + angleOffset * 0.3;

      posX = this.anchor.x + Math.cos(approachAngle) * (dist + radiusOffset);
      posZ = this.anchor.z + Math.sin(approachAngle) * (dist + radiusOffset);
      posY = this.waterY + 18.0 * (1.0 - entryProgress) + 12.0 * entryProgress + heightOffset;
    } else if (t < 0.75) {
      // Phase 2: Circling orbit around anchor (altitude 9-16m), with occasional dip skim
      const orbitProgress = (t - 0.25) / 0.5;
      const orbitAngle = orbitProgress * Math.PI * 3.5 + angleOffset;
      const orbitRadius = 18.0 + radiusOffset + Math.sin(orbitProgress * Math.PI * 4.0) * 4.0;

      posX = this.anchor.x + Math.cos(orbitAngle) * orbitRadius;
      posZ = this.anchor.z + Math.sin(orbitAngle) * orbitRadius;

      // Occasional dip skim (skulls 1 and 3 dip to 1.5m - 2.0m above water)
      let baseHeight = 12.0 + Math.sin(orbitAngle * 2.0) * 3.0 + heightOffset;
      if ((index === 1 || index === 3) && orbitProgress > 0.35 && orbitProgress < 0.65) {
        const dipT = Math.sin(((orbitProgress - 0.35) / 0.3) * Math.PI);
        baseHeight = baseHeight * (1.0 - dipT) + 1.8 * dipT; // skim 1.8m above water
      }
      posY = this.waterY + Math.max(1.5, baseHeight);
    } else {
      // Phase 3: Departure toward distant horizon
      const exitProgress = (t - 0.75) / 0.25;
      const startDist = 24.0;
      const endDist = 110.0;
      const dist = startDist * (1.0 - exitProgress) + endDist * exitProgress;
      const exitAngle = (this.seed * 0.7 + Math.PI) + angleOffset * 0.3;

      posX = this.anchor.x + Math.cos(exitAngle) * (dist + radiusOffset);
      posZ = this.anchor.z + Math.sin(exitAngle) * (dist + radiusOffset);
      posY = this.waterY + 12.0 * (1.0 - exitProgress) + 24.0 * exitProgress + heightOffset;
    }

    outPos.set(posX, posY, posZ);

    // Compute velocity direction by sampling t + dt
    const nextPos = new Vector3();
    const nextDir = new Vector3();
    this.evaluateFlockPosition(simTime + 0.1, index, nextPos, nextDir);
    outDir.subVectors(nextPos, outPos).normalize();

    return true;
  }

  update(_dt: number, simTime: number, camera?: Camera): void {
    const u = (this.skullMeshLOD0.material as ShaderMaterial).uniforms;
    if (u['uTime']) u['uTime'].value = simTime;

    let anyActive = false;
    let avgDistToCam = 50.0;
    if (camera) {
      avgDistToCam = camera.position.distanceTo(this.anchor);
    }

    const useLOD0 = avgDistToCam < 30.0;
    this.skullMeshLOD0.visible = useLOD0;
    this.skullMeshLOD1.visible = !useLOD0;

    for (let i = 0; i < FlockDirector.FLOCK_SIZE; i++) {
      if (i >= this.count) {
        this.hideInstance(i);
        continue;
      }

      const active = this.evaluateFlockPosition(simTime, i, this.vPos, this.vDir);
      if (!active) {
        this.hideInstance(i);
        continue;
      }

      anyActive = true;

      // 1. Skull instance matrix with banking angle
      this.dummy.position.copy(this.vPos);
      this.qRot.setFromUnitVectors(new Vector3(0, 0, 1), this.vDir);
      this.dummy.quaternion.copy(this.qRot);

      // Banking angle based on turn rate
      const bank = -this.vDir.x * 0.35;
      this.dummy.rotateZ(bank);

      this.dummy.scale.set(1.0, 1.0, 1.0);
      this.dummy.updateMatrix();

      this.skullMeshLOD0.setMatrixAt(i, this.dummy.matrix);
      this.skullMeshLOD1.setMatrixAt(i, this.dummy.matrix);

      // 2. Shadow disc on water surface (fades with altitude)
      const altitude = this.vPos.y - this.waterY;
      const shadowAlpha = Math.max(0.0, Math.min(0.55, 0.7 - altitude * 0.04));
      const shadowScale = Math.max(0.4, Math.min(2.5, 0.8 + altitude * 0.08)) * (shadowAlpha > 0.01 ? 1.0 : 0.001);

      this.dummy.position.set(this.vPos.x, this.waterY + 0.01, this.vPos.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(shadowScale, shadowScale, shadowScale);
      this.dummy.updateMatrix();
      this.shadowMesh.setMatrixAt(i, this.dummy.matrix);

      // 3. Water skim cosmetic ripples (strictly cosmetic: true, ignored by sim hearing)
      if (altitude <= 2.2 && altitude >= 1.2 && simTime - this.lastRippleTime > 0.35 && this.water) {
        this.lastRippleTime = simTime;
        this.water.onRipple({
          position: { x: this.vPos.x, y: this.waterY, z: this.vPos.z },
          strength: 0.22,
          t: simTime,
          sourcePlayerId: 'world',
          cosmetic: true,
        });
      }

      // 4. Distant positional voices (wisp_wail and wisp_wingbeat)
      if (altitude < 3.5 && simTime - this.lastAudioTime > 8.0 && this.audio) {
        this.lastAudioTime = simTime;
        this.audio.play('wisp_wail', { position: this.vPos, gain: 0.5 });
      }

      if (simTime - this.lastWingbeatTime > 3.0 && this.audio) {
        this.lastWingbeatTime = simTime;
        this.audio.play('wisp_wingbeat', { position: this.vPos, gain: 0.25 });
      }
    }

    this.skullMeshLOD0.instanceMatrix.needsUpdate = true;
    this.skullMeshLOD1.instanceMatrix.needsUpdate = true;
    this.shadowMesh.instanceMatrix.needsUpdate = true;
    this.root.visible = anyActive;
  }

  private hideInstance(index: number): void {
    this.dummy.position.set(0, -500, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    this.skullMeshLOD0.setMatrixAt(index, this.dummy.matrix);
    this.skullMeshLOD1.setMatrixAt(index, this.dummy.matrix);
    this.shadowMesh.setMatrixAt(index, this.dummy.matrix);
  }

  dispose(): void {
    this.skullMeshLOD0.geometry.dispose();
    this.skullMeshLOD1.geometry.dispose();
    (this.skullMeshLOD0.material as ShaderMaterial).dispose();
    this.shadowMesh.geometry.dispose();
    (this.shadowMesh.material as MeshBasicMaterial).dispose();
    this.root.removeFromParent();
  }
}
