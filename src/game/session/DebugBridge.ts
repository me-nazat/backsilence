/* ── DebugBridge.ts ────────────────────────────────────────────────────────
 *  Debug tools, hotkeys, visualization rings, and locator overlays.
 *  Enforces:
 *  - G5 law: strictly suppressed in capture mode (?shot= or __BACKSILENCE_CAPTURE__).
 *  - Deterministic cleanup of all debug meshes, lines, and listeners on dispose.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Scene,
  PerspectiveCamera,
  Mesh,
  SphereGeometry,
  MeshBasicMaterial,
  Line,
  LineBasicMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  Vector3,
} from 'three';
import type { SimWorld } from '../../sim/SimWorld.js';
import type { NoiseEvent } from '../../types/contracts.js';
import type { CaptureService } from './CaptureService.js';
import type { DisposalService } from './DisposalService.js';

interface HearingRingVisual {
  line: Line;
  age: number;
  maxAge: number;
}

const _scratchVecA = new Vector3();

export class DebugBridge {
  private readonly scene: Scene;
  private readonly simWorld: SimWorld;
  private readonly captureService: CaptureService;
  private readonly disposal: DisposalService;

  private magentaMarker: Mesh | null = null;
  private locatorElement: HTMLElement | null = null;
  private readonly hearingRings: HearingRingVisual[] = [];
  private pathLine: Line | null = null;
  private navGridMesh: Mesh | null = null;

  constructor(
    scene: Scene,
    simWorld: SimWorld,
    container: HTMLElement,
    captureService: CaptureService,
    disposal: DisposalService,
  ) {
    this.scene = scene;
    this.simWorld = simWorld;
    this.captureService = captureService;
    this.disposal = disposal;

    if (this.captureService.shouldRenderDebugOverlays() && typeof document !== 'undefined') {
      this.locatorElement = document.createElement('div');
      this.locatorElement.id = 'monster-locator-arrow';
      this.locatorElement.style.cssText =
        'position:absolute;width:24px;height:24px;border:2px solid #ff00ff;border-radius:50%;pointer-events:none;z-index:999;display:none;transform:translate(-50%,-50%);box-shadow:0 0 8px #ff00ff;';
      container.appendChild(this.locatorElement);
      this.disposal.trackDomElement(this.locatorElement, 'DebugBridge');
    }
  }

  spawnHearingRing(noise: NoiseEvent): void {
    if (!this.captureService.shouldRenderDebugOverlays()) return;

    const segments = 32;
    const r = Math.max(0.2, noise.loudness * 35.0);
    const pts: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      pts.push(
        noise.position.x + Math.cos(theta) * r,
        noise.position.y + 0.05,
        noise.position.z + Math.sin(theta) * r,
      );
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
    const mat = new LineBasicMaterial({
      color: 0xff44ff,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });

    const line = new Line(geo, mat);
    this.scene.add(line);
    this.hearingRings.push({ line, age: 0, maxAge: 1.5 });
  }

  update(dt: number, camera: PerspectiveCamera): void {
    // 1. Advance hearing rings
    for (let i = this.hearingRings.length - 1; i >= 0; i--) {
      const ring = this.hearingRings[i]!;
      ring.age += dt;
      const t = ring.age / ring.maxAge;
      if (t >= 1.0) {
        this.scene.remove(ring.line);
        ring.line.geometry.dispose();
        (ring.line.material as LineBasicMaterial).dispose();
        this.hearingRings.splice(i, 1);
      } else {
        (ring.line.material as LineBasicMaterial).opacity = 0.85 * (1.0 - t);
      }
    }

    // 2. G5 Law check: suppress debug overlays during capture or non-debug
    if (!this.captureService.shouldRenderDebugOverlays() || this.simWorld.monsters.length === 0) {
      if (this.magentaMarker) this.magentaMarker.visible = false;
      if (this.locatorElement) this.locatorElement.style.display = 'none';
      return;
    }

    const primary = this.simWorld.monsters[0]!;
    _scratchVecA.set(primary.pos.x, primary.pos.y, primary.pos.z);

    // 3. Magenta Marker
    if (!this.magentaMarker) {
      const geo = new SphereGeometry(0.35, 12, 8);
      const mat = new MeshBasicMaterial({ color: 0xff00ff, wireframe: true, depthTest: false });
      this.magentaMarker = new Mesh(geo, mat);
      this.magentaMarker.renderOrder = 9999;
      this.scene.add(this.magentaMarker);
    }
    this.magentaMarker.visible = true;
    this.magentaMarker.position.copy(_scratchVecA);

    // 4. Screen-space locator element
    if (this.locatorElement) {
      _scratchVecA.project(camera);
      const isBehind = _scratchVecA.z > 1.0;
      const screenX = (_scratchVecA.x * 0.5 + 0.5) * window.innerWidth;
      const screenY = (-(_scratchVecA.y * 0.5) + 0.5) * window.innerHeight;

      if (!isBehind && screenX >= 0 && screenX <= window.innerWidth && screenY >= 0 && screenY <= window.innerHeight) {
        this.locatorElement.style.display = 'block';
        this.locatorElement.style.left = `${screenX}px`;
        this.locatorElement.style.top = `${screenY}px`;
      } else {
        this.locatorElement.style.display = 'none';
      }
    }
  }

  dispose(): void {
    if (this.magentaMarker) {
      this.scene.remove(this.magentaMarker);
      this.magentaMarker.geometry.dispose();
      (this.magentaMarker.material as MeshBasicMaterial).dispose();
      this.magentaMarker = null;
    }
    if (this.locatorElement) {
      this.locatorElement.remove();
      this.locatorElement = null;
    }
    for (const ring of this.hearingRings) {
      this.scene.remove(ring.line);
      ring.line.geometry.dispose();
      (ring.line.material as LineBasicMaterial).dispose();
    }
    this.hearingRings.length = 0;
    if (this.pathLine) {
      this.scene.remove(this.pathLine);
      this.pathLine.geometry.dispose();
      (this.pathLine.material as LineBasicMaterial).dispose();
      this.pathLine = null;
    }
    if (this.navGridMesh) {
      this.scene.remove(this.navGridMesh);
      this.navGridMesh = null;
    }
  }
}
