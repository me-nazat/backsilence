/* ── Splashes.ts ───────────────────────────────────────────────────────────
 *  Splash v2 particle & mesh system for BackSilence:
 *  - Crown splash mesh with animated displacement
 *  - Velocity-stretched droplet particles
 *  - Expanding foam rings on water surface
 *  - Rising bubbles when submerged
 *  - Monster ink-tinted droplets support
 * ──────────────────────────────────────────────────────────────────────── */

import {
  InstancedMesh,
  PlaneGeometry,
  RingGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  ShaderMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
  Vector3,
  Quaternion,
} from 'three';

export interface SplashParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
  scale: number;
  r: number;
  g: number;
  b: number;
}

export interface FoamRing {
  active: boolean;
  x: number;
  y: number;
  z: number;
  radius: number;
  maxRadius: number;
  age: number;
  maxAge: number;
}

export class SplashSystem {
  static readonly MAX_DROPLETS = 256;
  static readonly MAX_RINGS = 32;

  readonly mesh: InstancedMesh;
  readonly ringMesh: InstancedMesh;
  readonly crownMesh: InstancedMesh;

  private readonly particles: SplashParticle[];
  private readonly rings: FoamRing[];
  private readonly dummy = new Object3D();
  private readonly defaultDropletColor = new Color('#e8f4f4');
  private readonly monsterDropletColor = new Color('#2c3a38'); // 30% ink tinted
  private dropletHead = 0;
  private ringHead = 0;

  constructor(parent: Object3D) {
    // 1. Droplet particles (velocity stretched)
    const geom = new PlaneGeometry(0.08, 0.22);
    const mat = new ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vUv = uv;
          #ifdef USE_INSTANCING
            vColor = instanceColor;
          #else
            vColor = vec3(1.0);
          #endif
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vec2 c = vUv - vec2(0.5);
          float d = length(vec2(c.x * 2.2, c.y));
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.1, d) * 0.88;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    this.mesh = new InstancedMesh(geom, mat, SplashSystem.MAX_DROPLETS);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    this.particles = new Array<SplashParticle>(SplashSystem.MAX_DROPLETS);
    for (let i = 0; i < SplashSystem.MAX_DROPLETS; i++) {
      this.particles[i] = {
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        maxAge: 1.0,
        scale: 1.0,
        r: 1.0,
        g: 1.0,
        b: 1.0,
      };
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.defaultDropletColor);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.mesh.instanceMatrix.needsUpdate = true;
    parent.add(this.mesh);

    // 2. Expanding Foam Rings on water surface
    const ringGeom = new RingGeometry(0.3, 0.45, 24);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new MeshBasicMaterial({
      color: new Color('#edf7f5'),
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    this.ringMesh = new InstancedMesh(ringGeom, ringMat, SplashSystem.MAX_RINGS);
    this.ringMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.ringMesh.frustumCulled = false;

    this.rings = new Array<FoamRing>(SplashSystem.MAX_RINGS);
    for (let i = 0; i < SplashSystem.MAX_RINGS; i++) {
      this.rings[i] = {
        active: false,
        x: 0,
        y: -100,
        z: 0,
        radius: 0.1,
        maxRadius: 1.8,
        age: 0,
        maxAge: 1.2,
      };
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.ringMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.ringMesh.instanceMatrix.needsUpdate = true;
    parent.add(this.ringMesh);

    // 3. Crown Splash Mesh (expanding truncated cone)
    const crownGeom = new CylinderGeometry(0.4, 0.15, 0.45, 16, 1, true);
    const crownMat = new MeshBasicMaterial({
      color: new Color('#d8f2ee'),
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.crownMesh = new InstancedMesh(crownGeom, crownMat, 8);
    this.crownMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.crownMesh.frustumCulled = false;
    for (let i = 0; i < 8; i++) {
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.crownMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.crownMesh.instanceMatrix.needsUpdate = true;
    parent.add(this.crownMesh);
  }

  burst(
    pos: Vector3 | { x: number; y: number; z: number },
    strength = 1.0,
    isMonster = false,
  ): void {
    const count = Math.min(64, Math.round(12 + 48 * strength));
    const col = isMonster ? this.monsterDropletColor : this.defaultDropletColor;

    // 1. Spawn motion-stretched droplets
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.dropletHead]!;
      p.active = true;
      p.x = pos.x + (Math.random() - 0.5) * 0.25 * strength;
      p.y = pos.y + 0.04;
      p.z = pos.z + (Math.random() - 0.5) * 0.25 * strength;

      const angle = Math.random() * Math.PI * 2;
      const hSpeed = (0.8 + Math.random() * 2.2) * strength;
      p.vx = Math.cos(angle) * hSpeed;
      p.vz = Math.sin(angle) * hSpeed;
      p.vy = (2.2 + Math.random() * 3.2) * (0.6 + 0.4 * strength);

      p.age = 0;
      p.maxAge = 0.5 + Math.random() * 0.7;
      p.scale = (0.12 + Math.random() * 0.16) * (0.8 + 0.4 * strength);
      p.r = col.r;
      p.g = col.g;
      p.b = col.b;

      this.mesh.setColorAt(this.dropletHead, col);
      this.dropletHead = (this.dropletHead + 1) % SplashSystem.MAX_DROPLETS;
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    // 2. Spawn expanding foam ring on water surface
    const ring = this.rings[this.ringHead]!;
    ring.active = true;
    ring.x = pos.x;
    ring.y = pos.y + 0.01;
    ring.z = pos.z;
    ring.radius = 0.2;
    ring.maxRadius = (1.2 + Math.random() * 0.8) * Math.sqrt(strength);
    ring.age = 0;
    ring.maxAge = 1.1 + strength * 0.4;
    this.ringHead = (this.ringHead + 1) % SplashSystem.MAX_RINGS;
  }

  update(dt: number, _cameraPos?: Vector3): void {
    let dropletDirty = false;
    let ringDirty = false;

    // 1. Update droplets
    const vDir = new Vector3();
    const up = new Vector3(0, 1, 0);
    const quat = new Quaternion();

    for (let i = 0; i < SplashSystem.MAX_DROPLETS; i++) {
      const p = this.particles[i]!;
      if (!p.active) continue;

      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        dropletDirty = true;
        continue;
      }

      // Physics integration (gravity 9.8 m/s^2)
      p.vy -= 9.8 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      const lifeT = 1.0 - p.age / p.maxAge;
      const currentScale = p.scale * lifeT;

      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.set(currentScale * 0.8, currentScale * 1.6, currentScale * 0.8);

      // Align droplet stretch with velocity vector
      vDir.set(p.vx, p.vy, p.vz).normalize();
      quat.setFromUnitVectors(up, vDir);
      this.dummy.quaternion.copy(quat);

      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      dropletDirty = true;
    }

    if (dropletDirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }

    // 2. Update expanding foam rings
    for (let i = 0; i < SplashSystem.MAX_RINGS; i++) {
      const r = this.rings[i]!;
      if (!r.active) continue;

      r.age += dt;
      if (r.age >= r.maxAge) {
        r.active = false;
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.ringMesh.setMatrixAt(i, this.dummy.matrix);
        ringDirty = true;
        continue;
      }

      const t = r.age / r.maxAge;
      const curRadius = r.radius + (r.maxRadius - r.radius) * Math.sqrt(t);
      this.dummy.position.set(r.x, r.y, r.z);
      this.dummy.scale.set(curRadius, 1.0, curRadius);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.ringMesh.setMatrixAt(i, this.dummy.matrix);
      ringDirty = true;
    }

    if (ringDirty) {
      this.ringMesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach((m) => m.dispose());
    } else {
      this.mesh.material.dispose();
    }
    this.mesh.removeFromParent();

    this.ringMesh.geometry.dispose();
    (this.ringMesh.material as MeshBasicMaterial).dispose();
    this.ringMesh.removeFromParent();

    this.crownMesh.geometry.dispose();
    (this.crownMesh.material as MeshBasicMaterial).dispose();
    this.crownMesh.removeFromParent();
  }
}
