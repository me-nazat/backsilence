import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const PORT = 4178;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUTPUT_DIR = resolve(ROOT, 'reports/reproduction');

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
    this.consoleLogs = [];
    this.exceptions = [];
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
        const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
        this.consoleLogs.push(`[${msg.params.type}] ${text}`);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.exceptions.push(msg.params.exceptionDetails?.text || 'Exception');
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

  close() {
    this.socket.close();
  }
}

async function evalInPage(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.text || JSON.stringify(res.exceptionDetails));
  }
  return res.result.value;
}

async function captureScreenshot(cdp, filepath) {
  const res = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(filepath, Buffer.from(res.data, 'base64'));
}

async function runScenario(scenarioName, url, cdp, directory) {
  console.log(`\n======================================================`);
  console.log(`Starting Scenario: ${scenarioName} (${url})`);
  console.log(`======================================================`);

  cdp.consoleLogs.length = 0;
  cdp.exceptions.length = 0;

  await cdp.send('Page.navigate', { url });
  await waitFor(() => evalInPage(cdp, `Boolean(document.querySelector('#app'))`), 'App container');

  // If menu launch, click DESCEND
  if (url === BASE_URL || url === `${BASE_URL}/` || (url.includes('debug=1') && !url.includes('map='))) {
    console.log('Waiting for menu interactive...');
    await waitFor(() => evalInPage(cdp, `performance.getEntriesByName('menu:interactive').length > 0`), 'menu:interactive mark');
    await delay(500);

    // Verify stored last-tape behavior
    const initialLastTape = await evalInPage(cdp, `localStorage.getItem('backsilence_last_tape')`);
    console.log(`Initial localStorage['backsilence_last_tape']:`, initialLastTape);

    const descendBtn = await evalInPage(cdp, `Boolean(document.querySelector('#btn-play-solo'))`);
    console.log('Found #btn-play-solo:', descendBtn);
    if (descendBtn) {
      await evalInPage(cdp, `document.querySelector('#btn-play-solo').click()`);
    } else {
      await evalInPage(cdp, `document.querySelector('#btn-descend-wrap button')?.click()`);
    }
  }

  // Wait for session to initialize
  console.log('Waiting for active GameSession and map load...');
  await waitFor(() => evalInPage(cdp, `Boolean(window.__backsilence_session && window.__backsilence_session.isLoaded)`), 'GameSession isLoaded', 30000);

  const activeMapId = await evalInPage(cdp, `window.__backsilence_session.mapId`);
  console.log(`ACTIVE MAP ID: ${activeMapId}`);

  // Diagnostic helper to run MonsterProbe and retrieve full layers
  async function probe(label, elapsedSec) {
    const data = await evalInPage(cdp, `(() => {
      const s = window.__backsilence_session;
      if (!s) return { error: 'No session' };
      const probeRes = s.monsterProbe();
      const pSnap = s.simWorld.player.getState();
      const mSnap = s.simWorld.monsters[0] ? s.simWorld.monsters[0].getSnapshot() : null;
      return {
        probe: probeRes,
        player: { pos: pSnap.pos, yaw: pSnap.yaw },
        monster: mSnap ? { pos: mSnap.pos, state: mSnap.state, yaw: mSnap.yaw, distToPlayer: Math.hypot(mSnap.pos.x - pSnap.pos.x, mSnap.pos.z - pSnap.pos.z) } : null,
        isLoaded: s.isLoaded,
        director: s.simWorld.director ? {
          dread: s.simWorld.director.dread,
          phase: s.simWorld.director.phase,
          firstContactDone: s.simWorld.director.getSnapshot().firstContactDone,
          firstContactScheduledTime: s.simWorld.director.getSnapshot().firstContactScheduledTime,
          simTime: s.simWorld.director.getSnapshot().simTime,
        } : null,
      };
    })()`);

    console.log(`\n--- PROBE AT ${label} (${elapsedSec}s) ---`);
    console.log(`Player pos: (${data.player.pos.x.toFixed(2)}, ${data.player.pos.y.toFixed(2)}, ${data.player.pos.z.toFixed(2)}), yaw: ${data.player.yaw.toFixed(2)} rad (${(data.player.yaw * 180 / Math.PI).toFixed(1)}°)`);
    if (data.monster) {
      console.log(`Monster pos: (${data.monster.pos.x.toFixed(2)}, ${data.monster.pos.y.toFixed(2)}, ${data.monster.pos.z.toFixed(2)}), state: ${data.monster.state}, dist: ${data.monster.distToPlayer.toFixed(2)}m`);
    } else {
      console.log('No monster in sim!');
    }
    console.log(`Verdict: pass=${data.probe.verdict.pass}, layer=${data.probe.verdict.layer}, reason="${data.probe.verdict.reason}"`);
    console.log(`L0: pass=${data.probe.L0.pass}, count=${data.probe.L0.monsterCount}`);
    console.log(`L1: pass=${data.probe.L1.pass}, hasRoot=${data.probe.L1.hasRoot}, rootVis=${data.probe.L1.rootVisible}, meshes=${data.probe.L1.childMeshCount}, tris=${data.probe.L1.triangleCount}`);
    console.log(`L2: pass=${data.probe.L2.pass}, inFrustum=${data.probe.L2.inFrustum}, dist=${data.probe.L2.distanceToCamera}m, fogT=${data.probe.L2.fogTransmittance}, angle=${data.probe.L2.signedAngleRad}`);
    console.log(`L3: pass=${data.probe.L3.pass}, pixels=${data.probe.L3.pixelCount}`);
    console.log(`L4: pass=${data.probe.L4.pass}, visibleFraction=${data.probe.L4.visibleFraction}, stage=${data.probe.L4.occludingStage}`);
    console.log(`L5: pass=${data.probe.L5.pass}, moved60s=${data.probe.L5.metersMoved60s}m`);
    if (data.director) {
      console.log(`Director: simTime=${data.director.simTime.toFixed(1)}s, phase=${data.director.phase}, firstContactDone=${data.director.firstContactDone}, scheduledAt=${data.director.firstContactScheduledTime.toFixed(1)}s`);
    }

    return data;
  }

  // 1. Startup capture (0s)
  await probe('Startup', 0);
  await captureScreenshot(cdp, resolve(directory, `${scenarioName}_t00s_startup.png`));

  // Player action: at t=0..2s, turn toward the flooded hall (yaw goes from PI to 0)
  console.log('Turning player towards flooded hall (yaw = 0)...');
  await evalInPage(cdp, `(() => {
    window.__backsilence_session.simWorld.player.yaw = 0.0;
  })()`);

  // Press W key via CDP
  console.log('Simulating player movement forward into hall (holding W)...');
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });

  // Wait until t=7s (player moves into the hall entrance and steps into the water)
  await delay(7000);
  await probe('7s', 7);
  await captureScreenshot(cdp, resolve(directory, `${scenarioName}_t07s.png`));

  // Release W key so the player pauses in the flooded hall to listen and observe
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });

  // Wait until t=15s
  await delay(8000);
  await probe('15s', 15);
  await captureScreenshot(cdp, resolve(directory, `${scenarioName}_t15s.png`));

  // Continue to t=20s
  await delay(5000);
  await probe('20s', 20);
  await captureScreenshot(cdp, resolve(directory, `${scenarioName}_t20s.png`));

  // Continue to t=35s
  await delay(15000);
  await probe('35s', 35);
  await captureScreenshot(cdp, resolve(directory, `${scenarioName}_t35s.png`));

  // Continue to t=40s
  await delay(5000);
  await probe('40s', 40);
  await captureScreenshot(cdp, resolve(directory, `${scenarioName}_t40s.png`));

  console.log(`\nExceptions in ${scenarioName}:`, cdp.exceptions);
  const relevantLogs = cdp.consoleLogs.filter(l => l.includes('warn') || l.includes('error') || l.includes('BackSilence') || l.includes('Monster') || l.includes('Director'));
  console.log(`Relevant Console Logs in ${scenarioName}:`, relevantLogs.slice(0, 20));
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  await waitFor(() => fetch(BASE_URL).then((res) => res.ok).catch(() => false), 'Vite preview server');

  const profile = await mkdtemp(resolve(tmpdir(), 'backsilence-diag-'));
  const debugPort = await getFreePort();
  const chromeArgs = [
    '--headless=new',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,720',
  ];
  const chrome = spawn(chromePath(), chromeArgs, { stdio: 'ignore' });
  await waitFor(() => fetch(`http://127.0.0.1:${debugPort}/json/version`).then((res) => res.ok).catch(() => false), 'Chrome DevTools');

  const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.connect();
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable')]);

  try {
    // 1. Fresh normal menu launch
    await runScenario('menu_launch', `${BASE_URL}/`, cdp, OUTPUT_DIR);

    // 2. Direct Natatorium launch
    await runScenario('direct_natatorium', `${BASE_URL}/?map=natatorium&seed=12345`, cdp, OUTPUT_DIR);

    // 3. Second representative map: Poolrooms
    await runScenario('direct_poolrooms', `${BASE_URL}/?map=poolrooms&seed=12345`, cdp, OUTPUT_DIR);

  } finally {
    cdp.close();
    chrome.kill();
    preview.kill();
  }
}

main().catch((err) => {
  console.error('Diagnostic run failed:', err);
  process.exit(1);
});
