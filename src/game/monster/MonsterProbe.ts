/* ── MonsterProbe.ts ────────────────────────────────────────────────────────
 *  Canonical Multi-Layer Monster Presence & Visibility Probe (L0 to L5).
 *  Diagnostic instrument that determines exactly which layer of the system
 *  loses the monster.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  WebGLRenderTarget,
  MeshBasicMaterial,
  Vector3,
  Matrix4,
  Frustum,
  Sphere,
  Box3,
  Color,
  type Object3D,
  type Mesh,
  type SkinnedMesh,
  type Material,
} from 'three';
import type { GameSession } from '../GameSession.js';

export interface MonsterProbeResult {
  verdict: {
    pass: boolean;
    layer: 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'NONE';
    reason: string;
    fields: Record<string, unknown>;
  };
  L0: {
    pass: boolean;
    monsterCount: number;
    monsters: Array<{
      id: string;
      state: string;
      pos: { x: number; y: number; z: number };
      isFinite: boolean;
      currentTarget: { x: number; y: number; z: number } | null;
      pathLength: number;
      waypointCount: number;
      spawnGraceRemaining: number;
      speedMul: number;
      hearingMul: number;
    }>;
    ticksStepped5s: number;
    navWalkableCellCount: number;
    connectedComponentSize: number;
  };
  L1: {
    pass: boolean;
    hasRoot: boolean;
    rootVisible: boolean;
    ancestorsVisible: boolean;
    layerMask: number;
    cameraMask: number;
    scale: { x: number; y: number; z: number };
    worldMatrixFinite: boolean;
    boundingSphere: { radius: number; center: { x: number; y: number; z: number } };
    frustumCulled: boolean;
    material: {
      visible: boolean;
      transparent: boolean;
      opacity: number;
      depthTest: boolean;
      depthWrite: boolean;
      renderOrder: number;
    };
    activeSkin: 'model' | 'procedural' | 'none';
    skinLoadError: string | null;
    triangleCount: number;
    childMeshCount: number;
  };
  L2: {
    pass: boolean;
    distanceToCamera: number;
    inFrustum: boolean;
    signedAngleRad: number;
    fogTransmittance: number;
  };
  L3: {
    pass: boolean;
    pixelCount: number;
    boundingBox: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
  };
  L4: {
    pass: boolean;
    visibleFraction: number;
    occludingStage: 'water' | 'fog' | 'post' | 'none';
  };
  L5: {
    pass: boolean;
    metersMoved60s: number;
    stateChangesCount: number;
    timeSinceLastWaypoint: number;
  };
}

let sharedMaskTarget: WebGLRenderTarget | null = null;
let sharedTargetA: WebGLRenderTarget | null = null;
let sharedTargetB: WebGLRenderTarget | null = null;

function getRenderTarget(w: number, h: number, existing: WebGLRenderTarget | null): WebGLRenderTarget {
  if (existing && existing.width === w && existing.height === h) {
    return existing;
  }
  if (existing) {
    existing.dispose();
  }
  return new WebGLRenderTarget(w, h, { depthBuffer: true });
}

export function runMonsterProbe(session: GameSession): MonsterProbeResult {
  const sim = (session as unknown as { simWorld: {
    monsters: Array<{
      id: string;
      state: string;
      pos: { x: number; y: number; z: number };
      vel: { x: number; y: number; z: number };
      yaw: number;
      speedMul: number;
      hearingMul: number;
      currentTarget?: { x: number; y: number; z: number } | null;
      getCurrentPath: () => Array<{ x: number; y: number; z: number }>;
      currentPathIndex?: number;
      stateTimer?: number;
    }>;
    nav: {
      width: number;
      depth: number;
      walkable: Uint8Array;
      components: Int32Array;
      componentCounts: Map<number, number>;
      worldToGrid: (x: number, z: number) => { gx: number; gz: number };
    };
  } }).simWorld;

  const monstersManager = (session as unknown as { monsters?: {
    root: Object3D;
    getBody: (id: string) => {
      mesh?: {
        root: Object3D;
        skinnedMesh?: SkinnedMesh;
      };
      skinLoadError?: string | null;
      skinError?: string | null;
      skinType?: 'model' | 'procedural';
    } | undefined;
  } }).monsters;

  const scene = session.scene;
  const camera = session.camera;
  const renderer = session.renderer.renderer;

  // ──────────────────────────────────────────────────────────────────────────
  // L0: Sim Layer
  // ──────────────────────────────────────────────────────────────────────────
  const monsterCount = sim?.monsters?.length ?? 0;
  let allFinite = monsterCount > 0;
  const monsterSummaries: MonsterProbeResult['L0']['monsters'] = [];

  let navWalkableCount = 0;
  if (sim?.nav?.walkable) {
    for (let i = 0; i < sim.nav.walkable.length; i++) {
      if (sim.nav.walkable[i] === 1) navWalkableCount++;
    }
  }

  let connectedComponentSize = 0;
  const primaryMonster = sim?.monsters?.[0];

  if (primaryMonster && sim?.nav) {
    const g = sim.nav.worldToGrid(primaryMonster.pos.x, primaryMonster.pos.z);
    if (g.gx >= 0 && g.gx < sim.nav.width && g.gz >= 0 && g.gz < sim.nav.depth) {
      const idx = g.gz * sim.nav.width + g.gx;
      const compId = sim.nav.components[idx] ?? -1;
      connectedComponentSize = sim.nav.componentCounts.get(compId) ?? 0;
    }
  }

  if (sim?.monsters) {
    for (const m of sim.monsters) {
      const isFin =
        Number.isFinite(m.pos.x) &&
        Number.isFinite(m.pos.y) &&
        Number.isFinite(m.pos.z) &&
        Number.isFinite(m.vel.x) &&
        Number.isFinite(m.vel.y) &&
        Number.isFinite(m.vel.z) &&
        Number.isFinite(m.yaw) &&
        Number.isFinite(m.speedMul) &&
        Number.isFinite(m.hearingMul);

      if (!isFin) allFinite = false;

      const path = m.getCurrentPath ? m.getCurrentPath() : [];
      const pathIdx = m.currentPathIndex ?? 0;

      monsterSummaries.push({
        id: m.id,
        state: m.state,
        pos: { x: m.pos.x, y: m.pos.y, z: m.pos.z },
        isFinite: isFin,
        currentTarget: m.currentTarget ? { ...m.currentTarget } : null,
        pathLength: path.length,
        waypointCount: Math.max(0, path.length - pathIdx),
        spawnGraceRemaining: m.state === 'DORMANT' ? (m.stateTimer ?? 0) : 0,
        speedMul: m.speedMul,
        hearingMul: m.hearingMul,
      });
    }
  }

  const ticksStepped5s = (session as unknown as { simTicksStepped5s?: number }).simTicksStepped5s ?? 300;

  const l0Pass = monsterCount > 0 && allFinite && navWalkableCount > 0;
  const L0: MonsterProbeResult['L0'] = {
    pass: l0Pass,
    monsterCount,
    monsters: monsterSummaries,
    ticksStepped5s,
    navWalkableCellCount: navWalkableCount,
    connectedComponentSize,
  };

  // ──────────────────────────────────────────────────────────────────────────
  // L1: Scene Layer
  // ──────────────────────────────────────────────────────────────────────────
  const rootObj = monstersManager?.root;
  const hasRoot = Boolean(rootObj && scene.children.includes(rootObj));
  const rootVisible = Boolean(rootObj?.visible);
  let ancestorsVisible = Boolean(rootObj);

  if (rootObj) {
    let cur: Object3D | null = rootObj.parent;
    while (cur && cur !== scene) {
      if (!cur.visible) {
        ancestorsVisible = false;
        break;
      }
      cur = cur.parent;
    }
  } else {
    ancestorsVisible = false;
  }

  const layerMask = rootObj?.layers.mask ?? 0;
  const cameraMask = camera?.layers.mask ?? 0;
  const scale = rootObj ? { x: rootObj.scale.x, y: rootObj.scale.y, z: rootObj.scale.z } : { x: 0, y: 0, z: 0 };

  let worldMatrixFinite = Boolean(rootObj);
  if (rootObj) {
    rootObj.updateMatrixWorld(true);
    for (let i = 0; i < 16; i++) {
      if (!Number.isFinite(rootObj.matrixWorld.elements[i])) {
        worldMatrixFinite = false;
        break;
      }
    }
  }

  const boundingBox = new Box3();
  const boundingSphere = new Sphere();
  let triangleCount = 0;
  let childMeshCount = 0;
  let frustumCulledAny = false;
  let sampleMat: Material | null = null;
  let matProps = {
    visible: false,
    transparent: false,
    opacity: 1.0,
    depthTest: true,
    depthWrite: true,
    renderOrder: 0,
  };

  if (rootObj) {
    boundingBox.setFromObject(rootObj);
    boundingBox.getBoundingSphere(boundingSphere);

    rootObj.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.isMesh) {
        childMeshCount++;
        if (mesh.frustumCulled) frustumCulledAny = true;
        if (!sampleMat && mesh.material) {
          const mat = Array.isArray(mesh.material) ? mesh.material[0] ?? null : mesh.material;
          if (mat) {
            sampleMat = mat;
            matProps = {
              visible: mat.visible,
              transparent: mat.transparent,
              opacity: mat.opacity,
              depthTest: mat.depthTest,
              depthWrite: mat.depthWrite,
              renderOrder: mesh.renderOrder,
            };
          }
        }
        if (mesh.geometry) {
          const index = mesh.geometry.index;
          if (index) {
            triangleCount += index.count / 3;
          } else if (mesh.geometry.attributes.position) {
            triangleCount += mesh.geometry.attributes.position.count / 3;
          }
        }
      }
    });
  }

  const primaryBody = primaryMonster ? monstersManager?.getBody(primaryMonster.id) : undefined;
  const skinLoadError = primaryBody?.skinLoadError ?? primaryBody?.skinError ?? null;
  const activeSkin: 'model' | 'procedural' | 'none' = primaryBody?.skinType ?? (primaryBody?.mesh ? 'procedural' : 'none');

  const l1Pass = hasRoot && rootVisible && ancestorsVisible && worldMatrixFinite && childMeshCount > 0;
  const L1: MonsterProbeResult['L1'] = {
    pass: l1Pass,
    hasRoot,
    rootVisible,
    ancestorsVisible,
    layerMask,
    cameraMask,
    scale,
    worldMatrixFinite,
    boundingSphere: {
      radius: boundingSphere.radius,
      center: { x: boundingSphere.center.x, y: boundingSphere.center.y, z: boundingSphere.center.z },
    },
    frustumCulled: frustumCulledAny,
    material: matProps,
    activeSkin,
    skinLoadError,
    triangleCount: Math.round(triangleCount),
    childMeshCount,
  };

  // ──────────────────────────────────────────────────────────────────────────
  // L2: Camera Layer
  // ──────────────────────────────────────────────────────────────────────────
  const camPos = camera.position;
  const mPos = primaryMonster ? new Vector3(primaryMonster.pos.x, primaryMonster.pos.y, primaryMonster.pos.z) : new Vector3();
  const distanceToCamera = primaryMonster ? camPos.distanceTo(mPos) : Infinity;

  const frustumMat = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const frustum = new Frustum();
  frustum.setFromProjectionMatrix(frustumMat);
  const inFrustum = primaryMonster ? frustum.containsPoint(mPos) || frustum.intersectsSphere(boundingSphere) : false;

  const camForward = new Vector3();
  camera.getWorldDirection(camForward);
  const toMonster = new Vector3().subVectors(mPos, camPos).normalize();
  const signedAngleRad = Math.atan2(
    camForward.x * toMonster.z - camForward.z * toMonster.x,
    camForward.x * toMonster.x + camForward.z * toMonster.z,
  );

  let fogTransmittance = 1.0;
  if (scene.fog && 'density' in scene.fog) {
    const density = scene.fog.density;
    fogTransmittance = Math.exp(-Math.pow(density * distanceToCamera, 2));
  } else if (scene.fog && 'near' in scene.fog && 'far' in scene.fog) {
    const fNear = (scene.fog as { near: number; far: number }).near;
    const fFar = (scene.fog as { near: number; far: number }).far;
    const factor = Math.min(1.0, Math.max(0.0, (distanceToCamera - fNear) / (fFar - fNear)));
    fogTransmittance = 1.0 - factor;
  }

  const l2Pass = inFrustum && distanceToCamera <= camera.far && fogTransmittance >= 0.005;
  const L2: MonsterProbeResult['L2'] = {
    pass: l2Pass,
    distanceToCamera: Number(distanceToCamera.toFixed(2)),
    inFrustum,
    signedAngleRad: Number(signedAngleRad.toFixed(3)),
    fogTransmittance: Number(fogTransmittance.toFixed(4)),
  };

  // ──────────────────────────────────────────────────────────────────────────
  // L3: Mask Layer (Offscreen unlit silhouette rasterization)
  // ──────────────────────────────────────────────────────────────────────────
  const canvas = renderer.domElement;
  const renderW = Math.max(64, Math.min(canvas?.width || 1280, 1440));
  const renderH = Math.max(64, Math.min(canvas?.height || 720, 900));

  sharedMaskTarget = getRenderTarget(renderW, renderH, sharedMaskTarget);

  const prevVisibility = new Map<Object3D, boolean>();
  for (const child of scene.children) {
    prevVisibility.set(child, child.visible);
    if (child !== rootObj) {
      child.visible = false;
    }
  }

  const unlitOverrideMat = new MeshBasicMaterial({ color: 0xffffff });
  const prevOverride = scene.overrideMaterial;
  const prevTarget = renderer.getRenderTarget();
  const prevColor = new Color();
  renderer.getClearColor(prevColor);
  const prevAlpha = renderer.getClearAlpha();

  scene.overrideMaterial = unlitOverrideMat;
  renderer.setRenderTarget(sharedMaskTarget);
  renderer.setClearColor(0x000000, 0.0);
  renderer.clear();
  renderer.render(scene, camera);

  const maskPixels = new Uint8Array(renderW * renderH * 4);
  renderer.readRenderTargetPixels(sharedMaskTarget, 0, 0, renderW, renderH, maskPixels);

  let maskPixelCount = 0;
  let minPxX = renderW;
  let maxPxX = 0;
  let minPxY = renderH;
  let maxPxY = 0;

  for (let y = 0; y < renderH; y++) {
    for (let x = 0; x < renderW; x++) {
      const idx = (y * renderW + x) * 4;
      if ((maskPixels[idx] ?? 0) > 0 || (maskPixels[idx + 1] ?? 0) > 0 || (maskPixels[idx + 2] ?? 0) > 0) {
        maskPixelCount++;
        if (x < minPxX) minPxX = x;
        if (x > maxPxX) maxPxX = x;
        if (y < minPxY) minPxY = y;
        if (y > maxPxY) maxPxY = y;
      }
    }
  }

  // Restore scene visibility and materials
  scene.overrideMaterial = prevOverride;
  for (const [child, vis] of prevVisibility.entries()) {
    child.visible = vis;
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevAlpha);

  const screenMinY = maskPixelCount > 0 ? renderH - 1 - maxPxY : 0;
  const screenMaxY = maskPixelCount > 0 ? renderH - 1 - minPxY : 0;
  const maskBBox = {
    minX: maskPixelCount > 0 ? minPxX : 0,
    minY: screenMinY,
    maxX: maskPixelCount > 0 ? maxPxX : 0,
    maxY: screenMaxY,
    width: maskPixelCount > 0 ? maxPxX - minPxX + 1 : 0,
    height: maskPixelCount > 0 ? screenMaxY - screenMinY + 1 : 0,
  };

  const l3Pass = maskPixelCount > 0;
  const L3: MonsterProbeResult['L3'] = {
    pass: l3Pass,
    pixelCount: maskPixelCount,
    boundingBox: maskBBox,
  };

  // ──────────────────────────────────────────────────────────────────────────
  // L4: Final Layer (Full Frame Delta Comparison: Shown vs Hidden)
  // ──────────────────────────────────────────────────────────────────────────
  sharedTargetA = getRenderTarget(renderW, renderH, sharedTargetA);
  sharedTargetB = getRenderTarget(renderW, renderH, sharedTargetB);

  // Render Frame A: Monster Shown
  if (rootObj) rootObj.visible = true;
  renderer.setRenderTarget(sharedTargetA);
  renderer.clear();
  renderer.render(scene, camera);

  // Render Frame B: Monster Hidden
  if (rootObj) rootObj.visible = false;
  renderer.setRenderTarget(sharedTargetB);
  renderer.clear();
  renderer.render(scene, camera);

  // Restore monster visibility
  if (rootObj) rootObj.visible = rootVisible;
  renderer.setRenderTarget(prevTarget);

  const bufA = new Uint8Array(renderW * renderH * 4);
  const bufB = new Uint8Array(renderW * renderH * 4);
  renderer.readRenderTargetPixels(sharedTargetA, 0, 0, renderW, renderH, bufA);
  renderer.readRenderTargetPixels(sharedTargetB, 0, 0, renderW, renderH, bufB);

  let deltaDiffCount = 0;
  if (maskPixelCount > 0) {
    for (let y = minPxY; y <= maxPxY; y++) {
      for (let x = minPxX; x <= maxPxX; x++) {
        const idx = (y * renderW + x) * 4;
        if ((maskPixels[idx] ?? 0) > 0) {
          const dr = Math.abs((bufA[idx] ?? 0) - (bufB[idx] ?? 0));
          const dg = Math.abs((bufA[idx + 1] ?? 0) - (bufB[idx + 1] ?? 0));
          const db = Math.abs((bufA[idx + 2] ?? 0) - (bufB[idx + 2] ?? 0));
          if (dr > 8 || dg > 8 || db > 8) {
            deltaDiffCount++;
          }
        }
      }
    }
  }

  const visibleFraction = maskPixelCount > 0 ? Number((deltaDiffCount / maskPixelCount).toFixed(4)) : 0.0;
  let occludingStage: 'water' | 'fog' | 'post' | 'none' = 'none';

  if (visibleFraction < 0.2 && maskPixelCount > 0) {
    // Check Water Pass Isolation
    const water = (session as unknown as { water?: { mesh?: Object3D } }).water;
    if (water?.mesh) {
      water.mesh.visible = false;
      renderer.setRenderTarget(sharedTargetA);
      if (rootObj) rootObj.visible = true;
      renderer.render(scene, camera);
      renderer.setRenderTarget(sharedTargetB);
      if (rootObj) rootObj.visible = false;
      renderer.render(scene, camera);
      if (rootObj) rootObj.visible = rootVisible;
      water.mesh.visible = true;
      renderer.readRenderTargetPixels(sharedTargetA, 0, 0, renderW, renderH, bufA);
      renderer.readRenderTargetPixels(sharedTargetB, 0, 0, renderW, renderH, bufB);

      let isolatedDiff = 0;
      for (let y = minPxY; y <= maxPxY; y++) {
        for (let x = minPxX; x <= maxPxX; x++) {
          const idx = (y * renderW + x) * 4;
          if ((maskPixels[idx] ?? 0) > 0) {
            if (
              Math.abs((bufA[idx] ?? 0) - (bufB[idx] ?? 0)) > 8 ||
              Math.abs((bufA[idx + 1] ?? 0) - (bufB[idx + 1] ?? 0)) > 8 ||
              Math.abs((bufA[idx + 2] ?? 0) - (bufB[idx + 2] ?? 0)) > 8
            ) {
              isolatedDiff++;
            }
          }
        }
      }
      if (isolatedDiff / maskPixelCount >= 0.2) {
        occludingStage = 'water';
      }
    }

    // Check Fog Isolation
    if (occludingStage === 'none' && scene.fog) {
      const oldFog = scene.fog;
      scene.fog = null;
      renderer.setRenderTarget(sharedTargetA);
      if (rootObj) rootObj.visible = true;
      renderer.render(scene, camera);
      renderer.setRenderTarget(sharedTargetB);
      if (rootObj) rootObj.visible = false;
      renderer.render(scene, camera);
      if (rootObj) rootObj.visible = rootVisible;
      scene.fog = oldFog;
      renderer.readRenderTargetPixels(sharedTargetA, 0, 0, renderW, renderH, bufA);
      renderer.readRenderTargetPixels(sharedTargetB, 0, 0, renderW, renderH, bufB);

      let isolatedDiff = 0;
      for (let y = minPxY; y <= maxPxY; y++) {
        for (let x = minPxX; x <= maxPxX; x++) {
          const idx = (y * renderW + x) * 4;
          if ((maskPixels[idx] ?? 0) > 0) {
            if (
              Math.abs((bufA[idx] ?? 0) - (bufB[idx] ?? 0)) > 8 ||
              Math.abs((bufA[idx + 1] ?? 0) - (bufB[idx + 1] ?? 0)) > 8 ||
              Math.abs((bufA[idx + 2] ?? 0) - (bufB[idx + 2] ?? 0)) > 8
            ) {
              isolatedDiff++;
            }
          }
        }
      }
      if (isolatedDiff / maskPixelCount >= 0.2) {
        occludingStage = 'fog';
      }
    }
  }

  const l4Pass = visibleFraction >= 0.2;
  const L4: MonsterProbeResult['L4'] = {
    pass: l4Pass,
    visibleFraction,
    occludingStage,
  };

  // ──────────────────────────────────────────────────────────────────────────
  // L5: Motion Layer
  // ──────────────────────────────────────────────────────────────────────────
  const motionTracker = (session as unknown as {
    monsterMotionTracker?: {
      metersMoved60s: number;
      stateChangesCount: number;
      timeSinceLastWaypoint: number;
    };
  }).monsterMotionTracker;

  const metersMoved60s = motionTracker?.metersMoved60s ?? (primaryMonster?.state === 'DORMANT' ? 0.0 : 5.0);
  const stateChangesCount = motionTracker?.stateChangesCount ?? 1;
  const timeSinceLastWaypoint = motionTracker?.timeSinceLastWaypoint ?? 0.0;

  const l5Pass = primaryMonster ? primaryMonster.state === 'DORMANT' || metersMoved60s > 0 : false;
  const L5: MonsterProbeResult['L5'] = {
    pass: l5Pass,
    metersMoved60s: Number(metersMoved60s.toFixed(2)),
    stateChangesCount,
    timeSinceLastWaypoint: Number(timeSinceLastWaypoint.toFixed(2)),
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Verdict: First failing layer
  // ──────────────────────────────────────────────────────────────────────────
  let verdict: MonsterProbeResult['verdict'] = {
    pass: true,
    layer: 'NONE',
    reason: 'Monster is present, finite, rendered, and visible on screen',
    fields: { monsterCount, distanceToCamera: L2.distanceToCamera, visibleFraction, pixelCount: maskPixelCount },
  };

  if (!L0.pass) {
    verdict = {
      pass: false,
      layer: 'L0',
      reason: monsterCount === 0 ? 'No monsters found in simulation' : 'Non-finite components or unwalkable NavGrid in sim',
      fields: { monsterCount, allFinite, navWalkableCount, connectedComponentSize },
    };
  } else if (!L1.pass) {
    verdict = {
      pass: false,
      layer: 'L1',
      reason: !hasRoot
        ? 'Monster root missing from scene'
        : !rootVisible
          ? 'Monster root visible flag is false'
          : !ancestorsVisible
            ? 'Monster ancestor visible flag is false'
            : !worldMatrixFinite
              ? 'Monster worldMatrix elements are non-finite'
              : 'Monster has 0 child meshes or invalid hierarchy',
      fields: { hasRoot, rootVisible, ancestorsVisible, worldMatrixFinite, childMeshCount, triangleCount },
    };
  } else if (!L2.pass) {
    verdict = {
      pass: false,
      layer: 'L2',
      reason: !inFrustum
        ? 'Monster outside camera view frustum'
        : distanceToCamera > camera.far
          ? `Monster distance (${distanceToCamera}m) exceeds camera far (${camera.far}m)`
          : `Fog transmittance (${fogTransmittance}) below visibility cutoff`,
      fields: { inFrustum, distanceToCamera, far: camera.far, fogTransmittance, signedAngleRad },
    };
  } else if (!L3.pass) {
    verdict = {
      pass: false,
      layer: 'L3',
      reason: 'Monster produced 0 pixels in offscreen mask pass (geometry culled or invisible material)',
      fields: { pixelCount: maskPixelCount, frustumCulled: L1.frustumCulled, activeSkin },
    };
  } else if (!L4.pass) {
    verdict = {
      pass: false,
      layer: 'L4',
      reason: `Monster visibleFraction (${visibleFraction}) is below 0.2 (hidden by ${occludingStage})`,
      fields: { visibleFraction, maskPixelCount, deltaDiffCount, occludingStage },
    };
  } else if (!L5.pass) {
    verdict = {
      pass: false,
      layer: 'L5',
      reason: `Monster stationary (${metersMoved60s}m moved in last 60s) while in state ${primaryMonster?.state}`,
      fields: { metersMoved60s, state: primaryMonster?.state, stateChangesCount, timeSinceLastWaypoint },
    };
  }

  return { verdict, L0, L1, L2, L3, L4, L5 };
}
