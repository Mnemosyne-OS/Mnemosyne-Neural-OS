/**
 * cockpitHook — the pure half of the Claude Code cockpit hook (doc 110 §9).
 *
 * What each harness event says about the session, the title read from the
 * transcript, and the two shapes of output: mail as context, mail as the
 * reason a stop is refused. No socket, no process — `cockpit-hook.ts` is the
 * entry that adds those, and this half is what `cockpitHook.test.ts` pins.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readSession, CONNECTORS } from '../../agent-transcripts/src/index';
import { workingTreeOf } from '../../agent-transcripts/src/node';

export const HOOK_APP_ID = 'agent-cockpit';
const MAX_STATUS = 120;
/** A question is READ, not glanced at, so it gets more room than a status. */
const MAX_ASK = 240;

export interface HookInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  transcript_path?: string;
  prompt?: string;
  last_assistant_message?: string;
  source?: string;
  reason?: string;
  /** `Notification` only — what the harness is telling the human. */
  message?: string;
}

/**
 * The states a HARNESS can vouch for.
 *
 * `waiting` joined them on 2026-09-11, and the distinction it used to sit
 * outside of still holds: this is not an INFERENCE from silence, it is an
 * event the harness raises at exactly the moment it needs the human. Nothing
 * is deduced — `Notification` means what `waiting` means.
 *
 * `blocked` stays the agent's own word (the MCP tool): no harness event says
 * "I am stuck", and reading one out of a quiet transcript is the fabrication
 * doc 110 refuses twice over.
 *
 * 🚨 Field report, Tony, 2026-09-11: « ils posent une question et dans l'app
 * aucune info que je dois répondre ». The card had painted `waiting` since the
 * day it shipped — pulse, taskbar flash, the whole point of the cockpit — and
 * no path from a Claude Code session could ever say the word. A state nobody
 * can declare is a dead indicator.
 */
export type HookState = 'working' | 'waiting' | 'done' | 'closed';

export interface HookPlan {
  state: HookState;
  status?: string;
  /**
   * Something the human is being ASKED, meant to be read rather than glanced
   * at — so it travels as a detail LINE and not as a status.
   *
   * 🚨 The status shares its row with "seen N ago" on a 232px card and is
   * clipped with no tooltip: « Regarde maintenan… ». A state that says WAITING
   * FOR YOU without saying what for is half a signal, and the half it keeps is
   * the one that cannot be acted on.
   */
  ask?: string;
  /** What to do with mail found on the card: hand it as context, or block the stop with it. */
  mail: 'context' | 'block' | null;
  /**
   * Which mail to take. A stop is refused ONLY for mail addressed to this
   * session by name (the human's reply on its card); a note another agent
   * broadcast to the whole tree is read at the next prompt or the next
   * commit, never by holding a session that was done.
   */
  mailScope: 'addressed' | 'all';
}

/** One line, trimmed, capped — a status is a glance, not a transcript. */
export function firstLine(text: unknown, max = MAX_STATUS): string | undefined {
  if (typeof text !== 'string') return undefined;
  const line = text.replace(/\s+/g, ' ').trim();
  if (!line) return undefined;
  return line.length > max ? line.slice(0, max - 1).trimEnd() + '…' : line;
}

/** The card update each event calls for, or null for an event this hook does not handle. */
export function planFor(input: HookInput): HookPlan | null {
  switch (input.hook_event_name) {
    case 'SessionStart':
      return { state: 'working', status: input.source ? `session ${input.source}` : 'session started', mail: 'context', mailScope: 'all' };
    case 'UserPromptSubmit':
      return { state: 'working', status: firstLine(input.prompt), mail: 'context', mailScope: 'all' };
    /**
     * The harness is asking the human for something.
     *
     * ⚠️ Nothing clears it directly: answering a question is not a prompt, so
     * the card stays `waiting` until the turn ends (`Stop` → `done`) or a new
     * prompt arrives (`working`). That residue is covered by the host's own
     * honesty, not hidden: an unconfirmed state keeps its colour, gains a
     * dashed outline, and the silence line says for how long (doc 110 §9).
     *
     * 🎭 No status is invented when the harness sends no message. The STATE is
     * the news; a sentence made up here would be the card speaking for an
     * agent that said nothing.
     */
    case 'Notification':
      // 🎭 No status: the STATE is the summary, and inventing a second one
      // would push the question out of the only row that can hold it.
      return { state: 'waiting', ask: firstLine(input.message, MAX_ASK), mail: null, mailScope: 'addressed' };
    case 'Stop':
      return { state: 'done', status: firstLine(input.last_assistant_message), mail: 'block', mailScope: 'addressed' };
    case 'SessionEnd':
      return { state: 'closed', mail: null, mailScope: 'addressed' };
    default:
      return null;
  }
}

/**
 * The parsed transcript, read at most once per hook run.
 *
 * 🪤 Three functions here want the same session — the title, the stats, and
 * the detail lines — and each used to read the file itself. Measured on this
 * machine 2026-09-06: a live transcript is 3.3 MB and one of 6 MB was seen the
 * same day, so a hook that fires on every prompt AND every end of turn was
 * reading and parsing ten to eighteen megabytes to publish one card.
 *
 * Keyed on path + size + mtime, so a file that changes between two calls is
 * read again rather than answered from a stale parse — the hook process is
 * short-lived, but the tests are not.
 */
const sessionCache = new Map<string, { stamp: string; session: ReturnType<typeof readSession> }>();

function sessionAt(transcriptPath: string, warn: (line: string) => void): ReturnType<typeof readSession> {
  let stamp = 'unstat';
  try {
    const st = fs.statSync(transcriptPath);
    stamp = `${st.size}:${st.mtimeMs}`;
  } catch { /* the read below reports it */ }
  const hit = sessionCache.get(transcriptPath);
  if (hit && hit.stamp === stamp) return hit.session;
  try {
    const text = fs.readFileSync(transcriptPath, 'utf8');
    const session = readSession(CONNECTORS['claude-code'], path.basename(transcriptPath), transcriptPath, text, text.length);
    sessionCache.set(transcriptPath, { stamp, session });
    return session;
  } catch (err) {
    warn(`[cockpit-hook] transcript unreadable: ${String(err)}`);
    sessionCache.set(transcriptPath, { stamp, session: null });
    return null;
  }
}

/**
 * The conversation's title as the harness wrote it, read through the same
 * connector Ariadne uses — never a name this hook invents. Null when the
 * transcript has no title yet (a fresh session): the host then shows
 * "Session <id>", which is the id and not a guess.
 */
export function titleFrom(transcriptPath: string | undefined, warn: (line: string) => void = () => {}): string | null {
  if (!transcriptPath) return null;
  // The name the HUMAN gave the session wins over the one the harness derived.
  // Claude Code keeps it beside the transcript, in <session>/custom-title.json.
  const custom = customTitleFrom(transcriptPath, warn);
  if (custom) return custom;
  const s = sessionAt(transcriptPath, warn);
  if (s?.title) return s.title;
  const turn = s?.humanTurns[0]?.text;
  return turn ? (firstLine(turn, 68) ?? null) : null;
}

/** `<transcript dir>/<session id>/` — the folder Claude Code keeps beside a transcript. */
export function sessionDirOf(transcriptPath: string): string {
  return path.join(path.dirname(transcriptPath), path.basename(transcriptPath, '.jsonl'));
}

export function customTitleFrom(transcriptPath: string, warn: (line: string) => void = () => {}): string | null {
  const file = path.join(sessionDirOf(transcriptPath), 'custom-title.json');
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { customTitle?: unknown };
    return typeof raw.customTitle === 'string' && raw.customTitle.trim() ? raw.customTitle.trim() : null;
  } catch (err) {
    warn(`[cockpit-hook] custom-title.json unreadable: ${String(err)}`);
    return null;
  }
}

/**
 * The two things Ariadne's card carried and the session's own card did not:
 * where it runs, and which model. Now that a subject's own card wins over a
 * watcher's (`collapseBySubject`), the winner has to carry them or the merge
 * would quietly lose what the board used to show.
 *
 * 🎭 Each line is dropped when it cannot be read — no "unknown branch", no
 * empty separator. The card holds up to MAX_LINES of these.
 */
export function detailFrom(transcriptPath: string | undefined, warn: (line: string) => void = () => {}): string[] {
  if (!transcriptPath) return [];
  const s = sessionAt(transcriptPath, warn);
  if (!s) return [];
  /**
   * 🚨 The PROJECT, never the folder the shell was left in. The harness records
   * a cwd, so one `cd` into a subdirectory renamed the card: measured on the
   * board, `desktops · main` sitting next to four `_MNEMOSYNE OS · main` of the
   * same repository. Doc 93 §11 established the working tree as the honest key
   * for exactly this reason, and the routing beside this line already uses it.
   *
   * 🎭 A cwd under no repository keeps its own name. `workingTreeOf` returns
   * null there, and that is an answer: a directory outside any repository has
   * not thereby joined another one.
   */
  const project = s.projectPath ? path.basename(workingTreeOf(s.projectPath) ?? s.projectPath) : null;
  const where = [project, s.branch].filter(Boolean).join(' · ');
  return [where, s.model].filter((l): l is string => Boolean(l && l.trim()));
}

export interface HookStats {
  startedAt?: string;
  lastAt?: string;
  files?: number;
  filesCapped?: boolean;
  subagents?: number;
  transcript?: string;
  /**
   * The markdown this session wrote, newest last, as the connector recorded
   * it — so the card can offer the DOCUMENTS and not only how many files
   * there were (field, 2026-09-09: « toujours pas accès aux fichiers md en
   * direct dans cette tuile, ceux que l'IA génère pour moi »).
   *
   * ⚠️ NOT filtered down to "written for a human". The cartridge can do that
   * because it holds the connector's own document list; this hook does not,
   * and inferring it from a folder name would be a guess dressed as a record.
   * The population here is ONE session's output, so a memory note beside a
   * report is a short list to read rather than the drowning that happens when
   * hundreds of files are ranked by recency.
   */
  documents?: string[];
}

/** How many document paths ride on a card. Enough to be useful, few enough
 *  that the card does not become a file tree. */
export const MAX_CARD_DOCUMENTS = 6;

/**
 * What the transcript MEASURES (doc 110 §10): its first and last stamps (a
 * wall-clock span, not "work"), the files it wrote as the connector counts
 * them (tool and shell), and the subagent transcripts beside it. A field that
 * cannot be read is left out — never written as zero.
 */
export function statsFrom(transcriptPath: string | undefined, warn: (line: string) => void = () => {}): HookStats | null {
  if (!transcriptPath) return null;
  const out: HookStats = { transcript: transcriptPath };
  const s = sessionAt(transcriptPath, warn);
  if (s) {
    if (s.firstEventAt) out.startedAt = s.firstEventAt;
    if (s.lastEventAt) out.lastAt = s.lastEventAt;
    out.files = s.artifacts.length;
    if (s.artifactsCapped) out.filesCapped = true;
    // 🎭 Absent when there is none: an empty array would draw an empty
    // heading on the card, which reads as a section that failed to load.
    //
    // 🚨 ABSOLUTE, and proven to exist. The card offers to OPEN these, and the
    // reader reads by absolute path — a transcript records the path as it was
    // TYPED, so `Write("QUALITY_SWEEP_TRACKING.md")` lands here as a bare
    // relative name and would put an entry on the card that opens onto
    // nothing. Measured on a real session: 2 documents, 1 of them relative.
    //
    // Resolving uses the hook's OWN cwd, which is the project it was invoked
    // for. That is a guess for a session that ran `cd` mid-flight (doc 93 §11:
    // the harness records the cwd, not the project root), so the guess is not
    // trusted — `existsSync` is what turns it into a fact. A path that cannot
    // be verified is dropped rather than offered: a button that opens an error
    // is worse than a button that is not there.
    const seen = new Set<string>();
    const md: string[] = [];
    for (const a of s.artifacts) {
      if (!/\.(md|mdx|markdown)$/i.test(a.path)) continue;
      let abs: string;
      try {
        abs = path.resolve(a.path);
      } catch {
        continue; // an unresolvable path is not a document
      }
      if (seen.has(abs)) continue;
      seen.add(abs);
      try {
        if (!fs.existsSync(abs)) continue;
      } catch (err) {
        warn(`[cockpit-hook] could not stat ${abs}: ${String(err)}`);
        continue;
      }
      md.push(abs);
      // 🪤 The connector hands artifacts back NEWEST FIRST, so taking from the
      // head is taking what was just written. `slice(-N)` looked right and kept
      // the OLDEST six — caught by the test, never by reading.
      if (md.length >= MAX_CARD_DOCUMENTS) break;
    }
    if (md.length > 0) out.documents = md;
  }
  const subagentsDir = path.join(sessionDirOf(transcriptPath), 'subagents');
  try {
    if (fs.existsSync(subagentsDir)) {
      out.subagents = fs.readdirSync(subagentsDir).filter(n => n.endsWith('.jsonl')).length;
    } else {
      out.subagents = 0; // the folder is only created when a subagent runs: none is a measured zero
    }
  } catch (err) {
    warn(`[cockpit-hook] subagents folder unreadable: ${String(err)}`);
  }
  return out;
}

export interface HookMail { from: string; at: string; body: string }

/**
 * The mailbox holds two kinds of mail and the line must not merge them: what
 * the human typed on this session's card, and what another AGENT broadcast
 * to everyone in the tree (`pnpm agent:msg`). Seen live on 2026-09-06: three
 * agent broadcasts arrived under a heading that said "from the human".
 */
export function renderMail(messages: HookMail[]): string {
  const n = messages.length;
  const lines = messages.map(m => `- from ${m.from}: ${m.body}`).join('\n');
  return `📬 ${n} message${n > 1 ? 's' : ''} in this session's mailbox (the human's replies on your cockpit card, and other agents' notes for this tree) — read ${n > 1 ? 'them' : 'it'} and act on what is addressed to you:\n${lines}`;
}

/**
 * The JSON that keeps a stopping session going, with the mail as the reason.
 * Both the documented `hookSpecificOutput` form and the top-level
 * `decision`/`reason` pair are emitted: harness versions differ on which one
 * they read, and an unread key costs nothing.
 */
export function blockOutput(messages: HookMail[]): string {
  const reason = renderMail(messages);
  return JSON.stringify({
    decision: 'block',
    reason,
    hookSpecificOutput: { hookEventName: 'Stop', decision: 'block', reason },
  });
}
