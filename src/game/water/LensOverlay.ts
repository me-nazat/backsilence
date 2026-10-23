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

export class LensOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private droplets: LensDroplet[] = [];
  private dropletTimer = 0;
  private meniscusTimer = 0;
  private isSubmerged = false;

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
    this.canvas.width = window.innerWidth || 1280;
    this.canvas.height = window.innerHeight || 720;

    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
  }

  /** Trigger surface crossing meniscus line */
  triggerMeniscus(): void {
    this.meniscusTimer = 0.35; // 350ms meniscus sweep
  }

  /** Trigger water droplets on lens when camera emerges from underwater */
  triggerEmergence(): void {
    this.dropletTimer = 1.5; // 1.5s droplets decay
    this.droplets = [];
    const count = 18 + Math.floor(Math.random() * 12);
    const w = this.canvas.width;
    const h = this.canvas.height;

    for (let i = 0; i < count; i++) {
      this.droplets.push({
        x: Math.random() * w,
        y: Math.random() * h * 0.8,
        radius: 8 + Math.random() * 18,
        alpha: 0.75 + Math.random() * 0.25,
        vy: 20 + Math.random() * 60, // downward trickle
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

    // 1. Draw Meniscus Line
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

    // 2. Draw Lens Droplets
    if (this.dropletTimer > 0) {
      this.dropletTimer -= dt;
      const fade = Math.min(1.0, this.dropletTimer / 0.5);

      this.ctx.save();
      for (const d of this.droplets) {
        d.y += d.vy * dt;
        const currentAlpha = d.alpha * fade;
        if (currentAlpha <= 0.01) continue;

        // Outer glass refraction ring
        const grad = this.ctx.createRadialGradient(
          d.x - d.radius * 0.3,
          d.y - d.radius * 0.3,
          d.radius * 0.1,
          d.x,
          d.y,
          d.radius,
        );
        grad.addColorStop(0, `rgba(255, 255, 255, ${currentAlpha * 0.9})`);
        grad.addColorStop(0.65, `rgba(180, 230, 220, ${currentAlpha * 0.35})`);
        grad.addColorStop(0.9, `rgba(30, 70, 65, ${currentAlpha * 0.5})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
        this.ctx.fill();

        // Droplet specular highlight
        this.ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha * 0.95})`;
        this.ctx.beginPath();
        this.ctx.arc(d.x - d.radius * 0.35, d.y - d.radius * 0.35, d.radius * 0.22, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.restore();
    }
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  dispose(): void {
    this.canvas.remove();
  }
}
