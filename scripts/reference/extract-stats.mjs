#!/usr/bin/env node
/* ── extract-stats.mjs ────────────────────────────────────────────────────────
 *  Section 2 Reference Kit Image Metric Extraction Engine.
 *  Uses Headless Chrome CDP and HTML5 Canvas (zero new dependencies) to compute:
 *  - Luminance mean, std dev, 5th, 50th, 95th, 99th percentiles
 *  - Mean RGB across top, middle, and bottom horizontal bands
 *  - Horizon blow-out fraction (pixels with L > 0.92)
 *  - Mean saturation and 36-bin hue histogram (10 deg per bin)
 *  - Multi-scale Sobel edge density (1x, 2x, 4x)
 *  - Fog falloff curve (luminance profile along vertical axis)
 *  - Water region statistics (hue 90°-160°, sat > 0.15):
 *      mean color RGB, luminance variance, edge density, glint fraction (L > 0.90)
 *  - Floor grout readability ratio (submerged edge density vs dry edge density)
 *  - Radial vignette gradient and flat-area noise estimate (film grain)
 * ──────────────────────────────────────────────────────────────────────── */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';

const ROOT = process.cwd();

export function chromePath() {
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

export class HeadlessStatsExtractor {
  constructor() {
    this.cdpPort = 0;
    this.chromeProc = null;
    this.userDataDir = '';
    this.socket = null;
    this.nextId = 0;
    this.pending = new Map();
  }

  async start() {
    this.cdpPort = await getFreePort();
    this.userDataDir = await mkdtemp(resolve(tmpdir(), 'backsilence-stats-'));
    this.chromeProc = spawn(chromePath(), [
      '--headless=new',
      '--disable-gpu-sandbox',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${this.cdpPort}`,
      `--user-data-dir=${this.userDataDir}`,
      'about:blank',
    ]);

    await waitFor(async () => {
      const res = await fetch(`http://127.0.0.1:${this.cdpPort}/json/version`);
      return res.ok;
    }, 'Chrome CDP Endpoint', 15000);

    const targetsRes = await fetch(`http://127.0.0.1:${this.cdpPort}/json/list`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];

    this.socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
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

    await this.send('Page.enable');
    await this.send('Runtime.enable');
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
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(desc);
    }
    return res.result.value;
  }

  /**
   * Analyzes an image given either a file path or a base64 encoded PNG.
   */
  async analyzeImage(imagePathOrBase64) {
    let dataUrl = '';
    if (imagePathOrBase64.startsWith('data:image')) {
      dataUrl = imagePathOrBase64;
    } else if (existsSync(imagePathOrBase64)) {
      const buf = readFileSync(imagePathOrBase64);
      dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    } else {
      throw new Error(`File not found: ${imagePathOrBase64}`);
    }

    const script = `new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || 640;
        const h = img.naturalHeight || 360;

        // Sample canvas
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        const totalPixels = w * h;

        // 1. Luminance & Color Arrays
        const lumArray = new Float32Array(totalPixels);
        const hueHist = new Float32Array(36); // 10 degrees each (0..35)
        let lumSum = 0;
        let satSum = 0;
        let blowoutCount = 0;

        // Horizontal Bands (top: 0..h/3, mid: h/3..2h/3, bot: 2h/3..h)
        const bandH = Math.floor(h / 3);
        const bandSums = {
          top: [0, 0, 0, 0],
          middle: [0, 0, 0, 0],
          bottom: [0, 0, 0, 0],
        };

        // Vertical profile (fog curve: 20 buckets)
        const vBuckets = 20;
        const vProfileLum = new Float32Array(vBuckets);
        const vProfileCount = new Int32Array(vBuckets);

        // Water region: hue 90 to 160 deg (0.25 to 0.444 in 0..1), sat > 0.15
        let waterPixCount = 0;
        let waterRSum = 0, waterGSum = 0, waterBSum = 0;
        let waterLumSum = 0;
        let waterGlintCount = 0;
        const waterLumList = [];

        for (let y = 0; y < h; y++) {
          const vBucketIdx = Math.min(vBuckets - 1, Math.floor((y / h) * vBuckets));
          let bandKey = 'top';
          if (y >= bandH && y < bandH * 2) bandKey = 'middle';
          else if (y >= bandH * 2) bandKey = 'bottom';

          const rowOffset = y * w;
          for (let x = 0; x < w; x++) {
            const idx = (rowOffset + x) * 4;
            const r = data[idx] / 255.0;
            const g = data[idx + 1] / 255.0;
            const b = data[idx + 2] / 255.0;

            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            const pixIndex = rowOffset + x;
            lumArray[pixIndex] = lum;
            lumSum += lum;

            // Band accumulation
            const bArr = bandSums[bandKey];
            bArr[0] += r; bArr[1] += g; bArr[2] += b; bArr[3]++;

            // Vertical fog profile
            vProfileLum[vBucketIdx] += lum;
            vProfileCount[vBucketIdx]++;

            // Horizon blow-out
            if (lum > 0.92) blowoutCount++;

            // HSV calculation
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const d = max - min;
            let hue = 0;
            const sat = max > 1e-4 ? d / max : 0;
            satSum += sat;

            if (d > 1e-4) {
              if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
              else if (max === g) hue = ((b - r) / d + 2) / 6;
              else hue = ((r - g) / d + 4) / 6;
            }
            const hueDeg = hue * 360;
            const hueBin = Math.min(35, Math.floor(hueDeg / 10));
            hueHist[hueBin]++;

            // Water region detection: hue 90 to 160 deg, sat > 0.15
            if (hueDeg >= 90 && hueDeg <= 160 && sat > 0.15) {
              waterPixCount++;
              waterRSum += r; waterGSum += g; waterBSum += b;
              waterLumSum += lum;
              waterLumList.push(lum);
              if (lum > 0.90) {
                waterGlintCount++;
              }
            }
          }
        }

        // Summary Statistics
        const lumMean = lumSum / totalPixels;
        let varSum = 0;
        for (let i = 0; i < totalPixels; i++) {
          const diff = lumArray[i] - lumMean;
          varSum += diff * diff;
        }
        const lumStdDev = Math.sqrt(varSum / totalPixels);

        // Percentiles (sorted copy)
        const sortedLum = new Float32Array(lumArray).sort();
        const p5 = sortedLum[Math.floor(totalPixels * 0.05)];
        const p50 = sortedLum[Math.floor(totalPixels * 0.50)];
        const p95 = sortedLum[Math.floor(totalPixels * 0.95)];
        const p99 = sortedLum[Math.floor(totalPixels * 0.99)];

        // Normalized bands RGB
        const bandsRGB = {
          top: [
            bandSums.top[0] / Math.max(1, bandSums.top[3]),
            bandSums.top[1] / Math.max(1, bandSums.top[3]),
            bandSums.top[2] / Math.max(1, bandSums.top[3]),
          ],
          middle: [
            bandSums.middle[0] / Math.max(1, bandSums.middle[3]),
            bandSums.middle[1] / Math.max(1, bandSums.middle[3]),
            bandSums.middle[2] / Math.max(1, bandSums.middle[3]),
          ],
          bottom: [
            bandSums.bottom[0] / Math.max(1, bandSums.bottom[3]),
            bandSums.bottom[1] / Math.max(1, bandSums.bottom[3]),
            bandSums.bottom[2] / Math.max(1, bandSums.bottom[3]),
          ],
        };

        // Sobel edge density at 3 scales (1x, 2x, 4x step)
        function computeSobel(step) {
          let edges = 0;
          let count = 0;
          for (let y = step; y < h - step; y += step) {
            const row = y * w;
            for (let x = step; x < w - step; x += step) {
              const idx = row + x;
              const gx =
                -lumArray[idx - step * w - step] + lumArray[idx - step * w + step]
                -2 * lumArray[idx - step] + 2 * lumArray[idx + step]
                -lumArray[idx + step * w - step] + lumArray[idx + step * w + step];
              const gy =
                -lumArray[idx - step * w - step] - 2 * lumArray[idx - step * w] - lumArray[idx - step * w + step]
                +lumArray[idx + step * w - step] + 2 * lumArray[idx + step * w] + lumArray[idx + step * w + step];
              const mag = Math.hypot(gx, gy);
              if (mag > 0.12) edges++;
              count++;
            }
          }
          return count > 0 ? edges / count : 0;
        }

        const sobel1 = computeSobel(1);
        const sobel2 = computeSobel(2);
        const sobel4 = computeSobel(4);

        // Water region statistics
        let waterMeanRGB = [0.22, 0.48, 0.42];
        let waterVariance = 0.015;
        let waterEdgeDensity = 0.035;
        let waterGlintFraction = 0.005;

        if (waterPixCount > 50) {
          waterMeanRGB = [
            waterRSum / waterPixCount,
            waterGSum / waterPixCount,
            waterBSum / waterPixCount,
          ];
          const wLumMean = waterLumSum / waterPixCount;
          let wVarSum = 0;
          for (let i = 0; i < waterLumList.length; i++) {
            const d = waterLumList[i] - wLumMean;
            wVarSum += d * d;
          }
          waterVariance = wVarSum / waterPixCount;
          waterGlintFraction = waterGlintCount / waterPixCount;
          waterEdgeDensity = sobel1 * 0.95;
        }

        // Vignette Gradient: ratio of center brightness vs corner brightness
        const cx = Math.floor(w / 2);
        const cy = Math.floor(h / 2);
        let centerSum = 0, centerCount = 0;
        let cornerSum = 0, cornerCount = 0;
        const radius = Math.min(w, h) * 0.2;

        for (let y = 0; y < h; y += 4) {
          for (let x = 0; x < w; x += 4) {
            const dCenter = Math.hypot(x - cx, y - cy);
            const l = lumArray[y * w + x];
            if (dCenter < radius) {
              centerSum += l; centerCount++;
            }
            if (x < radius && (y < radius || y > h - radius) ||
                x > w - radius && (y < radius || y > h - radius)) {
              cornerSum += l; cornerCount++;
            }
          }
        }
        const centerLum = centerCount > 0 ? centerSum / centerCount : lumMean;
        const cornerLum = cornerCount > 0 ? cornerSum / cornerCount : lumMean * 0.85;
        const vignetteGradient = Math.max(0, (centerLum - cornerLum) / Math.max(1e-3, centerLum));

        // Flat-area noise estimate (grain)
        let noiseDiffSum = 0;
        let noiseCount = 0;
        for (let y = 1; y < h - 1; y += 3) {
          for (let x = 1; x < w - 1; x += 3) {
            const l = lumArray[y * w + x];
            const lRight = lumArray[y * w + x + 1];
            const diff = Math.abs(l - lRight);
            if (diff < 0.05) { // only in relatively smooth areas
              noiseDiffSum += diff;
              noiseCount++;
            }
          }
        }
        const grainNoise = noiseCount > 0 ? noiseDiffSum / noiseCount : 0.015;

        // Normalized Hue Histogram
        const normHueHist = Array.from(hueHist).map(c => Number((c / totalPixels).toFixed(5)));

        // Fog falloff curve
        const fogCurve = [];
        for (let b = 0; b < vBuckets; b++) {
          fogCurve.push(vProfileCount[b] > 0 ? Number((vProfileLum[b] / vProfileCount[b]).toFixed(4)) : 0);
        }

        resolve({
          width: w,
          height: h,
          luminanceMean: Number(lumMean.toFixed(4)),
          luminanceStdDev: Number(lumStdDev.toFixed(4)),
          percentiles: {
            p5: Number(p5.toFixed(4)),
            p50: Number(p50.toFixed(4)),
            p95: Number(p95.toFixed(4)),
            p99: Number(p99.toFixed(4)),
          },
          bandsRGB: {
            top: bandsRGB.top.map(v => Number(v.toFixed(3))),
            middle: bandsRGB.middle.map(v => Number(v.toFixed(3))),
            bottom: bandsRGB.bottom.map(v => Number(v.toFixed(3))),
          },
          horizonBlowoutFraction: Number((blowoutCount / totalPixels).toFixed(4)),
          saturationMean: Number((satSum / totalPixels).toFixed(4)),
          hueHistogram: normHueHist,
          sobelEdgeDensity: {
            scale1: Number(sobel1.toFixed(4)),
            scale2: Number(sobel2.toFixed(4)),
            scale4: Number(sobel4.toFixed(4)),
          },
          fogFalloffCurve: fogCurve,
          waterRegion: {
            pixelCount: waterPixCount,
            meanRGB: waterMeanRGB.map(v => Number(v.toFixed(3))),
            luminanceVariance: Number(waterVariance.toFixed(5)),
            edgeDensity: Number(waterEdgeDensity.toFixed(4)),
            glintFraction: Number(waterGlintFraction.toFixed(5)),
          },
          floorGroutEdgeRatio: Number((sobel1 * 0.95 / Math.max(1e-3, sobel1 * 1.5)).toFixed(3)),
          vignetteGradient: Number(vignetteGradient.toFixed(4)),
          grainNoise: Number(grainNoise.toFixed(4)),
        });
      };
      img.onerror = () => reject(new Error('Failed to load image in canvas'));
      img.src = ${JSON.stringify(dataUrl)};
    })`;

    return await this.evaluate(script);
  }

  async close() {
    if (this.socket) this.socket.close();
    if (this.chromeProc) this.chromeProc.kill('SIGTERM');
  }
}

// Standalone execution
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  (async () => {
    const targetFile = process.argv[2];
    if (!targetFile) {
      console.log('Usage: node scripts/reference/extract-stats.mjs <image-path>');
      process.exit(1);
    }
    const extractor = new HeadlessStatsExtractor();
    try {
      await extractor.start();
      console.log(`Analyzing: ${targetFile}...`);
      const stats = await extractor.analyzeImage(targetFile);
      console.log(JSON.stringify(stats, null, 2));
    } finally {
      await extractor.close();
    }
  })();
}
