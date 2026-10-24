#!/usr/bin/env node
/* ── run-self-tests.mjs ───────────────────────────────────────────────────
 *  Phase J: Automated diagnostic execution in Headless Chrome.
 *  Executes waterSelfTest(), audioSelfTest(), and perfReport()
 *  via window.__backsilence and writes results to reports/visual/self-tests.json.
 * ──────────────────────────────────────────────────────────────────────── */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const PORT = 4178;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUTPUT_FILE = resolve(ROOT, 'reports/visual/self-tests.json');

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
    await delay(150);
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
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`JS Exception: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  close() {
    this.socket.close();
  }
}

async function main() {
  console.log('=== Running BackSilence Phase J Self-Tests in Headless Chrome ===');

  let vite;
  let chrome;
  let cdp;

  try {
    vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], {
      cwd: ROOT,
      stdio: 'ignore',
    });
    await waitFor(() => fetch(BASE_URL).then((r) => r.ok).catch(() => false), 'Vite server');
    console.log(`[1/4] Vite dev server ready at ${BASE_URL}`);

    const debugPort = await getFreePort();
    const profile = await mkdtemp(resolve(tmpdir(), 'backsilence-tests-'));
    chrome = spawn(
      chromePath(),
      [
        '--headless=new',
        '--remote-debugging-address=127.0.0.1',
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${profile}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-component-update',
        '--window-size=1280,720',
      ],
      { stdio: 'ignore' }
    );

    const debugUrl = `http://127.0.0.1:${debugPort}`;
    await waitFor(() => fetch(`${debugUrl}/json/version`).then((r) => r.ok).catch(() => false), 'Chrome DevTools');
    console.log(`[2/4] Headless Chrome started at ${debugUrl}`);

    const targets = await fetch(`${debugUrl}/json/list`).then((r) => r.json());
    const pageTarget = targets.find((t) => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    cdp = new Cdp(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable')]);

    await cdp.send('Page.navigate', { url: `${BASE_URL}/?debug=1&lab=1` });
    await waitFor(async () => {
      return Boolean(await cdp.evaluate('window.__backsilence !== undefined'));
    }, 'window.__backsilence');
    console.log('[3/4] Page loaded and window.__backsilence is available');

    console.log('Executing window.__backsilence.waterSelfTest()...');
    const waterTestResult = await cdp.evaluate('window.__backsilence.waterSelfTest()');
    console.log('Water Self-Test Result:', JSON.stringify(waterTestResult, null, 2));

    console.log('Executing window.__backsilence.audioSelfTest()...');
    const audioTestResult = await cdp.evaluate('window.__backsilence.audioSelfTest()');
    console.log(`Audio Self-Test Result: ${audioTestResult.passed ? 'PASSED' : 'FAILED'} (${audioTestResult.results?.length ?? 0} voices evaluated)`);
    const failedVoices = audioTestResult.results?.filter((r) => r.status === 'FAIL') ?? [];
    if (failedVoices.length > 0) {
      console.log('Failed voices in audioSelfTest:', JSON.stringify(failedVoices, null, 2));
    }

    console.log('Executing window.__backsilence.perfReport()...');
    const perfReportResult = await cdp.evaluate('window.__backsilence.perfReport()');
    console.log('Perf Report:', JSON.stringify(perfReportResult, null, 2));

    const finalReport = {
      timestamp: new Date().toISOString(),
      waterSelfTest: waterTestResult,
      audioSelfTest: {
        passed: audioTestResult.passed,
        voiceCount: audioTestResult.results?.length ?? 0,
        failedCount: failedVoices.length,
        failedVoices,
        sampleVoices: audioTestResult.results?.slice(0, 10),
      },
      perfReport: perfReportResult,
    };

    await mkdir(resolve(ROOT, 'reports/visual'), { recursive: true });
    await writeFile(OUTPUT_FILE, JSON.stringify(finalReport, null, 2), 'utf-8');
    console.log(`[4/4] Successfully recorded self-test outputs to: ${OUTPUT_FILE}`);
  } finally {
    cdp?.close();
    chrome?.kill();
    vite?.kill();
  }
}

main().catch((err) => {
  console.error('Self-tests execution failed:', err);
  process.exit(1);
});
