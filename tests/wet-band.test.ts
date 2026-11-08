/* ── Tests: Wet Band & Waterline Contact ─────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { Group } from 'three';
import { globalWaterLevelUniform } from '../src/procedural/textures/TileMaterialFactory.js';
import { WaterSystem } from '../src/game/water/WaterSystem.js';

/**
 * Evaluates the wet band shader math given world Y, water level Y, and camera distance.
 * Returns { darkenRatio, luminanceMultiplier, roughnessFactor }.
 */
function evaluateWetBandShader(
  worldY: number,
  waterLevelY: number,
  camDist: number,
  dryRoughness = 0.28,
  worldX = 0,
  worldZ = 0,
) {
  const relWaterY = worldY - waterLevelY;
  const tideNoise = Math.sin(worldX * 12.0 + worldZ * 8.0) * 0.018 + Math.cos(worldX * 25.0 - worldZ * 18.0) * 0.008;
  const bandTop = 0.25 + tideNoise;
  const distAtten = Math.max(0.44, Math.min(1.0, 1.0 - ((camDist - 3.0) / 22.0) * 0.56));

  let darkenRatio = 0.0;
  if (relWaterY >= -0.75 && relWaterY <= bandTop) {
    let wetFactor = 1.0;
    if (relWaterY > 0.0) {
      const wetT = Math.max(0.0, Math.min(1.0, relWaterY / bandTop));
      // smoothstep(0, 1, wetT) = 3*t^2 - 2*t^3
      const smooth = wetT * wetT * (3 - 2 * wetT);
      wetFactor = 1.0 - smooth;
    }
    darkenRatio = 0.18 * wetFactor * distAtten;
  }

  // Meniscus bright contact
  let meniscusLuma = 0.0;
  if (Math.abs(relWaterY) < 0.012) {
    const m = 1.0 - Math.abs(relWaterY) / 0.012;
    meniscusLuma = 0.09 * (m * m * distAtten);
  }

  const luminanceMultiplier = (1.0 - darkenRatio) + meniscusLuma;

  // Roughness factor
  let roughnessFactor = dryRoughness;
  if (relWaterY >= -0.5 && relWaterY <= 0.25) {
    const wetT = Math.max(0.0, Math.min(1.0, Math.max(0.0, relWaterY) / 0.25));
    const smooth = wetT * wetT * (3 - 2 * wetT);
    const rWet = 1.0 - smooth;
    roughnessFactor = dryRoughness * (1.0 - rWet * 0.65) + 0.12 * (rWet * 0.65);
  }

  return {
    darkenRatio,
    luminanceMultiplier,
    roughnessFactor,
  };
}

describe('Wet Band Contract (Prompt 4 / Decision D132)', () => {
  it('exhibits 8-25 % luminance delta across the wet band at close inspection (3m)', () => {
    const waterLevel = 0.0;
    const camDist = 3.0;

    // Dry surface well above the band (> 0.28m)
    const dry = evaluateWetBandShader(0.35, waterLevel, camDist);
    expect(dry.darkenRatio).toBe(0.0);

    // Wet surface just above the waterline (0.02m)
    const wet = evaluateWetBandShader(0.02, waterLevel, camDist);
    const luminanceDeltaPct = ((dry.luminanceMultiplier - wet.luminanceMultiplier) / dry.luminanceMultiplier) * 100;

    // Prompt 4: 8-25 % luminance delta
    expect(luminanceDeltaPct).toBeGreaterThanOrEqual(8.0);
    expect(luminanceDeltaPct).toBeLessThanOrEqual(25.0);
  });

  it('guarantees gradient continuity with no hard edges (C1 smooth transition)', () => {
    const waterLevel = 0.0;
    const camDist = 3.0;
    const step = 0.002; // 2mm sample resolution
    const samples: number[] = [];

    // Sample across the wet band transition from above meniscus (0.02m) to dry wall (0.30m)
    for (let y = 0.02; y <= 0.30; y += step) {
      const res = evaluateWetBandShader(y, waterLevel, camDist);
      samples.push(res.luminanceMultiplier);
    }

    // Check numerical first differences (derivative) across the transition
    for (let i = 1; i < samples.length; i++) {
      const delta = Math.abs(samples[i]! - samples[i - 1]!);
      // Step delta must be bounded (< 0.005 per 2mm) - no sudden step jumps
      expect(delta).toBeLessThan(0.005);
    }

    // Near the band edge (around 0.25m), the derivative should smoothly taper towards zero
    const edgeIndex = Math.floor((0.245 - 0.02) / step);
    const edgeDelta = Math.abs(samples[edgeIndex + 5]! - samples[edgeIndex]!);
    expect(edgeDelta).toBeLessThan(0.003);
  });

  it('provides distance attenuation: subtle at 20m and legible at 3m', () => {
    const waterLevel = 0.0;
    const yNearWater = 0.03;

    const closeRes = evaluateWetBandShader(yNearWater, waterLevel, 3.0);
    const farRes = evaluateWetBandShader(yNearWater, waterLevel, 20.0);

    // At 3m: legible (~15-18% darkening)
    expect(closeRes.darkenRatio * 100).toBeGreaterThanOrEqual(14.0);
    expect(closeRes.darkenRatio * 100).toBeLessThanOrEqual(20.0);

    // At 20m: subtle (~8-12% darkening)
    expect(farRes.darkenRatio * 100).toBeGreaterThanOrEqual(8.0);
    expect(farRes.darkenRatio * 100).toBeLessThanOrEqual(13.0);

    // Attenuation is strictly decreasing with distance
    expect(closeRes.darkenRatio).toBeGreaterThan(farRes.darkenRatio);
  });

  it('synchronises with globalWaterLevelUniform when WaterSystem updates water level', () => {
    // Initial uniform value
    globalWaterLevelUniform.value = 0.0;
    expect(globalWaterLevelUniform.value).toBe(0.0);

    const dummyScene = new Group() as unknown as import('three').Scene;
    const mockGround = {
      bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      isSolidAt: () => false,
      heightAt: () => -1,
      distToDry: () => 1.0,
    } as unknown as import('../src/sim/GroundGrid.js').GroundGrid;

    const waterSys = new WaterSystem(dummyScene, {
      scene: dummyScene,
      ground: mockGround,
      tier: 'low',
      waterY: 0.0,
    });

    // Update water level to -0.2m
    waterSys.updateWaterY(-0.2);
    expect(globalWaterLevelUniform.value).toBeCloseTo(-0.2, 5);

    // At y = 0.05, relative distance to water is 0.05 - (-0.2) = 0.25m (top edge of wet band)
    const resAtShifted = evaluateWetBandShader(0.05, globalWaterLevelUniform.value, 3.0);
    expect(resAtShifted.darkenRatio).toBeLessThan(0.05);

    // At y = -0.18, relative distance to water is 0.02m (active wet band)
    const resNearShiftedWater = evaluateWetBandShader(-0.18, globalWaterLevelUniform.value, 3.0);
    expect(resNearShiftedWater.darkenRatio * 100).toBeGreaterThanOrEqual(14.0);

    waterSys.dispose();
  });

  it('renders a thin bright specular meniscus contact at |dy| < 0.012m', () => {
    const waterLevel = 0.0;
    const camDist = 3.0;

    const atMeniscus = evaluateWetBandShader(0.0, waterLevel, camDist);
    const outsideMeniscus = evaluateWetBandShader(0.02, waterLevel, camDist);

    // The meniscus contact adds specular brightness directly at the waterline
    expect(atMeniscus.luminanceMultiplier).toBeGreaterThan(outsideMeniscus.luminanceMultiplier);
  });

  it('lowers roughness towards 0.12 in the wet contact region', () => {
    const dryRoughness = 0.28;
    const dry = evaluateWetBandShader(0.35, 0.0, 3.0, dryRoughness);
    const wet = evaluateWetBandShader(0.01, 0.0, 3.0, dryRoughness);

    expect(dry.roughnessFactor).toBeCloseTo(0.28, 4);
    // Lowered roughness creates ceramic glaze sheen near water
    expect(wet.roughnessFactor).toBeLessThan(dryRoughness);
    expect(wet.roughnessFactor).toBeCloseTo(0.176, 2);
  });
});
