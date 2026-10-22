/* ── Loop.ts ──────────────────────────────────────────────────────────────
 *  Fixed-timestep game loop with render interpolation.
 *  60 Hz simulation, clamped dt, pauses on hidden tab.
 * ──────────────────────────────────────────────────────────────────────── */

const FIXED_DT = 1 / 60;
const MAX_DT = 0.1;

export type UpdateFn = (dt: number) => void;
export type RenderFn = (alpha: number) => void;

export interface GameLoop {
  /** Start the loop. */
  start(): void;
  /** Stop the loop. */
  stop(): void;
  /** Whether the loop is currently running. */
  readonly running: boolean;
  /** Register the update callback (fixed timestep). */
  setUpdate(fn: UpdateFn): void;
  /** Register the render callback (every frame, with interpolation alpha). */
  setRender(fn: RenderFn): void;
}

export function createGameLoop(): GameLoop {
  let rafId = 0;
  let _running = false;
  let accumulator = 0;
  let lastTime = 0;
  let updateFn: UpdateFn = () => { /* no-op until set */ };
  let renderFn: RenderFn = () => { /* no-op until set */ };
  let hidden = false;

  function onVisibilityChange(): void {
    hidden = document.hidden;
    if (!hidden) {
      // Reset time reference to avoid huge dt spike when returning
      lastTime = performance.now() / 1000;
      accumulator = 0;
    }
  }

  function tick(now: number): void {
    if (!_running) return;
    rafId = requestAnimationFrame(tick);

    if (hidden) return;

    const t = now / 1000;
    if (lastTime === 0) {
      lastTime = t;
      return;
    }

    let dt = t - lastTime;
    lastTime = t;

    // Clamp large deltas (e.g. after breakpoint pause)
    if (dt > MAX_DT) dt = MAX_DT;

    accumulator += dt;

    // Fixed-step simulation
    while (accumulator >= FIXED_DT) {
      updateFn(FIXED_DT);
      accumulator -= FIXED_DT;
    }

    // Render with interpolation alpha
    const alpha = accumulator / FIXED_DT;
    renderFn(alpha);
  }

  const loop: GameLoop = {
    get running() {
      return _running;
    },

    start() {
      if (_running) return;
      _running = true;
      lastTime = 0;
      accumulator = 0;
      hidden = typeof document !== 'undefined' && document.hidden;
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibilityChange);
      }
      rafId = requestAnimationFrame(tick);
    },

    stop() {
      _running = false;
      cancelAnimationFrame(rafId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    },

    setUpdate(fn: UpdateFn) {
      updateFn = fn;
    },

    setRender(fn: RenderFn) {
      renderFn = fn;
    },
  };

  return loop;
}
