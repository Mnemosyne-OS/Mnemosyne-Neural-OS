/**
 * Connector interpreter — reads a declarative connector and applies it to raw
 * files. Doc 93 §3.
 *
 * The connector is DATA: paths are walked, never evaluated. A hostile connector
 * can at worst mislabel a field; it cannot execute. That property is the whole
 * reason an open connector catalogue is defensible, so nothing in this file may
 * ever grow a code path that runs connector-supplied strings.
 *
 * Two formats, because two consumers are what make an abstraction real:
 *   jsonl    — one JSON object per line (agent session transcripts)
 *   markdown — YAML-ish frontmatter + body (memory notes)
 */

import { shellWriteTargets } from './shellWrites';

export type ConnectorFormat = 'jsonl' | 'markdown';

export interface Connector {
  id: string;
  displayName: string;
  version: string;
  format: ConnectorFormat;
  kind: 'session' | 'document';
  folderHint?: string;
  /**
   * How this source is shown. `label` is a short code; `tint` a CSS colour.
   *
   * `svg` is an OPTIONAL inline `<path>` d-attribute for a real logo. It is
   * empty here on purpose: shipping a lookalike under a vendor's name would be
   * a fabricated brand asset, and the official one has to come from whoever
   * owns it. Drop the path in and the badge becomes the real mark, with no
   * code change — a connector is data.
   */
  mark?: { label: string; tint?: string; svg?: string };
  /**
   * Where the transcripts sit relative to each first-level directory, for an
   * agent that buries them. Absent means they sit in that directory itself.
   *
   * A fixed sub-path rather than a depth-first crawl: one listing per session
   * instead of exploring every branch of a tree the app has no business
   * walking. `idFrom: 'dir'` says the session id is that directory's name,
   * which is how an agent that writes no id field still has one.
   */
  tree?: { subPath: string; idFrom?: 'dir' };
  filePattern: string;
  fields: Record<string, string>;
  action?: { path: string; where: Record<string, unknown>; take: string };
  /** The conversation's own name, written on its own line kind by the harness.
   *  Walking backwards means the LAST one written wins, so a rename shows. */
  title?: { where: Record<string, unknown>; take: string };
  /** Files the agent touched: same walk as `action`, but keeping the tool's
   *  input path instead of its name. */
  artifact?: { path: string; where: Record<string, unknown>; tools: string[]; take: string };
  /**
   * Which tools run a shell, and where their command string sits.
   *
   * Declaring the LOCATION here and keeping the patterns in code (lib/
   * shellWrites) is the only shape that respects both facts: a connector may
   * never carry a regex, and two thirds of what an agent writes never passes
   * through a file-writing tool at all.
   */
  shellWrite?: { path: string; where: Record<string, unknown>; tools: string[]; take: string };
  humanTurn?: {
    where: Record<string, unknown>;
    notWhen?: { path: string; has: string };
    text: string;
    /**
     * Keep only what sits between two literal markers. Literals, never a
     * regex: a connector is data a stranger can ship, and a pathological
     * pattern would hang the reader on someone else's machine.
     */
    between?: { start: string; end: string };
  };
  /** markdown only: which frontmatter keys map to which normalised field. */
  frontmatter?: Record<string, string>;
  /**
   * markdown only: a document whose description lives in a SIDECAR file rather
   * than in frontmatter. Costs one extra read per note, so only declare it when
   * the sidecar actually carries something worth a column.
   */
  sidecar?: { suffix: string; fields: Record<string, string> };
}

/**
 * One file a session produced, and HOW that is known.
 *
 * The origin is not decoration. `tool` means the harness recorded a
 * file-writing tool call with this path: a record. `shell` means a redirection
 * was read out of a command string: a reading of an intention, which the
 * command may never have carried out. Both belong on screen, under different
 * words — the same rule that keeps "written by this session" apart from
 * "changed while it was open".
 */
export interface Artifact {
  path: string;
  origin: 'tool' | 'shell';
  /** When this session last touched it. Absent when the line carried no
   *  timestamp; absent stays absent rather than becoming the session's own. */
  at: string | null;
}

/** One session's current state, in the normalised model. Widgets read THIS,
 *  never a vendor's field names — so a vendor change breaks one connector
 *  instead of every widget (doc 93 §10). */
export interface SessionState {
  file: string;
  path: string;
  sessionId: string | null;
  /** What the conversation is called. Present on 221 of 229 sessions measured
   *  2026-08-27; absent is absent, and the view falls back to the first thing
   *  the human typed rather than inventing a name. */
  title: string | null;
  model: string | null;
  projectPath: string | null;
  branch: string | null;
  isSidechain: boolean;
  lastEventAt: string | null;
  /** The session's real start. NOT humanTurns[0]: that list is capped, so on a
   *  long session its first entry is the 40th turn from the end, and a window
   *  built from it silently excludes most of the session. */
  firstEventAt: string | null;
  tool: string | null;
  sizeBytes: number;
  /** Files this session wrote or edited, most recent first, deduplicated. */
  artifacts: Artifact[];
  /** The list above stopped at MAX_ARTIFACTS. A truncation nobody is told
   *  about reads exactly like a complete list, which is how 42 of 211 sessions
   *  quietly showed 40 of their files. */
  artifactsCapped: boolean;
  /** What the human actually typed. ~1% of the bytes, and the only part worth
   *  summarising — see doc 93 §1. */
  humanTurns: { at: string | null; text: string }[];
}

/** One memory note, normalised. */
export interface DocState {
  file: string;
  path: string;
  name: string | null;
  description: string | null;
  type: string | null;
  links: string[];
  body: string;
  sizeBytes: number;
  mtime: number;
}

/**
 * Walk a dotted path. `a.b` descends keys; a trailing `[]` marks the value as
 * an array to iterate. Returns undefined rather than throwing: a transcript
 * from a newer harness may simply not carry the field yet, and a missing field
 * must degrade one column, never the whole row.
 */
function pick(obj: unknown, path: string | undefined): unknown {
  // A connector is told to OMIT a field its agent does not have, so an absent
  // path is the normal case, not a mistake. Crashing here would punish the
  // honest connector and reward one that invents a mapping.
  if (!path) return undefined;
  const wantsArray = path.endsWith('[]');
  const clean = wantsArray ? path.slice(0, -2) : path;
  let cur: unknown = obj;
  for (const key of clean.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  if (wantsArray && !Array.isArray(cur)) {
    // A single object iterates as one element. Some harnesses put ONE tool call
    // on a line of its own instead of an array of them inside a message —
    // OpenClaw's trajectory export is a measured example, where each `tool.call`
    // line carries a lone `data` object. Without this, `[]` would mean "only
    // harnesses that batch", which is a fact about their formatting, not about
    // what the reader can understand.
    if (cur !== null && typeof cur === 'object') return [cur];
    return undefined;
  }
  return cur;
}

/** Shallow "every declared key matches" test. Used for `where` clauses. */
function matches(obj: unknown, where: Record<string, unknown>): boolean {
  if (obj === null || typeof obj !== 'object') return false;
  const rec = obj as Record<string, unknown>;
  return Object.entries(where).every(([k, v]) => rec[k] === v);
}

/**
 * Parse the complete lines of a chunk.
 *
 * A transcript is appended to while we read it, so the LAST line is regularly
 * a half-written JSON object. That looks like format drift and is not one:
 * we simply stop at the last complete newline (doc 93 §5).
 */
export function completeLines(text: string): string[] {
  const parts = text.split(/\r?\n/);
  if (!/\r?\n$/.test(text)) parts.pop();
  return parts.filter(l => l.trim().length > 0);
}

/**
 * The session directory for a transcript buried under `tree.subPath`.
 *
 * Counted from the END of the path, so it does not depend on where the human
 * pointed the picker — one segment above the sub-path, whatever its depth.
 */
function sessionDirOf(conn: Connector, path: string): string | null {
  const segs = path.replace(/\\/g, '/').split('/').filter(Boolean);
  const depth = (conn.tree?.subPath ?? '').split('/').filter(Boolean).length;
  return segs[segs.length - depth - 2] ?? null;
}

/** Never coerce: `String(null)` would turn an absent field into the text
 *  "null", which reads on screen as a real value. Absent stays absent. */
function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Plain text of a turn, whether the harness stored a string or content parts. */
function turnText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((p): p is { type: string; text?: string } => !!p && typeof p === 'object')
    .filter(p => p.type === 'text' && typeof p.text === 'string')
    .map(p => p.text as string)
    .join('\n');
}

/**
 * The slice between two literal markers, or the whole string when they are not
 * both present. Never a partial match: half a marker pair means the format
 * moved, and returning the raw text is more honest than returning a fragment
 * that looks deliberate.
 */
function clipBetween(text: string, between?: { start: string; end: string }): string {
  if (!between) return text;
  const from = text.indexOf(between.start);
  if (from < 0) return text;
  const to = text.indexOf(between.end, from + between.start.length);
  if (to < 0) return text;
  return cleanMetadata(text.slice(from + between.start.length, to));
}

function cleanMetadata(text: string): string {
  return text
    .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/g, '')
    .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/g, '')
    .replace(/<EPHEMERAL_MESSAGE>[\s\S]*?<\/EPHEMERAL_MESSAGE>/g, '')
    .trim();
}

/** How many human turns to keep per session. A summary needs the shape of the
 *  session, not every word, and the cap bounds what crosses into a prompt. */
const MAX_HUMAN_TURNS = 40;
/**
 * How many files one session may list.
 *
 * It was 40, which 42 of 211 sessions on this machine exceeded — one of them
 * wrote 101 files and reported 40, with nothing on screen to say so. The point
 * of the ceiling is that one enormous session cannot dominate memory, and 400
 * paths cost about 50 KB; the honest part is `artifactsCapped`, which lets the
 * view say the list stopped instead of letting it look finished.
 */
export const MAX_ARTIFACTS = 400;

/**
 * Current state of one session.
 *
 * ONE backward walk over the whole file. Fields that describe "now" (model,
 * branch, last tool, title) latch on their first hit, which walking backwards
 * means the most recent one; artifacts and human turns accumulate across every
 * line. There is deliberately no early exit: stopping once "now" is known
 * would silently truncate the two collections that need the whole session.
 */
/**
 * Add one file to a session, unless it is already there or the list is full.
 *
 * A path seen twice keeps its FIRST sighting, which walking backwards makes
 * the most recent one — and the first sighting on a given line is the tool
 * call, so a file both written by Write and touched by a shell reads as the
 * record it is.
 */
function addArtifact(
  st: SessionState,
  seen: Set<string>,
  target: string | null,
  origin: Artifact['origin'],
  at: string | null,
): void {
  if (!target || seen.has(target)) return;
  if (st.artifacts.length >= MAX_ARTIFACTS) { st.artifactsCapped = true; return; }
  seen.add(target);
  st.artifacts.push({ path: target, origin, at });
}

export function readSession(conn: Connector, file: string, path: string, text: string, sizeBytes: number): SessionState | null {
  const st: SessionState = {
    file, path, sessionId: null, title: null, model: null, projectPath: null, branch: null,
    isSidechain: false, lastEventAt: null, firstEventAt: null, tool: null, sizeBytes,
    artifacts: [], artifactsCapped: false, humanTurns: [],
  };
  const lines = completeLines(text);
  const seenArtifacts = new Set<string>();

  for (let i = lines.length - 1; i >= 0; i--) {
    let o: unknown;
    try {
      o = JSON.parse(lines[i]);
    } catch {
      continue; // a truncated or corrupt line is skipped, never fatal
    }

    if (!st.lastEventAt) {
      const ts = pick(o, conn.fields.timestamp);
      if (typeof ts === 'string') {
        st.lastEventAt = ts;
        st.sessionId = asString(pick(o, conn.fields.sessionId));
        st.projectPath = asString(pick(o, conn.fields.projectPath));
        st.branch = asString(pick(o, conn.fields.branch));
        st.isSidechain = pick(o, conn.fields.isSidechain) === true;
      }
    }
    // Walking backwards, every timestamped line overwrites this, so the last
    // one written is the earliest line in the file.
    const ts = asString(pick(o, conn.fields.timestamp));
    if (ts) st.firstEventAt = ts;

    if (!st.model) st.model = asString(pick(o, conn.fields.model));

    // First hit walking backwards is the most recent title line, so a renamed
    // conversation shows its new name rather than its first one.
    if (!st.title && conn.title && matches(o, conn.title.where)) {
      st.title = asString((o as Record<string, unknown>)[conn.title.take]);
    }

    if (!st.tool && conn.action) {
      const arr = pick(o, conn.action.path);
      if (Array.isArray(arr)) {
        for (const part of arr) {
          if (matches(part, conn.action.where)) {
            st.tool = asString((part as Record<string, unknown>)[conn.action.take]);
            break;
          }
        }
      }
    }

    // Artifacts: the files this session wrote. Newest first because we walk
    // backwards, and capped so one enormous session cannot dominate memory.
    //
    // Two sources, kept apart by `origin`: a file-writing tool call is a
    // RECORD, a redirection read out of a shell command is an INFERENCE. The
    // tool pass runs first on each line so that a file with both kinds of
    // evidence keeps the stronger one.
    if (conn.artifact) {
      const arr = pick(o, conn.artifact.path);
      if (Array.isArray(arr)) {
        for (const part of arr) {
          if (!matches(part, conn.artifact.where)) continue;
          const rec = part as Record<string, unknown>;
          const toolName = asString(rec.name);
          if (!toolName || !conn.artifact.tools.includes(toolName)) continue;
          addArtifact(st, seenArtifacts, asString(pick(rec, conn.artifact.take)), 'tool', ts);
        }
      }
    }

    if (conn.shellWrite) {
      const arr = pick(o, conn.shellWrite.path);
      if (Array.isArray(arr)) {
        for (const part of arr) {
          if (!matches(part, conn.shellWrite.where)) continue;
          const rec = part as Record<string, unknown>;
          const toolName = asString(rec.name);
          if (!toolName || !conn.shellWrite.tools.includes(toolName)) continue;
          const command = asString(pick(rec, conn.shellWrite.take));
          if (!command) continue;
          for (const target of shellWriteTargets(command)) {
            addArtifact(st, seenArtifacts, target, 'shell', ts);
          }
        }
      }
    }

    // Human turns. A tool RESULT is stored as a user message too, so the
    // notWhen clause is what separates the person from the machine — without
    // it, 99% of the bytes would be mistaken for things the human said.
    if (conn.humanTurn && st.humanTurns.length < MAX_HUMAN_TURNS && matches(o, conn.humanTurn.where)) {
      const parts = pick(o, conn.humanTurn.notWhen?.path ?? '');
      const isToolResult = Array.isArray(parts)
        && parts.some(p => !!p && typeof p === 'object' && (p as { type?: string }).type === conn.humanTurn?.notWhen?.has);
      if (!isToolResult) {
        const text = clipBetween(turnText(pick(o, conn.humanTurn.text)), conn.humanTurn.between);
        if (text.trim()) {
          st.humanTurns.push({ at: asString(pick(o, conn.fields.timestamp)), text: text.trim() });
        }
      }
    }
  }

  // An agent that writes no id field still has one: the directory it writes in.
  if (!st.sessionId && conn.tree?.idFrom === 'dir') st.sessionId = sessionDirOf(conn, path);

  st.humanTurns.reverse();   // chronological: a summary reads a session forward
  return st.lastEventAt ? st : null;
}

/**
 * One markdown document with frontmatter.
 *
 * The frontmatter parser is deliberately shallow: `key: value`, plus one level
 * of indentation for nested keys addressed as `parent.child`. It is not YAML
 * and does not try to be — a memory note that needs anchors and flow sequences
 * is a note that should be simpler.
 */
export function readDoc(
  conn: Connector,
  file: string,
  path: string,
  text: string,
  sizeBytes: number,
  mtime: number,
  /** Raw contents of the sidecar file, when the connector declares one and the
   *  caller managed to read it. Unreadable or absent is not an error: the
   *  document still lists, it simply has no description. */
  sidecarText?: string | null,
): DocState {
  const doc: DocState = {
    file, path, name: null, description: null, type: null, links: [],
    body: text, sizeBytes, mtime,
  };

  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (fm) {
    doc.body = text.slice(fm[0].length);
    const flat = parseFrontmatter(fm[1]);
    const map = conn.frontmatter ?? {};
    doc.name = asString(flat[map.name ?? 'name']);
    doc.description = asString(flat[map.description ?? 'description']);
    doc.type = asString(flat[map.type ?? 'type']);
  }
  // A sidecar carries what frontmatter would have. Parsed defensively: a
  // malformed one costs this document its description, never the listing.
  if (conn.sidecar && sidecarText) {
    try {
      const meta = JSON.parse(sidecarText) as Record<string, unknown>;
      const map = conn.sidecar.fields;
      doc.description = doc.description ?? asString(pick(meta, map.description));
      doc.type = doc.type ?? asString(pick(meta, map.type));
    } catch (err) {
      console.warn(`[Ariadne] sidecar unreadable for ${file}:`, err);
    }
  }

  if (!doc.name) doc.name = file.replace(/\.[^.]+$/, '');

  // [[wiki-links]] are the note graph. Deduplicated, order preserved.
  const seen = new Set<string>();
  for (const m of doc.body.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const target = m[1].trim();
    if (target && !seen.has(target)) { seen.add(target); doc.links.push(target); }
  }
  return doc;
}

/**
 * `key: value` lines, with one nesting level flattened to `parent.child`.
 *
 * 🪤 Split on /\r?\n/, never on '\n'. A CRLF file leaves a trailing '\r' on
 * every line, and in JavaScript `.` does not match '\r' (it is a line
 * terminator) while `$` without the m flag will not match before one. So
 * `key: value\r` silently failed to parse while `key: \r` succeeded — the
 * empty-value case let \s* swallow the carriage return. That cost 132 of 249
 * notes their description and type, and looked exactly like missing metadata.
 */
function parseFrontmatter(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  let parent = '';
  for (const raw of block.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indented = /^\s+/.test(raw);
    const m = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(raw);
    if (!m) continue;
    const [, key, value] = m;
    const clean = value.trim().replace(/^["']|["']$/g, '');
    if (!clean) { parent = key; continue; }          // a bare `metadata:` opens a block
    out[indented && parent ? `${parent}.${key}` : key] = clean;
    if (!indented) parent = '';
  }
  return out;
}

/**
 * The consent sentence, DERIVED from the connector rather than written by its
 * author (doc 93 §3). Because a connector is data, the app can state exactly
 * what it will read — something no code-based plugin can honestly offer.
 */
export function describeConnector(conn: Connector): string[] {
  const fields = Object.keys(conn.format === 'markdown' ? (conn.frontmatter ?? {}) : conn.fields);
  if (conn.artifact) fields.push('files written');
  // Named separately: it is a different READ (the text of the commands the
  // agent ran), and consent to "which files it edited" is not consent to that.
  if (conn.shellWrite) fields.push('shell commands, for the files they write');
  return fields;
}
