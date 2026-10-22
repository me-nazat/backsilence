/* ── ProvingGrounds.ts ───────────────────────────────────────────────────────
 *  Visual presentation and MapInstance implementation for the "Proving Grounds" arena.
 *  Assembles procedural tiled platforms, columns, arches, decals, and the pool floor.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  PlaneGeometry,
  Shape,
  ExtrudeGeometry,
  CylinderGeometry,
  Vector3,
} from 'three';
import type { MapInstance } from '../maps/MapInstance.js';
import type { GroundGrid } from '../../sim/GroundGrid.js';
import type { ColliderSet } from '../../sim/Colliders.js';
import {
  createProvingGroundsSim,
  ARENA_PLATFORMS,
  ARENA_PILLARS,
  ARENA_PLAYER_SPAWN,
  ARENA_MONSTER_SPAWN,
  ARENA_BOUNDS,
  WATER_SURFACE_Y,
  WATER_FLOOR_Y,
  PLATFORM_TOP_Y,
} from '../../sim/ProvingGroundsData.js';
import { TextureRegistry } from '../../procedural/textures/TextureRegistry.js';
import { createTiledBoxMesh } from '../../procedural/geometry/TiledBox.js';
import { createTiledCylinderMesh } from '../../procedural/geometry/TiledCylinder.js';

export interface ProvingGroundsOptions {
  onInteractPlate?: (() => void) | undefined;
}

export class ProvingGrounds implements MapInstance {
  readonly id = 'proving_grounds';
  readonly root = new Group();
  readonly ground: GroundGrid;
  readonly colliders: ColliderSet;
  readonly spawnPoints = [ARENA_PLAYER_SPAWN];
  readonly monsterSpawns = [ARENA_MONSTER_SPAWN];
  readonly waterY = WATER_SURFACE_Y;

  private materials: (MeshStandardMaterial | MeshBasicMaterial)[] = [];
  private geometries: { dispose: () => void }[] = [];
  private plateMesh!: Mesh;
  readonly onInteractPlate?: (() => void) | undefined;

  constructor(options: ProvingGroundsOptions = {}) {
    this.root.name = 'ProvingGrounds';
    this.onInteractPlate = options.onInteractPlate;

    // 1. Initialize simulation world data
    const sim = createProvingGroundsSim('normal');
    this.ground = sim.ground;
    this.colliders = sim.colliders;

    // 2. Build visual geometry
    this.buildScene();
  }

  private buildScene(): void {
    const reg = TextureRegistry.getInstance();
    const platTiles = reg.getTileSet('platform', 42);
    const wallTiles = reg.getTileSet('wall', 42);
    const floorTiles = reg.getTileSet('floorWet', 42);
    const causticsTex = reg.getCaustics(undefined, 42);

    // Platform material
    const platMat = new MeshStandardMaterial({
      map: platTiles.albedo,
      roughnessMap: platTiles.roughness,
      normalMap: platTiles.normal,
      roughness: 0.35,
      metalness: 0.05,
    });
    this.materials.push(platMat);

    // Wall material
    const wallMat = new MeshStandardMaterial({
      map: wallTiles.albedo,
      roughnessMap: wallTiles.roughness,
      normalMap: wallTiles.normal,
      roughness: 0.45,
      metalness: 0.02,
    });
    this.materials.push(wallMat);

    // Wet pool floor material (under water with caustics)
    const floorMat = new MeshStandardMaterial({
      map: floorTiles.albedo,
      roughnessMap: floorTiles.roughness,
      normalMap: floorTiles.normal,
      lightMap: causticsTex,
      lightMapIntensity: 0.75,
      roughness: 0.15,
      metalness: 0.05,
    });
    this.materials.push(floorMat);

    // 1. Pool Floor: spanning [-40, 40] at y = -0.9
    const floorGeo = new PlaneGeometry(80, 80);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMesh = new Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, WATER_FLOOR_Y, 0);
    floorMesh.receiveShadow = true;
    this.root.add(floorMesh);
    this.geometries.push(floorGeo);

    // 2. Platforms (SPAWN, A, B, C, D, E)
    for (const p of ARENA_PLATFORMS) {
      const w = p.maxX - p.minX;
      const d = p.maxZ - p.minZ;
      const h = p.topY - p.floorY; // 0.3 - (-0.9) = 1.2m solid height
      const cx = (p.minX + p.maxX) / 2;
      const cz = (p.minZ + p.maxZ) / 2;
      const cy = (p.topY + p.floorY) / 2;

      const platMesh = createTiledBoxMesh({
        w,
        h,
        d,
        material: platMat,
        uvOffsetSeed: cx + cz,
      });
      platMesh.position.set(cx, cy, cz);
      this.root.add(platMesh);
      this.geometries.push(platMesh.geometry);
    }

    // 3. Tiled Pillars
    for (const pil of ARENA_PILLARS) {
      const h = pil.y1 - pil.y0; // 4.0m
      const cy = (pil.y0 + pil.y1) / 2;

      const pilMesh = createTiledCylinderMesh({
        r: pil.r,
        h,
        material: wallMat,
        uvOffsetSeed: pil.decalNum * 13,
      });
      pilMesh.position.set(pil.cx, cy, pil.cz);
      this.root.add(pilMesh);
      this.geometries.push(pilMesh.geometry);

      // Decal on front (+Z face) of pillar
      const numTex = reg.getNumber(pil.decalNum);
      const decalMat = new MeshBasicMaterial({
        map: numTex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      this.materials.push(decalMat);

      const decalGeo = new PlaneGeometry(0.8, 1.2);
      const decalMesh = new Mesh(decalGeo, decalMat);
      decalMesh.position.set(pil.cx, cy, pil.cz + pil.r + 0.005);
      this.root.add(decalMesh);
      this.geometries.push(decalGeo);
    }

    // 4. Two Decorative Arches
    // Arch 1: over A/B crossing (around x = 7, z = 12)
    this.createArch(7.0, 12.0, 0, wallMat);
    // Arch 2: over A/C crossing (around x = -7.5, z = 12)
    this.createArch(-7.5, 12.0, 0, wallMat);

    // 5. Outer Ring of Tall Tiled Walls at +-40
    this.createBoundaryWalls(wallMat);

    // 6. Tagline graffiti on spawn wall behind at z = 36.9
    this.createSpawnWallDecor(wallMat);

    // 7. Warning Decals
    this.createWarningDecals();

    // 8. Interactive Metal Plate on Island B
    this.createInteractablePlate();
  }

  private createArch(cx: number, cz: number, rotY: number, mat: MeshStandardMaterial): void {
    const archShape = new Shape();
    archShape.moveTo(-1.6, 0);
    archShape.lineTo(-1.6, 2.8);
    archShape.absarc(0, 2.8, 1.6, Math.PI, 0, true);
    archShape.lineTo(1.6, 0);
    archShape.lineTo(1.1, 0);
    archShape.lineTo(1.1, 2.8);
    archShape.absarc(0, 2.8, 1.1, 0, Math.PI, false);
    archShape.lineTo(-1.1, 0);
    archShape.closePath();

    const archGeo = new ExtrudeGeometry(archShape, {
      depth: 0.4,
      bevelEnabled: false,
    });
    const archMesh = new Mesh(archGeo, mat);
    archMesh.position.set(cx, PLATFORM_TOP_Y, cz - 0.2);
    archMesh.rotation.y = rotY;
    archMesh.castShadow = true;
    this.root.add(archMesh);
    this.geometries.push(archGeo);
  }

  private createBoundaryWalls(mat: MeshStandardMaterial): void {
    const WALL_H = 8.0;
    const cy = (WATER_FLOOR_Y + WALL_H) / 2;

    // North wall (z = -40)
    const nWall = createTiledBoxMesh({ w: 82, h: WALL_H, d: 2, material: mat });
    nWall.position.set(0, cy, ARENA_BOUNDS.minZ - 1);
    this.root.add(nWall);
    this.geometries.push(nWall.geometry);

    // South wall (z = +40)
    const sWall = createTiledBoxMesh({ w: 82, h: WALL_H, d: 2, material: mat });
    sWall.position.set(0, cy, ARENA_BOUNDS.maxZ + 1);
    this.root.add(sWall);
    this.geometries.push(sWall.geometry);

    // West wall (x = -40)
    const wWall = createTiledBoxMesh({ w: 2, h: WALL_H, d: 82, material: mat });
    wWall.position.set(ARENA_BOUNDS.minX - 1, cy, 0);
    this.root.add(wWall);
    this.geometries.push(wWall.geometry);

    // East wall (x = +40)
    const eWall = createTiledBoxMesh({ w: 2, h: WALL_H, d: 82, material: mat });
    eWall.position.set(ARENA_BOUNDS.maxX + 1, cy, 0);
    this.root.add(eWall);
    this.geometries.push(eWall.geometry);
  }

  private createSpawnWallDecor(wallMat: MeshStandardMaterial): void {
    // Back wall at spawn (z = 37)
    const backWall = createTiledBoxMesh({ w: 14, h: 4.5, d: 1.0, material: wallMat });
    backWall.position.set(0, PLATFORM_TOP_Y + 2.25, 36.5);
    this.root.add(backWall);
    this.geometries.push(backWall.geometry);

    // Tagline decal
    const reg = TextureRegistry.getInstance();
    const tagTex = reg.getTagline(77, 1024, 512);
    const tagMat = new MeshBasicMaterial({
      map: tagTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.materials.push(tagMat);

    const tagGeo = new PlaneGeometry(4.8, 2.4);
    const tagMesh = new Mesh(tagGeo, tagMat);
    tagMesh.position.set(0, PLATFORM_TOP_Y + 2.0, 35.98);
    tagMesh.rotation.y = Math.PI; // facing -Z into the spawn area
    this.root.add(tagMesh);
    this.geometries.push(tagGeo);
  }

  private createWarningDecals(): void {
    const reg = TextureRegistry.getInstance();

    // 1. "shh" warning decal on Island A near channel to D
    const shhTex = reg.getWarning('shh');
    const shhMat = new MeshBasicMaterial({
      map: shhTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.materials.push(shhMat);

    const shhGeo = new PlaneGeometry(0.8, 0.8);
    shhGeo.rotateX(-Math.PI / 2);
    const shhMesh = new Mesh(shhGeo, shhMat);
    shhMesh.position.set(0, PLATFORM_TOP_Y + 0.005, 7.0);
    this.root.add(shhMesh);
    this.geometries.push(shhGeo);

    // 2. "arrow" warning decal pointing towards Island B
    const arrowTex = reg.getWarning('arrow');
    const arrowMat = new MeshBasicMaterial({
      map: arrowTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.materials.push(arrowMat);

    const arrowGeo = new PlaneGeometry(0.8, 0.8);
    arrowGeo.rotateX(-Math.PI / 2);
    const arrowMesh = new Mesh(arrowGeo, arrowMat);
    arrowMesh.position.set(4.5, PLATFORM_TOP_Y + 0.005, 12.0);
    arrowMesh.rotation.y = -Math.PI / 2; // point toward +X
    this.root.add(arrowMesh);
    this.geometries.push(arrowGeo);
  }

  private createInteractablePlate(): void {
    // Metal pressure plate on Island B at (10, 0.31, 12)
    const plateGeo = new CylinderGeometry(0.4, 0.45, 0.04, 16);
    const plateMat = new MeshStandardMaterial({
      color: 0x5a554a,
      roughness: 0.2,
      metalness: 0.85,
    });
    this.materials.push(plateMat);

    this.plateMesh = new Mesh(plateGeo, plateMat);
    this.plateMesh.position.set(10.0, PLATFORM_TOP_Y + 0.02, 12.0);
    this.plateMesh.receiveShadow = true;
    this.root.add(this.plateMesh);
    this.geometries.push(plateGeo);
  }

  getPlatePosition(): Vector3 {
    return this.plateMesh.position;
  }

  update(_dt: number): void {
    // Arena dynamic updates if needed in future batches
  }

  dispose(): void {
    for (const geo of this.geometries) {
      geo.dispose();
    }
    this.geometries = [];

    for (const mat of this.materials) {
      mat.dispose();
    }
    this.materials = [];

    while (this.root.children.length > 0) {
      this.root.remove(this.root.children[0]!);
    }
  }
}
