#!/usr/bin/env node
/* ── render-baseline.mjs ─────────────────────────────────────────────────────
 *  Prompt 4 Section 5: Offline Audio Baseline Renderer & Spectrogram Generator.
 *  Uses Headless Chrome + OfflineAudioContext at 48 kHz (zero runtime dependencies).
 *  Renders key voices and scene mixes into:
 *  - WAV files (in reports/audio/baseline/, git-ignored)
 *  - Analysis metrics JSON (committed)
 *  - Spectrogram PNGs (committed)
 * ──────────────────────────────────────────────────────────────────────── */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve, basename } from 'node:path';
import { parseWav, analyzeAudio } from './analyze.mjs';
import { runCompare } from './compare.mjs';

const ROOT = process.cwd();
const BASELINE_DIR = resolve(ROOT, 'reports/audio/baseline');

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
  throw new Error('Chrome not found.');
}

async function getFreePort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.msgId = 0;
    this.pending = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });
    this.ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${res.exceptionDetails.text || res.exceptionDetails.exception?.description}`);
    }
    return res.result?.value;
  }
  close() {
    try { this.ws.close(); } catch {}
  }
}

async function main() {
  await mkdir(BASELINE_DIR, { recursive: true });
  console.log('[baseline] Launching Vite and Headless Chrome for 48 kHz Offline Audio rendering...');

  const port = await getFreePort();
  const cdpPort = await getFreePort();

  const vite = spawn('npx', ['vite', '--port', String(port), '--no-clearScreen'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((res) => {
    vite.stdout.on('data', (d) => {
      if (d.toString().includes('Local:')) res();
    });
    setTimeout(res, 2500);
  });

  const userDataDir = await mkdtemp(resolve(tmpdir(), 'chrome-audio-baseline-'));
  const chrome = spawn(
    chromePath(),
    [
      '--headless=new',
      '--disable-gpu',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--autoplay-policy=no-user-gesture-required',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  const cleanup = () => {
    try { chrome.kill(); } catch {}
    try { vite.kill(); } catch {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });

  let wsUrl = null;
  for (let i = 0; i < 40; i++) {
    try {
      const targetsRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const targets = await targetsRes.json();
      const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
      if (pageTarget?.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!wsUrl) throw new Error('Failed to attach CDP');

  const cdp = new CDPClient(wsUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/?smoke=1` });
  await new Promise((r) => setTimeout(r, 3000));

  // Renders list
  const scenesToRender = [
    { id: 'calm_room_tone', type: 'ambience', duration: 30 },
    { id: 'water_splash', type: 'voice', voice: 'splash_big', duration: 3 },
    { id: 'creature_roar', type: 'voice', voice: 'monster_roar', duration: 4 },
    { id: 'jumpscare', type: 'voice', voice: 'jumpscare', duration: 2.5 },
    { id: 'reverb_poolroom', type: 'reverb', preset: 'poolroom', duration: 5 },
    { id: 'drowned_metro_ambience', type: 'metro', duration: 30 },
    { id: 'neon_flood_ambience', type: 'neon', duration: 30 },
    { id: 'busiest_scene', type: 'busiest', duration: 30 },
  ];

  console.log(`[baseline] Rendering ${scenesToRender.length} baseline audio items at 48,000 Hz...`);

  for (const item of scenesToRender) {
    const t0 = Date.now();
    process.stdout.write(`  -> Rendering ${item.id} (${item.duration}s)... `);

    const renderScript = `
      (async () => {
        const { createNoiseBuffers } = await import('/src/audio/Noise.ts');
        const { ReverbUnit, PRESET_CONFIGS } = await import('/src/audio/Reverb.ts');
        const splashes = await import('/src/audio/voices/Splashes.ts');
        const footsteps = await import('/src/audio/voices/Footsteps.ts');
        const loops = await import('/src/audio/voices/Loops.ts');
        const monster = await import('/src/audio/voices/Monster.ts');
        const jumpscare = await import('/src/audio/voices/Jumpscare.ts');
        const machinery = await import('/src/audio/voices/Machinery.ts');
        const ambience = await import('/src/audio/voices/AmbienceBeds.ts');

        const sampleRate = 48000;
        const duration = ${item.duration};
        const ctx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);
        const noise = createNoiseBuffers(ctx);
        const dest = ctx.destination;
        const reverb = ctx.createGain();
        reverb.gain.value = 0.5;
        reverb.connect(dest);

        const vCtx = { ctx, destination: dest, reverbSend: reverb, noise, seed: 12345 };

        if ('${item.type}' === 'voice') {
          if ('${item.voice}' === 'splash_big') splashes.playSplash('big', vCtx);
          else if ('${item.voice}' === 'monster_roar') monster.playMonsterRoar(vCtx);
          else if ('${item.voice}' === 'jumpscare') jumpscare.playJumpscare(vCtx);
        } else if ('${item.type}' === 'reverb') {
          // Play a sharp Dirac pulse into the poolroom convolver
          const revUnit = new ReverbUnit(ctx);
          revUnit.setPreset('poolroom');
          revUnit.output.connect(dest);
          const buf = ctx.createBuffer(1, 128, sampleRate);
          const ch = buf.getChannelData(0);
          ch[0] = 1.0;
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(revUnit.input);
          src.start(0.05);
        } else if ('${item.type}' === 'ambience') {
          loops.playHumLoop(vCtx);
          loops.playLapLoop(vCtx);
          // periodic drips
          for (let t = 0.5; t < duration; t += 2.5) {
            ctx.suspend(t).then(() => {
              footsteps.playDrip(vCtx);
              ctx.resume();
            });
          }
        } else if ('${item.type}' === 'metro') {
          ambience.playAmbienceTunnels(vCtx);
        } else if ('${item.type}' === 'neon') {
          loops.playHumLoop(vCtx);
          machinery.playGeneratorLoop(vCtx);
        } else if ('${item.type}' === 'busiest') {
          loops.playHumLoop(vCtx);
          loops.playLapLoop(vCtx);
          machinery.playWaterInflowLoop(vCtx);
          for (let i = 0; i < 8; i++) footsteps.playDrip(vCtx);
          ctx.suspend(1.0).then(() => {
            monster.playMonsterRoar(vCtx);
            ctx.resume();
          });
        }

        const rendered = await ctx.startRendering();
        const left = rendered.getChannelData(0);
        const right = rendered.getChannelData(1);
        const numSamples = left.length;

        // Encode 16-bit PCM WAV
        const wavBuffer = new ArrayBuffer(44 + numSamples * 4);
        const view = new DataView(wavBuffer);
        const writeString = (offset, str) => {
          for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
        };
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + numSamples * 4, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, 2, true); // 2 channels
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 4, true);
        view.setUint16(32, 4, true);
        view.setUint16(34, 16, true); // 16 bits
        writeString(36, 'data');
        view.setUint32(40, numSamples * 4, true);

        let offset = 44;
        for (let i = 0; i < numSamples; i++) {
          let sL = Math.max(-1, Math.min(1, left[i]));
          let sR = Math.max(-1, Math.min(1, right[i]));
          view.setInt16(offset, sL < 0 ? sL * 0x8000 : sL * 0x7FFF, true);
          offset += 2;
          view.setInt16(offset, sR < 0 ? sR * 0x8000 : sR * 0x7FFF, true);
          offset += 2;
        }

        // Convert WAV to base64
        let binary = '';
        const bytes = new Uint8Array(wavBuffer);
        const len = bytes.byteLength;
        const chunk = 0x8000;
        for (let i = 0; i < len; i += chunk) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, len)));
        }
        const wavBase64 = btoa(binary);

        // Generate Spectrogram PNG
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 360;
        const g = canvas.getContext('2d');
        g.fillStyle = '#05040a';
        g.fillRect(0, 0, canvas.width, canvas.height);

        // Draw title
        g.fillStyle = '#e0e0e0';
        g.font = '14px sans-serif';
        g.fillText('${item.id} Spectrogram (48 kHz)', 15, 25);

        // Simple STFT visualizer
        const fftSize = 1024;
        const hopSize = 512;
        const numFrames = Math.min(canvas.width - 60, Math.floor((numSamples - fftSize) / hopSize));
        const step = Math.max(1, Math.floor(numFrames / (canvas.width - 60)));

        const plotX = 50;
        const plotY = 40;
        const plotW = canvas.width - 70;
        const plotH = canvas.height - 70;

        for (let px = 0; px < plotW; px++) {
          const frameIdx = Math.floor(px * (numFrames / plotW));
          const sampleOffset = frameIdx * hopSize;
          if (sampleOffset + fftSize > numSamples) break;

          // Compute rough energy in 64 vertical bands
          for (let py = 0; py < 64; py++) {
            const freqStart = Math.floor((py / 64) * (fftSize / 2));
            const freqEnd = Math.floor(((py + 1) / 64) * (fftSize / 2));
            let energy = 0;
            for (let k = freqStart; k <= freqEnd; k++) {
              const s = left[sampleOffset + k] || 0;
              energy += s * s;
            }
            const db = 10 * Math.log10(Math.max(1e-9, energy / (freqEnd - freqStart + 1)));
            const norm = Math.max(0, Math.min(1, (db + 70) / 70));

            // Inferno colormap approx
            const r = Math.floor(norm * 255);
            const gr = Math.floor(Math.pow(norm, 2) * 200);
            const b = Math.floor(Math.pow(norm, 0.5) * 150);

            g.fillStyle = 'rgb(' + r + ',' + gr + ',' + b + ')';
            g.fillRect(plotX + px, plotY + plotH - (py + 1) * (plotH / 64), 1, Math.ceil(plotH / 64));
          }
        }

        // Draw Axes
        g.strokeStyle = '#555';
        g.strokeRect(plotX, plotY, plotW, plotH);
        g.fillStyle = '#888';
        g.font = '10px monospace';
        g.fillText('24 kHz', 5, plotY + 10);
        g.fillText('12 kHz', 5, plotY + plotH / 2);
        g.fillText('0 Hz', 15, plotY + plotH);
        g.fillText('0s', plotX, plotY + plotH + 15);
        g.fillText(duration + 's', plotX + plotW - 20, plotY + plotH + 15);

        const pngBase64 = canvas.toDataURL('image/png').split(',')[1];
        return { wavBase64, pngBase64 };
      })()
    `;

    const { wavBase64, pngBase64 } = await cdp.evaluate(renderScript);
    const wavPath = resolve(BASELINE_DIR, `${item.id}.wav`);
    const jsonPath = resolve(BASELINE_DIR, `${item.id}.json`);
    const pngPath = resolve(BASELINE_DIR, `${item.id}_spectrogram.png`);

    const wavBuf = Buffer.from(wavBase64, 'base64');
    await writeFile(wavPath, wavBuf);
    await writeFile(pngPath, Buffer.from(pngBase64, 'base64'));

    const wav = parseWav(wavBuf);
    const stats = analyzeAudio(wav);
    await writeFile(jsonPath, JSON.stringify(stats, null, 2));

    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`done in ${elapsed}s (LUFS: ${stats.integratedLufs}, Peak: ${stats.peakDbFs} dBFS, Centroid: ${stats.spectralCentroidHz} Hz)`);
  }

  cdp.close();
  cleanup();

  console.log('\n[baseline] All baseline renders complete. Running compare suite...\n');
  await runCompare();
}

main().catch((err) => {
  console.error('[baseline] Error:', err);
  process.exit(1);
});
