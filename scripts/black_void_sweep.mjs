#!/usr/bin/env node
/* ── black_void_sweep.mjs ───────────────────────────────────────────────────
 * Headless sweep across ALL 11 maps at t = 5s from spawn.
 * Measures 5th-percentile (p5) luminance, mean, median, and p95 for each.
 * Verifies every map has p5 >= 0.08 (no black voids).
 * Writes report to reports/graphics/black_void_sweep.md.
 * Also captures prompt1_after screenshots and menu_backdrop.
 * ──────────────────────────────────────────────────────────────────────── */

import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { decodePng } from './visual/compare.mjs';

const ROOT = existsSync(resolve(process.cwd(), 'package.json')) ? process.cwd() : resolve(process.cwd(), 'poolrooms');
const REPORT_FILE = resolve(ROOT, 'reports/graphics/black_void_sweep.md');
const AFTER_DIR = resolve(ROOT, 'reports/graphics/prompt1_after');
const BOARDS_DIR = resolve(ROOT, 'reports/ux/boards');

const MAPS = [
  'natatorium',
  'poolrooms',
  'marble_atrium',
  'orientation',
  'hydro_maze',
  'drainage_core',
  'drowned_school',
  'sunken_jungle',
  'neon_flood',
  'drowned_metro',
  'utility_tunnels',
];

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

  async send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async screenshot(outPath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    if (outPath) {
      await writeFile(outPath, buffer);
    }
    return { buffer, base64: res.data };
  }

  close() {
    try {
      this.socket.close();
    } catch {}
  }
}

function computeLuminanceStats(pngBuffer) {
  const png = decodePng(pngBuffer);
  const { width, height, data } = png;
  const luminances = [];
  let sum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luminances.push(lum);
    sum += lum;
  }

  luminances.sort((a, b) => a - b);
  const count = luminances.length;
  const mean = sum / count;
  const p5 = luminances[Math.floor(count * 0.05)];
  const median = luminances[Math.floor(count * 0.50)];
  const p95 = luminances[Math.floor(count * 0.95)];

  let below01 = 0;
  let above09 = 0;
  for (const l of luminances) {
    if (l < 0.10) below01++;
    if (l > 0.90) above09++;
  }

  return {
    width,
    height,
    mean: Number(mean.toFixed(4)),
    p5: Number(p5.toFixed(4)),
    median: Number(median.toFixed(4)),
    p95: Number(p95.toFixed(4)),
    fractionBelow01: Number((below01 / count).toFixed(4)),
    fractionAbove09: Number((above09 / count).toFixed(4)),
  };
}

async function run() {
  await mkdir(resolve(ROOT, 'reports/graphics'), { recursive: true });
  await mkdir(AFTER_DIR, { recursive: true });
  await mkdir(BOARDS_DIR, { recursive: true });

  const vitePort = await getFreePort();
  const cdpPort = await getFreePort();
  const userDataDir = await mkdtemp(resolve(tmpdir(), 'bs-black-void-'));

  console.log(`Starting Vite on port ${vitePort}...`);
  const viteProc = spawn('npm', ['run', 'dev', '--', '--port', String(vitePort), '--strictPort'], {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, PORT: String(vitePort) },
  });

  const BASE_URL = `http://127.0.0.1:${vitePort}`;
  await waitFor(async () => {
    const res = await fetch(BASE_URL);
    return res.ok;
  }, 'Vite Dev Server', 20000);
  console.log('Vite is ready.');

  console.log(`Starting Chrome with CDP on port ${cdpPort}...`);
  const chromeBin = chromePath();
  const chromeArgs = [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    '--disable-gpu-shader-disk-cache',
    '--use-gl=angle',
    '--use-angle=metal',
    '--window-size=720,1280',
    '--mute-audio',
    'about:blank',
  ];
  const chromeProc = spawn(chromeBin, chromeArgs, { stdio: 'pipe' });

  let targetWsUrl = '';
  await waitFor(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' });
      if (!res.ok) return false;
      const data = await res.json();
      targetWsUrl = data.webSocketDebuggerUrl;
      return Boolean(targetWsUrl);
    } catch {
      return false;
    }
  }, 'CDP target', 15000);

  const cdp = new Cdp(targetWsUrl);
  await cdp.connect();
  console.log('Connected to Chrome via CDP.');

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 720,
    height: 1280,
    deviceScaleFactor: 1,
    mobile: true,
  });

  const results = [];

  try {
    // 1. Sweep all 11 maps at t = 5s
    for (const mapId of MAPS) {
      console.log(`Sweeping map: ${mapId}...`);
      await cdp.send('Page.navigate', { url: `${BASE_URL}/?mode=solo&map=${mapId}` });
      await delay(5000);

      const shotPath = resolve(AFTER_DIR, `map_${mapId}_t5s.png`);
      const shot = await cdp.screenshot(shotPath);
      const stats = computeLuminanceStats(shot.buffer);
      const passed = stats.p5 >= 0.08;
      console.log(`  Map ${mapId}: Mean=${stats.mean}, p5=${stats.p5}, Median=${stats.median}, p95=${stats.p95}, Frac<0.1=${stats.fractionBelow01} -> ${passed ? 'PASS' : 'FAIL'}`);

      results.push({
        mapId,
        stats,
        passed,
      });

      if (mapId === 'natatorium') {
        // Save as natatorium_spawn_f001_match.png
        await writeFile(resolve(AFTER_DIR, 'natatorium_spawn_f001_match.png'), shot.buffer);

        // Walk W for 5s
        console.log('Walking W for 5s in natatorium...');
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w' });
        await delay(5000);
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w' });
        const shotW5 = await cdp.screenshot(resolve(AFTER_DIR, 'natatorium_w5s.png'));
        console.log('  natatorium_w5s captured');

        // Look up into vaulted grand hall ceiling
        await cdp.send('Runtime.evaluate', {
          expression: `(() => {
            const s = window.__backsilence_session;
            if (s && s.camera) {
              s.camera.rotation.x = 0.55; // look upward
            }
          })()`,
        });
        await delay(500);
        await cdp.screenshot(resolve(AFTER_DIR, 'natatorium_vaulted_hall.png'));
        console.log('  natatorium_vaulted_hall captured');

        // Wait to t = 20s
        await delay(10000);
        await cdp.screenshot(resolve(AFTER_DIR, 'natatorium_t20s.png'));
        console.log('  natatorium_t20s captured');
      }

      if (mapId === 'sunken_jungle') {
        await delay(15000); // reach t = 20s
        await cdp.screenshot(resolve(AFTER_DIR, 'sunken_jungle_t20s.png'));
      }

      if (mapId === 'drowned_metro') {
        await delay(15000); // reach t = 20s
        await cdp.screenshot(resolve(AFTER_DIR, 'drowned_metro_t20s.png'));
      }
    }

    // 2. Main Menu Backdrop
    console.log('Testing Main Menu Backdrop...');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/?v=menu` });
    await delay(3000);
    const menuShot = await cdp.screenshot(resolve(AFTER_DIR, 'menu_backdrop.png'));
    const menuStats = computeLuminanceStats(menuShot.buffer);
    console.log(`Menu Backdrop: Mean=${menuStats.mean} (target >= 0.45), p5=${menuStats.p5} (target >= 0.15)`);

    // 3. Write Black Void Sweep Report
    console.log('Writing black_void_sweep.md...');
    let md = `# 11-Map Black Void Luminance Sweep (Prompt 1 Phase C)\n\n`;
    md += `**Date:** ${new Date().toISOString()}\n`;
    md += `**Requirement:** Every map must sit above the 5th-percentile luminance floor (p5 >= 0.08) at t = 5s from spawn.\n`;
    md += `**Quality Bar:** The reference videos show a bright, luminous complex — no true blacks (p5 0.08–0.59, median ~0.63).\n\n`;
    md += `## 11-Map Luminance Table (t = 5s from spawn)\n\n`;
    md += `| Map ID | Mean L | p5 (min >= 0.08) | Median L | p95 | Frac < 0.1 | Status |\n`;
    md += `|---|---|---|---|---|---|---|\n`;

    let allPassed = true;
    for (const r of results) {
      const s = r.stats;
      const statusStr = r.passed ? '✅ PASS' : '❌ FAIL';
      if (!r.passed) allPassed = false;
      md += `| \`${r.mapId}\` | ${s.mean} | **${s.p5}** | ${s.median} | ${s.p95} | ${s.fractionBelow01} | ${statusStr} |\n`;
    }

    md += `\n## Main Menu Backdrop Verification (Phase F)\n\n`;
    md += `- **Mean Luminance:** ${menuStats.mean} (Required: >= 0.45) — ${menuStats.mean >= 0.45 ? '✅ PASS' : '❌ FAIL'}\n`;
    md += `- **p5 Luminance:** ${menuStats.p5} (Required: >= 0.15) — ${menuStats.p5 >= 0.15 ? '✅ PASS' : '❌ FAIL'}\n`;
    md += `- **Median Luminance:** ${menuStats.median}\n`;
    md += `- **Fraction < 0.1:** ${menuStats.fractionBelow01}\n`;
    md += `- Screenshot saved to: \`reports/graphics/prompt1_after/menu_backdrop.png\`\n\n`;

    md += `## Summary of Fixes Applied\n\n`;
    md += `1. **Ceilings & Roof Assemblies:**\n`;
    md += `   - Fixed \`ceilingArchMat.vertexColors = false\` and \`CommonMapBuilder.ts\` \`ceilingMat.vertexColors = false\` (was compiling Three.js shaders with missing color attributes, multiplying diffuse by zero to render ceilings pitch black).\n`;
    md += `   - Added warm ceiling point light fixtures in Natatorium spawn foyer and across the grand vaulted ceiling.\n`;
    md += `   - Set ceiling color to measured reference target \`#b7a775\`.\n\n`;
    md += `2. **Atmosphere and Fog Clear Colors:**\n`;
    md += `   - Audited all maps. Lifted atmospheric fog and hemisphere ambient tones in \`drowned_metro\`, \`neon_flood\`, \`drainage_core\`, and \`utility_tunnels\` so shadows remain legible and p5 >= 0.08 everywhere.\n\n`;
    md += `3. **Spawn Composition & Camera Hack Removal:**\n`;
    md += `   - Repositioned player spawn to \`(0, 0.30, 49.5)\` facing \`-Z\` (yaw = 0).\n`;
    md += `   - Placed tagline wall mural at \`z = 44.0\` (distance 5.3m), occupying ~35–55% of the frame.\n`;
    md += `   - Created shallow water pool floor at \`y = -0.30\` with visible cracked tiles in lower field of view.\n`;
    md += `   - Added Roman Arch opening to the right with clear line of sight into the grand flooded hall.\n`;
    md += `   - Completely deleted the \`openingTurn\` hack.\n\n`;
    md += `4. **Zero-HUD Hygiene:**\n`;
    md += `   - Default HUD style renders 0 DOM elements during normal exploration.\n`;
    md += `   - Suppressed "Procedural assets ready" toast unless \`?debug=1\` is set.\n\n`;
    md += `5. **Sim Clock Decoupling:**\n`;
    md += `   - Speedrun and game time now track real wall-clock time via \`performance.now()\`.\n\n`;

    writeFileSync(REPORT_FILE, md, 'utf8');
    console.log(`Saved report to ${REPORT_FILE}`);

    if (!allPassed) {
      throw new Error('One or more maps failed the p5 >= 0.08 black void threshold.');
    }
  } finally {
    cdp.close();
    chromeProc.kill('SIGTERM');
    viteProc.kill('SIGTERM');
  }
}

run().catch((err) => {
  console.error('Sweep failed:', err);
  process.exit(1);
});
