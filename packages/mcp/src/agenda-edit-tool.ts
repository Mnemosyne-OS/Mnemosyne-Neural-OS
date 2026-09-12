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
import { localStamp, parseAgentDate, LOCAL_TIME_NOTE } from './local-time.js';

export interface AgendaEventView {
  id: string;
  title: string;
  startAt: number;
  endAt?: number;
  allDay?: boolean;
  location?: string;
  description?: string;
  repeats?: 'daily' | 'weekly' | 'monthly' | 'yearly';
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

export function renderAgendaList(result: AgendaReadResult): string {
  if (!result.ok || !result.view) return doorFailure(result.error, 'calendar');
  const v = result.view;
  const where = result.via === 'file' ? ' (read straight from the file: the app is not open)' : '';

  if (v.events.length === 0) {
    // The window is named as the reason, because "no appointments" and "none in
    // the window you asked about" are different facts and the second one is
    // fixed by asking differently.
    const outside = v.outsideWindow > 0
      ? ` ${v.outsideWindow} appointment(s) exist outside the window you asked for.`
      : '';
    return `No appointments in the window${where}.${outside}`;
  }

  const rows = v.events.map(e => {
    // 🎭 An event with nothing left to happen says so, rather than showing its
    // original start as though it were still coming.
    const next = e.nextAt !== undefined ? `next ${stamp(e.nextAt)}` : 'no occurrence left';
    const bits = [
      e.repeats ? `repeats ${e.repeats}` : null,
      e.repeatsUntil !== undefined ? `until ${stamp(e.repeatsUntil)}` : null,
      e.allDay ? 'all day' : null,
      e.location ? `at ${e.location}` : null,
      e.alarmMinutesBefore !== undefined ? `reminder ${e.alarmMinutesBefore} min before` : null,
    ].filter(Boolean).join(' | ');
    return `- [${e.id}] ${e.title}\n    starts ${stamp(e.startAt)}${e.endAt !== undefined ? ` -> ${stamp(e.endAt)}` : ''}, ${next}`
      + (bits ? `\n    ${bits}` : '');
  }).join('\n');

  const cut = v.truncated > 0
    ? `\n\n${v.truncated} more matched and were NOT returned: narrow the window or raise the limit.`
    : '';
  const outside = v.outsideWindow > 0
    ? `\n${v.outsideWindow} appointment(s) fall outside the window you asked for.`
    : '';
  return `Appointments (${v.events.length} of ${v.total})${where}:\n${rows}${cut}${outside}`
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
  return renderAgendaList(result);
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
