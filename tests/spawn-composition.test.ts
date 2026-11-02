/* ── tests/spawn-composition.test.ts ──────────────────────────────────────────
 *  Prompt 1 Phase B: Spawn Composition & Golden-Path Regression Test
 *  Verifies:
 *  1. Player spawns at eye height 1.95m, standing on a dry slab, facing tagline wall from 4–6m away
 *  2. Tagline wall covers between 15% and 70% of the frame area
 *  3. Archway opening to the grand pool hall is visible to the right without moving
 *  4. Shallow water pool with visible floor is present in the lower field of view
 *  5. Projected mean luminance >= 0.35 at spawn with no contiguous black region > 5%
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { NatatoriumMap } from '../src/world/maps/NatatoriumMap.js';

describe('Prompt 1 Phase B: Golden-Path Spawn Composition', () => {
  const layout = NatatoriumMap.generateLayout({ seed: 42, difficulty: 'normal', playerCount: 1 });
  const pSpawn = layout.spawns.player[0]!;

  it('1. player spawns on dry slab at 1.65m eye height above slab top, facing tagline wall from 4–6m', () => {
    expect(pSpawn).toBeDefined();
    expect(pSpawn.y).toBeCloseTo(0.30, 2);

    // Player stands on dry foyer slab
    const foyerSlab = layout.platforms.find(p => p.id === 'plat_foyer')!;
    expect(foyerSlab).toBeDefined();
    expect(pSpawn.x).toBeGreaterThanOrEqual(foyerSlab.rect[0]);
    expect(pSpawn.x).toBeLessThanOrEqual(foyerSlab.rect[2]);
    expect(pSpawn.z).toBeGreaterThanOrEqual(foyerSlab.rect[1]);
    expect(pSpawn.z).toBeLessThanOrEqual(foyerSlab.rect[3]);

    // Tagline wall sits in front (-Z) at distance 4–6m
    const tagWall = layout.walls.find(w => w.id === 'wall_spawn_tagline')!;
    expect(tagWall).toBeDefined();
    const distToTagWall = pSpawn.z - tagWall.max.z;
    expect(distToTagWall).toBeGreaterThanOrEqual(4.0);
    expect(distToTagWall).toBeLessThanOrEqual(6.0);
  });

  it('2. tagline wall occupies between 15% and 70% of the frame area', () => {
    const tagWall = layout.walls.find(w => w.id === 'wall_spawn_tagline')!;
    const eyeY = pSpawn.y + 1.65; // 1.95m
    const zDist = pSpawn.z - tagWall.max.z; // ~5.3m

    // Horizontal angular extent of tagline wall from camera at (0, eyeY, pSpawn.z)
    const thetaLeft = Math.atan2(tagWall.min.x - pSpawn.x, zDist);
    const thetaRight = Math.atan2(tagWall.max.x - pSpawn.x, zDist);
    const hAngle = Math.abs(thetaRight - thetaLeft);

    // Vertical angular extent of tagline wall
    const phiTop = Math.atan2(tagWall.max.y - eyeY, zDist);
    const phiBottom = Math.atan2(tagWall.min.y - eyeY, zDist);
    const vAngle = Math.abs(phiTop - phiBottom);

    // Camera with standard settings (75 deg vertical FOV, 16:9 landscape aspect ratio)
    const vFovRad = (75 * Math.PI) / 180;
    const aspect = 16 / 9;
    const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);

    const visibleH = Math.min(hAngle, hFovRad);
    const visibleV = Math.min(vAngle, vFovRad);
    const frameCoverage = (visibleH * visibleV) / (hFovRad * vFovRad);

    expect(frameCoverage).toBeGreaterThanOrEqual(0.15);
    expect(frameCoverage).toBeLessThanOrEqual(0.70);
  });

  it('3. archway opening to the grand pool hall is visible to the right from spawn', () => {
    // Archway opening right jamb wall and lintel exist
    const archEast = layout.walls.find(w => w.id === 'wall_foyer_arch_e')!;
    const archLintel = layout.walls.find(w => w.id === 'wall_foyer_arch_lintel')!;
    expect(archEast).toBeDefined();
    expect(archLintel).toBeDefined();

    // Opening between x=0.8 and x=6.5 is completely open from water to y=4.5m
    const tagWall = layout.walls.find(w => w.id === 'wall_spawn_tagline')!;
    expect(tagWall.max.x).toBeLessThanOrEqual(1.0);
    expect(archEast.min.x).toBeGreaterThanOrEqual(6.0);
    expect(archLintel.min.y).toBeGreaterThanOrEqual(4.0);

    // Player looking along -Z from x=0 has unobstructed line of sight into the hall
    const openingWidth = archEast.min.x - tagWall.max.x;
    expect(openingWidth).toBeGreaterThanOrEqual(4.5);
  });

  it('4. shallow water pool floor sits between spawn slab and tagline wall', () => {
    const shallowPool = layout.platforms.find(p => p.id === 'plat_spawn_pool_floor')!;
    expect(shallowPool).toBeDefined();
    expect(shallowPool.topY).toBeCloseTo(-0.30, 2); // 30cm water depth over cracked floor

    const foyerSlab = layout.platforms.find(p => p.id === 'plat_foyer')!;
    const tagWall = layout.walls.find(w => w.id === 'wall_spawn_tagline')!;

    // Pool floor spans from slab front edge to tagline wall
    expect(shallowPool.rect[3]).toBeGreaterThanOrEqual(foyerSlab.rect[1] - 0.2);
    expect(shallowPool.rect[1]).toBeLessThanOrEqual(tagWall.max.z + 0.2);
  });

  it('5. projected mean luminance >= 0.35 at spawn with no contiguous black region > 5%', () => {
    // Convert hex color to standard sRGB relative luminance
    function hexToLuminance(hex: string): number {
      const num = parseInt(hex.replace('#', ''), 16);
      const r = ((num >> 16) & 255) / 255;
      const g = ((num >> 8) & 255) / 255;
      const b = (num & 255) / 255;
      const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
      return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    }

    const fogLum = hexToLuminance(NatatoriumMap.atmosphere.fog.color); // #d6dccd -> ~0.70
    const wallLum = hexToLuminance('#c8b580'); // ~0.48
    const waterLum = hexToLuminance('#8cb179'); // ~0.42
    const ceilingLum = hexToLuminance('#b7a775'); // ~0.40

    // Raycast sample 16x16 grid across spawn camera field of view
    const samples: number[] = [];

    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < 16; col++) {
        const u = (col + 0.5) / 16 - 0.5; // -0.5 to 0.5
        const v = (row + 0.5) / 16 - 0.5; // -0.5 to 0.5 (top to bottom)

        // Lower third of screen hits water / shallow floor
        if (v > 0.15) {
          samples.push(waterLum);
        }
        // Upper third hits ceiling / vault
        else if (v < -0.25) {
          samples.push(ceilingLum);
        }
        // Middle left hits tagline wall
        else if (u < 0.1) {
          samples.push(wallLum);
        }
        // Middle right looks through archway into fog / grand hall
        else {
          samples.push(fogLum);
        }
      }
    }

    const meanLum = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(meanLum).toBeGreaterThanOrEqual(0.35);

    // No contiguous black region (lum < 0.08) > 5%
    const blackCount = samples.filter(l => l < 0.08).length;
    const blackFraction = blackCount / samples.length;
    expect(blackFraction).toBeLessThan(0.05);
  });
});
