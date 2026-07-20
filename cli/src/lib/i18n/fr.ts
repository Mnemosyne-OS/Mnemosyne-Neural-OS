// ─────────────────────────────────────────────────────────────────────────────
// i18n — French strings
// ─────────────────────────────────────────────────────────────────────────────
import type { Strings } from './en.js';

export const fr: Strings = {
  // Header
  header_title:   'M N E M O S Y N E   O S   —   O S   N E U R A L',
  header_tagline: '"La mémoire est l\'architecture de l\'intelligence."',

  // Resonance profiles section
  section_profiles: '⚡ PROFILS DE RÉSONANCE',
  profile_switch:   'basculer',
  local_ai:         'IA locale',
  soul_profile:     'Profil Soul',
  no_vault:         '⚠  Aucun vault configuré — lancer : mnemoforge chronicle init',

  // Commands table headers
  col_chronicle:    'CHRONIQUE',
  col_workspace:    'ESPACE DE TRAVAIL & SOUL',

  // Chronicle commands
  cmd_chron_init:   'chronicle init',   desc_chron_init:   'configurer le vault',
  cmd_chron_switch: 'chronicle switch', desc_chron_switch: 'changer de profil IA',
  cmd_chron_commit: 'chronicle commit', desc_chron_commit: 'écrire une chronique',
  cmd_chron_open:   'chronicle open',   desc_chron_open:   'parcourir le vault',
  cmd_chron_list:   'chronicle list',   desc_chron_list:   'lister les chroniques',

  // Workspace commands
  cmd_canvas:       'canvas',           desc_canvas:       'créer un module',
  cmd_prompt_list:  'prompt list',      desc_prompt_list:  'parcourir les templates',
  cmd_prompt_new:   'prompt create',    desc_prompt_new:   'template personnalisé',
  cmd_forge:        'forge',            desc_forge:        'mode REPL',
  cmd_config:       'config',           desc_config:       'paramètres & Ollama',
  cmd_serve:        'serve',            desc_serve:        'démarrer le serveur MCP',

  // Soul commands
  cmd_soul_dex:      'soul dex',         desc_soul_dex:      'profils développeur',
  cmd_soul_inject:   'soul inject',      desc_soul_inject:   'injecter dans l\'IDE',
  cmd_soul_switch:   'soul switch',      desc_soul_switch:   'changer de profil',
  cmd_soul_passport: 'soul passport',    desc_soul_passport: 'créer un passeport IA',
};
