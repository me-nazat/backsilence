/* ── prng.ts ──────────────────────────────────────────────────────────────
 *  Seeded pseudo-random number generator (mulberry32).
 *  Deterministic: same seed → identical sequence on every platform.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Create a seeded PRNG using the mulberry32 algorithm.
 * Returns a function that yields the next float in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash a string to a 32-bit integer seed.
 * Uses FNV-1a for speed and acceptable distribution.
 */
export function hashString(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Create a PRNG from a string seed (hashes it first).
 */
export function prngFromString(str: string): () => number {
  return mulberry32(hashString(str));
}

export type RngFn = () => number;
export type RngSource = RngFn | { next: () => number };

function toFn(source: RngSource): RngFn {
  return typeof source === 'function' ? source : () => source.next();
}

/**
 * Pick a random integer in [min, max] inclusive using the given PRNG.
 */
export function randInt(rng: RngSource, min: number, max: number): number {
  const fn = toFn(rng);
  return min + Math.floor(fn() * (max - min + 1));
}

/**
 * Alias for randInt for consistent naming.
 */
export const rngInt = randInt;

/**
 * Pick a random float in [min, max) using the given PRNG.
 */
export function randFloat(rng: RngSource, min: number, max: number): number {
  const fn = toFn(rng);
  return min + fn() * (max - min);
}

/**
 * Float in [min, max).
 */
export const rngRange = randFloat;

/**
 * Pick a random element from a non-empty array.
 */
export function rngPick<T>(rng: RngSource, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error('Cannot pick from empty array');
  }
  const fn = toFn(rng);
  const idx = Math.floor(fn() * items.length);
  return items[idx]!;
}

/**
 * Standard normal distribution generator via Box-Muller transform.
 */
export function rngGaussian(rng: RngSource, mean = 0, stdDev = 1): number {
  const fn = toFn(rng);
  let u1 = fn();
  while (u1 <= 1e-7) {
    u1 = fn();
  }
  const u2 = fn();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stdDev + mean;
}

/**
 * Shuffle an array in place using the Fisher-Yates algorithm with a seeded PRNG.
 */
export function shuffle<T>(arr: T[], rng: RngSource): T[] {
  const fn = toFn(rng);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(fn() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Forkable deterministic PRNG class.
 */
export class Rng {
  readonly seed: number;
  private readonly _next: () => number;

  constructor(seed: number | string) {
    this.seed = typeof seed === 'string' ? hashString(seed) : seed | 0;
    this._next = mulberry32(this.seed);
  }

  /** Next float in [0, 1). */
  next(): number {
    return this._next();
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return rngRange(this._next, min, max);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return rngInt(this._next, min, max);
  }

  /** Pick a random element from a non-empty array. */
  pick<T>(items: readonly T[]): T {
    return rngPick(this._next, items);
  }

  /** Gaussian random value with given mean and standard deviation. */
  gaussian(mean = 0, stdDev = 1): number {
    return rngGaussian(this._next, mean, stdDev);
  }

  /**
   * Derive an independent deterministic child PRNG stream labeled with a string.
   */
  fork(label: string): Rng {
    const childSeed = (hashString(`${this.seed}:${label}`) ^ 0x9e3779b9) >>> 0;
    return new Rng(childSeed);
  }
}
