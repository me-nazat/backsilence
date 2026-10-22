/* ── PingMarkerManager.ts ──────────────────────────────────────────────────
 *  Silent 3D ping markers placed by teammates (default KeyV).
 *  - 6s lifetime
 *  - Chevron billboard sprite with dynamic distance text
 *  - 1.5s local cooldown
 *  - Zero noise emission (pure communication tool)
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Group,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  Vector3,
  type Camera,
} from 'three';
import type { PlayerId, Vec3 } from '../../types/contracts.js';

interface ActiveMarker {
  id: string;
  owner: PlayerId;
  position: Vector3;
  expiresAt: number;
  sprite: Sprite;
  texture: CanvasTexture;
}

export class PingMarkerManager {
  readonly root = new Group();
  private markers: ActiveMarker[] = [];
  private lastPingTime = -999;
  private readonly COOLDOWN_SEC = 1.5;
  private readonly LIFETIME_SEC = 6.0;

  canPing(nowSec: number): boolean {
    return nowSec - this.lastPingTime >= this.COOLDOWN_SEC;
  }

  recordPing(nowSec: number): void {
    this.lastPingTime = nowSec;
  }

  addMarker(owner: PlayerId, pos: Vec3, nowSec: number): void {
    const position = new Vector3(pos.x, pos.y + 0.8, pos.z);
    const { canvas, texture } = this.createChevronTexture('PING', 0);

    const spriteMat = new SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });

    const sprite = new Sprite(spriteMat);
    sprite.position.copy(position);
    sprite.scale.set(1.2, 0.9, 1.0);
    this.root.add(sprite);

    this.markers.push({
      id: `${owner}-${Math.random().toString(36).slice(2, 6)}`,
      owner,
      position,
      expiresAt: nowSec + this.LIFETIME_SEC,
      sprite,
      texture,
    });

    canvas.width = 1;
    canvas.height = 1;
  }

  private createChevronTexture(label: string, distMeters: number): { canvas: HTMLCanvasElement; texture: CanvasTexture } {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 128, 96);

      // Yellow glowing chevron
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.moveTo(64, 76);
      ctx.lineTo(36, 36);
      ctx.lineTo(52, 36);
      ctx.lineTo(64, 52);
      ctx.lineTo(76, 36);
      ctx.lineTo(92, 36);
      ctx.closePath();
      ctx.fill();

      // Top label / distance
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      const text = distMeters > 0 ? `${distMeters.toFixed(1)}m` : label;
      ctx.fillText(text, 64, 24);
    }
    const texture = new CanvasTexture(canvas);
    return { canvas, texture };
  }

  update(camera: Camera, nowSec: number): void {
    const remaining: ActiveMarker[] = [];

    for (const marker of this.markers) {
      if (nowSec >= marker.expiresAt) {
        this.root.remove(marker.sprite);
        marker.sprite.material.dispose();
        marker.texture.dispose();
      } else {
        const dist = camera.position.distanceTo(marker.position);
        // Keep sprite legible across distances
        const scale = Math.min(3.5, Math.max(1.0, dist * 0.1));
        marker.sprite.scale.set(1.2 * scale, 0.9 * scale, 1.0);

        // Subtle bounce animation
        const timeLeft = marker.expiresAt - nowSec;
        const bounce = Math.sin(timeLeft * 6.0) * 0.08;
        marker.sprite.position.y = marker.position.y + bounce;

        // Fade in final 1.5 seconds
        if (timeLeft < 1.5) {
          marker.sprite.material.opacity = timeLeft / 1.5;
        }

        remaining.push(marker);
      }
    }

    this.markers = remaining;
  }

  dispose(): void {
    for (const marker of this.markers) {
      this.root.remove(marker.sprite);
      marker.sprite.material.dispose();
      marker.texture.dispose();
    }
    this.markers = [];
    if (this.root.parent) {
      this.root.parent.remove(this.root);
    }
  }
}
