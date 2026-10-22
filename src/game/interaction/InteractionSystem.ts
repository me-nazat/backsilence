/* ── InteractionSystem.ts ──────────────────────────────────────────────────
 *  First-person interaction system.
 *  Raycasts from camera center (up to 2.2m) against registered interactables.
 *  Drives HUD interaction prompt and handles click / E key activation.
 * ──────────────────────────────────────────────────────────────────────── */

import { Raycaster, Vector2, type Camera } from 'three';
import type { Vec3 } from '../../types/contracts.js';

export interface Interactable {
  id: string;
  position: Vec3;
  radius: number;
  label: () => string;
  holdTime?: number; // 0 for instant press
  canUse: () => boolean;
  onUse: () => void;
}

export interface InteractionPromptState {
  visible: boolean;
  label: string;
  holdProgress: number; // 0..1
}

export class InteractionSystem {
  private readonly interactables = new Map<string, Interactable>();
  private readonly raycaster = new Raycaster();
  private readonly center = new Vector2(0, 0);
  private currentTarget: Interactable | null = null;
  private holdTimer = 0;

  register(interactable: Interactable): void {
    this.interactables.set(interactable.id, interactable);
  }

  unregister(id: string): void {
    this.interactables.delete(id);
    if (this.currentTarget?.id === id) {
      this.currentTarget = null;
      this.holdTimer = 0;
    }
  }

  update(dt: number, camera: Camera, isInteracting: boolean): InteractionPromptState {
    this.raycaster.setFromCamera(this.center, camera);
    const ray = this.raycaster.ray;

    let closest: Interactable | null = null;
    let minDistance = 2.2; // Maximum interaction reach

    for (const item of this.interactables.values()) {
      if (!item.canUse()) continue;

      // Distance from ray to sphere center
      const toCenter = {
        x: item.position.x - ray.origin.x,
        y: item.position.y - ray.origin.y,
        z: item.position.z - ray.origin.z,
      };

      const dot = toCenter.x * ray.direction.x + toCenter.y * ray.direction.y + toCenter.z * ray.direction.z;
      if (dot <= 0 || dot > minDistance) continue;

      const perpSq =
        toCenter.x * toCenter.x +
        toCenter.y * toCenter.y +
        toCenter.z * toCenter.z -
        dot * dot;

      if (perpSq <= item.radius * item.radius) {
        minDistance = dot;
        closest = item;
      }
    }

    if (closest !== this.currentTarget) {
      this.currentTarget = closest;
      this.holdTimer = 0;
    }

    let holdProgress = 0;

    if (this.currentTarget) {
      const requiredHold = this.currentTarget.holdTime ?? 0;
      if (isInteracting) {
        if (requiredHold <= 0) {
          // Instant activation
          this.currentTarget.onUse();
          this.holdTimer = 0;
        } else {
          this.holdTimer += dt;
          holdProgress = Math.min(1.0, this.holdTimer / requiredHold);
          if (this.holdTimer >= requiredHold) {
            this.currentTarget.onUse();
            this.holdTimer = 0;
          }
        }
      } else {
        this.holdTimer = 0;
      }

      return {
        visible: true,
        label: this.currentTarget.label(),
        holdProgress,
      };
    }

    return {
      visible: false,
      label: '',
      holdProgress: 0,
    };
  }

  dispose(): void {
    this.interactables.clear();
    this.currentTarget = null;
  }
}
