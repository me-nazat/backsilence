/* ── api/core/Auth.ts ───────────────────────────────────────────────────────
 *  WebCrypto ECDSA P-256 Request Signing & Verification.
 *  Enforces:
 *  1. Cryptographic signature over `${METHOD}\n${PATH}\n${sha256(body)}\n${ts}\n${nonce}`
 *  2. Replay attack rejection: timestamp must be within ±120s of server time
 *  3. Nonce uniqueness tracking within the 120s sliding window
 *  Pure standard WebCrypto — works on Cloudflare, Vercel Edge, Netlify, and Node.js 18+.
 * ──────────────────────────────────────────────────────────────────────── */

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
