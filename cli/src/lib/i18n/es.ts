// ─────────────────────────────────────────────────────────────────────────────
// i18n — Spanish strings
// ─────────────────────────────────────────────────────────────────────────────
import type { Strings } from './en.js';

export const es: Strings = {
  // Header
  header_title:   'M N E M O S Y N E   O S   —   O S   N E U R A L',
  header_tagline: '"La memoria es la arquitectura de la inteligencia."',

  // Resonance profiles section
  section_profiles: '⚡ PERFILES DE RESONANCIA',
  profile_switch:   'cambiar',
  local_ai:         'IA local',
  soul_profile:     'Perfil Soul',
  no_vault:         '⚠  Sin vault configurado — ejecutar: mnemoforge chronicle init',

  // Commands table headers
  col_chronicle:    'CRÓNICA',
  col_workspace:    'ESPACIO DE TRABAJO & SOUL',

  // Chronicle commands
  cmd_chron_init:   'chronicle init',   desc_chron_init:   'configurar vault',
  cmd_chron_switch: 'chronicle switch', desc_chron_switch: 'cambiar perfil IA',
  cmd_chron_commit: 'chronicle commit', desc_chron_commit: 'escribir una crónica',
  cmd_chron_open:   'chronicle open',   desc_chron_open:   'explorar vault',
  cmd_chron_list:   'chronicle list',   desc_chron_list:   'listar crónicas',

  // Workspace commands
  cmd_canvas:       'canvas',           desc_canvas:       'crear módulo',
  cmd_prompt_list:  'prompt list',      desc_prompt_list:  'ver plantillas',
  cmd_prompt_new:   'prompt create',    desc_prompt_new:   'plantilla personalizada',
  cmd_forge:        'forge',            desc_forge:        'modo REPL',
  cmd_config:       'config',           desc_config:       'ajustes & Ollama',
  cmd_serve:        'serve',            desc_serve:        'iniciar servidor MCP',

  // Soul commands
  cmd_soul_dex:      'soul dex',         desc_soul_dex:      'perfiles desarrollador',
  cmd_soul_inject:   'soul inject',      desc_soul_inject:   'inyectar en IDE',
  cmd_soul_switch:   'soul switch',      desc_soul_switch:   'cambio rápido de perfil',
  cmd_soul_passport: 'soul passport',    desc_soul_passport: 'crear pasaporte IA',
};
