#!/usr/bin/env node
/*
 * Zero-dependency browser release check. It uses Node's native WebSocket
 * implementation to speak CDP directly and stores screenshots outside the repo.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';

const ROOT = process.cwd();
const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;
let debugUrl = '';
const warnings = [];
const exceptions = [];
const requests = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function getFreePort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a CDP port.');
  const { port } = address;
  await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  return port;
}

async function waitFor(check, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function waitForEvent(cdp, method, label, timeout = 20000) {
  return new Promise((resolveEvent, rejectEvent) => {
    const timer = setTimeout(() => rejectEvent(new Error(`Timed out waiting for ${label}`)), timeout);
    cdp.on(method, (params) => {
      clearTimeout(timer);
      resolveEvent(params);
    });
  });
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
    child.once('error', rejectRun);
    child.once('exit', (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} exited with code ${code ?? 'unknown'}`));
    });
  });
}

function chromePath() {
  const candidates = [
    process.env.BACKSILENCE_CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'google-chrome',
    'chromium',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes('/') && existsSync(candidate)) return candidate;
    if (!candidate.includes('/')) return candidate;
  }
  throw new Error('Chrome was not found. Set BACKSILENCE_CHROME_BIN to a Chrome or Chromium executable.');
}

function artifactDirectory() {
  const requested = process.env.BACKSILENCE_ARTIFACT_DIR;
  if (!requested) return mkdtemp(resolve(tmpdir(), 'backsilence-acceptance-'));
  const target = resolve(requested);
  const rel = relative(ROOT, target);
  assert(rel === '..' || rel.startsWith('../'), 'BACKSILENCE_ARTIFACT_DIR must be outside the repository.');
  return mkdir(target, { recursive: true }).then(() => target);
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    await new Promise((resolveConnect, rejectConnect) => {
      this.socket.addEventListener('open', resolveConnect, { once: true });
      this.socket.addEventListener('error', rejectConnect, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      const callbacks = this.listeners.get(message.method) ?? [];
      callbacks.forEach((callback) => callback(message.params));
    });
  }

  on(method, callback) {
    const callbacks = this.listeners.get(method) ?? [];
    callbacks.push(callback);
    this.listeners.set(method, callbacks);
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveSend, rejectSend) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectSend(new Error(`CDP ${method} timed out`));
      }, 30000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolveSend(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          rejectSend(error);
        },
      });
    });
  }

  close() {
    this.socket.close();
  }
}

async function openPage() {
  // Start blank so Network.enable is active before any application request.
  const target = await fetch(`${debugUrl}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' }).then((res) => res.json());
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.connect();
  cdp.on('Runtime.consoleAPICalled', (event) => {
    if (event.type === 'warning' || event.type === 'error') {
      warnings.push(event.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
    }
  });
  cdp.on('Runtime.exceptionThrown', (event) => exceptions.push(event.exceptionDetails.text));
  cdp.on('Network.requestWillBeSent', (event) => requests.push(event.request.url));
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Network.enable')]);
  return cdp;
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitForSelector(cdp, selector) {
  await waitFor(() => evaluate(cdp, `Boolean(document.querySelector(${JSON.stringify(selector)}))`), selector);
}

async function waitForVisible(cdp, selector) {
  await waitFor(() => evaluate(cdp, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  })()`), `${selector} to become visible`);
}

async function click(cdp, selector) {
  await waitForVisible(cdp, selector);
  await evaluate(cdp, `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center', inline: 'center' })`);
  await delay(50);
  const point = await evaluate(cdp, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
}

async function activate(cdp, selector) {
  await waitForVisible(cdp, selector);
  await evaluate(cdp, `document.querySelector(${JSON.stringify(selector)}).click()`);
}

async function screenshot(cdp, directory, name) {
  const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(resolve(directory, `${name}.png`), Buffer.from(image.data, 'base64'));
}

async function navigate(cdp, url) {
  await cdp.send('Page.navigate', { url });
  await waitForSelector(cdp, '#main-menu-view');
  await waitFor(() => evaluate(cdp, "performance.getEntriesByName('menu:interactive').length === 1"), 'interactive menu mark');
  if (await evaluate(cdp, "Boolean(document.querySelector('#audio-unlock-overlay'))")) {
    await click(cdp, '#audio-unlock-overlay');
    await waitFor(() => evaluate(cdp, "!document.querySelector('#audio-unlock-overlay')"), 'audio overlay dismissal');
  }
}

async function main() {
  const directory = await artifactDirectory();
  let preview;
  let chrome;
  let cdp;
  try {
    await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);
    preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
    await waitFor(() => fetch(BASE_URL).then((res) => res.ok).catch(() => false), 'Vite preview');

    const profile = await mkdtemp(resolve(tmpdir(), 'backsilence-chrome-'));
    const debugPort = await getFreePort();
    debugUrl = `http://127.0.0.1:${debugPort}`;
    chrome = spawn(chromePath(), [
      '--headless=new', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
      '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
      '--disable-component-update', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    ], { stdio: 'ignore' });
    await waitFor(() => fetch(`${debugUrl}/json/version`).then((res) => res.ok).catch(() => false), 'Chrome DevTools');

    cdp = await openPage();
    console.log('Browser acceptance: desktop menu and keyboard focus');
    await navigate(cdp, `${BASE_URL}/?debug=1`);
    const menuMs = await evaluate(cdp, "performance.getEntriesByName('menu:interactive')[0]?.startTime ?? Infinity");
    assert(menuMs < 1000, `menu became interactive in ${menuMs} ms (budget: <1000 ms)`);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    assert(
      await evaluate(cdp, "document.activeElement?.matches('#btn-play-solo, #btn-play-online, #btn-how-to-play, #btn-settings, #btn-about') ?? false"),
      'keyboard Tab did not focus a visible menu action',
    );
    await screenshot(cdp, directory, 'desktop-menu');

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    console.log('Browser acceptance: mobile room link');
    await navigate(cdp, `${BASE_URL}/?room=K7QX`);
    await screenshot(cdp, directory, 'mobile-room-link');
    await cdp.send('Emulation.clearDeviceMetricsOverride');

    console.log('Browser acceptance: lab/debug');
    await navigate(cdp, `${BASE_URL}/?lab=1&debug=1`);
    await screenshot(cdp, directory, 'lab-debug');

    console.log('Browser acceptance: local-tab lobby');
    await navigate(cdp, `${BASE_URL}/?net=local`);
    await click(cdp, '#btn-play-online');
    await waitForSelector(cdp, '#room-link-view');
    await activate(cdp, '#btn-launch-lobby');
    try {
      await waitForSelector(cdp, '#lobby-roster-cards');
    } catch {
      const text = await evaluate(cdp, 'document.body.innerText');
      throw new Error(`local-tab lobby did not open: ${text}`);
    }

    console.log('Browser acceptance: service-worker offline reload and solo start');
    await navigate(cdp, `${BASE_URL}/?debug=1`);
    console.log('Browser acceptance: waiting for service-worker control');
    await waitFor(
      () => evaluate(cdp, "navigator.serviceWorker.ready.then(() => Boolean(navigator.serviceWorker.controller))"),
      'service-worker-controlled page',
    );
    console.log('Browser acceptance: allowing idle prefetch');
    await delay(1500);
    console.log('Browser acceptance: reloading offline');
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    const offlineReload = waitForEvent(cdp, 'Page.loadEventFired', 'offline reload');
    await cdp.send('Page.reload');
    await offlineReload;
    await waitForSelector(cdp, '#main-menu-view');
    assert(
      await evaluate(cdp, 'Boolean(navigator.serviceWorker.controller)'),
      'offline reload was not controlled by the service worker',
    );
    console.log('Browser acceptance: starting cached solo session');
    const offlineSoloNavigation = waitForEvent(cdp, 'Page.loadEventFired', 'offline solo navigation');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/?debug=1&map=poolrooms&seed=4242` });
    await offlineSoloNavigation;
    await waitFor(() => evaluate(cdp, 'Boolean(window.__backsilence_session)'), 'offline solo session');
    const guardViolations = await evaluate(cdp, 'window.__backsilence.networkGuardStats()?.violations');
    assert(guardViolations === 0, `solo NetworkGuard violations: ${guardViolations}`);
    await screenshot(cdp, directory, 'offline-solo');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

    const forbidden = requests.filter((url) => {
      const isData = url.startsWith('data:');
      const sameOrigin = url.startsWith(BASE_URL);
      const binaryAsset = /\.(?:png|jpe?g|webp|svg|mp3|wav|ogg|woff2?|ttf)(?:\?|$)/i.test(url);
      return (!isData && !sameOrigin) || binaryAsset;
    });
    assert(forbidden.length === 0, `forbidden network requests: ${forbidden.join(', ')}`);
    assert(exceptions.length === 0, `runtime exceptions: ${exceptions.join(' | ')}`);
    assert(warnings.length === 0, `console warnings/errors: ${warnings.join(' | ')}`);
    console.log(`Browser acceptance passed. Screenshots: ${directory}`);
  } finally {
    cdp?.close();
    chrome?.kill();
    preview?.kill();
  }
}

main().catch((error) => {
  console.error(`Browser acceptance failed: ${error instanceof Error ? error.message : String(error)}`);
  if (warnings.length > 0) console.error(`Console warnings/errors: ${warnings.join(' | ')}`);
  if (exceptions.length > 0) console.error(`Runtime exceptions: ${exceptions.join(' | ')}`);
  process.exitCode = 1;
});
