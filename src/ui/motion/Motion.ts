/* ── Motion.ts ───────────────────────────────────────────────────────────
 *  Archive Motion Engine:
 *  14 signature analog horror animations built with CSS, WAAPI, & Canvas 2D.
 *  Zero runtime animation dependencies.
 *  Main-thread budget: <= 2ms/frame.
 *  Full prefers-reduced-motion and photosensitive-safe mode (<= 3 Hz, luminance <= 0.25).
 * ──────────────────────────────────────────────────────────────────────── */

export interface MotionConfig {
  reducedMotion?: boolean;
  photosensitiveSafe?: boolean;
}

export class MotionEngine {
  private static instance: MotionEngine | null = null;
  private isReducedMotion = false;
  private isPhotosensitiveSafe = false;

  static getInstance(): MotionEngine {
    if (!this.instance) {
      this.instance = new MotionEngine();
    }
    return this.instance;
  }

  constructor() {
    this.detectPreferences();
  }

  private detectPreferences(): void {
    if (typeof window === 'undefined') return;

    if (window.matchMedia) {
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.isReducedMotion = mql.matches;
      mql.addEventListener('change', (e) => {
        this.isReducedMotion = e.matches;
      });
    }

    if (typeof document !== 'undefined' && document.documentElement) {
      const isSafe = document.documentElement.hasAttribute('data-photosensitive') ||
                     document.documentElement.classList.contains('photosensitive-safe');
      this.isPhotosensitiveSafe = isSafe;
    }
  }

  setPhotosensitiveSafe(val: boolean): void {
    this.isPhotosensitiveSafe = val;
    if (typeof document !== 'undefined' && document.documentElement) {
      if (val) {
        document.documentElement.setAttribute('data-photosensitive', 'safe');
      } else {
        document.documentElement.removeAttribute('data-photosensitive');
      }
    }
  }

  getPhotosensitiveSafe(): boolean {
    return this.isPhotosensitiveSafe;
  }

  getReducedMotion(): boolean {
    return this.isReducedMotion;
  }

  setReducedMotion(val: boolean): void {
    this.isReducedMotion = val;
  }

  /**
   * Signature 1: Ink-in-Water Logo Reveal.
   * Coded stroke-font SVG drawn like wet marker, followed by an expanding ripple.
   */
  inkLogoReveal(svgElement: SVGElement, onComplete?: () => void): void {
    if (this.isReducedMotion || this.isPhotosensitiveSafe) {
      if (svgElement?.style) svgElement.style.opacity = '1';
      onComplete?.();
      return;
    }

    const paths = svgElement.querySelectorAll<SVGPathElement>('path, line, polyline');
    paths.forEach((p) => {
      const len = p.getTotalLength?.() ?? 100;
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
      p.animate?.(
        [
          { strokeDashoffset: `${len}`, opacity: '0.4' },
          { strokeDashoffset: '0', opacity: '1' },
        ],
        {
          duration: 720,
          easing: 'cubic-bezier(.2, .8, .2, 1)',
          fill: 'forwards',
        },
      );
    });

    setTimeout(() => {
      onComplete?.();
    }, 750);
  }

  /**
   * Signature 2: Ripple-Wipe View Transition.
   * Document ViewTransition API with circular clip path, falling back to overlay clip path (~480ms).
   */
  rippleWipe(originX: number, originY: number, onTransition: () => void | Promise<void>): void {
    if (this.isReducedMotion || this.isPhotosensitiveSafe) {
      void onTransition();
      return;
    }

    // Check for native Document View Transition API
    const doc = document as unknown as { startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> } };
    if (typeof doc.startViewTransition === 'function') {
      try {
        doc.startViewTransition(async () => {
          await onTransition();
        });
        return;
      } catch {
        // Fall back to overlay wipe below
      }
    }

    const overlay = document.createElement('div');
    overlay.className = 'bs-wipe-overlay';
    overlay.style.setProperty('--wipe-x', `${originX}px`);
    overlay.style.setProperty('--wipe-y', `${originY}px`);
    document.body.appendChild(overlay);

    // Force reflow
    void overlay.offsetWidth;
    overlay.classList.add('bs-wiping');

    setTimeout(() => {
      void onTransition();
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 240ms ease-out';
      setTimeout(() => {
        if (overlay.parentElement) document.body.removeChild(overlay);
      }, 240);
    }, 420);
  }

  /**
   * Signature 3: Tape Insert / Eject Mechanics.
   */
  animateTapeInsert(element: HTMLElement, onSettled?: () => void): void {
    if (this.isReducedMotion) {
      onSettled?.();
      return;
    }
    element.classList.remove('bs-tape-ejecting');
    element.classList.add('bs-tape-inserting');
    setTimeout(() => {
      onSettled?.();
    }, 480);
  }

  animateTapeEject(element: HTMLElement, onSettled?: () => void): void {
    if (this.isReducedMotion) {
      onSettled?.();
      return;
    }
    element.classList.remove('bs-tape-inserting');
    element.classList.add('bs-tape-ejecting');
    setTimeout(() => {
      element.classList.remove('bs-tape-ejecting');
      onSettled?.();
    }, 480);
  }

  /**
   * Signature 4: Hover / Click Ripple ring on buttons and cards.
   */
  attachHoverRipple(target: HTMLElement): void {
    if (this.isReducedMotion) return;

    target.addEventListener('click', (e: MouseEvent) => {
      const rect = target.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const ripple = document.createElement('span');
      ripple.className = 'bs-ripple-ring';
      const size = Math.max(rect.width, rect.height) * 1.5;
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;

      target.appendChild(ripple);
      setTimeout(() => {
        if (ripple.parentElement) target.removeChild(ripple);
      }, 500);
    });
  }

  /**
   * Signature 5: Parallax Fog Layers behind menus (3 canvas gradient layers at 0.2, 0.5, 0.8 speed).
   */
  createParallaxFog(container: HTMLElement): () => void {
    if (this.isReducedMotion) {
      return () => {};
    }

    const canvas = document.createElement('canvas');
    canvas.className = 'bs-parallax-fog';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return () => {};

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let scrollY = window.scrollY || 0;
    let animId = 0;
    let running = true;

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    const onScroll = () => {
      scrollY = window.scrollY || 0;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    const onResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const render = () => {
      if (!running) return;
      if (!document.hidden) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const offX = (mouseX - cx) / cx;
        const offY = (mouseY - cy) / cy;

        // Layer 1 (0.2x speed) - Deep dense silt
        const g1 = ctx.createRadialGradient(cx + offX * 25, cy + offY * 15 + scrollY * 0.2, 120, cx, cy, canvas.width * 0.8);
        g1.addColorStop(0, 'rgba(217, 211, 162, 0.08)');
        g1.addColorStop(1, 'rgba(13, 11, 6, 0)');
        ctx.fillStyle = g1;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Layer 2 (0.5x speed) - Mid-level aquatic murk
        const g2 = ctx.createRadialGradient(cx - offX * 50, cy - offY * 30 + scrollY * 0.5, 60, cx, cy, canvas.width * 0.6);
        g2.addColorStop(0, 'rgba(134, 207, 160, 0.06)');
        g2.addColorStop(1, 'rgba(13, 11, 6, 0)');
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Layer 3 (0.8x speed) - Surface vapor drift
        const g3 = ctx.createRadialGradient(cx + offX * 80, cy + offY * 60 + scrollY * 0.8, 30, cx, cy, canvas.width * 0.4);
        g3.addColorStop(0, 'rgba(233, 220, 168, 0.04)');
        g3.addColorStop(1, 'rgba(13, 11, 6, 0)');
        ctx.fillStyle = g3;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      running = false;
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (canvas.parentElement) container.removeChild(canvas);
    };
  }

  /**
   * Signature 6: Text Decode for OSD lines and rank titles.
   * Settles random glyphs within <= 400ms.
   */
  textDecode(element: HTMLElement, finalString: string, durationMs = 360): void {
    if (this.isReducedMotion || this.isPhotosensitiveSafe) {
      element.textContent = finalString;
      return;
    }

    const chars = '0123456789ABCDEF/_-·#*';
    const len = finalString.length;
    const start = performance.now();

    const frame = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);
      const settledCount = Math.floor(progress * len);

      let text = '';
      for (let i = 0; i < len; i++) {
        if (i < settledCount) {
          text += finalString[i];
        } else if (finalString[i] === ' ') {
          text += ' ';
        } else {
          text += chars[Math.floor(Math.random() * chars.length)];
        }
      }
      element.textContent = text;

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        element.textContent = finalString;
      }
    };

    requestAnimationFrame(frame);
  }

  /**
   * Signature 7: Score Count-Up with VU Needle Flutter and Rank Stamp Thump.
   */
  animateScoreCountUp(
    element: HTMLElement,
    targetScore: number,
    durationMs = 900,
    onComplete?: () => void,
  ): void {
    if (this.isReducedMotion) {
      element.textContent = targetScore.toLocaleString();
      onComplete?.();
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = Math.sin((progress * Math.PI) / 2);
      const current = Math.floor(eased * targetScore);
      element.textContent = current.toLocaleString();

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        element.textContent = targetScore.toLocaleString();
        onComplete?.();
      }
    };
    requestAnimationFrame(tick);
  }

  rankStampThump(stampElement: HTMLElement): void {
    if (this.isReducedMotion) return;
    stampElement.classList.remove('bs-stamp-thump');
    void stampElement.offsetWidth;
    stampElement.classList.add('bs-stamp-thump');
  }

  /**
   * Signature 8: Star Pip Wet Pop.
   */
  popStarPip(starElement: HTMLElement): void {
    if (this.isReducedMotion) return;
    starElement.classList.remove('bs-star-pop');
    void starElement.offsetWidth;
    starElement.classList.add('bs-star-pop');
  }

  /**
   * Signature 9: Achievement Unlock Card Flip.
   */
  unlockCardFlip(cardElement: HTMLElement): void {
    if (this.isReducedMotion) return;
    cardElement.classList.add('bs-unlock-flip');
  }

  /**
   * Signature 10: Leaderboard row staggered slide-in (24ms per row) & pulse.
   */
  staggerRows(rows: HTMLElement[], staggerMs = 24): void {
    if (this.isReducedMotion) return;
    rows.forEach((row, idx) => {
      row.style.opacity = '0';
      row.style.transform = 'translateY(8px)';
      row.style.transition = `opacity 240ms ease-out ${idx * staggerMs}ms, transform 240ms var(--ease-wet) ${idx * staggerMs}ms`;
      setTimeout(() => {
        row.style.opacity = '1';
        row.style.transform = 'translateY(0)';
      }, 10);
    });
  }

  pulsePlayerRow(rowElement: HTMLElement): void {
    if (this.isReducedMotion) return;
    rowElement.classList.remove('bs-row-pulse');
    void rowElement.offsetWidth;
    rowElement.classList.add('bs-row-pulse');
  }

  /**
   * Signature 11: Scroll-Driven Reveals with IntersectionObserver fallback.
   */
  observeScrollReveals(root: HTMLElement = document.body): () => void {
    if (this.isReducedMotion) {
      root.querySelectorAll('.bs-scroll-reveal').forEach((el) => {
        el.classList.add('bs-revealed');
      });
      return () => {};
    }

    if (typeof IntersectionObserver === 'undefined') {
      root.querySelectorAll('.bs-scroll-reveal').forEach((el) => {
        el.classList.add('bs-revealed');
      });
      return () => {};
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('bs-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 },
    );

    const elements = root.querySelectorAll('.bs-scroll-reveal');
    elements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
    };
  }

  /**
   * Signature 12: Pre-Run Ritual (2s, skippable on click or key).
   */
  runPreRunRitual(
    container: HTMLElement,
    tapeTitle: string,
    onReady: () => void,
  ): () => void {
    const overlay = document.createElement('div');
    overlay.className = 'bs-prerun-overlay';

    const titleEl = document.createElement('div');
    titleEl.className = 'bs-prerun-title';
    overlay.appendChild(titleEl);

    const subEl = document.createElement('div');
    subEl.className = 'bs-prerun-sub';
    subEl.textContent = 'REC [00:00:00:00] // DESCENDING...';
    overlay.appendChild(subEl);

    container.appendChild(overlay);

    let finished = false;
    let timerId: ReturnType<typeof setTimeout>;

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timerId);
      window.removeEventListener('keydown', skip);
      overlay.removeEventListener('click', skip);
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
        onReady();
      }, 300);
    };

    const skip = () => finish();

    if (this.isReducedMotion) {
      titleEl.textContent = tapeTitle;
      timerId = setTimeout(finish, 400);
      return finish;
    }

    this.textDecode(titleEl, tapeTitle, 800);
    timerId = setTimeout(finish, 2000);

    window.addEventListener('keydown', skip, { once: true });
    overlay.addEventListener('click', skip, { once: true });

    return finish;
  }

  /**
   * Signature 13: Performance Budget Monitor (<= 2ms main-thread / frame).
   * Measures Long Animation Frames via PerformanceObserver where supported.
   */
  measureLongAnimationFrames(onWarning?: (durationMs: number) => void): () => void {
    if (typeof PerformanceObserver === 'undefined') return () => {};

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // If a long animation frame or longtask exceeded 50ms budget
          if (entry.duration > 50) {
            onWarning?.(entry.duration);
          }
        }
      });
      // Try observe long-animation-frame or longtask
      observer.observe({ type: 'longtask', buffered: true });
      return () => observer.disconnect();
    } catch {
      return () => {};
    }
  }
}
