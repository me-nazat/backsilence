/* ── UIManager.ts ─────────────────────────────────────────────────────────
 *  Master UI orchestrator for BackSilence:
 *  Coordinates all analog horror screens, transitions, modal stacks,
 *  keyboard navigation (ESC back), loading screens, results screens,
 *  keypad modals, and live settings application.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Settings, MapId } from '../types/contracts.js';
import type { EventBus } from '../app/EventBus.js';
import type { Store } from '../app/Store.js';
import type { AppStateMachine } from '../app/StateMachine.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { saveSettings } from '../app/Settings.js';
import { ToastManager } from './ToastManager.js';
import { AudioUnlock } from './AudioUnlock.js';
import { MainMenu } from './MainMenu.js';
import { ModeSelect } from './ModeSelect.js';
import { RoomLinkPanel } from './RoomLinkPanel.js';
import { SettingsPanel } from './SettingsPanel.js';
import { HowToPlay } from './HowToPlay.js';
import { Hud, type HudData } from './Hud.js';
import { PauseMenu } from './PauseMenu.js';
import { DeathScreen } from './DeathScreen.js';
import { LoadingScreen } from './LoadingScreen.js';
import { ResultsScreen, type RunResults } from './ResultsScreen.js';
import { KeypadModal } from './KeypadModal.js';
import type { MapDefinition, LayoutData } from '../world/MapTypes.js';
import type { AudioLabPanel } from '../lab/AudioLabPanel.js';

export type UIView =
  | 'MENU'
  | 'MODE_SELECT'
  | 'ROOM_LINK'
  | 'SETTINGS'
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
  private mainMenu: MainMenu;
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

  private audioLabPanel: AudioLabPanel | null = null;
  private isAudioUnlocked = false;

  constructor(opts: UIManagerOptions) {
    this.container = opts.container;
    this.bus = opts.bus;
    this.store = opts.store;
    this.stateMachine = opts.stateMachine;
    this.onStartGame = opts.onStartGame;

    // Toast manager is always active
    this.toastManager = new ToastManager();

    const initialSettings = this.store.get().settings;

    // Initialize all screens
    this.mainMenu = new MainMenu({
      onPlaySolo: () => this.navigateTo('MODE_SELECT'),
      onPlayOnline: () => {
        this.navigateTo('ROOM_LINK');
      },
      onHowToPlay: () => this.navigateTo('HOW_TO_PLAY'),
      onSettings: () => this.navigateTo('SETTINGS'),
      onAbout: () => {
        this.toastManager.show('BackSilence — It can\'t see you. It hears the water.', 'info');
      },
    });

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
        this.navigateTo('ROOM_LINK');
      },
    });

    const routeRoom = this.store.get().session.room;
    this.roomLinkPanel = new RoomLinkPanel(
      {
        onBack: () => this.goBack(),
        onEnterLobby: (roomCode, isHost) => {
          this.toastManager.show(`Connected to room: ${roomCode} (${isHost ? 'Host' : 'Peer'})`, 'info');
          this.bus.emit('net:join', { room: roomCode, mode: isHost ? 'host' : 'peer' });
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
      onAudioLab: () => this.toggleAudioLab(),
      onQuit: () => this.quitToMenu(),
    });

    this.deathScreen = new DeathScreen({
      onRetry: () => {
        this.deathScreen.hide();
        this.bus.emit('game:retry' as unknown as 'game:start', undefined as unknown as { mode: 'single'; mapId: 'poolrooms'; difficulty: number; seed: number });
        this.resumeGame();
      },
      onMenu: () => this.quitToMenu(),
    });

    this.loadingScreen = new LoadingScreen();
    this.resultsScreen = new ResultsScreen({
      onContinue: () => {
        this.navigateTo('MODE_SELECT');
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
  }

  private mountAll(): void {
    this.mainMenu.mount(this.container);
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

  setCalibrationProgress(pct: number): void {
    this.mainMenu.setCalibrationProgress(pct);
  }

  showToast(message: string, type: 'info' | 'warn' | 'error' = 'info'): void {
    this.toastManager.show(message, type);
  }

  updateHud(data: Partial<HudData>): void {
    this.hud.update(data);
  }

  navigateTo(view: UIView): void {
    if (this.currentView === view) return;
    this.viewStack.push(view);
    this.currentView = view;
    if (view === 'MODE_SELECT' && this.stateMachine.canTransition('MODE_SELECT')) {
      this.stateMachine.transition('MODE_SELECT');
    } else if (view === 'MENU' && this.stateMachine.canTransition('MENU')) {
      this.stateMachine.transition('MENU');
    }
    this.updateViewVisibility();
  }

  goBack(): void {
    if (this.viewStack.length > 1) {
      this.viewStack.pop();
      const prev = this.viewStack[this.viewStack.length - 1];
      this.currentView = prev ?? 'MENU';
      if (this.currentView === 'MENU' && this.stateMachine.canTransition('MENU')) {
        this.stateMachine.transition('MENU');
      }
      this.updateViewVisibility();
    } else if (this.currentView !== 'MENU') {
      this.currentView = 'MENU';
      this.viewStack = ['MENU'];
      if (this.stateMachine.canTransition('MENU')) {
        this.stateMachine.transition('MENU');
      }
      this.updateViewVisibility();
    }
  }

  private updateViewVisibility(): void {
    this.mainMenu.hide();
    this.modeSelect.hide();
    this.roomLinkPanel.hide();
    this.settingsPanel.hide();
    this.howToPlay.hide();
    this.pauseMenu.hide();
    this.deathScreen.hide();
    this.resultsScreen.hide();

    switch (this.currentView) {
      case 'MENU':
        this.mainMenu.show();
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
        this.resultsScreen.show({
          mapId: 'poolrooms',
          timeSurvived: 0,
          noisesMade: 0,
          closestCall: 0,
          alertsCount: 0,
          retries: 0,
        });
        this.hud.hide();
        break;
    }
  }

  private startGame(config: { mode: 'single' | 'multi'; mapId: MapId; difficulty: number; seed: number; room?: string }): void {
    this.currentView = 'GAME';
    this.viewStack = ['GAME'];
    this.updateViewVisibility();
    if (this.stateMachine.canTransition('MODE_SELECT')) {
      this.stateMachine.transition('MODE_SELECT');
    }
    if (this.stateMachine.canTransition('LOADING')) {
      this.stateMachine.transition('LOADING');
    }

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
    this.currentView = 'RESULTS';
    this.updateViewVisibility();
    this.resultsScreen.show(results);
    if (this.stateMachine.canTransition('MENU')) {
      this.stateMachine.transition('MENU');
    }
  }

  getKeypadModal(): KeypadModal {
    return this.keypadModal;
  }

  private resumeGame(): void {
    if (this.currentView === 'PAUSE' || this.currentView === 'SETTINGS') {
      this.currentView = 'GAME';
      this.viewStack = ['GAME'];
      this.updateViewVisibility();
      this.stateMachine.transition('PLAYING');
    }
  }

  private quitToMenu(): void {
    this.currentView = 'MENU';
    this.viewStack = ['MENU'];
    this.updateViewVisibility();
    this.stateMachine.transition('MENU');
    this.bus.emit('game:leave', undefined);
  }

  showPause(): void {
    this.navigateTo('PAUSE');
    if (this.stateMachine.current === 'PLAYING') {
      this.stateMachine.transition('PAUSED');
    }
  }

  showDeath(reason?: string): void {
    if (reason) this.deathScreen.setReason(reason);
    this.navigateTo('DEATH');
    if (this.stateMachine.current === 'PLAYING') {
      this.stateMachine.transition('DEAD');
    }
  }

  private bindGlobalKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.keypadModal.isOpen()) {
          this.keypadModal.close();
        } else if (this.currentView === 'GAME') {
          this.showPause();
        } else if (this.currentView === 'PAUSE') {
          this.resumeGame();
        } else if (this.currentView !== 'MENU') {
          this.goBack();
        }
      } else if (e.key === 'b' || e.key === 'B') {
        // Toggle Audio Lab shortcut if not typing in an input
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
          this.toggleAudioLab();
        }
      }
    });
  }

  applySettings(s: Settings): void {
    this.store.set('settings', s);
    saveSettings(s);

    // Apply UI scaling
    document.documentElement.style.setProperty('--ui-scale', String(s.accessibility.uiScale));

    // High contrast
    if (s.accessibility.highContrast) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }

    // Reduced motion
    if (s.accessibility.reducedMotion === 'on') {
      document.documentElement.setAttribute('data-reduced-motion', 'true');
    } else if (s.accessibility.reducedMotion === 'off') {
      document.documentElement.setAttribute('data-reduced-motion', 'false');
    } else {
      document.documentElement.removeAttribute('data-reduced-motion');
    }

    // Audio Engine volume updates
    AudioEngine.getInstance().applySettings(s.audio);

    this.bus.emit('settings:changed', s);
  }

  getHud(): Hud {
    return this.hud;
  }

  getDeathScreen(): DeathScreen {
    return this.deathScreen;
  }
}
