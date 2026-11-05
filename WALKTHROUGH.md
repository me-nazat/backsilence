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

## Campaign opening minute & objective loop (Natatorium)

1. **Cold Open & Routine Maintenance Shift:**
   - Launching a fresh campaign presents the pool cleaner work order clipboard:
     "SHIFT 07:00 — ROUTINE MAINTENANCE — CHECK POOL CHEMISTRY / EMPTY SKIMMER BASKETS / LOG READINGS".
   - Static glitch transition reveals the core law: "DO NOT TOUCH THE WATER 💔".
   - The teaching caption remains anchored at the bottom stack: "Do not touch the water 💔".
2. **Pebble Pickup & Throwable Lure Loop:**
   - Collect stones from dry platform piles (carry cap strictly 3 pebbles).
   - Left-click flings stones in a parabolic trajectory into distant water, pulling the blind creature's attention away from the player.
   - Interact with buoyant props (skimmer lids, float buoys) near water edges with `PUSH` to trigger loud splash distractions ($R \approx 28\text{m}$).
3. **Restoring the Filtration Heart (7 Chlorine Cells):**
   - Collect 7 chlorine canisters across Natatorium dry platforms and detour rooms.
   - The top-right `#hud-cell-chip` tracks progress (`0/7` to `7/7`).
   - Active waypoint beacon illuminates only the single nearest uncollected cell, obeying the 25m attenuation law.
   - Once all 7 cells are secured, hold [E] for 3.0s to crank the exit generator at the plant room ($z = -57.5\text{m}$), unsealing the exit vault.
