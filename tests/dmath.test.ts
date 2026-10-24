import { describe, it, expect } from 'vitest';
import {
  dSin,
  dCos,
  dTan,
  dAtan,
  dAtan2,
  dExp,
  dLog,
  dPow,
  dHypot,
  dHypot3,
  D_PI,
} from '../src/sim/dmath.js';

describe('dmath deterministic kernel', () => {
  it('dHypot matches Math.hypot within epsilon', () => {
    for (let x = -50; x <= 50; x += 3.7) {
      for (let y = -50; y <= 50; y += 4.3) {
        const expected = Math.hypot(x, y);
        const actual = dHypot(x, y);
        expect(Math.abs(actual - expected)).toBeLessThan(1e-12);
      }
    }
    expect(dHypot(0, 0)).toBe(0);
    expect(dHypot3(0, 0, 0)).toBe(0);
    expect(Math.abs(dHypot3(1, 2, 2) - 3)).toBeLessThan(1e-12);
  });

  it('dSin and dCos match standard trigonometric values within 1e-12', () => {
    for (let theta = -10 * D_PI; theta <= 10 * D_PI; theta += 0.1) {
      const expectedSin = Math.sin(theta);
      const actualSin = dSin(theta);
      expect(Math.abs(actualSin - expectedSin)).toBeLessThan(1e-12);

      const expectedCos = Math.cos(theta);
      const actualCos = dCos(theta);
      expect(Math.abs(actualCos - expectedCos)).toBeLessThan(1e-12);
    }
  });

  it('dTan matches Math.tan within 1e-10 outside singularities', () => {
    for (let theta = -1.5; theta <= 1.5; theta += 0.05) {
      const expected = Math.tan(theta);
      const actual = dTan(theta);
      expect(Math.abs(actual - expected)).toBeLessThan(1e-10);
    }
  });

  it('dAtan and dAtan2 match within 1e-12', () => {
    for (let x = -20; x <= 20; x += 0.8) {
      for (let y = -20; y <= 20; y += 0.8) {
        if (x === 0 && y === 0) continue;
        const expected = Math.atan2(y, x);
        const actual = dAtan2(y, x);
        expect(Math.abs(actual - expected)).toBeLessThan(1e-12);
      }
    }
    expect(dAtan(0)).toBe(0);
    expect(dAtan2(0, 0)).toBe(0);
  });

  it('dExp and dLog match within 1e-11', () => {
    for (let x = -20; x <= 20; x += 0.5) {
      const expected = Math.exp(x);
      const actual = dExp(x);
      const relError = Math.abs(actual - expected) / Math.max(1, Math.abs(expected));
      expect(relError).toBeLessThan(1e-11);
    }

    for (let x = 0.01; x <= 1000; x *= 1.5) {
      const expected = Math.log(x);
      const actual = dLog(x);
      expect(Math.abs(actual - expected)).toBeLessThan(1e-11);
    }
  });

  it('dPow handles integer and fractional exponents', () => {
    expect(dPow(2, 3)).toBe(8);
    expect(dPow(5, 0)).toBe(1);
    expect(dPow(2, -2)).toBe(0.25);
    expect(Math.abs(dPow(0.85, 3) - Math.pow(0.85, 3))).toBeLessThan(1e-12);
    expect(Math.abs(dPow(2.5, 1.5) - Math.pow(2.5, 1.5))).toBeLessThan(1e-10);
  });
});
