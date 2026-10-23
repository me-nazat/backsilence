# Security Audit & Secret Hygiene Protocol (`SECURITY_TODO.md`)

This document is generated per **Phase B** of the BackSilence Upgrade Protocol.

---

## 1. Audit Findings

A git history and workspace scan was performed using `scripts/secret-scan.mjs` searching for high-entropy patterns (`eyJ`, `libsql://`, private keys, and credential assignment patterns).

- **Pattern findings:** 0 live production credentials committed in current workspace code.
- **Historic / documentation mentions:**
  - `NETWORK_SETUP.md`: Contained sample JWT prefix templates (`eyJhbGciOi...`).
  - `.env.example`: Safe sanitized template placeholders (`your_anon_key_here`, `http://127.0.0.1:8080`).

---

## 2. Owner Action Items (Credential Rotation)

Per the **Upgrade Protocol**, the agent never rewrites git history or prints secrets. The owner should perform the following rotations if any credentials were ever created from active cloud providers:

1. **Supabase:**
   - If a live Supabase project was linked, navigate to **Project Settings -> API** in the Supabase Dashboard.
   - Click **Generate new JWT secret** and **Rotate Anon Key**.
   - Update your local `.env` (git-ignored) with the new credentials.

2. **Turso / LibSQL:**
   - Run `turso db tokens rotate <database-name>` to invalidate previous authentication tokens.
   - Update local `.env` with the new token.

3. **Firebase Realtime Database:**
   - In Firebase Console, check **Project Settings -> Service Accounts -> Database Secrets** or enforce rules via Firebase Auth.

---

## 3. Repository Protection Gates

- `.gitignore` strictly protects `.env*`, allowing only `.env.example`.
- `npm run verify` runs `scripts/secret-scan.mjs` on every validation pass.
- Any secret commit attempt will be flagged during verification.
