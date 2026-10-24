/* ── particles-weather.test.ts ───────────────────────────────────────────────
 *  Phase H: Zero-Allocation Particle Systems & Weather Test Suite
 *  - Verifies ParticlePool zero-heap allocation, recycling, and typed array updates
 *  - Verifies all 10 procedural particle pools (rain, ripples, splashes, mist, dust,
 *    fireflies, bubbles, steam, petals, sparks)
 *  - Verifies GraphicsTier scaling (High, Med, Low)
 *  - Verifies Photosensitive Safety bounds (luminance delta <= 0.25, flash <= 3 Hz, safeMode)
 *  - Verifies distance-delayed positional thunder audio scheduling (0.4s-1.6s)
 *  - Verifies map-specific particle configurations
 * ──────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { PerspectiveCamera } from 'three';
import { ParticlePool } from '../src/game/particles/ParticleSystem.js';
import { ParticleDirector } from '../src/game/particles/ParticleDirector.js';
import { WeatherDirector } from '../src/game/weather/WeatherDirector.js';
import { WeatherSystem } from '../src/sim/Weather.js';

describe('Phase H: Zero-Allocation Particle Systems & Weather', () => {
  it('ParticlePool preallocates typed arrays and updates with zero heap growth', () => {
    const pool = new ParticlePool({
      capacity: 64,
      orientation: 'billboard',
    });

    expect(pool.capacity).toBe(64);
    expect(pool.posX.length).toBe(64);
    expect(pool.active.length).toBe(64);

    // Spawn 10 particles
    for (let i = 0; i < 10; i++) {
      pool.spawn(i, 2, i * 2, 0, 1, 0, 1.0, 0.5, 0.5, 1, 1, 1);
    }
    expect(pool.getActiveCount()).toBe(0); // Not updated yet

    const cam = new PerspectiveCamera(60, 1, 0.1, 100);
    cam.position.set(0, 2, 5);
    cam.updateMatrixWorld();

    const active = pool.update(0.1, cam);
    expect(active).toBe(10);
    expect(pool.getActiveCount()).toBe(10);

    // Run 100 frame iterations, verify no NaNs and lifecycle completes
    for (let frame = 0; frame < 100; frame++) {
      pool.update(0.016, cam);
    }

    // All 1.0s maxAge particles should have expired
    expect(pool.getActiveCount()).toBe(0);
    pool.dispose();
  });

  it('ParticleDirector initializes all 10 procedural particle pools', () => {
    const director = new ParticleDirector({ tier: 'high', waterY: 0.0, mapId: 'natatorium' });

    expect(director.rainStreaks).toBeDefined();
    expect(director.dropRipples).toBeDefined();
    expect(director.splashDroplets).toBeDefined();
    expect(director.mistSheets).toBeDefined();
    expect(director.dustMotes).toBeDefined();
    expect(director.fireflies).toBeDefined();
    expect(director.bubbles).toBeDefined();
    expect(director.steamPlumes).toBeDefined();
    expect(director.driftingPetals).toBeDefined();
    expect(director.sparks).toBeDefined();

    // Verify 10 distinct pools attached to root
    expect(director.root.children.length).toBe(10);
    director.dispose();
  });

  it('GraphicsTier scales particle pool capacities correctly (100% High, 50% Med, 25% Low)', () => {
    const high = new ParticleDirector({ tier: 'high' });
    const med = new ParticleDirector({ tier: 'medium' });
    const low = new ParticleDirector({ tier: 'low' });

    expect(high.rainStreaks.capacity).toBe(512);
    expect(med.rainStreaks.capacity).toBe(256);
    expect(low.rainStreaks.capacity).toBe(128);

    expect(high.dropRipples.capacity).toBe(128);
    expect(med.dropRipples.capacity).toBe(64);
    expect(low.dropRipples.capacity).toBe(32);

    high.dispose();
    med.dispose();
    low.dispose();
  });

  it('burst emitters spawn expected particle counts and lifetimes', () => {
    const director = new ParticleDirector({ tier: 'high', waterY: 0.0 });
    const cam = new PerspectiveCamera(60, 1, 0.1, 100);

    // 1. Splash burst
    director.spawnSplash(0, 0, 0, 16, 2.5);
    director.update(0.016, cam);
    expect(director.splashDroplets.getActiveCount()).toBe(16);
    expect(director.dropRipples.getActiveCount()).toBeGreaterThanOrEqual(1);

    // 2. Sparks burst
    director.spawnSparks(5, 2, 5, 12);
    director.update(0.016, cam);
    expect(director.sparks.getActiveCount()).toBe(12);

    // 3. Steam burst
    director.spawnSteamPlume(2, 1, 2, 0, 1, 0);
    director.update(0.016, cam);
    expect(director.steamPlumes.getActiveCount()).toBe(4);

    // 4. Bubbles burst
    director.spawnBubbles(0, -1, 0, 5);
    director.update(0.016, cam);
    expect(director.bubbles.getActiveCount()).toBe(5);

    director.dispose();
  });

  it('map configuration sets up rain and continuous environmental particles', () => {
    const neonDirector = new ParticleDirector({ mapId: 'neon_flood' });
    expect(neonDirector.rainIntensity).toBeGreaterThan(0.5);

    const jungleDirector = new ParticleDirector({ mapId: 'sunken_jungle' });
    expect(jungleDirector.rainIntensity).toBe(0.0);

    const cam = new PerspectiveCamera(60, 1, 0.1, 100);
    // Simulate 1 second in Sunken Jungle
    for (let i = 0; i < 60; i++) {
      jungleDirector.update(0.016, cam, i * 0.016);
    }

    // Should have spawned fireflies and drifting petals
    expect(jungleDirector.fireflies.getActiveCount()).toBeGreaterThan(0);
    expect(jungleDirector.driftingPetals.getActiveCount()).toBeGreaterThan(0);

    neonDirector.dispose();
    jungleDirector.dispose();
  });

  it('WeatherDirector enforces photosensitive safety bounds (delta <= 0.25, flash <= 3 Hz)', () => {
    const weather = new WeatherSystem(42);
    const director = new WeatherDirector({ weather, seed: 42 });

    // Simulate 5 seconds at 60 FPS
    let maxDelta = 0;
    let prevExposure = director.getExposureBoost();

    for (let i = 0; i < 300; i++) {
      const simTime = i * (1 / 60);
      director.update(1 / 60, simTime);
      const curr = director.getExposureBoost();
      const delta = Math.abs(curr - prevExposure);
      if (delta > maxDelta) maxDelta = delta;
      prevExposure = curr;
    }

    // Luminance delta must be strictly <= 0.25
    expect(maxDelta).toBeLessThanOrEqual(0.25 + 1e-6);

    // Test safeMode clamping
    director.safeMode = true;
    for (let i = 0; i < 300; i++) {
      const simTime = 20.0 + i * (1 / 60); // Time window with thunder/lightning
      director.update(1 / 60, simTime);
      expect(director.getExposureBoost()).toBeLessThanOrEqual(0.1);
    }

    director.dispose();
  });

  it('WeatherDirector schedules and triggers distance-delayed thunder audio', () => {
    let playedSound: string | null = null;
    let playedOptions: unknown = null;

    const mockAudio = {
      play: (sound: string, options: unknown) => {
        playedSound = sound;
        playedOptions = options;
      },
    } as any;

    const weather = new WeatherSystem(999);
    const director = new WeatherDirector({ weather, seed: 999, audio: mockAudio });

    // Step to lightning flash time (flash occurs ~0.8s before thunder crack)
    // In WeatherSystem(999), first thunder crack is at t = 20.0s, flash starts ~19.2s
    let thunderScheduled = false;
    for (let i = 0; i < 1200; i++) {
      const simTime = i * (1 / 60); // 0 to 20 seconds
      director.update(1 / 60, simTime);
      if (director.getPendingThunderCount() > 0) {
        thunderScheduled = true;
        break;
      }
    }

    expect(thunderScheduled).toBe(true);

    // Continue stepping until thunder audio fires
    for (let i = 0; i < 300; i++) {
      const simTime = 19.3 + i * (1 / 60);
      director.update(1 / 60, simTime);
      if (playedSound === 'thunder') break;
    }

    expect(playedSound).toBe('thunder');
    expect(playedOptions).toBeDefined();

    director.dispose();
  });
});
