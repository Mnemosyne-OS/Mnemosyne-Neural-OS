/**
 * Reading a human-to-human chat log. Doc 118 §9 (WhatsApp, Telegram txt, Signal).
 *
 * This is a THIRD animal, next to an agent transcript and a provider archive,
 * and it gets its own declaration for the reason doc 118 already paid for once:
 * reusing a shape that does not fit is how a field ends up carrying a lie in
 * its name.
 *
 *   agent transcript — one live file, one session, tools and artifacts
 *   provider archive — one dead file, MANY conversations, human vs model
 *   chat log         — one dead file, ONE conversation, N named PEOPLE
 *
 * The third line is the whole reason this file exists. `readArchive` knows two
 * roles, `human` and `assistant`. Filing a friend's messages under `assistant`
 * would put another person's words under the label memory reserves for a
 * model's output, and every later recall would inherit that. So a chat turn
 * carries a NAME, and the only thing the reader decides is which of those names
 * is the person doing the importing.
 *
 * The package's two rules travel here unchanged:
 *
 *  1. **A connector is DATA, never code.** What follows takes literal tokens
 *     and the NAME of a line shape from a closed set. Every pattern lives in
 *     this file. A connector a stranger ships can at worst fail to parse.
 *  2. **Absent stays absent.** A line whose date cannot be resolved gets
 *     `at: null` and keeps its raw stamp, never a date the reader picked.
 *
 * And the one this format forces into the open:
 *
 *  3. **`12/09/2025` is not a date.** It is two numbers and a convention the
 *     file does not state. WhatsApp writes the phone's locale, so the same
 *     conversation exports as month-first or day-first depending on whose
 *     handset it came off. Guessing produces a date that is wrong by up to
 *     eleven months and looks perfectly ordinary on screen. The reader RESOLVES
 *     it from the file when the file can prove it, reports `ambiguous` when it
 *     cannot, and never splits the difference.
 */

import type { ChatLogSpec, Connector } from './connector';

/**
 * Who said it, in a conversation between people.
 *
 * `self` is the person whose export this is, named by the producer with a word
 * like `Vous` or `You` and declared in the connector. `peer` is anybody else,
 * and in a group that is several distinct humans — which is why the NAME is the
 * fact and the role is only a convenience for the two-party case.
 *
 * `unknown` is not a failure: a producer that writes no self-name at all (a
 * native export uses the account's own display name, which the file never
 * marks) leaves every turn `unknown`, and the app can ask once instead of the
 * reader inventing an answer.
 */
export type ChatRole = 'self' | 'peer' | 'unknown';

export interface ChatTurn {
  /** Exactly as written in the file. The fact; the role is derived from it. */
  speaker: string;
  role: ChatRole;
  text: string;
  /**
   * ISO 8601 WITHOUT a zone designator, e.g. `2026-08-15T16:55:48`.
   *
   * 🚨 Deliberately naive, and deliberately not `Z`. The file carries a wall
   * clock and no offset. Stamping it UTC would move every message by the
   * exporter's offset — a shift nobody can detect later, because the result is
   * a valid timestamp that is simply wrong. Naive is what the file says.
   *
   * `null` when the date order could not be resolved (see `dateOrder`) or the
   * stamp did not parse. `rawAt` still holds what was written.
   */
  at: string | null;
  /** The bracketed stamp as it appeared, so nothing is lost when `at` is null. */
  rawAt: string;
  /**
   * The producer's placeholder for a file it did not export, exactly as
   * written, or null when the turn carried none.
   *
   * 🚨 MEASURED, and it is the finding that shaped this field: a placeholder is
   * a PREFIX, not a whole message. Of 164 placeholder lines in the first real
   * file, 114 stood alone and **50 carried a caption behind them** — `<image
   * omise> Polka`, `<document omis> Pots - Tasses - Vases.7z`. Matching the
   * whole body leaves `<image omise> ` welded to the front of fifty real
   * sentences, where every one of them is then recalled with a token nobody
   * wrote. So the marker is stripped off, counted here, and the caption stays
   * the text.
   */
  media: string | null;
  /**
   * The placeholder was the whole message: a photo sent with nothing said.
   *
   * Kept as a turn rather than skipped, because something WAS sent at that
   * moment and a conversation with the photos silently removed reads as though
   * there were gaps in the talking. The flag is what lets a screen show it as
   * an absence instead of as words.
   */
  mediaOnly: boolean;
}

/** Why a line did not become a turn. Stable slugs; the app owns the sentences. */
export type ChatSkipReason =
  /**
   * A line before the first timestamp. Real exports open with an unstamped
   * encryption notice, and it belongs to nobody.
   */
  | 'preamble'
  /** A timestamped line the producer marked as a notice rather than a message. */
  | 'system-notice'
  /**
   * A call event. MEASURED: 60 of 2 052 lines in the first real file, every one
   * of them the bare word `[Appel]` — no direction, no duration, no answer.
   * Counted rather than kept: a turn whose text is `[Appel]` is noise in recall,
   * and a count is the honest whole of what the producer wrote down.
   */
  | 'call'
  /**
   * A body the producer wrote as the literal string `null`. MEASURED: one in
   * the first real file. That is a bug leaking out of the exporter, not
   * something anybody typed, and keeping it files the word "null" as a message.
   */
  | 'null-body'
  /** A timestamped line with a stamp this reader could not read. */
  | 'unreadable-stamp'
  /** A timestamped line with no speaker and no system marker. */
  | 'no-speaker'
  /** Empty once trimmed. */
  | 'empty';

/**
 * Reasons that cost a whole LINE, which is all of them here.
 *
 * Kept as a named list anyway, because `accountedForLines` has to stay true
 * when a turn-level reason is added later, and the archive reader paid for
 * learning that the hard way (2 110 rows reported out of 2 084).
 */
export const CHAT_LINE_LEVEL_REASONS: readonly ChatSkipReason[] =
  ['preamble', 'system-notice', 'call', 'null-body', 'unreadable-stamp', 'no-speaker', 'empty'] as const;

/**
 * Which way round the numeric date is, and HOW that is known.
 *
 * `declared` means the connector stated it. `proved` means a day above 12
 * appeared in the file, which settles it for the whole file. `ambiguous` means
 * every date in the file fits both readings — a short conversation inside the
 * first twelve days of a month — and the reader refuses to pick.
 *
 * 🚨 `conflict` is its own verdict and must never be folded into `ambiguous`:
 * it means BOTH fields exceeded 12 somewhere, so the file is not in one
 * consistent order and no single answer can be right. Telling someone "we
 * could not tell" invites them to choose, and here choosing is wrong.
 */
export type DateOrder = 'mdy' | 'dmy' | 'ambiguous' | 'conflict';

export interface ChatLogState {
  source: string;
  /** What the producer called the conversation, when it says so. */
  chatName: string | null;
  /** Every distinct speaker, in order of first appearance. */
  participants: string[];
  /** Which participant is the exporting human, when the producer marks one. */
  self: string | null;
  turns: ChatTurn[];
  /** First and last resolved stamps. Null while `dateOrder` is unresolved. */
  startedAt: string | null;
  endedAt: string | null;
  dateOrder: DateOrder;
  /** How `dateOrder` was reached, for a screen that has to justify a date. */
  dateOrderBasis: 'declared' | 'proved' | 'none';
  /** The token that proved it, e.g. `8/15/26`. Null unless `proved`. */
  dateOrderEvidence: string | null;
  /**
   * The connector's line shape matched at least one line.
   *
   * 🎭 Absent is not zero. A file this connector does not fit comes back with
   * zero turns, which reads as "this conversation is empty" to someone holding
   * a year of messages. The two need different sentences, so different facts.
   */
  shapeMatched: boolean;
  /** Non-empty lines the reader looked at. */
  linesSeen: number;
  /**
   * Lines folded into the turn above them, because a message with a newline in
   * it is written across several lines with no stamp of its own.
   *
   * MEASURED: 205 of 2 297 lines in the first real file, near a tenth of it. A
   * reader that drops unstamped lines loses the tail of every long message and
   * reports a perfectly plausible count while doing it.
   */
  mergedLines: number;
  /** Turns whose whole content was a media placeholder. */
  mediaPlaceholders: number;
  skipped: { reason: ChatSkipReason; count: number }[];
}

/**
 * Kept turns, plus folded lines, plus line-level skips.
 *
 * Equals `linesSeen` when the reader has accounted for every line it was given.
 * This is the invariant a review screen adds up in front of the person, and it
 * is the reason the counters above are separate fields rather than one number.
 */
export function accountedForLines(st: ChatLogState): number {
  return st.turns.length + st.mergedLines
    + st.skipped.filter(s => CHAT_LINE_LEVEL_REASONS.includes(s.reason)).reduce((n, s) => n + s.count, 0);
}

class Skips {
  private readonly counts = new Map<ChatSkipReason, number>();
  add(reason: ChatSkipReason, n = 1): void {
    if (n <= 0) return;
    this.counts.set(reason, (this.counts.get(reason) ?? 0) + n);
  }
  list(): { reason: ChatSkipReason; count: number }[] {
    return [...this.counts.entries()].map(([reason, count]) => ({ reason, count }));
  }
}

/**
 * One parsed line header, before any date convention is applied.
 *
 * `a` and `b` are the two numeric date fields IN FILE ORDER. Naming them month
 * and day here would be the guess this whole file exists to avoid.
 */
interface RawHeader {
  a: number;
  b: number;
  year: number;
  hour: number;
  minute: number;
  second: number;
  rawAt: string;
  /** Everything after the stamp: sender and text, or a system marker. */
  rest: string;
}

/**
 * Characters a producer sprinkles around its stamps that carry no meaning.
 *
 * 🪤 Real WhatsApp exports open every line with U+200E LEFT-TO-RIGHT MARK, and
 * put U+202F NARROW NO-BREAK SPACE before `AM`/`PM`. Both are invisible in an
 * editor and in a terminal, so a reader written by looking at the file matches
 * nothing and reports an empty conversation. This is the same class of trap as
 * the non-breaking space in the Gemini prompt prefix (doc 118 §4), which cost
 * 1 303 rows of 2 084.
 */
const INVISIBLE = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

function normalise(line: string): string {
  return line.replace(INVISIBLE, '').replace(/\u202f|\u00a0/g, ' ');
}

/**
 * The closed set of line layouts this package implements.
 *
 * A connector names one. It may not describe one, because a description is a
 * pattern and a pattern from a stranger is a machine that hangs on somebody
 * else's computer.
 *
 *  `bracket-ts-colon` — `[15/08/2026, 16:55:48] Name: text`
 *                       WhatsApp on iOS, and the browser exporters that copy it.
 *  `dash-ts-colon`    — `15/08/2026, 16:55 - Name: text`
 *                       WhatsApp on Android.
 */
const SHAPES: Record<ChatLogSpec['lineShape'], RegExp> = {
  'bracket-ts-colon': /^\[([^\]]+)\]\s*(.*)$/,
  'dash-ts-colon': /^(\d[^-]*?)\s+-\s+(.*)$/,
};

export type ChatLineShape = ChatLogSpec['lineShape'];

/**
 * `15/08/2026, 16:55:48 PM` split into numbers.
 *
 * Separators are `/`, `.` and `-` because the three appear across locales for
 * the same idea. Seconds are optional (Android writes none), the meridiem is
 * optional (24-hour locales write none), and a two-digit year pivots at 70 —
 * the Unix convention, and the only year window a chat log can plausibly sit
 * in either way.
 */
const STAMP = /^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]\.?\s*$|^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/;

function parseStamp(raw: string): Omit<RawHeader, 'rest'> | null {
  const m = STAMP.exec(raw.trim());
  if (!m) return null;
  const twelveHour = m[1] !== undefined;
  const g = twelveHour ? [m[1], m[2], m[3], m[4], m[5], m[6]] : [m[8], m[9], m[10], m[11], m[12], m[13]];
  const a = Number(g[0]);
  const b = Number(g[1]);
  let year = Number(g[2]);
  let hour = Number(g[3]);
  const minute = Number(g[4]);
  const second = g[5] === undefined ? 0 : Number(g[5]);
  if (![a, b, year, hour, minute, second].every(Number.isFinite)) return null;
  if (year < 100) year += year < 70 ? 2000 : 1900;
  if (twelveHour) {
    const pm = /[Pp]/.test(m[7] ?? '');
    // 🪤 12 AM is hour 0 and 12 PM is hour 12. The naive `+12 if PM` turns every
    // message sent at noon into one sent at midnight, which sorts a whole day
    // of conversation to the wrong end of itself.
    if (hour === 12) hour = 0;
    if (pm) hour += 12;
  }
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { a, b, year, hour, minute, second, rawAt: raw.trim() };
}

/**
 * Which field is the day, decided by the file itself.
 *
 * A value above 12 in one position can only be a day, and one such line settles
 * the whole file. Both positions above 12 somewhere means the file is not in
 * one order, which is a different answer from not knowing.
 */
export function resolveDateOrder(
  headers: readonly Pick<RawHeader, 'a' | 'b' | 'rawAt'>[],
  declared: 'mdy' | 'dmy' | undefined,
): { order: DateOrder; basis: 'declared' | 'proved' | 'none'; evidence: string | null } {
  if (declared) return { order: declared, basis: 'declared', evidence: null };
  let dmy: string | null = null;
  let mdy: string | null = null;
  for (const h of headers) {
    if (h.a > 12 && !dmy) dmy = h.rawAt;
    if (h.b > 12 && !mdy) mdy = h.rawAt;
    if (dmy && mdy) break;
  }
  if (dmy && mdy) return { order: 'conflict', basis: 'none', evidence: null };
  if (dmy) return { order: 'dmy', basis: 'proved', evidence: dmy };
  if (mdy) return { order: 'mdy', basis: 'proved', evidence: mdy };
  return { order: 'ambiguous', basis: 'none', evidence: null };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** A naive ISO stamp, or null when the order is not settled or the date is not real. */
function isoFrom(h: RawHeader, order: DateOrder): string | null {
  if (order !== 'mdy' && order !== 'dmy') return null;
  const month = order === 'mdy' ? h.a : h.b;
  const day = order === 'mdy' ? h.b : h.a;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // A real calendar check, so 31 February comes back null rather than becoming
  // 3 March through Date's silent rollover.
  const d = new Date(Date.UTC(h.year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${pad(h.year, 4)}-${pad(month)}-${pad(day)}T${pad(h.hour)}:${pad(h.minute)}:${pad(h.second)}`;
}

/**
 * Split `Name: text` at the FIRST colon.
 *
 * ⚠️ A contact saved with a colon in the name would take its own text with it.
 * That is accepted rather than guessed around: the alternative is matching
 * against a list of known participants, which cannot work on the first line of
 * a file, and a wrong split is visible in the participant list where a wrong
 * heuristic would not be.
 */
function splitSpeaker(rest: string): { speaker: string; text: string } | null {
  const i = rest.indexOf(':');
  if (i <= 0) return null;
  const speaker = rest.slice(0, i).trim();
  if (!speaker) return null;
  return { speaker, text: rest.slice(i + 1).trim() };
}

/**
 * Read one exported chat log.
 *
 * Takes the decoded text, like everything else in this package. Returns null
 * only when the connector carries no chat-log spec at all — a file the shape
 * does not fit comes back with `shapeMatched: false`, because "this connector
 * does not fit this file" is something the app has to be able to SAY.
 */
export function readChatLog(conn: Connector, text: string): ChatLogState | null {
  const spec = conn.chatLog;
  if (!spec) return null;

  const shape = SHAPES[spec.lineShape];
  const skips = new Skips();
  const selfNames = (spec.selfNames ?? []).map(s => s.toLowerCase());
  const systemPrefix = spec.systemPrefix ?? null;
  const callMarkers = spec.callMarkers ?? [];
  const mediaMarkers = spec.mediaMarkers ?? [];
  const nullBodies = spec.nullBodies ?? [];

  // Pass one: every line to a header, or to the line above it. The date order
  // cannot be known until every header is in hand, so nothing is stamped yet.
  interface Pending { header: RawHeader; speaker: string; text: string }
  const pending: Pending[] = [];
  const headers: RawHeader[] = [];
  let linesSeen = 0;
  let mergedLines = 0;
  let shapeMatched = false;
  let sawFirstHeader = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = normalise(rawLine);
    if (!line.trim()) continue;
    linesSeen++;

    const m = shape.exec(line);
    const stamp = m ? parseStamp(m[1] ?? '') : null;

    if (!stamp) {
      // Not a header. Before the first one it is a preamble that belongs to
      // nobody; after one it is the rest of the message above.
      if (!sawFirstHeader) { skips.add('preamble'); continue; }
      if (pending.length === 0) { skips.add('preamble'); continue; }
      pending[pending.length - 1]!.text += '\n' + line;
      mergedLines++;
      continue;
    }

    shapeMatched = true;
    sawFirstHeader = true;
    const rest = (m![2] ?? '').trim();

    if (systemPrefix && rest.startsWith(systemPrefix)) {
      const body = rest.slice(systemPrefix.length).trim();
      skips.add(callMarkers.some(c => body === c) ? 'call' : 'system-notice');
      continue;
    }
    const split = splitSpeaker(rest);
    if (!split) { skips.add(rest ? 'no-speaker' : 'empty'); continue; }
    if (!split.text) { skips.add('empty'); continue; }
    if (nullBodies.includes(split.text)) { skips.add('null-body'); continue; }
    if (callMarkers.includes(split.text)) { skips.add('call'); continue; }

    const header: RawHeader = { ...stamp, rest };
    headers.push(header);
    pending.push({ header, speaker: split.speaker, text: split.text });
  }

  // Pass two: now the file can be asked which way round its dates are.
  const { order, basis, evidence } = resolveDateOrder(headers, spec.dateOrder);

  const participants: string[] = [];
  for (const p of pending) if (!participants.includes(p.speaker)) participants.push(p.speaker);

  /**
   * 🚨 A declared self-name that appears NOWHERE is not evidence that nobody is
   * the self. These producers localise that word — `Vous` in French, `You` in
   * English — so a connector measured on one language meets the other and every
   * message the person sent themselves would be labelled as coming from their
   * correspondent. Wrong, and silent. When the declared names match no
   * participant, the reader hands back `unknown` for the app to ask once.
   */
  const self = participants.find(p => selfNames.includes(p.toLowerCase())) ?? null;
  const roleOf = (speaker: string): ChatRole =>
    self === null ? 'unknown' : (speaker === self ? 'self' : 'peer');

  // Longest first, so a marker that is a prefix of another cannot win over it.
  const markers = [...mediaMarkers].sort((a, b) => b.length - a.length);
  const turns: ChatTurn[] = [];
  let mediaPlaceholders = 0;

  for (const p of pending) {
    const marker = markers.find(mk => p.text === mk || p.text.startsWith(mk + ' ')) ?? null;
    const text = marker ? p.text.slice(marker.length).trim() : p.text;
    if (marker) mediaPlaceholders++;
    turns.push({
      speaker: p.speaker,
      role: roleOf(p.speaker),
      text,
      at: isoFrom(p.header, order),
      rawAt: p.header.rawAt,
      media: marker,
      mediaOnly: marker !== null && text === '',
    });
  }

  const stamps = turns.map(t => t.at).filter((t): t is string => !!t).sort();

  return {
    source: conn.id,
    chatName: null,
    participants,
    self,
    turns,
    startedAt: stamps[0] ?? null,
    endedAt: stamps[stamps.length - 1] ?? null,
    dateOrder: order,
    dateOrderBasis: basis,
    dateOrderEvidence: evidence,
    shapeMatched,
    linesSeen,
    mergedLines,
    mediaPlaceholders,
    skipped: skips.list(),
  };
}
