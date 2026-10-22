/* ── Renderer.ts ───────────────────────────────────────────────────────────
 *  Three.js WebGL2 renderer wrapper.
 *  Handles ACESFilmic tonemapping, dynamic exposure, PCFSoft shadows,
 *  adaptive DPR, ResizeObserver scaling, and WebGL context restoration.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  WebGLRenderer,
  ACESFilmicToneMapping,
  SRGBColorSpace,
  PCFSoftShadowMap,
  type Scene,
  type Camera,
} from 'three';
import type { Settings } from '../types/contracts.js';
import { resolveQuality } from './Quality.js';

export class EngineRenderer {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver | null = null;
  private settings: Settings;

  get currentSettings(): Settings {
    return this.settings;
  }

  constructor(container: HTMLElement, settings: Settings) {
    this.settings = settings;

    const quality = resolveQuality(settings.graphics.quality);
    const canvas = document.createElement('canvas');
    canvas.id = 'webgl-canvas';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);
    this.canvas = canvas;

    this.renderer = new WebGLRenderer({
      canvas,
      powerPreference: 'high-performance',
      antialias: settings.graphics.quality === 'high',
      alpha: false,
      depth: true,
      stencil: false,
    });

    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.applySettings(settings);

    if (quality.shadowType === 'pcfsoft') {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = PCFSoftShadowMap;
    } else {
      this.renderer.shadowMap.enabled = false;
    }

    this.setupContextHandlers();
    this.setupResize(container);
  }

  applySettings(s: Settings): void {
    this.settings = s;
    const quality = resolveQuality(s.graphics.quality);

    // Brightness maps to exposure 0.8–1.4 (default ~1.1 at brightness 1.0)
    const exposure = 0.8 + (s.graphics.brightness / 2.0) * 0.6;
    this.renderer.toneMappingExposure = exposure;

    // Adaptive DPR
    const rawDpr = window.devicePixelRatio ?? 1.0;
    const effectiveDpr = Math.min(rawDpr, quality.dprCap) * (s.graphics.resolutionScale / 100.0);
    this.renderer.setPixelRatio(Math.max(0.5, effectiveDpr));
  }

  private setupContextHandlers(): void {
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('[EngineRenderer] WebGL Context Lost');
    });

    this.canvas.addEventListener('webglcontextrestored', () => {
      console.info('[EngineRenderer] WebGL Context Restored');
      this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
    });
  }

  private setupResize(container: HTMLElement): void {
    const handleResize = (): void => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      this.renderer.setSize(w, h, false);
    };

    handleResize();

    this.resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    this.resizeObserver.observe(container);
  }

  render(scene: Scene, camera: Camera): void {
    this.renderer.render(scene, camera);
  }

  dispose(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.renderer.dispose();
    if (this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
  }
}
