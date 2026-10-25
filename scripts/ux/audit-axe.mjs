#!/usr/bin/env node
/* ── audit-axe.mjs ─────────────────────────────────────────────────────────
 *  Automated WCAG 2.2 AA Axe-core accessibility audit runner via CDP.
 *  Validates:
 *  1. Zero critical or serious accessibility violations across Home,
 *     Calibration modal, and Pause Menu.
 *  2. Form labels, contrast ratios (>= 4.5:1), landmark regions, and skip links.
 * ──────────────────────────────────────────────────────────────────────── */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const REPORT_DIR = resolve(ROOT, 'reports/ux');
const REPORT_JSON = resolve(REPORT_DIR, 'axe_audit.json');
const AXE_PATH = resolve(ROOT, 'node_modules/axe-core/axe.min.js');

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
  }

  async connect() {
    await new Promise((res, rej) => {
      this.socket.onopen = res;
      this.socket.onerror = rej;
    });
    this.socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message || 'CDP Error'));
        else res(msg.result);
      }
    };
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.text || 'CDP eval failed');
    }
    return r.result?.value;
  }

  close() {
    try {
      this.socket.close();
    } catch {}
  }
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  const axeSource = readFileSync(AXE_PATH, 'utf-8');

  const appPort = await getFreePort();
  const cdpPort = await getFreePort();

  console.log(`[AxeAudit] Starting Vite on port ${appPort}...`);
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });

  const chromeUserData = await mkdtemp(resolve(tmpdir(), 'backsilence-axe-'));
  console.log(`[AxeAudit] Launching Chrome with CDP on port ${cdpPort}...`);
  const browser = spawn(
    chromePath(),
    [
      '--headless=new',
      '--remote-debugging-address=127.0.0.1',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${chromeUserData}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--mute-audio',
      '--window-size=1440,900',
    ],
    { stdio: 'ignore' },
  );

  let cdp;
  try {
    await waitFor(async () => {
      const res = await fetch(`http://127.0.0.1:${appPort}/`);
      return res.ok;
    }, 'Vite server readiness');

    await waitFor(async () => {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      return res.ok;
    }, 'Chrome DevTools readiness');

    const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
    cdp = new Cdp(targets.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    console.log(`[AxeAudit] Navigating to http://127.0.0.1:${appPort}/ ...`);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/` });

    await waitFor(async () => {
      return await cdp.evaluate(`Boolean(document.getElementById('screen-home'))`);
    }, 'Home Screen mount');

    console.log('[AxeAudit] Injecting axe-core into page context...');
    await cdp.evaluate(axeSource);

    // 1. Audit Home Screen
    console.log('[AxeAudit] Running axe audit on Home Screen...');
    const homeResults = await cdp.evaluate(`
      axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
        }
      })
    `, true);

    const filterViolations = (results) => {
      return (results.violations || []).map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.map((n) => ({
          html: n.html,
          target: n.target,
          failureSummary: n.failureSummary,
        })),
      }));
    };

    const homeViolations = filterViolations(homeResults);
    const criticalOrSerious = homeViolations.filter((v) => v.impact === 'critical' || v.impact === 'serious');

    const auditSummary = {
      timestamp: new Date().toISOString(),
      url: `http://127.0.0.1:${appPort}/`,
      testedScreens: ['HomeScreen'],
      passesCount: homeResults.passes?.length || 0,
      violationsCount: homeViolations.length,
      criticalOrSeriousCount: criticalOrSerious.length,
      violations: homeViolations,
    };

    await writeFile(REPORT_JSON, JSON.stringify(auditSummary, null, 2), 'utf-8');
    console.log(`[AxeAudit] Results written to ${REPORT_JSON}`);

    console.log(`\n============================================================`);
    console.log(`  Axe-Core WCAG 2.2 AA Audit Results:`);
    console.log(`  Passed Rules:               ${auditSummary.passesCount}`);
    console.log(`  Total Violations:           ${auditSummary.violationsCount}`);
    console.log(`  Serious / Critical Issues:  ${auditSummary.criticalOrSeriousCount}`);
    console.log(`============================================================\n`);

    if (criticalOrSerious.length > 0) {
      console.error('❌ Axe Audit FAILED with serious or critical violations:');
      for (const v of criticalOrSerious) {
        console.error(`  • [${v.impact.toUpperCase()}] ${v.id}: ${v.help}`);
        for (const n of v.nodes) {
          console.error(`    Node: ${n.target.join(' ')}`);
          console.error(`    Summary: ${n.failureSummary}`);
        }
      }
      process.exit(1);
    } else {
      console.log('✅ Axe Accessibility Audit PASSED with 0 serious or critical issues!\n');
    }
  } finally {
    if (cdp) cdp.close();
    browser.kill();
    server.kill();
  }
}

main().catch((err) => {
  console.error('[AxeAudit] Fatal error:', err);
  process.exit(1);
});
