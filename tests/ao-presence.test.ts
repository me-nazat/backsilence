import { describe, it, expect, vi } from 'vitest';
import { PlaneGeometry, BoxGeometry, Float32BufferAttribute, Vector2 } from 'three';
import { bakeJunctionContactAO, bakeVertexAO, type ObstacleBox } from '../src/procedural/geometry/VertexAO.js';
import { PostFX } from '../src/engine/PostFX.js';
import { defaultSettings } from '../src/app/Settings.js';

interface SSAOPassLike {
  kernelRadius: number;
  minDistance: number;
  maxDistance: number;
}

interface PostFXWithSSAO {
  ssaoPass: SSAOPassLike | null;
}

describe('Ambient Occlusion Presence (Prompt 4 / Decision D132)', () => {
  it('bakes junction contact AO with ≥ 12 % darkening at slab/wall junctions', () => {
    // Floor plane spanning x: [-5, 5], z: [-5, 5] subdivided into 50x50 segments
    const floor = new PlaneGeometry(10, 10, 50, 50);
    floor.rotateX(-Math.PI / 2); // align with XZ plane, y = 0

    // Obstacle representing a platform slab centered at (0, 0, 0) with size (2, 1, 2)
    // Floor contact footprint is x: [-1, 1], z: [-1, 1]
    const obstacles: ObstacleBox[] = [
      { minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
    ];

    bakeJunctionContactAO(floor, obstacles, 0.35, 0.72);

    const pos = floor.getAttribute('position') as Float32BufferAttribute;
    const color = floor.getAttribute('color') as Float32BufferAttribute;

    expect(color).toBeDefined();

    let minContactLuminance = 1.0;
    let maxOpenFloorLuminance = 0.0;
    let contactVertexCount = 0;
    let openVertexCount = 0;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const lum = color.getX(i);

      // Distance to obstacle box boundary
      const dx = Math.max(0, -1 - x, x - 1);
      const dz = Math.max(0, -1 - z, z - 1);
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 0.05) {
        // Right at the contact edge / junction
        minContactLuminance = Math.min(minContactLuminance, lum);
        contactVertexCount++;
      } else if (dist > 0.5) {
        // Well into the open floor
        maxOpenFloorLuminance = Math.max(maxOpenFloorLuminance, lum);
        openVertexCount++;
      }
    }

    expect(contactVertexCount).toBeGreaterThan(0);
    expect(openVertexCount).toBeGreaterThan(0);

    // Open floor must retain full ambient lighting (1.0)
    expect(maxOpenFloorLuminance).toBeCloseTo(1.0, 2);

    // Contact junction must be at least 12 % darker than open floor (lum <= 0.88)
    const darkeningPct = (1.0 - minContactLuminance) * 100;
    expect(darkeningPct).toBeGreaterThanOrEqual(12.0);
    expect(minContactLuminance).toBeLessThanOrEqual(0.88);
  });

  it('bakes vertex AO with ground contact darkening on 3D geometry', () => {
    // 3D pillar box from y=0 to y=3
    const pillar = new BoxGeometry(1, 3, 1, 4, 10, 4);
    pillar.translate(0, 1.5, 0); // y: [0, 3]

    bakeVertexAO(pillar, { floorY: 0, ceilingY: 3, contactRadius: 0.4, minAO: 0.65 });

    const pos = pillar.getAttribute('position') as Float32BufferAttribute;
    const color = pillar.getAttribute('color') as Float32BufferAttribute;
    expect(color).toBeDefined();

    let baseLum = 1.0;
    let midLum = 0.0;

    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const lum = color.getX(i);
      if (Math.abs(y - 0.0) < 0.05) {
        baseLum = Math.min(baseLum, lum);
      } else if (Math.abs(y - 1.5) < 0.05) {
        midLum = Math.max(midLum, lum);
      }
    }

    // Mid pillar is exposed to ambient light
    expect(midLum).toBeGreaterThanOrEqual(0.95);
    // Base contact is at least 12 % darker than mid pillar
    expect((midLum - baseLum) / midLum).toBeGreaterThanOrEqual(0.12);
  });

  it('configures SSAO pass on Medium and High tiers and disables on Low tier', () => {
    const g = globalThis as unknown as {
      window?: unknown;
      document?: unknown;
    };
    const origWindow = g.window;
    const origDoc = g.document;
    g.window = {
      innerWidth: 1280,
      innerHeight: 720,
      matchMedia: () => ({ matches: false }),
    };
    g.document = {
      getElementById: () => null,
      createElement: () => ({ id: '', style: {} }),
    };

    try {
      const mockRenderer = {
        render: vi.fn(),
        setSize: vi.fn(),
        getSize: (target: Vector2) => target.set(1280, 720),
        getPixelRatio: () => 1,
        getContext: () => ({
          readPixels: vi.fn(),
          RGBA: 6408,
          UNSIGNED_BYTE: 5121,
        }),
        capabilities: {
          isWebGL2: true,
        },
      } as unknown as import('three').WebGLRenderer;

      const mockContainer = {
        clientWidth: 1280,
        clientHeight: 720,
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      } as unknown as HTMLElement;

      const highSettings = defaultSettings();
      highSettings.graphics.quality = 'high';
      const highFX = new PostFX(mockRenderer, mockContainer, highSettings);

      const medSettings = defaultSettings();
      medSettings.graphics.quality = 'medium';
      const medFX = new PostFX(mockRenderer, mockContainer, medSettings);

      const lowSettings = defaultSettings();
      lowSettings.graphics.quality = 'low';
      const lowFX = new PostFX(mockRenderer, mockContainer, lowSettings);

      // Inspect SSAO pass configuration
      const highSSAO = (highFX as unknown as PostFXWithSSAO).ssaoPass;
      const medSSAO = (medFX as unknown as PostFXWithSSAO).ssaoPass;
      const lowSSAO = (lowFX as unknown as PostFXWithSSAO).ssaoPass;

      expect(highSSAO).not.toBeNull();
      expect(medSSAO).not.toBeNull();
      expect(lowSSAO).toBeNull();

      expect(highSSAO?.kernelRadius).toBe(16);
      expect(highSSAO?.minDistance).toBeCloseTo(0.005, 4);
      expect(highSSAO?.maxDistance).toBeCloseTo(0.15, 4);

      highFX.dispose();
      medFX.dispose();
      lowFX.dispose();
    } finally {
      g.window = origWindow;
      g.document = origDoc;
    }
  });
});
