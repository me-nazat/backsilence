/* ── CameraRig.ts ──────────────────────────────────────────────────────────
 *  First-person camera rig, near-plane law (G7), submersion tracking,
 *  and WebGL2 depth-composite scene rendering pipeline.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderTarget,
  DepthTexture,
  UnsignedIntType,
  HalfFloatType,
  LinearFilter,
} from 'three';
import { PlayerCamera } from '../player/PlayerCamera.js';
import type { EngineRenderer } from '../../engine/Renderer.js';
import type { PostFX } from '../../engine/PostFX.js';
import type { WaterSystem } from '../water/WaterSystem.js';
import type { Settings } from '../../types/contracts.js';
import type { LensOverlay } from '../water/LensOverlay.js';

export class CameraRig {
  readonly camera: PerspectiveCamera;
  readonly playerCamera: PlayerCamera;

  private opaqueDepthTarget: WebGLRenderTarget | null = null;
  private waterCompositeTarget: WebGLRenderTarget | null = null;
  private waterScene: Scene | null = null;
  private isSubmerged = false;

  constructor(settings: Settings, fov = 75, aspect = 16 / 9) {
    // G7 Law: near plane strictly 0.05m to prevent viewport clipping with walls and creature jaws
    this.camera = new PerspectiveCamera(fov, aspect, 0.05, 200.0);
    this.playerCamera = new PlayerCamera(this.camera, settings);
  }

  initRenderTargets(glRenderer: import('three').WebGLRenderer, cssW: number, cssH: number): void {
    if (!glRenderer.capabilities?.isWebGL2) return;

    const dpr = glRenderer.getPixelRatio();
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));

    const depthTex = new DepthTexture(w, h);
    depthTex.type = UnsignedIntType;

    this.opaqueDepthTarget = new WebGLRenderTarget(w, h, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      type: HalfFloatType,
      depthTexture: depthTex,
    });

    this.waterCompositeTarget = new WebGLRenderTarget(w, h, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      type: HalfFloatType,
      depthBuffer: true,
    });
  }

  updateAspect(cssW: number, cssH: number): void {
    if (cssH <= 0) return;
    const targetAspect = cssW / cssH;
    if (Math.abs(this.camera.aspect - targetAspect) > 0.001) {
      this.camera.aspect = targetAspect;
      this.camera.updateProjectionMatrix();
    }
  }

  updateSubmersion(waterY: number): boolean {
    const wasSubmerged = this.isSubmerged;
    this.isSubmerged = this.camera.position.y < waterY;
    return wasSubmerged !== this.isSubmerged;
  }

  renderFrame(
    renderer: EngineRenderer,
    scene: Scene,
    water: WaterSystem,
    postFX: PostFX,
    dt: number,
    container: HTMLElement,
    settings: Settings,
    lensOverlay?: LensOverlay | null,
    primaryMonsterPos?: { x: number; y: number; z: number } | null,
  ): void {
    renderer.beginFrame();
    const glRenderer = renderer.renderer;
    const isMediumOrHigh = settings.graphics.quality !== 'low';

    if (
      this.opaqueDepthTarget &&
      this.waterCompositeTarget &&
      glRenderer.capabilities?.isWebGL2 &&
      isMediumOrHigh
    ) {
      const dpr = glRenderer.getPixelRatio();
      const cssW = container.clientWidth || 1280;
      const cssH = container.clientHeight || 720;
      const w = Math.max(1, Math.floor(cssW * dpr));
      const h = Math.max(1, Math.floor(cssH * dpr));

      this.updateAspect(cssW, cssH);

      if (this.opaqueDepthTarget.width !== w || this.opaqueDepthTarget.height !== h) {
        this.opaqueDepthTarget.setSize(w, h);
        if (this.opaqueDepthTarget.depthTexture) {
          this.opaqueDepthTarget.depthTexture.dispose();
          const dtTex = new DepthTexture(w, h);
          dtTex.type = UnsignedIntType;
          this.opaqueDepthTarget.depthTexture = dtTex;
        }
        this.waterCompositeTarget.setSize(w, h);
        lensOverlay?.resize(cssW, cssH);
        postFX.setSize(w, h);
      }

      // 1. Planar reflection
      water.updatePlanarReflection(glRenderer, scene, this.camera);

      // 2. Wave sim
      water.renderWaveSim(glRenderer);

      // 3. Render opaque pre-pass
      water.mesh.visible = false;
      glRenderer.setRenderTarget(this.opaqueDepthTarget);
      renderer.render(scene, this.camera);
      glRenderer.setRenderTarget(null);
      water.mesh.visible = true;

      // 4. Blit opaque color to water composite target
      postFX.copyTexture(this.opaqueDepthTarget.texture, this.waterCompositeTarget);

      // Blit depth buffer
      const gl = glRenderer.getContext() as WebGL2RenderingContext;
      if (gl && gl.blitFramebuffer) {
        const readFbo = (glRenderer.properties.get(this.opaqueDepthTarget) as { __webglFramebuffer?: WebGLFramebuffer })?.__webglFramebuffer;
        const drawFbo = (glRenderer.properties.get(this.waterCompositeTarget) as { __webglFramebuffer?: WebGLFramebuffer })?.__webglFramebuffer;
        if (readFbo && drawFbo) {
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readFbo);
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, drawFbo);
          gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        }
      }

      if (primaryMonsterPos && water.material?.uniforms['uMonsterPos']) {
        (water.material.uniforms['uMonsterPos'].value as Vector3).set(
          primaryMonsterPos.x,
          water.currentWaterY,
          primaryMonsterPos.z,
        );
      }

      water.setDepthTextures(
        this.opaqueDepthTarget.depthTexture,
        this.opaqueDepthTarget.texture,
        this.camera.near,
        this.camera.far,
        w,
        h,
      );

      // Render water scene
      if (!this.waterScene) {
        this.waterScene = new Scene();
        this.waterScene.userData.isAuxiliaryPass = true;
      }
      if (scene.fog) {
        this.waterScene.fog = scene.fog;
      }
      this.waterScene.add(water.mesh);
      if (water.motesMesh) {
        this.waterScene.add(water.motesMesh);
      }

      const prevAutoClear = glRenderer.autoClear;
      glRenderer.autoClear = false;
      glRenderer.setRenderTarget(this.waterCompositeTarget);
      glRenderer.render(this.waterScene, this.camera);
      glRenderer.setRenderTarget(null);
      glRenderer.autoClear = prevAutoClear;

      scene.add(water.mesh);
      if (water.motesMesh) {
        scene.add(water.motesMesh);
      }

      // 5. Post effects
      postFX.render(scene, this.camera, dt, this.waterCompositeTarget.texture);
    } else {
      const w = container.clientWidth || 1280;
      const h = container.clientHeight || 720;
      this.updateAspect(w, h);
      water.mesh.visible = true;
      glRenderer.setRenderTarget(null);
      renderer.render(scene, this.camera);
    }
  }

  getOpaqueDepthTarget(): WebGLRenderTarget | null {
    return this.opaqueDepthTarget;
  }

  getWaterCompositeTarget(): WebGLRenderTarget | null {
    return this.waterCompositeTarget;
  }

  dispose(): void {
    if (this.opaqueDepthTarget) {
      if (this.opaqueDepthTarget.depthTexture) this.opaqueDepthTarget.depthTexture.dispose();
      this.opaqueDepthTarget.texture.dispose();
      this.opaqueDepthTarget.dispose();
      this.opaqueDepthTarget = null;
    }
    if (this.waterCompositeTarget) {
      this.waterCompositeTarget.texture.dispose();
      this.waterCompositeTarget.dispose();
      this.waterCompositeTarget = null;
    }
  }
}
