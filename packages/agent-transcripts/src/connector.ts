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

export type ConnectorFormat = 'jsonl' | 'markdown' | 'json' | 'chatlog';

/**
 * How a messaging app's exported text log is laid out. Doc 118 §9.
 *
 * Read by `readChatLog`, which owns every pattern. This declaration carries
 * literal tokens and the NAME of a line shape, exactly as `ArchiveSpec` carries
 * the name of a grouping strategy: a connector may say which of the shapes this
 * package implements applies, never describe one of its own.
 */
export interface ChatLogSpec {
  /**
   * Closed set, implemented in `chatLog.ts`:
   *
   *  `bracket-ts-colon` — `[15/08/2026, 16:55:48] Name: text` (WhatsApp iOS,
   *                       and the browser exporters that imitate it).
   *  `dash-ts-colon`    — `15/08/2026, 16:55 - Name: text` (WhatsApp Android).
   */
  lineShape: 'bracket-ts-colon' | 'dash-ts-colon';
  /**
   * Literal marker that makes a stamped line a notice rather than a message,
   * e.g. `- ` where the sender would otherwise be.
   */
  systemPrefix?: string;
  /** Literal bodies that mean a call happened and nothing was said. */
  callMarkers?: string[];
  /** Literal placeholders a producer writes for a file it did not export. */
  mediaMarkers?: string[];
  /**
   * Literal bodies that are the exporter's own bug leaking out, not something a
   * person typed. MEASURED: one line of `null` in the first real file.
   */
  nullBodies?: string[];
  /**
   * What this producer calls the exporting human, e.g. `Vous`, `You`.
   *
   * ⚠️ A native export does NOT mark one: it writes the account's display name
   * like any other participant. Leaving this empty is the honest state, and
   * every turn then comes back `unknown` for the app to ask about once.
   */
  selfNames?: string[];
  /**
   * Force the numeric date order instead of letting the file prove it.
   *
   * 🚨 Declare this only for a producer that is known to write one order
   * whatever the machine's locale. For WhatsApp itself it is the phone's
   * setting, so declaring it here would be stating a fact nobody measured.
   */
  dateOrder?: 'mdy' | 'dmy';
}

/**
 * How a Telegram export is read. Doc 118 §10, implemented in `telegram.ts`.
 *
 * Thin on purpose, and that thinness is a MEASURED property of the format
 * rather than a shortcut: Telegram Desktop writes its keys and its enum values
 * in ASCII English (`from`, `text`, `service`, `phone_call`) whatever language
 * the app is running in. WhatsApp's text export localises everything it
 * writes — `<image omise>`, `[Appel]`, `Vous` — which is why `ChatLogSpec`
 * carries four lists of literals and this carries two.
 */
export interface TelegramSpec {
  /**
   * Closed set, implemented in `telegram.ts`:
   *
   *  `telegram-desktop-json` — Settings › Advanced › Export Telegram data, in
   *                            "machine-readable JSON". The HTML option is a
   *                            different animal and is not this.
   */
  shape: 'telegram-desktop-json';
  /**
   * Literal chat `type` values to leave out of the import entirely.
   *
   * ⚠️ A judgement, not a fact, which is why it lives in the connector where
   * somebody can disagree with it: a bot chat is a menu and a stream of
   * notifications, and filing it as conversation buries what people said under
   * what machines announced.
   */
  skipChatTypes?: string[];
  /**
   * Literal service `action` values that are a call rather than a notice.
   *
   * Declared because Telegram adds actions over time, and a new one appearing
   * as a plain notice is a miscount, where a new one appearing as a crash is a
   * connector that stops working on a file it could have read.
   */
  callActions?: string[];
}

/**
 * How a provider's export is laid out. Declared, never inferred.
 *
 * ⚠️ Two of the three shipped connectors are written against DOCUMENTED shape
 * and have never been run over a real export (see each file's `_verified`).
 * That field is not decoration: it is the difference between "this works" and
 * "this is what we believe the format to be", and the app has to be able to
 * say which it is holding.
 */
export interface ArchiveSpec {
  /** Path to the array of records. Empty string means the document itself. */
  root: string;
  /**
   * Which reading strategy applies. Closed set, implemented in `archive.ts`:
   *
   *  `openai-mapping` — conversations hold a node MAP with parent pointers and
   *                     a `current_node`. Regenerations are siblings, so the
   *                     kept path is the one walked back from `current_node`.
   *  `flat-turns`     — conversations hold an ordered array of turns.
   *  `none`           — no conversations at all: a flat activity stream where
   *                     each record is one exchange. Not a defect to paper
   *                     over; the reader reports `turnsOnly` and the app says
   *                     so rather than inventing threads.
   */
  grouping: 'openai-mapping' | 'flat-turns' | 'none';
  conversation?: {
    id?: string;
    title?: string;
    createdAt?: string;
    /** flat-turns: where the ordered turns sit. */
    turns?: string;
    /** openai-mapping: the node map, and the pointer to the live leaf. */
    nodes?: string;
    current?: string;
  };
  /** flat-turns and openai-mapping: how to read one turn. */
  turn?: {
    parent?: string;
    role?: string;
    /** A plain string field. */
    text?: string;
    /** An array of content parts; strings are kept, other parts counted. */
    parts?: string;
    time?: string;
  };
  /** `none`: how to read one activity record. */
  record?: {
    time?: string;
    humanText?: string;
    /** Escaped HTML of the model's reply. Converted to text by the reader. */
    assistantHtml?: string;
    assistantText?: string;
    attachments?: string;
  };
  /**
   * Which literal role values mean what. Declared because `human`/`user`/
   * `USER` are three spellings of one idea and guessing is how a connector
   * silently files the model's words as the person's.
   */
  roles?: { human: string[]; assistant: string[] };
  /**
   * Literal prefixes to strip off a record's human text, longest first.
   *
   * Literals, never a regex — the rule `between` already follows. 🪤 MEASURED
   * on a real French Takeout: the prefix is `"Prompt : "` with a
   * NON-BREAKING space, and `"Prompt: "` matched 0 of 2 084 entries. A
   * connector written against an English export finds nothing in a French one,
   * which is why this is a LIST and why `requirePrefix` exists.
   */
  humanPrefixes?: string[];
  /**
   * When true, a record whose text carries none of the declared prefixes is
   * SKIPPED and counted, never kept raw.
   *
   * Google's activity log mixes Gemini turns with other rows; keeping the
   * unprefixed ones would file Google's own labels as things the human typed.
   * The count is what makes the choice reviewable: a connector that has gone
   * stale shows up as a large skip, not as a quiet loss.
   */
  requirePrefix?: boolean;
}

/**
 * Where one API call's token counters sit, and how to tell two lines that
 * describe the SAME call apart from two calls.
 *
 * 🚨 `callId` is not an optimisation, it is the difference between a true
 * number and one that is roughly double. A harness writes one line per CONTENT
 * BLOCK of a reply, and every one of those lines repeats the whole `usage`
 * object. MEASURED on 870 real Claude Code transcripts, 2026-09-16: 213 461
 * lines carried a usage, and 105 736 of them — 49.5 % — were a second, third or
 * fourth copy of a call already counted. A reader without this field reports
 * 107 725 calls as 213 461.
 *
 * Declaring it is how a connector says "my harness does that". A harness that
 * writes one line per call omits it and every line counts, which is right for
 * it and would be wrong for Claude Code.
 */
export interface UsageSpec {
  /** Which lines carry a usage at all, e.g. `{ type: 'assistant' }`. */
  where?: Record<string, unknown>;
  /** Dotted path to the id shared by every line of one call. See above. */
  callId?: string;
  /**
   * Dotted paths to the counters, each optional.
   *
   * They are declared SEPARATELY and never pre-added, because they are not the
   * same thing and are not priced the same. `cacheRead` in particular is the
   * context re-read on every turn: on the same 870 transcripts it totals 39.5
   * BILLION tokens against 88 million of output, so a reader that folded the
   * four into one "tokens" number would produce a figure that is arithmetically
   * true and says nothing. What may be added to what is a decision for whoever
   * writes the label above the number.
   */
  fields: {
    input?: string;
    cacheWrite?: string;
    cacheRead?: string;
    output?: string;
    /** The part of `output` spent thinking. A SUBSET, never an addend. */
    thinking?: string;
  };
}

/**
 * What a set of API calls consumed. Five counters and a call count, none of
 * them folded into another — see {@link UsageSpec.fields}.
 */
export interface TokenCounts {
  /** Fresh prompt tokens the provider had to read. */
  input: number;
  /** Prompt tokens read fresh AND written to the cache. Priced above `input`
   *  by the provider, which is why it is not merged into it here. */
  cacheWrite: number;
  /** Prompt tokens served from cache. Re-read every turn, so this grows with
   *  the square of a conversation and dwarfs everything else. */
  cacheRead: number;
  output: number;
  /** Part of `output`. Adding it to `output` counts it twice. */
  thinking: number;
  /** Distinct API calls that reported a usage. */
  calls: number;
}

export function emptyCounts(): TokenCounts {
  return { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, thinking: 0, calls: 0 };
}

/** Add `b` into `a`, in place. */
export function addCounts(a: TokenCounts, b: TokenCounts): TokenCounts {
  a.input += b.input;
  a.cacheWrite += b.cacheWrite;
  a.cacheRead += b.cacheRead;
  a.output += b.output;
  a.thinking += b.thinking;
  a.calls += b.calls;
  return a;
}

/** Every day of a per-day map summed into one. */
export function totalCounts(byDay: Record<string, TokenCounts> | null | undefined): TokenCounts | null {
  if (!byDay) return null;
  const out = emptyCounts();
  for (const day of Object.values(byDay)) addCounts(out, day);
  return out;
}

/**
 * The LOCAL calendar day an instant falls on, as `YYYY-MM-DD`.
 *
 * Local and not UTC on purpose: the only reader of this is a human looking at
 * their own week, and a night session would otherwise land on tomorrow for
 * everyone west of Greenwich. Returns null for anything that is not a date —
 * a line the reader cannot place must not be filed under an invented day.
 */
export function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * A counter as the harness wrote it, or null.
 *
 * Never coerced: `Number(undefined)` is NaN and `Number(null)` is 0, and a
 * field the harness did not write must not become a measured zero. A negative
 * count is not a count either.
 */
export function asCount(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

export interface Connector {
  id: string;
  displayName: string;
  version: string;
  format: ConnectorFormat;
  kind: 'session' | 'document' | 'archive';
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
  /**
   * jsonl only: which vendor field carries which normalised one.
   *
   * Optional because it is as format-specific as `frontmatter` is to
   * markdown and `archive` is to json. An archive connector declaring an
   * empty `fields` would be stating that it has session metadata and that
   * all of it is missing, which is a different claim from not applying.
   */
  fields?: Record<string, string>;
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
  /**
   * json only: how to read a provider's data-export archive (doc 118).
   *
   * A chat export is a different animal from an agent transcript: ONE file
   * holds MANY conversations, there are no tools and no artifacts, and the
   * turn list is the whole content. It gets its own declaration rather than
   * bending `fields`, because reusing a shape that does not fit is how a
   * connector ends up carrying a lie in a field name.
   *
   * `grouping` names a STRATEGY from a closed set the interpreter implements.
   * That is the same split `shellWrite` already uses: the connector says which
   * one applies, the code owns how it works. A connector may never carry an
   * algorithm, only the name of one this package already ships.
   */
  archive?: ArchiveSpec;
  /**
   * chatlog only: how to read a messaging app's exported text log (doc 118 §9).
   *
   * Its own declaration rather than a bent `archive`, for the reason §2 of that
   * doc already paid once: one file here is ONE conversation between N named
   * PEOPLE, where an archive is many conversations between a human and a model.
   * The roles do not map, and forcing them would file a friend's words under
   * the label memory keeps for a model's output.
   */
  chatLog?: ChatLogSpec;
  /**
   * json only: how to read a Telegram Desktop export (doc 118 §10).
   *
   * A fourth declaration rather than a bent `chatLog`, because the two share a
   * MODEL and nothing else: one file here holds many conversations, the dates
   * are unambiguous, and continuation lines do not exist. Doc 118 §9.5 called
   * this out before either was written — same model, other reader.
   */
  telegram?: TelegramSpec;
  /**
   * jsonl only: where a harness writes what one API call consumed.
   *
   * Optional, and absent is a real answer: a harness that records no usage
   * leaves `SessionState.tokens` null, which the view renders as "—" rather
   * than as zero. An agent that used no tokens and an agent that never said
   * are not the same claim.
   */
  usage?: UsageSpec;
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
  /**
   * What this session's API calls consumed, split by LOCAL calendar day.
   *
   * Per day and not one total, because a session that runs past midnight is
   * two days of work and an activity graph built from session totals would put
   * all of it on one square. `totalCounts` folds the map when a single figure
   * is what is wanted.
   *
   * 🚨 null means the connector declares no usage — this harness does not
   * record it. Never an empty object, which would read as "measured, and it
   * was nothing".
   */
  tokens: Record<string, TokenCounts> | null;
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
export function pick(obj: unknown, path: string | undefined): unknown {
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
export function asString(v: unknown): string | null {
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

/**
 * Fold one line's usage into the per-day map, unless this call is already in it.
 *
 * Three refusals live here, and each of them is a number that would otherwise
 * be wrong rather than missing:
 *
 *  1. A call already seen is skipped — see {@link UsageSpec.callId}.
 *  2. A line where every counter is absent adds NOTHING, not a zero-token call.
 *     `calls` is meant to count API calls, and a harness writes plenty of
 *     assistant lines that never were one.
 *  3. A line with no readable timestamp is dropped rather than filed under the
 *     session's own day. There is no honest square for a call that cannot be
 *     placed, and inventing one is how a quiet night grows a bar.
 */
function accumulateUsage(
  spec: UsageSpec,
  line: unknown,
  ts: string | null,
  byDay: Record<string, TokenCounts>,
  seenCalls: Set<string>,
): void {
  if (spec.where && !matches(line, spec.where)) return;

  const id = spec.callId ? asString(pick(line, spec.callId)) : null;
  if (id !== null && seenCalls.has(id)) return;

  const f = spec.fields;
  const input = asCount(pick(line, f.input));
  const cacheWrite = asCount(pick(line, f.cacheWrite));
  const cacheRead = asCount(pick(line, f.cacheRead));
  const output = asCount(pick(line, f.output));
  const thinking = asCount(pick(line, f.thinking));
  if (input === null && cacheWrite === null && cacheRead === null && output === null) return;

  // Marked seen only once it is established that this line IS a call. A line
  // matching `where` but carrying no counters must not consume the id of the
  // one that does.
  if (id !== null) seenCalls.add(id);

  const day = dayKey(ts);
  if (day === null) return;

  const bucket = byDay[day] ?? (byDay[day] = emptyCounts());
  bucket.input += input ?? 0;
  bucket.cacheWrite += cacheWrite ?? 0;
  bucket.cacheRead += cacheRead ?? 0;
  bucket.output += output ?? 0;
  bucket.thinking += thinking ?? 0;
  bucket.calls += 1;
}

export function readSession(conn: Connector, file: string, path: string, text: string, sizeBytes: number): SessionState | null {
  const st: SessionState = {
    file, path, sessionId: null, title: null, model: null, projectPath: null, branch: null,
    isSidechain: false, lastEventAt: null, firstEventAt: null, tool: null, sizeBytes,
    artifacts: [], artifactsCapped: false, humanTurns: [],
    tokens: conn.usage ? {} : null,
  };
  const lines = completeLines(text);
  const seenArtifacts = new Set<string>();
  /** Calls already counted, so the second line of one reply does not count its
   *  usage again. See UsageSpec: half the lines on this machine are copies. */
  const seenCalls = new Set<string>();
  /** The most recent line that SAYS whether this is a side chain decides it. */
  let sidechainRead = false;

  for (let i = lines.length - 1; i >= 0; i--) {
    let o: unknown;
    try {
      o = JSON.parse(lines[i] ?? '');
    } catch {
      continue; // a truncated or corrupt line is skipped, never fatal
    }

    if (!st.lastEventAt) {
      const ts = pick(o, conn.fields?.timestamp);
      if (typeof ts === 'string') st.lastEventAt = ts;
    }
    // 🚨 Each field from the most recent line that CARRIES it, not from the
    // last timestamped line whatever it is: Claude Code's `queue-operation`
    // lines (a message queued while the agent works) carry a timestamp and a
    // session id but no cwd and no branch. Latched together, a LIVE session
    // read « neither project nor branch » every time a queued message was its
    // last line — measured on this machine, 8 % of a session's life — and its
    // collision vanished from the screen, the MCP and the commit hook.
    if (st.sessionId === null) st.sessionId = asString(pick(o, conn.fields?.sessionId));
    if (st.branch === null) st.branch = asString(pick(o, conn.fields?.branch));
    if (st.projectPath === null) st.projectPath = asString(pick(o, conn.fields?.projectPath));
    if (!sidechainRead) {
      const side = pick(o, conn.fields?.isSidechain);
      if (typeof side === 'boolean') { st.isSidechain = side; sidechainRead = true; }
    }
    // Walking backwards, every timestamped line overwrites this, so the last
    // one written is the earliest line in the file.
    const ts = asString(pick(o, conn.fields?.timestamp));
    if (ts) st.firstEventAt = ts;

    if (!st.model) st.model = asString(pick(o, conn.fields?.model));

    if (conn.usage && st.tokens) accumulateUsage(conn.usage, o, ts, st.tokens, seenCalls);

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
          st.humanTurns.push({ at: asString(pick(o, conn.fields?.timestamp)), text: text.trim() });
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
    const flat = parseFrontmatter(fm[1] ?? '');
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
  // 🪤 The class excludes '[' as well as ']': with `[^\]]+` a body made of
  // `[[[[…` re-scanned to its end from every position (quadratic), and a note
  // can arrive from someone else's machine over a replicated vault.
  const seen = new Set<string>();
  for (const m of doc.body.matchAll(/\[\[([^[\]]+)\]\]/g)) {
    const target = (m[1] ?? '').trim();
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
 *
 * The line is trimmed BEFORE the pattern, and the pattern has no `$`. CodeQL
 * flags `\s*:\s*(.*)$` as polynomial (spaces handed back one at a time when
 * `$` fails on a lone '\r'); MEASURED in V8 it is not — 0 ms at 400k spaces —
 * so this is a simplification that closes the alert, not a fix for a hang.
 * The value is trimmed afterwards anyway, so nothing the anchor guaranteed is
 * lost.
 */
function parseFrontmatter(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  let parent = '';
  for (const raw of block.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indented = /^\s+/.test(raw);
    const m = /^([A-Za-z0-9_-]+)\s*:(.*)/.exec(raw.trim());
    if (!m) continue;
    const [, key = '', value = ''] = m;
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
  const fields = Object.keys(conn.format === 'markdown' ? (conn.frontmatter ?? {}) : (conn.fields ?? {}));
  if (conn.artifact) fields.push('files written');
  // Named separately: it is a different READ (the text of the commands the
  // agent ran), and consent to "which files it edited" is not consent to that.
  if (conn.shellWrite) fields.push('shell commands, for the files they write');
  // Named separately for the same reason: consent to "which files it edited"
  // is not consent to a record of how much you spend and at what hours. The
  // calendar this feeds is a picture of someone's working days.
  if (conn.usage) fields.push('tokens used, per call');
  return fields;
}
