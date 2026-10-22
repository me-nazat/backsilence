# MAP LAYOUT ARCHITECTURE & SCHEMATICS

This document provides top-down ASCII schematics and spatial layout specifications for the five Batch 5 maps in **BackSilence**.

---

## 1. Map 1: The Grand Natatorium (`natatorium`)

### Spatial Bounds & Overview
- **Bounds**: $x \in [-70, 70]$, $z \in [-60, 60]$, $Y \in [-3, 14]$
- **Water Plane**: $y = 0.0\text{ m}$, Floor at $y = -0.9\text{ m}$
- **Player Spawn**: South Entry Foyer ($x = 0, y = 0.3, z = 48$)
- **Exit Doors**: North Grand Keypad Doors ($x = 0, y = 0.3, z = -58$)
- **Signature Vista**: Vaulted Edwardian hall, skylight streaks, Ear mosaic centered on pool floor.

### ASCII Top-Down Diagram
```text
           [-70, -60]                                    [70, -60]
                +-------------------------------------------+
                |        [Grand Doors (Exit & Keypad)]      |
                |               (z ~ -58, x=0)              |
                |   +-----------------------------------+   |
                |   |          PLANT ROOM               |   |
                |   |  [-14,-58, 14,-38] (Drain Wheel)  |   |
                |   +-----------------------------------+   |
                |               === | ===                   |
  CHANGING ROOM |   +-----------------------------------+   | STEAM / KIDS'
  WING          |   |        SPECTATOR GALLERY (+3.2m)  |   | ANNEX
  [-62,-14,     |   |          [-38,-36, 38,-30]        |   | [38,14, 58,32]
  -40,22]       |   +-----------------------------------+   | (Permanent mist,
  (Locker banks,|   |~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~|   | toy floats)
  bench rows,   |   |~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~|   |
  narrow chokes)|   |~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~|   |
                |   |~ ~  [DIVING TOWER] [PONTOONS]  ~ ~|   |
                |   |~ ~   [26,-6, 34,6]   (3 rafts) ~ ~|   |
                |   |~ ~                             ~ ~|   |
                |   |~ ~       [ROTUNDA ISLAND]      ~ ~|   |
                |   |~ ~      [-8,-6, 8,10] (+0.3m)  ~ ~|   |
                |   |~ ~                             ~ ~|   |
                |   |~ ~        ((EAR MOSAIC))       ~ ~|   |
                |   |~ ~       Center at (0, 0)      ~ ~|   |
                |   |~ ~                             ~ ~|   |
                |   |~ ~  [STARTING-BLOCK PIERS]     ~ ~|   |
                |   |~ ~  [-36,-10, -30,14] (podiums)~ ~|   |
                |   |~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~|   |
                |   |~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~|   |
                |   +-----------------------------------+   |
                |     POOL DECK RING (3m wide, 5 gaps)      |
                |               === | ===                   |
                |   +-----------------------------------+   |
                |   |            ENTRY FOYER            |   |
                |   |        [-12, 40, 12, 58] (+0.3m)  |   |
                |   |        Player Spawn: (0, 48)      |   |
                |   |        Colonnade, Turnstiles,     |   |
                |   |        Wall Tagline Mosaic        |   |
                |   +-----------------------------------+   |
                +-------------------------------------------+
           [-70, 60]                                     [70, 60]
```

---

## 2. Map 2: The Drowned Schoolhouse (`drowned_school`)

### Spatial Bounds & Overview
- **Bounds**: $x \in [-48, 48]$, $z \in [-28, 28]$ (96m x 56m)
- **Tide Level**: $y = 0.0 \to +0.30\text{ m}$ (Shin to knee flood)
- **Safe Stages**: Permanent safe stage at East ($+0.9\text{ m}$), Entry dais at West ($+0.6\text{ m}$)
- **Perch Hop Chains**: Desks ($+0.41\text{ m}$), chairs ($+0.12\text{ m}$, wobbly), tables, lockers.

```text
  [-48, -28]                                                     [48, -28]
  +------------------+-----------------------+---------------------------+
  | PRINCIPAL'S OFF. |      LIBRARY          |      CLASSROOMS 4, 5, 6   |
  | PA Console Node  |  Tall Bookcase Shelf  |  Desk hop-chains (1.0m)   |
  | Safe Desk (+0.46)|  Register Initials    |  Chalkboards, Flickering  |
  +------------------+-----------------------+---------------------------+
  |                  MAIN CORRIDOR (5m wide, locker banks)               |
  | LOBBY / EXIT     =================================================== |
  | Chained Doors    | JANITOR'S | CAFETERIA | GYMNASIUM    | AUDITORIUM |
  | Raised Dais +0.6 | Cutters   | Long bench| Player Spawn | Stage Safe |
  | Bolt cutter use  | in locker | tables    | Bleachers    | Zone (+0.9)|
  +------------------+-----------+-----------+--------------+------------+
  [-48, 28]                                                      [48, 28]
```

---

## 3. Map 3: The Sunken Jungle (`sunken_jungle`)

### Spatial Bounds & Overview
- **Bounds**: $x \in [-70, 70]$, $z \in [-70, 70]$ (140m x 140m)
- **River**: Spline-driven flowing current ($0.8 - 2.2\text{ m/s}$) from Waterfall Pool (NW) to SE
- **Ponds & Crossings**: 6 ponds, stone stepping chains (dry, non-perch), boulders (perch-immune), logs
- **Sluices**: S1 (Waterfall), S2 (Mid Rapids), S3 (Lower Rapids); Temple Gate exposed at $-0.30\text{ m}$ water level.

```text
  [-70, -70] (NW)                                                [70, -70]
  +----------------------------------------------------------------------+
  | [WATERFALL POOL]                                                     |
  | Sluice S1 (Mask 0.30)                                                |
  |     \ ~ ~ ~ RIVER FLOW (Leaves, drift current) ~ ~ ~ \               |
  |      \                                                \              |
  |       \   [POND 1]           [POND 2]                  \             |
  |        \  (Stone chain)      (Mossy Boulders)           \            |
  |         \ ~ ~ ~ [RAPIDS 1] (Sluice S2, Mask 0.35) ~ ~ ~  \           |
  |          \                                                \          |
  |           \    [POND 3]          [POND 4]                  \         |
  |            \   (Fallen logs)     (Fauna Hush Zone)          \        |
  |             \ ~ ~ ~ [RAPIDS 2] (Sluice S3) ~ ~ ~ ~ ~ ~ ~ ~ ~ \       |
  |              \                                                \      |
  |    [SPAWN]    \    [POND 5]          [CAUSEWAY (-0.25m)]       \     |
  |  South-West    \                     Exposed after 3 gates      \    |
  |                 \                                                \   |
  |                  \                                  [TEMPLE GATE] \  |
  +----------------------------------------------------------------------+
  [-70, 70]                                                [70, 70] (SE)
```

---

## 4. Map 4: Neon Flood District (`neon_flood`)

### Spatial Bounds & Overview
- **Bounds**: $x \in [-65, 65]$, $z \in [-55, 55]$ (130m x 110m)
- **Verticality**: Low flooded streets ($-0.9\text{ m}$) vs High Skyways ($+4.5\text{ m}$)
- **Drones**: 4 automated patrol searchlights, lock sirens, EMP counterplay
- **Uplinks**: U1 (Market Skyway), U2 (Server Balcony), U3 (Flooded Subway Kiosk) $\to$ Transit Gate

```text
  [-65, -55]                                                     [65, -55]
  +----------------------------------------------------------------------+
  |                   NORTH TRANSIT GATE ARCH (EXIT)                     |
  |                   [0, 50] (Powered by 3 Uplinks)                     |
  |                     |                         |                      |
  |    +---------+      |      +-----------+      |      +---------+     |
  |    | BLOCK A |   AVENUE 1  |  PLAZA    |   AVENUE 2  | BLOCK B |     |
  |    | (Signs) |      |      | Subway U3 |      |      | (Signs) |     |
  |    +---------+      |      +-----------+      |      +---------+     |
  |    ===== [SKYWAY NETWORK (+4.5m with rails)] ===================     |
  |    +---------+      |      +-----------+      |      +---------+     |
  |    | MARKET  |      |      | CENTRAL   |      |      | SERVER  |     |
  |    | U1 Skyw |      |      | Car jumps |      |      | TOWER   |     |
  |    | Stalls  |      |      | Roof +1.1 |      |      | U2 Balc |     |
  |    +---------+      |      +-----------+      |      +---------+     |
  |                     |                         |                      |
  |    STREET 1         |      STREET 2           |      STREET 3        |
  |                     |                         |                      |
  |    =============================================================     |
  |    SOUTH ROOFTOP / ALLEY SPAWN: [0, -48] (+0.3m dry alley)           |
  +----------------------------------------------------------------------+
  [-65, 55]                                                      [65, 55]
```

---

## 5. Map 5: Platform Zero, The Drowned Metro (`drowned_metro`)

### Spatial Bounds & Overview
- **Bounds**: $x \in [-90, 90]$, $z \in [-30, 30]$ (180m x 60m)
- **Axial Troughs**:
  - P1: South Platform ($z \in [-14, -8]$, $+1.0\text{ m}$)
  - T1: Stalled Train Track ($z \in [-24, -14]$, 6-car train corridor, $+1.3\text{ m}$ interior)
  - P2: Island Platform ($z \in [-8, 0]$, $+1.0\text{ m}$)
  - T2: Express Ghost Train Track ($z \in [0, 10]$, swept kill zone $z \in [3.4, 6.6]$)
  - P3: North Platform & Mezzanine ($z \in [10, 18]$, $+1.0\text{ m} \to +4.2\text{ m}$)
- **Ghost Train**: Approaches every $75 - 95\text{ s}$ masking sound, killing express track occupants / stunning monster.

```text
  [-90, -30] (West Tunnel Mouth)                (East Tunnel Mouth) [90, -30]
  +-------------------------------------------------------------------------+
  | MEZZANINE (+4.2m) - Ticket Hall, Turnstiles, Footbridges at x=-40,0,40  |
  +-------------------------------------------------------------------------+
  | PLATFORM P3 (North Platform, +1.0m)                                     |
  +=========================================================================+
  | TROUGH T2: EXPRESS TRACK (GHOST TRAIN KILL ZONE: z in [3.4, 6.6])       |
  | [L2 Lever] at East End with Refuge Alcove (z=8.5m)                      |
  +=========================================================================+
  | PLATFORM P2 (Island Platform, +1.0m)                                    |
  +=========================================================================+
  | TROUGH T1: STALLED TRAIN TRACK (-0.9m)                                  |
  | [Car 0] [Car 1] [Car 2] [Car 3] [Car 4] [Car 5 (Cab: Depart Node)]       |
  | Interior dry corridor at +1.3m; open doors connecting to P1 & P2        |
  | [L1 Lever] at West End of T1                                            |
  +=========================================================================+
  | PLATFORM P1 (South Platform, +1.0m)                                     |
  | Spawn: x=10, z=-11; Conductor's Cabin at East (Key Pickup: x=55, z=-11) |
  +-------------------------------------------------------------------------+
  [-90, 30]                                                         [90, 30]
```
