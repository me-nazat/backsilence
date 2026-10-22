# BackSilence — Network Contract & Map Replication Rules

This contract defines the deterministic synchronization requirements for procedural maps and puzzle nodes in **BackSilence**. All map authors (and future map additions in Batch 5) must strictly adhere to these rules.

---

## 1. Core Principles

BackSilence employs a **hybrid synchronization model**:
1. **Time-Derived Deterministic State**: Sinking platforms, tidal water cycles, periodic steam jets, and audio oscillators derive their state deterministically from synchronized simulation time `simTime = (serverNow() - startAtMs) / 1000`. These require **zero network packets** during steady-state gameplay.
2. **Host-Authoritative Discrete State**: Monster AI decision-making (nav paths, patrol targets, aggro shifts), puzzle completion steps (keypad codes, fuse bay insertions, generator startups), and round termination are strictly decided by the host and replicated via discrete `NetEvent` payloads.

---

## 2. Rules for Map Authors

### Rule 1: No Unseeded Randomness (`Math.random()`)
- **Prohibited**: Calling `Math.random()` anywhere inside `build()`, layout generation, or procedural updates.
- **Mandatory**: Use `PRNG(seed)` from `../sim/prng.js`. Two players initialized with the same `(seed, difficulty, playerCount)` tuple MUST produce identical voxel layouts, mesh colliders, and audio trigger volumes.

### Rule 2: Lossless `serialize()` and `hydrate()` on All Interactive Nodes
Every interactive node (valves, bells, keypads, fuse bays, generators) must implement:
```ts
interface SerializablePuzzleNode {
  serialize(): Record<string, unknown>;
  hydrate(state: Record<string, unknown>): void;
}
```
- **Invariant**: `node.hydrate(node.serialize())` must be a perfect, idempotent no-op.
- **Checkpoint Resilience**: When a late-joining or reconnecting client joins mid-round, the host serializes all puzzle states into a `checkpoint` event. The client hydrates them instantly without replay lag.

### Rule 3: Deterministic Time-Based Sinking and Cycles
- Continuous world animations (such as sinking stones in Marble Atrium or tidal flip in Hydro-Filtration Maze) MUST compute displacement as a pure function of `simTime`:
  $$y(t) = y_{\text{base}} + f(t)$$
- Clients do not request platform positions from the host; their local simulation stays frame-accurate thanks to `ClockSync` (drift $< 2\text{ ms}$).

### Rule 4: Host-Only Sustained Noise Broadcasts
- Sustained audio emitters (alarm klaxons, generator rumble, steam hisses, water intake surges) must only be broadcast by the host when state changes occur.
- Clients receiving the state change will trigger local spatial Web Audio voices with identical audio parameters.

### Rule 5: Interaction Radius & Plausibility Verification
- Interactions are validated against the standard interact radius ($R \le 3.0\text{ m}$).
- The host verifies:
  1. Distance between player position and interaction target $\le 3.5\text{ m}$ (allowing for latency envelope).
  2. Rate of puzzle interaction does not exceed physical limits (maximum 10 ops/sec).

---

## 3. Protocol Message Types

| Event Type | Direction | Payload | Guaranteed Delivery |
| :--- | :--- | :--- | :--- |
| `start` | Host $\to$ All | `startAtMs`, `layoutHash`, `playerCount` | Yes (TCP / Reliable DataChannel) |
| `snapshot` | Peer $\to$ All | `pos`, `yaw`, `pitch`, `crouch`, `wet`, `flashlightOn`, `alive`, `t` | No (15 Hz UDP / Unreliable DataChannel) |
| `noise` | Peer $\leftrightarrow$ Host $\leftrightarrow$ All | `NoiseEvent` (kind, pos, loudness, sourcePlayerId) | Yes |
| `ripple` | Peer $\leftrightarrow$ Host $\leftrightarrow$ All | `RippleEvent` (pos, amplitude, radius) | Yes |
| `puzzle_req`| Client $\to$ Host | `PuzzleOp` (opId, puzzleId, action, value, playerId) | Yes |
| `puzzle` | Host $\to$ All | `puzzleId`, `state`, `opId` | Yes |
| `monster` | Host $\to$ All | `id`, `state`, `pos`, `yaw`, `target`, `t` | No (10 Hz periodic) |
| `checkpoint`| Host $\to$ All | Full puzzle and game state snapshot | Yes (every 2s) |
| `death` | Peer $\to$ All | `playerId` | Yes |
| `escape` | Peer $\to$ All | `playerId` | Yes |
| `host_change`| Peer $\to$ All | `hostId` | Yes |

---

## 4. Late-Join and Reconnect Flow

1. Client joins existing room via `joinRoom(code)`.
2. Client checks `room.status`:
   - If game is in progress, client requests catch-up state.
3. Host receives new peer, serializes world state (`broadcastCheckpoint()`), and transmits current `startAtMs`.
4. Client synchronizes clock via 3 NTP round-trips, hydrates all puzzle nodes, and seamlessly enters the game as alive (or spectator if previously deceased).
