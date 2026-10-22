/* ── RemotePlayerAvatar.ts ─────────────────────────────────────────────────
 *  Procedural 3D avatar for remote multiplayer teammates.
 *  Features:
 *  - Hooded rain-jacket silhouette from capsules and lathes (~1,200 tris)
 *  - Color-coded per player (raincoat palette)
 *  - Canvas-generated billboard name-tag sprite with distance/LOS fade
 *  - Dynamic crouch pose interpolation
 *  - Flashlight cone (visual cone mesh + optional real SpotLight)
 *  - Wading wake rings when moving in water
 *  - "Lost signal" glitch fade when disconnected, vanish on death
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Group,
  Mesh,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  SphereGeometry,
  RingGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  SpotLight,
  Color,
  Vector3,
  DoubleSide,
  AdditiveBlending,
  type Camera,
} from 'three';
import type { PlayerId, Vec3 } from '../../types/contracts.js';

export const PLAYER_PALETTE = [
  0xe5a93b, // 0: Raincoat Yellow
  0x3ea094, // 1: Marine Teal
  0xd65a31, // 2: Hazard Orange
  0x7fa650, // 3: Moss Olive
] as const;

export class RemotePlayerAvatar {
  readonly root = new Group();
  readonly id: PlayerId;
  readonly name: string;
  readonly colorIndex: number;

  // Visual Nodes
  private readonly bodyGroup = new Group();
  private readonly torsoMesh: Mesh;
  private readonly headGroup = new Group();
  private readonly hoodMesh: Mesh;
  private readonly faceMesh: Mesh;
  private readonly legL: Mesh;
  private readonly legR: Mesh;
  private readonly armL: Mesh;
  private readonly armR: Mesh;

  // Flashlight Visuals
  private readonly flashlightGroup = new Group();
  private readonly flashlightConeMesh: Mesh;
  private realSpotlight: SpotLight | null = null;
  private isFlashlightOn = false;

  // Wading Wake Visuals
  private readonly wakeMesh: Mesh;
  private wakeAnimTime = 0;

  // Name Tag Sprite
  private readonly nameTagSprite: Sprite;
  private readonly nameTagTexture: CanvasTexture;

  // Materials for disposal and glitching
  private readonly jacketMat: MeshStandardMaterial;
  private readonly darkClothMat: MeshStandardMaterial;
  private readonly faceMat: MeshStandardMaterial;
  private readonly coneMat: MeshBasicMaterial;
  private readonly wakeMat: MeshBasicMaterial;

  // State
  private currentCrouch = 0; // 0..1
  private isAlive = true;
  private isDisconnected = false;
  private disconnectFade = 1.0;
  private walkAnimTime = 0;
  private lastPos = new Vector3();

  getIsAlive(): boolean {
    return this.isAlive;
  }

  getIsFlashlightOn(): boolean {
    return this.isFlashlightOn;
  }

  constructor(id: PlayerId, name: string, colorIndex = 0) {
    this.id = id;
    this.name = name.slice(0, 16);
    this.colorIndex = colorIndex % PLAYER_PALETTE.length;

    const baseColor = PLAYER_PALETTE[this.colorIndex] ?? 0xe5a93b;

    // ── Materials ──────────────────────────────────────────────────────────
    this.jacketMat = new MeshStandardMaterial({
      color: new Color(baseColor),
      roughness: 0.35, // Slick waterproof fabric
      metalness: 0.05,
    });

    this.darkClothMat = new MeshStandardMaterial({
      color: new Color(0x1a1a18),
      roughness: 0.8,
      metalness: 0.0,
    });

    this.faceMat = new MeshStandardMaterial({
      color: new Color(0x0a0a0a), // Shadowed dark void under hood
      roughness: 0.9,
    });

    this.coneMat = new MeshBasicMaterial({
      color: 0xfff3c4,
      transparent: true,
      opacity: 0.22,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthWrite: false,
    });

    this.wakeMat = new MeshBasicMaterial({
      color: 0x86cfa0,
      transparent: true,
      opacity: 0.0,
      side: DoubleSide,
      depthWrite: false,
    });

    // ── Torso (Raincoat Body) ──────────────────────────────────────────────
    // Approx 1.7m tall humanoid. Torso capsule centered at y=1.05
    const torsoGeo = new CapsuleGeometry(0.24, 0.48, 8, 12);
    this.torsoMesh = new Mesh(torsoGeo, this.jacketMat);
    this.torsoMesh.position.y = 1.02;
    this.torsoMesh.castShadow = true;
    this.bodyGroup.add(this.torsoMesh);

    // Raincoat skirt/hem flair (lathe cylinder)
    const skirtGeo = new CylinderGeometry(0.24, 0.31, 0.32, 12, 1, true);
    const skirtMesh = new Mesh(skirtGeo, this.jacketMat);
    skirtMesh.position.y = 0.78;
    this.bodyGroup.add(skirtMesh);

    // ── Head & Hood ────────────────────────────────────────────────────────
    this.headGroup.position.set(0, 1.42, 0);
    const hoodGeo = new SphereGeometry(0.22, 12, 10);
    this.hoodMesh = new Mesh(hoodGeo, this.jacketMat);
    this.hoodMesh.scale.set(1.0, 1.15, 1.08);
    this.headGroup.add(this.hoodMesh);

    // Dark void inside hood
    const faceGeo = new SphereGeometry(0.14, 8, 8);
    this.faceMesh = new Mesh(faceGeo, this.faceMat);
    this.faceMesh.position.set(0, -0.02, 0.1);
    this.headGroup.add(this.faceMesh);

    this.bodyGroup.add(this.headGroup);

    // ── Limbs ──────────────────────────────────────────────────────────────
    const legGeo = new CapsuleGeometry(0.09, 0.52, 6, 8);
    this.legL = new Mesh(legGeo, this.darkClothMat);
    this.legL.position.set(-0.13, 0.4, 0);
    this.legL.castShadow = true;
    this.bodyGroup.add(this.legL);

    this.legR = new Mesh(legGeo, this.darkClothMat);
    this.legR.position.set(0.13, 0.4, 0);
    this.legR.castShadow = true;
    this.bodyGroup.add(this.legR);

    const armGeo = new CapsuleGeometry(0.08, 0.45, 6, 8);
    this.armL = new Mesh(armGeo, this.jacketMat);
    this.armL.position.set(-0.31, 1.06, 0);
    this.bodyGroup.add(this.armL);

    this.armR = new Mesh(armGeo, this.jacketMat);
    this.armR.position.set(0.31, 1.06, 0);
    this.bodyGroup.add(this.armR);

    // ── Flashlight Cone ────────────────────────────────────────────────────
    // Projecting forward from chest/right hand
    const coneGeo = new ConeGeometry(0.9, 5.0, 12, 1, true);
    // Orient cone along Z+ (default points along Y+)
    coneGeo.rotateX(-Math.PI / 2);
    coneGeo.translate(0, 0, 2.5);
    this.flashlightConeMesh = new Mesh(coneGeo, this.coneMat);

    this.flashlightGroup.position.set(0.2, 1.0, 0.2);
    this.flashlightGroup.add(this.flashlightConeMesh);
    this.flashlightGroup.visible = false;
    this.bodyGroup.add(this.flashlightGroup);

    // ── Wading Wake Ring ───────────────────────────────────────────────────
    const wakeGeo = new RingGeometry(0.2, 0.55, 16);
    wakeGeo.rotateX(-Math.PI / 2);
    this.wakeMesh = new Mesh(wakeGeo, this.wakeMat);
    this.wakeMesh.position.y = 0.02;
    this.root.add(this.wakeMesh);

    // ── Billboard Name-Tag Sprite ──────────────────────────────────────────
    const { canvas, texture } = this.createNameTagCanvas(this.name, baseColor);
    this.nameTagTexture = texture;
    const spriteMat = new SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    this.nameTagSprite = new Sprite(spriteMat);
    this.nameTagSprite.scale.set(1.4, 0.35, 1.0);
    this.nameTagSprite.position.set(0, 1.85, 0);
    this.root.add(this.nameTagSprite);

    this.root.add(this.bodyGroup);

    // Tag the root group with player id
    this.root.name = `RemotePlayer_${this.id}`;
    // Canvas reference cleanup
    canvas.width = 1;
    canvas.height = 1;
  }

  private createNameTagCanvas(text: string, colorHex: number): { canvas: HTMLCanvasElement; texture: CanvasTexture } {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Rounded pill background
      ctx.fillStyle = 'rgba(8, 6, 3, 0.75)';
      ctx.strokeStyle = `#${colorHex.toString(16).padStart(6, '0')}`;
      ctx.lineWidth = 3;

      const x = 12;
      const y = 8;
      const w = 232;
      const h = 48;
      const r = 16;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 32);
    }

    const texture = new CanvasTexture(canvas);
    return { canvas, texture };
  }

  setRealSpotlight(enabled: boolean): void {
    if (enabled && !this.realSpotlight) {
      this.realSpotlight = new SpotLight(0xfff3c4, 2.0, 25, (25 * Math.PI) / 180, 0.4, 1.5);
      this.realSpotlight.position.set(0, 0, 0);
      this.realSpotlight.target.position.set(0, 0, 10);
      this.flashlightGroup.add(this.realSpotlight);
      this.flashlightGroup.add(this.realSpotlight.target);
    } else if (!enabled && this.realSpotlight) {
      this.flashlightGroup.remove(this.realSpotlight);
      this.flashlightGroup.remove(this.realSpotlight.target);
      this.realSpotlight.dispose();
      this.realSpotlight = null;
    }
  }

  update(
    pos: Vec3,
    yaw: number,
    pitch: number,
    crouch: boolean,
    inWater: boolean,
    flashlightOn: boolean,
    alive: boolean,
    camera: Camera,
    dt: number,
    isDisconnected = false,
  ): void {
    this.isAlive = alive;
    this.isDisconnected = isDisconnected;

    if (!alive) {
      this.root.visible = false;
      return;
    }

    this.root.visible = true;

    // Position & Yaw
    this.root.position.set(pos.x, pos.y, pos.z);
    this.root.rotation.y = yaw;

    // Pitch adjusts flashlight direction
    this.flashlightGroup.rotation.x = pitch;

    // Crouch height lerp
    const targetCrouch = crouch ? 1.0 : 0.0;
    this.currentCrouch += (targetCrouch - this.currentCrouch) * Math.min(1.0, dt * 10);

    const crouchYOffset = -0.45 * this.currentCrouch;
    this.bodyGroup.position.y = crouchYOffset;
    this.nameTagSprite.position.y = 1.85 + crouchYOffset;

    // Walk animation from displacement
    const currentPos = new Vector3(pos.x, pos.y, pos.z);
    const distMoved = currentPos.distanceTo(this.lastPos);
    this.lastPos.copy(currentPos);

    if (distMoved > 0.001) {
      this.walkAnimTime += dt * 8.0;
      const legSwing = Math.sin(this.walkAnimTime) * 0.35;
      this.legL.rotation.x = legSwing;
      this.legR.rotation.x = -legSwing;
      this.armL.rotation.x = -legSwing * 0.8;
      this.armR.rotation.x = legSwing * 0.8;
    } else {
      this.legL.rotation.x *= 0.85;
      this.legR.rotation.x *= 0.85;
      this.armL.rotation.x *= 0.85;
      this.armR.rotation.x *= 0.85;
    }

    // Flashlight
    this.isFlashlightOn = flashlightOn;
    this.flashlightGroup.visible = flashlightOn;

    // Wading wake in water
    if (inWater) {
      this.wakeAnimTime += dt * 3.0;
      const scale = 1.0 + Math.sin(this.wakeAnimTime) * 0.25;
      this.wakeMesh.scale.set(scale, scale, 1.0);
      this.wakeMat.opacity = Math.max(0, 0.4 - (scale - 1.0) * 0.8);
      this.wakeMesh.visible = true;
    } else {
      this.wakeMesh.visible = false;
    }

    // Name tag distance / LOS fade
    const distToCam = currentPos.distanceTo(camera.position);
    if (distToCam > 25.0) {
      this.nameTagSprite.visible = false;
    } else if (distToCam > 12.0) {
      // Fade out between 12m and 25m
      const alpha = 1.0 - (distToCam - 12.0) / 13.0;
      this.nameTagSprite.material.opacity = Math.max(0, alpha);
      this.nameTagSprite.visible = alpha > 0.05;
    } else {
      this.nameTagSprite.visible = true;
      this.nameTagSprite.material.opacity = 1.0;
    }

    // Disconnected glitch fade
    if (this.isDisconnected) {
      this.disconnectFade = Math.max(0, this.disconnectFade - dt * 0.5);
      const glitch = Math.random() < 0.25 ? 0.2 : 0.8;
      this.jacketMat.opacity = this.disconnectFade * glitch;
      this.jacketMat.transparent = true;
    } else {
      this.disconnectFade = 1.0;
      this.jacketMat.transparent = false;
      this.jacketMat.opacity = 1.0;
    }
  }

  dispose(): void {
    this.torsoMesh.geometry.dispose();
    this.hoodMesh.geometry.dispose();
    this.faceMesh.geometry.dispose();
    this.legL.geometry.dispose();
    this.legR.geometry.dispose();
    this.armL.geometry.dispose();
    this.armR.geometry.dispose();
    this.flashlightConeMesh.geometry.dispose();
    this.wakeMesh.geometry.dispose();

    this.jacketMat.dispose();
    this.darkClothMat.dispose();
    this.faceMat.dispose();
    this.coneMat.dispose();
    this.wakeMat.dispose();

    this.nameTagSprite.material.dispose();
    this.nameTagTexture.dispose();

    if (this.realSpotlight) {
      this.realSpotlight.dispose();
      this.realSpotlight = null;
    }

    if (this.root.parent) {
      this.root.parent.remove(this.root);
    }
  }
}
