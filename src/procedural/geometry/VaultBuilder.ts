/* ── VaultBuilder.ts ────────────────────────────────────────────────────────
 *  Procedural barrel vault and segmental arched ceiling builder.
 *  Generates continuous inward-facing curved intrados with meter-scaled whole-tile UV
 *  quantization, soft shallow cove ribs every ~4m, and cream vertex coloring (#b7a775)
 *  per reference footage. Eliminates radiating blades and void gaps.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  BufferGeometry,
  Float32BufferAttribute,
  Color,
  Mesh,
  InstancedMesh,
  PlaneGeometry,
  MeshStandardMaterial,
  DoubleSide,
  Matrix4,
  Vector3,
  Quaternion,
  Euler,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD } from '../../app/Config.js';
import { bakeVertexAO } from './VertexAO.js';

export interface VaultOptions {
  width: number;            // Total transverse span of the hall (m)
  length: number;           // Longitudinal extrusion length of the hall (m)
  springlineY?: number;     // Y elevation of the springline / wall cap (m), default 4.5m
  apexY?: number;           // Y elevation of the vault crown / apex (m), default 9.0m
  color?: string | number;  // Cream plaster/tile tint, default '#b7a775'
  radialSegments?: number;  // Segments across the curved transverse arc, default 64
  lengthSegments?: number;  // Segments along longitudinal length, default 32
  uvOffsetSeed?: number;
  ribInterval?: number;     // Interval between soft shallow cove ribs (m), default 4.0m
  ribDepth?: number;        // Inward cove projection (m), default 0.08m
  ribWidth?: number;        // Longitudinal width of each cove rib (m), default 0.45m
  includeRibs?: boolean;    // Whether to integrate soft ribs into the vault, default true
}

/**
 * Builds an inward-facing curved vault BufferGeometry spanning width (X) and length (Z).
 * Features smooth continuous curvature and integrated soft shallow cove ribs every ~4m.
 */
export function buildVaultGeometry(opts: VaultOptions): BufferGeometry {
  const width = Math.max(2.0, opts.width);
  const length = Math.max(2.0, opts.length);
  const springY = opts.springlineY ?? 4.5;
  const apexY = opts.apexY ?? 9.0;
  const radialSegs = opts.radialSegments ?? 64;
  const lengthSegs = opts.lengthSegments ?? 32;
  const tint = new Color(opts.color ?? '#b7a775');
  const includeRibs = opts.includeRibs ?? true;
  const ribInterval = opts.ribInterval ?? 4.0;
  const ribDepth = opts.ribDepth ?? 0.08;
  const ribWidth = opts.ribWidth ?? 0.45;

  // Rise from springline to apex
  const rise = Math.max(0.5, apexY - springY);
  const halfW = width * 0.5;

  // Compute radius R and center of circular arc using chord theorem:
  // R = (W^2 / (8 * rise)) + (rise / 2)
  const radius = (width * width) / (8.0 * rise) + rise * 0.5;
  const centerY = apexY - radius;
  // Half-angle subtended by arc
  const theta = Math.asin(Math.min(1.0, halfW / radius));
  const arcLength = 2.0 * radius * theta;

  // Whole-tile UV quantization along transverse arc (Glitch C10 law)
  const tileMeters = WORLD.TILE_METERS;
  const texMeters = WORLD.TEXTURE_METERS;
  const tilesAlongArc = Math.max(4, Math.round(arcLength / tileMeters));
  const repeatU = (tilesAlongArc * tileMeters) / texMeters;
  const repeatV = length / texMeters;

  const uShift = ((opts.uvOffsetSeed ?? 0) * 0.381966) % 1.0;
  const vShift = ((opts.uvOffsetSeed ?? 0) * 0.618033) % 1.0;

  // 1. Build main smooth continuous curved vault intrados
  const vertexCount = (radialSegs + 1) * (lengthSegs + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 3);

  let vIdx = 0;
  for (let j = 0; j <= lengthSegs; j++) {
    const vNorm = j / lengthSegs;
    const z = -length * 0.5 + vNorm * length;
    const vCoord = vNorm * repeatV + vShift;

    for (let i = 0; i <= radialSegs; i++) {
      const uNorm = i / radialSegs;
      const phi = -theta + uNorm * (2.0 * theta); // -theta (left) to +theta (right)

      const x = radius * Math.sin(phi);
      const y = centerY + radius * Math.cos(phi);
      const uCoord = uNorm * repeatU + uShift;

      // Inward-facing normal (downwards into the room interior)
      const nx = -Math.sin(phi);
      const ny = -Math.cos(phi);
      const nz = 0.0;

      const p3 = vIdx * 3;
      positions[p3 + 0] = x;
      positions[p3 + 1] = y;
      positions[p3 + 2] = z;

      normals[p3 + 0] = nx;
      normals[p3 + 1] = ny;
      normals[p3 + 2] = nz;

      colors[p3 + 0] = tint.r;
      colors[p3 + 1] = tint.g;
      colors[p3 + 2] = tint.b;

      const p2 = vIdx * 2;
      uvs[p2 + 0] = uCoord;
      uvs[p2 + 1] = vCoord;

      vIdx++;
    }
  }

  // Indices (inward winding order: CCW when viewed from below)
  const indices: number[] = [];
  const rowStride = radialSegs + 1;
  for (let j = 0; j < lengthSegs; j++) {
    for (let i = 0; i < radialSegs; i++) {
      const a = j * rowStride + i;
      const b = (j + 1) * rowStride + i;
      const c = (j + 1) * rowStride + (i + 1);
      const d = j * rowStride + (i + 1);

      // Facing inward
      indices.push(a, c, b);
      indices.push(a, d, c);
    }
  }

  const baseGeom = new BufferGeometry();
  baseGeom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  baseGeom.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  baseGeom.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  baseGeom.setAttribute('color', new Float32BufferAttribute(colors, 3));
  baseGeom.setIndex(indices);

  if (!includeRibs || length < ribInterval * 1.5) {
    bakeVertexAO(baseGeom);
    return baseGeom;
  }

  // 2. Build soft shallow cove ribs every ~4m (gentle transverse coved bands, NOT detached fins)
  const ribGeoms: BufferGeometry[] = [];
  const halfLen = length * 0.5;
  const startZ = -halfLen + ribInterval;
  const endZ = halfLen - ribInterval * 0.5;

  const zRibs: number[] = [];
  for (let z = startZ; z <= endZ; z += ribInterval) {
    zRibs.push(z);
  }

  if (zRibs.length > 0) {
    const halfRibW = ribWidth * 0.5;
    const bevelW = Math.min(0.08, halfRibW * 0.4);
    const ribRadSegs = Math.max(24, Math.floor(radialSegs * 0.6));

    for (const zRib of zRibs) {
      // 4 longitudinal stations across the shallow cove rib:
      // station 0: zRib - halfRibW           (depth = 0, at vault surface)
      // station 1: zRib - halfRibW + bevelW  (depth = ribDepth, inner face start)
      // station 2: zRib + halfRibW - bevelW  (depth = ribDepth, inner face end)
      // station 3: zRib + halfRibW           (depth = 0, at vault surface)
      const stations = [
        { z: zRib - halfRibW, d: 0.0, nz: -0.6 },
        { z: zRib - halfRibW + bevelW, d: ribDepth, nz: -0.2 },
        { z: zRib + halfRibW - bevelW, d: ribDepth, nz: 0.2 },
        { z: zRib + halfRibW, d: 0.0, nz: 0.6 },
      ];

      const rVertexCount = (ribRadSegs + 1) * stations.length;
      const rPositions = new Float32Array(rVertexCount * 3);
      const rNormals = new Float32Array(rVertexCount * 3);
      const rUvs = new Float32Array(rVertexCount * 2);
      const rColors = new Float32Array(rVertexCount * 3);

      let rVIdx = 0;
      for (let s = 0; s < stations.length; s++) {
        const st = stations[s]!;
        const rCurrent = radius - st.d;
        const vCoord = ((st.z + halfLen) / texMeters) + vShift;

        for (let i = 0; i <= ribRadSegs; i++) {
          const uNorm = i / ribRadSegs;
          const phi = -theta + uNorm * (2.0 * theta);

          const x = rCurrent * Math.sin(phi);
          const y = centerY + rCurrent * Math.cos(phi);
          const uCoord = uNorm * repeatU + uShift;

          // Inward-facing normal with subtle Z bevel tilt
          const nx = -Math.sin(phi);
          const ny = -Math.cos(phi);
          const nz = st.nz;
          const nLen = Math.hypot(nx, ny, nz) || 1.0;

          const p3 = rVIdx * 3;
          rPositions[p3 + 0] = x;
          rPositions[p3 + 1] = y;
          rPositions[p3 + 2] = st.z;

          rNormals[p3 + 0] = nx / nLen;
          rNormals[p3 + 1] = ny / nLen;
          rNormals[p3 + 2] = nz / nLen;

          // Soft rib has subtle depth tint (cream tile shade #b7a775)
          const shade = st.d > 0.01 ? 0.96 : 0.92;
          rColors[p3 + 0] = tint.r * shade;
          rColors[p3 + 1] = tint.g * shade;
          rColors[p3 + 2] = tint.b * shade;

          const p2 = rVIdx * 2;
          rUvs[p2 + 0] = uCoord;
          rUvs[p2 + 1] = vCoord;

          rVIdx++;
        }
      }

      const rIndices: number[] = [];
      const rRowStride = ribRadSegs + 1;
      for (let s = 0; s < stations.length - 1; s++) {
        for (let i = 0; i < ribRadSegs; i++) {
          const a = s * rRowStride + i;
          const b = (s + 1) * rRowStride + i;
          const c = (s + 1) * rRowStride + (i + 1);
          const d = s * rRowStride + (i + 1);

          rIndices.push(a, c, b);
          rIndices.push(a, d, c);
        }
      }

      const ribGeom = new BufferGeometry();
      ribGeom.setAttribute('position', new Float32BufferAttribute(rPositions, 3));
      ribGeom.setAttribute('normal', new Float32BufferAttribute(rNormals, 3));
      ribGeom.setAttribute('uv', new Float32BufferAttribute(rUvs, 2));
      ribGeom.setAttribute('color', new Float32BufferAttribute(rColors, 3));
      ribGeom.setIndex(rIndices);
      ribGeoms.push(ribGeom);
    }
  }

  const merged = mergeGeometries([baseGeom, ...ribGeoms]);
  baseGeom.dispose();
  ribGeoms.forEach((g) => g.dispose());

  const finalGeom = merged ?? baseGeom;
  bakeVertexAO(finalGeom);
  return finalGeom;
}

export function createVaultMesh(opts: VaultOptions, material: Material): Mesh {
  const geom = buildVaultGeometry(opts);
  const mesh = new Mesh(geom, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'MapVaultCeiling';
  return mesh;
}

export interface SkylightPanelOptions {
  length: number;           // Longitudinal length of the vault (m)
  apexY: number;            // Apex elevation (m)
  panelWidth?: number;      // Transverse width of each panel, default 4.8m
  panelLength?: number;     // Longitudinal length of each panel, default 4.0m
  spacing?: number;         // Longitudinal spacing between panel centers, default 16.0m
}

/**
 * Creates instanced glowing skylight panels running along the apex crown of a vaulted ceiling.
 */
export function createVaultSkylightPanels(opts: SkylightPanelOptions): InstancedMesh {
  const pWidth = opts.panelWidth ?? 4.8;
  const pLen = opts.panelLength ?? 4.0;
  const spacing = opts.spacing ?? 16.0;
  const halfLen = opts.length * 0.5;

  const zPositions: number[] = [];
  const startZ = -halfLen + spacing * 0.5;
  const endZ = halfLen - spacing * 0.5;
  for (let z = startZ; z <= endZ; z += spacing) {
    zPositions.push(z);
  }
  if (zPositions.length === 0) {
    zPositions.push(0);
  }

  const panelMat = new MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff9e6,
    emissiveIntensity: 1.85,
    roughness: 0.15,
    metalness: 0.0,
    side: DoubleSide,
  });

  const panelGeom = new PlaneGeometry(pWidth, pLen);
  const instMesh = new InstancedMesh(panelGeom, panelMat, zPositions.length);
  instMesh.name = 'VaultSkylightPanels';
  instMesh.receiveShadow = true;

  const mat4 = new Matrix4();
  const pos = new Vector3();
  const rot = new Euler(Math.PI * 0.5, 0, 0);
  const quat = new Quaternion().setFromEuler(rot);
  const scale = new Vector3(1, 1, 1);

  // Position slightly beneath apex to sit flush with crown
  const panelY = opts.apexY - 0.04;
  for (let i = 0; i < zPositions.length; i++) {
    pos.set(0, panelY, zPositions[i]!);
    mat4.compose(pos, quat, scale);
    instMesh.setMatrixAt(i, mat4);
  }

  instMesh.instanceMatrix.needsUpdate = true;
  return instMesh;
}
