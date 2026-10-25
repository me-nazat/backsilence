/* ── monster-guardrails.test.ts ─────────────────────────────────────────────
 *  Phase G Guardrail Unit Tests:
 *  - Verifies MonsterWatchdog anomaly detection and seamless runtime recovery:
 *    1. Sim-level NaN values (speedMul, pos) -> resets to finite values
 *    2. Empty LOD / cleared children -> reloads procedural skin hierarchy
 *    3. Thrown update exception -> preserves frame loop, recovers via watchdog
 *    4. HTML 200 / corrupt model -> immediately falls back to ProceduralSkin
 *    5. Root visibility loss within view cone -> watchdog restores visibility after 3s
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { MonsterWatchdog } from '../src/game/monster/MonsterWatchdog.js';
import { MonsterManager } from '../src/game/monster/MonsterManager.js';
import { SimWorld } from '../src/sim/SimWorld.js';
import { validateAndFetchGlb } from '../src/game/creatures/MonsterSkin.js';

describe('Phase G: Monster Runtime Watchdog & Resilience Guardrails', () => {
  const setupTestEnv = () => {
    const camera = new PerspectiveCamera(75, 16 / 9, 0.1, 100);
    camera.position.set(0, 1.65, 0);
    camera.lookAt(0, 1.65, -10);
    camera.updateMatrixWorld(true);

    const scene = new Scene();
    const simWorld = new SimWorld({
      seed: 9999,
      bounds: { minX: -50, minZ: -50, maxX: 50, maxZ: 50 },
      playerSpawn: { x: 0, y: 0.5, z: 0 },
      waterY: 0.0,
      difficulty: 'normal',
    });

    const monsterManager = new MonsterManager();
    scene.add(monsterManager.root);

    const watchdog = new MonsterWatchdog();

    return { camera, scene, simWorld, monsterManager, watchdog };
  };

  it('1. Recovers from non-finite sim values (NaN speedMul / position)', () => {
    const { camera, scene, simWorld, monsterManager, watchdog } = setupTestEnv();

    simWorld.addMonster({
      id: 'nan_test_monster',
      variant: 'standard',
      spawn: { x: 0, y: 0, z: -10 },
      spawnGrace: 0,
    }, 12345);

    monsterManager.addMonster({
      id: 'nan_test_monster',
      variant: 'standard',
      spawn: { x: 0, y: 0, z: -10 },
    });

    const m = simWorld.monsters[0]!;
    (m as { speedMul: number }).speedMul = NaN;
    m.pos.x = NaN;

    watchdog.update(0.1, camera, simWorld, monsterManager, scene, 0.025);

    expect(Number.isFinite(m.speedMul)).toBe(true);
    expect(Number.isFinite(m.pos.x)).toBe(true);
    expect(m.speedMul).toBe(1.0);

    const incidents = watchdog.getIncidents();
    expect(incidents.length).toBeGreaterThan(0);
    expect(incidents[0]!.anomaly).toBe('non_finite_sim_values');
  });

  it('2. Recovers from emptied mesh hierarchy (empty LOD) after 3s', () => {
    const { camera, scene, simWorld, monsterManager, watchdog } = setupTestEnv();

    simWorld.addMonster({
      id: 'empty_lod_monster',
      variant: 'standard',
      spawn: { x: 0, y: 0, z: -12 },
      spawnGrace: 0,
    }, 12345);

    const body = monsterManager.addMonster({
      id: 'empty_lod_monster',
      variant: 'standard',
      spawn: { x: 0, y: 0, z: -12 },
    });

    expect(body.mesh.root.children.length).toBeGreaterThan(0);

    // Artificially empty the mesh children (simulate corrupted/emptied LOD)
    while (body.mesh.root.children.length > 0) {
      body.mesh.root.remove(body.mesh.root.children[0]!);
    }
    expect(body.mesh.root.children.length).toBe(0);

    // Step 2.5s: within threshold, no recovery yet
    watchdog.update(2.5, camera, simWorld, monsterManager, scene, 0.025);
    expect(body.mesh.root.children.length).toBe(0);

    // Step another 0.6s (total 3.1s >= 3.0s): watchdog triggers reloadProceduralSkin
    watchdog.update(0.6, camera, simWorld, monsterManager, scene, 0.025);

    expect(body.mesh.root.children.length).toBeGreaterThan(0);
    const incidents = watchdog.getIncidents();
    expect(incidents.some((inc) => inc.anomaly === 'empty_mesh_hierarchy')).toBe(true);
    expect(watchdog.getRecentSummary()).toContain('reloaded_procedural_skin');
  });

  it('3. Recovers from thrown update exception without crashing the frame loop', () => {
    const { camera, scene, simWorld, monsterManager, watchdog } = setupTestEnv();

    simWorld.addMonster({
      id: 'exception_monster',
      variant: 'standard',
      spawn: { x: 0, y: 0, z: -14 },
      spawnGrace: 0,
    }, 12345);

    const body = monsterManager.addMonster({
      id: 'exception_monster',
      variant: 'standard',
      spawn: { x: 0, y: 0, z: -14 },
    });

    // Mock internal method to throw an unhandled exception
    const originalInternal = (body as unknown as { updateInternal: () => void }).updateInternal;
    (body as unknown as { updateInternal: () => void }).updateInternal = () => {
      throw new Error('Simulated WebGL buffer corruption in IK solver');
    };

    // Body update must not throw
    expect(() => {
      body.update(0.016, simWorld.monsters[0]!.getSnapshot(), simWorld.ground, camera);
    }).not.toThrow();

    expect(body.updateErrorCount).toBe(1);
    expect(body.lastUpdateError).toContain('Simulated WebGL buffer corruption');

    // Restore method
    (body as unknown as { updateInternal: typeof originalInternal }).updateInternal = originalInternal;

    // Step watchdog for 3.1s to trigger recovery
    watchdog.update(3.1, camera, simWorld, monsterManager, scene, 0.025);

    expect(body.updateErrorCount).toBe(0);
    const incidents = watchdog.getIncidents();
    expect(incidents.some((inc) => inc.anomaly.includes('update_exception'))).toBe(true);
  });

  it('4. Rejects HTML 200 responses for GLB models and falls back cleanly', async () => {
    const mockHtmlResponse = new Response('<!DOCTYPE html><html><body>Spa fallback</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockHtmlResponse));

    const result = await validateAndFetchGlb('/models/monsters/thumper.glb');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Content-Type');

    vi.unstubAllGlobals();
  });

  it('5. Restores monster root visibility within 45m view cone after 3s', () => {
    const { camera, scene, simWorld, monsterManager, watchdog } = setupTestEnv();

    simWorld.addMonster({
      id: 'invisible_monster',
      variant: 'standard',
      spawn: { x: 0, y: 0, z: -15 },
      spawnGrace: 0,
    }, 12345);

    const body = monsterManager.addMonster({
      id: 'invisible_monster',
      variant: 'standard',
      spawn: { x: 0, y: 0, z: -15 },
    });

    // Force invisible
    body.mesh.root.visible = false;

    // 2.0s: still invisible
    watchdog.update(2.0, camera, simWorld, monsterManager, scene, 0.025);
    expect(body.mesh.root.visible).toBe(false);

    // 1.5s more (total 3.5s >= 3.0s): watchdog restores visibility
    watchdog.update(1.5, camera, simWorld, monsterManager, scene, 0.025);
    expect(body.mesh.root.visible).toBe(true);

    const incidents = watchdog.getIncidents();
    expect(incidents.some((inc) => inc.anomaly === 'root_invisible_in_sight_cone')).toBe(true);
  });
});
