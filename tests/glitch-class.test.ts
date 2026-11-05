/* ── glitch-class.test.ts ───────────────────────────────────────────────────
 *  Prompt 9 Phase D: Glitch-Class Regression Unit Suite
 *  Verifies architectural fixes and invariants against the historical defect census:
 *  - 44503aa: Menu lock during loading prevents deadlock
 *  - 080e262: Pointer lock requests honored ONLY in RUNNING state
 *  - 6785222: Input dispatch suppressed when state is not RUNNING (neutral intent)
 *  - 10b3962: SPA history navigation restricted to safe states
 *  - G9: Spawn separation >= 15m and nearest walkable repair
 *  - G7: Camera near plane strictly 0.05m
 *  - DisposalService: Deep Three.js hierarchy teardown, timer/listener tracking
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { SessionStateMachine } from '../src/game/session/SessionStateMachine.js';
import { DisposalService } from '../src/game/session/DisposalService.js';
import { SpawnService } from '../src/game/session/SpawnService.js';
import { CameraRig } from '../src/game/session/CameraRig.js';
import { defaultSettings } from '../src/app/Settings.js';
import {
  Mesh,
  BoxGeometry,
  MeshBasicMaterial,
  Group,
  PerspectiveCamera,
} from 'three';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { NavGrid } from '../src/sim/NavGrid.js';
import type { LayoutData } from '../src/world/MapTypes.js';

describe('Prompt 9 Glitch-Class Regression Suite', () => {
  describe('SessionStateMachine Invariant Enforcement', () => {
    it('enforces 44503aa: menu lock prevents deadlock during LOADING & DISPOSING', () => {
      const sm = new SessionStateMachine('LOADING');
      expect(sm.canOpenMenu()).toBe(false);

      sm.transition('RUNNING', 'load_complete');
      expect(sm.canOpenMenu()).toBe(true);

      sm.transition('DISPOSING', 'exit_clicked');
      expect(sm.canOpenMenu()).toBe(false);
    });

    it('enforces 080e262: pointer lock acquire permitted exclusively in RUNNING', () => {
      const sm = new SessionStateMachine('IDLE');
      expect(sm.canRequestPointerLock()).toBe(false);

      sm.transition('LOADING', 'start');
      expect(sm.canRequestPointerLock()).toBe(false);

      sm.transition('RUNNING', 'ready');
      expect(sm.canRequestPointerLock()).toBe(true);

      sm.transition('PAUSED', 'esc_press');
      expect(sm.canRequestPointerLock()).toBe(false);

      sm.transition('RUNNING', 'resume');
      expect(sm.canRequestPointerLock()).toBe(true);

      sm.transition('DEAD', 'monster_kill');
      expect(sm.canRequestPointerLock()).toBe(false);
    });

    it('enforces 6785222: input dispatch suppressed unless state is RUNNING', () => {
      const sm = new SessionStateMachine('IDLE');
      expect(sm.canDispatchInput()).toBe(false);

      sm.transition('LOADING', 'start');
      expect(sm.canDispatchInput()).toBe(false);

      sm.transition('RUNNING', 'ready');
      expect(sm.canDispatchInput()).toBe(true);

      sm.transition('PAUSED', 'pause');
      expect(sm.canDispatchInput()).toBe(false);
    });

    it('enforces 10b3962: SPA history navigation allowed only in safe states', () => {
      const sm = new SessionStateMachine('RUNNING');
      expect(sm.canNavigateHistory()).toBe(false);

      sm.transition('PAUSED', 'pause');
      expect(sm.canNavigateHistory()).toBe(true);

      sm.transition('RUNNING', 'resume');
      expect(sm.canNavigateHistory()).toBe(false);

      sm.transition('DISPOSING', 'exit');
      expect(sm.canNavigateHistory()).toBe(false);

      sm.transition('DISPOSED', 'done');
      expect(sm.canNavigateHistory()).toBe(true);
    });

    it('records state transitions in transition log', () => {
      const sm = new SessionStateMachine('IDLE');
      sm.transition('LOADING', 'test_start');
      sm.transition('RUNNING', 'test_ready');

      const log = sm.getTransitionLog();
      // includes initial state entry + 2 transitions
      expect(log.length).toBe(3);
      expect(log[0]!.to).toBe('IDLE');
      expect(log[1]!.from).toBe('IDLE');
      expect(log[1]!.to).toBe('LOADING');
      expect(log[1]!.reason).toBe('test_start');
      expect(log[2]!.from).toBe('LOADING');
      expect(log[2]!.to).toBe('RUNNING');
    });
  });

  describe('DisposalService Leak Prevention & Deep Teardown', () => {
    it('disposes Three.js mesh hierarchy, geometry, and materials cleanly', () => {
      const disposal = new DisposalService();
      const group = new Group();
      const geo = new BoxGeometry(1, 1, 1);
      const mat = new MeshBasicMaterial({ color: 0xff0000 });
      let geoDisposed = false;
      let matDisposed = false;
      geo.dispose = () => { geoDisposed = true; };
      mat.dispose = () => { matDisposed = true; };

      const mesh = new Mesh(geo, mat);
      group.add(mesh);

      disposal.disposeThreeHierarchy(group, 'test_mesh');
      expect(geoDisposed).toBe(true);
      expect(matDisposed).toBe(true);
      expect(disposal.getAllocationAudit().some((a) => a.kind === 'three_object')).toBe(true);
    });

    it('cancels tracked timers and animation frames on disposeAll', () => {
      const disposal = new DisposalService();
      let timeoutRan = false;
      disposal.setTimeout(() => { timeoutRan = true; }, 1000, 'test_timeout');
      expect(disposal.activeTimerCount).toBe(1);

      disposal.disposeAll('unit_test');
      expect(disposal.activeTimerCount).toBe(0);
      expect(timeoutRan).toBe(false);
    });

    it('removes tracked event listeners on disposeAll', () => {
      const disposal = new DisposalService();
      let eventCount = 0;
      const handler = () => { eventCount++; };
      const emitter = new EventTarget();

      disposal.trackEventListener(emitter, 'test_event', handler, false, 'test_owner');
      expect(disposal.activeListenerCount).toBe(1);

      emitter.dispatchEvent(new Event('test_event'));
      expect(eventCount).toBe(1);

      disposal.disposeAll('test_teardown');
      expect(disposal.activeListenerCount).toBe(0);

      emitter.dispatchEvent(new Event('test_event'));
      expect(eventCount).toBe(1); // handler removed, count unchanged
    });

    it('removes tracked DOM elements cleanly', () => {
      const disposal = new DisposalService();
      let removed = false;
      const mockElement = {
        parentNode: {},
        remove: () => { removed = true; },
      } as unknown as HTMLElement;

      disposal.trackDomElement(mockElement, 'test_overlay');

      disposal.disposeAll('cleanup');
      expect(removed).toBe(true);
    });
  });

  describe('SpawnService G9 Law & Repair', () => {
    it('enforces G9: player and monster spawns maintain >= 15m minimum distance', () => {
      const spawnService = new SpawnService();
      const layout: LayoutData = {
        mapId: 'natatorium',
        seed: 42,
        bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
        platforms: [],
        walls: [],
        pillars: [],
        stairs: [],
        waterBodies: [],
        props: [],
        puzzles: [],
        spawns: {
          player: [{ x: 0, y: 0.3, z: 0 }],
          monsters: [
            {
              id: 'beast_0',
              variant: 'standard',
              spawn: { x: 0, y: 0.3, z: 20 }, // 20m away
              sleeperSpawn: { x: 0, y: 0.3, z: 20 },
            },
          ],
        },
        exit: { id: 'exit', position: { x: 0, y: 0.3, z: -18 } },
        meta: {},
      };

      const ground = new GroundGrid({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, 1.0);
      const nav = new NavGrid(ground, 0.1, 1.0);
      for (let i = 0; i < nav.walkable.length; i++) nav.walkable[i] = 1;

      const report = spawnService.resolveMonsterSpawns(layout.spawns.monsters, nav, 'normal', layout.spawns.player[0]!);
      expect(report.length).toBe(1);
      const m0 = report[0]!;
      const dist = Math.hypot(m0.resolvedSpawn.x - layout.spawns.player[0]!.x, m0.resolvedSpawn.z - layout.spawns.player[0]!.z);
      expect(dist).toBeGreaterThanOrEqual(15.0);
    });

    it('repairs non-walkable monster spawn to nearest walkable cell', () => {
      const spawnService = new SpawnService();
      const layout: LayoutData = {
        mapId: 'natatorium',
        seed: 42,
        bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
        platforms: [],
        walls: [],
        pillars: [],
        stairs: [],
        waterBodies: [],
        props: [],
        puzzles: [],
        spawns: {
          player: [{ x: 0, y: 0.3, z: -8 }],
          monsters: [
            {
              id: 'beast_0',
              variant: 'standard',
              spawn: { x: 5, y: 0.3, z: 5 }, // cell will be non-walkable
              sleeperSpawn: { x: 5, y: 0.3, z: 5 },
            },
          ],
        },
        exit: { id: 'exit', position: { x: 0, y: 0.3, z: -8 } },
        meta: {},
      };

      const ground = new GroundGrid({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, 1.0);
      const nav = new NavGrid(ground, 0.1, 1.0);
      for (let i = 0; i < nav.walkable.length; i++) nav.walkable[i] = 0; // all blocked
      // Make cell (3, 5) walkable
      const walkableGrid = nav.worldToGrid(3, 5);
      nav.walkable[walkableGrid.gz * nav.width + walkableGrid.gx] = 1;

      const report = spawnService.resolveMonsterSpawns(layout.spawns.monsters, nav, 'normal', layout.spawns.player[0]!);
      expect(report[0]!.wasRepaired).toBe(true);
      expect(report[0]!.resolvedSpawn.x).toBeCloseTo(3.5, 1);
      expect(report[0]!.resolvedSpawn.z).toBeCloseTo(5.5, 1);
    });
  });

  describe('CameraRig G7 Law & Near Plane Invariant', () => {
    it('enforces G7: near plane is strictly 0.05m to prevent viewport clipping', () => {
      const settings = defaultSettings();
      const cameraRig = new CameraRig(settings, 75, 16 / 9);

      expect(cameraRig.camera).toBeInstanceOf(PerspectiveCamera);
      expect(cameraRig.camera.near).toBe(0.05);
      expect(cameraRig.camera.far).toBe(200.0);
    });

    it('updates aspect ratio and projection matrix correctly', () => {
      const settings = defaultSettings();
      const cameraRig = new CameraRig(settings, 75, 16 / 9);

      cameraRig.updateAspect(900, 1600);
      expect(cameraRig.camera.aspect).toBeCloseTo(900 / 1600, 0.001);
    });
  });
});
