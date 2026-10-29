/* ── SightingLogger.ts ──────────────────────────────────────────────────────
 *  Natural play sighting logger tool (?sightlog=1).
 *  Samples monsterProbe() at 5 Hz, tracks continuous sighting windows,
 *  records duration, distance, visibleFraction, and mask pixel counts.
 *  Exposes window.__backsilence_sightlog with summary and dump utilities.
 * ──────────────────────────────────────────────────────────────────────── */

export interface SightingSample {
  simTime: number;
  distance: number;
  maskPixels: number;
  visFrac: number;
  state: string;
}

export interface SightingWindow {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  maxVisFrac: number;
  minDistance: number;
  samples: SightingSample[];
  isValid: boolean; // duration >= 5s and maxVisFrac >= 0.15
}

export interface SightingSessionTarget {
  monsterProbe: () => {
    L2: { distanceToCamera: number };
    L3: { pixelCount: number };
    L4: { visibleFraction: number };
  };
  sim: {
    director: {
      getSnapshot: () => { simTime: number };
    };
    monsters: Array<{ state: string }>;
  };
}

export class SightingLogger {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly windows: SightingWindow[] = [];
  private currentWindow: SightingWindow | null = null;
  private count = 0;
  private firstSightingTime: number | null = null;

  constructor(private readonly session: SightingSessionTarget) {}

  start(): void {
    if (this.timer !== null) return;
    console.log('[SightingLogger] Monitoring natural-play monster sightings at 5 Hz (?sightlog=1 active)');

    this.timer = setInterval(() => {
      this.tick();
    }, 200); // 5 Hz
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.currentWindow) {
      this.closeCurrentWindow();
    }
  }

  private tick(): void {
    try {
      const simTime = this.session.sim.director.getSnapshot().simTime;
      const monsterState = this.session.sim.monsters[0]?.state ?? 'UNKNOWN';
      const probe = this.session.monsterProbe();

      const dist = probe.L2.distanceToCamera;
      const maskPx = probe.L3.pixelCount;
      const visFrac = probe.L4.visibleFraction;

      const isVisible = visFrac >= 0.15 && maskPx >= 150 && dist < 45.0;

      if (isVisible) {
        if (!this.currentWindow) {
          this.count++;
          if (this.firstSightingTime === null) {
            this.firstSightingTime = simTime;
          }
          this.currentWindow = {
            index: this.count,
            startTime: simTime,
            endTime: simTime,
            duration: 0,
            maxVisFrac: visFrac,
            minDistance: dist,
            samples: [],
            isValid: false,
          };
          console.log(
            `[SIGHTING #${this.count} START] t=${simTime.toFixed(1)}s | dist=${dist.toFixed(1)}m | visFrac=${(visFrac * 100).toFixed(1)}% | maskPx=${maskPx} | state=${monsterState}`,
          );
        }

        const sample: SightingSample = {
          simTime,
          distance: dist,
          maskPixels: maskPx,
          visFrac,
          state: monsterState,
        };
        this.currentWindow.samples.push(sample);
        this.currentWindow.endTime = simTime;
        this.currentWindow.duration = simTime - this.currentWindow.startTime;
        this.currentWindow.maxVisFrac = Math.max(this.currentWindow.maxVisFrac, visFrac);
        this.currentWindow.minDistance = Math.min(this.currentWindow.minDistance, dist);
      } else if (this.currentWindow) {
        // Window end threshold (lost sight for > 0.8s)
        const gap = simTime - this.currentWindow.endTime;
        if (gap >= 0.8) {
          this.closeCurrentWindow();
        }
      }
    } catch (err) {
      console.warn('[SightingLogger] Tick error:', err);
    }
  }

  private closeCurrentWindow(): void {
    if (!this.currentWindow) return;
    const w = this.currentWindow;
    w.duration = w.endTime - w.startTime;
    w.isValid = w.duration >= 5.0 && w.maxVisFrac >= 0.15;
    this.windows.push(w);
    this.currentWindow = null;

    console.log(
      `[SIGHTING #${w.index} END] duration=${w.duration.toFixed(1)}s | maxVisFrac=${(w.maxVisFrac * 100).toFixed(1)}% | minDist=${w.minDistance.toFixed(1)}m | valid=${w.isValid}`,
    );
  }

  getWindows(): readonly SightingWindow[] {
    return [...this.windows];
  }

  getSummary(): {
    firstSightingTime: number | null;
    totalWindows: number;
    validWindows: number;
    windows: Array<{ index: number; start: number; duration: number; maxVisFrac: number; minDist: number }>;
  } {
    const validWindows = this.windows.filter((w) => w.isValid).length;
    return {
      firstSightingTime: this.firstSightingTime,
      totalWindows: this.windows.length,
      validWindows,
      windows: this.windows.map((w) => ({
        index: w.index,
        start: Number(w.startTime.toFixed(1)),
        duration: Number(w.duration.toFixed(1)),
        maxVisFrac: Number(w.maxVisFrac.toFixed(3)),
        minDist: Number(w.minDistance.toFixed(1)),
      })),
    };
  }

  dump(): void {
    console.table(
      this.windows.map((w) => ({
        '#': w.index,
        'Start (s)': w.startTime.toFixed(1),
        'Duration (s)': w.duration.toFixed(1),
        'Max Vis %': `${(w.maxVisFrac * 100).toFixed(1)}%`,
        'Min Dist (m)': w.minDistance.toFixed(1),
        'Valid (>=5s)': w.isValid ? 'YES' : 'NO',
      })),
    );
  }
}

