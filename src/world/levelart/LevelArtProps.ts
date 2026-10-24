/* ── LevelArtProps.ts ────────────────────────────────────────────────────────
 *  Procedural geometry generators for commercial-grade level art props and set pieces.
 *  Produces rich, high-detail Three.js BufferGeometries with baked vertex AO.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  BufferGeometry,
  BoxGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Matrix4,
  Float32BufferAttribute,
  Uint32BufferAttribute,
} from 'three';
import { bakeVertexAO } from '../../procedural/geometry/VertexAO.js';

function mergeGeometries(geoms: { geom: BufferGeometry; matrix: Matrix4 }[]): BufferGeometry {
  // Simple deterministic merger
  let totalPositions = 0;
  let totalNormals = 0;
  let totalUvs = 0;
  let totalIndices = 0;

  for (const { geom } of geoms) {
    totalPositions += geom.attributes.position ? geom.attributes.position.count * 3 : 0;
    totalNormals += geom.attributes.normal ? geom.attributes.normal.count * 3 : 0;
    totalUvs += geom.attributes.uv ? geom.attributes.uv.count * 2 : 0;
    totalIndices += geom.index ? geom.index.count : 0;
  }

  const positions = new Float32Array(totalPositions);
  const normals = new Float32Array(totalNormals);
  const uvs = new Float32Array(totalUvs);
  const indices = totalIndices > 0 ? new Uint32Array(totalIndices) : null;

  let posOffset = 0;
  let normOffset = 0;
  let uvOffset = 0;
  let indexOffset = 0;
  let vertexOffset = 0;

  const normalMatrix = new Matrix4();

  for (const { geom, matrix } of geoms) {
    const posAttr = geom.attributes.position;
    const normAttr = geom.attributes.normal;
    const uvAttr = geom.attributes.uv;
    const count = posAttr ? posAttr.count : 0;

    normalMatrix.copy(matrix).invert().transpose();

    if (posAttr) {
      for (let i = 0; i < count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);

        const tx = x * matrix.elements[0]! + y * matrix.elements[4]! + z * matrix.elements[8]! + matrix.elements[12]!;
        const ty = x * matrix.elements[1]! + y * matrix.elements[5]! + z * matrix.elements[9]! + matrix.elements[13]!;
        const tz = x * matrix.elements[2]! + y * matrix.elements[6]! + z * matrix.elements[10]! + matrix.elements[14]!;

        positions[posOffset++] = tx;
        positions[posOffset++] = ty;
        positions[posOffset++] = tz;
      }
    }

    if (normAttr) {
      for (let i = 0; i < count; i++) {
        const nx = normAttr.getX(i);
        const ny = normAttr.getY(i);
        const nz = normAttr.getZ(i);

        const tx = nx * normalMatrix.elements[0]! + ny * normalMatrix.elements[4]! + nz * normalMatrix.elements[8]!;
        const ty = nx * normalMatrix.elements[1]! + ny * normalMatrix.elements[5]! + nz * normalMatrix.elements[9]!;
        const tz = nx * normalMatrix.elements[2]! + ny * normalMatrix.elements[6]! + nz * normalMatrix.elements[10]!;
        const len = Math.hypot(tx, ty, tz) || 1;

        normals[normOffset++] = tx / len;
        normals[normOffset++] = ty / len;
        normals[normOffset++] = tz / len;
      }
    }

    if (uvAttr) {
      for (let i = 0; i < count; i++) {
        uvs[uvOffset++] = uvAttr.getX(i);
        uvs[uvOffset++] = uvAttr.getY(i);
      }
    }

    if (indices && geom.index) {
      const idx = geom.index;
      for (let i = 0; i < idx.count; i++) {
        indices[indexOffset++] = idx.getX(i) + vertexOffset;
      }
    }

    vertexOffset += count;
    geom.dispose();
  }

  return createMergedBufferGeometry(positions, normals, uvs, indices);
}

function createMergedBufferGeometry(
  pos: Float32Array,
  norm: Float32Array,
  uvs: Float32Array,
  idx: Uint32Array | null,
): BufferGeometry {
  const geom = new BufferGeometry();
  geom.setAttribute('position', new Float32BufferAttribute(pos, 3));
  if (norm.length > 0) geom.setAttribute('normal', new Float32BufferAttribute(norm, 3));
  if (uvs.length > 0) geom.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  if (idx) geom.setIndex(new Uint32BufferAttribute(idx, 1));
  bakeVertexAO(geom);
  return geom;
}

/** 1. Lifeguard Chair: elevated high-seat observation station */
export function buildLifeguardChairGeometry(): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const legGeom = new CylinderGeometry(0.04, 0.04, 2.4, 8);
  const m = new Matrix4();

  // 4 splayed legs
  const legOffsets = [
    [-0.45, -0.45],
    [0.45, -0.45],
    [-0.55, 0.55],
    [0.55, 0.55],
  ];
  for (const [lx, lz] of legOffsets) {
    m.makeTranslation(lx!, 1.2, lz!);
    parts.push({ geom: legGeom.clone(), matrix: m.clone() });
  }

  // 4 rungs
  const rungGeom = new CylinderGeometry(0.025, 0.025, 0.9, 6);
  rungGeom.rotateZ(Math.PI * 0.5);
  for (let y = 0.5; y <= 2.0; y += 0.5) {
    m.makeTranslation(0, y, -0.45);
    parts.push({ geom: rungGeom.clone(), matrix: m.clone() });
  }

  // Seat platform & backrest
  const seatPlat = new BoxGeometry(1.0, 0.08, 0.9);
  m.makeTranslation(0, 2.3, 0.1);
  parts.push({ geom: seatPlat, matrix: m.clone() });

  const seatBack = new BoxGeometry(0.8, 0.7, 0.06);
  m.makeTranslation(0, 2.7, 0.5);
  parts.push({ geom: seatBack, matrix: m.clone() });

  legGeom.dispose();
  rungGeom.dispose();
  return mergeGeometries(parts);
}

/** 2. Balustrade / Brass Handrail segment */
export function buildBalustradeGeometry(length = 3.6): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  // Top rail
  const railGeom = new CylinderGeometry(0.04, 0.04, length, 16);
  railGeom.rotateZ(Math.PI * 0.5);
  m.makeTranslation(0, 1.05, 0);
  parts.push({ geom: railGeom, matrix: m.clone() });

  // Mid rail
  const midRail = new CylinderGeometry(0.03, 0.03, length, 16);
  midRail.rotateZ(Math.PI * 0.5);
  m.makeTranslation(0, 0.55, 0);
  parts.push({ geom: midRail, matrix: m.clone() });

  // Upright balusters with fluted rings
  const baluster = new CylinderGeometry(0.03, 0.03, 1.05, 14);
  const collar = new TorusGeometry(0.045, 0.015, 8, 16);
  collar.rotateX(Math.PI * 0.5);

  const half = length * 0.5;
  for (let x = -half + 0.25; x <= half - 0.2; x += 0.4) {
    m.makeTranslation(x, 0.525, 0);
    parts.push({ geom: baluster.clone(), matrix: m.clone() });

    m.makeTranslation(x, 0.85, 0);
    parts.push({ geom: collar.clone(), matrix: m.clone() });
  }

  baluster.dispose();
  collar.dispose();
  return mergeGeometries(parts);
}

/** 3. Diving Tower: multi-level concrete and steel diving tower */
export function buildDivingTowerGeometry(): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  // Main concrete column
  const mainCol = new BoxGeometry(1.2, 8.0, 1.6);
  m.makeTranslation(0, 4.0, 0);
  parts.push({ geom: mainCol, matrix: m.clone() });

  // Lower board (3m height)
  const board1 = new BoxGeometry(0.8, 0.1, 4.2);
  m.makeTranslation(0, 3.2, 2.2);
  parts.push({ geom: board1, matrix: m.clone() });

  // Upper high board (6m height)
  const board2 = new BoxGeometry(0.9, 0.12, 5.0);
  m.makeTranslation(0, 6.2, 2.6);
  parts.push({ geom: board2, matrix: m.clone() });

  // Steel support struts
  const strut = new CylinderGeometry(0.06, 0.06, 3.5, 16);
  strut.rotateX(Math.PI * 0.25);
  m.makeTranslation(0, 4.5, 1.4);
  parts.push({ geom: strut, matrix: m.clone() });

  // Safety railings on top platform
  const railGeom = new CylinderGeometry(0.03, 0.03, 1.4, 12);
  m.makeTranslation(0.42, 6.7, 0.8);
  parts.push({ geom: railGeom, matrix: m.clone() });
  m.makeTranslation(-0.42, 6.7, 0.8);
  parts.push({ geom: railGeom.clone(), matrix: m.clone() });

  railGeom.dispose();
  return mergeGeometries(parts);
}

/** 4. Floor Drain Grate: slotted circular drainage grating */
export function buildFloorDrainGeometry(): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  // Outer collar ring
  const collar = new TorusGeometry(0.45, 0.045, 14, 32);
  collar.rotateX(Math.PI * 0.5);
  m.makeTranslation(0, 0.01, 0);
  parts.push({ geom: collar, matrix: m.clone() });

  // Inner decorative ring
  const innerRing = new TorusGeometry(0.25, 0.03, 12, 24);
  innerRing.rotateX(Math.PI * 0.5);
  m.makeTranslation(0, 0.01, 0);
  parts.push({ geom: innerRing, matrix: m.clone() });

  // Grate crossbars
  const bar = new BoxGeometry(0.85, 0.03, 0.04);
  for (let z = -0.35; z <= 0.35; z += 0.08) {
    m.makeTranslation(0, 0.01, z);
    parts.push({ geom: bar.clone(), matrix: m.clone() });
  }

  bar.dispose();
  return mergeGeometries(parts);
}

/** 5. School Desk: flooded wooden classroom desk with attached chair frame */
export function buildSchoolDeskGeometry(): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  // Desk top
  const deskTop = new BoxGeometry(0.75, 0.05, 0.55);
  m.makeTranslation(0, 0.72, 0.15);
  parts.push({ geom: deskTop, matrix: m.clone() });

  // Book shelf under desk
  const shelf = new BoxGeometry(0.68, 0.02, 0.48);
  m.makeTranslation(0, 0.58, 0.15);
  parts.push({ geom: shelf, matrix: m.clone() });

  // Tubular desk frame legs
  const leg = new CylinderGeometry(0.022, 0.022, 0.72, 12);
  const legPos = [
    [-0.32, 0.36, -0.05],
    [0.32, 0.36, -0.05],
    [-0.32, 0.36, 0.35],
    [0.32, 0.36, 0.35],
  ];
  for (const [x, y, z] of legPos) {
    m.makeTranslation(x!, y!, z!);
    parts.push({ geom: leg.clone(), matrix: m.clone() });
  }

  // Attached chair seat & back
  const chairSeat = new BoxGeometry(0.44, 0.04, 0.42);
  m.makeTranslation(0, 0.44, -0.35);
  parts.push({ geom: chairSeat, matrix: m.clone() });

  const chairBack = new BoxGeometry(0.42, 0.3, 0.04);
  m.makeTranslation(0, 0.75, -0.52);
  parts.push({ geom: chairBack, matrix: m.clone() });

  // Chair frame uprights
  const chairLeg = new CylinderGeometry(0.018, 0.018, 0.44, 12);
  m.makeTranslation(-0.18, 0.22, -0.35);
  parts.push({ geom: chairLeg.clone(), matrix: m.clone() });
  m.makeTranslation(0.18, 0.22, -0.35);
  parts.push({ geom: chairLeg, matrix: m.clone() });

  leg.dispose();
  return mergeGeometries(parts);
}

/** 6. Stacked Chairs: cluster of 4 nested school chairs */
export function buildStackedChairsGeometry(): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  const seatGeom = new BoxGeometry(0.44, 0.035, 0.42);
  const backGeom = new BoxGeometry(0.42, 0.28, 0.035);
  const legGeom = new CylinderGeometry(0.02, 0.02, 0.48, 12);

  for (let c = 0; c < 4; c++) {
    const yOff = c * 0.12;
    const zOff = c * 0.04;

    m.makeTranslation(0, 0.42 + yOff, zOff);
    parts.push({ geom: seatGeom.clone(), matrix: m.clone() });

    m.makeTranslation(0, 0.72 + yOff, -0.18 + zOff);
    parts.push({ geom: backGeom.clone(), matrix: m.clone() });

    // Legs on every chair for realistic stacking silhouette
    const lpos = [
      [-0.18, 0.24 + yOff * 0.4, -0.15 + zOff],
      [0.18, 0.24 + yOff * 0.4, -0.15 + zOff],
      [-0.18, 0.24 + yOff * 0.4, 0.15 + zOff],
      [0.18, 0.24 + yOff * 0.4, 0.15 + zOff],
    ];
    for (const [lx, ly, lz] of lpos) {
      m.makeTranslation(lx!, ly!, lz!);
      parts.push({ geom: legGeom.clone(), matrix: m.clone() });
    }
  }

  seatGeom.dispose();
  backGeom.dispose();
  legGeom.dispose();
  return mergeGeometries(parts);
}

/** 7. Institutional Wall Clock stopped at 3:07 */
export function buildWallClockGeometry(): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  // Circular rim frame
  const rim = new TorusGeometry(0.35, 0.035, 8, 24);
  m.makeTranslation(0, 0, 0.02);
  parts.push({ geom: rim, matrix: m.clone() });

  // Dial face
  const dial = new CylinderGeometry(0.35, 0.35, 0.03, 24);
  dial.rotateX(Math.PI * 0.5);
  parts.push({ geom: dial, matrix: m.clone() });

  // Hour hand pointing at ~3:07 (~93 degrees from top)
  const hourHand = new BoxGeometry(0.16, 0.02, 0.01);
  m.makeTranslation(0.07, -0.01, 0.03);
  parts.push({ geom: hourHand, matrix: m.clone() });

  // Minute hand pointing at 7 mins (~42 degrees from top)
  const minHand = new BoxGeometry(0.015, 0.24, 0.01);
  minHand.rotateZ(-Math.PI * 0.23);
  m.makeTranslation(0.08, 0.08, 0.035);
  parts.push({ geom: minHand, matrix: m.clone() });

  return mergeGeometries(parts);
}

/** 8. Trophy Case: flooded wooden cabinet with glass panels and brass urns */
export function buildTrophyCaseGeometry(): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  // Outer cabinet box
  const outer = new BoxGeometry(1.6, 2.2, 0.45);
  m.makeTranslation(0, 1.1, 0);
  parts.push({ geom: outer, matrix: m.clone() });

  // 3 shelves with brass cups
  const cup = new CylinderGeometry(0.08, 0.04, 0.22, 8);
  for (let s = 0.5; s <= 1.8; s += 0.6) {
    m.makeTranslation(-0.4, s, 0.1);
    parts.push({ geom: cup.clone(), matrix: m.clone() });
    m.makeTranslation(0.35, s, 0.1);
    parts.push({ geom: cup.clone(), matrix: m.clone() });
  }

  cup.dispose();
  return mergeGeometries(parts);
}

/** 9. Lily Pad Cluster with aquatic water flower */
export function buildLilyPadGeometry(): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  const padGeom = new CylinderGeometry(0.38, 0.38, 0.015, 16);
  const padOffsets = [
    [-0.3, 0.005, -0.2],
    [0.35, 0.005, -0.1],
    [0.05, 0.005, 0.32],
  ];
  for (const [px, py, pz] of padOffsets) {
    m.makeTranslation(px!, py!, pz!);
    parts.push({ geom: padGeom.clone(), matrix: m.clone() });
  }

  // Small flower bloom
  const flower = new SphereGeometry(0.07, 8, 8);
  m.makeTranslation(-0.05, 0.06, 0.02);
  parts.push({ geom: flower, matrix: m.clone() });

  padGeom.dispose();
  return mergeGeometries(parts);
}

/** 10. Reeds Cluster: marsh grass stalks */
export function buildReedsClusterGeometry(): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  const stalk = new CylinderGeometry(0.015, 0.025, 2.2, 6);
  const head = new CylinderGeometry(0.04, 0.04, 0.35, 8);

  const offsets = [
    [-0.2, 0.8, -0.15],
    [0.15, 0.9, -0.2],
    [-0.1, 0.75, 0.18],
    [0.22, 0.85, 0.12],
    [0.0, 1.0, 0.0],
  ];

  for (const [x, h, z] of offsets) {
    m.makeTranslation(x!, h!, z!);
    parts.push({ geom: stalk.clone(), matrix: m.clone() });

    m.makeTranslation(x!, h! + 0.9, z!);
    parts.push({ geom: head.clone(), matrix: m.clone() });
  }

  stalk.dispose();
  head.dispose();
  return mergeGeometries(parts);
}

/** 11. Moss Boulder: weathered rock */
export function buildBoulderGeometry(radius = 1.4): BufferGeometry {
  const geom = new SphereGeometry(radius, 24, 20);
  const pos = geom.attributes.position!;

  // Displace vertices deterministically for natural jagged rock formation
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const noise = Math.sin(x * 3.5) * Math.cos(z * 3.5) * 0.22;
    pos.setXYZ(i, x * (1 + noise), y * 0.75 * (1 + noise), z * (1 + noise));
  }
  geom.computeVertexNormals();
  bakeVertexAO(geom);
  return geom;
}

/** 12. Holographic Billboard: high-tech corporate advertisement display */
export function buildHoloBillboardGeometry(): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  // Support pylon
  const pylon = new BoxGeometry(0.4, 7.0, 0.4);
  m.makeTranslation(0, 3.5, 0);
  parts.push({ geom: pylon, matrix: m.clone() });

  // Wide screen panel
  const screen = new BoxGeometry(5.4, 2.8, 0.2);
  m.makeTranslation(0, 6.2, 0);
  parts.push({ geom: screen, matrix: m.clone() });

  // Top & bottom neon bezel trim
  const bezel = new BoxGeometry(5.6, 0.1, 0.25);
  m.makeTranslation(0, 7.65, 0);
  parts.push({ geom: bezel.clone(), matrix: m.clone() });
  m.makeTranslation(0, 4.75, 0);
  parts.push({ geom: bezel, matrix: m.clone() });

  return mergeGeometries(parts);
}

/** 13. Hover Car Chassis: abandoned cyber vehicle half-submerged */
export function buildHoverCarGeometry(): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  // Streamlined main hull body
  const body = new BoxGeometry(2.1, 0.75, 4.4);
  m.makeTranslation(0, 0.45, 0);
  parts.push({ geom: body, matrix: m.clone() });

  // Canopy cockpit roof
  const canopy = new BoxGeometry(1.6, 0.55, 2.0);
  m.makeTranslation(0, 1.05, -0.3);
  parts.push({ geom: canopy, matrix: m.clone() });

  // 4 corner repulsor nacelles
  const thruster = new CylinderGeometry(0.35, 0.4, 0.5, 10);
  const pods = [
    [-1.0, 0.35, -1.6],
    [1.0, 0.35, -1.6],
    [-1.0, 0.35, 1.6],
    [1.0, 0.35, 1.6],
  ];
  for (const [px, py, pz] of pods) {
    m.makeTranslation(px!, py!, pz!);
    parts.push({ geom: thruster.clone(), matrix: m.clone() });
  }

  thruster.dispose();
  return mergeGeometries(parts);
}

/** 14. Suspended Catenary Cables: sagging overhead industrial lines */
export function buildSuspendedCablesGeometry(span = 14.0): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();
  const segs = 10;
  const segLen = span / segs;

  const cableGeom = new CylinderGeometry(0.025, 0.025, segLen, 6);
  cableGeom.rotateZ(Math.PI * 0.5);

  for (let s = 0; s < segs; s++) {
    const x = -span * 0.5 + (s + 0.5) * segLen;
    // Parabolic sag curve
    const t = (x / (span * 0.5));
    const sag = (1 - t * t) * 1.4;
    m.makeTranslation(x, 6.5 - sag, 0);
    parts.push({ geom: cableGeom.clone(), matrix: m.clone() });
  }

  cableGeom.dispose();
  return mergeGeometries(parts);
}

/** 15. Stalled Subway Train Carriage: flooded metro car */
export function buildSubwayCarGeometry(): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  // Carriage main shell
  const carBody = new BoxGeometry(2.8, 2.6, 14.0);
  m.makeTranslation(0, 1.3, 0);
  parts.push({ geom: carBody, matrix: m.clone() });

  // Corrugated roof ridge
  const roof = new BoxGeometry(2.4, 0.25, 13.6);
  m.makeTranslation(0, 2.65, 0);
  parts.push({ geom: roof, matrix: m.clone() });

  // 6 Side window frame cutouts
  const winFrame = new BoxGeometry(0.12, 0.85, 1.4);
  for (let z = -5.0; z <= 5.0; z += 2.0) {
    m.makeTranslation(-1.42, 1.6, z);
    parts.push({ geom: winFrame.clone(), matrix: m.clone() });
    m.makeTranslation(1.42, 1.6, z);
    parts.push({ geom: winFrame.clone(), matrix: m.clone() });
  }

  // Undercarriage wheel bogies (16 radial segments)
  const wheel = new CylinderGeometry(0.42, 0.42, 2.4, 16);
  wheel.rotateZ(Math.PI * 0.5);
  for (const z of [-5.0, -3.2, 3.2, 5.0]) {
    m.makeTranslation(0, 0.38, z);
    parts.push({ geom: wheel.clone(), matrix: m.clone() });
  }

  winFrame.dispose();
  wheel.dispose();
  return mergeGeometries(parts);
}

/** 16. Metro Turnstile Barrier */
export function buildTurnstileGeometry(): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  // Housing cabinet
  const cabinet = new BoxGeometry(0.3, 0.95, 1.1);
  m.makeTranslation(0, 0.475, 0);
  parts.push({ geom: cabinet, matrix: m.clone() });

  // Rotating tripod barrier arm
  const arm = new CylinderGeometry(0.025, 0.025, 0.65, 8);
  arm.rotateZ(Math.PI * 0.35);
  m.makeTranslation(0.2, 0.75, 0);
  parts.push({ geom: arm, matrix: m.clone() });

  return mergeGeometries(parts);
}

/** 17. Tunnel Support Ring: curved structural arch rib */
export function buildTunnelRingGeometry(radius = 3.2): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  // Arch rib
  const rib = new TorusGeometry(radius, 0.16, 8, 24, Math.PI);
  rib.rotateZ(Math.PI * 0.5);
  m.makeTranslation(0, 0, 0);
  parts.push({ geom: rib, matrix: m.clone() });

  // Heavy steel base foot plates
  const foot = new BoxGeometry(0.6, 0.2, 0.5);
  m.makeTranslation(-radius, 0.1, 0);
  parts.push({ geom: foot.clone(), matrix: m.clone() });
  m.makeTranslation(radius, 0.1, 0);
  parts.push({ geom: foot, matrix: m.clone() });

  return mergeGeometries(parts);
}

/** 18. Weir Gate / Grated Sluice */
export function buildWeirGateGeometry(): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  // Side guide piers
  const pier = new BoxGeometry(0.5, 3.5, 0.6);
  m.makeTranslation(-1.5, 1.75, 0);
  parts.push({ geom: pier.clone(), matrix: m.clone() });
  m.makeTranslation(1.5, 1.75, 0);
  parts.push({ geom: pier, matrix: m.clone() });

  // Heavy sluice blade gate
  const gate = new BoxGeometry(2.6, 1.8, 0.18);
  m.makeTranslation(0, 1.6, 0);
  parts.push({ geom: gate, matrix: m.clone() });

  // Grated barrier mesh
  const bar = new CylinderGeometry(0.02, 0.02, 1.6, 6);
  for (let x = -1.1; x <= 1.1; x += 0.25) {
    m.makeTranslation(x, 0.8, 0);
    parts.push({ geom: bar.clone(), matrix: m.clone() });
  }

  bar.dispose();
  return mergeGeometries(parts);
}

/** 19. Industrial Tank Panel with hazard frame */
export function buildTankPanelGeometry(): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  // Steel plate
  const plate = new BoxGeometry(2.4, 2.8, 0.1);
  m.makeTranslation(0, 1.4, 0);
  parts.push({ geom: plate, matrix: m.clone() });

  // Diagonal reinforcing brace
  const brace = new BoxGeometry(0.12, 3.4, 0.14);
  brace.rotateZ(Math.PI * 0.25);
  m.makeTranslation(0, 1.4, 0.05);
  parts.push({ geom: brace, matrix: m.clone() });

  return mergeGeometries(parts);
}

/** 20. Vortex Drainage Pit Grating */
export function buildVortexGrateGeometry(): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  // 3 Concentric rings
  const ring1 = new TorusGeometry(1.2, 0.05, 8, 24);
  ring1.rotateX(Math.PI * 0.5);
  m.makeTranslation(0, -0.85, 0);
  parts.push({ geom: ring1, matrix: m.clone() });

  const ring2 = new TorusGeometry(2.2, 0.06, 8, 28);
  ring2.rotateX(Math.PI * 0.5);
  parts.push({ geom: ring2, matrix: m.clone() });

  const ring3 = new TorusGeometry(3.2, 0.08, 8, 32);
  ring3.rotateX(Math.PI * 0.5);
  parts.push({ geom: ring3, matrix: m.clone() });

  // 8 Radial support spokes
  const spoke = new BoxGeometry(0.08, 0.06, 3.2);
  for (let a = 0; a < 4; a++) {
    spoke.rotateY(Math.PI * 0.25);
    parts.push({ geom: spoke.clone(), matrix: m.clone() });
  }

  spoke.dispose();
  return mergeGeometries(parts);
}

/** 21. Ceiling Stalactite cluster */
export function buildStalactiteGeometry(): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  const cone = new CylinderGeometry(0.01, 0.22, 1.4, 8);
  cone.rotateX(Math.PI); // point down

  const dripOffsets = [
    [0, 6.0, 0],
    [-0.3, 6.2, 0.2],
    [0.25, 6.1, -0.2],
    [0.15, 6.3, 0.3],
  ];

  for (const [x, y, z] of dripOffsets) {
    m.makeTranslation(x!, y!, z!);
    parts.push({ geom: cone.clone(), matrix: m.clone() });
  }

  cone.dispose();
  return mergeGeometries(parts);
}

/** 22. Barrel Vault Arch Rib */
export function buildVaultRibGeometry(span = 24.0, height = 9.0): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  const segs = 22;
  const beam = new BoxGeometry(0.55, 0.65, 2.0);
  const flange = new BoxGeometry(0.75, 0.15, 2.2);

  for (let i = 0; i < segs; i++) {
    const t = (i / (segs - 1)) * 2 - 1; // -1 .. 1
    const x = t * (span * 0.5);
    const y = height * (1 - t * t) + 1.5;
    const angle = Math.atan2(-2 * height * t, span * 0.5);
    const rotM = new Matrix4().makeRotationZ(angle);
    const transM = new Matrix4().makeTranslation(x, y, 0);
    m.multiplyMatrices(transM, rotM);
    parts.push({ geom: beam.clone(), matrix: m.clone() });

    // Decorative structural gusset
    const flTrans = new Matrix4().makeTranslation(x, y + 0.35, 0);
    m.multiplyMatrices(flTrans, rotM);
    parts.push({ geom: flange.clone(), matrix: m.clone() });
  }

  beam.dispose();
  flange.dispose();
  return mergeGeometries(parts);
}

/** 23. Floating Papers Debris Cluster on water */
export function buildFloatingPapersGeometry(): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  const sheet = new PlaneGeometry(0.3, 0.42);
  sheet.rotateX(-Math.PI * 0.5);

  const pos = [
    [-0.4, 0.005, -0.3, 0.3],
    [0.2, 0.005, -0.1, -0.6],
    [-0.1, 0.005, 0.4, 1.2],
    [0.35, 0.005, 0.25, 0.8],
  ];

  for (const [x, y, z, rot] of pos) {
    const rotM = new Matrix4().makeRotationY(rot!);
    const transM = new Matrix4().makeTranslation(x!, y!, z!);
    m.multiplyMatrices(transM, rotM);
    parts.push({ geom: sheet.clone(), matrix: m.clone() });
  }

  sheet.dispose();
  return mergeGeometries(parts);
}

/** 24. Lane Line floating buoy string */
export function buildLaneLineGeometry(length = 24.0): BufferGeometry {
  const parts: { geom: BufferGeometry; matrix: Matrix4 }[] = [];
  const m = new Matrix4();

  const buoy = new SphereGeometry(0.08, 8, 8);
  for (let z = -length * 0.5; z <= length * 0.5; z += 0.8) {
    m.makeTranslation(0, 0.02, z);
    parts.push({ geom: buoy.clone(), matrix: m.clone() });
  }

  buoy.dispose();
  return mergeGeometries(parts);
}
