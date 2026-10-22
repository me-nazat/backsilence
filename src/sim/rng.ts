/* ── rng.ts ──────────────────────────────────────────────────────────────
 *  Pure simulation PRNG re-export.
 *  Maintains strict isolation from DOM, WebGL, or Audio.
 * ──────────────────────────────────────────────────────────────────────── */

export {
  mulberry32,
  hashString,
  prngFromString,
  randInt,
  Rng,
  rngRange,
  rngInt,
  rngPick,
  rngGaussian,
} from '../procedural/core/prng.js';
