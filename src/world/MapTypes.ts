/* ── MapTypes.ts ───────────────────────────────────────────────────────────
 *  Pure data contracts for BackSilence procedural map generation, layout data,
 *  definitions, atmosphere presets, and rendering builders.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3, MapId, PostGrade } from '../types/contracts.js';
import type { MonsterDef } from '../sim/MonsterBrain.js';
import type { MapInstance } from './maps/MapInstance.js';
import type { WaterProfile } from '../game/water/WaterProfile.js';
import type { ReverbPreset } from '../audio/Reverb.js';

export interface LayoutCtx {
  seed: number;
  difficulty: 'whisper' | 'normal' | 'deafening';
  playerCount: number;
}

export type PlatformKind = 'tile' | 'metal' | 'marble' | 'concrete';

export interface DynamicDef {
  id: string;
  type: 'sinking' | 'moving';
  sinkDepth?: number;
  standThreshold?: number;
  riseTime?: number;
  sinkTime?: number;
  submergedTime?: number;
}

export interface PlatformDef {
  id: string;
  rect: [number, number, number, number]; // [minX, minZ, maxX, maxZ]
  topY: number;
  kind: PlatformKind;
  dynamic?: DynamicDef;
}

export interface BoxDef {
  id: string;
  min: Vec3;
  max: Vec3;
  kind?: string | undefined;
  isWall?: boolean | undefined;
}

export interface PillarDef {
  id: string;
  x: number;
  z: number;
  radius: number;
  height: number;
  decalNumber?: number | undefined;
  ordinal?: number | undefined; // 1..4 for code pillars, undefined for decoys
  kind?: 'tile' | 'marble' | 'concrete' | undefined;
}

export interface StairDef {
  id: string;
  x: number;
  z: number;
  width: number;
  riser: number;
  run: number;
  steps: number;
  baseY: number;
  direction: 'x+' | 'x-' | 'z+' | 'z-';
}

export interface WaterBodyDef {
  id: string;
  rect: [number, number, number, number];
  floorY: number;
  waterY: number;
}

export interface PropDef {
  id: string;
  kind: string;
  position: Vec3;
  yaw?: number;
  params?: Record<string, unknown>;
}

export interface PuzzleDef {
  id: string;
  type: string;
  position: Vec3;
  params?: Record<string, unknown>;
}

export interface PatrolLane {
  id: string;
  points: Vec3[];
}

export interface LayoutData {
  mapId: MapId;
  seed: number;
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  platforms: PlatformDef[];
  walls: BoxDef[];
  pillars: PillarDef[];
  stairs: StairDef[];
  waterBodies: WaterBodyDef[];
  props: PropDef[];
  puzzles: PuzzleDef[];
  spawns: {
    player: Vec3[];
    monsters: MonsterDef[];
  };
  patrolLanes?: PatrolLane[];
  exit: {
    id: string;
    position: Vec3;
  };
  meta: Record<string, unknown>;
}

export interface AtmospherePreset {
  fog: {
    color: string;
    density: number;
  };
  exposure: number;
  hemisphere: {
    sky: string;
    ground: string;
  };
  sun?: {
    color: string;
    intensity: number;
    direction: Vec3;
    castShadow?: boolean;
  };
}

export interface BuildEnv {
  parent: unknown; // THREE.Object3D / Group
  textures: unknown; // TextureRegistry
  audio: unknown; // AudioEngine
  difficulty: 'whisper' | 'normal' | 'deafening';
}

export interface MapDefinition {
  id: MapId;
  name: string;
  tagline: string;
  stars: 1 | 2 | 3 | 4 | 5;
  reverb: ReverbPreset;
  acoustics: {
    hearingMul: number;
    maskZones?: boolean;
  };
  atmosphere: AtmospherePreset;
  waterProfile: WaterProfile;
  postGrade?: PostGrade;

  /** Pure and deterministic layout generation */
  generateLayout(ctx: LayoutCtx): LayoutData;

  /** Async Three.js & Sim constructor */
  build(layout: LayoutData, env: BuildEnv): Promise<MapInstance>;

  /** Procedural 2D mini-map rendering for map picker and loading screen */
  drawThumbnail(g: CanvasRenderingContext2D, layout: LayoutData, w: number, h: number): void;
}
