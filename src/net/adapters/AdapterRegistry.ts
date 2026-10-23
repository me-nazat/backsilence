/* ── AdapterRegistry.ts ───────────────────────────────────────────────────
 *  Pluggable registry for DatabaseNetworkAdapter implementations.
 *  Parses environment configuration (.env) and instantiates the chosen adapter.
 * ──────────────────────────────────────────────────────────────────────── */

import type { AdapterConfig, DatabaseNetworkAdapter } from '../../types/contracts.js';
import type { NetDeps } from '../NetDeps.js';
import { NullNetworkAdapter } from './NullNetworkAdapter.js';
import { LoopbackAdapter } from './LoopbackAdapter.js';
import { MemoryHub, MemoryHubAdapter } from './MemoryHubAdapter.js';
import { LocalTabAdapter } from './LocalTabAdapter.js';
import { SupabaseAdapter } from './SupabaseAdapter.js';
import { FirebaseAdapter } from './FirebaseAdapter.js';
import { TursoProxyAdapter } from './TursoProxyAdapter.js';
import { WebRtcDbAdapter } from './WebRtcDbAdapter.js';

export type AdapterFactory = (config: AdapterConfig, deps?: NetDeps) => DatabaseNetworkAdapter;

const factories = new Map<string, AdapterFactory>();
let defaultMemoryHub: MemoryHub | null = null;

export const AdapterRegistry = {
  register(provider: string, factory: AdapterFactory): void {
    factories.set(provider.toLowerCase(), factory);
  },

  create(config: AdapterConfig, deps?: NetDeps): DatabaseNetworkAdapter {
    const provider = config.provider.toLowerCase();
    const factory = factories.get(provider);

    if (!factory) {
      return new LoopbackAdapter();
    }

    return factory(config, deps);
  },

  resolveConfigFromEnv(): AdapterConfig {
    const env = typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env as unknown as Record<string, string | undefined>) : {};

    const rawProvider = env['VITE_NET_PROVIDER'] ?? 'loopback';
    let provider = rawProvider.toLowerCase() as AdapterConfig['provider'];
    if (!['null', 'loopback', 'memory', 'local-tab', 'supabase', 'firebase', 'turso', 'turso-proxy', 'webrtc-db'].includes(provider)) {
      provider = 'loopback';
    }

    const url =
      (typeof env['VITE_NET_URL'] === 'string' && env['VITE_NET_URL']) ||
      (typeof env['VITE_API_BASE'] === 'string' && env['VITE_API_BASE']) ||
      undefined;
    const key =
      (typeof env['VITE_NET_KEY'] === 'string' && env['VITE_NET_KEY']) ||
      undefined;
    const rawSignal = typeof env['VITE_NET_SIGNAL'] === 'string' ? env['VITE_NET_SIGNAL'] : 'supabase';
    const signalProvider = rawSignal === 'firebase' || rawSignal === 'turso' || rawSignal === 'turso-proxy' ? rawSignal : 'supabase';

    let iceServers: RTCIceServer[] | undefined;
    if (typeof env['VITE_NET_ICE'] === 'string') {
      try {
        iceServers = JSON.parse(env['VITE_NET_ICE']) as RTCIceServer[];
      } catch {
        // ignore
      }
    }

    return {
      provider,
      url,
      key,
      signalProvider,
      iceServers,
    };
  },

  getDefaultMemoryHub(): MemoryHub {
    if (!defaultMemoryHub) {
      defaultMemoryHub = new MemoryHub();
    }
    return defaultMemoryHub;
  },
};

// ── Built-in Registrations ──────────────────────────────────────────────
AdapterRegistry.register('null', () => new NullNetworkAdapter());
AdapterRegistry.register('loopback', () => new LoopbackAdapter());
AdapterRegistry.register('local-tab', () => new LocalTabAdapter());
AdapterRegistry.register('memory', (_config, _deps) => {
  const hub = AdapterRegistry.getDefaultMemoryHub();
  return new MemoryHubAdapter(hub, `peer-${Math.random().toString(36).slice(2, 7)}`);
});
AdapterRegistry.register('supabase', (_config, deps) => new SupabaseAdapter(deps));
AdapterRegistry.register('firebase', (_config, deps) => new FirebaseAdapter(deps));
AdapterRegistry.register('turso', (_config, deps) => new TursoProxyAdapter(deps));
AdapterRegistry.register('turso-proxy', (_config, deps) => new TursoProxyAdapter(deps));
AdapterRegistry.register('webrtc-db', (config, deps) => {
  const signal = config.signalProvider ?? 'supabase';
  let primary: DatabaseNetworkAdapter;
  if (signal === 'firebase') {
    primary = new FirebaseAdapter(deps);
  } else if (signal === 'turso' || signal === 'turso-proxy') {
    primary = new TursoProxyAdapter(deps);
  } else {
    primary = new SupabaseAdapter(deps);
  }
  return new WebRtcDbAdapter(primary, deps);
});

