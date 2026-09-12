/**
 * Reading a provider's data-export archive. Doc 118.
 *
 * Every major assistant is obliged to hand you your conversations back
 * (GDPR art. 20 calls for a structured, machine-readable format). Nobody ships
 * a tool that does anything with the result, so the zip sits in Downloads. This
 * file is the reader.
 *
 * It shares the package's two rules and adds nothing to them:
 *
 *  1. **A connector is DATA, never code.** `ArchiveSpec` carries field paths,
 *     literal prefixes, and the NAME of a layout strategy. It never carries an
 *     algorithm or a pattern. The three strategies live here, in code.
 *  2. **Absent stays absent.** A turn with no readable timestamp gets `null`,
 *     never the conversation's own and never the epoch. A date nobody recorded
 *     must not become a date on screen.
 *
 * And one rule this file adds, which is the whole reason it is not a loop over
 * JSON:
 *
 *  3. **Nothing is dropped in silence.** A regenerated branch, an unlabelled
 *     activity row, a conversation whose live path cannot be found: each is
 *     counted with a reason. An import that quietly keeps 60% of a year of
 *     conversations is indistinguishable, on screen, from one that kept all of
 *     it — and the person cannot tell until they go looking for something that
 *     is not there.
 */

import { pick, asString, type Connector } from './connector';

/** Who said it. The two values every provider agrees on, whatever they call them. */
export type Role = 'human' | 'assistant';

export interface Turn {
  role: Role;
  text: string;
  /** ISO 8601, or null when the export carried no usable time for this turn. */
  at: string | null;
}

export interface ConversationState {
  id: string | null;
  title: string | null;
  startedAt: string | null;
  endedAt: string | null;
  turns: Turn[];
  /**
   * Turns the export carried that are NOT on the kept path.
   *
   * On an OpenAI export every regeneration is a sibling branch, so a
   * conversation the person remembers as linear can hold three contradictory
   * answers to the same question. Keeping them all poisons recall; dropping
   * them without a word makes the export look smaller than it was. So: dropped,
   * and counted.
   */
  abandonedTurns: number;
  /** File names the export references for this conversation, in order seen. */
  attachments: string[];
}

export interface ArchiveState {
  /** The connector that read it. */
  source: string;
  conversations: ConversationState[];
  /**
   * What was not kept, and why. Reasons are stable machine-readable slugs; the
   * app maps them to a sentence, so a new reason cannot appear untranslated.
   */
  skipped: { reason: SkipReason; count: number }[];
  /**
   * The format carries no conversation grouping AT ALL, so every entry here is
   * a lone exchange.
   *
   * MEASURED on a real Takeout (2 084 entries, 2026-03-10): `titleUrl` is
   * absent from every row and no thread id exists anywhere in the file. Two
   * rows added from a shared link even carry the same millisecond, so grouping
   * by time proximity would invent threads rather than recover them. The app
   * has to say "turns, not conversations" instead of pretending.
   */
  turnsOnly: boolean;
  /**
   * Whether the connector's `root` actually led to a list of records.
   *
   * 🎭 Absent is not zero. Without this, a file this connector does not fit
   * comes back as `recordsSeen: 0`, and the app says "0 conversations found" —
   * which reads as "your export is empty" to someone holding a 500 MB archive.
   * The two need different sentences, so they need different facts.
   */
  rootFound: boolean;
  /** Records the reader looked at, before any of them were kept or skipped.
   *  Meaningless unless `rootFound`. */
  recordsSeen: number;
}

export type SkipReason =
  /** An activity row carrying none of the connector's declared prefixes. */
  | 'no-prefix'
  /**
   * An activity row whose prompt was nothing but the prefix.
   *
   * MEASURED: 26 of 2 084 real rows look like this, and every one of them
   * carries a REPLY. Kept, they become an answer with no question — content no
   * search can ever reach, filed under a title that is the empty string.
   */
  | 'empty-prompt'
  /** A turn whose role matched neither the human nor the assistant list. */
  | 'unknown-role'
  /** A turn that held no text once non-text parts were set aside. */
  | 'empty'
  /** A conversation whose live path could not be walked (see walkOpenAiPath). */
  | 'no-live-path'
  /**
   * A conversation that survived parsing but produced no usable turn.
   *
   * Record-level, because the RECORD is what was lost. Its individual turns are
   * also counted under their own reasons, which is not double counting: one
   * bucket answers "how many rows of my export are in there", the other answers
   * "what went wrong inside them".
   */
  | 'no-turns'
  /** A content part that was not text: an image pointer, an audio asset. */
  | 'non-text-part'
  /** A record that was not an object at all. */
  | 'malformed';

/**
 * Reasons that cost a whole RECORD, as opposed to one turn inside a kept one.
 *
 * The distinction is not pedantry: it is the only way a review screen can add
 * up. `conversations.length` plus the record-level counts equals `recordsSeen`
 * exactly; adding the turn-level ones on top overshoots, which is how a screen
 * ends up telling someone their 2 084 rows came to 2 110.
 */
export const RECORD_LEVEL_REASONS: readonly SkipReason[] =
  ['no-prefix', 'empty-prompt', 'no-live-path', 'no-turns', 'malformed'] as const;

/** Kept records plus record-level skips. Equals `recordsSeen` when the reader
 *  has accounted for everything it was given. */
export function accountedFor(st: ArchiveState): number {
  return st.conversations.length
    + st.skipped.filter(s => RECORD_LEVEL_REASONS.includes(s.reason)).reduce((n, s) => n + s.count, 0);
}

/** Counter that only materialises the reasons actually hit. */
class Skips {
  private readonly counts = new Map<SkipReason, number>();
  add(reason: SkipReason, n = 1): void {
    if (n <= 0) return;
    this.counts.set(reason, (this.counts.get(reason) ?? 0) + n);
  }
  list(): { reason: SkipReason; count: number }[] {
    return [...this.counts.entries()].map(([reason, count]) => ({ reason, count }));
  }
}

/**
 * A timestamp, whatever the provider chose to store.
 *
 * 🪤 Seconds or milliseconds is not a detail. OpenAI writes `create_time` as a
 * float of epoch SECONDS; read as milliseconds it lands in January 1970, which
 * is a perfectly convincing date that sorts every imported conversation before
 * everything else the person owns. The split is at 1e11: that is year 5138 in
 * seconds and 1973 in milliseconds, so no real value is ambiguous.
 *
 * 🎭 `0` is not a date. It is the value a field has when nobody filled it, and
 * turning it into 1970-01-01 is the difference between an absent timestamp and
 * a wrong one.
 */
export function toIso(v: unknown): string | null {
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v <= 0) return null;
    const ms = v < 1e11 ? v * 1000 : v;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === 'string' && v.trim()) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#34': '"',
};

/**
 * Escaped HTML to plain text.
 *
 * Google stores the model's reply as an HTML fragment. This is a converter, not
 * a sanitiser: the output is text that goes into a memory store, never into a
 * DOM, so there is nothing here to defeat. Block tags become newlines so the
 * shape of a list survives; everything else goes.
 *
 * Patterns live here rather than in the connector on purpose — a pathological
 * pattern shipped by a stranger would hang the reader on someone else's
 * machine, which is rule 1.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, code: string) => {
      const key = code.toLowerCase();
      if (key in ENTITIES) return ENTITIES[key];
      if (key.startsWith('#x')) {
        const n = parseInt(key.slice(2), 16);
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
      }
      if (key.startsWith('#')) {
        const n = parseInt(key.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
      }
      return whole;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Strip whichever declared prefix this text opens with.
 *
 * Longest first, so `"Prompt: "` cannot shadow a longer prefix that happens to
 * start with it. Returns `matched: false` when none applied, and the caller
 * decides whether that is a skip — a connector for a format where the prefix is
 * optional keeps the text, one for an activity log throws the row away.
 */
export function stripPrefix(
  text: string,
  prefixes: string[] | undefined,
): { text: string; matched: boolean } {
  if (!prefixes || prefixes.length === 0) return { text, matched: true };
  const ordered = [...prefixes].sort((a, b) => b.length - a.length);
  for (const p of ordered) {
    if (p && text.startsWith(p)) return { text: text.slice(p.length).trim(), matched: true };
  }
  return { text, matched: false };
}

/**
 * Every value at a path that walks THROUGH an array: `a[].b`.
 *
 * 🪤 `pick` only understands a `[]` at the END of a path. Given
 * `safeHtmlItem[].html` it looks for a key literally called `safeHtmlItem[]`,
 * finds nothing, and returns undefined — which arrives at the caller as "this
 * record has no reply" rather than as an error. Every model answer in the
 * Gemini fixture disappeared that way, silently, under a connector whose path
 * was a correct description of the file.
 *
 * Extending `pick` itself would change behaviour for the transcript connectors
 * that already ship, so the mid-path walk lives here and they stay untouched.
 */
export function pickList(obj: unknown, path: string | undefined): unknown[] {
  if (!path) return [];
  const idx = path.indexOf('[]');
  if (idx < 0) {
    const v = pick(obj, path);
    if (Array.isArray(v)) return v;
    return v === undefined || v === null ? [] : [v];
  }
  const arr = pick(obj, path.slice(0, idx));
  if (!Array.isArray(arr)) return [];
  const tail = path.slice(idx + 2).replace(/^\./, '');
  if (!tail) return arr;
  return arr.map(el => pick(el, tail)).filter(v => v !== undefined && v !== null);
}

/** Text of a turn, from a plain field or from an array of content parts. */
function textOf(
  node: unknown,
  spec: { text?: string; parts?: string } | undefined,
  skips: Skips,
): string {
  if (!spec) return '';
  const direct = pick(node, spec.text);
  if (typeof direct === 'string' && direct.trim()) return direct;

  const parts = pick(node, spec.parts);
  if (!Array.isArray(parts)) return typeof direct === 'string' ? direct : '';

  const kept: string[] = [];
  let dropped = 0;
  for (const p of parts) {
    if (typeof p === 'string') { if (p) kept.push(p); continue; }
    // A content part that is not a string is an asset pointer (an image, an
    // audio clip). Counted, never rendered as "[object Object]".
    if (p && typeof p === 'object') {
      const t = (p as { type?: unknown; text?: unknown });
      if (t.type === 'text' && typeof t.text === 'string') { if (t.text) kept.push(t.text); continue; }
      dropped++;
      continue;
    }
    dropped++;
  }
  skips.add('non-text-part', dropped);
  return kept.join('\n');
}

/** Which side of the conversation a role value names. Declared, never guessed. */
function roleOf(raw: unknown, roles: { human: string[]; assistant: string[] } | undefined): Role | null {
  const v = asString(raw);
  if (!v) return null;
  const lower = v.toLowerCase();
  const human = (roles?.human ?? ['user', 'human']).map(r => r.toLowerCase());
  const assistant = (roles?.assistant ?? ['assistant', 'model']).map(r => r.toLowerCase());
  if (human.includes(lower)) return 'human';
  if (assistant.includes(lower)) return 'assistant';
  return null;
}

/**
 * The nodes on the live path of an OpenAI-style conversation, oldest first.
 *
 * The export is a TREE, not a list: every regeneration hangs off the same
 * parent as the answer it replaced. `current_node` points at the leaf the
 * person was last looking at, so walking `parent` upward from there and
 * reversing gives the conversation as they remember it.
 *
 * Returns null when that walk cannot be made — no `current_node`, or one that
 * names a node the map does not contain.
 *
 * ⚠️ DECISION, to revisit against a real export: a conversation whose live path
 * cannot be found is SKIPPED and counted, not flattened. Flattening would put
 * three contradictory answers to one question into memory, and the whole point
 * of the feature is that recall stays worth trusting. Skipping loses the
 * conversation, which is worse for that one row and better for every later
 * search — and the count makes the trade visible instead of invisible.
 */
export function walkOpenAiPath(
  nodes: Record<string, unknown>,
  currentId: string | null,
  parentPath: string,
): unknown[] | null {
  if (!currentId || !(currentId in nodes)) return null;
  const path: unknown[] = [];
  const seen = new Set<string>();
  let id: string | null = currentId;
  while (id) {
    // A malformed export can point a node at its own ancestor. Without the
    // seen-set this hangs the import; WITH it but without the refusal below,
    // it returns the tail of a loop as though it were a conversation.
    if (seen.has(id)) return null;
    seen.add(id);
    const node = nodes[id];
    // A parent id the map does not hold means the chain is broken ABOVE here.
    // Returning what we have would hand back a conversation quietly missing
    // its oldest turns — a truncation that announces itself nowhere, which is
    // worse than one counted skip the app can put on screen.
    if (node === undefined) return null;
    path.push(node);
    id = asString(pick(node, parentPath));
  }
  path.reverse();
  return path;
}

/** Push a turn, unless it has no text once non-text parts are set aside. */
function pushTurn(conv: ConversationState, role: Role | null, text: string, at: string | null, skips: Skips): void {
  if (!role) { skips.add('unknown-role'); return; }
  const clean = text.trim();
  if (!clean) { skips.add('empty'); return; }
  conv.turns.push({ role, text: clean, at });
}

/** First and last timestamps actually present on the kept turns. */
function stampConversation(conv: ConversationState, declaredStart: string | null): void {
  const times = conv.turns.map(t => t.at).filter((t): t is string => !!t);
  // The declared creation time wins when the export has one: it is the fact the
  // provider recorded, where the first turn's stamp is only the earliest one
  // that survived reading.
  conv.startedAt = declaredStart ?? times[0] ?? null;
  conv.endedAt = times.length ? times[times.length - 1] : null;
}

function newConversation(): ConversationState {
  return { id: null, title: null, startedAt: null, endedAt: null, turns: [], abandonedTurns: 0, attachments: [] };
}

/**
 * Read one export file.
 *
 * Takes the already-decoded text: where it came from is the caller's business,
 * exactly like the rest of this package. Returns null only when the document is
 * not JSON at all — a shape that does not match the connector yields an empty
 * result with counted skips, because "this connector does not fit this file" is
 * something the app must be able to SAY.
 */
export function readArchive(conn: Connector, text: string): ArchiveState | null {
  const spec = conn.archive;
  if (!spec) return null;

  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }

  const rootVal = spec.root ? pick(doc, spec.root) : doc;
  const records = Array.isArray(rootVal) ? rootVal : null;
  const skips = new Skips();
  const state: ArchiveState = {
    source: conn.id,
    conversations: [],
    skipped: [],
    turnsOnly: spec.grouping === 'none',
    rootFound: records !== null,
    recordsSeen: records?.length ?? 0,
  };
  if (!records) { state.skipped = skips.list(); return state; }

  for (const rec of records) {
    if (!rec || typeof rec !== 'object') { skips.add('malformed'); continue; }
    if (spec.grouping === 'none') readActivityRecord(spec, rec, state, skips);
    else if (spec.grouping === 'openai-mapping') readMappedConversation(spec, rec, state, skips);
    else readFlatConversation(spec, rec, state, skips);
  }

  state.skipped = skips.list();
  return state;
}

/**
 * One row of a flat activity log: a prompt and, usually, the reply.
 *
 * Each row becomes its own one-or-two-turn conversation, because that is
 * literally what the file contains. `turnsOnly` on the result is what stops the
 * app from calling these threads.
 */
function readActivityRecord(
  spec: NonNullable<Connector['archive']>,
  rec: object,
  state: ArchiveState,
  skips: Skips,
): void {
  const r = spec.record ?? {};
  const raw = asString(pick(rec, r.humanText));
  // Record-level, not turn-level: this row produces nothing, so it has to be
  // counted in the bucket that adds up against recordsSeen.
  if (!raw) { skips.add('empty-prompt'); return; }

  const { text, matched } = stripPrefix(raw, spec.humanPrefixes);
  if (!matched && spec.requirePrefix) { skips.add('no-prefix'); return; }

  // A row whose title was nothing but the prefix. MEASURED: all 26 real cases
  // carry a reply, so the earlier shape kept them as an answer to a question
  // nobody can see, under an empty title — and counted them twice, once as
  // kept and once as empty. An exchange with no human side is not an exchange.
  if (!text.trim()) { skips.add('empty-prompt'); return; }

  const at = toIso(pick(rec, r.time));
  const conv = newConversation();
  // The title is the opening of what was asked. Not a name the provider gave —
  // it never gave one — so the app can tell the two apart if it wants to.
  conv.title = text.split('\n')[0].slice(0, 80) || null;
  conv.turns.push({ role: 'human', text: text.trim(), at });

  // The connector names the whole path through the array
  // (`safeHtmlItem[].html`), so the vendor's key stays in the connector where
  // it belongs instead of being hard-coded in this reader.
  let reply = pickList(rec, r.assistantHtml)
    .map(asString)
    .filter((h): h is string => !!h)
    .map(htmlToText)
    .filter(Boolean)
    .join('\n\n');
  if (!reply) reply = asString(pick(rec, r.assistantText)) ?? '';
  if (reply.trim()) conv.turns.push({ role: 'assistant', text: reply.trim(), at });

  for (const f of pickList(rec, r.attachments)) {
    const n = asString(f);
    if (n) conv.attachments.push(n);
  }

  // The SAME stamping door the two conversation shapes use. It agreed with the
  // hand-written pair it replaces, which is exactly what makes a second door
  // survive review until the day one of them changes.
  stampConversation(conv, at);
  state.conversations.push(conv);
}

/** A conversation holding an ordered array of turns. */
function readFlatConversation(
  spec: NonNullable<Connector['archive']>,
  rec: object,
  state: ArchiveState,
  skips: Skips,
): void {
  const c = spec.conversation ?? {};
  const conv = newConversation();
  conv.id = asString(pick(rec, c.id));
  conv.title = asString(pick(rec, c.title));

  const turns = pick(rec, c.turns);
  if (!Array.isArray(turns)) { skips.add('malformed'); return; }

  for (const t of turns) {
    if (!t || typeof t !== 'object') { skips.add('malformed'); continue; }
    const role = roleOf(pick(t, spec.turn?.role), spec.roles);
    pushTurn(conv, role, textOf(t, spec.turn, skips), toIso(pick(t, spec.turn?.time)), skips);
  }

  if (!conv.turns.length) { skips.add('no-turns'); return; }
  stampConversation(conv, toIso(pick(rec, c.createdAt)));
  state.conversations.push(conv);
}

/** A conversation holding a node map with parent pointers (see walkOpenAiPath). */
function readMappedConversation(
  spec: NonNullable<Connector['archive']>,
  rec: object,
  state: ArchiveState,
  skips: Skips,
): void {
  const c = spec.conversation ?? {};
  const nodesVal = pick(rec, c.nodes);
  if (!nodesVal || typeof nodesVal !== 'object' || Array.isArray(nodesVal)) { skips.add('malformed'); return; }
  const nodes = nodesVal as Record<string, unknown>;

  const path = walkOpenAiPath(nodes, asString(pick(rec, c.current)), spec.turn?.parent ?? 'parent');
  if (!path) { skips.add('no-live-path'); return; }

  const conv = newConversation();
  conv.id = asString(pick(rec, c.id));
  conv.title = asString(pick(rec, c.title));

  const onPath = new Set(path);
  for (const node of path) {
    const role = roleOf(pick(node, spec.turn?.role), spec.roles);
    // A system or tool node is part of the path but not part of the
    // conversation. It is not a defect, so it is not counted as a skip: only
    // roles the connector declared and could not place are.
    if (!role) continue;
    pushTurn(conv, role, textOf(node, spec.turn, skips), toIso(pick(node, spec.turn?.time)), skips);
  }

  // Everything the export carried that is NOT on the kept path and that a
  // person or the model actually said. This is the number that makes the
  // truncation announce itself.
  for (const id of Object.keys(nodes)) {
    const node = nodes[id];
    if (onPath.has(node)) continue;
    if (roleOf(pick(node, spec.turn?.role), spec.roles)) conv.abandonedTurns++;
  }

  if (!conv.turns.length) { skips.add('no-turns'); return; }
  stampConversation(conv, toIso(pick(rec, c.createdAt)));
  state.conversations.push(conv);
}

/**
 * The consent sentence for an archive connector, DERIVED from its declaration.
 *
 * Same promise `describeConnector` makes for a transcript: because a connector
 * is data, the app can state exactly what will be read, and that statement
 * cannot drift from what the reader does.
 */
export function describeArchive(conn: Connector): string[] {
  const spec = conn.archive;
  if (!spec) return [];
  const out: string[] = [];
  if (spec.grouping === 'none') {
    if (spec.record?.humanText) out.push('what you typed');
    if (spec.record?.assistantHtml || spec.record?.assistantText) out.push("the model's replies");
    if (spec.record?.time) out.push('when');
    if (spec.record?.attachments) out.push('the names of files you attached');
    return out;
  }
  if (spec.conversation?.title) out.push('conversation titles');
  out.push('what you typed', "the model's replies");
  if (spec.turn?.time) out.push('when');
  return out;
}
