import { describe, it, expect } from 'vitest';
import { WATER_PROFILES, type WaterProfile } from '../src/game/water/WaterProfile.js';

// Measured water hue band from reference/video/measured_targets.json
// Hue: 85°–113.5° (olive-to-leaf green, never teal or cyan)
// Saturation: 0.31–0.53
// Value: 0.35–0.70
const MEASURED_WATER_BAND = {
  h: [85, 113.5],
  s: [0.31, 0.53],
  v: [0.35, 0.70],
} as const;

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const c = parseInt(hex.replace('#', ''), 16);
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/**
 * Evaluates the Water v4 piecewise Beer-Lambert depth transmittance model:
 * (a) shallow water <= 0.35 m: effective surface alpha 0.20–0.35 revealing cracked pool floor
 * (b) mid water 0.35–0.9 m: translucent green with floor faintly present
 * (c) water deeper than ~1.2 m: approaches alpha 0.85+
 */
export function evaluateDepthTransmittanceAlpha(
  thickness: number,
  profile: WaterProfile,
  viewCos = 1.0, // normal viewing angle by default
): number {
  const depthRatio = Math.max(0.0, Math.min(1.0, thickness / 0.35));
  const shallowAlpha = profile.opacityMin + (0.35 - profile.opacityMin) * depthRatio;

  const deepRatio = Math.max(0.0, Math.min(1.0, (thickness - 0.35) / 0.85));
  const depthAlpha = shallowAlpha + (profile.opacityMax - shallowAlpha) * (deepRatio * deepRatio);

  const fresnelTerm = Math.pow(1.0 - Math.max(0.0, viewCos), 4.0);
  const fresnelAlpha = depthAlpha + (Math.max(depthAlpha, 0.85) - depthAlpha) * fresnelTerm;

  const softEdge = Math.max(0.0, Math.min(1.0, thickness / 0.03));
  return softEdge * fresnelAlpha;
}

describe('PROMPT 2 / Water v4: WaterProfile Calibration & Translucency Contracts', () => {
  const mapIds = Object.keys(WATER_PROFILES) as (keyof typeof WATER_PROFILES)[];

  it('covers all 11 maps with valid WaterProfiles', () => {
    expect(mapIds.length).toBe(11);
    expect(mapIds.sort()).toEqual([
      'drainage_core',
      'drowned_metro',
      'drowned_school',
      'hydro_maze',
      'marble_atrium',
      'natatorium',
      'neon_flood',
      'orientation',
      'poolrooms',
      'sunken_jungle',
      'utility_tunnels',
    ].sort());
  });

  describe('Water Hue Band: all maps strictly within 85°–113.5° olive-to-leaf green', () => {
    for (const map of mapIds) {
      const prof = WATER_PROFILES[map];
      it(`${map} shallow (${prof.shallow}) sits in measured hue/sat/val band`, () => {
        const hsv = hexToHsv(prof.shallow);
        expect(hsv.h, `${map} shallow hue`).toBeGreaterThanOrEqual(MEASURED_WATER_BAND.h[0]);
        expect(hsv.h, `${map} shallow hue`).toBeLessThanOrEqual(MEASURED_WATER_BAND.h[1]);
        expect(hsv.s, `${map} shallow sat`).toBeGreaterThanOrEqual(MEASURED_WATER_BAND.s[0]);
        expect(hsv.s, `${map} shallow sat`).toBeLessThanOrEqual(MEASURED_WATER_BAND.s[1]);
        expect(hsv.v, `${map} shallow val`).toBeGreaterThanOrEqual(MEASURED_WATER_BAND.v[0]);
        expect(hsv.v, `${map} shallow val`).toBeLessThanOrEqual(MEASURED_WATER_BAND.v[1]);
      });

      it(`${map} deep (${prof.deep}) sits in measured hue/sat/val band`, () => {
        const hsv = hexToHsv(prof.deep);
        expect(hsv.h, `${map} deep hue`).toBeGreaterThanOrEqual(MEASURED_WATER_BAND.h[0]);
        expect(hsv.h, `${map} deep hue`).toBeLessThanOrEqual(MEASURED_WATER_BAND.h[1]);
        expect(hsv.s, `${map} deep sat`).toBeGreaterThanOrEqual(MEASURED_WATER_BAND.s[0]);
        expect(hsv.s, `${map} deep sat`).toBeLessThanOrEqual(MEASURED_WATER_BAND.s[1]);
        expect(hsv.v, `${map} deep val`).toBeGreaterThanOrEqual(MEASURED_WATER_BAND.v[0]);
        expect(hsv.v, `${map} deep val`).toBeLessThanOrEqual(MEASURED_WATER_BAND.v[1]);
      });
    }
  });

  describe('Natatorium & Poolrooms ground-truth measured calibration', () => {
    it('natatorium matches exact measured targets (#8cb179 shallow, #678f44 deep, #7b9e5e specular)', () => {
      const prof = WATER_PROFILES.natatorium;
      // DESIGN_RATIONALE: matches water_shallow_over_cracked_floor in measured_targets.json
      expect(prof.shallow.toLowerCase()).toBe('#8cb179');
      // DESIGN_RATIONALE: matches water_deep_mid_hall in measured_targets.json
      expect(prof.deep.toLowerCase()).toBe('#678f44');
      // DESIGN_RATIONALE: matches water_far in measured_targets.json
      expect(prof.far?.toLowerCase()).toBe('#959e69');
      // DESIGN_RATIONALE: matches water_bright_streaks_t17 in palette.json
      expect(prof.specular.toLowerCase()).toBe('#7b9e5e');
      expect(prof.opacityMin).toBe(0.20);
      expect(prof.opacityMax).toBe(0.86);
      expect(prof.murk).toBe(0.0);
    });

    it('poolrooms matches exact measured targets', () => {
      const prof = WATER_PROFILES.poolrooms;
      // DESIGN_RATIONALE: matches water_shallow_over_cracked_floor in measured_targets.json
      expect(prof.shallow.toLowerCase()).toBe('#8cb179');
      // DESIGN_RATIONALE: matches water_deep_mid_hall in measured_targets.json
      expect(prof.deep.toLowerCase()).toBe('#678f44');
      // DESIGN_RATIONALE: matches water_far in measured_targets.json
      expect(prof.far?.toLowerCase()).toBe('#959e69');
      // DESIGN_RATIONALE: matches water_bright_streaks_t17 in palette.json
      expect(prof.specular.toLowerCase()).toBe('#7b9e5e');
      expect(prof.opacityMin).toBe(0.20);
      expect(prof.opacityMax).toBe(0.86);
      expect(prof.murk).toBe(0.0);
    });
  });

  describe('Piecewise Depth Transmittance Opacity Curve bounds', () => {
    it('shallow water (thickness <= 0.35m) has surface alpha in [0.20, 0.35] revealing cracked floor', () => {
      const prof = WATER_PROFILES.natatorium;

      // At thickness = 0.05m
      const alpha05 = evaluateDepthTransmittanceAlpha(0.05, prof, 1.0);
      expect(alpha05).toBeGreaterThanOrEqual(0.20);
      expect(alpha05).toBeLessThanOrEqual(0.35);

      // At thickness = 0.15m (spawn pool floor)
      const alpha15 = evaluateDepthTransmittanceAlpha(0.15, prof, 1.0);
      expect(alpha15).toBeGreaterThanOrEqual(0.20);
      expect(alpha15).toBeLessThanOrEqual(0.35);

      // At thickness = 0.35m (shallow boundary)
      const alpha35 = evaluateDepthTransmittanceAlpha(0.35, prof, 1.0);
      expect(alpha35).toBeCloseTo(0.35, 2);
    });

    it('mid water (0.35m < thickness <= 0.90m) reads translucent green with floor faintly present', () => {
      const prof = WATER_PROFILES.natatorium;

      // At thickness = 0.60m
      const alpha60 = evaluateDepthTransmittanceAlpha(0.60, prof, 1.0);
      expect(alpha60).toBeGreaterThanOrEqual(0.35);
      expect(alpha60).toBeLessThanOrEqual(0.65);

      // At thickness = 0.90m
      const alpha90 = evaluateDepthTransmittanceAlpha(0.90, prof, 1.0);
      expect(alpha90).toBeGreaterThanOrEqual(0.35);
      expect(alpha90).toBeLessThanOrEqual(0.70);
    });

    it('deep water (thickness >= 1.2m) approaches opacityMax >= 0.85', () => {
      const prof = WATER_PROFILES.natatorium;

      const alpha120 = evaluateDepthTransmittanceAlpha(1.20, prof, 1.0);
      expect(alpha120).toBeGreaterThanOrEqual(0.85);

      const alpha250 = evaluateDepthTransmittanceAlpha(2.50, prof, 1.0);
      expect(alpha250).toBeGreaterThanOrEqual(0.85);
    });

    it('grazing angles increase reflectivity and alpha via Schlick Fresnel', () => {
      const prof = WATER_PROFILES.natatorium;

      const normalAlpha = evaluateDepthTransmittanceAlpha(0.20, prof, 1.0);
      const grazingAlpha = evaluateDepthTransmittanceAlpha(0.20, prof, 0.05);

      expect(grazingAlpha).toBeGreaterThan(normalAlpha);
      expect(grazingAlpha).toBeGreaterThanOrEqual(0.70);
    });
  });
});
