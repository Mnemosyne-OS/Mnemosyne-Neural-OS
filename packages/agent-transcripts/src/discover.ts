/**
 * Which agent harnesses actually left transcripts on this machine.
 *
 * ## Why this is allowed to probe, when a connector may not choose where to read
 *
 * Doc 93 §3 forbids a connector from declaring WHERE to read, because a
 * connector is data a stranger can ship and would otherwise point at `~/.ssh`.
 * That rule is intact here, and the reason is worth stating rather than
 * assumed:
 *
 *  - The list of places probed is built from the connectors COMPILED INTO this
 *    package. A third party cannot add one without editing an MIT package the
 *    user installed and can read.
 *  - Each `folderHint` is home-relative and resolved here, so nothing outside
 *    the user's home is ever reachable, and no path arrives from a payload.
 *  - A folder that does not exist is skipped in silence, and every caller is
 *    handed the list of folders that WERE read so it can print them.
 *  - `MNEMO_AGENT_SOURCES` restricts the set, and naming one source is how you
 *    say "only this one".
 *
 * What this buys is the thing that was actually asked for: a Claude Code
 * session seeing that an Antigravity session is live in the same repository.
 * Behind three environment variables nobody would have set, it would not exist.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { CONNECTORS, type Connector, type ConnectorId } from './index';

export interface DiscoveredSource {
  id: ConnectorId;
  connector: Connector;
  /** Absolute, and confirmed to exist at discovery time. */
  root: string;
  /** True when a human named this folder rather than it being found. Printed,
   *  because "you told me to look here" and "I looked where this agent usually
   *  writes" are different claims about the same list. */
  declared: boolean;
}

/** Session connectors, in the order a listing shows them. Document connectors
 *  (notes) are not session sources and never appear here. */
const SESSION_SOURCES: ConnectorId[] = ['claude-code', 'antigravity', 'antigravity-ide'];

/** `MNEMO_AGENT_SESSIONS_ANTIGRAVITY_IDE` for `antigravity-ide`. */
function envKeyFor(id: ConnectorId): string {
  return `MNEMO_AGENT_SESSIONS_${id.toUpperCase().replace(/-/g, '_')}`;
}

/**
 * The folder to try for one source: what the human declared, else where that
 * agent writes by default, resolved under the home directory.
 *
 * `MNEMO_AGENT_SESSIONS` (no suffix) stays bound to claude-code, which is what
 * it has always meant — renaming a variable people already set would break
 * their config to make a comment tidier.
 */
export function rootFor(id: ConnectorId, env: NodeJS.ProcessEnv = process.env): { root: string; declared: boolean } | null {
  const declared = (id === 'claude-code' ? env['MNEMO_AGENT_SESSIONS'] : undefined) ?? env[envKeyFor(id)];
  if (declared && declared.trim()) return { root: resolve(declared.trim()), declared: true };

  const hint = CONNECTORS[id]?.folderHint;
  if (!hint) return null;
  // A hint that is absolute is a connector reaching outside the home. Refused
  // rather than trusted: this is the one place the §3 rule could be bent.
  if (isAbsolute(hint) || hint.includes('..')) return null;
  return { root: resolve(homedir(), hint), declared: false };
}

/**
 * Every shipped session source whose folder exists.
 *
 * `MNEMO_AGENT_SOURCES` is a comma-separated allow-list of ids. Unset means all
 * of them, which is what makes cross-harness awareness work with no config at
 * all. An unknown id there is ignored rather than fatal: a typo must not turn
 * the tool off in silence, and the caller prints what it actually read.
 */
export function discoverSources(env: NodeJS.ProcessEnv = process.env): DiscoveredSource[] {
  const asked = (env['MNEMO_AGENT_SOURCES'] ?? '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const wanted = asked.length
    ? SESSION_SOURCES.filter(id => asked.includes(id))
    : SESSION_SOURCES;

  const out: DiscoveredSource[] = [];
  for (const id of wanted) {
    const where = rootFor(id, env);
    if (!where) continue;
    if (!existsSync(where.root)) continue;
    out.push({ id, connector: CONNECTORS[id], root: where.root, declared: where.declared });
  }
  return out;
}

/**
 * What a source was ASKED to read, whether or not it exists.
 *
 * Needed for the "nothing found" message: telling someone no folder was found
 * is only useful if you say which ones you looked for.
 */
export function attemptedRoots(env: NodeJS.ProcessEnv = process.env): { id: ConnectorId; root: string }[] {
  const out: { id: ConnectorId; root: string }[] = [];
  for (const id of SESSION_SOURCES) {
    const where = rootFor(id, env);
    if (where) out.push({ id, root: where.root });
  }
  return out;
}
