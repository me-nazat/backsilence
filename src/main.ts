/* ── main.ts ──────────────────────────────────────────────────────────────
 *  High-performance boot pipeline & master entry point:
 *  1. Immediate interactive UI bootstrap (< 1s) with performance.mark('menu:interactive')
 *  2. Parallel background chunk loading (Three.js, Engine, Audio, Procedural)
 *  3. Cooperative texture warm-up via scheduler time-slicing (6ms budget)
 *  4. AudioUnlock atmosphere overlay on first user gesture
 *  5. WebGL2 graceful degradation & fallback
 *  6. LabScene 3D background / interactive lab router
 * ──────────────────────────────────────────────────────────────────────── */

import './ui/kit/kit.css';
import { ErrorBoundary } from './engine/ErrorBoundary.js';

// Initialize global analog-horror error boundary and 50-event ring buffer immediately
ErrorBoundary.init();

import { createEventBus } from './app/EventBus.js';
import { createStore } from './app/Store.js';
import { AppStateMachine } from './app/StateMachine.js';
import { parseRoute } from './app/Router.js';
import { loadSettings } from './app/Settings.js';
import { injectPaletteVars } from './app/Palette.js';
import type { UIManager } from './ui/UIManager.js';
import type { LabScene } from './lab/LabScene.js';
import type { NetSession } from './net/session/NetSession.js';
import type { Settings } from './types/contracts.js';

// ── Boot progress bar ───────────────────────────────────────────────────
function setBootProgress(pct: number): void {
  const bar = document.getElementById('boot-bar');
  if (bar) {
    bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    const wrap = bar.parentElement;
    if (wrap) wrap.setAttribute('aria-valuenow', String(Math.round(pct)));
  }
}

function hideSplash(): void {
  const splash = document.getElementById('splash');
  if (splash) {
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
    }, 600);
  }
}

function showApp(): void {
  const app = document.getElementById('app');
  if (app) app.classList.add('visible');
}

function showWebGlError(reason: string): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.style.display = 'flex';
  app.style.flexDirection = 'column';
  app.style.alignItems = 'center';
  app.style.justifyContent = 'center';
  app.style.padding = '20px';
  app.style.textAlign = 'center';
  app.innerHTML = `
    <div id="webgl-recovery-screen" style="
      background: rgba(13,11,6,0.95);
      border: 1px solid rgba(179,38,30,0.6);
      padding: 30px 24px;
      max-width: 520px;
      color: var(--fog, #d9d3a2);
      font-family: monospace;
      box-shadow: 0 0 30px rgba(179,38,30,0.4);
      border-radius: 4px;
      text-align: left;
    ">
      <h2 style="color: var(--danger, #b3261e); margin-bottom: 12px; font-size: 16px; letter-spacing: 0.1em; text-align: center;">GRAPHICS ACCELERATION / WEBGL 2.0 REQUIRED</h2>
      <p style="font-size: 13px; opacity: 0.85; margin-bottom: 16px; line-height: 1.5;">
        BackSilence requires WebGL 2.0 with hardware acceleration to render real-time caustics and ceramic PBR shaders.
        <br><br>
        <strong>Diagnostic:</strong> ${reason}
      </p>
      <div style="background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); padding: 12px; margin-bottom: 20px; font-size: 12px; line-height: 1.6; color: rgba(217,211,162,0.85);">
        <strong>Troubleshooting Instructions:</strong>
        <ul style="margin: 6px 0 0 16px; padding: 0;">
          <li><strong>Chrome / Edge:</strong> Settings → System → Enable <em>"Use graphics acceleration when available"</em>, then relaunch.</li>
          <li><strong>Safari:</strong> Settings → Advanced → Feature Flags → Ensure <em>"WebGL 2.0"</em> is enabled.</li>
          <li><strong>Firefox:</strong> Settings → General → Performance → Check <em>"Use recommended performance settings"</em>.</li>
          <li>Update your display drivers and close other memory-intensive 3D tabs.</li>
        </ul>
      </div>
      <div style="display: flex; gap: 12px; justify-content: center;">
        <button id="btn-webgl-retry" class="analog-btn primary" onclick="window.location.reload()">RELOAD & RETRY</button>
      </div>
    </div>
  `;
}

if (typeof window !== 'undefined') {
  window.addEventListener('backsilence:webgl-lost', (e) => {
    const detail = (e as CustomEvent<{ reason?: string }>).detail;
    showWebGlError(detail?.reason || 'WebGL context lost.');
  });

  document.getElementById('skip-to-play')?.addEventListener('click', (e) => {
    e.preventDefault();
    const playBtn = document.getElementById('btn-play-solo') || document.getElementById('nav-btn-play');
    playBtn?.focus();
  });
}

/** Register the offline shell without delaying the interactive menu. */
function registerOfflineSupport(onReady: () => void, onFailure: (message: string) => void): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  // Stale worker recovery: controllerchange tracking
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      console.log('[BackSilence] Service worker updated and active.');
    }
  });

  const registerAfterFirstPaint = () => {
    window.requestAnimationFrame(() => {
      void (async () => {
        try {
          const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker?.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          });

          await navigator.serviceWorker.ready;
          onReady();

          const prefetch = () => {
            void (async () => {
              const { ALL_MAP_IDS, getMapDefinition } = await import('./world/MapRegistry.js');
              await Promise.all([
                import('./game/GameSession.js'),
                ...ALL_MAP_IDS.map((mapId) => getMapDefinition(mapId)),
              ]);
              onReady();
            })().catch(() => onFailure('Offline cache could not be prepared. Online play is still available.'));
          };
          if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(prefetch, { timeout: 3000 });
          } else {
            globalThis.setTimeout(prefetch, 0);
          }
        } catch {
          onFailure('Offline cache could not be prepared. Online play is still available.');
        }
      })();
    });
  };

  // Dynamic module loading can finish after window.load. In that case a
  // load-only listener would never run and first-visit offline setup is lost.
  if (document.readyState === 'complete') {
    registerAfterFirstPaint();
  } else {
    window.addEventListener('load', registerAfterFirstPaint, { once: true });
  }
}

// ── Master Boot Function ────────────────────────────────────────────────
async function boot(): Promise<void> {
  const bootStart = performance.now();

  // 1. Parse route & Load settings
  console.log('[boot] 1. route/settings');
  const route = parseRoute();
  setBootProgress(15);

  const settings = loadSettings();
  setBootProgress(30);

  // 2. Initialize Core Systems
  console.log('[boot] 2. store/bus');
  const bus = createEventBus();
  const store = createStore({
    settings,
    session: {
      mode: route.room ? 'multi' : 'single',
      mapId: 'natatorium',
      seed: Date.now(),
      room: route.room,
    },
    ui: {
      showFps: settings.graphics.showFps,
      debugMode: route.debug,
      labMode: route.lab,
    },
  });

  const stateMachine = new AppStateMachine(bus, 'BOOT');
  injectPaletteVars();

  // 2.5 Early Identity & Online Platform Initialization (non-blocking)
  void Promise.all([
    import('./meta/Identity.js'),
    import('./net/adapters/TursoProxyAdapter.js'),
    import('./meta/OfflineQueue.js'),
  ]).then(([{ IdentityManager }, { TursoProxyAdapter }, { OfflineQueue }]) => {
    const winAny = window as unknown as Record<string, unknown>;
    winAny.__backsilence_identity = IdentityManager;
    winAny.__backsilence_proxy = new TursoProxyAdapter();
    winAny.__backsilence_offline_queue = OfflineQueue;
  }).catch(() => {});

  // 3. Dynamic-import UI Module (< 1s budget)
  console.log('[boot] 3. importing UIManager');
  const { UIManager } = await import('./ui/UIManager.js');
  console.log('[boot] 4. constructing UIManager');
  const appContainer = document.getElementById('app');
  if (!appContainer) throw new Error('Missing #app container');

  let ui: UIManager | null = null;
  ui = new UIManager({
    container: appContainer,
    bus,
    store,
    stateMachine,
    onStartGame: (cfg) => {
      console.log('[BackSilence] Starting game session:', cfg);
      bus.emit('game:start', cfg);
    },
  });
  console.log('[boot] 5. UIManager constructed');

  setBootProgress(100);

  // Mark menu interactive immediately
  performance.mark('menu:interactive');
  const interactiveDuration = performance.now() - bootStart;
  console.log(`[BackSilence] Menu interactive in ${interactiveDuration.toFixed(1)} ms`);

  // Reveal UI and transition state machine
  showApp();
  hideSplash();
  stateMachine.transition('MENU');

  // Install debug tools. The solo network guard is intentionally debug-only
  // so ordinary production traffic is never monkey-patched.
  const debugModule = await import('./engine/Debug.js');
  if (route.debug) {
    const networkGuard = await import('./net/NetworkGuard.js');
    networkGuard.installNetworkGuard(() =>
      store.get('session').mode === 'single' && stateMachine.current === 'PLAYING',
    );
    debugModule.installDebugApi({ networkGuardStats: networkGuard.getNetworkGuardStats });
  } else {
    debugModule.installDebugApi();
  }

  // 4. Background Parallel Chunk Loading
  const [
    { LabScene },
    { TextureRegistry },
    { PerfTracker },
    { AudioEngine },
  ] = await Promise.all([
    import('./lab/LabScene.js'),
    import('./procedural/textures/TextureRegistry.js'),
    import('./engine/Perf.js'),
    import('./audio/AudioEngine.js'),
  ]);

  // Run 2-second quality auto-detect benchmark in background
  void import('./engine/QualityBenchmark.js').then(({ QualityBenchmark }) => {
    void QualityBenchmark.getInstance().runLoadingBenchmark(1500);
  });

  // First-run safety flow (accessible via Settings panel, non-blocking on cold boot per D113)
  // Clean boot goes straight to main menu without modals

  // 5. Check WebGL2 Availability
  const testCanvas = document.createElement('canvas');
  const gl2 = testCanvas.getContext('webgl2');
  if (!gl2) {
    showWebGlError('WebGL2 context creation failed on your graphics hardware or browser.');
    return;
  }

  // 6. Cooperative Procedural Texture Warm-Up
  const warmupStart = performance.now();
  const textureRegistry = TextureRegistry.getInstance();

  textureRegistry.warmUp((progress) => {
    ui?.setCalibrationProgress(progress);
  }).then(() => {
    const totalWarmupMs = Math.round(performance.now() - warmupStart);
    (window as unknown as { __backsilence_warmup_ms?: number; __poolrooms_warmup_ms?: number }).__backsilence_warmup_ms = totalWarmupMs;
    (window as unknown as { __backsilence_warmup_ms?: number; __poolrooms_warmup_ms?: number }).__poolrooms_warmup_ms = totalWarmupMs;
    console.log(`[BackSilence] Procedural textures warmed up in ${totalWarmupMs} ms`);
    ui?.setCalibrationProgress(1.0);
    ui?.showToast('Procedural assets ready', 'info');
  }).catch((err: unknown) => {
    console.warn('[BackSilence] Warmup issue:', err);
  });

  // 7. Mount 3D LabScene or Menu Background
  const canvasContainer = document.getElementById('canvas-container');
  if (!canvasContainer) throw new Error('Missing #canvas-container');

  const isLab = route.lab;
  let isHudDemoActive = false;

  const labScene = new LabScene(canvasContainer, settings, {
    isMenuMode: !isLab,
    onToggleHud: () => {
      isHudDemoActive = !isHudDemoActive;
      if (isHudDemoActive) {
        ui?.updateHud({
          noiseLoudness: 0.65,
          stamina: 0.85,
          status: 'WET',
          objective: 'Find the numbered pillars in the mist',
          interactionPrompt: '[E] Inspect valve',
          notebookNumbers: ['#1: 4', '#2: 2', '#3: ?'],
          vhsTime: 'REC ● 00:04:18',
          showVhsOsd: true,
          soundVisualizerCaption: '[Splash — Left 4m]',
          damageVignette: 0.0,
        });
      } else {
        ui?.updateHud({
          noiseLoudness: 0.0,
          stamina: 1.0,
          status: 'DRY',
          objective: '',
          interactionPrompt: null,
          notebookNumbers: [],
          showVhsOsd: false,
          soundVisualizerCaption: null,
          damageVignette: 0.0,
        });
      }
    },
  });

  ui.setAudioLabPanel(labScene.audioLabPanel);
  registerOfflineSupport(
    () => {
      ui?.setCalibrationProgress(1.0);
    },
    (message) => ui?.showToast(message, 'warn'),
  );

  type GlobalRefs = {
    __backsilence_bus?: typeof bus;
    __backsilence_lab?: LabScene;
    __poolrooms_lab?: LabScene;
    __backsilence_session?: unknown;
    __backsilence_ui?: typeof ui;
    __poolrooms_ui?: typeof ui;
    __backsilence_renderer_info?: unknown;
    __poolrooms_renderer_info?: unknown;
    __backsilence_identity?: unknown;
    __backsilence_proxy?: unknown;
    __backsilence_offline_queue?: unknown;
  };
  const g = window as unknown as GlobalRefs;
  g.__backsilence_bus = bus;
  g.__backsilence_lab = labScene;
  g.__poolrooms_lab = labScene;
  g.__backsilence_ui = ui;
  g.__poolrooms_ui = ui;

  // Active playable game session
  const { GameSession } = await import('./game/GameSession.js');
  let activeGameSession: InstanceType<typeof GameSession> | null = null;

  bus.on('game:start', (cfg) => {
    store.set('session', {
      mode: 'single',
      mapId: cfg.mapId,
      seed: cfg.seed,
      room: null,
    });
    if (activeGameSession) {
      activeGameSession.dispose();
      activeGameSession = null;
    }
    labScene.renderer.canvas.style.display = 'none';

    const diffStr = cfg.difficulty <= 0.75 || cfg.difficulty === 0 ? 'whisper' : cfg.difficulty >= 1.3 || cfg.difficulty === 2 ? 'deafening' : 'normal';
    activeGameSession = new GameSession(
      canvasContainer,
      settings,
      ui.getHud(),
      {
        onPause: () => ui.showPause(),
        onDeath: (stats) => {
          const dist = Math.max(1.2, stats.closestCall < 999 ? stats.closestCall : 6.2);
          const reason = `You splashed ${dist.toFixed(1)} m from it.`;
          ui.showDeath(reason);
          ui.getDeathScreen().setStats(stats.timeSurvived, stats.noisesMade, stats.closestCall);
        },
        onWin: (results) => {
          ui.showResults(results);
        },
        onExit: () => {
          ui.navigateTo('MENU');
        },
      },
      diffStr,
      cfg.seed,
      cfg.mapId,
      ui.getKeypadModal(),
    );
    g.__backsilence_session = activeGameSession;
    stateMachine.goTo('PLAYING');
    ui.navigateTo('GAME');
    ui.getHud().show();
  });

  bus.on('game:start:net' as unknown as 'game:start', (rawCfg: unknown) => {
    const netCfg = rawCfg as { session: NetSession; mapId: 'poolrooms'; difficulty: 'whisper' | 'normal' | 'deafening'; seed: number };
    if (activeGameSession) {
      activeGameSession.dispose();
      activeGameSession = null;
    }
    store.set('session', {
      mode: 'multi',
      mapId: netCfg.mapId,
      seed: netCfg.seed,
      room: store.get('session').room,
    });
    labScene.renderer.canvas.style.display = 'none';

    activeGameSession = new GameSession(
      canvasContainer,
      settings,
      ui.getHud(),
      {
        onPause: () => ui.showPause(),
        onDeath: (stats) => {
          const dist = Math.max(1.2, stats.closestCall < 999 ? stats.closestCall : 5.8);
          const reason = `You splashed ${dist.toFixed(1)} m from it.`;
          ui.showDeath(reason);
          ui.getDeathScreen().setStats(stats.timeSurvived, stats.noisesMade, stats.closestCall);
        },
        onWin: (results) => {
          ui.showResults(results);
        },
        onExit: () => {
          ui.navigateTo('MENU');
        },
      },
      netCfg.difficulty,
      netCfg.seed,
      netCfg.mapId,
      ui.getKeypadModal(),
      netCfg.session,
    );
    g.__backsilence_session = activeGameSession;
    stateMachine.goTo('PLAYING');
    ui.navigateTo('GAME');
    ui.getHud().show();
  });

  bus.on('game:retry' as unknown as 'game:start', () => {
    if (activeGameSession) {
      activeGameSession.restart(true);
      stateMachine.goTo('PLAYING');
    }
  });

  bus.on('game:resume' as unknown as 'game:start', () => {
    if (activeGameSession) {
      activeGameSession.resume();
      stateMachine.goTo('PLAYING');
    }
  });

  bus.on('game:leave', () => {
    if (activeGameSession) {
      activeGameSession.dispose();
      activeGameSession = null;
      g.__backsilence_session = undefined;
    }
    labScene.renderer.canvas.style.display = 'block';
  });

  bus.on('settings:applied' as unknown as 'game:start', (rawSettings: unknown) => {
    const s = rawSettings as Settings;
    if (activeGameSession) {
      activeGameSession.setSettings(s);
    }
  });

  if (isLab) {
    ui.navigateTo('GAME');
    if (typeof location !== 'undefined' && location.search.includes('lab=audio')) {
      labScene.audioLabPanel.toggle(true);
    }
    ui.showToast('Material & Audio Lab active. Controls: WASD + mouse. Press H for HUD, B for Audio Lab.', 'info');
  } else if (route.map) {
    // Direct launch via ?map=<id>&seed=<n>
    bus.emit('game:start', {
      mode: 'single',
      mapId: route.map,
      difficulty: 1.0,
      seed: route.seed ?? 12345,
    });
  } else if (route.room) {
    ui.navigateTo('ROOM_LINK');
  }

  // 8. Main Render and Performance Loop
  const perf = new PerfTracker();
  let lastTime = performance.now();
  const cachedRendererInfo = {
    calls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
  };
  const cachedDebugOverlayStats = {
    fps: 0,
    frameTimeMs: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    activeVoices: 0,
  };

  let lastRenderTime = 0;

  function animate(now: number): void {
    requestAnimationFrame(animate);

    // Pause updates & rendering when tab is hidden to preserve battery & GPU resources
    if (typeof document !== 'undefined' && document.hidden) {
      lastTime = now;
      return;
    }

    // Optional 30fps cap for battery saver & low-tier mobile devices
    if (settings.graphics.fpsCap === 30 && now - lastRenderTime < 32.5) {
      return;
    }
    lastRenderTime = now;

    const dt = Math.min((now - lastTime) / 1000, 0.1);
    const dtMs = dt * 1000;
    lastTime = now;

    let activeRenderer = labScene.renderer.renderer;
    if (activeGameSession) {
      activeGameSession.update(dt);
      activeRenderer = activeGameSession.renderer.renderer;
    } else {
      labScene.update(dt);
    }
    perf.update(dtMs);

    const snap = perf.getSnapshot(activeRenderer);

    cachedRendererInfo.calls = snap.drawCalls;
    cachedRendererInfo.triangles = snap.triangles;
    cachedRendererInfo.geometries = snap.geometries;
    cachedRendererInfo.textures = snap.textures;
    g.__backsilence_renderer_info = cachedRendererInfo;
    g.__poolrooms_renderer_info = cachedRendererInfo;

    if (route.debug || route.lab || settings.graphics.showFps) {
      cachedDebugOverlayStats.fps = snap.fps;
      cachedDebugOverlayStats.frameTimeMs = snap.frameTimeMs;
      cachedDebugOverlayStats.drawCalls = snap.drawCalls;
      cachedDebugOverlayStats.triangles = snap.triangles;
      cachedDebugOverlayStats.geometries = snap.geometries;
      cachedDebugOverlayStats.textures = snap.textures;
      cachedDebugOverlayStats.activeVoices = AudioEngine.getInstance().stats().activeVoices;
      debugModule.updateDebugOverlay(cachedDebugOverlayStats);
    }
  }

  requestAnimationFrame(animate);

  // Tab visibility management (pause rendering & suspend audio context)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      void AudioEngine.getInstance().suspend();
    } else {
      void AudioEngine.getInstance().resume();
    }
  });
}

boot().catch((err: unknown) => {
  (window as unknown as { __boot_err: string }).__boot_err = String(err);
  console.error('[BackSilence] Boot critical failure:', err);
  const bar = document.getElementById('boot-bar');
  if (bar) bar.style.background = '#b3261e';
  showWebGlError(String(err));
});
