/* ── UiLabPage.ts ─────────────────────────────────────────────────────────
 *  Living UI Kit Lab: mounts at ?lab=ui or ?v=ui.
 *  Renders every component in every state:
 *  default, hover, focus, active, disabled, loading, error.
 * ──────────────────────────────────────────────────────────────────────── */

import {
  Button,
  TapeCard,
  MapCard,
  Tabs,
  Toggle,
  Slider,
  Select,
  Modal,
  Drawer,
  Toast,
  Tooltip,
  ProgressBar,
  RosterChip,
  LeaderboardRow,
  RankBadge,
  StatTile,
  AchievementCard,
  CosmeticTile,
  KeyCap,
  Skeleton,
  EmptyState,
  ErrorState,
  Banner,
  Stepper,
  Accordion,
} from './index.js';

export class UiLabPage {
  readonly element: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'bs-root bs-screen';
    this.element.style.padding = '32px 24px';
    this.element.style.maxWidth = '1200px';
    this.element.style.margin = '0 auto';
    this.element.style.overflowY = 'auto';
    this.element.style.height = '100vh';

    this.render();
  }

  private render(): void {
    this.element.innerHTML = `
      <div style="border-bottom: 2px solid var(--bs-border-strong); padding-bottom: 16px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <h1 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-2xl); color: var(--bs-cream); letter-spacing: 0.1em; text-transform: uppercase;">
            ARCHIVE UI LAB // ?lab=ui
          </h1>
          <div class="bs-osd-readout" style="font-size: var(--bs-text-xs);">LIVING SPECIFICATION</div>
        </div>
        <p style="font-size: var(--bs-text-sm); opacity: 0.8; margin-top: 8px;">
          Tactile found-footage analog horror component library with 0 runtime animation libraries.
        </p>
      </div>

      <div id="lab-controls" style="display: flex; gap: 12px; margin-bottom: 32px; flex-wrap: wrap;"></div>

      <section id="sec-buttons" class="lab-section"></section>
      <section id="sec-cards" class="lab-section" style="margin-top: 36px;"></section>
      <section id="sec-inputs" class="lab-section" style="margin-top: 36px;"></section>
      <section id="sec-indicators" class="lab-section" style="margin-top: 36px;"></section>
      <section id="sec-social" class="lab-section" style="margin-top: 36px;"></section>
      <section id="sec-overlays" class="lab-section" style="margin-top: 36px;"></section>
      <section id="sec-structural" class="lab-section" style="margin-top: 36px; margin-bottom: 48px;"></section>
    `;

    this.mountControls();
    this.mountButtons();
    this.mountCards();
    this.mountInputs();
    this.mountIndicators();
    this.mountSocial();
    this.mountOverlays();
    this.mountStructural();
  }

  private mountControls(): void {
    const controls = this.element.querySelector('#lab-controls')!;

    // High contrast toggle
    const hcToggle = new Toggle({
      label: 'HIGH CONTRAST (WCAG AAA)',
      checked: document.documentElement.classList.contains('high-contrast'),
      onChange: (checked) => {
        if (checked) {
          document.documentElement.classList.add('high-contrast');
          document.documentElement.setAttribute('data-contrast', 'high');
        } else {
          document.documentElement.classList.remove('high-contrast');
          document.documentElement.removeAttribute('data-contrast');
        }
      },
    });
    controls.appendChild(hcToggle.element);

    // Toast trigger
    const toastBtn = new Button({
      text: 'SPAWN TOAST',
      variant: 'ghost',
      onClick: () => {
        Toast.show('Water anomaly detected in Sector B.', 'warning');
      },
    });
    controls.appendChild(toastBtn.element);
  }

  private mountButtons(): void {
    const sec = this.element.querySelector('#sec-buttons')!;
    sec.innerHTML = `
      <h2 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-lg); color: var(--bs-tan); margin-bottom: 16px; border-bottom: 1px solid var(--bs-border);">
        1. BUTTONS & STATES
      </h2>
      <div id="btn-grid" style="display: flex; gap: 16px; flex-wrap: wrap; align-items: center;"></div>
    `;

    const grid = sec.querySelector('#btn-grid')!;

    grid.appendChild(new Button({ text: 'Primary Normal', variant: 'primary' }).element);
    const ghostBtn = new Button({ text: 'Ghost Normal', variant: 'ghost' });
    Tooltip.attach(ghostBtn.element, 'Tactile ghost button variant with zero layout shift');
    grid.appendChild(ghostBtn.element);
    grid.appendChild(new Button({ text: 'Danger Normal', variant: 'danger' }).element);
    grid.appendChild(new Button({ text: 'Primary Disabled', variant: 'primary', disabled: true }).element);
    grid.appendChild(new Button({ text: 'Loading State', variant: 'primary', loading: true }).element);
    grid.appendChild(
      new Button({
        text: 'Hold to Confirm (1.5s)',
        variant: 'danger',
        holdSeconds: 1.5,
        onHoldComplete: () => Toast.show('Confirmed action performed!', 'success'),
      }).element,
    );
  }

  private mountCards(): void {
    const sec = this.element.querySelector('#sec-cards')!;
    sec.innerHTML = `
      <h2 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-lg); color: var(--bs-tan); margin-bottom: 16px; border-bottom: 1px solid var(--bs-border);">
        2. TAPE & MAP CARDS (3D TILT & MINI-CANVAS)
      </h2>
      <div id="card-grid" style="display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start;"></div>
    `;

    const grid = sec.querySelector('#card-grid')!;

    // Tape Cards
    const tape1 = new TapeCard({
      id: 'tape-01',
      tapeNumber: 1,
      title: 'THE NATATORIUM',
      stars: 1,
      scoreMultiplier: 1.0,
      onClick: (id) => Toast.show(`Selected ${id}`, 'info'),
    });
    const tapeLocked = new TapeCard({
      id: 'tape-09',
      tapeNumber: 9,
      title: 'DROWNED SHAFT',
      stars: 5,
      locked: true,
      scoreMultiplier: 2.5,
    });

    grid.appendChild(tape1.element);
    grid.appendChild(tapeLocked.element);

    // Map Card
    const mapCard = new MapCard({
      id: 'natatorium',
      name: 'Natatorium (Main)',
      difficulty: 2,
      tags: ['TALL PILLARS', 'DEEP WATER', 'ECHOES'],
      bestTimeMs: 42300,
      seed: 1337,
      onClick: (id) => Toast.show(`Clicked Map: ${id}`, 'info'),
    });
    grid.appendChild(mapCard.element);
  }

  private mountInputs(): void {
    const sec = this.element.querySelector('#sec-inputs')!;
    sec.innerHTML = `
      <h2 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-lg); color: var(--bs-tan); margin-bottom: 16px; border-bottom: 1px solid var(--bs-border);">
        3. TABS, TOGGLES, SLIDERS & SELECT
      </h2>
      <div id="input-container" style="display: flex; flex-direction: column; gap: 20px; max-width: 480px;"></div>
    `;

    const con = sec.querySelector('#input-container')!;

    const tabs = new Tabs({
      items: [
        { id: 'daily', label: 'DAILY' },
        { id: 'weekly', label: 'WEEKLY' },
        { id: 'alltime', label: 'ALL-TIME' },
      ],
      onChange: (id) => Toast.show(`Tab switched to ${id}`, 'info'),
    });
    con.appendChild(tabs.element);

    const toggle = new Toggle({
      label: 'HEADPHONE SPATIALIZATION',
      description: 'Simulates ear canals and HRTF dampening',
      checked: true,
    });
    con.appendChild(toggle.element);

    const slider = new Slider({
      label: 'ACOUSTIC SENSITIVITY (dB)',
      min: 0,
      max: 100,
      value: 65,
      unit: '%',
    });
    con.appendChild(slider.element);

    const select = new Select({
      label: 'SIMULATION TIER',
      options: [
        { value: 'low', label: 'Low (Mid-range mobile)' },
        { value: 'medium', label: 'Medium (Standard 60fps)' },
        { value: 'high', label: 'High (Full Caustics & Reflection)' },
      ],
      value: 'medium',
    });
    con.appendChild(select.element);
  }

  private mountIndicators(): void {
    const sec = this.element.querySelector('#sec-indicators')!;
    sec.innerHTML = `
      <h2 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-lg); color: var(--bs-tan); margin-bottom: 16px; border-bottom: 1px solid var(--bs-border);">
        4. GAUGES, METERS, EMBLEMS & BADGES
      </h2>
      <div id="ind-grid" style="display: flex; gap: 24px; flex-wrap: wrap; align-items: center;"></div>
    `;

    const grid = sec.querySelector('#ind-grid')!;

    // VU meter
    const vu = new ProgressBar({ label: 'NOISE LEVEL (MIC)', value: 72, variant: 'vu' });
    grid.appendChild(vu.element);

    // Tracking bar
    const trk = new ProgressBar({ label: 'TRACKING SYNCHRONIZATION', value: 45, variant: 'tracking' });
    grid.appendChild(trk.element);

    // Stat tile
    const stat = new StatTile({ title: 'SURVIVAL RATING', value: '1,420 SR', subtext: '+32 past 24h' });
    grid.appendChild(stat.element);

    // Rank badges
    const b1 = new RankBadge({ rank: 'whisper', title: 'Whisper Tier' });
    const b2 = new RankBadge({ rank: 'current', title: 'Current Tier' });
    const b3 = new RankBadge({ rank: 'phantom', title: 'Phantom Tier' });
    grid.appendChild(b1.element);
    grid.appendChild(b2.element);
    grid.appendChild(b3.element);

    // Keycaps
    const kbdWrap = document.createElement('div');
    kbdWrap.innerHTML = `
      <span style="font-family: var(--bs-font-mono); font-size: 11px; margin-right: 8px;">CONTROLS:</span>
      ${KeyCap.render('W')} ${KeyCap.render('A')} ${KeyCap.render('S')} ${KeyCap.render('D')}
      ${KeyCap.render('SPACE')}
    `;
    grid.appendChild(kbdWrap);

    // Skeleton shimmer
    const skelWrap = document.createElement('div');
    skelWrap.style.width = '200px';
    skelWrap.innerHTML = `
      <div style="font-family: var(--bs-font-mono); font-size: 10px; color: var(--bs-tan); margin-bottom: 4px;">ASYNC LOADING SHIMMER:</div>
      ${Skeleton.render('100%', '16px')}
    `;
    grid.appendChild(skelWrap);
  }

  private mountSocial(): void {
    const sec = this.element.querySelector('#sec-social')!;
    sec.innerHTML = `
      <h2 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-lg); color: var(--bs-tan); margin-bottom: 16px; border-bottom: 1px solid var(--bs-border);">
        5. SOCIAL & COMPETITIVE (ROSTER, LEADERBOARD, WARDROBE)
      </h2>
      <div id="social-grid" style="display: flex; flex-direction: column; gap: 16px;"></div>
    `;

    const grid = sec.querySelector('#social-grid')!;

    // Roster chips
    const chipsWrap = document.createElement('div');
    chipsWrap.style.display = 'flex';
    chipsWrap.style.gap = '12px';
    chipsWrap.style.flexWrap = 'wrap';

    chipsWrap.appendChild(new RosterChip({ name: 'TapeArchivist', tag: '1042', isHost: true, isReady: true, pingMs: 24 }).element);
    chipsWrap.appendChild(new RosterChip({ name: 'NightDiver', tag: '9921', isReady: false, pingMs: 168 }).element);
    grid.appendChild(chipsWrap);

    // Leaderboard rows
    const lbWrap = document.createElement('div');
    lbWrap.style.display = 'flex';
    lbWrap.style.flexDirection = 'column';
    lbWrap.style.gap = '6px';
    lbWrap.style.maxWidth = '840px';

    lbWrap.appendChild(
      new LeaderboardRow({
        rank: 1,
        rankEmblem: 'phantom',
        name: 'EchoStalker',
        tag: '0001',
        score: 94820,
        timeMs: 38200,
        noiseUnits: 12.4,
        status: 'verified',
        hasReplay: true,
        onPlayGhost: () => Toast.show('Launching champion ghost replay...', 'info'),
      }).element,
    );

    lbWrap.appendChild(
      new LeaderboardRow({
        rank: 2,
        rankEmblem: 'depth',
        name: 'You',
        tag: '4291',
        score: 87210,
        timeMs: 44100,
        noiseUnits: 28.1,
        status: 'pending',
        isPinned: true,
      }).element,
    );

    grid.appendChild(lbWrap);

    // Achievement and Cosmetic
    const extraWrap = document.createElement('div');
    extraWrap.style.display = 'flex';
    extraWrap.style.gap = '16px';
    extraWrap.style.flexWrap = 'wrap';

    extraWrap.appendChild(
      new AchievementCard({
        id: 'ach-silent',
        title: 'NOT A DROP',
        description: 'Escape the Natatorium without exceeding 15 dB noise.',
        unlocked: true,
      }).element,
    );

    extraWrap.appendChild(
      new CosmeticTile({
        id: 'skin-01',
        name: 'Diver Mark II',
        category: 'skin',
        rarity: 'anomalous',
        isEquipped: true,
      }).element,
    );

    grid.appendChild(extraWrap);
  }

  private mountOverlays(): void {
    const sec = this.element.querySelector('#sec-overlays')!;
    sec.innerHTML = `
      <h2 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-lg); color: var(--bs-tan); margin-bottom: 16px; border-bottom: 1px solid var(--bs-border);">
        6. MODALS & DRAWERS
      </h2>
      <div style="display: flex; gap: 16px;">
        <button id="btn-open-modal" class="bs-btn bs-btn-primary">OPEN MODAL</button>
        <button id="btn-open-drawer" class="bs-btn bs-btn-ghost">OPEN DRAWER</button>
      </div>
    `;

    sec.querySelector('#btn-open-modal')?.addEventListener('click', () => {
      const modal = new Modal({
        title: 'RECOVERY CODE EXPORT',
        content: `
          <p style="font-size: 13px; opacity: 0.8; margin-bottom: 16px; line-height: 1.5;">
            Your recovery code encrypts your non-extractable WebCrypto keypair.
            Store it in a safe place. If lost, your player identity cannot be recovered.
          </p>
          <div class="bs-skeleton" style="height: 48px; margin-bottom: 16px;"></div>
          <button class="bs-btn bs-btn-primary" onclick="this.closest('.bs-modal-backdrop').querySelector('.bs-btn-ghost').click()">DONE</button>
        `,
      });
      modal.open();
    });

    sec.querySelector('#btn-open-drawer')?.addEventListener('click', () => {
      const drawer = new Drawer({
        title: 'MATCH MUTATORS',
        content: `
          <div style="display: flex; flex-direction: column; gap: 16px; padding: 12px 0;">
            <p style="font-size: 13px; opacity: 0.8;">Select active mutators for this run:</p>
            <div style="font-family: var(--bs-font-mono); font-size: 12px; color: var(--bs-tan);">[+] Deep Water (Score 1.5x)</div>
            <div style="font-family: var(--bs-font-mono); font-size: 12px; color: var(--bs-tan);">[+] Blind Monster (Score 1.2x)</div>
            <div style="font-family: var(--bs-font-mono); font-size: 12px; color: var(--bs-tan);">[-] Extra Flares (Score 0.8x)</div>
          </div>
        `,
      });
      drawer.open();
    });
  }

  private mountStructural(): void {
    const sec = this.element.querySelector('#sec-structural')!;
    sec.innerHTML = `
      <h2 style="font-family: var(--bs-font-mono); font-size: var(--bs-text-lg); color: var(--bs-tan); margin-bottom: 16px; border-bottom: 1px solid var(--bs-border);">
        7. BANNERS, STEPPER, ACCORDION & STATES
      </h2>
      <div id="structural-grid" style="display: flex; flex-direction: column; gap: 24px; max-width: 840px;"></div>
    `;

    const grid = sec.querySelector('#structural-grid')!;

    // Banners
    const bannersWrap = document.createElement('div');
    bannersWrap.style.display = 'flex';
    bannersWrap.style.flexDirection = 'column';
    bannersWrap.style.gap = '8px';
    bannersWrap.appendChild(new Banner({ message: 'Informational advisory: Hydrophones active across all sectors.', variant: 'info' }).element);
    bannersWrap.appendChild(new Banner({ message: 'Warning: Water level has breached sector 03 platforms.', variant: 'warning' }).element);
    bannersWrap.appendChild(new Banner({ message: 'Critical threat: Blind entity has detected surface acoustic ripple.', variant: 'danger' }).element);
    bannersWrap.appendChild(new Banner({ message: 'Weekly Champion: Operator EchoStalker crowned in Sector 09.', variant: 'champion' }).element);
    grid.appendChild(bannersWrap);

    // Stepper
    const stepperWrap = document.createElement('div');
    stepperWrap.style.padding = '16px';
    stepperWrap.style.background = 'var(--bs-surface-1)';
    stepperWrap.style.border = '1px solid var(--bs-border)';
    const stepper = new Stepper({
      steps: [
        { id: '1', label: 'Orientation' },
        { id: '2', label: 'Loadout' },
        { id: '3', label: 'Mutators' },
        { id: '4', label: 'Descent' },
      ],
      activeStep: 1,
    });
    stepperWrap.appendChild(stepper.element);
    grid.appendChild(stepperWrap);

    // Accordion
    const accordion = new Accordion({
      items: [
        { id: 'faq-1', title: 'ACOUSTIC PROTOCOL 01 // DRY vs WET', content: 'Movement across dry platform tiles produces 0.15 noise units. Splashing through standing water generates up to 0.85 noise units.', open: true },
        { id: 'faq-2', title: 'ACOUSTIC PROTOCOL 02 // ENTITY BLINDNESS', content: 'The apex creature has no optic organs. It hunts purely by triangulation of fluid compression waves.' },
        { id: 'faq-3', title: 'ACOUSTIC PROTOCOL 03 // LURES & DISTRACTIONS', content: 'Smooth river stones and glass bottles shatter to produce localized decoy sound sources.' },
      ],
    });
    grid.appendChild(accordion.element);

    // Empty and Error States
    const statesWrap = document.createElement('div');
    statesWrap.style.display = 'grid';
    statesWrap.style.gridTemplateColumns = 'repeat(auto-fit, minmax(360px, 1fr))';
    statesWrap.style.gap = '16px';

    statesWrap.appendChild(new EmptyState({
      icon: 'tape',
      title: 'EMPTY ARCHIVE DRAWER',
      description: 'No recorded tapes found in this cabinet drawer. The shelves remain submerged.',
      actionText: 'QUERY ARCHIVE',
      onAction: () => Toast.show('Querying municipal catalog...', 'info'),
    }).element);

    statesWrap.appendChild(new ErrorState({
      title: 'TRACKING DISRUPTED',
      code: 'ERR_VCO_SYNC_LOST',
      message: 'Signal dropped beneath surface noise. Video playback head requires calibration.',
      retryText: 'RE-ALIGN HEAD',
      onRetry: () => Toast.show('Re-aligning video playhead...', 'warning'),
    }).element);

    grid.appendChild(statesWrap);
  }
}

