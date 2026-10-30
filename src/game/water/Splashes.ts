/* ── Splashes.ts ───────────────────────────────────────────────────────────
 *  Splash v2 particle & mesh system for BackSilence:
 *  - Crown splash mesh with animated displacement
 *  - Velocity-stretched droplet particles
 *  - Expanding foam rings on water surface with age fade
 *  - Specular impact flash sprite
 *  - Surface termination with micro-rings
 *  - Monster ink-tinted droplets support
 * ──────────────────────────────────────────────────────────────────────── */

import {
  InstancedMesh,
  PlaneGeometry,
  RingGeometry,
  CylinderGeometry,
  ShaderMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
  Vector3,
  Quaternion,
  AdditiveBlending,
  InstancedBufferAttribute,
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

export interface CrownSplash {
  active: boolean;
  x: number;
  y: number;
  z: number;
  scale: number;
  age: number;
  maxAge: number;
}

export interface ImpactFlash {
  active: boolean;
  x: number;
  y: number;
  z: number;
  maxScale: number;
  age: number;
  maxAge: number;
}

export class SplashSystem {
  static readonly MAX_DROPLETS = 256;
  static readonly MAX_RINGS = 32;
  static readonly MAX_CROWNS = 8;
  static readonly MAX_FLASHES = 24;

  readonly mesh: InstancedMesh;
  readonly ringMesh: InstancedMesh;
  readonly crownMesh: InstancedMesh;
  readonly flashMesh: InstancedMesh;

  private readonly particles: SplashParticle[];
  private readonly rings: FoamRing[];
  private readonly crowns: CrownSplash[];
  private readonly flashes: ImpactFlash[];

  private readonly ringAlphaAttr: InstancedBufferAttribute;
  private readonly crownAlphaAttr: InstancedBufferAttribute;
  private readonly flashAlphaAttr: InstancedBufferAttribute;

  private readonly dummy = new Object3D();
  private readonly defaultDropletColor = new Color('#dcefe4');
  private readonly monsterDropletColor = new Color('#2c3a38'); // 30% ink tinted

  private dropletHead = 0;
  private ringHead = 0;
  private crownHead = 0;
  private flashHead = 0;

  public waterY: number;

  constructor(parent: Object3D, waterY = 0.0) {
    this.waterY = waterY;

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
          vec2 c = (vUv - vec2(0.5)) * 2.0;
          float r2 = dot(c, c);
          if (r2 > 1.0) discard;
          float z = sqrt(max(0.0, 1.0 - r2));
          vec3 N = normalize(vec3(c.x, c.y, z));
          vec3 L = normalize(vec3(0.3, 0.8, 0.5));
          float spec = pow(max(0.0, dot(N, L)), 16.0) * 1.5;
          float rim = pow(1.0 - z, 3.0) * 0.8;
          float core = smoothstep(0.3, 0.0, sqrt(r2)) * 0.6;
          vec3 litColor = vColor * (0.6 + rim * 0.4) + vec3(spec + core);
          float alpha = smoothstep(1.0, 0.75, sqrt(r2)) * 0.92;
          gl_FragColor = vec4(litColor, alpha);
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

    // 2. Expanding Foam Rings on water surface with age fade & '#e8f2e6' color
    const ringGeom = new RingGeometry(0.3, 0.45, 24);
    ringGeom.rotateX(-Math.PI / 2);
    this.ringAlphaAttr = new InstancedBufferAttribute(new Float32Array(SplashSystem.MAX_RINGS), 1);
    this.ringAlphaAttr.setUsage(DynamicDrawUsage);
    ringGeom.setAttribute('instanceAlpha', this.ringAlphaAttr);

    const ringMat = new ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float instanceAlpha;
        varying vec2 vUv;
        varying float vAlpha;
        void main() {
          vUv = uv;
          vAlpha = instanceAlpha;
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vAlpha;
        void main() {
          // Soft '#e8f2e6' olive-water foam tint
          vec3 col = vec3(0.91, 0.95, 0.90);
          gl_FragColor = vec4(col, vAlpha * 0.7);
        }
      `,
      transparent: true,
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
      this.ringAlphaAttr.setX(i, 0);
    }
    this.ringMesh.instanceMatrix.needsUpdate = true;
    this.ringAlphaAttr.needsUpdate = true;
    parent.add(this.ringMesh);

    // 3. Crown Splash Mesh (expanding truncated cone)
    const crownGeom = new CylinderGeometry(0.4, 0.15, 0.45, 16, 1, true);
    this.crownAlphaAttr = new InstancedBufferAttribute(new Float32Array(SplashSystem.MAX_CROWNS), 1);
    this.crownAlphaAttr.setUsage(DynamicDrawUsage);
    crownGeom.setAttribute('instanceAlpha', this.crownAlphaAttr);

    const crownMat = new ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float instanceAlpha;
        varying vec2 vUv;
        varying float vAlpha;
        void main() {
          vUv = uv;
          vAlpha = instanceAlpha;
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vAlpha;
        void main() {
          vec3 col = vec3(0.91, 0.95, 0.90);
          gl_FragColor = vec4(col, vAlpha * 0.65);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    this.crownMesh = new InstancedMesh(crownGeom, crownMat, SplashSystem.MAX_CROWNS);
    this.crownMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.crownMesh.frustumCulled = false;

    this.crowns = new Array<CrownSplash>(SplashSystem.MAX_CROWNS);
    for (let i = 0; i < SplashSystem.MAX_CROWNS; i++) {
      this.crowns[i] = {
        active: false,
        x: 0,
        y: -100,
        z: 0,
        scale: 1.0,
        age: 0,
        maxAge: 0.22,
      };
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.crownMesh.setMatrixAt(i, this.dummy.matrix);
      this.crownAlphaAttr.setX(i, 0);
    }
    this.crownMesh.instanceMatrix.needsUpdate = true;
    this.crownAlphaAttr.needsUpdate = true;
    parent.add(this.crownMesh);

    // 4. Specular Impact FLASH Sprite (camera-facing additive quad tinted '#f4fff0')
    const flashGeom = new PlaneGeometry(1, 1);
    this.flashAlphaAttr = new InstancedBufferAttribute(new Float32Array(SplashSystem.MAX_FLASHES), 1);
    this.flashAlphaAttr.setUsage(DynamicDrawUsage);
    flashGeom.setAttribute('instanceAlpha', this.flashAlphaAttr);

    const flashMat = new ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float instanceAlpha;
        varying vec2 vUv;
        varying float vAlpha;
        void main() {
          vUv = uv;
          vAlpha = instanceAlpha;
          // Camera-facing billboard quad
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          mvPosition.xy += position.xy;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vAlpha;
        void main() {
          float d = length(vUv - vec2(0.5));
          if (d > 0.5) discard;
          float radial = smoothstep(0.5, 0.0, d);
          vec3 col = vec3(0.957, 1.0, 0.941); // '#f4fff0' specular highlight
          gl_FragColor = vec4(col, radial * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    this.flashMesh = new InstancedMesh(flashGeom, flashMat, SplashSystem.MAX_FLASHES);
    this.flashMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.flashMesh.frustumCulled = false;

    this.flashes = new Array<ImpactFlash>(SplashSystem.MAX_FLASHES);
    for (let i = 0; i < SplashSystem.MAX_FLASHES; i++) {
      this.flashes[i] = {
        active: false,
        x: 0,
        y: -100,
        z: 0,
        maxScale: 0.6,
        age: 0,
        maxAge: 0.09,
      };
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.flashMesh.setMatrixAt(i, this.dummy.matrix);
      this.flashAlphaAttr.setX(i, 0);
    }
    this.flashMesh.instanceMatrix.needsUpdate = true;
    this.flashAlphaAttr.needsUpdate = true;
    parent.add(this.flashMesh);
  }

  burst(
    pos: Vector3 | { x: number; y: number; z: number },
    strength = 1.0,
    isMonster = false,
  ): void {
    const count = Math.min(SplashSystem.MAX_DROPLETS, Math.round(18 + 72 * strength));
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
      p.maxAge = 0.7 + Math.random() * 0.9;
      p.scale = (0.16 + Math.random() * 0.24) * (0.8 + 0.4 * strength);
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

    // 3. Spawn crown splash on bigger impacts (strength >= 0.8)
    if (strength >= 0.8) {
      const crown = this.crowns[this.crownHead]!;
      crown.active = true;
      crown.x = pos.x;
      crown.y = pos.y + 0.02;
      crown.z = pos.z;
      crown.scale = Math.min(1.6, 0.75 * strength);
      crown.age = 0;
      crown.maxAge = 0.22;
      this.crownHead = (this.crownHead + 1) % SplashSystem.MAX_CROWNS;
    }

    // 4. Bright specular FLASH at impact point (scale 0 -> 0.55m over 90ms ease-out, opacity 0.95 -> 0)
    const flash = this.flashes[this.flashHead]!;
    flash.active = true;
    flash.x = pos.x;
    flash.y = pos.y + 0.015;
    flash.z = pos.z;
    flash.maxScale = 0.55 * Math.sqrt(Math.max(0.4, strength));
    flash.age = 0;
    flash.maxAge = 0.09;
    this.flashHead = (this.flashHead + 1) % SplashSystem.MAX_FLASHES;
  }

  update(dt: number, _cameraPos?: Vector3): void {
    let dropletDirty = false;
    let ringDirty = false;
    let crownDirty = false;
    let flashDirty = false;

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

      // Surface termination: kill droplet when falling below water surface and spawn tiny ring
      if (p.vy < 0 && p.y <= this.waterY) {
        p.active = false;
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        dropletDirty = true;

        // Spawn tiny micro-ring at surface impact (radius 0 -> 0.12m over 220ms)
        const r = this.rings[this.ringHead]!;
        r.active = true;
        r.x = p.x;
        r.y = this.waterY + 0.005;
        r.z = p.z;
        r.radius = 0.0;
        r.maxRadius = 0.12;
        r.age = 0;
        r.maxAge = 0.22;
        this.ringHead = (this.ringHead + 1) % SplashSystem.MAX_RINGS;
        continue;
      }

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

    // 2. Update expanding foam rings with age fade
    for (let i = 0; i < SplashSystem.MAX_RINGS; i++) {
      const r = this.rings[i]!;
      if (!r.active) {
        this.ringAlphaAttr.setX(i, 0);
        continue;
      }

      r.age += dt;
      if (r.age >= r.maxAge) {
        r.active = false;
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.ringMesh.setMatrixAt(i, this.dummy.matrix);
        this.ringAlphaAttr.setX(i, 0);
        ringDirty = true;
        continue;
      }

      const t = r.age / r.maxAge;
      const curRadius = r.radius + (r.maxRadius - r.radius) * Math.sqrt(t);
      const alpha = Math.max(0, 1.0 - t);

      this.dummy.position.set(r.x, r.y, r.z);
      this.dummy.scale.set(curRadius, 1.0, curRadius);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.ringMesh.setMatrixAt(i, this.dummy.matrix);
      this.ringAlphaAttr.setX(i, alpha);
      ringDirty = true;
    }

    if (ringDirty) {
      this.ringMesh.instanceMatrix.needsUpdate = true;
      this.ringAlphaAttr.needsUpdate = true;
    }

    // 3. Update Crown Splashes
    for (let i = 0; i < SplashSystem.MAX_CROWNS; i++) {
      const c = this.crowns[i]!;
      if (!c.active) {
        this.crownAlphaAttr.setX(i, 0);
        continue;
      }

      c.age += dt;
      if (c.age >= c.maxAge) {
        c.active = false;
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.crownMesh.setMatrixAt(i, this.dummy.matrix);
        this.crownAlphaAttr.setX(i, 0);
        crownDirty = true;
        continue;
      }

      const t = c.age / c.maxAge;
      const expand = c.scale * (0.8 + 1.2 * Math.sqrt(t));
      const rise = (1.0 - t) * 0.12 * c.scale;
      const alpha = Math.max(0, 1.0 - t);

      this.dummy.position.set(c.x, c.y + rise, c.z);
      this.dummy.scale.set(expand, c.scale * (1.0 - t * 0.5), expand);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.crownMesh.setMatrixAt(i, this.dummy.matrix);
      this.crownAlphaAttr.setX(i, alpha);
      crownDirty = true;
    }

    if (crownDirty) {
      this.crownMesh.instanceMatrix.needsUpdate = true;
      this.crownAlphaAttr.needsUpdate = true;
    }

    // 4. Update Specular Impact Flashes (scale 0 -> 0.55m over 90ms ease-out, opacity 0.95 -> 0)
    for (let i = 0; i < SplashSystem.MAX_FLASHES; i++) {
      const f = this.flashes[i]!;
      if (!f.active) {
        this.flashAlphaAttr.setX(i, 0);
        continue;
      }

      f.age += dt;
      if (f.age >= f.maxAge) {
        f.active = false;
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.flashMesh.setMatrixAt(i, this.dummy.matrix);
        this.flashAlphaAttr.setX(i, 0);
        flashDirty = true;
        continue;
      }

      const t = Math.min(1.0, f.age / f.maxAge);
      const easeOut = 1.0 - Math.pow(1.0 - t, 3.0);
      const curScale = f.maxScale * easeOut;
      const alpha = (1.0 - t) * 0.95;

      this.dummy.position.set(f.x, f.y, f.z);
      this.dummy.scale.set(curScale, curScale, curScale);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.flashMesh.setMatrixAt(i, this.dummy.matrix);
      this.flashAlphaAttr.setX(i, alpha);
      flashDirty = true;
    }

    if (flashDirty) {
      this.flashMesh.instanceMatrix.needsUpdate = true;
      this.flashAlphaAttr.needsUpdate = true;
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
    if (Array.isArray(this.ringMesh.material)) {
      this.ringMesh.material.forEach((m) => m.dispose());
    } else {
      this.ringMesh.material.dispose();
    }
    this.ringMesh.removeFromParent();

    this.crownMesh.geometry.dispose();
    if (Array.isArray(this.crownMesh.material)) {
      this.crownMesh.material.forEach((m) => m.dispose());
    } else {
      this.crownMesh.material.dispose();
    }
    this.crownMesh.removeFromParent();

    this.flashMesh.geometry.dispose();
    if (Array.isArray(this.flashMesh.material)) {
      this.flashMesh.material.forEach((m) => m.dispose());
    } else {
      this.flashMesh.material.dispose();
    }
    this.flashMesh.removeFromParent();
  }
}
