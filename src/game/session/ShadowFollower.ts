/* ── ShadowFollower.ts ──────────────────────────────────────────────────────
 *  Tracks the player position each frame, updating sun.position and sun.target.position
 *  along the map's sun direction vector so the directional shadow frustum constantly
 *  encompasses the active gameplay bounds around the player.
 * ──────────────────────────────────────────────────────────────────────── */

import { Vector3, type DirectionalLight, type Object3D } from 'three';

export interface ShadowFollowerOptions {
  distance?: number;
}

export class ShadowFollower {
  readonly sun: DirectionalLight;
  readonly target: Object3D;
  readonly sunDirection: Vector3;
  readonly distance: number;

  constructor(
    sun: DirectionalLight,
    target: Object3D,
    sunDirection: Vector3,
    options: ShadowFollowerOptions = {},
  ) {
    this.sun = sun;
    this.target = target;
    this.sunDirection = sunDirection.clone().normalize();
    this.distance = options.distance ?? 30.0;
  }

  /**
   * Updates sun and target positions to center the shadow volume on playerPos.
   */
  update(playerPos: { x: number; y: number; z: number }): void {
    this.target.position.set(playerPos.x, playerPos.y, playerPos.z);
    this.sun.position.set(
      playerPos.x + this.sunDirection.x * this.distance,
      playerPos.y + this.sunDirection.y * this.distance,
      playerPos.z + this.sunDirection.z * this.distance,
    );
    this.sun.updateMatrixWorld();
    this.target.updateMatrixWorld();
  }
}

