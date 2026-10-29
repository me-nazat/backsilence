import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const PORT = 4178;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUTPUT_DIR = resolve(ROOT, 'reports/reproduction/tiers');

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
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
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

async function testTier(tierName, qualitySetting, width, height) {
  console.log(`\n======================================================`);
  console.log(`Testing Tier: ${tierName} (Quality: ${qualitySetting}, Viewport: ${width}x${height})`);
  console.log(`======================================================`);

  const profile = await mkdtemp(resolve(tmpdir(), `backsilence-tier-${tierName}-`));
  const debugPort = await getFreePort();
  const chrome = spawn(chromePath(), [
    '--headless=new',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--window-size=${width},${height}`,
  ], { stdio: 'ignore' });

  await waitFor(() => fetch(`http://127.0.0.1:${debugPort}/json/version`).then((res) => res.ok).catch(() => false), 'Chrome DevTools');
  const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.connect();
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable')]);

  try {
    if (width === 390 && height === 844) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        mobile: true,
      });
    }

    // Pre-populate settings in localStorage
    await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
    await waitFor(() => evalInPage(cdp, `Boolean(window.localStorage)`), 'localStorage');

    await evalInPage(cdp, `(() => {
      const settings = {
        version: 2,
        graphics: {
          quality: '${qualitySetting}',
          resolutionScale: 100,
          fov: 75,
          brightness: 1.0,
          vhsIntensity: 0.0,
          headBob: true,
          reducedMotion: 'system',
          showFps: false,
          photosensitiveSafe: false,
          vhsOsd: false,
          vhsLines: 240,
          fpsCap: 0,
        },
        audio: { master: 0.8, sfx: 1.0, ambient: 0.7, monster: 1.0, muteOnBlur: true, soundVisualizer: false, outputProfile: 'headphones' },
        controls: {
          mouseSensitivity: 1.0,
          invertY: false,
          autoSprint: false,
          toggleSprint: false,
          toggleCrouch: false,
          haptics: true,
          crosshair: true,
          bindings: {}
        }
      };
      localStorage.setItem('backsilence.settings.v2', JSON.stringify(settings));
    })()`);

    // Direct Natatorium launch with seed 12345
    await cdp.send('Page.navigate', { url: `${BASE_URL}/?map=natatorium&seed=12345` });
    await waitFor(() => evalInPage(cdp, `Boolean(window.__backsilence_session && window.__backsilence_session.isLoaded)`), 'GameSession loaded', 30000);

    const actualTier = await evalInPage(cdp, `window.__backsilence_session.water.tier`);
    console.log(`Active Water / Rendering Tier: ${actualTier}`);

    // Turn player towards flooded hall
    await evalInPage(cdp, `(() => {
      window.__backsilence_session.simWorld.player.yaw = 0.0;
    })()`);

    // Move forward into flooded hall until t=15s
    console.log('Moving player forward into hall (holding W)...');
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
    await delay(15000);

    // Release W key at deck edge
    console.log('Player at hall deck edge, releasing W and observing...');
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });

    // Wait until t = 20s
    await delay(5000);

    const simTime = await evalInPage(cdp, `window.__backsilence_session.simWorld.director.getSnapshot().simTime`);
    console.log(`Reached simTime: ${simTime.toFixed(1)}s`);

    // Capture probe result
    const probe = await evalInPage(cdp, `window.__backsilence_session.monsterProbe()`);
    const pSnap = await evalInPage(cdp, `window.__backsilence_session.simWorld.player.getState()`);
    const mSnap = await evalInPage(cdp, `window.__backsilence_session.simWorld.monsters[0]?.getSnapshot()`);

    console.log(`Probe at 20s for ${tierName}:`);
    console.log(`Player pos: (${pSnap.pos.x.toFixed(1)}, ${pSnap.pos.z.toFixed(1)}), Monster pos: (${mSnap.pos.x.toFixed(1)}, ${mSnap.pos.z.toFixed(1)}), dist: ${Math.hypot(mSnap.pos.x - pSnap.pos.x, mSnap.pos.z - pSnap.pos.z).toFixed(1)}m`);
    console.log(`Verdict: pass=${probe.verdict.pass}, layer=${probe.verdict.layer}, reason="${probe.verdict.reason}"`);
    console.log(`L0: ${probe.L0.pass}, L1: ${probe.L1.pass}, L2: inFrustum=${probe.L2.inFrustum} (dist=${probe.L2.distanceToCamera}m), L3: pixels=${probe.L3.pixelCount}, L4: visibleFraction=${probe.L4.visibleFraction}, L5: moved=${probe.L5.metersMoved60s}m`);

    // Capture screenshot
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(OUTPUT_DIR, `${tierName}_t20s.png`), Buffer.from(shot.data, 'base64'));

    return {
      tierName,
      actualTier,
      verdict: probe.verdict,
      probe,
    };
  } finally {
    cdp.close();
    chrome.kill();
  }
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  await waitFor(() => fetch(BASE_URL).then((res) => res.ok).catch(() => false), 'Vite preview server');

  try {
    // 1. Low quality (desktop 1280x720)
    await testTier('low_desktop', 'low', 1280, 720);

    // 2. Medium quality (desktop 1280x720)
    await testTier('medium_desktop', 'medium', 1280, 720);

    // 3. High quality (desktop 1280x720)
    await testTier('high_desktop', 'high', 1280, 720);

    // 4. Mobile viewport (390x844)
    await testTier('mobile_390x844', 'medium', 390, 844);

  } finally {
    preview.kill();
  }
}

main().catch((err) => {
  console.error('Tier test failed:', err);
  process.exit(1);
});
