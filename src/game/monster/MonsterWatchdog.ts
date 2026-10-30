/* ── MonsterWatchdog.ts ─────────────────────────────────────────────────────
 *  Runtime guardrail monitoring monster presentation & simulation integrity.
 *  Active in both debug and production.
 *
 *  Rule: If monster is within 45m, inside camera frustum, with fog transmittance >= 0.05,
 *  and root or skin reports invisible/empty/non-finite for >= 3s:
 *  - Reset visibility
 *  - Reload procedural skin fallback
 *  - Clear update error counters
 *  - Log to local incident ring buffer
 *  - Keep the experience completely seamless for the player.
 * ──────────────────────────────────────────────────────────────────────── */

import { Frustum, Matrix4, Vector3, type Camera, type Scene } from 'three';
import type { SimWorld } from '../../sim/SimWorld.js';
import type { MonsterManager } from './MonsterManager.js';

export interface WatchdogIncident {
  readonly id: string;
  readonly timestamp: number;
  readonly monsterId: string;
  readonly anomaly: string;
  readonly distance: number;
  readonly fogTransmittance: number;
  readonly inFrustum: boolean;
  readonly recovered: boolean;
  readonly recoveryAction: string;
}

const _mPos = new Vector3();
const _camPos = new Vector3();
const _frustumMat = new Matrix4();
const _frustum = new Frustum();

export class MonsterWatchdog {
  private readonly anomalyTimers = new Map<string, number>();
  private readonly incidents: WatchdogIncident[] = [];
  private readonly maxIncidents = 32;

  /**
   * Main per-frame update loop.
   */
  update(
    dt: number,
    camera: Camera,
    simWorld: SimWorld,
    monsterManager: MonsterManager,
    _scene: Scene,
    fogDensity = 0.045,
  ): void {
    if (!simWorld?.monsters || !monsterManager) return;

    camera.updateMatrixWorld(true);
    _frustumMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_frustumMat);
    _camPos.copy(camera.position);

    const activeIds = new Set<string>();

    for (const m of simWorld.monsters) {
      activeIds.add(m.id);
      const body = monsterManager.getBody(m.id);

      // Check sim position finiteness
      const simFinite =
        Number.isFinite(m.pos.x) &&
        Number.isFinite(m.pos.y) &&
        Number.isFinite(m.pos.z) &&
        Number.isFinite(m.yaw) &&
        Number.isFinite(m.speedMul);

      if (!simFinite) {
        // Immediate sim-level recovery
        m.pos.x = 0;
        m.pos.y = simWorld.waterY ?? 0;
        m.pos.z = 0;
        m.vel.x = 0;
        m.vel.y = 0;
        m.vel.z = 0;
        m.yaw = 0;
        if (!Number.isFinite(m.speedMul)) {
          (m as { speedMul: number }).speedMul = 1.0;
        }
        this.recordIncident(m.id, 'non_finite_sim_values', 0, 1.0, true, 'reset_sim_finite_values');
      }

      _mPos.set(m.pos.x, m.pos.y, m.pos.z);
      const dist = _camPos.distanceTo(_mPos);

      // Rule bounds: monster within 45m
      if (dist > 45.0) {
        this.anomalyTimers.set(m.id, 0);
        continue;
      }

      // Fog transmittance rule: exp(-(density * dist)^2) >= 0.05
      const density = fogDensity > 0 ? fogDensity : 0.045;
      const fogTransmittance = Math.exp(-Math.pow(density * dist, 2));
      if (fogTransmittance < 0.05) {
        this.anomalyTimers.set(m.id, 0);
        continue;
      }

      // Frustum check
      const inFrustum = _frustum.containsPoint(_mPos);
      if (!inFrustum) {
        this.anomalyTimers.set(m.id, 0);
        continue;
      }

      // Check for presentation anomalies
      let anomaly: string | null = null;
      if (!body) {
        anomaly = 'missing_presentation_body';
      } else {
        const root = body.mesh?.root;
        if (!root) {
          anomaly = 'missing_mesh_root';
        } else if (!root.visible) {
          anomaly = 'root_invisible_in_sight_cone';
        } else if (root.children.length === 0) {
          anomaly = 'empty_mesh_hierarchy';
        } else if (
          root.scale.x <= 0.001 ||
          !Number.isFinite(root.position.x) ||
          !Number.isFinite(root.position.y) ||
          !Number.isFinite(root.position.z)
        ) {
          anomaly = 'non_finite_or_zero_scale';
        } else if (body.skinError !== null) {
          anomaly = `skin_load_error: ${body.skinError}`;
        } else if (body.updateErrorCount > 0) {
          anomaly = `update_exception_count_${body.updateErrorCount}`;
        }
      }

      if (anomaly) {
        const currentTimer = (this.anomalyTimers.get(m.id) ?? 0) + dt;
        this.anomalyTimers.set(m.id, currentTimer);

        // If anomaly persists for >= 3.0s: execute seamless recovery
        if (currentTimer >= 3.0) {
          this.executeRecovery(m.id, anomaly, dist, fogTransmittance, body, monsterManager);
          this.anomalyTimers.set(m.id, 0);
        }
      } else {
        // Healthy state: decay anomaly timer
        const currentTimer = this.anomalyTimers.get(m.id) ?? 0;
        if (currentTimer > 0) {
          this.anomalyTimers.set(m.id, Math.max(0, currentTimer - dt * 2.0));
        }
      }
    }

    // Clean up dead monster timers
    for (const id of this.anomalyTimers.keys()) {
      if (!activeIds.has(id)) {
        this.anomalyTimers.delete(id);
      }
    }
  }

  /**
   * Performs seamless recovery without player interruption.
   */
  private executeRecovery(
    monsterId: string,
    anomaly: string,
    dist: number,
    fogTrans: number,
    body: (ReturnType<MonsterManager['getBody']>) | undefined,
    monsterManager: MonsterManager,
  ): void {
    let action = 'unknown';

    if (!body) {
      // Re-create body if missing
      monsterManager.addMonster({
        id: monsterId,
        variant: 'standard',
        spawn: { x: _mPos.x, y: _mPos.y, z: _mPos.z },
      });
      action = 'recreated_missing_body';
    } else {
      // Restore visibility
      if (body.mesh?.root) {
        body.mesh.root.visible = true;
        body.mesh.root.scale.set(body.scale, body.scale, body.scale);
      }

      // Reload procedural skin to repair empty LOD or broken geometry
      body.reloadProceduralSkin();
      const parent = body.mesh?.root?.parent;
      if (!parent && body.mesh?.root) {
        monsterManager.root.add(body.mesh.root);
        action += '+reattached_to_scene';
      }
      action = 'reloaded_procedural_skin_and_reset_visibility' + (!parent ? '+reattached_to_scene' : '');
    }

    this.recordIncident(monsterId, anomaly, dist, fogTrans, true, action);
    console.warn(`[MonsterWatchdog] Seamless recovery executed for ${monsterId} (${anomaly} -> ${action})`);
  }

  private recordIncident(
    monsterId: string,
    anomaly: string,
    distance: number,
    fogTransmittance: number,
    recovered: boolean,
    recoveryAction: string,
  ): void {
    const incident: WatchdogIncident = {
      id: `incident_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      monsterId,
      anomaly,
      distance: Number(distance.toFixed(2)),
      fogTransmittance: Number(fogTransmittance.toFixed(4)),
      inFrustum: true,
      recovered,
      recoveryAction,
    };

    this.incidents.push(incident);
    if (this.incidents.length > this.maxIncidents) {
      this.incidents.shift();
    }
  }

  getIncidents(): readonly WatchdogIncident[] {
    return this.incidents;
  }

  getRecentSummary(): string {
    if (this.incidents.length === 0) return 'OK (0 incidents)';
    const last = this.incidents[this.incidents.length - 1]!;
    return `Watchdog Incidents: ${this.incidents.length} | Last: ${last.monsterId} (${last.anomaly}) -> ${last.recoveryAction}`;
  }

  clear(): void {
    this.incidents.length = 0;
    this.anomalyTimers.clear();
  }
}
