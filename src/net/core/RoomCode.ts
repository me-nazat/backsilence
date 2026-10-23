/* ── RoomCode.ts ──────────────────────────────────────────────────────────
 *  Pure room code generation, validation, and collision retry helpers.
 *  Alphabet: 32 unambiguous characters (SAFE_ALPHABET, no I, O, 0, 1).
 * ──────────────────────────────────────────────────────────────────────── */

import { SAFE_ALPHABET, type RoomCode } from '../../types/contracts.js';

export const ROOM_CODE_LENGTH = 4;
export const ROOM_EXPIRES_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

export function isValidRoomCode(code: string): code is RoomCode {
  if (typeof code !== 'string' || code.length !== ROOM_CODE_LENGTH) {
    return false;
  }
  const upper = code.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    if (!SAFE_ALPHABET.includes(upper[i]!)) {
      return false;
    }
  }
  return true;
}

export function generateRoomCode(customRandom?: () => number): RoomCode {
  let result = '';
  if (customRandom) {
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      const idx = Math.floor(customRandom() * SAFE_ALPHABET.length) % SAFE_ALPHABET.length;
      result += SAFE_ALPHABET[idx];
    }
    return result;
  }

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(ROOM_CODE_LENGTH);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      result += SAFE_ALPHABET[bytes[i]! % SAFE_ALPHABET.length];
    }
    return result;
  }

  throw new Error('Secure random room-code generation is unavailable in this environment.');
}

/**
 * Executes an asynchronous room creation operation, retrying up to maxRetries
 * with a newly generated room code if a collision (e.g. 409 status) occurs.
 */
export async function createWithRetry<T>(
  action: (code: RoomCode) => Promise<T>,
  maxRetries = 6,
  customRandom?: () => number,
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const code = generateRoomCode(customRandom);
    try {
      return await action(code);
    } catch (err: unknown) {
      lastError = err;
      // Continue retrying on conflict
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to create room after ${maxRetries} collision retries`);
}
