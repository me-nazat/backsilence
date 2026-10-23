/* ── SpectatorController.ts ────────────────────────────────────────────────
 *  Spectator camera controller on death or late-join in multiplayer.
 *  - First-person follow of living teammate with smoothing spring
 *  - Q/E cycle living teammates
 *  - F toggles free-roam within map bounds (speed capped, no collision, 0 noise)
 *  - Auto-advance on spectated player death
 * ──────────────────────────────────────────────────────────────────────── */

import { Vector3, Euler, MathUtils, type PerspectiveCamera } from 'three';
import type { PlayerId } from '../../types/contracts.js';
import type { RemotePeer } from '../../net/session/NetSession.js';

export interface MapBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY?: number;
}

export class SpectatorController {
  private camera: PerspectiveCamera;
  private mode: 'follow' | 'freeroam' = 'follow';
  private targetPlayerId: PlayerId | null = null;

  // Smoothing springs for follow mode
  private currentPos = new Vector3();
  private targetPos = new Vector3();
  private currentYaw = 0;
  private currentPitch = 0;

  // Free-roam state
  private freePos = new Vector3(0, 3, 0);
  private freeYaw = 0;
  private freePitch = 0;
  private mapBounds: MapBounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50, minY: 0.5, maxY: 12 };

  constructor(camera: PerspectiveCamera) {
    this.camera = camera;
  }

  setBounds(bounds: MapBounds): void {
    this.mapBounds = bounds;
  }

  getMode(): 'follow' | 'freeroam' {
    return this.mode;
  }

  getTargetPlayerId(): PlayerId | null {
    return this.targetPlayerId;
  }

  toggleFreeRoam(): void {
    if (this.mode === 'follow') {
      this.mode = 'freeroam';
      this.freePos.copy(this.camera.position);
      this.freeYaw = this.currentYaw;
      this.freePitch = this.currentPitch;
    } else {
      this.mode = 'follow';
    }
  }

  cycleTarget(remotes: Map<PlayerId, RemotePeer> | RemotePeer[], direction: 1 | -1 = 1): void {
    const peers = Array.isArray(remotes) ? remotes : Array.from(remotes.values());
    const living = peers.filter((r) => r.alive && !r.escaped);
    if (living.length === 0) {
      this.targetPlayerId = null;
      this.mode = 'freeroam';
      return;
    }

    if (!this.targetPlayerId) {
      this.targetPlayerId = living[0]?.id ?? null;
      this.mode = 'follow';
      return;
    }

    const currentIndex = living.findIndex((r) => r.id === this.targetPlayerId);
    if (currentIndex === -1) {
      this.targetPlayerId = living[0]?.id ?? null;
    } else {
      const nextIndex = (currentIndex + direction + living.length) % living.length;
      this.targetPlayerId = living[nextIndex]?.id ?? null;
    }
    this.mode = 'follow';
  }

  update(
    dt: number,
    remotes: Map<PlayerId, RemotePeer> | RemotePeer[],
    moveInput: { x: number; y: number; sprint: boolean },
    lookDelta: { dx: number; dy: number },
    reducedMotion = false,
  ): void {
    const remotesMap = Array.isArray(remotes)
      ? new Map(remotes.map((r) => [r.id, r]))
      : remotes;
    const living = Array.from(remotesMap.values()).filter((r) => r.alive && !r.escaped);

    // Auto-advance if observed player died or left
    if (this.mode === 'follow') {
      if (!this.targetPlayerId || !remotesMap.get(this.targetPlayerId)?.alive) {
        if (living.length > 0) {
          this.targetPlayerId = living[0]!.id;
        } else {
          this.targetPlayerId = null;
          this.mode = 'freeroam';
        }
      }
    }

    if (this.mode === 'follow' && this.targetPlayerId) {
      const targetPeer = remotesMap.get(this.targetPlayerId);
      if (targetPeer) {
        const eyeY = targetPeer.crouch ? 0.95 : 1.62;
        this.targetPos.set(targetPeer.pos.x, targetPeer.pos.y + eyeY, targetPeer.pos.z);

        // Camera spring smoothing
        const springSpeed = reducedMotion ? 6.0 : 12.0;
        this.currentPos.lerp(this.targetPos, Math.min(1.0, dt * springSpeed));

        // Shortest arc yaw interpolation
        let diffYaw = targetPeer.yaw - this.currentYaw;
        while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
        while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
        this.currentYaw += diffYaw * Math.min(1.0, dt * springSpeed);

        this.currentPitch = MathUtils.lerp(this.currentPitch, targetPeer.pitch, Math.min(1.0, dt * springSpeed));

        this.camera.position.copy(this.currentPos);
        const euler = new Euler(this.currentPitch, this.currentYaw, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(euler);
        return;
      }
    }

    // Free-roam mode
    this.freeYaw += lookDelta.dx;
    this.freePitch = MathUtils.clamp(this.freePitch + lookDelta.dy, -1.45, 1.45);

    const speedCap = reducedMotion ? 3.5 : (moveInput.sprint ? 9.0 : 5.5);
    const forwardX = -Math.sin(this.freeYaw);
    const forwardZ = -Math.cos(this.freeYaw);
    const rightX = Math.cos(this.freeYaw);
    const rightZ = -Math.sin(this.freeYaw);

    const moveX = (rightX * moveInput.x + forwardX * moveInput.y) * speedCap * dt;
    const moveZ = (rightZ * moveInput.x + forwardZ * moveInput.y) * speedCap * dt;

    this.freePos.x = MathUtils.clamp(this.freePos.x + moveX, this.mapBounds.minX, this.mapBounds.maxX);
    this.freePos.z = MathUtils.clamp(this.freePos.z + moveZ, this.mapBounds.minZ, this.mapBounds.maxZ);
    this.freePos.y = MathUtils.clamp(this.freePos.y, this.mapBounds.minY ?? 0.5, this.mapBounds.maxY ?? 15);

    this.camera.position.copy(this.freePos);
    const euler = new Euler(this.freePitch, this.freeYaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  getObservedPlayerName(remotes: Map<PlayerId, RemotePeer>): string {
    if (this.mode === 'freeroam') return 'FREE ROAM';
    if (!this.targetPlayerId) return 'NO TEAMS LEFT';
    const peer = remotes.get(this.targetPlayerId);
    return peer ? peer.name : 'UNKNOWN';
  }

  getObservedPeer(remotes: Map<PlayerId, RemotePeer>): RemotePeer | null {
    if (this.mode === 'freeroam' || !this.targetPlayerId) return null;
    return remotes.get(this.targetPlayerId) ?? null;
  }
}
