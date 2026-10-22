/* ── Disposal.ts ──────────────────────────────────────────────────────────
 *  DisposableBag for deterministic cleanup of Three.js resources,
 *  event listeners, audio nodes, and render targets.
 * ──────────────────────────────────────────────────────────────────────── */

/** Anything with a dispose() method. */
export interface Disposable {
  dispose(): void;
}

/**
 * A bag that collects disposable resources and releases them all at once.
 * Use one per system/scene to prevent leaks.
 */
export class DisposableBag implements Disposable {
  private readonly items: Disposable[] = [];
  private disposed = false;

  /** Add a disposable resource to the bag. Returns the resource for chaining. */
  add<T extends Disposable>(item: T): T {
    if (this.disposed) {
      throw new Error('Cannot add to a disposed DisposableBag');
    }
    this.items.push(item);
    return item;
  }

  /**
   * Add an arbitrary cleanup function.
   * Useful for event listeners, subscriptions, timeouts, etc.
   */
  addFn(fn: () => void): void {
    this.add({ dispose: fn });
  }

  /** Dispose all collected resources in reverse order. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (let i = this.items.length - 1; i >= 0; i--) {
      try {
        this.items[i]!.dispose();
      } catch (err) {
        console.error('[DisposableBag] Error during disposal:', err);
      }
    }
    this.items.length = 0;
  }

  /** Number of tracked resources. */
  get size(): number {
    return this.items.length;
  }

  /** Whether the bag has already been disposed. */
  get isDisposed(): boolean {
    return this.disposed;
  }
}
