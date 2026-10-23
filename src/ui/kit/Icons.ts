/* ── Icons.ts ──────────────────────────────────────────────────────────────
 *  Coded inline-SVG icon set (~36 icons) drawn in consistent 2px stroke style,
 *  plus 5 procedural Rank Emblems (Whisper → Phantom) with distinct silhouettes.
 *  Zero external fonts or raster icon files.
 * ──────────────────────────────────────────────────────────────────────── */

export type IconName =
  | 'play'
  | 'map'
  | 'ear'
  | 'drop'
  | 'tape'
  | 'trophy'
  | 'crown'
  | 'lock'
  | 'unlock'
  | 'skull'
  | 'wave'
  | 'user'
  | 'gear'
  | 'share'
  | 'copy'
  | 'ping'
  | 'perch'
  | 'flashlight'
  | 'bottle'
  | 'pebble'
  | 'key'
  | 'speaker'
  | 'speaker-off'
  | 'refresh'
  | 'check'
  | 'cross'
  | 'arrow-left'
  | 'arrow-right'
  | 'eye-off'
  | 'ghost'
  | 'clock'
  | 'shield'
  | 'star'
  | 'terminal'
  | 'download'
  | 'info';

export type RankEmblemName = 'whisper' | 'echo' | 'current' | 'depth' | 'phantom';

export const ICONS: Record<IconName, string> = {
  play: `<polygon points="6 3 20 12 6 21 6 3"></polygon>`,
  map: `<polygon points="1 6 8 2 16 6 23 2 23 18 16 22 8 18 1 22 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line>`,
  ear: `<path d="M6 10a7 7 0 0 1 14 0c0 4-3 6-4 8a3 3 0 0 1-5-2c0-2 2-3 2-6a3 3 0 0 0-6 0v2"></path><path d="M10 13a2 2 0 0 0 2 2"></path>`,
  drop: `<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>`,
  tape: `<rect x="2" y="4" width="20" height="16" rx="2"></rect><circle cx="8" cy="12" r="2.5"></circle><circle cx="16" cy="12" r="2.5"></circle><path d="M8 14.5h8"></path><line x1="6" y1="4" x2="18" y2="4"></line>`,
  trophy: `<path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2"></path><path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2"></path><path d="M6 3h12v7a6 6 0 0 1-12 0V3z"></path><line x1="12" y1="16" x2="12" y2="20"></line><line x1="8" y1="20" x2="16" y2="20"></line>`,
  crown: `<path d="M2 19h20M2 15l4-9 6 6 6-6 4 9"></path>`,
  lock: `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>`,
  unlock: `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>`,
  skull: `<circle cx="9" cy="11" r="1.5"></circle><circle cx="15" cy="11" r="1.5"></circle><path d="M8 17v2h8v-2M12 3a8 8 0 0 0-8 8c0 3 1.5 5 2.5 6.5.5.8 1.5 1.5 2.5 1.5h6c1 0 2-.7 2.5-1.5 1-1.5 2.5-3.5 2.5-6.5a8 8 0 0 0-8-8z"></path>`,
  wave: `<path d="M2 12c2.5-3 5-3 7.5 0s5 3 7.5 0 5-3 5 0"></path><path d="M2 16c2.5-3 5-3 7.5 0s5 3 7.5 0 5-3 5 0"></path>`,
  user: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>`,
  gear: `<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>`,
  share: `<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>`,
  copy: `<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>`,
  ping: `<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>`,
  perch: `<line x1="6" y1="2" x2="6" y2="22"></line><line x1="18" y1="2" x2="18" y2="22"></line><line x1="6" y1="6" x2="18" y2="6"></line><line x1="6" y1="11" x2="18" y2="11"></line><line x1="6" y1="16" x2="18" y2="16"></line>`,
  flashlight: `<polygon points="6 4 18 4 15 11 15 20 9 20 9 11 6 4"></polygon><line x1="12" y1="14" x2="12" y2="17"></line>`,
  bottle: `<path d="M10 2h4v3h-4zM8 8a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8z"></path><line x1="8" y1="13" x2="16" y2="13"></line>`,
  pebble: `<path d="M12 3c4.5 0 9 2.5 9 7.5s-3 10.5-9 10.5-9-5.5-9-10.5S7.5 3 12 3z"></path>`,
  key: `<path d="M21 2l-2 2m-1.5 1.5L14 9l-2-2-4 4 2 2-3 3 2 2-3 3"></path><circle cx="7.5" cy="16.5" r="4.5"></circle>`,
  speaker: `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>`,
  'speaker-off': `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>`,
  refresh: `<path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>`,
  check: `<polyline points="20 6 9 17 4 12"></polyline>`,
  cross: `<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>`,
  'arrow-left': `<line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>`,
  'arrow-right': `<line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline>`,
  'eye-off': `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`,
  ghost: `<path d="M9 22V19a3 3 0 0 1 6 0v3M3 11a9 9 0 0 1 18 0v9l-3-2-3 2-3-2-3 2-3-2-3 2V11z"></path><circle cx="9" cy="10" r="1.5"></circle><circle cx="15" cy="10" r="1.5"></circle>`,
  clock: `<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>`,
  shield: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>`,
  star: `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>`,
  terminal: `<polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line>`,
  download: `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>`,
  info: `<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>`,
};

export const RANK_EMBLEMS: Record<RankEmblemName, string> = {
  whisper: `
    <circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="2" stroke-dasharray="2 4" opacity="0.6"/>
    <circle cx="24" cy="24" r="12" stroke="currentColor" stroke-width="2"/>
    <path d="M24 16 A8 8 0 0 1 24 32" stroke="currentColor" stroke-width="2.5"/>
    <circle cx="24" cy="24" r="3" fill="currentColor"/>
  `,
  echo: `
    <circle cx="24" cy="24" r="8" stroke="currentColor" stroke-width="2"/>
    <path d="M12 24 A12 12 0 0 1 36 24" stroke="currentColor" stroke-width="2"/>
    <path d="M6 24 A18 18 0 0 1 42 24" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3"/>
    <path d="M12 24 A12 12 0 0 0 36 24" stroke="currentColor" stroke-width="2" opacity="0.7"/>
    <circle cx="24" cy="24" r="4" fill="currentColor"/>
  `,
  current: `
    <path d="M10 18 C16 10, 32 10, 38 18 C32 26, 16 26, 10 18 Z" stroke="currentColor" stroke-width="2"/>
    <path d="M10 30 C16 22, 32 22, 38 30 C32 38, 16 38, 10 30 Z" stroke="currentColor" stroke-width="2" opacity="0.8"/>
    <circle cx="24" cy="24" r="5" stroke="currentColor" stroke-width="2"/>
    <circle cx="24" cy="24" r="2" fill="currentColor"/>
  `,
  depth: `
    <polygon points="24 4 40 14 40 34 24 44 8 34 8 14" stroke="currentColor" stroke-width="2"/>
    <circle cx="24" cy="24" r="10" stroke="currentColor" stroke-width="2"/>
    <circle cx="24" cy="24" r="5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/>
    <line x1="24" y1="14" x2="24" y2="34" stroke="currentColor" stroke-width="2"/>
    <line x1="14" y1="24" x2="34" y2="24" stroke="currentColor" stroke-width="2"/>
  `,
  phantom: `
    <path d="M24 4 L28 14 L39 15 L30 22 L33 33 L24 27 L15 33 L18 22 L9 15 L20 14 Z" stroke="currentColor" stroke-width="2"/>
    <circle cx="24" cy="24" r="14" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 2" opacity="0.8"/>
    <circle cx="24" cy="24" r="7" stroke="currentColor" stroke-width="2"/>
    <circle cx="24" cy="24" r="3" fill="currentColor"/>
    <path d="M18 38 Q24 44 30 38" stroke="currentColor" stroke-width="2"/>
  `,
};

export function renderIcon(name: IconName, size = 20, className = ''): string {
  const content = ICONS[name] || ICONS.drop;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="bs-icon bs-icon-${name} ${className}" aria-hidden="true">${content}</svg>`;
}

export function renderRankEmblem(rank: RankEmblemName, size = 48, className = ''): string {
  const content = RANK_EMBLEMS[rank] || RANK_EMBLEMS.whisper;
  return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" class="bs-rank-emblem bs-rank-${rank} ${className}" role="img" aria-label="Rank ${rank}">${content}</svg>`;
}
