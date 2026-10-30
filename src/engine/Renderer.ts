/* ── Renderer.ts ───────────────────────────────────────────────────────────
 *  Three.js WebGL2 renderer wrapper.
 *  Handles ACESFilmic tonemapping, dynamic exposure, PCFSoft shadows,
 *  adaptive DPR, ResizeObserver scaling, and WebGL context restoration.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  WebGLRenderer,
  ACESFilmicToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
  SRGBColorSpace,
  PCFSoftShadowMap,
  type Scene,
  type Camera,
} from 'three';
import type { Settings } from '../types/contracts.js';
import { resolveQuality, resolveQualityTier } from './Quality.js';

export class EngineRenderer {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver | null = null;
  private settings: Settings;
  private sceneRendersThisFrame = 0;
  private lastFrameSceneRenders = 0;
  private lastFrameCalls = 0;
  private lastFrameTriangles = 0;

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
      antialias: resolveQualityTier(settings.graphics.quality) !== 'low',
      alpha: false,
      depth: true,
      stencil: false,
    });

    // Wrap render to accurately count 3D scene renders per frame
    const originalRender = this.renderer.render.bind(this.renderer);
    this.renderer.render = (scene: Scene, camera: Camera): void => {
      const isScene = Boolean((scene as unknown as { isScene?: boolean })?.isScene);
      const isAuxiliary = Boolean(scene?.userData?.isAuxiliaryPass);
      if (isScene && !isAuxiliary) {
        this.sceneRendersThisFrame++;
      }
      originalRender(scene, camera);
    };

    this.renderer.outputColorSpace = SRGBColorSpace;
    this.setToneMapping(settings.graphics.toneMapping ?? 'agx');
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

    this.setToneMapping(s.graphics.toneMapping ?? 'agx');
  }

  setToneMapping(mode: string): void {
    const m = (mode || '').toLowerCase();
    if (m === 'agx') {
      this.renderer.toneMapping = AgXToneMapping;
    } else if (m === 'neutral') {
      this.renderer.toneMapping = NeutralToneMapping;
    } else {
      this.renderer.toneMapping = ACESFilmicToneMapping;
    }
  }

  private setupContextHandlers(): void {
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('[EngineRenderer] WebGL Context Lost');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('backsilence:webgl-lost', {
            detail: { reason: 'GPU graphics context was lost or reset by the operating system.' },
          }),
        );
      }
    });

    this.canvas.addEventListener('webglcontextrestored', () => {
      console.info('[EngineRenderer] WebGL Context Restored');
      this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('backsilence:webgl-restored'));
      }
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

  beginFrame(): void {
    this.sceneRendersThisFrame = 0;
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
  }

  endFrame(): { sceneRenders: number; calls: number; triangles: number } {
    this.lastFrameSceneRenders = this.sceneRendersThisFrame;
    this.lastFrameCalls = this.renderer.info.render.calls;
    this.lastFrameTriangles = this.renderer.info.render.triangles;
    this.sceneRendersThisFrame = 0;
    (this.renderer as unknown as { lastFrameCalls: number; lastFrameTriangles: number }).lastFrameCalls = this.lastFrameCalls;
    (this.renderer as unknown as { lastFrameCalls: number; lastFrameTriangles: number }).lastFrameTriangles = this.lastFrameTriangles;

    const metrics = {
      sceneRenders: this.lastFrameSceneRenders,
      calls: this.lastFrameCalls,
      triangles: this.lastFrameTriangles,
    };

    if (typeof window !== 'undefined') {
      const g = window as unknown as {
        __backsilence_renderer_info?: typeof metrics;
        __poolrooms_renderer_info?: typeof metrics;
      };
      g.__backsilence_renderer_info = metrics;
      g.__poolrooms_renderer_info = metrics;
    }

    return metrics;
  }

  getSceneRenders(): number {
    return this.lastFrameSceneRenders;
  }

  getFrameMetrics(): { sceneRenders: number; calls: number; triangles: number } {
    return {
      sceneRenders: this.lastFrameSceneRenders,
      calls: this.lastFrameCalls,
      triangles: this.lastFrameTriangles,
    };
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
