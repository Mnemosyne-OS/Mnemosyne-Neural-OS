#!/usr/bin/env node
/**
 * @mnemosyne_os/mcp — MCP Server
 *
 * Exposes Mnemosyne OS as an MCP (Model Context Protocol) server. AI agents
 * (Claude, Cursor, Copilot, …) call these tools to reach the vault memory,
 * the active resonances and the git log.
 *
 * Transport: stdio (standard MCP)
 * Connection: ws://127.0.0.1:7799 (Mnemosyne OS SDK WebSocket server)
 *
 * Configure it in claude_desktop_config.json or .cursor/mcp.json:
 * ```json
 * {
 *   "mcpServers": {
 *     "mnemosyne": {
 *       "command": "npx",
 *       "args": ["-y", "@mnemosyne_os/mcp"]
 *     }
 *   }
 * }
 * ```
 *
 * [MCP][LAYER-2][ZERO-TRUST][SOVEREIGN-AI]
 */

import { PKG_VERSION }        from './version.js';
import { Server }              from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
// [SDK-INDEPENDENT] We do NOT import `@mnemosyne_os/sdk` here. Its 1.1.0 bundle
// crashes on `node` ESM startup with `Dynamic require of "events" is not
// supported` (tsup-bundled ws calls __require2() at module load time). The MCP
// must boot under plain `node dist/index.js` because that's how Claude Desktop
// and Claude Code launch it. We talk the same wire protocol via a local client.
import { MnemoWsClient, type VoiceJob } from './ws-client.js';
import { unwrapContent, selectResonances, toResonanceView, voiceError, renderReport } from './format.js';
import { renderCovenant } from './covenant.js';
import { toVaultToken, resolveVaultTarget, refuseUndeclaredWriteTarget } from './vault-target.js';
import { AGENT_TOOLS, handleAgentTool, sessionsRoots } from './agents.js';
import { handleTodoAdd } from './todo-tool.js';
import { handleTodoApply, handleTodoList } from './todo-edit-tool.js';
import { handleAgendaList, handleAgendaRemove, handleAgendaUpdate } from './agenda-edit-tool.js';
import { handleCockpitUpdate } from './cockpit-tool.js';
import { handleAgendaAdd } from './agenda-tool.js';
import { needsRunningApp, FILE_PATH_CAVEAT, APP_NOT_RUNNING_MESSAGE } from './app-only-tools.js';
import { spawn }         from 'node:child_process';
import { existsSync }    from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ── App Manifest for MCP server ────────────────────────────────────────────────

// ── Configuration (env-driven, generic defaults) ──────────────────────────────
//
// The MCP ships with neutral defaults that work for any Mnemosyne OS install
// (DEV is the host's own fallback name — it is NOT guaranteed to be mounted;
// see the note below). Each deployment surfaces its own vault layout via two
// env vars set in the host's MCP config (claude_desktop_config.json, .mcp.json…):
//
//   MNEMO_DEFAULT_VAULT=DEVELOPPEMENT          ← default vault for query/ingest
//   MNEMO_VAULTS=DEVELOPPEMENT,NOTES,RECHERCHE ← extra vaults to declare scopes for
//
// The Infinity Edition exposes one vault per tracked folder, so users typically
// list their main code/notes/research folders here.
//
// Two names ARE hard-coded below, and the comment that used to sit here claimed
// the opposite. DEV / PERSONAL / SOCIAL are not a leftover of a fixed-vault era:
// the host still routes them specially today (`BUILTIN_VAULT_IDS` in
// pulse-router.ts), so this server keeps declaring scopes for them — an install
// where they exist must stay reachable. What they are NOT is guaranteed to
// exist: `devVault` / `personalVault` / `socialVault` are all optional on the
// host, and on the install where this was found only SOCIAL was mounted.
//
// So the three names stay ACCEPTABLE and stop being ADVERTISED. A declared
// scope says "I am allowed to ask for this"; only a census says "this exists".
// Conflating the two is what handed agents two addresses that cannot answer.

// Whether a human actually NAMED the default, or whether we are falling back.
// The two are not the same promise: a declared default is a place someone
// chose, the fallback is the host's "first mounted sub-vault" alias. Writes are
// allowed to rely on the first and refuse the second — see
// refuseUndeclaredWriteTarget in vault-target.ts.
const DEFAULT_VAULT_DECLARED = Boolean((process.env['MNEMO_DEFAULT_VAULT'] ?? '').trim());
const DEFAULT_VAULT = (process.env['MNEMO_DEFAULT_VAULT'] ?? 'DEV').toUpperCase();
const RESERVED_VAULTS = ['DEV', 'PERSONAL', 'SOCIAL']; // host built-ins, may or may not be mounted
const EXTRA_VAULTS    = (process.env['MNEMO_VAULTS'] ?? '')
  .split(',').map(v => v.trim().toUpperCase()).filter(Boolean);
const DECLARED_VAULTS = Array.from(new Set([
  DEFAULT_VAULT,
  ...RESERVED_VAULTS,
  ...EXTRA_VAULTS,
]));

/**
 * What the host actually exposes, once measured. `null` means nobody has
 * measured it yet — never "there are none".
 *
 * Only successes are cached. A listing that failed because the app was closing
 * must not freeze this server into "unmeasurable" for the rest of its life,
 * and the retry costs one RPC on a path that only runs when a call is already
 * being refused.
 */
let vaultCensus: readonly string[] | null = null;

async function measureVaults(client: MnemoWsClient): Promise<readonly string[] | null> {
  if (vaultCensus) return vaultCensus;
  try {
    const r = await client.vaultsList();
    if (!r.success || !Array.isArray(r.vaults)) {
      console.error(`[mnemosyne-mcp] vault census unavailable: ${r.error ?? 'no vaults in reply'}`);
      return null;
    }
    // Same derivation `mnemosyne_vaults` prints: the host's id is a PATH, and
    // the token is its last segment. Comparing raw ids against env-style tokens
    // is the mismatch that made the ⚠️ flag fire on every vault once already.
    vaultCensus = r.vaults
      .map(v => toVaultToken(String(v.id ?? '')) || toVaultToken(String(v.name ?? '')))
      .filter(Boolean);
    return vaultCensus;
  } catch (err) {
    console.error('[mnemosyne-mcp] vault census failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Resolves an agent-supplied vault to a token the host will accept, or returns
 * the refusal text to hand straight back. See vault-target.ts for why the id
 * printed by `mnemosyne_vaults` could never work as a target.
 *
 * Resolved twice on purpose. The happy path pays nothing — no host round-trip,
 * same pure call as before. The census is fetched only once a refusal is
 * certain, because that is the only moment this server prints a list of
 * destinations, and a destination list nobody measured is how DEV and PERSONAL
 * came to be offered on an install that has neither.
 *
 * `intent` carries the read/write asymmetry pulse-router already settled on: a
 * read landing in the wrong vault is visible and recoverable, a write is
 * permanent. So an unnamed target on an unconfigured deployment is tolerated
 * for reads and refused for writes.
 */
async function targetVault(
  client: MnemoWsClient,
  raw:    unknown,
  intent: 'read' | 'write' = 'read',
): Promise<{ vault: string } | { refusal: string }> {
  const requested = raw === undefined || raw === null ? undefined : String(raw);

  if (intent === 'write' && !requested?.trim() && !DEFAULT_VAULT_DECLARED) {
    return { refusal: refuseUndeclaredWriteTarget(DECLARED_VAULTS, await measureVaults(client)) };
  }

  const r = resolveVaultTarget(requested, DECLARED_VAULTS, DEFAULT_VAULT);
  if (r.ok) return { vault: r.vault };

  const present = await measureVaults(client);
  const measured = resolveVaultTarget(requested, DECLARED_VAULTS, DEFAULT_VAULT, present);
  return { refusal: measured.ok ? r.error : measured.error };
}

/**
 * Voice rendering — OFF unless the host's MCP config asks for it:
 *
 *   "env": { "MNEMO_VOICE": "1" }
 *
 * Opt-in for two reasons, and neither is timidity. Declaring `voice:speak`
 * makes the OS ask the human to authorize cloning their voice — a dialog that
 * has no business appearing for someone who installed this to search their
 * notes. And four extra tools sit in the context window of every agent that
 * connects, whether or not it will ever make audio.
 *
 * So the capability is opted into twice: once in config, once in the dialog.
 * For a thing that can produce a recording of someone saying words they never
 * said, twice is the right number.
 */
const VOICE_ENABLED = process.env['MNEMO_VOICE'] === '1';

/**
 * Poll a render until it settles or the caller's patience runs out.
 *
 * Returning the job either way is the point: an agent that gets a timeout
 * cannot tell a slow render from a dead one, and its natural next move — start
 * again — doubles a wait it was already inside, on an engine that can only do
 * one synthesis at a time. So a render still going comes back as a render still
 * going, with the id to poll.
 *
 * The interval widens as the wait grows: a short script is caught within a
 * second, a long one is not polled sixty times for nothing.
 */
async function waitForRender(
  client: MnemoWsClient,
  started: VoiceJob,
  waitSeconds: number,
): Promise<VoiceJob> {
  const deadline = Date.now() + waitSeconds * 1000;
  let job = started;
  let interval = 1_000;
  while (job.state === 'rendering' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, Math.min(interval, Math.max(0, deadline - Date.now()))));
    interval = Math.min(interval * 1.4, 8_000);
    const r = await client.voiceStatus(job.id);
    // A status call that fails mid-wait must not erase what we already know:
    // keep the last good snapshot and let the caller poll again.
    if (r.success && r.job) job = r.job;
    else break;
  }
  return job;
}

const MCP_MANIFEST = {
  id:              'mnemosyne-mcp',
  name:            'Mnemosyne MCP Server',
  version:         PKG_VERSION,
  mnemosyne_sdk:   '^1.4.0',
  author:          'Mnemosyne Labs',
  description:     'MCP bridge — gives AI agents access to vault memory and resonances',
  // Scopes declared for every vault the deployment cares about. Without these,
  // the server returns SCOPE_DENIED on queries against unlisted vaults.
  scopes:          [
    ...DECLARED_VAULTS.flatMap(v => [`vault:read:${v}`, `vault:write:${v}`]),
    'monorepo:read', 'agents:read',
    // [v1.2] Read-only introspection: Dream State bridges.
    'bridge:read',
    // [v1.7] The human's To-do backlog. Its own scope: a vault write is not a
    // backlog write. Not sensitive — first-party auto-grant applies.
    'todo:write',
    // [v1.9] READING the backlog is its own act. `todo:write` lets a caller put
    // things in; it does not let it enumerate what is already there, and the
    // change tools need the ids that read hands back. Not sensitive -
    // first-party auto-grant applies, as it already did to the write.
    'todo:read',
    // [v1.8] The human's calendar. Its own scope, same reasoning as the
    // backlog above: filing a task is not filing an appointment. Not
    // sensitive — first-party auto-grant applies.
    'agenda:write',
    // [v1.9] Same split for the calendar.
    'agenda:read',
    // [v1.8] The agent's own status card on the human's canvas (doc 110 §9).
    // Presence on the shell, not a read: its own scope, first-party auto-grant.
    'cockpit:write',
    // [v1.6] Voice rendering. A SENSITIVE scope on the host: even though this
    // MCP is first-party, the human is asked for it once, by name, and the
    // dialog says what it means. Declaring it here is a REQUEST, and a denial
    // costs only the voice tools — every memory tool keeps working.
    ...(VOICE_ENABLED ? ['voice:speak'] : []),
  ],
  vaults:          DECLARED_VAULTS,
  intents:         [
    'QUERY', 'INGEST', 'GIT_LOG', 'LIST_AGENTS', 'LIST_VAULTS', 'BRIDGE_READ', 'TODO_WRITE', 'TODO_READ', 'AGENDA_WRITE', 'AGENDA_READ', 'COCKPIT_WRITE',
    ...(VOICE_ENABLED ? ['VOICE_SPEAK'] : []),
  ],
} as any;

// ── Tool definitions ───────────────────────────────────────────────────────────

const TOOLS = [
  {
    name:        'mnemosyne_about',
    description: 'Read who Mnemosyne OS is and the rules you must honor when using it: its governance tenet, the vault protection model (NORMAL/MAXIMUM, mixableWith, isolated sandbox vaults), the spine model, and the do/don\'t behavior for an agent operating on a human\'s memory. The same briefing is delivered as the server instructions on connect — call this to re-read it, or if your client did not surface those instructions.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name:        'mnemosyne_query',
    description: 'Raw chronicle search in a Mnemosyne OS vault. Returns the matching chronicles themselves (architecture notes, code, decisions, sessions, git history) for YOU to read, rank and cite — nothing is rewritten, so this is what to use when you need the source text verbatim, e.g. to quote it or to write documentation from it. Ranked by vector similarity fused with a local BM25 channel, weighted by spineType. ⚠️ If your goal is to FIND something rather than to quote it, prefer mnemosyne_ask even when you only want its sources: measured on 2026-08-31, ask surfaces notes on rare literal terms (proper nouns, identifiers, product names) that this tool misses, because it retrieves deeper and re-ranks. ⛔ And never read the score as confidence: a miss and a hit come back with indistinguishable scores, so judge the returned text, never the number beside it.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type:        'string',
          description: 'The search query — be specific. Examples: "Phase 51 auto-poll implementation", "SDK authentication bug", "why did we choose dual-vector dimensions".',
        },
        limit: {
          type:        'number',
          description: 'Max number of results (default: 10, max: 50)',
          default:     10,
        },
        vault: {
          type:        'string',
          description: `Vault TOKEN to query (case-insensitive; the folder name uppercased, spaces and hyphens as underscores). The path-shaped \`id\` from mnemosyne_vaults is also accepted and normalized. Mnemosyne OS exposes one vault per tracked folder. This deployment's default is "${DEFAULT_VAULT}". Tokens this MCP is SCOPED for — a config list, not a census, so some may not be mounted on this machine: ${DECLARED_VAULTS.filter(v => v !== DEFAULT_VAULT).join(', ') || '(none)'}. Call mnemosyne_vaults for the vaults that actually exist. Anything outside the scoped list is refused.`,
          default:     DEFAULT_VAULT,
        },
        spine_type_filter: {
          type:        'array',
          items:       { type: 'string' },
          description: 'Optional whitelist of spineTypes — restricts results to those types only. Use ["ARCHITECTURE"] to surface design docs over code, ["GIT"] for commit history, ["BUGFIX","DEBUG"] for incident knowledge, ["SOURCE_CODE"] to force code-only. Without this, all types are returned (the SOURCE_CODE scope weighting decides ranking).',
        },
        max_content_chars: {
          type:        'number',
          description: 'Per-chronicle content snippet size in chars (default: 600). Each result is truncated to this length with a hint about total size. Raise to 2000+ when you genuinely need full file content, but be aware results stack up against your context window.',
          default:     600,
        },
      },
      required: ['query'],
    },
  },
  {
    name:        'mnemosyne_ask',
    description: 'Ask Mnemosyne a question and get a SYNTHESIZED prose answer grounded in the vault, PLUS the chronicles it drew on. It runs the full local RAG pipeline — deeper retrieval, lexical fusion and a re-rank — so it is both the reasoning tool AND, measured on 2026-08-31, the better RETRIEVER: reach for it whenever you need to find something, and read the Sources list even if you ignore the prose. Best on "why / who / how" questions spanning many memories ("why was SQLite chosen over Postgres?", "who is <name> and what do they own?"). Slower than mnemosyne_query (up to ~30s). ⚠️ The prose is a model rewording of the sources: never quote it as the words the memory holds — quote the sources, or fetch them with mnemosyne_query. Always check the sources before trusting the answer.',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type:        'string',
          description: 'A natural-language question, as you would ask a knowledgeable colleague. Be specific.',
        },
        vault: {
          type:        'string',
          description: `Vault to reason over (case-insensitive). Default for this deployment: "${DEFAULT_VAULT}". A vault not declared to this MCP is refused with SCOPE_DENIED.`,
          default:     DEFAULT_VAULT,
        },
      },
      required: ['question'],
    },
  },
  {
    name:        'mnemosyne_vaults',
    description: 'List the memory vaults this Mnemosyne OS exposes — each with its TOKEN, display name and chronicle count. Call this first when you are unsure which vault to query/ask/ingest against, or when the user refers to a memory store by a name you have not seen. Pass a returned **token** (bold, e.g. MNEMOSYNE_OS) as the `vault` argument to the other tools — NOT the `id` line, which is the host\'s internal path. Note: you can only read/write the vaults this MCP was configured for (MNEMO_VAULTS); others are flagged here and are refused until added.',
    inputSchema: {
      type:       'object',
      properties: {},
    },
  },
  {
    name:        'mnemosyne_ingest',
    description: 'Persist a memory into the Mnemosyne OS vault — a decision, an architecture note, a debug finding, or a session summary. Stored permanently and indexed for future semantic retrieval by any agent. Use this at the END of a meaningful work session, or whenever you reach a decision that future you (or other agents) would want to recall.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type:        'string',
          description: 'Content to persist (markdown supported). Be self-contained: include WHY the decision was made, not just WHAT.',
        },
        spine_type: {
          type:        'string',
          description: 'Semantic type of the content. ARCHITECTURE is heavily boosted (×1.40) in SOURCE_CODE scope queries — use it for design docs, big-picture decisions, structural choices. DECISION for narrower trade-offs. BUGFIX/DEBUG for incident learnings. SESSION for "here is where I left off". FEATURE for new capabilities. NOTE for everything else.',
          enum:        ['DECISION', 'ARCHITECTURE', 'DEBUG', 'BUGFIX', 'FEATURE', 'NOTE', 'SESSION', 'RESONANCE', 'CUSTOM'],
          default:     'NOTE',
        },
        vault: {
          type:        'string',
          description: `Target vault TOKEN — the folder name uppercased, spaces and hyphens as underscores (e.g. MNEMOSYNE_OS). The path-shaped \`id\` from mnemosyne_vaults is also accepted and normalized. Default for this deployment: "${DEFAULT_VAULT}". Tokens this MCP is SCOPED for — a config list, not a census: ${DECLARED_VAULTS.join(', ')}. Ingest is PERMANENT, so confirm the vault EXISTS with mnemosyne_vaults before writing anywhere you have not written before.`,
          default:     DEFAULT_VAULT,
        },
      },
      required: ['content'],
    },
  },
  {
    name:        'mnemosyne_resonances',
    description: 'List active Resonances — cognitive workspaces tracking ongoing projects. Each resonance has a name, status (active/paused), last position (phase), and last activity timestamp. Use this to understand what projects are currently active and where each one stands.',
    inputSchema: {
      type:       'object',
      properties: {},
    },
  },
  {
    name:        'mnemosyne_get_position',
    description: 'Get the current position of a specific Resonance — the last known phase and description saved by an agent or the cockpit. Use this at the start of a session to know exactly where work left off.',
    inputSchema: {
      type: 'object',
      properties: {
        resonance_id: {
          type:        'string',
          description: 'ID of the resonance (e.g. "agent-cockpit", "mnemosync-p2p")',
        },
      },
      required: ['resonance_id'],
    },
  },
  {
    name:        'mnemosyne_update_position',
    description: 'Update the current position of a Resonance. Call this at the end of a session to record where you left off — phase, current state, next steps. This is persisted as a DECISION chronicle in the vault.',
    inputSchema: {
      type: 'object',
      properties: {
        resonance_id: {
          type:        'string',
          description: 'ID of the resonance to update',
        },
        position: {
          type:        'string',
          description: 'Description of the current position / what was done / what is next',
        },
        phase: {
          type:        'string',
          description: 'Current phase label (e.g. "Phase 52", "v1.1.0 release")',
        },
      },
      required: ['resonance_id', 'position', 'phase'],
    },
  },
  {
    name:        'mnemosyne_git_log',
    description: 'Get recent git commits from the Mnemosyne OS monorepo. Use this to understand what changed recently, which phase is active, and what features were shipped.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type:        'number',
          description: 'Number of commits to return (default: 20)',
          default:     20,
        },
        since: {
          type:        'string',
          description: 'Time range (e.g. "7 days ago", "2024-01-01")',
          default:     '30 days ago',
        },
      },
    },
  },
  {
    name:        'mnemosyne_dream_bridges',
    description: 'List the connections Mnemosyne\'s Dream State engine discovered between memories during its offline (idle-time) scans — "what did you dream about?". Each bridge links two chronicles (possibly across vaults) with a composite Dream Bridge Score (dbs, prime-aware) and a raw cosine similarity, plus a short excerpt of both sides. Use it to surface non-obvious associations the memory found on its own, to audit whether dreamed connections are insightful or noise, or to seed creative exploration. An empty list is normal — it means the dream engine has not produced bridges yet (it runs while the machine is idle, if enabled in Settings).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type:        'number',
          description: 'Max bridges to return, strongest (highest dbs) first (default: 50, server cap: 200).',
          default:     50,
        },
        min_dbs: {
          type:        'number',
          description: 'Only bridges with a Dream Bridge Score at or above this value (0-1).',
        },
        session_id: {
          type:        'string',
          description: 'Restrict to one dream scan session.',
        },
        chronicle_id: {
          type:        'number',
          description: 'Only bridges touching this chronicle id (either endpoint).',
        },
      },
    },
  },
  {
    name:        'mnemosyne_spine_assignments',
    description: 'Inspect how Mnemosyne classified its memories: chronicle → spine assignments for a vault (newest first), whole-vault per-spine counts, and optionally the global spine taxonomy tree. Use it to audit auto-classification quality ("did memories land in the RIGHT spines?"), to see a vault\'s composition at a glance, or to discover the taxon ids to pass as spine_type_filter in mnemosyne_query.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: {
          type:        'string',
          description: `Vault to inspect (case-insensitive). Default for this deployment: "${DEFAULT_VAULT}".`,
          default:     DEFAULT_VAULT,
        },
        spine_type: {
          type:        'string',
          description: 'Restrict the assignment page to one spine taxon id (e.g. "DOCUMENT", "GIT"). Counts stay whole-vault.',
        },
        limit: {
          type:        'number',
          description: 'Max assignments returned (default: 25 to stay context-friendly, server cap: 500).',
          default:     25,
        },
        offset: {
          type:        'number',
          description: 'Pagination offset (default: 0).',
          default:     0,
        },
        include_taxonomy: {
          type:        'boolean',
          description: 'Also return the global spine taxonomy tree (natures → sub-spines).',
          default:     false,
        },
      },
    },
  },

  // ── Agent awareness ────────────────────────────────────────────────────────
  // These read transcript FILES on disk. They do not touch the vault, do not
  // need Mnemosyne OS to be running, and do not spend a token — which is what
  // makes "check before you commit" cheap enough to actually do.
  {
    name:        'mnemosyne_agents',
    description: 'What OTHER coding-agent sessions exist on this machine, read from the transcripts their harnesses already write to disk. Returns metadata only — conversation name, project, git branch, model, last tool, how many files were touched, and when a line was last written. Reads EVERY coding-agent harness installed on this machine, not just your own, so you can see a session from a different agent working in your repository. Use it before you touch shared state. NEVER reports that an agent is "working": a crashed agent and an idle one fall equally silent, so it reports when a line was last SEEN and you conclude. Works with Mnemosyne OS closed.',
    inputSchema: {
      type: 'object',
      properties: {
        live_only: {
          type:        'boolean',
          description: 'Only sessions that wrote a line recently (see the window printed in the answer). Default false, which lists the most recent sessions whether or not they moved lately.',
          default:     false,
        },
        project: {
          type:        'string',
          description: 'Keep only sessions whose project path contains this string. Pass the repository folder name to scope the answer to the repo you are working in.',
        },
        limit: {
          type:        'number',
          description: 'How many transcripts to open PER HARNESS, newest first (default 40, max 200). Capping the merged total instead would let a chatty agent push a quiet one off the end, and the quiet one is the session you did not know about.',
          default:     40,
        },
      },
    },
  },
  {
    name:        'mnemosyne_agent_collisions',
    description: 'Are two agent sessions live in the SAME git working tree and branch right now, from ANY installed harness? This is the one to call before `git add -A`, before a commit, and before a rebase: the git index is shared by every process in one working tree, so a commit from one session picks up whatever the other has staged. Answers from transcript files on disk; needs neither Mnemosyne OS nor a token. Each recorded directory is resolved to its working tree first, because one `cd` into a subfolder would otherwise make two sessions in one repository look like two projects. A clean answer says only that nothing was found IN WHAT IS READABLE — an agent whose transcripts live elsewhere does not appear at all, and sessions whose harness records no directory are listed separately as unplaceable rather than guessed at.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type:        'string',
          description: 'Restrict to one working tree, matched exactly (separators and case are normalised). Pass the output of `git rev-parse --show-toplevel`. Omit to check every project on the machine.',
        },
      },
    },
  },
  {
    name:        'mnemosyne_agent_files',
    description: 'Which FILES other agent sessions have written or edited recently, newest first, with the session each came from. Paths and timestamps only — never file contents. Each entry says how it is known: `recorded` means the harness logged a file-writing tool call, `from a command` means a redirection was read out of a shell command the session ran and may never have completed. Spans every installed harness, and each line names the session and the agent it came from. Use it to see what another session has already touched before you edit the same area.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type:        'string',
          description: 'Keep only files from sessions whose project path contains this string.',
        },
        contains: {
          type:        'string',
          description: 'Keep only paths containing this string. A folder name works as well as a file name.',
        },
        limit: {
          type:        'number',
          description: 'Max files to return (default 40, max 200).',
          default:     40,
        },
      },
    },
  },
  {
    name:        'mnemosyne_cockpit_update',
    description: 'Your own status card on the human\'s canvas (the cockpit). Call it when you START a task ("working" + a short title and status), when you NEED the human ("waiting" — the card pulses and the taskbar flashes), when you are stuck ("blocked"), and when you are DONE ("done"). The state is what you declare; the host prints it next to the time since your last call, so keep calling at real milestones or the card goes quiet. The answer carries any message the human left on your card — read it and act on it. Needs the app window open. Nothing is stored in memory; this is a card, not a note.',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type:        'string',
          enum:        ['working', 'waiting', 'done', 'blocked', 'closed'],
          description: '"working" = on it; "waiting" = you asked the human something and stopped; "done" = the task is finished; "blocked" = you cannot continue without them; "closed" = this conversation is over (removes the card).',
        },
        title: {
          type:        'string',
          description: 'What this conversation is about, in a few words (the card\'s title). Give it at least once; later calls may omit it.',
        },
        status: {
          type:        'string',
          description: 'One line: what you are doing right now, or what you need. 160 characters max.',
        },
        detail: {
          type:        'array',
          items:       { type: 'string' },
          description: 'Up to 4 short lines under the status (files, a branch, a count). Optional.',
        },
        attention: {
          type:        'boolean',
          description: 'Ask for the human\'s eye even in "working"/"done" (the card pulses, the taskbar flashes). "waiting" and "blocked" ask on their own.',
          default:     false,
        },
        session: {
          type:        'string',
          description: 'Only when the harness publishes no CLAUDE_CODE_SESSION_ID: a stable id for this conversation, reused on every call.',
        },
      },
      required: ['state'],
    },
  },
  {
    name:        'mnemosyne_todo_add',
    description: 'Put tasks into the human\'s To-do backlog (the To-do widget on their canvas) — in order, optionally under named steps. Use it when a conversation has settled WHAT to do: "make tasks out of everything we said we would do". Name the list ("list") — call once without it to be told the lists that exist on a LIST_NOT_FOUND answer — or pass create_list: true to make a new one. Never assume a default list. The host routes the write through the widget\'s own store, so what you file is exactly what the human sees. ' + FILE_PATH_CAVEAT + ' To read the backlog back or change what is in it, see mnemosyne_todo_list, mnemosyne_todo_update and mnemosyne_todo_lists.',
    inputSchema: {
      type: 'object',
      properties: {
        tasks: {
          type:        'array',
          description: 'The tasks, in execution order. Each item is a string, or {"text": string, "group": string} where group is the STEP the task belongs to (e.g. "Step 1 · Mockup"); tasks with the same group are shown under one header in the list. One concrete, actionable line each; 300 characters max.',
          items: {
            anyOf: [
              { type: 'string' },
              { type: 'object', properties: { text: { type: 'string' }, group: { type: 'string' } }, required: ['text'] },
            ],
          },
        },
        list: {
          type:        'string',
          description: 'Displayed name of the destination list (case-insensitive), e.g. "En cours", "WIP", or a list the human created. Omitted = the first original list. Unknown name + create_list false = refused with the names that exist.',
        },
        create_list: {
          type:        'boolean',
          description: 'Create the list named in "list" when it does not exist. Default false: an agent must not invent lists in someone\'s backlog without saying so.',
          default:     false,
        },
        color: {
          type:        'string',
          description: 'Hex colour (#rrggbb) for a list being created. Optional; the host picks the next swatch otherwise.',
        },
      },
      required: ['tasks'],
    },
  },
  {
    name:        'mnemosyne_todo_list',
    description: 'Read the human\'s To-do backlog back: the lists that exist and the tasks in them, each with the ID you must use to change it. Call this BEFORE mnemosyne_todo_update - that tool names tasks by id and never by text, because "delete the task about the invoice" is how the wrong task goes, in a sentence that reads perfectly either way. Also the way to answer "what is on my plate" or to check whether something is already filed before adding a duplicate. ' + FILE_PATH_CAVEAT + ' Scope todo:read.',
    inputSchema: {
      type: 'object',
      properties: {
        list: {
          type:        'string',
          description: 'Only this list, by displayed name (case-insensitive) or by the key shown in brackets. Omitted = every list. A name that matches nothing returns NO tasks rather than silently widening to all of them.',
        },
        include_done: {
          type:        'boolean',
          description: 'Include tasks already checked off. Default false: the open ones are what almost every question is actually about. Tasks moved to the ARCHIVE are never listed, only counted.',
          default:     false,
        },
        limit: {
          type:        'number',
          description: 'Maximum tasks returned (default and ceiling: 300). The answer always says how many matched and how many were cut.',
        },
      },
    },
  },
  {
    name:        'mnemosyne_todo_update',
    description: 'CHANGE the human\'s To-do backlog: edit a task, tick it off, move it to another list, or take it out. Every operation names a task by the id from mnemosyne_todo_list - call that first. Removing a task ARCHIVES it by default (it leaves the list and can be restored); pass permanent: true only when the human asked for it to be deleted outright. The whole batch is applied in order as ONE save, and each operation reports its own outcome, so a stale id does not sink the ones around it. ' + FILE_PATH_CAVEAT + ' Scope todo:write.',
    inputSchema: {
      type: 'object',
      properties: {
        ops: {
          type:        'array',
          description: 'The changes, applied in order. Up to 100 per call.',
          items: {
            type: 'object',
            properties: {
              op: {
                type:        'string',
                enum:        ['edit', 'complete', 'move', 'remove'],
                description: 'edit = rewrite text/description/colour/step/due date. complete = tick or un-tick. move = send to another list. remove = archive it, or delete it with permanent: true.',
              },
              task: { type: 'string', description: 'The task id, exactly as mnemosyne_todo_list printed it in brackets.' },
              text: { type: 'string', description: 'edit: the new text. Omit to leave it alone; it can never be emptied.' },
              description: { type: ['string', 'null'], description: 'edit: new notes. null clears them; omitting leaves them alone.' },
              group: { type: ['string', 'null'], description: 'edit: the STEP heading this task sits under. null removes it.' },
              dueAt: { type: ['number', 'null'], description: 'edit: due date as epoch milliseconds. null clears it.' },
              color: { type: ['string', 'null'], description: 'edit: hex colour, or null to clear.' },
              done: { type: 'boolean', description: 'complete: true ticks it, false re-opens it. Ticking records the human\'s streak; un-ticking never takes it back.' },
              list: { type: 'string', description: 'move: the destination list, by displayed name or key.' },
              permanent: {
                type:        'boolean',
                description: 'remove: true DELETES the task outright, and it is not in the archive afterwards. Default false = archived, recoverable. Only pass true when the human asked to delete rather than to tidy away.',
                default:     false,
              },
            },
            required: ['op', 'task'],
          },
        },
      },
      required: ['ops'],
    },
  },
  {
    name:        'mnemosyne_todo_lists',
    description: 'Manage the LISTS of the human\'s To-do backlog: create one, rename or recolour one, remove an empty one. Separate from mnemosyne_todo_update because these change the shape of someone\'s workspace rather than the work in it. Two refusals worth knowing before you call: a list that still HOLDS tasks is never removed (you are told how many are in the way - move them first, the host will not pick a destination on someone\'s behalf), and the three original lists can be renamed but never removed, because their contents are what make the file readable at all. ' + FILE_PATH_CAVEAT + ' Scope todo:write.',
    inputSchema: {
      type: 'object',
      properties: {
        ops: {
          type:        'array',
          description: 'The changes, applied in order - so you can create a list and rename another in one call.',
          items: {
            type: 'object',
            properties: {
              op: {
                type:        'string',
                enum:        ['list.create', 'list.edit', 'list.remove'],
                description: 'list.create = a new empty list. list.edit = rename and/or recolour. list.remove = delete an EMPTY, non-original list.',
              },
              name: { type: 'string', description: 'list.create: the name. list.edit: the new name; passing an empty string on one of the three ORIGINAL lists gives it back its localised default name.' },
              color: { type: 'string', description: 'Hex colour (#rrggbb). Optional; the host picks the next swatch for a new list.' },
              list: { type: 'string', description: 'list.edit / list.remove: which list, by displayed name or key.' },
            },
            required: ['op'],
          },
        },
      },
      required: ['ops'],
    },
  },
  {
    name:        'mnemosyne_agenda_list',
    description: 'Read the human\'s calendar back: the appointments in a time window, each with the ID you must use to change or remove it. Call this BEFORE mnemosyne_agenda_update or mnemosyne_agenda_remove - both name appointments by id and never by title or date, because the calendar has no archive and a removal cannot be undone. A repeating event appears ONCE, with its cadence and the date of its next occurrence. Times in the answer are the human\'s machine local time. ' + FILE_PATH_CAVEAT + ' Scope agenda:read.',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type:        'string',
          description: 'ISO 8601 date-time (or epoch ms). Only appointments with an occurrence at or after this. Omitted = now.',
        },
        to: {
          type:        'string',
          description: 'ISO 8601 date-time (or epoch ms). Only appointments with an occurrence at or before this. Omitted = no upper bound, which for a repeating event means it always counts.',
        },
        include_past: {
          type:        'boolean',
          description: 'Include appointments with no occurrence left. Default false. Those ones come back with no "next" date rather than with their original start dressed up as a future one.',
          default:     false,
        },
        limit: { type: 'number', description: 'Maximum appointments returned (default and ceiling: 200).' },
      },
    },
  },
  {
    name:        'mnemosyne_agenda_update',
    description: 'CHANGE an appointment already in the human\'s calendar: move it, rename it, add or drop a reminder, start or stop it repeating. Names appointments by the id from mnemosyne_agenda_list - call that first. A field you leave out is left alone; passing null CLEARS it. A start or end time that cannot be read REFUSES the change rather than leaving the old one silently in place, and a cadence that is not one of daily/weekly/monthly/yearly is refused rather than quietly turned into a one-off. ' + FILE_PATH_CAVEAT + ' Scope agenda:write.',
    inputSchema: {
      type: 'object',
      properties: {
        changes: {
          type:        'array',
          description: 'One entry per appointment. Up to 50 per call.',
          items: {
            type: 'object',
            properties: {
              event_id: { type: 'string', description: 'The appointment id, exactly as mnemosyne_agenda_list printed it in brackets.' },
              title: { type: 'string', description: 'New title. Cannot be emptied.' },
              start: { type: 'string', description: 'New start, ISO 8601. No timezone offset = the HUMAN\'S OWN machine local time, never UTC.' },
              end: { type: ['string', 'null'], description: 'New end, ISO 8601. null makes it a point in time rather than a block.' },
              all_day: { type: 'boolean', description: 'Day marker with no specific time.' },
              location: { type: ['string', 'null'], description: 'null clears it.' },
              description: { type: ['string', 'null'], description: 'null clears it.' },
              recurrence: {
                type:        ['string', 'null'],
                description: 'daily / weekly / monthly / yearly, or null to STOP repeating (which also drops the series end date, since it would describe a series that no longer exists).',
              },
              alarm_minutes_before: {
                type:        ['number', 'null'],
                description: 'Minutes before the start a reminder rings; null removes the reminder. Changing only this keeps the existing ring sound and volume.',
              },
            },
            required: ['event_id'],
          },
        },
      },
      required: ['changes'],
    },
  },
  {
    name:        'mnemosyne_agenda_remove',
    description: 'REMOVE appointments from the human\'s calendar. Read them with mnemosyne_agenda_list first and pass the ids: this tool never matches by title or by date, because "remove my meetings on Thursday" is how an agent removes the wrong Thursday. THERE IS NO ARCHIVE - unlike a To-do task, a removed appointment is gone, so the answer names each one it removed by title and start time, for the human to check. A repeating appointment is removed as the whole SERIES; the calendar has no way to cancel a single occurrence. ' + FILE_PATH_CAVEAT + ' Scope agenda:write.',
    inputSchema: {
      type: 'object',
      properties: {
        event_ids: {
          type:        'array',
          items:       { type: 'string' },
          description: 'The appointment ids to remove, exactly as mnemosyne_agenda_list printed them in brackets. Up to 50.',
        },
      },
      required: ['event_ids'],
    },
  },
  {
    name:        'mnemosyne_agenda_add',
    description: 'Put appointments or deadlines into the human\'s calendar (the Agenda widget on their canvas). Use it when a conversation names a specific date/time to remember — "add this to my calendar", a deadline, a meeting. The host routes the write through the widget\'s own store, so what you file is exactly what the human sees. ' + FILE_PATH_CAVEAT + ' To read the calendar back, change or remove an appointment, see mnemosyne_agenda_list, mnemosyne_agenda_update and mnemosyne_agenda_remove.',
    inputSchema: {
      type: 'object',
      properties: {
        events: {
          type:        'array',
          description: 'One or more appointments to add.',
          items: {
            type: 'object',
            properties: {
              title: {
                type:        'string',
                description: 'What the appointment is, e.g. "Dentist" or "Ship the report".',
              },
              start: {
                type:        'string',
                description: 'ISO 8601 date-time, e.g. "2026-09-10T14:00:00". No timezone offset = read as the HUMAN\'S OWN machine local time, never UTC — do not add a "Z" unless you mean UTC.',
              },
              end: {
                type:        'string',
                description: 'ISO 8601 date-time the appointment ends. Optional; omit for a point-in-time reminder or deadline rather than a block of time.',
              },
              all_day: {
                type:        'boolean',
                description: 'True for a day marker with no specific time (a deadline\'s date, a holiday). Default false.',
              },
              location: { type: 'string', description: 'Optional.' },
              description: { type: 'string', description: 'Optional notes.' },
              recurrence: {
                type:        'string',
                enum:        ['daily', 'weekly', 'monthly', 'yearly'],
                description: 'Omit for a one-off appointment. A recurring event keeps its day-of-month/weekday from "start".',
              },
              alarm_minutes_before: {
                type:        'number',
                description: 'Minutes before "start" a reminder rings in the app. Omit for no reminder. 0 = at the time; 1440 = a day before.',
              },
            },
            required: ['title', 'start'],
          },
        },
      },
      required: ['events'],
    },
  },
];

// ── Voice tools — present only when MNEMO_VOICE=1 (see VOICE_ENABLED) ─────────

/** Tools whose thrown host errors get the voice guidance instead of a raw code. */
const VOICE_TOOL_NAMES = new Set(['mnemosyne_voices', 'mnemosyne_speak', 'mnemosyne_speak_status']);

const VOICE_TOOLS = [
  {
    name:        'mnemosyne_voices',
    description: 'List what can SPEAK on this machine: the local TTS engines (installed or not), the reference voices available for cloning, and where rendered files are written. ALWAYS call this before mnemosyne_speak — it tells you which engine to ask for, which clone names exist (an invented name is refused, never substituted), and warns when a reference clip is too short or not mono to clone well. Requires the Mnemosyne OS app to be running: the voice engines are Python sidecars inside it, and the headless daemon cannot speak.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name:        'mnemosyne_speak',
    description: 'Render a written script to a WAV file using a local voice — including the user\'s own cloned voice. Made for producing voice-overs (TikTok, YouTube, podcast, narration): the audio is written to a file on disk and the PATH is returned, ready to drop on a video timeline. Runs entirely offline on the local engines; nothing is sent to a cloud service.\n\nThis is a JOB, not an instant call: synthesis runs at roughly real time (a 3-minute script takes ~3-4 minutes). The tool waits a while and, if the render is still going, returns a job id — poll it with mnemosyne_speak_status. Long scripts are split at sentence boundaries and re-assembled into ONE file; nothing is truncated.\n\nGOVERNANCE — the voice belongs to a person. Only produce audio the user asked for, tell them the file path and what was said, and never use a cloned voice to make someone appear to say something they did not. If a clone name does not exist the call is REFUSED rather than falling back to another voice: report the error instead of retrying with a different one.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type:        'string',
          description: 'The script to speak, as it should be read aloud. Write it for the EAR: expand abbreviations, spell out numbers and symbols, and use punctuation for pacing — a piece with no grammatical end makes an autoregressive engine ramble. Markdown, bullets and emoji are read literally: strip them first.',
        },
        clone: {
          type:        'string',
          description: 'Reference voice name from mnemosyne_voices ("default" is the sample the user recorded in the app). Omit for the default. A name that does not exist is refused — do NOT guess one.',
        },
        engine: {
          type:        'string',
          description: 'Local engine: "xtts" and "chatterbox" clone a voice, "zonos" adds an emotion vector, "piper" is fast with fixed voices and CANNOT clone. Omit to let the host pick the best installed one.',
        },
        language: {
          type:        'string',
          description: 'Short code for the cloning engines ("fr", "en", "es"…), or a Piper voice id (e.g. "fr_FR-siwis-medium") when engine is "piper". Default: "fr".',
        },
        title: {
          type:        'string',
          description: 'Short label used to name the output file — a human should recognize it a week later ("Short 12 — la mémoire souveraine").',
        },
        speed: {
          type:        'number',
          description: 'Pacing multiplier, 1 = natural. On Chatterbox this is the engine\'s own delivery control, so faster also reads as more animated.',
        },
        wait_seconds: {
          type:        'number',
          description: 'How long to wait for the render before returning a job id to poll (default: 60, max: 240). Raise it for a short script you expect to finish quickly.',
          default:     60,
        },
      },
      required: ['text'],
    },
  },
  {
    name:        'mnemosyne_speak_status',
    description: 'Check a voice render started by mnemosyne_speak: how many segments are done, the estimated time left, and — once finished — the path of the WAV file. Call it with no job id to list every render of this session. A render can also be stopped here (it halts at the next segment boundary and leaves no file).',
    inputSchema: {
      type: 'object',
      properties: {
        job_id: {
          type:        'string',
          description: 'The job id returned by mnemosyne_speak. Omit to list every render.',
        },
        cancel: {
          type:        'boolean',
          description: 'Stop this render instead of reporting on it.',
          default:     false,
        },
      },
    },
  },
];

// ── MCP Server ─────────────────────────────────────────────────────────────────

class MnemoMcpServer {
  private server: Server;
  private client: MnemoWsClient | null = null;

  constructor() {
    this.server = new Server(
      { name: 'mnemosyne-os', version: PKG_VERSION },
      {
        capabilities: { tools: {} },
        // Agent-facing covenant: MCP clients surface `instructions` on connect,
        // so every agent learns what Mnemosyne is + the governance rules it must
        // honor BEFORE touching any vault. Re-readable via `mnemosyne_about`.
        instructions: renderCovenant({ defaultVault: DEFAULT_VAULT, declaredVaults: DECLARED_VAULTS, voice: VOICE_ENABLED, agentsRoots: sessionsRoots() }),
      }
    );

    this._registerHandlers();
  }

  // ── Connect to Mnemosyne OS ──────────────────────────────────────────────────

  private async _connect(tool?: string): Promise<MnemoWsClient> {
    if (this.client?.isConnected) return this.client;

    // First attempt — connect to a backend already listening on 7799
    // (the Infinity app, or a daemon a previous agent spawned).
    try {
      return await this._tryConnect();
    } catch {
      // 🚨 An app-only tool (To-do, calendar, cockpit) gets "start the app" and
      // NOTHING is spawned: the daemon does not know those methods, so it would
      // answer UNKNOWN_METHOD and then hold 7799 for the rest of this session
      // (this socket stays open, its idle exit never fires) — and the app,
      // started afterwards, could not bind its own port (2026-09-06).
      if (needsRunningApp(tool)) {
        throw new McpError(ErrorCode.InternalError, APP_NOT_RUNNING_MESSAGE);
      }
      // No backend yet. Unless disabled, boot the headless daemon once and retry.
      if (process.env['MNEMO_AUTOLAUNCH'] === '0') {
        throw new McpError(
          ErrorCode.InternalError,
          'Cannot connect to Mnemosyne OS (ws://127.0.0.1:7799) and auto-launch is disabled.'
        );
      }
    }

    // The headless daemon is only present in a full monorepo checkout — it is
    // NOT in the published npm tarball (it imports the private core-engine). For
    // an external `npx @mnemosyne_os/mcp` user, spawning a non-existent daemon
    // and then polling for 60s just delays the inevitable. Fail fast with a clear
    // action instead.
    if (!this._spawnDaemon()) {
      throw new McpError(
        ErrorCode.InternalError,
        'Cannot reach Mnemosyne OS on ws://127.0.0.1:7799. Start the Mnemosyne OS app (Infinity Edition) and try again.'
      );
    }

    // Poll for the daemon to come up — embedding model load can take a while.
    const deadline = Date.now() + 60_000;
    let lastErr: unknown;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1_000));
      try {
        return await this._tryConnect();
      } catch (e) {
        lastErr = e;
      }
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Mnemosyne backend did not come up within 60s. Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
    );
  }

  private async _tryConnect(): Promise<MnemoWsClient> {
    const client = new MnemoWsClient(MCP_MANIFEST as any, 7799, 10_000);
    await client.connect();
    client.on('disconnected', () => { this.client = null; });
    this.client = client;
    return client;
  }

  /**
   * Spawns the headless daemon (dist/daemon.js) detached so it outlives this
   * MCP process and can be shared by other agents. Idempotent in practice:
   * if a daemon is already bound to 7799, the new one fails to bind and exits,
   * leaving the original serving.
   */
  private _spawnDaemon(): boolean {
    const here       = dirname(fileURLToPath(import.meta.url));
    const daemonPath = join(here, 'daemon.js');
    // Only present in a monorepo checkout — never in the published tarball.
    if (!existsSync(daemonPath)) {
      console.error('[mnemosyne-mcp] No backend on 7799 and no bundled daemon — start the Mnemosyne OS app.');
      return false;
    }
    console.error(`[mnemosyne-mcp] No backend on 7799 — launching headless daemon: ${daemonPath}`);
    const child = spawn(process.execPath, [daemonPath], {
      detached: true,
      stdio:    'ignore',
      env:      process.env,
    });
    child.unref();
    return true;
  }

  // ── Tool handlers ────────────────────────────────────────────────────────────

  private _registerHandlers(): void {

    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: VOICE_ENABLED ? [...TOOLS, ...VOICE_TOOLS] : TOOLS,
    }));

    // Call tool
    this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const { name, arguments: args = {} } = req.params;

      // Agent awareness reads transcript FILES on disk. Answered BEFORE the
      // connect on purpose: the whole value of "is another session live on my
      // branch" is that it costs nothing and works with the app closed. A
      // backend hop here would make the cheapest question the slowest one.
      if (AGENT_TOOLS.has(name)) {
        return {
          content: [{
            type: 'text',
            text: await handleAgentTool(name, args as Record<string, unknown>),
          }],
        };
      }

      // mnemosyne_about is pure local text: answer it WITHOUT a backend connect,
      // so an agent can read the covenant even before the OS app is running.
      if (name === 'mnemosyne_about') {
        return {
          content: [{
            type: 'text',
            text: renderCovenant({ defaultVault: DEFAULT_VAULT, declaredVaults: DECLARED_VAULTS, voice: VOICE_ENABLED, agentsRoots: sessionsRoots() }),
          }],
        };
      }

      try {
        const client = await this._connect(name);
        return await this._dispatch(client, name, args as Record<string, unknown>);
      } catch (err) {
        if (err instanceof McpError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        // The host THROWS on a denied scope, a missing intent and an unlicensed
        // feature — the same convention every other SDK handler follows. Left as
        // a transport error, those reach the agent as "Mnemosyne OS error:
        // SCOPE_DENIED", which says what happened and nothing about what to do,
        // and the guidance written for exactly these codes would never be seen.
        if (VOICE_TOOL_NAMES.has(name)) {
          return { content: [{ type: 'text', text: voiceError(msg) }] };
        }
        throw new McpError(ErrorCode.InternalError, `Mnemosyne OS error: ${msg}`);
      }
    });
  }

  private async _dispatch(
    client: MnemoWsClient,
    tool:   string,
    args:   Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {

    const text = (s: string) => ({ content: [{ type: 'text', text: s }] });

    switch (tool) {

      // ── mnemosyne_query ──────────────────────────────────────────────────────
      case 'mnemosyne_query': {
        const query           = String(args['query'] ?? '');
        const limit           = Number(args['limit'] ?? 10);
        const target          = await targetVault(client, args['vault']);
        if ('refusal' in target) return text(target.refusal);
        const vault           = target.vault;
        const maxContentChars = Math.max(80, Number(args['max_content_chars'] ?? 600));
        const spineTypeFilter = Array.isArray(args['spine_type_filter'])
          ? (args['spine_type_filter'] as unknown[]).map(String).filter(Boolean)
          : undefined;

        // MnemoWsClient.query() sends `semantic:true` by default — opts into
        // the [SDK-SEMANTIC] branch in pulse-router for SOURCE_CODE-weighted
        // ranking (ARCHITECTURE/GIT/API boosted, tie-break by raw cosine).
        const result = await client.query(query, { limit, vault, semantic: true, spineTypeFilter });

        if (!result.success || result.chronicles.length === 0) {
          const filterHint = spineTypeFilter?.length ? ` (filter: ${spineTypeFilter.join(',')})` : '';
          return text(`No chronicles found for this query${filterHint}.`);
        }

        // Spine types that are design/vision/doc material — their identifiers
        // (class names, file paths, intents) may be idealized and not match the
        // actual source code. Flag them so an agent verifies before trusting.
        const DOC_SPINES = new Set([
          'DOCUMENT', 'VISION', 'NOTE', 'IDEATIONAL', 'HYPOTHESIS', 'CONTEXTUAL', 'CONCERN',
        ]);

        // unwrapContent (SemanticChunker envelope → .raw) is shared with the
        // resonance helpers — imported from ./format.js.
        const truncate = (s: string): { text: string; truncated: boolean; totalLen: number } => {
          const totalLen = s.length;
          if (totalLen <= maxContentChars) return { text: s, truncated: false, totalLen };
          return { text: s.slice(0, maxContentChars).trimEnd() + '…', truncated: true, totalLen };
        };

        const formatted = result.chronicles.map((c, i) => {
          const isDoc      = DOC_SPINES.has(String(c.spineType).toUpperCase());
          const raw        = unwrapContent(c.content ?? '');
          const { text: snippet, truncated, totalLen } = truncate(raw);
          const truncHint  = truncated
            ? `\n\n_(content truncated — ${totalLen} chars total. Re-query with max_content_chars: ${Math.min(totalLen, 4000)} for the full body, or call mnemosyne_query with a more specific text to surface the right chunk.)_`
            : '';
          return [
            `### [${i + 1}] ${c.spineType} · score: ${c.score.toFixed(3)}`,
            `**ID:** ${c.id}`,
            `**Date:** ${new Date(c.timestamp).toLocaleString()}`,
            `**Source:** ${c.source_app_id}`,
            ...(isDoc
              ? ['> ⚠️ Design/vision doc — verify class names, file paths and identifiers against the actual source code before relying on them.']
              : []),
            '',
            snippet || '_(no content)_',
            truncHint,
          ].join('\n');
        }).join('\n\n---\n\n');

        const filterLine = spineTypeFilter?.length
          ? `\nFilter: spineType ∈ {${spineTypeFilter.join(', ')}}` : '';
        return text(`# Mnemosyne Query: "${query}"\n\n${result.chronicles.length} result(s) · snippet=${maxContentChars}c${filterLine}\n\n${formatted}`);
      }

      // ── mnemosyne_ask ────────────────────────────────────────────────────────
      case 'mnemosyne_ask': {
        const question = String(args['question'] ?? '');
        const target   = await targetVault(client, args['vault']);
        if ('refusal' in target) return text(target.refusal);
        const vault    = target.vault;
        if (!question.trim()) return text('Ask what? Provide a `question`.');

        const result = await client.ask(question, { vault });
        if (!result.success) {
          return text(`Mnemosyne could not answer: ${result.error ?? 'unknown error'}`);
        }
        if (!result.answer.trim()) {
          return text(`Mnemosyne has no answer grounded in vault:${vault} for this. Try mnemosyne_query for raw chronicles, or rephrase.`);
        }

        const sources = (result.sources ?? []).slice(0, 6).map((c, i) => {
          const raw     = unwrapContent(c.content ?? '');
          const snippet = raw.length > 200 ? raw.slice(0, 200).trimEnd() + '…' : raw;
          return `- [${i + 1}] ${c.spineType} · ${c.id}${snippet ? ` — ${snippet}` : ''}`;
        }).join('\n');

        const sourcesBlock = sources
          ? `\n\n---\n**Sources (${result.sources.length}) — verify before trusting:**\n${sources}`
          : '\n\n_(no sources returned — treat with caution.)_';

        return text(`# Mnemosyne — "${question}" (vault:${vault})\n\n${result.answer}${sourcesBlock}`);
      }

      // ── mnemosyne_dream_bridges ──────────────────────────────────────────────
      case 'mnemosyne_dream_bridges': {
        const limit       = Number(args['limit'] ?? 50);
        const minDbs      = args['min_dbs']      !== undefined ? Number(args['min_dbs'])       : undefined;
        const sessionId   = args['session_id']   !== undefined ? String(args['session_id'])    : undefined;
        const chronicleId = args['chronicle_id'] !== undefined ? Number(args['chronicle_id'])  : undefined;

        const result = await client.dreamBridges({ limit, minDbs, sessionId, chronicleId });
        if (!result.success) {
          return text(`Could not read dream bridges: ${result.error ?? 'unknown error'}`);
        }
        const bridges = result.bridges ?? [];
        if (bridges.length === 0) {
          return text('No dream bridges yet. The Dream State engine has not produced connections — it runs while the machine is idle (enable/force it in Mnemosyne OS Settings → Dream).');
        }

        const rows = bridges.map((b, i) => [
          `### [${i + 1}] dbs ${b.dbs.toFixed(3)} · cosine ${b.cosine.toFixed(3)} · ${b.scannedAt}`,
          `- **From** [${b.from.chronicleId}] ${b.from.spineType || '?'} (vault:${b.from.vault})${b.from.excerpt ? ` — ${b.from.excerpt}` : ''}`,
          `- **To** [${b.to.chronicleId}] ${b.to.spineType || '?'} (vault:${b.to.vault})${b.to.excerpt ? ` — ${b.to.excerpt}` : ''}`,
        ].join('\n')).join('\n\n');

        return text(`# Dream bridges (${bridges.length})\n\n_Connections Mnemosyne dreamed while idle — judge insightfulness before acting on them._\n\n${rows}`);
      }

      // ── mnemosyne_spine_assignments ──────────────────────────────────────────
      case 'mnemosyne_spine_assignments': {
        // Absent stays absent — the host picks its own default here, and forcing
        // ours would silently narrow a deliberately unscoped listing.
        let vault: string | undefined;
        if (args['vault'] !== undefined) {
          const target = await targetVault(client, args['vault']);
          if ('refusal' in target) return text(target.refusal);
          vault = target.vault;
        }
        const spineType       = args['spine_type'] !== undefined ? String(args['spine_type']) : undefined;
        const limit           = Number(args['limit'] ?? 25);
        const offset          = Number(args['offset'] ?? 0);
        const includeTaxonomy = args['include_taxonomy'] === true;

        const result = await client.spineAssignments({ vault, spineType, limit, offset, includeTaxonomy });
        if (!result.success) {
          return text(`Could not read spine assignments: ${result.error ?? 'unknown error'}`);
        }

        const counts = (result.counts ?? [])
          .map((c) => `- **${c.spineType}**: ${c.count}`)
          .join('\n') || '_(empty vault)_';

        const rows = (result.assignments ?? [])
          .map((a) => `- [${a.chronicleId}] **${a.spineType}** · ${a.createdAt}${a.excerpt ? ` — ${a.excerpt}` : ''}`)
          .join('\n') || '_(no assignments on this page)_';

        const taxonomyBlock = result.taxonomy
          ? '\n\n## Taxonomy (natures → sub-spines)\n' + result.taxonomy
              .map((n) => `- **${n.id}** (${n.label})${n.children?.length ? `: ${n.children.map((c) => c.id).join(', ')}` : ''}`)
              .join('\n')
          : '';

        const filterLine = spineType ? ` · filter: ${spineType}` : '';
        const embedLine  = typeof result.unvectorized === 'number' && result.unvectorized > 0
          ? `\n⚠️ ${result.unvectorized} chronicle(s) have NO embedding yet — invisible to semantic retrieval until vectorized.`
          : '';
        const pageLine   = `page ${offset}–${offset + (result.assignments?.length ?? 0)} of ${result.total}`;
        return text(`# Spine assignments — vault:${result.vault}\n\n${pageLine}${filterLine}${embedLine}\n\n## Per-spine counts (whole vault)\n${counts}\n\n## Assignments (newest first)\n${rows}${taxonomyBlock}`);
      }

      // ── mnemosyne_about ──────────────────────────────────────────────────────
      case 'mnemosyne_about': {
        // Pure, local, no backend call — the covenant is self-contained so an
        // agent can read the rules even when the OS backend is unreachable.
        return text(renderCovenant({ defaultVault: DEFAULT_VAULT, declaredVaults: DECLARED_VAULTS, voice: VOICE_ENABLED, agentsRoots: sessionsRoots() }));
      }

      // ── mnemosyne_vaults ─────────────────────────────────────────────────────
      case 'mnemosyne_vaults': {
        const result = await client.vaultsList();
        if (!result.success) {
          return text(`Could not list vaults: ${result.error ?? 'unknown error'}`);
        }
        const vaults = result.vaults ?? [];
        if (vaults.length === 0) return text('No vaults are currently exposed by Mnemosyne OS.');

        const reachable = new Set(DECLARED_VAULTS);
        const rows = vaults.map((v) => {
          const name  = v.name && v.name !== v.id ? ` (${v.name})` : '';
          const count = typeof v.chronicleCount === 'number' ? ` · ${v.chronicleCount} chronicles` : '';
          // The id is a PATH; comparing it uppercased against env-style tokens
          // matched nothing, so this warning used to fire on EVERY vault —
          // including the reachable ones. Compare the derived token instead.
          const token = toVaultToken(String(v.id)) || toVaultToken(String(v.name ?? ''));
          const scope = reachable.has(token) ? '' : ' · ⚠️ not in MNEMO_VAULTS (add its token there to reach it)';
          // Governance flags an agent must honor (see mnemosyne_about).
          const gov: string[] = [];
          if (v.protection === 'MAXIMUM') gov.push('🔒 MAXIMUM (private — do not read for cross-vault work, mix, or write unless asked)');
          if (Array.isArray(v.mixableWith) && v.mixableWith.length === 0) gov.push('⛓️ isolated (never blend with other vaults)');
          if (v.visibleInNeuralMap === false && v.protection !== 'MAXIMUM') gov.push('🧪 sandbox/out-of-band (not the user\'s real knowledge)');
          const govLine = gov.length ? `\n    ${gov.join(' · ')}` : '';
          // The TOKEN leads, because the token is what the other tools take.
          // Printing the path-shaped id first is what sent agents into
          // SCOPE_DENIED for years — it looks like the identifier, and is not.
          return `- **${token}**${name}${count}${scope}\n    id: \`${v.id}\`${govLine}`;
        }).join('\n');

        return text(`# Vaults exposed by Mnemosyne OS\n\n${rows}\n\n_Pass the bold **token** above as the \`vault\` argument to mnemosyne_query / mnemosyne_ask / mnemosyne_ingest. The \`id\` line is the host's internal path — shown for reference only. Honor the governance flags — see mnemosyne_about._`);
      }

      // ── mnemosyne_ingest ─────────────────────────────────────────────────────
      case 'mnemosyne_ingest': {
        const content   = String(args['content'] ?? '');
        const spineType = String(args['spine_type'] ?? 'NOTE') as 'NOTE';
        // Ingest is PERMANENT: an unresolvable target must stop here, never be
        // quietly retargeted at the default vault.
        const target    = await targetVault(client, args['vault'], 'write');
        if ('refusal' in target) return text(target.refusal);
        const vault     = target.vault as 'DEV';

        const result = await client.ingest({ content, spineType, vault });

        if (!result.success) {
          return text(`Ingest failed: ${result.error ?? 'unknown error'}`);
        }
        return text(`Chronicle ingested successfully.\nID: ${result.chronicleId ?? 'n/a'}\nType: ${spineType} → vault:${vault}`);
      }

      // ── mnemosyne_todo_add ───────────────────────────────────────────────────
      case 'mnemosyne_todo_add': {
        return text(await handleTodoAdd(client, MCP_MANIFEST.id as string, args));
      }

      // ── mnemosyne_cockpit_update ─────────────────────────────────────────────
      case 'mnemosyne_cockpit_update': {
        return text(await handleCockpitUpdate(client, MCP_MANIFEST.id as string, args));
      }

      // ── mnemosyne_agenda_add ─────────────────────────────────────────────────
      case 'mnemosyne_agenda_add': {
        return text(await handleAgendaAdd(client, MCP_MANIFEST.id as string, args));
      }

      // ── reading and changing what is already there ───────────────────────────
      // Each read hands back the ids its sibling write needs. That pairing is
      // the whole safety property: a change names an id, never a title.
      case 'mnemosyne_todo_list': {
        return text(await handleTodoList(client, MCP_MANIFEST.id as string, args));
      }
      case 'mnemosyne_todo_update':
      case 'mnemosyne_todo_lists': {
        return text(await handleTodoApply(client, MCP_MANIFEST.id as string, args));
      }
      case 'mnemosyne_agenda_list': {
        return text(await handleAgendaList(client, MCP_MANIFEST.id as string, args));
      }
      case 'mnemosyne_agenda_update': {
        return text(await handleAgendaUpdate(client, MCP_MANIFEST.id as string, args));
      }
      case 'mnemosyne_agenda_remove': {
        return text(await handleAgendaRemove(client, MCP_MANIFEST.id as string, args));
      }

      // ── mnemosyne_resonances ─────────────────────────────────────────────────
      case 'mnemosyne_resonances': {
        // Pull candidates, then identify resonances STRUCTURALLY (see format.ts):
        // either spineType === 'RESONANCE', or a position chronicle whose body
        // STARTS with the "[RESUME_SESSION] [RESONANCE:<id>]" marker. The old
        // loose `content.includes('[RESONANCE:')` matched the MCP's own source
        // code and dumped a ~189KB blob — fixed here.
        const result     = await client.query('RESONANCE resume session position phase', { limit: 30, vault: DEFAULT_VAULT });
        const resonances = selectResonances(result.chronicles);

        if (resonances.length === 0) {
          return text('No resonances found yet.\nCreate one via the Agent Cockpit, or call mnemosyne_update_position to record where you left off.');
        }

        const now   = Date.now();
        const lines = resonances.map(c => {
          const v = toResonanceView(c, now);
          return `- **${v.id}** · ${v.phase} · updated ${v.agoMin}min ago \`#${v.chronicleId}\``;
        }).join('\n');

        return text(`# Active Resonances (${resonances.length})\n\n${lines}\n\n> Use \`mnemosyne_get_position\` with a resonance ID to see its full position.`);
      }

      // ── mnemosyne_get_position ───────────────────────────────────────────────
      case 'mnemosyne_get_position': {
        const resonanceId = String(args['resonance_id'] ?? '');
        const result = await client.query(`RESUME_SESSION RESONANCE ${resonanceId} position phase`, {
          limit: 5, vault: DEFAULT_VAULT,
        });

        if (!result.success || result.chronicles.length === 0) {
          return text(`No position found for resonance "${resonanceId}".\nTip: Use mnemosyne_update_position to save your current position.`);
        }

        const latest = result.chronicles[0]!;
        const content = latest.content ?? '';
        return text([
          `# Position: ${resonanceId}`,
          `**Last saved:** ${new Date(latest.timestamp).toLocaleString()}`,
          `**Type:** ${latest.spineType}`,
          '',
          '## Content',
          content,
        ].join('\n'));
      }

      // ── mnemosyne_update_position ────────────────────────────────────────────
      case 'mnemosyne_update_position': {
        const resonanceId = String(args['resonance_id'] ?? '');
        const position    = String(args['position'] ?? '');
        const phase       = String(args['phase'] ?? '');

        const content = [
          `[RESUME_SESSION] [RESONANCE:${resonanceId}]`,
          `${phase} — ${new Date().toISOString()}`,
          '',
          position,
        ].join('\n');

        const result = await client.ingest({ content, spineType: 'DECISION', vault: DEFAULT_VAULT });

        if (!result.success) {
          return text(`Failed to update position: ${result.error}`);
        }
        return text(`Position updated for "${resonanceId}".\nPhase: ${phase}\n\n${position}`);
      }

      // ── mnemosyne_git_log ────────────────────────────────────────────────────
      case 'mnemosyne_git_log': {
        const limit = Number(args['limit'] ?? 20);
        const since = String(args['since'] ?? '30 days ago');

        // Call the real sdk.git.log RPC exposed by the OS (repo path is hardcoded
        // server-side for Zero-Trust). Requires monorepo:read scope + GIT_LOG intent.
        const result = await client.gitLog({ limit, since });

        if (!result.success || result.commits.length === 0) {
          return text(`No git commits found (since ${since}).\nNote: git log requires the monorepo:read scope and the OS to have a configured repo path.`);
        }

        const lines = result.commits.map((c) => {
          const date = c.ts ? new Date(c.ts).toLocaleDateString() : '';
          return `- \`${c.hash}\` ${c.message}  _(${c.author}${date ? `, ${date}` : ''})_`;
        }).join('\n');

        return text(`# Git Log (${result.commits.length} commits, since ${since})\n\n${lines}`);
      }

      // ── Voice rendering ───────────────────────────────────────────────────────

      case 'mnemosyne_voices': {
        const r = await client.voiceEngines();
        if (!r.success) return text(voiceError(r.error));

        const engines = (r.engines ?? []).map((e) =>
          `- **${e.id}** — ${e.installed ? 'installed' : 'NOT installed'}${e.clones ? ', can clone a voice' : ', fixed voices only (cannot clone)'}`
        ).join('\n');

        // A missing default sample is stated, not omitted: "no voice recorded"
        // and "a voice is there" must not render the same way.
        const clones = (r.clones ?? []).length
          ? (r.clones ?? []).map((c) => {
              const len = c.seconds === null ? 'length unreadable' : `${c.seconds}s reference`;
              const warn = c.warning ? ` — ⚠ ${c.warning}` : '';
              return `- **${c.name}**${c.isDefault ? ' _(the sample recorded in the app)_' : ''} — ${len}${warn}`;
            }).join('\n')
          : '_No reference voice on this machine. The user records one in the app: Settings → Voice. You cannot create one._';

        const piper = (r.piperVoices ?? []).length ? `\n\n**Piper voices installed:** ${(r.piperVoices ?? []).join(', ')}` : '';
        return text(
          `# Voices available\n\n## Engines\n${engines}\n\n## Reference voices (for cloning)\n${clones}${piper}\n\n`
          + `Rendered files are written to \`${r.outputDir ?? '(unknown)'}\`. Max ${r.maxScriptChars ?? 20000} characters per render — `
          + `split a longer script into scenes.\n\n`
          + `⚠ A clone name not in the list above is REFUSED, never substituted. Do not guess one.`
        );
      }

      case 'mnemosyne_speak': {
        const script = String(args['text'] ?? '');
        if (!script.trim()) return text('Nothing to speak: `text` is empty.');
        const waitSeconds = Math.min(240, Math.max(0, Number(args['wait_seconds'] ?? 60)));

        const started = await client.voiceSpeak({
          text:     script,
          clone:    args['clone']    !== undefined ? String(args['clone'])    : undefined,
          engine:   args['engine']   !== undefined ? String(args['engine'])   : undefined,
          language: args['language'] !== undefined ? String(args['language']) : undefined,
          title:    args['title']    !== undefined ? String(args['title'])    : undefined,
          speed:    args['speed']    !== undefined ? Number(args['speed'])    : undefined,
        });
        if (!started.success || !started.job) return text(voiceError(started.error));

        // Wait, but never silently: whichever way this returns, the agent is
        // told what state the render is actually in and what to do next.
        const job = await waitForRender(client, started.job, waitSeconds);
        return text(renderReport(job, waitSeconds));
      }

      case 'mnemosyne_speak_status': {
        const jobId = args['job_id'] !== undefined ? String(args['job_id']) : '';
        if (args['cancel'] === true) {
          if (!jobId) return text('Give a `job_id` to cancel.');
          const r = await client.voiceCancel(jobId);
          if (!r.success) return text(voiceError(r.error));
          return text(r.stopped
            ? `Render \`${jobId}\` will stop at the next segment boundary (up to ~2s). No file will be written.`
            : `Render \`${jobId}\` was not running — nothing to stop.`);
        }
        const r = await client.voiceStatus(jobId || undefined);
        if (!r.success) return text(voiceError(r.error));
        if (r.job) return text(renderReport(r.job, 0));
        const jobs = r.jobs ?? [];
        if (!jobs.length) return text('No voice render in this session.');
        return text(`# Voice renders (${jobs.length})\n\n` + jobs.map((j) =>
          `- \`${j.id}\` — **${j.state}** · ${j.segmentsDone}/${j.segments} segments · ${j.path ?? 'no file'}`
        ).join('\n'));
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${tool}`);
    }
  }

  // ── Start ────────────────────────────────────────────────────────────────────

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    // stderr only — stdout is reserved for MCP JSON-RPC
    console.error('[mnemosyne-mcp] Server started on stdio — waiting for Mnemosyne OS connection...');
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

const mcpServer = new MnemoMcpServer();
mcpServer.run().catch((err) => {
  console.error('[mnemosyne-mcp] Fatal error:', err);
  process.exit(1);
});
