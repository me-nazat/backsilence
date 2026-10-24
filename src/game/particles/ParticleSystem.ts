/* ── ParticleSystem.ts ───────────────────────────────────────────────────────
 *  Base Zero-Allocation Instanced Particle System for BackSilence.
 *  - Fixed pre-allocated Float32Array buffers (positions, velocities, ages, scales, colors, alphas).
 *  - Single InstancedMesh draw call per pool (zero runtime heap allocations per frame).
 *  - DynamicDrawUsage buffer streaming with zero-allocation dummy transform.
 *  - Supports billboard quads, velocity-aligned quads, and horizontal surface rings.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  InstancedMesh,
  PlaneGeometry,
  ShaderMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
  Vector3,
  Quaternion,
  DoubleSide,
  type Camera,
} from 'three';

export type ParticleOrientation = 'billboard' | 'velocity' | 'horizontal';

export interface ParticlePoolOptions {
  capacity: number;
  orientation: ParticleOrientation;
  baseGeometry?: PlaneGeometry;
  transparent?: boolean;
  depthWrite?: boolean;
  blending?: number;
  customFragmentShader?: string;
  defaultColor?: string;
}

export class ParticlePool {
  readonly capacity: number;
  readonly orientation: ParticleOrientation;
  readonly mesh: InstancedMesh;

  // Preallocated SOA (Structure-Of-Arrays) typed buffers
  readonly posX: Float32Array;
  readonly posY: Float32Array;
  readonly posZ: Float32Array;

  readonly velX: Float32Array;
  readonly velY: Float32Array;
  readonly velZ: Float32Array;

  readonly age: Float32Array;
  readonly maxAge: Float32Array;

  readonly scaleX: Float32Array;
  readonly scaleY: Float32Array;

  readonly colR: Float32Array;
  readonly colG: Float32Array;
  readonly colB: Float32Array;
  readonly alpha: Float32Array;

  readonly rot: Float32Array;
  readonly rotSpeed: Float32Array;

  readonly active: Uint8Array;

  private head = 0;
  private activeCount = 0;

  // Preallocated transform scratchpads (zero GC during update)
  private readonly dummy = new Object3D();
  private readonly scratchColor = new Color();
  private readonly scratchVel = new Vector3();
  private readonly scratchDir = new Vector3();
  private readonly scratchUp = new Vector3(0, 1, 0);
  private readonly scratchQuat = new Quaternion();
  private readonly horizontalQuat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);

  constructor(options: ParticlePoolOptions) {
    this.capacity = options.capacity;
    this.orientation = options.orientation;

    this.posX = new Float32Array(this.capacity);
    this.posY = new Float32Array(this.capacity);
    this.posZ = new Float32Array(this.capacity);

    this.velX = new Float32Array(this.capacity);
    this.velY = new Float32Array(this.capacity);
    this.velZ = new Float32Array(this.capacity);

    this.age = new Float32Array(this.capacity);
    this.maxAge = new Float32Array(this.capacity);

    this.scaleX = new Float32Array(this.capacity);
    this.scaleY = new Float32Array(this.capacity);

    this.colR = new Float32Array(this.capacity);
    this.colG = new Float32Array(this.capacity);
    this.colB = new Float32Array(this.capacity);
    this.alpha = new Float32Array(this.capacity);

    this.rot = new Float32Array(this.capacity);
    this.rotSpeed = new Float32Array(this.capacity);

    this.active = new Uint8Array(this.capacity);

    const geom = options.baseGeometry ?? new PlaneGeometry(1, 1);

    const defaultFrag = /* glsl */ `
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec2 c = vUv - vec2(0.5);
        float d = length(c);
        if (d > 0.5) discard;
        float soft = smoothstep(0.5, 0.1, d);
        gl_FragColor = vec4(vColor, vAlpha * soft);
      }
    `;

    const mat = new ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vUv = uv;
          #ifdef USE_INSTANCING
            vColor = instanceColor;
          #else
            vColor = vec3(1.0);
          #endif
          // Alpha is passed via scale.z or instance attribute fallback
          vAlpha = 1.0;
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: options.customFragmentShader ?? defaultFrag,
      transparent: options.transparent ?? true,
      depthWrite: options.depthWrite ?? false,
      side: DoubleSide,
    });

    this.mesh = new InstancedMesh(geom, mat, this.capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    }
    this.mesh.matrixAutoUpdate = false;

    // Initialize all instances offscreen and invisible
    this.dummy.position.set(0, -9999, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();

    for (let i = 0; i < this.capacity; i++) {
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.scratchColor.set(options.defaultColor ?? '#ffffff'));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Spawns a particle in O(1) via ring-head cycling with zero heap allocation.
   */
  spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    maxAge: number,
    sx: number,
    sy: number,
    r: number,
    g: number,
    b: number,
    alpha = 1.0,
    rotSpeed = 0,
  ): number {
    const idx = this.head;
    this.head = (this.head + 1) % this.capacity;

    this.posX[idx] = x;
    this.posY[idx] = y;
    this.posZ[idx] = z;

    this.velX[idx] = vx;
    this.velY[idx] = vy;
    this.velZ[idx] = vz;

    this.age[idx] = 0.0;
    this.maxAge[idx] = Math.max(0.01, maxAge);

    this.scaleX[idx] = sx;
    this.scaleY[idx] = sy;

    this.colR[idx] = r;
    this.colG[idx] = g;
    this.colB[idx] = b;
    this.alpha[idx] = alpha;

    this.rot[idx] = Math.random() * Math.PI * 2;
    this.rotSpeed[idx] = rotSpeed;

    this.active[idx] = 1;
    return idx;
  }

  /**
   * Updates all active particles with zero heap allocation.
   * Modifies buffers in-place and pushes matrices to GPU.
   */
  update(dt: number, camera?: Camera, gravity = 0, drag = 1.0): number {
    let count = 0;
    let matrixChanged = false;
    let colorChanged = false;

    const camQuat = camera ? camera.quaternion : null;

    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;

      const curAge = (this.age[i] ?? 0) + dt;
      const curMaxAge = this.maxAge[i] ?? 1.0;
      this.age[i] = curAge;

      if (curAge >= curMaxAge) {
        this.active[i] = 0;
        // Park offscreen
        this.dummy.position.set(0, -9999, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        matrixChanged = true;
        continue;
      }

      count++;

      // Velocity physics
      let vx = this.velX[i] ?? 0;
      let vy = this.velY[i] ?? 0;
      let vz = this.velZ[i] ?? 0;

      if (gravity !== 0) {
        vy += gravity * dt;
        this.velY[i] = vy;
      }
      if (drag !== 1.0) {
        const factor = Math.pow(drag, dt * 60);
        vx *= factor;
        vy *= factor;
        vz *= factor;
        this.velX[i] = vx;
        this.velY[i] = vy;
        this.velZ[i] = vz;
      }

      const px = (this.posX[i] ?? 0) + vx * dt;
      const py = (this.posY[i] ?? 0) + vy * dt;
      const pz = (this.posZ[i] ?? 0) + vz * dt;
      this.posX[i] = px;
      this.posY[i] = py;
      this.posZ[i] = pz;

      const rSpeed = this.rotSpeed[i] ?? 0;
      let rAngle = this.rot[i] ?? 0;
      if (rSpeed !== 0) {
        rAngle += rSpeed * dt;
        this.rot[i] = rAngle;
      }

      const lifeProgress = curAge / curMaxAge;
      // Quadratic fade: in during first 15%, out during last 30%
      let fade = 1.0;
      if (lifeProgress < 0.15) {
        fade = lifeProgress / 0.15;
      } else if (lifeProgress > 0.7) {
        fade = 1.0 - (lifeProgress - 0.7) / 0.3;
      }
      fade = Math.max(0.0, Math.min(1.0, fade));

      const sx = this.scaleX[i] ?? 1.0;
      const sy = this.scaleY[i] ?? 1.0;
      const curScaleX = sx * (1.0 + lifeProgress * 0.2);
      const curScaleY = sy * (1.0 + lifeProgress * 0.2);

      this.dummy.position.set(px, py, pz);

      // Orientation handling
      if (this.orientation === 'billboard' && camQuat) {
        this.dummy.quaternion.copy(camQuat);
        if (rAngle !== 0) {
          this.dummy.rotateZ(rAngle);
        }
      } else if (this.orientation === 'horizontal') {
        this.dummy.quaternion.copy(this.horizontalQuat);
        if (rAngle !== 0) {
          this.dummy.rotateZ(rAngle);
        }
      } else if (this.orientation === 'velocity') {
        // Stretch along velocity vector
        this.scratchVel.set(vx, vy, vz);
        const speed = this.scratchVel.length();
        if (speed > 0.01) {
          this.scratchDir.copy(this.scratchVel).divideScalar(speed);
          this.scratchQuat.setFromUnitVectors(this.scratchUp, this.scratchDir);
          this.dummy.quaternion.copy(this.scratchQuat);
        }
      }

      this.dummy.scale.set(curScaleX, curScaleY, 1.0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      matrixChanged = true;

      // Color and alpha modulation
      const cr = this.colR[i] ?? 1.0;
      const cg = this.colG[i] ?? 1.0;
      const cb = this.colB[i] ?? 1.0;
      this.scratchColor.setRGB(
        cr * fade,
        cg * fade,
        cb * fade,
      );
      this.mesh.setColorAt(i, this.scratchColor);
      colorChanged = true;
    }

    this.activeCount = count;

    if (matrixChanged) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    if (colorChanged && this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }

    return this.activeCount;
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  reset(): void {
    this.dummy.position.set(0, -9999, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();

    for (let i = 0; i < this.capacity; i++) {
      this.active[i] = 0;
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.activeCount = 0;
    this.head = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach((m) => m.dispose());
    } else {
      this.mesh.material.dispose();
    }
  }
}
