// ─────────────────────────────────────────────────────────────────────────────
// i18n — English strings (default)
// ─────────────────────────────────────────────────────────────────────────────
export const en = {
  // Header
  header_title:   'M N E M O S Y N E   O S   —   N E U R A L   O S',
  header_tagline: '"Memory is the architecture of intelligence."',

  // Resonance profiles section
  section_profiles: '⚡ RESONANCE PROFILES',
  profile_switch:   'switch',
  local_ai:         'Local AI',
  soul_profile:     'Soul Profile',
  no_vault:         '⚠  No vault configured — run: mnemoforge chronicle init',

  // Commands table headers
  col_chronicle:    'CHRONICLE',
  col_workspace:    'WORKSPACE & SOUL',

  // Chronicle commands
  cmd_chron_init:   'chronicle init',   desc_chron_init:   'setup vault profile',
  cmd_chron_switch: 'chronicle switch', desc_chron_switch: 'change ai profile',
  cmd_chron_commit: 'chronicle commit', desc_chron_commit: 'write a chronicle',
  cmd_chron_open:   'chronicle open',   desc_chron_open:   'browse vault',
  cmd_chron_list:   'chronicle list',   desc_chron_list:   'list chronicles',

  // Workspace commands
  cmd_canvas:       'canvas',           desc_canvas:       'scaffold project',
  cmd_prompt_list:  'prompt list',      desc_prompt_list:  'browse templates',
  cmd_prompt_new:   'prompt create',    desc_prompt_new:   'custom template',
  cmd_forge:        'forge',            desc_forge:        'REPL mode',
  cmd_config:       'config',           desc_config:       'settings & Ollama',
  cmd_serve:        'serve',            desc_serve:        'start MCP server',

  // Soul commands
  cmd_soul_dex:      'soul dex',         desc_soul_dex:      'browse dev profiles',
  cmd_soul_inject:   'soul inject',      desc_soul_inject:   'inject into IDE',
  cmd_soul_switch:   'soul switch',      desc_soul_switch:   'quick swap profile',
  cmd_soul_passport: 'soul passport',    desc_soul_passport: 'create AI passport',
} as const;

export type Strings = Record<keyof typeof en, string>;
