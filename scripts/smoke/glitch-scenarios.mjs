#!/usr/bin/env node
/* ── glitch-scenarios.mjs ──────────────────────────────────────────────────
 *  Prompt 9 Phase D: Glitch-Class Regression Suite (Scenarios S15–S20)
 *  Verifies historical defect regressions and state machine invariants:
 *  - S15: Menu Deadlock Prevention (44503aa law: menu locked during loading)
 *  - S16: Pointer Lock Edge (080e262 law: pointer lock rejected unless RUNNING)
 *  - S17: Double Dispatch Neutrality (6785222 law: neutral intent when not running)
 *  - S18: SPA History Navigation Race (10b3962 law: safe route changes)
 *  - S19: Submersion & Depth Target Safety (G7 near-plane 0.05m invariant)
 *  - S20: Rapid-cycle 50x teardown (zero errors, < 30s)
 * ──────────────────────────────────────────────────────────────────────── */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const REPORT_PATH = resolve(ROOT, 'reports/engineering/glitch-scenarios.json');

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

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.errors = [];
    this.logs = [];
  }

  async connect() {
    await new Promise((res, rej) => {
      this.socket.addEventListener('open', res, { once: true });
      this.socket.addEventListener('error', rej, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const type = msg.params.type;
        const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
        this.logs.push(`[${type}] ${text}`);
        if (type === 'error') this.errors.push(text);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const errText = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'Uncaught Exception';
        this.errors.push(errText);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, 60000);
      this.pending.set(id, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
    return res.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function main() {
  console.log('=== BackSilence Glitch-Class Regression Suite (S15–S20) ===\n');

  const appPort = await getFreePort();
  const cdpPort = await getFreePort();
  const tmpUserDataDir = await mkdtemp(resolve(tmpdir(), 'backsilence-glitch-'));

  console.log(`[GlitchHarness] Starting dev server on port ${appPort}...`);
  const devServer = spawn('npx', ['vite', '--port', String(appPort), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });

  await delay(1500);

  console.log(`[GlitchHarness] Launching Chrome on CDP port ${cdpPort}...`);
  const chromeArgs = [
    '--headless=new',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tmpUserDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--window-size=1280,720',
  ];
  if (process.platform === 'linux') {
    chromeArgs.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  }

  const chrome = spawn(chromePath(), chromeArgs, { stdio: 'ignore' });

  let cdp;
  const results = [];

  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {
        await delay(200);
      }
    }
    if (!ready) throw new Error('Could not connect to Chrome CDP endpoint.');

    const target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
    cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    console.log(`[GlitchHarness] Navigating to http://127.0.0.1:${appPort}/ ...`);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/` });
    await delay(2000);

    // ── Helper to run scenario in browser context ───────────────────────────
    async function runScenario(id, title, fnStr) {
      process.stdout.write(`- [${id}] ${title} ... `);
      const start = Date.now();
      try {
        const detail = await cdp.evaluate(`(${fnStr})()`);
        const durationMs = Date.now() - start;
        console.log(`PASS (${durationMs}ms)`);
        results.push({ id, title, status: 'PASS', durationMs, detail });
        return true;
      } catch (err) {
        const durationMs = Date.now() - start;
        console.log(`FAIL (${durationMs}ms): ${err.message}`);
        results.push({ id, title, status: 'FAIL', durationMs, error: err.message });
        return false;
      }
    }

    // ── S15: Menu Deadlock Prevention (44503aa law) ─────────────────────────
    await runScenario(
      'S15',
      'Menu Deadlock Prevention (44503aa law: menu locked during loading/disposing)',
      `async () => {
        const { SessionStateMachine } = await import('/src/game/session/SessionStateMachine.ts');
        const sm = new SessionStateMachine('IDLE');

        // Transition to LOADING: 44503aa deadlock prevention
        sm.transition('LOADING', 'start_load');
        if (sm.canOpenMenu()) throw new Error('44503aa violation: canOpenMenu was true during LOADING');

        // Transition to RUNNING
        sm.transition('RUNNING', 'load_finish');
        if (!sm.canOpenMenu()) throw new Error('canOpenMenu was false during RUNNING');

        // Transition to PAUSED
        sm.transition('PAUSED', 'pause_open');
        if (!sm.canOpenMenu()) throw new Error('canOpenMenu was false during PAUSED');

        // Transition to DISPOSING: menu lock prevents deadlock
        sm.transition('DISPOSING', 'dispose_start');
        if (sm.canOpenMenu()) throw new Error('canOpenMenu was true during DISPOSING');

        return { verifiedDeadlockFree: true };
      }`
    );

    // ── S16: Pointer Lock Edge (080e262 law) ────────────────────────────────
    await runScenario(
      'S16',
      'Pointer Lock Edge (080e262 law: pointer lock acquire permitted exclusively in RUNNING)',
      `async () => {
        const { SessionStateMachine } = await import('/src/game/session/SessionStateMachine.ts');
        const sm = new SessionStateMachine('IDLE');

        const states = ['IDLE', 'LOADING', 'RUNNING', 'PAUSED', 'DEAD', 'CAPTURE', 'DISPOSING', 'DISPOSED'];
        const allowed = [];
        const forbidden = [];

        for (const s of states) {
          sm.forceState(s);
          if (sm.canRequestPointerLock()) {
            allowed.push(s);
          } else {
            forbidden.push(s);
          }
        }

        if (allowed.length !== 1 || allowed[0] !== 'RUNNING') {
          throw new Error('080e262 violation: pointer lock permitted in non-RUNNING states: ' + allowed.join(', '));
        }

        return { allowed, forbidden };
      }`
    );

    // ── S17: Double Dispatch Neutrality (6785222 law) ────────────────────────
    await runScenario(
      'S17',
      'Double Dispatch Neutrality (6785222 law: neutral intent when not running)',
      `async () => {
        const { SessionStateMachine } = await import('/src/game/session/SessionStateMachine.ts');
        const { InputRig } = await import('/src/game/session/InputRig.ts');
        const { DisposalService } = await import('/src/game/session/DisposalService.ts');
        const { defaultSettings } = await import('/src/app/Settings.ts');

        const sm = new SessionStateMachine('LOADING');
        const disposal = new DisposalService();
        const rig = new InputRig(defaultSettings(), { onPauseRequested: () => {} }, sm, disposal);

        // When state is LOADING, pollIntent should return neutral intent
        const intentLoading = rig.pollIntent(1 / 60);
        if (intentLoading.moveX !== 0 || intentLoading.moveZ !== 0 || intentLoading.sprint || intentLoading.jump) {
          throw new Error('6785222 violation: non-neutral intent during LOADING');
        }

        // When state is PAUSED, pollIntent should return neutral intent
        sm.forceState('PAUSED');
        const intentPaused = rig.pollIntent(1 / 60);
        if (intentPaused.moveX !== 0 || intentPaused.moveZ !== 0 || intentPaused.interact) {
          throw new Error('6785222 violation: non-neutral intent during PAUSED');
        }

        // Throw launch should be suppressed
        if (rig.consumeThrowLaunch() !== null) {
          throw new Error('6785222 violation: throw launch not suppressed when not running');
        }

        rig.dispose();
        disposal.disposeAll('test_finish');

        return { intentLoading, intentPaused };
      }`
    );

    // ── S18: SPA History Navigation Race (10b3962 law) ──────────────────────
    await runScenario(
      'S18',
      'SPA History Navigation Race (10b3962 law: safe route changes and navigation)',
      `async () => {
        const { SessionStateMachine } = await import('/src/game/session/SessionStateMachine.ts');
        const sm = new SessionStateMachine('IDLE');

        // Navigation allowed in IDLE
        if (!sm.canNavigateHistory()) throw new Error('Navigation forbidden in IDLE');

        // Navigation forbidden in LOADING to prevent orphaned sessions
        sm.transition('LOADING', 'load_start');
        if (sm.canNavigateHistory()) throw new Error('10b3962 violation: canNavigateHistory was true during LOADING');

        // Navigation forbidden during active RUNNING without pause/exit
        sm.transition('RUNNING', 'load_finish');
        if (sm.canNavigateHistory()) throw new Error('10b3962 violation: canNavigateHistory was true during RUNNING');

        // Navigation permitted in PAUSED
        sm.transition('PAUSED', 'pause_open');
        if (!sm.canNavigateHistory()) throw new Error('canNavigateHistory was false during PAUSED');

        // Return to RUNNING then to DEAD
        sm.transition('RUNNING', 'unpause');
        sm.transition('DEAD', 'player_died');

        // Navigation to DISPOSING and DISPOSED
        sm.transition('DISPOSING', 'dispose_start');
        sm.transition('DISPOSED', 'teardown');
        if (!sm.canNavigateHistory()) throw new Error('canNavigateHistory was false in DISPOSED');

        return { routeGuardsVerified: true };
      }`
    );

    // ── S19: Submersion & Depth Target Safety (G7 near-plane invariant) ─────
    await runScenario(
      'S19',
      'Submersion & Depth Target Safety (G7 near-plane 0.05m invariant)',
      `async () => {
        const { CameraRig } = await import('/src/game/session/CameraRig.ts');
        const { defaultSettings } = await import('/src/app/Settings.ts');

        const rig = new CameraRig(defaultSettings(), 75, 16 / 9);

        // G7 Near-plane law: near plane is strictly 0.05m
        if (rig.camera.near !== 0.05) {
          throw new Error('G7 violation: camera.near is ' + rig.camera.near + ' (expected 0.05)');
        }
        if (rig.camera.far !== 200.0) {
          throw new Error('Camera far plane is ' + rig.camera.far + ' (expected 200.0)');
        }

        // Submersion check
        rig.camera.position.set(0, 0.5, 0);
        const becameSubmerged = rig.updateSubmersion(0.2); // camera at 0.5 is above 0.2
        if (becameSubmerged) throw new Error('Submersion state false positive');

        rig.camera.position.set(0, 0.0, 0);
        const submergedNow = rig.updateSubmersion(0.2); // camera at 0.0 is below 0.2
        if (!submergedNow) throw new Error('Submersion transition not detected');

        rig.updateAspect(800, 600);
        if (Math.abs(rig.camera.aspect - (800 / 600)) > 0.001) {
          throw new Error('Aspect ratio update failed');
        }

        rig.dispose();
        return { near: rig.camera.near, far: rig.camera.far, aspect: rig.camera.aspect };
      }`
    );

    // ── S20: Rapid-cycle 50x teardown ───────────────────────────────────────
    await runScenario(
      'S20',
      'Rapid-cycle 50x teardown (zero errors, < 30s)',
      `async () => {
        const container = document.getElementById('app') || document.body;
        const { GameSession } = await import('/src/game/GameSession.ts');
        const { defaultSettings } = await import('/src/app/Settings.ts');
        const settings = defaultSettings();

        let errors = 0;
        const start = performance.now();

        for (let i = 0; i < 50; i++) {
          try {
            const div = document.createElement('div');
            container.appendChild(div);
            const session = new GameSession(
              div,
              settings,
              { update: () => {}, showQuietHint: () => {}, setMinimalHud: () => {}, setUiScale: () => {}, setWorkOrderCard: () => {}, showThreeRulesOverlay: () => {} },
              { onPause: () => {}, onDeath: () => {}, onWin: () => {}, onExit: () => {} },
              'normal',
              500 + i,
              'natatorium'
            );
            session.update(1 / 60);
            session.dispose();
            div.remove();
          } catch (e) {
            errors++;
          }
        }

        const durationMs = performance.now() - start;
        if (errors > 0) throw new Error('Encountered ' + errors + ' errors during 50 rapid cycles');
        if (durationMs > 30000) throw new Error('50 cycles took ' + (durationMs / 1000).toFixed(2) + 's (> 30s limit)');

        return { cycles: 50, durationMs: Math.round(durationMs), errors };
      }`
    );

    // ── Write final report ──────────────────────────────────────────────────
    const allPassed = results.every((r) => r.status === 'PASS');
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: results.length,
        passed: results.filter((r) => r.status === 'PASS').length,
        failed: results.filter((r) => r.status === 'FAIL').length,
        status: allPassed ? 'PASS' : 'FAIL',
      },
      scenarios: results,
    };

    await mkdir(resolve(ROOT, 'reports/engineering'), { recursive: true });
    await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log(`\nReport written to: ${REPORT_PATH}`);
    if (!allPassed) {
      console.error('\n[GlitchHarness] One or more scenarios FAILED.');
      process.exit(1);
    }

    console.log('\n[GlitchHarness] All S15–S20 scenarios PASSED cleanly.\n');
  } finally {
    cdp?.close();
    chrome.kill('SIGTERM');
    devServer.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('\n[GlitchHarness] Error:', err);
  process.exit(1);
});
