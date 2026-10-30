/* ── src/meta/Identity.ts ──────────────────────────────────────────────────
 *  Accounts-Lite & Official Email/Password Cryptographic Identity.
 *  - Generates extractable ECDSA P-256 keypair stored in IndexedDB.
 *  - Signs state-mutating requests with X-BS-Player, X-BS-Ts, X-BS-Nonce, X-BS-Sig.
 *  - Official Email + Password registration, login, encrypted keypair vault, and cloud sync.
 *  - PBKDF2 + AES-GCM encrypted recovery code export/import.
 *  Pure WebCrypto & IndexedDB — zero external dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

import { ProfileStore, type PlayerProfileData } from './ProfilePersistence.js';

const DB_NAME = 'backsilence_identity_db';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
const KEY_PAIR_ID = 'local_operator_keypair';
export const AUTH_STORAGE_KEY = 'backsilence.auth.v1';
export const LOCAL_ACCOUNTS_STORAGE_KEY = 'backsilence.local_accounts.v1';

export interface IdentityProfile {
  playerId: string;
  publicKeyJwk: string;
  name: string;
  tag: string;
  email?: string | undefined;
  accountId?: string | undefined;
  authToken?: string | undefined;
}

export interface SignedHeaders {
  'X-BS-Player': string;
  'X-BS-Ts': string;
  'X-BS-Nonce': string;
  'X-BS-Sig': string;
  'Content-Type': string;
}

interface StoredIdentityRecord {
  keyPair: CryptoKeyPair;
  name: string;
  tag: string;
  email?: string | undefined;
  accountId?: string | undefined;
  authToken?: string | undefined;
}

interface LocalAccountEntry {
  accountId: string;
  email: string;
  playerId: string;
  pubkey: string;
  name: string;
  tag: string;
  encryptedVault: string;
  profile: PlayerProfileData;
  updatedAt: number;
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

function readAuthMeta(): {
  email?: string | undefined;
  accountId?: string | undefined;
  authToken?: string | undefined;
  name?: string | undefined;
  tag?: string | undefined;
} | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as {
      email?: string | undefined;
      accountId?: string | undefined;
      authToken?: string | undefined;
      name?: string | undefined;
      tag?: string | undefined;
    };
  } catch {
    return null;
  }
}

function writeAuthMeta(
  meta: {
    email?: string | undefined;
    accountId?: string | undefined;
    authToken?: string | undefined;
    playerId?: string | undefined;
    name?: string | undefined;
    tag?: string | undefined;
  } | null,
): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!meta || !meta.email) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } else {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(meta));
    }
  } catch {
    // ignore storage errors
  }
}

let inMemoryLocalAccounts: Record<string, LocalAccountEntry> = {};

function readLocalAccounts(): Record<string, LocalAccountEntry> {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_ACCOUNTS_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw) as Record<string, LocalAccountEntry>;
      }
    }
  } catch {
    // ignore
  }
  return { ...inMemoryLocalAccounts };
}

function writeLocalAccounts(accounts: Record<string, LocalAccountEntry>): void {
  inMemoryLocalAccounts = { ...accounts };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    }
  } catch {
    // ignore
  }
}

async function encryptVaultWithPassword(
  password: string,
  vaultPayload: {
    privateKeyJwk: JsonWebKey;
    publicKeyJwk: JsonWebKey;
    name: string;
    tag: string;
  },
): Promise<string> {
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(salt);
  crypto.getRandomValues(iv);

  const passKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );

  const plaintext = new TextEncoder().encode(JSON.stringify(vaultPayload));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    aesKey,
    plaintext,
  );

  const bundle = {
    v: 1,
    salt: bytesToBase64Url(salt),
    iv: bytesToBase64Url(iv),
    data: bytesToBase64Url(new Uint8Array(encrypted)),
  };

  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(bundle)));
}

async function decryptVaultWithPassword(
  password: string,
  encryptedVault: string,
): Promise<{
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
  name: string;
  tag: string;
}> {
  const rawJson = new TextDecoder().decode(base64UrlToBytes(encryptedVault.trim()));
  const bundle = JSON.parse(rawJson) as { salt: string; iv: string; data: string };
  const salt = base64UrlToBytes(bundle.salt);
  const iv = base64UrlToBytes(bundle.iv);
  const data = base64UrlToBytes(bundle.data);

  const passKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  const decryptedBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    aesKey,
    data as BufferSource,
  );

  const parsed = JSON.parse(new TextDecoder().decode(decryptedBytes)) as {
    privateKeyJwk?: JsonWebKey;
    publicKeyJwk?: JsonWebKey;
    priv?: JsonWebKey;
    pub?: JsonWebKey;
    name?: string;
    tag?: string;
  };

  const privateKeyJwk = parsed.privateKeyJwk ?? parsed.priv;
  const publicKeyJwk = parsed.publicKeyJwk ?? parsed.pub;
  if (!privateKeyJwk || !publicKeyJwk) {
    throw new Error('Corrupt encrypted keypair vault');
  }

  return {
    privateKeyJwk,
    publicKeyJwk,
    name: parsed.name || 'Operator',
    tag: parsed.tag || '0001',
  };
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
      const stored = await new Promise<StoredIdentityRecord | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(KEY_PAIR_ID);
        req.onsuccess = () => resolve(req.result as StoredIdentityRecord | undefined);
        req.onerror = () => reject(req.error ? new Error(req.error.message) : new Error('IndexedDB get error'));
      });

      if (stored?.keyPair) {
        this.cachedKeyPair = stored.keyPair;
        const pubJwk = await crypto.subtle.exportKey('jwk', stored.keyPair.publicKey);
        const pubJwkStr = JSON.stringify(pubJwk);
        const hash = await computeSha256Hex(pubJwkStr);
        const playerId = bytesToBase64Url(new TextEncoder().encode(hash)).substring(0, 16);
        const authMeta = readAuthMeta();

        this.cachedProfile = {
          playerId,
          publicKeyJwk: pubJwkStr,
          name: stored.name || authMeta?.name || 'Operator',
          tag: stored.tag || authMeta?.tag || '0001',
          ...(stored.email || authMeta?.email ? { email: stored.email || authMeta?.email } : {}),
          ...(stored.accountId || authMeta?.accountId ? { accountId: stored.accountId || authMeta?.accountId } : {}),
          ...(stored.authToken || authMeta?.authToken ? { authToken: stored.authToken || authMeta?.authToken } : {}),
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
    if (profile.email) {
      writeAuthMeta({
        email: profile.email,
        accountId: profile.accountId,
        authToken: profile.authToken,
        playerId: profile.playerId,
        name: profile.name,
        tag: profile.tag,
      });
      const accounts = readLocalAccounts();
      const entry = accounts[profile.email.toLowerCase()];
      if (entry) {
        entry.name = profile.name;
        writeLocalAccounts(accounts);
      }
    }
    if (this.cachedKeyPair) {
      try {
        const db = await openIdb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.put(
            {
              keyPair: this.cachedKeyPair,
              name: profile.name,
              tag: profile.tag,
              email: profile.email,
              accountId: profile.accountId,
              authToken: profile.authToken,
            },
            KEY_PAIR_ID,
          );
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error ?? new Error('IDB put error'));
        });
      } catch {
        // In-memory fallback
      }
    }
  },

  isAuthenticated(): boolean {
    if (this.cachedProfile?.email) {
      return true;
    }
    const authMeta = readAuthMeta();
    return Boolean(authMeta?.email);
  },

  async registerWithEmail(email: string, password: string, callsign?: string): Promise<IdentityProfile> {
    const normEmail = email.trim().toLowerCase();
    const emailRegex = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
    if (!normEmail || normEmail.length > 128 || !emailRegex.test(normEmail)) {
      throw new Error('Please enter a valid email address.');
    }
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }
    if (password.length > 128) {
      throw new Error('Password must not exceed 128 characters.');
    }

    const profile = await this.getOrGenerateIdentity();
    if (callsign && callsign.trim().length >= 3) {
      profile.name = callsign.trim().substring(0, 16);
    }

    const keyPair = this.cachedKeyPair;
    if (!keyPair) {
      throw new Error('Cryptographic keypair unavailable.');
    }

    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const encryptedVault = await encryptVaultWithPassword(password, {
      privateKeyJwk,
      publicKeyJwk,
      name: profile.name,
      tag: profile.tag,
    });

    const currentProfileData = ProfileStore.load();
    const requestPayload = {
      email: normEmail,
      password,
      name: profile.name,
      playerId: profile.playerId,
      pubkey: profile.publicKeyJwk,
      encryptedVault,
      profile: currentProfileData,
    };
    const bodyText = JSON.stringify(requestPayload);
    const sigHeaders = await this.signRequest('POST', '/auth/register', bodyText);

    let accountId = 'acc_local_' + Math.random().toString(36).substring(2, 10);
    let authToken = 'local_tok_' + bytesToBase64Url(new TextEncoder().encode(`${normEmail}:${profile.playerId}:${Date.now()}`));
    let registeredViaApi = false;

    if (typeof fetch !== 'undefined') {
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { ...sigHeaders },
          body: bodyText,
        });
        if (res.status === 409) {
          throw new Error('An account with this email already exists');
        }
        if (res.status === 400 || res.status === 401) {
          const errData = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errData.error || 'Registration rejected by server');
        }
        if (res.ok) {
          const data = (await res.json()) as {
            accountId: string;
            playerId: string;
            email: string;
            name: string;
            tag: string;
            token: string;
          };
          accountId = data.accountId || accountId;
          authToken = data.token || authToken;
          profile.name = data.name || profile.name;
          profile.tag = data.tag || profile.tag;
          registeredViaApi = true;
        }
      } catch (err: unknown) {
        if (err instanceof Error && (err.message.includes('already exists') || err.message.includes('rejected'))) {
          throw err;
        }
        // Fallback to local encrypted account store when offline / static mode
      }
    }

    const localAccounts = readLocalAccounts();
    if (!registeredViaApi && localAccounts[normEmail]) {
      throw new Error('An account with this email already exists');
    }

    localAccounts[normEmail] = {
      accountId,
      email: normEmail,
      playerId: profile.playerId,
      pubkey: profile.publicKeyJwk,
      name: profile.name,
      tag: profile.tag,
      encryptedVault,
      profile: currentProfileData,
      updatedAt: Math.floor(Date.now() / 1000),
    };
    writeLocalAccounts(localAccounts);

    profile.email = normEmail;
    profile.accountId = accountId;
    profile.authToken = authToken;
    this.cachedProfile = profile;

    writeAuthMeta({
      email: normEmail,
      accountId,
      authToken,
      playerId: profile.playerId,
      name: profile.name,
      tag: profile.tag,
    });

    try {
      const db = await openIdb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(
          {
            keyPair,
            name: profile.name,
            tag: profile.tag,
            email: normEmail,
            accountId,
            authToken,
          },
          KEY_PAIR_ID,
        );
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error('IDB put error'));
      });
    } catch {
      // Ignore in-memory fallback
    }

    return this.cachedProfile;
  },

  async loginWithEmail(
    email: string,
    password: string,
  ): Promise<{ identity: IdentityProfile; profile?: PlayerProfileData }> {
    const normEmail = email.trim().toLowerCase();
    if (!normEmail || !password) {
      throw new Error('Please enter both your email and password.');
    }

    let accountId = '';
    let authToken = '';
    let encryptedVault = '';
    let serverName = '';
    let serverTag = '';
    let restoredProfile: PlayerProfileData | undefined;
    let loggedInViaApi = false;

    if (typeof fetch !== 'undefined') {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: normEmail, password }),
        });

        if (res.ok) {
          const data = (await res.json()) as {
            accountId: string;
            playerId: string;
            email: string;
            name: string;
            tag: string;
            pubkey: string;
            encryptedVault: string;
            profile?: Partial<PlayerProfileData>;
            token: string;
          };
          accountId = data.accountId;
          authToken = data.token;
          encryptedVault = data.encryptedVault;
          serverName = data.name;
          serverTag = data.tag;
          if (data.profile && Object.keys(data.profile).length > 0) {
            restoredProfile = ProfileStore.migrate(data.profile);
          }
          loggedInViaApi = true;
        } else if (res.status === 401) {
          const localAccounts = readLocalAccounts();
          if (!localAccounts[normEmail]) {
            throw new Error('Invalid email or password');
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'Invalid email or password') {
          throw err;
        }
        // Fallback to local accounts store
      }
    }

    if (!loggedInViaApi) {
      const localAccounts = readLocalAccounts();
      const localAcc = localAccounts[normEmail];
      if (!localAcc) {
        throw new Error('Invalid email or password');
      }
      accountId = localAcc.accountId;
      encryptedVault = localAcc.encryptedVault;
      serverName = localAcc.name;
      serverTag = localAcc.tag;
      authToken = 'local_tok_' + bytesToBase64Url(new TextEncoder().encode(`${normEmail}:${localAcc.playerId}:${Date.now()}`));
      if (localAcc.profile) {
        restoredProfile = ProfileStore.migrate(localAcc.profile);
      }
    }

    let decrypted: {
      privateKeyJwk: JsonWebKey;
      publicKeyJwk: JsonWebKey;
      name: string;
      tag: string;
    };
    try {
      decrypted = await decryptVaultWithPassword(password, encryptedVault);
    } catch {
      throw new Error('Invalid email or password');
    }

    const privateKey = await crypto.subtle.importKey(
      'jwk',
      decrypted.privateKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign'],
    );
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      decrypted.publicKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    );

    const keyPair: CryptoKeyPair = { privateKey, publicKey };
    this.cachedKeyPair = keyPair;

    const pubJwkStr = JSON.stringify(decrypted.publicKeyJwk);
    const hash = await computeSha256Hex(pubJwkStr);
    const playerId = bytesToBase64Url(new TextEncoder().encode(hash)).substring(0, 16);

    const finalName = serverName || decrypted.name || 'Operator';
    const finalTag = serverTag || decrypted.tag || '0001';

    this.cachedProfile = {
      playerId,
      publicKeyJwk: pubJwkStr,
      name: finalName,
      tag: finalTag,
      email: normEmail,
      accountId,
      authToken,
    };

    writeAuthMeta({
      email: normEmail,
      accountId,
      authToken,
      playerId,
      name: finalName,
      tag: finalTag,
    });

    try {
      const db = await openIdb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(
          {
            keyPair,
            name: finalName,
            tag: finalTag,
            email: normEmail,
            accountId,
            authToken,
          },
          KEY_PAIR_ID,
        );
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error('IDB put error'));
      });
    } catch {
      // Ignore in-memory fallback
    }

    if (restoredProfile) {
      ProfileStore.save(restoredProfile);
    }

    return {
      identity: this.cachedProfile,
      ...(restoredProfile ? { profile: restoredProfile } : {}),
    };
  },

  async logoutAccount(): Promise<IdentityProfile> {
    writeAuthMeta(null);
    await this.clearIdentity();
    return this.getOrGenerateIdentity();
  },

  updateLocalAccountMirror(profileData: PlayerProfileData): void {
    const email = this.cachedProfile?.email || readAuthMeta()?.email;
    if (!email) return;
    const normEmail = email.toLowerCase();
    const accounts = readLocalAccounts();
    const existing = accounts[normEmail];
    if (existing) {
      existing.profile = profileData;
      existing.updatedAt = Math.floor(Date.now() / 1000);
      writeLocalAccounts(accounts);
    }
  },

  async syncProfileNow(profileData?: PlayerProfileData): Promise<boolean> {
    const dataToSync = profileData ?? ProfileStore.load();
    this.updateLocalAccountMirror(dataToSync);

    const identity = await this.getOrGenerateIdentity();
    if (!identity.email) return false;

    const bodyText = JSON.stringify({
      player_id: identity.playerId,
      profile: dataToSync,
    });

    if (typeof fetch !== 'undefined') {
      try {
        const sigHeaders = await this.signRequest('POST', '/profile/sync', bodyText);
        const headers: Record<string, string> = {
          ...sigHeaders,
          ...(identity.authToken ? { Authorization: `Bearer ${identity.authToken}` } : {}),
        };
        const res = await fetch('/api/profile/sync', {
          method: 'POST',
          headers,
          body: bodyText,
        });
        if (res.ok) return true;
      } catch {
        // Offline mirror already updated
      }
    }
    return true;
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
    writeAuthMeta(null);
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
  isAuthenticated(): boolean {
    return IdentityManager.isAuthenticated();
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
  async registerWithEmail(email: string, password: string, callsign?: string): Promise<IdentityProfile> {
    return IdentityManager.registerWithEmail(email, password, callsign);
  },
  async loginWithEmail(email: string, password: string): Promise<{ identity: IdentityProfile; profile?: PlayerProfileData }> {
    return IdentityManager.loginWithEmail(email, password);
  },
  async logoutAccount(): Promise<IdentityProfile> {
    return IdentityManager.logoutAccount();
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

