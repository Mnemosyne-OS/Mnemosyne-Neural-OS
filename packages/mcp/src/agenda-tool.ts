/**
 * agenda-tool — `mnemosyne_agenda_add`: put appointments and deadlines into
 * the human's calendar (the Agenda widget on their canvas).
 *
 * Mirrors todo-tool.ts. The host routes the write through the widget's own
 * store (the file's only writer), so what the agent files is exactly what
 * the human sees, and the same guards apply: nothing is written before the
 * file has been read.
 *
 * @module agenda-tool
 */

export interface AgendaEventArg {
  title: string;
  /** ISO 8601. No offset = this machine's own local wall clock. */
  start: string;
  end?: string;
  all_day?: boolean;
  location?: string;
  description?: string;
  recurrence?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** Minutes before `start` a reminder fires. Absent = no reminder. */
  alarm_minutes_before?: number;
}

export interface AgendaAddResult {
  ok: boolean;
  error?: string;
  added?: number;
  /** Events refused one by one (no title, unreadable start). Absent = the host measured nothing. */
  skipped?: number;
  /** Events past the host's per-call cap, never looked at. Absent = the host measured nothing. */
  truncated?: number;
  /** 'file' = the app was closed and the host wrote the file directly. */
  via?: 'window' | 'file';
}

/**
 * The part of the sentence about what did NOT land. Empty when nothing was
 * lost, and empty when the host did not say — an absent count is not a zero.
 */
function renderLost(result: AgendaAddResult): string {
  const parts: string[] = [];
  if (typeof result.skipped === 'number' && result.skipped > 0) {
    parts.push(`${result.skipped} ${result.skipped === 1 ? 'was' : 'were'} refused (missing title or unreadable start time)`);
  }
  if (typeof result.truncated === 'number' && result.truncated > 0) {
    parts.push(`${result.truncated} beyond the host's per-call cap ${result.truncated === 1 ? 'was' : 'were'} not looked at — file ${result.truncated === 1 ? 'it' : 'them'} in another call`);
  }
  return parts.length ? ` ${parts.join('; ')}.` : '';
}

/** The minimum of the WS client this tool needs — the generic RPC. */
export interface AgendaRpcClient {
  _rpc<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
}

/** Reads the tool arguments into the RPC params; the host re-validates. */
export function agendaParams(appId: string, args: Record<string, unknown>): Record<string, unknown> {
  const rawEvents = args['events'];
  const events = Array.isArray(rawEvents) ? rawEvents : [];
  const cleaned = events.map((e) => {
    if (!e || typeof e !== 'object') return null;
    const r = e as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if (typeof r['title'] === 'string') out['title'] = r['title'];
    if (typeof r['start'] === 'string') out['start'] = r['start'];
    if (typeof r['end'] === 'string') out['end'] = r['end'];
    if (r['all_day'] === true) out['allDay'] = true;
    if (typeof r['location'] === 'string') out['location'] = r['location'];
    if (typeof r['description'] === 'string') out['description'] = r['description'];
    if (typeof r['recurrence'] === 'string') out['recurrence'] = r['recurrence'];
    if (typeof r['alarm_minutes_before'] === 'number') out['alarmMinutesBefore'] = r['alarm_minutes_before'];
    return out;
  }).filter((e): e is Record<string, unknown> => e !== null);
  return { appId, events: cleaned };
}

/** The sentence an agent reads back, for every shape the host can answer. */
export function renderAgendaAdd(result: AgendaAddResult, asked: number): string {
  if (result.ok) {
    const n = result.added ?? asked;
    const how = result.via === 'file' ? ' The app was not open, so this went straight to the file.' : '';
    return `Filed ${n} appointment${n === 1 ? '' : 's'} into the calendar.${renderLost(result)}${how}`
      + ' They appear in the Agenda widget, and any reminder set will ring at its lead time.';
  }
  switch (result.error) {
    case 'EMPTY_PLAN':
      return `Nothing to file: every event was missing a title or a readable start time.${renderLost(result)}`;
    case 'NO_WINDOW':
    case 'NO_CALENDAR':
      return 'This host cannot reach a calendar at all. That is not "the app is closed" — a closed app is written to directly — so check that this is a Mnemosyne OS install with a workspace configured.';
    case 'NO_VAULT':
      return 'No workspace is configured on this machine, so there is no calendar file yet. The human picks a vault folder in the app first.';
    case 'TIMEOUT':
      return 'The app did not answer in time. Nothing was written. Is the canvas open? Try again once the window is up.';
    case 'WRITE_FAILED':
      return 'The app refused the write — the calendar file was not readable yet, or the disk said no. Nothing was written; try again in a moment.';
    default:
      return `The calendar refused: ${result.error ?? 'unknown error'}. Nothing was written.`;
  }
}

/** One call: params in, sentence out. */
export async function handleAgendaAdd(client: AgendaRpcClient, appId: string, args: Record<string, unknown>): Promise<string> {
  const params = agendaParams(appId, args);
  const asked = (params['events'] as unknown[]).length;
  if (asked === 0) return renderAgendaAdd({ ok: false, error: 'EMPTY_PLAN' }, 0);
  const result = await client._rpc<AgendaAddResult>('sdk.agenda.add', params);
  return renderAgendaAdd(result, asked);
}
