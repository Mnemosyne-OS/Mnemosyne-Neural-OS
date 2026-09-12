/**
 * What the other agents on this machine are doing — for an agent to read.
 *
 * ## Why this does not go through the app
 *
 * Every other tool in this server talks to Mnemosyne OS over ws://127.0.0.1:7799
 * and fails when the app is not running. These do not. Agent transcripts are
 * plain files that the harness writes as it goes, so the answer is a directory
 * listing and a read: no app, no vault, no token, no model call.
 *
 * That is the difference between a tool an agent might call and one it will:
 * "check whether a colleague is mid-flight in this repo" has to be cheap
 * enough to run before every commit.
 *
 * ## Across harnesses, not just your own
 *
 * Every shipped connector whose folder exists on this machine is read, so a
 * Claude Code session sees an Antigravity session in the same repository. That
 * was the question actually asked, and reading one harness only answers half
 * of it. See `agent-transcripts/discover` for why probing those folders does
 * not break the rule that a connector may never choose where to read.
 *
 * ## What it will not say
 *
 * ⛔ **Never the content.** No message text, no file contents, no tool output.
 * A transcript holds everything that passed in front of an agent for a month,
 * including pasted secrets and source under NDA, and this server hands its
 * output to a different agent. What crosses is METADATA: which conversation,
 * which project, which branch, which files were named, when a line was last
 * written.
 *
 * ⛔ **Never "working".** A crashed agent and an idle one fall equally silent,
 * so the narrator cannot be the subject it observes (doc 93 §2). Every answer
 * here is phrased as *last seen*, and the reader concludes.
 */
import { LIVE_MINUTES, collisionReport, findSelf, minutesSince } from '@mnemosyne_os/agent-transcripts';
import {
  attemptedRoots,
  readAllSources,
  type ReadAllResult,
  type SourcedSession,
} from '@mnemosyne_os/agent-transcripts/node';

/** How many transcripts one call opens PER SOURCE. The tail of a 250-file
 *  folder is months old and answers no question about what is happening now. */
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 200;

/** The folders this server would look in, for a message that has to explain an
 *  empty answer. Exported for the covenant, which names them on connect. */
export function sessionsRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  return attemptedRoots(env).map(a => a.root);
}

/** Load every source, or explain why nothing could be. Never both. */
export async function loadAgents(
  opts: { limit?: number; maxAgeMinutes?: number } = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<ReadAllResult | { error: string }> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  try {
    const out = await readAllSources(
      { limit, ...(opts.maxAgeMinutes !== undefined ? { maxAgeMinutes: opts.maxAgeMinutes } : {}) },
      env,
    );
    if (out.roots.length === 0) {
      // No folder opened at all is NOT an idle machine. Returning "no sessions"
      // here would tell an agent the coast is clear on the strength of a
      // mistyped path or an agent that simply is not installed.
      const looked = out.missing.map(m => `  ${m.id}: ${m.root}`).join('\n');
      return {
        error: [
          'No agent transcript folder found. Nothing was read.',
          'Looked for:',
          looked || '  (no source enabled — check MNEMO_AGENT_SOURCES)',
          '',
          'Set MNEMO_AGENT_SESSIONS in this server\'s MCP config to the folder your agent writes sessions to.',
        ].join('\n'),
      };
    }
    return out;
  } catch (err) {
    return { error: `Could not read the transcript folders: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** How long ago, in words. Never a status. */
export function lastSeen(iso: string | null, now = Date.now()): string {
  const m = minutesSince(iso, now);
  if (!Number.isFinite(m)) return 'never (no timestamp in this transcript)';
  if (m < 1) return 'under a minute ago';
  if (m < 60) return `${Math.round(m)} min ago`;
  if (m < 24 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / (24 * 60))} days ago`;
}

/** One session as a line. Metadata only — see the file header. */
export function renderSession(row: SourcedSession, now = Date.now()): string {
  const s = row.session;
  const bits = [
    s.title ?? s.sessionId ?? s.file,
    // The agent's name leads the facts: in a merged list, "which harness" is
    // the first thing that changes what you do about it.
    row.agent,
    `last seen ${lastSeen(s.lastEventAt, now)}`,
    s.projectPath ? `project ${s.projectPath}` : 'project unknown',
    s.branch ? `branch ${s.branch}` : 'branch unknown',
  ];
  if (s.model) bits.push(s.model);
  if (s.isSidechain) bits.push('subagent');
  if (s.tool) bits.push(`last tool ${s.tool}`);
  bits.push(`${s.artifacts.length}${s.artifactsCapped ? '+' : ''} files`);
  return `- ${bits.join(' · ')}`;
}

/** The footer every answer carries: which folders, how much of each was opened. */
export function renderProvenance(v: ReadAllResult): string {
  const lines = [''];
  for (const r of v.roots) {
    lines.push(`Read ${r.id} from ${r.root}${r.declared ? ' (declared)' : ''} — ${r.found} transcript(s) found.`);
  }
  if (v.missing.length > 0) {
    // Not an error: most machines run one agent. But "that folder was never
    // opened" and "nobody is there" are different answers, and only one of
    // them is true here.
    lines.push(`Not present on this machine: ${v.missing.map(m => m.id).join(', ')}.`);
  }
  lines.push(`"Live" means a line was written in the last ${LIVE_MINUTES} minutes. It does NOT mean the agent is working: a crashed agent and an idle one fall equally silent.`);
  if (v.unreadable) {
    // Never swallowed. A refused read is indistinguishable from an empty
    // folder, which is how a blocked extension once looked like "no sessions".
    lines.push(`${v.unreadable.count} transcript(s) could not be opened. First reason: ${v.unreadable.firstReason}`);
  }
  return lines.join('\n');
}

/** A path compared the way Windows hands it back: either separator, either case. */
const norm = (p: string | null): string => (p ?? '').replace(/\\/g, '/').toLowerCase();

/**
 * The answer to "is anyone else in this repo right now".
 *
 * Written to be read by an agent about to commit: a `git add` takes the INDEX,
 * which every process in one working tree shares, so a commit from one session
 * picks up whatever the other has staged.
 *
 * Runs over the MERGED list on purpose. Two agents from different harnesses in
 * one working tree is not an edge case to tolerate, it is the case most worth
 * catching — neither of them can see the other any other way.
 */
export function renderCollisions(
  v: ReadAllResult,
  projectFilter: string | null,
  now = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  /**
   * The asking agent is in this list too.
   *
   * This server is launched BY a coding-agent session, so it inherits that
   * session's id, and the transcript file is named after it. Saying "2
   * sessions share your tree" when one of them is the reader overstates the
   * hazard by one and makes them work out which line is their own.
   *
   * ⚠️ Absent, the phrasing stays neutral. Treating an unknown id as "none of
   * these is you" would add a phantom session to every warning.
   */
  const selfId = env['CLAUDE_CODE_SESSION_ID'] ?? null;
  const rows = v.sessions;
  const report = collisionReport(rows.map(r => r.session), now);
  const groups = report.groups
    .filter(g => !projectFilter || norm(g.projectPath) === norm(projectFilter));
  const agentOf = new Map(rows.map(r => [r.session, r]));

  /**
   * The blind spot, stated. Antigravity records no working directory at all,
   * so its sessions can never be placed on a branch — and a warning list that
   * silently omits them reads as a complete survey of the machine.
   */
  const blindSpot = report.unplaceable.length === 0 ? [] : [
    '',
    `${report.unplaceable.length} recent session(s) could not be placed: their harness records neither a project nor a branch, so nothing here can say whether they share your working tree.`,
    ...report.unplaceable.map(sess => {
      const row = agentOf.get(sess);
      return row ? renderSession(row, now) : '';
    }).filter(Boolean),
  ];

  if (groups.length === 0) {
    // The exact sentence matters. "No collision" would overstate it: this is a
    // statement about what is READABLE in these folders, and an agent whose
    // transcripts live elsewhere is invisible here.
    const scope = projectFilter ? ` for ${projectFilter}` : '';
    return [
      `No two sessions${scope} wrote a line in the last ${LIVE_MINUTES} minutes on the same working tree and branch, in what is readable here.`,
      'That is not proof nobody else is working: an agent whose transcripts are not in these folders does not appear at all.',
      ...blindSpot,
      renderProvenance(v),
    ].join('\n');
  }

  const out = [
    `${groups.length} branch(es) with more than one recent session. A commit from one picks up whatever the other has staged.`,
    '',
  ];
  let identified = false;
  for (const g of groups) {
    const harnesses = new Set(g.sessions.map(s => agentOf.get(s)?.agent ?? '?'));
    const across = harnesses.size > 1 ? `  ⚠ ${[...harnesses].join(' + ')} — neither can see the other` : '';
    const self = findSelf(g.sessions, selfId);
    if (self) identified = true;
    const count = self
      ? `${g.sessions.length} sessions, ${g.sessions.length - 1} of them not you`
      : `${g.sessions.length} sessions`;
    out.push(`${g.projectPath ?? 'unknown project'} · ${g.branch ?? 'unknown branch'} — ${count}${across}`);
    for (const s of g.sessions) {
      const row = agentOf.get(s);
      if (row) out.push(`${renderSession(row, now)}${s === self ? '  ← you' : ''}`);
    }
    out.push('');
  }
  /**
   * 🚨 Why the `← you` marker is missing, when it is.
   *
   * Staying neutral about the COUNT is right (an unknown id must never become
   * "none of these is you"). Staying neutral about the REASON is not: the
   * reader is looking at a list that contains their own session, with nothing
   * saying so and nothing saying why. Measured on this machine 2026-09-07 —
   * three sessions on one branch, no marker, and the caller had to work out
   * which line was its own from the title. Silent, and the count reads one too
   * high, which is exactly the miscount this tool exists to prevent.
   *
   * Two different causes, two different fixes, so they get two sentences:
   * the variable never arrived, or it arrived carrying something that matches
   * nothing here — which is what an unexpanded `${CLAUDE_CODE_SESSION_ID}`
   * literal in an MCP config's `env` block looks like from in here.
   */
  // 🪤 "Matches no transcript read here" has to be TRUE before it is said. The
  // reader can be in the rows and in no colliding group at all (alone on its
  // own tree while two other sessions collide elsewhere); `identified` only
  // knows about the groups, so on its own it produced the warning — and the
  // "count is one too high" sentence — about a reader the count never included.
  const selfKnown = findSelf(rows.map(r => r.session), selfId) !== null;
  if (!identified && !selfKnown) {
    out.push(selfId
      ? `⚠ Which line is you could not be determined: CLAUDE_CODE_SESSION_ID carries "${selfId.slice(0, 60)}", which matches no transcript read here. Every line above is therefore listed as someone else's, and the count is one too high.`
      : '⚠ Which line is you could not be determined: CLAUDE_CODE_SESSION_ID did not reach this server, so every line above is listed as someone else\'s and the count is one too high. A stdio MCP config with its own `env` block has to pass the variable through explicitly.');
    out.push('');
  }
  out.push('Safe moves: commit by explicit path rather than `git add -A`, or move one session into its own worktree.');
  out.push(...blindSpot);
  out.push(renderProvenance(v));
  return out.join('\n');
}

/** Names this module answers. Checked BEFORE the server tries to connect: the
 *  whole point is that these work with Mnemosyne OS closed. */
export const AGENT_TOOLS = new Set([
  'mnemosyne_agents',
  'mnemosyne_agent_collisions',
  'mnemosyne_agent_files',
]);

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

const contains = (haystack: string | null, needle: string): boolean =>
  norm(haystack).includes(norm(needle));

/**
 * Answer one agent-awareness tool, as plain text.
 *
 * Returns the text an agent reads. Failures are text too, never a thrown MCP
 * error: "I could not read the folder" is a useful answer, and a stack trace
 * in a tool result teaches the caller nothing it can act on.
 */
export async function handleAgentTool(
  name: string,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
  now: number = Date.now(),
): Promise<string> {
  const asked = Number(args['limit'] ?? DEFAULT_LIMIT);
  // 🚨 The collision check filters by AGE, not by count. A "40 newest" cap can
  // in principle rank a session that wrote 9 minutes ago at position 41, and a
  // collision check that misses is worse than none — you would trust it. The
  // mtime filter runs on the directory listing, before any file is opened, so
  // asking for every recent transcript instead of the newest 40 costs nothing.
  const wantsAll = name === 'mnemosyne_agent_collisions';
  const view = await loadAgents(
    wantsAll
      ? { limit: MAX_LIMIT, maxAgeMinutes: LIVE_MINUTES }
      : { limit: Number.isFinite(asked) ? asked : DEFAULT_LIMIT },
    env,
  );
  if ('error' in view) return view.error;

  const project = str(args['project']);

  if (name === 'mnemosyne_agent_collisions') {
    return renderCollisions(view, project, now, env);
  }

  if (name === 'mnemosyne_agents') {
    const liveOnly = args['live_only'] === true;
    let list = view.sessions;
    if (project) list = list.filter(r => contains(r.session.projectPath, project));
    if (liveOnly) list = list.filter(r => minutesSince(r.session.lastEventAt, now) < LIVE_MINUTES);

    if (list.length === 0) {
      const what = [liveOnly ? 'recently active' : 'readable', project ? `in ${project}` : null]
        .filter(Boolean).join(' ');
      return [
        `No ${what} agent session found.`,
        'That is a statement about the folders below, not about the machine: a session whose transcripts live elsewhere does not appear here.',
        renderProvenance(view),
      ].join('\n');
    }

    const harnesses = new Set(list.map(r => r.agent));
    return [
      `${list.length} agent session(s) across ${harnesses.size} harness(es), newest first.`,
      '',
      ...list.map(r => renderSession(r, now)),
      renderProvenance(view),
    ].join('\n');
  }

  // mnemosyne_agent_files
  const needle = str(args['contains']);
  const cap = Math.min(Math.max(Number(args['limit'] ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const rows: string[] = [];
  const seen = new Set<string>();

  for (const r of view.sessions) {
    if (project && !contains(r.session.projectPath, project)) continue;
    for (const a of r.session.artifacts) {
      if (needle && !contains(a.path, needle)) continue;
      const key = norm(a.path);
      if (seen.has(key)) continue;
      seen.add(key);
      const origin = a.origin === 'shell' ? 'from a command' : 'recorded';
      rows.push(`- ${a.path} · ${origin} · ${lastSeen(a.at ?? r.session.lastEventAt, now)} · ${r.session.title ?? r.session.sessionId ?? r.session.file} (${r.agent})`);
      if (rows.length >= cap) break;
    }
    if (rows.length >= cap) break;
  }

  if (rows.length === 0) {
    return ['No file matched, in what is readable here.', renderProvenance(view)].join('\n');
  }

  const capped = view.sessions.filter(r => r.session.artifactsCapped).length;
  return [
    `${rows.length} file(s), newest session first. Paths only — this tool never returns file contents.`,
    '',
    ...rows,
    capped > 0 ? `\n${capped} session(s) hit their own file ceiling, so their lists are short by whatever they wrote past it.` : '',
    renderProvenance(view),
  ].filter(Boolean).join('\n');
}
