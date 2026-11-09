/**
 * agenda-edit-tool — reading the human's calendar back, CHANGING an
 * appointment, and REMOVING one.
 *
 * The removal is the reason this file exists, and it is the one that has to be
 * careful, because **the calendar has no archive**. A task an agent removes goes
 * to the backlog's archive and comes back with one press; an appointment it
 * removes is gone.
 *
 * So two rules run through every sentence below:
 *
 *  - a removal names an **id** read back from `mnemosyne_agenda_list`. Never a
 *    title, never a date range. "Remove my meetings on Thursday" is how an agent
 *    removes the wrong Thursday.
 *  - the answer names what disappeared by TITLE and START, not by count. A
 *    number cannot be checked against a memory; a title can.
 *
 * A repeating event is removed as a whole SERIES. The calendar's model has four
 * cadences and no exceptions, so there is no "just this Tuesday" to ask for —
 * and pretending otherwise would write a state the app cannot read back.
 *
 * @module agenda-edit-tool
 */
import type { AgendaRpcClient } from './agenda-tool';
import { doorFailure } from './todo-edit-tool';
import { dayStamp, localStamp, parseAgentDate, LOCAL_TIME_NOTE } from './local-time.js';

export interface AgendaEventView {
  id: string;
  title: string;
  startAt: number;
  endAt?: number;
  allDay?: boolean;
  location?: string;
  description?: string;
  repeats?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** An RFC 5545 rule, for a series the four cadences cannot say. */
  repeatsRule?: string;
  repeatsUntil?: number;
  /** Next occurrence at or after now. ABSENT when there is none left. */
  nextAt?: number;
  alarmMinutesBefore?: number;
}

export interface AgendaReadResult {
  ok: boolean;
  error?: string;
  view?: {
    events: AgendaEventView[];
    total: number;
    truncated: number;
    outsideWindow: number;
  };
  via?: 'window' | 'file';
}

/**
 * An instant the agent can act on, in this machine's LOCAL time — the frame
 * the host reads an offset-less date back in. Empty when there is none to
 * state. (It printed UTC with the `Z` cut off: every read-then-write round
 * trip moved the appointment by the timezone offset.)
 */
export const stamp = localStamp;

/** How far « soon » reaches in the grouped list: the days a person means by « what's on ». */
export const SOON_DAYS = 7;
const DAY_MS = 86_400_000;

/** A stamp with its weekday: shared with the To-do read (local-time). */
export { dayStamp };

/**
 * What the window left out, split into what is still to come and what is past,
 * with the next one named. Measured 2026-11-06 (doc 202 §4.3): « what's on my
 * agenda » read today→Sunday, got 0 events and « 55 outside the window », and
 * LFM2.5 8B said « 55 appointments planned »: 49 of them were past, and the one
 * that mattered (a check on Thursday) was never named.
 */
function outsideWindowSentence(v: NonNullable<AgendaReadResult['view']>, upcoming?: readonly AgendaEventView[]): string {
  if (v.outsideWindow <= 0) return '';
  if (!upcoming) return `${v.outsideWindow} appointment(s) fall outside the window you asked for.`;
  const inWindow = new Set(v.events.map(e => e.id));
  const toCome = upcoming.filter(e => e.nextAt !== undefined && !inWindow.has(e.id))
    .sort((a, b) => (a.nextAt as number) - (b.nextAt as number));
  const past = Math.max(0, v.outsideWindow - toCome.length);
  const next = toCome[0];
  const comeText = next
    ? `${toCome.length} still to come (the next one: [${next.id}] ${next.title}, ${dayStamp(next.nextAt as number)})`
    : 'none still to come';
  return `Outside the window you asked for: ${comeText}; ${past} already past.`;
}

function eventRow(e: AgendaEventView): string {
  // 🎭 The NEXT occurrence comes first. Measured 2026-11-06, LFM2.5 8B through
  // Hermes: a weekly event printed « starts 2026-10-22, next 2026-11-12 » was
  // read back as « next on 22 October », once with the wrong weekday.
  const when = e.nextAt !== undefined ? `next ${dayStamp(e.nextAt)}` : `no occurrence left (was ${dayStamp(e.startAt)})`;
  const bits = [
    e.repeats ? `repeats ${e.repeats} since ${dayStamp(e.startAt)}` : e.repeatsRule ? `repeats ${e.repeatsRule} since ${dayStamp(e.startAt)}` : null,
    e.repeatsUntil !== undefined ? `until ${stamp(e.repeatsUntil)}` : null,
    e.endAt !== undefined ? `ends ${stamp(e.endAt)}` : null,
    e.allDay ? 'all day' : null,
    e.location ? `at ${e.location}` : null,
    // « reminder 0 min before » was read back as « no reminder ».
    e.alarmMinutesBefore !== undefined
      ? (e.alarmMinutesBefore === 0 ? 'reminder at the start time' : `reminder ${e.alarmMinutesBefore} min before`)
      : null,
  ].filter(Boolean).join(' | ');
  return `- [${e.id}] ${e.title}\n    ${when}${bits ? `\n    ${bits}` : ''}`;
}

/**
 * The calendar as an agent reads it back: today's date first, then what comes
 * in the next SOON_DAYS days, what comes later, and what is already past.
 *
 * Measured 2026-11-06 with Hermes on LFM2.5 8B and a real calendar (one weekly
 * check, five imported birthdays months away): « what's on my agenda » was
 * answered 0/2, the start of a series given as its next date, the birthdays
 * listed as the agenda. The groups and the weekdays are computed HERE, so the
 * model copies instead of computing.
 *
 * @param result - The host's answer
 * @param now - The present, for tests; the clock otherwise
 * @param upcoming - Every appointment still to come, read apart when the window
 *   left some out (handleAgendaList); absent = the old one-number sentence
 */
export function renderAgendaList(result: AgendaReadResult, now: number = Date.now(), upcoming?: readonly AgendaEventView[]): string {
  if (!result.ok || !result.view) return doorFailure(result.error, 'calendar');
  const v = result.view;
  const where = result.via === 'file' ? ' (read straight from the file: the app is not open)' : '';
  const today = `Today is ${dayStamp(now)}.`;
  const outsideSentence = outsideWindowSentence(v, upcoming);

  if (v.events.length === 0) {
    // The window is named as the reason, because "no appointments" and "none in
    // the window you asked about" are different facts and the second one is
    // fixed by asking differently.
    return `${today}\nNo appointments in the window${where}.${outsideSentence ? ` ${outsideSentence}` : ''}`;
  }

  const soonEnd = now + SOON_DAYS * DAY_MS;
  const byNext = (a: AgendaEventView, b: AgendaEventView) => (a.nextAt ?? a.startAt) - (b.nextAt ?? b.startAt);
  const soon = v.events.filter(e => e.nextAt !== undefined && e.nextAt <= soonEnd).sort(byNext);
  const later = v.events.filter(e => e.nextAt !== undefined && e.nextAt > soonEnd).sort(byNext);
  const past = v.events.filter(e => e.nextAt === undefined).sort(byNext);
  const group = (title: string, list: AgendaEventView[]) =>
    list.length ? `${title}: ${list.length}\n${list.map(eventRow).join('\n')}` : `${title}: none`;
  const groups = [
    group(`In the next ${SOON_DAYS} days (until ${dayStamp(soonEnd)})`, soon),
    group('Later', later),
    ...(past.length ? [group('Already past', past)] : []),
  ].join('\n\n');

  const cut = v.truncated > 0
    ? `\n\n${v.truncated} more matched and were NOT returned: narrow the window or raise the limit.`
    : '';
  const outside = outsideSentence ? `\n${outsideSentence}` : '';
  return `${today}\nAppointments (${v.events.length} of ${v.total})${where}:\n\n${groups}${cut}${outside}`
    + `\n\n${LOCAL_TIME_NOTE}`
    + '\nUse the id in brackets with mnemosyne_agenda_update or mnemosyne_agenda_remove, never the title.';
}

export interface AgendaOpOutcome {
  op: string;
  ok: boolean;
  error?: string;
  title?: string;
  startAt?: number;
}

export interface AgendaApplyResult {
  ok: boolean;
  error?: string;
  results?: AgendaOpOutcome[];
  applied?: number;
  truncated?: number;
  via?: 'window' | 'file';
}

export function renderAgendaOutcome(r: AgendaOpOutcome): string {
  const named = r.title ? ` "${r.title}"` : '';
  const when = r.startAt !== undefined ? ` (${stamp(r.startAt)})` : '';
  if (r.ok) {
    return r.op === 'remove'
      ? `- REMOVED${named}${when}. The calendar has no archive: this one is gone.`
      : `- edited${named}${when}`;
  }
  switch (r.error) {
    case 'EVENT_NOT_FOUND': return `- ${r.op}: no appointment with that id. Read the calendar again; it may already be gone.`;
    case 'BAD_START':       return `- ${r.op}: the start or end time could not be read${named}, so NOTHING was changed rather than leaving the old one in place.`;
    case 'BAD_RECURRENCE':  return `- ${r.op}: that cadence is not one of daily/weekly/monthly/yearly${named}. Refused rather than quietly made a one-off.`;
    case 'TITLE_EMPTY':     return `- ${r.op}: an appointment cannot be left with no title${named}.`;
    case 'NO_CHANGE':       return `- ${r.op}: nothing to change${named}.`;
    case 'BAD_OP':          return `- ${r.op}: not an operation this door knows.`;
    default:                return `- ${r.op}: refused (${r.error ?? 'unknown'})${named}.`;
  }
}

export function renderAgendaApply(result: AgendaApplyResult): string {
  if (!result.ok) return doorFailure(result.error, 'calendar');
  const results = result.results ?? [];
  const applied = result.applied ?? 0;
  const where = result.via === 'file' ? ' The app was not open, so this went straight to the file.' : '';
  const lines = results.map(renderAgendaOutcome).join('\n');
  const cut = (result.truncated ?? 0) > 0
    ? `\n${result.truncated} further change(s) were past the per-call cap and were NEVER LOOKED AT.`
    : '';
  const head = applied === 0
    ? 'Nothing changed. Every change was refused:'
    : `${applied} of ${results.length} change(s) applied.${where}`;
  // The frame is stated once, and only when a time was printed.
  const frame = results.some(r => r.startAt !== undefined) ? `\n${LOCAL_TIME_NOTE}` : '';
  return `${head}\n${lines}${cut}${frame}`;
}

/**
 * The read-door params, or the sentence that refuses them.
 *
 * 🚨 A bound that cannot be read is REFUSED, never dropped: "from: sometime
 * soon" used to become no bound at all, which is a WIDER window than the one
 * asked for, answered as though it were the one asked for. The host takes
 * numbers only here, so the agent's text is read by the host's own rule
 * (`parseAgentDate`): a bare date is local midnight, an offset-less time is
 * this machine's local time, a numeric string is epoch ms.
 */
export function agendaListParams(
  appId: string, args: Record<string, unknown>,
): { params: Record<string, unknown> } | { refusal: string } {
  const out: Record<string, unknown> = { appId, includePast: args['include_past'] === true };
  for (const key of ['from', 'to'] as const) {
    const raw = args[key];
    if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) continue;
    const at = parseAgentDate(raw);
    if (at === null) {
      return {
        refusal: `"${key}" could not be read as a date: ${JSON.stringify(raw)}. Nothing was read. Give ISO 8601 (2026-09-10T14:00 is this machine's local time; 2026-09-10 alone is local midnight) or epoch ms.`,
      };
    }
    out[key] = at;
  }
  if (typeof args['limit'] === 'number') out['limit'] = args['limit'];
  return { params: out };
}

export async function handleAgendaList(
  client: AgendaRpcClient, appId: string, args: Record<string, unknown>,
): Promise<string> {
  const built = agendaListParams(appId, args);
  if ('refusal' in built) return built.refusal;
  const result = await client._rpc<AgendaReadResult>('sdk.agenda.read', built.params);
  const windowed = built.params['from'] !== undefined || built.params['to'] !== undefined;
  if (!windowed || !result.ok || !result.view || result.view.outsideWindow <= 0) return renderAgendaList(result);
  // The window left some out: one more read, every appointment still to come, so
  // the answer names the next one instead of a bare count (doc 202 §4.5).
  let upcoming: AgendaEventView[] | undefined;
  try {
    const all = await client._rpc<AgendaReadResult>('sdk.agenda.read', { appId: built.params['appId'], includePast: false });
    if (all.ok && all.view) upcoming = all.view.events;
    else console.error(`[agenda] the read of what is still to come failed (${all.error ?? 'no view'}); the count stays whole`);
  } catch (err) {
    console.error('[agenda] the read of what is still to come failed; the count stays whole:', err);
  }
  return renderAgendaList(result, Date.now(), upcoming);
}

/** Turns the tool's snake_case edit arguments into the host's op shape. */
export function agendaEditOps(args: Record<string, unknown>): Array<Record<string, unknown>> {
  const raw = Array.isArray(args['changes']) ? args['changes'] : [];
  const out: Array<Record<string, unknown>> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r['event_id'] !== 'string' || !r['event_id']) continue;
    const op: Record<string, unknown> = { op: 'edit', event: r['event_id'] };
    // `null` CLEARS a field and an absent key leaves it alone, so the two are
    // carried through untouched rather than normalised into one.
    const carry: Array<[string, string]> = [
      ['title', 'title'], ['start', 'start'], ['end', 'end'],
      ['location', 'location'], ['description', 'description'],
      ['recurrence', 'recurrence'], ['alarm_minutes_before', 'alarmMinutesBefore'],
      ['all_day', 'allDay'],
    ];
    for (const [from, to] of carry) {
      if (from in r) op[to] = r[from];
    }
    out.push(op);
  }
  return out;
}

export async function handleAgendaUpdate(
  client: AgendaRpcClient, appId: string, args: Record<string, unknown>,
): Promise<string> {
  const ops = agendaEditOps(args);
  if (ops.length === 0) {
    return 'Nothing to do: no change named an "event_id". Read the calendar with mnemosyne_agenda_list to get the ids.';
  }
  const result = await client._rpc<AgendaApplyResult>('sdk.agenda.apply', { appId, ops });
  return renderAgendaApply(result);
}

export async function handleAgendaRemove(
  client: AgendaRpcClient, appId: string, args: Record<string, unknown>,
): Promise<string> {
  const raw = args['event_ids'];
  const ids = (Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [])
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map(v => v.trim());
  if (ids.length === 0) {
    return 'Nothing to remove: "event_ids" was empty. Read the calendar with mnemosyne_agenda_list first, and remove by id - never by title or by date.';
  }
  const ops = ids.map(id => ({ op: 'remove', event: id }));
  const result = await client._rpc<AgendaApplyResult>('sdk.agenda.apply', { appId, ops });
  return renderAgendaApply(result);
}
