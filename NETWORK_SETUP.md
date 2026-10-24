# BackSilence — Network Setup & Provider Guide

This guide details the network architecture, database schemas, security configurations, and adapter integration for **BackSilence** multiplayer co-op.

---

## 1. Architecture Overview

BackSilence multiplayer co-op uses a **Host-Authoritative, Peer-Replicated** topology:
- **Host**: Runs physics simulation, NavGrid pathfinding, monster AI state transitions, and authoritative puzzle reconciliation.
- **Clients**: Extrapolate player movements with hermite interpolation, send player intent/snapshots at 15 Hz, and request puzzle actions (`puzzle_req`).
- **Database Network Adapters**: BackSilence interacts with databases and real-time backends using pure Web standards (`fetch`, `WebSocket`, `EventSource`, `RTCPeerConnection`). **Zero external SDK dependencies** are required.

```
                    ┌─────────────────────────┐
                    │      Host Player        │
                    │   - Authoritative Sim   │
                    │   - Monster AI Tick     │
                    │   - Checkpoints (2s)    │
                    └────────────┬────────────┘
                                 │
                   Broadcast Realtime Events (WS/RTC)
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                                                 ▼
┌───────────────┐                                 ┌───────────────┐
│ Client Player │                                 │ Client Player │
│  - 15Hz Snap  │                                 │  - 15Hz Snap  │
│  - Spectating │                                 │  - Spectating │
└───────────────┘                                 └───────────────┘
```

---

## 2. Supabase Setup (Postgres + Realtime)

Supabase provides room storage via PostgREST and low-latency snapshot/event distribution via Phoenix WebSockets.

### 2.1 Postgres DDL Schema

Execute the following SQL in your Supabase SQL Editor:

```sql
-- 1. Rooms Table
create table if not exists public.backsilence_rooms (
  code text primary key check (char_length(code) = 4),
  map_id text not null,
  seed integer not null,
  max_players integer not null default 4,
  host_id text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  expires_at timestamp with time zone not null
);

-- Index for expiration cleanup
create index if not exists idx_rooms_expires on public.backsilence_rooms (expires_at);

-- 2. Players Table
create table if not exists public.backsilence_players (
  id text not null,
  room_code text not null references public.backsilence_rooms(code) on delete cascade,
  name text not null,
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_seen timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (room_code, id)
);

-- Index for roster queries
create index if not exists idx_players_room on public.backsilence_players (room_code);

-- 3. Row Level Security (RLS)
alter table public.backsilence_rooms enable row level security;
alter table public.backsilence_players enable row level security;

-- Casual-trust policies: allow anonymous read/insert/update/delete with anon key
create policy "Allow anon read rooms" on public.backsilence_rooms
  for select using (true);

create policy "Allow anon insert rooms" on public.backsilence_rooms
  for insert with check (true);

create policy "Allow anon update rooms" on public.backsilence_rooms
  for update using (true);

create policy "Allow anon read players" on public.backsilence_players
  for select using (true);

create policy "Allow anon insert players" on public.backsilence_players
  for insert with check (true);

create policy "Allow anon update players" on public.backsilence_players
  for update using (true);

create policy "Allow anon delete players" on public.backsilence_players
  for delete using (true);

-- 4. Automatic TTL Expiration Cleanup Function
create or replace function public.cleanup_expired_backsilence_rooms()
returns void as $$
begin
  delete from public.backsilence_rooms where expires_at < timezone('utc'::text, now());
end;
$$ language plpgsql security definer;
```

### 2.2 Supabase Environment Variables

In `.env`:
```ini
VITE_NET_PROVIDER=supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

---

## 3. Firebase Realtime Database Setup

Firebase Realtime Database uses REST with `ETag` conditional writes (`if-match: null_etag`) for atomic room reservation and Server-Sent Events (`EventSource`) for real-time synchronization.

### 3.1 Security Rules (`database.rules.json`)

Configure your Realtime Database rules in Firebase Console:

```json
{
  "rules": {
    "backsilence": {
      "rooms": {
        "$roomCode": {
          ".read": true,
          ".write": "!data.exists() || data.child('hostId').val() === auth.uid || newData.child('expiresAt').val() > now",
          ".indexOn": ["expiresAt"]
        }
      },
      "signaling": {
        "$roomCode": {
          ".read": true,
          ".write": true
        }
      }
    }
  }
}
```

### 3.2 Firebase Environment Variables

In `.env`:
```ini
VITE_NET_PROVIDER=firebase
VITE_FIREBASE_DB_URL=https://your-project-default-rtdb.firebaseio.com
```

---

## 4. Turso / libSQL Setup

Turso provides distributed SQLite databases accessible via the HTTP pipeline protocol (`/v2/pipeline`).

### 4.1 SQLite Schema

Execute via `turso db shell <your-db>`:

```sql
create table if not exists backsilence_rooms (
  code text primary key,
  map_id text not null,
  seed integer not null,
  max_players integer not null default 4,
  host_id text not null,
  created_at integer not null,
  expires_at integer not null
);

create table if not exists backsilence_signals (
  id integer primary key autoincrement,
  room_code text not null,
  sender_id text not null,
  type text not null,
  payload text not null,
  created_at integer not null
);

create index if not exists idx_signals_room on backsilence_signals (room_code, id);
```

> [!NOTE]
> Turso/libSQL HTTP requests carry higher latency than WebSockets (~50–120ms roundtrip). Turso is recommended for room creation, matchmaking, and WebRTC signaling exchange, with peer-to-peer data channels carrying gameplay snapshots.

### 4.2 Turso Environment & API Proxy Configuration

> [!CAUTION]
> **Zero-Secret Client Rule:** Never place Turso database tokens in client-side `.env` files or `VITE_*` variables. The browser communicates exclusively via the `/api/*` proxy. See `SECURITY.md` for full credential rotation and hygiene details.

**Client Configuration (`.env.local`):**
```ini
VITE_NET_PROVIDER=turso-proxy
VITE_API_BASE=/api
```

**Server-Side Proxy Configuration (`.env.server` / Hosting Provider Secrets):**
```ini
TURSO_DATABASE_URL=https://your-database-slug.turso.io
TURSO_AUTH_TOKEN=your_server_only_token_here
ALLOWED_ORIGINS=https://yourdomain.com
```

---

## 5. WebRTC Mesh with Database Signaling (`webrtc-db`)

For ultra-low latency snapshot replication (<20ms local/metro), `WebRtcDbAdapter` uses standard WebRTC `RTCDataChannel`:
- **Unreliable / Unordered**: Used for 15 Hz player positions (`maxRetransmits: 0`).
- **Reliable / Ordered**: Used for gameplay events, puzzles, and checkpoints.
- **Signaling**: Exchanged through any configured database (Supabase, Firebase, or Turso) or local memory.
- **NAT Traversal**:
  - By default, uses public STUN servers (`stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302`).
  - **Honest WebRTC Reality**: With STUN only, a significant portion of players behind symmetric NATs, cellular carrier-grade NATs (CGNAT), or strict corporate firewalls **cannot connect peer-to-peer**.
  - **The `/api/ice` Endpoint**: Serves ICE server configuration. When server environment variables `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL` (e.g. from Twilio Network Traversal or Cloudflare Calls) are configured, `/api/ice` returns secure TURN relay credentials. Without them, it falls back to public STUN servers.
  - **10-Second Connection Timeout & Relay Warning**: When connecting to a peer, if `RTCPeerConnection` iceConnectionState does not transition to `'connected'` or `'completed'` within 10 seconds, the client displays a clear in-game warning: *"Direct peer connection could not be established through local NAT"* along with an in-game **"relay unavailable"** badge.
  - **WebSocket Relay Fallback (Optional Cloudflare Durable Object)**: For full relay support when TURN is cost-prohibitive, BackSilence includes an architectural option for a WebSocket relay room on Cloudflare Durable Objects, gated behind feature flag `?ff=relay-do` (cost note: Durable Objects incur active duration charges).
  - **Verification Status**: Live Turso database connectivity, production TURN relays, and physical cross-NAT mobile handshakes are marked **UNVERIFIED** without live paid credentials and physical multi-network test devices.

---


## 6. Implementing a Custom Adapter (5-Step Guide)

You can plug any custom backend (e.g. Cloudflare Durable Objects, Elixir Phoenix, Go websocket server) by implementing `DatabaseNetworkAdapter`:

```ts
import type { DatabaseNetworkAdapter, RoomInfo, NetPlayerSnapshot, NetEvent } from '../types/contracts.js';
import { EventEmitter } from '../net/core/EventEmitter.js';

export class CustomBackendAdapter extends EventEmitter implements DatabaseNetworkAdapter {
  readonly id = 'custom';
  readonly name = 'My Custom Backend';

  // 1. Lifecycle
  async createRoom(opts: CreateRoomOptions): Promise<RoomInfo> { /* ... */ }
  async joinRoom(code: string, opts: JoinRoomOptions): Promise<RoomInfo> { /* ... */ }
  async leaveRoom(): Promise<void> { /* ... */ }
  async disconnect(): Promise<void> { /* ... */ }

  // 2. High-Frequency Outbound Data
  publishSnapshot(snap: NetPlayerSnapshot): void { /* Send binary/JSON via WS */ }

  // 3. Game Events
  publishEvent(event: NetEvent): void { /* Send event payload */ }

  // 4. Inbound Dispatch
  // Trigger this.emit('snapshot', snap), this.emit('event', ev), this.emit('room', room)

  // 5. Registration
  // AdapterRegistry.register('custom', (deps) => new CustomBackendAdapter(deps));
}
```

---

## 7. Security Model & TTL Policy

- **Trust Model**: Casual-co-op trust. The host validates physical bounds and rates; client inputs are sanitized and rate-limited.
- **TTL Limit**: Rooms strictly expire **6 hours** after creation.
- **Rate Limits**: Clients attempting to spam snapshots (>30 Hz) or invalid noise events (>100 dB) are clamped by the host before broadcast.

---

## 8. Manual Verification Checklist

1. **Supabase**: Verify room appears in `backsilence_rooms` upon hosting. Open an incognito window with `?room=CODE` and verify player appears in `backsilence_players`.
2. **Firebase**: Inspect Firebase console data viewer under `/backsilence/rooms/CODE`. Verify real-time presence sync.
3. **Turso**: Run `turso db shell` and query `select * from backsilence_rooms;`. Verify signal cleanup.
4. **LocalTab (`?net=local`)**: Open two tabs in the same browser. Create room in tab 1; join in tab 2. Verify both avatars appear and hear each other's footstep ripples.
