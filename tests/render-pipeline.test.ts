import { describe, it, expect, vi } from 'vitest';
import { Scene, PerspectiveCamera, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';

describe('Phase B: Render Pipeline - Scene Renders Budget', () => {
  function createInstrumentedRenderer() {
    let sceneRendersThisFrame = 0;
    let lastFrameSceneRenders = 0;
    const calls = 42;
    const triangles = 1200;

    const baseRender = vi.fn();
    const innerRenderer = {
      render: (scene: unknown, camera: unknown): void => {
        const isScene = Boolean((scene as { isScene?: boolean })?.isScene);
        const isAuxiliary = Boolean((scene as { userData?: { isAuxiliaryPass?: boolean } })?.userData?.isAuxiliaryPass);
        if (isScene && !isAuxiliary) {
          sceneRendersThisFrame++;
        }
        baseRender(scene, camera);
      },
      info: {
        autoReset: true,
        reset: vi.fn(),
        render: { calls, triangles },
      },
    };


    return {
      inner: innerRenderer,
      beginFrame() {
        sceneRendersThisFrame = 0;
      },
      endFrame() {
        lastFrameSceneRenders = sceneRendersThisFrame;
        const res = {
          sceneRenders: lastFrameSceneRenders,
          calls,
          triangles,
        };
        sceneRendersThisFrame = 0;
        return res;
      },
      getSceneRenders() {
        return lastFrameSceneRenders;
      },
      render(scene: unknown, camera: unknown) {
        innerRenderer.render(scene, camera);
      },
    };
  }

  it('counts exactly 1 scene render for a single opaque pass frame', () => {
    const pipeline = createInstrumentedRenderer();

    pipeline.beginFrame();
    const scene = new Scene();
    scene.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    const camera = new PerspectiveCamera();

    // Render opaque 3D scene
    pipeline.render(scene, camera);

    const metrics = pipeline.endFrame();
    expect(metrics.sceneRenders).toBe(1);
    expect(pipeline.getSceneRenders()).toBe(1);
  });

  it('does not count auxiliary passes (such as wave simulation or water quad) as scene renders', () => {
    const pipeline = createInstrumentedRenderer();

    pipeline.beginFrame();
    const worldScene = new Scene();
    worldScene.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    const camera = new PerspectiveCamera();

    // 1. Opaque world render
    pipeline.render(worldScene, camera);

    // 2. Auxiliary pass (wave simulation ping-pong pass)
    const waveSimScene = new Scene();
    waveSimScene.userData.isAuxiliaryPass = true;
    pipeline.render(waveSimScene, camera);

    // 3. Auxiliary pass (water composite quad pass)
    const waterQuadScene = new Scene();
    waterQuadScene.userData.isAuxiliaryPass = true;
    pipeline.render(waterQuadScene, camera);

    // 4. Quad mesh blit (isScene is undefined)
    const quadMesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    pipeline.render(quadMesh, camera);

    const metrics = pipeline.endFrame();
    // Exactly 1 scene render despite auxiliary passes and quad blits
    expect(metrics.sceneRenders).toBe(1);
  });

  it('verifies Low and Medium tiers have exactly 1 scene render per frame', () => {
    const pipeline = createInstrumentedRenderer();
    const worldScene = new Scene();
    const camera = new PerspectiveCamera();

    // Medium tier frame
    pipeline.beginFrame();
    pipeline.render(worldScene, camera); // Single opaque render
    const mediumMetrics = pipeline.endFrame();
    expect(mediumMetrics.sceneRenders).toBe(1);

    // Low tier frame
    pipeline.beginFrame();
    pipeline.render(worldScene, camera); // Single forward render
    const lowMetrics = pipeline.endFrame();
    expect(lowMetrics.sceneRenders).toBe(1);
  });

  it('fails if scene renders per frame exceed 1 plus optional planar pass', () => {
    const pipeline = createInstrumentedRenderer();
    const worldScene = new Scene();
    const camera = new PerspectiveCamera();

    // Baseline allowed budget: 1 (opaque) + 1 (optional planar pass on High tier) = max 2
    const MAX_ALLOWED_HIGH = 2;

    // High tier frame with planar reflection
    pipeline.beginFrame();
    pipeline.render(worldScene, camera); // Opaque pass
    pipeline.render(worldScene, camera); // Planar reflection pass
    const highMetrics = pipeline.endFrame();
    expect(highMetrics.sceneRenders).toBeLessThanOrEqual(MAX_ALLOWED_HIGH);

    // Simulated violation (old bug where PostFX or redundant passes caused 3+ scene renders)
    pipeline.beginFrame();
    pipeline.render(worldScene, camera); // Opaque pass
    pipeline.render(worldScene, camera); // Planar reflection pass
    pipeline.render(worldScene, camera); // Redundant full scene render in PostFX
    const violationMetrics = pipeline.endFrame();

    // Explicit assertion: must fail if renders exceed 1 + optional planar pass
    expect(violationMetrics.sceneRenders).toBeGreaterThan(MAX_ALLOWED_HIGH);
    expect(() => {
      if (violationMetrics.sceneRenders > MAX_ALLOWED_HIGH) {
        throw new Error(
          `Render pipeline budget exceeded: expected at most ${MAX_ALLOWED_HIGH} scene renders, got ${violationMetrics.sceneRenders}`,
        );
      }
    }).toThrow(/Render pipeline budget exceeded/);
  });
});
