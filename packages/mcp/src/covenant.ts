/**
 * covenant.ts — the agent-facing self-description of Mnemosyne OS.
 *
 * This is what a connecting agent is told about WHAT Mnemosyne is and HOW to
 * behave with it — surfaced two ways:
 *   1. as the MCP server-level `instructions` string (read on connect), and
 *   2. as the `mnemosyne_about` tool (read on demand).
 *
 * It is NOT the repo's CLAUDE.md (those are coding conventions for building
 * Mnemosyne). This is the governance + memory-handling covenant an external
 * agent operating on a human's memory must honor.
 *
 * Keep it dense: every agent pays a context cost to read it.
 *
 * @module @mnemosyne_os/mcp/covenant
 */

/** Structured facts, for the `mnemosyne_about` tool (machine-readable). */
export const MNEMOSYNE_ABOUT = {
  name: 'Mnemosyne OS',
  tagline: 'A sovereign, local-first memory operating system for a human.',
  what: [
    'Mnemosyne OS is a personal memory OS that lives on the user\'s own machine.',
    'Memory is organized into VAULTS — isolated stores, one per life domain (code, notes, research, journal, social, …).',
    'Each memory is a CHRONICLE: content + a spineType (its semantic kind) + a vector embedding.',
    'You reach it by semantic retrieval (RAG): query returns ranked chronicles; ask returns a synthesized answer grounded in them.',
  ],
  governanceTenet:
    'Memory perceives, situates, and reveals; the human governs. ' +
    'Mnemosyne never silently deletes, never judges truth, and never mixes ' +
    'domains without the human\'s consent.',
  vaultProtection: {
    protection: {
      NORMAL: 'Ordinary domain memory. Readable/writable within its declared scope.',
      MAXIMUM: 'Private/sensitive (e.g. a personal journal). Never read it for cross-vault work, never expose or mix its content, never write to it, unless the user explicitly asks in this conversation.',
    },
    mixableWith:
      'Which other vaults this one may be blended with. `["*"]` = open to mixing. ' +
      '`[]` = ISOLATED: do not cross-pollinate it with any other vault (private vaults and benchmark/sandbox vaults both use this).',
    visibleInNeuralMap:
      '`false` marks a vault that is not real, cross-pollinatable memory — a benchmark sandbox or a private store. Treat its spine types and content as out-of-band; never surface them as if they were the user\'s real knowledge.',
  },
  spineModel:
    'spineType classifies each chronicle and weights retrieval (e.g. ARCHITECTURE is boosted for design questions, GIT_HISTORY for "what changed", BUGFIX for incidents). ' +
    'Call mnemosyne_spine_assignments to see a vault\'s actual taxonomy rather than guessing.',
  sandboxPrinciple:
    'An app/agent may be given its OWN isolated sandbox vault (id = APP-<app name>), walled off by default (mixableWith:[], hidden from the neural map, excluded from the dream layer). ' +
    'It can write freely there. It can NEVER unlock mixing its data into the user\'s real memory — only the human does that from the Vault Manager, after testing the app. Permanence is a human decision, not an agent action. ' +
    'SDK apps request theirs with the `sdk.vault.sandbox.ensure` method (idempotent).',
  rules: [
    'Discover before you target: call mnemosyne_vaults to see which vaults exist and their protection before choosing one. A vault you were not granted returns SCOPE_DENIED — do not try to route around it.',
    'Recall with query/ask; persist with ingest. Ingest is PERMANENT and shared with every future agent — write self-contained content and include WHY, not just what.',
    'Respect protection: never read a MAXIMUM vault for cross-vault work, never mix or expose it, never write to it, unless the user asks in this conversation.',
    'Never blend an isolated vault (mixableWith:[]) into others. Benchmark/sandbox vaults are disposable and must not be presented as the user\'s real knowledge.',
    'Deletion and permission changes are the human\'s to make. Propose them; never perform them silently.',
    'When unsure which vault a request concerns, ask the user rather than guessing across domains.',
  ],
} as const;

/**
 * Renders the covenant as the MCP server `instructions` string (Markdown).
 * Deployment-specific facts (default vault, reachable vaults) are injected so a
 * connecting agent immediately knows this install's layout.
 */
/**
 * The voice clause, added to the briefing only when voice rendering is on.
 *
 * It is separate from the vault rules because it governs a different thing.
 * Everything else here protects what the human KNOWS; this protects what they
 * SOUND LIKE — a recording in someone's voice is a claim that they said it, and
 * an agent that can make one needs the rule in front of it, not in a doc.
 */
const VOICE_COVENANT = [
  '## The voice, when you can render one',
  '- A cloned voice is the identity of a person, not an asset. Produce only what the human asked for, in this conversation.',
  '- Never make a voice say something the person did not choose to say — no impersonation, no put-into-their-mouth, however harmless the framing.',
  '- Always report the file PATH and what was spoken. Audio the human cannot find is audio they cannot check.',
  '- A clone name that does not exist is REFUSED, never substituted. Do not retry with another voice: a voice-over in the wrong voice sounds perfect and is worthless.',
  '- The render is a job. Poll it; never restart one that is still running — the engine speaks one thing at a time.',
].join('\n');

/**
 * The agent-awareness tools, briefed separately because they obey different
 * rules from everything else here: they touch no vault, need no running app,
 * and answer about OTHER PEOPLE'S sessions. An agent that does not know the
 * second half will over-read the answers.
 */
const AGENTS_COVENANT = (roots: string[]): string => [
  '## Seeing the other agents on this machine',
  '`mnemosyne_agents`, `mnemosyne_agent_collisions` and `mnemosyne_agent_files` read the',
  'transcripts coding-agent harnesses already write to disk. They touch no vault, need no',
  'running app and cost no tokens.',
  '',
  `- Folders looked in: ${roots.map(r => `\`${r}\``).join(', ')}. Every shipped connector whose folder exists is read, so this can see an agent from a DIFFERENT harness in your repository. Each answer names the folders it actually opened.`,
  '- **Call `mnemosyne_agent_collisions` before `git add -A`, before a commit and before a',
  '  rebase.** The git index is shared by every process in one working tree, so a commit from',
  '  one session picks up whatever another has staged.',
  '- **Never read these answers as "that agent is working".** A crashed agent and an idle one',
  '  fall equally silent. The answer says when a line was last SEEN; you conclude.',
  '- **A clean answer is not proof the machine is quiet.** It covers the folders named above.',
  '  A session whose transcripts live elsewhere does not appear at all.',
  '- Files are marked `recorded` (the harness logged a write) or `from a command` (a',
  '  redirection was read out of a shell command that may never have completed). Do not',
  '  treat the second as a fact about the disk.',
  '- These tools return METADATA only — never message text, never file contents. Do not ask',
  '  them for either, and do not infer content from a path.',
].join('\n');

export function renderCovenant(opts: { defaultVault: string; declaredVaults: string[]; voice?: boolean; agentsRoots?: string[] }): string {
  const a = MNEMOSYNE_ABOUT;
  const others = opts.declaredVaults.filter(v => v !== opts.defaultVault);
  return [
    `# ${a.name} — ${a.tagline}`,
    '',
    a.what.map(l => `- ${l}`).join('\n'),
    '',
    '## Governance tenet',
    a.governanceTenet,
    '',
    '## How to behave',
    a.rules.map((r, i) => `${i + 1}. ${r}`).join('\n'),
    '',
    '## Vault protection you must honor',
    `- **protection NORMAL** — ${a.vaultProtection.protection.NORMAL}`,
    `- **protection MAXIMUM** — ${a.vaultProtection.protection.MAXIMUM}`,
    `- **mixableWith** — ${a.vaultProtection.mixableWith}`,
    `- **visibleInNeuralMap:false** — ${a.vaultProtection.visibleInNeuralMap}`,
    '',
    '## Sandbox principle',
    a.sandboxPrinciple,
    '',
    ...(opts.voice ? [VOICE_COVENANT, ''] : []),
    ...(opts.agentsRoots?.length ? [AGENTS_COVENANT(opts.agentsRoots), ''] : []),
    '## This install',
    `- Default vault: **${opts.defaultVault}**`,
    // "Reachable" was a claim nobody had measured. This text is rendered at
    // connect time, before any host contact, so it can only ever report what
    // the CONFIG declares — say that, and send the agent to the one tool that
    // does measure. Naming a vault here that is not mounted sent agents to
    // addresses that could not answer (DEV and PERSONAL, found 2026-08-31).
    `- Vaults this MCP is scoped for (config, not a census — some may not be mounted here): ${others.length ? others.map(v => `**${v}**`).join(', ') : '(none)'}`,
    '- Call `mnemosyne_vaults` for the vaults that actually exist on this machine, with their chronicle counts and protection.',
    '',
    '_Call `mnemosyne_about` any time to re-read this. Call `mnemosyne_vaults` to see live vaults and their protection._',
  ].join('\n');
}
