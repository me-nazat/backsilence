/* ── TursoAdapter.ts ───────────────────────────────────────────────────────
 *  DEPRECATED / RETIRED: Direct browser-to-Turso connection is permanently retired
 *  to guarantee database credentials are never stored or handled in the browser.
 *  All Turso access is proxied through TursoProxyAdapter (/api/*).
 * ──────────────────────────────────────────────────────────────────────── */

export { TursoProxyAdapter as TursoAdapter } from './TursoProxyAdapter.js';
