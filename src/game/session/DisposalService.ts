/* ── DisposalService.ts ───────────────────────────────────────────────────
 *  Centralized resource lifecycle & disposal manager for BackSilence sessions.
 *  Enforces the Disposal Law:
 *  - 0 leaked WebGL contexts across sequential sessions.
 *  - 0 leaked canvas elements in DOM.
 *  - 0 leaked event listeners (window, document, canvas).
 *  - 0 dangling rAF handles or timeouts.
 *  - Deterministic reverse-order destruction with per-owner audit logging.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Object3D, Mesh, Material, Texture, WebGLRenderTarget } from 'three';
import type { Disposable } from '../../engine/Disposal.js';

export interface TrackedListener {
  target: EventTarget;
  type: string;
  handler: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions | undefined;
  owner: string;
}

export interface AllocationAuditEntry {
  owner: string;
  kind: 'disposable' | 'listener' | 'timeout' | 'interval' | 'raf' | 'three_object' | 'dom_element';
  detail: string;
  timestamp: number;
}

export class DisposalService {
  private isDisposed = false;
  private readonly disposables: Array<{ item: Disposable; owner: string }> = [];
  private readonly listeners: TrackedListener[] = [];
  private readonly timeouts = new Set<ReturnType<typeof setTimeout>>();
  private readonly intervals = new Set<ReturnType<typeof setInterval>>();
  private readonly rafHandles = new Set<number>();
  private readonly domElements = new Set<HTMLElement>();
  private readonly auditLog: AllocationAuditEntry[] = [];

  // ── Tracking Registration ─────────────────────────────────────────────────

  track<T extends Disposable>(item: T, owner = 'unknown', detail = ''): T {
    if (this.isDisposed) {
      console.warn(`[DisposalService] Cannot track resource after disposal (owner: ${owner})`);
      try {
        item.dispose();
      } catch {
        /* ignore */
      }
      return item;
    }
    this.disposables.push({ item, owner });
    this.auditLog.push({ owner, kind: 'disposable', detail, timestamp: Date.now() });
    return item;
  }

  trackFn(fn: () => void, owner = 'unknown', detail = ''): void {
    this.track({ dispose: fn }, owner, detail);
  }

  trackEventListener(
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
    owner = 'unknown',
  ): void {
    if (this.isDisposed) return;
    target.addEventListener(type, handler, options);
    this.listeners.push({ target, type, handler, options, owner });
    this.auditLog.push({ owner, kind: 'listener', detail: type, timestamp: Date.now() });
  }

  setTimeout(fn: () => void, ms: number, owner = 'unknown'): ReturnType<typeof setTimeout> {
    const handle = setTimeout(() => {
      this.timeouts.delete(handle);
      fn();
    }, ms);
    this.timeouts.add(handle);
    this.auditLog.push({ owner, kind: 'timeout', detail: `${ms}ms`, timestamp: Date.now() });
    return handle;
  }

  clearTimeout(handle: ReturnType<typeof setTimeout>): void {
    clearTimeout(handle);
    this.timeouts.delete(handle);
  }

  setInterval(fn: () => void, ms: number, owner = 'unknown'): ReturnType<typeof setInterval> {
    const handle = setInterval(fn, ms);
    this.intervals.add(handle);
    this.auditLog.push({ owner, kind: 'interval', detail: `${ms}ms`, timestamp: Date.now() });
    return handle;
  }

  clearInterval(handle: ReturnType<typeof setInterval>): void {
    clearInterval(handle);
    this.intervals.delete(handle);
  }

  requestAnimationFrame(fn: FrameRequestCallback, owner = 'unknown'): number {
    const handle = requestAnimationFrame((t) => {
      this.rafHandles.delete(handle);
      fn(t);
    });
    this.rafHandles.add(handle);
    this.auditLog.push({ owner, kind: 'raf', detail: `handle_${handle}`, timestamp: Date.now() });
    return handle;
  }

  cancelAnimationFrame(handle: number): void {
    cancelAnimationFrame(handle);
    this.rafHandles.delete(handle);
  }

  trackDomElement(element: HTMLElement, owner = 'unknown'): HTMLElement {
    this.domElements.add(element);
    this.auditLog.push({ owner, kind: 'dom_element', detail: element.tagName, timestamp: Date.now() });
    return element;
  }

  // ── Three.js Deep Teardown Helper ─────────────────────────────────────────

  disposeThreeHierarchy(root: Object3D, owner = 'three'): void {
    root.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          for (const mat of mesh.material) {
            this.disposeMaterial(mat);
          }
        } else {
          this.disposeMaterial(mesh.material);
        }
      }
    });
    this.auditLog.push({ owner, kind: 'three_object', detail: root.name || 'unnamed_root', timestamp: Date.now() });
  }

  private disposeMaterial(mat: Material): void {
    // Dispose any attached textures
    const record = mat as unknown as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const val = record[key];
      if (val && typeof val === 'object' && 'isTexture' in val && typeof (val as Texture).dispose === 'function') {
        (val as Texture).dispose();
      }
    }
    mat.dispose();
  }

  disposeRenderTarget(target: WebGLRenderTarget, owner = 'renderer'): void {
    if (target.texture) target.texture.dispose();
    if (target.depthTexture) target.depthTexture.dispose();
    target.dispose();
    this.auditLog.push({ owner, kind: 'disposable', detail: 'WebGLRenderTarget', timestamp: Date.now() });
  }

  // ── Full Teardown Execution ───────────────────────────────────────────────

  disposeAll(reason = 'session_end'): { disposedCount: number; errors: string[] } {
    if (this.isDisposed) {
      return { disposedCount: 0, errors: [] };
    }
    this.isDisposed = true;

    const errors: string[] = [];
    let count = 0;

    // 1. Cancel all timers & animation frame requests
    for (const timeout of this.timeouts) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();

    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();

    for (const raf of this.rafHandles) {
      cancelAnimationFrame(raf);
    }
    this.rafHandles.clear();

    // 2. Remove all tracked event listeners
    for (let i = this.listeners.length - 1; i >= 0; i--) {
      const l = this.listeners[i]!;
      try {
        l.target.removeEventListener(l.type, l.handler, l.options);
        count++;
      } catch (err) {
        errors.push(`Failed to remove listener '${l.type}' (owner: ${l.owner}): ${String(err)}`);
      }
    }
    this.listeners.length = 0;

    // 3. Remove all tracked DOM elements
    for (const el of this.domElements) {
      try {
        if (el.parentNode) {
          el.remove();
          count++;
        }
      } catch (err) {
        errors.push(`Failed to remove DOM element: ${String(err)}`);
      }
    }
    this.domElements.clear();

    // 4. Dispose registered disposable subsystems in reverse order
    for (let i = this.disposables.length - 1; i >= 0; i--) {
      const entry = this.disposables[i]!;
      try {
        entry.item.dispose();
        count++;
      } catch (err) {
        errors.push(`Error disposing item (owner: ${entry.owner}): ${String(err)}`);
      }
    }
    this.disposables.length = 0;

    if (typeof window !== 'undefined') {
      (window as unknown as { __backsilence_disposal_last_report?: unknown }).__backsilence_disposal_last_report = {
        reason,
        disposedCount: count,
        errors,
        auditLogLength: this.auditLog.length,
      };
    }

    return { disposedCount: count, errors };
  }

  get isTerminated(): boolean {
    return this.isDisposed;
  }

  get activeListenerCount(): number {
    return this.listeners.length;
  }

  get activeTimerCount(): number {
    return this.timeouts.size + this.intervals.size + this.rafHandles.size;
  }

  getAllocationAudit(): AllocationAuditEntry[] {
    return [...this.auditLog];
  }
}
