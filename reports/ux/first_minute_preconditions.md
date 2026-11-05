# First-Minute UX & Objective Loop Preconditions Audit (Prompt 7)

## 1. Executive Summary

An audit of the first 60 seconds of player onboarding in *BackSilence* (via `scripts/repro_prompt1.mjs` and codebase inspection of `src/game/GameSession.ts`, `src/ui/Hud.ts`, `src/game/objectives/ObjectiveDirector.ts`, and `src/game/ThrowableSystem.ts`) reveals that while core survival simulation mechanics are solid, the narrative grounding, teaching choreography, objective loop, and throwable distraction cues require systematic elevation.

---

## 2. Current First-60s Timeline & HUD Inventory

| Timestamp ($t$) | Visual State / Screenshot | HUD Elements Active | Objective State | Gap vs Reference Videos & Steam Page |
|---|---|---|---|---|
| **$t = 0\text{ s}$** | Spawn on pool deck (`natatorium_t02s.png`) | `#hud-objective-pill`, `#hud-noise-minimal` | Generic "Search the drowned complex" | No pool cleaner narrative context; missing work-order card ("SHIFT 07:00 — ROUTINE MAINTENANCE"); missing "Do not touch the water 💔" warning caption |
| **$t = 5\text{ s}$** | Deck walk (`natatorium_t05s.png`) | `#hud-objective-pill`, `#hud-noise-minimal` | Generic string | No routine maintenance task (e.g. skimmer basket / chemical check) to establish normal job before horror |
| **$t = 10\text{ s}$** | Spawn sightline (`natatorium_t10s.png`) | `#hud-objective-pill`, `#hud-noise-minimal` | Generic string | Missing the "wrongness beat": lights dim, distant water disturbance, work-order card glitches into diegetic warning |
| **$t = 22\text{ s}$** | First corridor (`natatorium_t22s.png`) | `#hud-objective-pill`, `#hud-noise-minimal` | Unchanged | Missing Video-3 objective counter (`1/7` chlorine cells); missing numeral pillar wayfinding (`#1 → #2 → #3`) |
| **$t = 47\text{ s}$** | Hall traversal (`natatorium_t47s.png`) | `#hud-objective-pill`, `#hud-noise-minimal`, run timer | Timer text present (`00:45.4`) | Interaction prompts lack two-line verb + qualifier grammar ("PICK UP — chlorine cell 3/7", "THROW — click", "PUSH"); no teaching decal beside pebble pile |
| **$t = 60\text{ s}$** | Sighting band | `#hud-objective-pill`, `#hud-noise-minimal` | Unchanged | Lure distraction loop not explicitly taught; buoyant props lack "PUSH" interaction |

---

## 3. Gap Analysis vs Mission Specifications

1. **Narrative Shell (Steam Contract):**
   - Steam page clearly defines the player as an ordinary **pool cleaner** on maintenance rounds. Currently, the player is dropped in with zero identity or motivation.
   - Solution (Phase A): Scripted, skippable cold-open with localized work-order clipboard card ("SHIFT 07:00 — ROUTINE MAINTENANCE"), brief routine check, sudden dimming and distant water thrum, glitching into "DO NOT TOUCH THE WATER 💔".

2. **Warning Language & Diegetic Teaching (Video-1 & Video-3):**
   - Video-1 features the persistent top-center caption: **"Do not touch the water 💔"**.
   - Video-3 features wall sign **"DON'T SPLASH, IT KNOWS"** before water crossing.
   - Solution (Phase B): Persistent top-center teaching caption for first 120s of new profiles; two-line prompt grammar (`PRIMARY VERB` + `qualifier action`).

3. **Objective Loop (Video-3 "N/7" Loop):**
   - Video-3 features a top-right `1/7` item counter chip + run timer + exit gate.
   - Solution (Phase C): 7 chlorine cells scattered across the map (requiring water crossings and dry room detours), followed by generator-grid puzzle activation at the exit vault to drain water and escape. Minimal top-right `N/7` counter chip keeping default HUD $\le 4$ elements.

4. **Throwable & Lure Distraction Loop (Video-2 & Video-3):**
   - Pebble throwing is functional in `ThrowableSystem.ts`, but lacks distraction teaching and buoyant prop pushing.
   - Solution (Phase D): Add hand-throwing-rock graffiti teaching decal beside first pebble pile; implement "PUSH" interaction for skimmer lids/floats; assert creature lure coordinates in test harness.

5. **Internationalization:**
   - All narrative strings, work orders, prompts, and captions must be added to all 13 locales with 0 missing keys.

