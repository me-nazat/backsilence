/* ── ScaleLab.ts ──────────────────────────────────────────────────────────
 *  Phase B Section 6: Scale & Elevation Calibration Laboratory (?lab=scale).
 *  Provides:
 *  1. Person-height silhouette (1.65m standing, 0.95m crouching)
 *  2. 0.15m tile grid overlay aligning with ceramic mosaic texture pitch
 *  3. Precision metric rulers beside slab, pillar, and arch
 *  4. Real-time elevation readouts and side-by-side reference verification
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Group,
  Mesh,
  MeshBasicMaterial,
  BoxGeometry,
  LineSegments,
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  DoubleSide,
} from 'three';
import { WORLD } from '../app/Config.js';

export class ScaleLab {
  readonly group = new Group();
  private silhouetteMesh!: Group;
  private tileGridLines!: LineSegments;
  private rulersGroup = new Group();
  private panelEl: HTMLElement | null = null;

  private showSilhouette = true;
  private showGrid = true;
  private showRulers = true;
  private isCrouched = false;

  constructor() {
    this.group.name = 'ScaleLab';
    this.buildSilhouette();
    this.buildTileGridOverlay();
    this.buildMetricRulers();
  }

  private buildSilhouette(): void {
    const silGroup = new Group();
    silGroup.name = 'HumanSilhouette';

    const mat = new MeshBasicMaterial({
      color: 0x86cfa0,
      wireframe: false,
      transparent: true,
      opacity: 0.85,
      side: DoubleSide,
    });

    // Torso & Legs: Total height 1.65m
    // Head: sphere/box ~0.22m, center at y = 1.54m
    const head = new Mesh(new BoxGeometry(0.18, 0.22, 0.18), mat);
    head.position.set(0, 1.54, 0);
    silGroup.add(head);

    // Torso: 0.65m height, 0.40m wide, center at y = 1.05m
    const torso = new Mesh(new BoxGeometry(0.40, 0.65, 0.24), mat);
    torso.position.set(0, 1.05, 0);
    silGroup.add(torso);

    // Left leg & Right leg: 0.72m height, center at y = 0.36m
    const legGeo = new BoxGeometry(0.14, 0.72, 0.16);
    const leftLeg = new Mesh(legGeo, mat);
    leftLeg.position.set(-0.11, 0.36, 0);
    silGroup.add(leftLeg);

    const rightLeg = new Mesh(legGeo, mat);
    rightLeg.position.set(0.11, 0.36, 0);
    silGroup.add(rightLeg);

    // Eye height indicator line (at 1.65m standing, 0.95m crouching)
    const eyeLineGeo = new BufferGeometry();
    eyeLineGeo.setAttribute(
      'position',
      new Float32BufferAttribute([
        -0.4, 1.65, 0.15, 0.4, 1.65, 0.15, // Stand eye height 1.65m
        -0.4, 0.95, 0.15, 0.4, 0.95, 0.15, // Crouch eye height 0.95m
      ], 3),
    );
    const eyeLineMat = new LineBasicMaterial({ color: 0xffe066, linewidth: 2 });
    const eyeLines = new LineSegments(eyeLineGeo, eyeLineMat);
    silGroup.add(eyeLines);

    // Place silhouette standing on top of platform slab (+0.30m)
    silGroup.position.set(-2.5, WORLD.PLATFORM_TOP_Y, 0.5);
    this.silhouetteMesh = silGroup;
    this.group.add(silGroup);
  }

  private buildTileGridOverlay(): void {
    const tilePitch = WORLD.TILE_METERS; // 0.15m
    const vertices: number[] = [];

    // Horizontal grid on platform slab tops (x: -6.75..-0.75, z: -3..3 at y = 0.301)
    const yTop = WORLD.PLATFORM_TOP_Y + 0.002;
    for (let x = -6.75; x <= -0.75; x += tilePitch) {
      vertices.push(x, yTop, -3.0, x, yTop, 3.0);
    }
    for (let z = -3.0; z <= 3.0; z += tilePitch) {
      vertices.push(-6.75, yTop, z, -0.75, yTop, z);
    }

    // Grid on trench pool floor (x: -0.75..0.75, z: -3..3 at y = -0.898)
    const yFloor = WORLD.POOL_FLOOR_Y + 0.002;
    for (let x = -0.75; x <= 0.75; x += tilePitch) {
      vertices.push(x, yFloor, -3.0, x, yFloor, 3.0);
    }
    for (let z = -3.0; z <= 3.0; z += tilePitch) {
      vertices.push(-0.75, yFloor, z, 0.75, yFloor, z);
    }

    // Grid on vertical slab face (at x = -0.748, y: -0.9..0.3, z: -3..3)
    for (let y = WORLD.POOL_FLOOR_Y; y <= WORLD.PLATFORM_TOP_Y; y += tilePitch) {
      vertices.push(-0.748, y, -3.0, -0.748, y, 3.0);
    }
    for (let z = -3.0; z <= 3.0; z += tilePitch) {
      vertices.push(-0.748, WORLD.POOL_FLOOR_Y, z, -0.748, WORLD.PLATFORM_TOP_Y, z);
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    const mat = new LineBasicMaterial({
      color: 0x4dd0e1,
      transparent: true,
      opacity: 0.45,
    });
    this.tileGridLines = new LineSegments(geo, mat);
    this.group.add(this.tileGridLines);
  }

  private buildMetricRulers(): void {
    const rGroup = new Group();
    rGroup.name = 'MetricRulers';
    const mat = new LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    const markMat = new LineBasicMaterial({ color: 0xffb74d, linewidth: 2 });

    const rulerVertices: number[] = [];
    const markVertices: number[] = [];

    // 1. Slab Vertical Ruler: beside slab edge at x = -0.72, z = 0.5
    // Extends from pool floor -0.9m to slab top +0.3m (total 1.2m)
    rulerVertices.push(-0.72, -0.9, 0.5, -0.72, 0.3, 0.5);
    for (let y = -0.9; y <= 0.301; y += 0.15) {
      // 0.15m tile tick marks
      markVertices.push(-0.72, y, 0.5, -0.62, y, 0.5);
    }
    // Waterline marker at y = 0.0m
    markVertices.push(-0.72, 0.0, 0.5, -0.52, 0.0, 0.5);

    // 2. Pillar Vertical Ruler: beside pillar at x = -1.45, z = -1.2
    // Extends from +0.3m up to +4.3m (4.0m height)
    rulerVertices.push(-1.45, 0.3, -1.2, -1.45, 4.3, -1.2);
    for (let y = 0.3; y <= 4.301; y += 0.50) {
      markVertices.push(-1.45, y, -1.2, -1.35, y, -1.2);
    }

    // 3. Arch Span Ruler: across arch base from x = -1.8 to x = 1.8 at y = 0.35m
    rulerVertices.push(-1.8, 0.35, -2.8, 1.8, 0.35, -2.8);
    for (let x = -1.8; x <= 1.801; x += 0.60) {
      markVertices.push(x, 0.35, -2.8, x, 0.45, -2.8);
    }

    const rulerGeo = new BufferGeometry();
    rulerGeo.setAttribute('position', new Float32BufferAttribute(rulerVertices, 3));
    rGroup.add(new LineSegments(rulerGeo, mat));

    const markGeo = new BufferGeometry();
    markGeo.setAttribute('position', new Float32BufferAttribute(markVertices, 3));
    rGroup.add(new LineSegments(markGeo, markMat));

    this.rulersGroup = rGroup;
    this.group.add(rGroup);
  }

  mount(container: HTMLElement): void {
    if (this.panelEl) return;

    const panel = document.createElement('div');
    panel.id = 'scale-lab-hud';
    panel.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 24px;
      width: min(420px, 90vw);
      background: rgba(13, 11, 6, 0.92);
      border: 1px solid rgba(134, 207, 160, 0.6);
      border-radius: 4px;
      padding: 16px;
      color: #d9d3a2;
      font-family: monospace;
      font-size: 12px;
      z-index: 9999;
      box-shadow: 0 4px 24px rgba(0,0,0,0.8);
      pointer-events: auto;
    `;

    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid rgba(134,207,160,0.3); padding-bottom:6px;">
        <span style="font-weight:bold; color:#86cfa0; font-size:13px;">[ SCALE LAB — ELEVATION BENCHMARK ]</span>
        <span style="font-size:11px; opacity:0.8;">GRID: 0.15m PITCH</span>
      </div>
      <div style="line-height:1.6; margin-bottom:12px; font-size:11px;">
        • Eye Height: <strong>1.65m</strong> stand (<strong>0.95m</strong> crouch)<br/>
        • Slab Height: <strong>+0.30m</strong> (2.0 tiles above water)<br/>
        • Pool Depth: <strong>-0.90m</strong> (6.0 tiles below water)<br/>
        • Pillar Radius: <strong>0.50m–0.60m</strong> (height 4.0m–6.0m)<br/>
        • Arch Span: <strong>3.6m–4.2m</strong> | Apex: <strong>4.8m</strong>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        <button id="btn-toggle-sil" class="analog-btn" style="padding:4px 8px; font-size:11px;">SILHOUETTE [ON]</button>
        <button id="btn-toggle-grid" class="analog-btn" style="padding:4px 8px; font-size:11px;">TILE GRID [ON]</button>
        <button id="btn-toggle-rulers" class="analog-btn" style="padding:4px 8px; font-size:11px;">RULERS [ON]</button>
        <button id="btn-toggle-crouch" class="analog-btn" style="padding:4px 8px; font-size:11px;">POSE: STAND</button>
      </div>
    `;

    container.appendChild(panel);
    this.panelEl = panel;

    // Button event listeners
    const btnSil = panel.querySelector('#btn-toggle-sil');
    btnSil?.addEventListener('click', () => {
      this.showSilhouette = !this.showSilhouette;
      this.silhouetteMesh.visible = this.showSilhouette;
      btnSil.textContent = `SILHOUETTE [${this.showSilhouette ? 'ON' : 'OFF'}]`;
    });

    const btnGrid = panel.querySelector('#btn-toggle-grid');
    btnGrid?.addEventListener('click', () => {
      this.showGrid = !this.showGrid;
      this.tileGridLines.visible = this.showGrid;
      btnGrid.textContent = `TILE GRID [${this.showGrid ? 'ON' : 'OFF'}]`;
    });

    const btnRulers = panel.querySelector('#btn-toggle-rulers');
    btnRulers?.addEventListener('click', () => {
      this.showRulers = !this.showRulers;
      this.rulersGroup.visible = this.showRulers;
      btnRulers.textContent = `RULERS [${this.showRulers ? 'ON' : 'OFF'}]`;
    });

    const btnCrouch = panel.querySelector('#btn-toggle-crouch');
    btnCrouch?.addEventListener('click', () => {
      this.isCrouched = !this.isCrouched;
      btnCrouch.textContent = `POSE: ${this.isCrouched ? 'CROUCH' : 'STAND'}`;
      this.silhouetteMesh.scale.set(1.0, this.isCrouched ? (0.95 / 1.65) : 1.0, 1.0);
    });
  }

  dispose(): void {
    if (this.panelEl) {
      this.panelEl.remove();
      this.panelEl = null;
    }
    this.group.clear();
  }
}
