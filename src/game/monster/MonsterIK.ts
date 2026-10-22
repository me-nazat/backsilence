/* ── MonsterIK.ts ──────────────────────────────────────────────────────────
 *  Two-bone analytic inverse kinematics solver based on the law of cosines.
 *  Zero per-frame allocations for monster arm and leg limb placement.
 * ──────────────────────────────────────────────────────────────────────── */

import { Vector3 } from 'three';

const _line = new Vector3();
const _proj = new Vector3();
const _perp = new Vector3();

/**
 * Solve a 2-bone chain (e.g. shoulder -> elbow -> hand or hip -> knee -> foot).
 * Writes elbow/knee position into outMid.
 */
export function solveTwoBone(
  root: Vector3,
  target: Vector3,
  poleDir: Vector3,
  len1: number,
  len2: number,
  outMid: Vector3,
): boolean {
    _line.subVectors(target, root);
    const d = _line.length();

    // Prevent zero division or singularity
    if (d < 1e-4) {
      outMid.copy(root).addScaledVector(poleDir, len1);
      return false;
    }

    const maxReach = (len1 + len2) * 0.9999;
    const minReach = Math.abs(len1 - len2) * 1.0001;
    const clampedD = Math.max(minReach, Math.min(maxReach, d));

    // Law of cosines: angle at root
    const cosAngle = (len1 * len1 + clampedD * clampedD - len2 * len2) / (2.0 * len1 * clampedD);
    const safeCos = Math.max(-1.0, Math.min(1.0, cosAngle));
    const angle = Math.acos(safeCos);

    _line.normalize();

    // Orthogonalize pole vector relative to root->target line
    const dot = poleDir.dot(_line);
    _proj.copy(_line).multiplyScalar(dot);
    _perp.subVectors(poleDir, _proj);

    if (_perp.lengthSq() < 1e-4) {
      // Degenerate pole vector, choose an arbitrary perpendicular
      if (Math.abs(_line.y) < 0.9) {
        _perp.set(0, 1, 0).cross(_line);
      } else {
        _perp.set(1, 0, 0).cross(_line);
      }
    }
    _perp.normalize();

    // Rotate line vector by angle around perpendicular plane
    const forwardDist = len1 * Math.cos(angle);
    const lateralDist = len1 * Math.sin(angle);

    outMid.copy(root)
      .addScaledVector(_line, forwardDist)
      .addScaledVector(_perp, lateralDist);

    return true;
}

export const MonsterIKSolver = {
  solveTwoBone,
} as const;
