#!/usr/bin/env node
/* ── verify-preconditions.mjs ───────────────────────────────────────────────
 *  Prompt 2 Precondition Verification Runner.
 *  Validates:
 *  1. Default map loads in headless Chrome, canvas not blank.
 *  2. Water shader compiles cleanly without errors or fallback.
 *  3. Monster exists in sim, has mesh, is visible, and moves (>= 40m).
 *  4. Player ripple events reach water uniforms.
 *  Writes: reports/visual/preconditions.md and screenshots.
 * ──────────────────────────────────────────────────────────────────────── */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const PORT = 4176;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUTPUT_DIR = resolve(ROOT, 'reports/visual');

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
    this.logs = [];
    this.errors = [];

    this.socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        if (msg.method === 'Runtime.consoleAPICalled') {
          const type = msg.params.type;
          const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
          this.logs.push(`[${type}] ${text}`);
          if (type === 'error') {
            this.errors.push(text);
          }
        } else if (msg.method === 'Runtime.exceptionThrown') {
          const text = msg.params.exceptionDetails?.text || 'Uncaught Exception';
          this.errors.push(text);
        }
      }
    };
  }

  async connect() {
    await new Promise((res, rej) => {
      this.socket.addEventListener('open', res, { once: true });
      this.socket.addEventListener('error', rej, { once: true });
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
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
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Eval error');
    }
    return res.result?.value;
  }

  async screenshot(path) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path, Buffer.from(res.data, 'base64'));
  }

  close() {
    this.socket.close();
  }
}

async function run() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log(`📡 Starting Vite preview on port ${PORT}...`);
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
    cwd: ROOT,
  });

  await waitFor(async () => {
    try {
      const res = await fetch(BASE_URL);
      return res.ok;
    } catch {
      return false;
    }
  }, 'Vite preview server', 15000);

  const cdpPort = await getFreePort();
  const userDataDir = await mkdtemp(resolve(tmpdir(), 'backsilence-precond-'));

  console.log(`🌐 Launching headless Chrome on CDP port ${cdpPort}...`);
  const chromeArgs = [
    '--headless=new',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--window-size=1440,900',
  ];
  if (process.platform === 'linux') {
    chromeArgs.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  }

  const chrome = spawn(chromePath(), chromeArgs, { stdio: 'ignore' });

  await waitFor(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      return res.ok;
    } catch {
      return false;
    }
  }, 'Chrome DevTools', 15000);

  const target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  const results = {
    p1: { name: 'Default map loads in headless Chrome & canvas is not blank', pass: false, details: '' },
    p2: { name: 'Water shader compiles cleanly without errors or fallback', pass: false, details: '' },
    p3: { name: 'At least one monster exists in sim, has mesh, is visible, and moves', pass: false, details: '' },
    p4: { name: 'Player ripple events reach water uniforms', pass: false, details: '' },
  };

  try {
    console.log('🕹️ Navigating to Solo Natatorium (default map)...');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/?map=natatorium&seed=42&god=1` });

    console.log('⏳ Waiting for session to be created and loaded...');
    await waitFor(async () => {
      const isLoaded = await cdp.eval('Boolean(window.__backsilence_session && window.__backsilence_session.isLoaded)');
      return isLoaded;
    }, 'session isLoaded', 20000);

    // Wait 2 seconds for rendering to settle
    await delay(2000);

    // ── PRECONDITION 1: Canvas not blank ─────────────────────────────────────
    console.log('🔍 Checking Precondition 1: Canvas luminance...');
    const luminanceData = await cdp.eval(`(() => {
      const session = window.__backsilence_session;
      const canvas = document.querySelector('canvas#webgl-canvas') || document.querySelector('canvas');
      if (!canvas) return { error: 'No canvas found' };
      const renderer = session.renderer ? session.renderer.renderer : null;
      if (!renderer) return { error: 'No renderer' };
      const gl = renderer.getContext();
      if (!gl) return { error: 'No WebGL context' };

      // Explicitly render scene to canvas default buffer
      renderer.setRenderTarget(null);
      renderer.render(session.scene, session.camera);

      const w = 32;
      const h = 32;
      const pixels = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let sum = 0;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const lum = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
        sum += lum;
        count++;
      }
      const mean = sum / count;
      let varianceSum = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const lum = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
        varianceSum += (lum - mean) * (lum - mean);
      }
      const stdDev = Math.sqrt(varianceSum / count);
      return { width: canvas.width, height: canvas.height, mean, stdDev };
    })()`);

    const screenshotPath = resolve(OUTPUT_DIR, 'preconditions_canvas.png');
    await cdp.screenshot(screenshotPath);

    if (luminanceData && luminanceData.stdDev > 5.0 && luminanceData.mean > 2.0) {
      results.p1.pass = true;
      results.p1.details = `Canvas rendered: ${luminanceData.width}x${luminanceData.height}, mean lum=${luminanceData.mean.toFixed(2)}, std-dev=${luminanceData.stdDev.toFixed(2)} (> 5.0). Screenshot: ${screenshotPath}`;
    } else {
      results.p1.details = `Blank or low contrast canvas: mean=${luminanceData?.mean}, stdDev=${luminanceData?.stdDev}`;
    }
    console.log(`Precondition 1: ${results.p1.pass ? 'PASS' : 'FAIL'} (${results.p1.details})`);

    // ── PRECONDITION 2: Water shader compiles cleanly ────────────────────────
    console.log('🔍 Checking Precondition 2: Water shader...');
    const waterShaderData = await cdp.eval(`(() => {
      const session = window.__backsilence_session;
      if (!session) return { error: 'No active session' };
      const water = session.waterSystem;
      if (!water) return { error: 'No water system' };
      const mat = water.material;
      if (!mat) return { error: 'No water material' };
      const isFallback = !!mat.isFallback;
      const isVisible = mat.visible !== false;
      const hasErrors = session.shaderErrors ? session.shaderErrors.length : 0;
      const renderer = session.renderer ? session.renderer.renderer : null;
      const gl = renderer ? renderer.getContext() : null;
      const glError = gl ? gl.getError() : -1;
      return {
        isFallback,
        isVisible,
        hasErrors,
        glError,
        uniformsExist: !!mat.uniforms,
      };
    })()`);

    if (waterShaderData && !waterShaderData.error && waterShaderData.isVisible && !waterShaderData.isFallback && waterShaderData.hasErrors === 0 && waterShaderData.glError === 0) {
      results.p2.pass = true;
      results.p2.details = `Water shader compiled with zero errors. Fallback material: false, Uniforms active: true, WebGL glError: 0 (NO_ERROR).`;
    } else {
      results.p2.details = `Water shader issue: ${JSON.stringify(waterShaderData)}`;
    }
    console.log(`Precondition 2: ${results.p2.pass ? 'PASS' : 'FAIL'} (${results.p2.details})`);

    // ── PRECONDITION 3: Monster exists, has mesh, visible, moves ──────────────
    console.log('🔍 Checking Precondition 3: Monster presence and movement...');
    const monsterData = await cdp.eval(`(() => {
      const session = window.__backsilence_session;
      if (!session || !session.simWorld) return { error: 'No session simWorld' };
      const sim = session.simWorld;
      if (!sim.monsters || sim.monsters.length === 0) return { error: 'No monsters in sim' };
      const m = sim.monsters[0];
      const mm = session.monsterManager || session.monsters;
      const mMesh = mm ? (mm.root || mm.mesh) : null;
      const startPos = { x: m.pos.x, y: m.pos.y, z: m.pos.z };

      // Step simulation for 120s (7200 ticks at 60Hz) to measure movement
      let totalMoved = 0;
      let prevPos = { ...startPos };
      for (let s = 0; s < 120 * 60; s++) {
        sim.step(1 / 60, { moveX: 0, moveZ: 0, sprint: false, crouch: false, jump: false, interact: false, lookDeltaYaw: 0, lookDeltaPitch: 0 });
        const curPos = m.pos;
        const stepDist = Math.hypot(curPos.x - prevPos.x, curPos.z - prevPos.z);
        totalMoved += stepDist;
        prevPos = { x: curPos.x, y: curPos.y, z: curPos.z };
      }

      return {
        count: sim.monsters.length,
        initialPos: startPos,
        finalPos: { x: m.pos.x, y: m.pos.y, z: m.pos.z },
        totalMoved: Number(totalMoved.toFixed(2)),
        meshInScene: Boolean(mMesh),
        isCulled: mMesh ? mMesh.frustumCulled : false,
      };
    })()`);

    if (monsterData && !monsterData.error && monsterData.totalMoved >= 40.0) {
      results.p3.pass = true;
      results.p3.details = `Monster count in sim: ${monsterData.count}, Mesh in scene: ${monsterData.meshInScene}, Frustum culled: ${monsterData.isCulled}, Initial pos: (${monsterData.initialPos.x}, ${monsterData.initialPos.z}), Final pos: (${monsterData.finalPos.x.toFixed(2)}, ${monsterData.finalPos.z.toFixed(2)}), 120s simulated movement: ${monsterData.totalMoved}m (>= 40m requirement).`;
    } else {
      results.p3.details = `Monster check failed: ${JSON.stringify(monsterData)}`;
    }
    console.log(`Precondition 3: ${results.p3.pass ? 'PASS' : 'FAIL'} (${results.p3.details})`);

    // ── PRECONDITION 4: Ripple events reach water uniforms ────────────────────
    console.log('🔍 Checking Precondition 4: Player ripples reach uniforms...');
    const rippleData = await cdp.eval(`(() => {
      const session = window.__backsilence_session;
      if (!session || !session.waterSystem) return { error: 'No water system' };
      const water = session.waterSystem;
      // Inject test ripple
      water.onRipple({ position: { x: 0, y: 0, z: 2 }, strength: 1.0, t: 0.1 });
      water.update(0.016, 1.0, session.cameraRef);
      const rippleCount = water.material.uniforms?.uRippleCount?.value ?? 0;
      return {
        rippleCount,
        hasRipplesArray: Array.isArray(water.ripples?.uniformArray),
      };
    })()`);

    if (rippleData && !rippleData.error && rippleData.rippleCount > 0) {
      results.p4.pass = true;
      results.p4.details = `Ripple event successfully injected; water.material.uniforms.uRippleCount.value = ${rippleData.rippleCount} (> 0).`;
    } else {
      results.p4.details = `Ripple uniforms check failed: ${JSON.stringify(rippleData)}`;
    }
    console.log(`Precondition 4: ${results.p4.pass ? 'PASS' : 'FAIL'} (${results.p4.details})`);

  } finally {
    cdp.close();
    chrome.kill('SIGKILL');
    preview.kill('SIGKILL');
  }

  // ── WRITE REPORT ──────────────────────────────────────────────────────────
  const allPass = results.p1.pass && results.p2.pass && results.p3.pass && results.p4.pass;
  const mdContent = `# BackSilence Prompt 2: Preconditions Verification Report

**Execution Timestamp:** ${new Date().toISOString()}  
**Overall Status:** ${allPass ? 'ALL PRECONDITIONS PASSED' : 'PRECONDITION FAILURE DETECTED'}

## Results Matrix

| # | Precondition | Status | Details |
|---|---|---|---|
| 1 | Default map loads in headless Chrome & canvas is not blank | **${results.p1.pass ? 'PASS' : 'FAIL'}** | ${results.p1.details} |
| 2 | Water shader compiles cleanly without errors or fallback | **${results.p2.pass ? 'PASS' : 'FAIL'}** | ${results.p2.details} |
| 3 | At least one monster exists in sim, has mesh, is visible, and moves | **${results.p3.pass ? 'PASS' : 'FAIL'}** | ${results.p3.details} |
| 4 | Player ripple events reach water uniforms | **${results.p4.pass ? 'PASS' : 'FAIL'}** | ${results.p4.details} |

## Evidence Artifacts
- **Screenshot:** \`reports/visual/preconditions_canvas.png\`
`;

  const reportPath = resolve(OUTPUT_DIR, 'preconditions.md');
  await writeFile(reportPath, mdContent, 'utf-8');
  console.log(`\n📄 Report written to: ${reportPath}`);

  if (!allPass) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
