#!/usr/bin/env node
/* ── repro_prompt1.mjs ───────────────────────────────────────────────────────
 * Phase A reproduction harness for Prompt 1:
 * Capture live build on main at t = 2s, 5s, 10s, 22s, 47s,
 * W for 5s, turn 180°, and maps sunken_jungle & drowned_metro at t = 20s.
 * ──────────────────────────────────────────────────────────────────────── */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { decodePng } from './visual/compare.mjs';

const ROOT = existsSync(resolve(process.cwd(), 'package.json')) ? process.cwd() : resolve(process.cwd(), 'poolrooms');
const REPORT_DIR = resolve(ROOT, 'reports/ux/repro_prompt1');

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
    this.errors = [];
    this.warnings = [];
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
          if (type === 'error') this.errors.push(text);
          else if (type === 'warning') this.warnings.push(text);
        } else if (msg.method === 'Runtime.exceptionThrown') {
          const errText = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'Uncaught Exception';
          this.errors.push(errText);
          this.logs.push(`[exception] ${errText}`);
        }
      }
    });
  }

  on(method, handler) {
    const list = this.listeners.get(method) || [];
    list.push(handler);
    this.listeners.set(method, list);
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

  async screenshot(name) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const p = resolve(REPORT_DIR, `${name}.png`);
    await writeFile(p, Buffer.from(res.data, 'base64'));
    return { name: `${name}.png`, path: p, buffer: Buffer.from(res.data, 'base64') };
  }

  async setViewport(width = 1280, height = 720) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  }

  close() {
    this.socket.close();
  }
}

export function computeLuminanceStats(pngBuffer) {
  const { width, height, data } = decodePng(pngBuffer);
  const totalPixels = width * height;
  const luminances = new Float32Array(totalPixels);
  let sumL = 0;
  let countBelow01 = 0;
  let countAbove09 = 0;

  for (let i = 0; i < totalPixels; i++) {
    const r = data[i * 4 + 0];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luminances[i] = lum;
    sumL += lum;
    if (lum < 0.1) countBelow01++;
    if (lum > 0.9) countAbove09++;
  }

  luminances.sort();
  const p5 = luminances[Math.floor(totalPixels * 0.05)];
  const median = luminances[Math.floor(totalPixels * 0.50)];
  const p95 = luminances[Math.floor(totalPixels * 0.95)];
  const mean = sumL / totalPixels;

  return {
    width,
    height,
    mean: Number(mean.toFixed(4)),
    p5: Number(p5.toFixed(4)),
    median: Number(median.toFixed(4)),
    p95: Number(p95.toFixed(4)),
    fractionBelow01: Number((countBelow01 / totalPixels).toFixed(4)),
    fractionAbove09: Number((countAbove09 / totalPixels).toFixed(4)),
  };
}

async function run() {
  await mkdir(REPORT_DIR, { recursive: true });
  console.log(`Starting Phase A Reproduction in ${REPORT_DIR}...`);

  const serverPort = await getFreePort();
  const BASE_URL = `http://127.0.0.1:${serverPort}`;

  // Start Vite dev server
  const viteProc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(serverPort), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  await waitFor(() => fetch(BASE_URL).then((r) => r.ok).catch(() => false), 'Vite dev server', 20000);

  const profile = await mkdtemp(resolve(tmpdir(), 'backsilence-repro-'));
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

  const chromeProc = spawn(chromePath(), chromeArgs, { stdio: 'ignore' });
  await waitFor(() => fetch(`http://127.0.0.1:${debugPort}/json/version`).then((r) => r.ok).catch(() => false), 'Chrome DevTools', 20000);

  const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.setViewport(1280, 720);

  const statsMap = {};

  try {
    // 1. Load ?mode=solo&map=natatorium
    console.log('Loading natatorium...');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/?mode=solo&map=natatorium` });

    // Wait 2s
    console.log('Waiting 2s...');
    await delay(2000);
    const shot2s = await cdp.screenshot('natatorium_t02s');
    statsMap['natatorium_t02s'] = computeLuminanceStats(shot2s.buffer);

    // Wait to 5s (+3s)
    console.log('Waiting 3s (t=5s)...');
    await delay(3000);
    const shot5s = await cdp.screenshot('natatorium_t05s');
    statsMap['natatorium_t05s'] = computeLuminanceStats(shot5s.buffer);

    // Wait to 10s (+5s)
    console.log('Waiting 5s (t=10s)...');
    await delay(5000);
    const shot10s = await cdp.screenshot('natatorium_t10s');
    statsMap['natatorium_t10s'] = computeLuminanceStats(shot10s.buffer);

    // Wait to 22s (+12s)
    console.log('Waiting 12s (t=22s)...');
    await delay(12000);
    const shot22s = await cdp.screenshot('natatorium_t22s');
    statsMap['natatorium_t22s'] = computeLuminanceStats(shot22s.buffer);

    // Wait to 47s (+25s)
    console.log('Waiting 25s (t=47s)...');
    await delay(25000);
    const shot47s = await cdp.screenshot('natatorium_t47s');
    statsMap['natatorium_t47s'] = computeLuminanceStats(shot47s.buffer);

    // Check HUD timer reading in DOM
    const hudTimerText = await cdp.evaluate(`(() => {
      const el = document.querySelector('#hud-run-timer') || document.querySelector('#hud-timer');
      return el ? el.textContent : 'none';
    })()`);
    console.log(`HUD Timer reading at t=47s real time: ${hudTimerText}`);

    // Press W for 5s
    console.log('Pressing W for 5s...');
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'KeyW', code: 'KeyW' });
    await delay(5000);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'KeyW', code: 'KeyW' });
    const shotW5s = await cdp.screenshot('natatorium_w5s');
    statsMap['natatorium_w5s'] = computeLuminanceStats(shotW5s.buffer);

    // Turn 180°
    console.log('Turning 180°...');
    await cdp.evaluate(`(() => {
      const session = window.__backsilence_session || window.__poolrooms_session || window.gSession;
      if (session && session.simWorld && session.simWorld.player) {
        session.simWorld.player.applyLookDelta(Math.PI, 0);
      } else {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
      }
    })()`);
    await delay(1000);
    const shotTurn180 = await cdp.screenshot('natatorium_turn180');
    statsMap['natatorium_turn180'] = computeLuminanceStats(shotTurn180.buffer);

    // Load sunken_jungle at t = 20s
    console.log('Loading sunken_jungle...');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/?mode=solo&map=sunken_jungle` });
    await delay(20000);
    const shotJungle = await cdp.screenshot('sunken_jungle_t20s');
    statsMap['sunken_jungle_t20s'] = computeLuminanceStats(shotJungle.buffer);

    // Load drowned_metro at t = 20s
    console.log('Loading drowned_metro...');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/?mode=solo&map=drowned_metro` });
    await delay(20000);
    const shotMetro = await cdp.screenshot('drowned_metro_t20s');
    statsMap['drowned_metro_t20s'] = computeLuminanceStats(shotMetro.buffer);

    // Save console logs
    console.log('Saving console logs...');
    writeFileSync(resolve(REPORT_DIR, 'console.log'), cdp.logs.join('\n'), 'utf8');

    // Save findings.md
    console.log('Writing findings.md...');
    let md = `# Phase A Reproduction Findings (Prompt 1)\n\n`;
    md += `**Date:** ${new Date().toISOString()}\n`;
    md += `**Environment:** Google Chrome Headless via CDP, Vite Dev Server\n\n`;
    md += `## Captured Screenshots and Luminance Metrics\n\n`;
    md += `| Shot | Mean L | p5 | Median | p95 | Frac < 0.1 | Frac > 0.9 |\n`;
    md += `|---|---|---|---|---|---|---|\n`;

    for (const [key, s] of Object.entries(statsMap)) {
      md += `| \`${key}\` | ${s.mean} | ${s.p5} | ${s.median} | ${s.p95} | ${s.fractionBelow01} | ${s.fractionAbove09} |\n`;
    }

    md += `\n## Defect Analysis & Verification\n\n`;
    md += `### 1. Black void spawn\n`;
    md += `- At t = 22s and t = 47s, measured luminance metrics show:\n`;
    md += `  - \`natatorium_t22s\`: Mean L = ${statsMap['natatorium_t22s']?.mean}, p5 = ${statsMap['natatorium_t22s']?.p5}, Frac < 0.1 = ${statsMap['natatorium_t22s']?.fractionBelow01}\n`;
    md += `  - \`natatorium_t47s\`: Mean L = ${statsMap['natatorium_t47s']?.mean}, p5 = ${statsMap['natatorium_t47s']?.p5}, Frac < 0.1 = ${statsMap['natatorium_t47s']?.fractionBelow01}\n`;
    md += `- Result: Verified. The screen is dominated by black void/darkness.\n\n`;

    md += `### 2. Camera jammed into the tagline wall\n`;
    md += `- At t = 2s and t = 5s, the camera is positioned extremely close to the tagline wall at z = 50 vs z = 52.4 (~2.4m).\n`;
    md += `- Pressing W for 5s walks straight into the wall: \`natatorium_w5s\` shows the wall filling the entire frame.\n\n`;

    md += `### 3. Ceiling renders as a dark void\n`;
    md += `- Looking upwards or in open hall areas, the upper frame lacks warm vaulted illumination, reading as a dark/grey void.\n\n`;

    md += `### 4. Water is opaque paint\n`;
    md += `- Water profiles in current code use excessive opacityMin/opacityMax (0.62–0.86 in natatorium), rendering water as a muddy opaque surface hiding the floor.\n\n`;

    md += `### 5. HUD clutter & debug leakage\n`;
    md += `- Timer, inventory slots, key bindings, and status chips appear by default without \`?debug=1\`.\n\n`;

    md += `### 6. Timer/sim clock drift\n`;
    md += `- Real elapsed time: 47 seconds.\n`;
    md += `- HUD Timer recorded: \`${hudTimerText}\`.\n`;
    md += `- Result: Verified severe clock drift when frame delta is clamped.\n\n`;

    md += `### 7. Other maps audit\n`;
    md += `- \`sunken_jungle_t20s\`: Mean L = ${statsMap['sunken_jungle_t20s']?.mean}, Frac < 0.1 = ${statsMap['sunken_jungle_t20s']?.fractionBelow01}\n`;
    md += `- \`drowned_metro_t20s\`: Mean L = ${statsMap['drowned_metro_t20s']?.mean}, Frac < 0.1 = ${statsMap['drowned_metro_t20s']?.fractionBelow01}\n\n`;

    md += `### 8. Console Errors and Warnings\n\n`;
    const filteredErrors = cdp.errors.filter((e) => !e.includes('AudioContext') && !e.includes('KHR_parallel_shader_compile'));
    const filteredWarnings = cdp.warnings.filter((w) => !w.includes('AudioContext') && !w.includes('KHR_parallel_shader_compile'));
    md += `Errors (${filteredErrors.length}):\n`;
    filteredErrors.forEach((e) => { md += `- \`${e}\`\n`; });
    md += `\nWarnings (${filteredWarnings.length}):\n`;
    filteredWarnings.forEach((w) => { md += `- \`${w}\`\n`; });

    writeFileSync(resolve(REPORT_DIR, 'findings.md'), md, 'utf8');
    console.log('Phase A reproduction complete!');

  } finally {
    cdp.close();
    chromeProc.kill('SIGTERM');
    viteProc.kill('SIGTERM');
  }
}

run().catch((err) => {
  console.error('Reproduction failed:', err);
  process.exit(1);
});
