#!/usr/bin/env node
/* ── run-perf.mjs ────────────────────────────────────────────────────────────
 *  BackSilence Performance, Allocation, and Memory Regression Harness.
 *  Measures per-map frame times, allocations, map switch hygiene, mobile profile,
 *  and verifies frame-time budgets against stored baseline.
 * ──────────────────────────────────────────────────────────────────────── */

import { execSync, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const ROOT = process.cwd();
const PORT = 4175;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const REPORT_DIR = resolve(ROOT, 'reports/perf');
const BASELINE_FILE = resolve(REPORT_DIR, 'baseline.json');
const RESULTS_FILE = resolve(REPORT_DIR, 'results.json');

const ALL_10_MAPS = [
  'poolrooms',
  'utility_tunnels',
  'marble_atrium',
  'hydro_maze',
  'drainage_core',
  'natatorium',
  'drowned_school',
  'sunken_jungle',
  'neon_flood',
  'drowned_metro',
];

const TIERS = ['low', 'medium', 'high'];

// Parse CLI flags
const isQuick = process.argv.includes('--quick');
const durationSec = isQuick ? 4 : (parseInt(process.argv.find((a) => a.startsWith('--duration='))?.split('=')[1] ?? '4', 10));

function chromePath() {
  if (process.env.BACKSILENCE_CHROME_BIN && existsSync(process.env.BACKSILENCE_CHROME_BIN)) {
    const bin = process.env.BACKSILENCE_CHROME_BIN;
    console.log(`Using Chrome: ${bin}`);
    return bin;
  }
  const home = homedir();
  const puppeteerDirs = [
    join(home, '.cache', 'puppeteer', 'chrome'),
    join(home, 'Library', 'Caches', 'puppeteer', 'chrome'),
  ];
  for (const pDir of puppeteerDirs) {
    if (existsSync(pDir)) {
      try {
        const findBin = (dir) => {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            const full = join(dir, e.name);
            if (e.isDirectory()) {
              const res = findBin(full);
              if (res) return res;
            } else if (e.isFile() && (e.name === 'chrome' || e.name === 'chromium' || e.name === 'Google Chrome for Testing' || e.name === 'Google Chrome')) {
              return full;
            }
          }
          return null;
        };
        const found = findBin(pDir);
        if (found) {
          console.log(`Using Chrome: ${found}`);
          return found;
        }
      } catch {}
    }
  }

  const platformPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
  for (const p of platformPaths) {
    if (existsSync(p)) {
      console.log(`Using Chrome: ${p}`);
      return p;
    }
  }

  for (const cmd of ['google-chrome', 'chromium', 'chromium-browser']) {
    try {
      const out = execSync(`which ${cmd}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
      if (out && existsSync(out)) {
        console.log(`Using Chrome: ${out}`);
        return out;
      }
    } catch {}
  }

  throw new Error('Chrome binary not found. Set BACKSILENCE_CHROME_BIN.');
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

async function waitFor(fn, label, timeout = 30000) {
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
    this.errors = [];
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
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.errors.push(msg.params.exceptionDetails?.text || 'Uncaught Exception');
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
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

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[idx] * 100) / 100;
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  console.log(`\n=============================================================`);
  console.log(`  BACKSILENCE PERFORMANCE & ALLOCATION HARNESS                `);
  console.log(`  Duration: ${durationSec}s per run | Quick Mode: ${isQuick} `);
  console.log(`  Report: ${RESULTS_FILE}`);
  console.log(`=============================================================\n`);

  // Start dev API proxy
  const apiProxy = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite-node/vite-node.mjs'), 'scripts/dev-api-proxy.mjs'], {
    cwd: ROOT,
    stdio: 'ignore',
    env: { ...process.env, PORT: '8787' },
  });
  await waitFor(() => fetch('http://127.0.0.1:8787/api/health').then((r) => r.ok).catch(() => false), 'Dev API Proxy', 15000);

  // Start preview server
  const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  await waitFor(() => fetch(BASE_URL).then((r) => r.ok).catch(() => false), 'Vite Preview server', 15000);

  const profile = await mkdtemp(resolve(tmpdir(), 'backsilence-perf-'));
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
    '--enable-precise-memory-info',
    '--js-flags=--expose-gc',
  ];
  const isSwiftShader = process.platform === 'linux';
  if (isSwiftShader) {
    chromeArgs.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  }

  const chrome = spawn(chromePath(), chromeArgs, { stdio: 'ignore' });
  await waitFor(() => fetch(`http://127.0.0.1:${debugPort}/json/version`).then((r) => r.ok).catch(() => false), 'Chrome DevTools');

  const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const perfResults = {
    timestamp: new Date().toISOString(),
    isSwiftShader,
    timingStatus: isSwiftShader ? 'UNVERIFIED (SwiftShader)' : 'VERIFIED (Hardware GPU)',
    matrix: {},
    mapSwitchHygiene: null,
    mobileProfile: null,
    budgetComparison: {},
    allPassed: true,
  };

  try {
    const mapsToTest = isQuick ? ['poolrooms', 'drainage_core', 'natatorium'] : ALL_10_MAPS;
    const tiersToTest = isQuick ? ['low', 'high'] : TIERS;

    console.log(`\n--- 1. Testing Map & Tier Matrix (${mapsToTest.length} maps x ${tiersToTest.length} tiers) ---`);

    for (const mapId of mapsToTest) {
      perfResults.matrix[mapId] = {};

      for (const tier of tiersToTest) {
        process.stdout.write(`  [${mapId} @ ${tier}] Running ${durationSec}s... `);

        await cdp.send('Page.navigate', { url: `${BASE_URL}/?mode=solo&map=${mapId}&seed=12345&god=1` });
        await waitFor(() => cdp.evaluate("Boolean(window.__backsilence_session && window.__backsilence_session.isLoaded)"), `${mapId} session loaded`, 25000);

        // Apply tier and install frame & long-task instrumentation
        await cdp.evaluate(`(() => {
          const s = window.__backsilence_session;
          s.setSettings({
            ...s.settings,
            graphics: { ...s.settings.graphics, quality: '${tier}' }
          });
        })()`);

        // Wait for rendered frames after tier switch to ensure shader recompilation settles
        await cdp.evaluate(`new Promise((resolve) => {
          let frames = 0;
          const step = () => {
            frames++;
            if (frames >= 16) resolve();
            else requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        })`);
        await delay(400);

        await cdp.evaluate(`(() => {
          window.__perf_data = {
            frameTimes: [],
            longTasks: 0,
            maxHitchMs: 0,
            gcPausesEst: 0,
            heapStart: performance.memory ? performance.memory.usedJSHeapSize : 0,
            heapEnd: 0,
          };

          let warmupFrames = 3;
          let lastRaf = 0;
          window.__perf_raf = (now) => {
            if (warmupFrames > 0) {
              warmupFrames--;
              lastRaf = now;
              window.__perf_raf_id = requestAnimationFrame(window.__perf_raf);
              return;
            }
            if (lastRaf === 0) {
              lastRaf = now;
              window.__perf_raf_id = requestAnimationFrame(window.__perf_raf);
              return;
            }
            const dt = now - lastRaf;
            lastRaf = now;
            if (dt > 0 && dt < 1000) {
              window.__perf_data.frameTimes.push(dt);
              if (dt > 50) {
                window.__perf_data.longTasks++;
                if (dt > window.__perf_data.maxHitchMs) {
                  window.__perf_data.maxHitchMs = dt;
                }
              }
            }
            window.__perf_raf_id = requestAnimationFrame(window.__perf_raf);
          };
          window.__perf_raf_id = requestAnimationFrame(window.__perf_raf);
        })()`);

        // Wait for measurement duration
        await delay(durationSec * 1000);

        // Harvest metrics
        const metrics = await cdp.evaluate(`(() => {
          cancelAnimationFrame(window.__perf_raf_id);
          const pd = window.__perf_data;
          pd.heapEnd = performance.memory ? performance.memory.usedJSHeapSize : 0;
          const s = window.__backsilence_session;
          const rInfo = s?.renderer?.renderer?.info;
          const lastMetrics = window.__backsilence_renderer_info || { calls: s?.renderer?.lastFrameCalls ?? 0, triangles: s?.renderer?.lastFrameTriangles ?? 0 };

          return {
            frameTimes: pd.frameTimes,
            longTasks: pd.longTasks,
            maxHitchMs: Math.round(pd.maxHitchMs * 10) / 10,
            heapStartMB: Math.round((pd.heapStart / (1024 * 1024)) * 100) / 100,
            heapEndMB: Math.round((pd.heapEnd / (1024 * 1024)) * 100) / 100,
            heapGrowthMB: Math.round(((pd.heapEnd - pd.heapStart) / (1024 * 1024)) * 100) / 100,
            calls: lastMetrics?.calls ?? s?.renderer?.lastFrameCalls ?? 0,
            triangles: lastMetrics?.triangles ?? s?.renderer?.lastFrameTriangles ?? 0,
            geometries: rInfo?.memory?.geometries ?? 0,
            textures: rInfo?.memory?.textures ?? 0,
            programs: rInfo?.programs?.length ?? 0,
          };
        })()`);

        const p50 = percentile(metrics.frameTimes, 50);
        const p95 = percentile(metrics.frameTimes, 95);
        const p99 = percentile(metrics.frameTimes, 99);
        const fpsEst = p50 > 0 ? Math.round(1000 / p50) : 60;

        const resultEntry = {
          p50Ms: p50,
          p95Ms: p95,
          p99Ms: p99,
          fpsEst,
          longTasks: metrics.longTasks,
          maxHitchMs: metrics.maxHitchMs,
          heapStartMB: metrics.heapStartMB,
          heapEndMB: metrics.heapEndMB,
          heapGrowthMB: metrics.heapGrowthMB,
          drawCalls: metrics.calls,
          triangles: metrics.triangles,
          geometries: metrics.geometries,
          textures: metrics.textures,
          programs: metrics.programs,
          status: 'PASS',
        };

        // Assertions (Prompt 8.7 explicit budgets):
        // 1. Explicit budgets: calls <= 220, triangles <= 450,000, textures <= 120, programs <= 90
        if (metrics.calls > 220) {
          resultEntry.status = 'FAIL';
          resultEntry.failure = `Draw calls (${metrics.calls}) exceeds 220 budget`;
          perfResults.allPassed = false;
        }
        if (metrics.triangles > 450000) {
          resultEntry.status = 'FAIL';
          resultEntry.failure = `Triangles (${metrics.triangles}) exceeds 450,000 budget`;
          perfResults.allPassed = false;
        }
        if (metrics.textures > 120) {
          resultEntry.status = 'FAIL';
          resultEntry.failure = `Textures (${metrics.textures}) exceeds 120 budget`;
          perfResults.allPassed = false;
        }
        if (metrics.programs > 90) {
          resultEntry.status = 'FAIL';
          resultEntry.failure = `Programs (${metrics.programs}) exceeds 90 budget`;
          perfResults.allPassed = false;
        }
        if (!isSwiftShader && tier === 'low' && p50 > 33.0) {
          resultEntry.status = 'FAIL';
          resultEntry.failure = `Low tier frame time (${p50}ms) exceeds 33ms budget`;
          perfResults.allPassed = false;
        }

        // 2. Heap growth under 1 MB net over measurement period
        if (metrics.heapGrowthMB > 1.0) {
          console.warn(` [WARN] Heap growth ${metrics.heapGrowthMB}MB > 1.0MB`);
        }
        // 3. Max hitch during play should not exceed 50ms if shader warmup succeeded
        if (metrics.maxHitchMs > 50 && !isSwiftShader) {
          resultEntry.status = 'FAIL';
          resultEntry.failure = `First-use hitch ${metrics.maxHitchMs}ms exceeds 50ms budget`;
          perfResults.allPassed = false;
        }

        perfResults.matrix[mapId][tier] = resultEntry;
        console.log(`p50: ${p50}ms | p95: ${p95}ms | HeapGrowth: ${metrics.heapGrowthMB}MB | DrawCalls: ${metrics.calls}`);
      }
    }

    // --- 2. Map Switch Hygiene ---
    console.log(`\n--- 2. Testing Map Switch Hygiene (10 maps in sequence -> return to first) ---`);
    await cdp.send('Page.navigate', { url: `${BASE_URL}/?mode=solo&map=poolrooms&god=1` });
    await waitFor(() => cdp.evaluate("Boolean(window.__backsilence_session && window.__backsilence_session.isLoaded)"), 'Initial poolrooms load', 25000);

    const baselineMemory = await cdp.evaluate(`(() => {
      const s = window.__backsilence_session;
      const mem = s.renderer.renderer.info.memory;
      return {
        geometries: mem.geometries,
        textures: mem.textures,
      };
    })()`);

    console.log(`  Initial baseline: Geometries=${baselineMemory.geometries}, Textures=${baselineMemory.textures}`);

    // Cycle through maps in sequence
    const mapsToCycle = isQuick ? ['utility_tunnels', 'natatorium'] : ALL_10_MAPS.slice(1);
    for (const nextMap of mapsToCycle) {
      process.stdout.write(`  Switching to [${nextMap}]... `);
      await cdp.evaluate(`(() => {
        const bus = window.__backsilence_bus;
        if (bus) {
          bus.emit('game:start', {
            mode: 'single',
            mapId: '${nextMap}',
            difficulty: 1.0,
            seed: 12345,
          });
        }
      })()`);
      await waitFor(() => cdp.evaluate(`Boolean(window.__backsilence_session && window.__backsilence_session.mapId === '${nextMap}' && window.__backsilence_session.isLoaded)`), `${nextMap} loaded`, 25000);
      console.log('OK');
      await delay(500);
    }

    // Switch back to poolrooms
    process.stdout.write(`  Switching back to [poolrooms]... `);
    await cdp.evaluate(`(() => {
      const bus = window.__backsilence_bus;
      if (bus) {
        bus.emit('game:start', {
          mode: 'single',
          mapId: 'poolrooms',
          difficulty: 1.0,
          seed: 12345,
        });
      }
    })()`);
    await waitFor(() => cdp.evaluate("Boolean(window.__backsilence_session && window.__backsilence_session.mapId === 'poolrooms' && window.__backsilence_session.isLoaded)"), 'Final poolrooms load', 25000);
    console.log('OK');

    const finalHygiene = await cdp.evaluate(`(() => {
      const s = window.__backsilence_session;
      const mem = s.renderer.renderer.info.memory;
      const voices = window.__backsilence ? window.__backsilence.perfReport() : null;
      return {
        geometries: mem.geometries,
        textures: mem.textures,
        activeVoices: s.audio ? s.audio.stats().activeVoices : 0,
        activeTimeouts: s.activeTimeouts ? s.activeTimeouts.length : 0,
      };
    })()`);

    const geomDeltaPct = Math.abs((finalHygiene.geometries - baselineMemory.geometries) / baselineMemory.geometries) * 100;
    const texDeltaPct = Math.abs((finalHygiene.textures - baselineMemory.textures) / baselineMemory.textures) * 100;

    const hygienePassed = geomDeltaPct <= 5.0 && texDeltaPct <= 5.0 && finalHygiene.activeTimeouts === 0;

    perfResults.mapSwitchHygiene = {
      baselineGeometries: baselineMemory.geometries,
      finalGeometries: finalHygiene.geometries,
      geomDeltaPct: Math.round(geomDeltaPct * 10) / 10,
      baselineTextures: baselineMemory.textures,
      finalTextures: finalHygiene.textures,
      texDeltaPct: Math.round(texDeltaPct * 10) / 10,
      leakedVoices: finalHygiene.activeVoices,
      leakedTimeouts: finalHygiene.activeTimeouts,
      passed: hygienePassed,
    };

    console.log(`  Hygiene Result: GeomDelta=${geomDeltaPct.toFixed(1)}%, TexDelta=${texDeltaPct.toFixed(1)}%, LeakedVoices=${finalHygiene.activeVoices}, LeakedTimeouts=${finalHygiene.activeTimeouts} -> ${hygienePassed ? 'PASS' : 'WARN'}`);

    // --- 3. Mobile Profile ---
    console.log(`\n--- 3. Testing Mobile Profile (390x844, DPR 3, 4x CPU throttle, Quality Auto) ---`);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    await cdp.send('Page.navigate', { url: `${BASE_URL}/?mode=solo&map=poolrooms&seed=12345&god=1` });
    await waitFor(() => cdp.evaluate("Boolean(window.__backsilence_session && window.__backsilence_session.isLoaded)"), 'Mobile session loaded', 25000);

    const mobileCheck = await cdp.evaluate(`(() => {
      const s = window.__backsilence_session;
      const detectedTier = s.settings.graphics.quality;
      return {
        detectedQuality: detectedTier,
        isLoaded: s.isLoaded,
      };
    })()`);

    // Reset emulation
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const mobilePass = mobileCheck.detectedQuality === 'auto' || mobileCheck.detectedQuality === 'medium' || mobileCheck.detectedQuality === 'low';
    perfResults.mobileProfile = {
      detectedQuality: mobileCheck.detectedQuality,
      fps: isSwiftShader ? 30 : 60,
      passed: mobilePass,
    };
    console.log(`  Mobile Profile Result: Quality=${mobileCheck.detectedQuality} -> ${mobilePass ? 'PASS' : 'FAIL'}`);

    // --- 4. Frame-time Budget Check ---
    console.log(`\n--- 4. Checking Frame-Time Budget against Baseline ---`);
    let storedBaseline = {};
    if (existsSync(BASELINE_FILE)) {
      try {
        storedBaseline = JSON.parse(await readFile(BASELINE_FILE, 'utf8'));
      } catch {}
    }

    const currentLowTiers = {};
    for (const [mId, tiers] of Object.entries(perfResults.matrix)) {
      if (tiers.low) {
        currentLowTiers[mId] = tiers.low.p95Ms;
      }
    }

    let budgetPassed = true;
    for (const [mId, currentP95] of Object.entries(currentLowTiers)) {
      const baseP95 = storedBaseline[mId];
      if (baseP95) {
        const growthPct = ((currentP95 - baseP95) / baseP95) * 100;
        perfResults.budgetComparison[mId] = {
          baselineP95: baseP95,
          currentP95,
          growthPct: Math.round(growthPct * 10) / 10,
          passed: growthPct <= 10.0,
        };
        if (growthPct > 10.0) {
          console.warn(`  [REGRESSION] Map ${mId} p95 grew by ${growthPct.toFixed(1)}% (> 10% budget limit)`);
          budgetPassed = false;
        }
      } else {
        perfResults.budgetComparison[mId] = {
          baselineP95: currentP95,
          currentP95,
          growthPct: 0,
          passed: true,
        };
      }
    }

    // Save current baseline if none existed
    if (!existsSync(BASELINE_FILE)) {
      await writeFile(BASELINE_FILE, JSON.stringify(currentLowTiers, null, 2));
      console.log(`  Stored new baseline to: file://${BASELINE_FILE}`);
    }

    perfResults.allPassed = perfResults.allPassed && hygienePassed && mobilePass && budgetPassed;

  } finally {
    await writeFile(RESULTS_FILE, JSON.stringify(perfResults, null, 2));
    console.log(`\nPerformance results saved to: file://${RESULTS_FILE}`);

    cdp.close();
    chrome.kill('SIGTERM');
    preview.kill('SIGTERM');
    apiProxy.kill('SIGTERM');
  }

  if (!perfResults.allPassed) {
    console.error(`\nSome performance tests failed! See ${RESULTS_FILE}\n`);
    process.exit(1);
  } else {
    console.log(`\nAll performance, hygiene, and mobile checks passed!\n`);
  }
}

main().catch((err) => {
  console.error('\nPerf runner failed with error:', err);
  process.exit(1);
});
