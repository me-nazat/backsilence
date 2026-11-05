/* ── ThrowableSystem.ts ───────────────────────────────────────────────────
 *  Throwable Pebble & Collectible Stone System conforming to Prompt 4B:
 *  - Slot 1 Inventory: Starts with 2 pebbles (max 9).
 *  - Key '1' toggles equip/put away.
 *  - Left-click throws pebble forward from camera: 13.5 m/s forward + 2.2 m/s arc,
 *    gravity -18.0 m/s^2.
 *  - Water impact (y <= 0.0): 3-ring concentric ripple, droplet splash, 3D stone-plop
 *    sound (pebble_plink), broadcasts THROWN_STONE_SPLASH acoustic event to divert monster.
 *  - Dry landing: ceramic stone clack sound (pebble_clack).
 *  - Collectible stone meshes (R = 0.09m) placed on dry platforms, pickable within 2.6m.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Mesh,
  DodecahedronGeometry,
  MeshStandardMaterial,
  Group,
  type Scene,
} from 'three';
import type { Vec3 } from '../types/contracts.js';
import type { AcousticBus } from '../sim/AcousticBus.js';

export interface CollectiblePebble {
  id: string;
  pos: Vec3;
  mesh?: Mesh;
}

export interface InFlightPebble {
  id: string;
  pos: Vec3;
  vel: Vec3;
  active: boolean;
  spawnTime: number;
  mesh?: Mesh;
}

export interface ThrowableSystemConfig {
  initialPebbles?: number;
  maxPebbles?: number;
  throwSpeed?: number;
  throwUpwardArc?: number;
  gravity?: number;
  pickupDistance?: number;
}

export class ThrowableSystem {
  readonly config: Required<ThrowableSystemConfig>;
  private count: number;
  private isEquippedState = false;
  private readonly collectibles: Map<string, CollectiblePebble> = new Map();
  private readonly inFlight: InFlightPebble[] = [];
  private readonly rootGroup = new Group();
  private nextPebbleId = 1;

  // Shared stone geometry and material for efficient rendering
  private stoneGeo: DodecahedronGeometry | null = null;
  private stoneMat: MeshStandardMaterial | null = null;

  constructor(cfg?: ThrowableSystemConfig) {
    this.config = {
      initialPebbles: cfg?.initialPebbles ?? 2,
      maxPebbles: cfg?.maxPebbles ?? 3,
      throwSpeed: cfg?.throwSpeed ?? 13.5,
      throwUpwardArc: cfg?.throwUpwardArc ?? 2.2,
      gravity: cfg?.gravity ?? 18.0,
      pickupDistance: cfg?.pickupDistance ?? 2.6,
    };
    this.count = this.config.initialPebbles;
    this.rootGroup.name = 'ThrowableSystem_Group';
  }

  get pebbleCount(): number {
    return this.count;
  }

  get isEquipped(): boolean {
    return this.isEquippedState && this.count > 0;
  }

  get group(): Group {
    return this.rootGroup;
  }

  get activePebbles(): readonly InFlightPebble[] {
    return this.inFlight;
  }

  get collectiblePebbles(): readonly CollectiblePebble[] {
    return Array.from(this.collectibles.values());
  }

  private getMaterial(): MeshStandardMaterial {
    if (!this.stoneMat) {
      this.stoneMat = new MeshStandardMaterial({
        color: 0x3a3835,
        roughness: 0.85,
        metalness: 0.05,
      });
    }
    return this.stoneMat;
  }

  private getGeometry(): DodecahedronGeometry {
    if (!this.stoneGeo) {
      this.stoneGeo = new DodecahedronGeometry(0.09, 1);
    }
    return this.stoneGeo;
  }

  /**
   * Toggle equipping pebble from hotbar Slot 1.
   */
  toggleEquip(): boolean {
    if (this.count <= 0) {
      this.isEquippedState = false;
      return false;
    }
    this.isEquippedState = !this.isEquippedState;
    return this.isEquippedState;
  }

  setEquipped(equip: boolean): void {
    if (equip && this.count > 0) {
      this.isEquippedState = true;
    } else {
      this.isEquippedState = false;
    }
  }

  /**
   * Spawn a collectible pebble at the specified dry platform coordinate.
   */
  addCollectible(id: string, pos: Vec3, scene?: Scene): CollectiblePebble {
    const collectible: CollectiblePebble = {
      id,
      pos: { ...pos },
    };

    try {
      const mesh = new Mesh(this.getGeometry(), this.getMaterial());
      mesh.position.set(pos.x, pos.y + 0.05, pos.z);
      // Flatten slightly to resemble an organic river stone
      mesh.scale.set(1.0, 0.72, 1.15);
      mesh.rotation.set(0.1, Math.random() * Math.PI, 0.05);
      mesh.castShadow = true;
      mesh.name = `CollectiblePebble_${id}`;
      this.rootGroup.add(mesh);
      collectible.mesh = mesh;
    } catch {
      // In non-WebGL testing environments, mesh creation may be stubbed
    }

    if (scene && !scene.children.includes(this.rootGroup)) {
      scene.add(this.rootGroup);
    }

    this.collectibles.set(id, collectible);
    return collectible;
  }

  /**
   * Check if player camera is looking within pickup distance (2.6m) of a collectible stone.
   */
  checkPickup(cameraPos: Vec3, cameraDir: Vec3): CollectiblePebble | null {
    const maxDist = this.config.pickupDistance;
    let closest: CollectiblePebble | null = null;
    let closestDist = maxDist;

    const dirLen = Math.hypot(cameraDir.x, cameraDir.y, cameraDir.z) || 1.0;
    const nx = cameraDir.x / dirLen;
    const ny = cameraDir.y / dirLen;
    const nz = cameraDir.z / dirLen;

    for (const pebble of this.collectibles.values()) {
      const dx = pebble.pos.x - cameraPos.x;
      const dy = pebble.pos.y - cameraPos.y;
      const dz = pebble.pos.z - cameraPos.z;
      const dist = Math.hypot(dx, dy, dz);

      if (dist <= maxDist && dist < closestDist) {
        // Dot product check to ensure pebble is in front of camera
        const dot = (dx * nx + dy * ny + dz * nz) / (dist || 1.0);
        if (dot > 0.65) {
          closestDist = dist;
          closest = pebble;
        }
      }
    }

    return closest;
  }

  /**
   * Pickup a collectible pebble, incrementing inventory count (max 9).
   */
  pickupPebble(id: string): boolean {
    const pebble = this.collectibles.get(id);
    if (!pebble) return false;
    if (this.count >= this.config.maxPebbles) return false;

    if (pebble.mesh) {
      this.rootGroup.remove(pebble.mesh);
      pebble.mesh.geometry.dispose();
    }
    this.collectibles.delete(id);
    this.count = Math.min(this.config.maxPebbles, this.count + 1);
    return true;
  }

  /**
   * Throw pebble projectile from camera position:
   * 13.5 m/s forward along camera vector + upward arc of +2.2 m/s, gravity -18.0 m/s^2.
   */
  throwPebble(cameraPos: Vec3, cameraForward: Vec3, simTime: number, scene?: Scene): InFlightPebble | null {
    if (!this.isEquipped || this.count <= 0) return null;

    this.count--;
    if (this.count <= 0) {
      this.isEquippedState = false;
    }

    const fLen = Math.hypot(cameraForward.x, cameraForward.y, cameraForward.z) || 1.0;
    const fx = cameraForward.x / fLen;
    const fy = cameraForward.y / fLen;
    const fz = cameraForward.z / fLen;

    const speed = this.config.throwSpeed;
    const upwardArc = this.config.throwUpwardArc;

    const vel: Vec3 = {
      x: fx * speed,
      y: fy * speed + upwardArc,
      z: fz * speed,
    };

    const spawnPos: Vec3 = {
      x: cameraPos.x + fx * 0.45,
      y: cameraPos.y + fy * 0.45 - 0.1,
      z: cameraPos.z + fz * 0.45,
    };

    const pebble: InFlightPebble = {
      id: `pebble_inflight_${this.nextPebbleId++}`,
      pos: spawnPos,
      vel,
      active: true,
      spawnTime: simTime,
    };

    try {
      const mesh = new Mesh(this.getGeometry(), this.getMaterial());
      mesh.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
      mesh.scale.set(1.0, 0.72, 1.15);
      mesh.castShadow = true;
      this.rootGroup.add(mesh);
      pebble.mesh = mesh;
    } catch {
      // Stubbed environment
    }

    if (scene && !scene.children.includes(this.rootGroup)) {
      scene.add(this.rootGroup);
    }

    this.inFlight.push(pebble);
    return pebble;
  }

  /**
   * Advance all in-flight pebbles by dt, applying gravity and testing impacts.
   */
  step(
    dt: number,
    simTime: number,
    waterY: number,
    callbacks?: {
      onWaterHit?: (pos: Vec3, pebble: InFlightPebble) => void;
      onDryHit?: (pos: Vec3, pebble: InFlightPebble) => void;
      isPlatformAt?: (x: number, z: number) => boolean;
      acousticBus?: AcousticBus;
    },
  ): void {
    const gravity = this.config.gravity;

    for (let i = this.inFlight.length - 1; i >= 0; i--) {
      const p = this.inFlight[i]!;
      if (!p.active) {
        this.destroyInFlightPebble(i);
        continue;
      }

      const prevY = p.pos.y;

      // Integrate gravity
      p.vel.y -= gravity * dt;

      // Integrate position
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += p.vel.z * dt;

      if (p.mesh) {
        p.mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
        p.mesh.rotation.x += 8.0 * dt;
        p.mesh.rotation.y += 12.0 * dt;
      }

      // Check collision with water (y <= waterY)
      if (prevY >= waterY && p.pos.y <= waterY) {
        // Test if landing on dry platform elevated above water
        const isDry = callbacks?.isPlatformAt ? callbacks.isPlatformAt(p.pos.x, p.pos.z) : false;

        if (isDry) {
          const impactPos: Vec3 = { x: p.pos.x, y: 0.38, z: p.pos.z };
          callbacks?.onDryHit?.(impactPos, p);
        } else {
          const impactPos: Vec3 = { x: p.pos.x, y: waterY, z: p.pos.z };
          callbacks?.onWaterHit?.(impactPos, p);
          callbacks?.acousticBus?.emitStoneSplash(impactPos, simTime);
        }

        p.active = false;
        this.destroyInFlightPebble(i);
        continue;
      }

      // Check platform top collision (y <= 0.38)
      if (p.pos.y <= 0.38 && callbacks?.isPlatformAt && callbacks.isPlatformAt(p.pos.x, p.pos.z)) {
        const impactPos: Vec3 = { x: p.pos.x, y: 0.38, z: p.pos.z };
        callbacks.onDryHit?.(impactPos, p);
        p.active = false;
        this.destroyInFlightPebble(i);
        continue;
      }

      // Out of bounds cleanup
      if (p.pos.y < -12.0 || Math.hypot(p.pos.x, p.pos.z) > 120.0) {
        p.active = false;
        this.destroyInFlightPebble(i);
      }
    }
  }

  private destroyInFlightPebble(index: number): void {
    const p = this.inFlight[index];
    if (p?.mesh) {
      this.rootGroup.remove(p.mesh);
      p.mesh.geometry.dispose();
    }
    this.inFlight.splice(index, 1);
  }

  reset(): void {
    this.count = this.config.initialPebbles;
    this.isEquippedState = false;
    for (let i = this.inFlight.length - 1; i >= 0; i--) {
      this.destroyInFlightPebble(i);
    }
  }

  dispose(): void {
    this.reset();
    for (const pebble of this.collectibles.values()) {
      if (pebble.mesh) {
        this.rootGroup.remove(pebble.mesh);
        pebble.mesh.geometry.dispose();
      }
    }
    this.collectibles.clear();
    this.stoneGeo?.dispose();
    this.stoneMat?.dispose();
  }
}
