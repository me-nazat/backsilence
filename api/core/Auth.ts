/* ── api/core/Auth.ts ───────────────────────────────────────────────────────
 *  WebCrypto ECDSA P-256 Request Signing & Verification + PBKDF2 / HMAC Auth.
 *  Enforces:
 *  1. Cryptographic signature over `${METHOD}\n${PATH}\n${sha256(body)}\n${ts}\n${nonce}`
 *  2. Replay attack rejection: timestamp must be within ±120s of server time
 *  3. Nonce uniqueness tracking within the 120s sliding window
 *  4. PBKDF2-SHA256 (100,000 iterations) password hashing & HMAC-SHA256 session tokens
 *  Pure standard WebCrypto — works on Cloudflare, Vercel Edge, Netlify, and Node.js 18+.
 * ──────────────────────────────────────────────────────────────────────── */

import type { SessionTokenPayload } from './Types.js';

const seenNonces = new Map<string, number>();

// Periodic cleanup of expired nonces (older than 150 seconds)
function pruneExpiredNonces(): void {
  const now = Math.floor(Date.now() / 1000);
  for (const [nonce, ts] of seenNonces.entries()) {
    if (now - ts > 150) {
      seenNonces.delete(nonce);
    }
  }
}

export async function computeSha256(data: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(data));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

export function base64UrlToBytes(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function derivePlayerId(pubkeyJwkJson: string): Promise<string> {
  const hash = await computeSha256(pubkeyJwkJson);
  const hashBytes = new TextEncoder().encode(hash);
  return bytesToBase64Url(hashBytes).substring(0, 16);
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
}

export async function verifyRequestSignature(
  method: string,
  pathname: string,
  bodyText: string,
  headers: Headers,
  expectedPubkeyJwkStr: string,
): Promise<VerificationResult> {
  const tsStr = headers.get('X-BS-Ts') || headers.get('x-bs-ts');
  const nonce = headers.get('X-BS-Nonce') || headers.get('x-bs-nonce');
  const sigBase64 = headers.get('X-BS-Sig') || headers.get('x-bs-sig');

  if (!tsStr || !nonce || !sigBase64) {
    return { valid: false, reason: 'Missing cryptographic signature headers (X-BS-Ts, X-BS-Nonce, X-BS-Sig)' };
  }

  const timestamp = parseInt(tsStr, 10);
  if (isNaN(timestamp)) {
    return { valid: false, reason: 'Invalid X-BS-Ts timestamp' };
  }

  // 1. Timestamp freshness check (±120s window)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 120) {
    return { valid: false, reason: `Timestamp outside acceptable window (skew: ${Math.abs(now - timestamp)}s > 120s)` };
  }

  // 2. Nonce replay check
  pruneExpiredNonces();
  if (seenNonces.has(nonce)) {
    return { valid: false, reason: 'Replay attack detected: nonce has already been used' };
  }


  // 3. Digest payload
  const bodySha = await computeSha256(bodyText);
  const normPath = pathname.replace(/^\/api/, '');
  const payloadToVerify = `${method.toUpperCase()}\n${normPath}\n${bodySha}\n${timestamp}\n${nonce}`;
  const payloadBytes = new TextEncoder().encode(payloadToVerify);

  // 4. Import public key
  try {
    const jwk = JSON.parse(expectedPubkeyJwkStr) as JsonWebKey;
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );

    const sigBytes = base64UrlToBytes(sigBase64);

    let isVerified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      cryptoKey,
      sigBytes,
      payloadBytes,
    );

    if (!isVerified && normPath !== pathname) {
      // Fallback try with raw pathname
      const rawPayload = `${method.toUpperCase()}\n${pathname}\n${bodySha}\n${timestamp}\n${nonce}`;
      isVerified = await crypto.subtle.verify(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        cryptoKey,
        sigBytes,
        new TextEncoder().encode(rawPayload),
      );
    }

    if (!isVerified) {
      return { valid: false, reason: 'Cryptographic signature mismatch' };
    }

    seenNonces.set(nonce, timestamp);
    return { valid: true };


  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, reason: `Key verification failure: ${msg}` };
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
    if (isNaN(byte)) return new Uint8Array(0);
    bytes[i] = byte;
  }
  return bytes;
}

export function isValidEmail(email: string): boolean {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length < 3 || trimmed.length > 128) return false;
  const emailRegex = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
  return emailRegex.test(trimmed);
}

export function isValidPassword(password: string): { valid: boolean; reason?: string } {
  if (typeof password !== 'string') {
    return { valid: false, reason: 'Password is required' };
  }
  if (password.length < 8) {
    return { valid: false, reason: 'Password must be at least 8 characters long' };
  }
  if (password.length > 128) {
    return { valid: false, reason: 'Password must not exceed 128 characters' };
  }
  return { valid: true };
}

export async function hashPasswordPbkdf2(
  password: string,
  saltHex?: string,
): Promise<{ hashHex: string; saltHex: string }> {
  let saltBytes: Uint8Array;
  if (saltHex && saltHex.length >= 16) {
    saltBytes = hexToBytes(saltHex);
  } else {
    saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
  }
  const finalSaltHex = bytesToHex(saltBytes);

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    key,
    256,
  );

  const hashHex = bytesToHex(new Uint8Array(derivedBits));
  return { hashHex, saltHex: finalSaltHex };
}

export async function verifyPasswordPbkdf2(
  password: string,
  saltHex: string,
  expectedHashHex: string,
): Promise<boolean> {
  if (!password || !saltHex || !expectedHashHex) return false;
  const { hashHex } = await hashPasswordPbkdf2(password, saltHex);
  const actualBytes = hexToBytes(hashHex);
  const expectedBytes = hexToBytes(expectedHashHex);
  if (actualBytes.length !== expectedBytes.length || actualBytes.length === 0) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < actualBytes.length; i++) {
    diff |= actualBytes[i]! ^ expectedBytes[i]!;
  }
  return diff === 0;
}

export async function issueSessionToken(
  payload: SessionTokenPayload,
  secret: string,
): Promise<string> {
  const effectiveSecret = secret || 'backsilence-default-session-secret';
  const payloadB64 = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(effectiveSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payloadB64),
  );
  const sigB64 = bytesToBase64Url(new Uint8Array(sig));
  return `${payloadB64}.${sigB64}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<SessionTokenPayload | null> {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts as [string, string];
  if (!payloadB64 || !sigB64) return null;

  try {
    const effectiveSecret = secret || 'backsilence-default-session-secret';
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(effectiveSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const sigBytes = base64UrlToBytes(sigB64);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes as BufferSource,
      new TextEncoder().encode(payloadB64),
    );
    if (!isValid) return null;

    const payloadJson = new TextDecoder().decode(base64UrlToBytes(payloadB64));
    const payload = JSON.parse(payloadJson) as SessionTokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload || typeof payload.exp !== 'number' || payload.exp < now) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

