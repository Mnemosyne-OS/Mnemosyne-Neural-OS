// ─────────────────────────────────────────────────────────────────────────────
// i18n — Loader
// Priority: vault config lang > OS locale > 'en'
// ─────────────────────────────────────────────────────────────────────────────
import { en } from './en.js';
import { fr } from './fr.js';
import { es } from './es.js';
import type { Strings } from './en.js';

export type Lang = 'en' | 'fr' | 'es';
export const SUPPORTED: Lang[] = ['en', 'fr', 'es'];

const catalogue: Record<Lang, Strings> = { en, fr, es };

/** Detect OS locale — returns 2-letter code or 'en' as fallback */
function detectOsLang(): Lang {
  try {
    const raw =
      process.env['LANG'] ??           // Linux / macOS
      process.env['LANGUAGE'] ??       // Linux alt
      Intl.DateTimeFormat().resolvedOptions().locale ?? // Node Intl
      'en';
    const code = raw.split(/[-_]/)[0]?.toLowerCase() ?? 'en';
    return (SUPPORTED as string[]).includes(code) ? (code as Lang) : 'en';
  } catch {
    return 'en';
  }
}

let _active: Lang | null = null;

/**
 * Call once at startup with the vault config lang (if any).
 * Falls back to OS locale detection.
 */
export function initLang(vaultLang?: string): void {
  if (vaultLang && (SUPPORTED as string[]).includes(vaultLang)) {
    _active = vaultLang as Lang;
    return;
  }
  _active = detectOsLang();
}

/** Get active lang code (defaults to 'en' if initLang not yet called) */
export function getLang(): Lang {
  return _active ?? detectOsLang();
}

/** Translate a key — returns English fallback if key missing in locale */
export function t(key: keyof Strings): string {
  const lang = getLang();
  return (catalogue[lang] as Strings)[key] ?? (en[key] as string);
}
