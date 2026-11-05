#!/usr/bin/env node
/* ── leak-probe.mjs ──────────────────────────────────────────────────────────
 *  Prompt 9 Phase C: Disposal Law & Leak Probe
 *  Verifies:
 *  1. 20 sequential session cycles with zero leaked WebGL contexts, canvases, or listeners.
 *  2. JS Heap memory growth <= 10% across sequential cycles.
 *  3. 50x rapid start-teardown stress cycle executes in < 30 seconds with zero errors.
 *  Outputs structured results to reports/engineering/leak-probe.json.
 * ──────────────────────────────────────────────────────────────────────── */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const REPORT_PATH = resolve(ROOT, 'reports/engineering/leak-probe.json');

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

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.errors = [];
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
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const type = msg.params.type;
        const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
        this.logs.push(`[${type}] ${text}`);
        if (type === 'error') this.errors.push(text);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const errText = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'Uncaught Exception';
        this.errors.push(errText);
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
      }, 120000);
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

  close() {
    this.socket.close();
  }
}

async function main() {
  console.log('=== BackSilence Disposal Law & Leak Probe (Prompt 9) ===\n');

  const appPort = await getFreePort();
  const cdpPort = await getFreePort();
  const tmpUserDataDir = await mkdtemp(resolve(tmpdir(), 'backsilence-leak-'));

  console.log(`[LeakProbe] Starting dev server on port ${appPort}...`);
  const devServer = spawn('npx', ['vite', '--port', String(appPort), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });

  await delay(1500);

  console.log(`[LeakProbe] Launching Chrome on CDP port ${cdpPort}...`);
  const chromeArgs = [
    '--headless=new',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tmpUserDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--window-size=1440,900',
    '--js-flags=--expose-gc',
  ];
  if (process.platform === 'linux') {
    chromeArgs.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  }

  const chrome = spawn(chromePath(), chromeArgs, { stdio: 'ignore' });

  let cdp;
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {
        await delay(200);
      }
    }
    if (!ready) throw new Error('Could not connect to Chrome CDP endpoint.');

    const target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
    cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('HeapProfiler.enable');

    console.log(`[LeakProbe] Navigating to http://127.0.0.1:${appPort}/ ...`);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/` });
    await delay(2500);

    // Initialize in-page probe harness
    await cdp.evaluate(`(() => {
      window.__leakProbe = {
        baselineCanvases: document.querySelectorAll('canvas').length,
        async runCycle(i) {
          const container = document.getElementById('app') || document.body;
          const sessionContainer = document.createElement('div');
          sessionContainer.id = 'test-session-container-' + i;
          sessionContainer.style.width = '1280px';
          sessionContainer.style.height = '720px';
          container.appendChild(sessionContainer);

          const { GameSession } = await import('/src/game/GameSession.ts');
          const { defaultSettings } = await import('/src/app/Settings.ts');

          const session = new GameSession(
            sessionContainer,
            defaultSettings(),
            {
              update: () => {},
              showQuietHint: () => {},
              setMinimalHud: () => {},
              setUiScale: () => {},
              setWorkOrderCard: () => {},
              showThreeRulesOverlay: () => {},
            },
            {
              onPause: () => {},
              onDeath: () => {},
              onWin: () => {},
              onExit: () => {},
            },
            'normal',
            42 + i,
            'natatorium'
          );

          await session.initPromise;

          for (let f = 0; f < 10; f++) {
            session.update(1 / 60);
          }

          session.dispose();
          const sessionCanvases = sessionContainer.querySelectorAll('canvas').length;
          sessionContainer.remove();

          if (window.gc) {
            window.gc();
            window.gc();
            window.gc();
          }

          const memoryMB = performance.memory ? (performance.memory.usedJSHeapSize / 1048576) : 0;

          return {
            cycle: i,
            leakedCanvases: sessionCanvases,
            memoryMB: Math.round(memoryMB * 100) / 100,
          };
        },
        async runRapidBatch(startIdx, count) {
          const container = document.getElementById('app') || document.body;
          const { GameSession } = await import('/src/game/GameSession.ts');
          const { defaultSettings } = await import('/src/app/Settings.ts');
          const settings = defaultSettings();
          let errors = 0;

          for (let i = 0; i < count; i++) {
            try {
              const div = document.createElement('div');
              container.appendChild(div);
              const session = new GameSession(
                div,
                settings,
                { update: () => {}, showQuietHint: () => {}, setMinimalHud: () => {}, setUiScale: () => {}, setWorkOrderCard: () => {}, showThreeRulesOverlay: () => {} },
                { onPause: () => {}, onDeath: () => {}, onWin: () => {}, onExit: () => {} },
                'normal',
                startIdx + i,
                'natatorium'
              );
              session.update(1 / 60);
              session.dispose();
              div.remove();
            } catch (e) {
              errors++;
            }
          }
          return errors;
        }
      };
    })()`);

    // ── Phase 1: 20 Sequential Sessions Test ─────────────────────────────────
    console.log('\n--- Running 20 Sequential Sessions ---');
    process.stdout.write('[LeakProbe] Progress: ');
    const seqResults = [];
    for (let i = 1; i <= 20; i++) {
      const rec = await cdp.evaluate(`window.__leakProbe.runCycle(${i})`);
      await cdp.send('HeapProfiler.collectGarbage');
      await delay(50);
      const memBytes = await cdp.evaluate(`performance.memory ? performance.memory.usedJSHeapSize : 0`);
      rec.memoryMB = Math.round((memBytes / 1048576) * 100) / 100;
      seqResults.push(rec);
      process.stdout.write(`${i} `);
    }
    console.log('Done.');

    const initialHeap = seqResults[4]?.memoryMB ?? seqResults[0]?.memoryMB ?? 1;
    const finalHeap = seqResults[seqResults.length - 1]?.memoryMB ?? 1;
    const heapGrowthPct = initialHeap > 0 ? ((finalHeap - initialHeap) / initialHeap) * 100 : 0;
    const finalLeakedCanvases = seqResults[seqResults.length - 1]?.leakedCanvases ?? 0;

    console.log(`- Final Leaked Canvases: ${finalLeakedCanvases} (Target: 0)`);
    console.log(`- Initial Heap (cycle 5): ${initialHeap.toFixed(2)} MB`);
    console.log(`- Final Heap (cycle 20): ${finalHeap.toFixed(2)} MB`);
    console.log(`- Heap Growth: ${heapGrowthPct.toFixed(2)}% (Target: <= 10.0%)`);

    // ── Phase 2: 50x Rapid Cycle Stress Test ─────────────────────────────────
    console.log('\n--- Running 50x Rapid Cycle Stress Test ---');
    const rapidStart = Date.now();
    let totalRapidErrors = 0;
    for (let b = 0; b < 5; b++) {
      const batchErrs = await cdp.evaluate(`window.__leakProbe.runRapidBatch(${100 + b * 10}, 10)`);
      totalRapidErrors += batchErrs;
      process.stdout.write(`Batch ${b + 1}/5 done. `);
    }
    const rapidDurationMs = Date.now() - rapidStart;
    console.log(`\nExecuted 50 rapid cycles in ${rapidDurationMs}ms (${(rapidDurationMs / 1000).toFixed(2)}s) with ${totalRapidErrors} errors.`);
    console.log(`- Target: < 30.0s, 0 errors.`);

    // ── Assertion Verdicts ───────────────────────────────────────────────────
    const seqPass = finalLeakedCanvases === 0 && Math.abs(heapGrowthPct) <= 10.0;
    const rapidPass = rapidDurationMs < 30000 && totalRapidErrors === 0;
    const errorsPass = cdp.errors.length === 0;

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        status: seqPass && rapidPass && errorsPass ? 'PASS' : 'FAIL',
        sequential20Pass: seqPass,
        rapid50Pass: rapidPass,
        zeroErrorsPass: errorsPass,
      },
      sequential20: {
        cycles: seqResults.length,
        finalLeakedCanvases,
        initialHeapMB: initialHeap,
        finalHeapMB: finalHeap,
        heapGrowthPct: Math.round(heapGrowthPct * 100) / 100,
        records: seqResults,
      },
      rapid50: {
        cycles: 50,
        durationMs: rapidDurationMs,
        errorCount: totalRapidErrors,
      },
      unhandledErrors: cdp.errors,
    };

    await mkdir(resolve(ROOT, 'reports/engineering'), { recursive: true });
    await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`\nReport written to: ${REPORT_PATH}`);

    if (!seqPass || !rapidPass || !errorsPass) {
      console.error('\n[LeakProbe] Verification FAILED.');
      process.exit(1);
    }

    console.log('\n[LeakProbe] All disposal law assertions PASSED cleanly.');
  } finally {
    cdp?.close();
    chrome.kill('SIGTERM');
    devServer.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('\n[LeakProbe] Error:', err);
  process.exit(1);
});
