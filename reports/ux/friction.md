# BackSilence UX Friction Audit Report (Phase A)

**Date:** 2026-10-25T13:01:51.745Z  
**Target Environment:** Headless Chrome via CDP, 8 Scripted Personas  
**Baseline Artifact:** `reports/ux/persona_telemetry_before.json`

---

## 1. Persona Telemetry Baseline (Before Fixes)

| Persona | Setup | TTI (ms) | Clicks to Play | Time to Control (ms) | Dead Clicks | Errors | Input Latency (ms) | Frame p50 / p95 (ms) | Stuck Status |
|---|---|---|---|---|---|---|---|---|---|
| **New desktop player** | 1440x900, mouse and keyboard, never seen the game | 5425 | 2 | 27778 | 1 | 0 | 0 | 0 / 0 | ⚠️ Failed to reach controllable player... |
| **New phone player** | 390x844, touch, DPR 3, 4x CPU throttle, portrait | 1324 | 2 | 38302 | 1 | 0 | 6 | 0 / 0 | ⚠️ Failed to reach controllable player... |
| **Phone player landscape** | 844x390, touch | 720 | 2 | 21354 | 1 | 0 | 14 | 0 / 0 | ⚠️ Failed to reach controllable player... |
| **Keyboard-only** | no mouse, Tab, Enter, Space and Escape | 1015 | 3 | 28216 | 0 | 0 | 16 | 0 / 0 | ⚠️ Failed to reach controllable player... |
| **Gamepad (mock)** | injected navigator.getGamepads | 9448 | 3 | 35781 | 1 | 0 | 16 | 0 / 0 | ⚠️ Gamepad A button did not dismiss le... |
| **Low-end laptop** | 6x CPU throttle, quality auto | 2755 | 2 | 40812 | 1 | 0 | 19 | 0 / 0 | ⚠️ Failed to reach controllable player... |
| **Returning player** | warm cache, saved settings, one previous run | 1353 | 2 | 22105 | 1 | 0 | 0 | 0 / 0 | ⚠️ Failed to reach controllable player... |
| **Flaky network** | 400 ms latency, 1.5 Mbps, 3% loss, one dropped connection during load | 10643 | 2 | 31233 | 1 | 0 | 5 | 0 / 0 | ⚠️ Failed to reach controllable player... |

---

## 2. Nielsen Usability Heuristics Review (Ranked by Severity)

### 1. [Severity 4/4] H4: Consistency and standards
- **Finding:** index.html relies on custom .bs-screen pointer events class; non-whitelisted screens drop clicks silently.
- **Frequency:** Catastrophic (breaks whenever screens are added)
- **Screenshot:** [`reports/ux/preconditions_1440x900.png`](reports/ux/preconditions_1440x900.png)
- **Remediation Plan:** Phase C: Universal screen clickability by construction via shared Screen root.

### 2. [Severity 3/4] H1: Visibility of system status
- **Finding:** Audio unlock overlay blocks landing page without showing how far asset loading has progressed or that clicking starts audio context.
- **Frequency:** High (100% of cold visits)
- **Screenshot:** [`reports/ux/persona_desktop_new.png`](reports/ux/persona_desktop_new.png)
- **Remediation Plan:** Phase B: Merge audio unlock into primary "Descend" CTA with a concise headphones note.

### 3. [Severity 3/4] H2: Match between system and real world
- **Finding:** Mode and tape selection uses cassette archive metaphors but splits start into 4 disparate steps (AudioUnlock -> Home -> PlayHub -> Mode -> Game).
- **Frequency:** High (100% of new players)
- **Screenshot:** [`reports/ux/persona_phone_portrait.png`](reports/ux/persona_phone_portrait.png)
- **Remediation Plan:** Phase B: One dominant front door (Descend starts default tape in <= 2 clicks).

### 4. [Severity 3/4] H5: Error prevention
- **Finding:** Destructive actions (quit mid-run, reset progress, abandon lobby) lack confirmation modal or undo grace period.
- **Frequency:** Medium
- **Screenshot:** [`reports/ux/persona_returning_player.png`](reports/ux/persona_returning_player.png)
- **Remediation Plan:** Phase C: Plain-word confirmation dialogs + Undo toast.

### 5. [Severity 3/4] H9: Help users recognize, diagnose, and recover from errors
- **Finding:** WebGL2 missing error screen does not provide actionable instructions on how to enable hardware acceleration or retry.
- **Frequency:** Low (unsupported GPUs)
- **Screenshot:** [`reports/ux/persona_low_end_laptop.png`](reports/ux/persona_low_end_laptop.png)
- **Remediation Plan:** Phase G: Styled recovery screen with hardware acceleration troubleshooting steps.

### 6. [Severity 3/4] H10: Help and documentation
- **Finding:** First run lacks an interactive orientation teaching stealth rules (dry vs water, crouching, pebble throw).
- **Frequency:** High (first 5 minutes retention)
- **Screenshot:** [`reports/ux/persona_phone_portrait.png`](reports/ux/persona_phone_portrait.png)
- **Remediation Plan:** Phase B: <= 4 minute skippable Orientation run with non-blocking icon-and-word hint cards.

### 7. [Severity 2/4] H3: User control and freedom
- **Finding:** No quick exit or back navigation on deeper menu routes; Escape key behavior inconsistent across overlays.
- **Frequency:** Medium (multi-level menus)
- **Screenshot:** [`reports/ux/persona_keyboard_only.png`](reports/ux/persona_keyboard_only.png)
- **Remediation Plan:** Phase C: Enforce UiLayerManager stack with max 3 levels deep and Escape back key everywhere.

### 8. [Severity 2/4] H6: Recognition rather than recall
- **Finding:** Controls reminder only visible if player seeks it out; prompts do not update glyphs when player switches between keyboard, touch, and gamepad.
- **Frequency:** High (cross-device players)
- **Screenshot:** [`reports/ux/persona_gamepad_mock.png`](reports/ux/persona_gamepad_mock.png)
- **Remediation Plan:** Phase D: Dynamic prompt glyphs matching active input device and visible controls reference.

### 9. [Severity 2/4] H7: Flexibility and efficiency of use
- **Finding:** Returning players have no "Continue Tape" or "Play Again" 1-click shortcut from landing or results screen.
- **Frequency:** High (all repeat sessions)
- **Screenshot:** [`reports/ux/persona_returning_player.png`](reports/ux/persona_returning_player.png)
- **Remediation Plan:** Phase B & C: "Continue" on Home and "Play Again" on results repeats last settings instantly.

### 10. [Severity 2/4] H8: Aesthetic and minimalist design
- **Finding:** Legacy splash uses decorative font stack falling back to Comic Sans; 75% static scanline covers readable text.
- **Frequency:** High (visual first impression)
- **Screenshot:** [`reports/ux/preconditions_1440x900.png`](reports/ux/preconditions_1440x900.png)
- **Remediation Plan:** Phase C: Replace with clean monospace/serif stack; tie scanlines to VHS intensity shader, off at 0.


---

## 3. Top Actionable Findings & Target Milestones

1. **Eliminate Multi-Step Onboarding Friction (Severity 4):**
   Combine audio unlock and headphones advisory into the single primary "Descend" CTA. Reduce clicks from landing to controllable player from 4+ down to <= 2.
2. **Universal Clickability by Construction (Severity 4):**
   Abolish manual pointer-events whitelist in `index.html`. Enforce `UiLayerManager` modal focus, trap, and Escape propagation across all screens.
3. **Orientation Run & Early Retention (Severity 3):**
   Introduce <= 4 min skippable orientation run with non-blocking hint cards and guaranteed early monster presence within 35s.
4. **Sub-1s Retry Flow (Severity 3):**
   Instant death replay with focused Retry button and plain-sentence explanation ("You splashed 6 m from it").
5. **Multi-Input Cohesion (Severity 2):**
   Auto-switch prompt glyphs on last input (Keyboard, Touch, Gamepad) and add live sensitivity calibration preview.
