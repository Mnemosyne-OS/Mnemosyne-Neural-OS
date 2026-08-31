/**
 * types.ts — SkinManifest and SkinTokens type definitions
 *
 * These types are the single source of truth for the Design SDK contract.
 * Synchronized with skin-registry.ts inside apps/dev-edition.
 *
 * DR-011: A skin = one JSON file + zero TypeScript for the designer
 * DR-012: Skins only override CSS variables, never structure
 */

/**
 * Structure of a Mnemosyne skin manifest JSON file.
 *
 * All `tokens` keys are optional — a skin can override just one color.
 * Unknown tokens are rejected by the validator (DR-014).
 *
 * @example
 * ```json
 * {
 *   "$schema": "https://unpkg.com/@mnemosyne_os/design-sdk/skin-schema.json",
 *   "id": "my-skin",
 *   "name": "MY SKIN",
 *   "version": "1.0.0",
 *   "author": "designer",
 *   "tokens": {
 *     "--accent": "#ff2244",
 *     "--accent-dim": "#cc0033"
 *   }
 * }
 * ```
 */
export interface SkinManifest {
  /** Unique machine-readable ID (slug, no spaces). Cannot be 'mnemo-default'. */
  id: string;
  /** Human-readable display name shown in the Skin Picker UI. */
  name: string;
  /** SemVer version string. */
  version: string;
  /** Optional author name or handle. */
  author?: string;
  /** Short description shown in the picker tooltip. */
  description?: string;
  /**
   * Optional preview image URL.
   * Can be a base64 `data:` URI or a relative path.
   */
  preview?: string;
  /**
   * CSS variable overrides.
   *
   * Keys must start with `--` and be part of the SDK allowlist.
   * Values must be valid CSS strings.
   *
   * See `SkinTokens` for all supported variables.
   */
  tokens: Partial<SkinTokens>;
}

/**
 * All CSS variables supported by the Mnemosyne Design SDK.
 *
 * These map 1:1 to the `:root { }` tokens in `index.css`.
 * Only variables in this interface are accepted by the validator.
 */
export interface SkinTokens {
  // ── Accent colors ────────────────────────────────────────────────────────
  '--accent':              string;  // Primary accent (e.g. '#00cc6a')
  '--accent-dim':          string;  // Dimmed accent
  '--accent-glow':         string;  // Glow color (rgba)
  '--accent-border':       string;  // Border accent color (rgba)

  // ── Backgrounds ──────────────────────────────────────────────────────────
  '--bg-void':             string;  // Deepest background
  '--bg-surface':          string;  // Surface background
  '--bg-panel':            string;  // Panel background
  '--bg-card':             string;  // Card / overlay
  '--bg-hover':            string;  // Hover state

  // ── Status indicators ─────────────────────────────────────────────────────
  '--status-active':       string;  // Active / live
  '--status-idle':         string;  // Idle
  '--status-hibernating':  string;  // Hibernating
  '--status-overload':     string;  // Error / overload
  '--status-warning':      string;  // Warning

  // ── Text ──────────────────────────────────────────────────────────────────
  '--text-primary':        string;
  '--text-secondary':      string;
  '--text-muted':          string;
  '--text-accent':         string;  // Accent-colored text

  // ── Typography ────────────────────────────────────────────────────────────
  '--font-mono':           string;  // Monospace font stack
  '--font-ui':             string;  // UI font stack

  // ── Spacing ───────────────────────────────────────────────────────────────
  '--space-xs':            string;
  '--space-sm':            string;
  '--space-md':            string;
  '--space-lg':            string;
  '--space-xl':            string;
  '--space-2xl':           string;

  // ── Border radii ──────────────────────────────────────────────────────────
  '--radius-sm':           string;
  '--radius-md':           string;
  '--radius-lg':           string;

  // ── Borders ───────────────────────────────────────────────────────────────
  '--border-accent':       string;  // e.g. '1px solid rgba(0,204,106,0.25)'
  '--border-subtle':       string;
  '--border-overload':     string;

  // ── Shadows ───────────────────────────────────────────────────────────────
  '--shadow-panel':        string;
  '--shadow-card':         string;
  '--shadow-accent':       string;
  '--shadow-overload':     string;

  // ── Transitions ───────────────────────────────────────────────────────────
  '--transition-fast':     string;
  '--transition-normal':   string;
  '--transition-slow':     string;

  // ── Layout (⚠ Advanced — may break layout if changed) ────────────────────
  '--titlebar-height':     string;
  '--panel-left-width':    string;
  '--panel-right-width':   string;
}
