/* ── GameSession.ts ─────────────────────────────────────────────────────────
 *  Thin public facade for BackSilence gameplay sessions.
 *  Decomposed under Prompt 9 into modular lifecycle systems in src/game/session/:
 *  - SessionHost (central coordinator)
 *  - SessionStateMachine (formal state machine, deadlock-free)
 *  - DisposalService (leak prevention & disposal law)
 *  - SpawnService (spawn point resolution & G9 validation)
 *  - CaptureService (G5 debug suppression)
 *  - InputRig (player input wiring & 080e262 pointer-lock law)
 *  - CameraRig (camera positioning & depth passes)
 *  - HudBridge (<= 4-element HUD law)
 *  - EncounterBridge (encounter arc & 100% noise-attributable death)
 *  - AnomalyBridge (AnomalyDirector stepping & reality loop relocation)
 *  - ThrowableBridge (pebble ballistics & trajectory preview)
 *  - NetBridge (multiplayer NetSession & remote avatars)
 *  - DebugBridge (debug tools & hotkeys)
 * ──────────────────────────────────────────────────────────────────────── */

import type { Scene, PerspectiveCamera } from 'three';
import type { EngineRenderer } from '../engine/Renderer.js';
import type { PostFX } from '../engine/PostFX.js';
import type { Settings, MapId, Vec3 } from '../types/contracts.js';
import type { SimWorld } from '../sim/SimWorld.js';
import type { EncounterDirector } from '../sim/Director.js';
import type { WaterSystem } from './water/WaterSystem.js';
import type { MonsterManager } from './monster/MonsterManager.js';
import type { ThrowableSystem } from './ThrowableSystem.js';
import type { Hud } from '../ui/Hud.js';
import type { RunResults } from '../ui/ResultsScreen.js';
import type { KeypadModal } from '../ui/KeypadModal.js';
import type { NetSession } from '../net/session/NetSession.js';
import type { MonsterProbeResult } from './monster/MonsterProbe.js';
import { runMonsterProbe } from './monster/MonsterProbe.js';
import type { JumpscareStats } from './monster/Jumpscare.js';
import { SessionHost } from './session/SessionHost.js';
import type { SessionStateMachine } from './session/SessionStateMachine.js';
import type { DisposalService } from './session/DisposalService.js';

export interface GameSessionCallbacks {
  onPause: () => void;
  onDeath: (stats: JumpscareStats) => void;
  onWin: (results: RunResults) => void;
  onExit: () => void;
  onPhotoMode?: () => void;
  onOpenKeypad?: (onSubmit: (code: string) => boolean) => void;
}

export class GameSession {
  private readonly host: SessionHost;

  constructor(
    container: HTMLElement,
    settings: Settings,
    hud: Hud,
    callbacks: GameSessionCallbacks,
    difficulty: 'whisper' | 'normal' | 'deafening' = 'normal',
    seed = 42,
    mapId: MapId = 'poolrooms',
    keypadModal?: KeypadModal,
    netSession?: NetSession,
    subMode?: string,
  ) {
    this.host = new SessionHost(
      container,
      settings,
      hud,
      callbacks,
      difficulty,
      seed,
      mapId,
      keypadModal,
      netSession,
      subMode,
    );

    if (typeof window !== 'undefined') {
      (window as unknown as { __backsilence_session?: unknown }).__backsilence_session = this;
    }
  }

  // ── Public Properties & Delegating Getters ────────────────────────────────

  get initPromise(): Promise<void> {
    return this.host.initPromise;
  }

  get scene(): Scene {
    return this.host.scene;
  }

  get sceneRef(): Scene {
    return this.host.scene;
  }

  get camera(): PerspectiveCamera {
    return this.host.camera;
  }

  get cameraRef(): PerspectiveCamera {
    return this.host.camera;
  }

  get renderer(): EngineRenderer {
    return this.host.renderer;
  }

  get postFX(): PostFX {
    return this.host.postFX;
  }

  get simWorld(): SimWorld {
    return this.host.simWorld;
  }

  get sim(): SimWorld {
    return this.host.simWorld;
  }

  get water(): WaterSystem {
    return this.host.water;
  }

  get waterSystem(): WaterSystem {
    return this.host.water;
  }

  get monsters(): MonsterManager {
    return this.host.monsters;
  }

  get monsterManager(): MonsterManager {
    return this.host.monsters;
  }

  get mapId(): MapId {
    return this.host.mapId;
  }

  get activeDirector(): EncounterDirector {
    return this.host.simWorld?.director;
  }

  get isSessionLoaded(): boolean {
    return this.host.isLoaded;
  }

  get playerPosition(): Vec3 | null {
    if (!this.host.simWorld?.player?.pos) return null;
    const p = this.host.simWorld.player.pos;
    return { x: p.x, y: p.y, z: p.z };
  }

  get sessionHost(): SessionHost {
    return this.host;
  }

  get stateMachine(): SessionStateMachine {
    return this.host.sm;
  }

  get sm(): SessionStateMachine {
    return this.host.sm;
  }

  get disposal(): DisposalService {
    return this.host.disposal;
  }

  get monsterWatchdog() {
    return this.host.monsterWatchdog;
  }

  // ── Public Methods ────────────────────────────────────────────────────────

  update(dt: number): void {
    this.host.update(dt);
  }

  togglePause(): void {
    this.host.togglePause();
  }

  resume(): void {
    this.host.resume();
  }

  restart(sameSeed = true): void {
    this.host.restart(sameSeed);
  }

  reset(sameSeed = true): void {
    this.host.reset(sameSeed);
  }

  getRunTimeMs(): number {
    return this.host.sessionRunTime * 1000;
  }

  setSettings(newSettings: Settings): void {
    this.host.setSettings(newSettings);
  }

  submitKeypadCode(code: string): boolean {
    return this.host.submitKeypadCode(code);
  }

  monsterProbe(): MonsterProbeResult {
    const res = runMonsterProbe(this);
    this.host.lastCachedL4Fraction = res.L4.visibleFraction;
    return res;
  }

  getFirstCreatureSightingTime(): number | null {
    return this.host.firstCreatureSightingTime;
  }

  getSightingStats(): { count: number; lastTime: number; visFrac: number } {
    const dirSnap = this.host.simWorld?.director?.getSnapshot();
    return {
      count: dirSnap?.sightingsCount ?? 0,
      lastTime: dirSnap?.lastSightingTime ?? 0,
      visFrac: 0,
    };
  }

  getThrowableSystem(): ThrowableSystem {
    return this.host.throwableBridge?.throwableSystem;
  }

  dispose(): void {
    if (typeof window !== 'undefined') {
      const g = window as unknown as { __backsilence_session?: unknown };
      if (g.__backsilence_session === this) {
        delete g.__backsilence_session;
      }
    }
    this.host.dispose();
  }
}
