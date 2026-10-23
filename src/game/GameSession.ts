/* ── GameSession.ts ─────────────────────────────────────────────────────────
 *  Full playable game session supporting all five BackSilence procedural maps:
 *  1. Map 1: The Flooded Poolrooms (archipelago, 4 code pillars + decoys, SequenceKeypad)
 *  2. Map 2: Sub-Aquatic Utility Tunnels (spine & ribs, catwalk clang, steam mask, ValveSequence)
 *  3. Map 3: The Echoing Marble Atrium (atrium tiers, sinking stones, pebble ballistics, ResonanceSequence)
 *  4. Map 4: The Hydro-Filtration Maze (90s tidal flip cycle, 2 NavGrids, FuseCores)
 *  5. Map 5: The Abyssal Drainage Core (total darkness, bioluminescent water, flashlight/crank, 3 beasts, GeneratorGrid)
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Scene,
  PerspectiveCamera,
  HemisphereLight,
  DirectionalLight,
  SpotLight,
  FogExp2,
  Vector3,
  Line,
  BufferGeometry,
  LineBasicMaterial,
  Float32BufferAttribute,
} from 'three';
import { EngineRenderer } from '../engine/Renderer.js';
import { PostFX } from '../engine/PostFX.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import type { Settings, NoiseEvent, RippleEvent, MapId, Vec3, PlayerId, PuzzleOp } from '../types/contracts.js';
import { WORLD } from '../app/Config.js';
import { SimWorld } from '../sim/SimWorld.js';
import type { EncounterDirector } from '../sim/Director.js';
import { WaterSystem } from './water/WaterSystem.js';
import { MonsterManager } from './monster/MonsterManager.js';
import { JumpscareSequence, type JumpscareStats } from './monster/Jumpscare.js';
import { PlayerCamera } from './player/PlayerCamera.js';
import { PlayerInput } from './player/PlayerInput.js';
import { PlayerFootsteps } from './player/Footsteps.js';
import { InteractionSystem } from './interaction/InteractionSystem.js';
import { AcousticSystem } from './AcousticSystem.js';
import type { Hud, InventorySlot, RosterMember } from '../ui/Hud.js';
import type { RunResults, CoOpPlayerResult } from '../ui/ResultsScreen.js';
import type { KeypadModal } from '../ui/KeypadModal.js';
import { getMapDefinition } from '../world/MapRegistry.js';
import { generateValidLayout } from '../world/validate/LayoutValidator.js';
import type { LayoutData, MapDefinition } from '../world/MapTypes.js';
import type { MapInstance } from '../world/maps/MapInstance.js';
import { ProjectileSystem, type ProjectileState } from '../sim/Projectile.js';
import { WaterLevelCycle } from '../sim/WaterLevelCycle.js';
import type { NetSession, ReplicatedMonsterState } from '../net/session/NetSession.js';
import { RemotePlayerAvatar } from './player/RemotePlayerAvatar.js';
import { PingMarkerManager } from './player/PingMarkerManager.js';
import { SpectatorController } from './player/SpectatorController.js';
import { ToastManager } from '../ui/ToastManager.js';

export interface GameSessionCallbacks {
  onPause: () => void;
  onDeath: (stats: JumpscareStats) => void;
  onWin: (results: RunResults) => void;
  onExit: () => void;
  onOpenKeypad?: (onSubmit: (code: string) => boolean) => void;
}

export class GameSession {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: EngineRenderer;
  readonly postFX: PostFX;
  private readonly audio = AudioEngine.getInstance();
  private readonly hud: Hud;
  private readonly callbacks: GameSessionCallbacks;

  private settings: Settings;
  private difficulty: 'whisper' | 'normal' | 'deafening';
  private seed: number;
  private mapId: MapId;
  private keypadModal?: KeypadModal | undefined;

  // Presentation & Sim components
  private mapDef!: MapDefinition;
  private layout!: LayoutData;
  private mapInstance!: MapInstance;
  private simWorld!: SimWorld;
  private water!: WaterSystem;
  private monsters!: MonsterManager;
  private jumpscare!: JumpscareSequence;

  private playerInput!: PlayerInput;
  private playerCamera!: PlayerCamera;
  private footsteps!: PlayerFootsteps;
  private interactions!: InteractionSystem;
  private acoustics!: AcousticSystem;

  // Flashlight & Hand Crank (Map 5 / general item)
  private flashlightLight: SpotLight | null = null;
  private flashlightActive = false;
  private flashlightBattery = 1.0; // 0..1 (150 seconds total life)
  private readonly FLASHLIGHT_MAX_DURATION = 150.0;
  private crankNoiseTimer = 0;

  // Projectiles & Inventory
  private projectileSystem = new ProjectileSystem();
  private activeProjectiles: ProjectileState[] = [];
  private trajectoryLine: Line | null = null;
  private inventory: InventorySlot[] = [];
  private selectedInventoryIndex = 0;

  // Map 1 Puzzle Data
  private inspectedPillars = new Map<number, number>(); // ordinal -> digit
  private exitUnlocked = false;

  // Multiplayer & Replication
  private netSession?: NetSession | undefined;
  private readonly remoteAvatars = new Map<PlayerId, RemotePlayerAvatar>();
  private readonly pingMarkers = new PingMarkerManager();
  private spectatorController!: SpectatorController;
  private isSpectating = false;
  private isDead = false;
  private hasEscaped = false;
  private netSnapshotTimer = 0;
  private netMonsterTimer = 0;

  // Map 2 Puzzle Data (Valves A/B/C)
  private valveOrder: string[] = ['A', 'B', 'C'];
  private currentValveStep = 0;
  private steamVents: Array<{ pos: Vec3; cycleTime: number; timer: number; active: boolean }> = [];
  private catwalkClangTimer = 0;

  // Map 3 Puzzle Data (Resonance Bells)
  private melodyNotes: number[] = [0, 1, 2, 3];
  private melodyProgress = 0;

  // Map 4 Puzzle Data (Hydro Maze Tidal Flip)
  private waterCycle: WaterLevelCycle | null = null;
  private carriedCores = 0;
  private insertedCores = 0;

  // Map 5 Puzzle Data (Generators & Beasts)
  private generators = new Map<string, { state: 'idle' | 'primed' | 'running'; runtime: number; primeProgress: number; pullCount: number }>();
  private allGeneratorsSimultaneousTime = 0;
  private blastDoorsOpen = false;

  // Batch 5 Puzzle & Mechanics Data
  private powerRestored = false;

  // School
  private paCharges = 5;
  private paCooldown = 0;
  private boltCuttersAcquired = false;
  private wobblyChairTimer = 0;
  private isWobblyChairTipping = false;

  // Jungle
  private sluiceStep = 0;
  private sluiceAccuracy = '100%';

  // Neon Flood
  private hackedUplinks = new Set<string>();
  private empCount = 0;
  private stormSprintDistTotal = 0;
  private dronesEmpdCount = 0;

  // Metro
  private conductorKeyAcquired = false;
  private pulledLevers = new Set<string>();
  private bottlesCount = 3;
  private engineStarted = false;
  private boardingTimer = 0;
  private ghostTrainsSurvivedCount = 0;
  private nearMissExpressCount = 0;

  // Batch 5 Per-map stats
  private perchedTimeTotal = 0;
  private wobblyEscapesCount = 0;
  private rapidsCrossedCount = 0;

  // Fixed timestep physics accumulator
  private readonly FIXED_DT = 1 / 60;
  private accumulator = 0;
  private timeScale = 1.0;
  private isPaused = false;
  private isDisposed = false;
  private isWon = false;
  private isLoaded = false;

  // Stats tracking
  private timeSurvived = 0;
  private noisesMade = 0;
  private closestCall = 999.0;
  private alertsCount = 0;
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
    mapId: MapId = 'poolrooms',
    keypadModal?: KeypadModal,
    netSession?: NetSession,
  ) {
    this.settings = settings;
    this.hud = hud;
    this.callbacks = callbacks;
    this.difficulty = difficulty;
    this.seed = seed;
    this.mapId = mapId;
    this.keypadModal = keypadModal;
    this.netSession = netSession;

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(
      settings.graphics.fov,
      container.clientWidth / container.clientHeight,
      0.1,
      mapId === 'drainage_core' ? 60.0 : 85.0,
    );

    this.renderer = new EngineRenderer(container, settings);
    this.postFX = new PostFX(this.renderer.renderer, container, settings, {
      onDegraded: (status) => {
        if (status.reason === 'composer-failed') {
          ToastManager.getInstance().show('Visual effects reduced because post-processing is unavailable.', { type: 'warning' });
        } else if (status.reason === 'low-quality') {
          ToastManager.getInstance().show('Visual effects are using the low-quality CSS fallback.', { type: 'info' });
        }
      },
    });
    if (typeof window !== 'undefined') {
      (window as unknown as { __backsilence_session?: unknown }).__backsilence_session = this;
    }
    this.setupDebugTools();

    // Start async build pipeline
    void this.initAsync();
  }

  private async initAsync(): Promise<void> {
    try {
      this.mapDef = await getMapDefinition(this.mapId);
      const playerCount = this.netSession ? this.netSession.getPlayerCount() : 1;
      this.layout = generateValidLayout(this.mapDef, {
        seed: this.seed,
        difficulty: this.difficulty,
        playerCount,
      });

      // 1. Atmosphere Setup
      this.setupAtmosphere(this.mapDef);
      this.postFX.setPostGrade(this.mapDef.postGrade);
      this.audio.play('tape_insert');
      this.postFX.triggerTracking(0.8);

      // 2. Build 3D Map Presentation & Physical Terrain
      const quality = this.settings.graphics.quality;
      const tier = quality === 'auto' ? 'high' : quality;

      this.mapInstance = await this.mapDef.build(this.layout, {
        parent: this.scene,
        textures: undefined,
        audio: this.audio,
        difficulty: this.difficulty,
      });
      this.scene.add(this.mapInstance.root);

      // 3. SimWorld instantiation
      const playerSpawns = this.layout.spawns.player;
      const spawnIdx = this.netSession ? this.netSession.getLocalPlayerIndex() % playerSpawns.length : 0;
      const playerSpawn = playerSpawns[spawnIdx] ?? { x: 0, y: 1.0, z: 0 };
      let discreteWaterLevels: number[] | undefined;
      let levelProvider: WaterLevelCycle | undefined;

      if (this.mapId === 'hydro_maze') {
        this.waterCycle = new WaterLevelCycle();
        levelProvider = this.waterCycle;
        discreteWaterLevels = [-0.2, 0.55];
      }

      const simMode = this.netSession ? (this.netSession.role === 'client' ? 'replica' : 'host') : 'solo';

      this.simWorld = new SimWorld({
        seed: this.seed,
        bounds: this.layout.bounds,
        playerSpawn,
        waterY: this.mapInstance.waterY,
        waterLevelProvider: levelProvider ?? undefined,
        discreteWaterLevels: discreteWaterLevels ?? undefined,
        difficulty: this.difficulty,
        ground: this.mapInstance.ground,
        colliders: this.mapInstance.colliders,
        mode: simMode,
      });

      // Spectator & Ping setup
      this.spectatorController = new SpectatorController(this.camera);
      this.spectatorController.setBounds({
        minX: this.layout.bounds.minX,
        maxX: this.layout.bounds.maxX,
        minZ: this.layout.bounds.minZ,
        maxZ: this.layout.bounds.maxZ,
        minY: 0.5,
        maxY: 15,
      });
      this.scene.add(this.pingMarkers.root);

      this.hud.setSpectatorCallbacks({
        onLeave: () => this.callbacks.onExit(),
        onCyclePrev: () => {
          if (this.netSession) {
            this.spectatorController.cycleTarget(this.netSession.getRemotePeers(), -1);
            this.updateSpectatorHud();
          }
        },
        onCycleNext: () => {
          if (this.netSession) {
            this.spectatorController.cycleTarget(this.netSession.getRemotePeers(), 1);
            this.updateSpectatorHud();
          }
        },
        onToggleFreeRoam: () => {
          this.spectatorController.toggleFreeRoam();
          this.updateSpectatorHud();
        },
      });

      // 4. Compute terrain distance transform and all level NavGrids FIRST
      this.simWorld.finalizeTerrain();

      // 5. Water System Setup (now has computed distance-to-dry)
      this.water = new WaterSystem(this.scene, {
        scene: this.scene,
        ground: this.simWorld.ground,
        tier,
        waterY: this.mapInstance.waterY,
        audio: this.audio,
        profile: this.mapDef.waterProfile,
      });

      // 6. Monster Presentation & AI Setup (now uses fully built NavGrid)
      this.monsters = new MonsterManager(this.water, this.audio);
      this.scene.add(this.monsters.root);

      for (const mDef of this.layout.spawns.monsters) {
        this.monsters.addMonster({
          id: mDef.id,
          variant: mDef.variant,
          spawn: mDef.spawn,
        });

        this.simWorld.addMonster(
          {
            id: mDef.id,
            variant: mDef.variant,
            spawn: mDef.spawn,
            spawnGrace: this.difficulty === 'deafening' ? 4.0 : 8.0,
          },
          this.seed,
        );
      }

      // 6. Player presentation & Input Controls
      this.playerInput = new PlayerInput(this.settings, {
        onPauseRequested: () => this.togglePause(),
        onCycleItem: () => this.cycleInventory(),
        onToggleFlashlight: () => this.toggleFlashlight(),
        onPing: () => this.handleLocalPing(),
        onSpectateNext: () => {
          if (this.netSession) {
            this.spectatorController.cycleTarget(this.netSession.getRemotePeers(), 1);
            this.updateSpectatorHud();
          }
        },
        onSpectatePrev: () => {
          if (this.netSession) {
            this.spectatorController.cycleTarget(this.netSession.getRemotePeers(), -1);
            this.updateSpectatorHud();
          }
        },
        onSpectateFreeRoamToggle: () => {
          this.spectatorController.toggleFreeRoam();
          this.updateSpectatorHud();
        },
      });
      this.playerInput.attach(this.renderer.canvas);

      this.playerCamera = new PlayerCamera(this.camera, this.settings);
      this.footsteps = new PlayerFootsteps(this.audio);
      this.interactions = new InteractionSystem();
      this.acoustics = new AcousticSystem(this.audio, this.hud, this.settings);

      this.setupNetSession();

      // 7. Flashlight Setup (Map 5)
      if (this.mapId === 'drainage_core') {
        this.flashlightLight = new SpotLight(0xfff8e7, 2.4, 30, (28 * Math.PI) / 180, 0.5, 1.2);
        this.flashlightLight.position.set(0.2, -0.2, 0.1);
        if (tier !== 'low') {
          this.flashlightLight.castShadow = true;
          this.flashlightLight.shadow.mapSize.width = 1024;
          this.flashlightLight.shadow.mapSize.height = 1024;
        }
        this.camera.add(this.flashlightLight);
        this.scene.add(this.camera);
        this.flashlightActive = true;
      }

      // 8. 3D Jumpscare sequence
      this.jumpscare = new JumpscareSequence(
        {
          onFreezeInput: () => this.playerInput.setFreeze(true),
          setTimeScale: (scale: number) => {
            this.timeScale = scale;
          },
          onDeath: (stats: JumpscareStats) => {
            if (this.netSession) {
              this.isDead = true;
              this.netSession.publishDeath();
              this.updateRosterHud();
              const livingPeers = this.netSession.getRemotePeers().filter((p) => p.alive && !p.escaped);
              if (livingPeers.length > 0) {
                this.isSpectating = true;
                this.playerInput.isSpectating = true;
                this.spectatorController.cycleTarget(livingPeers, 1);
                this.updateSpectatorHud();
                this.playerInput.exitPointerLock();
                return;
              }
            }
            this.audio.play('tape_rewind');
            this.postFX.triggerDeathRewind(() => {
              this.callbacks.onDeath(stats);
            });
          },
        },
        this.audio,
      );

      // 9. Map-Specific Mechanics & Puzzle Setup
      this.initMapPuzzles();

      // 10. Audio Reverb & Ambience Bed
      this.audio.setReverbPreset(this.mapDef.reverb);
      this.startMapAmbience();

      // Inventory HUD click binding
      this.hud.setInventoryCycleCallback(() => this.cycleInventory());

      this.isLoaded = true;
    } catch (err: unknown) {
      console.error('[GameSession] Failed to initialize map session:', err);
    }
  }

  private setupAtmosphere(def: MapDefinition): void {
    const fogColor = parseInt(def.atmosphere.fog.color.replace('#', '0x'), 16);
    this.scene.fog = new FogExp2(fogColor, def.atmosphere.fog.density);

    const skyColor = parseInt(def.atmosphere.hemisphere.sky.replace('#', '0x'), 16);
    const groundColor = parseInt(def.atmosphere.hemisphere.ground.replace('#', '0x'), 16);
    const hemi = new HemisphereLight(skyColor, groundColor, 0.75);
    this.scene.add(hemi);

    if (def.atmosphere.sun) {
      const sunColor = parseInt(def.atmosphere.sun.color.replace('#', '0x'), 16);
      const sun = new DirectionalLight(sunColor, def.atmosphere.sun.intensity);
      const dir = def.atmosphere.sun.direction;
      sun.position.set(dir.x * 30, dir.y * 30, dir.z * 30);
      if (def.atmosphere.sun.castShadow) {
        sun.castShadow = true;
        sun.shadow.mapSize.width = 1024;
        sun.shadow.mapSize.height = 1024;
      }
      this.scene.add(sun);
    }
  }

  private startMapAmbience(): void {
    if (this.mapId === 'utility_tunnels') {
      this.audio.play('ambience_tunnels', { gain: 0.65 });
    } else if (this.mapId === 'marble_atrium') {
      this.audio.play('ambience_atrium', { gain: 0.65 });
    } else if (this.mapId === 'hydro_maze') {
      this.audio.play('ambience_filtration', { gain: 0.65 });
    } else if (this.mapId === 'drainage_core') {
      this.audio.play('ambience_drain', { gain: 0.7 });
    } else if (this.mapId === 'drowned_school') {
      this.audio.play('ambience_school', { gain: 0.65 });
    } else if (this.mapId === 'sunken_jungle') {
      this.audio.play('ambience_jungle', { gain: 0.65 });
    } else if (this.mapId === 'neon_flood') {
      this.audio.play('rain_loop', { gain: 0.65 });
    } else if (this.mapId === 'drowned_metro') {
      this.audio.play('rail_sing_loop', { gain: 0.65 });
    } else {
      this.audio.play('lap_loop', { gain: 0.65 });
    }
  }

  private initMapPuzzles(): void {
    switch (this.mapId) {
      case 'poolrooms': {
        this.hud.update({
          objective: 'Inspect numbered pillars to discover the 4-digit code. Avoid making splashes.',
          notebookNumbers: ['#1: ?', '#2: ?', '#3: ?', '#4: ?'],
        });

        // Register keypad at exit door
        this.interactions.register({
          id: 'exit_keypad',
          position: this.layout.exit.position,
          radius: 2.2,
          label: () => (this.exitUnlocked ? '[E] Exit Unlocked' : '[E] Enter 4-Digit Keypad Code'),
          canUse: () => !this.exitUnlocked,
          onUse: () => {
            this.openKeypad();
          },
        });
        break;
      }

      case 'utility_tunnels': {
        this.valveOrder = (this.layout.meta['valveOrder'] as string[]) ?? ['A', 'B', 'C'];
        this.hud.update({
          objective: 'Read pipe diagram on the spine wall. Turn valves in specified sequence (Valves 0/3).',
        });

        // Initialize 4 steam vents
        for (let i = 0; i < 4; i++) {
          this.steamVents.push({
            pos: { x: 15 + i * 20, y: 2.0, z: i % 2 === 0 ? 3.0 : -3.0 },
            cycleTime: 18 + i * 4,
            timer: 0,
            active: false,
          });
        }

        // Register 3 valves
        for (const vLetter of ['A', 'B', 'C']) {
          const vProp = this.layout.props.find((p) => p.kind === 'valve_wheel' && (p.params?.['id'] as string)?.includes(vLetter.toLowerCase()));
          const vPos = vProp?.position ?? { x: 20 + ['A', 'B', 'C'].indexOf(vLetter) * 25, y: 0.5, z: 8.0 };

          this.interactions.register({
            id: `valve_${vLetter}`,
            position: vPos,
            radius: 2.0,
            holdTime: 4.0,
            label: () => `[HOLD E] Turn Valve ${vLetter}`,
            canUse: () => true,
            onUse: () => {
              this.handleValveComplete(vLetter, vPos);
            },
          });
        }

        // Main gate at end of spine
        this.interactions.register({
          id: 'tunnel_main_gate',
          position: this.layout.exit.position,
          radius: 2.5,
          holdTime: 5.0,
          label: () => (this.currentValveStep >= 3 ? '[HOLD E] Turn Main Gate Wheel' : '[LOCKED] Turn All 3 Valves First'),
          canUse: () => this.currentValveStep >= 3 && !this.exitUnlocked,
          onUse: () => {
            this.exitUnlocked = true;
            this.audio.play('door_clunk', { gain: 1.0 });
            this.simWorld.broadcastNoise({
              kind: 'door',
              position: this.layout.exit.position,
              loudness: 0.8,
              sourcePlayerId: 'player_local',
            });
            this.hud.update({ objective: 'Main gate opened! Reach the exit.' });
          },
        });
        break;
      }

      case 'marble_atrium': {
        this.melodyNotes = (this.layout.meta['melodyNotes'] as number[]) ?? [0, 1, 2, 3];
        this.inventory = [{ kind: 'pebble', count: 3 }];
        this.hud.update({
          objective: 'Listen to the melody at the central fountain console. Ring bells in harmony (Bells 0/4).',
          inventory: this.inventory,
          selectedItemIndex: 0,
        });

        // Fountain console
        const consolePos = { x: 0, y: 0.3, z: 0 };
        this.interactions.register({
          id: 'melody_console',
          position: consolePos,
          radius: 2.4,
          label: () => '[E] Play Resonance Melody',
          canUse: () => true,
          onUse: () => {
            this.playMelodyAudio();
            this.simWorld.broadcastNoise({
              kind: 'bell',
              position: consolePos,
              loudness: 0.15,
              sourcePlayerId: 'world',
            });
            this.hud.update({ objective: `Melody: ${this.melodyNotes.map((n) => `[Note ${n + 1}]`).join(' ')}` });
          },
        });

        // 4 Bells
        const bellProps = this.layout.props.filter((p) => p.kind === 'bell');
        bellProps.forEach((bp, idx) => {
          this.interactions.register({
            id: `bell_${idx}`,
            position: bp.position,
            radius: 2.0,
            label: () => `[E] Ring Bell ${idx + 1}`,
            canUse: () => !this.exitUnlocked,
            onUse: () => {
              this.handleBellRung(idx, bp.position);
            },
          });
        });

        // Pebble piles
        for (let i = 0; i < 15; i++) {
          const angle = (i / 15) * Math.PI * 2;
          const r = 16 + (i % 3) * 8;
          const pPos = { x: Math.cos(angle) * r, y: 0.3, z: Math.sin(angle) * r };
          this.interactions.register({
            id: `pebble_pile_${i}`,
            position: pPos,
            radius: 1.8,
            label: () => '[E] Collect Pebbles',
            canUse: () => {
              const currentPebbles = this.inventory.find((it) => it.kind === 'pebble')?.count ?? 0;
              return currentPebbles < 6;
            },
            onUse: () => {
              let slot = this.inventory.find((it) => it.kind === 'pebble');
              if (!slot) {
                slot = { kind: 'pebble', count: 0 };
                this.inventory.push(slot);
              }
              slot.count = Math.min(6, slot.count + 2);
              this.audio.play('stone_creak', { gain: 0.4 });
              this.hud.update({ inventory: this.inventory });
              this.interactions.unregister(`pebble_pile_${i}`);
            },
          });
        }
        break;
      }

      case 'hydro_maze': {
        this.hud.update({
          objective: 'Retrieve 3 Fuse Cores from upper walkways. Insert them into the central Fuse Bay (0/3).',
        });

        // 3 Fuse Core Pedestals
        const coreProps = this.layout.props.filter((p) => p.kind === 'fuse_core');
        coreProps.forEach((cp, idx) => {
          this.interactions.register({
            id: `fuse_core_${idx}`,
            position: cp.position,
            radius: 1.8,
            holdTime: 1.0,
            label: () => `[HOLD E] Lift Fuse Core #${idx + 1}`,
            canUse: () => true,
            onUse: () => {
              this.carriedCores++;
              this.audio.play('socket_clunk', { gain: 0.8 });
              this.interactions.unregister(`fuse_core_${idx}`);
              this.hud.update({
                objective: `Cores carried: ${this.carriedCores} (Inserted: ${this.insertedCores}/3)`,
              });
            },
          });
        });

        // Central Fuse Bay
        const bayPos = { x: 0, y: 0.3, z: 0 };
        this.interactions.register({
          id: 'fuse_bay',
          position: bayPos,
          radius: 2.4,
          label: () => (this.carriedCores > 0 ? '[E] Insert Fuse Core into Bay' : '[EMPTY] Bring Fuse Cores Here'),
          canUse: () => this.carriedCores > 0,
          onUse: () => {
            this.carriedCores--;
            this.insertedCores++;
            this.audio.play('socket_clunk', { gain: 1.0 });
            this.simWorld.broadcastNoise({
              kind: 'door',
              position: bayPos,
              loudness: 0.4,
              sourcePlayerId: 'player_local',
            });
            if (this.insertedCores >= 3) {
              this.exitUnlocked = true;
              this.audio.play('shutter_rumble', { gain: 1.0 });
              this.simWorld.broadcastNoise({
                kind: 'door',
                position: this.layout.exit.position,
                loudness: 0.7,
                sourcePlayerId: 'world',
              });
              this.hud.update({ objective: 'Exit shutter powered and opened! Escape the filtration maze.' });
            } else {
              this.hud.update({
                objective: `Fuse Bay: ${this.insertedCores}/3 Cores Installed.`,
              });
            }
          },
        });
        break;
      }

      case 'drainage_core': {
        this.inventory = [{ kind: 'noisemaker', count: 2 }];
        this.hud.update({
          objective: 'Prime and start all 3 Core Generators. Keep them running simultaneously for 5s to open the Blast Doors.',
          inventory: this.inventory,
          flashlight: { active: this.flashlightActive, battery: this.flashlightBattery },
        });

        for (const genId of ['G1', 'G2', 'G3']) {
          this.generators.set(genId, {
            state: 'idle',
            runtime: 0,
            primeProgress: 0,
            pullCount: 0,
          });

          const gProp = this.layout.props.find((p) => p.kind === 'generator' && (p.params?.['id'] as string)?.includes(genId.toLowerCase()));
          const gPos = gProp?.position ?? { x: 30, y: 0.3, z: 30 };

          this.interactions.register({
            id: `gen_${genId}`,
            position: gPos,
            radius: 2.5,
            holdTime: 6.0,
            label: () => {
              const g = this.generators.get(genId)!;
              if (g.state === 'running') return `[RUNNING] Generator ${genId} (${Math.ceil(g.runtime)}s left)`;
              return `[HOLD E] Prime Generator ${genId}`;
            },
            canUse: () => {
              const g = this.generators.get(genId);
              return g !== undefined && g.state !== 'running';
            },
            onUse: () => {
              const g = this.generators.get(genId)!;
              g.state = 'running';
              g.runtime = 90.0;
              this.audio.play('generator_cord', { gain: 0.9 });
              this.audio.play('generator_loop', { gain: 0.9 });
              this.simWorld.broadcastNoise({
                kind: 'generator',
                position: gPos,
                loudness: 0.9,
                sourcePlayerId: 'world',
              });
              this.hud.update({
                objective: `Generator ${genId} online! Start the remaining generators.`,
              });
            },
          });
        }
        break;
      }

      case 'natatorium': {
        this.hud.update({
          objective: 'Locate 4 ordinal pillars on the Ear mosaic. Restore power at Plant Room Drain Wheel, then enter keypad code.',
          notebookNumbers: ['#1: ?', '#2: ?', '#3: ?', '#4: ?'],
        });

        const wheelProp = this.layout.props.find((p) => p.kind === 'drain_wheel');
        const wheelPos = wheelProp?.position ?? { x: 0, y: 0.3, z: -48 };
        this.interactions.register({
          id: 'drain_wheel',
          position: wheelPos,
          radius: 2.5,
          holdTime: 6.0,
          label: () => (this.powerRestored ? '[POWER ON] Drain Wheel Locked' : '[HOLD E] Restore Power via Drain Wheel'),
          canUse: () => !this.powerRestored,
          onUse: () => {
            this.powerRestored = true;
            this.audio.play('door_clunk', { gain: 1.0 });
            this.simWorld.broadcastNoise({
              kind: 'creak',
              position: wheelPos,
              loudness: 0.8,
              sourcePlayerId: 'player_local',
            });
            this.hud.update({
              objective: 'Power restored! Enter the 4-digit code at the North Grand Doors keypad.',
            });
          },
        });

        this.interactions.register({
          id: 'exit_keypad',
          position: this.layout.exit.position,
          radius: 2.4,
          label: () => (!this.powerRestored ? '[UNPOWERED] Restore Power at Plant Room' : this.exitUnlocked ? '[E] Exit Open' : '[E] Enter 4-Digit Keypad Code'),
          canUse: () => this.powerRestored && !this.exitUnlocked,
          onUse: () => {
            this.openKeypad();
          },
        });
        break;
      }

      case 'drowned_school': {
        this.hud.update({
          objective: 'Find Janitor Bolt Cutters in locker. Use PA Console to lure beast away, then cut lobby door chains.',
          tideLevel: 0.0,
          paStatus: { charges: this.paCharges, maxCharges: 5, cooldownRemaining: 0 },
        });

        const lockers = this.layout.props.filter((p) => p.kind === 'locker');
        lockers.forEach((l, idx) => {
          let opened = false;
          this.interactions.register({
            id: `locker_${idx}`,
            position: l.position,
            radius: 2.0,
            holdTime: 3.0,
            label: () => (opened ? '[EMPTY] Locker' : '[HOLD E: QUIET | TAP: FAST] Search Locker'),
            canUse: () => !opened,
            onUse: () => {
              opened = true;
              this.audio.play('locker_open_careful', { gain: 0.6 });
              this.simWorld.broadcastNoise({
                kind: 'locker',
                position: l.position,
                loudness: 0.15,
                sourcePlayerId: 'player_local',
              });
              if (idx === 1 || lockers.length <= 1) {
                this.boltCuttersAcquired = true;
                this.audio.play('chain_grind_loop', { gain: 0.5 });
                this.hud.update({
                  objective: 'Bolt Cutters acquired! Cut chains on the Lobby Exit Doors.',
                });
              } else {
                this.hud.update({ objective: 'Locker empty. Continue searching.' });
              }
            },
          });
        });

        const registerProp = this.layout.props.find((p) => p.kind === 'library_register');
        if (registerProp) {
          this.interactions.register({
            id: 'library_register',
            position: registerProp.position,
            radius: 2.0,
            label: () => '[E] Read Class Register (Initials: B.C. = Janitor Locker)',
            canUse: () => true,
            onUse: () => {
              this.audio.play('ui_click');
              this.hud.update({
                objective: 'Register Note: "Janitor B.C. keeps cutters in Locker #2".',
              });
            },
          });
        }

        const paProp = this.layout.props.find((p) => p.kind === 'pa_console');
        const paPos = paProp?.position ?? { x: -35, y: 0.4, z: -15 };
        this.interactions.register({
          id: 'pa_console',
          position: paPos,
          radius: 2.4,
          label: () => (this.paCharges > 0 && this.paCooldown <= 0 ? `[E] Broadcast PA Lure (${this.paCharges} Left)` : '[COOLDOWN / EMPTY] PA Console'),
          canUse: () => this.paCharges > 0 && this.paCooldown <= 0,
          onUse: () => {
            this.paCharges--;
            this.paCooldown = 15.0;
            this.audio.play('pa_chime', { gain: 0.9 });
            setTimeout(() => this.audio.play('pa_blast', { gain: 0.95 }), 400);
            const lurePos = { x: 30, y: 0.3, z: 15 };
            this.simWorld.broadcastNoise({
              kind: 'siren',
              position: lurePos,
              loudness: 0.95,
              sourcePlayerId: 'world',
            });
            this.hud.update({
              objective: 'PA Announcement sounding in Gymnasium! Monsters lured away.',
              paStatus: { charges: this.paCharges, maxCharges: 5, cooldownRemaining: 15.0 },
            });
          },
        });

        this.interactions.register({
          id: 'chained_lobby_doors',
          position: this.layout.exit.position,
          radius: 2.5,
          holdTime: 6.0,
          label: () => (this.exitUnlocked ? '[E] Doors Unchained' : this.boltCuttersAcquired ? '[HOLD E] Cut Door Chains' : '[LOCKED] Requires Bolt Cutters'),
          canUse: () => this.boltCuttersAcquired && !this.exitUnlocked,
          onUse: () => {
            this.exitUnlocked = true;
            this.audio.play('chain_grind_loop', { gain: 1.0 });
            this.simWorld.broadcastNoise({
              kind: 'chain',
              position: this.layout.exit.position,
              loudness: 0.45,
              sourcePlayerId: 'player_local',
            });
            this.hud.update({ objective: 'Chains cut! Push open lobby doors to escape.' });
          },
        });
        break;
      }

      case 'sunken_jungle': {
        this.hud.update({
          objective: 'Turn 3 Sluice Wheels from upstream to downstream (S1 -> S2 -> S3) to lower the river.',
          sluiceGatesRemaining: 3,
          riverFlow: { angleRad: 0.785, speed: 1.4 },
          faunaHushState: 'safe',
        });

        for (let sIdx = 1; sIdx <= 3; sIdx++) {
          const sProp = this.layout.props.find((p) => p.kind === 'sluice_wheel' && (p.params?.['index'] === sIdx || (p.params?.['id'] as string)?.includes(String(sIdx))));
          const sPos = sProp?.position ?? { x: -30 + sIdx * 25, y: 0.5, z: -30 + sIdx * 25 };

          this.interactions.register({
            id: `sluice_${sIdx}`,
            position: sPos,
            radius: 2.2,
            holdTime: 4.0,
            label: () => `[HOLD E] Align Sluice Wheel S${sIdx}`,
            canUse: () => true,
            onUse: () => {
              if (sIdx === this.sluiceStep + 1) {
                this.sluiceStep++;
                this.audio.play('door_clunk', { gain: 0.8 });
                this.simWorld.broadcastNoise({
                  kind: 'creak',
                  position: sPos,
                  loudness: 0.4,
                  sourcePlayerId: 'player_local',
                });
                if (this.sluiceStep >= 3) {
                  this.exitUnlocked = true;
                  this.audio.play('shutter_rumble', { gain: 1.0 });
                  this.hud.update({
                    objective: 'All 3 Sluices aligned! Ancient Causeway exposed. Enter Temple Gate!',
                    sluiceGatesRemaining: 0,
                  });
                } else {
                  this.hud.update({
                    objective: `Sluice S${sIdx} open! Water dropping. Locate Sluice S${this.sluiceStep + 1}.`,
                    sluiceGatesRemaining: 3 - this.sluiceStep,
                  });
                }
              } else {
                this.sluiceStep = 0;
                this.sluiceAccuracy = 'Mistakes made';
                this.audio.play('waterfall_loop', { gain: 1.0 });
                this.simWorld.broadcastNoise({
                  kind: 'splash',
                  position: sPos,
                  loudness: 0.9,
                  sourcePlayerId: 'world',
                });
                this.hud.update({
                  objective: 'FLASH FLOOD! Sluice wheels reset. Turn upstream S1 first!',
                  sluiceGatesRemaining: 3,
                });
              }
            },
          });
        }
        break;
      }

      case 'neon_flood': {
        this.empCount = 2;
        this.hud.update({
          objective: 'Hack 3 Uplink Terminals across high skyways and subway during storm windows.',
          uplinksRemaining: 3,
          empCount: this.empCount,
          stormWindow: { active: false, timeRemaining: 0, nextStormIn: 25.0 },
        });

        for (let uIdx = 1; uIdx <= 3; uIdx++) {
          const uProp = this.layout.props.find((p) => p.kind === 'uplink_terminal' && (p.params?.['index'] === uIdx || (p.params?.['id'] as string)?.includes(String(uIdx))));
          const uPos = uProp?.position ?? { x: (uIdx - 2) * 20, y: 0.5, z: (uIdx - 2) * 20 };

          this.interactions.register({
            id: `uplink_${uIdx}`,
            position: uPos,
            radius: 2.2,
            holdTime: 3.5,
            label: () => (this.hackedUplinks.has(`u_${uIdx}`) ? '[ONLINE] Uplink Hacked' : `[HOLD E] Hack Uplink Terminal #${uIdx}`),
            canUse: () => !this.hackedUplinks.has(`u_${uIdx}`),
            onUse: () => {
              this.hackedUplinks.add(`u_${uIdx}`);
              this.audio.play('hack_success', { gain: 0.9 });
              this.simWorld.broadcastNoise({
                kind: 'terminal',
                position: uPos,
                loudness: 0.2,
                sourcePlayerId: 'player_local',
              });
              if (this.hackedUplinks.size >= 3) {
                this.exitUnlocked = true;
                this.audio.play('siren_wail', { gain: 0.7 });
                this.hud.update({
                  objective: 'Grid synchronized! North Transit Gate neon arch powered. Escape!',
                  uplinksRemaining: 0,
                });
              } else {
                this.hud.update({
                  objective: `Uplink #${uIdx} synchronized (${this.hackedUplinks.size}/3 complete).`,
                  uplinksRemaining: 3 - this.hackedUplinks.size,
                });
              }
            },
          });
        }
        break;
      }

      case 'drowned_metro': {
        this.bottlesCount = 3;
        this.hud.update({
          objective: 'Find Conductor Key, pull 2 track levers (mind the Ghost Train!), and board Stalled Car 5.',
          ghostTrainSchedule: { timeToTrain: 45.0, trainDurationRemaining: 0, active: false, warning: false },
          bottleCount: this.bottlesCount,
        });

        const keyProp = this.layout.props.find((p) => p.kind === 'conductor_key');
        const keyPos = keyProp?.position ?? { x: 55, y: 1.0, z: -11 };
        this.interactions.register({
          id: 'conductor_key',
          position: keyPos,
          radius: 2.0,
          label: () => (this.conductorKeyAcquired ? '[EMPTY] Cabin Desk' : '[E] Pick up Conductor Key'),
          canUse: () => !this.conductorKeyAcquired,
          onUse: () => {
            this.conductorKeyAcquired = true;
            this.audio.play('ui_click');
            this.hud.update({ objective: 'Conductor Key acquired! Pull both track levers.' });
          },
        });

        for (let lIdx = 1; lIdx <= 2; lIdx++) {
          const lProp = this.layout.props.find((p) => p.kind === 'track_lever' && (p.params?.['index'] === lIdx || (p.params?.['id'] as string)?.includes(String(lIdx))));
          const lPos = lProp?.position ?? { x: lIdx === 1 ? -45 : 45, y: 0.5, z: lIdx === 1 ? -19 : 7 };

          this.interactions.register({
            id: `metro_lever_${lIdx}`,
            position: lPos,
            radius: 2.2,
            holdTime: 3.0,
            label: () => (this.pulledLevers.has(`l_${lIdx}`) ? '[ALIGNED] Lever Pulled' : `[HOLD E] Switch Track Lever #${lIdx}`),
            canUse: () => !this.pulledLevers.has(`l_${lIdx}`),
            onUse: () => {
              this.pulledLevers.add(`l_${lIdx}`);
              this.audio.play('lever_clunk', { gain: 0.9 });
              this.simWorld.broadcastNoise({
                kind: 'lever',
                position: lPos,
                loudness: 0.5,
                sourcePlayerId: 'player_local',
              });
              this.hud.update({
                objective: `Lever #${lIdx} engaged (${this.pulledLevers.size}/2 switched).`,
              });
            },
          });
        }

        const cabProp = this.layout.props.find((p) => p.kind === 'cab_throttle');
        const cabPos = cabProp?.position ?? { x: 45, y: 1.3, z: -19 };
        this.interactions.register({
          id: 'cab_throttle',
          position: cabPos,
          radius: 2.5,
          holdTime: 8.0,
          label: () => {
            if (this.engineStarted) return '[DEPARTING] All Aboard!';
            if (!this.conductorKeyAcquired) return '[LOCKED] Requires Conductor Key';
            if (this.pulledLevers.size < 2) return '[LOCKED] Pull Both Track Levers First';
            return '[HOLD E] Engage Engine Throttle (8s)';
          },
          canUse: () => this.conductorKeyAcquired && this.pulledLevers.size >= 2 && !this.engineStarted,
          onUse: () => {
            this.engineStarted = true;
            this.boardingTimer = 20.0;
            this.audio.play('train_horn', { gain: 1.0 });
            this.audio.play('train_rumble_loop', { gain: 0.85 });
            this.simWorld.broadcastNoise({
              kind: 'train',
              position: cabPos,
              loudness: 0.95,
              sourcePlayerId: 'world',
            });
            this.hud.update({
              objective: 'ENGINE ROARING! 20s boarding departure countdown started. BOARD CAR 5!',
              boardingCountdown: 20.0,
            });
          },
        });
        break;
      }
    }
  }

  private openKeypad(): void {
    if (this.keypadModal) {
      this.playerInput.exitPointerLock();
      this.keypadModal.open();
    } else if (this.callbacks.onOpenKeypad) {
      this.playerInput.exitPointerLock();
      this.callbacks.onOpenKeypad((code: string) => this.submitKeypadCode(code));
    }
  }

  submitKeypadCode(code: string): boolean {
    const expected = (this.layout.meta['code'] as string) ?? '1234';
    if (code === expected) {
      this.exitUnlocked = true;
      this.audio.play('door_clunk', { gain: 1.0 });
      this.simWorld.broadcastNoise({
        kind: 'door',
        position: this.layout.exit.position,
        loudness: 0.7,
        sourcePlayerId: 'player_local',
      });
      this.hud.update({ objective: 'Access granted! Proceed through the open door.' });
      return true;
    } else {
      // Wrong code -> alarm noise 0.8 at keypad, beast hears it!
      this.simWorld.broadcastNoise({
        kind: 'alarm',
        position: this.layout.exit.position,
        loudness: 0.8,
        sourcePlayerId: 'player_local',
      });
      return false;
    }
  }

  private handleValveComplete(vLetter: string, pos: Vec3): void {
    const expected = this.valveOrder[this.currentValveStep];
    if (vLetter === expected) {
      this.currentValveStep++;
      this.audio.play('valve_release', { gain: 0.9 });
      this.hud.update({ objective: `Valves Turned: ${this.currentValveStep}/3 in sequence.` });
    } else {
      // Wrong order surge!
      this.currentValveStep = 0;
      this.audio.play('alarm_klaxon', { gain: 1.0 });
      this.simWorld.broadcastNoise({
        kind: 'alarm',
        position: pos,
        loudness: 0.9,
        sourcePlayerId: 'world',
      });
      this.hud.update({ objective: 'SURGE! Valves reset to zero. Consult pipe diagram.' });
    }
  }

  private playMelodyAudio(): void {
    this.melodyNotes.forEach((note, idx) => {
      setTimeout(() => {
        this.audio.play('bell', { gain: 0.35, pitch: 1.0 + note * 0.1 });
      }, idx * 600);
    });
  }

  private handleBellRung(bellIdx: number, pos: Vec3): void {
    const expected = this.melodyNotes[this.melodyProgress];
    this.audio.play('bell', { gain: 0.9, pitch: 1.0 + bellIdx * 0.1 });
    this.simWorld.broadcastNoise({
      kind: 'bell',
      position: pos,
      loudness: 0.9,
      sourcePlayerId: 'player_local',
    });

    if (bellIdx === expected) {
      this.melodyProgress++;
      if (this.melodyProgress >= 4) {
        this.exitUnlocked = true;
        this.audio.play('shutter_rumble', { gain: 1.0 });
        this.simWorld.broadcastNoise({
          kind: 'door',
          position: this.layout.exit.position,
          loudness: 0.7,
          sourcePlayerId: 'world',
        });
        this.hud.update({ objective: 'Harmonic resonance achieved! The exit gate is open.' });
      } else {
        this.hud.update({ objective: `Resonance Sequence: ${this.melodyProgress}/4 bells matched.` });
      }
    } else {
      // Wrong bell -> reset
      this.melodyProgress = 0;
      this.audio.play('door_clunk', { gain: 0.6 });
      this.simWorld.broadcastNoise({
        kind: 'alarm',
        position: pos,
        loudness: 0.5,
        sourcePlayerId: 'player_local',
      });
      this.hud.update({ objective: 'Dissonance! Melody reset. Replay at fountain if needed.' });
    }
  }

  private cycleInventory(): void {
    if (this.inventory.length === 0) return;
    this.selectedInventoryIndex = (this.selectedInventoryIndex + 1) % this.inventory.length;
    this.audio.play('flashlight_click', { gain: 0.4 });
    this.hud.update({
      inventory: this.inventory,
      selectedItemIndex: this.selectedInventoryIndex,
    });
  }

  private toggleFlashlight(): void {
    if (!this.flashlightLight) return;
    if (this.flashlightBattery <= 0) {
      this.audio.play('flashlight_click', { gain: 0.3 });
      return;
    }
    this.flashlightActive = !this.flashlightActive;
    this.flashlightLight.visible = this.flashlightActive;
    this.audio.play('flashlight_click', { gain: 0.6 });
    this.hud.update({
      flashlight: { active: this.flashlightActive, battery: this.flashlightBattery },
    });
  }

  setSettings(newSettings: Settings): void {
    this.settings = newSettings;
    this.renderer.applySettings(newSettings);
    this.postFX.applySettings(newSettings);
    this.audio.setVhsIntensity(newSettings.graphics.vhsIntensity);
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

    // Reset Sim & presentation
    this.timeSurvived = 0;
    this.noisesMade = 0;
    this.closestCall = 999.0;
    this.alertsCount = 0;
    this.timeScale = 1.0;
    this.accumulator = 0;
    this.isPaused = false;
    this.isWon = false;

    const spawn = this.layout.spawns.player[0] ?? { x: 0, y: 1.0, z: 0 };
    this.simWorld.player.teleport(spawn);

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
    if (this.isDisposed || this.isPaused || !this.isLoaded) return;

    const pVel = this.simWorld?.player ? this.simWorld.player.getState().vel : { x: 0, y: 0, z: 0 };
    const cameraSpeed = Math.hypot(pVel.x, pVel.z);
    this.postFX.update(dt, cameraSpeed);
    this.postFX.setTension(this.acoustics ? this.acoustics.tension : 0);

    // Jumpscare update takes priority if active
    if (this.jumpscare.isActive()) {
      this.jumpscare.update(dt);
      this.hud.update({ vhsOsdState: this.postFX.getOsdState() });
      this.postFX.render(this.scene, this.camera, dt);
      return;
    }

    // Spectator mode takes over if active
    if (this.isSpectating) {
      const peers = this.netSession?.getRemotePeers() ?? [];
      const isReducedMotion =
        this.settings.accessibility.reducedMotion === 'on' ||
        (this.settings.accessibility.reducedMotion === 'system' &&
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches);

      const intent = this.playerInput.pollIntent();
      this.spectatorController.update(
        dt,
        peers,
        { x: intent.moveX, y: -intent.moveZ, sprint: intent.sprint },
        { dx: intent.lookDeltaYaw, dy: intent.lookDeltaPitch },
        isReducedMotion,
      );

      const forwardVec = new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const upVec = new Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.audio.setListener(this.camera.position, forwardVec, upVec);
      this.water.update(dt, this.simWorld.simTime, this.camera, this.scene.fog as FogExp2);
      this.mapInstance.update(dt);
      this.pingMarkers.update(this.camera, this.simWorld.simTime);
      this.updateRemoteAvatars(dt);

      this.hud.update({ vhsOsdState: this.postFX.getOsdState() });
      this.postFX.render(this.scene, this.camera, dt);
      return;
    }

    const scaledDt = dt * this.timeScale;
    this.accumulator += scaledDt;

    // 1. Poll Player Intent
    this.playerInput.updateThrowHold(dt);
    const intent = this.playerInput.pollIntent();

    // 2. Fixed Timestep Physics Simulation
    const recentNoises: NoiseEvent[] = [];

    while (this.accumulator >= this.FIXED_DT) {
      // Dynamic Water Level Step (Map 4)
      if (this.waterCycle) {
        const curWaterY = this.waterCycle.levelAt(this.simWorld.simTime);
        this.water.updateWaterY(curWaterY);
      }

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
          this.netSession?.publishLocalNoise(ev.data);
        } else if (ev.type === 'ripple') {
          this.water.onRipple(ev.data);
          this.netSession?.publishLocalRipple(ev.data);
        }
      });

      this.stepSubsystems(this.FIXED_DT);

      this.timeSurvived += this.FIXED_DT;
      this.accumulator -= this.FIXED_DT;
    }

    const renderAlpha = this.accumulator / this.FIXED_DT;

    // 3. Player Camera & Footsteps
    const prevSnap = this.simWorld.player.getPreviousSnapshot();
    const currSnap = this.simWorld.player.getSnapshot();

    this.playerCamera.update(dt, prevSnap, currSnap, renderAlpha);
    this.footsteps.update(currSnap, this.playerCamera.getBobPhase(), this.camera, this.simWorld.waterY);

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
      if (mSnap.state === 'ALERTED' || mSnap.state === 'HUNT') {
        this.alertsCount++;
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

        this.postFX.triggerJumpscare();
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

    // 9. MapInstance update (e.g. sinking platforms)
    this.mapInstance.update(dt);

    // 10. Check Win Condition
    this.checkWinCondition(currSnap.pos);

    // 11. Acoustic System & HUD Feed
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
      vhsOsdState: this.postFX.getOsdState(),
      pointerLockHint: !this.playerInput.isPointerLocked(),
    });

    // 12. Multiplayer Replication & Ping Markers
    this.netSession?.update(dt);

    this.netSnapshotTimer += dt;
    if (this.netSnapshotTimer >= 1 / 15 && this.netSession) {
      this.netSnapshotTimer = 0;
      this.netSession.adapter.publishSnapshot({
        id: this.netSession.localPlayerId,
        name: this.netSession.localPlayerName,
        pos: currSnap.pos,
        yaw: currSnap.yaw,
        pitch: currSnap.pitch,
        crouch: currSnap.crouchT > 0.5,
        inWater: currSnap.wet,
        flashlightOn: this.flashlightActive,
        alive: !this.isDead,
        escaped: this.hasEscaped,
        t: this.netSession.getSimTime(),
      });
    }

    if (this.netSession?.role === 'host') {
      this.netMonsterTimer += dt;
      if (this.netMonsterTimer >= 0.1) {
        this.netMonsterTimer = 0;
        for (const m of this.simWorld.monsters) {
          const mSnap = m.getSnapshot();
          this.netSession.broadcastMonsterState({
            id: m.id,
            state: mSnap.state,
            pos: mSnap.pos,
            yaw: mSnap.yaw,
            target: mSnap.targetPos ?? undefined,
            t: this.netSession.getSimTime(),
          });
        }
      }
    }

    this.pingMarkers.update(this.camera, this.simWorld.simTime);
    this.updateRemoteAvatars(dt);

    // 13. Trajectory preview update
    this.updateTrajectoryPreview(currSnap.pos);

    // 14. Debug visualizations
    if (this.debugMode) {
      this.updateDebugVisuals(dt);
    }

    // 15. Render Scene
    this.postFX.render(this.scene, this.camera, dt);
  }

  private stepSubsystems(dt: number): void {
    const pSnap = this.simWorld.player.getState();

    // 1. Hand Crank & Flashlight Battery (Map 5)
    if (this.flashlightLight) {
      if (this.playerInput.isCrankActive()) {
        this.flashlightBattery = Math.min(1.0, this.flashlightBattery + 0.06 * dt);
        this.crankNoiseTimer += dt;
        if (this.crankNoiseTimer >= 0.5) {
          this.crankNoiseTimer = 0;
          this.audio.play('crank_loop', { gain: 0.5 });
          this.simWorld.broadcastNoise({
            kind: 'generator',
            position: pSnap.pos,
            loudness: 0.3,
            sourcePlayerId: 'player_local',
          });
        }
      }

      if (this.flashlightActive && this.flashlightBattery > 0) {
        this.flashlightBattery = Math.max(0, this.flashlightBattery - dt / this.FLASHLIGHT_MAX_DURATION);
        if (this.flashlightBattery < 0.15 && Math.random() < 0.2) {
          this.flashlightLight.intensity = Math.random() < 0.5 ? 0.3 : 2.4;
        } else {
          this.flashlightLight.intensity = 2.4;
        }
        if (this.flashlightBattery <= 0) {
          this.flashlightActive = false;
          this.flashlightLight.visible = false;
        }
      }

      this.hud.update({
        flashlight: { active: this.flashlightActive, battery: this.flashlightBattery },
      });
    }

    // 2. Active Projectiles Simulation
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const proj = this.activeProjectiles[i]!;
      const impact = this.projectileSystem.step(
        proj,
        dt,
        this.simWorld.ground,
        this.simWorld.colliders,
        this.simWorld.waterY,
        this.simWorld.simTime,
      );

      if (impact !== null) {
        this.activeProjectiles.splice(i, 1);
        this.handleProjectileImpact(impact);
      } else if (!proj.active) {
        this.activeProjectiles.splice(i, 1);
      }
    }

    // Check throw launch
    const throwLaunch = this.playerInput.consumeThrowLaunch();
    if (throwLaunch !== null) {
      this.launchEquippedThrowable(throwLaunch);
    }

    // 3. Map 1: Pillar inspection check
    if (this.mapId === 'poolrooms') {
      for (const pillar of this.layout.pillars) {
        if (pillar.ordinal === undefined || pillar.decalNumber === undefined) continue;
        const dx = pillar.x - pSnap.pos.x;
        const dz = pillar.z - pSnap.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= 8.0) {
          const lookDirX = -Math.sin(pSnap.yaw);
          const lookDirZ = -Math.cos(pSnap.yaw);
          const toPillarX = dx / dist;
          const toPillarZ = dz / dist;
          const dot = lookDirX * toPillarX + lookDirZ * toPillarZ;

          if (dot > 0.9) {
            this.inspectedPillars.set(pillar.ordinal, pillar.decalNumber);
            const notebook = [1, 2, 3, 4].map(
              (ord) => `#${ord}: ${this.inspectedPillars.get(ord) ?? '?'}`,
            );
            this.hud.update({ notebookNumbers: notebook });
          }
        }
      }
    }

    // 4. Map 2: Metal Catwalk Clang & Steam Vents
    if (this.mapId === 'utility_tunnels') {
      const pSpeed = Math.hypot(pSnap.vel.x, pSnap.vel.z);
      if (pSnap.onGround && pSpeed > 4.5) {
        this.catwalkClangTimer += dt;
        if (this.catwalkClangTimer >= 0.5) {
          this.catwalkClangTimer = 0;
          this.audio.play('valve_release', { gain: 0.3 });
          this.simWorld.broadcastNoise({
            kind: 'clang',
            position: pSnap.pos,
            loudness: 0.3,
            sourcePlayerId: 'player_local',
          });
        }
      }

      // Update Steam Vents
      let nearActiveSteam = false;
      for (const vent of this.steamVents) {
        vent.timer += dt;
        if (vent.timer >= vent.cycleTime - 3.0 && vent.timer < vent.cycleTime - 2.8) {
          this.audio.play('pipe_groan', { position: vent.pos, gain: 0.8 });
        }
        if (vent.timer >= vent.cycleTime) {
          vent.active = true;
          this.audio.play('steam_hiss', { position: vent.pos, gain: 0.9 });
          if (vent.timer >= vent.cycleTime + 5.0) {
            vent.timer = 0;
            vent.active = false;
          }
        }

        if (vent.active) {
          const d = Math.hypot(vent.pos.x - pSnap.pos.x, vent.pos.z - pSnap.pos.z);
          if (d <= 18.0) {
            nearActiveSteam = true;
            this.simWorld.hearingCtx.maskFactor = () => 0.45;
          }
        }
      }

      if (!nearActiveSteam) {
        delete this.simWorld.hearingCtx.maskFactor;
      }
      this.hud.update({ steamWarning: nearActiveSteam });
    }

    // 5. Map 4: Level Shift Timer & Warning
    if (this.waterCycle) {
      const rem = this.waterCycle.secondsToNextShift(this.simWorld.simTime);
      const phase = this.waterCycle.phaseAt(this.simWorld.simTime);
      this.hud.update({
        levelShift: {
          timeRemaining: rem,
          phase,
          warning: rem <= 10.0,
        },
      });
    }

    // 6. Map 5: Generators Runtime & Simultaneous Blast Doors
    if (this.mapId === 'drainage_core') {
      let runningCount = 0;
      const genStatus: Array<{ id: string; running: boolean; remaining: number }> = [];

      for (const [id, g] of this.generators.entries()) {
        if (g.state === 'running') {
          g.runtime = Math.max(0, g.runtime - dt);
          if (g.runtime <= 0) {
            g.state = 'idle';
          } else {
            runningCount++;
          }
        }
        genStatus.push({ id, running: g.state === 'running', remaining: g.runtime });
      }

      if (runningCount === 3) {
        this.allGeneratorsSimultaneousTime += dt;
        if (this.allGeneratorsSimultaneousTime >= 5.0 && !this.blastDoorsOpen) {
          this.blastDoorsOpen = true;
          this.exitUnlocked = true;
          this.audio.play('shutter_rumble', { gain: 1.0 });
          this.simWorld.broadcastNoise({
            kind: 'door',
            position: this.layout.exit.position,
            loudness: 0.7,
            sourcePlayerId: 'world',
          });
          this.hud.update({ objective: 'ALL 3 GENERATORS SYNCHRONIZED! Blast doors open. ESCAPE!' });
        }
      } else {
        this.allGeneratorsSimultaneousTime = 0;
      }

      this.hud.update({
        generatorStatus: genStatus,
        blastDoorsRemaining: this.allGeneratorsSimultaneousTime > 0 ? 5.0 - this.allGeneratorsSimultaneousTime : null,
      });
    }

    // 7. Batch 5: Schoolhouse Systems
    if (this.mapId === 'drowned_school') {
      this.paCooldown = Math.max(0, this.paCooldown - dt);
      const isPerched = this.simWorld.perchSystem.isPlayerPerched(pSnap.pos, pSnap.onGround, this.layout.waterBodies[0]?.waterY ?? 0);
      if (isPerched) {
        this.perchedTimeTotal += dt;
        if (pSnap.pos.y < 0.25) {
          this.wobblyChairTimer += dt;
          if (this.wobblyChairTimer > 3.0 && this.wobblyChairTimer <= 5.0) {
            this.isWobblyChairTipping = true;
          } else if (this.wobblyChairTimer > 5.0) {
            this.isWobblyChairTipping = false;
            this.wobblyChairTimer = 0;
            this.wobblyEscapesCount++;
            this.audio.play('creak', { gain: 0.9 });
            this.simWorld.broadcastNoise({
              kind: 'creak',
              position: pSnap.pos,
              loudness: 0.8,
              sourcePlayerId: 'player_local',
            });
          }
        } else {
          this.wobblyChairTimer = 0;
          this.isWobblyChairTipping = false;
        }
      } else {
        this.wobblyChairTimer = 0;
        this.isWobblyChairTipping = false;
      }

      const tideVal = Math.min(0.30, this.timeSurvived * (0.30 / 360.0));
      this.hud.update({
        isPerched,
        tideLevel: tideVal,
        wobblyChairWarning: this.isWobblyChairTipping ? { tipping: true, timeRemaining: Math.max(0, 5.0 - this.wobblyChairTimer) } : null,
        paStatus: { charges: this.paCharges, maxCharges: 5, cooldownRemaining: this.paCooldown },
      });
    }

    // 8. Batch 5: Sunken Jungle Systems
    if (this.mapId === 'sunken_jungle') {
      const flow = this.simWorld.flowField ? this.simWorld.flowField.flowAt(pSnap.pos.x, pSnap.pos.z) : { x: 0, z: 0 };
      let nearestDist = 999;
      for (const m of this.simWorld.monsters) {
        const mPos = m.getSnapshot().pos;
        const d = Math.hypot(pSnap.pos.x - mPos.x, pSnap.pos.z - mPos.z);
        if (d < nearestDist) nearestDist = d;
      }
      const faunaState: 'safe' | 'alert' | 'hushed' = nearestDist < 20 ? 'hushed' : nearestDist < 35 ? 'alert' : 'safe';

      this.hud.update({
        sluiceGatesRemaining: 3 - this.sluiceStep,
        riverFlow: { angleRad: Math.atan2(flow.z, flow.x), speed: Math.hypot(flow.x, flow.z) },
        faunaHushState: faunaState,
      });
    }

    // 9. Batch 5: Neon Flood District Systems
    if (this.mapId === 'neon_flood') {
      const weather = this.simWorld.weather;
      let droneLock = false;
      for (const d of this.simWorld.drones) {
        if (d.detectionMeter >= 1.0) {
          droneLock = true;
          break;
        }
      }

      if (weather) {
        const isDownpour = weather.isDownpourAt(this.simWorld.simTime);
        this.hud.update({
          uplinksRemaining: 3 - this.hackedUplinks.size,
          stormWindow: {
            active: isDownpour,
            timeRemaining: isDownpour ? 8.0 : 0,
            nextStormIn: weather.timeToNextThunder(this.simWorld.simTime),
          },
          droneLockWarning: droneLock ? { locked: true, angleDeg: 0 } : null,
          empCount: this.empCount,
        });
      }
    }

    // 10. Batch 5: Drowned Metro Systems
    if (this.mapId === 'drowned_metro') {
      const train = this.simWorld.ghostTrain;
      if (train) {
        const trainSnap = train.getPhaseAtTime(this.simWorld.simTime);

        if (trainSnap.phase === 'PASS') {
          if (pSnap.pos.z >= 3.4 && pSnap.pos.z <= 6.6 && !this.godMode) {
            this.triggerDeath('KILLED BY THE GHOST TRAIN');
            return;
          }
          if (Math.abs(pSnap.pos.z - 5.0) < 3.6 && Math.abs(pSnap.pos.z - 5.0) >= 1.6) {
            this.nearMissExpressCount++;
          }
        }

        if (this.engineStarted && this.boardingTimer > 0) {
          this.boardingTimer -= dt;
          if (this.boardingTimer <= 0) {
            if (pSnap.pos.x >= 30 && pSnap.pos.x <= 60 && pSnap.pos.z >= -24 && pSnap.pos.z <= -14) {
              this.exitUnlocked = true;
              this.hasEscaped = true;
              this.ghostTrainsSurvivedCount++;
              this.callbacks.onWin({
                mapId: this.mapId,
                timeSurvived: this.timeSurvived,
                noisesMade: this.noisesMade,
                closestCall: this.closestCall,
                alertsCount: this.alertsCount,
                retries: 0,
                ghostTrainsSurvived: this.ghostTrainsSurvivedCount,
                nearMissCount: this.nearMissExpressCount,
              });
              return;
            } else {
              this.triggerDeath('LEFT BEHIND ON THE PLATFORM');
              return;
            }
          }
        }

        this.hud.update({
          ghostTrainSchedule: {
            timeToTrain: trainSnap.timeToNextTrain,
            trainDurationRemaining: trainSnap.duration - trainSnap.elapsed,
            active: trainSnap.phase === 'PASS',
            warning: trainSnap.phase === 'APPROACH',
          },
          boardingCountdown: this.engineStarted ? this.boardingTimer : null,
          bottleCount: this.bottlesCount,
        });
      }
    }
  }

  private triggerDeath(_reason: string): void {
    if (this.isDead || this.hasEscaped) return;
    this.isDead = true;
    this.audio.play('train_horn', { gain: 1.0 });
    this.postFX.triggerJumpscare();
    const isReducedMotion =
      this.settings.accessibility.reducedMotion === 'on' ||
      (this.settings.accessibility.reducedMotion === 'system' &&
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const fakeHead = new Vector3(this.camera.position.x, this.camera.position.y, this.camera.position.z + 1.0);
    this.jumpscare?.trigger(
      this.camera,
      fakeHead,
      0,
      {
        timeSurvived: this.timeSurvived,
        noisesMade: this.noisesMade,
        closestCall: this.closestCall,
      },
      isReducedMotion,
    );
  }

  private launchEquippedThrowable(holdTime: number): void {
    if (this.mapId === 'neon_flood') {
      if (this.empCount <= 0) return;
      this.empCount--;
      const pSnap = this.simWorld.player.getState();
      const vel = this.projectileSystem.calculateLaunchVelocity(pSnap.yaw, pSnap.pitch, holdTime);
      this.activeProjectiles.push({
        id: `emp_${Date.now()}`,
        kind: 'emp',
        pos: { x: pSnap.pos.x, y: pSnap.pos.y + 1.4, z: pSnap.pos.z },
        vel,
        active: true,
        spawnTime: this.simWorld.simTime,
      });
      this.audio.play('stone_creak', { gain: 0.4 });
      this.hud.update({ empCount: this.empCount });
      return;
    }

    if (this.mapId === 'drowned_metro') {
      if (this.bottlesCount <= 0) return;
      this.bottlesCount--;
      const pSnap = this.simWorld.player.getState();
      const vel = this.projectileSystem.calculateLaunchVelocity(pSnap.yaw, pSnap.pitch, holdTime);
      this.activeProjectiles.push({
        id: `bottle_${Date.now()}`,
        kind: 'bottle',
        pos: { x: pSnap.pos.x, y: pSnap.pos.y + 1.4, z: pSnap.pos.z },
        vel,
        active: true,
        spawnTime: this.simWorld.simTime,
      });
      this.audio.play('stone_creak', { gain: 0.4 });
      this.hud.update({ bottleCount: this.bottlesCount });
      return;
    }

    const slot = this.inventory[this.selectedInventoryIndex];
    if (!slot || slot.count <= 0) return;

    slot.count--;
    const pSnap = this.simWorld.player.getState();
    const vel = this.projectileSystem.calculateLaunchVelocity(pSnap.yaw, pSnap.pitch, holdTime);

    this.activeProjectiles.push({
      id: `proj_${Date.now()}`,
      kind: slot.kind === 'noisemaker' ? 'noisemaker' : 'pebble',
      pos: { x: pSnap.pos.x, y: pSnap.pos.y + 1.4, z: pSnap.pos.z },
      vel,
      active: true,
      spawnTime: this.simWorld.simTime,
    });

    this.audio.play('stone_creak', { gain: 0.4 });
    this.hud.update({ inventory: this.inventory });
  }

  private handleProjectileImpact(impact: { x: number; y: number; z: number; isWater: boolean; kind: string }): void {
    const pos = { x: impact.x, y: impact.y, z: impact.z };

    if (impact.kind === 'emp') {
      this.audio.play('emp_pulse', { position: pos, gain: 1.0 });
      this.simWorld.broadcastNoise({
        kind: 'beacon',
        position: pos,
        loudness: 0.3,
        sourcePlayerId: 'player_local',
      });
      for (const d of this.simWorld.drones) {
        if (Math.hypot(pos.x - d.pos.x, pos.z - d.pos.z) < 25) {
          d.applyEmp(pos, 25.0, 20.0);
          this.dronesEmpdCount++;
        }
      }
      return;
    }

    if (impact.kind === 'bottle') {
      this.audio.play('bottle_shatter', { position: pos, gain: 0.95 });
      this.simWorld.broadcastNoise({
        kind: 'shatter',
        position: pos,
        loudness: 0.85,
        sourcePlayerId: 'player_local',
      });
      return;
    }

    if (impact.kind === 'noisemaker') {
      this.audio.play('generator_cord', { position: pos, gain: 0.9 });
      this.simWorld.broadcastNoise({
        kind: 'beacon',
        position: pos,
        loudness: 0.7,
        sourcePlayerId: 'player_local',
      });
      return;
    }

    if (impact.isWater) {
      this.audio.play('pebble_plink', { position: pos, gain: 0.8 });
      this.water.onRipple({
        position: pos,
        strength: 0.5,
        t: this.simWorld.simTime,
        sourcePlayerId: 'player_local',
      });
      this.simWorld.broadcastNoise({
        kind: 'pebble',
        position: pos,
        loudness: 0.6,
        sourcePlayerId: 'player_local',
      });
    } else {
      this.audio.play('pebble_clack', { position: pos, gain: 0.6 });
      this.simWorld.broadcastNoise({
        kind: 'clack',
        position: pos,
        loudness: 0.2,
        sourcePlayerId: 'player_local',
      });
    }
  }

  private updateTrajectoryPreview(pPos: Vec3): void {
    if (!this.playerInput.isThrowHeld()) {
      if (this.trajectoryLine) {
        this.scene.remove(this.trajectoryLine);
        this.trajectoryLine.geometry.dispose();
        (this.trajectoryLine.material as LineBasicMaterial).dispose();
        this.trajectoryLine = null;
      }
      return;
    }

    const pSnap = this.simWorld.player.getState();
    const holdDuration = this.playerInput.getThrowHoldDuration();
    const points = this.projectileSystem.predictTrajectory(
      { x: pPos.x, y: pPos.y + 1.4, z: pPos.z },
      pSnap.yaw,
      pSnap.pitch,
      holdDuration,
      this.simWorld.ground,
      this.simWorld.colliders,
      this.simWorld.waterY,
    );

    const flatPoints: number[] = [];
    for (const p of points) {
      flatPoints.push(p.x, p.y, p.z);
    }

    if (!this.trajectoryLine) {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(flatPoints, 3));
      const mat = new LineBasicMaterial({ color: 0x86cfa0, transparent: true, opacity: 0.75 });
      this.trajectoryLine = new Line(geo, mat);
      this.scene.add(this.trajectoryLine);
    } else {
      this.trajectoryLine.geometry.dispose();
      this.trajectoryLine.geometry = new BufferGeometry();
      this.trajectoryLine.geometry.setAttribute('position', new Float32BufferAttribute(flatPoints, 3));
    }
  }

  private checkWinCondition(pPos: Vec3): void {
    if (this.isWon) return;

    const exitPos = this.layout.exit.position;
    const dist = Math.hypot(pPos.x - exitPos.x, pPos.z - exitPos.z);

    if (dist <= 2.5 && this.exitUnlocked) {
      this.isWon = true;
      this.audio.play('tape_eject');
      this.postFX.triggerTapeEjected();

      if (this.netSession) {
        this.hasEscaped = true;
        this.netSession.publishEscape();
        this.updateRosterHud();

        const livingPeers = this.netSession.getRemotePeers().filter((p) => p.alive && !p.escaped);
        if (livingPeers.length > 0) {
          this.isSpectating = true;
          this.playerInput.isSpectating = true;
          this.spectatorController.cycleTarget(livingPeers, 1);
          this.updateSpectatorHud();
          this.playerInput.exitPointerLock();
          return;
        }

        this.checkMultiplayerRoundEnd();
        return;
      }

      this.playerInput.exitPointerLock();
      this.callbacks.onWin({
        mapId: this.mapId,
        timeSurvived: this.timeSurvived,
        noisesMade: this.noisesMade,
        closestCall: this.closestCall,
        alertsCount: this.alertsCount,
        retries: 0,
        perchedTime: this.perchedTimeTotal,
        wobblyEscapes: this.wobblyEscapesCount,
        rapidsCrossed: this.rapidsCrossedCount,
        sluiceAccuracy: this.sluiceAccuracy,
        dronesEmpd: this.dronesEmpdCount,
        stormSprintDist: this.stormSprintDistTotal,
        ghostTrainsSurvived: this.ghostTrainsSurvivedCount,
        nearMissCount: this.nearMissExpressCount,
      });
    }
  }

  private setupNetSession(): void {
    if (!this.netSession) return;

    this.netSession.setCallbacks({
      onRemoteNoise: (noise: NoiseEvent) => {
        if (this.debugMode) {
          this.spawnHearingRing(noise);
        }
        if (noise.kind === 'wade') {
          this.audio.play('wade_step', { gain: Math.min(1.0, noise.loudness * 1.5) });
        } else if (noise.kind === 'jump_in') {
          this.audio.play('splash_jump', { gain: Math.min(1.0, noise.loudness * 1.5) });
        }
        this.updateRosterHud(noise.sourcePlayerId);
      },
      onRemoteRipple: (ripple: RippleEvent) => {
        this.water.onRipple(ripple);
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
        this.handleRemotePuzzleOp(op);
      },
      onPlayerDeath: (pid: PlayerId) => {
        const avatar = this.remoteAvatars.get(pid);
        if (avatar) {
          avatar.root.visible = false;
        }
        this.updateRosterHud();
        this.checkMultiplayerRoundEnd();
      },
      onPlayerEscape: (pid: PlayerId) => {
        const avatar = this.remoteAvatars.get(pid);
        if (avatar) {
          avatar.root.visible = false;
        }
        this.updateRosterHud();
        this.checkMultiplayerRoundEnd();
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

  private syncRemoteAvatars(players: Array<{ id: PlayerId; name: string; colorIndex?: number | undefined }>): void {
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

    // Remove departed
    for (const [id, avatar] of this.remoteAvatars.entries()) {
      if (!present.has(id)) {
        this.scene.remove(avatar.root);
        avatar.dispose();
        this.remoteAvatars.delete(id);
      }
    }
  }

  private updateRemoteAvatars(dt: number): void {
    if (!this.netSession) return;

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
          this.camera,
          dt,
        );

        const dist = Math.hypot(peer.pos.x - this.camera.position.x, peer.pos.z - this.camera.position.z);
        avatarsWithDist.push({ avatar, dist });
      }
    }

    // Max 2 real spotlights rule (Section 7.7)
    avatarsWithDist.sort((a, b) => a.dist - b.dist);
    for (let i = 0; i < avatarsWithDist.length; i++) {
      avatarsWithDist[i]!.avatar.setRealSpotlight(i < 2);
    }
  }

  private handleRemotePuzzleOp(op: PuzzleOp): void {
    if (op.puzzleId === 'exit_keypad') {
      this.exitUnlocked = true;
      this.hud.update({ objective: 'Exit door unlocked by teammate! Head to the exit.' });
    } else if (op.puzzleId.startsWith('valve_')) {
      const valveId = op.puzzleId.replace('valve_', '');
      const expected = this.valveOrder[this.currentValveStep];
      if (valveId === expected) {
        this.currentValveStep++;
        this.hud.update({
          objective: `Teammate turned Valve ${valveId}! Sequence: ${this.currentValveStep}/${this.valveOrder.length}`,
        });
        if (this.currentValveStep >= this.valveOrder.length) {
          this.exitUnlocked = true;
        }
      }
    } else if (op.puzzleId.startsWith('bell_')) {
      const noteIdx = typeof op.value === 'number' ? op.value : 0;
      this.audio.play('bell', { gain: 0.9, pitch: Math.pow(2, (noteIdx - 2) / 12) });
    } else if (op.puzzleId.startsWith('gen_')) {
      const g = this.generators.get(op.puzzleId);
      if (g) {
        g.state = 'running';
        g.runtime = 5.0;
      }
    }
  }

  private handleLocalPing(): void {
    const nowSec = this.simWorld.simTime;
    if (!this.pingMarkers.canPing(nowSec)) return;

    const pSnap = this.simWorld.player.getState();
    const yaw = pSnap.yaw;
    const pingPos: Vec3 = {
      x: pSnap.pos.x - Math.sin(yaw) * 6.0,
      y: pSnap.pos.y,
      z: pSnap.pos.z - Math.cos(yaw) * 6.0,
    };

    this.pingMarkers.recordPing(nowSec);
    this.pingMarkers.addMarker(this.netSession ? this.netSession.localPlayerId : 'local', pingPos, nowSec);
    this.netSession?.publishPingMarker(pingPos);
  }

  private updateSpectatorHud(): void {
    if (!this.isSpectating) {
      this.hud.update({ spectator: undefined });
      return;
    }

    const targetId = this.spectatorController.getTargetPlayerId();
    let targetName = 'FREE ROAM';
    if (targetId && this.netSession) {
      const peer = this.netSession.remotePlayers.get(targetId);
      if (peer) targetName = peer.name;
    }

    this.hud.update({
      spectator: {
        active: true,
        mode: targetId ? 'follow' : 'freeroam',
        targetName,
        canCycle: (this.netSession?.getRemotePeers().filter((r) => r.alive && !r.escaped).length ?? 0) > 1,
      },
    });
  }

  private updateRosterHud(noiseSpikeId?: PlayerId): void {
    if (!this.netSession) {
      this.hud.update({ roster: undefined });
      return;
    }

    const members: RosterMember[] = [];
    members.push({
      id: this.netSession.localPlayerId,
      name: `${this.netSession.localPlayerName} (You)`,
      status: this.hasEscaped ? 'escaped' : this.isDead ? 'dead' : 'alive',
      pingMs: 0,
      noiseSpike: noiseSpikeId === this.netSession.localPlayerId,
      isLocal: true,
      colorIndex: 0,
    });

    for (const peer of this.netSession.getRemotePeers()) {
      members.push({
        id: peer.id,
        name: peer.name,
        status: peer.escaped ? 'escaped' : !peer.alive ? 'dead' : 'alive',
        pingMs: Math.round(this.netSession.stats().rttMs),
        noiseSpike: noiseSpikeId === peer.id,
        isLocal: false,
        colorIndex: peer.colorIndex,
      });
    }

    this.hud.update({ roster: members });
  }

  private checkMultiplayerRoundEnd(): void {
    if (!this.netSession) return;

    const peers = this.netSession.getRemotePeers();
    const allRemotesFinished = peers.every((p) => !p.alive || p.escaped);
    const localFinished = this.isDead || this.hasEscaped;

    if (allRemotesFinished && localFinished) {
      const coopResults: CoOpPlayerResult[] = [
        {
          id: this.netSession.localPlayerId,
          name: this.netSession.localPlayerName,
          escaped: this.hasEscaped,
          timeSurvived: this.timeSurvived,
          noisesMade: this.noisesMade,
        },
        ...peers.map((p) => ({
          id: p.id,
          name: p.name,
          escaped: p.escaped,
          timeSurvived: this.timeSurvived,
          noisesMade: 0,
        })),
      ];

      this.callbacks.onWin({
        mapId: this.mapId,
        timeSurvived: this.timeSurvived,
        noisesMade: this.noisesMade,
        closestCall: this.closestCall,
        alertsCount: this.alertsCount,
        retries: 0,
        coopPlayers: coopResults,
      });
    }
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
          this.simWorld.monsters.length = 0;
          this.monsters.dispose();
          this.hud.update({ objective: 'DEBUG: All monsters eliminated' });
          break;
        case 'KeyM': {
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
        case 'KeyP': {
          // Debug instant win / unlock exit
          this.exitUnlocked = true;
          this.hud.update({ objective: 'DEBUG: Exit unlocked instantly' });
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
    if (this.trajectoryLine) {
      this.scene.remove(this.trajectoryLine);
      this.trajectoryLine.geometry.dispose();
      (this.trajectoryLine.material as LineBasicMaterial).dispose();
      this.trajectoryLine = null;
    }

    this.jumpscare.dispose();
    this.playerInput.dispose();
    this.footsteps.dispose();
    this.interactions.dispose();
    this.water.dispose();
    this.monsters.dispose();
    this.mapInstance.dispose();
    this.pingMarkers.dispose();

    for (const avatar of this.remoteAvatars.values()) {
      this.scene.remove(avatar.root);
      avatar.dispose();
    }
    this.remoteAvatars.clear();
    this.netSession?.dispose();

    if (typeof window !== 'undefined') {
      const g = window as unknown as { __backsilence_session?: unknown };
      if (g.__backsilence_session === this) {
        delete g.__backsilence_session;
      }
    }
    this.postFX.dispose();
    this.renderer.dispose();
  }

  get sim(): SimWorld {
    return this.simWorld;
  }

  get waterSystem(): WaterSystem {
    return this.water;
  }

  get monsterManager(): MonsterManager {
    return this.monsters;
  }

  get sceneRef(): Scene {
    return this.scene;
  }

  get cameraRef(): PerspectiveCamera {
    return this.camera;
  }

  get activeDirector(): EncounterDirector {
    return this.simWorld.director;
  }
}
