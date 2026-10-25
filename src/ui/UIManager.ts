/* ── UIManager.ts ─────────────────────────────────────────────────────────
 *  Master UI orchestrator for BackSilence "The Archive":
 *  Coordinates all analog horror screens, transitions, modal stacks,
 *  deep-link view routing (?v=<view>), popstate history navigation,
 *  keyboard navigation (ESC back), loading screens, results screens,
 *  and live settings application.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Settings, MapId } from '../types/contracts.js';
import type { EventBus } from '../app/EventBus.js';
import type { Store } from '../app/Store.js';
import type { AppStateMachine } from '../app/StateMachine.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { saveSettings } from '../app/Settings.js';
import { parseRoute, navigateToView } from '../app/Router.js';
import { ToastManager } from './ToastManager.js';
import { AudioUnlock } from './AudioUnlock.js';
import { ModeSelect } from './ModeSelect.js';
import { RoomLinkPanel } from './RoomLinkPanel.js';
import { SettingsPanel } from './SettingsPanel.js';
import { HowToPlay } from './HowToPlay.js';
import { Hud, type HudData } from './Hud.js';
import { PauseMenu } from './PauseMenu.js';
import { DeathScreen } from './DeathScreen.js';
import { CalibrationModal } from './CalibrationModal.js';
import { LoadingScreen } from './LoadingScreen.js';
import { ResultsScreen, type RunResults } from './ResultsScreen.js';
import { KeypadModal } from './KeypadModal.js';
import { MetaHubPanel } from './MetaHubPanel.js';
import type { MapDefinition, LayoutData } from '../world/MapTypes.js';
import type { AudioLabPanel } from '../lab/AudioLabPanel.js';

// New Archive Screens
import { HomeScreen } from './screens/HomeScreen.js';
import { PlayHubScreen } from './screens/PlayHubScreen.js';
import { MapsScreen } from './screens/MapsScreen.js';
import { BestiaryScreen } from './screens/BestiaryScreen.js';
import { LeaderboardsScreen } from './screens/LeaderboardsScreen.js';
import { ChampionsScreen } from './screens/ChampionsScreen.js';
import { ProfileScreen } from './screens/ProfileScreen.js';
import { LobbyScreen } from './screens/LobbyScreen.js';
import { CreditsScreen } from './screens/CreditsScreen.js';
import { AboutPrivacyScreen } from './screens/AboutPrivacyScreen.js';
import { ChangelogScreen } from './screens/ChangelogScreen.js';
import { UiLabPage } from './kit/UiLabPage.js';
import { UiLayerManager } from './UiLayerManager.js';

export type UIView =
  | 'MENU'
  | 'PLAY_HUB'
  | 'METAHUB'
  | 'MAPS'
  | 'BESTIARY'
  | 'LEADERBOARDS'
  | 'CHAMPIONS'
  | 'PROFILE'
  | 'LOBBY'
  | 'SETTINGS'
  | 'CREDITS'
  | 'ABOUT'
  | 'CHANGELOG'
  | 'UI_LAB'
  | 'MODE_SELECT'
  | 'ROOM_LINK'
  | 'HOW_TO_PLAY'
  | 'GAME'
  | 'PAUSE'
  | 'DEATH'
  | 'RESULTS';

export interface UIManagerOptions {
  container: HTMLElement;
  bus: EventBus;
  store: Store;
  stateMachine: AppStateMachine;
  onStartGame?: (config: { mode: 'single' | 'multi'; mapId: MapId; difficulty: number; seed: number; room?: string }) => void;
}

export class UIManager {
  private container: HTMLElement;
  private bus: EventBus;
  private store: Store;
  private stateMachine: AppStateMachine;
  private onStartGame?: UIManagerOptions['onStartGame'];

  private currentView: UIView = 'MENU';
  private viewStack: UIView[] = ['MENU'];

  // Subcomponents
  private audioUnlock: AudioUnlock | null = null;
  private toastManager: ToastManager;

  private homeScreen: HomeScreen;
  private playHubScreen: PlayHubScreen;
  private mapsScreen: MapsScreen;
  private bestiaryScreen: BestiaryScreen;
  private leaderboardsScreen: LeaderboardsScreen;
  private championsScreen: ChampionsScreen;
  private profileScreen: ProfileScreen;
  private lobbyScreen: LobbyScreen;
  private creditsScreen: CreditsScreen;
  private aboutPrivacyScreen: AboutPrivacyScreen;
  private changelogScreen: ChangelogScreen;
  private uiLabPage: UiLabPage;

  private modeSelect: ModeSelect;
  private roomLinkPanel: RoomLinkPanel;
  private settingsPanel: SettingsPanel;
  private howToPlay: HowToPlay;
  private hud: Hud;
  private pauseMenu: PauseMenu;
  private deathScreen: DeathScreen;
  private loadingScreen: LoadingScreen;
  private resultsScreen: ResultsScreen;
  private keypadModal: KeypadModal;
  private metaHubPanel: MetaHubPanel;

  private audioLabPanel: AudioLabPanel | null = null;
  private isAudioUnlocked = false;
  private lastResults: RunResults | null = null;
  private lastConfig?: { mode: 'single' | 'multi'; mapId: MapId; difficulty: number; seed: number; room?: string } | undefined;
  private deathTimestamps: number[] = [];

  constructor(opts: UIManagerOptions) {
    this.container = opts.container;
    this.bus = opts.bus;
    this.store = opts.store;
    this.stateMachine = opts.stateMachine;
    this.onStartGame = opts.onStartGame;

    this.toastManager = new ToastManager();
    const initialSettings = this.store.get().settings;

    // 1. Initialize Archive Screens
    this.homeScreen = new HomeScreen({
      onDescend: () => {
        // Direct user gesture unlocks AudioContext immediately
        this.isAudioUnlocked = true;
        const engine = AudioEngine.getInstance();
        void engine.init().then(() => engine.startAmbience());

        const isCalibrated = typeof localStorage !== 'undefined' && localStorage.getItem('backsilence_calibration_done') === 'true';

        const startDescent = () => {
          const lastTape = typeof localStorage !== 'undefined' ? (localStorage.getItem('backsilence_last_tape') as MapId | null) : null;
          const targetMap = lastTape ?? 'orientation';
          this.startGame({
            mode: 'single',
            mapId: targetMap,
            difficulty: 1,
            seed: Date.now(),
          });
        };

        if (!isCalibrated) {
          const modal = new CalibrationModal({
            onComplete: () => startDescent(),
            onSkip: () => startDescent(),
          });
          modal.mount(this.container);
        } else {
          startDescent();
        }
      },
      onDiveOnline: () => this.navigateTo('ROOM_LINK'),
      onDailyDescent: () => this.navigateTo('LEADERBOARDS'),
      onOpenPlayHub: () => this.navigateTo('PLAY_HUB'),
      onOpenBestiary: () => this.navigateTo('BESTIARY'),
      onOpenLeaderboards: () => this.navigateTo('LEADERBOARDS'),
      onOpenChampions: () => this.navigateTo('CHAMPIONS'),
      onOpenProfile: () => this.navigateTo('PROFILE'),
      onOpenSettings: () => this.navigateTo('SETTINGS'),
      onOpenCredits: () => this.navigateTo('CREDITS'),
      onOpenAbout: () => this.navigateTo('ABOUT'),
    });

    this.playHubScreen = new PlayHubScreen({
      onSelectMode: (modeId) => {
        if (modeId === 'campaign') {
          this.navigateTo('MAPS');
        } else if (modeId === 'training') {
          this.startGame({
            mode: 'single',
            mapId: 'orientation',
            difficulty: 1,
            seed: Date.now(),
          });
        } else if (modeId === 'endless') {
          this.startGame({
            mode: 'single',
            mapId: 'drainage_core',
            difficulty: 3,
            seed: Date.now(),
          });
        } else if (modeId === 'daily' || modeId === 'ghost') {
          this.navigateTo('LEADERBOARDS');
        } else if (modeId === 'coop' || modeId === 'race' || modeId === 'last_dry') {
          this.navigateTo('LOBBY');
        } else {
          this.startGame({
            mode: 'single',
            mapId: 'natatorium',
            difficulty: 2,
            seed: Date.now(),
          });
        }
      },
      onBack: () => this.goBack(),
    });

    this.mapsScreen = new MapsScreen({
      onSelectMap: (mapId) => {
        this.startGame({
          mode: 'single',
          mapId: mapId as MapId,
          difficulty: 2,
          seed: Date.now(),
        });
      },
      onBack: () => this.goBack(),
    });

    this.bestiaryScreen = new BestiaryScreen({
      onBack: () => this.goBack(),
      onOpenCredits: () => this.navigateTo('CREDITS'),
    });

    this.leaderboardsScreen = new LeaderboardsScreen({
      onBack: () => this.goBack(),
      onRaceGhost: (_runId) => {
        this.startGame({
          mode: 'single',
          mapId: 'natatorium',
          difficulty: 2,
          seed: 42,
        });
      },
    });

    this.championsScreen = new ChampionsScreen({
      onBack: () => this.goBack(),
      onRaceGhost: (_runId, mapId) => {
        this.startGame({
          mode: 'single',
          mapId: mapId as MapId,
          difficulty: 2,
          seed: 42,
        });
      },
    });

    this.profileScreen = new ProfileScreen({
      onBack: () => this.goBack(),
    });

    const routeRoom = this.store.get().session.room;
    this.lobbyScreen = new LobbyScreen(
      {
        onReadyToggle: (_ready) => {},
        onStartGame: () => {
          this.startGame({
            mode: 'multi',
            mapId: 'natatorium',
            difficulty: 2,
            seed: Date.now(),
          });
        },
        onLeave: () => this.goBack(),
      },
      routeRoom ?? 'K7QX',
      !routeRoom,
    );

    this.creditsScreen = new CreditsScreen({
      onBack: () => this.goBack(),
    });

    this.aboutPrivacyScreen = new AboutPrivacyScreen({
      onBack: () => this.goBack(),
    });

    this.changelogScreen = new ChangelogScreen({
      onBack: () => this.goBack(),
    });

    this.uiLabPage = new UiLabPage();

    // 2. Initialize Panels & Game Screens
    this.metaHubPanel = new MetaHubPanel(() => this.goBack());

    this.modeSelect = new ModeSelect({
      onBack: () => this.goBack(),
      onStartSingle: (config) => {
        this.startGame({
          mode: 'single',
          mapId: config.mapId,
          difficulty: config.difficulty,
          seed: config.seed,
        });
      },
      onOpenMultiplayer: () => {
        this.navigateTo('LOBBY');
      },
    });

    this.roomLinkPanel = new RoomLinkPanel(
      {
        onBack: () => this.goBack(),
        onLaunchGame: (session, mapId, difficulty, seed) => {
          this.navigateTo('GAME');
          this.hud.show();
          this.bus.emit('game:start:net' as unknown as 'game:start', {
            session,
            mapId,
            difficulty,
            seed,
          } as unknown as { mode: 'single'; mapId: 'poolrooms'; difficulty: number; seed: number });
        },
      },
      routeRoom ? 'join' : 'host',
      routeRoom,
    );

    this.settingsPanel = new SettingsPanel(initialSettings, {
      onBack: () => this.goBack(),
      onApplySettings: (s) => this.applySettings(s),
      onOpenAudioTest: () => this.toggleAudioLab(),
    });

    this.howToPlay = new HowToPlay(() => this.goBack());
    this.hud = new Hud();

    this.pauseMenu = new PauseMenu({
      onResume: () => {
        this.bus.emit('game:resume' as unknown as 'game:start', undefined as unknown as { mode: 'single'; mapId: 'poolrooms'; difficulty: number; seed: number });
        this.resumeGame();
      },
      onSettings: () => this.navigateTo('SETTINGS'),
      onControlsReference: () => {
        try {
          localStorage.setItem('backsilence_last_settings_tab', 'controls');
        } catch {
          /* ignore */
        }
        this.navigateTo('SETTINGS');
      },
      onPhotoMode: () => this.takePhotoMode(),
      onAudioLab: () => this.toggleAudioLab(),
      onQuit: () => this.quitToMenu(),
    });

    this.deathScreen = new DeathScreen({
      onRetry: () => {
        this.deathScreen.hide();
        if (this.lastConfig) {
          this.startGame({ ...this.lastConfig, seed: Date.now() });
        } else {
          this.bus.emit('game:retry' as unknown as 'game:start', undefined as unknown as { mode: 'single'; mapId: 'poolrooms'; difficulty: number; seed: number });
          this.resumeGame();
        }
      },
      onMenu: () => this.quitToMenu(),
    });

    this.loadingScreen = new LoadingScreen({
      onCancel: () => this.quitToMenu(),
    });

    this.resultsScreen = new ResultsScreen({
      onContinue: () => {
        this.navigateTo('PLAY_HUB');
      },
      onPlayAgain: () => {
        if (this.lastConfig) {
          this.startGame({ ...this.lastConfig, seed: Date.now() });
        } else {
          this.startGame({ mode: 'single', mapId: 'natatorium', difficulty: 2, seed: Date.now() });
        }
      },
      onNextTape: (nextMapId) => {
        const diff = this.lastConfig?.difficulty ?? 2;
        this.startGame({ mode: 'single', mapId: nextMapId, difficulty: diff, seed: Date.now() });
      },
    });

    this.keypadModal = new KeypadModal({
      onSubmit: () => false,
      onCancel: () => {},
      onLockout: () => {},
    });

    this.mountAll();
    this.bindGlobalKeyboard();
    this.applySettings(initialSettings);
    this.initDeepLinkRoute();
  }

  private mountAll(): void {
    // Mount all screens into the main app container
    this.container.appendChild(this.homeScreen.element);
    this.container.appendChild(this.playHubScreen.element);
    this.container.appendChild(this.mapsScreen.element);
    this.container.appendChild(this.bestiaryScreen.element);
    this.container.appendChild(this.leaderboardsScreen.element);
    this.container.appendChild(this.championsScreen.element);
    this.container.appendChild(this.profileScreen.element);
    this.container.appendChild(this.lobbyScreen.element);
    this.container.appendChild(this.creditsScreen.element);
    this.container.appendChild(this.aboutPrivacyScreen.element);
    this.container.appendChild(this.changelogScreen.element);
    this.container.appendChild(this.uiLabPage.element);

    this.modeSelect.mount(this.container);
    this.roomLinkPanel.mount(this.container);
    this.settingsPanel.mount(this.container);
    this.howToPlay.mount(this.container);
    this.hud.mount(this.container);
    this.pauseMenu.mount(this.container);
    this.deathScreen.mount(this.container);
    this.loadingScreen.mount(this.container);
    this.resultsScreen.mount(this.container);
    this.keypadModal.mount(this.container);
    this.metaHubPanel.mount(this.container);

    this.updateViewVisibility();
  }

  private initDeepLinkRoute(): void {
    const route = parseRoute();
    if (route.labMode === 'ui' || route.view === 'ui') {
      this.currentView = 'UI_LAB';
      this.viewStack = ['UI_LAB'];
    } else if (route.view) {
      const revMap: Record<string, UIView> = {
        home: 'MENU',
        play: 'PLAY_HUB',
        campaign: 'METAHUB',
        maps: 'MAPS',
        bestiary: 'BESTIARY',
        leaderboards: 'LEADERBOARDS',
        champions: 'CHAMPIONS',
        profile: 'PROFILE',
        lobby: 'LOBBY',
        settings: 'SETTINGS',
        credits: 'CREDITS',
        about: 'ABOUT',
        changelog: 'CHANGELOG',
      };
      const rev = revMap[route.view];
      if (rev) {
        this.currentView = rev;
        this.viewStack = [this.currentView];
      }
    }

    window.addEventListener('popstate', (e) => {
      const v = (e.state as { view?: string })?.view ?? parseRoute().view ?? 'home';
      const revMap: Record<string, UIView> = {
        home: 'MENU',
        play: 'PLAY_HUB',
        campaign: 'METAHUB',
        maps: 'MAPS',
        bestiary: 'BESTIARY',
        leaderboards: 'LEADERBOARDS',
        champions: 'CHAMPIONS',
        profile: 'PROFILE',
        lobby: 'LOBBY',
        settings: 'SETTINGS',
        credits: 'CREDITS',
        about: 'ABOUT',
        changelog: 'CHANGELOG',
        ui: 'UI_LAB',
      };
      if (revMap[v]) {
        this.navigateTo(revMap[v], false);
      }
    });

    this.updateViewVisibility();
  }

  setAudioLabPanel(panel: AudioLabPanel): void {
    this.audioLabPanel = panel;
  }

  toggleAudioLab(): void {
    if (this.audioLabPanel) {
      this.audioLabPanel.toggle();
    } else {
      this.toastManager.show('Audio Lab panel available in Lab scene (?lab=1)', 'warn');
    }
  }

  showAudioUnlock(onUnlocked?: () => void): void {
    if (this.isAudioUnlocked) return;
    this.audioUnlock = new AudioUnlock(() => {
      this.isAudioUnlocked = true;
      const engine = AudioEngine.getInstance();
      void engine.init().then(() => {
        engine.startAmbience();
        if (onUnlocked) onUnlocked();
      });
    });
    this.audioUnlock.mount(this.container);
  }

  setCalibrationProgress(_pct: number): void {
    // Handled by loading bar
  }

  showToast(message: string, type: 'info' | 'warn' | 'error' = 'info'): void {
    this.toastManager.show(message, type);
  }

  updateHud(data: Partial<HudData>): void {
    this.hud.update(data);
  }

  navigateTo(view: UIView, pushUrl = true): void {
    if (this.currentView === view) return;
    this.viewStack.push(view);
    this.currentView = view;

    if (view === 'MODE_SELECT') {
      this.stateMachine.goTo('MODE_SELECT');
    } else if (view === 'MENU') {
      this.stateMachine.goTo('MENU');
    }

    if (pushUrl) {
      const urlMap: Partial<Record<UIView, string>> = {
        MENU: 'home',
        PLAY_HUB: 'play',
        METAHUB: 'campaign',
        MAPS: 'maps',
        BESTIARY: 'bestiary',
        LEADERBOARDS: 'leaderboards',
        CHAMPIONS: 'champions',
        PROFILE: 'profile',
        LOBBY: 'lobby',
        SETTINGS: 'settings',
        CREDITS: 'credits',
        ABOUT: 'about',
        CHANGELOG: 'changelog',
        UI_LAB: 'ui',
      };
      const viewParam = urlMap[view];
      if (viewParam) {
        navigateToView(viewParam);
      }
    }

    this.updateViewVisibility();
  }

  goBack(): void {
    if (this.viewStack.length > 1) {
      this.viewStack.pop();
      const prev = this.viewStack[this.viewStack.length - 1];
      this.currentView = prev ?? 'MENU';
      if (this.currentView === 'MENU') {
        this.stateMachine.goTo('MENU');
      }
      this.updateViewVisibility();
    } else if (this.currentView !== 'MENU') {
      this.currentView = 'MENU';
      this.viewStack = ['MENU'];
      this.stateMachine.goTo('MENU');
      this.updateViewVisibility();
    }
  }

  private hideAllScreens(): void {
    this.homeScreen.element.style.display = 'none';
    this.playHubScreen.element.style.display = 'none';
    this.mapsScreen.element.style.display = 'none';
    this.bestiaryScreen.element.style.display = 'none';
    this.leaderboardsScreen.element.style.display = 'none';
    this.championsScreen.element.style.display = 'none';
    this.profileScreen.element.style.display = 'none';
    this.lobbyScreen.element.style.display = 'none';
    this.creditsScreen.element.style.display = 'none';
    this.aboutPrivacyScreen.element.style.display = 'none';
    this.changelogScreen.element.style.display = 'none';
    this.uiLabPage.element.style.display = 'none';

    this.modeSelect.hide();
    this.roomLinkPanel.hide();
    this.settingsPanel.hide();
    this.howToPlay.hide();
    this.pauseMenu.hide();
    this.deathScreen.hide();
    this.resultsScreen.hide();
    this.metaHubPanel.hide();
    this.bestiaryScreen.pause();
  }

  private updateViewVisibility(): void {
    this.hideAllScreens();

    switch (this.currentView) {
      case 'MENU':
        this.homeScreen.element.style.display = 'flex';
        this.hud.hide();
        break;
      case 'PLAY_HUB':
        this.playHubScreen.element.style.display = 'flex';
        this.hud.hide();
        break;
      case 'MAPS':
        this.mapsScreen.element.style.display = 'flex';
        this.hud.hide();
        break;
      case 'BESTIARY':
        this.bestiaryScreen.element.style.display = 'flex';
        this.bestiaryScreen.resume();
        this.hud.hide();
        break;
      case 'LEADERBOARDS':
        this.leaderboardsScreen.element.style.display = 'flex';
        this.hud.hide();
        break;
      case 'CHAMPIONS':
        this.championsScreen.element.style.display = 'flex';
        this.hud.hide();
        break;
      case 'PROFILE':
        this.profileScreen.element.style.display = 'flex';
        this.hud.hide();
        break;
      case 'LOBBY':
        this.lobbyScreen.element.style.display = 'flex';
        this.hud.hide();
        break;
      case 'CREDITS':
        this.creditsScreen.element.style.display = 'flex';
        this.hud.hide();
        break;
      case 'ABOUT':
        this.aboutPrivacyScreen.element.style.display = 'flex';
        this.hud.hide();
        break;
      case 'CHANGELOG':
        this.changelogScreen.element.style.display = 'flex';
        this.hud.hide();
        break;
      case 'UI_LAB':
        this.uiLabPage.element.style.display = 'block';
        this.hud.hide();
        break;
      case 'METAHUB':
        this.metaHubPanel.show('tapes');
        this.hud.hide();
        break;
      case 'MODE_SELECT':
        this.modeSelect.show();
        this.hud.hide();
        break;
      case 'ROOM_LINK':
        this.roomLinkPanel.show();
        this.hud.hide();
        break;
      case 'SETTINGS':
        this.settingsPanel.show();
        break;
      case 'HOW_TO_PLAY':
        this.howToPlay.show();
        this.hud.hide();
        break;
      case 'GAME':
        this.hud.show();
        break;
      case 'PAUSE':
        this.pauseMenu.show();
        this.hud.show();
        break;
      case 'DEATH':
        this.deathScreen.show();
        this.hud.show();
        break;
      case 'RESULTS':
        if (this.lastResults) {
          this.resultsScreen.show(this.lastResults);
        } else {
          this.resultsScreen.show({
            mapId: 'poolrooms',
            timeSurvived: 0,
            noisesMade: 0,
            closestCall: 0,
            alertsCount: 0,
            retries: 0,
          });
        }
        this.hud.hide();
        break;
    }

    const activeEl = this.getActiveScreenElement();
    if (activeEl) {
      const isModal = ['PAUSE', 'SETTINGS'].includes(this.currentView);
      UiLayerManager.getInstance().pushLayer(activeEl, isModal);
    }
  }

  private getActiveScreenElement(): HTMLElement | null {
    switch (this.currentView) {
      case 'MENU': return this.homeScreen.element;
      case 'PLAY_HUB': return this.playHubScreen.element;
      case 'MAPS': return this.mapsScreen.element;
      case 'BESTIARY': return this.bestiaryScreen.element;
      case 'LEADERBOARDS': return this.leaderboardsScreen.element;
      case 'CHAMPIONS': return this.championsScreen.element;
      case 'PROFILE': return this.profileScreen.element;
      case 'LOBBY': return this.lobbyScreen.element;
      case 'CREDITS': return this.creditsScreen.element;
      case 'ABOUT': return this.aboutPrivacyScreen.element;
      case 'CHANGELOG': return this.changelogScreen.element;
      case 'UI_LAB': return this.uiLabPage.element;
      case 'METAHUB': return document.getElementById('metahub-panel');
      case 'MODE_SELECT': return document.getElementById('mode-select-view');
      case 'ROOM_LINK': return document.getElementById('room-link-view');
      case 'SETTINGS': return document.getElementById('settings-panel-view');
      case 'HOW_TO_PLAY': return document.getElementById('how-to-play-view');
      case 'PAUSE': return document.getElementById('pause-menu-view');
      case 'DEATH': return document.getElementById('death-screen-view');
      case 'RESULTS': return document.getElementById('results-screen');
      default: return null;
    }
  }

  private startGame(config: { mode: 'single' | 'multi'; mapId: MapId; difficulty: number; seed: number; room?: string }): void {
    this.lastConfig = config;
    try {
      localStorage.setItem('backsilence_last_tape', config.mapId);
      localStorage.setItem('backsilence_last_mode', config.mode);
      localStorage.setItem('backsilence_last_difficulty', String(config.difficulty));
    } catch {
      /* ignore */
    }

    this.currentView = 'GAME';
    this.viewStack = ['GAME'];
    this.updateViewVisibility();
    this.stateMachine.goTo('LOADING');

    if (this.onStartGame) {
      this.onStartGame(config);
    }
  }

  showLoading(def: MapDefinition, layout: LayoutData): void {
    this.loadingScreen.show(def, layout);
  }

  setLoadingProgress(pct: number): void {
    this.loadingScreen.setProgress(pct);
  }

  hideLoading(): void {
    this.loadingScreen.hide();
  }

  showResults(results: RunResults): void {
    this.lastResults = results;
    this.currentView = 'RESULTS';
    this.viewStack.push('RESULTS');
    this.updateViewVisibility();
    this.stateMachine.goTo('RESULTS');
  }

  showDeath(reason?: string): void {
    const now = Date.now();
    this.deathTimestamps = this.deathTimestamps.filter((t) => now - t < 300000); // 5 min window
    this.deathTimestamps.push(now);

    if (reason) {
      this.deathScreen.setReason(reason);
    }
    this.currentView = 'DEATH';
    this.viewStack.push('DEATH');
    this.updateViewVisibility();
    this.deathScreen.show();
    this.stateMachine.goTo('DEAD');

    // Frustration protection (Phase F): Offer assists after 2 rapid deaths, orientation after 3
    if (this.deathTimestamps.length === 2) {
      setTimeout(() => {
        this.toastManager.show('Struggling? Assistance available: jump buffer and visual noise arcs can be configured.', {
          type: 'info',
          action: {
            label: 'SETTINGS',
            onClick: () => this.navigateTo('SETTINGS'),
          },
        });
      }, 1200);
    } else if (this.deathTimestamps.length >= 3) {
      setTimeout(() => {
        this.toastManager.show('Multiple casualties in 5 minutes. Would you like to practice in the guided Orientation run?', {
          type: 'warning',
          action: {
            label: 'ORIENTATION',
            onClick: () => {
              this.deathScreen.hide();
              this.startGame({ mode: 'single', mapId: 'orientation', difficulty: 1, seed: Date.now() });
            },
          },
        });
      }, 1200);
    }
  }

  showPause(): void {
    if (this.currentView === 'GAME') {
      this.currentView = 'PAUSE';
      this.viewStack.push('PAUSE');
      this.updateViewVisibility();
      this.stateMachine.goTo('PAUSED');
    }
  }

  resumeGame(): void {
    this.currentView = 'GAME';
    this.viewStack = ['GAME'];
    this.updateViewVisibility();
    this.stateMachine.goTo('PLAYING');
  }

  quitToMenu(): void {
    this.currentView = 'MENU';
    this.viewStack = ['MENU'];
    this.updateViewVisibility();
    this.stateMachine.goTo('MENU');
    this.bus.emit('game:quit' as unknown as 'game:start', undefined as unknown as { mode: 'single'; mapId: 'poolrooms'; difficulty: number; seed: number });
  }

  showKeypad(correctCode: string, onSolved: () => void, onLockout?: () => void): void {
    this.keypadModal.show(correctCode, onSolved, onLockout);
  }

  getHud(): Hud {
    return this.hud;
  }

  getDeathScreen(): DeathScreen {
    return this.deathScreen;
  }

  getKeypadModal(): KeypadModal {
    return this.keypadModal;
  }

  applySettings(s: Settings): void {
    saveSettings(s);
    document.documentElement.style.setProperty('--ui-scale', String(s.accessibility.uiScale));
    this.hud.setMinimalHud(Boolean(s.accessibility.minimalHud));
    this.hud.setUiScale(s.accessibility.uiScale ?? 1.0);

    if (s.accessibility.highContrast) {
      document.documentElement.classList.add('high-contrast');
      document.documentElement.setAttribute('data-contrast', 'high');
    } else {
      document.documentElement.classList.remove('high-contrast');
      document.documentElement.removeAttribute('data-contrast');
    }

    if (s.graphics.photosensitiveSafe) {
      document.documentElement.setAttribute('data-photosensitive', 'safe');
    } else {
      document.documentElement.removeAttribute('data-photosensitive');
    }

    this.bus.emit('settings:applied' as unknown as 'game:start', s as unknown as { mode: 'single'; mapId: 'poolrooms'; difficulty: number; seed: number });
  }

  takePhotoMode(): void {
    const canvas =
      document.querySelector<HTMLCanvasElement>('#canvas-container canvas') ??
      document.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) {
      this.toastManager.show('Photo capture failed: 3D canvas not found.', 'error');
      return;
    }

    this.hud.hide();

    requestAnimationFrame(() => {
      try {
        canvas.toBlob((blob) => {
          this.hud.show();
          if (!blob) {
            this.toastManager.show('Photo capture failed: could not export image data.', 'error');
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          a.download = `backsilence_photo_${ts}.png`;
          a.href = url;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 5000);

          this.toastManager.show('📸 Photo snapshot saved to downloads!', {
            type: 'success',
            durationMs: 4000,
          });
        }, 'image/png');
      } catch {
        this.hud.show();
        this.toastManager.show('Photo export error.', 'error');
      }
    });
  }

  private bindGlobalKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.currentView === 'GAME') {
          this.showPause();
        } else if (this.currentView !== 'MENU') {
          this.goBack();
        }
      } else if ((e.key === 'p' || e.key === 'P') && this.currentView === 'GAME') {
        e.preventDefault();
        this.takePhotoMode();
      }
    });
  }

  getCurrentView(): UIView {
    return this.currentView;
  }

  getLastConfig(): { mode: 'single' | 'multi'; mapId: MapId; difficulty: number; seed: number; room?: string } | undefined {
    return this.lastConfig;
  }
}
