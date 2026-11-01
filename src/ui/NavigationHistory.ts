/* ── NavigationHistory.ts ──────────────────────────────────────────────────
 *  SPA History Guard & State Router for BackSilence.
 *  Maintains an internal History API stack with sentinel floor protection so
 *  pressing browser Back (1x, 2x, 5x) navigates cleanly inside the app and
 *  never abruptly leaves to the Google New Tab page.
 * ──────────────────────────────────────────────────────────────────────── */

import type { UIState } from './UIManager.js';

export interface NavigationHistoryEntry {
  uiState: UIState;
  sentinel?: boolean;
  modalId?: string;
  modeId?: string;
  mapId?: string;
  view?: string;
  [key: string]: unknown;
}

export type NavigationStateCallback = (state: UIState, entry?: NavigationHistoryEntry) => void;

const getWin = (): Window | undefined =>
  typeof window !== 'undefined' ? window : ((globalThis as unknown as { window?: Window }).window ?? (globalThis as unknown as Window));

let isInitialized = false;
let navigationCallback: NavigationStateCallback | null = null;

/**
 * Initialize SPA History Guard.
 * Seeds a base sentinel entry and a MAIN_MENU entry in window.history.
 */
export function initNavigationHistory(onNavigateState: NavigationStateCallback): void {
  const win = getWin();
  if (!win || !win.history) return;

  navigationCallback = onNavigateState;
  if (isInitialized) return;
  isInitialized = true;

  const pathname = win.location.pathname || '/';

  // Push a sentinel floor entry + MAIN_MENU entry so double-back stays inside the app
  try {
    win.history.replaceState({ uiState: 'MAIN_MENU', sentinel: true }, '', pathname);
    win.history.pushState({ uiState: 'MAIN_MENU' }, '', pathname);
  } catch {
    /* ignore sandbox or quota exceptions */
  }

  win.addEventListener('popstate', (event: Event) => {
    const popEvent = event as PopStateEvent;
    const entry = popEvent.state as NavigationHistoryEntry | null;
    const targetState: UIState = entry?.uiState || 'MAIN_MENU';

    // If the user hit back all the way to the sentinel floor, re-push MAIN_MENU
    // so pressing Back 2x, 3x, or 5x NEVER exits to the Google New Tab page!
    if (!entry || entry.sentinel || targetState === 'MAIN_MENU') {
      try {
        win.history.pushState({ uiState: 'MAIN_MENU' }, '', win.location.pathname || '/');
      } catch {
        /* ignore */
      }
      if (navigationCallback) {
        navigationCallback('MAIN_MENU', entry ?? undefined);
      }
      return;
    }

    if (navigationCallback) {
      navigationCallback(targetState, entry);
    }
  });
}

/**
 * Push an explicit UI state transition to the History API.
 */
export function pushNavigationState(state: UIState, extra?: Record<string, unknown>, url?: string): void {
  const win = getWin();
  if (!win || !win.history) return;
  try {
    const targetUrl = url ?? win.location.pathname ?? '/';
    win.history.pushState({ uiState: state, ...extra }, '', targetUrl);
  } catch {
    /* ignore */
  }
}

/**
 * Replace the current History API state.
 */
export function replaceNavigationState(state: UIState, extra?: Record<string, unknown>, url?: string): void {
  const win = getWin();
  if (!win || !win.history) return;
  try {
    const targetUrl = url ?? win.location.pathname ?? '/';
    win.history.replaceState({ uiState: state, ...extra }, '', targetUrl);
  } catch {
    /* ignore */
  }
}

/**
 * Reset navigation history (useful for test isolation).
 */
export function resetNavigationHistory(): void {
  isInitialized = false;
  navigationCallback = null;
}
