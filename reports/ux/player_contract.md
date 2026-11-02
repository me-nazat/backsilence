# BackSilence — Player Acoustic Contract & Rulebook Specification

> Authoritative acoustic mapping between player actions, physical surfaces, simulation emitters, emitted loudness, hearing radii, and HUD consequences.
> Specification authority: `ACOUSTIC_RULEBOOK.md`.
> Authoritative implementation: `src/sim/AcousticBus.ts`.

---

## 1. Rulebook Noise Table & Code Citations

| # | Player Action / World Mechanism | Surface | Emitter Code Location | Emitted Loudness (0..1) | Resulting Hearing Radius | HUD Consequence |
|---|---|---|---|---|---|---|
| 1 | Standing still / idle | any | [`src/sim/AcousticBus.ts:625`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L625) | `0.00` | `0.0 m` (Never) | Minimal noise meter displays `RADIUS ~0m` and zero fill. Target remains locked at last splash. |
| 2 | Walk, sprint, crouch-walk, jump, land | dry tiled platform | [`src/sim/AcousticBus.ts:610`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L610) | `0.00` | `0.0 m` (Never) | Completely silent. Zero water meter fill; monster state machine remains in PATROL without alert. |
| 3 | Crouch-wade | water | [`src/sim/AcousticBus.ts:484`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L484) | `0.12` | `4.8 m` (~5 m) | Minimal noise fill to 12%, soft cyan-tan `#eedec2`, `RADIUS ~5m`. Smallest surface ripples. |
| 4 | Wade (walk) | water | [`src/sim/AcousticBus.ts:490`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L490) | `0.35` | `14.0 m` | Minimal noise fill to 35%, amber `#e5c158`, `RADIUS ~14m`. Moderate V-wake and subtle slosh. |
| 5 | Wade (sprint) | water | [`src/sim/AcousticBus.ts:487`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L487) | `0.75` | `30.0 m` | Heavy noise fill to 75%, danger red `#ff3b30`, `RADIUS ~30m`. Directional audio flash arc. |
| 6 | Mantle onto platform from water | water edge | [`src/sim/AcousticBus.ts:567`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L567) | `0.50` | `20.0 m` | Direction arc flash (`flashDirectionArc`), `[mantle ~Xm DIR]` directional caption. |
| 7 | Jump or dive into water | water | [`src/sim/AcousticBus.ts:588`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L588) | `1.00` | `40.0 m` | Full transient spike (100%), red warning pulse, `flashDirectionArc(relAngle, 1.0)`. |
| 8 | Sprint on metal catwalk (Map 2) | metal | [`src/sim/AcousticBus.ts:168`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L168) | `0.30` | `12.0 m` | Metallic ring transient, minimal noise fill to 30%, `RADIUS ~12m`. |
| 9 | Pebble lands in water | water | [`src/sim/AcousticBus.ts:660`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L660) | `0.60` | `24.0 m` | Crown splash on water, ripple tick stinger, directional audio arc, caption `[pebble ~Xm DIR]`. |
| 10 | Pebble lands on dry stone | dry stone | [`src/sim/AcousticBus.ts:184`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L184) | `0.20` | `8.0 m` | Hard impact click, minimal noise fill to 20%, `RADIUS ~8m`. |
| 11 | Valve turning | world | [`src/sim/AcousticBus.ts:192`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L192) | `0.80` | `32.0 m` | Sustained mechanical grinding tone, persistent orange bar fill to 80%, `RADIUS ~32m`. |
| 12 | Generator running | world | [`src/sim/AcousticBus.ts:200`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L200) | `0.90` | `36.0 m` | Deep sustained 60Hz hum, ambient audio ducking, red warning level, `RADIUS ~36m`. |
| 13 | Bell ring | world | [`src/sim/AcousticBus.ts:208`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L208) | `0.90` | `36.0 m` | Resonant acoustic chime stinger, full directional arc flash, caption `[bell ~Xm DIR]`. |
| 14 | Noisemaker beacon | world | [`src/sim/AcousticBus.ts:216`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L216) | `0.70` | `28.0 m` | Continuous 8s acoustic beacon lure pulse, `RADIUS ~28m`. Draws monster navigation away. |
| 15 | Alarm (wrong code / valve surge) | world | [`src/sim/AcousticBus.ts:224`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L224) | `0.80–0.90` | `32.0–36.0 m` | Flashing red warning strobe, rapid audio siren, `[alarm ~Xm DIR]` caption. |
| 16 | Heavy shutter / blast door | world | [`src/sim/AcousticBus.ts:236`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L236) | `0.70` | `28.0 m` | Hydraulic mechanical drop transient, noise bar fills to 70%, `RADIUS ~28m`. |
| 17 | Landing on perch (`creak`) | perch | [`src/sim/AcousticBus.ts:244`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L244) | `0.15` (hard `0.30`) | `6.0 m` (`12.0 m`) | Chip `#hud-perch-chip` activates purple `[PERCHED]`. Locomotion atop perch is silent. |
| 18 | Locker open: fast / careful | school | [`src/sim/AcousticBus.ts:252`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L252) | `0.35` / `0.10` | `14.0 m` / `4.0 m` | Fast open produces sudden metallic latch slam; slow careful open maintains quiet stealth. |
| 19 | Chain cutting | school | [`src/sim/AcousticBus.ts:260`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L260) | `0.50` | `20.0 m` | Sustained metal friction noise during bolt-cutter interaction, `RADIUS ~20m`. |
| 20 | PA zone blast | school | [`src/sim/AcousticBus.ts:268`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L268) | `1.00` | `40.0 m` | Room-wide speaker horn siren, full red bar 100%, monster charges loudspeaker position. |
| 21 | Drone lock siren | city | [`src/sim/AcousticBus.ts:276`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L276) | `0.90` | `36.0 m` | High-frequency targeting screech, lock-on chevron indicator, `[siren ~Xm DIR]`. |
| 22 | Terminal hack success / fail | city | [`src/sim/AcousticBus.ts:284`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L284) | `0.25` / `0.60` | `10.0 m` / `24.0 m` | Success emits soft digital chime (10m); failure triggers alarm buzzer (24m). |
| 23 | Bottle landing: water / dry | metro | [`src/sim/AcousticBus.ts:292`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L292) | `0.60` / `0.50` | `24.0 m` / `20.0 m` | In water: crown splash + hollow slosh (24m). On dry tile: glass shatter transient (20m). |
| 24 | Echo Bell ring (delayed lure) | world | [`src/sim/AcousticBus.ts:300`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L300) | `0.80` | `32.0 m` | Activates delayed 3.0s timer; rings loudly at placed point, diverting monster path. |
| 25 | Haunt spirit manifestation | water (>=12m) | [`src/sim/AcousticBus.ts:308`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L308) | `0.50` | `20.0 m` | Distant ghostly wake splash, directional ripple indicator. |
| 26 | Lever pull | metro | [`src/sim/AcousticBus.ts:316`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L316) | `0.70` | `28.0 m` | Heavy mechanical ratchet click, `RADIUS ~28m`. |
| 27 | Throttle hold | metro | [`src/sim/AcousticBus.ts:324`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L324) | `0.80` | `32.0 m` | Continuous motor turbine hum during train power-up, `RADIUS ~32m`. |
| 28 | EMP use | city | [`src/sim/AcousticBus.ts:332`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L332) | `0.30` | `12.0 m` | Electromagnetic burst with screen glitch artifact, `RADIUS ~12m`. |
| 29 | Ghost train | metro | [`src/sim/AcousticBus.ts:340`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L340) | `0.00` | `0.0 m` (mask) | Ignored by monster as lure; acts as acoustic mask zone dampening player noises. |

---

## 2. In-Water Freeze Rule Contract

When the player halts movement while inside the water (`horizSpeed < 0.08 m/s`):
1. **Zero Continuous Loudness:** [`AcousticBus.ts:625`](file:///Users/nazat/Desktop/Desktop/antigravity/BackSilence/poolrooms/src/sim/AcousticBus.ts#L625) immediately clamps `effectiveLoudness = 0` and stops discrete cadence timers.
2. **Target Sound Pos Lockdown:** `targetSoundPos` remains **frozen at the exact coordinates of the last emitted splash**. It does **not** track the player's live position or drift.
3. **Monster AI Behavior:** The blind predator navigates directly toward `targetSoundPos`. If the player remains motionless when the creature arrives, the predator searches the last splash location for 4–8 seconds, fails to locate the intruder, and resumes wandering.

