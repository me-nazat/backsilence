/* ── FlockDirector.ts ──────────────────────────────────────────────────────
 *  Harmless ambient fauna: 5 deterministic flying skulls circling overhead.
 *  - Category: ambient_fauna (ZERO NoiseEvents, zero collision, replication-free)
 *  - Approach from horizon -> circle at 9-16m altitude -> dip skim -> depart
 *  - InstancedMesh with flap animation and shadow discs on water surface
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
} from 'three';
import type { AudioEngine } from '../../audio/AudioEngine.js';

export interface FlockConfig {
  seed: number;
  anchor: Vector3;
  waterY: number;
  count?: number; // default 5
  audio?: AudioEngine | undefined;
}

export class FlockDirector {
  static readonly FLOCK_SIZE = 5;

  readonly root = new Object3D();
  readonly skullMesh: InstancedMesh;
  readonly shadowMesh: InstancedMesh;

  private readonly seed: number;
  private readonly anchor: Vector3;
  private readonly waterY: number;
  private readonly count: number;
  private readonly audio?: AudioEngine | undefined;

  private readonly dummy = new Object3D();
  private readonly vPos = new Vector3();
  private readonly vDir = new Vector3();
  private readonly qRot = new Quaternion();
  private lastAudioTime = 0;

  constructor(config: FlockConfig) {
    this.seed = config.seed;
    this.anchor = config.anchor.clone();
    this.waterY = config.waterY;
    this.count = Math.min(FlockDirector.FLOCK_SIZE, config.count ?? FlockDirector.FLOCK_SIZE);
    this.audio = config.audio;

    this.root.name = 'FlockDirector';

    // 1. Procedural Skull + Wing Mesh
    const skullGeom = new ConeGeometry(0.35, 1.1, 8);
    skullGeom.rotateX(Math.PI / 2); // point forward along +Z

    // Wing flapper shader material with non-white emissive fix
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

          // Wing flap motion: lateral vertices flap vertically
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
          // Dark weathered bone shading
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

    this.skullMesh = new InstancedMesh(skullGeom, skullMat, FlockDirector.FLOCK_SIZE);
    this.skullMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.skullMesh.frustumCulled = false;
    this.root.add(this.skullMesh);

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
    const cyclePeriod = 110.0; // 110s cycle
    const cycleTime = (simTime + this.seed * 17.3) % cyclePeriod;

    // First arrival at ~25s, active for ~45s (until ~70s)
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

      // Occasional dip skim (skulls 1 and 3 dip to 1.5m above water)
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

  update(_dt: number, simTime: number, _camera?: unknown): void {
    const u = (this.skullMesh.material as ShaderMaterial).uniforms;
    if (u['uTime']) u['uTime'].value = simTime;

    let anyActive = false;

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
      this.skullMesh.setMatrixAt(i, this.dummy.matrix);

      // 2. Shadow disc on water surface (fades with altitude)
      const altitude = this.vPos.y - this.waterY;
      const shadowAlpha = Math.max(0.0, Math.min(0.55, 0.7 - altitude * 0.04));
      const shadowScale = Math.max(0.4, Math.min(2.5, 0.8 + altitude * 0.08)) * (shadowAlpha > 0.01 ? 1.0 : 0.001);

      this.dummy.position.set(this.vPos.x, this.waterY + 0.01, this.vPos.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(shadowScale, shadowScale, shadowScale);
      this.dummy.updateMatrix();
      this.shadowMesh.setMatrixAt(i, this.dummy.matrix);

      // Audio cues (eerie formant wail when dipping close)
      if (altitude < 4.0 && simTime - this.lastAudioTime > 8.0 && this.audio) {
        this.lastAudioTime = simTime;
        this.audio.play('wisp_wail', { position: this.vPos, gain: 0.6 });
      }
    }

    this.skullMesh.instanceMatrix.needsUpdate = true;
    this.shadowMesh.instanceMatrix.needsUpdate = true;
    this.root.visible = anyActive;
  }

  private hideInstance(index: number): void {
    this.dummy.position.set(0, -500, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    this.skullMesh.setMatrixAt(index, this.dummy.matrix);
    this.shadowMesh.setMatrixAt(index, this.dummy.matrix);
  }

  dispose(): void {
    this.skullMesh.geometry.dispose();
    (this.skullMesh.material as ShaderMaterial).dispose();
    this.shadowMesh.geometry.dispose();
    (this.shadowMesh.material as MeshBasicMaterial).dispose();
    this.root.removeFromParent();
  }
}
