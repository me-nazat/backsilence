/* ── ParticleDirector.ts ──────────────────────────────────────────────────────
 *  Unified Particle Director for BackSilence:
 *  - Orchestrates 10 procedural particle systems across maps and tiers:
 *    1. rain_streaks: Camera-following rain volume with wind angle
 *    2. drop_ripples: Surface ring expansions on water impact
 *    3. splash_droplets: Parabolic radial spray on footfalls/bodies
 *    4. mist_sheets: Warm low-lying vapor rising above poolrooms water
 *    5. dust_motes: Microscopic drifting motes in light shafts
 *    6. fireflies: Bioluminescent wandering orbs in Sunken Jungle
 *    7. bubbles: Wobbling rising subsurface bubbles in deep water
 *    8. steam_plumes: High-pressure billowing steam in Utility Tunnels
 *    9. drifting_petals: Fluttering organic leaves/petals in Sunken Jungle
 *   10. sparks: Fast fiery sparks from broken neon/conduits
 *  - Zero runtime heap allocation during gameplay updates.
 *  - Tiered scaling (High 100%, Medium 50%, Low 25%).
 * ──────────────────────────────────────────────────────────────────────── */

import { Object3D, type Camera } from 'three';
import { ParticlePool } from './ParticleSystem.js';
import type { GraphicsTier } from '../../types/contracts.js';

export interface ParticleDirectorOptions {
  tier?: GraphicsTier;
  waterY?: number;
  mapId?: string;
  seed?: number;
}

export class ParticleDirector {
  readonly root = new Object3D();
  readonly tier: GraphicsTier;
  waterY: number;
  mapId: string;

  // 10 Procedural Pools
  readonly rainStreaks: ParticlePool;
  readonly dropRipples: ParticlePool;
  readonly splashDroplets: ParticlePool;
  readonly mistSheets: ParticlePool;
  readonly dustMotes: ParticlePool;
  readonly fireflies: ParticlePool;
  readonly bubbles: ParticlePool;
  readonly steamPlumes: ParticlePool;
  readonly driftingPetals: ParticlePool;
  readonly sparks: ParticlePool;

  // Continuous emission timers
  private rainTimer = 0;
  private mistTimer = 0;
  private dustTimer = 0;
  private fireflyTimer = 0;
  private bubbleTimer = 0;
  private steamTimer = 0;
  private petalTimer = 0;
  private ambientSparkTimer = 0;

  // Rain settings
  rainIntensity = 0.0; // 0..1
  windAngle = 0.15; // radians drift

  constructor(options: ParticleDirectorOptions = {}) {
    this.tier = options.tier ?? 'high';
    this.waterY = options.waterY ?? 0.0;
    this.mapId = options.mapId ?? 'natatorium';

    const mul = this.tier === 'low' ? 0.25 : this.tier === 'medium' ? 0.5 : 1.0;

    // 1. Rain Streaks (Velocity-aligned)
    this.rainStreaks = new ParticlePool({
      capacity: Math.max(32, Math.floor(512 * mul)),
      orientation: 'velocity',
      customFragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          float lat = abs(vUv.x - 0.5);
          if (lat > 0.45) discard;
          float a = smoothstep(0.45, 0.05, lat) * smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
          gl_FragColor = vec4(vColor, a * 0.75);
        }
      `,
    });

    // 2. Drop Ripples (Horizontal surface rings)
    this.dropRipples = new ParticlePool({
      capacity: Math.max(16, Math.floor(128 * mul)),
      orientation: 'horizontal',
      customFragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vec2 c = vUv - vec2(0.5);
          float d = length(c);
          if (d > 0.5) discard;
          float ring = smoothstep(0.08, 0.0, abs(d - 0.42));
          gl_FragColor = vec4(vColor, ring * 0.65);
        }
      `,
    });

    // 3. Splash Droplets (Velocity-aligned parabolic spray)
    this.splashDroplets = new ParticlePool({
      capacity: Math.max(16, Math.floor(128 * mul)),
      orientation: 'velocity',
    });

    // 4. Mist Sheets (Large soft billboards)
    this.mistSheets = new ParticlePool({
      capacity: Math.max(12, Math.floor(96 * mul)),
      orientation: 'billboard',
      customFragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          float d = length(vUv - vec2(0.5));
          if (d > 0.5) discard;
          float soft = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vColor, soft * 0.28);
        }
      `,
    });

    // 5. Dust Motes (Tiny floating specks)
    this.dustMotes = new ParticlePool({
      capacity: Math.max(16, Math.floor(128 * mul)),
      orientation: 'billboard',
      customFragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          float d = length(vUv - vec2(0.5));
          if (d > 0.5) discard;
          float bright = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor, bright * 0.85);
        }
      `,
    });

    // 6. Fireflies (Wandering bioluminescent orbs)
    this.fireflies = new ParticlePool({
      capacity: Math.max(8, Math.floor(64 * mul)),
      orientation: 'billboard',
      customFragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          float d = length(vUv - vec2(0.5));
          if (d > 0.5) discard;
          float core = exp(-d * 7.0);
          gl_FragColor = vec4(vColor, core * 0.95);
        }
      `,
    });

    // 7. Bubbles (Subsurface rising bubbles)
    this.bubbles = new ParticlePool({
      capacity: Math.max(8, Math.floor(64 * mul)),
      orientation: 'billboard',
      customFragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vec2 c = vUv - vec2(0.5);
          float d = length(c);
          if (d > 0.5) discard;
          float rim = smoothstep(0.06, 0.0, abs(d - 0.42));
          float glint = smoothstep(0.12, 0.0, length(c - vec2(-0.15, 0.15)));
          gl_FragColor = vec4(vColor, (rim * 0.7 + glint * 0.9));
        }
      `,
    });

    // 8. Steam Plumes (Expanding high-pressure steam)
    this.steamPlumes = new ParticlePool({
      capacity: Math.max(8, Math.floor(64 * mul)),
      orientation: 'billboard',
      customFragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          float d = length(vUv - vec2(0.5));
          if (d > 0.5) discard;
          float billow = smoothstep(0.5, 0.1, d);
          gl_FragColor = vec4(vColor, billow * 0.35);
        }
      `,
    });

    // 9. Drifting Petals (Falling leaves/petals)
    this.driftingPetals = new ParticlePool({
      capacity: Math.max(8, Math.floor(64 * mul)),
      orientation: 'billboard',
      customFragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vec2 c = vUv - vec2(0.5);
          float d = length(vec2(c.x * 1.8, c.y));
          if (d > 0.5) discard;
          float leaf = smoothstep(0.5, 0.2, d);
          gl_FragColor = vec4(vColor, leaf * 0.8);
        }
      `,
    });

    // 10. Sparks (Fast decelerating electrical sparks)
    this.sparks = new ParticlePool({
      capacity: Math.max(12, Math.floor(96 * mul)),
      orientation: 'velocity',
      customFragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          float lat = abs(vUv.x - 0.5);
          if (lat > 0.4) discard;
          float a = smoothstep(0.4, 0.05, lat);
          gl_FragColor = vec4(vColor, a);
        }
      `,
    });

    // Attach all pools to root
    this.root.add(this.rainStreaks.mesh);
    this.root.add(this.dropRipples.mesh);
    this.root.add(this.splashDroplets.mesh);
    this.root.add(this.mistSheets.mesh);
    this.root.add(this.dustMotes.mesh);
    this.root.add(this.fireflies.mesh);
    this.root.add(this.bubbles.mesh);
    this.root.add(this.steamPlumes.mesh);
    this.root.add(this.driftingPetals.mesh);
    this.root.add(this.sparks.mesh);

    // Initial configuration for map
    this.configureForMap(this.mapId);
  }

  configureForMap(mapId: string): void {
    this.mapId = mapId;
    if (mapId === 'neon_flood') {
      this.rainIntensity = 0.75;
    } else {
      this.rainIntensity = 0.0;
    }
  }

  /**
   * Spawns a radial water splash burst at (x, y, z).
   */
  spawnSplash(x: number, y: number, z: number, count = 16, strength = 2.5): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.2;
      const speed = (0.5 + Math.random() * 0.5) * strength;
      const vx = Math.cos(angle) * speed;
      const vz = Math.sin(angle) * speed;
      const vy = (0.8 + Math.random() * 0.7) * strength;
      const maxAge = 0.4 + Math.random() * 0.3;

      this.splashDroplets.spawn(
        x,
        y + 0.05,
        z,
        vx,
        vy,
        vz,
        maxAge,
        0.04,
        0.18,
        0.88,
        0.96,
        0.95,
        0.9,
      );
    }
    // And a contact ripple
    this.spawnDropRipple(x, z, 0.6);
  }

  /**
   * Spawns an expanding surface ripple at (x, z).
   */
  spawnDropRipple(x: number, z: number, targetScale = 0.45): void {
    this.dropRipples.spawn(
      x,
      this.waterY + 0.005,
      z,
      0,
      0,
      0,
      0.65,
      targetScale,
      targetScale,
      0.75,
      0.88,
      0.86,
      0.8,
    );
  }

  /**
   * Spawns electrical/friction sparks at (x, y, z).
   */
  spawnSparks(x: number, y: number, z: number, count = 12): void {
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI;
      const speed = 2.5 + Math.random() * 4.5;
      const vx = Math.cos(theta) * Math.cos(phi) * speed;
      const vy = Math.sin(phi) * speed + 1.5;
      const vz = Math.sin(theta) * Math.cos(phi) * speed;
      const maxAge = 0.25 + Math.random() * 0.35;

      this.sparks.spawn(
        x,
        y,
        z,
        vx,
        vy,
        vz,
        maxAge,
        0.03,
        0.16,
        1.0,
        0.65 + Math.random() * 0.3,
        0.15,
        1.0,
      );
    }
  }

  /**
   * Spawns high-pressure steam plume burst.
   */
  spawnSteamPlume(x: number, y: number, z: number, dirX = 0, dirY = 1, dirZ = 0): void {
    for (let i = 0; i < 4; i++) {
      const spread = 0.3;
      const vx = (dirX + (Math.random() - 0.5) * spread) * 2.5;
      const vy = (dirY + (Math.random() - 0.5) * spread) * 2.5;
      const vz = (dirZ + (Math.random() - 0.5) * spread) * 2.5;
      const maxAge = 0.8 + Math.random() * 0.5;

      this.steamPlumes.spawn(
        x,
        y,
        z,
        vx,
        vy,
        vz,
        maxAge,
        0.35,
        0.35,
        0.92,
        0.92,
        0.95,
        0.4,
        (Math.random() - 0.5) * 1.5,
      );
    }
  }

  /**
   * Spawns underwater rising bubbles.
   */
  spawnBubbles(x: number, y: number, z: number, count = 5): void {
    for (let i = 0; i < count; i++) {
      const ox = (Math.random() - 0.5) * 0.4;
      const oz = (Math.random() - 0.5) * 0.4;
      const vy = 0.8 + Math.random() * 0.8;
      const maxAge = 1.2 + Math.random() * 0.8;

      this.bubbles.spawn(
        x + ox,
        y,
        z + oz,
        (Math.random() - 0.5) * 0.15,
        vy,
        (Math.random() - 0.5) * 0.15,
        maxAge,
        0.06 + Math.random() * 0.05,
        0.06 + Math.random() * 0.05,
        0.75,
        0.9,
        0.95,
        0.7,
      );
    }
  }

  /**
   * Main zero-allocation frame update.
   */
  update(dt: number, camera?: Camera, simTime = 0): void {
    const camPos = camera ? camera.position : null;
    const cx = camPos ? camPos.x : 0;
    const cy = camPos ? camPos.y : 2;
    const cz = camPos ? camPos.z : 0;

    // 1. Continuous Rain Streaks (if rainIntensity > 0)
    if (this.rainIntensity > 0) {
      const rainRate = 180 * this.rainIntensity; // drops per sec
      this.rainTimer += dt * rainRate;
      const spawnCount = Math.floor(this.rainTimer);
      if (spawnCount > 0) {
        this.rainTimer -= spawnCount;
        const capped = Math.min(spawnCount, 16);
        for (let i = 0; i < capped; i++) {
          const rx = cx + (Math.random() - 0.5) * 26.0;
          const rz = cz + (Math.random() - 0.5) * 26.0;
          const ry = cy + 4.0 + Math.random() * 6.0;
          const vy = -18.0 - Math.random() * 4.0;
          const vx = Math.sin(this.windAngle) * 2.0;
          const vz = Math.cos(this.windAngle) * 0.5;
          const maxAge = Math.max(0.1, (ry - this.waterY) / Math.abs(vy));

          this.rainStreaks.spawn(
            rx,
            ry,
            rz,
            vx,
            vy,
            vz,
            maxAge,
            0.02,
            0.45,
            0.82,
            0.92,
            1.0,
            0.7,
          );

          // Chance to spawn surface drop ripple on water plane
          if (Math.random() < 0.3) {
            this.spawnDropRipple(rx, rz, 0.25 + Math.random() * 0.2);
          }
        }
      }
    }

    // 2. Continuous Mist over warm water
    this.mistTimer += dt;
    if (this.mistTimer > 0.2) {
      this.mistTimer = 0;
      const mx = cx + (Math.random() - 0.5) * 24.0;
      const mz = cz + (Math.random() - 0.5) * 24.0;
      const my = this.waterY + 0.05 + Math.random() * 0.3;
      this.mistSheets.spawn(
        mx,
        my,
        mz,
        (Math.random() - 0.5) * 0.15,
        0.12 + Math.random() * 0.1,
        (Math.random() - 0.5) * 0.15,
        3.5 + Math.random() * 2.0,
        1.8 + Math.random() * 1.4,
        1.8 + Math.random() * 1.4,
        0.85,
        0.95,
        0.94,
        0.25,
        (Math.random() - 0.5) * 0.2,
      );
    }

    // 3. Continuous Dust Motes in air
    this.dustTimer += dt;
    if (this.dustTimer > 0.15) {
      this.dustTimer = 0;
      const dx = cx + (Math.random() - 0.5) * 16.0;
      const dy = cy + (Math.random() - 0.5) * 8.0;
      const dz = cz + (Math.random() - 0.5) * 16.0;
      this.dustMotes.spawn(
        dx,
        dy,
        dz,
        (Math.random() - 0.5) * 0.08,
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.08,
        4.0 + Math.random() * 3.0,
        0.04,
        0.04,
        0.95,
        0.92,
        0.75,
        0.6,
      );
    }

    // 4. Map-Specific Continuous Effects
    if (this.mapId === 'sunken_jungle') {
      // Fireflies
      this.fireflyTimer += dt;
      if (this.fireflyTimer > 0.25) {
        this.fireflyTimer = 0;
        const fx = cx + (Math.random() - 0.5) * 22.0;
        const fy = this.waterY + 1.0 + Math.random() * 5.0;
        const fz = cz + (Math.random() - 0.5) * 22.0;
        const pulse = 0.5 + 0.5 * Math.sin(simTime * 4.0 + fx);
        this.fireflies.spawn(
          fx,
          fy,
          fz,
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.4,
          5.0 + Math.random() * 3.0,
          0.09,
          0.09,
          0.3 + 0.6 * pulse,
          0.95,
          0.15,
          0.9,
        );
      }

      // Drifting Petals
      this.petalTimer += dt;
      if (this.petalTimer > 0.3) {
        this.petalTimer = 0;
        const px = cx + (Math.random() - 0.5) * 20.0;
        const py = cy + 4.0 + Math.random() * 3.0;
        const pz = cz + (Math.random() - 0.5) * 20.0;
        this.driftingPetals.spawn(
          px,
          py,
          pz,
          Math.sin(simTime * 2.0) * 0.3,
          -0.6 - Math.random() * 0.4,
          Math.cos(simTime * 1.5) * 0.2,
          4.0 + Math.random() * 2.0,
          0.12,
          0.2,
          0.45,
          0.72,
          0.38,
          0.85,
          (Math.random() - 0.5) * 1.8,
        );
      }
    } else if (this.mapId === 'utility_tunnels') {
      // Ambient steam & sparks
      this.steamTimer += dt;
      if (this.steamTimer > 0.45) {
        this.steamTimer = 0;
        this.spawnSteamPlume(cx + (Math.random() - 0.5) * 8.0, 2.5, cz + (Math.random() - 0.5) * 8.0, 0, 1, 0);
      }
      this.ambientSparkTimer += dt;
      if (this.ambientSparkTimer > 2.2) {
        this.ambientSparkTimer = 0;
        this.spawnSparks(cx + (Math.random() - 0.5) * 10.0, 2.8, cz + (Math.random() - 0.5) * 10.0, 8);
      }
    } else if (this.mapId === 'drainage_core') {
      // Subsurface deep bubbles
      this.bubbleTimer += dt;
      if (this.bubbleTimer > 0.3) {
        this.bubbleTimer = 0;
        const bx = cx + (Math.random() - 0.5) * 14.0;
        const bz = cz + (Math.random() - 0.5) * 14.0;
        this.spawnBubbles(bx, this.waterY - 1.5, bz, 4);
      }
    }

    // 5. Update All 10 Pools (Zero heap allocations)
    this.rainStreaks.update(dt, camera);
    this.dropRipples.update(dt, camera);
    this.splashDroplets.update(dt, camera, -9.8, 0.98);
    this.mistSheets.update(dt, camera);
    this.dustMotes.update(dt, camera);
    this.fireflies.update(dt, camera);
    this.bubbles.update(dt, camera);
    this.steamPlumes.update(dt, camera, 0.2, 0.95);
    this.driftingPetals.update(dt, camera, -0.5, 0.97);
    this.sparks.update(dt, camera, -12.0, 0.92);
  }

  getTotalActiveParticles(): number {
    return (
      this.rainStreaks.getActiveCount() +
      this.dropRipples.getActiveCount() +
      this.splashDroplets.getActiveCount() +
      this.mistSheets.getActiveCount() +
      this.dustMotes.getActiveCount() +
      this.fireflies.getActiveCount() +
      this.bubbles.getActiveCount() +
      this.steamPlumes.getActiveCount() +
      this.driftingPetals.getActiveCount() +
      this.sparks.getActiveCount()
    );
  }

  reset(): void {
    this.rainStreaks.reset();
    this.dropRipples.reset();
    this.splashDroplets.reset();
    this.mistSheets.reset();
    this.dustMotes.reset();
    this.fireflies.reset();
    this.bubbles.reset();
    this.steamPlumes.reset();
    this.driftingPetals.reset();
    this.sparks.reset();
  }

  dispose(): void {
    this.rainStreaks.dispose();
    this.dropRipples.dispose();
    this.splashDroplets.dispose();
    this.mistSheets.dispose();
    this.dustMotes.dispose();
    this.fireflies.dispose();
    this.bubbles.dispose();
    this.steamPlumes.dispose();
    this.driftingPetals.dispose();
    this.sparks.dispose();
  }
}
