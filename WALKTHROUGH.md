# BackSilence Release Walkthrough

This repository intentionally contains no binary screenshot artifacts. Run
`npm run browser:acceptance` after `npm run verify` to create fresh release
evidence. The runner reports its OS-temporary screenshot directory; set
`BACKSILENCE_ARTIFACT_DIR` to an external directory if the evidence must be
retained.

## First online visit

1. Build and preview the production app through `npm run browser:acceptance`.
2. Confirm the desktop menu becomes interactive in under one second, dismiss
   the audio prompt, and use Tab to reach a visible menu control.
3. Open the mobile room link (`?room=K7QX`) and the material/audio lab
   (`?lab=1&debug=1`). The runner captures `desktop-menu.png`,
   `mobile-room-link.png`, and `lab-debug.png` externally.
4. Open `?net=local`, choose Play Online, and enter the host lobby. This is the
   automated co-op path; configured cloud providers are checked manually after
   deployment.

## Offline solo proof

1. Leave the production page open long enough for the service worker to become
   ready and for the idle prefetch to load the solo game and map chunks.
2. Reload once so the page is service-worker controlled.
3. Disable the network and reload. The menu must return from the cached shell.
4. Start a solo expedition. In a debug session,
   `window.__backsilence.networkGuardStats()` must report zero violations.

## Release pass criteria

- `npm run verify` passes its typecheck, lint, unit tests, build, and bundle
  budgets (35 KB boot gzip and 450 KB total gzip).
- `npm run browser:acceptance` reports no application console warnings,
  errors, runtime exceptions, cross-origin requests, or image/media/font
  requests in its solo policy check.
- Generated screenshots remain outside the repository and no asset files are
  added to source control.
