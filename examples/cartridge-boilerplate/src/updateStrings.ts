/**
 * updateStrings — the version badge and the « a newer version is out » line of
 * a cartridge, as the host tells them (doc 142). Copy this file and
 * UpdateNotice.tsx into your cartridge as they are.
 *
 * Do NOT read your own manifest on GitHub to find out: the host already
 * knows, with the Hub's rules (version read where an install would take it,
 * from the source recorded at install, once a day), and sends it in
 * `onHostConfig` as `version` and `update`.
 *
 * The texts are in English, French and Spanish, picked by the host's language.
 */
import type { MnemoHostConfig, MnemoUpdateState } from './sdk/mnemo-sdk';

export type UpdateLang = 'en' | 'fr' | 'es';

export const UPDATE_STRINGS: Record<UpdateLang, {
  badge: (v: string) => string;
  badgeNew: (v: string, next: string) => string;
  current: string;
  available: (next: string) => string;
  critical: (next: string) => string;
  open: string;
  openYourself: string;
}> = {
  en: {
    badge: (v) => `v${v}`,
    badgeNew: (v, next) => `v${v} · ${next} available`,
    current: 'Up to date',
    available: (next) => `Version ${next} is available.`,
    critical: (next) => `Version ${next} fixes a security problem.`,
    open: 'Open the Hub',
    openYourself: 'Open the Mnemosyne Hub to update.',
  },
  fr: {
    badge: (v) => `v${v}`,
    badgeNew: (v, next) => `v${v} · ${next} disponible`,
    current: 'À jour',
    available: (next) => `La version ${next} est disponible.`,
    critical: (next) => `La version ${next} corrige un problème de sécurité.`,
    open: 'Ouvrir le Hub',
    openYourself: 'Ouvre le Hub de Mnemosyne pour la mettre à jour.',
  },
  es: {
    badge: (v) => `v${v}`,
    badgeNew: (v, next) => `v${v} · ${next} disponible`,
    current: 'Al día',
    available: (next) => `La versión ${next} está disponible.`,
    critical: (next) => `La versión ${next} corrige un problema de seguridad.`,
    open: 'Abrir el Hub',
    openYourself: 'Abre el Hub de Mnemosyne para actualizarla.',
  },
};

/** The host's language when it is one of ours, else English. */
export function updateLang(lang: string | undefined): UpdateLang {
  const base = (lang ?? '').toLowerCase().split('-')[0];
  return base === 'fr' || base === 'es' ? base : 'en';
}

export interface NoticeState {
  version?: string;
  update?: MnemoUpdateState;
  lang?: string;
}

/**
 * Folds one host message into what is known. A message carries only some
 * fields (the zoom rides its own), so an ABSENT field never erases a known one.
 */
export function foldHostConfig(prev: NoticeState, cfg: MnemoHostConfig): NoticeState {
  return {
    ...prev,
    ...(cfg.version !== undefined ? { version: cfg.version } : {}),
    ...(cfg.update !== undefined ? { update: cfg.update } : {}),
    ...(cfg.lang !== undefined ? { lang: cfg.lang } : {}),
  };
}
