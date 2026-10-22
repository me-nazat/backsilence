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

/**
 * Pick a random integer in [min, max] inclusive using the given PRNG.
 */
export function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Pick a random float in [min, max) using the given PRNG.
 */
export function randFloat(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/**
 * Shuffle an array in place using the Fisher-Yates algorithm with a seeded PRNG.
 */
export function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}
