/* ── DecalSystem.ts ────────────────────────────────────────────────────────
 *  Instanced decal system for BackSilence maps.
 *  Places up to 400 decals per map (graffiti, numerals, cracks, stains, drips, signs)
 *  using instanced quads with polygonOffset to prevent z-fighting against walls and floors.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  InstancedMesh,
  PlaneGeometry,
  MeshStandardMaterial,
  Matrix4,
  Quaternion,
  Vector3,
  Color,
  CanvasTexture,
  DoubleSide,
  DynamicDrawUsage,
} from 'three';
import { acquireCanvas } from '../../procedural/core/canvasPool.js';
import { layoutText } from '../../procedural/textures/strokeFont.js';
import { Rng } from '../../procedural/core/prng.js';

export type DecalKind = 'graffiti' | 'numeral' | 'crack' | 'stain' | 'drip' | 'sign';

export interface DecalDef {
  position: Vector3;
  normal: Vector3;
  size?: number; // width in meters (default 1.2m)
  kind: DecalKind;
  text?: string;
  color?: Color | string;
  rotation?: number;
}

export class DecalSystem {
  readonly root: InstancedMesh;
  readonly maxDecals: number;
  private count = 0;
  private readonly dummyMatrix = new Matrix4();
  private readonly dummyPos = new Vector3();
  private readonly dummyQuat = new Quaternion();
  private readonly dummyScale = new Vector3();
  private readonly dummyColor = new Color();
  private readonly atlasTexture: CanvasTexture;

  constructor(maxDecals = 400) {
    this.maxDecals = maxDecals;

    // Generate procedural decal atlas (4x4 cells = 16 decal patterns)
    const atlasHandle = acquireCanvas(1024, 1024);
    const ctx = atlasHandle.ctx;
    ctx.clearRect(0, 0, 1024, 1024);

    this.drawAtlas(ctx);

    this.atlasTexture = new CanvasTexture(atlasHandle.canvas);
    this.atlasTexture.generateMipmaps = true;

    const geom = new PlaneGeometry(1, 1);
    const mat = new MeshStandardMaterial({
      map: this.atlasTexture,
      transparent: true,
      alphaTest: 0.05,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0,
      roughness: 0.85,
      metalness: 0.1,
      side: DoubleSide,
    });

    this.root = new InstancedMesh(geom, mat, maxDecals);
    this.root.instanceMatrix.setUsage(DynamicDrawUsage);
    this.root.matrixAutoUpdate = false;
  }

  private drawAtlas(ctx: CanvasRenderingContext2D): void {
    const cellSize = 256;
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';

    // Cell 0: Warning Tagline "IT CAN HEAR YOU"
    const textRes = layoutText('DONT RUN', { size: 28 });
    ctx.save();
    ctx.translate(20, 128);
    for (const poly of textRes.polylines) {
      if (poly.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(poly[0]![0], poly[0]![1]);
      for (let i = 1; i < poly.length; i++) {
        ctx.lineTo(poly[i]![0], poly[i]![1]);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Cell 1: Numerals "04"
    const numRes = layoutText('04', { size: 64 });
    ctx.save();
    ctx.translate(cellSize + 40, 128);
    ctx.lineWidth = 10;
    for (const poly of numRes.polylines) {
      if (poly.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(poly[0]![0], poly[0]![1]);
      for (let i = 1; i < poly.length; i++) {
        ctx.lineTo(poly[i]![0], poly[i]![1]);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Cell 2: Fissure Cracks
    ctx.save();
    ctx.translate(cellSize * 2 + 128, 128);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-60, -90);
    ctx.lineTo(-20, -30);
    ctx.lineTo(10, 20);
    ctx.lineTo(40, 90);
    ctx.moveTo(-20, -30);
    ctx.lineTo(30, -20);
    ctx.lineTo(70, -10);
    ctx.stroke();
    ctx.restore();

    // Cell 3: Water Stain / Tide Drips
    ctx.save();
    ctx.translate(cellSize * 3 + 128, 128);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    for (let d = 0; d < 6; d++) {
      const dx = (d - 2.5) * 24;
      const len = 40 + (d % 3) * 35;
      ctx.fillRect(dx, -60, 8, len);
      ctx.beginPath();
      ctx.arc(dx + 4, -60 + len, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  addDecal(def: DecalDef): void {
    if (this.count >= this.maxDecals) return;

    const size = def.size ?? 1.2;
    this.dummyPos.copy(def.position);

    // Offset slightly along normal to guarantee zero z-fighting
    this.dummyPos.addScaledVector(def.normal, 0.015);

    // Orient quad facing along the surface normal
    const up = Math.abs(def.normal.y) > 0.95 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
    this.dummyQuat.setFromUnitVectors(new Vector3(0, 0, 1), def.normal);

    if (def.rotation) {
      const rotQuat = new Quaternion().setFromAxisAngle(def.normal, def.rotation);
      this.dummyQuat.premultiply(rotQuat);
    }

    this.dummyScale.set(size, size, 1);
    this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);

    this.root.setMatrixAt(this.count, this.dummyMatrix);

    const c = def.color instanceof Color ? def.color : new Color(def.color ?? '#ffffff');
    this.root.setColorAt(this.count, c);

    this.count++;
    this.root.count = this.count;
    this.root.instanceMatrix.needsUpdate = true;
    if (this.root.instanceColor) this.root.instanceColor.needsUpdate = true;
  }

  getCount(): number {
    return this.count;
  }

  dispose(): void {
    this.root.geometry.dispose();
    (this.root.material as MeshStandardMaterial).dispose();
    this.atlasTexture.dispose();
    this.root.removeFromParent();
  }
}
