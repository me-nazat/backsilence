/* ── MonsterManager.ts ───────────────────────────────────────────────────────
 *  Manages presentation and audio for N monsters in the scene.
 *  Pairs each MonsterBody with its MonsterBrain and MonsterAudio controller.
 * ──────────────────────────────────────────────────────────────────────── */

import { Group, type Camera } from 'three';
import type { Vec3 } from '../../types/contracts.js';
import type { MonsterBrain } from '../../sim/MonsterBrain.js';
import type { GroundGrid } from '../../sim/GroundGrid.js';
import { MonsterBody } from './MonsterBody.js';
import { MonsterAudio } from './MonsterAudio.js';
import type { WaterSystem } from '../water/WaterSystem.js';
import type { AudioEngine } from '../../audio/AudioEngine.js';

export interface MonsterDef {
  id: string;
  variant: 'standard' | 'elder' | 'juvenile';
  spawn: Vec3;
  hearingMul?: number;
  speedMul?: number;
  scale?: number;
  tint?: string;
}

export class MonsterManager {
  readonly root = new Group();
  private readonly bodies = new Map<string, MonsterBody>();
  private readonly audios = new Map<string, MonsterAudio>();
  private readonly water?: WaterSystem | undefined;
  private readonly audio?: AudioEngine | undefined;
  skinChoice?: 'auto' | 'model' | 'procedural' = 'auto';

  constructor(water?: WaterSystem, audio?: AudioEngine, skinChoice: 'auto' | 'model' | 'procedural' = 'auto') {
    this.root.name = 'Monsters';
    this.water = water;
    this.audio = audio;
    this.skinChoice = skinChoice;
  }

  addMonster(def: MonsterDef): MonsterBody {
    const scale = def.scale ?? (def.variant === 'elder' ? 1.15 : def.variant === 'juvenile' ? 0.8 : 1.0);
    const tint = def.tint ?? (def.variant === 'elder' ? '#443825' : def.variant === 'juvenile' ? '#6e5a3c' : '#6b5f40');

    const skinChoice = this.skinChoice ?? 'auto';
    const body = new MonsterBody(def.id, scale, tint, this.water, this.audio);
    body.setSkinPreference(skinChoice);
    this.bodies.set(def.id, body);
    this.root.add(body.mesh.root);

    if (this.audio) {
      const monsterAudio = new MonsterAudio(def.id, this.audio);
      this.audios.set(def.id, monsterAudio);
    }

    return body;
  }

  removeMonster(id: string): void {
    const body = this.bodies.get(id);
    if (body) {
      this.root.remove(body.mesh.root);
      body.dispose();
      this.bodies.delete(id);
    }
    const audio = this.audios.get(id);
    if (audio) {
      audio.dispose();
      this.audios.delete(id);
    }
  }

  getBody(id: string): MonsterBody | undefined {
    return this.bodies.get(id);
  }

  update(
    dt: number,
    brains: MonsterBrain[],
    ground: GroundGrid,
    camera: Camera,
    playerPos: Vec3,
  ): void {
    for (let i = 0; i < brains.length; i++) {
      const brain = brains[i]!;
      const snap = brain.getSnapshot();
      const body = this.bodies.get(brain.id);
      if (body) {
        body.update(dt, snap, ground, camera);
        if (body.failed) {
          body.failed = false;
          body.reloadProceduralSkin();
        }
      }
      const mAudio = this.audios.get(brain.id);
      if (mAudio) {
        mAudio.update(dt, snap, playerPos);
      }
    }
  }

  dispose(): void {
    for (const body of this.bodies.values()) {
      this.root.remove(body.mesh.root);
      body.dispose();
    }
    this.bodies.clear();

    for (const audio of this.audios.values()) {
      audio.dispose();
    }
    this.audios.clear();
  }
}
