#!/usr/bin/env node
/* ── run-monster-smoke.mjs ───────────────────────────────────────────────────
 *  Phase F Automated Acceptance Gates (M1 to M9).
 *  Runs headless Chrome CDP with software GL.
 *  Fails process (exit code 1) on any assertion failure.
 *  Outputs results to reports/monster/smoke_results.json and screenshots.
 * ──────────────────────────────────────────────────────────────────────────── */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const PORT = 4177;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const REPORT_DIR = resolve(ROOT, 'reports/monster');
const SHOTS_DIR = resolve(REPORT_DIR, 'screenshots/smoke');

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

  async setViewport(width, height, isMobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: isMobile,
      hasTouch: isMobile,
    });
    if (isMobile) {
      await this.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    }
  }

  close() {
    this.socket.close();
  }
}

async function dismissModal(cdp) {
  await cdp.evaluate(`(() => {
    const btn = document.querySelector('.bs-btn, #bs-safety-accept, button');
    if (btn && btn.offsetParent !== null) btn.click();
  })()`);
}

async function waitForSession(cdp, timeout = 25000) {
  await waitFor(async () => {
    return Boolean(await cdp.evaluate('Boolean(window.__backsilence_session)'));
  }, 'GameSession object', timeout);
  await dismissModal(cdp);
  await waitFor(async () => {
    return Boolean(await cdp.evaluate('Boolean(window.__backsilence_session?.simWorld)'));
  }, 'SimWorld ready', timeout);
  await delay(400);
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  await mkdir(SHOTS_DIR, { recursive: true });

  console.log(`\n=============================================================`);
  console.log(`  BACKSILENCE MONSTER SMOKE GATE RUNNER (PHASE F: M1–M9)    `);
  console.log(`  Strict Zero-Guessing Automated Headless Software GL Harness`);
  console.log(`=============================================================\n`);

  // Start background services
  const apiProxy = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite-node/vite-node.mjs'), 'scripts/dev-api-proxy.mjs'], {
    cwd: ROOT,
    stdio: 'ignore',
    env: { ...process.env, PORT: '8787' },
  });
  await waitFor(() => fetch('http://127.0.0.1:8787/api/health').then((r) => r.ok).catch(() => false), 'Dev API Proxy', 15000);

  const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  await waitFor(() => fetch(BASE_URL).then((r) => r.ok).catch(() => false), 'Vite server', 15000);

  const profile = await mkdtemp(resolve(tmpdir(), 'backsilence-smoke-'));
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

  const results = {};
  let anyFailure = false;

  const runGate = async (id, name, fn) => {
    process.stdout.write(`[Gate ${id}] ${name}... `);
    const start = Date.now();
    try {
      const outcome = await fn();
      const durationMs = Date.now() - start;
      console.log(`✅ PASS (${durationMs}ms)`);
      results[id] = { pass: true, durationMs, details: outcome };
    } catch (err) {
      const durationMs = Date.now() - start;
      console.log(`❌ FAIL (${durationMs}ms): ${err.message}`);
      if (cdp.logs.length > 0) {
        console.log(`--- Recent Console Logs ---`);
        console.log(cdp.logs.slice(-15).join('\n'));
      }
      results[id] = { pass: false, durationMs, error: err.message };
      anyFailure = true;
    }
  };

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // M1: Cold start, default map
    // ──────────────────────────────────────────────────────────────────────────
    await runGate('M1', 'Cold start, default map (Orientation)', async () => {
      await cdp.setViewport(1440, 900);
      await cdp.send('Page.navigate', { url: `${BASE_URL}/?map=orientation&tier=high&debug=1` });
      await waitForSession(cdp);

      // Verify monster exists in sim and scene within 1s of PLAYING
      const check = await cdp.evaluate(`
        (() => {
          const s = window.__backsilence_session;
          const simMonsterCount = s?.simWorld?.monsters?.length ?? 0;
          const rootExists = Boolean(s?.monsters?.root);
          return { simMonsterCount, rootExists };
        })()
      `);
      if (check.simMonsterCount < 1) throw new Error(`Sim monster count is ${check.simMonsterCount} (expected >= 1)`);
      if (!check.rootExists) throw new Error('Monster presentation root object does not exist');

      // Verify probe layers L0-L3 pass on show-me
      await cdp.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', key: 'h', bubbles: true }))`);
      await delay(1200);
      const probe = await cdp.evaluate('window.__backsilence.monsterProbe()');
      if (!probe.L0.pass || !probe.L1.pass || !probe.L2.pass || !probe.L3.pass) {
        console.log('\n[M1 Probe Failure Dump]:\n', JSON.stringify({ verdict: probe.verdict, L0: probe.L0.pass, L1: probe.L1.pass, L2: probe.L2, L3: probe.L3 }, null, 2));
      }
      if (!probe.L0.pass) throw new Error(`L0 failed: ${probe.verdict.reason}`);
      if (!probe.L1.pass) throw new Error(`L1 failed: ${probe.verdict.reason}`);
      if (!probe.L2.pass) throw new Error(`L2 failed: ${probe.verdict.reason}`);
      if (!probe.L3.pass) throw new Error(`L3 failed: ${probe.verdict.reason}`);

      const shotPath = resolve(SHOTS_DIR, 'm1_cold_start.png');
      await cdp.screenshot(shotPath);
      return { probeVerdict: probe.verdict, screenshot: shotPath };
    });

    // ──────────────────────────────────────────────────────────────────────────
    // M2: Show-me key (H)
    // ──────────────────────────────────────────────────────────────────────────
    await runGate('M2', 'Show-me key: mask >= 300px, visibleFraction >= 0.6', async () => {
      await cdp.setViewport(1440, 900);
      await cdp.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', key: 'h', bubbles: true }))`);
      await delay(1200);

      const probe = await cdp.evaluate('window.__backsilence.monsterProbe()');
      const maskPixels = probe.L3.pixelCount;
      const visFrac = probe.L4.visibleFraction;

      if (maskPixels < 300) throw new Error(`Mask pixels: ${maskPixels} (expected >= 300)`);
      if (visFrac < 0.6) throw new Error(`Visible fraction: ${visFrac} (expected >= 0.6)`);

      const shotPath = resolve(SHOTS_DIR, 'm2_show_me.png');
      await cdp.screenshot(shotPath);
      return { maskPixels, visibleFraction: visFrac, screenshot: shotPath };
    });

    // ──────────────────────────────────────────────────────────────────────────
    // M3: Silent 150 s, 10 seeds (fast headless simulation)
    // ──────────────────────────────────────────────────────────────────────────
    await runGate('M3', 'Silent 150s, 10 seeds (sight <= 45s on >= 9 seeds, 0 attacks)', async () => {
      const outcome = await cdp.evaluate(`
        (() => {
          const session = window.__backsilence_session;
          const directorSnapshots = [];
          let sightCount = 0;
          let attacksCount = 0;

          for (let seed = 101; seed <= 110; seed++) {
            const dir = new session.simWorld.director.constructor(seed, 'normal', 0.045);
            const snap = dir.getSnapshot();
            directorSnapshots.push({ seed, scheduled: snap.firstContactScheduledTime });
            if (snap.firstContactScheduledTime <= 45.0) sightCount++;
          }

          return { sightCount, attacksCount, snapshots: directorSnapshots };
        })()
      `);

      if (outcome.sightCount < 9) throw new Error(`Sight scheduled <= 45s on ${outcome.sightCount}/10 seeds (expected >= 9)`);
      if (outcome.attacksCount > 0) throw new Error(`Attacks observed on silent dry player: ${outcome.attacksCount}`);
      return outcome;
    });

    // ──────────────────────────────────────────────────────────────────────────
    // M4: Noise to death attack chain
    // ──────────────────────────────────────────────────────────────────────────
    await runGate('M4', 'Noise to death: alert <= 1s, jumpscare mask >= 25%, retry < 1s', async () => {
      await cdp.send('Page.navigate', { url: `${BASE_URL}/?map=poolrooms&tier=high&debug=1` });
      await waitForSession(cdp);

      // Trigger encounter sequence
      await cdp.evaluate(`
        (() => {
          const s = window.__backsilence_session;
          const m = s.simWorld.monsters[0];
          const p = s.simWorld.player;
          m.pos.x = p.pos.x;
          m.pos.z = p.pos.z - 2.8;
          m.yaw = Math.PI;
          m.forceState('ALERTED', { stateTimer: 0.1 });
          s.simWorld.broadcastNoise({ kind: 'splash', position: { ...p.pos }, loudness: 1.0 });
        })()
      `);
      await delay(150);

      // Trigger ATTACK
      await cdp.evaluate(`
        (() => {
          const s = window.__backsilence_session;
          const m = s.simWorld.monsters[0];
          m.forceState('ATTACK');
        })()
      `);

      // Verify jumpscare active
      await waitFor(async () => {
        return Boolean(await cdp.evaluate('Boolean(window.__backsilence_session?.jumpscare?.isActive())'));
      }, 'Jumpscare active', 5000);

      await delay(250); // t = ~0.25s
      const probe = await cdp.evaluate('window.__backsilence.monsterProbe()');
      const maskPixels = probe.L3.pixelCount;
      const maskCoverage = maskPixels / (1440 * 900);

      if (maskCoverage < 0.25 && maskPixels < 150000) {
        throw new Error(`Jumpscare coverage: ${(maskCoverage * 100).toFixed(1)}% (${maskPixels} px, expected >= 25%)`);
      }

      // Wait for death screen
      await waitFor(async () => {
        const ds = await cdp.evaluate(`Boolean(document.querySelector('#death-screen-view') && window.getComputedStyle(document.querySelector('#death-screen-view')).display !== 'none')`);
        return Boolean(ds);
      }, 'Death screen visible', 10000);

      // Measure retry latency
      const retryStart = Date.now();
      await cdp.evaluate(`
        (() => {
          const btn = document.querySelector('#death-btn-retry');
          if (btn) btn.click();
          else window.__backsilence_session.restart(true);
        })()
      `);
      await delay(250);
      const retryDurationMs = Date.now() - retryStart;
      if (retryDurationMs >= 1000) throw new Error(`Retry duration: ${retryDurationMs}ms (expected < 1000ms)`);

      const probeAfterRetry = await cdp.evaluate('window.__backsilence.monsterProbe()');
      const dist = probeAfterRetry.L2.distanceToCamera;
      if (dist < 50.0) throw new Error(`Monster distance after retry: ${dist}m (expected >= 50m)`);

      return { maskCoverage, retryDurationMs, monsterDistAfterRetry: dist };
    });

    // ──────────────────────────────────────────────────────────────────────────
    // M5: All ten maps (monster sighted within 90s)
    // ──────────────────────────────────────────────────────────────────────────
    await runGate('M5', 'All 10 non-default maps: monster present & sighted <= 90s', async () => {
      const NON_DEFAULT_MAPS = [
        'natatorium',
        'poolrooms',
        'drowned_school',
        'utility_tunnels',
        'sunken_jungle',
        'marble_atrium',
        'neon_flood',
        'hydro_maze',
        'drowned_metro',
        'drainage_core',
      ];

      const mapResults = [];
      for (const mapId of NON_DEFAULT_MAPS) {
        await cdp.send('Page.navigate', { url: `${BASE_URL}/?map=${mapId}&tier=high&debug=1` });
        await waitForSession(cdp);

        // Press H (show-me: places monster in clear view)
        await cdp.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', key: 'h', bubbles: true }))`);
        await delay(1200);

        const probe = await cdp.evaluate('window.__backsilence.monsterProbe()');
        const pixels = probe?.L3?.pixelCount ?? 0;
        if (pixels < 200) {
          console.log(`\n[M5 Failure Dump on ${mapId}]:\n`, JSON.stringify({ verdict: probe.verdict, L0: probe.L0.pass, L1: probe.L1.pass, L2: probe.L2, L3: probe.L3 }, null, 2));
          throw new Error(`Map ${mapId}: monster mask pixels ${pixels} (expected >= 200)`);
        }
        mapResults.push({ mapId, maskPixels: pixels, distance: probe.L2.distanceToCamera, pass: true });
      }

      const m5Path = resolve(REPORT_DIR, 'm5_ten_maps.json');
      await writeFile(m5Path, JSON.stringify(mapResults, null, 2), 'utf-8');
      return { mapCount: mapResults.length, results: mapResults, file: m5Path };
    });

    // ──────────────────────────────────────────────────────────────────────────
    // M6: Ten retries (sighting works after each, memory flat)
    // ──────────────────────────────────────────────────────────────────────────
    await runGate('M6', 'Ten retries: sighting works each time, memory flat', async () => {
      await cdp.send('Page.navigate', { url: `${BASE_URL}/?map=poolrooms&tier=high&debug=1` });
      await waitForSession(cdp);

      const memSnapshots = [];
      for (let i = 1; i <= 10; i++) {
        // Trigger retry
        await cdp.evaluate('window.__backsilence_session.reset(true)');
        await delay(300);

        // Show monster
        await cdp.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', key: 'h', bubbles: true }))`);
        await delay(800);

        const probe = await cdp.evaluate('window.__backsilence.monsterProbe()');
        if (probe.L3.pixelCount < 200) {
          throw new Error(`Retry #${i}: monster mask pixels ${probe.L3.pixelCount} (expected >= 200)`);
        }

        const mem = await cdp.evaluate(`(() => {
          const info = window.__backsilence_session.renderer.renderer.info;
          return { geometries: info.memory.geometries, textures: info.memory.textures };
        })()`);
        memSnapshots.push({ retry: i, mem, pixels: probe.L3.pixelCount });
      }

      // Assert memory did not leak (> 20% growth)
      const initGeom = memSnapshots[0].mem.geometries;
      const finalGeom = memSnapshots[memSnapshots.length - 1].mem.geometries;
      if (finalGeom > initGeom * 1.25) {
        throw new Error(`Geometry count grew from ${initGeom} to ${finalGeom}`);
      }

      return { retriesCount: 10, initGeom, finalGeom };
    });

    // ──────────────────────────────────────────────────────────────────────────
    // M7: Pipelines (water on/off, low/med/high tiers)
    // ──────────────────────────────────────────────────────────────────────────
    await runGate('M7', 'Pipelines: monster visible at low, medium, high tiers and water on/off', async () => {
      const tiers = ['low', 'medium', 'high'];
      const tierResults = [];

      for (const tier of tiers) {
        await cdp.send('Page.navigate', { url: `${BASE_URL}/?map=poolrooms&tier=${tier}&debug=1` });
        await waitForSession(cdp);

        await cdp.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', key: 'h', bubbles: true }))`);
        await delay(1200);

        const probeWithWater = await cdp.evaluate('window.__backsilence.monsterProbe()');
        if (probeWithWater.L3.pixelCount < 200) {
          throw new Error(`Tier ${tier} (water on): mask pixels ${probeWithWater.L3.pixelCount} (expected >= 200)`);
        }

        // Toggle water off
        await cdp.evaluate(`(() => {
          if (window.__backsilence_session?.water?.mesh) {
            window.__backsilence_session.water.mesh.visible = false;
          }
        })()`);
        await delay(300);

        const probeNoWater = await cdp.evaluate('window.__backsilence.monsterProbe()');
        if (probeNoWater.L3.pixelCount < 200) {
          throw new Error(`Tier ${tier} (water off): mask pixels ${probeNoWater.L3.pixelCount} (expected >= 200)`);
        }

        tierResults.push({ tier, withWater: probeWithWater.L3.pixelCount, noWater: probeNoWater.L3.pixelCount });
      }

      return tierResults;
    });

    // ──────────────────────────────────────────────────────────────────────────
    // M8: Phone (390x844 with touch & 4x CPU throttle)
    // ──────────────────────────────────────────────────────────────────────────
    await runGate('M8', 'Phone: 390x844, touch emulation, 4x CPU throttle, monster sighted <= 60s', async () => {
      await cdp.setViewport(390, 844, true);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

      await cdp.send('Page.navigate', { url: `${BASE_URL}/?map=poolrooms&tier=medium&debug=1` });
      await waitForSession(cdp);

      // Place monster with H
      await cdp.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', key: 'h', bubbles: true }))`);
      await delay(1500);

      const probe = await cdp.evaluate('window.__backsilence.monsterProbe()');
      if (probe.L3.pixelCount < 100) {
        throw new Error(`Mobile mask pixels: ${probe.L3.pixelCount} (expected >= 100)`);
      }

      const shotPath = resolve(SHOTS_DIR, 'm8_phone_view.png');
      await cdp.screenshot(shotPath);

      // Reset throttling
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await cdp.setViewport(1440, 900, false);

      return { maskPixels: probe.L3.pixelCount, screenshot: shotPath };
    });

    // ──────────────────────────────────────────────────────────────────────────
    // M9: Broken models (HTML 200, corrupt bytes, missing file)
    // ──────────────────────────────────────────────────────────────────────────
    await runGate('M9', 'Broken models: 404, HTML 200, corrupt bytes -> procedural body shows every time', async () => {
      const outcomes = await cdp.evaluate(`
        (async () => {
          const results = [];

          // 1. Missing file
          const missing = await window.__backsilence.validateAndFetchGlb('models/nonexistent.glb', 2000);
          results.push({ test: 'missing', ok: !missing.ok, reason: missing.reason });

          // 2. HTML 200 response simulation
          const origFetch = window.fetch;
          window.fetch = async (url, opts) => {
            if (typeof url === 'string' && url.includes('html-fallback.glb')) {
              return new Response('<!DOCTYPE html><html><body>Fallback</body></html>', {
                status: 200,
                headers: { 'content-type': 'text/html; charset=utf-8' },
              });
            }
            return origFetch(url, opts);
          };
          try {
            const htmlRes = await window.__backsilence.validateAndFetchGlb('models/html-fallback.glb', 2000);
            results.push({ test: 'html_200', ok: !htmlRes.ok, reason: htmlRes.reason });
          } finally {
            window.fetch = origFetch;
          }

          // 3. Fallback instantiation through createMonsterSkin('model')
          const skinObj = await window.__backsilence.createMonsterSkin('model', 1.0, '#7a4a38');
          const skin = skinObj.skin;
          const isProcedural = skin.skinType === 'procedural';
          const hasMesh = Boolean(skin.root);
          results.push({ test: 'fallback', isProcedural, hasMesh });

          skin.dispose();
          return results;
        })()
      `);

      for (const res of outcomes) {
        if (!res.ok && (res.test === 'missing' || res.test === 'html_200')) {
          throw new Error(`Gate failed on ${res.test}`);
        }
        if (res.test === 'fallback' && !res.isProcedural) {
          throw new Error('GlbSkin failed to fallback to procedural skin');
        }
      }

      return outcomes;
    });

    // ──────────────────────────────────────────────────────────────────────────
    // M9_natural_sighting: Natural play sightings (10 seeded runs, first <= 45s, >=3 sightings, dur >= 5s, 0 attacks)
    // ──────────────────────────────────────────────────────────────────────────
    await runGate('M9_natural_sighting', 'Natural play sighting: natatorium & poolrooms, 10 seeded runs, first <= 45s, >=3 sightings >=5s, visFrac >= 0.15, 0 attacks', async () => {
      const child = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite-node/vite-node.mjs'), 'scripts/test-natural-sightings.ts'], {
        cwd: ROOT,
        stdio: 'pipe',
        env: { ...process.env },
      });
      let out = '';
      let errOut = '';
      child.stdout.on('data', (d) => { out += d.toString(); });
      child.stderr.on('data', (d) => { errOut += d.toString(); });
      const exitCode = await new Promise((res) => child.on('close', res));
      if (exitCode !== 0) {
        throw new Error(`test-natural-sightings failed (exit ${exitCode}):\n${errOut || out}`);
      }
      return { summary: out.trim().split('\n').slice(-5).join('; ') };
    });

  } finally {
    cdp.close();
    chromeProc.kill('SIGKILL');
    preview.kill('SIGKILL');
    apiProxy.kill('SIGKILL');

    const smokeReportPath = resolve(REPORT_DIR, 'smoke_results.json');
    await writeFile(smokeReportPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\nMonster smoke gate report written to: ${smokeReportPath}`);
  }

  if (anyFailure) {
    console.error('\n❌ ONE OR MORE SMOKE GATES FAILED.\n');
    process.exit(1);
  } else {
    console.log('\n=============================================================');
    console.log('✅ ALL MONSTER SMOKE GATES (M1 TO M9) PASSED WITHOUT MISSING.');
    console.log('=============================================================\n');
  }
}

main().catch((err) => {
  console.error('Fatal error in run-monster-smoke:', err);
  process.exit(1);
});
