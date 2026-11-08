import { describe, it, expect } from 'vitest';
import { Scene, PerspectiveCamera } from 'three';
import { detectMagentaArtifacts, scanPngForMagenta } from '../scripts/visual/magenta-artefact-detector.mjs';
import { runMonsterProbe } from '../src/game/monster/MonsterProbe.js';
import type { GameSession } from '../src/game/GameSession.js';

function createSyntheticImage(width = 120, height = 120, fillRGB = [0.55, 0.69, 0.47]): { width: number; height: number; data: Float32Array } {
  const data = new Float32Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4 + 0] = fillRGB[0]!;
    data[i * 4 + 1] = fillRGB[1]!;
    data[i * 4 + 2] = fillRGB[2]!;
    data[i * 4 + 3] = 1.0;
  }
  return { width, height, data };
}

describe('Prompt 7: Magenta Artefact Detector & Scene Override Guard', () => {
  it('1. Clean synthetic water frame passes with 0 findings', () => {
    const img = createSyntheticImage(100, 100, [0.55, 0.69, 0.47]); // #8cb179 shallow water
    const issues = detectMagentaArtifacts(img);
    expect(issues).toHaveLength(0);
  });

  it('2. Pure magenta (#ff00ff) debug marker fails', () => {
    const img = createSyntheticImage(100, 100, [0.55, 0.69, 0.47]);
    // Inject magenta marker pixels at center
    for (let y = 45; y < 55; y++) {
      for (let x = 45; x < 55; x++) {
        const idx = (y * 100 + x) * 4;
        img.data[idx + 0] = 1.0; // R
        img.data[idx + 1] = 0.0; // G
        img.data[idx + 2] = 1.0; // B
      }
    }
    const issues = detectMagentaArtifacts(img);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.type).toBe('MAGENTA_ARTEFACT');
    expect(issues[0]!.count).toBe(100);
    expect(issues[0]!.sample.h).toBe(300);
  });

  it('3. Hot pink (#ff1493) and deep magenta fail', () => {
    const img = createSyntheticImage(80, 80, [0.4, 0.55, 0.35]);
    // Inject hot pink pixels
    for (let i = 0; i < 15; i++) {
      const idx = (30 * 80 + 30 + i) * 4;
      img.data[idx + 0] = 1.0;
      img.data[idx + 1] = 0.08;
      img.data[idx + 2] = 0.58;
    }
    const issues = detectMagentaArtifacts(img);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.type).toBe('MAGENTA_ARTEFACT');
  });

  it('4. Designated effects (neon_flood) are exempted', () => {
    const img = createSyntheticImage(100, 100, [0.89, 0.56, 0.50]); // Neon flood pinkish glow
    const issuesDefault = detectMagentaArtifacts(img, { shotId: 'neon_flood_hero' });
    expect(issuesDefault).toHaveLength(0);

    const issuesExplicit = detectMagentaArtifacts(img, { allowDesignatedEffects: true });
    expect(issuesExplicit).toHaveLength(0);
  });

  it('5. All canonical golden shots pass with 0 magenta findings', () => {
    const shotsToVerify = [
      'tests/golden/natatorium_hero.png',
      'tests/golden/creature_mid_15m.png',
      'tests/golden/creature_close_6m.png',
      'tests/golden/natatorium_water_splash_01.png',
      'tests/golden/natatorium_water_calm_axial.png',
    ];

    for (const shot of shotsToVerify) {
      const issues = scanPngForMagenta(shot);
      expect(issues, `Shot ${shot} must have 0 magenta findings`).toHaveLength(0);
    }
  });

  it('6. Guard Test: scene.overrideMaterial is strictly null outside MonsterProbe render scope', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(75, 16 / 9, 0.1, 100);
    camera.position.set(0, 1.6, 5);

    const mockGl = {
      canvas: { width: 640, height: 360 },
      domElement: { width: 640, height: 360 },
      getRenderTarget: () => null,
      setRenderTarget: () => {},
      getClearColor: (c: { set(v: number): void }) => c.set(0x000000),
      getClearAlpha: () => 1.0,
      setClearColor: () => {},
      clear: () => {},
      render: () => {},
      readRenderTargetPixels: () => {},
      autoClear: true,
    };

    const session = {
      scene,
      camera,
      renderer: { renderer: mockGl },
      simWorld: { monsters: [] },
      isDebug: true,
    } as unknown as GameSession;

    expect(scene.overrideMaterial).toBeNull();

    // Execute probe
    runMonsterProbe(session);

    // Assert strictly null outside probe scope (Prompt 7 Item A2 guard test)
    expect(scene.overrideMaterial).toBeNull();
  });
});
