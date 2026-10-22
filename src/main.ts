/* ── main.ts ──────────────────────────────────────────────────────────────
 *  Tiny boot entry point.
 *  1. Drive the splash screen boot bar.
 *  2. Initialize core systems (EventBus, Store, StateMachine, Router).
 *  3. Transition BOOT → MENU and reveal the placeholder menu.
 *  4. Begin preloading engine/audio/procedural chunks in the background.
 * ──────────────────────────────────────────────────────────────────────── */

import { createEventBus } from './app/EventBus.js';
import { createStore } from './app/Store.js';
import { AppStateMachine } from './app/StateMachine.js';
import { parseRoute } from './app/Router.js';
import { loadSettings } from './app/Settings.js';
import { injectPaletteVars } from './app/Palette.js';

// ── Boot bar helper ─────────────────────────────────────────────────────
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
    }, 700);
  }
}

function showApp(): void {
  const app = document.getElementById('app');
  if (app) app.classList.add('visible');
}

// ── Boot sequence ───────────────────────────────────────────────────────
async function boot(): Promise<void> {
  // Step 1: Parse route
  const route = parseRoute();
  setBootProgress(10);

  // Step 2: Load settings
  const settings = loadSettings();
  setBootProgress(20);

  // Step 3: Create core systems
  const bus = createEventBus();
  const store = createStore({
    settings,
    session: {
      mode: route.room ? 'multi' : 'single',
      mapId: 'poolrooms',
      seed: Date.now(),
      room: route.room,
    },
    ui: {
      showFps: settings.graphics.showFps,
      debugMode: route.debug,
      labMode: route.lab,
    },
  });
  setBootProgress(40);

  // Step 4: Create state machine
  const stateMachine = new AppStateMachine(bus, 'BOOT');
  setBootProgress(50);

  // Step 5: Inject palette CSS vars
  injectPaletteVars();
  setBootProgress(60);

  // Debug logging
  if (route.debug) {
    bus.on('app:state', (e) => {
      console.log(`[BackSilence] State: ${e.from} → ${e.to}`);
    });
    if (route.room) {
      console.log(`[BackSilence] Room code parsed: ${route.room}`);
    }
    console.log('[BackSilence] Debug mode enabled');
    console.log('[BackSilence] Store:', store.get());
  }

  setBootProgress(80);

  // Step 6: Simulate brief warm-up (will be real engine preload in Batch 1)
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 200);
  });
  setBootProgress(100);

  // Step 7: Transition BOOT → MENU
  stateMachine.transition('MENU');

  // Step 8: Show menu, hide splash
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `
      <h1 class="menu-title" id="menu-title">BackSilence</h1>
      <p class="menu-sub">
        Foundation loaded. Batch 1 will build the real menu, procedural textures,
        audio engine, and lab scene.
      </p>
    `;
  }

  // Small delay for the boot bar to visually reach 100%
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 300);
  });
  showApp();
  hideSplash();

  // BATCH-1: Preload engine, Three.js, procedural, and audio chunks here.
  // They will be import()'d in parallel and warmed up during menu idle time.
}

boot().catch((err: unknown) => {
  console.error('[BackSilence] Boot failed:', err);
  const bar = document.getElementById('boot-bar');
  if (bar) bar.style.background = '#b3261e';
});
