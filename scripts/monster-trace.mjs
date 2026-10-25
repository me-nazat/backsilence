#!/usr/bin/env node
/* ── monster-trace.mjs ────────────────────────────────────────────────────────
 *  Monster Presence & Visibility Trace Runner (Phase A3).
 *  Runs headless Chrome CDP across all maps, quality tiers, and mobile (390x844).
 *  Presses H, waits 2s, executes monsterProbe(), saves outlined screenshot,
 *  and writes reports/monster/trace.json and reports/monster/trace.md.
 * ──────────────────────────────────────────────────────────────────────── */

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
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
    return res.result.value;
  }

  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(filePath, Buffer.from(res.data, 'base64'));
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

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  await mkdir(SHOTS_DIR, { recursive: true });

  console.log(`\n=============================================================`);
  console.log(`  BACKSILENCE MONSTER PRESENCE PROBE & TRACE RUNNER          `);
  console.log(`  Diagnostic Baseline (Phase A3)                             `);
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
  if (process.platform === 'linux') {
    chromeArgs.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  }

  const chrome = spawn(chromePath(), chromeArgs, { stdio: 'ignore' });
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

  // Test matrix:
  // 1. All 11 maps at tier 'high' (1440x900)
  // 2. 3 Quality tiers on default map and poolrooms: 'low', 'medium', 'high'
  // 3. Mobile viewport (390x844) on default map and poolrooms
  const testMatrix = [];

  for (const m of MAPS) {
    testMatrix.push({ id: `map_${m}_high`, map: m, tier: 'high', viewport: '1440x900', width: 1440, height: 900, isMobile: false });
  }

  testMatrix.push({ id: `tier_low_poolrooms`, map: 'poolrooms', tier: 'low', viewport: '1440x900', width: 1440, height: 900, isMobile: false });
  testMatrix.push({ id: `tier_med_poolrooms`, map: 'poolrooms', tier: 'medium', viewport: '1440x900', width: 1440, height: 900, isMobile: false });

  testMatrix.push({ id: `mobile_orientation`, map: 'orientation', tier: 'medium', viewport: '390x844', width: 390, height: 844, isMobile: true });
  testMatrix.push({ id: `mobile_poolrooms`, map: 'poolrooms', tier: 'medium', viewport: '390x844', width: 390, height: 844, isMobile: true });

  const traceRecords = [];

  for (const test of testMatrix) {
    process.stdout.write(`Testing [${test.id}] (${test.map}, ${test.tier}, ${test.viewport})... `);
    const start = Date.now();

    try {
      await cdp.setViewport(test.width, test.height, test.isMobile);
      const url = `${BASE_URL}/?map=${test.map}&tier=${test.tier}&debug=1`;
      await cdp.send('Page.navigate', { url });

      // Wait for session ready
      await waitFor(async () => {
        const hasSession = await cdp.evaluate(`Boolean(window.__backsilence_session)`);
        return hasSession;
      }, `GameSession for ${test.id}`, 20000);

      // Dismiss any intro / safety modal if present
      await cdp.evaluate(`(() => {
        const btn = document.querySelector('.bs-btn, #bs-safety-accept, button');
        if (btn && btn.offsetParent !== null) btn.click();
      })()`);

      await delay(500);

      // Press key H (show-me: place monster 14m in front on water)
      await cdp.evaluate(`(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', key: 'h', bubbles: true }));
      })()`);

      // Wait 2 s
      await delay(2000);

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
      await cdp.screenshot(shotPath);

      const elapsed = Date.now() - start;
      const verdictLayer = probe.verdict.layer;
      console.log(`DONE in ${elapsed}ms -> Verdict: ${probe.verdict.pass ? 'PASS' : 'FAIL'} (${verdictLayer})`);

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
        screenshot: `screenshots/${shotFileName}`,
      });
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
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
        screenshot: null,
      });
    }
  }

  // Cleanup CDP and servers
  cdp.close();
  chrome.kill();
  preview.kill();
  apiProxy.kill();

  // Save trace.json
  const jsonPath = resolve(REPORT_DIR, 'trace.json');
  await writeFile(jsonPath, JSON.stringify(traceRecords, null, 2), 'utf8');
  console.log(`\nWrote JSON trace: ${jsonPath}`);

  // Save trace.md
  let md = `# Monster Presence & Visibility Baseline Trace Report\n\n`;
  md += `**Generated:** ${new Date().toISOString()}\n`;
  md += `**Harness:** Headless Chrome CDP (1440x900 & 390x844)\n`;
  md += `**Protocol:** Direct launch -> Key 'H' (14m show-me) -> 2.0s settle -> \`window.__backsilence.monsterProbe()\`\n\n`;

  md += `## 1. Trace Summary Table (Map by Tier by Layer)\n\n`;
  md += `| Test ID | Map | Tier | Viewport | Verdict | First Failing Layer | Reason | Distance | Mask Pixels | Vis Fraction | Screenshot |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|---|\n`;

  for (const r of traceRecords) {
    const v = r.verdict;
    const vStr = v.pass ? '✅ PASS' : '❌ FAIL';
    const dist = r.L2?.distanceToCamera !== undefined ? `${r.L2.distanceToCamera}m` : 'N/A';
    const px = r.L3?.pixelCount ?? 0;
    const vf = r.L4?.visibleFraction !== undefined ? r.L4.visibleFraction : 'N/A';
    const shot = r.screenshot ? `[View](file://${resolve(REPORT_DIR, r.screenshot)})` : 'None';
    md += `| ${r.testId} | ${r.map} | ${r.tier} | ${r.viewport} | ${vStr} | **${v.layer}** | ${v.reason} | ${dist} | ${px} | ${vf} | ${shot} |\n`;
  }

  md += `\n## 2. Layer Analysis Breakdown\n\n`;
  md += `- **L0 (Sim):** Verifies monster existence in SimWorld, finite coordinates, non-zero speed/hearing, and valid NavGrid components.\n`;
  md += `- **L1 (Scene):** Verifies MonsterManager root object in Three scene, visibility inheritance, non-zero child meshes, and opaque materials.\n`;
  md += `- **L2 (Camera):** Verifies view frustum containment, distance within camera.far, and fog transmittance >= 0.01.\n`;
  md += `- **L3 (Mask):** Renders monster alone with flat unlit override material to count non-zero silhouette pixels.\n`;
  md += `- **L4 (Final):** Computes visible fraction from full frame delta (shown vs hidden) and isolates occluding stage (water, fog, postFX).\n`;
  md += `- **L5 (Motion):** Tracks 60s displacement, state transitions, and waypoint progression.\n\n`;

  const mdPath = resolve(REPORT_DIR, 'trace.md');
  await writeFile(mdPath, md, 'utf8');
  console.log(`Wrote Markdown trace: ${mdPath}`);
  console.log(`Trace baseline complete!\n`);
}

main().catch((err) => {
  console.error('Fatal trace runner error:', err);
  process.exit(1);
});
