/* ── MonsterSkin.ts ────────────────────────────────────────────────────────
 *  MonsterSkin contract and implementations for BackSilence:
 *  - MonsterSkin interface
 *  - ProceduralSkin (fallback and default procedural hierarchical skeleton)
 *  - GlbSkin (Lethal Company Thumper rig integration with procedural IK/AnimationMixer)
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Object3D,
  Vector3,
  AnimationMixer,
  type AnimationAction,
  type Group,
  type Mesh,
  MeshStandardMaterial,
  Box3,
} from 'three';
import { MonsterMeshHierarchy } from '../monster/MonsterMesh.js';
import { WORLD } from '../../app/Config.js';
import { isModelAvailable } from './ModelManifest.js';

export interface LocomotionState {
  speed: number;
  isGrounded: boolean;
  isWading: boolean;
  waterDepth: number;
}

export interface FootBoneContact {
  pos: Vector3;
  isPlanted: boolean;
  boneId: string;
}

export interface MonsterSkin {
  readonly root: Object3D;
  setMode(mode: string): void;
  update(dt: number, locomotion: LocomotionState, headTarget?: Vector3): void;
  getFootBones(): FootBoneContact[];
  dispose(): void;
}

/* ── 1. ProceduralSkin ─────────────────────────────────────────────────── */
export class ProceduralSkin implements MonsterSkin {
  readonly root: Object3D;
  readonly hierarchy: MonsterMeshHierarchy;

  private mode = 'WANDER';
  private animTimer = 0;
  private readonly footContacts: FootBoneContact[] = [];
  private readonly footLPos = new Vector3();
  private readonly footRPos = new Vector3();
  private readonly handLPos = new Vector3();
  private readonly handRPos = new Vector3();

  constructor(scale = 1.0, tintHex = '#7a4a38', seed = 54321) {
    this.hierarchy = new MonsterMeshHierarchy(scale, tintHex, seed);
    this.root = this.hierarchy.root;

    this.footContacts = [
      { pos: this.footLPos, isPlanted: true, boneId: 'footL' },
      { pos: this.footRPos, isPlanted: true, boneId: 'footR' },
      { pos: this.handLPos, isPlanted: false, boneId: 'handL' },
      { pos: this.handRPos, isPlanted: false, boneId: 'handR' },
    ];
  }

  setMode(mode: string): void {
    this.mode = mode;
  }

  update(dt: number, locomotion: LocomotionState, headTarget?: Vector3): void {
    this.animTimer += dt;
    const strideFreq = Math.max(0.8, locomotion.speed * 1.4);
    const phase = this.animTimer * strideFreq * Math.PI * 2;

    const j = this.hierarchy.joints;

    // Spine undulation
    const spineWave = Math.sin(phase) * 0.08 * Math.min(1.0, locomotion.speed);
    j.spine[0]!.rotation.y = spineWave * 0.5;
    j.spine[1]!.rotation.y = spineWave;
    j.spine[2]!.rotation.y = spineWave * 1.5;

    // Breathing
    const breath = Math.sin(this.animTimer * 2.5) * 0.03;
    j.torso.scale.set(1.0 + breath, 1.0 + breath * 0.8, 1.0 + breath);

    // Quadruped walk cycle
    const legL = Math.sin(phase);
    const legR = Math.sin(phase + Math.PI);
    const armL = Math.sin(phase + Math.PI);
    const armR = Math.sin(phase);

    j.hipL.rotation.x = legL * 0.35 * Math.min(1.0, locomotion.speed);
    j.hipR.rotation.x = legR * 0.35 * Math.min(1.0, locomotion.speed);
    j.shoulderL.rotation.x = armL * 0.4 * Math.min(1.0, locomotion.speed);
    j.shoulderR.rotation.x = armR * 0.4 * Math.min(1.0, locomotion.speed);

    // Jaw open on roar / attack
    if (this.mode === 'ATTACK' || this.mode === 'ALERTED') {
      j.jaw.rotation.x = 0.55 + Math.sin(this.animTimer * 12.0) * 0.12;
    } else {
      j.jaw.rotation.x = 0.08;
    }

    // Head tracking towards player/sound if provided
    if (headTarget) {
      j.head.lookAt(headTarget);
      j.head.rotation.x = Math.max(-0.4, Math.min(0.4, j.head.rotation.x));
      j.head.rotation.y = Math.max(-0.6, Math.min(0.6, j.head.rotation.y));
    }

    // Update foot contacts
    j.footL.getWorldPosition(this.footLPos);
    j.footR.getWorldPosition(this.footRPos);
    j.handL.getWorldPosition(this.handLPos);
    j.handR.getWorldPosition(this.handRPos);

    this.footContacts[0]!.isPlanted = legL <= 0;
    this.footContacts[1]!.isPlanted = legR <= 0;
    this.footContacts[2]!.isPlanted = armL <= 0;
    this.footContacts[3]!.isPlanted = armR <= 0;
  }

  getFootBones(): FootBoneContact[] {
    return this.footContacts;
  }

  dispose(): void {
    this.hierarchy.dispose();
  }
}

/* ── 2. GlbSkin (Thumper Rig) ─────────────────────────────────────────── */
export class GlbSkin implements MonsterSkin {
  readonly root = new Object3D();
  private model: Group | null = null;
  private mixer: AnimationMixer | null = null;
  private actions = new Map<string, AnimationAction>();
  private currentAction: AnimationAction | null = null;
  private fallbackSkin: ProceduralSkin;
  private isLoaded = false;
  private readonly footContacts: FootBoneContact[] = [];

  constructor(scale = 1.0, tintHex = '#7a4a38', seed = 54321) {
    this.root.name = 'GlbMonsterRoot';
    // Fallback active immediately while loading
    this.fallbackSkin = new ProceduralSkin(scale, tintHex, seed);
    this.root.add(this.fallbackSkin.root);

    void this.loadGlb();
  }

  private async loadGlb(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();

      loader.load(
        'models/thumper.glb',
        (gltf) => {
          this.model = gltf.scene;

          // 1. Normalize model: compute bounding box and scale to hunched height
          const box = new Box3().setFromObject(this.model);
          const size = new Vector3();
          box.getSize(size);
          const currentHeight = size.y || 1.8;
          const targetHeight = WORLD.MONSTER.HUNCH_HEIGHT; // ~1.85m
          const normScale = targetHeight / currentHeight;
          this.model.scale.set(normScale, normScale, normScale);

          // Center pivot at feet
          this.model.position.y = -box.min.y * normScale;

          // 2. Silhouette boost and material enhancement
          this.model.traverse((child) => {
            const mesh = child as Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              mesh.frustumCulled = false;

              const mat = mesh.material as MeshStandardMaterial;
              if (mat && mat.isMeshStandardMaterial) {
                mat.roughness = Math.max(0.3, mat.roughness);
                // Silhouette fog boost
                mat.onBeforeCompile = (shader) => {
                  shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <fog_fragment>',
                    /* glsl */ `
                    #ifdef USE_FOG
                      #ifdef FOG_EXP2
                        float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
                      #else
                        float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
                      #endif
                      fogFactor = clamp(fogFactor * 0.60, 0.0, 1.0);
                      gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
                    #endif
                    `,
                  );
                };
              }
            }
          });

          // 3. Animation mixer setup if clips exist
          if (gltf.animations && gltf.animations.length > 0) {
            this.mixer = new AnimationMixer(this.model);
            for (const clip of gltf.animations) {
              const name = clip.name.toLowerCase();
              const action = this.mixer.clipAction(clip);
              this.actions.set(name, action);
              // Fuzzy match standard names
              if (name.includes('walk') || name.includes('crawl')) this.actions.set('walk', action);
              if (name.includes('idle')) this.actions.set('idle', action);
              if (name.includes('run')) this.actions.set('run', action);
              if (name.includes('attack') || name.includes('bite')) this.actions.set('attack', action);
              if (name.includes('roar') || name.includes('scream')) this.actions.set('roar', action);
            }

            // Play idle/walk by default
            const startAction = this.actions.get('walk') ?? this.actions.get('idle') ?? this.actions.values().next().value;
            if (startAction) {
              startAction.play();
              this.currentAction = startAction;
            }
          }

          // Swap out procedural fallback with GLB model
          this.root.remove(this.fallbackSkin.root);
          this.root.add(this.model);
          this.isLoaded = true;
        },
        undefined,
        () => {
          // Keep procedural fallback if GLB not found or failed
          this.isLoaded = false;
        },
      );
    } catch {
      this.isLoaded = false;
    }
  }

  setMode(mode: string): void {
    if (!this.isLoaded) {
      this.fallbackSkin.setMode(mode);
      return;
    }

    if (this.mixer) {
      let targetName = 'idle';
      if (mode === 'WANDER' || mode === 'INVESTIGATE') targetName = 'walk';
      else if (mode === 'HUNT') targetName = 'run';
      else if (mode === 'ATTACK') targetName = 'attack';
      else if (mode === 'ALERTED') targetName = 'roar';

      const nextAction = this.actions.get(targetName) ?? this.actions.get('walk');
      if (nextAction && nextAction !== this.currentAction) {
        nextAction.reset().fadeIn(0.2).play();
        this.currentAction?.fadeOut(0.2);
        this.currentAction = nextAction;
      }
    }
  }

  update(dt: number, locomotion: LocomotionState, headTarget?: Vector3): void {
    if (!this.isLoaded) {
      this.fallbackSkin.update(dt, locomotion, headTarget);
      return;
    }

    if (this.mixer) {
      // Speed-scale locomotion animations
      if (this.currentAction) {
        const timeScale = Math.max(0.5, locomotion.speed / 2.5);
        this.currentAction.timeScale = timeScale;
      }
      this.mixer.update(dt);
    }
  }

  getFootBones(): FootBoneContact[] {
    if (!this.isLoaded) {
      return this.fallbackSkin.getFootBones();
    }
    return this.footContacts;
  }

  dispose(): void {
    this.fallbackSkin.dispose();
    if (this.model) {
      this.model.traverse((child) => {
        const m = child as Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
          else m.material?.dispose();
        }
      });
      this.model.removeFromParent();
    }
  }
}

export function createMonsterSkin(
  skin: 'auto' | 'model' | 'procedural' = 'auto',
  scale = 1.0,
  tintHex = '#7a4a38',
  seed = 54321,
): MonsterSkin {
  if (skin === 'model' || (skin === 'auto' && isModelAvailable('thumper'))) {
    return new GlbSkin(scale, tintHex, seed);
  }
  return new ProceduralSkin(scale, tintHex, seed);
}

