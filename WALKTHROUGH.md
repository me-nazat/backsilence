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

## The Three-Stage Descent & Anomaly Survival Guide

### Stage 1: The Poolrooms
1. **The Flooded Vaults:** Traverse the shallow, milky-green vaulted halls. Maintain dry platform discipline.
2. **Weir & Pump Alignment:** Align the two mechanical valves to balance water pressure.
3. **The Whirlpool Intake:** Approach the primary drain gate (`drain_pipes`). Step into the draining intake to initiate the vortex descent into Stage 2.

### Stage 2: The Drain & Anomaly Hazards
1. **Navigating the Sump:** Industrial pipe complex with periodic water surges (+0.30m) that flood low catwalks.
2. **Surviving Rising Water:**
   - When pipes groan and water bubbles appear, you have 5 seconds of telegraph warning.
   - Immediately scramble to upper ventilation shafts or elevated pipe brackets before catwalks submerge.
3. **Breaking Reality Loops:**
   - If a corridor threshold seamlessly teleports you backward into the same hallway, do not run forward in panic.
   - **Method A (Stillness):** Stand completely still for 3.0 seconds (`KeyW`/`KeyS` released, velocity $< 0.05\text{m/s}$). A resonant glass chime will play, shattering the loop.
   - **Method B (Water Bypass):** Drop off the dry walkway into the adjacent water canal, bypassing the portal trigger.
4. **Discerning Sensory Hallucinations:**
   - If you spot a distant hunched silhouette or hear phantom splashes, glance at your HUD acoustic meter.
   - If the meter shows 0 dB, the stimulus is a sensory lie and will not alert the monster. Approach or ignore it safely.
5. **Descending Further:** Locate the emergency stairwell shaft (`descending_stairs`) and descend to Stage 3.

### Stage 3: Level 0 — The Drained Finale
1. **The 30-Second Drainage:**
   - Upon entry, the flooded hall drains through floor grates over 30 seconds until the floor is completely dry.
   - Overhead yellow sodium lighting illuminates cracked ceramic tiles and peeling plaster walls.
2. **The Inverted Acoustic Rule:**
   - The rules reverse: dry tile floors now echo loudly underfoot.
   - **Crouch-creep (`Ctrl`):** Generates only 0.12 loudness (4m hearing range). This is your primary movement mode.
   - **Walking:** Generates 0.35 loudness (12m hearing range). Use sparingly when monster is distant.
   - **Sprinting (`Shift`):** Emits a thunderous slap-echo at 0.75 loudness (28m hearing range). Do not sprint unless fleeing an imminent attack.
3. **Creature Dynamics in Level 0:**
   - The monster has reduced traction on dry concrete, slowing its stalk speed to 1.4 m/s (down from 2.4 m/s in water).
   - However, its hearing sensitivity widens. Rely on thrown pebbles and distant echo distractions.
4. **The White Doorway:**
   - Sneak past the creature toward the shifting white light doorframe (`shifting_door`) at the far end of the hall to complete the descent and unlock the "Dry Descent" achievement.

