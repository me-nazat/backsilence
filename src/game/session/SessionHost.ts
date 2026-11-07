/* ── SessionHost.ts ────────────────────────────────────────────────────────
 *  Core game session host orchestrating all decomposed lifecycle systems:
 *  - SessionStateMachine (formal state machine, deadlock-free)
 *  - DisposalService (leak prevention & centralized teardown)
 *  - SpawnService (spawn point resolution & G9 validation)
 *  - CaptureService (G5 debug suppression in capture mode)
 *  - InputRig (player input wiring & 080e262 pointer-lock law)
 *  - CameraRig (camera positioning, near-plane law, and render passes)
 *  - HudBridge (<= 4-element HUD law & UI updates)
 *  - EncounterBridge (monster encounter arc & 100% noise-attributable death)
 *  - AnomalyBridge (Prompt 8 AnomalyDirector stepping & loop relocation)
 *  - ThrowableBridge (pebbles, noisemakers, splash impacts)
 *  - NetBridge (multiplayer NetSession, avatars, pings)
 *  - DebugBridge (debug hotkeys, rings, magenta markers)
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Scene,
  PerspectiveCamera,
  DirectionalLight,
  SpotLight,
  Vector3,
  Texture,
} from 'three';
import { MonsterWatchdog } from '../monster/MonsterWatchdog.js';
import { EngineRenderer } from '../../engine/Renderer.js';
import { PostFX } from '../../engine/PostFX.js';
import { resolveQualityTier } from '../../engine/Quality.js';
import { AudioEngine } from '../../audio/AudioEngine.js';
import { MenuMusic } from '../../audio/MenuMusic.js';
import { setGameRoute, setMenuRoute } from '../../app/Router.js';
import type { Settings, MapId } from '../../types/contracts.js';
import { SimWorld } from '../../sim/SimWorld.js';
import { WaterSystem } from '../water/WaterSystem.js';
import { MonsterManager } from '../monster/MonsterManager.js';
import { FlockDirector } from '../creatures/FlockDirector.js';
import { LensOverlay } from '../water/LensOverlay.js';
import type { JumpscareStats } from '../monster/Jumpscare.js';
import { WeatherDirector } from '../weather/WeatherDirector.js';
import { PlayerFootsteps } from '../player/Footsteps.js';
import { InteractionSystem } from '../interaction/InteractionSystem.js';
import { AcousticSystem } from '../AcousticSystem.js';
import type { Hud, InventorySlot } from '../../ui/Hud.js';
import type { RunResults } from '../../ui/ResultsScreen.js';
import type { KeypadModal } from '../../ui/KeypadModal.js';
import { getMapDefinition } from '../../world/MapRegistry.js';
import { generateValidLayout } from '../../world/validate/LayoutValidator.js';
import type { LayoutData, MapDefinition } from '../../world/MapTypes.js';
import type { MapInstance } from '../../world/maps/MapInstance.js';
import { WaterLevelCycle } from '../../sim/WaterLevelCycle.js';
import type { NetSession } from '../../net/session/NetSession.js';
import { ToastManager } from '../../ui/ToastManager.js';
import { OrientationDirector } from '../OrientationDirector.js';
import { ObjectiveDirector } from '../objectives/ObjectiveDirector.js';
import { OperatorBotDirector } from '../bots/OperatorBotDirector.js';
import { GhostTrajectory } from '../../meta/Ghost.js';

// Decomposed systems
import { SessionStateMachine } from './SessionStateMachine.js';
import { DisposalService } from './DisposalService.js';
import { SpawnService } from './SpawnService.js';
import { CaptureService } from './CaptureService.js';
import { InputRig } from './InputRig.js';
import { CameraRig } from './CameraRig.js';
import { HudBridge } from './HudBridge.js';
import { EncounterBridge } from './EncounterBridge.js';
import { AnomalyBridge } from './AnomalyBridge.js';
import { ThrowableBridge } from './ThrowableBridge.js';
import { NetBridge } from './NetBridge.js';
import { DebugBridge } from './DebugBridge.js';
import { ColdOpenService } from './ColdOpenService.js';
import { setupAtmosphere } from './AtmosphereService.js';
import { ShadowFollower } from './ShadowFollower.js';
import { clearDecalCache } from '../../procedural/textures/GraffitiDecals.js';
import { clearNumberDecalCache } from '../../procedural/textures/NumberDecals.js';
import { clearPbrCache } from '../../procedural/textures/PbrMaterialKit.js';

const _scratchVecA = new Vector3();
const _scratchVecB = new Vector3();

export interface SessionHostCallbacks {
  onPause: () => void;
  onDeath: (stats: JumpscareStats) => void;
  onWin: (results: RunResults) => void;
  onExit: () => void;
  onPhotoMode?: () => void;
  onOpenKeypad?: (onSubmit: (code: string) => boolean) => void;
}

export class SessionHost {
  readonly sm: SessionStateMachine;
  readonly disposal: DisposalService;
  readonly spawnService: SpawnService;
  readonly captureService: CaptureService;
  readonly cameraRig: CameraRig;
  readonly hudBridge: HudBridge;
  readonly encounterBridge: EncounterBridge;

  inputRig!: InputRig;
  anomalyBridge!: AnomalyBridge;
  throwableBridge!: ThrowableBridge;
  netBridge!: NetBridge;
  debugBridge!: DebugBridge;

  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: EngineRenderer;
  readonly postFX: PostFX;
  readonly audio = AudioEngine.getInstance();
  private menuMusic: MenuMusic | null = null;
  readonly callbacks: SessionHostCallbacks;
  readonly initPromise: Promise<void>;

  readonly container: HTMLElement;
  settings: Settings;
  difficulty: 'whisper' | 'normal' | 'deafening';
  seed: number;
  mapId: MapId;
  keypadModal?: KeypadModal | undefined;
  subMode?: string | undefined;

  mapDef!: MapDefinition;
  layout!: LayoutData;
  mapInstance!: MapInstance;
  simWorld!: SimWorld;
  water!: WaterSystem;
  monsters!: MonsterManager;
  flock!: FlockDirector;
  weatherDirector!: WeatherDirector;
  lensOverlay!: LensOverlay;
  footsteps!: PlayerFootsteps;
  interactions!: InteractionSystem;
  acoustics!: AcousticSystem;

  inventory: InventorySlot[] = [];
  selectedInventoryIndex = 0;
  flashlightLight: SpotLight | null = null;
  flashlightActive = false;
  flashlightBattery = 1.0;
  readonly FLASHLIGHT_MAX_DURATION = 150.0;
  crankNoiseTimer = 0;

  exitUnlocked = false;
  orientationDirector: OrientationDirector | null = null;
  objectiveDirector: ObjectiveDirector | null = null;
  operatorBotDirector: OperatorBotDirector | null = null;
  ghostTrajectory: GhostTrajectory | null = null;

  isLoaded = false;
  sessionRunTime = 0;
  timeSurvived = 0;
  noisesMade = 0;
  closestCall = 999.0;
  recentDamage = 0;
  stillnessTimer = 0;
  envTexture: Texture | null = null;
  sunLight: DirectionalLight | null = null;
  shadowFollower: ShadowFollower | null = null;
  wakeLock: unknown = null;
  lastCachedL4Fraction = 0;
  firstCreatureSightingTime: number | null = null;
  hasShownDryHint = false;
  hasShownWaterHint = false;
  readonly monsterWatchdog = new MonsterWatchdog();
  readonly openingTurn = { active: false, t: 0, from: Math.PI, to: 0 };
  private wasPlayerJumping = false;
  private wasPlayerWet = false;
  private lastEntrySplashTime = -1.0;

  private accumulator = 0;
  private readonly FIXED_DT = 1 / 60;
  private waterCycle: WaterLevelCycle | null = null;

  readonly coldOpen = new ColdOpenService();

  constructor(
    container: HTMLElement,
    settings: Settings,
    hud: Hud,
    callbacks: SessionHostCallbacks,
    difficulty: 'whisper' | 'normal' | 'deafening' = 'normal',
    seed = 42,
    mapId: MapId = 'poolrooms',
    keypadModal?: KeypadModal,
    netSession?: NetSession,
    subMode?: string,
  ) {
    this.container = container;
    this.settings = settings;
    this.audio.applySettings(settings.audio);
    this.callbacks = callbacks;
    this.difficulty = difficulty;
    this.seed = seed;
    this.mapId = mapId;
    this.keypadModal = keypadModal;
    this.subMode = subMode;

    this.sm = new SessionStateMachine('IDLE');
    this.disposal = new DisposalService();
    this.spawnService = new SpawnService();
    this.captureService = new CaptureService();
    this.cameraRig = new CameraRig(settings, settings.graphics.fov, container.clientWidth / (container.clientHeight || 1));
    this.camera = this.cameraRig.camera;

    this.hudBridge = new HudBridge({ hud, settings });
    this.encounterBridge = new EncounterBridge(
      this.audio,
      settings,
      this.sm,
      (stats) => callbacks.onDeath(stats),
    );

    setGameRoute(this.mapId, this.seed, this.subMode);

    this.scene = new Scene();
    this.renderer = new EngineRenderer(container, settings);
    this.postFX = new PostFX(this.renderer.renderer, container, settings, {
      onDegraded: (status) => {
        if (status.reason === 'composer-failed' && !this.renderer.renderer.capabilities?.isWebGL2) {
          ToastManager.getInstance().show('Visual effects reduced because post-processing is unavailable.', { type: 'warning' });
        }
      },
    });

    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        void (navigator as unknown as { wakeLock: { request: (type: string) => Promise<unknown> } })
          .wakeLock.request('screen').then((lock) => {
            this.wakeLock = lock;
          }).catch(() => {
            /* ignore */
          });
      } catch {
        /* ignore */
      }
    }

    this.initPromise = this.initAsync(netSession);
  }

  async initAsync(netSession?: NetSession): Promise<void> {
    this.sm.transition('LOADING', 'init_start');

    // 1. Resolve map definition and layout
    this.mapDef = await getMapDefinition(this.mapId);
    if (this.disposal.isTerminated || this.sm.isTerminated()) return;

    const playerCount = netSession ? netSession.getPlayerCount() : 1;
    this.layout = generateValidLayout(this.mapDef, {
      seed: this.seed,
      difficulty: this.difficulty,
      playerCount,
    });

    // 2. Build world map instance
    const tier = resolveQualityTier(this.settings.graphics.quality);
    this.mapInstance = await this.mapDef.build(this.layout, {
      parent: this.scene,
      textures: undefined,
      difficulty: this.difficulty,
      audio: this.audio,
      renderer: this.renderer.renderer,
    });
    if (this.disposal.isTerminated || this.sm.isTerminated()) {
      this.mapInstance?.dispose();
      return;
    }

    // 3. Resolve spawns
    const pSpawn = this.spawnService.resolvePlayerSpawn(this.layout, netSession);
    const initialYaw = this.spawnService.calculateInitialYaw(this.mapId, pSpawn);

    // 4. Create simulation world
    let discreteWaterLevels: number[] | undefined;
    let levelProvider: WaterLevelCycle | undefined;

    if (this.mapId === 'hydro_maze') {
      this.waterCycle = new WaterLevelCycle();
      levelProvider = this.waterCycle;
      discreteWaterLevels = [-0.2, 0.55];
    } else if (this.subMode === 'endless') {
      this.waterCycle = new WaterLevelCycle({
        lowY: -0.2,
        highY: 0.25,
        lowHold: 20.0,
        riseDuration: 15.0,
        highHold: 25.0,
        fallDuration: 10.0,
      });
      levelProvider = this.waterCycle;
      discreteWaterLevels = [-0.2, 0.25];
    }

    const simMode = netSession ? (netSession.role === 'client' ? 'replica' : 'host') : 'solo';

    this.simWorld = new SimWorld({
      seed: this.seed,
      bounds: this.layout.bounds,
      playerSpawn: pSpawn,
      waterY: this.mapInstance.waterY,
      waterLevelProvider: levelProvider ?? undefined,
      discreteWaterLevels: discreteWaterLevels ?? undefined,
      difficulty: this.difficulty,
      mode: simMode,
      mapId: this.mapId,
      ground: this.mapInstance.ground,
      colliders: this.mapInstance.colliders,
      platforms: this.layout.platforms.map((p) => ({
        id: p.id,
        minX: p.rect[0],
        minZ: p.rect[1],
        maxX: p.rect[2],
        maxZ: p.rect[3],
        topY: p.topY,
      })),
    });

    this.simWorld.finalizeTerrain();

    // 5. Water system setup
    const lightStreaks = (this.mapInstance.root.userData['lightStreaks'] as import('../water/WaterMaterial.js').LightStreak[]) ?? [];
    const sunDirVec = this.mapDef.atmosphere.sun?.direction;
    const sunDir = sunDirVec ? new Vector3(sunDirVec.x, sunDirVec.y, sunDirVec.z).normalize() : undefined;

    this.water = new WaterSystem(this.scene, {
      scene: this.scene,
      ground: this.simWorld.ground,
      tier,
      waterY: this.mapInstance.waterY,
      audio: this.audio,
      profile: this.mapDef.waterProfile,
      streaks: lightStreaks,
      sunDir,
    });

    // 6. Spawn monsters
    this.monsters = new MonsterManager(this.water, this.audio, this.settings.creatures?.waterMonsterSkin);
    this.monsters.onCameraShake = (intensity: number) => {
      this.cameraRig.playerCamera.addRoarShake(intensity);
    };
    this.scene.add(this.monsters.root);

    const monsterSpawns = this.spawnService.resolveMonsterSpawns(
      this.layout.spawns.monsters,
      this.simWorld.nav,
      this.difficulty,
      pSpawn,
    );

    for (const m of monsterSpawns) {
      const body = this.monsters.addMonster({
        id: m.def.id,
        variant: m.def.variant,
        spawn: m.resolvedSpawn,
      });
      if (this.mapDef.atmosphere.fog?.density) {
        body.fogDensity = this.mapDef.atmosphere.fog.density;
      }
      this.simWorld.addMonster(
        {
          id: m.def.id,
          variant: m.def.variant,
          spawn: m.resolvedSpawn,
          spawnGrace: m.def.spawnGrace ?? (this.difficulty === 'deafening' ? 4.0 : 8.0),
        },
        this.seed,
      );
    }

    // 7. Input wiring
    this.inputRig = new InputRig(
      this.settings,
      {
        onPauseRequested: () => this.togglePause(),
        onCycleItem: () => this.cycleInventory(),
        onToggleFlashlight: () => this.toggleFlashlight(),
        onPing: () => this.netBridge?.handleLocalPing(this.simWorld.player.pos),
      },
      this.sm,
      this.disposal,
    );
    this.inputRig.attach(this.renderer.canvas);

    // 8. Camera positioning
    this.simWorld.player.setYaw(initialYaw);
    this.cameraRig.playerCamera.reset(pSpawn.y);
    this.cameraRig.initRenderTargets(this.renderer.renderer, this.container.clientWidth, this.container.clientHeight);

    // 9. Bridges
    this.anomalyBridge = new AnomalyBridge(this.simWorld.anomalyDirector, this.water, this.audio);
    this.throwableBridge = new ThrowableBridge(
      this.scene,
      this.simWorld,
      this.audio,
      this.water,
      this.hudBridge.hud,
      this.mapId,
    );
    this.netBridge = new NetBridge(
      netSession,
      this.scene,
      this.simWorld,
      this.water,
      this.audio,
      this.hudBridge,
      {
        onRemotePuzzleOp: () => {},
        onRoundEndCheck: () => {},
      },
    );
    this.debugBridge = new DebugBridge(
      this.scene,
      this.simWorld,
      this.container,
      this.captureService,
      this.disposal,
    );

    // 10. Atmosphere & Lighting
    const atmo = setupAtmosphere(this.scene, this.renderer, this.mapDef, this.settings, this.subMode);
    this.envTexture = atmo.envTexture;
    this.sunLight = atmo.sunLight;
    this.shadowFollower = atmo.shadowFollower;

    // 11. Interactions & Acoustics
    this.interactions = new InteractionSystem();
    this.acoustics = new AcousticSystem(this.audio, this.hudBridge.hud, this.settings, this.simWorld.acousticBus);
    this.footsteps = new PlayerFootsteps(this.audio, (pos, strength) => {
      this.water?.splashes.burst(pos, strength);
      if (strength >= 1.0) {
        this.water?.rippleManager.spawnPlayerJumpSplash(pos.x, pos.z);
      } else {
        this.water?.rippleManager.spawnPlayerWadingStep(pos.x, pos.z);
      }
    });

    this.flock = new FlockDirector({
      seed: this.seed,
      anchor: new Vector3(0, 0, 0),
      waterY: this.mapInstance.waterY,
      audio: this.audio,
    });
    this.scene.add(this.flock.root);

    this.weatherDirector = new WeatherDirector({
      seed: this.seed,
      mapId: this.mapId,
      waterY: this.mapInstance.waterY,
      tier,
      weather: this.simWorld.weather,
      audio: this.audio,
      safeMode: this.settings.graphics?.photosensitiveSafe ?? false,
    });
    this.scene.add(this.weatherDirector.particles.root);

    this.lensOverlay = new LensOverlay(this.container);

    // 12. Puzzles initialization
    this.initPuzzles();

    this.menuMusic = MenuMusic.getInstance(this.audio);
    this.menuMusic.start();

    this.coldOpen.checkAndStart(this.mapId, this.inputRig, this.hudBridge);
    this.isLoaded = true;

    // Transition to RUNNING or CAPTURE
    if (this.captureService.isCapture) {
      this.sm.transition('CAPTURE', 'capture_ready');
    } else {
      this.sm.transition('RUNNING', 'init_complete');
      this.inputRig.requestPointerLock();
    }
  }

  private initPuzzles(): void {
    for (const p of this.layout.props) {
      if (p.kind === 'pebble') {
        this.throwableBridge.throwableSystem.addCollectible(p.id, p.position, this.scene);
      }
    }

    if (this.mapId === 'natatorium' || this.mapId === 'poolrooms') {
      this.inventory = [{ kind: 'pebble', count: 3 }];
      this.hudBridge.setInventory(this.inventory);
    }
  }

  openKeypad(): void {
    if (this.keypadModal) {
      this.inputRig.exitPointerLock();
      this.keypadModal.open();
    } else if (this.callbacks.onOpenKeypad) {
      this.inputRig.exitPointerLock();
      this.callbacks.onOpenKeypad((code: string) => this.submitKeypadCode(code));
    }
  }

  submitKeypadCode(code: string): boolean {
    const metaCode = (this.layout.meta['code'] as string) ?? '1234';
    if (code === metaCode) {
      this.exitUnlocked = true;
      this.audio.play('door_clunk', { gain: 1.0 });
      this.simWorld.broadcastNoise({
        kind: 'door',
        position: this.layout.exit.position,
        loudness: 0.7,
        sourcePlayerId: 'player_local',
      });
      return true;
    } else {
      this.simWorld.broadcastNoise({
        kind: 'alarm',
        position: this.layout.exit.position,
        loudness: 0.8,
        sourcePlayerId: 'player_local',
      });
      return false;
    }
  }

  cycleInventory(): void {
    if (this.inventory.length === 0) return;
    this.selectedInventoryIndex = (this.selectedInventoryIndex + 1) % this.inventory.length;
    this.audio.play('flashlight_click', { gain: 0.4 });
    this.hudBridge.setInventory(this.inventory);
  }

  toggleFlashlight(): void {
    if (!this.flashlightLight) return;
    if (this.flashlightBattery <= 0) return;
    this.flashlightActive = !this.flashlightActive;
    this.flashlightLight.visible = this.flashlightActive;
    this.audio.play('flashlight_click', { gain: 0.5 });
  }

  togglePause(): void {
    if (!this.sm.canOpenMenu()) return;
    if (this.sm.is('RUNNING')) {
      this.sm.transition('PAUSED', 'pause_toggle');
      this.inputRig.exitPointerLock();
      this.callbacks.onPause();
    } else if (this.sm.is('PAUSED')) {
      this.resume();
    }
  }

  resume(): void {
    if (this.sm.is('PAUSED')) {
      this.sm.transition('RUNNING', 'resume');
      this.inputRig.requestPointerLock();
    }
  }

  restart(sameSeed = true): void {
    this.reset(sameSeed);
  }

  reset(sameSeed = true): void {
    if (!sameSeed) {
      this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    }
    this.sessionRunTime = 0;
    this.timeSurvived = 0;
    this.noisesMade = 0;
    this.closestCall = 999.0;
    this.exitUnlocked = false;
    this.hasShownDryHint = false;
    this.hasShownWaterHint = false;
    this.firstCreatureSightingTime = null;
    this.encounterBridge.reset();
    this.anomalyBridge?.reset();

    const pSpawn = this.spawnService.resolvePlayerSpawn(this.layout, this.netBridge?.netSession);
    this.simWorld.player.teleport(pSpawn);
    this.simWorld.player.setYaw(this.spawnService.calculateInitialYaw(this.mapId, pSpawn));
    this.cameraRig.playerCamera.reset(pSpawn.y);
    this.openingTurn.active = false;
    this.wasPlayerJumping = false;
    this.wasPlayerWet = false;
    this.lastEntrySplashTime = -1.0;

    this.sm.transition('RUNNING', 'reset');
    this.inputRig.requestPointerLock();
  }

  update(dt: number): void {
    if (!this.isLoaded) {
      this.renderer.beginFrame();
      this.renderer.renderer.render(this.scene, this.camera);
      this.renderer.endFrame();
      return;
    }
    if (!this.sm.is('RUNNING') && !this.sm.is('CAPTURE') && !this.sm.is('DEAD')) return;

    this.sessionRunTime += dt;
    if (!this.encounterBridge.dead) {
      this.timeSurvived += dt;
    }

    this.coldOpen.update(dt, this.hudBridge);

    // 1. Fixed timestep simulation
    this.accumulator += Math.min(dt, 0.25);
    const intent = this.inputRig.pollIntent(dt);
    let lookPending = intent.lookDeltaYaw !== 0 || intent.lookDeltaPitch !== 0;
    const tickIntent = { ...intent };

    while (this.accumulator >= this.FIXED_DT) {
      tickIntent.lookDeltaYaw = lookPending ? intent.lookDeltaYaw : 0;
      tickIntent.lookDeltaPitch = lookPending ? intent.lookDeltaPitch : 0;
      lookPending = false;

      if (this.waterCycle) {
        const curWaterY = this.waterCycle.levelAt(this.simWorld.simTime);
        this.water.updateWaterY(curWaterY);
      }

      this.simWorld.step(this.FIXED_DT, tickIntent);

      // Drain emitted events
      this.simWorld.events.drain((ev) => {
        if (ev.type === 'noise') {
          const noise = ev.data;
          this.debugBridge.spawnHearingRing(noise);
          this.encounterBridge.recordNoise(noise.kind, noise.loudness, Math.max(0.5, noise.loudness * 35.0));
          if (noise.sourcePlayerId !== 'world') {
            this.noisesMade++;
          }
          if (noise.kind === 'jump_in' && noise.loudness >= 0.7) {
            if (noise.sourcePlayerId !== this.simWorld.player.playerId) {
              this.water?.splashes.burst({ x: noise.position.x, y: noise.position.y, z: noise.position.z }, 1.5);
              this.water?.rippleManager.spawnPlayerJumpSplash(noise.position.x, noise.position.z);
              this.audio.play('splash_big', { gain: 0.95 });
            }
          }
        } else if (ev.type === 'ripple') {
          this.water?.onRipple(ev.data);
        }
      });

      this.accumulator -= this.FIXED_DT;
    }

    // 2. Step throwables
    const launch = this.inputRig.consumeThrowLaunch();
    if (launch !== null) {
      this.throwableBridge.launchThrowable(launch, this.inventory, this.selectedInventoryIndex);
    }
    this.throwableBridge.updateProjectiles(dt);
    this.throwableBridge.updateTrajectoryPreview(
      this.inputRig.input.isThrowHeld(),
      this.inputRig.input.getThrowHoldDuration(),
      this.simWorld.player.pos,
    );

    // 3. Update camera & footsteps
    const renderAlpha = this.accumulator / this.FIXED_DT;
    const prevSnap = this.simWorld.player.getPreviousSnapshot();
    const currSnap = this.simWorld.player.getSnapshot();

    // Clean takeoff splash when jumping off the water floor
    const isPlayerJumping = !currSnap.onGround && currSnap.vel.y > 1.0;
    if (!this.wasPlayerJumping && isPlayerJumping && currSnap.wet) {
      this.water?.splashes.burst(currSnap.pos, 0.95);
      this.water?.rippleManager.spawnPlayerJumpSplash(currSnap.pos.x, currSnap.pos.z);
    }
    this.wasPlayerJumping = isPlayerJumping;

    // Clean entry splash when stepping/falling into water from dry land
    if (!this.wasPlayerWet && currSnap.wet) {
      const now = this.simWorld.simTime;
      if (now - this.lastEntrySplashTime > 0.20) {
        this.lastEntrySplashTime = now;
        const entryStrength = Math.min(2.0, 0.9 + (currSnap.lastLandingSpeed ?? 2.0) * 0.25);
        this.water?.splashes.burst(currSnap.pos, entryStrength);
        this.water?.rippleManager.spawnPlayerJumpSplash(currSnap.pos.x, currSnap.pos.z);
      }
    }
    this.wasPlayerWet = currSnap.wet;

    // 3. Check creature proximity
    let nearestMonsterDist = 999.0;
    for (const m of this.simWorld.monsters) {
      const d = Math.hypot(m.pos.x - currSnap.pos.x, m.pos.z - currSnap.pos.z);
      if (d < nearestMonsterDist) nearestMonsterDist = d;
      if (m.state === 'ATTACK' && !this.encounterBridge.dead) {
        const body = this.monsters.getBody(m.id);
        this.encounterBridge.triggerDeath(
          this.cameraRig.camera,
          this.postFX,
          this.timeSurvived,
          this.noisesMade,
          this.closestCall,
          m.pos,
          body?.mesh.joints,
          body?.rig,
          body?.mesh.root,
          body?.animator,
        );
      }
    }
    if (nearestMonsterDist < this.closestCall) {
      this.closestCall = nearestMonsterDist;
    }

    if (this.firstCreatureSightingTime === null && nearestMonsterDist <= 25.0) {
      this.firstCreatureSightingTime = this.timeSurvived;
    }

    this.cameraRig.playerCamera.update(dt, prevSnap, currSnap, renderAlpha, nearestMonsterDist, this.water.currentWaterY);
    this.footsteps.update(currSnap, this.cameraRig.playerCamera.getBobPhase(), this.camera, this.simWorld.waterY);

    const monsterPanic = nearestMonsterDist <= 30.0 ? Math.max(0, Math.min(1, 1.0 - (nearestMonsterDist - 5.0) / 25.0)) : 0.0;
    this.postFX.setTension(monsterPanic);
    this.postFX.update(dt);

    // 4. Update audio listener orientation
    _scratchVecA.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    _scratchVecB.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.audio.setListener(this.camera.position, _scratchVecA, _scratchVecB);

    // 5. Update anomalies & encounters
    this.anomalyBridge.update(dt, this.simWorld.player, this.water.currentWaterY);
    this.encounterBridge.update(dt);

    // Quiet in-world hints (first 90s only)
    if (this.timeSurvived <= 90 && !this.encounterBridge.dead) {
      if (!this.hasShownDryHint && !currSnap.wet && currSnap.onGround) {
        this.hasShownDryHint = true;
        this.hudBridge.hud.showQuietHint('Dry tiles are silent.', 4000);
      } else if (!this.hasShownWaterHint && currSnap.wet) {
        this.hasShownWaterHint = true;
        this.hudBridge.hud.showQuietHint('Water is loud.', 4000);
      }
    }

    // 6. Step subsystems
    this.monsters.update(dt, this.simWorld.monsters, this.simWorld.ground, this.camera, currSnap.pos);
    this.flock.update(dt, this.simWorld.simTime, this.camera);
    this.weatherDirector.update(dt, this.simWorld.simTime, this.camera, currSnap.pos);
    this.lensOverlay.update(dt);
    this.netBridge.update(dt, this.cameraRig.camera);
    this.debugBridge.update(dt, this.cameraRig.camera);

    // 8. Update HUD
    this.hudBridge.updateFrame({
      stamina: currSnap.stamina,
      waterNoiseRadius: currSnap.wet ? 15.0 : 0.0,
      runTimeMs: this.sessionRunTime * 1000,
      pebbleCount: this.throwableBridge.throwableSystem.pebbleCount,
      pebbleEquipped: this.throwableBridge.throwableSystem.isEquipped,
      warningCaption: currSnap.wet,
    });

    // 8b. Update directional shadow follower to player position
    this.shadowFollower?.update(currSnap.pos);

    // 9. Render Frame
    const primaryPos = this.simWorld.monsters[0]?.pos;
    this.cameraRig.renderFrame(
      this.renderer,
      this.scene,
      this.water,
      this.postFX,
      dt,
      this.container,
      this.settings,
      this.lensOverlay,
      primaryPos,
    );
  }

  getFirstCreatureSightingTime(): number | null {
    return this.firstCreatureSightingTime;
  }

  setSettings(newSettings: Settings): void {
    this.settings = newSettings;
    this.audio.applySettings(newSettings.audio);
    this.inputRig?.setSettings(newSettings);
    this.hudBridge?.setSettings(newSettings);
  }

  dispose(): void {
    if (this.sm.is('DISPOSED')) return;
    this.sm.transition('DISPOSING', 'dispose_start');

    if (this.wakeLock) {
      try {
        void (this.wakeLock as { release: () => Promise<void> }).release();
        this.wakeLock = null;
      } catch {
        /* ignore */
      }
    }

    if (this.menuMusic) {
      this.menuMusic.stop();
      this.menuMusic = null;
    }

    setMenuRoute();

    // 1. Takedown subsystems in reverse order
    this.audio.setColliders(null);
    this.audio.dispose();
    this.interactions?.dispose();
    this.acoustics?.dispose();
    this.footsteps?.dispose();
    clearDecalCache();
    clearNumberDecalCache();
    clearPbrCache();

    this.coldOpen.dispose();
    this.inputRig?.dispose();
    this.debugBridge?.dispose();
    this.throwableBridge?.dispose();
    this.netBridge?.dispose();
    this.encounterBridge?.dispose();
    this.cameraRig?.dispose();
    this.water?.dispose();
    this.monsters?.dispose();
    this.flock?.dispose();
    this.weatherDirector?.dispose();
    this.lensOverlay?.dispose();
    if (this.mapInstance) {
      this.disposal.disposeThreeHierarchy(this.mapInstance.root, 'map');
      this.mapInstance.dispose();
    }

    if (this.scene) {
      this.disposal.disposeThreeHierarchy(this.scene, 'scene');
      this.scene.clear();
    }

    if (this.envTexture) {
      this.envTexture.dispose();
      this.envTexture = null;
    }

    this.postFX.dispose();
    this.renderer.dispose();

    // 2. Centralized disposal service cleans up any remaining handles
    this.disposal.disposeAll('session_disposed');
    this.sm.transition('DISPOSED', 'teardown_complete');
  }
}
