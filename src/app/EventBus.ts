/* ── EventBus.ts ──────────────────────────────────────────────────────────
 *  Typed publish/subscribe event bus. Systems communicate through this
 *  rather than importing each other's internals.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Unsubscribe } from '../types/contracts.js';

/** Map of event name → payload type. Extend via declaration merging. */
export interface EventMap {
  'app:state': { from: string; to: string };
  'app:ready': undefined;
  'app:error': { message: string; fatal: boolean };
  'settings:changed': { key: string };
}

type Handler<T> = (payload: T) => void;

/**
 * A lightweight, synchronous, typed event bus.
 *
 * Usage:
 * ```ts
 * const bus = createEventBus();
 * const unsub = bus.on('app:state', (e) => console.log(e.to));
 * bus.emit('app:state', { from: 'BOOT', to: 'MENU' });
 * unsub();
 * ```
 */
export interface EventBus {
  on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): Unsubscribe;
  once<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): Unsubscribe;
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void;
  off<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): void;
  clear(): void;
}

export function createEventBus(): EventBus {
  const listeners = new Map<string, Set<Handler<never>>>();

  function getSet(event: string): Set<Handler<never>> {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    return set;
  }

  const bus: EventBus = {
    on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): Unsubscribe {
      const set = getSet(event as string);
      set.add(handler as Handler<never>);
      return () => {
        set.delete(handler as Handler<never>);
      };
    },

    once<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): Unsubscribe {
      const wrapper = ((payload: EventMap[K]) => {
        unsub();
        handler(payload);
      }) as Handler<never>;
      const set = getSet(event as string);
      set.add(wrapper);
      const unsub = () => {
        set.delete(wrapper);
      };
      return unsub;
    },

    emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
      const set = listeners.get(event as string);
      if (!set) return;
      for (const handler of set) {
        (handler as Handler<EventMap[K]>)(payload);
      }
    },

    off<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): void {
      const set = listeners.get(event as string);
      if (set) {
        set.delete(handler as Handler<never>);
      }
    },

    clear(): void {
      listeners.clear();
    },
  };

  return bus;
}
