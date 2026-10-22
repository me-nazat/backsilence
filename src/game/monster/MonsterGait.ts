/* ── MonsterGait.ts ────────────────────────────────────────────────────────
 *  Procedural gait generator scheduling limb plants, knuckle-walking,
 *  bounding sprint with flight phase, and ground contact raycasts.
 * ──────────────────────────────────────────────────────────────────────── */

import { Vector3 } from 'three';
import type { GroundGrid } from '../../sim/GroundGrid.js';

export interface LimbTarget {
  pos: Vector3;
  isPlanted: boolean;
  plantForce: number;
}

export class MonsterGaitGenerator {
  readonly handL: LimbTarget = { pos: new Vector3(), isPlanted: true, plantForce: 0 };
  readonly handR: LimbTarget = { pos: new Vector3(), isPlanted: true, plantForce: 0 };
  readonly footL: LimbTarget = { pos: new Vector3(), isPlanted: true, plantForce: 0 };
  readonly footR: LimbTarget = { pos: new Vector3(), isPlanted: true, plantForce: 0 };

  private cycleTime = 0;
  private wasPlantedHL = true;
  private wasPlantedHR = true;
  private wasPlantedFL = true;
  private wasPlantedFR = true;

  // Gait properties
  spinePitch = 0;
  spineRoll = 0;
  headDip = 0;

  update(
    dt: number,
    speed: number,
    rootPos: Vector3,
    rootYaw: number,
    ground: GroundGrid,
    onPlant?: (pos: Vector3, force: number) => void,
  ): void {
    const isSprint = speed > 4.0;
    const strideLength = isSprint ? 3.0 : 1.1;
    const stepHeight = isSprint ? 0.45 : 0.22;
    const gaitFreq = Math.max(0.5, speed / strideLength);

    this.cycleTime += dt * gaitFreq * Math.PI * 2;

    const fwdX = Math.sin(rootYaw);
    const fwdZ = -Math.cos(rootYaw);
    const rightX = Math.cos(rootYaw);
    const rightZ = Math.sin(rootYaw);

    // Spine lean and sway
    this.spinePitch = isSprint ? 0.35 : 0.12;
    this.spineRoll = isSprint ? 0.0 : Math.sin(this.cycleTime) * 0.08;
    this.headDip = Math.sin(this.cycleTime * 2.0) * 0.06;

    if (isSprint) {
      // Bounding gait: arms strike together (phase 0..0.4), flight phase (0.4..0.6), legs strike together (0.6..1.0)
      const phase = (this.cycleTime / (Math.PI * 2)) % 1.0;

      // Arms
      const armLift = phase > 0.4 && phase < 0.8 ? Math.sin((phase - 0.4) * Math.PI * 2.5) * stepHeight : 0;
      const armFwd = phase <= 0.4 ? 0.4 : -0.2;
      this.updateLimb(this.handL, rootPos, fwdX, fwdZ, rightX, rightZ, 0.5, armFwd, armLift, ground);
      this.updateLimb(this.handR, rootPos, fwdX, fwdZ, rightX, rightZ, -0.5, armFwd, armLift, ground);

      // Legs
      const legLift = phase < 0.5 ? Math.sin(phase * Math.PI * 2.0) * stepHeight : 0;
      const legFwd = phase >= 0.6 ? 0.3 : -0.3;
      this.updateLimb(this.footL, rootPos, fwdX, fwdZ, rightX, rightZ, 0.35, -0.6 + legFwd, legLift, ground);
      this.updateLimb(this.footR, rootPos, fwdX, fwdZ, rightX, rightZ, -0.35, -0.6 + legFwd, legLift, ground);

      // Check plants
      const armPlanted = armLift < 0.04;
      if (armPlanted && !this.wasPlantedHL && onPlant) {
        onPlant(this.handL.pos, 0.9);
        onPlant(this.handR.pos, 0.9);
      }
      this.wasPlantedHL = armPlanted;
      this.wasPlantedHR = armPlanted;

      const legPlanted = legLift < 0.04;
      if (legPlanted && !this.wasPlantedFL && onPlant) {
        onPlant(this.footL.pos, 0.85);
        onPlant(this.footR.pos, 0.85);
      }
      this.wasPlantedFL = legPlanted;
      this.wasPlantedFR = legPlanted;
    } else {
      // Stalk: diagonal knuckle-walk gait (HandL & FootR in phase, HandR & FootL opposite)
      const phaseL = (this.cycleTime / (Math.PI * 2)) % 1.0;
      const phaseR = ((this.cycleTime + Math.PI) / (Math.PI * 2)) % 1.0;

      const liftHL = phaseL > 0.5 ? Math.sin((phaseL - 0.5) * Math.PI * 2) * stepHeight : 0;
      const fwdHL = Math.cos(phaseL * Math.PI * 2) * 0.45;
      this.updateLimb(this.handL, rootPos, fwdX, fwdZ, rightX, rightZ, 0.55, 0.3 + fwdHL, liftHL, ground);

      const liftHR = phaseR > 0.5 ? Math.sin((phaseR - 0.5) * Math.PI * 2) * stepHeight : 0;
      const fwdHR = Math.cos(phaseR * Math.PI * 2) * 0.45;
      this.updateLimb(this.handR, rootPos, fwdX, fwdZ, rightX, rightZ, -0.55, 0.3 + fwdHR, liftHR, ground);

      const liftFL = phaseR > 0.5 ? Math.sin((phaseR - 0.5) * Math.PI * 2) * stepHeight : 0;
      const fwdFL = Math.cos(phaseR * Math.PI * 2) * 0.35;
      this.updateLimb(this.footL, rootPos, fwdX, fwdZ, rightX, rightZ, 0.35, -0.5 + fwdFL, liftFL, ground);

      const liftFR = phaseL > 0.5 ? Math.sin((phaseL - 0.5) * Math.PI * 2) * stepHeight : 0;
      const fwdFR = Math.cos(phaseL * Math.PI * 2) * 0.35;
      this.updateLimb(this.footR, rootPos, fwdX, fwdZ, rightX, rightZ, -0.35, -0.5 + fwdFR, liftFR, ground);

      if (liftHL < 0.03 && !this.wasPlantedHL && onPlant) onPlant(this.handL.pos, 0.5);
      if (liftHR < 0.03 && !this.wasPlantedHR && onPlant) onPlant(this.handR.pos, 0.5);
      if (liftFL < 0.03 && !this.wasPlantedFL && onPlant) onPlant(this.footL.pos, 0.45);
      if (liftFR < 0.03 && !this.wasPlantedFR && onPlant) onPlant(this.footR.pos, 0.45);

      this.wasPlantedHL = liftHL < 0.03;
      this.wasPlantedHR = liftHR < 0.03;
      this.wasPlantedFL = liftFL < 0.03;
      this.wasPlantedFR = liftFR < 0.03;
    }
  }

  private updateLimb(
    limb: LimbTarget,
    rootPos: Vector3,
    fwdX: number,
    fwdZ: number,
    rightX: number,
    rightZ: number,
    offsetRight: number,
    offsetFwd: number,
    lift: number,
    ground: GroundGrid,
  ): void {
    const wx = rootPos.x + rightX * offsetRight + fwdX * offsetFwd;
    const wz = rootPos.z + rightZ * offsetRight + fwdZ * offsetFwd;
    const floorH = ground.heightAt(wx, wz);
    const safeH = Number.isFinite(floorH) ? floorH : rootPos.y;

    limb.pos.set(wx, safeH + lift, wz);
    limb.isPlanted = lift < 0.03;
  }
}
