/* ── NetBridge.ts ──────────────────────────────────────────────────────────
 *  Multiplayer networking coordinator:
 *  - NetSession message dispatch and peer state interpolation
 *  - RemotePlayerAvatar rendering and cleanup
 *  - PingMarkerManager integration
 * ──────────────────────────────────────────────────────────────────────── */

import type { Scene, PerspectiveCamera } from 'three';
import type { NetSession, ReplicatedMonsterState } from '../../net/session/NetSession.js';
import { RemotePlayerAvatar } from '../player/RemotePlayerAvatar.js';
import { PingMarkerManager } from '../player/PingMarkerManager.js';
import type { SimWorld } from '../../sim/SimWorld.js';
import type { WaterSystem } from '../water/WaterSystem.js';
import type { AudioEngine } from '../../audio/AudioEngine.js';
import type { HudBridge } from './HudBridge.js';
import { ToastManager } from '../../ui/ToastManager.js';
import type { NoiseEvent, RippleEvent, PlayerId, PuzzleOp, Vec3 } from '../../types/contracts.js';
import type { RosterMember } from '../../ui/Hud.js';

export interface NetBridgeCallbacks {
  onRemotePuzzleOp: (op: PuzzleOp) => void;
  onRoundEndCheck: () => void;
}

export class NetBridge {
  readonly netSession: NetSession | null;
  readonly pingMarkers = new PingMarkerManager();
  private readonly remoteAvatars = new Map<PlayerId, RemotePlayerAvatar>();

  private readonly scene: Scene;
  private readonly simWorld: SimWorld;
  private readonly water: WaterSystem | null;
  private readonly audio: AudioEngine;
  private readonly hudBridge: HudBridge;
  private readonly callbacks: NetBridgeCallbacks;

  constructor(
    netSession: NetSession | null | undefined,
    scene: Scene,
    simWorld: SimWorld,
    water: WaterSystem | null,
    audio: AudioEngine,
    hudBridge: HudBridge,
    callbacks: NetBridgeCallbacks,
  ) {
    this.netSession = netSession ?? null;
    this.scene = scene;
    this.simWorld = simWorld;
    this.water = water;
    this.audio = audio;
    this.hudBridge = hudBridge;
    this.callbacks = callbacks;

    if (this.netSession) {
      this.setupNetCallbacks();
      this.scene.add(this.pingMarkers.root);
    }
  }

  private setupNetCallbacks(): void {
    if (!this.netSession) return;

    this.netSession.setCallbacks({
      onRemoteNoise: (noise: NoiseEvent) => {
        if (noise.kind === 'wade') {
          this.audio.play('wade_step', { gain: Math.min(1.0, noise.loudness * 1.5) });
        } else if (noise.kind === 'jump_in') {
          this.audio.play('splash_jump', { gain: Math.min(1.0, noise.loudness * 1.5) });
        }
        this.updateRosterHud();
      },
      onRemoteRipple: (ripple: RippleEvent) => {
        this.water?.onRipple(ripple);
      },
      onMonsterUpdate: (mState: ReplicatedMonsterState) => {
        if (this.simWorld.mode === 'replica') {
          const brain = this.simWorld.monsters.find((m) => m.id === mState.id);
          if (brain) {
            brain.applyNet({
              id: mState.id,
              state: mState.state,
              pos: mState.pos,
              yaw: mState.yaw,
              target: mState.target,
              t: mState.t,
            });
          }
        }
      },
      onPuzzleSync: (op: PuzzleOp) => {
        this.callbacks.onRemotePuzzleOp(op);
      },
      onPlayerDeath: (pid: PlayerId) => {
        const avatar = this.remoteAvatars.get(pid);
        if (avatar) avatar.root.visible = false;
        this.updateRosterHud();
        this.callbacks.onRoundEndCheck();
      },
      onPlayerEscape: (pid: PlayerId) => {
        const avatar = this.remoteAvatars.get(pid);
        if (avatar) avatar.root.visible = false;
        this.updateRosterHud();
        this.callbacks.onRoundEndCheck();
      },
      onPingMarker: (ping: { owner: PlayerId; position: Vec3; t: number }) => {
        this.pingMarkers.addMarker(ping.owner, ping.position, this.simWorld.simTime);
      },
      onRosterChanged: (room) => {
        this.syncRemoteAvatars(room.players);
        this.updateRosterHud();
      },
      onHostChanged: (newHostId: PlayerId) => {
        ToastManager.getInstance().show(`SIGNAL RECONNECTED — NEW HOST: ${newHostId}`, { type: 'info' });
        if (newHostId === this.netSession?.localPlayerId) {
          this.simWorld.mode = 'host';
        }
      },
    });

    this.updateRosterHud();
  }

  syncRemoteAvatars(players: Array<{ id: PlayerId; name: string; colorIndex?: number | undefined }>): void {
    const present = new Set<PlayerId>();
    for (const p of players) {
      if (p.id === this.netSession?.localPlayerId) continue;
      present.add(p.id);
      if (!this.remoteAvatars.has(p.id)) {
        const avatar = new RemotePlayerAvatar(p.id, p.name, p.colorIndex ?? (this.remoteAvatars.size + 1));
        this.remoteAvatars.set(p.id, avatar);
        this.scene.add(avatar.root);
      }
    }

    for (const [id, avatar] of this.remoteAvatars.entries()) {
      if (!present.has(id)) {
        this.scene.remove(avatar.root);
        avatar.dispose();
        this.remoteAvatars.delete(id);
      }
    }
  }

  update(dt: number, camera: PerspectiveCamera): void {
    if (!this.netSession) return;

    this.netSession.update(dt);

    // 1. Advance remote avatars
    const avatarsWithDist: Array<{ avatar: RemotePlayerAvatar; dist: number }> = [];
    for (const [id, avatar] of this.remoteAvatars.entries()) {
      const peer = this.netSession.remotePlayers.get(id);
      if (peer) {
        avatar.update(
          peer.pos,
          peer.yaw,
          peer.pitch,
          peer.crouch,
          peer.inWater,
          peer.flashlightOn,
          peer.alive,
          camera,
          dt,
        );
        const dist = Math.hypot(peer.pos.x - camera.position.x, peer.pos.z - camera.position.z);
        avatarsWithDist.push({ avatar, dist });
      }
    }

    avatarsWithDist.sort((a, b) => a.dist - b.dist);
    for (let i = 0; i < avatarsWithDist.length; i++) {
      avatarsWithDist[i]!.avatar.setRealSpotlight(i < 2);
    }

    // 2. Advance ping markers
    this.pingMarkers.update(camera, this.simWorld.simTime);
  }

  updateRosterHud(): void {
    if (!this.netSession) return;
    const peers = this.netSession.getRemotePeers();

    const members: RosterMember[] = peers.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.escaped ? 'escaped' : !p.alive ? 'dead' : 'alive',
      colorIndex: p.colorIndex ?? 0,
    }));

    this.hudBridge.updateRosterHud(members);
  }

  handleLocalPing(playerPos: Vec3): void {
    if (!this.netSession) return;
    this.netSession.publishPingMarker(playerPos);
    this.pingMarkers.addMarker(this.netSession.localPlayerId, playerPos, this.simWorld.simTime);
    this.audio.play('ui_confirm', { gain: 0.5 });
  }

  dispose(): void {
    for (const avatar of this.remoteAvatars.values()) {
      this.scene.remove(avatar.root);
      avatar.dispose();
    }
    this.remoteAvatars.clear();
    this.pingMarkers.dispose();
    this.netSession?.dispose();
  }
}
