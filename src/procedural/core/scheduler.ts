/* ── scheduler.ts ─────────────────────────────────────────────────────────
 *  Cooperative time-slicer using generators and requestIdleCallback.
 *  Guarantees no slice exceeds ~6 ms to preserve 60 FPS UI responsiveness.
 * ──────────────────────────────────────────────────────────────────────── */

export type SlicedTask<T = void> = Generator<number | undefined, T, void>;

export interface SchedulerOptions {
  /** Target slice budget in ms (defaults to 6ms). */
  sliceBudgetMs?: number | undefined;
  /** Optional callback receiving normalized progress (0..1). */
  onProgress?: ((progress: number) => void) | undefined;
}

const DEFAULT_SLICE_MS = 6.0;

/** Schedule execution in the next idle window or next macrotask. */
function scheduleNextTick(cb: () => void): void {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => cb(), { timeout: 16 });
  } else if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => cb());
  } else {
    setTimeout(cb, 0);
  }
}

/**
 * Run a generator-based cooperative task across multiple time slices.
 */
export function runCooperative<T>(
  task: SlicedTask<T>,
  options: SchedulerOptions = {},
): Promise<T> {
  const budget = options.sliceBudgetMs ?? DEFAULT_SLICE_MS;
  const onProgress = options.onProgress;

  return new Promise<T>((resolve, reject) => {
    function step(): void {
      const start = performance.now();
      try {
        while (true) {
          const result = task.next();

          if (result.done) {
            if (onProgress) onProgress(1.0);
            resolve(result.value);
            return;
          }

          if (typeof result.value === 'number' && onProgress) {
            onProgress(Math.min(1.0, Math.max(0.0, result.value)));
          }

          const elapsed = performance.now() - start;
          if (elapsed >= budget) {
            // Budget exceeded: yield to the event loop
            scheduleNextTick(step);
            return;
          }
        }
      } catch (err: unknown) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }

    step();
  });
}

export interface CooperativeJob<T> {
  name: string;
  run: () => SlicedTask<T> | Promise<T> | T;
}

/**
 * Run a sequence of jobs cooperatively, reporting aggregate progress 0..1.
 */
export async function runJobQueue<T>(
  jobs: Array<CooperativeJob<T>>,
  options: SchedulerOptions = {},
): Promise<T[]> {
  const results: T[] = [];
  const total = jobs.length;
  if (total === 0) return results;

  for (let i = 0; i < total; i++) {
    const job = jobs[i]!;
    const baseProgress = i / total;
    const nextProgress = (i + 1) / total;

    const jobOutcome = job.run();
    let res: T;

    if (
      jobOutcome &&
      typeof (jobOutcome as Generator).next === 'function' &&
      typeof (jobOutcome as Generator)[Symbol.iterator] === 'function'
    ) {
      res = await runCooperative(jobOutcome as SlicedTask<T>, {
        sliceBudgetMs: options.sliceBudgetMs,
        onProgress: (subP) => {
          if (options.onProgress) {
            options.onProgress(baseProgress + subP * (nextProgress - baseProgress));
          }
        },
      });
    } else {
      res = await Promise.resolve(jobOutcome as T | Promise<T>);
      if (options.onProgress) {
        options.onProgress(nextProgress);
      }
    }

    results.push(res);
  }

  if (options.onProgress) {
    options.onProgress(1.0);
  }

  return results;
}
