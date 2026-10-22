/* ── GameSession.ts ─────────────────────────────────────────────────────────
 *  Full playable game session in the "Proving Grounds" arena.
 *  Integrates 60Hz deterministic sim, character motor, water shader & physics,
 *  blind monster AI with IK presentation, 3D jumpscare sequence, and HUD wiring.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Scene,
  PerspectiveCamera,
  HemisphereLight,
  DirectionalLight,
  FogExp2,
  Vector3,
  Line,
  BufferGeometry,
  LineBasicMaterial,
  Float32BufferAttribute,
} from 'three';
import { EngineRenderer } from '../engine/Renderer.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import type { Settings, NoiseEvent } from '../types/contracts.js';
import { WORLD } from '../app/Config.js';
import { SimWorld } from '../sim/SimWorld.js';
import {
  createProvingGroundsSim,
  ARENA_MONSTER_SPAWN,
} from '../sim/ProvingGroundsData.js';
import { ProvingGrounds } from '../world/arena/ProvingGrounds.js';
import { WaterSystem } from './water/WaterSystem.js';
import { MonsterManager } from './monster/MonsterManager.js';
import { JumpscareSequence, type JumpscareStats } from './monster/Jumpscare.js';
import { PlayerCamera } from './player/PlayerCamera.js';
import { PlayerInput } from './player/PlayerInput.js';
import { PlayerFootsteps } from './player/Footsteps.js';
import { InteractionSystem } from './interaction/InteractionSystem.js';
import { AcousticSystem } from './AcousticSystem.js';
import type { Hud } from '../ui/Hud.js';

export interface GameSessionCallbacks {
  onPause: () => void;
  onDeath: (stats: JumpscareStats) => void;
  onExit: () => void;
}

export class GameSession {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: EngineRenderer;
  private readonly audio = AudioEngine.getInstance();
  private readonly hud: Hud;
  private readonly callbacks: GameSessionCallbacks;

  private settings: Settings;
  private difficulty: 'whisper' | 'normal' | 'deafening';
  private seed: number;

  // Presentation & Sim components
  private map!: ProvingGrounds;
  private simWorld!: SimWorld;
  private water!: WaterSystem;
  private monsters!: MonsterManager;
  private jumpscare!: JumpscareSequence;

  private playerInput!: PlayerInput;
  private playerCamera!: PlayerCamera;
  private footsteps!: PlayerFootsteps;
  private interactions!: InteractionSystem;
  private acoustics!: AcousticSystem;

  // Fixed timestep physics accumulator
  private readonly FIXED_DT = 1 / 60;
  private accumulator = 0;
  private timeScale = 1.0;
  private isPaused = false;
  private isDisposed = false;

  // Stats tracking
  private timeSurvived = 0;
  private noisesMade = 0;
  private closestCall = 999.0;
  private godMode = false;

  // Debug visualizers
  private debugMode = false;
  private pathLine: Line | null = null;
  private hearingRings: { line: Line; age: number; maxAge: number }[] = [];

  constructor(
    container: HTMLElement,
    settings: Settings,
    hud: Hud,
    callbacks: GameSessionCallbacks,
    difficulty: 'whisper' | 'normal' | 'deafening' = 'normal',
    seed = 42,
  ) {
    this.settings = settings;
    this.hud = hud;
    this.callbacks = callbacks;
    this.difficulty = difficulty;
    this.seed = seed;

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(
      settings.graphics.fov,
      container.clientWidth / container.clientHeight,
      0.1,
      80.0,
    );

    this.renderer = new EngineRenderer(container, settings);
    this.setupAtmosphere();
    this.initSession();
    this.setupDebugTools();
  }

  private setupAtmosphere(): void {
    // Creamy backrooms pool fog & warm ambient lighting
    const fogColor = 0xd9d3a2;
    this.scene.fog = new FogExp2(fogColor, 0.038);

    const hemi = new HemisphereLight(0xf5edd6, 0x1a2e22, 0.75);
    this.scene.add(hemi);

    const sun = new DirectionalLight(0xfff8e7, 1.2);
    sun.position.set(20, 40, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    this.scene.add(sun);
  }

  private initSession(): void {
    // 1. Create Simulation World
    this.simWorld = createProvingGroundsSim(this.difficulty);

    // 2. Proving Grounds 3D Map
    this.map = new ProvingGrounds();
    this.scene.add(this.map.root);

    // 3. Water System
    const quality = this.settings.graphics.quality;
    const tier = quality === 'auto' ? 'high' : quality;
    this.water = new WaterSystem(this.scene, {
      scene: this.scene,
      ground: this.map.ground,
      tier,
      waterY: this.map.waterY,
      audio: this.audio,
    });

    // 4. Monster Manager
    this.monsters = new MonsterManager(this.water, this.audio);
    this.scene.add(this.monsters.root);

    // Spawn standard monster
    this.monsters.addMonster({
      id: 'monster_1',
      variant: 'standard',
      spawn: ARENA_MONSTER_SPAWN,
    });

    this.simWorld.addMonster(
      {
        id: 'monster_1',
        variant: 'standard',
        spawn: ARENA_MONSTER_SPAWN,
        spawnGrace: this.difficulty === 'deafening' ? 3.0 : 8.0,
      },
      this.seed,
    );

    // 5. Player presentation & Controls
    this.playerInput = new PlayerInput(this.settings, {
      onPauseRequested: () => this.togglePause(),
    });
    this.playerInput.attach(this.renderer.canvas);

    this.playerCamera = new PlayerCamera(this.camera, this.settings);
    this.footsteps = new PlayerFootsteps(this.audio);
    this.interactions = new InteractionSystem();
    this.acoustics = new AcousticSystem(this.audio, this.hud, this.settings);

    // Register interactive pressure plate on Island B
    this.interactions.register({
      id: 'plate_island_b',
      position: this.map.getPlatePosition(),
      radius: 1.4,
      label: () => '[E] Press Heavy Plate',
      canUse: () => true,
      onUse: () => {
        this.audio.play('door_clunk', { position: this.map.getPlatePosition(), gain: 1.0 });
        this.simWorld.broadcastNoise({
          kind: 'door',
          position: { ...this.map.getPlatePosition() },
          loudness: 0.6,
          t: this.simWorld.getTime(),
          sourcePlayerId: 'world',
        });
      },
    });

    // 6. 3D Jumpscare sequence
    this.jumpscare = new JumpscareSequence(
      {
        onFreezeInput: () => this.playerInput.setFreeze(true),
        setTimeScale: (scale: number) => {
          this.timeScale = scale;
        },
        onDeath: (stats: JumpscareStats) => {
          this.callbacks.onDeath(stats);
        },
      },
      this.audio,
    );

    // Initial HUD State
    this.hud.update({
      objective: 'Reach Island B silently. Avoid alerting the blind beast.',
      status: 'DRY',
      stamina: 1.0,
      noiseLoudness: 0,
    });
  }

  setSettings(newSettings: Settings): void {
    this.settings = newSettings;
    this.renderer.applySettings(newSettings);
    this.playerCamera.setSettings(newSettings);
    this.playerInput.setSettings(newSettings);
    this.acoustics.setSettings(newSettings);
  }

  restart(sameSeed = true): void {
    this.reset(sameSeed);
  }

  reset(sameSeed = true): void {
    if (!sameSeed) {
      this.seed = Math.floor(Math.random() * 100000);
    }
    this.jumpscare.reset();
    this.playerInput.setFreeze(false);

    // Clear monster Presentation
    this.monsters.dispose();
    this.simWorld.monsters.length = 0;

    // Reset SimWorld
    this.simWorld = createProvingGroundsSim(this.difficulty);
    this.monsters.addMonster({
      id: 'monster_1',
      variant: 'standard',
      spawn: ARENA_MONSTER_SPAWN,
    });

    this.simWorld.addMonster(
      {
        id: 'monster_1',
        variant: 'standard',
        spawn: ARENA_MONSTER_SPAWN,
        spawnGrace: 8.0,
      },
      this.seed,
    );

    this.timeSurvived = 0;
    this.noisesMade = 0;
    this.closestCall = 999.0;
    this.timeScale = 1.0;
    this.accumulator = 0;
    this.isPaused = false;

    this.playerInput.requestPointerLock();
  }

  togglePause(): void {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.playerInput.exitPointerLock();
      this.callbacks.onPause();
    } else {
      this.playerInput.requestPointerLock();
    }
  }

  resume(): void {
    this.isPaused = false;
    this.playerInput.requestPointerLock();
  }

  update(dt: number): void {
    if (this.isDisposed || this.isPaused) return;

    // Jumpscare update takes priority if active
    if (this.jumpscare.isActive()) {
      this.jumpscare.update(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const scaledDt = dt * this.timeScale;
    this.accumulator += scaledDt;

    // 1. Poll Player Intent
    const intent = this.playerInput.pollIntent();

    // 2. Fixed Timestep Physics Simulation
    const recentNoises: NoiseEvent[] = [];

    while (this.accumulator >= this.FIXED_DT) {
      // Step character motor and monster brains
      this.simWorld.step(this.FIXED_DT, intent);

      // Drain emitted events
      this.simWorld.events.drain((ev) => {
        if (ev.type === 'noise') {
          recentNoises.push(ev.data);
          if (ev.data.sourcePlayerId !== 'world') {
            this.noisesMade++;
          }
          if (this.debugMode) {
            this.spawnHearingRing(ev.data);
          }
        } else if (ev.type === 'ripple') {
          this.water.onRipple(ev.data);
        }
      });

      this.timeSurvived += this.FIXED_DT;
      this.accumulator -= this.FIXED_DT;
    }

    const renderAlpha = this.accumulator / this.FIXED_DT;

    // 3. Player Camera & Footsteps
    const prevSnap = this.simWorld.player.getPreviousSnapshot();
    const currSnap = this.simWorld.player.getSnapshot();

    this.playerCamera.update(dt, prevSnap, currSnap, renderAlpha);
    this.footsteps.update(currSnap, this.playerCamera.getBobPhase(), this.camera, this.map.waterY);

    // 4. Player Wake in Water
    const playerSpeed = Math.hypot(currSnap.vel.x, currSnap.vel.z);
    if (currSnap.wet && playerSpeed > 0.3) {
      const yaw = currSnap.yaw;
      this.water.wakes.updateSource(
        'player',
        currSnap.pos.x,
        currSnap.pos.z,
        -Math.sin(yaw),
        -Math.cos(yaw),
        playerSpeed,
        0.7,
        1.2,
        5.0,
      );
    } else {
      this.water.wakes.setInactive('player');
    }

    // 5. Monster Presentation & AI Sync
    this.monsters.update(
      dt,
      this.simWorld.monsters,
      this.simWorld.ground,
      this.camera,
      currSnap.pos,
    );

    // Monster Wakes in Water
    for (let i = 0; i < this.simWorld.monsters.length; i++) {
      const mb = this.simWorld.monsters[i]!;
      const mSnap = mb.getSnapshot();
      const mSpeed = Math.hypot(mSnap.vel.x, mSnap.vel.z);
      if (mSpeed > 0.4) {
        this.water.wakes.updateSource(
          mb.id,
          mSnap.pos.x,
          mSnap.pos.z,
          -Math.sin(mSnap.yaw),
          -Math.cos(mSnap.yaw),
          mSpeed,
          0.9,
          2.0,
          9.0,
        );
      } else {
        this.water.wakes.setInactive(mb.id);
      }
    }

    // 6. Closest Call & Monster Attacks
    for (const m of this.simWorld.monsters) {
      const mSnap = m.getSnapshot();
      const dist = Math.hypot(mSnap.pos.x - currSnap.pos.x, mSnap.pos.z - currSnap.pos.z);
      if (dist < this.closestCall) {
        this.closestCall = dist;
      }

      if (mSnap.state === 'ATTACK' && !this.godMode && !this.jumpscare.isActive()) {
        const body = this.monsters.getBody(m.id);
        const headWorld = body
          ? body.mesh.joints.head.getWorldPosition(new Vector3())
          : new Vector3(mSnap.pos.x, mSnap.pos.y + 1.6, mSnap.pos.z);

        const isReducedMotion =
          this.settings.accessibility.reducedMotion === 'on' ||
          (this.settings.accessibility.reducedMotion === 'system' &&
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches);

        this.jumpscare.trigger(
          this.camera,
          headWorld,
          mSnap.yaw,
          {
            timeSurvived: this.timeSurvived,
            noisesMade: this.noisesMade,
            closestCall: this.closestCall,
          },
          isReducedMotion,
        );
        break;
      }
    }

    // 7. Interaction System
    const promptState = this.interactions.update(dt, this.camera, intent.interact);

    // 8. Water System update
    this.water.update(dt, this.simWorld.simTime, this.camera, this.scene.fog as FogExp2);

    // 9. Acoustic System & HUD Feed
    this.acoustics.update(
      dt,
      currSnap.pos,
      currSnap.yaw,
      this.simWorld.monsters,
      recentNoises,
    );

    // HUD Update
    let statusText: 'DRY' | 'WET' | 'CROUCHED' | 'EXHAUSTED' = 'DRY';
    if (currSnap.exhausted) statusText = 'EXHAUSTED';
    else if (currSnap.crouchT > 0.5) statusText = 'CROUCHED';
    else if (currSnap.wet) statusText = 'WET';

    this.hud.update({
      noiseLoudness: currSnap.agitation,
      stamina: currSnap.stamina / 100.0,
      status: statusText,
      interactionPrompt: promptState.visible ? promptState.label : null,
    });

    // 10. Debug visualizations update
    if (this.debugMode) {
      this.updateDebugVisuals(dt);
    }

    // 11. Render Scene
    this.renderer.render(this.scene, this.camera);
  }

  private spawnHearingRing(noise: NoiseEvent): void {
    const radius = Math.max(0.5, noise.loudness * WORLD.AUDIO.MAX_HEAR_RADIUS);
    const segments = 32;
    const points: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      points.push(
        noise.position.x + Math.cos(theta) * radius,
        0.04,
        noise.position.z + Math.sin(theta) * radius,
      );
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(points, 3));
    const mat = new LineBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0.85,
    });
    const line = new Line(geo, mat);
    this.scene.add(line);
    this.hearingRings.push({ line, age: 0, maxAge: 2.0 });
  }

  private setupDebugTools(): void {
    if (typeof window === 'undefined') return;
    const isDebug = new URLSearchParams(window.location.search).get('debug') === '1';
    this.debugMode = isDebug;

    window.addEventListener('keydown', (e) => {
      if (!this.debugMode) return;

      switch (e.code) {
        case 'KeyI':
          this.godMode = !this.godMode;
          this.hud.update({ objective: `DEBUG: God Mode ${this.godMode ? 'ON' : 'OFF'}` });
          break;
        case 'KeyT':
          this.timeScale = this.timeScale === 0.25 ? 1.0 : 0.25;
          break;
        case 'KeyY':
          this.timeScale = this.timeScale === 4.0 ? 1.0 : 4.0;
          break;
        case 'KeyK':
          // Kill all monsters
          this.simWorld.monsters.length = 0;
          this.monsters.dispose();
          this.hud.update({ objective: 'DEBUG: All monsters eliminated' });
          break;
        case 'KeyM': {
          // Spawn monster at player or look position
          const id = `monster_${Date.now()}`;
          const spawnPos = { ...this.simWorld.player.getState().pos };
          spawnPos.x += 6;
          spawnPos.y = -0.9;
          this.monsters.addMonster({ id, variant: 'standard', spawn: spawnPos });
          this.simWorld.addMonster(
            {
              id,
              variant: 'standard',
              spawn: spawnPos,
              spawnGrace: 2.0,
            },
            Math.floor(Math.random() * 1000),
          );
          this.hud.update({ objective: `DEBUG: Spawned monster ${id}` });
          break;
        }
        case 'KeyC': {
          // Teleport player forward 8m
          const snap = this.simWorld.player.getState();
          this.simWorld.player.teleport({
            x: snap.pos.x - Math.sin(snap.yaw) * 8.0,
            y: snap.pos.y,
            z: snap.pos.z - Math.cos(snap.yaw) * 8.0,
          });
          break;
        }
      }
    });

    // Expose simulation API to window.__backsilence.sim
    const g = window as unknown as { __backsilence?: { sim?: unknown } };
    if (g.__backsilence) {
      g.__backsilence.sim = {
        getWorld: () => this.simWorld,
        getPlayer: () => this.simWorld.player,
        getMonsters: () => this.simWorld.monsters,
        setGodMode: (val: boolean) => {
          this.godMode = val;
        },
        setTimeScale: (scale: number) => {
          this.timeScale = scale;
        },
      };
    }
  }

  private updateDebugVisuals(dt: number): void {
    // 1. Update hearing rings
    for (let i = this.hearingRings.length - 1; i >= 0; i--) {
      const ring = this.hearingRings[i]!;
      ring.age += dt;
      const t = ring.age / ring.maxAge;
      if (t >= 1.0) {
        this.scene.remove(ring.line);
        ring.line.geometry.dispose();
        (ring.line.material as LineBasicMaterial).dispose();
        this.hearingRings.splice(i, 1);
      } else {
        const mat = ring.line.material as LineBasicMaterial;
        mat.opacity = 0.85 * (1.0 - t);
      }
    }

    // 2. Monster A* path visualization
    if (this.simWorld.monsters.length === 0) return;
    const primary = this.simWorld.monsters[0]!;
    const path = primary.getCurrentPath();

    if (path.length > 1) {
      const points: number[] = [];
      for (const p of path) {
        points.push(p.x, 0.05, p.z);
      }
      if (!this.pathLine) {
        const geo = new BufferGeometry();
        geo.setAttribute('position', new Float32BufferAttribute(points, 3));
        const mat = new LineBasicMaterial({ color: 0xff3b30, linewidth: 2 });
        this.pathLine = new Line(geo, mat);
        this.scene.add(this.pathLine);
      } else {
        this.pathLine.geometry.dispose();
        this.pathLine.geometry = new BufferGeometry();
        this.pathLine.geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
      }
    }
  }

  dispose(): void {
    this.isDisposed = true;
    for (const ring of this.hearingRings) {
      this.scene.remove(ring.line);
      ring.line.geometry.dispose();
      (ring.line.material as LineBasicMaterial).dispose();
    }
    this.hearingRings.length = 0;
    if (this.pathLine) {
      this.scene.remove(this.pathLine);
      this.pathLine.geometry.dispose();
      (this.pathLine.material as LineBasicMaterial).dispose();
      this.pathLine = null;
    }
    this.jumpscare.dispose();
    this.playerInput.dispose();
    this.footsteps.dispose();
    this.interactions.dispose();
    this.water.dispose();
    this.monsters.dispose();
    this.map.dispose();

    this.renderer.dispose();
  }
}
