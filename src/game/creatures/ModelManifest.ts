/* ── ModelManifest.ts ──────────────────────────────────────────────────────
 *  Runtime detection and metadata manifest for creature 3D binary models.
 *  Handles lazy-loading, cached detection, and procedural fallback signaling.
 * ──────────────────────────────────────────────────────────────────────── */

export interface ModelEntry {
  present: boolean;
  path: string;
  triangles: number;
  bytes: number;
}

export interface CreatureManifest {
  version: number;
  updatedAt: string;
  models: {
    thumper: ModelEntry;
    skull_lod0: ModelEntry;
    skull_lod1: ModelEntry;
  };
}

const defaultManifest: CreatureManifest = {
  version: 1,
  updatedAt: '2026-10-23T00:00:00.000Z',
  models: {
    thumper: { present: false, path: 'models/thumper.glb', triangles: 0, bytes: 0 },
    skull_lod0: { present: false, path: 'models/skull_lod0.glb', triangles: 0, bytes: 0 },
    skull_lod1: { present: false, path: 'models/skull_lod1.glb', triangles: 0, bytes: 0 },
  },
};

let cachedManifest: CreatureManifest | null = null;

export async function getCreatureManifest(): Promise<CreatureManifest> {
  if (cachedManifest) return cachedManifest;

  if (typeof window === 'undefined') {
    cachedManifest = defaultManifest;
    return cachedManifest;
  }

  try {
    const res = await fetch('models/manifest.json');
    if (res.ok) {
      cachedManifest = (await res.json()) as CreatureManifest;
      return cachedManifest;
    }
  } catch {
    // manifest.json not found
  }

  // Probe thumper.glb via HEAD request
  try {
    const headRes = await fetch('models/thumper.glb', { method: 'HEAD' });
    if (headRes.ok) {
      const copy = JSON.parse(JSON.stringify(defaultManifest)) as CreatureManifest;
      copy.models.thumper.present = true;
      cachedManifest = copy;
      return cachedManifest;
    }
  } catch {
    // thumper.glb not present
  }

  cachedManifest = defaultManifest;
  return cachedManifest;
}

export function isModelAvailable(modelName: 'thumper' | 'skull_lod0' | 'skull_lod1'): boolean {
  if (!cachedManifest) return false;
  return cachedManifest.models[modelName]?.present ?? false;
}
