/* ── ThrowableBridge.ts ────────────────────────────────────────────────────
 *  Pebble, noisemaker, and bottle projectile ballistics, trajectory preview,
 *  water splash impact triggering, and buoyant prop pushing.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Scene,
  Line,
  BufferGeometry,
  LineBasicMaterial,
  Float32BufferAttribute,
} from 'three';
import { ProjectileSystem, type ProjectileState } from '../../sim/Projectile.js';
import { ThrowableSystem } from '../ThrowableSystem.js';
import type { SimWorld } from '../../sim/SimWorld.js';
import type { AudioEngine } from '../../audio/AudioEngine.js';
import type { WaterSystem } from '../water/WaterSystem.js';
import type { Hud, InventorySlot } from '../../ui/Hud.js';
import type { Vec3 } from '../../types/contracts.js';

export class ThrowableBridge {
  readonly throwableSystem = new ThrowableSystem();
  readonly projectileSystem = new ProjectileSystem();
  private readonly activeProjectiles: ProjectileState[] = [];
  private trajectoryLine: Line | null = null;

  empCount = 0;
  bottlesCount = 0;
  dronesEmpdCount = 0;

  private readonly scene: Scene;
  private readonly simWorld: SimWorld;
  private readonly audio: AudioEngine;
  private readonly water: WaterSystem | null;
  private readonly hud: Hud;
  private readonly mapId: string;

  constructor(
    scene: Scene,
    simWorld: SimWorld,
    audio: AudioEngine,
    water: WaterSystem | null,
    hud: Hud,
    mapId: string,
  ) {
    this.scene = scene;
    this.simWorld = simWorld;
    this.audio = audio;
    this.water = water;
    this.hud = hud;
    this.mapId = mapId;
  }

  launchThrowable(
    holdTime: number,
    inventory: InventorySlot[],
    selectedIdx: number,
  ): void {
    const pSnap = this.simWorld.player.getState();
    const vel = this.projectileSystem.calculateLaunchVelocity(pSnap.yaw, pSnap.pitch, holdTime);

    if (this.mapId === 'neon_flood') {
      if (this.empCount <= 0) return;
      this.empCount--;
      this.activeProjectiles.push({
        id: `emp_${Date.now()}`,
        kind: 'emp',
        pos: { x: pSnap.pos.x, y: pSnap.pos.y + 1.4, z: pSnap.pos.z },
        vel,
        active: true,
        spawnTime: this.simWorld.simTime,
      });
      this.audio.play('stone_creak', { gain: 0.4 });
      this.hud.update({ empCount: this.empCount });
      return;
    }

    if (this.mapId === 'drowned_metro') {
      if (this.bottlesCount > 0) {
        this.bottlesCount--;
        this.activeProjectiles.push({
          id: `bottle_${Date.now()}`,
          kind: 'bottle',
          pos: { x: pSnap.pos.x, y: pSnap.pos.y + 1.4, z: pSnap.pos.z },
          vel,
          active: true,
          spawnTime: this.simWorld.simTime,
        });
        this.audio.play('stone_creak', { gain: 0.4 });
        this.hud.update({ bottleCount: this.bottlesCount });
        return;
      }
    }

    let slot = inventory[selectedIdx];
    if (!slot || slot.count <= 0) {
      slot = { kind: 'pebble', count: 5 };
      inventory.push(slot);
    }
    slot.count--;

    this.activeProjectiles.push({
      id: `proj_${Date.now()}`,
      kind: slot.kind === 'noisemaker' ? 'noisemaker' : 'pebble',
      pos: { x: pSnap.pos.x, y: pSnap.pos.y + 1.4, z: pSnap.pos.z },
      vel,
      active: true,
      spawnTime: this.simWorld.simTime,
    });

    this.audio.play('stone_creak', { gain: 0.4 });
    this.hud.update({ inventory });
  }

  updateProjectiles(dt: number): void {
    if (this.activeProjectiles.length === 0) return;

    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const proj = this.activeProjectiles[i]!;
      const impact = this.projectileSystem.step(
        proj,
        dt,
        this.simWorld.ground,
        this.simWorld.colliders,
        this.simWorld.waterY,
        this.simWorld.simTime,
      );

      if (impact) {
        this.handleImpact(impact);
        this.activeProjectiles.splice(i, 1);
      }
    }
  }

  private handleImpact(impact: { x: number; y: number; z: number; isWater: boolean; kind: string }): void {
    const pos = { x: impact.x, y: impact.y, z: impact.z };

    if (impact.kind === 'emp') {
      this.audio.play('emp_pulse', { position: pos, gain: 1.0 });
      this.simWorld.broadcastNoise({
        kind: 'beacon',
        position: pos,
        loudness: 0.3,
        sourcePlayerId: 'player_local',
      });
      for (const d of this.simWorld.drones) {
        if (Math.hypot(pos.x - d.pos.x, pos.z - d.pos.z) < 25) {
          d.applyEmp(pos, 25.0, 20.0);
          this.dronesEmpdCount++;
        }
      }
      return;
    }

    if (impact.kind === 'bottle') {
      this.audio.play('bottle_shatter', { position: pos, gain: 0.95 });
      if (impact.isWater) {
        this.water?.splashes.burst(pos, 0.85);
        this.water?.onRipple({
          position: pos,
          strength: 0.85,
          t: this.simWorld.simTime,
          sourcePlayerId: 'player_local',
        });
      }
      this.simWorld.broadcastNoise({
        kind: impact.isWater ? 'splash' : 'shatter',
        position: pos,
        loudness: 0.85,
        sourcePlayerId: 'player_local',
      });
      return;
    }

    if (impact.kind === 'noisemaker') {
      this.audio.play('generator_cord', { position: pos, gain: 0.9 });
      if (impact.isWater) {
        this.water?.splashes.burst(pos, 0.8);
        this.water?.onRipple({
          position: pos,
          strength: 0.8,
          t: this.simWorld.simTime,
          sourcePlayerId: 'player_local',
        });
      }
      this.simWorld.broadcastNoise({
        kind: impact.isWater ? 'splash' : 'beacon',
        position: pos,
        loudness: 0.75,
        sourcePlayerId: 'player_local',
      });
      return;
    }

    // Default: pebble
    if (impact.isWater) {
      this.audio.play('pebble_plink', { position: pos, gain: 0.85 });
      this.water?.splashes.spawnThrowableSplash(pos, 0.75);
      this.water?.rippleManager.spawnPebbleImpact(pos.x, pos.z);
      this.water?.onRipple({
        position: pos,
        strength: 0.75,
        t: this.simWorld.simTime,
        sourcePlayerId: 'player_local',
      });
      this.simWorld.broadcastNoise({
        kind: 'splash',
        position: pos,
        loudness: 0.75,
        sourcePlayerId: 'player_local',
      });
    } else {
      this.audio.play('pebble_clack', { position: pos, gain: 0.6 });
      this.simWorld.broadcastNoise({
        kind: 'clack',
        position: pos,
        loudness: 0.2,
        sourcePlayerId: 'player_local',
      });
    }
  }

  updateTrajectoryPreview(isThrowHeld: boolean, holdDuration: number, pPos: Vec3): void {
    if (!isThrowHeld) {
      if (this.trajectoryLine) {
        this.scene.remove(this.trajectoryLine);
        this.trajectoryLine.geometry.dispose();
        (this.trajectoryLine.material as LineBasicMaterial).dispose();
        this.trajectoryLine = null;
      }
      return;
    }

    const pSnap = this.simWorld.player.getState();
    const points = this.projectileSystem.predictTrajectory(
      { x: pPos.x, y: pPos.y + 1.4, z: pPos.z },
      pSnap.yaw,
      pSnap.pitch,
      holdDuration,
      this.simWorld.ground,
      this.simWorld.colliders,
      this.simWorld.waterY,
    );

    const flatPoints: number[] = [];
    for (const p of points) {
      flatPoints.push(p.x, p.y, p.z);
    }

    if (!this.trajectoryLine) {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(flatPoints, 3));
      const mat = new LineBasicMaterial({ color: 0x86cfa0, transparent: true, opacity: 0.75 });
      this.trajectoryLine = new Line(geo, mat);
      this.scene.add(this.trajectoryLine);
    } else {
      this.trajectoryLine.geometry.dispose();
      this.trajectoryLine.geometry = new BufferGeometry();
      this.trajectoryLine.geometry.setAttribute('position', new Float32BufferAttribute(flatPoints, 3));
    }
  }

  dispose(): void {
    if (this.trajectoryLine) {
      this.scene.remove(this.trajectoryLine);
      this.trajectoryLine.geometry.dispose();
      (this.trajectoryLine.material as LineBasicMaterial).dispose();
      this.trajectoryLine = null;
    }
    this.throwableSystem.dispose();
    this.activeProjectiles.length = 0;
  }
}
