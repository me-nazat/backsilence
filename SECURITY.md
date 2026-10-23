# BackSilence — Security Architecture & Credential Quarantine

> [!IMPORTANT]
> **Zero-Secret Client Policy:** No database token, private key, URL-with-token, or administrative secret may ever exist in client-side code, `VITE_*` environment variables, `dist/` production bundles, the Service Worker, unit tests, documentation, or git history.

---

## 1. Turso Database Credential Incident & Rotation

The database `backsilence-mewho` was previously exposed in a communication channel. In accordance with zero-trust security protocol, **those credentials must be treated as fully compromised and immediately invalidated**.

### Rotation Instructions for the Database Owner:

1. **Option A: Via the Turso CLI:**
   ```bash
   # Invalidate all compromised tokens for the database
   turso db tokens invalidate backsilence-mewho

   # Generate a new fresh token for the server-side API proxy only
   turso db tokens create backsilence-mewho
   ```

2. **Option B: Via the Turso Web Dashboard:**
   - Navigate to [Turso Dashboard](https://app.turso.tech).
   - Select database `backsilence-mewho`.
   - Under **Tokens**, click **Invalidate All Active Tokens**.
   - Create a new token with read/write permissions for the backend proxy.

3. **Configuring the New Token:**
   - **DO NOT** place the new token in `.env`, `.env.local`, or any `VITE_*` variable.
   - Set the token **only** in server-side environment variables on your serverless hosting platform:
     - Cloudflare Workers: `wrangler secret put TURSO_AUTH_TOKEN`
     - Vercel: Project Settings → Environment Variables → `TURSO_AUTH_TOKEN` (Production & Preview, Server only)
     - Netlify: Site Configuration → Environment Variables → `TURSO_AUTH_TOKEN`

---

## 2. Serverless Proxy Architecture (`/api/*`)

```
┌─────────────────────────────────┐
│        Player's Browser         │
│  - No database credentials      │
│  - WebCrypto ECDSA P-256 Key    │
│  - Signed requests: X-BS-Sig    │
└────────────────┬────────────────┘
                 │
                 │ HTTPS (Only VITE_API_BASE: /api/*)
                 ▼
┌─────────────────────────────────┐
│    Serverless Edge API Proxy    │
│  (Cloudflare / Vercel / Netlify)│
│  - Holds TURSO_DATABASE_URL     │
│  - Holds TURSO_AUTH_TOKEN       │
│  - Strict parameterized queries │
│  - Rate limiting & auth verify  │
└────────────────┬────────────────┘
                 │
                 │ HTTPS /v2/pipeline (Parameterized HTTP API)
                 ▼
┌─────────────────────────────────┐
│       Turso (libSQL Cloud)      │
│  - players, runs, champions     │
│  - rooms, room_players, signals │
└─────────────────────────────────┘
```

### Key Architectural Safeguards:
1. **Parameterized Statements Only:**
   - The proxy communicates with Turso exclusively using the HTTP pipeline API (`/v2/pipeline`).
   - Every SQL statement is strict, parameterized, and hardcoded in server handlers. Zero dynamic string concatenation is allowed.
2. **CORS Restrictions:**
   - All `/api/*` endpoints strictly validate `Origin` against `ALLOWED_ORIGINS`.
3. **Sliding Window Rate Limiting:**
   - Maximum 20 run submissions per player per hour.
   - Maximum 10 room operations per player per minute.
4. **Idempotent Requests:**
   - Submissions include a deterministic `run_id` (hash of player ID, timestamp, and simulation hash). Duplicate submissions return the existing receipt.

---

## 3. Cryptographic Identity (Accounts-Lite)

BackSilence uses passwordless, email-free cryptographic identity:
- **Client Keypair:** On first boot, the browser generates an ECDSA P-256 keypair via `window.crypto.subtle` stored in IndexedDB as non-extractable.
- **Player ID:** Derived as `base64url(SHA-256(JWK(publicKey))).substring(0, 16)`.
- **Request Signing:** Every state-mutating request includes:
  - `X-BS-Player`: The sender's `player_id`.
  - `X-BS-Ts`: Current Unix timestamp in seconds.
  - `X-BS-Nonce`: Cryptographic random string.
  - `X-BS-Sig`: ECDSA P-256 signature over `${METHOD}\n${PATH}\n${sha256(body)}\n${ts}\n${nonce}`.
- **Replay Protection:** The proxy strictly rejects any request where `|server_ts - X-BS-Ts| > 120s` or where a nonce is reused within the window.

### Identity Recovery Protocol:
- Players can export an encrypted **Recovery Code** from their Operator Profile.
- The exported JWK is encrypted with a user-chosen passphrase using **PBKDF2 (100,000 iterations of SHA-256) + AES-GCM (256-bit)**.
- If both the local device and recovery passphrase are lost, the identity cannot be restored (honest casual-trust posture).

---

## 4. Anti-Cheat & Casual-Trust Posture

1. **What the System Guarantees:**
   - **Impersonation Proof:** No player can submit a run or claim a name belonging to another player's public key.
   - **Replay Determinism:** The top 25 runs on all active boards are evaluated headlessly by `scripts/verify-replays.ts` using `src/sim` and `src/meta/Replay`. Any run whose headless `simHash` or score does not match bit-for-bit is marked `rejected`.
   - **Physical Feasibility Clamping:** Scores exceeding the mathematical maximum for a map's objectives or times below the physical motor sprint minimum are rejected at submission.
2. **Honest Limitations:**
   - This is a casual-trust competitive system. It prevents tampering with network packets, but cannot prevent an adversary who builds an external automated bot that executes legitimate motor inputs in the browser.
   - For this reason, runs are displayed with a verification status (`pending`, `verified`, or `rejected`), and community boards allow filtering by verified runs only.

---

## 5. Secret Scanning & Audit

- The automated bundle audit (`scripts/audit-bundle.mjs`) scans all files in `dist/` on every build and **fails the pipeline** if any file contains `libsql://` or `eyJ`-style JWT tokens.
- The workspace secret scanner (`scripts/secret-scan.mjs`) executes as part of `npm run verify` to ensure zero credentials exist across git commits and workspace files.
