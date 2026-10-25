/* ── FarSilhouettes.ts ────────────────────────────────────────────────────
 *  Phase D Section 8 & Section 11: Atmospheric Far Silhouettes in Dense Fog.
 *  Places 1 to 3 concentric layers of instanced low-polygon architectural shapes
 *  (low slabs, colonnade pillars, portal arches) in the distant haze.
 *
 *  Tiers:
 *  - Low: 1 layer
 *  - Medium: 2 layers
 *  - High: 3 layers
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Group,
  InstancedMesh,
  BoxGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  Matrix4,
  Vector3,
  Color,
} from 'three';
import { Rng } from '../../procedural/core/prng.js';

export interface FarSilhouettesOptions {
  tier?: 'low' | 'medium' | 'high';
  fogColor?: string | number;
  seed?: number;
  baseRadius?: number; // default: 46m
}

export function createFarSilhouettes(options: FarSilhouettesOptions = {}): Group {
  const tier = options.tier ?? 'high';
  const fogHex = options.fogColor ?? '#d9d3a2';
  const seed = options.seed ?? 777;
  const baseR = options.baseRadius ?? 46.0;

  const numLayers = tier === 'high' ? 3 : tier === 'medium' ? 2 : 1;
  const root = new Group();
  root.name = 'FarSilhouettes';

  const rng = new Rng(seed);
  const baseColor = new Color(fogHex);

  const dummyMatrix = new Matrix4();
  const dummyPos = new Vector3();
  const dummyScale = new Vector3();

  // Low-poly shared geometries
  const slabGeom = new BoxGeometry(12.0, 0.35, 6.0);
  const pillarGeom = new CylinderGeometry(0.55, 0.55, 8.0, 10);
  const archTopGeom = new BoxGeometry(8.0, 1.2, 1.8);

  // Calculate total instances across all layers
  let totalSlabs = 0;
  let totalPillars = 0;
  let totalArches = 0;
  for (let layer = 0; layer < numLayers; layer++) {
    const count = 16 + layer * 8;
    totalSlabs += count;
    totalPillars += count;
    totalArches += Math.floor(count / 2);
  }

  const sharedMat = new MeshBasicMaterial({
    color: 0xffffff,
    fog: true,
    depthWrite: true,
  });

  const slabMesh = new InstancedMesh(slabGeom, sharedMat, Math.max(1, totalSlabs));
  slabMesh.name = 'FarSlabs';
  slabMesh.matrixAutoUpdate = false;

  const pillarMesh = new InstancedMesh(pillarGeom, sharedMat, Math.max(1, totalPillars));
  pillarMesh.name = 'FarPillars';
  pillarMesh.matrixAutoUpdate = false;

  const archMesh = new InstancedMesh(archTopGeom, sharedMat, Math.max(1, totalArches));
  archMesh.name = 'FarArches';
  archMesh.matrixAutoUpdate = false;

  let slabIdx = 0;
  let pillarIdx = 0;
  let archIdx = 0;

  // Distribute shapes across layers
  for (let layer = 0; layer < numLayers; layer++) {
    const layerRadius = baseR + layer * 18.0;
    // Contrast factor: layer 0 is darker silhouette (0.86), layer 2 dissolves into fog (0.97)
    const contrastFactor = 0.86 + layer * 0.055;
    const layerColor = baseColor.clone().multiplyScalar(contrastFactor);

    const countPerLayer = 16 + layer * 8;

    for (let i = 0; i < countPerLayer; i++) {
      const angle = (i / countPerLayer) * Math.PI * 2 + rng.range(-0.08, 0.08);
      const r = layerRadius + rng.range(-4.0, 4.0);
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;

      // Position slab
      dummyPos.set(x, 0.15, z);
      dummyScale.set(rng.range(0.8, 1.4), 1.0, rng.range(0.8, 1.3));
      dummyMatrix.makeRotationY(angle + Math.PI * 0.5);
      dummyMatrix.scale(dummyScale);
      dummyMatrix.setPosition(dummyPos);
      slabMesh.setMatrixAt(slabIdx, dummyMatrix);
      slabMesh.setColorAt(slabIdx, layerColor);
      slabIdx++;

      // Position pillar
      const px = x + Math.cos(angle + 0.05) * 5.0;
      const pz = z + Math.sin(angle + 0.05) * 5.0;
      dummyPos.set(px, 3.8, pz);
      dummyScale.set(1.0, rng.range(0.9, 1.3), 1.0);
      dummyMatrix.identity();
      dummyMatrix.scale(dummyScale);
      dummyMatrix.setPosition(dummyPos);
      pillarMesh.setMatrixAt(pillarIdx, dummyMatrix);
      pillarMesh.setColorAt(pillarIdx, layerColor);
      pillarIdx++;

      // Position arch on alternating instances
      if (i % 2 === 0 && archIdx < totalArches) {
        dummyPos.set(px, 7.8, pz);
        dummyMatrix.makeRotationY(angle);
        dummyMatrix.setPosition(dummyPos);
        archMesh.setMatrixAt(archIdx, dummyMatrix);
        archMesh.setColorAt(archIdx, layerColor);
        archIdx++;
      }
    }
  }

  slabMesh.instanceMatrix.needsUpdate = true;
  if (slabMesh.instanceColor) slabMesh.instanceColor.needsUpdate = true;
  pillarMesh.instanceMatrix.needsUpdate = true;
  if (pillarMesh.instanceColor) pillarMesh.instanceColor.needsUpdate = true;
  archMesh.instanceMatrix.needsUpdate = true;
  if (archMesh.instanceColor) archMesh.instanceColor.needsUpdate = true;

  root.add(slabMesh);
  root.add(pillarMesh);
  root.add(archMesh);

  return root;
}
