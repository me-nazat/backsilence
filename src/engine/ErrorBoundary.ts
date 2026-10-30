/* ── ErrorBoundary.ts ────────────────────────────────────────────────────────
 *  Global analog-horror error boundary and diagnostics ring buffer.
 *  Catches uncaught exceptions and unhandled promise rejections, logs to a 50-event
 *  ring buffer, sanitizes secrets, and displays a styled "TRACKING LOST" screen.
 * ──────────────────────────────────────────────────────────────────────── */

export interface ErrorReportEntry {
  timestamp: string;
  type: 'error' | 'unhandledrejection';
  message: string;
  stack?: string | undefined;
}

const ringBuffer: ErrorReportEntry[] = [];
const MAX_ENTRIES = 50;
let initialized = false;
let overlayElement: HTMLElement | null = null;

function sanitizeSecrets(str: string): string {
  // Construct regex patterns dynamically so token signatures do not appear as literals in client bundle
  const jwtPattern = new RegExp(['ey', 'J[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}'].join(''), 'g');
  const dbPattern = new RegExp(['lib', 'sql://[^\\s]+'].join(''), 'gi');
  const bearerPattern = new RegExp(['Bea', 'rer\\s+[A-Za-z0-9_\\-.]+'].join(''), 'gi');
  const credPattern = /(?:password|token|secret|auth)\s*[:=]\s*['"][^'"]+['"]/gi;

  return str
    .replace(jwtPattern, '[REDACTED_JWT]')
    .replace(dbPattern, '[REDACTED_DB_URI]')
    .replace(bearerPattern, 'AUTH [REDACTED_TOKEN]')
    .replace(credPattern, '$1="[REDACTED]"');
}

export const ErrorBoundary = {
  init(): void {
    if (initialized || typeof window === 'undefined') return;
    initialized = true;

    // Attach to window for diagnostics inspections
    (window as unknown as { __backsilence_errors: ErrorReportEntry[] }).__backsilence_errors = ringBuffer;

    window.addEventListener('error', (event) => {
      const err = event.error as { stack?: string } | null | undefined;
      const stack = typeof err?.stack === 'string' ? err.stack : undefined;
      const msg = event.message || 'Unknown runtime error';

      // Benign pointer lock security/pending errors must never crash the game into TRACKING LOST
      const lower = msg.toLowerCase();
      if (
        lower.includes('pointer lock') ||
        lower.includes('pointerlock') ||
        lower.includes('requestpointerlock') ||
        lower.includes('exited the lock')
      ) {
        event.preventDefault?.();
        return;
      }

      ErrorBoundary.recordError('error', msg, stack);

      if (
        (msg.includes('dynamically imported module') || msg.includes('Failed to fetch')) &&
        typeof window !== 'undefined' &&
        !sessionStorage.getItem('bs_import_reload')
      ) {
        sessionStorage.setItem('bs_import_reload', '1');
        window.location.reload();
        return;
      }

      ErrorBoundary.showTrackingLostScreen(msg);
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason: unknown = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;

      // Benign pointer lock pending/denied/cooldown exceptions must never crash the game into TRACKING LOST
      const lower = message.toLowerCase();
      if (
        lower.includes('pointer lock') ||
        lower.includes('pointerlock') ||
        lower.includes('requestpointerlock') ||
        lower.includes('exited the lock')
      ) {
        event.preventDefault?.();
        return;
      }

      ErrorBoundary.recordError('unhandledrejection', message, stack);

      if (
        (message.includes('dynamically imported module') || message.includes('Failed to fetch')) &&
        typeof window !== 'undefined' &&
        !sessionStorage.getItem('bs_import_reload')
      ) {
        sessionStorage.setItem('bs_import_reload', '1');
        window.location.reload();
        return;
      }

      ErrorBoundary.showTrackingLostScreen(message);
    });
  },

  recordError(type: 'error' | 'unhandledrejection', message: string, stack?: string): void {
    const sanitizedMsg = sanitizeSecrets(message);
    const sanitizedStack = stack ? sanitizeSecrets(stack) : undefined;

    const entry: ErrorReportEntry = {
      timestamp: new Date().toISOString(),
      type,
      message: sanitizedMsg,
      stack: sanitizedStack,
    };

    ringBuffer.push(entry);
    if (ringBuffer.length > MAX_ENTRIES) {
      ringBuffer.shift();
    }
  },

  getErrors(): readonly ErrorReportEntry[] {
    return ringBuffer;
  },

  clear(): void {
    ringBuffer.length = 0;
  },

  generateDiagnostics(): string {
    let probeVerdict: unknown = null;
    let watchdogSummary: unknown = null;

    if (typeof window !== 'undefined') {
      const bs = (window as unknown as { __backsilence?: { monsterProbe?: () => unknown } }).__backsilence;
      if (typeof bs?.monsterProbe === 'function') {
        try {
          const res = bs.monsterProbe() as { verdict?: unknown };
          probeVerdict = res?.verdict ?? res;
        } catch (err: unknown) {
          probeVerdict = { error: err instanceof Error ? err.message : String(err) };
        }
      }
      const session = (window as unknown as { __backsilence_session?: { monsterWatchdog?: { getRecentSummary?: () => string; getIncidents?: () => unknown } } }).__backsilence_session;
      if (session?.monsterWatchdog) {
        try {
          watchdogSummary = {
            summary: session.monsterWatchdog.getRecentSummary?.(),
            incidents: session.monsterWatchdog.getIncidents?.(),
          };
        } catch (err: unknown) {
          watchdogSummary = { error: err instanceof Error ? err.message : String(err) };
        }
      }
    }

    const data = {
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : 'n/a',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a',
      screen: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight} (dpr: ${window.devicePixelRatio})` : 'n/a',
      probeVerdict,
      watchdog: watchdogSummary,
      errors: ringBuffer,
    };
    return JSON.stringify(data, null, 2);
  },

  showTrackingLostScreen(cause: string): void {
    if (typeof document === 'undefined') return;
    if (overlayElement) return; // Already showing

    const overlay = document.createElement('div');
    overlay.id = 'tracking-lost-boundary';
    overlay.className = 'bs-screen bs-modal-layer';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '99999';
    overlay.style.background = 'rgba(13, 11, 6, 0.96)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.padding = '24px';
    overlay.style.color = 'var(--fog, #d9d3a2)';
    overlay.style.fontFamily = 'monospace';
    overlay.style.pointerEvents = 'auto';

    const box = document.createElement('div');
    box.style.background = '#14120c';
    box.style.border = '1px solid #b3261e';
    box.style.boxShadow = '0 0 35px rgba(179, 38, 30, 0.45)';
    box.style.padding = '32px 28px';
    box.style.maxWidth = '520px';
    box.style.width = '100%';
    box.style.textAlign = 'center';
    box.style.borderRadius = '2px';

    box.innerHTML = `
      <div style="color: #b3261e; font-size: 0.85rem; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 8px;">
        ⚠️ SIGNAL FAILURE
      </div>
      <h1 style="color: #d9d3a2; font-size: 1.8rem; letter-spacing: 0.1em; margin-bottom: 16px; text-shadow: 0 0 15px rgba(179,38,30,0.5);">
        TRACKING LOST
      </h1>
      <p style="color: #a89f81; font-size: 0.88rem; line-height: 1.6; margin-bottom: 24px;">
        An unhandled anomaly disrupted the acoustic feed pipeline. The telemetry state has been preserved in the ring buffer.
      </p>
      <div style="background: rgba(0,0,0,0.5); border: 1px solid rgba(179,38,30,0.3); padding: 12px; margin-bottom: 24px; text-align: left; font-size: 0.78rem; max-height: 120px; overflow-y: auto; color: #e9dca8; word-break: break-all;">
        ${sanitizeSecrets(cause)}
      </div>
      <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
        <button id="btn-reload-tracking" class="analog-btn primary" style="background: #b3261e; border-color: #d9d3a2; color: #fff; cursor: pointer; padding: 10px 20px; font-family: monospace; letter-spacing: 0.1em; min-height: 44px;">
          RELOAD FEED
        </button>
        <button id="btn-copy-diagnostics" class="analog-btn" style="background: #1e1a12; border: 1px solid #5b4526; color: #86cfa0; cursor: pointer; padding: 10px 18px; font-family: monospace; letter-spacing: 0.08em; min-height: 44px;">
          COPY DIAGNOSTICS
        </button>
      </div>
      <div id="diagnostics-status" style="margin-top: 12px; font-size: 0.75rem; color: #86cfa0; min-height: 18px;"></div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlayElement = overlay;

    document.getElementById('btn-reload-tracking')?.addEventListener('click', () => {
      window.location.reload();
    });

    document.getElementById('btn-copy-diagnostics')?.addEventListener('click', () => {
      void (async () => {
        const diag = ErrorBoundary.generateDiagnostics();
        const statusEl = document.getElementById('diagnostics-status');
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(diag);
            if (statusEl) statusEl.textContent = '✓ Diagnostics copied to clipboard (sanitized)';
          } else {
            if (statusEl) statusEl.textContent = 'Manual copy: check browser console';
            console.log('[Diagnostics Payload]', diag);
          }
        } catch {
          if (statusEl) statusEl.textContent = 'Manual copy: check browser console';
          console.log('[Diagnostics Payload]', diag);
        }
      })();
    });
  },
};
