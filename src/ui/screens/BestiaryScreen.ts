/* ── BestiaryScreen.ts ───────────────────────────────────────────────────
 *  Entity Bestiary View:
 *  - Interactive 3D Turntable viewers for Water Monster and Ghost-Skull Flyers
 *  - Behavior summaries ("blind", "hears water", "will not touch what is dry")
 *  - Hearing-radius diagram
 *  - Municipal archive lore logs
 *  - Exact CC BY attribution links
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  HemisphereLight,
  DirectionalLight,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  Group,
  Color,
} from 'three';
import { Button } from '../kit/index.js';
import { ProceduralSkin } from '../../game/creatures/MonsterSkin.js';

export interface BestiaryCallbacks {
  onBack: () => void;
  onOpenCredits: () => void;
}

export class BestiaryScreen {
  readonly element: HTMLElement;
  private renderer1: WebGLRenderer | null = null;
  private renderer2: WebGLRenderer | null = null;
  private animId1 = 0;
  private creature1Group = new Group();
  private creature2Group = new Group();
  private scene1: Scene | null = null;
  private camera1: PerspectiveCamera | null = null;
  private scene2: Scene | null = null;
  private camera2: PerspectiveCamera | null = null;
  private isDragging1 = false;
  private isDragging2 = false;
  private isRunning = false;

  constructor(private callbacks: BestiaryCallbacks) {
    this.element = document.createElement('div');
    this.element.id = 'screen-bestiary';
    this.element.className = 'bs-root';
    this.element.style.cssText = `
      position: absolute;
      inset: 0;
      overflow-y: auto;
      z-index: 100;
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: clamp(16px, 4vw, 48px) clamp(16px, 3vw, 24px);
      box-sizing: border-box;
    `;

    this.render();
  }

  private render(): void {
    this.element.innerHTML = `
      <div style="width: min(1100px, 95vw); display: flex; flex-direction: column; gap: 32px;">
        <!-- Top bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--bs-border); padding-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h1 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-2xl); color: var(--bs-cream); margin: 0; letter-spacing: 0.08em;">
              BESTIARY // ANOMALOUS SPECIMENS
            </h1>
            <div style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xs); color: var(--bs-tan); margin-top: 4px;">
              ACOUSTIC THREAT ASSESSMENT // FOUND LOGS
            </div>
          </div>
          <div id="btn-back-wrap"></div>
        </div>

        <!-- Entity 1: Water Monster -->
        <div class="entity-card" style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); border-radius: var(--bs-radius-md); padding: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 24px; align-items: center;">
          <!-- 3D Turntable 1 -->
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div id="turntable-monster" style="width: min(320px, 80vw); height: min(320px, 80vw); background: #080705; border: 1px solid var(--bs-border-strong); border-radius: var(--bs-radius-sm); position: relative; overflow: hidden; cursor: grab; touch-action: none;">
              <div style="position: absolute; top: 8px; left: 8px; font-family: var(--bs-font-mono); font-size: 10px; color: var(--bs-tan); pointer-events: none;">
                [TURNTABLE 360° // DRAG TO ROTATE]
              </div>
            </div>
            <div style="font-family: var(--bs-font-mono); font-size: 11px; color: var(--bs-danger); margin-top: 8px;">
              THREAT LEVEL: LETHAL // PREDATORY
            </div>
          </div>

          <!-- Lore & Behavior Specs -->
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <h2 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xl); color: var(--bs-cream); margin: 0;">
                01. THE WATER MONSTER
              </h2>
              <span class="bs-osd-readout" style="font-size: var(--bs-text-xs);">CLASSIFICATION: BLIND STALKER</span>
            </div>

            <!-- Behavior Pill List -->
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <span style="background: rgba(179,38,30,0.25); border: 1px solid var(--bs-danger); color: #ff9999; font-family: var(--bs-font-mono); font-size: 11px; padding: 2px 8px; border-radius: 2px;">
                ● TOTALLY BLIND
              </span>
              <span style="background: rgba(134,207,160,0.2); border: 1px solid var(--bs-water); color: var(--bs-water); font-family: var(--bs-font-mono); font-size: 11px; padding: 2px 8px; border-radius: 2px;">
                ● HEARS WATER RIPPLES
              </span>
              <span style="background: rgba(216,179,106,0.2); border: 1px solid var(--bs-tan); color: var(--bs-tan); font-family: var(--bs-font-mono); font-size: 11px; padding: 2px 8px; border-radius: 2px;">
                ● WILL NOT TOUCH DRY PLATFORMS
              </span>
            </div>

            <p style="font-size: var(--bs-text-sm); opacity: 0.85; line-height: 1.6; margin: 0;">
              A massive bipedal stalker dwelling in the flooded depths of the municipal drainage system. 
              Its eyes have completely atrophied; however, its lateral line organ detects sub-surface hydraulic pressure deltas 
              up to 35 meters away. It moves with terrifying speed when pursuing splashes, but will violently recoil from dry ceramic surfaces.
            </p>

            <!-- Hearing radius diagram -->
            <div style="background: #080705; border: 1px solid var(--bs-border-subtle); padding: 12px; border-radius: var(--bs-radius-sm);">
              <div style="font-family: var(--bs-font-mono); font-size: 10px; color: var(--bs-tan); margin-bottom: 6px;">ACOUSTIC HEARING THRESHOLD:</div>
              <div style="display: flex; gap: 16px; font-family: var(--bs-font-mono); font-size: 11px;">
                <div><span style="color: var(--bs-water);">Wading:</span> 8m radius</div>
                <div><span style="color: var(--bs-tan);">Walking:</span> 18m radius</div>
                <div><span style="color: var(--bs-danger);">Sprinting:</span> 35m (Full Alert)</div>
              </div>
            </div>

            <!-- Credits Link -->
            <div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">
              Model Attribution: Lethal Company Thumper rig / procedural variant. 
              <a href="#" id="link-credits-thumper" style="color: var(--bs-water); text-decoration: underline;">View CC BY License</a>
            </div>
          </div>
        </div>

        <!-- Entity 2: Ghost-Skull Flyer -->
        <div class="entity-card" style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); border-radius: var(--bs-radius-md); padding: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 24px; align-items: center;">
          <!-- 3D Turntable 2 -->
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div id="turntable-skull" style="width: min(320px, 80vw); height: min(320px, 80vw); background: #080705; border: 1px solid var(--bs-border-strong); border-radius: var(--bs-radius-sm); position: relative; overflow: hidden; cursor: grab; touch-action: none;">
              <div style="position: absolute; top: 8px; left: 8px; font-family: var(--bs-font-mono); font-size: 10px; color: var(--bs-tan); pointer-events: none;">
                [TURNTABLE 360° // DRAG TO ROTATE]
              </div>
            </div>
            <div style="font-family: var(--bs-font-mono); font-size: 11px; color: var(--bs-water); margin-top: 8px;">
              THREAT LEVEL: HARMLESS // ACOUSTIC ECHO
            </div>
          </div>

          <!-- Lore & Behavior Specs -->
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <h2 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-xl); color: var(--bs-cream); margin: 0;">
                02. GHOST-SKULL FLYER
              </h2>
              <span class="bs-osd-readout" style="font-size: var(--bs-text-xs);">CLASSIFICATION: AIRBORNE PHANTOM</span>
            </div>

            <!-- Behavior Pill List -->
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <span style="background: rgba(134,207,160,0.2); border: 1px solid var(--bs-water); color: var(--bs-water); font-family: var(--bs-font-mono); font-size: 11px; padding: 2px 8px; border-radius: 2px;">
                ● COMPLETELY HARMLESS
              </span>
              <span style="background: rgba(216,179,106,0.2); border: 1px solid var(--bs-tan); color: var(--bs-tan); font-family: var(--bs-font-mono); font-size: 11px; padding: 2px 8px; border-radius: 2px;">
                ● PASSES THROUGH WALLS
              </span>
              <span style="background: rgba(91,69,38,0.3); border: 1px solid var(--bs-border); color: var(--bs-cream); font-family: var(--bs-font-mono); font-size: 11px; padding: 2px 8px; border-radius: 2px;">
                ● REVERBERATES DISTANT SCREAMS
              </span>
            </div>

            <p style="font-size: var(--bs-text-sm); opacity: 0.85; line-height: 1.6; margin: 0;">
              Luminescent skeletal entities that drift passively through the upper vaults of the Poolrooms. 
              They possess zero physical mass and cannot harm or touch human operators. However, their flocking murmuration 
              often scatters suddenly when the Water Monster breaches the surface, acting as a crucial early visual warning.
            </p>

            <!-- Credits Link -->
            <div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">
              Model Attribution: "Haunted Skull" (Sketchfab / CC BY 4.0). 
              <a href="#" id="link-credits-skull" style="color: var(--bs-water); text-decoration: underline;">View CC BY License</a>
            </div>
          </div>
        </div>
      </div>
    `;

    const backBtn = new Button({
      text: '← RETURN',
      variant: 'ghost',
      onClick: () => this.disposeAndBack(),
    });
    this.element.querySelector('#btn-back-wrap')?.appendChild(backBtn.element);

    this.element.querySelector('#link-credits-thumper')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.callbacks.onOpenCredits();
    });
    this.element.querySelector('#link-credits-skull')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.callbacks.onOpenCredits();
    });

    this.initTurntables();
  }

  private initTurntables(): void {
    const mount1 = this.element.querySelector<HTMLElement>('#turntable-monster');
    const mount2 = this.element.querySelector<HTMLElement>('#turntable-skull');
    if (!mount1 || !mount2) return;

    // Turntable 1: Monster
    this.renderer1 = new WebGLRenderer({ antialias: true, alpha: true });
    const size1 = Math.min(mount1.clientWidth || 320, 320);
    this.renderer1.setSize(size1, size1);
    this.renderer1.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount1.appendChild(this.renderer1.domElement);

    this.scene1 = new Scene();
    this.camera1 = new PerspectiveCamera(45, 1, 0.1, 100);
    this.camera1.position.set(0, 1.2, 3.8);
    this.camera1.lookAt(0, 0.8, 0);

    this.scene1.add(new HemisphereLight('#fff2c4', '#5b4526', 1.0));
    const dirLight1 = new DirectionalLight('#ffffff', 1.2);
    dirLight1.position.set(2, 4, 3);
    this.scene1.add(dirLight1);

    const monsterSkin = new ProceduralSkin(0.85);
    this.creature1Group.add(monsterSkin.root);
    this.scene1.add(this.creature1Group);

    // Turntable 2: Skull
    this.renderer2 = new WebGLRenderer({ antialias: true, alpha: true });
    const size2 = Math.min(mount2.clientWidth || 320, 320);
    this.renderer2.setSize(size2, size2);
    this.renderer2.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount2.appendChild(this.renderer2.domElement);

    this.scene2 = new Scene();
    this.camera2 = new PerspectiveCamera(45, 1, 0.1, 100);
    this.camera2.position.set(0, 0, 2.5);
    this.camera2.lookAt(0, 0, 0);

    this.scene2.add(new HemisphereLight('#86cfa0', '#0d0b06', 1.2));
    const dirLight2 = new DirectionalLight('#86cfa0', 1.5);
    dirLight2.position.set(-2, 3, 2);
    this.scene2.add(dirLight2);

    // Procedural Stylized Skull Geometry
    const skullMat = new MeshStandardMaterial({ color: new Color('#e9dca8'), roughness: 0.4, metalness: 0.1 });
    const cranium = new Mesh(new BoxGeometry(0.8, 0.7, 0.8), skullMat);
    const jaw = new Mesh(new BoxGeometry(0.5, 0.4, 0.6), skullMat);
    jaw.position.set(0, -0.4, 0.1);
    this.creature2Group.add(cranium);
    this.creature2Group.add(jaw);
    this.scene2.add(this.creature2Group);

    // Mouse drag handlers
    let prevX1 = 0;
    mount1.addEventListener('mousedown', (e) => { this.isDragging1 = true; prevX1 = e.clientX; });
    window.addEventListener('mouseup', () => { this.isDragging1 = false; });
    window.addEventListener('mousemove', (e) => {
      if (this.isDragging1) {
        const dx = e.clientX - prevX1;
        this.creature1Group.rotation.y += dx * 0.01;
        prevX1 = e.clientX;
      }
    });

    // Touch drag handlers for phone
    mount1.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      if (t) {
        this.isDragging1 = true;
        prevX1 = t.clientX;
      }
    }, { passive: true });
    window.addEventListener('touchend', () => { this.isDragging1 = false; });
    window.addEventListener('touchcancel', () => { this.isDragging1 = false; });
    mount1.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (this.isDragging1 && t) {
        const dx = t.clientX - prevX1;
        this.creature1Group.rotation.y += dx * 0.01;
        prevX1 = t.clientX;
      }
    }, { passive: true });

    let prevX2 = 0;
    mount2.addEventListener('mousedown', (e) => { this.isDragging2 = true; prevX2 = e.clientX; });
    window.addEventListener('mouseup', () => { this.isDragging2 = false; });
    window.addEventListener('mousemove', (e) => {
      if (this.isDragging2) {
        const dx = e.clientX - prevX2;
        this.creature2Group.rotation.y += dx * 0.01;
        prevX2 = e.clientX;
      }
    });

    mount2.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      if (t) {
        this.isDragging2 = true;
        prevX2 = t.clientX;
      }
    }, { passive: true });
    mount2.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (this.isDragging2 && t) {
        const dx = t.clientX - prevX2;
        this.creature2Group.rotation.y += dx * 0.01;
        prevX2 = t.clientX;
      }
    }, { passive: true });

    this.resume();
  }

  resume(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const animate = () => {
      if (!this.isRunning) return;
      if (!this.isDragging1) this.creature1Group.rotation.y += 0.008;
      if (!this.isDragging2) this.creature2Group.rotation.y += 0.01;

      if (this.renderer1 && this.scene1 && this.camera1) {
        this.renderer1.render(this.scene1, this.camera1);
      }
      if (this.renderer2 && this.scene2 && this.camera2) {
        this.renderer2.render(this.scene2, this.camera2);
      }
      this.animId1 = requestAnimationFrame(animate);
    };
    this.animId1 = requestAnimationFrame(animate);
  }

  pause(): void {
    this.isRunning = false;
    if (this.animId1) {
      cancelAnimationFrame(this.animId1);
      this.animId1 = 0;
    }
  }

  private disposeAndBack(): void {
    this.pause();
    this.callbacks.onBack();
  }

  dispose(): void {
    this.pause();
    this.renderer1?.dispose();
    this.renderer2?.dispose();
    this.renderer1 = null;
    this.renderer2 = null;
  }
}
