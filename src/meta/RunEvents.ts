/* ── RunEvents.ts ──────────────────────────────────────────────────────────
 *  Pure, typed event bus and history tracker for in-run gameplay milestones.
 *  Feeds Scoring, Missions, Achievements, Death Replay Line, and Ghost recorders.
 *  Zero Three.js or DOM dependencies.
 * ──────────────────────────────────────────────────────────────────────── */

import type { Vec3 } from '../types/contracts.js';

export interface NoiseMadeEvent {
  type: 'noise_made';
  kind: string;
  position: Vec3;
  loudness: number;
  audibleToMonster: boolean;
  t: number;
}

export interface JumpCleanEvent {
  type: 'jump_clean';
  distance: number;
  dryToDry: boolean;
  t: number;
}

export interface LureSuccessEvent {
  type: 'lure_success';
  item: 'pebble' | 'bottle' | 'noisemaker' | 'echo_bell';
  monsterId: string;
  distractedDistance: number;
  t: number;
}

export interface LurkSurvivedEvent {
  type: 'lurk_survived';
  duration: number;
  distance: number;
  t: number;
}

export interface NearMissEvent {
  type: 'near_miss';
  distance: number;
  speed: number;
  t: number;
}

export interface ObjectiveDoneEvent {
  type: 'objective_done';
  id: string;
  kind: 'primary' | 'secondary' | 'hidden';
  t: number;
}

export interface ItemUsedEvent {
  type: 'item_used';
  item: string;
  position: Vec3;
  t: number;
}

export interface DeathEvent {
  type: 'death';
  killer: string;
  cause: string;
  lastNoise?: {
    kind: string;
    loudness: number;
    t: number;
  };
  t: number;
}

export interface EscapeEvent {
  type: 'escape';
  t: number;
  finalScore?: number;
}

export interface HauntEvent {
  type: 'haunt';
  haunterId: string;
  position: Vec3;
  loudness: number;
  t: number;
}

export interface RescueEvent {
  type: 'rescue';
  rescuerId: string;
  rescuedId: string;
  terminalPosition: Vec3;
  t: number;
}

export type RunEvent =
  | NoiseMadeEvent
  | JumpCleanEvent
  | LureSuccessEvent
  | LurkSurvivedEvent
  | NearMissEvent
  | ObjectiveDoneEvent
  | ItemUsedEvent
  | DeathEvent
  | EscapeEvent
  | HauntEvent
  | RescueEvent;

export type RunEventType = RunEvent['type'];

export type RunEventListener<T extends RunEvent = RunEvent> = (event: T) => void;

export class RunEventBus {
  private listeners = new Map<RunEventType, Set<RunEventListener>>();
  private allListeners = new Set<RunEventListener>();
  private history: RunEvent[] = [];

  on<T extends RunEvent>(type: T['type'], listener: RunEventListener<T>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    const rawListener = listener as unknown as RunEventListener;
    set.add(rawListener);
    return () => {
      set?.delete(rawListener);
    };
  }

  onAny(listener: RunEventListener): () => void {
    this.allListeners.add(listener);
    return () => {
      this.allListeners.delete(listener);
    };
  }

  emit(event: RunEvent): void {
    this.history.push(event);

    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        listener(event);
      }
    }

    for (const listener of this.allListeners) {
      listener(event);
    }
  }

  getHistory(): readonly RunEvent[] {
    return this.history;
  }

  getEventsOfType<T extends RunEvent>(type: T['type']): T[] {
    return this.history.filter((e): e is T => e.type === type);
  }

  clear(): void {
    this.history = [];
  }
}
