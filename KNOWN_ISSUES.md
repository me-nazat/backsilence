# Known Issues & Operational Considerations — BackSilence Release Candidate (Batch 8)

## [P2] Binary Model Assets (GLB) Unverified in Git (Zero-Asset Rule Safeguard)
- **Status:** RESOLVED / DETERMINISTIC PROCEDURAL DEFAULT
- **Detail:** In accordance with the repo zero-asset rule and Sketchfab login requirements, `public/models/thumper.glb` and `public/models/skull.glb` are not committed to git.
- **Mitigation & Fallback:** `creatures.waterMonsterSkin` defaults to `'procedural'` (and `'auto'` resolves deterministically to `'procedural'`), ensuring the shipped creature appearance is identical on every machine regardless of whether `public/models/thumper.glb` is present on disk.
- **Resolution:** Only explicit `waterMonsterSkin: 'model'` opts into local GLBs prepared via [MODELS_SETUP.md](MODELS_SETUP.md).

## [P3] Third-Party IP Notice for "Thumper" Fan Model
- **Status:** MITIGATED BY DEFAULT
- **Detail:** The Thumper creature is an original design from the game *Lethal Company* (Zeekerss). The 3D asset is a fan recreation by `@NO.DONT.EAT.ME.CASEOH` under CC BY 4.0. If BackSilence is ever commercialized, monetized, or released on commercial storefronts, using the Thumper skin carries intellectual property risk.
- **Mitigation:** The game setting `creatures.waterMonsterSkin` defaults to `'procedural'` (and migrates `'auto'` to `'procedural'`), so the shipped build uses only the original procedural creature unless the owner explicitly selects `'model'`.

## [P4] SwiftShader Software Emulation Performance in Headless CI
- **Status:** MITIGATED / EXPECTED
- **Detail:** When running `scripts/smoke/run-smoke.mjs` or `scripts/shots.mjs` in environments without hardware WebGL acceleration, `--use-angle=swiftshader` uses CPU rasterization. Canvas renders and WebGL passes take 150–350 ms per frame under software rasterization.
- **Mitigation:** Timeouts in the smoke bot harness are scaled gracefully to accommodate software rasterization while verifying functional correctness and shader compilation.

## [P5] Turso Database Credentials Quarantine & Rotation
- **Status:** SECURED / MITIGATED
- **Detail:** Real database tokens were previously exposed in chat. In accordance with [SECURITY.md](SECURITY.md), no tokens are stored in the client or repository. The client architecture connects strictly through `/api/*` serverless proxies (`api/core/`).
- **Mitigation:** Development environments run `npm run dev:api` using the in-memory `FakeLibsql` emulator. For live deployment, the repository owner must rotate the Turso database token and inject `TURSO_AUTH_TOKEN` exclusively as a serverless platform secret (Cloudflare / Vercel / Netlify).

## [P6] WebRTC STUN/TURN Traversal on Strict Corporate NATs
- **Status:** MITIGATED
- **Detail:** Multi-player Silent Race uses WebRTC data channels with public STUN servers for peer discovery. Strict symmetric corporate firewalls may fail direct peer connectivity without a TURN relay.
- **Mitigation:** Local tab (`?net=local`) and loopback adapters provide 100% offline and automated test coverage. Turn server configuration can be injected into `TursoProxyAdapter` / `WebRtcDbAdapter` via environment options.
