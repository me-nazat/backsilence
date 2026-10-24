/* ── A11yAnnouncer.ts ───────────────────────────────────────────────────────
 *  Screen reader live region announcer for dynamic game events:
 *  Score updates, countdown ticks, toast alerts, and route changes.
 * ──────────────────────────────────────────────────────────────────────── */

export class A11yAnnouncer {
  private static instance: A11yAnnouncer | null = null;
  private politeRegion: HTMLElement | null = null;
  private assertiveRegion: HTMLElement | null = null;

  static getInstance(): A11yAnnouncer {
    if (!this.instance) {
      this.instance = new A11yAnnouncer();
    }
    return this.instance;
  }

  constructor() {
    this.initRegions();
  }

  private initRegions(): void {
    if (typeof document === 'undefined') return;

    this.politeRegion = document.getElementById('bs-live-region');
    if (!this.politeRegion) {
      this.politeRegion = document.createElement('div');
      this.politeRegion.id = 'bs-live-region';
      this.politeRegion.className = 'sr-only';
      this.politeRegion.setAttribute('role', 'status');
      this.politeRegion.setAttribute('aria-live', 'polite');
      this.politeRegion.setAttribute('aria-atomic', 'true');
      document.body?.appendChild(this.politeRegion);
    }

    this.assertiveRegion = document.getElementById('bs-alert-region');
    if (!this.assertiveRegion) {
      this.assertiveRegion = document.createElement('div');
      this.assertiveRegion.id = 'bs-alert-region';
      this.assertiveRegion.className = 'sr-only';
      this.assertiveRegion.setAttribute('role', 'alert');
      this.assertiveRegion.setAttribute('aria-live', 'assertive');
      this.assertiveRegion.setAttribute('aria-atomic', 'true');
      document.body?.appendChild(this.assertiveRegion);
    }
  }

  announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    const target = priority === 'assertive' ? this.assertiveRegion : this.politeRegion;
    if (!target) return;

    // Clear and set after tiny tick to ensure screen readers re-read identical messages
    target.textContent = '';
    setTimeout(() => {
      target.textContent = message;
    }, 20);
  }
}
