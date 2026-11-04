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
  BufferGeometry,
  Float32BufferAttribute,
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
  isInk?: boolean;
}

export interface CrownSplash {
  active: boolean;
  x: number;
  y: number;
  z: number;
  scale: number;
  age: number;
  maxAge: number;
  isInk?: boolean;
}

/**
 * Procedural 7-pointed crown splash with central rising column and 7 rim spikes
 * matching the reference graffiti motif (f_001–f_003, f_018, f_035).
 */
export function buildCrownSplashGeometry(): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const spikeCount = 7;
  const segments = spikeCount * 4; // 28 radial segments (4 per spike)
  const baseRadius = 0.14;
  const rimRadius = 0.38;
  const spikeHeight = 0.42;
  const troughHeight = 0.16;

  // 1. Crown rim and skirt
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    positions.push(Math.cos(theta) * baseRadius, 0.0, Math.sin(theta) * baseRadius);
    uvs.push(i / segments, 0.0);
  }

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const spikeFactor = 0.5 + 0.5 * Math.cos((i / segments) * Math.PI * 2 * spikeCount);
    const h = troughHeight + (spikeHeight - troughHeight) * Math.pow(spikeFactor, 2.5);
    const r = baseRadius + (rimRadius - baseRadius) * (0.6 + 0.4 * spikeFactor);

    positions.push(Math.cos(theta) * r, h, Math.sin(theta) * r);
    uvs.push(i / segments, 1.0);
  }

  const baseOffset = 0;
  const rimOffset = segments + 1;

  for (let i = 0; i < segments; i++) {
    const b0 = baseOffset + i;
    const b1 = baseOffset + i + 1;
    const r0 = rimOffset + i;
    const r1 = rimOffset + i + 1;

    indices.push(b0, r0, r1);
    indices.push(b0, r1, b1);
  }

  // 2. Central rising droplet column
  const colSegments = 12;
  const colRadius = 0.038;
  const colHeight = 0.48;
  const colOffset = positions.length / 3;

  for (let i = 0; i <= colSegments; i++) {
    const theta = (i / colSegments) * Math.PI * 2;
    positions.push(Math.cos(theta) * colRadius, 0.0, Math.sin(theta) * colRadius);
    uvs.push(i / colSegments, 0.0);
  }
  for (let i = 0; i <= colSegments; i++) {
    const theta = (i / colSegments) * Math.PI * 2;
    positions.push(Math.cos(theta) * (colRadius * 0.6), colHeight * 0.88, Math.sin(theta) * (colRadius * 0.6));
    uvs.push(i / colSegments, 0.85);
  }
  const apexIdx = positions.length / 3;
  positions.push(0.0, colHeight, 0.0);
  uvs.push(0.5, 1.0);

  for (let i = 0; i < colSegments; i++) {
    const c0 = colOffset + i;
    const c1 = colOffset + i + 1;
    const t0 = colOffset + colSegments + 1 + i;
    const t1 = colOffset + colSegments + 1 + i + 1;

    indices.push(c0, t0, t1);
    indices.push(c0, t1, c1);
    indices.push(t0, apexIdx, t1);
  }

  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  return geom;
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
  private readonly monsterDropletColor = new Color('#1e1a14'); // Viscous dark ink (#1e1a14, f_010 / f_018)
  private readonly whiteFoamRingColor = new Color('#e8f2e6');
  private readonly inkRingColor = new Color('#1e1a14');
  public lastInkSplashCount = 0;
  public lastWhiteFoamFootCount = 0;

  private dropletHead = 0;
  private ringHead = 0;
  private crownHead = 0;
  private flashHead = 0;

  public waterY: number;

  constructor(parent: Object3D, waterY = 0.0) {
    this.waterY = waterY;

    // 1. Droplet particles (velocity stretched)
    const geom = new PlaneGeometry(0.03, 0.08);
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
          float dist = sqrt(r2);
          float alpha = smoothstep(1.0, 0.05, dist) * 0.015;
          if (alpha <= 0.005) discard;
          vec3 litColor = mix(vColor, vec3(0.95, 0.98, 0.95), 0.25);
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

    // 2. Expanding Foam Rings on water surface with age fade & broken ellipse ripples
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
        varying vec3 vColor;
        void main() {
          vUv = uv;
          vAlpha = instanceAlpha;
          #ifdef USE_INSTANCING_COLOR
            vColor = instanceColor;
          #else
            vColor = vec3(0.91, 0.95, 0.90);
          #endif
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec2 p = vUv - vec2(0.5);
          float angle = atan(p.y, p.x);
          // 3 soft broken gaps around the ring matching graffiti ripple motif
          float broken = smoothstep(0.12, 0.30, fract(angle * 3.0 / 6.28318));
          gl_FragColor = vec4(vColor, vAlpha * 0.015 * broken);
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
        isInk: false,
      };
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.ringMesh.setMatrixAt(i, this.dummy.matrix);
      this.ringMesh.setColorAt(i, this.whiteFoamRingColor);
      this.ringAlphaAttr.setX(i, 0);
    }
    if (this.ringMesh.instanceColor) this.ringMesh.instanceColor.setUsage(DynamicDrawUsage);
    this.ringMesh.instanceMatrix.needsUpdate = true;
    this.ringAlphaAttr.needsUpdate = true;
    parent.add(this.ringMesh);

    // 3. Crown Splash Mesh (procedural 7-pointed crown + central rising column)
    const crownGeom = buildCrownSplashGeometry();
    this.crownAlphaAttr = new InstancedBufferAttribute(new Float32Array(SplashSystem.MAX_CROWNS), 1);
    this.crownAlphaAttr.setUsage(DynamicDrawUsage);
    crownGeom.setAttribute('instanceAlpha', this.crownAlphaAttr);

    const crownMat = new ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float instanceAlpha;
        varying vec2 vUv;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vUv = uv;
          vAlpha = instanceAlpha;
          #ifdef USE_INSTANCING_COLOR
            vColor = instanceColor;
          #else
            vColor = vec3(0.91, 0.95, 0.90);
          #endif
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, vAlpha * 0.015);
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
        isInk: false,
      };
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.crownMesh.setMatrixAt(i, this.dummy.matrix);
      this.crownMesh.setColorAt(i, this.whiteFoamRingColor);
      this.crownAlphaAttr.setX(i, 0);
    }
    if (this.crownMesh.instanceColor) this.crownMesh.instanceColor.setUsage(DynamicDrawUsage);
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
          float radial = smoothstep(0.5, 0.05, d);
          vec3 col = vec3(0.957, 1.0, 0.941); // '#f4fff0' specular highlight
          gl_FragColor = vec4(col, radial * vAlpha * 0.05);
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

  /**
   * Prompt 4B (`f_010`, `f_018`): Spawns a dark, viscous `ink` splash variant (`#1e1a14`
   * with low roughness, spreading radial ring + 4–6 dark droplet arcs) at the creature's
   * hands and feet on contact with water, paired with a small, short-lived white foam ring
   * at the feet only (`isFoot === true`).
   */
  spawnInkSplash(
    pos: Vector3 | { x: number; y: number; z: number },
    strength = 1.0,
    isFoot = true,
  ): { inkDropletsSpawned: number; inkRingSpawned: boolean; whiteFoamRingSpawned: boolean } {
    const clampedStrength = Math.max(0.25, Math.min(1.5, strength));
    // 4 to 6 viscous dark droplet arcs (#1e1a14)
    const arcCount = Math.max(4, Math.min(6, Math.round(4 + 2 * Math.min(1.0, clampedStrength))));
    const col = this.monsterDropletColor;

    for (let i = 0; i < arcCount; i++) {
      const p = this.particles[this.dropletHead]!;
      p.active = true;
      const baseAngle = (i / arcCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const radialOffset = 0.08 + Math.random() * 0.12;
      p.x = pos.x + Math.cos(baseAngle) * radialOffset;
      p.y = this.waterY + 0.03;
      p.z = pos.z + Math.sin(baseAngle) * radialOffset;

      const hSpeed = (0.55 + Math.random() * 0.95) * clampedStrength;
      p.vx = Math.cos(baseAngle) * hSpeed;
      p.vz = Math.sin(baseAngle) * hSpeed;
      p.vy = (1.35 + Math.random() * 1.15) * (0.65 + 0.35 * clampedStrength);

      p.age = 0;
      p.maxAge = 0.45 + Math.random() * 0.35;
      p.scale = (0.20 + Math.random() * 0.16) * (0.85 + 0.3 * clampedStrength);
      p.r = col.r;
      p.g = col.g;
      p.b = col.b;

      this.mesh.setColorAt(this.dropletHead, col);
      this.dropletHead = (this.dropletHead + 1) % SplashSystem.MAX_DROPLETS;
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    // 1. Spreading radial dark ink ring (#1e1a14) at both hands and feet
    const inkRingIdx = this.ringHead;
    const inkRing = this.rings[inkRingIdx]!;
    inkRing.active = true;
    inkRing.x = pos.x;
    inkRing.y = this.waterY + 0.012;
    inkRing.z = pos.z;
    inkRing.radius = 0.14;
    inkRing.maxRadius = (0.65 + 0.35 * clampedStrength);
    inkRing.age = 0;
    inkRing.maxAge = 0.75 + 0.25 * clampedStrength;
    inkRing.isInk = true;
    this.ringMesh.setColorAt(inkRingIdx, this.inkRingColor);
    this.ringHead = (this.ringHead + 1) % SplashSystem.MAX_RINGS;
    this.lastInkSplashCount++;

    // 2. Small, short-lived white foam ring at the feet ONLY (f_018)
    let whiteFoamSpawned = false;
    if (isFoot) {
      const foamIdx = this.ringHead;
      const foamRing = this.rings[foamIdx]!;
      foamRing.active = true;
      foamRing.x = pos.x;
      foamRing.y = this.waterY + 0.016;
      foamRing.z = pos.z;
      foamRing.radius = 0.08;
      foamRing.maxRadius = 0.32 * Math.sqrt(clampedStrength);
      foamRing.age = 0;
      foamRing.maxAge = 0.38;
      foamRing.isInk = false;
      this.ringMesh.setColorAt(foamIdx, this.whiteFoamRingColor);
      this.ringHead = (this.ringHead + 1) % SplashSystem.MAX_RINGS;
      this.lastWhiteFoamFootCount++;
      whiteFoamSpawned = true;
    }
    if (this.ringMesh.instanceColor) this.ringMesh.instanceColor.needsUpdate = true;

    return {
      inkDropletsSpawned: arcCount,
      inkRingSpawned: true,
      whiteFoamRingSpawned: whiteFoamSpawned,
    };
  }

  /**
   * Spawns an authentic 7-pointed crown splash mesh with rising droplet column,
   * tip droplets, and three broken ellipse ripple rings (f_001–f_003, f_018).
   */
  spawnCrownSplash(
    pos: Vector3 | { x: number; y: number; z: number },
    scale = 1.0,
    isInk = false,
  ): void {
    const crownIdx = this.crownHead;
    const crown = this.crowns[crownIdx]!;
    crown.active = true;
    crown.x = pos.x;
    crown.y = this.waterY + 0.01;
    crown.z = pos.z;
    crown.scale = Math.min(1.8, Math.max(0.4, scale));
    crown.age = 0;
    crown.maxAge = 0.28 + 0.08 * scale;
    crown.isInk = isInk;
    this.crownMesh.setColorAt(crownIdx, isInk ? this.inkRingColor : this.whiteFoamRingColor);
    if (this.crownMesh.instanceColor) this.crownMesh.instanceColor.needsUpdate = true;
    this.crownHead = (this.crownHead + 1) % SplashSystem.MAX_CROWNS;

    // Flying airborne droplets off the 7 spike tips
    const spikeCount = 7;
    const col = isInk ? this.monsterDropletColor : this.defaultDropletColor;
    for (let i = 0; i < spikeCount; i++) {
      const p = this.particles[this.dropletHead]!;
      p.active = true;
      const angle = (i / spikeCount) * Math.PI * 2;
      p.x = pos.x + Math.cos(angle) * (0.26 * scale);
      p.y = this.waterY + 0.32 * scale;
      p.z = pos.z + Math.sin(angle) * (0.26 * scale);
      p.vx = Math.cos(angle) * (1.2 + Math.random() * 0.8) * scale;
      p.vz = Math.sin(angle) * (1.2 + Math.random() * 0.8) * scale;
      p.vy = (2.2 + Math.random() * 1.2) * scale;
      p.age = 0;
      p.maxAge = 0.55;
      p.scale = 0.16 * scale;
      p.r = col.r; p.g = col.g; p.b = col.b;
      this.mesh.setColorAt(this.dropletHead, col);
      this.dropletHead = (this.dropletHead + 1) % SplashSystem.MAX_DROPLETS;
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    // Three concentric broken ellipse ripples around the splash point
    const ellipseRatios = [
      { r0: 0.16, rMax: 0.82, maxAge: 1.0 },
      { r0: 0.30, rMax: 1.40, maxAge: 1.35 },
      { r0: 0.46, rMax: 2.05, maxAge: 1.75 },
    ];
    for (let r = 0; r < 3; r++) {
      const ringIdx = this.ringHead;
      const ring = this.rings[ringIdx]!;
      ring.active = true;
      ring.x = pos.x;
      ring.y = this.waterY + 0.008 + r * 0.003;
      ring.z = pos.z;
      ring.radius = ellipseRatios[r]!.r0 * scale;
      ring.maxRadius = ellipseRatios[r]!.rMax * scale;
      ring.age = 0;
      ring.maxAge = ellipseRatios[r]!.maxAge;
      ring.isInk = isInk;
      this.ringMesh.setColorAt(ringIdx, isInk ? this.inkRingColor : this.whiteFoamRingColor);
      this.ringHead = (this.ringHead + 1) % SplashSystem.MAX_RINGS;
    }
    if (this.ringMesh.instanceColor) this.ringMesh.instanceColor.needsUpdate = true;
  }

  /** Profile 1: Crouch-wade (small, minimal, loudness 0.12) */
  spawnCrouchWadeSplash(pos: Vector3 | { x: number; y: number; z: number }): { loudness: number; hearingRadius: number } {
    const count = 3;
    const col = this.defaultDropletColor;
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.dropletHead]!;
      p.active = true;
      const a = (i / count) * Math.PI * 2;
      p.x = pos.x + Math.cos(a) * 0.08;
      p.y = this.waterY + 0.02;
      p.z = pos.z + Math.sin(a) * 0.08;
      p.vx = Math.cos(a) * 0.4;
      p.vz = Math.sin(a) * 0.4;
      p.vy = 0.8 + Math.random() * 0.4;
      p.age = 0;
      p.maxAge = 0.28;
      p.scale = 0.08;
      p.r = col.r; p.g = col.g; p.b = col.b;
      this.mesh.setColorAt(this.dropletHead, col);
      this.dropletHead = (this.dropletHead + 1) % SplashSystem.MAX_DROPLETS;
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    const ringIdx = this.ringHead;
    const ring = this.rings[ringIdx]!;
    ring.active = true;
    ring.x = pos.x; ring.y = this.waterY + 0.005; ring.z = pos.z;
    ring.radius = 0.05; ring.maxRadius = 0.28; ring.age = 0; ring.maxAge = 0.65;
    ring.isInk = false;
    this.ringMesh.setColorAt(ringIdx, this.whiteFoamRingColor);
    if (this.ringMesh.instanceColor) this.ringMesh.instanceColor.needsUpdate = true;
    this.ringHead = (this.ringHead + 1) % SplashSystem.MAX_RINGS;

    return { loudness: 0.12, hearingRadius: 4.8 };
  }

  /** Profile 2: Player wade (displaced V-wake, moderate foam, loudness 0.35) */
  spawnWadeSplash(pos: Vector3 | { x: number; y: number; z: number }): { loudness: number; hearingRadius: number } {
    const count = 12;
    const col = this.defaultDropletColor;
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.dropletHead]!;
      p.active = true;
      const a = (i / count) * Math.PI * 2;
      p.x = pos.x + Math.cos(a) * 0.12;
      p.y = this.waterY + 0.03;
      p.z = pos.z + Math.sin(a) * 0.12;
      p.vx = Math.cos(a) * 0.9;
      p.vz = Math.sin(a) * 0.9;
      p.vy = 1.4 + Math.random() * 0.6;
      p.age = 0;
      p.maxAge = 0.45;
      p.scale = 0.14;
      p.r = col.r; p.g = col.g; p.b = col.b;
      this.mesh.setColorAt(this.dropletHead, col);
      this.dropletHead = (this.dropletHead + 1) % SplashSystem.MAX_DROPLETS;
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    const ringIdx = this.ringHead;
    const ring = this.rings[ringIdx]!;
    ring.active = true;
    ring.x = pos.x; ring.y = this.waterY + 0.008; ring.z = pos.z;
    ring.radius = 0.12; ring.maxRadius = 0.75; ring.age = 0; ring.maxAge = 0.95;
    ring.isInk = false;
    this.ringMesh.setColorAt(ringIdx, this.whiteFoamRingColor);
    if (this.ringMesh.instanceColor) this.ringMesh.instanceColor.needsUpdate = true;
    this.ringHead = (this.ringHead + 1) % SplashSystem.MAX_RINGS;

    return { loudness: 0.35, hearingRadius: 14.0 };
  }

  /** Profile 3: Player sprint / jump / dive (full crown + white foam + loud transient, 0.75 / 1.0) */
  spawnSprintOrJumpSplash(
    pos: Vector3 | { x: number; y: number; z: number },
    isJump = false,
  ): { loudness: number; hearingRadius: number } {
    const loudness = isJump ? 1.0 : 0.75;
    const hearingRadius = isJump ? 40.0 : 30.0;
    this.spawnCrownSplash(pos, isJump ? 1.4 : 1.0, false);

    const flash = this.flashes[this.flashHead]!;
    flash.active = true;
    flash.x = pos.x; flash.y = this.waterY + 0.02; flash.z = pos.z;
    flash.maxScale = isJump ? 0.85 : 0.65;
    flash.age = 0; flash.maxAge = 0.11;
    this.flashHead = (this.flashHead + 1) % SplashSystem.MAX_FLASHES;

    const count = isJump ? 48 : 32;
    const col = this.defaultDropletColor;
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.dropletHead]!;
      p.active = true;
      const a = Math.random() * Math.PI * 2;
      const speed = (1.4 + Math.random() * 2.5) * (isJump ? 1.25 : 1.0);
      p.x = pos.x + Math.cos(a) * 0.18;
      p.y = this.waterY + 0.04;
      p.z = pos.z + Math.sin(a) * 0.18;
      p.vx = Math.cos(a) * speed;
      p.vz = Math.sin(a) * speed;
      p.vy = (2.6 + Math.random() * 2.8) * (isJump ? 1.3 : 1.0);
      p.age = 0;
      p.maxAge = 0.65 + Math.random() * 0.45;
      p.scale = 0.18 * (isJump ? 1.3 : 1.0);
      p.r = col.r; p.g = col.g; p.b = col.b;
      this.mesh.setColorAt(this.dropletHead, col);
      this.dropletHead = (this.dropletHead + 1) % SplashSystem.MAX_DROPLETS;
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    return { loudness, hearingRadius };
  }

  /** Profile 4: Pebble in water (single crown splash + three broken ellipse ripples, 0.6, no wake) */
  spawnPebbleSplash(pos: Vector3 | { x: number; y: number; z: number }): { loudness: number; hearingRadius: number } {
    this.spawnCrownSplash(pos, 0.75, false);

    const flash = this.flashes[this.flashHead]!;
    flash.active = true;
    flash.x = pos.x; flash.y = this.waterY + 0.015; flash.z = pos.z;
    flash.maxScale = 0.42; flash.age = 0; flash.maxAge = 0.08;
    this.flashHead = (this.flashHead + 1) % SplashSystem.MAX_FLASHES;

    return { loudness: 0.6, hearingRadius: 24.0 };
  }

  /** Profile 5: Creature (dark ink shapes + persistent dark wake) */
  spawnCreatureSplash(
    pos: Vector3 | { x: number; y: number; z: number },
    strength = 1.0,
  ): { inkDropletsSpawned: number; inkRingSpawned: boolean; whiteFoamRingSpawned: boolean } {
    this.spawnCrownSplash(pos, Math.min(1.5, 0.8 * strength), true);
    return this.spawnInkSplash(pos, strength, true);
  }

  burst(
    pos: Vector3 | { x: number; y: number; z: number },
    strength = 1.0,
    isMonster = false,
  ): void {
    if (isMonster) {
      this.spawnCreatureSplash(pos, strength);
      return;
    }

    if (strength >= 0.75) {
      this.spawnSprintOrJumpSplash(pos, strength >= 1.0);
      return;
    } else if (strength >= 0.3) {
      this.spawnWadeSplash(pos);
      return;
    } else {
      this.spawnCrouchWadeSplash(pos);
      return;
    }
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
      // Elliptical broken ripple aspect ratio matching graffiti motif
      this.dummy.scale.set(curRadius * 1.22, 1.0, curRadius * 0.82);
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

  clear(): void {
    for (let i = 0; i < SplashSystem.MAX_DROPLETS; i++) {
      this.particles[i]!.active = false;
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < SplashSystem.MAX_RINGS; i++) {
      this.rings[i]!.active = false;
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.ringMesh.setMatrixAt(i, this.dummy.matrix);
      this.ringAlphaAttr.setX(i, 0);
    }
    this.ringMesh.instanceMatrix.needsUpdate = true;
    this.ringAlphaAttr.needsUpdate = true;

    for (let i = 0; i < SplashSystem.MAX_CROWNS; i++) {
      this.crowns[i]!.active = false;
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.crownMesh.setMatrixAt(i, this.dummy.matrix);
      this.crownAlphaAttr.setX(i, 0);
    }
    this.crownMesh.instanceMatrix.needsUpdate = true;
    this.crownAlphaAttr.needsUpdate = true;

    for (let i = 0; i < SplashSystem.MAX_FLASHES; i++) {
      this.flashes[i]!.active = false;
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.flashMesh.setMatrixAt(i, this.dummy.matrix);
      this.flashAlphaAttr.setX(i, 0);
    }
    this.flashMesh.instanceMatrix.needsUpdate = true;
    this.flashAlphaAttr.needsUpdate = true;
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
