/* ── OfflineQueue.ts ────────────────────────────────────────────────────────
 *  IndexedDB-backed queue for pending run submissions while offline.
 *  Automatically flushes and syncs runs to /api/run/submit when online.
 *  Idempotent by run_id: 409 Conflict is treated as already synchronized.
 * ──────────────────────────────────────────────────────────────────────── */

import { Identity } from './Identity.js';

export interface QueuedRunPayload {
  run_id: string;
  player_id: string;
  map_id: string;
  mode: string;
  difficulty: string;
  seed: number;
  mutators: string[];
  board: string;
  score: number;
  time_ms: number;
  noise_units: number;
  escaped: boolean;
  sim_version: string;
  sim_hash: string;
  replay?: string;
}

export interface QueuedRun {
  id: string; // run_id
  payload: QueuedRunPayload;
  enqueuedAt: number;
  attempts: number;
  lastError?: string;
}

const DB_NAME = 'backsilence_offline_runs';
const STORE_NAME = 'queue';
const DB_VERSION = 1;

// In-memory fallback for environments without IndexedDB (e.g. Node tests)
const memoryStore = new Map<string, QueuedRun>();

function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open OfflineQueue IndexedDB'));
  });
}

export const OfflineQueue = {
  async enqueue(payload: QueuedRunPayload): Promise<void> {
    const runId = payload.run_id ?? (payload as unknown as { runId: string }).runId ?? `run-${Date.now()}`;
    const pId = payload.player_id ?? (payload as unknown as { playerId: string }).playerId ?? '';
    const mId = payload.map_id ?? (payload as unknown as { mapId: string }).mapId ?? 'natatorium';
    const tMs = payload.time_ms ?? (payload as unknown as { timeMs: number }).timeMs ?? 60000;
    const nUnits = payload.noise_units ?? (payload as unknown as { noiseUnits: number }).noiseUnits ?? 0;
    const sVer = payload.sim_version ?? (payload as unknown as { simVersion: string }).simVersion ?? '1.0.0';
    const sHash = payload.sim_hash ?? (payload as unknown as { simHash: string }).simHash ?? 'hash';

    const normalized: QueuedRunPayload = {
      ...payload,
      run_id: runId,
      player_id: pId,
      map_id: mId,
      time_ms: tMs,
      noise_units: nUnits,
      sim_version: sVer,
      sim_hash: sHash,
    };

    const item: QueuedRun = {
      id: runId,
      payload: normalized,
      enqueuedAt: Date.now(),
      attempts: 0,
    };

    if (!hasIndexedDB()) {
      memoryStore.set(item.id, item);
      return;
    }

    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ? new Error(tx.error.message) : new Error('Put operation failed'));
      });
    } catch {
      memoryStore.set(item.id, item);
    }
  },

  async list(): Promise<QueuedRun[]> {
    if (!hasIndexedDB()) {
      return Array.from(memoryStore.values());
    }

    try {
      const db = await openDb();
      return await new Promise<QueuedRun[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result as QueuedRun[]);
        req.onerror = () => reject(req.error ? new Error(req.error.message) : new Error('GetAll operation failed'));
      });
    } catch {
      return Array.from(memoryStore.values());
    }
  },

  async remove(runId: string): Promise<void> {
    memoryStore.delete(runId);
    if (!hasIndexedDB()) return;

    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(runId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ? new Error(tx.error.message) : new Error('Delete operation failed'));
      });
    } catch {
      // ignore
    }
  },

  async count(): Promise<number> {
    const items = await this.list();
    return items.length;
  },

  async getPendingCount(): Promise<number> {
    return this.count();
  },

  async clear(): Promise<void> {
    memoryStore.clear();
    if (!hasIndexedDB()) return;
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ? new Error(tx.error.message) : new Error('Clear operation failed'));
      });
    } catch {
      // ignore
    }

  },

  async flush(apiBase = '/api'): Promise<{ synced: number; failed: number }> {
    const items = await this.list();
    let synced = 0;
    let failed = 0;

    for (const item of items) {
      try {
        const bodyStr = JSON.stringify(item.payload);
        let headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (Identity.isInitialized()) {
          try {
            const sigHeaders = await Identity.signRequest('POST', '/run/submit', bodyStr);
            headers = { ...headers, ...sigHeaders };
          } catch {
            headers['X-BS-Player'] = item.payload.player_id;
          }
        } else {
          headers['X-BS-Player'] = item.payload.player_id;
        }

        const res = await fetch(`${apiBase.replace(/\/$/, '')}/run/submit`, {
          method: 'POST',
          headers,
          body: bodyStr,
        });

        let finalOk = res.ok || res.status === 409;
        if (!finalOk && res.status === 404) {
          try {
            const pubkey = await Identity.exportPublicKeyJwk();
            await fetch(`${apiBase.replace(/\/$/, '')}/player/register`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pubkey, name: Identity.getProfile()?.name ?? 'Operator' }),
            });
            const retryRes = await fetch(`${apiBase.replace(/\/$/, '')}/run/submit`, {
              method: 'POST',
              headers,
              body: bodyStr,
            });
            finalOk = retryRes.ok || retryRes.status === 409;
          } catch {
            // ignore retry error
          }
        }

        // 200/201 success or 409 conflict (already submitted, idempotent)
        if (finalOk) {
          await this.remove(item.id);
          synced++;
        } else {
          item.attempts++;
          item.lastError = `HTTP ${res.status}`;
          failed++;
        }
      } catch (err) {
        item.attempts++;
        item.lastError = err instanceof Error ? err.message : String(err);
        failed++;
      }
    }

    return { synced, failed };
  },

  initAutoSync(apiBase = '/api'): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        void this.flush(apiBase);
      });
    }
  },
};
