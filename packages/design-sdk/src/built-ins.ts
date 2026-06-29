/**
 * built-ins.ts — ALLOWED_TOKENS whitelist + built-in skin exports
 *
 * ALLOWED_TOKENS is the authoritative token whitelist for the Design SDK.
 * Any token NOT in this set will be rejected by validateSkinManifest().
 *
 * MNEMO_DEFAULT_SKIN is exported so consumers can see the baseline values
 * and build skins that partially override them.
 *
 * [DR-012, DR-013]
 */

import type { SkinManifest } from './types.js';

// ── Token allowlist ───────────────────────────────────────────────────────────

export const ALLOWED_TOKENS = new Set<string>([
  // Accent
  '--accent', '--accent-dim', '--accent-glow', '--accent-border',
  // Background
  '--bg-void', '--bg-surface', '--bg-panel', '--bg-card', '--bg-hover',
  // Status
  '--status-active', '--status-idle', '--status-hibernating', '--status-overload', '--status-warning',
  // Text
  '--text-primary', '--text-secondary', '--text-muted', '--text-accent',
  // Typography
  '--font-mono', '--font-ui',
  // Spacing
  '--space-xs', '--space-sm', '--space-md', '--space-lg', '--space-xl', '--space-2xl',
  // Radius
  '--radius-sm', '--radius-md', '--radius-lg',
  // Borders
  '--border-accent', '--border-subtle', '--border-overload',
  // Shadows
  '--shadow-panel', '--shadow-card', '--shadow-accent', '--shadow-overload',
  // Transitions
  '--transition-fast', '--transition-normal', '--transition-slow',
  // Layout (advanced)
  '--titlebar-height', '--panel-left-width', '--panel-right-width',
]);

// ── Baseline skin (immuable) ──────────────────────────────────────────────────

/**
 * The default Mnemosyne skin — Tech-Noir brutaliste, green terminal.
 * This is the baseline: every skin that doesn't define a token inherits
 * the value from this manifest. It cannot be overridden or unregistered.
 * [DR-013]
 */
export const MNEMO_DEFAULT_SKIN: SkinManifest = {
  id:          'mnemo-default',
  name:        'MNEMO DEFAULT',
  version:     '1.0.0',
  author:      'yaka0007',
  description: 'Tech-Noir brutaliste. Green terminal signature. Fond noir absolu.',
  tokens: {
    '--accent':              '#00cc6a',
    '--accent-dim':          '#009e52',
    '--accent-glow':         'rgba(0, 204, 106, 0.15)',
    '--accent-border':       'rgba(0, 204, 106, 0.25)',
    '--bg-void':             '#000000',
    '--bg-surface':          '#0a0a0a',
    '--bg-panel':            '#0d0d0d',
    '--bg-card':             'rgba(13, 13, 13, 0.85)',
    '--bg-hover':            'rgba(0, 255, 136, 0.05)',
    '--status-active':       '#00cc6a',
    '--status-idle':         '#4a4a4a',
    '--status-hibernating':  '#ff6b00',
    '--status-overload':     '#ff2244',
    '--status-warning':      '#ffaa00',
    '--text-primary':        '#e8e8e8',
    '--text-secondary':      '#888888',
    '--text-muted':          '#444444',
    '--text-accent':         '#00cc6a',
    '--font-mono':           "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    '--font-ui':             "'Inter', system-ui, sans-serif",
    '--radius-sm':           '4px',
    '--radius-md':           '8px',
    '--radius-lg':           '12px',
  },
};

/** SITH — rouge sang, ambiance Order 66 */
export const MNEMO_SITH_SKIN: SkinManifest = {
  id:          'mnemo-sith',
  name:        'SITH RED',
  version:     '1.0.0',
  author:      'yaka0007',
  description: 'Darkside rouge. Accent crimson. Ambiance Order 66.',
  tokens: {
    '--accent':        '#ff2244',
    '--accent-dim':    '#cc0033',
    '--accent-glow':   'rgba(255, 34, 68, 0.18)',
    '--accent-border': 'rgba(255, 34, 68, 0.30)',
    '--bg-hover':      'rgba(255, 34, 68, 0.06)',
    '--status-active': '#ff2244',
    '--text-accent':   '#ff2244',
    '--shadow-accent': '0 0 20px rgba(255, 34, 68, 0.2)',
    '--border-accent': '1px solid rgba(255, 34, 68, 0.30)',
  },
};

/** GHOST — blanc froid, specter mode */
export const MNEMO_GHOST_SKIN: SkinManifest = {
  id:          'mnemo-ghost',
  name:        'GHOST',
  version:     '1.0.0',
  author:      'yaka0007',
  description: 'Blanc froid et ombres teal. Discret. Specter mode.',
  tokens: {
    '--accent':        '#b0bec5',
    '--accent-dim':    '#78909c',
    '--accent-glow':   'rgba(176, 190, 197, 0.12)',
    '--accent-border': 'rgba(176, 190, 197, 0.20)',
    '--bg-hover':      'rgba(176, 190, 197, 0.04)',
    '--status-active': '#b0bec5',
    '--text-accent':   '#b0bec5',
    '--shadow-accent': '0 0 20px rgba(176, 190, 197, 0.12)',
    '--border-accent': '1px solid rgba(176, 190, 197, 0.20)',
  },
};

/** AURA — violet quantum, cyberpunk */
export const MNEMO_AURA_SKIN: SkinManifest = {
  id:          'mnemo-aura',
  name:        'AURA VIOLET',
  version:     '1.0.0',
  author:      'yaka0007',
  description: 'Violet quantum. Cyberpunk 2077. Neural surge.',
  tokens: {
    '--accent':        '#d500f9',
    '--accent-dim':    '#aa00c8',
    '--accent-glow':   'rgba(213, 0, 249, 0.15)',
    '--accent-border': 'rgba(213, 0, 249, 0.28)',
    '--bg-hover':      'rgba(213, 0, 249, 0.05)',
    '--status-active': '#d500f9',
    '--text-accent':   '#d500f9',
    '--shadow-accent': '0 0 20px rgba(213, 0, 249, 0.20)',
    '--border-accent': '1px solid rgba(213, 0, 249, 0.28)',
  },
};

/** All built-in skins as an ordered array (default first). */
export const BUILT_IN_SKINS: SkinManifest[] = [
  MNEMO_DEFAULT_SKIN,
  MNEMO_SITH_SKIN,
  MNEMO_GHOST_SKIN,
  MNEMO_AURA_SKIN,
];
