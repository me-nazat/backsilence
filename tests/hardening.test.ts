import { describe, expect, it, vi } from 'vitest';
import { SimWorld } from '../src/sim/SimWorld.js';
import { PuzzleSystem } from '../src/sim/puzzle/PuzzleSystem.js';
import { layoutText } from '../src/procedural/textures/strokeFont.js';
import { PostFX } from '../src/engine/PostFX.js';
import { defaultSettings } from '../src/app/Settings.js';

function createWorld(seed: number): SimWorld {
  return new SimWorld({
    seed,
    bounds: { minX: -2, minZ: -2, maxX: 2, maxZ: 2 },
    playerSpawn: { x: 0, y: 0.3, z: 0 },
    waterY: 0,
  });
}

function firstNoiseId(world: SimWorld): string {
  world.broadcastNoise({ kind: 'wade', position: { x: 0, y: 0, z: 0 }, loudness: 0.35 });
  let id = '';
  world.events.drain((event) => {
    if (event.type === 'noise') id = event.data.id;
  });
  return id;
}

describe('release hardening determinism', () => {
  it('creates stable noise IDs for the same seed and distinct IDs for another seed', () => {
    expect(firstNoiseId(createWorld(77))).toBe(firstNoiseId(createWorld(77)));
    expect(firstNoiseId(createWorld(77))).not.toBe(firstNoiseId(createWorld(78)));
  });

  it('uses an isolated seeded puzzle stream', () => {
    const first = new PuzzleSystem(91).createDefaultContext(0).rng;
    const second = new PuzzleSystem(91).createDefaultContext(0).rng;
    const other = new PuzzleSystem(92).createDefaultContext(0).rng;

    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
    expect(other()).not.toBe(new PuzzleSystem(91).createDefaultContext(0).rng());
  });

  it('makes stroke-font wobble stable without a caller-supplied RNG', () => {
    const a = layoutText('IT HEARS THE WATER.', { size: 36, seed: 42 });
    const b = layoutText('IT HEARS THE WATER.', { size: 36, seed: 42 });
    const c = layoutText('IT HEARS THE WATER.', { size: 36, seed: 43 });

    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe('headless PostFX degradation', () => {
  it('uses the silent headless path instead of constructing EffectComposer', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const renderer = {
      render: vi.fn(),
      setSize: vi.fn(),
      getSize: vi.fn(),
      getPixelRatio: () => 1,
      getContext: vi.fn(),
      capabilities: { isWebGL2: true },
    } as unknown as import('three').WebGLRenderer;
    const container = { clientWidth: 1280, clientHeight: 720 } as HTMLElement;
    const postFX = new PostFX(renderer, container, defaultSettings());

    expect(postFX.getStatus()).toEqual({ mode: 'headless', reason: 'headless' });
    expect(warning).not.toHaveBeenCalled();
    postFX.dispose();
    warning.mockRestore();
  });
});
