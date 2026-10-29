/**
 * Reading a Telegram Desktop data export. Doc 118 §10.
 *
 * Doc 118 §9.5 left this one open with a sentence that turned out to be exactly
 * right: *same MODEL, other reader*. A Telegram export is JSON, so none of the
 * work `chatLog.ts` does — line shapes, folded continuation lines, a date order
 * the file has to prove — applies here. What survives is the model: a
 * conversation is N named PEOPLE, and a turn carries a NAME rather than one of
 * the two roles a provider archive knows.
 *
 * The package's rules travel unchanged:
 *
 *  1. **A connector is DATA, never code.** `TelegramSpec` carries the NAME of a
 *     shape from a closed set and literal tokens. Every field path lives here.
 *  2. **Absent stays absent.** A message with no readable stamp keeps `at:
 *     null`; nothing is back-filled from its neighbours or from the chat.
 *  3. **Nothing is dropped in silence.** Service messages, calls, speakerless
 *     rows: each is counted with a reason, because an import that quietly keeps
 *     70 % of a year of messages looks exactly like one that kept all of it.
 *
 * And three this format forces into the open.
 *
 * 🚨 **`text` is a string OR an array of mixed chunks.** A message with a link
 * in it comes back as `[{type:'link',…}, ' and then ', …]`. Keeping only the
 * strings — the obvious loop — drops every URL, every mention and every bold
 * run, and the result is a perfectly readable sentence with its content
 * removed. `text_entities` is the flat field that covers the whole message.
 *
 * 🚨 **A masked link hides its URL.** `{type:'text_link', text:'here',
 * href:'https://…'}` renders as the word *here*. The href is kept in
 * `TelegramTurn.links` and is deliberately NOT folded into the text: appending
 * it would put characters in a message nobody typed, and dropping it would put
 * a message in memory that cannot be acted on.
 *
 * 🚨 **A forwarded message is somebody else's words under the forwarder's
 * name.** Telegram says so (`forwarded_from`); flattening that attributes a
 * stranger's claim to a friend, permanently, in a store built for recall. Kept
 * as a field on the turn and counted, so a screen can show it and an ingest can
 * decide.
 */

import type { Connector, TelegramSpec } from './connector';
import type { ChatRole, ChatTurn } from './chatLog';

/**
 * One message, kept.
 *
 * Extends the shared `ChatTurn` rather than redefining it, so the review screen
 * doc 118 §8 owes all five connectors can render a WhatsApp turn and a Telegram
 * turn with one component. The extra fields are facts this format records and
 * the text formats simply do not have.
 */
export interface TelegramTurn extends ChatTurn {
  /** The message id the file carries, which is what a reply points at. */
  id: number | null;
  /**
   * Who ORIGINALLY wrote it, when this is a forward.
   *
   * 🚨 The words are not the speaker's. `speaker` stays the person who pressed
   * forward, because that is who acted in this conversation, and this field is
   * what stops the sentence being remembered as theirs.
   */
  forwardedFrom: string | null;
  /** The message this one answers, by id. Null for a fresh message. */
  replyToId: number | null;
  /**
   * When it was last edited, naive like `at`.
   *
   * ⚠️ The export carries the FINAL text only. The original is not in the file
   * and cannot be recovered; this field is the whole of what is knowable.
   */
  editedAt: string | null;
  /** URLs the message carries that its visible text does not spell out. */
  links: string[];
}

/** Why a message did not become a turn. Stable slugs; the app owns the words. */
export type TelegramSkipReason =
  /**
   * A service message: someone joined, a title changed, a message was pinned.
   * Real events, and nobody's words. Counted rather than kept, for the reason
   * `[Appel]` is counted in the text reader.
   */
  | 'service'
  /** A call, by its declared action name. Telegram records a duration and a
   *  discard reason here, which is more than WhatsApp gives; still not speech. */
  | 'call'
  /** A message with no sender at all — an anonymous channel post. */
  | 'no-speaker'
  /** Nothing said and nothing attached, which is what a deleted message becomes. */
  | 'empty'
  /** Not an object where the file promised one. */
  | 'malformed';

/**
 * Reasons that cost a whole MESSAGE, which is all of them today.
 *
 * Named anyway, so `accountedForMessages` stays true the day a turn-level
 * reason appears. The archive reader learned that one the expensive way
 * (2 110 rows reported out of 2 084).
 */
export const TELEGRAM_MESSAGE_LEVEL_REASONS: readonly TelegramSkipReason[] =
  ['service', 'call', 'no-speaker', 'empty', 'malformed'] as const;

/** Why a whole chat was left out. */
export type TelegramChatSkipReason = 'chat-type' | 'malformed';

export interface TelegramChatState {
  /** The connector that read it. */
  source: string;
  /** The chat's own id, as written. Null when the file gives none. */
  chatId: string | null;
  /** What Telegram calls the conversation. Null for a chat it never named. */
  chatName: string | null;
  /** `personal_chat`, `private_group`, `saved_messages`, `bot_chat`… verbatim. */
  chatType: string | null;
  /** Every distinct speaker name, in order of first appearance. */
  participants: string[];
  /** The display name the account owner speaks under here, when it is known. */
  self: string | null;
  turns: TelegramTurn[];
  startedAt: string | null;
  endedAt: string | null;
  /** Messages the reader looked at, before any were kept or skipped. */
  messagesSeen: number;
  /** Kept turns whose words are a forward of somebody else's. */
  forwarded: number;
  /** Kept turns that carry a file rather than typed words. */
  mediaPlaceholders: number;
  /**
   * Kept turns whose stamp could not be read.
   *
   * 🎭 Their own counter rather than a skip: the message happened and its text
   * is real. A screen that sorts by time has to know some of these cannot be
   * placed, which is a different statement from "this many were thrown away".
   */
  undated: number;
  skipped: { reason: TelegramSkipReason; count: number }[];
}

/**
 * What one export file turned into.
 *
 * A Telegram export is the awkward middle case doc 118 §2 warned about: the
 * FILE holds many conversations like a provider archive, and each conversation
 * is N named people like a chat log. So the file-level facts live here and the
 * conversation-level ones live in `TelegramChatState`, instead of one of the
 * two lying about the other.
 */
export interface TelegramExportState {
  source: string;
  /**
   * Which of the two things Telegram writes this is.
   *
   * `full-account` — Settings › Advanced › Export, everything, `chats.list`.
   * `single-chat`  — one conversation's own export, the chat at the top level.
   *
   * Null when neither was found, which is what `shapeMatched: false` means.
   */
  exportShape: 'full-account' | 'single-chat' | null;
  /**
   * The connector fits this file.
   *
   * 🎭 Absent is not zero. Without this, a file this reader does not understand
   * comes back with no chats, and the app says "0 conversations" to someone
   * holding their entire Telegram history.
   */
  shapeMatched: boolean;
  /**
   * The account owner's id, as `user<n>`, from `personal_information`.
   *
   * 🚨 This is the one place Telegram is kinder than WhatsApp. The text formats
   * localise the word for the exporter (`Vous`, `You`), so a connector measured
   * in French mislabels every message in an English file. Here identity is an
   * id, and it holds whatever language the export was made in — and whatever
   * display name the person has since changed to. A single-chat export carries
   * no `personal_information` at all, and then this is null and every role is
   * `unknown` for the app to ask about once.
   */
  selfId: string | null;
  /** The owner's name from the same block, when it carries one. */
  selfName: string | null;
  chats: TelegramChatState[];
  /** Chat entries the reader looked at. */
  chatsSeen: number;
  /**
   * Chats the file carries with no messages in them.
   *
   * Kept in the list with zero turns AND counted here: an export of 300 chats
   * where 200 are empty is a fact about the export, and a picker that just
   * shows 300 rows makes the person open them to find out.
   */
  emptyChats: number;
  skippedChats: { reason: TelegramChatSkipReason; count: number }[];
}

/**
 * Kept turns plus message-level skips.
 *
 * Equals `messagesSeen` when the reader has accounted for everything it was
 * handed. This is the sum a review screen puts in front of the person.
 */
export function accountedForMessages(chat: TelegramChatState): number {
  return chat.turns.length
    + chat.skipped
      .filter(s => TELEGRAM_MESSAGE_LEVEL_REASONS.includes(s.reason))
      .reduce((n, s) => n + s.count, 0);
}

class Skips<R extends string> {
  private readonly counts = new Map<R, number>();
  add(reason: R, n = 1): void {
    if (n <= 0) return;
    this.counts.set(reason, (this.counts.get(reason) ?? 0) + n);
  }
  list(): { reason: R; count: number }[] {
    return [...this.counts.entries()].map(([reason, count]) => ({ reason, count }));
  }
}

const rec = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * A Telegram stamp is already naive ISO: `2026-08-15T16:55:48`, no zone.
 *
 * 🚨 `date_unixtime` sits right next to it and must NOT be preferred. It is an
 * absolute instant, so turning it into a string re-renders every message in the
 * READER's time zone — a shift of hours that produces a valid timestamp nobody
 * can later tell is wrong. The wall clock is what the file states, and it is
 * the same rule `ChatTurn.at` already carries for the text formats.
 */
const STAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

function naiveIso(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = STAMP.exec(s);
  if (!m) return null;
  const [year = NaN, month = NaN, day = NaN, hour = NaN, minute = NaN, second = NaN] =
    m.slice(1).map(Number);
  if (hour > 23 || minute > 59 || second > 59) return null;
  if (month < 1 || month > 12 || day < 1) return null;
  // A real calendar check, so 31 February comes back null instead of silently
  // rolling over into 3 March the moment anything turns it into a Date.
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return s;
}

interface Extracted { text: string; links: string[] }

/**
 * Rebuild a message from its entity list, and harvest the URLs it hides.
 *
 * An entity is `{type, text}` and sometimes `href`. Plain runs are entities
 * too, so concatenating `text` across the list reproduces exactly what a reader
 * sees — and a chunk whose href is not already written out is a masked link.
 */
function fromEntities(list: readonly unknown[]): Extracted {
  let text = '';
  const links: string[] = [];
  for (const e of list) {
    if (typeof e === 'string') { text += e; continue; }
    const r = rec(e);
    if (!r) continue;
    const piece = typeof r.text === 'string' ? r.text : '';
    text += piece;
    const href = str(r.href);
    if (href && !piece.includes(href) && !links.includes(href)) links.push(href);
  }
  return { text, links };
}

/**
 * The message's words, whichever of the three ways Telegram wrote them.
 *
 * ⚠️ When `text` is a plain string it IS the message, and it wins over the
 * entity list. That is a guard, not a preference: entity coverage of plain runs
 * is something this reader BELIEVES rather than has measured, and a belief that
 * turns out wrong would truncate messages in a way nothing on screen would
 * show. The entities still contribute their links.
 */
function extractText(msg: Record<string, unknown>): Extracted {
  const entities = Array.isArray(msg.text_entities) ? fromEntities(msg.text_entities) : null;
  if (typeof msg.text === 'string') return { text: msg.text, links: entities?.links ?? [] };
  if (entities) return entities;
  if (Array.isArray(msg.text)) return fromEntities(msg.text);
  return { text: '', links: [] };
}

/**
 * What was attached, named with the file's own word.
 *
 * `media_type` verbatim when Telegram wrote one (`voice_message`, `sticker`,
 * `animation`…), otherwise the name of the key that carried it. Nothing here is
 * a category this reader invented, so a slug on screen is a word the export
 * actually used.
 *
 * 🪤 A file left out of the export still occupies its key, with the literal
 * `(File not included. Change data exporting settings to download.)` as its
 * value. That is still an attachment: the message HAD a file. Treating the
 * sentence as a path is the caller's trap, not this one's.
 */
function mediaOf(msg: Record<string, unknown>): string | null {
  const declared = str(msg.media_type);
  if (declared) return declared;
  if (str(msg.photo)) return 'photo';
  if (str(msg.file)) return 'file';
  if (rec(msg.poll)) return 'poll';
  if (rec(msg.location_information)) return 'location';
  if (rec(msg.contact_information)) return 'contact';
  return null;
}

function asId(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Read one conversation out of an export. */
function readChat(
  spec: TelegramSpec,
  raw: Record<string, unknown>,
  source: string,
  selfId: string | null,
): TelegramChatState {
  const skips = new Skips<TelegramSkipReason>();
  const callActions = spec.callActions ?? [];
  const messages = Array.isArray(raw.messages) ? raw.messages : [];
  const turns: TelegramTurn[] = [];
  const participants: string[] = [];
  let self: string | null = null;
  let forwarded = 0;
  let mediaPlaceholders = 0;
  let undated = 0;

  for (const entry of messages) {
    const msg = rec(entry);
    if (!msg) { skips.add('malformed'); continue; }

    if (msg.type === 'service') {
      const action = str(msg.action);
      skips.add(action !== null && callActions.includes(action) ? 'call' : 'service');
      continue;
    }

    const speaker = str(msg.from);
    if (!speaker) { skips.add('no-speaker'); continue; }

    const { text: written, links } = extractText(msg);
    const media = mediaOf(msg);
    // A sticker's whole content is its emoji, and the export puts it in its own
    // field rather than in `text`. Losing it leaves a turn that says nothing.
    const sticker = str(msg.sticker_emoji);
    const text = written || (media && sticker ? sticker : '');
    if (!text && !media) { skips.add('empty'); continue; }

    const at = naiveIso(msg.date);
    if (!at) undated++;
    if (media) mediaPlaceholders++;

    const fromId = str(msg.from_id);
    // 🚨 The ROLE is decided by id, never by the displayed name. Two people can
    // carry the same display name, and the owner's own name changes over the
    // years an export spans; the id is the only thing that stays the person.
    const role: ChatRole =
      selfId === null ? 'unknown' : (fromId === selfId ? 'self' : 'peer');
    if (role === 'self' && self === null) self = speaker;
    if (!participants.includes(speaker)) participants.push(speaker);

    const forwardedFrom = str(msg.forwarded_from);
    if (forwardedFrom) forwarded++;

    turns.push({
      speaker,
      role,
      text,
      at,
      rawAt: typeof msg.date === 'string' ? msg.date : '',
      media,
      // "Nothing was typed": the person sent a file or a sticker. Measured
      // against what was WRITTEN, so a sticker's emoji standing in for the text
      // does not turn an attachment into a sentence.
      mediaOnly: media !== null && written === '',
      id: asId(msg.id),
      forwardedFrom,
      replyToId: asId(msg.reply_to_message_id),
      editedAt: naiveIso(msg.edited),
      links,
    });
  }

  const stamps = turns.map(t => t.at).filter((t): t is string => t !== null).sort();
  const chatId = asId(raw.id);

  return {
    source,
    chatId: chatId === null ? str(raw.id) : String(chatId),
    chatName: str(raw.name),
    chatType: str(raw.type),
    participants,
    self,
    turns,
    startedAt: stamps[0] ?? null,
    endedAt: stamps[stamps.length - 1] ?? null,
    messagesSeen: messages.length,
    forwarded,
    mediaPlaceholders,
    undated,
    skipped: skips.list(),
  };
}

/**
 * Read one Telegram Desktop export.
 *
 * Takes the decoded text, like everything else in this package. Returns null
 * only when the connector carries no Telegram spec or the document is not JSON
 * — a file this reader does not fit comes back with `shapeMatched: false`,
 * because "this is not a Telegram export" is a sentence the app must be able to
 * say instead of showing an empty list.
 *
 * ⚠️ It parses the whole document at once, which a 500 MB `result.json` will
 * not survive in a renderer. That limit is real and unsolved; the app has to
 * read it in main, or stream, and this reader is the wrong place to pretend
 * otherwise.
 */
export function readTelegramExport(conn: Connector, text: string): TelegramExportState | null {
  const spec = conn.telegram;
  if (!spec) return null;

  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }

  const root = rec(doc);
  const chatSkips = new Skips<TelegramChatSkipReason>();
  const state: TelegramExportState = {
    source: conn.id,
    exportShape: null,
    shapeMatched: false,
    selfId: null,
    selfName: null,
    chats: [],
    chatsSeen: 0,
    emptyChats: 0,
    skippedChats: [],
  };
  if (!root) return state;

  const person = rec(root.personal_information);
  const userId = asId(person?.user_id);
  if (userId !== null) state.selfId = `user${userId}`;
  if (person) {
    const name = [str(person.first_name), str(person.last_name)].filter(Boolean).join(' ');
    state.selfName = name || null;
  }

  const list = rec(root.chats)?.list;
  let entries: unknown[] | null = null;
  if (Array.isArray(list)) {
    state.exportShape = 'full-account';
    entries = list;
  } else if (Array.isArray(root.messages)) {
    state.exportShape = 'single-chat';
    entries = [root];
  }
  if (!entries) {
    state.skippedChats = chatSkips.list();
    return state;
  }

  state.shapeMatched = true;
  state.chatsSeen = entries.length;
  const skipTypes = spec.skipChatTypes ?? [];

  for (const entry of entries) {
    const raw = rec(entry);
    if (!raw) { chatSkips.add('malformed'); continue; }
    const type = str(raw.type);
    if (type && skipTypes.includes(type)) { chatSkips.add('chat-type'); continue; }
    const chat = readChat(spec, raw, conn.id, state.selfId);
    if (chat.messagesSeen === 0) state.emptyChats++;
    state.chats.push(chat);
  }

  state.skippedChats = chatSkips.list();
  return state;
}
