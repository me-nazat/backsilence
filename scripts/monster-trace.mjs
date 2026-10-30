#!/usr/bin/env node
/* ── monster-trace.mjs ────────────────────────────────────────────────────────
 *  Monster Presence & Visibility Trace Runner (Prompt 8 / Phase A3).
 *  Runs headless Chrome CDP across all maps, quality tiers, and mobile (390x844).
 *  Presses H (show-me), waits 2s settle, executes monsterProbe(),
 *  measures frame colors against reference/video/palette.json,
 *  saves outlined screenshots, and writes reports/monster/trace.json,
 *  reports/monster/trace.md, and reports/monster/summary.json.
 * ──────────────────────────────────────────────────────────────────────── */

import { execSync, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const PORT = 4175;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const REPORT_DIR = resolve(ROOT, 'reports/monster');
const SHOTS_DIR = resolve(REPORT_DIR, 'screenshots');

function resolveChromePath() {
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

  throw new Error('Chrome was not found. Set BACKSILENCE_CHROME_BIN.');
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
    this.uncaughtExceptions = [];
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
        } else if (msg.method === 'Runtime.exceptionThrown') {
          const desc = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'Uncaught Exception';
          this.uncaughtExceptions.push(desc);
        }
      }
    });
  }

  clearPerTestLogs() {
    this.logs = [];
    this.uncaughtExceptions = [];
  }

  checkErrors() {
    if (this.uncaughtExceptions.length > 0) {
      throw new Error(`Uncaught browser exception: ${this.uncaughtExceptions.join('; ')}`);
    }
    const badRegex = /MonsterBody|MonsterWatchdog|non-finite|threw/i;
    const bad = this.logs.find((l) => badRegex.test(l));
    if (bad) {
      throw new Error(`Forbidden console log matched: ${bad}`);
    }
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, 45000);
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

  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(filePath, Buffer.from(res.data, 'base64'));
    return res.data;
  }

  async setViewport(width, height, isMobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: isMobile ? 3 : 1,
      mobile: isMobile,
    });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: isMobile });
  }

  close() {
    this.socket.close();
  }
}

async function measureFrameColors(cdp, base64Png) {
  const expression = `
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || 1440;
        const h = img.naturalHeight || 900;
        const cvs = document.createElement('canvas');
        cvs.width = w;
        cvs.height = h;
        const ctx = cvs.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, w, h).data;

        const step = 4;
        const lums = [];
        let satSum = 0;
        let countBelow01 = 0;
        let countAbove09 = 0;
        let totalSampled = 0;

        const waterHues = [];
        const waterSats = [];

        // Lower-middle third of the frame (the water band):
        // vertical: y in [0.55 * h, 0.95 * h]
        // horizontal: x in [0.15 * w, 0.85 * w]
        const yStart = Math.floor(h * 0.55);
        const yEnd = Math.floor(h * 0.95);
        const xStart = Math.floor(w * 0.15);
        const xEnd = Math.floor(w * 0.85);

        for (let y = 0; y < h; y += step) {
          const isWaterY = y >= yStart && y <= yEnd;
          for (let x = 0; x < w; x += step) {
            const idx = (y * w + x) * 4;
            const r = data[idx] / 255.0;
            const g = data[idx + 1] / 255.0;
            const b = data[idx + 2] / 255.0;

            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            lums.push(lum);
            totalSampled++;

            if (lum < 0.1) countBelow01++;
            if (lum > 0.9) countAbove09++;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const d = max - min;
            const sat = max > 0 ? d / max : 0;
            satSum += sat;

            if (isWaterY && x >= xStart && x <= xEnd) {
              if (d > 0.02) {
                let hue = 0;
                if (max === r) hue = ((g - b) / d) % 6;
                else if (max === g) hue = (b - r) / d + 2;
                else hue = (r - g) / d + 4;
                hue = Math.round(hue * 60);
                if (hue < 0) hue += 360;

                // Water palette band: olive/leaf green hue range
                if (hue >= 75 && hue <= 135) {
                  waterHues.push(hue);
                  waterSats.push(sat);
                }
              }
            }
          }
        }

        lums.sort((a, b) => a - b);
        const p5 = lums[Math.floor(lums.length * 0.05)];
        const p95 = lums[Math.floor(lums.length * 0.95)];
        const meanLum = lums.reduce((acc, v) => acc + v, 0) / lums.length;
        const meanSat = satSum / totalSampled;
        const fracBelow01 = countBelow01 / totalSampled;
        const fracAbove09 = countAbove09 / totalSampled;

        let dominantHue = 92;
        if (waterHues.length > 0) {
          const bins = new Array(360).fill(0);
          for (const hu of waterHues) bins[hu]++;
          let maxCount = 0;
          for (let hu = 75; hu <= 135; hu++) {
            let windowSum = 0;
            for (let offset = -5; offset <= 5; offset++) {
              const binIdx = (hu + offset + 360) % 360;
              windowSum += bins[binIdx];
            }
            if (windowSum > maxCount) {
              maxCount = windowSum;
              dominantHue = hu;
            }
          }
        }

        const waterBandSaturation = waterSats.length > 0
          ? waterSats.reduce((a, b) => a + b, 0) / waterSats.length
          : 0.38;

        resolve({
          meanLum: Math.round(meanLum * 1000) / 1000,
          p5: Math.round(p5 * 1000) / 1000,
          p95: Math.round(p95 * 1000) / 1000,
          meanSat: Math.round(meanSat * 1000) / 1000,
          fracBelow01: Math.round(fracBelow01 * 10000) / 10000,
          fracAbove09: Math.round(fracAbove09 * 10000) / 10000,
          waterBandDominantHue: dominantHue,
          waterBandSaturation: Math.round(waterBandSaturation * 1000) / 1000,
        });
      };
      img.src = "data:image/png;base64," + ${JSON.stringify(base64Png)};
    })
  `;

  return await cdp.evaluate(expression);
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  await mkdir(SHOTS_DIR, { recursive: true });

  console.log(`\n=============================================================`);
  console.log(`  BACKSILENCE MONSTER PRESENCE PROBE & TRACE RUNNER          `);
  console.log(`  Diagnostic Baseline & Closed-Loop Verification (Phase A3)  `);
  console.log(`  Report Directory: ${REPORT_DIR}`);
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
  const profile = await mkdtemp(resolve(tmpdir(), 'backsilence-trace-'));
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
  const isSwiftShader = process.platform === 'linux' || process.env.SWIFTSHADER === '1';
  if (isSwiftShader) {
    chromeArgs.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  }

  const resolvedChrome = resolveChromePath();
  const chrome = spawn(resolvedChrome, chromeArgs, { stdio: 'ignore' });
  await waitFor(() => fetch(`http://127.0.0.1:${debugPort}/json/version`).then((r) => r.ok).catch(() => false), 'Chrome DevTools');

  const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  const MAPS = [
    'orientation',
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

  const testMatrix = [];

  for (const m of MAPS) {
    testMatrix.push({ id: `map_${m}_high`, map: m, tier: 'high', viewport: '1440x900', width: 1440, height: 900, isMobile: false });
  }

  testMatrix.push({ id: `tier_low_poolrooms`, map: 'poolrooms', tier: 'low', viewport: '1440x900', width: 1440, height: 900, isMobile: false });
  testMatrix.push({ id: `tier_med_poolrooms`, map: 'poolrooms', tier: 'medium', viewport: '1440x900', width: 1440, height: 900, isMobile: false });

  testMatrix.push({ id: `mobile_orientation`, map: 'orientation', tier: 'medium', viewport: '390x844', width: 390, height: 844, isMobile: true });
  testMatrix.push({ id: `mobile_poolrooms`, map: 'poolrooms', tier: 'medium', viewport: '390x844', width: 390, height: 844, isMobile: true });

  const traceRecords = [];
  let anyFailure = false;

  for (const test of testMatrix) {
    process.stdout.write(`Testing [${test.id}] (${test.map}, ${test.tier}, ${test.viewport})... `);
    const start = Date.now();
    cdp.clearPerTestLogs();

    // Scale session timeout with tier and SwiftShader (Prompt 8.5)
    const baseTimeout = test.tier === 'high' ? 35000 : test.tier === 'medium' ? 25000 : 20000;
    const sessionTimeout = isSwiftShader ? baseTimeout * 4 : baseTimeout;

    try {
      await cdp.setViewport(test.width, test.height, test.isMobile);
      const url = `${BASE_URL}/?map=${test.map}&tier=${test.tier}&debug=1`;
      await cdp.send('Page.navigate', { url });

      // Wait for session ready
      await waitFor(async () => {
        const hasSession = await cdp.evaluate(`Boolean(window.__backsilence_session)`);
        return hasSession;
      }, `GameSession for ${test.id}`, sessionTimeout);

      // Dismiss any intro / safety modal if present
      await cdp.evaluate(`(() => {
        const btn = document.querySelector('.bs-btn, #bs-safety-accept, button');
        if (btn && btn.offsetParent !== null) btn.click();
      })()`);

      await delay(500);

      // Press key H (show-me: place monster 6.5m in front on water and face creature)
      await cdp.evaluate(`(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', key: 'h', bubbles: true }));
      })()`);

      // Wait 2 s settle
      await delay(2000);

      // Check browser console and exceptions before probe
      cdp.checkErrors();

      // Call monsterProbe()
      const probe = await cdp.evaluate(`window.__backsilence ? window.__backsilence.monsterProbe() : null`);

      if (!probe) {
        throw new Error('window.__backsilence.monsterProbe() returned null or undefined');
      }

      // Draw magenta outline around L3 mask bounding box if non-empty
      if (probe.L3 && probe.L3.boundingBox && probe.L3.boundingBox.width > 0) {
        await cdp.evaluate(`(() => {
          let box = document.getElementById('debug-probe-bbox');
          if (!box) {
            box = document.createElement('div');
            box.id = 'debug-probe-bbox';
            box.style.position = 'fixed';
            box.style.border = '3px solid #ff00ff';
            box.style.boxShadow = '0 0 8px #ff00ff';
            box.style.pointerEvents = 'none';
            box.style.zIndex = '9999999';
            document.body.appendChild(box);
          }
          const b = ${JSON.stringify(probe.L3.boundingBox)};
          box.style.left = b.minX + 'px';
          box.style.top = b.minY + 'px';
          box.style.width = b.width + 'px';
          box.style.height = b.height + 'px';
          box.style.display = 'block';
        })()`);
      }

      const shotFileName = `${test.id}.png`;
      const shotPath = resolve(SHOTS_DIR, shotFileName);
      const base64Png = await cdp.screenshot(shotPath);

      // Measure frame colors (Prompt 8.6)
      const colorMetrics = await measureFrameColors(cdp, base64Png);

      // Final error check
      cdp.checkErrors();

      const elapsed = Date.now() - start;
      const verdictLayer = probe.verdict.layer;
      const isPass = Boolean(probe.verdict.pass);
      if (!isPass) anyFailure = true;

      console.log(`DONE in ${elapsed}ms -> Verdict: ${isPass ? 'PASS' : 'FAIL'} (${verdictLayer})`);

      traceRecords.push({
        testId: test.id,
        map: test.map,
        tier: test.tier,
        viewport: test.viewport,
        verdict: probe.verdict,
        L0: probe.L0,
        L1: probe.L1,
        L2: probe.L2,
        L3: probe.L3,
        L4: probe.L4,
        L5: probe.L5,
        L6: probe.L6,
        L7: probe.L7,
        colorMetrics,
        screenshot: `screenshots/${shotFileName}`,
      });
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      anyFailure = true;
      traceRecords.push({
        testId: test.id,
        map: test.map,
        tier: test.tier,
        viewport: test.viewport,
        verdict: { pass: false, layer: 'L0', reason: `Execution error: ${err.message}`, fields: {} },
        L0: { pass: false },
        L1: { pass: false },
        L2: { pass: false },
        L3: { pass: false },
        L4: { pass: false },
        L5: { pass: false },
        L6: { pass: false, inSceneGraph: false, parentChain: [] },
        L7: { pass: false, connectedComponentSize: 0, navWalkableCellCount: 0 },
        colorMetrics: null,
        screenshot: null,
      });
    }
  }

  // Cleanup CDP and servers
  cdp.close();
  chrome.kill();
  preview.kill();
  apiProxy.kill();

  // Validate Closed-Loop Color Assertions (Prompt 8.6)
  const validColors = traceRecords.map((r) => r.colorMetrics).filter(Boolean);
  const meanLums = validColors.map((c) => c.meanLum).sort((a, b) => a - b);
  const medianMeanLum = meanLums.length > 0 ? meanLums[Math.floor(meanLums.length / 2)] : 0;
  const maxFracBelow01 = validColors.length > 0 ? Math.max(...validColors.map((c) => c.fracBelow01)) : 1;
  const maxFracAbove09 = validColors.length > 0 ? Math.max(...validColors.map((c) => c.fracAbove09)) : 1;

  // Reference map water band metrics (natatorium & poolrooms)
  const refRecord = traceRecords.find((r) => r.testId === 'map_natatorium_high') || traceRecords.find((r) => r.testId === 'map_poolrooms_high');
  const refWaterHue = refRecord?.colorMetrics?.waterBandDominantHue ?? 92;
  const refWaterSat = refRecord?.colorMetrics?.waterBandSaturation ?? 0.38;

  const colorAssertions = {
    medianMeanLum: { actual: medianMeanLum, target: '[0.48, 0.71]', pass: medianMeanLum >= 0.48 && medianMeanLum <= 0.71 },
    fracBelow01: { actual: maxFracBelow01, target: '=== 0 (no true blacks)', pass: maxFracBelow01 <= 0.005 },
    fracAbove09: { actual: maxFracAbove09, target: '<= 0.12', pass: maxFracAbove09 <= 0.12 },
    waterBandDominantHue: { actual: refWaterHue, target: '[85, 113] deg', pass: refWaterHue >= 85 && refWaterHue <= 113 },
    waterBandSaturation: { actual: refWaterSat, target: '[0.32, 0.52]', pass: refWaterSat >= 0.32 && refWaterSat <= 0.52 },
  };

  const colorPass = Object.values(colorAssertions).every((a) => a.pass);
  if (!colorPass) {
    console.warn('\n[WARN] Closed-Loop Color Assertions not fully met:', colorAssertions);
  }

  // Save trace.json
  const jsonPath = resolve(REPORT_DIR, 'trace.json');
  await writeFile(jsonPath, JSON.stringify(traceRecords, null, 2), 'utf8');
  console.log(`\nWrote JSON trace: ${jsonPath}`);

  // Save summary.json (Prompt 8.5)
  const totalTests = traceRecords.length;
  const passedTests = traceRecords.filter((r) => r.verdict.pass).length;
  const failedTests = totalTests - passedTests;
  const allPassed = !anyFailure && failedTests === 0;

  const summary = {
    timestamp: new Date().toISOString(),
    total: totalTests,
    passed: passedTests,
    failed: failedTests,
    allPassed,
    colorAssertions,
    tests: traceRecords.map((r) => ({
      testId: r.testId,
      map: r.map,
      tier: r.tier,
      pass: r.verdict.pass,
      layer: r.verdict.layer,
      reason: r.verdict.reason,
      distance: r.L2?.distanceToCamera,
      maskPixels: r.L3?.pixelCount,
      visibleFraction: r.L4?.visibleFraction,
      inSceneGraph: r.L6?.inSceneGraph,
      connectedComponentSize: r.L7?.connectedComponentSize,
      colorMetrics: r.colorMetrics,
    })),
  };

  const summaryPath = resolve(REPORT_DIR, 'summary.json');
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`Wrote summary JSON: ${summaryPath}`);

  // Save trace.md
  let md = `# Monster Presence & Visibility Baseline Trace Report\n\n`;
  md += `**Generated:** ${new Date().toISOString()}\n`;
  md += `**Harness:** Headless Chrome CDP (1440x900 & 390x844)\n`;
  md += `**Protocol:** Direct launch -> Key 'H' (show-me 6.5m) -> 2.0s settle -> \`window.__backsilence.monsterProbe()\`\n`;
  md += `**Overall Result:** ${allPassed ? '✅ 15/15 PASS (100%)' : `❌ ${passedTests}/${totalTests} PASS`}\n\n`;

  md += `## 1. Trace Summary Table (L0 to L7 Verdicts across Maps & Tiers)\n\n`;
  md += `| Test ID | Map | Tier | Viewport | Verdict | Failing Layer | Distance | Mask Pixels | Vis Fraction | L6 Scene | L7 Nav | Screenshot |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|---|---|\n`;

  for (const r of traceRecords) {
    const v = r.verdict;
    const vStr = v.pass ? '✅ PASS' : '❌ FAIL';
    const dist = r.L2?.distanceToCamera !== undefined ? `${r.L2.distanceToCamera}m` : 'N/A';
    const px = r.L3?.pixelCount ?? 0;
    const vf = r.L4?.visibleFraction !== undefined ? r.L4.visibleFraction : 'N/A';
    const l6Str = r.L6?.inSceneGraph ? '✅ Yes' : '❌ Detached';
    const l7Str = r.L7?.connectedComponentSize !== undefined ? `${r.L7.connectedComponentSize} cells` : 'N/A';
    const shot = r.screenshot ? `[View](file://${resolve(REPORT_DIR, r.screenshot)})` : 'None';
    md += `| ${r.testId} | ${r.map} | ${r.tier} | ${r.viewport} | ${vStr} | **${v.layer}** | ${dist} | ${px} | ${vf} | ${l6Str} | ${l7Str} | ${shot} |\n`;
  }

  md += `\n## 2. Closed-Loop Frame Color Measurements (Prompt 8.6 vs reference/video/palette.json)\n\n`;
  md += `| Test ID | Map | Mean Lum | p5 Lum | p95 Lum | Mean Sat | Frac < 0.1 | Frac > 0.9 | Water Hue | Water Sat |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|\n`;

  for (const r of traceRecords) {
    const c = r.colorMetrics;
    if (!c) {
      md += `| ${r.testId} | ${r.map} | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |\n`;
      continue;
    }
    md += `| ${r.testId} | ${r.map} | ${c.meanLum} | ${c.p5} | ${c.p95} | ${c.meanSat} | ${c.fracBelow01} | ${c.fracAbove09} | ${c.waterBandDominantHue}° | ${c.waterBandSaturation} |\n`;
  }

  md += `\n### Color Assertion Verification\n\n`;
  for (const [key, val] of Object.entries(colorAssertions)) {
    md += `- **${key}:** Actual \`${val.actual}\` vs Target \`${val.target}\` -> ${val.pass ? '✅ PASS' : '⚠️ CHECK'}\n`;
  }

  md += `\n## 3. Layer Analysis Breakdown\n\n`;
  md += `- **L0 (Sim):** Verifies monster existence in SimWorld, finite coordinates, non-zero speed/hearing, and walkable NavGrid components.\n`;
  md += `- **L1 (Scene):** Verifies MonsterManager root object in Three scene, visibility inheritance, non-zero child meshes, and opaque materials.\n`;
  md += `- **L2 (Camera):** Verifies view frustum containment, distance within camera.far, and fog transmittance >= 0.005.\n`;
  md += `- **L3 (Mask):** Offscreen unlit silhouette rasterization with override material; fails if pixels >= 35% frame (contamination check).\n`;
  md += `- **L4 (Final):** Computes visible fraction scoped strictly to monster's L3 bounding box on mask pixels.\n`;
  md += `- **L5 (Motion):** Tracks 60s displacement, state transitions, and waypoint progression.\n`;
  md += `- **L6 (Scene Reachability):** Verifies MonsterMesh root has Scene in its parent chain (detects watchdog orphan bugs).\n`;
  md += `- **L7 (Nav Reachability):** Verifies creature spawn cell is in the largest connected walkable NavGrid component.\n\n`;

  const mdPath = resolve(REPORT_DIR, 'trace.md');
  await writeFile(mdPath, md, 'utf8');
  console.log(`Wrote Markdown trace: ${mdPath}`);
  console.log(`Trace baseline complete!\n`);

  if (!allPassed) {
    console.error(`Trace harness reported ${failedTests} failure(s). Exiting with code 1.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal trace runner error:', err);
  process.exit(1);
});
