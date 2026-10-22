/* ── CausticsBaker.ts ──────────────────────────────────────────────────────
 *  GPU-accelerated procedural caustics texture baker using WebGLRenderTarget.
 *  Produces a seamless, tileable network of sharp underwater light filaments.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  WebGLRenderer,
  WebGLRenderTarget,
  Scene,
  OrthographicCamera,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  RGBAFormat,
  LinearMipmapLinearFilter,
  LinearFilter,
  RepeatWrapping,
  DataTexture,
  CanvasTexture,
  NoColorSpace,
} from 'three';
import { acquireCanvas } from '../core/canvasPool.js';

export interface CausticsBakerOptions {
  size?: number;
  seed?: number;
}

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
varying vec2 vUv;
uniform float uSeed;

void main() {
  // Multiply UV by 2*PI for exact period wrap-around
  const float TWO_PI = 6.28318530718;
  vec2 uv = vUv * TWO_PI;

  // Layer 1 periodic warped field
  float p1 = sin(uv.x * 2.0 + sin(uv.y * 3.0 + uSeed * 0.1));
  float p2 = cos(uv.y * 2.0 + cos(uv.x * 3.0 + uSeed * 0.13));
  float cell1 = abs(p1 + p2) * 0.5;

  // Layer 2 higher-frequency periodic warped field
  float p3 = sin(uv.x * 4.0 - cos(uv.y * 4.0 + uSeed * 0.2));
  float p4 = cos(uv.y * 4.0 - sin(uv.x * 4.0 + uSeed * 0.25));
  float cell2 = abs(p3 + p4) * 0.5;

  // Filament forming via power curve
  float filament1 = pow(clamp(1.0 - cell1, 0.0, 1.0), 3.5);
  float filament2 = pow(clamp(1.0 - cell2, 0.0, 1.0), 3.0);

  float caustic = clamp(filament1 * 0.75 + filament2 * 0.5, 0.0, 1.0);

  // Output bright filaments with slight amber-teal tint in RGB
  gl_FragColor = vec4(caustic, caustic, caustic, 1.0);
}
`;

/**
 * Bake a tileable caustics texture on the GPU.
 * Copies the result to a standalone DataTexture and disposes of all temp bake resources.
 */
export function makeCausticsTexture(
  renderer?: WebGLRenderer,
  options: CausticsBakerOptions = {},
): DataTexture | CanvasTexture {
  const size = options.size ?? 512;
  const seed = options.seed ?? 42;

  // Fallback for headless environments without WebGL context
  if (!renderer) {
    return makeCausticsTextureCPU(size, seed);
  }

  // 1. Setup render target
  const target = new WebGLRenderTarget(size, size, {
    format: RGBAFormat,
    wrapS: RepeatWrapping,
    wrapT: RepeatWrapping,
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: true,
  });

  // 2. Setup fullscreen quad
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const scene = new Scene();
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uSeed: { value: seed },
    },
    depthTest: false,
    depthWrite: false,
  });

  const quad = new Mesh(geometry, material);
  scene.add(quad);

  // 3. Render
  const prevTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(prevTarget);

  // 4. Read back pixels to decouple from RenderTarget before disposal
  const pixels = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);

  // 5. Cleanup bake resources
  target.dispose();
  geometry.dispose();
  material.dispose();

  // 6. Build standalone DataTexture
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;

  return texture;
}

/**
 * CPU fallback for headless/test environments or WebGL fallback.
 */
export function makeCausticsTextureCPU(size: number, seed: number): CanvasTexture {
  const pooled = acquireCanvas(size, size);
  const data = new Uint8ClampedArray(size * size * 4);
  const TWO_PI = Math.PI * 2.0;

  for (let y = 0; y < size; y++) {
    const v = (y / size) * TWO_PI;
    for (let x = 0; x < size; x++) {
      const u = (x / size) * TWO_PI;

      const p1 = Math.sin(u * 2.0 + Math.sin(v * 3.0 + seed * 0.1));
      const p2 = Math.cos(v * 2.0 + Math.cos(u * 3.0 + seed * 0.13));
      const cell1 = Math.abs(p1 + p2) * 0.5;

      const p3 = Math.sin(u * 4.0 - Math.cos(v * 4.0 + seed * 0.2));
      const p4 = Math.cos(v * 4.0 - Math.sin(u * 4.0 + seed * 0.25));
      const cell2 = Math.abs(p3 + p4) * 0.5;

      const f1 = Math.pow(Math.max(0.0, 1.0 - cell1), 3.5);
      const f2 = Math.pow(Math.max(0.0, 1.0 - cell2), 3.0);
      const caustic = Math.min(1.0, f1 * 0.75 + f2 * 0.5);
      const val = Math.round(caustic * 255);

      const idx = (y * size + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }

  const imgData = new ImageData(data, size, size);
  pooled.ctx.putImageData(imgData, 0, 0);

  const texture = new CanvasTexture(pooled.canvas as HTMLCanvasElement);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  return texture;
}
