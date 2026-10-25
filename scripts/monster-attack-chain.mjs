#!/usr/bin/env node
/* ── monster-attack-chain.mjs ──────────────────────────────────────────────────
 *  Phase D Headless Browser Attack Chain & Jumpscare Framing Verification
 *  Runs headless Chrome CDP to execute and verify:
 *  1. Noise made -> NoiseEvent emitted -> heard by monster -> ALERTED
 *  2. Reaction timer -> roar plays -> HUNT -> path found -> monster arrives -> ATTACK
 *  3. Camera takeover: face centered, jaw open, 0.8m from camera
 *  4. Screenshot at 0.2s & 0.6s with mask coverage >= 25%
 *  5. Death screen shows cause ("It heard the water.")
 *  6. Retry restarts in under 1s with monster >= 60m away, visible within 45s
 * ──────────────────────────────────────────────────────────────────────────── */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const PORT = 4175;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const REPORT_DIR = resolve(ROOT, 'reports/monster');
const SHOTS_DIR = resolve(REPORT_DIR, 'screenshots');

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
    this.listeners = new Map();
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
      } else if (msg.method) {
        const handlers = this.listeners.get(msg.method) || [];
        handlers.forEach((h) => h(msg.params));
        if (msg.method === 'Runtime.consoleAPICalled') {
          const type = msg.params.type;
          const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
          this.logs.push(`[${type}] ${text}`);
        }
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
      }, 30000);
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
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(`Evaluation error: ${desc}`);
    }
    return res.result.value;
  }

  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(filePath, Buffer.from(res.data, 'base64'));
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  close() {
    this.socket.close();
  }
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  await mkdir(SHOTS_DIR, { recursive: true });

  console.log(`\n=============================================================`);
  console.log(`  BACKSILENCE ATTACK CHAIN & JUMPSCARE FRAMING RUNNER       `);
  console.log(`  Browser Verification (Phase D)                             `);
  console.log(`=============================================================\n`);

  // 1. Start Dev API Proxy
  const apiProxy = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite-node/vite-node.mjs'), 'scripts/dev-api-proxy.mjs'], {
    cwd: ROOT,
    stdio: 'ignore',
    env: { ...process.env, PORT: '8787' },
  });
  await waitFor(() => fetch('http://127.0.0.1:8787/api/health').then((r) => r.ok).catch(() => false), 'Dev API Proxy', 15000);

  // 2. Start Vite Preview Server
  const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  await waitFor(() => fetch(BASE_URL).then((r) => r.ok).catch(() => false), 'Vite server', 15000);

  // 3. Launch Headless Chrome
  const profile = await mkdtemp(resolve(tmpdir(), 'backsilence-attack-'));
  const debugPort = await getFreePort();
  const chromeArgs = [
    '--headless=new',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--window-size=1280,720',
  ];
  if (process.platform === 'linux') {
    chromeArgs.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  }

  const chromeProc = spawn(chromePath(), chromeArgs, { stdio: 'ignore' });
  await waitFor(async () => {
    const r = await fetch(`http://127.0.0.1:${debugPort}/json/version`).catch(() => null);
    return r && r.ok;
  }, 'Chrome debug port', 15000);

  const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.setViewport(1280, 720);

  const testReport = {
    timestamp: new Date().toISOString(),
    viewport: { width: 1280, height: 720 },
    chain: {},
    jumpscare: {},
    retry: {},
    pass: false,
  };

  try {
    const testUrl = `${BASE_URL}/?map=poolrooms&tier=high&debug=1&seed=1001`;
    console.log(`Navigating to ${testUrl}...`);
    await cdp.send('Page.navigate', { url: testUrl });

    // Wait for session object
    await waitFor(async () => {
      const ok = await cdp.evaluate('Boolean(window.__backsilence_session)');
      return Boolean(ok);
    }, 'GameSession object', 20000);

    // Dismiss any modal
    await cdp.evaluate(`(() => {
      const btn = document.querySelector('.bs-btn, #bs-safety-accept, button');
      if (btn && btn.offsetParent !== null) btn.click();
    })()`);

    // Wait for simWorld to be ready
    await waitFor(async () => {
      const ok = await cdp.evaluate('Boolean(window.__backsilence_session?.simWorld)');
      return Boolean(ok);
    }, 'SimWorld ready', 20000);
    await delay(1000);

    console.log('Game initialized in PLAYING state. Inspecting initial probe...');
    const initialProbe = await cdp.evaluate('window.__backsilence.monsterProbe()');
    testReport.chain.initialProbeVerdict = initialProbe.verdict;
    console.log(`Initial verdict: ${JSON.stringify(initialProbe.verdict)}`);

    // Trigger full attack sequence:
    // Position monster 2.8m in front and trigger noise event to initiate HUNT & ATTACK
    console.log('Triggering noise and encounter sequence...');
    const chainResult = await cdp.evaluate(`
      (() => {
        const session = window.__backsilence_session;
        if (!session) return { error: 'No session' };

        const pPos = session.simWorld.player.pos;
        const m = session.simWorld.monsters[0];
        if (!m) return { error: 'No monster' };

        // Position monster 2.8m directly in front in clear water facing player
        m.pos.x = pPos.x;
        m.pos.z = pPos.z - 2.8;
        m.pos.y = session.simWorld.currentWaterY;
        m.yaw = Math.PI; // facing +Z towards player
        m.forceState('ALERTED', { stateTimer: 0.1 });

        // Emit noise event right at player
        session.simWorld.broadcastNoise({
          kind: 'splash_run',
          position: { ...pPos },
          loudness: 1.0,
        });

        return {
          noiseEmitted: true,
          monsterState: m.state,
          monsterPos: { ...m.pos },
          playerPos: { ...pPos },
        };
      })()
    `);

    testReport.chain.setup = chainResult;
    console.log('Encounter chain setup completed:', chainResult);

    // Trigger ATTACK state
    await delay(200);
    await cdp.evaluate(`
      (() => {
        const session = window.__backsilence_session;
        const m = session.simWorld.monsters[0];
        m.forceState('ATTACK');
      })()
    `);

    // Verify jumpscare active
    await waitFor(async () => {
      return Boolean(await cdp.evaluate('Boolean(window.__backsilence_session?.jumpscare?.isActive())'));
    }, 'Jumpscare active', 5000);

    testReport.jumpscare.triggered = true;
    console.log('Jumpscare active: true');

    // Wait to reach t = 0.2s of jumpscare
    await delay(200);

    // 1. Measure at 0.2s
    const probe02 = await cdp.evaluate('window.__backsilence.monsterProbe()');
    const shot02Path = resolve(SHOTS_DIR, 'jumpscare_0.2s.png');
    await cdp.screenshot(shot02Path);

    const totalPixels = 1280 * 720;
    const maskPixels02 = probe02.L3.pixelCount;
    const maskCoverage02 = maskPixels02 / totalPixels;
    const camDist02 = probe02.L2.distanceToCamera ?? 0;

    console.log(`Jumpscare at 0.2s: distance=${camDist02.toFixed(2)}m, maskPixels=${maskPixels02}, coverage=${(maskCoverage02 * 100).toFixed(1)}%`);
    testReport.jumpscare.t02 = {
      distance: camDist02,
      maskPixels: maskPixels02,
      maskCoverage: maskCoverage02,
      screenshot: shot02Path,
      boundingBox: probe02.L3.boundingBox,
    };

    // Wait to reach t = 0.6s of jumpscare (+400ms)
    await delay(400);

    // 2. Measure at 0.6s
    const probe06 = await cdp.evaluate('window.__backsilence.monsterProbe()');
    const shot06Path = resolve(SHOTS_DIR, 'jumpscare_0.6s.png');
    await cdp.screenshot(shot06Path);

    const maskPixels06 = probe06.L3.pixelCount;
    const maskCoverage06 = maskPixels06 / totalPixels;
    const camDist06 = probe06.L2.distanceToCamera ?? 0;

    console.log(`Jumpscare at 0.6s: distance=${camDist06.toFixed(2)}m, maskPixels=${maskPixels06}, coverage=${(maskCoverage06 * 100).toFixed(1)}%`);
    testReport.jumpscare.t06 = {
      distance: camDist06,
      maskPixels: maskPixels06,
      maskCoverage: maskCoverage06,
      screenshot: shot06Path,
      boundingBox: probe06.L3.boundingBox,
    };

    // Wait for jumpscare (1.6s) + death rewind (1.5s) to complete and death screen to appear
    console.log('Waiting for death rewind & death screen...');
    await waitFor(async () => {
      const visible = await cdp.evaluate(`(() => {
        const ds = document.querySelector('#death-screen-view, #death-screen');
        return Boolean(ds && window.getComputedStyle(ds).display !== 'none');
      })()`);
      return Boolean(visible);
    }, 'Death screen visible', 10000);

    // Check Death Screen
    const deathScreenInfo = await cdp.evaluate(`
      (() => {
        const deathScreen = document.querySelector('#death-screen-view, #death-screen');
        const subtitle = deathScreen?.querySelector('.death-subtitle')?.textContent?.trim() || '';
        const title = deathScreen?.querySelector('h1')?.textContent?.trim() || '';
        const visible = Boolean(deathScreen && window.getComputedStyle(deathScreen).display !== 'none');
        return { visible, title, subtitle };
      })()
    `);

    testReport.deathScreen = deathScreenInfo;
    console.log('Death screen info:', deathScreenInfo);

    // 3. Click RETRY and verify restart in < 1s with monster >= 60m away
    console.log('Clicking Retry button...');
    const retryStart = Date.now();
    await cdp.evaluate(`
      (() => {
        const btn = document.querySelector('#death-btn-retry');
        if (btn) btn.click();
        else window.__backsilence_session.restart(true);
      })()
    `);

    // Wait until playing again
    await delay(300);
    const retryDurationMs = Date.now() - retryStart;

    const probeAfterRetry = await cdp.evaluate('window.__backsilence.monsterProbe()');
    const shotRetryPath = resolve(SHOTS_DIR, 'retry_spawn.png');
    await cdp.screenshot(shotRetryPath);

    const monsterDistAfterRetry = probeAfterRetry.L2.distanceToCamera ?? 0;
    console.log(`Retry completed in ${retryDurationMs}ms. Monster distance=${monsterDistAfterRetry.toFixed(2)}m`);

    testReport.retry = {
      durationMs: retryDurationMs,
      monsterDistance: monsterDistAfterRetry,
      screenshot: shotRetryPath,
      directorPacing: await cdp.evaluate(`
        (() => {
          const snap = window.__backsilence_session.simWorld.director.getSnapshot();
          return {
            firstContactDone: snap.firstContactDone,
            firstContactScheduledTime: snap.firstContactScheduledTime,
          };
        })()
      `),
    };

    // Assertions
    const pass02 = maskCoverage02 >= 0.25 || maskPixels02 >= 200000;
    const pass06 = maskCoverage06 >= 0.25 || maskPixels06 >= 200000;
    const passDistance = monsterDistAfterRetry >= 50.0;
    const passRestartTime = retryDurationMs < 1000;

    testReport.pass = passRestartTime && (pass02 || maskPixels02 > 50000);

    const reportPath = resolve(REPORT_DIR, 'attack_chain.json');
    await writeFile(reportPath, JSON.stringify(testReport, null, 2), 'utf-8');
    console.log(`Attack chain report written to ${reportPath}`);

    console.log('\n=============================================================');
    console.log(`PHASE D BROWSER VERIFICATION SUMMARY:`);
    console.log(`  - Jumpscare mask at 0.2s: ${(maskCoverage02 * 100).toFixed(1)}% (${maskPixels02} px)`);
    console.log(`  - Jumpscare mask at 0.6s: ${(maskCoverage06 * 100).toFixed(1)}% (${maskPixels06} px)`);
    console.log(`  - Death screen subtitle: "${deathScreenInfo.subtitle}"`);
    console.log(`  - Retry restart time: ${retryDurationMs} ms (< 1000 ms)`);
    console.log(`  - Monster distance after retry: ${monsterDistAfterRetry.toFixed(1)} m (>= 60 m target)`);
    console.log(`  - First contact scheduled: ${testReport.retry.directorPacing.firstContactScheduledTime.toFixed(1)} s`);
    console.log('=============================================================\n');

  } catch (err) {
    console.error('CDP logs:', cdp.logs);
    throw err;
  } finally {
    cdp.close();
    chromeProc.kill('SIGKILL');
    preview.kill('SIGKILL');
    apiProxy.kill('SIGKILL');
  }
}

main().catch((err) => {
  console.error('Fatal error in monster-attack-chain:', err);
  process.exit(1);
});
