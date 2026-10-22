/* ── main.ts ──────────────────────────────────────────────────────────────
 *  High-performance boot pipeline & master entry point:
 *  1. Immediate interactive UI bootstrap (< 1s) with performance.mark('menu:interactive')
 *  2. Parallel background chunk loading (Three.js, Engine, Audio, Procedural)
 *  3. Cooperative texture warm-up via scheduler time-slicing (6ms budget)
 *  4. AudioUnlock atmosphere overlay on first user gesture
 *  5. WebGL2 graceful degradation & fallback
 *  6. LabScene 3D background / interactive lab router
 * ──────────────────────────────────────────────────────────────────────── */

import { createEventBus } from './app/EventBus.js';
import { createStore } from './app/Store.js';
import { AppStateMachine } from './app/StateMachine.js';
import { parseRoute } from './app/Router.js';
import { loadSettings } from './app/Settings.js';
import { injectPaletteVars } from './app/Palette.js';
import type { UIManager } from './ui/UIManager.js';
import type { LabScene } from './lab/LabScene.js';
import type { NetSession } from './net/session/NetSession.js';

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
    <div style="
      background: rgba(13,11,6,0.95);
      border: 1px solid rgba(179,38,30,0.6);
      padding: 30px 24px;
      max-width: 480px;
      color: var(--fog, #d9d3a2);
      font-family: monospace;
      box-shadow: 0 0 30px rgba(179,38,30,0.4);
    ">
      <h2 style="color: var(--danger, #b3261e); margin-bottom: 12px;">HARDWARE ACCELERATION REQUIRED</h2>
      <p style="font-size: 13px; opacity: 0.8; margin-bottom: 20px; line-height: 1.5;">
        BackSilence requires WebGL 2.0 to render procedural caustics and ceramic PBR shaders.
        <br><br>
        <strong>Reason:</strong> ${reason}
      </p>
      <button class="analog-btn primary" onclick="window.location.reload()">RETRY CONNECTION</button>
    </div>
  `;
}

// ── Master Boot Function ────────────────────────────────────────────────
async function boot(): Promise<void> {
  const bootStart = performance.now();

  // 1. Parse route & Load settings
  const route = parseRoute();
  setBootProgress(15);

  const settings = loadSettings();
  setBootProgress(30);

  // 2. Initialize Core Systems
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
  setBootProgress(50);

  // 3. Dynamic-import UI Module (< 1s budget)
  const { UIManager } = await import('./ui/UIManager.js');
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

  setBootProgress(100);

  // Mark menu interactive immediately
  performance.mark('menu:interactive');
  const interactiveDuration = performance.now() - bootStart;
  console.log(`[BackSilence] Menu interactive in ${interactiveDuration.toFixed(1)} ms`);

  // Reveal UI and transition state machine
  showApp();
  hideSplash();
  stateMachine.transition('MENU');

  // Install Debug Tools and window.__poolrooms immediately
  const debugModule = await import('./engine/Debug.js');
  debugModule.installDebugApi();

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

  // Show AudioUnlock atmospheric prompt
  ui.showAudioUnlock(() => {
    ui?.showToast('Audio spatialization active — Headphones recommended', 'info');
  });

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

  type GlobalRefs = {
    __backsilence_lab?: LabScene;
    __poolrooms_lab?: LabScene;
    __backsilence_session?: unknown;
    __backsilence_ui?: typeof ui;
    __poolrooms_ui?: typeof ui;
    __backsilence_renderer_info?: unknown;
    __poolrooms_renderer_info?: unknown;
  };
  const g = window as unknown as GlobalRefs;
  g.__backsilence_lab = labScene;
  g.__poolrooms_lab = labScene;
  g.__backsilence_ui = ui;
  g.__poolrooms_ui = ui;

  // Active playable game session
  const { GameSession } = await import('./game/GameSession.js');
  let activeGameSession: InstanceType<typeof GameSession> | null = null;

  bus.on('game:start', (cfg) => {
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
          ui.showDeath('YOU MADE A SOUND');
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
    stateMachine.transition('PLAYING');
  });

  bus.on('game:start:net' as unknown as 'game:start', (rawCfg: unknown) => {
    const netCfg = rawCfg as { session: NetSession; mapId: 'poolrooms'; difficulty: 'whisper' | 'normal' | 'deafening'; seed: number };
    if (activeGameSession) {
      activeGameSession.dispose();
      activeGameSession = null;
    }
    labScene.renderer.canvas.style.display = 'none';

    activeGameSession = new GameSession(
      canvasContainer,
      settings,
      ui.getHud(),
      {
        onPause: () => ui.showPause(),
        onDeath: (stats) => {
          ui.showDeath('YOU MADE A SOUND');
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
    stateMachine.transition('PLAYING');
  });

  bus.on('game:retry' as unknown as 'game:start', () => {
    if (activeGameSession) {
      activeGameSession.restart(true);
      stateMachine.transition('PLAYING');
    }
  });

  bus.on('game:resume' as unknown as 'game:start', () => {
    if (activeGameSession) {
      activeGameSession.resume();
      stateMachine.transition('PLAYING');
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

  if (isLab) {
    ui.navigateTo('GAME');
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

  function animate(now: number): void {
    requestAnimationFrame(animate);

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

    const info = {
      calls: snap.drawCalls,
      triangles: snap.triangles,
      geometries: snap.geometries,
      textures: snap.textures,
    };
    g.__backsilence_renderer_info = info;
    g.__poolrooms_renderer_info = info;

    if (route.debug || route.lab || settings.graphics.showFps) {
      debugModule.updateDebugOverlay({
        fps: snap.fps,
        frameTimeMs: snap.frameTimeMs,
        drawCalls: snap.drawCalls,
        triangles: snap.triangles,
        geometries: snap.geometries,
        textures: snap.textures,
        activeVoices: AudioEngine.getInstance().stats().activeVoices,
      });
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
  console.error('[BackSilence] Boot critical failure:', err);
  const bar = document.getElementById('boot-bar');
  if (bar) bar.style.background = '#b3261e';
  showWebGlError(String(err));
});
