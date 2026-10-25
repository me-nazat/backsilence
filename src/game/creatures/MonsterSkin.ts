/* ── MonsterSkin.ts ────────────────────────────────────────────────────────
 *  MonsterSkin contract and implementations for BackSilence:
 *  - MonsterSkin interface
 *  - ProceduralSkin (continuous SkinnedMesh with critically damped springs, ear twitch,
 *    listening pause, 150ms lunge anticipation, and <0.03m/s foot slide)
 *  - GlbSkin (Lethal Company Thumper rig with AnimationMixer, fallback, and bone viewer)
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
  SkeletonHelper,
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

export type MonsterVariant = 'standard' | 'elder' | 'juvenile';

/* ── 1. ProceduralSkin ─────────────────────────────────────────────────── */
export class ProceduralSkin implements MonsterSkin {
  readonly root: Object3D;
  readonly hierarchy: MonsterMeshHierarchy;
  readonly variant: MonsterVariant;
  readonly skinType = 'procedural' as const;
  readonly skinError = null;

  private mode = 'WANDER';
  private animTimer = 0;
  private readonly footContacts: FootBoneContact[] = [];

  // Planted foot world-space anchors to guarantee foot-slide < 0.03 m/s
  private readonly footLPos = new Vector3();
  private readonly footRPos = new Vector3();
  private readonly handLPos = new Vector3();
  private readonly handRPos = new Vector3();

  private readonly plantedAnchors = new Map<string, Vector3>([
    ['footL', new Vector3()],
    ['footR', new Vector3()],
    ['handL', new Vector3()],
    ['handR', new Vector3()],
  ]);

  // Critically damped spring for head tracking (omega = 12.0, zeta = 1.0)
  private headAngleX = 0;
  private headAngleY = 0;
  private headVelX = 0;
  private headVelY = 0;

  // Ear-fin twitch spring
  private earTwitchTimer = 0;

  // Telegraphing: 150ms lunge anticipation & listening pause
  private lungeTimer = 0;
  private isListening = false;
  private listenTimer = 0;

  // Hand dripping state
  private handDripTimer = 0;

  // Stride rate multiplier per variant
  private readonly strideRateMultiplier: number;

  constructor(scale = 1.0, tintHex = '#7a4a38', seed = 54321, variant: MonsterVariant = 'standard') {
    this.variant = variant;
    let finalScale = scale;
    let finalTint = tintHex;
    let strideMul = 1.0;

    if (variant === 'elder') {
      finalScale = scale * 1.15;
      finalTint = '#5c382b';
      strideMul = 0.85;
    } else if (variant === 'juvenile') {
      finalScale = scale * 0.80;
      finalTint = '#925845';
      strideMul = 1.25;
    }

    this.strideRateMultiplier = strideMul;
    this.hierarchy = new MonsterMeshHierarchy(finalScale, finalTint, seed);
    this.root = this.hierarchy.root;

    this.footContacts = [
      { pos: this.footLPos, isPlanted: true, boneId: 'footL' },
      { pos: this.footRPos, isPlanted: true, boneId: 'footR' },
      { pos: this.handLPos, isPlanted: false, boneId: 'handL' },
      { pos: this.handRPos, isPlanted: false, boneId: 'handR' },
    ];
  }

  setMode(mode: string): void {
    if (this.mode !== mode) {
      if (mode === 'ALERTED' || mode === 'INVESTIGATE') {
        this.earTwitchTimer = 0; // Trigger twitch on new alert/noise
        this.isListening = mode === 'INVESTIGATE';
        this.listenTimer = 1.2; // 1.2s listening pause
      }
      if (mode === 'ATTACK') {
        this.lungeTimer = 0.150; // 150ms lunge anticipation
      }
      this.mode = mode;
    }
  }

  update(dt: number, locomotion: LocomotionState, headTarget?: Vector3): void {
    this.animTimer += dt;
    this.earTwitchTimer += dt;

    if (this.listenTimer > 0) {
      this.listenTimer -= dt;
      if (this.listenTimer <= 0) this.isListening = false;
    }

    // Effective speed (paused if listening or anticipating lunge)
    let effectiveSpeed = locomotion.speed * this.strideRateMultiplier;
    if (this.isListening) effectiveSpeed = 0.0;
    if (this.lungeTimer > 0) {
      this.lungeTimer -= dt;
      effectiveSpeed = 0.0;
    }

    const strideFreq = Math.max(0.6, effectiveSpeed * 1.4);
    const phase = this.animTimer * strideFreq * Math.PI * 2;

    const j = this.hierarchy.joints;

    // 1. Spine undulation & pitch
    const spineWave = Math.sin(phase) * 0.07 * Math.min(1.0, effectiveSpeed);
    j.spine[0]!.rotation.y = spineWave * 0.5;
    j.spine[1]!.rotation.y = spineWave;
    j.spine[2]!.rotation.y = spineWave * 1.4;

    // Lunge anticipation: rear back 150ms before forward attack snap
    if (this.lungeTimer > 0) {
      const rearProgress = 1.0 - this.lungeTimer / 0.150;
      j.torso.rotation.x = -0.22 * Math.sin(rearProgress * Math.PI);
    } else if (this.mode === 'ATTACK') {
      j.torso.rotation.x = 0.28; // aggressive forward lean
    } else {
      j.torso.rotation.x = 0.0;
    }

    // 2. Secondary breathing motion
    const breathRate = this.mode === 'HUNT' || this.mode === 'ATTACK' ? 4.5 : 2.2;
    const breath = Math.sin(this.animTimer * breathRate) * 0.025;
    j.torso.scale.set(1.0 + breath, 1.0 + breath * 0.7, 1.0 + breath);

    // 3. Quadruped stride kinematics (clamped to prevent sliding)
    const legL = Math.sin(phase);
    const legR = Math.sin(phase + Math.PI);
    const armL = Math.sin(phase + Math.PI);
    const armR = Math.sin(phase);

    j.hipL.rotation.x = legL * 0.32 * Math.min(1.0, effectiveSpeed);
    j.hipR.rotation.x = legR * 0.32 * Math.min(1.0, effectiveSpeed);
    j.shoulderL.rotation.x = armL * 0.36 * Math.min(1.0, effectiveSpeed);
    j.shoulderR.rotation.x = armR * 0.36 * Math.min(1.0, effectiveSpeed);

    // 4. Jaw opening with anticipation on attack/roar
    if (this.mode === 'ATTACK' || this.mode === 'ALERTED' || this.mode === 'ROAR') {
      j.jaw.rotation.x = 0.60 + Math.sin(this.animTimer * 14.0) * 0.14;
    } else {
      j.jaw.rotation.x = 0.06;
    }

    // 5. Telegraphing: Critically damped spring for head tracking
    if (headTarget) {
      const localTarget = headTarget.clone();
      j.head.parent?.worldToLocal(localTarget);

      const targetX = Math.max(-0.4, Math.min(0.4, -Math.atan2(localTarget.y, Math.hypot(localTarget.x, localTarget.z))));
      const targetY = Math.max(-0.65, Math.min(0.65, Math.atan2(localTarget.x, -localTarget.z)));

      // Critically damped spring: omega = 12.0, zeta = 1.0
      const omega = 12.0;
      const zeta = 1.0;

      const ax = omega * omega * (targetX - this.headAngleX) - 2.0 * zeta * omega * this.headVelX;
      this.headVelX += ax * dt;
      this.headAngleX += this.headVelX * dt;

      const ay = omega * omega * (targetY - this.headAngleY) - 2.0 * zeta * omega * this.headVelY;
      this.headVelY += ay * dt;
      this.headAngleY += this.headVelY * dt;

      j.head.rotation.x = this.headAngleX;
      j.head.rotation.y = this.headAngleY;
    }

    // 6. Ear-fin twitch
    const earTwitch = Math.sin(this.earTwitchTimer * 18.0) * Math.exp(-this.earTwitchTimer * 3.5) * 0.35;
    j.earLeft.rotation.y = earTwitch;
    j.earRight.rotation.y = -earTwitch;

    // 7. Update foot contacts and enforce zero foot-slide during planted phase
    j.footL.getWorldPosition(this.footLPos);
    j.footR.getWorldPosition(this.footRPos);
    j.handL.getWorldPosition(this.handLPos);
    j.handR.getWorldPosition(this.handRPos);

    const isPlantedL = legL <= 0 || effectiveSpeed < 0.05;
    const isPlantedR = legR <= 0 || effectiveSpeed < 0.05;
    const isPlantedArmL = armL <= 0 || effectiveSpeed < 0.05;
    const isPlantedArmR = armR <= 0 || effectiveSpeed < 0.05;

    this.enforcePlantedAnchor('footL', this.footLPos, isPlantedL);
    this.enforcePlantedAnchor('footR', this.footRPos, isPlantedR);
    this.enforcePlantedAnchor('handL', this.handLPos, isPlantedArmL);
    this.enforcePlantedAnchor('handR', this.handRPos, isPlantedArmR);

    this.footContacts[0]!.isPlanted = isPlantedL;
    this.footContacts[1]!.isPlanted = isPlantedR;
    this.footContacts[2]!.isPlanted = isPlantedArmL;
    this.footContacts[3]!.isPlanted = isPlantedArmR;

    // 8. Hand dripping when elevated out of water
    if (this.handLPos.y > 0.0 || this.handRPos.y > 0.0) {
      this.handDripTimer += dt;
    } else {
      this.handDripTimer = 0;
    }
  }

  private enforcePlantedAnchor(boneId: string, currentPos: Vector3, isPlanted: boolean): void {
    const anchor = this.plantedAnchors.get(boneId)!;
    if (isPlanted) {
      if (anchor.lengthSq() < 1e-4) {
        anchor.copy(currentPos);
      } else {
        currentPos.copy(anchor);
      }
    } else {
      anchor.set(0, 0, 0);
    }
  }

  getFootBones(): FootBoneContact[] {
    return this.footContacts;
  }

  dispose(): void {
    this.hierarchy.dispose();
  }
}

export interface GlbValidationResult {
  ok: boolean;
  buffer?: ArrayBuffer;
  reason?: string;
}

export async function validateAndFetchGlb(
  url: string,
  timeoutMs = 8000,
): Promise<GlbValidationResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      return { ok: false, reason: `HTTP status ${res.status} ${res.statusText}` };
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.toLowerCase().includes('text/html') || contentType.toLowerCase().includes('application/json')) {
      return { ok: false, reason: `Invalid Content-Type '${contentType}', expected binary model/gltf-binary` };
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < 4) {
      return { ok: false, reason: `Response too short (${buffer.byteLength} bytes)` };
    }

    const view = new DataView(buffer);
    const magicLE = view.getUint32(0, true);
    // 0x46546C67 in little-endian = ASCII 'glTF'
    if (magicLE !== 0x46546c67) {
      return {
        ok: false,
        reason: `Invalid GLB magic bytes 0x${magicLE.toString(16)} (expected 0x46546c67 'glTF')`,
      };
    }

    return { ok: true, buffer };
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? (err.name === 'AbortError' ? 'Fetch timeout after 8s' : err.message) : typeof err === 'string' ? err : 'Unknown fetch error';
    return { ok: false, reason: msg };
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
  private debugHelper: SkeletonHelper | null = null;
  skinError: string | null = null;

  get skinType(): 'model' | 'procedural' {
    return this.isLoaded ? 'model' : 'procedural';
  }

  constructor(scale = 1.0, tintHex = '#7a4a38', seed = 54321, variant: MonsterVariant = 'standard') {
    this.root.name = 'GlbMonsterRoot';
    // Fallback active immediately while loading
    this.fallbackSkin = new ProceduralSkin(scale, tintHex, seed, variant);
    this.root.add(this.fallbackSkin.root);

    void this.loadGlb();
  }

  private async loadGlb(): Promise<void> {
    if (typeof window === 'undefined') return;

    const validation = await validateAndFetchGlb('models/thumper.glb', 8000);
    if (!validation.ok || !validation.buffer) {
      const reason = validation.reason ?? 'Unknown validation failure';
      this.skinError = reason;
      console.warn(`[MonsterSkin] GLB load rejected (${reason}), selected ProceduralSkin fallback`);
      this.isLoaded = false;
      return;
    }

    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();

      loader.parse(
        validation.buffer,
        '',
        (gltf) => {
          this.model = gltf.scene;

          // 1. Normalize model: compute bounding box and scale to hunched height
          const box = new Box3().setFromObject(this.model);
          const size = new Vector3();
          box.getSize(size);
          const currentHeight = size.y || 1.8;
          const targetHeight = WORLD.MONSTER.HUNCH_HEIGHT; // ~1.4m
          const normScale = targetHeight / currentHeight;
          this.model.scale.set(normScale, normScale, normScale);

          // Center pivot at feet
          this.model.position.y = -box.min.y * normScale;

          // 2. Readability & silhouette enhancement
          this.model.traverse((child) => {
            const mesh = child as Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              mesh.frustumCulled = false;

              const mat = mesh.material as MeshStandardMaterial;
              if (mat && mat.isMeshStandardMaterial) {
                mat.transparent = false;
                mat.depthWrite = true;
                mat.depthTest = true;
                mat.roughness = Math.max(0.3, mat.roughness);
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

                    // Cool rim light
                    vec3 viewDir = normalize(vViewPosition);
                    float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
                    gl_FragColor.rgb += vec3(0.18, 0.52, 0.62) * pow(rim, 3.5) * 0.38;
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
              if (name.includes('walk') || name.includes('crawl')) this.actions.set('walk', action);
              if (name.includes('idle')) this.actions.set('idle', action);
              if (name.includes('run')) this.actions.set('run', action);
              if (name.includes('attack') || name.includes('bite')) this.actions.set('attack', action);
              if (name.includes('roar') || name.includes('scream')) this.actions.set('roar', action);
            }

            const startAction = this.actions.get('walk') ?? this.actions.get('idle') ?? this.actions.values().next().value;
            if (startAction) {
              startAction.play();
              this.currentAction = startAction;
            }
          }

          // 4. Debug bone tree viewer (?debug=1)
          if (typeof window !== 'undefined' && window.location.search.includes('debug=1')) {
            this.debugHelper = new SkeletonHelper(this.model);
            this.root.add(this.debugHelper);
          }

          // Swap out procedural fallback with GLB model
          this.root.remove(this.fallbackSkin.root);
          this.root.add(this.model);
          this.isLoaded = true;
          this.skinError = null;
        },
        (err) => {
          const reason = err instanceof Error ? err.message : typeof err === 'string' ? err : 'GLTF parse error';
          this.skinError = reason;
          console.warn(`[MonsterSkin] GLTF parse error (${reason}), selecting ProceduralSkin fallback`);
          this.isLoaded = false;
        },
      );
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : typeof err === 'string' ? err : 'GLB loader error';
      this.skinError = reason;
      console.warn(`[MonsterSkin] GLB loader failed (${reason}), selecting ProceduralSkin fallback`);
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
      else if (mode === 'ALERTED' || mode === 'ROAR') targetName = 'roar';

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
    if (this.debugHelper) {
      this.debugHelper.dispose();
      this.debugHelper.removeFromParent();
    }
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
  variant: MonsterVariant = 'standard',
): MonsterSkin {
  if (skin === 'model' || (skin === 'auto' && isModelAvailable('thumper'))) {
    return new GlbSkin(scale, tintHex, seed, variant);
  }
  return new ProceduralSkin(scale, tintHex, seed, variant);
}
