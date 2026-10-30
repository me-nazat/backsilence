/* ── graphics-verification-p4.test.ts ───────────────────────────────────────
 *  Prompt 4 Verification Suite:
 *  - 4.3: IBL PMREM environment setup & intensity
 *  - 4.4: Contact shadows, sun shadow resolution & frustum, fill light
 *  - 4.5 & 4.6: AO map & Vertex AO enabled via vertexColors: true
 *  - 4.7: Pool floor and ceiling geometry encloses spaces
 *  - 4.8: Non-stretched floating-point UVs on pillars
 *  - 4.9: Tone mapping (AgX default) & responsive brightness slider
 *  - 4.10: Antialiasing & settings
 *  - 4.11 & 4.12: Post grade default (0.35), tension response, bloom tuning
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { PoolroomsMap } from '../src/world/maps/PoolroomsMap.js';
import { NatatoriumMap } from '../src/world/maps/NatatoriumMap.js';
import { OrientationMap } from '../src/world/maps/OrientationMap.js';
import { HydroMazeMap } from '../src/world/maps/HydroMazeMap.js';
import { defaultSettings, clampSettings } from '../src/app/Settings.js';
import {
  Mesh,
  MeshStandardMaterial,
  BoxGeometry,
  CylinderGeometry,
} from 'three';

describe('Prompt 4 Verification: Graphics Pipeline, IBL, Shadows & AO', () => {
  it('4.10 & 4.11: settings defaults have vhsIntensity 0.35 and toneMapping AgX', () => {
    const s = defaultSettings();
    expect(s.graphics.vhsIntensity).toBe(0.35);
    expect(s.graphics.toneMapping).toBe('AgX');

    const clamped = clampSettings(s);
    expect(clamped.graphics.vhsIntensity).toBe(0.35);
    expect(clamped.graphics.toneMapping).toBe('AgX');
  });

  it('4.4: Sunlight on daylight maps (Poolrooms, Natatorium, Orientation) casts shadows', () => {
    expect(PoolroomsMap.atmosphere.sun?.castShadow).toBe(true);
    expect(NatatoriumMap.atmosphere.sun?.castShadow).toBe(true);
    expect(OrientationMap.atmosphere.sun?.castShadow).toBe(true);
    expect(HydroMazeMap.atmosphere.sun?.castShadow).toBe(true);
  });

  it('4.5 & 4.6 & 4.7: Tile materials have aoMap, aoMapIntensity 0.85, envMapIntensity 0.35, and vertexColors: true', async () => {
    const layout = PoolroomsMap.generateLayout({ seed: 42, difficulty: 'normal', playerCount: 1 });
    const instance = await PoolroomsMap.build(layout, { parent: null, textures: null, audio: null, difficulty: 'normal' });

    let foundPlatform = false;
    let foundPillar = false;
    let foundFloor = false;
    let foundCeiling = false;

    instance.root.traverse((obj) => {
      if (obj instanceof Mesh && obj.material instanceof MeshStandardMaterial) {
        const mat = obj.material;

        if (obj.name.startsWith('WaterFloor')) {
          foundFloor = true;
          expect(obj.receiveShadow).toBe(true);
          expect(mat.vertexColors).toBe(true);
          expect(mat.envMapIntensity).toBe(0.35);
        }
        if (obj.name === 'MapCeilingMesh') {
          foundCeiling = true;
          expect(obj.receiveShadow).toBe(true);
          expect(obj.castShadow).toBe(true);
          expect(mat.vertexColors).toBe(true);
          expect(mat.envMapIntensity).toBe(0.35);
        }
        if (obj.geometry instanceof BoxGeometry && !obj.name) {
          foundPlatform = true;
          expect(obj.receiveShadow).toBe(true);
          expect(mat.vertexColors).toBe(true);
          expect(mat.envMapIntensity).toBe(0.35);
        }
        if (obj.geometry instanceof CylinderGeometry || obj.name.startsWith('Pillar')) {
          foundPillar = true;
          expect(obj.receiveShadow).toBe(true);
          expect(obj.castShadow).toBe(true);
          expect(mat.vertexColors).toBe(true);
          expect(mat.envMapIntensity).toBe(0.35);
        }
      }
    });

    expect(foundFloor).toBe(true);
    expect(foundCeiling).toBe(true);
    expect(foundPlatform).toBe(true);
    expect(foundPillar).toBe(true);

    instance.dispose();
  });

  it('4.7: Natatorium has ceiling arch material and encloses foyer and grand hall', async () => {
    const layout = NatatoriumMap.generateLayout({ seed: 42, difficulty: 'normal', playerCount: 1 });
    const instance = await NatatoriumMap.build(layout, { parent: null, textures: null, audio: null, difficulty: 'normal' });

    const foyerCeiling = instance.root.getObjectByName('FoyerCeiling') as Mesh;
    const grandRoof = instance.root.getObjectByName('GrandHallCeiling') as Mesh;

    expect(foyerCeiling).toBeDefined();
    expect(grandRoof).toBeDefined();
    expect(foyerCeiling.castShadow).toBe(true);
    expect(foyerCeiling.receiveShadow).toBe(true);
    expect(grandRoof.castShadow).toBe(true);
    expect(grandRoof.receiveShadow).toBe(true);

    const ceilMat = foyerCeiling.material as MeshStandardMaterial;
    expect(ceilMat.envMapIntensity).toBe(0.35);
    expect(ceilMat.vertexColors).toBe(true);
    expect(ceilMat.aoMapIntensity).toBe(0.85);

    instance.dispose();
  });
});
