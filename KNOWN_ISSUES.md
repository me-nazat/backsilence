# Known Issues & Operational Considerations — BackSilence Batch 6

## [P2] Binary Model Assets (GLB) Unverified in Git (Zero-Asset Rule Safeguard)
- **Status:** UNVERIFIED (Awaiting owner asset drop)
- **Detail:** In accordance with the repo zero-asset rule and Sketchfab login requirements, `public/models/thumper.glb` and `public/models/skull.glb` are not committed to git.
- **Mitigation & Fallback:** The engine features dual-track skins (`MonsterSkin` polymorphic interface). When `.glb` files are absent, the engine gracefully falls back to `ProceduralSkin` (the multi-joint segmented creature) and procedural wing-skulls. All tests and smoke bot runs pass completely on procedural fallbacks.
- **Resolution:** Follow [MODELS_SETUP.md](MODELS_SETUP.md) to download, convert, optimize (`scripts/prepare-models.mjs`), and place GLBs into `public/models/`.

## [P3] Third-Party IP Notice for "Thumper" Fan Model
- **Status:** DOCUMENTED
- **Detail:** The Thumper creature is an original design from the game *Lethal Company* (Zeekerss). The 3D asset is a fan recreation by `@NO.DONT.EAT.ME.CASEOH` under CC BY 4.0. If BackSilence is ever commercialized, monetized, or released on commercial storefronts, using the Thumper skin carries intellectual property risk.
- **Mitigation:** The game setting `creatures.waterMonsterSkin` defaults to `'auto'`, but can be explicitly set to `'procedural'` to completely disable any third-party likeness and use only original procedural procedural creatures.

## [P4] SwiftShader Software Emulation Performance in Headless CI
- **Status:** MITIGATED / EXPECTED
- **Detail:** When running `scripts/smoke/run-smoke.mjs` or `scripts/shots.mjs` in environments without hardware WebGL acceleration, `--use-angle=swiftshader` uses CPU rasterization. Canvas renders and WebGL passes take 150–350 ms per frame under software rasterization.
- **Mitigation:** Timeouts in the smoke bot harness are scaled gracefully to accommodate software rasterization while verifying functional correctness and shader compilation.
