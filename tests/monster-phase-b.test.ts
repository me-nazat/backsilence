/* ── monster-phase-b.test.ts ───────────────────────────────────────────────
 *  Phase B Regression and Hardening Test Suite:
 *  - GLB loader hardening (HTML 200, corrupt magic, binary verification, timeout)
 *  - Sim-to-presentation finite assertions (NaN recovery, last good reset)
 *  - Water depth shoulder clearance (>= 0.35m shoulder clearance on deep pools)
 *  - Fog visibility culling rules (never culled within 60m, transmittance < 0.01)
 *  - NavGrid water component coverage validator
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { validateAndFetchGlb } from '../src/game/creatures/MonsterSkin.js';
import { MonsterBody } from '../src/game/monster/MonsterBody.js';
import { GroundGrid } from '../src/sim/GroundGrid.js';
import { NavGrid } from '../src/sim/NavGrid.js';
import { validateMonsterWaterCoverage } from '../src/world/validate/LayoutValidator.js';
import type { MonsterSnapshot } from '../src/sim/MonsterBrain.js';

describe('Phase B: Monster Loader & Presentation Hardening', () => {
  describe('1. Loader Hardening (validateAndFetchGlb)', () => {
    it('rejects HTTP 200 with HTML Content-Type (Vite unknown path fallback)', async () => {
      const htmlBody = '<!DOCTYPE html><html><body>SPA fallback</body></html>';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'content-type': 'text/html; charset=utf-8',
        }),
        arrayBuffer: async () => new TextEncoder().encode(htmlBody).buffer,
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await validateAndFetchGlb('models/thumper.glb');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Content-Type');

      vi.unstubAllGlobals();
    });

    it('rejects corrupt binary payload with invalid glTF magic bytes', async () => {
      // 16 bytes of random junk (not 0x46546C67)
      const junk = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04]);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'content-type': 'model/gltf-binary',
        }),
        arrayBuffer: async () => junk.buffer,
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await validateAndFetchGlb('models/thumper.glb');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('magic bytes');

      vi.unstubAllGlobals();
    });

    it('accepts valid binary payload with glTF magic bytes (0x46546C67)', async () => {
      // Header: 0x46546C67 ('glTF'), version 2, length 24
      const validGlb = new Uint8Array([
        0x67, 0x6c, 0x54, 0x46, // 'glTF' in ASCII (little-endian uint32: 0x46546C67)
        0x02, 0x00, 0x00, 0x00, // version 2
        0x18, 0x00, 0x00, 0x00, // length 24
        0x00, 0x00, 0x00, 0x00,
      ]);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'content-type': 'model/gltf-binary',
        }),
        arrayBuffer: async () => validGlb.buffer,
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await validateAndFetchGlb('models/thumper.glb');
      expect(result.ok).toBe(true);
      expect(result.buffer).toBeDefined();

      vi.unstubAllGlobals();
    });
  });

  describe('2. Sim-to-Presentation Finite Assertion Checks', () => {
    it('recovers gracefully from NaN position and resets to last good finite position', () => {
      const body = new MonsterBody('test_nan_monster');
      const ground = new GroundGrid({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 });
      const camera = new PerspectiveCamera(60, 1, 0.1, 100);

      const snapshot: MonsterSnapshot = {
        id: 'test_nan_monster',
        pos: { x: 5.0, y: -0.9, z: 10.0 },
        vel: { x: 0, y: 0, z: 0 },
        yaw: 1.2,
        state: 'WANDER',
        agitation: 0,
        jawOpenT: 0,
        rearingT: 0,
        swipeT: 0,
        earAngle: 1.2,
        isListening: false,
        targetPos: null,
        path: [],
      };

      // 1. Initial valid update establishes last good position
      body.update(0.016, snapshot, ground, camera);
      expect(body.mesh.root.position.x).toBe(5.0);
      expect(body.nonFiniteDetected).toBe(false);

      // 2. Corrupted snapshot with NaN
      const corruptedSnapshot: MonsterSnapshot = {
        ...snapshot,
        pos: { x: NaN, y: -0.9, z: 10.0 },
      };

      body.update(0.016, corruptedSnapshot, ground, camera);
      expect(body.nonFiniteDetected).toBe(true);
      expect(body.nonFiniteCount).toBe(1);
      // Position must have been recovered to last known good finite position
      expect(Number.isFinite(body.mesh.root.position.x)).toBe(true);
      expect(body.mesh.root.position.x).toBe(5.0);
    });
  });

  describe('3. Depth Placement & Shoulder Clearance', () => {
    it('raises root y on deep pools so shoulders clear water surface by at least 0.35m', () => {
      const body = new MonsterBody('test_deep_pool_monster');
      // Create ground grid with a deep trench (-2.5m)
      const ground = new GroundGrid({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, 1.0);
      ground.fill(-2.5);
      const camera = new PerspectiveCamera(60, 1, 0.1, 100);

      const snapshot: MonsterSnapshot = {
        id: 'test_deep_pool_monster',
        pos: { x: 0, y: -2.5, z: 0 },
        vel: { x: 0, y: 0, z: 0 },
        yaw: 0,
        state: 'WANDER',
        agitation: 0,
        jawOpenT: 0,
        rearingT: 0,
        swipeT: 0,
        earAngle: 0,
        isListening: false,
        targetPos: null,
        path: [],
      };

      body.update(0.016, snapshot, ground, camera);

      // Hunched shoulder height is 1.4m. At water level 0.0, shoulder must be >= +0.35m.
      // Therefore root y must be >= -1.05m.
      const rootY = body.mesh.root.position.y;
      const shoulderY = rootY + 1.40;
      expect(shoulderY).toBeGreaterThanOrEqual(0.35);
      expect(rootY).toBeGreaterThanOrEqual(-1.05);
    });
  });

  describe('4. Distance Fog Visibility Rule', () => {
    it('never hides creature within 60m even in dense fog', () => {
      const body = new MonsterBody('test_fog_monster');
      body.fogDensity = 0.08; // Very dense fog
      const ground = new GroundGrid({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });
      ground.fill(-0.9);
      const camera = new PerspectiveCamera(60, 1, 0.1, 200);
      camera.position.set(0, 1.6, 0);

      // Monster placed 45m away (within 60m)
      const snapshot: MonsterSnapshot = {
        id: 'test_fog_monster',
        pos: { x: 0, y: -0.9, z: -45.0 },
        vel: { x: 0, y: 0, z: 0 },
        yaw: 0,
        state: 'WANDER',
        agitation: 0,
        jawOpenT: 0,
        rearingT: 0,
        swipeT: 0,
        earAngle: 0,
        isListening: false,
        targetPos: null,
        path: [],
      };

      body.update(0.016, snapshot, ground, camera);
      expect(body.mesh.root.visible).toBe(true);

      // When moved to 75m where transmittance is < 0.01, it is allowed to cull
      snapshot.pos.z = -75.0;
      body.update(0.016, snapshot, ground, camera);
      expect(body.mesh.root.visible).toBe(false);
    });
  });

  describe('5. NavGrid Monster Water Component Validator', () => {
    it('validates water coverage ratio meets 40% threshold', () => {
      const ground = new GroundGrid({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, 1.0);
      ground.fill(-0.9);
      const nav = new NavGrid(ground, 0.0, 0.5);

      const result = validateMonsterWaterCoverage(nav, 0.40);
      expect(result.valid).toBe(true);
      expect(result.coverage).toBeGreaterThanOrEqual(0.40);
    });
  });
});
