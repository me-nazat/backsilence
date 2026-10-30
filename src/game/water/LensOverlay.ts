/* ── LensOverlay.ts ────────────────────────────────────────────────────────
 *  Camera water effects:
 *  - Meniscus line animation when crossing the water surface
 *  - Animated water droplets on lens for ~1.5s after emerging from water
 *  - Underwater particulate & chromatic vignette
 * ──────────────────────────────────────────────────────────────────────── */

export interface LensDroplet {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  vy: number;
}

export interface ParticulateSpeck {
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  alpha: number;
}

export class LensOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private droplets: LensDroplet[] = [];
  private readonly specks: ParticulateSpeck[] = [];
  private dropletTimer = 0;
  private meniscusTimer = 0;
  private isSubmerged = false;

  private readonly onResize = (): void => {
    const parent = this.canvas.parentElement;
    this.resize(parent?.clientWidth || window.innerWidth, parent?.clientHeight || window.innerHeight);
  };

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'lens-water-overlay';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '12';
    const initW = container.clientWidth || window.innerWidth || 1280;
    const initH = container.clientHeight || window.innerHeight || 720;
    this.canvas.width = initW;
    this.canvas.height = initH;

    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    // Initialize 90 drifting particulate specks for underwater
    for (let i = 0; i < 90; i++) {
      this.specks.push({
        x: Math.random() * initW,
        y: Math.random() * initH,
        size: 0.8 + Math.random() * 2.2,
        vx: (Math.random() - 0.5) * 8.0,
        vy: -3.0 - Math.random() * 9.0, // subtle upward buoyancy
        alpha: 0.15 + Math.random() * 0.45,
      });
    }

    window.addEventListener('resize', this.onResize);
  }

  /** Trigger surface crossing meniscus line */
  triggerMeniscus(): void {
    this.meniscusTimer = 0.35; // 350ms meniscus sweep
  }

  /** Trigger water droplets on lens when camera emerges from underwater */
  triggerEmergence(): void {
    this.dropletTimer = 1.6; // 1.6s subtle droplet dissipation
    this.droplets = [];
    const count = 12 + Math.floor(Math.random() * 8);
    const w = this.canvas.width;
    const h = this.canvas.height;

    for (let i = 0; i < count; i++) {
      this.droplets.push({
        x: Math.random() * w,
        y: Math.random() * h * 0.8,
        radius: 1.5 + Math.random() * 2.5,
        alpha: 0.28 + Math.random() * 0.12,
        vy: 14 + Math.random() * 28, // subtle downward trickle
      });
    }
  }

  setSubmerged(submerged: boolean): void {
    if (this.isSubmerged && !submerged) {
      // Emerged!
      this.triggerEmergence();
      this.triggerMeniscus();
    } else if (!this.isSubmerged && submerged) {
      // Entered water
      this.triggerMeniscus();
    }
    this.isSubmerged = submerged;
  }

  update(dt: number): void {
    if (!this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Check if we need to draw anything
    if (this.dropletTimer <= 0 && this.meniscusTimer <= 0 && !this.isSubmerged) {
      if (this.ctx) {
        this.ctx.clearRect(0, 0, w, h);
      }
      return;
    }

    this.ctx.clearRect(0, 0, w, h);

    // 1. Submerged underwater overlay: tint, drifting particulate, radial chromatic vignette
    if (this.isSubmerged) {
      // 1a. Base underwater tint
      this.ctx.fillStyle = 'rgba(18, 59, 58, 0.28)';
      this.ctx.fillRect(0, 0, w, h);

      // 1b. ~90 drifting particulate specks
      this.ctx.save();
      for (const s of this.specks) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.x < 0) s.x += w;
        else if (s.x > w) s.x -= w;
        if (s.y < 0) s.y += h;
        else if (s.y > h) s.y -= h;

        this.ctx.fillStyle = `rgba(160, 215, 195, ${s.alpha})`;
        this.ctx.beginPath();
        this.ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.restore();

      // 1c. Radial chromatic vignette
      this.ctx.save();
      const cx = w * 0.5;
      const cy = h * 0.5;
      const maxR = Math.sqrt(cx * cx + cy * cy);
      const vig = this.ctx.createRadialGradient(cx, cy, maxR * 0.35, cx, cy, maxR);
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vig.addColorStop(0.7, 'rgba(12, 38, 35, 0.25)');
      vig.addColorStop(1, 'rgba(6, 22, 20, 0.55)');
      this.ctx.fillStyle = vig;
      this.ctx.fillRect(0, 0, w, h);
      this.ctx.restore();
    }

    // 2. Draw Meniscus Line
    if (this.meniscusTimer > 0) {
      this.meniscusTimer -= dt;
      const progress = 1.0 - this.meniscusTimer / 0.35;
      const lineY = h * (0.45 + 0.1 * progress);
      const alpha = Math.sin(progress * Math.PI) * 0.8;

      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.moveTo(0, lineY);
      this.ctx.bezierCurveTo(w * 0.33, lineY - 14, w * 0.66, lineY + 14, w, lineY);
      this.ctx.lineWidth = 12;
      this.ctx.strokeStyle = `rgba(200, 245, 235, ${alpha * 0.85})`;
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.moveTo(0, lineY);
      this.ctx.bezierCurveTo(w * 0.33, lineY - 8, w * 0.66, lineY + 8, w, lineY);
      this.ctx.lineWidth = 4;
      this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 3. Draw Lens Droplets (subtle translucent micro-droplets without harsh white discs)
    if (this.dropletTimer > 0) {
      this.dropletTimer -= dt;
      const fade = Math.min(1.0, this.dropletTimer / 0.8);

      this.ctx.save();
      for (const d of this.droplets) {
        d.y += d.vy * dt;
        const currentAlpha = d.alpha * fade;
        if (currentAlpha <= 0.01) continue;

        // Subtle soft glass refraction ring
        const grad = this.ctx.createRadialGradient(
          d.x - d.radius * 0.25,
          d.y - d.radius * 0.25,
          d.radius * 0.1,
          d.x,
          d.y,
          d.radius,
        );
        grad.addColorStop(0, `rgba(220, 245, 235, ${currentAlpha * 0.5})`);
        grad.addColorStop(0.7, `rgba(160, 210, 195, ${currentAlpha * 0.3})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
        this.ctx.fill();

        // Delicate micro specular glint
        this.ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha * 0.55})`;
        this.ctx.beginPath();
        this.ctx.arc(d.x - d.radius * 0.25, d.y - d.radius * 0.25, d.radius * 0.25, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.restore();
    }
  }

  resize(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.canvas.remove();
  }
}
