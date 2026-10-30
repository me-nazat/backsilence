/* ── PointerLock.ts ──────────────────────────────────────────────────────────
 *  Safe Pointer Lock wrapper utility.
 *  Guards against unhandled 'Pointer lock pending' and 'Pointer lock cannot be
 *  acquired immediately after the user has exited the lock' SecurityErrors,
 *  enforcing a ~1.35s browser cooldown, debouncing requests, and catching all
 *  Promise rejections so they never trigger error boundaries.
 * ──────────────────────────────────────────────────────────────────────── */

let isPointerLockPending = false;
let pendingTimeoutId: ReturnType<typeof setTimeout> | null = null;
let listenersInitialized = false;
let lastPointerLockExitTime = 0;
const POINTER_LOCK_COOLDOWN_MS = 1350;

function initPointerLockListeners(): void {
  if (listenersInitialized || typeof document === 'undefined') return;
  listenersInitialized = true;

  const onLockTransitionEnd = () => {
    isPointerLockPending = false;
    if (pendingTimeoutId !== null) {
      clearTimeout(pendingTimeoutId);
      pendingTimeoutId = null;
    }
    if (!document.pointerLockElement) {
      lastPointerLockExitTime = performance.now();
    }
  };

  document.addEventListener('pointerlockchange', onLockTransitionEnd);
  document.addEventListener('pointerlockerror', onLockTransitionEnd);
}

/**
 * Returns remaining cooldown in milliseconds before pointer lock can be acquired again.
 */
export function getPointerLockCooldownRemaining(): number {
  if (typeof performance === 'undefined') return 0;
  const elapsed = performance.now() - lastPointerLockExitTime;
  return Math.max(0, POINTER_LOCK_COOLDOWN_MS - elapsed);
}

/**
 * Safely request pointer lock on an element.
 *
 * @param element Target HTMLElement (typically the game canvas)
 * @param options Optional unadjustedMovement options
 * @param canLock Predicate checking if the app is in an active PLAYING state
 * @returns Promise<boolean> resolving to true if lock was initiated, false if skipped/denied
 */
export async function safeRequestPointerLock(
  element: HTMLElement | null | undefined,
  options?: { unadjustedMovement?: boolean },
  canLock?: () => boolean,
): Promise<boolean> {
  if (!element || typeof document === 'undefined') return false;

  initPointerLockListeners();

  // 1. Strictly block if a custom state validator reports non-playable
  if (canLock && !canLock()) {
    return false;
  }

  // 2. Check if already locked to this element
  if (document.pointerLockElement === element) {
    return true;
  }

  // 3. Debounce if a lock request is already pending
  if (isPointerLockPending) {
    return false;
  }

  // 4. Respect browser security cooldown window after Esc (~1.3s in Chromium)
  const cooldownRemaining = getPointerLockCooldownRemaining();
  if (cooldownRemaining > 0) {
    return false;
  }

  isPointerLockPending = true;
  if (pendingTimeoutId !== null) {
    clearTimeout(pendingTimeoutId);
  }
  // Safety timeout in case browser neither fires pointerlockchange nor pointerlockerror
  pendingTimeoutId = setTimeout(() => {
    isPointerLockPending = false;
    pendingTimeoutId = null;
  }, 600);

  try {
    const target = element as HTMLElement & {
      requestPointerLock?: (opts?: { unadjustedMovement?: boolean }) => Promise<void> | void;
    };

    if (typeof target.requestPointerLock !== 'function') {
      isPointerLockPending = false;
      return false;
    }

    let result: unknown;
    if (options?.unadjustedMovement) {
      try {
        result = target.requestPointerLock({ unadjustedMovement: true });
      } catch {
        // Fallback to standard requestPointerLock
        try {
          result = target.requestPointerLock();
        } catch {
          isPointerLockPending = false;
          return false;
        }
      }
    } else {
      result = target.requestPointerLock();
    }

    // Modern Chromium returns a Promise which rejects if cooldown or pending lock applies
    const promise = result as { catch?: (fn: () => void) => unknown } | null | undefined;
    if (promise && typeof promise.catch === 'function') {
      await (result as Promise<unknown>).catch(() => {
        // Silently swallow rejection so it NEVER bubbles to window.unhandledrejection
        isPointerLockPending = false;
      });
    }

    return true;
  } catch {
    isPointerLockPending = false;
    return false;
  }
}

/**
 * Safely exit pointer lock if currently locked.
 */
export function safeExitPointerLock(): void {
  if (typeof document === 'undefined' || !document.exitPointerLock) return;
  initPointerLockListeners();

  if (document.pointerLockElement) {
    lastPointerLockExitTime = performance.now();
    try {
      document.exitPointerLock();
    } catch {
      /* ignore */
    }
  }
  isPointerLockPending = false;
}

/**
 * Check if the pointer is currently locked to any element (or a specific element).
 */
export function isPointerLocked(element?: HTMLElement | null): boolean {
  if (typeof document === 'undefined') return false;
  if (element) {
    return document.pointerLockElement === element;
  }
  return document.pointerLockElement !== null && document.pointerLockElement !== undefined;
}
