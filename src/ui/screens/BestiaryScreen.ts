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
  private animId2 = 0;
  private creature1Group = new Group();
  private creature2Group = new Group();

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
      padding: clamp(24px, 4vw, 48px) 24px;
      box-sizing: border-box;
    `;

    this.render();
  }

  private render(): void {
    this.element.innerHTML = `
      <div style="width: min(1100px, 95vw); display: flex; flex-direction: column; gap: 32px;">
        <!-- Top bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--bs-border); padding-bottom: 16px;">
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
        <div class="entity-card" style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); border-radius: var(--bs-radius-md); padding: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; align-items: center;">
          <!-- 3D Turntable 1 -->
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div id="turntable-monster" style="width: 320px; height: 320px; background: #080705; border: 1px solid var(--bs-border-strong); border-radius: var(--bs-radius-sm); position: relative; overflow: hidden; cursor: grab;">
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
        <div class="entity-card" style="background: var(--bs-surface-2); border: 1px solid var(--bs-border); border-radius: var(--bs-radius-md); padding: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; align-items: center;">
          <!-- 3D Turntable 2 -->
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div id="turntable-skull" style="width: 320px; height: 320px; background: #080705; border: 1px solid var(--bs-border-strong); border-radius: var(--bs-radius-sm); position: relative; overflow: hidden; cursor: grab;">
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
    this.renderer1.setSize(320, 320);
    this.renderer1.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount1.appendChild(this.renderer1.domElement);

    const scene1 = new Scene();
    const camera1 = new PerspectiveCamera(45, 1, 0.1, 100);
    camera1.position.set(0, 1.2, 3.8);
    camera1.lookAt(0, 0.8, 0);

    scene1.add(new HemisphereLight('#fff2c4', '#5b4526', 1.0));
    const dirLight1 = new DirectionalLight('#ffffff', 1.2);
    dirLight1.position.set(2, 4, 3);
    scene1.add(dirLight1);

    const monsterSkin = new ProceduralSkin(0.85);
    this.creature1Group.add(monsterSkin.root);
    scene1.add(this.creature1Group);

    // Turntable 2: Skull
    this.renderer2 = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer2.setSize(320, 320);
    this.renderer2.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount2.appendChild(this.renderer2.domElement);

    const scene2 = new Scene();
    const camera2 = new PerspectiveCamera(45, 1, 0.1, 100);
    camera2.position.set(0, 0, 2.5);
    camera2.lookAt(0, 0, 0);

    scene2.add(new HemisphereLight('#86cfa0', '#0d0b06', 1.2));
    const dirLight2 = new DirectionalLight('#86cfa0', 1.5);
    dirLight2.position.set(-2, 3, 2);
    scene2.add(dirLight2);

    // Procedural Stylized Skull Geometry
    const skullMat = new MeshStandardMaterial({ color: new Color('#e9dca8'), roughness: 0.4, metalness: 0.1 });
    const cranium = new Mesh(new BoxGeometry(0.8, 0.7, 0.8), skullMat);
    const jaw = new Mesh(new BoxGeometry(0.5, 0.4, 0.6), skullMat);
    jaw.position.set(0, -0.4, 0.1);
    this.creature2Group.add(cranium);
    this.creature2Group.add(jaw);
    scene2.add(this.creature2Group);

    // Mouse drag handlers
    let isDragging1 = false;
    let prevX1 = 0;
    mount1.addEventListener('mousedown', (e) => { isDragging1 = true; prevX1 = e.clientX; });
    window.addEventListener('mouseup', () => { isDragging1 = false; });
    window.addEventListener('mousemove', (e) => {
      if (isDragging1) {
        const dx = e.clientX - prevX1;
        this.creature1Group.rotation.y += dx * 0.01;
        prevX1 = e.clientX;
      }
    });

    let isDragging2 = false;
    let prevX2 = 0;
    mount2.addEventListener('mousedown', (e) => { isDragging2 = true; prevX2 = e.clientX; });
    window.addEventListener('mousemove', (e) => {
      if (isDragging2) {
        const dx = e.clientX - prevX2;
        this.creature2Group.rotation.y += dx * 0.01;
        prevX2 = e.clientX;
      }
    });

    // Render loop
    const animate = () => {
      if (!isDragging1) this.creature1Group.rotation.y += 0.008;
      if (!isDragging2) this.creature2Group.rotation.y += 0.01;

      this.renderer1?.render(scene1, camera1);
      this.renderer2?.render(scene2, camera2);
      this.animId1 = requestAnimationFrame(animate);
    };
    this.animId1 = requestAnimationFrame(animate);
  }

  private disposeAndBack(): void {
    if (this.animId1) cancelAnimationFrame(this.animId1);
    if (this.animId2) cancelAnimationFrame(this.animId2);
    this.renderer1?.dispose();
    this.renderer2?.dispose();
    this.callbacks.onBack();
  }
}
