/**
 * What each tool does to the human's machine, DECLARED rather than inferred.
 *
 * Two readers depend on this. A client uses `readOnlyHint` to decide whether a
 * call can run without stopping to ask, and Anthropic's software directory
 * refuses a submission whose tools carry no `title` and no applicable hint. For
 * a server that reaches someone's memory, "which of these write?" is not
 * paperwork — it is the question.
 *
 * This lives apart from `index.ts` on purpose: that module builds a server and
 * runs it at import time, so anything testable has to sit outside it.
 */

/** The human-readable name a client shows beside each tool. */
export const TOOL_TITLES: Record<string, string> = {
  mnemosyne_about:             'About Mnemosyne OS',
  mnemosyne_memory_query:      'Search chronicles',
  mnemosyne_memory_ask:        'Ask the vault',
  mnemosyne_memory_ingest:     'Save a memory',
  mnemosyne_memory_forget:     'Erase a memory',
  mnemosyne_vault_list:        'List vaults',
  mnemosyne_resonance_list:    'List resonances',
  mnemosyne_position_get:      'Read a resonance position',
  mnemosyne_position_update:   'Record where you left off',
  mnemosyne_git_log:           'Read git history',
  mnemosyne_dream_bridges:     'List dream bridges',
  mnemosyne_spine_assignments: 'List spine assignments',
  mnemosyne_agent_list:        'List coding agents',
  mnemosyne_agent_collisions:  'Check agent collisions',
  mnemosyne_agent_files:       'List files an agent wrote',
  mnemosyne_cockpit_update:    'Update your status card',
  mnemosyne_pheme_watch:       'Edit the Pheme watchlist',
  mnemosyne_pheme_radar:       'Read the Pheme radar',
  mnemosyne_todo_add:          'Add To-do tasks',
  mnemosyne_todo_list:         'List To-do tasks',
  mnemosyne_todo_update:       'Change the To-do backlog',
  mnemosyne_todo_categories:   'List To-do lists',
  mnemosyne_agenda_list:       'List appointments',
  mnemosyne_agenda_update:     'Change an appointment',
  mnemosyne_agenda_remove:     'Remove appointments',
  mnemosyne_agenda_add:        'Add appointments',
  mnemosyne_voice_list:        'List local voices',
  mnemosyne_voice_speak:       'Render a script to a WAV',
  mnemosyne_voice_status:      'Check the voice engine',
};

/** Tools that only read. Everything else has to say whether it can destroy. */
export const READ_ONLY_TOOLS = new Set<string>([
  'mnemosyne_about',
  'mnemosyne_memory_query',
  'mnemosyne_memory_ask',
  'mnemosyne_vault_list',
  'mnemosyne_resonance_list',
  'mnemosyne_position_get',
  'mnemosyne_git_log',
  'mnemosyne_dream_bridges',
  'mnemosyne_spine_assignments',
  'mnemosyne_agent_list',
  'mnemosyne_agent_collisions',
  'mnemosyne_agent_files',
  'mnemosyne_pheme_radar',
  'mnemosyne_todo_list',
  'mnemosyne_todo_categories',
  'mnemosyne_agenda_list',
  'mnemosyne_voice_list',
  'mnemosyne_voice_status',
]);

/**
 * The writers that can cost the human something they already had. Each one
 * earns the flag from its own contract: `todo_update` takes `permanent: true`
 * and deletes outright, `agenda_update` CLEARS a field when passed null, and a
 * removed appointment has no archive at all. Every other writer only adds — an
 * ingested chronicle is permanent, but it destroys nothing that was there.
 *
 * `memory_forget` is the one this set was really waiting for: it is the only
 * tool here that can take a chronicle away, and the flag is what makes a client
 * stop and ask before it runs.
 */
export const DESTRUCTIVE_TOOLS = new Set<string>([
  'mnemosyne_memory_forget',
  'mnemosyne_todo_update',
  'mnemosyne_agenda_update',
  'mnemosyne_agenda_remove',
]);

export interface ToolAnnotations {
  title:            string;
  readOnlyHint:     boolean;
  /** Omitted on a read-only tool: the hint only means anything on a writer. */
  destructiveHint?: boolean;
}

/**
 * Attach the declared annotations, leaving an UNLISTED tool untouched.
 *
 * 🚨 An unknown tool is served with no annotations, never with a guessed one. A
 * missing hint makes a client stop and ask the human, which is the safe
 * direction; a fabricated `readOnlyHint: true` on a writing tool would tell it
 * to go ahead. The drift test fails the build on an unlisted tool, which is
 * where that gap belongs — not in front of a user.
 */
export function annotated<T extends { name: string }>(tools: T[]): T[] {
  return tools.map((tool) => {
    const title = TOOL_TITLES[tool.name];
    if (!title) return tool;
    return {
      ...tool,
      annotations: READ_ONLY_TOOLS.has(tool.name)
        ? { title, readOnlyHint: true }
        : { title, readOnlyHint: false, destructiveHint: DESTRUCTIVE_TOOLS.has(tool.name) },
    };
  });
}
