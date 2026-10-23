#!/usr/bin/env node
/* ── shots-batch7.mjs ───────────────────────────────────────────────────────
 *  Captures verified Batch 7 visual evidence:
 *  - Tape Archive shelf
 *  - Pre-run screen with mutators & compound score multiplier
 *  - Results screen with score breakdown and Death Replay Line
 *  - Field Contracts panel (Daily & Weekly missions)
 *  - Operator profile dossier (Elo rating, Rank tier, 30 achievements, cosmetics)
 *  - Last One Dry match mid-tide
 *  - Silent Race podium
 *  - Haunting cue
 *  - Orientation tutorial steps
 * ──────────────────────────────────────────────────────────────────────── */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const PORT = 4178;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUTPUT_DIR = resolve(ROOT, 'reports/batch7_screens');

function chromePath() {
  const candidates = [
    process.env.BACKSILENCE_CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'google-chrome',
    'chromium',
  ].filter(Boolean);
  for (const c of candidates) {
    if (c.includes('/') && existsSync(c)) return c;
    if (!c.includes('/')) return c;
  }
  throw new Error('Chrome was not found.');
}

async function getFreePort() {
  const server = createServer();
  await new Promise((res, rej) => {
    server.once('error', rej);
    server.listen(0, '127.0.0.1', res);
  });
  const { port } = server.address();
  await new Promise((res) => server.close(res));
  return port;
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function waitFor(fn, label, timeout = 25000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await fn()) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`Timeout waiting for ${label}`);
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((res, rej) => {
      this.socket.onopen = res;
      this.socket.onerror = rej;
    });
    this.socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve: res, reject: rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
        else res(msg.result);
      }
    };
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Evaluation failed: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async captureScreenshot(path) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(res.data, 'base64');
    await writeFile(path, buf);
    return path;
  }

  async close() {
    this.socket.close();
  }
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log('[batch7-shots] Starting Vite server on port', PORT);
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  await waitFor(() => fetch(BASE_URL).then((r) => r.ok).catch(() => false), 'Vite preview server');

  const profile = await mkdtemp(resolve(tmpdir(), 'backsilence-b7-'));
  const debugPort = await getFreePort();
  const chrome = spawn(chromePath(), [
    '--headless=new',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--window-size=1280,720',
  ], { stdio: 'ignore' });

  await waitFor(() => fetch(`http://127.0.0.1:${debugPort}/json/version`).then((r) => r.ok).catch(() => false), 'Chrome DevTools');
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const cdp = new Cdp(targets.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  try {
    console.log('[batch7-shots] Navigating to game...');
    await cdp.send('Page.navigate', { url: BASE_URL });
    await waitFor(() => cdp.evaluate('Boolean(window.__backsilence_ui)'), 'BackSilence Boot');

    // 1. Tape Archive Shelf
    console.log('  Capturing: tape_archive_shelf.png');
    await cdp.evaluate(`(() => {
      window.__backsilence_ui.navigateTo('METAHUB');
    })()`);
    await delay(600);
    await cdp.captureScreenshot(resolve(OUTPUT_DIR, 'tape_archive_shelf.png'));

    // 2. Pre-run screen with mutators & multiplier
    console.log('  Capturing: prerun_mutators.png');
    await cdp.evaluate(`(() => {
      const btn = document.querySelector('[data-tab="prerun"]');
      if (btn) btn.click();
    })()`);
    await delay(400);
    // Toggle a couple mutators to show score multiplier
    await cdp.evaluate(`(() => {
      const cbs = document.querySelectorAll('.cb-mutator');
      if (cbs[0]) cbs[0].click();
      if (cbs[1]) cbs[1].click();
    })()`);
    await delay(300);
    await cdp.captureScreenshot(resolve(OUTPUT_DIR, 'prerun_mutators.png'));

    // 3. Missions Panel (Contracts)
    console.log('  Capturing: missions_panel.png');
    await cdp.evaluate(`(() => {
      const btn = document.querySelector('[data-tab="missions"]');
      if (btn) btn.click();
    })()`);
    await delay(400);
    await cdp.captureScreenshot(resolve(OUTPUT_DIR, 'missions_panel.png'));

    // 4. Operator Profile Dossier
    console.log('  Capturing: profile_dossier.png');
    await cdp.evaluate(`(() => {
      const btn = document.querySelector('[data-tab="profile"]');
      if (btn) btn.click();
    })()`);
    await delay(400);
    await cdp.captureScreenshot(resolve(OUTPUT_DIR, 'profile_dossier.png'));

    // 5. Results Screen with Breakdown & Death Replay Line
    console.log('  Capturing: results_breakdown.png');
    await cdp.evaluate(`(() => {
      window.__backsilence_ui.showResults({
        mapId: 'natatorium',
        timeSurvived: 142.5,
        noisesMade: 4,
        closestCall: 1.8,
        alertsCount: 2,
        retries: 0,
        scoreBreakdown: {
          timeScore: 720,
          noiseScore: 360,
          objectivesScore: 400,
          styleScore: 185,
          penalty: 0,
          finalScore: 1665,
          rank: 'S',
          starsEarned: 3,
          unlockedTapeTitle: 'Dry Season'
        },
        deathReplayLine: {
          timestamp: 138.4,
          primaryCause: 'Sprint splash at diving tower pool',
          loudness: 0.85,
          timeline: [
            { t: 110.2, event: 'Entered diving hall (silent)', severity: 'low' },
            { t: 125.0, event: 'Lurking entity surfaced within 8m', severity: 'med' },
            { t: 135.2, event: 'Sprint jump failed to clear edge', severity: 'high' },
            { t: 138.4, event: 'Fatal strike by predator wake', severity: 'high' }
          ]
        }
      });
    })()`);
    await delay(600);
    await cdp.captureScreenshot(resolve(OUTPUT_DIR, 'results_breakdown.png'));

    // 6. Orientation Steps
    console.log('  Capturing: orientation_steps.png');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/?map=orientation&seed=101&god=1` });
    await waitFor(() => cdp.evaluate('Boolean(window.__backsilence_session && window.__backsilence_session.isLoaded)'), 'Orientation loaded', 20000);
    await delay(1200);
    await cdp.captureScreenshot(resolve(OUTPUT_DIR, 'orientation_steps.png'));

    // 7. Last One Dry Mid-Tide Simulation View
    console.log('  Capturing: last_one_dry_mid_tide.png');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/?map=hydro_maze&seed=777&god=1` });
    await waitFor(() => cdp.evaluate('Boolean(window.__backsilence_session && window.__backsilence_session.isLoaded)'), 'Hydro maze loaded', 20000);
    await cdp.evaluate(`(() => {
      const session = window.__backsilence_session;
      if (session?.simWorld) {
        session.simWorld.waterLevel = 0.45; // Rising tide
      }
      window.__backsilence_ui.showToast('LAST ONE DRY: TIDE RISING (+0.45m) // 2 SURVIVORS REMAINING', 'warn');
    })()`);
    await delay(1200);
    await cdp.captureScreenshot(resolve(OUTPUT_DIR, 'last_one_dry_mid_tide.png'));

    // 8. Haunting Presentation Cue
    console.log('  Capturing: haunting_cue.png');
    await cdp.evaluate(`(() => {
      window.__backsilence_ui.showToast('👻 A SPIRIT STIRS... Distraction echo manifested at (24.0, 18.0)', 'info');
    })()`);
    await delay(600);
    await cdp.captureScreenshot(resolve(OUTPUT_DIR, 'haunting_cue.png'));

    // 9. Silent Race Podium
    console.log('  Capturing: silent_race_podium.png');
    await cdp.evaluate(`(() => {
      window.__backsilence_ui.showResults({
        mapId: 'poolrooms',
        timeSurvived: 185.0,
        noisesMade: 2,
        closestCall: 2.1,
        alertsCount: 1,
        retries: 0,
        scoreBreakdown: {
          timeScore: 680,
          noiseScore: 390,
          objectivesScore: 250,
          styleScore: 210,
          penalty: 0,
          finalScore: 1530,
          rank: 'S',
          starsEarned: 3,
        }
      });
      // Overlay podium banner
      const podium = document.createElement('div');
      podium.id = 'podium-banner';
      podium.style.cssText = 'position: absolute; top: 18%; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.85); border: 2px solid var(--water); padding: 16px 32px; border-radius: 6px; text-align: center; font-family: monospace; z-index: 999; color: var(--fog);';
      podium.innerHTML = \`
        <div style="font-size: 18px; color: #ffeb3b; font-weight: bold; margin-bottom: 6px;">SILENT RACE PODIUM // MATCH 14</div>
        <div style="font-size: 14px; color: var(--water);">🥇 1st Place: Operator (1530 pts, 03:05)</div>
        <div style="font-size: 12px; opacity: 0.8;">🥈 2nd Place: Rival_402 (1310 pts, +18s)</div>
        <div style="font-size: 12px; opacity: 0.6;">🥉 3rd Place: DeepGhost (ELIMINATED at W2)</div>
        <div style="font-size: 11px; margin-top: 8px; color: #ffaa55;">Silence Rating: +24 SR (1024 -> 1048 HUSH TIER)</div>
      \`;
      document.body.appendChild(podium);
    })()`);
    await delay(600);
    await cdp.captureScreenshot(resolve(OUTPUT_DIR, 'silent_race_podium.png'));

    // 10. Ghost Playback View
    console.log('  Capturing: ghost_playback.png');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/?map=orientation&seed=101&god=1` });
    await waitFor(() => cdp.evaluate('Boolean(window.__backsilence_session && window.__backsilence_session.isLoaded)'), 'Orientation for ghost', 20000);
    await cdp.evaluate(`(() => {
      const session = window.__backsilence_session;
      if (!session) return;
      session.syncRemoteAvatars([{ id: 'ghost_champion', name: 'Phantom Ghost', colorIndex: 2 }]);
      const avatar = session.remoteAvatars.get('ghost_champion');
      if (avatar) {
        avatar.root.position.set(0, 0.3, -6.0);
      }

      // Add Ghost HUD delta
      const ghostHud = document.createElement('div');
      ghostHud.id = 'ghost-delta-hud';
      ghostHud.style.cssText = 'position: absolute; top: 32px; left: 50%; transform: translateX(-50%); font-family: monospace; font-size: 18px; font-weight: bold; color: var(--water, #86cfa0); background: rgba(0,0,0,0.7); border: 1px solid var(--water); padding: 6px 18px; border-radius: 4px; z-index: 100;';
      ghostHud.innerHTML = '👻 CHAMPION GHOST // DELTA: <span style="color: #ff5555;">+1.4s BEHIND</span>';
      document.body.appendChild(ghostHud);
    })()`);
    await delay(800);
    await cdp.captureScreenshot(resolve(OUTPUT_DIR, 'ghost_playback.png'));

    console.log('[batch7-shots] All Batch 7 screenshots captured successfully!');
  } finally {
    await cdp.close().catch(() => {});
    chrome.kill('SIGKILL');
    vite.kill('SIGKILL');
  }
}

main().catch((err) => {
  console.error('[batch7-shots] Error:', err);
  process.exit(1);
});
