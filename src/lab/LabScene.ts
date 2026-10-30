/* ── LabScene.ts ──────────────────────────────────────────────────────────
 *  Material & Audio Lab scene and live 3D Main Menu background.
 *  Atmospheric Backrooms Poolrooms environment featuring tiled platforms,
 *  water trench, giant pillar number decals, tagline wall, caustic floor,
 *  interactive ripple demo, free-fly camera, and cinematic menu drift.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Scene,
  PerspectiveCamera,
  Color,
  FogExp2,
  HemisphereLight,
  DirectionalLight,
  PointLight,
  BoxGeometry,
  PlaneGeometry,
  ExtrudeGeometry,
  Shape,
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  DoubleSide,
  Raycaster,
  Vector2,
  Vector3,
  type Texture,
} from 'three';

import { WORLD } from '../app/Config.js';
import type { Settings } from '../types/contracts.js';
import { EngineRenderer } from '../engine/Renderer.js';
import { InputManager } from '../engine/Input.js';
import { TextureRegistry } from '../procedural/textures/TextureRegistry.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { AudioLabPanel } from './AudioLabPanel.js';
import { AnimationLabPanel } from './AnimationLabPanel.js';
import { ScaleLab } from './ScaleLab.js';
import { causticsChunk } from '../procedural/shaders/caustics.glsl.js';
import { resolveQualityTier } from '../engine/Quality.js';

export interface LabSceneOptions {
  isMenuMode?: boolean;
  onToggleHud?: () => void;
}

interface ActiveRipple {
  mesh: Mesh;
  startTime: number;
  duration: number;
  maxScale: number;
}

export class LabScene {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: EngineRenderer;
  readonly input: InputManager;
  readonly audioLabPanel: AudioLabPanel;
  readonly animLabPanel: AnimationLabPanel;
  readonly scaleLab: ScaleLab;

  private isMenuMode: boolean;
  private settings: Settings;
  private onToggleHud?: () => void;

  get currentSettings(): Settings {
    return this.settings;
  }

  setSettings(newSettings: Settings): void {
    this.settings = newSettings;
    const tier = resolveQualityTier(newSettings.graphics.quality);
    this.renderer.applySettings(newSettings);
    if (this.camera) {
      this.camera.fov = newSettings.graphics.fov;
      this.camera.updateProjectionMatrix();
    }
    if (this.dirLight) {
      if (tier === 'low') {
        this.dirLight.castShadow = false;
      } else {
        this.dirLight.castShadow = true;
        const res = tier === 'high' ? 1024 : 512;
        this.dirLight.shadow.mapSize.width = res;
        this.dirLight.shadow.mapSize.height = res;
        if (this.dirLight.shadow.map) {
          this.dirLight.shadow.map.dispose();
          this.dirLight.shadow.map = null as any;
        }
      }
    }
  }

  private hemiLight!: HemisphereLight;
  private dirLight!: DirectionalLight;
  private pointLight!: PointLight;

  private waterMesh!: Mesh;
  private waterNormalTex!: Texture;
  private waterFloorMat!: MeshStandardMaterial;
  private pillarDecalMesh!: Mesh;

  private pillarNumber = 2;
  private isFogEnabled = true;
  private lightingPreset = 0;
  private isWireframe = false;

  private activeRipples: ActiveRipple[] = [];
  private raycaster = new Raycaster();
  private mouseVec = new Vector2();

  // Free-fly camera state
  private camPos = new Vector3(0, 1.6, 4.5);
  private camYaw = 0.0;
  private camPitch = -0.15;
  private isDraggingMouse = false;
  private prevMouseX = 0;
  private prevMouseY = 0;

  private time = 0;
  private lastWakeTime = 0;
  private isDisposed = false;

  constructor(
    container: HTMLElement,
    settings: Settings,
    options: LabSceneOptions = {},
  ) {
    this.settings = settings;
    this.isMenuMode = options.isMenuMode ?? false;
    if (options.onToggleHud) {
      this.onToggleHud = options.onToggleHud;
    }

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(
      settings.graphics.fov,
      container.clientWidth / container.clientHeight,
      0.1,
      80.0,
    );

    this.renderer = new EngineRenderer(container, settings);
    this.input = new InputManager(settings);
    this.input.attach(this.renderer.canvas);

    this.audioLabPanel = new AudioLabPanel(AudioEngine.getInstance());
    this.audioLabPanel.mount(container);

    this.animLabPanel = new AnimationLabPanel(this.scene, { isMenuMode: this.isMenuMode });
    this.animLabPanel.mount(container);
    if (typeof window !== 'undefined' && window.location.search.includes('lab=anim')) {
      this.animLabPanel.show();
    }

    this.scaleLab = new ScaleLab();
    this.scene.add(this.scaleLab.group);
    const isScaleLab = typeof window !== 'undefined' && window.location.search.includes('lab=scale');
    this.scaleLab.group.visible = isScaleLab;
    if (isScaleLab) {
      this.scaleLab.mount(container);
      this.camPos.set(0, 1.65, 3.8);
      this.camYaw = 0.0;
      this.camPitch = -0.05;
    }

    this.setupAtmosphere();
    this.setupSet();
    this.setupEvents();
  }

  private setupAtmosphere(): void {
    const fogHex = this.isMenuMode ? '#0a100d' : '#b3bb9f';
    const fogColor = new Color(fogHex);
    this.scene.background = fogColor;
    this.scene.fog = new FogExp2(fogColor, this.isMenuMode ? 0.055 : 0.045);

    // Warm-cream or deep-analog hemisphere light with subtle bounce
    const skyColor = this.isMenuMode ? '#18241e' : '#b3bb9f';
    const gndColor = this.isMenuMode ? '#050a08' : '#7c9e5b';
    const hemiIntensity = this.isMenuMode ? 0.65 : 0.95;
    this.hemiLight = new HemisphereLight(skyColor, gndColor, hemiIntensity);
    this.scene.add(this.hemiLight);

    // Directional light casting soft PCF shadows
    const dirColor = this.isMenuMode ? '#c8f0db' : '#fff8e7';
    const dirIntensity = this.isMenuMode ? 0.85 : 1.25;
    this.dirLight = new DirectionalLight(dirColor, dirIntensity);
    this.dirLight.position.set(8, 12, 6);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 40;
    this.dirLight.shadow.bias = -0.0004;
    this.scene.add(this.dirLight);

    // Faint atmospheric point light
    this.pointLight = new PointLight(this.isMenuMode ? '#4ade80' : '#b3bb9f', this.isMenuMode ? 0.4 : 0.6, 25);
    this.pointLight.position.set(0, 3.2, 0);
    this.scene.add(this.pointLight);
  }

  private setupSet(): void {
    const reg = TextureRegistry.getInstance();
    const platTex = reg.getTileSet('platform', 42, 512);
    const wallTex = reg.getTileSet('wall', 42, 512);
    const floorWetTex = reg.getTileSet('floorWet', 42, 512);
    const causticsTex = reg.getCaustics(this.renderer.renderer, 42, 512);
    this.waterNormalTex = reg.getWaterNormal(101, 512);

    // Materials
    const platMat = new MeshStandardMaterial({
      map: platTex.albedo,
      normalMap: platTex.normal,
      roughnessMap: platTex.roughness,
      roughness: 0.35,
      metalness: 0.05,
    });

    const wallMat = new MeshStandardMaterial({
      map: wallTex.albedo,
      normalMap: wallTex.normal,
      roughnessMap: wallTex.roughness,
      roughness: 0.35,
      metalness: 0.05,
    });

    // 1. Platform Slabs (6 x 0.3 x 6 m) separated by 1.5m trench
    const slabGeo = new BoxGeometry(6.0, 0.3, 6.0);

    const slab1 = new Mesh(slabGeo, platMat);
    slab1.position.set(-3.75, 0.15, 0);
    slab1.receiveShadow = true;
    this.scene.add(slab1);

    const slab2 = new Mesh(slabGeo, platMat);
    slab2.position.set(3.75, 0.15, 0);
    slab2.receiveShadow = true;
    this.scene.add(slab2);

    // 2. Square Pillar (1 x 4 x 1 m) with Wall Tiles
    const pillarGeo = new BoxGeometry(1.0, 4.0, 1.0);
    const pillar = new Mesh(pillarGeo, wallMat);
    pillar.position.set(-2.0, 2.0, -1.2);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    this.scene.add(pillar);

    // Number Decal on front face of pillar (offset 2mm forward)
    const numberTex = reg.getNumber(this.pillarNumber);
    const numDecalMat = new MeshBasicMaterial({
      map: numberTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const numDecalGeo = new PlaneGeometry(0.85, 1.275);
    this.pillarDecalMesh = new Mesh(numDecalGeo, numDecalMat);
    this.pillarDecalMesh.position.set(-2.0, 2.0, -0.698);
    this.scene.add(this.pillarDecalMesh);

    // 3. Tiled Wall (8 x 3 x 0.3 m) with Tagline Decal
    const backWallGeo = new BoxGeometry(8.0, 3.2, 0.3);
    const backWall = new Mesh(backWallGeo, wallMat);
    backWall.position.set(0, 1.6, -3.2);
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    const taglineTex = reg.getTagline(77, 1024, 512);
    const taglineMat = new MeshBasicMaterial({
      map: taglineTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const taglineGeo = new PlaneGeometry(4.2, 2.1);
    const tagMesh = new Mesh(tagGeoOrDefault(taglineGeo), taglineMat);
    tagMesh.position.set(0, 1.6, -3.048);
    this.scene.add(tagMesh);

    // 4. Extruded Archway (Half-circle opening)
    const archShape = new Shape();
    archShape.moveTo(-1.8, 0);
    archShape.lineTo(-1.8, 3.0);
    archShape.absarc(0, 3.0, 1.8, Math.PI, 0, true);
    archShape.lineTo(1.8, 0);
    archShape.lineTo(1.2, 0);
    archShape.lineTo(1.2, 3.0);
    archShape.absarc(0, 3.0, 1.2, 0, Math.PI, false);
    archShape.lineTo(-1.2, 0);
    archShape.closePath();

    const archGeo = new ExtrudeGeometry(archShape, {
      depth: 0.3,
      bevelEnabled: false,
    });
    const archMesh = new Mesh(archGeo, wallMat);
    archMesh.position.set(2.8, 0.0, -1.8);
    archMesh.castShadow = true;
    this.scene.add(archMesh);

    // 5. Floor beneath water with caustics
    this.waterFloorMat = new MeshStandardMaterial({
      map: floorWetTex.albedo,
      normalMap: floorWetTex.normal,
      roughness: 0.15,
      metalness: 0.05,
    });

    // onBeforeCompile to inject causticsChunk
    this.waterFloorMat.onBeforeCompile = (shader) => {
      shader.uniforms.tCaustics = { value: causticsTex };
      shader.uniforms.uTime = { value: 0 };
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `
        #include <common>
        ${causticsChunk}
        `,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        #include <map_fragment>
        #if defined(USE_MAP)
        float causticLum = caustics(vMapUv * 6.0, uTime);
        diffuseColor.rgb += vec3(causticLum * 0.42);
        #endif
        `,
      );
      this.waterFloorMat.userData.shader = shader;
    };

    const floorGeo = new PlaneGeometry(16.0, 16.0);
    const floorMesh = new Mesh(floorGeo, this.waterFloorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(0, WORLD.POOL_FLOOR_Y, 0);
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);

    // 6. Water Plane
    const waterMat = new MeshStandardMaterial({
      color: new Color('#7c9e5b'),
      normalMap: this.waterNormalTex,
      transparent: true,
      opacity: 0.82,
      roughness: 0.08,
      metalness: 0.1,
      side: DoubleSide,
    });

    const waterGeo = new PlaneGeometry(16.0, 16.0);
    this.waterMesh = new Mesh(waterGeo, waterMat);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.set(0, WORLD.WATER_Y, 0);
    this.scene.add(this.waterMesh);
  }

  private setupEvents(): void {
    const canvas = this.renderer.canvas;

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.isDraggingMouse = true;
        this.prevMouseX = e.clientX;
        this.prevMouseY = e.clientY;

        // Check water click for ripple demo
        this.handleWaterClick(e);
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDraggingMouse = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDraggingMouse && !this.isMenuMode) {
        const dx = e.clientX - this.prevMouseX;
        const dy = e.clientY - this.prevMouseY;
        this.prevMouseX = e.clientX;
        this.prevMouseY = e.clientY;

        const sensitivity = (this.settings.controls.sensitivity / 100.0) * 0.003;
        this.camYaw -= dx * sensitivity;
        this.camPitch -= dy * sensitivity * (this.settings.controls.invertY ? -1 : 1);
        this.camPitch = Math.max(-1.45, Math.min(1.45, this.camPitch));
      } else if (this.isMenuMode && this.waterMesh) {
        const now = performance.now();
        if (now - this.lastWakeTime > 140) {
          const rect = this.renderer.canvas.getBoundingClientRect();
          this.mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          this.mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          this.raycaster.setFromCamera(this.mouseVec, this.camera);
          const intersects = this.raycaster.intersectObject(this.waterMesh);
          if (intersects.length > 0 && intersects[0]) {
            const hit = intersects[0].point;
            this.spawnRipple(hit.x, hit.z, 0.45, 1.6, 1.4);
            this.lastWakeTime = now;
          }
        }
      }
    });

    window.addEventListener('keydown', (e) => {
      this.handleKey(e.code);
    });
  }

  private handleWaterClick(e: MouseEvent): void {
    const rect = this.renderer.canvas.getBoundingClientRect();
    this.mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouseVec, this.camera);
    const intersects = this.raycaster.intersectObject(this.waterMesh);

    if (intersects.length > 0 && intersects[0]) {
      const hit = intersects[0].point;
      this.spawnRipple(hit.x, hit.z, 0.95, 2.5, 3.2);

      // Play procedural splash audio linked to visual ripple
      AudioEngine.getInstance().play('splash_small', {
        position: { x: hit.x, y: hit.y, z: hit.z },
        intensity: 0.85,
      });
    }
  }

  setNumberDecal(n: number): void {
    this.pillarNumber = Math.max(0, Math.min(99, Math.floor(n)));
    this.updatePillarNumber();
  }

  spawnRipple(x: number, z: number, opacity = 0.9, duration = 2.5, maxScale = 2.8): void {
    const reg = TextureRegistry.getInstance();
    const rippleTex = reg.getRippleStamp(256);

    const mat = new MeshBasicMaterial({
      map: rippleTex,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const geo = new PlaneGeometry(1, 1);
    const mesh = new Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, WORLD.WATER_Y + 0.005, z);
    this.scene.add(mesh);

    this.activeRipples.push({
      mesh,
      startTime: this.time,
      duration,
      maxScale,
    });
  }

  private handleKey(code: string): void {
    switch (code) {
      case 'BracketLeft':
        this.pillarNumber = (this.pillarNumber - 1 + 100) % 100;
        this.updatePillarNumber();
        break;
      case 'BracketRight':
        this.pillarNumber = (this.pillarNumber + 1) % 100;
        this.updatePillarNumber();
        break;
      case 'KeyF':
        this.isFogEnabled = !this.isFogEnabled;
        this.scene.fog = this.isFogEnabled
          ? new FogExp2(new Color('#d9d3a2'), 0.045)
          : null;
        break;
      case 'KeyL':
        this.cycleLighting();
        break;
      case 'KeyG':
        this.isWireframe = !this.isWireframe;
        this.scene.traverse((obj) => {
          if ((obj as Mesh).isMesh && (obj as Mesh).material) {
            const m = (obj as Mesh).material as MeshStandardMaterial;
            if (m.wireframe !== undefined) m.wireframe = this.isWireframe;
          }
        });
        break;
      case 'KeyH':
        if (this.onToggleHud) this.onToggleHud();
        break;
      case 'KeyB':
        this.audioLabPanel.toggle();
        break;
      case 'KeyN':
        this.animLabPanel.toggle();
        break;
      case 'Digit1':
        this.jumpCamera(0, 1.6, 4.5, 0, -0.15); // Overview
        break;
      case 'Digit2':
        this.jumpCamera(-2.0, 1.8, 0.4, 0, -0.05); // Pillar close-up
        break;
      case 'Digit3':
        this.jumpCamera(0, 1.6, -1.4, 0, 0.05); // Tagline Wall
        break;
      case 'Digit4':
        this.jumpCamera(2.8, 1.5, 0.2, 0, 0.0); // Archway
        break;
      case 'Digit5':
        this.jumpCamera(0, 0.6, 1.8, 0, -0.4); // Trench caustics
        break;
      case 'Digit6':
        this.jumpCamera(0, 0.3, 1.2, 0, -0.7); // Water surface close
        break;
    }
  }

  private jumpCamera(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.camPos.set(x, y, z);
    this.camYaw = yaw;
    this.camPitch = pitch;
  }

  private updatePillarNumber(): void {
    const reg = TextureRegistry.getInstance();
    const tex = reg.getNumber(this.pillarNumber);
    (this.pillarDecalMesh.material as MeshBasicMaterial).map = tex;
    (this.pillarDecalMesh.material as MeshBasicMaterial).needsUpdate = true;
  }

  private cycleLighting(): void {
    this.lightingPreset = (this.lightingPreset + 1) % 3;
    if (this.lightingPreset === 0) {
      // Warm Pool
      this.hemiLight.color.set('#fff2c4');
      this.hemiLight.groundColor.set('#6fae8a');
      this.dirLight.color.set('#fff8e7');
    } else if (this.lightingPreset === 1) {
      // Cool Teal
      this.hemiLight.color.set('#86cfa0');
      this.hemiLight.groundColor.set('#3f9c6b');
      this.dirLight.color.set('#a8e6cf');
    } else {
      // Harsh Fluorescent
      this.hemiLight.color.set('#f4f4f4');
      this.hemiLight.groundColor.set('#7a8b7b');
      this.dirLight.color.set('#ffffff');
    }
  }

  update(dt: number): void {
    if (this.isDisposed) return;
    this.time += dt;

    // Animate water normal scrolling
    if (this.waterNormalTex) {
      this.waterNormalTex.offset.x = (this.waterNormalTex.offset.x + 0.015 * dt) % 1.0;
      this.waterNormalTex.offset.y = (this.waterNormalTex.offset.y + 0.01 * dt) % 1.0;
    }

    // Update caustics shader time uniform
    const uData = this.waterFloorMat.userData as { shader?: { uniforms: { uTime: { value: number } } } };
    if (uData.shader) {
      uData.shader.uniforms.uTime.value = this.time;
    }

    // Update expanding ripples
    for (let i = this.activeRipples.length - 1; i >= 0; i--) {
      const rip = this.activeRipples[i]!;
      const progress = (this.time - rip.startTime) / rip.duration;
      if (progress >= 1.0) {
        this.scene.remove(rip.mesh);
        rip.mesh.geometry.dispose();
        (rip.mesh.material as MeshBasicMaterial).dispose();
        this.activeRipples.splice(i, 1);
      } else {
        const curScale = 0.2 + progress * rip.maxScale;
        rip.mesh.scale.set(curScale, curScale, 1.0);
        (rip.mesh.material as MeshBasicMaterial).opacity = Math.pow(1.0 - progress, 1.4);
      }
    }

    if (this.isMenuMode) {
      // Menu Mode: Slow cinematic dolly drift past the slab and pillar
      const driftX = Math.sin(this.time * 0.12) * 1.8;
      const driftZ = 3.6 + Math.cos(this.time * 0.08) * 0.8;
      const driftY = 1.45 + Math.sin(this.time * 0.15) * 0.12;
      this.camera.position.set(driftX, driftY, driftZ);
      this.camera.lookAt(-0.8, 1.2, -0.6);

      // Gentle fog breathing (+-8% density modulation)
      if (this.scene.fog && this.scene.fog instanceof FogExp2) {
        this.scene.fog.density = 0.045 * (1.0 + Math.sin(this.time * 0.4) * 0.08);
      }
    } else {
      // Lab Mode: Free-fly movement controls
      const moveSpeed = (this.input.isKeyDown('ShiftLeft') ? 7.0 : 3.2) * dt;

      const fwd = new Vector3(
        -Math.sin(this.camYaw) * Math.cos(this.camPitch),
        Math.sin(this.camPitch),
        -Math.cos(this.camYaw) * Math.cos(this.camPitch),
      ).normalize();

      const right = new Vector3(
        Math.cos(this.camYaw),
        0,
        -Math.sin(this.camYaw),
      ).normalize();

      if (this.input.isKeyDown('KeyW')) this.camPos.addScaledVector(fwd, moveSpeed);
      if (this.input.isKeyDown('KeyS')) this.camPos.addScaledVector(fwd, -moveSpeed);
      if (this.input.isKeyDown('KeyA')) this.camPos.addScaledVector(right, -moveSpeed);
      if (this.input.isKeyDown('KeyD')) this.camPos.addScaledVector(right, moveSpeed);
      if (this.input.isKeyDown('Space')) this.camPos.y += moveSpeed;
      if (this.input.isKeyDown('KeyC')) this.camPos.y -= moveSpeed;

      this.camera.position.copy(this.camPos);
      const target = this.camPos.clone().add(fwd);
      this.camera.lookAt(target);

      // Update 3D Audio listener position and forward/up orientation
      AudioEngine.getInstance().setListener(
        { x: this.camPos.x, y: this.camPos.y, z: this.camPos.z },
        { x: fwd.x, y: fwd.y, z: fwd.z },
        { x: 0, y: 1, z: 0 },
      );
    }

    this.animLabPanel.update(dt, this.time);
    this.renderer.render(this.scene, this.camera);
    this.input.flushFrame();
  }

  dispose(): void {
    this.isDisposed = true;
    this.audioLabPanel.dispose();
    this.animLabPanel.dispose();
    this.scaleLab.dispose();
    this.renderer.dispose();
    this.input.dispose();
  }
}

function tagGeoOrDefault(g: PlaneGeometry): PlaneGeometry {
  return g;
}
