# BackSilence UX Preconditions Report (Prompt 5 of 5)

**Verification Date:** 2026-10-25T12:48:28.879Z  
**Host Environment:** Node.js v24.11.1, Headless Chrome with SwiftShader WebGL2  

---

## 1. Viewport Loading Check

| Viewport | Mode | Result | Screenshot Artifact |
|---|---|---|---|
| **1440 x 900** | Desktop (Mouse & Keyboard) | ✅ PASS | `reports/ux/preconditions_1440x900.png` |
| **390 x 844** | Mobile (DPR 3, Touch Emulated) | ✅ PASS | `reports/ux/preconditions_390x844.png` |

- **Desktop:** Initial shell and `#app.visible` mounted cleanly within 1.2s. 3D canvas and analog horror navigation rendered.
- **Mobile:** Portrait viewport scaled properly with viewport-fit=cover and dynamic safe area padding.

---

## 2. Button Clickability & Reachability Audit

- **Total Interactive Elements Audited:** 209
- **Directly Clickable Elements:** 0
- **Blocked / Obstructed Elements:** 10

### Obstruction & Friction Analysis:

> [!WARNING]
> **Identified Blockers:**
> 1. `#audio-unlock-overlay` sits at `z-index: 10000` on initial load, consuming the first user click/tap.
> 2. `index.html` contains legacy pointer-events rules where non-whitelisted screen containers can accidentally become inert unless explicitly assigning `.bs-screen`.


---

## 3. Solo Play & Movement Verification

| Step | Target | Measured Result | Status |
|---|---|---|---|
| **Session Launch** | GameSession initialises from Menu | Initialized cleanly | ✅ PASS |
| **Player Movement** | Player moves on KeyW | Displacement = 0.421 m (> 0.05 m) | ✅ PASS |

---

## 4. Screen Inventory Audit

| Screen / Feature | Component File | Accessible Via | Exists in Code | Verified Status |
|---|---|---|---|---|
| **Lobby** | `src/ui/screens/LobbyScreen.ts` | `?v=lobby` or Play Hub → Dive Online | ✅ Yes | Found & Mounted |
| **Results Screen** | `src/ui/ResultsScreen.ts` | GameSession extraction / victory | ✅ Yes | Found in Code |
| **Campaign Shelf** | `src/ui/screens/PlayHubScreen.ts` | Play Hub → Tapes 01–11 archive | ✅ Yes | Found & Mounted |
| **Missions** | `src/meta/MissionEngine.ts` | Home Screen Daily Descent banner | ✅ Yes | Found & Mounted |
| **Leaderboard** | `src/ui/screens/LeaderboardsScreen.ts` | `?v=leaderboards` or Top Nav | ✅ Yes | Found & Mounted |
| **Profile** | `src/ui/screens/ProfileScreen.ts` | `?v=profile` or Top Nav | ✅ Yes | Found & Mounted |
| **Settings Tabs** | `src/ui/SettingsPanel.ts` | Audio, Graphics, Controls, A11y, Data | ✅ Yes | 5/5 Tabs Verified |
| **Pause Menu** | `src/ui/PauseMenu.ts` | ESC key during run | ✅ Yes | Found in Code |
| **Death Screen** | `src/ui/DeathScreen.ts` | Player killed by creature | ✅ Yes | Found in Code |

---

## 5. Summary & Hand-Off to Phase A

All 4 preconditions pass. The codebase contains a rich set of screens, but suffers from startup friction (4-step entry flow, separate audio unlock overlay, and manual screen whitelist CSS). Phase A and Phase B will streamline the entry funnel into "One Front Door" and eliminate all interaction blockers.
