/**
 * inbox — the write direction of "an agent sees the others".
 *
 * `liveness.ts` answers who is working where. It reads. This is the half that
 * writes: a message one agent leaves for the others sharing its working tree.
 *
 * ## Why it exists
 *
 * On 2026-08-31 three sessions worked in one tree. The collisions were detected
 * — the hook did its job — but every session still had to be told by hand what
 * the others knew: a test written against an implementation that had not landed,
 * a commit that had to carry two files belonging to someone else, a generated
 * line derived from an uncommitted bump. The human relayed the message. That is
 * the gap: an agent publishes for its SUCCESSORS (memory) and never for its
 * CONTEMPORARIES.
 *
 * ## Why it is not memory
 *
 * 🚨 A message expires, a memory does not. Mixing them fills a vault with
 * "I am currently…" lines that mean nothing an hour later. So a message lives
 * in a file, is delivered once per reader, and ages out. It never gets ingested.
 *
 * ## Why delivery, not "read"
 *
 * Nothing here can know that a model read a line. It CAN know the line was put
 * in front of it. So the recorded fact is delivery, which is the honest one, and
 * it is per-session: a message shows once to each session, not once in total —
 * otherwise the first session to commit consumes everyone else's mail.
 *
 * ## What this module does not do
 *
 * No I/O. It takes messages in and gives decisions out, so the rules are
 * testable without a filesystem. Reading and writing live in the caller.
 *
 * @module @mnemosyne_os/agent-transcripts/inbox
 */

/** A message left in a tree's inbox. One file, one message. */
export interface InboxMessage {
  /** Free label of the sender — a session title is enough, ids are not stable to humans. */
  from: string;
  /**
   * Who it is for. `'*'` means anyone working in this tree. A concrete value is
   * matched case-insensitively against a reader's session id AND its label, so a
   * sender can address either without knowing which the reader has.
   */
  to: string;
  /** ISO timestamp. An unparseable date makes the message stale, never fresh. */
  at: string;
  subject: string;
  body: string;
  /** Session ids this message has already been shown to. Appended on delivery. */
  deliveredTo?: string[];
}

/** How long a message stays deliverable. Older than this, it is not shown. */
export const INBOX_MAX_AGE_HOURS = 72;

/** Everything a reader knows about itself when it opens the inbox. */
export interface InboxReader {
  /** `CLAUDE_CODE_SESSION_ID` when the harness publishes one, else null. */
  sessionId: string | null;
  /** The session's human label, when known. */
  label?: string | null;
}

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

/** A session as the transcript layer names it. */
export interface NamedSession {
  sessionId: string | null;
  title?: string | null;
}

/**
 * Builds the reader the filters below are applied against.
 *
 * 🚨 This exists because the label half was DEAD in production. `--to "todo
 * widget"` is the form the usage text advertises, {@link addressesReader}
 * implements it, and a unit test covered it — but the caller built its reader
 * from the session id alone, so `reader.label` was always undefined and the
 * branch was unreachable. A targeted message posted fine, said "message left
 * for todo widget", reached nobody, and expired unseen. Putting the
 * construction here is what makes the wiring testable rather than assumed.
 *
 * ⛔ The label is never guessed. No id, or a session with no title, yields
 * null: delivering on a wrong label would hand someone another agent's mail.
 */
export function readerFor(
  sessionId: string | null | undefined,
  sessions: readonly NamedSession[],
): InboxReader {
  if (!sessionId) return { sessionId: null, label: null };
  const self = sessions.find(s => s.sessionId === sessionId);
  return { sessionId, label: self?.title ?? null };
}

/** Hours between `at` and `now`. Infinity when the date cannot be read. */
export function ageHours(message: InboxMessage, now: Date): number {
  const t = Date.parse(message.at);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - t) / 3_600_000;
}

/** Is this message addressed to this reader? */
export function addressesReader(message: InboxMessage, reader: InboxReader): boolean {
  const to = norm(message.to);
  if (to === '' || to === '*') return true;
  return to === norm(reader.sessionId) || (!!reader.label && to === norm(reader.label));
}

/**
 * The messages to put in front of this reader, oldest first.
 *
 * ⛔ A reader with no session id is never marked as delivered-to, because there
 * is no id to record. It still SEES its mail — refusing to show a message
 * because the harness is quiet would be the worse failure — it just sees it
 * again next time. Announced by {@link deliverable}'s caller, not silently.
 */
export function deliverable(
  messages: readonly InboxMessage[],
  reader: InboxReader,
  now: Date,
): InboxMessage[] {
  const selfId = norm(reader.sessionId);
  return messages
    .filter(m => ageHours(m, now) <= INBOX_MAX_AGE_HOURS)
    .filter(m => addressesReader(m, reader))
    .filter(m => !(selfId && (m.deliveredTo ?? []).some(d => norm(d) === selfId)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** Messages past their age, so a caller can prune them and say how many. */
export function expired(messages: readonly InboxMessage[], now: Date): InboxMessage[] {
  return messages.filter(m => ageHours(m, now) > INBOX_MAX_AGE_HOURS);
}

/** Returns the message with this reader recorded as delivered. Pure. */
export function markDelivered(message: InboxMessage, reader: InboxReader): InboxMessage {
  if (!reader.sessionId) return message;
  const already = message.deliveredTo ?? [];
  if (already.some(d => norm(d) === norm(reader.sessionId))) return message;
  return { ...message, deliveredTo: [...already, reader.sessionId] };
}

/**
 * Renders the mail for a terminal, or null when there is nothing to say.
 *
 * 🎭 Returns null rather than an empty banner: a hook that prints on every clean
 * commit trains people to stop reading it, which is the failure this whole guard
 * exists to avoid.
 */
export function renderInbox(messages: readonly InboxMessage[], reader: InboxReader): string | null {
  if (messages.length === 0) return null;
  const n = messages.length;
  const lines: string[] = [
    '',
    `📬 ${n} message${n > 1 ? 's' : ''} from another agent working in this tree:`,
    '',
  ];
  for (const m of messages) {
    lines.push(`  ── ${m.subject}`);
    lines.push(`     from ${m.from}${m.to !== '*' ? ` · to ${m.to}` : ''} · ${m.at}`);
    for (const line of m.body.split('\n')) lines.push(`     ${line}`);
    lines.push('');
  }
  if (!reader.sessionId) {
    // Being honest about the repeat is cheaper than a mystery.
    lines.push('  (this harness publishes no session id, so these will show again)');
    lines.push('');
  }
  return lines.join('\n');
}
