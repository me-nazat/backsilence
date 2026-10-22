/* ── batch5-audio.test.ts ────────────────────────────────────────────────
 *  Unit tests for Batch 5 synthesized audio voices, new reverb presets,
 *  and procedural rendering upgrades (LightStreaks, WetDarkening, VertexAO).
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { BoxGeometry } from 'three';
import { createImpulseResponse, PRESET_CONFIGS, type ReverbPreset } from '../src/audio/Reverb.js';
import { bakeVertexAO } from '../src/procedural/geometry/VertexAO.js';
import { createLightShaftMesh, createDustMotes } from '../src/game/rendering/LightShafts.js';

describe('Batch 5: Audio Synthesis & Rendering Systems', () => {
  describe('1. Reverb Presets', () => {
    it('defines configurations for all 8 presets including school, jungle, city, station', () => {
      const presets: ReverbPreset[] = [
        'poolroom',
        'tunnel',
        'atrium',
        'drain',
        'school',
        'jungle',
        'city',
        'station',
      ];

      for (const p of presets) {
        const cfg = PRESET_CONFIGS[p];
        expect(cfg).toBeDefined();
        expect(cfg.duration).toBeGreaterThan(0.5);
        expect(cfg.decay).toBeGreaterThan(0.5);
        expect(cfg.brightness).toBeGreaterThan(0.1);
        expect(cfg.preDelay).toBeGreaterThanOrEqual(0.005);
      }

      // Check specific brief requirements
      expect(PRESET_CONFIGS.school.duration).toBe(1.4); // bright small-room
      expect(PRESET_CONFIGS.school.brightness).toBeGreaterThan(0.9);
      expect(PRESET_CONFIGS.jungle.duration).toBe(1.1); // damp, short, diffuse
      expect(PRESET_CONFIGS.station.duration).toBe(3.8); // 3.8s, tiled vault
    });

    it('generates non-silent, NaN/Infinity-free stereo impulse responses', () => {
      // Mock AudioContext for offline impulse generation
      const sampleRate = 44100;
      const mockCtx = {
        sampleRate,
        createBuffer(channels: number, length: number, sr: number) {
          const chData = [new Float32Array(length), new Float32Array(length)];
          return {
            numberOfChannels: channels,
            length,
            sampleRate: sr,
            getChannelData(ch: number) {
              return chData[ch]!;
            },
          };
        },
      } as unknown as BaseAudioContext;

      const newPresets: ReverbPreset[] = ['school', 'jungle', 'city', 'station'];
      for (const p of newPresets) {
        const ir = createImpulseResponse(mockCtx, p);
        expect(ir.numberOfChannels).toBe(2);

        for (let ch = 0; ch < 2; ch++) {
          const data = ir.getChannelData(ch);
          let peak = 0;
          let hasNanInf = false;

          for (let i = 0; i < data.length; i++) {
            const v = data[i]!;
            if (!Number.isFinite(v)) {
              hasNanInf = true;
              break;
            }
            const abs = Math.abs(v);
            if (abs > peak) peak = abs;
          }

          expect(hasNanInf).toBe(false);
          expect(peak).toBeGreaterThan(0.01);
          expect(peak).toBeLessThanOrEqual(1.5);
        }
      }
    });
  });

  describe('2. Procedural Geometry & Rendering Systems', () => {
    it('bakeVertexAO bakes contact and corner occlusion colors', () => {
      const box = new BoxGeometry(2, 2, 2, 4, 4, 4);
      bakeVertexAO(box, { floorY: -1.0, contactRadius: 0.5, minAO: 0.55 });

      const colorAttr = box.getAttribute('color');
      expect(colorAttr).toBeDefined();
      expect(colorAttr.count).toBe(box.getAttribute('position')!.count);

      let foundDarkened = false;
      let foundBright = false;

      for (let i = 0; i < colorAttr.count; i++) {
        const r = colorAttr.getX(i);
        const g = colorAttr.getY(i);
        const b = colorAttr.getZ(i);

        expect(r).toBe(g); // Grayscale AO
        expect(g).toBe(b);
        expect(r).toBeGreaterThanOrEqual(0.55);
        expect(r).toBeLessThanOrEqual(1.0);

        if (r < 0.8) foundDarkened = true;
        if (r > 0.95) foundBright = true;
      }

      expect(foundDarkened).toBe(true);
      expect(foundBright).toBe(true);
    });

    it('creates light shaft meshes and atmospheric dust motes', () => {
      const shaft = createLightShaftMesh({
        topRadius: 1.0,
        bottomRadius: 3.0,
        height: 10.0,
        intensity: 0.3,
      });
      expect(shaft).toBeDefined();
      expect(shaft.geometry).toBeDefined();
      expect(shaft.material).toBeDefined();

      const motes = createDustMotes({
        count: 50,
        bounds: { minX: -5, maxX: 5, minY: 0, maxY: 4, minZ: -5, maxZ: 5 },
      });
      expect(motes).toBeDefined();
      expect(motes.geometry.getAttribute('position')!.count).toBe(50);
    });
  });
});
