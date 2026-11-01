/* ── RipplePoolManager.ts ──────────────────────────────────────────────────
 *  Dynamic expanding white concentric ripple rings and splash droplet manager.
 *  - Pre-allocated pool of 32 flat ring-decal meshes at y = 0.012m
 *  - Custom fragment shader drawing 3 sharp concentric white circles:
 *    r = 0.95, r = 0.68, r = 0.40, thickness = 0.045, color #ffffff, alpha 0.90 -> 0.0
 *  - Triggers:
 *    1. Player jump/fall into water (0.3m -> 3.8m, 1.45s) + 12 arcing 3D droplets
 *    2. Player wading step in water (0.25m -> 2.2m, 1.1s) every 0.38s
 *    3. Thrown pebble impact (0.2m -> 3.4m, 1.5s) at (hitX, 0.012, hitZ)
 *    4. Monster stride/charge turbulent foam rings and spray
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  InstancedMesh,
  InstancedBufferAttribute,
  DynamicDrawUsage,
  Vector3,
} from 'three';

export interface RippleState {
  active: boolean;
  x: number;
  y: number;
  z: number;
  startRadius: number;
  endRadius: number;
  duration: number;
  age: number;
}

export interface DropletState {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
  size: number;
}

export class RipplePoolManager {
  static readonly MAX_RIPPLES = 32;
  static readonly MAX_DROPLETS = 96;

  readonly root: Object3D;
  readonly rippleMesh: InstancedMesh;
  readonly dropletMesh: InstancedMesh;

  private readonly ripples: RippleState[];
  private readonly droplets: DropletState[];

  private readonly progressAttr: InstancedBufferAttribute;
  private readonly dummy = new Object3D();

  public waterY = 0.0;
  private rippleHead = 0;
  private dropletHead = 0;
  private wadingTimer = 0.0;

  constructor(parent: Object3D, waterY = 0.0) {
    this.waterY = waterY;
    this.root = new Object3D();
    this.root.name = 'RipplePoolManager';
    parent.add(this.root);

    // 1. Concentric Ripple Decal Mesh (Pool of 32)
    const ringPlane = new PlaneGeometry(1, 1);
    ringPlane.rotateX(-Math.PI * 0.5); // horizontal on XZ plane

    this.progressAttr = new InstancedBufferAttribute(new Float32Array(RipplePoolManager.MAX_RIPPLES), 1);
    this.progressAttr.setUsage(DynamicDrawUsage);
    ringPlane.setAttribute('instanceProgress', this.progressAttr);

    const rippleMat = new ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float instanceProgress;
        varying vec2 vUv;
        varying float vProgress;
        void main() {
          vUv = uv;
          vProgress = instanceProgress;
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vProgress;

        void main() {
          float d = length(vUv - vec2(0.5)) * 2.0;
          if (d > 1.0) discard;

          // 3 sharp concentric white circles at r = 0.95, 0.68, and 0.40
          float thickness = 0.045;
          float ring1 = smoothstep(thickness, 0.0, abs(d - 0.95));
          float ring2 = smoothstep(thickness, 0.0, abs(d - 0.68));
          float ring3 = smoothstep(thickness, 0.0, abs(d - 0.40));
          float rings = max(max(ring1, ring2), ring3);

          // Radial sine falloff
          float sineMod = (sin(d * 3.14159265 * 6.0) * 0.5 + 0.5) * rings;
          float combined = mix(rings, sineMod, 0.25);

          // Fade alpha from 0.90 to 0.0 as progress goes from 0.0 to 1.0
          float alpha = (1.0 - vProgress) * 0.90 * combined;
          if (alpha < 0.005) discard;

          gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    this.rippleMesh = new InstancedMesh(ringPlane, rippleMat, RipplePoolManager.MAX_RIPPLES);
    this.rippleMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.rippleMesh.frustumCulled = false;

    this.ripples = new Array<RippleState>(RipplePoolManager.MAX_RIPPLES);
    for (let i = 0; i < RipplePoolManager.MAX_RIPPLES; i++) {
      this.ripples[i] = {
        active: false,
        x: 0,
        y: this.waterY + 0.012,
        z: 0,
        startRadius: 0.25,
        endRadius: 2.2,
        duration: 1.1,
        age: 0,
      };
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.rippleMesh.setMatrixAt(i, this.dummy.matrix);
      this.progressAttr.setX(i, 0);
    }
    this.rippleMesh.instanceMatrix.needsUpdate = true;
    this.progressAttr.needsUpdate = true;
    this.root.add(this.rippleMesh);

    // 2. 3D Water Droplets Mesh (Pool of 96)
    const dropGeo = new PlaneGeometry(0.06, 0.12);
    const dropMat = new ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          float d = length((vUv - vec2(0.5)) * 2.0);
          if (d > 1.0) discard;
          float alpha = (1.0 - d * d) * 0.92;
          gl_FragColor = vec4(0.96, 1.0, 0.98, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    this.dropletMesh = new InstancedMesh(dropGeo, dropMat, RipplePoolManager.MAX_DROPLETS);
    this.dropletMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.dropletMesh.frustumCulled = false;

    this.droplets = new Array<DropletState>(RipplePoolManager.MAX_DROPLETS);
    for (let i = 0; i < RipplePoolManager.MAX_DROPLETS; i++) {
      this.droplets[i] = {
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        maxAge: 1.0,
        size: 0.08,
      };
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.dropletMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.dropletMesh.instanceMatrix.needsUpdate = true;
    this.root.add(this.dropletMesh);
  }

  /** Spawns a raw ripple in the circular buffer */
  spawnRipple(x: number, z: number, startRadius: number, endRadius: number, duration: number): void {
    const idx = this.rippleHead;
    this.rippleHead = (this.rippleHead + 1) % RipplePoolManager.MAX_RIPPLES;

    const rip = this.ripples[idx]!;
    rip.active = true;
    rip.x = x;
    rip.y = this.waterY + 0.012;
    rip.z = z;
    rip.startRadius = startRadius;
    rip.endRadius = endRadius;
    rip.duration = Math.max(0.1, duration);
    rip.age = 0.0;

    this.progressAttr.setX(idx, 0.0);
    this.progressAttr.needsUpdate = true;
  }

  /**
   * Rule 1: Player Jump/Fall into Water.
   * Spawn large ripple (0.3m -> 3.8m, duration 1.45s) + 12 white 3D water droplet particles arcing up and falling back.
   */
  spawnPlayerJumpSplash(x: number, z: number): void {
    this.spawnRipple(x, z, 0.3, 3.8, 1.45);

    // 12 white 3D water droplet particles arcing up and falling back
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speedH = 1.2 + Math.random() * 2.2;
      const speedV = 3.2 + Math.random() * 2.5;

      this.spawnDroplet(
        x + Math.cos(angle) * 0.15,
        this.waterY + 0.05,
        z + Math.sin(angle) * 0.15,
        Math.cos(angle) * speedH,
        speedV,
        Math.sin(angle) * speedH,
        0.75 + Math.random() * 0.4,
      );
    }
  }

  /**
   * Rule 2: Player Wading Step in Water.
   * Every 0.38s while moving in water, spawn a medium ripple (0.25m -> 2.2m, duration 1.1s).
   */
  spawnPlayerWadingStep(x: number, z: number): void {
    this.spawnRipple(x, z, 0.25, 2.2, 1.1);
  }

  /**
   * Rule 3: Thrown Pebble Impact (CLICK to throw).
   * Spawn crisp 3-ring concentric ripple (0.2m -> 3.4m, duration 1.5s) at (hitX, 0.012, hitZ).
   */
  spawnPebbleImpact(hitX: number, hitZ: number): void {
    this.spawnRipple(hitX, hitZ, 0.2, 3.4, 1.5);

    // 6 fine droplet specks
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      this.spawnDroplet(
        hitX,
        this.waterY + 0.05,
        hitZ,
        Math.cos(angle) * 1.5,
        2.5 + Math.random() * 1.5,
        Math.sin(angle) * 1.5,
        0.55,
      );
    }
  }

  /**
   * Rule 4: Monster Stride / Charge.
   * Spawn turbulent white foam rings and upward water spray particles at each limb.
   */
  spawnMonsterStride(x: number, z: number): void {
    this.spawnRipple(x, z, 0.35, 2.8, 1.2);

    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.8 + Math.random() * 3.0;
      this.spawnDroplet(
        x,
        this.waterY + 0.1,
        z,
        Math.cos(angle) * speed,
        3.5 + Math.random() * 3.0,
        Math.sin(angle) * speed,
        0.65,
      );
    }
  }

  /**
   * High-speed bounding gallop slam:
   * Spawns 15 white water spray particles + expanding white foam ring at forelimb water impact.
   */
  spawnMonsterGallopSlam(x: number, z: number): void {
    this.spawnRipple(x, z, 0.45, 3.8, 1.35);

    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.4 + Math.random() * 3.8;
      this.spawnDroplet(
        x,
        this.waterY + 0.12,
        z,
        Math.cos(angle) * speed,
        4.2 + Math.random() * 3.5,
        Math.sin(angle) * speed,
        0.75,
      );
    }
  }

  private spawnDroplet(x: number, y: number, z: number, vx: number, vy: number, vz: number, maxAge: number): void {
    const idx = this.dropletHead;
    this.dropletHead = (this.dropletHead + 1) % RipplePoolManager.MAX_DROPLETS;

    const d = this.droplets[idx]!;
    d.active = true;
    d.x = x;
    d.y = y;
    d.z = z;
    d.vx = vx;
    d.vy = vy;
    d.vz = vz;
    d.age = 0;
    d.maxAge = maxAge;
    d.size = 0.06 + Math.random() * 0.04;
  }

  update(dt: number, isMovingInWater = false, playerPos?: Vector3): void {
    // 1. Wading step cadence: every 0.38s while moving in water
    if (isMovingInWater && playerPos) {
      this.wadingTimer += dt;
      if (this.wadingTimer >= 0.38) {
        this.wadingTimer = 0.0;
        this.spawnPlayerWadingStep(playerPos.x, playerPos.z);
      }
    } else {
      this.wadingTimer = 0.0;
    }

    // 2. Update active concentric ripple rings
    let rippleNeedsUpdate = false;
    for (let i = 0; i < RipplePoolManager.MAX_RIPPLES; i++) {
      const rip = this.ripples[i]!;
      if (!rip.active) continue;

      rip.age += dt;
      const progress = Math.min(1.0, rip.age / rip.duration);
      this.progressAttr.setX(i, progress);

      if (progress >= 1.0) {
        rip.active = false;
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.rippleMesh.setMatrixAt(i, this.dummy.matrix);
      } else {
        const radius = rip.startRadius + (rip.endRadius - rip.startRadius) * progress;
        const diameter = radius * 2.0;

        this.dummy.position.set(rip.x, this.waterY + 0.012, rip.z);
        this.dummy.scale.set(diameter, diameter, 1.0);
        this.dummy.updateMatrix();
        this.rippleMesh.setMatrixAt(i, this.dummy.matrix);
      }
      rippleNeedsUpdate = true;
    }

    if (rippleNeedsUpdate) {
      this.rippleMesh.instanceMatrix.needsUpdate = true;
      this.progressAttr.needsUpdate = true;
    }

    // 3. Update 3D droplet particles arcing under gravity (g = 9.8 m/s^2)
    const g = 9.8;
    let dropletNeedsUpdate = false;
    for (let i = 0; i < RipplePoolManager.MAX_DROPLETS; i++) {
      const d = this.droplets[i]!;
      if (!d.active) continue;

      d.age += dt;
      if (d.age >= d.maxAge || d.y < this.waterY) {
        d.active = false;
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.dropletMesh.setMatrixAt(i, this.dummy.matrix);
      } else {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;
        d.vy -= g * dt; // gravity deceleration

        const scale = d.size * (1.0 - (d.age / d.maxAge) * 0.4);
        this.dummy.position.set(d.x, d.y, d.z);
        this.dummy.scale.set(scale, scale * 1.6, scale);
        this.dummy.updateMatrix();
        this.dropletMesh.setMatrixAt(i, this.dummy.matrix);
      }
      dropletNeedsUpdate = true;
    }

    if (dropletNeedsUpdate) {
      this.dropletMesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    this.rippleMesh.geometry.dispose();
    (this.rippleMesh.material as ShaderMaterial).dispose();
    this.dropletMesh.geometry.dispose();
    (this.dropletMesh.material as ShaderMaterial).dispose();
    this.root.removeFromParent();
  }
}
