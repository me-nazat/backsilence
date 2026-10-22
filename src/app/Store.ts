/* ── Store.ts ─────────────────────────────────────────────────────────────
 *  Typed observable store. Holds settings, session state, and ephemeral
 *  UI state. No framework — just get/set/subscribe/select.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Unsubscribe, Settings, MapId, QualityTier } from '../types/contracts.js';

export interface SessionState {
  mode: 'single' | 'multi';
  mapId: MapId;
  seed: number;
  room: string | null;
}

export interface UIState {
  showFps: boolean;
  debugMode: boolean;
  labMode: boolean;
}

export interface StoreState {
  settings: Settings;
  session: SessionState;
  ui: UIState;
}

type StoreListener = (state: StoreState) => void;
type Selector<T> = (state: StoreState) => T;

export interface Store {
  get(): StoreState;
  get<K extends keyof StoreState>(key: K): StoreState[K];
  set<K extends keyof StoreState>(key: K, value: StoreState[K]): void;
  subscribe(listener: StoreListener): Unsubscribe;
  select<T>(selector: Selector<T>, listener: (value: T) => void): Unsubscribe;
}

export function createStore(initial: StoreState): Store {
  let state = { ...initial };
  const listeners = new Set<StoreListener>();

  function notify(): void {
    for (const listener of listeners) {
      listener(state);
    }
  }

  const store: Store = {
    get<K extends keyof StoreState>(key?: K): StoreState | StoreState[K] {
      if (key === undefined) return state;
      return state[key];
    },

    set<K extends keyof StoreState>(key: K, value: StoreState[K]): void {
      state = { ...state, [key]: value };
      notify();
    },

    subscribe(listener: StoreListener): Unsubscribe {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    select<T>(selector: Selector<T>, listener: (value: T) => void): Unsubscribe {
      let prev = selector(state);
      return store.subscribe((s) => {
        const next = selector(s);
        if (next !== prev) {
          prev = next;
          listener(next);
        }
      });
    },
  } as Store;

  return store;
}

/** Default quality for initial settings. */
export const DEFAULT_QUALITY: QualityTier = 'auto';
