/* ── Splashes.ts ───────────────────────────────────────────────────────────
 *  Preallocated InstancedMesh particle system for water splash droplets and foam rings.
 *  CPU ring buffer with zero per-frame allocations, supporting monster ink-tinted droplets.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  InstancedMesh,
  PlaneGeometry,
  ShaderMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
  Vector3,
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

const splashVertexShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vUv = uv;
  // Instance color is stored in instanceColor attribute
  #ifdef USE_INSTANCING
    vColor = instanceColor;
  #else
    vColor = vec3(1.0);
  #endif

  // Billboard rotation: face camera
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const splashFragmentShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;

void main() {
  // Soft round droplet
  vec2 center = vUv - vec2(0.5);
  float dist = length(center);
  if (dist > 0.5) discard;

  float alpha = smoothstep(0.5, 0.2, dist) * 0.85;
  gl_FragColor = vec4(vColor, alpha);
}
`;

export class SplashSystem {
  static readonly MAX_DROPLETS = 256;
  readonly mesh: InstancedMesh;
  private readonly particles: SplashParticle[];
  private readonly dummy = new Object3D();
  private readonly defaultDropletColor = new Color('#e8f4f4');
  private readonly monsterDropletColor = new Color('#2c3a38'); // 30% ink tinted
  private head = 0;

  constructor(parent: Object3D) {
    const geom = new PlaneGeometry(0.12, 0.12);
    const mat = new ShaderMaterial({
      vertexShader: splashVertexShader,
      fragmentShader: splashFragmentShader,
      transparent: true,
      depthWrite: false,
    });

    this.mesh = new InstancedMesh(geom, mat, SplashSystem.MAX_DROPLETS);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    // Initialize particle pool
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

    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    parent.add(this.mesh);
  }

  burst(pos: Vector3 | { x: number; y: number; z: number }, strength = 1.0, isMonster = false): void {
    const count = Math.min(48, Math.round(8 + 40 * strength));
    const col = isMonster ? this.monsterDropletColor : this.defaultDropletColor;

    for (let i = 0; i < count; i++) {
      const p = this.particles[this.head]!;
      p.active = true;
      p.x = pos.x + (Math.random() - 0.5) * 0.3 * strength;
      p.y = pos.y + 0.05;
      p.z = pos.z + (Math.random() - 0.5) * 0.3 * strength;

      const angle = Math.random() * Math.PI * 2;
      const hSpeed = (0.5 + Math.random() * 1.8) * strength;
      p.vx = Math.cos(angle) * hSpeed;
      p.vz = Math.sin(angle) * hSpeed;
      p.vy = (1.5 + Math.random() * 2.5) * (0.6 + 0.4 * strength);

      p.age = 0;
      p.maxAge = 0.5 + Math.random() * 0.6;
      p.scale = (0.08 + Math.random() * 0.12) * (0.8 + 0.4 * strength);
      p.r = col.r;
      p.g = col.g;
      p.b = col.b;

      this.mesh.setColorAt(this.head, col);
      this.head = (this.head + 1) % SplashSystem.MAX_DROPLETS;
    }

    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  update(dt: number, cameraPos: Vector3): void {
    let needsUpdate = false;

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
        needsUpdate = true;
        continue;
      }

      // Physics integration (gravity 9.8 m/s^2)
      p.vy -= 9.8 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Shrink with age
      const lifeT = 1.0 - p.age / p.maxAge;
      const currentScale = p.scale * lifeT;

      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.set(currentScale, currentScale, currentScale);
      // Look at camera for 3D billboard
      this.dummy.lookAt(cameraPos);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      needsUpdate = true;
    }

    if (needsUpdate) {
      this.mesh.instanceMatrix.needsUpdate = true;
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
  }
}
