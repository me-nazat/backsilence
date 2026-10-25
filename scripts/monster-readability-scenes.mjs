#!/usr/bin/env node
/* ── monster-readability-scenes.mjs ───────────────────────────────────────────
 *  Phase E Verification: Creature Look, Animation, and Distance Readability
 *  Captures screenshots with magenta mask outlines at 6m, 15m, 25m, 40m,
 *  sleeper from spawn, crossing, and lurk.
 *  Saves reports/monster/readability.json and screenshots in reports/monster/screenshots/
 * ──────────────────────────────────────────────────────────────────────────── */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const PORT = 4176;
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
      this.pending.set(id, { resolve, reject });
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Evaluation failed: ${res.exceptionDetails.text} (${JSON.stringify(res.exceptionDetails)})`);
    }
    return res.result?.value;
  }

  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(res.data, 'base64');
    await writeFile(filePath, buf);
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
  console.log(`  BACKSILENCE READABILITY & SCENE VERIFICATION RUNNER       `);
  console.log(`  Distance Reads: 6m, 15m, 25m, 40m, Sleeper, Cross, Lurk   `);
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
  const profile = await mkdtemp(resolve(tmpdir(), 'backsilence-readability-'));
  const debugPort = await getFreePort();
  const chromeArgs = [
    '--headless=new',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--window-size=1440,900',
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
  await cdp.setViewport(1440, 900);

  const readabilityReport = {
    timestamp: new Date().toISOString(),
    viewport: { width: 1440, height: 900 },
    distances: {},
    scenes: {},
  };

  try {
    const testUrl = `${BASE_URL}/?map=poolrooms&tier=high&debug=1&seed=1001`;
    console.log(`Navigating to ${testUrl}...`);
    await cdp.send('Page.navigate', { url: testUrl });

    // Wait for session ready
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

    // Helper to inject magenta bounding box overlay
    const applyOutline = async (bbox) => {
      if (!bbox) return;
      await cdp.evaluate(`(() => {
        let box = document.getElementById('debug-monster-mask-outline');
        if (!box) {
          box = document.createElement('div');
          box.id = 'debug-monster-mask-outline';
          box.style.position = 'fixed';
          box.style.border = '3px solid #ff00ff';
          box.style.boxShadow = '0 0 10px #ff00ff';
          box.style.pointerEvents = 'none';
          box.style.zIndex = '9999999';
          document.body.appendChild(box);
        }
        const b = ${JSON.stringify(bbox)};
        box.style.left = b.minX + 'px';
        box.style.top = b.minY + 'px';
        box.style.width = b.width + 'px';
        box.style.height = b.height + 'px';
        box.style.display = 'block';
      })()`);
    };

    // Helper to position monster at exact distance facing camera
    const positionAtDistance = async (distMeters, state = 'WANDER', lateralOffset = 0, headingAngle = Math.PI) => {
      return await cdp.evaluate(`
        (() => {
          const session = window.__backsilence_session;
          const m = session.simWorld.monsters[0];
          const cam = session.camera;

          // True world forward vector from camera
          const fwd = cam.getWorldDirection(cam.position.clone());
          fwd.y = 0;
          fwd.normalize();

          // Right vector
          const rightX = -fwd.z;
          const rightZ = fwd.x;

          // Target position
          const targetX = cam.position.x + fwd.x * ${distMeters} + rightX * ${lateralOffset};
          const targetZ = cam.position.z + fwd.z * ${distMeters} + rightZ * ${lateralOffset};

          m.pos.x = targetX;
          m.pos.z = targetZ;
          m.pos.y = session.simWorld.currentWaterY;
          const camYaw = Math.atan2(fwd.x, fwd.z);
          m.yaw = camYaw + ${headingAngle};
          m.forceState('${state}');

          const body = session.monsters.getBody(m.id);
          if (body) {
            body.mesh.root.position.set(m.pos.x, m.pos.y, m.pos.z);
            body.mesh.root.rotation.y = m.yaw;
          }

          return { x: m.pos.x, z: m.pos.z, yaw: m.yaw };
        })()
      `);
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Distance Series: 6m, 15m, 25m, 40m
    // ──────────────────────────────────────────────────────────────────────────
    const distances = [6, 15, 25, 40];
    for (const d of distances) {
      console.log(`Setting up show-me at ${d}m...`);
      await positionAtDistance(d);
      await delay(600);

      const probe = await cdp.evaluate('window.__backsilence.monsterProbe()');
      await applyOutline(probe.L3?.boundingBox);

      const shotPath = resolve(SHOTS_DIR, `show_me_${d}m.png`);
      await cdp.screenshot(shotPath);

      const pixels = probe.L3?.pixelCount ?? 0;
      const trans = probe.L2?.fogTransmittance ?? 0;
      const actualDist = probe.L2?.distanceToCamera ?? d;
      console.log(`  -> ${d}m: distance=${actualDist}m, maskPixels=${pixels}, transmittance=${(trans * 100).toFixed(1)}%`);

      readabilityReport.distances[`${d}m`] = {
        distanceMeters: actualDist,
        maskPixels: pixels,
        fogTransmittance: trans,
        verdict: probe.verdict,
        screenshot: shotPath,
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. The Sleeper from Spawn
    // ──────────────────────────────────────────────────────────────────────────
    console.log('Setting up Sleeper from spawn view...');
    await cdp.evaluate(`
      (() => {
        const session = window.__backsilence_session;
        const spawn = session.layout.spawns.player[0];
        session.simWorld.player.teleport(spawn);

        const m = session.simWorld.monsters[0];
        const sleeperSpawn = session.layout.spawns.monsters[0].sleeperSpawn || {
          x: spawn.x + 25,
          y: session.simWorld.currentWaterY,
          z: spawn.z
        };
        m.pos.x = sleeperSpawn.x;
        m.pos.y = sleeperSpawn.y;
        m.pos.z = sleeperSpawn.z;
        m.forceState('DORMANT');

        // Aim player & camera towards sleeper
        const dx = m.pos.x - spawn.x;
        const dz = m.pos.z - spawn.z;
        const yaw = Math.atan2(-dx, -dz);
        session.simWorld.player.yaw = yaw;
        session.simWorld.player.pitch = 0;
        session.camera.rotation.y = yaw;

        const body = session.monsters.getBody(m.id);
        if (body) {
          body.mesh.root.position.set(m.pos.x, m.pos.y, m.pos.z);
        }
      })()
    `);
    await delay(700);

    const sleeperProbe = await cdp.evaluate('window.__backsilence.monsterProbe()');
    await applyOutline(sleeperProbe.L3?.boundingBox);
    const sleeperShotPath = resolve(SHOTS_DIR, 'sleeper_from_spawn.png');
    await cdp.screenshot(sleeperShotPath);
    console.log(`  -> Sleeper: distance=${sleeperProbe.L2?.distanceToCamera}m, maskPixels=${sleeperProbe.L3?.pixelCount}`);

    readabilityReport.scenes.sleeper = {
      distanceMeters: sleeperProbe.L2?.distanceToCamera,
      maskPixels: sleeperProbe.L3?.pixelCount,
      fogTransmittance: sleeperProbe.L2?.fogTransmittance,
      screenshot: sleeperShotPath,
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 3. A Crossing
    // ──────────────────────────────────────────────────────────────────────────
    console.log('Setting up Crossing encounter view...');
    // Monster wading across the corridor at 16m with 90 deg lateral heading
    await positionAtDistance(16, 'WANDER', 1.5, Math.PI * 0.5);
    await delay(600);

    const crossingProbe = await cdp.evaluate('window.__backsilence.monsterProbe()');
    await applyOutline(crossingProbe.L3?.boundingBox);
    const crossingShotPath = resolve(SHOTS_DIR, 'crossing.png');
    await cdp.screenshot(crossingShotPath);
    console.log(`  -> Crossing: distance=${crossingProbe.L2?.distanceToCamera}m, maskPixels=${crossingProbe.L3?.pixelCount}`);

    readabilityReport.scenes.crossing = {
      distanceMeters: crossingProbe.L2?.distanceToCamera,
      maskPixels: crossingProbe.L3?.pixelCount,
      fogTransmittance: crossingProbe.L2?.fogTransmittance,
      screenshot: crossingShotPath,
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 4. A Lurk
    // ──────────────────────────────────────────────────────────────────────────
    console.log('Setting up Lurk pose view...');
    // Monster lurking at 9m in predatory crouch
    await positionAtDistance(9, 'LURK', 0, Math.PI);
    await delay(600);

    const lurkProbe = await cdp.evaluate('window.__backsilence.monsterProbe()');
    await applyOutline(lurkProbe.L3?.boundingBox);
    const lurkShotPath = resolve(SHOTS_DIR, 'lurk.png');
    await cdp.screenshot(lurkShotPath);
    console.log(`  -> Lurk: distance=${lurkProbe.L2?.distanceToCamera}m, maskPixels=${lurkProbe.L3?.pixelCount}`);

    readabilityReport.scenes.lurk = {
      distanceMeters: lurkProbe.L2?.distanceToCamera,
      maskPixels: lurkProbe.L3?.pixelCount,
      fogTransmittance: lurkProbe.L2?.fogTransmittance,
      screenshot: lurkShotPath,
    };

    const reportPath = resolve(REPORT_DIR, 'readability.json');
    await writeFile(reportPath, JSON.stringify(readabilityReport, null, 2), 'utf-8');
    console.log(`\nReadability report written to ${reportPath}`);

    console.log('\n=============================================================');
    console.log('PHASE E READABILITY & SCENE SUMMARY:');
    console.log(`  - Show-me 6m:   ${readabilityReport.distances['6m'].maskPixels} px (${readabilityReport.distances['6m'].distanceMeters}m)`);
    console.log(`  - Show-me 15m:  ${readabilityReport.distances['15m'].maskPixels} px (${readabilityReport.distances['15m'].distanceMeters}m)`);
    console.log(`  - Show-me 25m:  ${readabilityReport.distances['25m'].maskPixels} px (${readabilityReport.distances['25m'].distanceMeters}m)`);
    console.log(`  - Show-me 40m:  ${readabilityReport.distances['40m'].maskPixels} px (${readabilityReport.distances['40m'].distanceMeters}m)`);
    console.log(`  - Sleeper:      ${readabilityReport.scenes.sleeper.maskPixels} px (${readabilityReport.scenes.sleeper.distanceMeters}m)`);
    console.log(`  - Crossing:     ${readabilityReport.scenes.crossing.maskPixels} px (${readabilityReport.scenes.crossing.distanceMeters}m)`);
    console.log(`  - Lurk:         ${readabilityReport.scenes.lurk.maskPixels} px (${readabilityReport.scenes.lurk.distanceMeters}m)`);
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
  console.error('Fatal error in monster-readability-scenes:', err);
  process.exit(1);
});
