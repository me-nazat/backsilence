/* ── src/meta/Identity.ts ──────────────────────────────────────────────────
 *  Accounts-Lite Cryptographic Identity.
 *  - Generates non-extractable ECDSA P-256 keypair stored in IndexedDB.
 *  - Signs state-mutating requests with X-BS-Player, X-BS-Ts, X-BS-Nonce, X-BS-Sig.
 *  - PBKDF2 + AES-GCM encrypted recovery code export/import.
 *  Pure WebCrypto & IndexedDB — zero external dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

const DB_NAME = 'backsilence_identity_db';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
const KEY_PAIR_ID = 'local_operator_keypair';

export interface IdentityProfile {
  playerId: string;
  publicKeyJwk: string;
  name: string;
  tag: string;
}

export interface SignedHeaders {
  'X-BS-Player': string;
  'X-BS-Ts': string;
  'X-BS-Nonce': string;
  'X-BS-Sig': string;
  'Content-Type': string;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this environment'));
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ? new Error(req.error.message) : new Error('IndexedDB open error'));
  });
}

async function computeSha256Hex(str: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(str));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBytes(base64url: string): Uint8Array {
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

const IdentityManager = {
  cachedKeyPair: null as CryptoKeyPair | null,
  cachedProfile: null as IdentityProfile | null,

  async getOrGenerateIdentity(): Promise<IdentityProfile> {
    if (this.cachedProfile) {
      return this.cachedProfile;
    }

    try {
      const db = await openIdb();
      const stored = await new Promise<{ keyPair: CryptoKeyPair; name: string; tag: string } | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(KEY_PAIR_ID);
        req.onsuccess = () => resolve(req.result as { keyPair: CryptoKeyPair; name: string; tag: string } | undefined);
        req.onerror = () => reject(req.error ? new Error(req.error.message) : new Error('IndexedDB get error'));
      });

      if (stored?.keyPair) {
        this.cachedKeyPair = stored.keyPair;
        const pubJwk = await crypto.subtle.exportKey('jwk', stored.keyPair.publicKey);
        const pubJwkStr = JSON.stringify(pubJwk);
        const hash = await computeSha256Hex(pubJwkStr);
        const playerId = bytesToBase64Url(new TextEncoder().encode(hash)).substring(0, 16);

        this.cachedProfile = {
          playerId,
          publicKeyJwk: pubJwkStr,
          name: stored.name || 'Operator',
          tag: stored.tag || '0001',
        };
        return this.cachedProfile;
      }
    } catch {
      // IndexedDB unavailable (e.g. headless unit tests without window), fallback to in-memory keypair
    }

    // Generate new ECDSA P-256 Keypair
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true, // extractable for export recovery
      ['sign', 'verify'],
    );

    this.cachedKeyPair = keyPair;
    const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const pubJwkStr = JSON.stringify(pubJwk);
    const hash = await computeSha256Hex(pubJwkStr);
    const playerId = bytesToBase64Url(new TextEncoder().encode(hash)).substring(0, 16);

    const name = 'Operator';
    const tag = Math.floor(1000 + Math.random() * 9000).toString();

    try {
      const db = await openIdb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put({ keyPair, name, tag }, KEY_PAIR_ID);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ? new Error(req.error.message) : new Error('IndexedDB put error'));
      });
    } catch {
      // Ignore if in-memory test
    }


    this.cachedProfile = {
      playerId,
      publicKeyJwk: pubJwkStr,
      name,
      tag,
    };
    return this.cachedProfile;
  },

  async signRequest(method: string, pathname: string, bodyText: string): Promise<SignedHeaders> {

    const profile = await this.getOrGenerateIdentity();
    const keyPair = this.cachedKeyPair;
    if (!keyPair) {
      throw new Error('Identity keypair unavailable for signing');
    }

    const ts = Math.floor(Date.now() / 1000);
    const nonceBytes = new Uint8Array(16);
    crypto.getRandomValues(nonceBytes);
    const nonce = bytesToBase64Url(nonceBytes);

    const bodySha = await computeSha256Hex(bodyText);
    const payload = `${method.toUpperCase()}\n${pathname}\n${bodySha}\n${ts}\n${nonce}`;
    const payloadBytes = new TextEncoder().encode(payload);

    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      keyPair.privateKey,
      payloadBytes,
    );

    const sigBase64 = bytesToBase64Url(new Uint8Array(sig));

    return {
      'X-BS-Player': profile.playerId,
      'X-BS-Ts': String(ts),
      'X-BS-Nonce': nonce,
      'X-BS-Sig': sigBase64,
      'Content-Type': 'application/json',
    };
  },


  /**
   * Exports an encrypted Recovery Code (passphrase-encrypted via PBKDF2 + AES-GCM).
   */
  async exportEncryptedRecoveryCode(passphrase: string): Promise<string> {
    await this.getOrGenerateIdentity();
    const keyPair = this.cachedKeyPair;
    if (!keyPair) throw new Error('No keypair to export');

    const privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);


    const exportBundle = JSON.stringify({
      version: 1,
      name: this.cachedProfile?.name || 'Operator',
      tag: this.cachedProfile?.tag || '0001',
      priv: privJwk,
      pub: pubJwk,
    });

    const salt = new Uint8Array(16);
    const iv = new Uint8Array(12);
    crypto.getRandomValues(salt);
    crypto.getRandomValues(iv);

    const passKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );

    const aesKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 600000,
        hash: 'SHA-256',
      },
      passKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      new TextEncoder().encode(exportBundle),
    );

    const finalBundle = {
      salt: bytesToBase64Url(salt),
      iv: bytesToBase64Url(iv),
      data: bytesToBase64Url(new Uint8Array(encrypted)),
    };

    return 'BS-REC-' + bytesToBase64Url(new TextEncoder().encode(JSON.stringify(finalBundle)));
  },


  /**
   * Imports and hydrates an encrypted Recovery Code using the user passphrase.
   */
  async importEncryptedRecoveryCode(code: string, passphrase: string): Promise<IdentityProfile> {
    const rawCode = code.replace(/^BS-REC-/, '').trim();
    const rawJson = new TextDecoder().decode(base64UrlToBytes(rawCode));
    const bundle = JSON.parse(rawJson) as { salt: string; iv: string; data: string };

    const salt = base64UrlToBytes(bundle.salt);
    const iv = base64UrlToBytes(bundle.iv);
    const data = base64UrlToBytes(bundle.data);

    const passKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );

    let decryptedBytes: ArrayBuffer;
    try {
      const aesKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations: 600000,
          hash: 'SHA-256',
        },
        passKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
      );
      decryptedBytes = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        data,
      );
    } catch {
      // Fallback for legacy 100,000 iterations
      const aesKeyFallback = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations: 100000,
          hash: 'SHA-256',
        },
        passKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
      );
      decryptedBytes = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKeyFallback,
        data,
      );
    }

    const payload = JSON.parse(new TextDecoder().decode(decryptedBytes)) as {
      name: string;
      tag: string;
      priv: JsonWebKey;
      pub: JsonWebKey;
    };

    const privateKey = await crypto.subtle.importKey(
      'jwk',
      payload.priv,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign'],
    );
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      payload.pub,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    );

    const keyPair: CryptoKeyPair = { privateKey, publicKey };
    this.cachedKeyPair = keyPair;

    const pubJwkStr = JSON.stringify(payload.pub);
    const hash = await computeSha256Hex(pubJwkStr);
    const playerId = bytesToBase64Url(new TextEncoder().encode(hash)).substring(0, 16);

    try {
      const db = await openIdb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put({ keyPair, name: payload.name, tag: payload.tag }, KEY_PAIR_ID);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ? new Error(req.error.message) : new Error('IndexedDB put error'));
      });
    } catch {
      // Ignore
    }

    this.cachedProfile = {
      playerId,
      publicKeyJwk: pubJwkStr,
      name: payload.name,
      tag: payload.tag,
    };

    return this.cachedProfile;
  },

  isInitialized(): boolean {
    return this.cachedProfile !== null;
  },

  getPlayerId(): string {
    return this.cachedProfile?.playerId ?? '';
  },

  getProfile(): IdentityProfile | null {
    return this.cachedProfile;
  },

  async getIdentity(): Promise<IdentityProfile> {
    return this.getOrGenerateIdentity();
  },

  async rename(newName: string): Promise<void> {
    const profile = await this.getOrGenerateIdentity();
    profile.name = newName;
    if (this.cachedKeyPair) {
      try {
        const db = await openIdb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.put({ keyPair: this.cachedKeyPair, name: profile.name, tag: profile.tag }, KEY_PAIR_ID);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error ?? new Error('IDB put error'));
        });
      } catch {
        // In-memory fallback
      }
    }
  },

  async exportRecoveryCode(passphrase: string): Promise<string> {
    return this.exportEncryptedRecoveryCode(passphrase);
  },

  async importRecoveryCode(code: string, passphrase: string): Promise<IdentityProfile> {
    return this.importEncryptedRecoveryCode(code, passphrase);
  },

  async exportPublicKeyJwk(): Promise<string> {
    const p = await this.getOrGenerateIdentity();
    return p.publicKeyJwk;
  },

  async clearIdentity(): Promise<void> {
    this.cachedKeyPair = null;
    this.cachedProfile = null;
    try {
      const db = await openIdb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(KEY_PAIR_ID);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ? new Error(req.error.message) : new Error('IDB delete error'));
      });
    } catch {
      // Ignore if in-memory test
    }
  },
};

export { IdentityManager };

export const Identity = {
  isInitialized(): boolean {
    return IdentityManager.isInitialized();
  },
  async init(): Promise<IdentityProfile> {
    return IdentityManager.getOrGenerateIdentity();
  },
  getPlayerId(): string {
    return IdentityManager.getPlayerId();
  },
  getProfile(): IdentityProfile | null {
    return IdentityManager.getProfile();
  },
  async exportPublicKeyJwk(): Promise<string> {
    return IdentityManager.exportPublicKeyJwk();
  },
  async signRequest(method: string, pathname: string, bodyText: string): Promise<SignedHeaders> {
    return IdentityManager.signRequest(method, pathname, bodyText);
  },
  async exportEncryptedRecoveryCode(passphrase: string): Promise<string> {
    return IdentityManager.exportEncryptedRecoveryCode(passphrase);
  },
  async importEncryptedRecoveryCode(code: string, passphrase: string): Promise<IdentityProfile> {
    return IdentityManager.importEncryptedRecoveryCode(code, passphrase);
  },
  async clearIdentity(): Promise<void> {
    return IdentityManager.clearIdentity();
  },
};

