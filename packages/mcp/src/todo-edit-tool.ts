/**
 * todo-edit-tool — reading the human's backlog back, and CHANGING it.
 *
 * `todo-tool` only ever adds. That meant every correction a conversation
 * produced ("no, not that one", "that's done", "move it to Perso") landed back
 * on the human, which is the opposite of the point.
 *
 * The two tools here need each other. A change names a task by **id**, never by
 * title, because "delete the task about the invoice" is how the wrong one goes,
 * in a sentence that reads perfectly either way — so the ids have to come from
 * somewhere, and that is the read.
 *
 * Pure formatting around two RPCs, so every sentence is testable without a host.
 *
 * @module todo-edit-tool
 */
import type { TodoRpcClient } from './todo-tool';
import { dayStamp, localDayStart, localStamp, LOCAL_TIME_NOTE } from './local-time.js';

export interface TodoTaskView {
  id: string;
  text: string;
  list: string;
  listKey: string;
  done: boolean;
  group?: string;
  description?: string;
  dueAt?: number;
  hasAlarm?: boolean;
  pinned?: boolean;
  /** The short number a person and an op can name it by (#42). */
  num?: number;
  kind?: 'note';
  status?: 'doing' | 'waiting' | 'someday';
  priority?: 'high' | 'low';
  origin?: { by: string; name?: string };
  triage?: boolean;
  /** Names always; a path only when include_paths was asked. Never a folder's content. */
  attachments?: Array<{ kind: 'file' | 'dir'; name: string; path?: string }>;
}

export interface TodoListView {
  key: string;
  name: string;
  open: number;
  done: number;
  /** Done tasks of this list now in the archive. Absent when none. */
  archivedDone?: number;
  notes?: number;
}

export interface TodoReadResult {
  ok: boolean;
  error?: string;
  view?: {
    lists: TodoListView[];
    tasks: TodoTaskView[];
    total: number;
    truncated: number;
    archived: number;
  };
  /** 'file' = the app was closed and the host went straight to the file. */
  via?: 'window' | 'file';
}

/**
 * A due date the agent can act on, or nothing. Never a fabricated "today".
 * Local time — the frame the host reads an offset-less date back in.
 */
function whenText(at: number | undefined): string {
  const s = localStamp(at);
  return s ? ` (due ${s})` : '';
}

/**
 * The sentence for a failure the host reported.
 *
 * Every branch says what happened to the FILE, because the next step differs:
 * "no workspace yet" is something the human sets up, "that is not a backlog
 * file" is something they look at, and "the disk refused" is something to try
 * again. Collapsing them into "error" sends everyone to do the same nothing.
 */
export function doorFailure(error: string | undefined, subject: string): string {
  switch (error) {
    case 'NO_VAULT':
    case 'FILE_NOVAULT':
      return `No workspace is configured on this machine, so there is no ${subject} yet. The human picks a vault folder in the app first.`;
    case 'FILE_PARSE':
      return `The ${subject} file is not valid JSON. Nothing was read or written; it needs a human to look at it.`;
    case 'FILE_SHAPE':
      return `The file where the ${subject} should be does not look like a ${subject} file. It was LEFT UNTOUCHED on purpose, in case it is something else.`;
    case 'FILE_ERROR':
      return `The app could not read the ${subject} file. Nothing was changed.`;
    case 'WRITE_FAILED':
      return `The write was refused: the file was not readable yet, or the disk said no. Nothing was changed.`;
    case 'TIMEOUT':
      // 🚨 Not "nothing was changed": on the window path the renderer APPLIES
      // and then answers, and main drops an answer that arrives after the
      // deadline. A late "yes" is indistinguishable from a "no" from here, and
      // a retry on the strength of "nothing was changed" files the change twice.
      return `The app did not answer in time. It is UNKNOWN whether the change was applied: the window can apply it and answer too late. Read the ${subject} back before retrying.`;
    case 'EMPTY_PLAN':
      return 'Nothing to do: no usable change was given.';
    default:
      return `The ${subject} refused: ${error ?? 'unknown error'}. Nothing was changed.`;
  }
}

/** How far « due soon » reaches in the attention block: the agenda's week. */
export const TODO_SOON_DAYS = 7;
/** At most this many tasks in the attention block; the rest stay in the full list. */
export const ATTENTION_MAX = 10;

export interface TodoRenderOptions {
  /** The present, for tests; the clock otherwise. */
  now?: number;
  /** True when no list was asked: the answer then opens with what needs attention. */
  wholeBacklog?: boolean;
  /** The agent's own limit, applied to the printed list only. */
  printLimit?: number;
}

/** The host's ceiling for one read (and its default): what a whole-backlog read asks for. */
export const TODO_READ_CEILING = 300;

/**
 * The open tasks a person means by « what do I have to do », most urgent first:
 * overdue, due today, tomorrow, within TODO_SOON_DAYS, then high priority, then
 * in progress. Each task once, with the reason it is there.
 *
 * Measured 2026-11-06 (doc 202 §4.0): the read returned 162 tasks in list order,
 * 31 374 characters, and LFM2.5 8B answered with the « Lists » section copied
 * line for line, 25 lines and not one task. A small model copies the first
 * section it is given, so the tasks that matter come first, chosen here.
 */
export function attentionTasks(tasks: readonly TodoTaskView[], now: number): Array<{ task: TodoTaskView; why: string }> {
  const today = localDayStart(now);
  const tomorrow = localDayStart(now, 1);
  const dayAfter = localDayStart(now, 2);
  const soonEnd = localDayStart(now, TODO_SOON_DAYS + 1);
  const open = tasks.filter(t => !t.done && t.kind !== 'note');
  const due = open.filter(t => typeof t.dueAt === 'number' && Number.isFinite(t.dueAt) && (t.dueAt as number) < soonEnd)
    .sort((a, b) => (a.dueAt as number) - (b.dueAt as number));
  const picked = new Set<string>();
  const out: Array<{ task: TodoTaskView; why: string }> = [];
  const take = (task: TodoTaskView, why: string): void => {
    if (picked.has(task.id)) return;
    picked.add(task.id);
    out.push({ task, why });
  };
  for (const t of due) {
    const at = t.dueAt as number;
    const when = dayStamp(at);
    take(t, at < today ? `OVERDUE since ${when}` : at < tomorrow ? `due TODAY ${when}` : at < dayAfter ? `due TOMORROW ${when}` : `due ${when}`);
  }
  for (const t of open) if (t.priority === 'high') take(t, 'priority high');
  for (const t of open) if (t.status === 'doing') take(t, 'in progress');
  return out;
}

function attentionBlock(tasks: readonly TodoTaskView[], openCount: number, now: number): string {
  const all = attentionTasks(tasks, now);
  const head = `Today is ${dayStamp(now)}.`;
  if (all.length === 0) {
    return `${head}\nNeeds attention: none (no open task is overdue, due in the next ${TODO_SOON_DAYS} days, high priority or in progress).`;
  }
  const shown = all.slice(0, ATTENTION_MAX);
  const rows = shown.map(({ task, why }) => {
    const num = typeof task.num === 'number' ? ` #${task.num}` : '';
    return `- [${task.id}]${num} ${task.text} | ${why} | list: ${task.list}`;
  }).join('\n');
  const more = all.length > shown.length ? `\n(${all.length - shown.length} more need attention: they are in the full list below.)` : '';
  return `${head}\nNeeds attention first: ${all.length} of ${openCount} open task(s), most urgent first `
    + `(overdue, due in the next ${TODO_SOON_DAYS} days, high priority, in progress):\n${rows}${more}`;
}

export function renderTodoList(result: TodoReadResult, opts: TodoRenderOptions = {}): string {
  if (!result.ok || !result.view) return doorFailure(result.error, 'backlog');
  const v = result.view;
  const now = opts.now ?? Date.now();
  const where = result.via === 'file' ? ' (read straight from the file: the app is not open)' : '';
  const lists = v.lists.length
    ? v.lists.map(l => `- ${l.name} [key: ${l.key}] - ${l.open} open, ${l.done + (l.archivedDone ?? 0)} done`
      // The archive's done work is progress: said apart, so an agent knows where it is.
      + (l.archivedDone ? ` (${l.archivedDone} of them archived)` : '')
      + (l.notes ? `, ${l.notes} note(s)` : '')).join('\n')
    : '- (no lists)';
  // « Détail la catégorie cursor » went to the memory and the web (doc 202 §4.0):
  // the person's word for a list is « category », and the way in is said here.
  const oneList = opts.wholeBacklog && v.lists.length
    ? '\nA list is what the person may call a category or a project: to show one list\'s tasks only, call again with list: <its key>.'
    : '';
  const attention = opts.wholeBacklog && v.tasks.length
    ? `${attentionBlock(v.tasks, v.lists.reduce((n, l) => n + l.open, 0), now)}\n\n`
    : '';
  // The agent's limit cuts what is PRINTED, never what is ranked above (doc 202 §4.4).
  const shown = typeof opts.printLimit === 'number' && opts.printLimit < v.tasks.length
    ? v.tasks.slice(0, Math.max(0, opts.printLimit))
    : v.tasks;
  const truncated = v.truncated + (v.tasks.length - shown.length);

  if (shown.length === 0) {
    // "Nothing matched" is not "you have nothing to do": a filter that hit no
    // rows and an empty backlog read the same to a caller who is only handed a
    // count, and only one of them is a reason to stop looking.
    const why = v.total === 0 ? 'Nothing matched.' : `${v.total} matched but none were returned.`;
    return `${attention}Lists${where}:\n${lists}${oneList}\n\n${why}\nArchived (not listed here): ${v.archived}.`;
  }

  const tasks = shown.map(task => {
    const flags = [
      task.kind === 'note' ? 'note (context, not to do)' : null,
      task.done ? 'done' : null,
      task.status ? `status: ${task.status}` : null,
      task.priority ? `priority: ${task.priority}` : null,
      task.triage ? 'waits in triage' : null,
      task.origin?.by === 'agent' ? `filed by ${task.origin.name ?? 'an agent'}` : null,
      task.hasAlarm ? 'reminder' : null,
      task.pinned ? 'pinned' : null,
    ].filter(Boolean).join(', ');
    const files = task.attachments?.length
      ? `\n    files: ${task.attachments.map(a => `${a.name}${a.kind === 'dir' ? '/' : ''}${a.path ? ` (${a.path})` : ''}`).join(', ')}`
      : '';
    const num = typeof task.num === 'number' ? ` #${task.num}` : '';
    return `- [${task.id}]${num} ${task.text}${whenText(task.dueAt)}\n    list: ${task.list}`
      + (task.group ? ` | step: ${task.group}` : '')
      + (flags ? ` | ${flags}` : '')
      + files;
  }).join('\n');

  const cut = truncated > 0
    ? `\n\n${truncated} more matched and were NOT returned: narrow the list or raise the limit.`
    : '';
  // The frame is stated once, and only when a due date was printed (in the block or the list).
  const frame = (attention ? v.tasks : shown).some(t => localStamp(t.dueAt) !== '') ? `\n${LOCAL_TIME_NOTE}` : '';
  return `${attention}Lists${where}:\n${lists}${oneList}\n\nTasks (${shown.length} of ${v.total}):\n${tasks}${cut}${frame}`
    + `\n\nArchived (not listed here): ${v.archived}.`
    + '\nUse the id in brackets (or the #number) with mnemosyne_todo_update, never the text.';
}

export interface TodoOpOutcome {
  op: string;
  ok: boolean;
  error?: string;
  subject?: string;
  count?: number;
  permanent?: boolean;
  list?: string;
  num?: number;
}

export interface TodoApplyResult {
  ok: boolean;
  error?: string;
  results?: TodoOpOutcome[];
  applied?: number;
  truncated?: number;
  lists?: string[];
  via?: 'window' | 'file';
}

/**
 * One line per op, so a caller learns WHICH of six ids was stale instead of a
 * single "failed" it can only re-send whole.
 */
export function renderOutcome(r: TodoOpOutcome): string {
  const what = (typeof r.num === 'number' ? ` #${r.num}` : '') + (r.subject ? ` "${r.subject}"` : '');
  if (r.ok) {
    switch (r.op) {
      case 'remove':
        return r.permanent
          ? `- deleted${what} FOR GOOD: it is not in the archive`
          : `- archived${what}: it left the list and can be restored`;
      case 'move':        return `- moved${what} to "${r.list ?? 'another list'}"`;
      case 'complete':    return `- ticked or un-ticked${what}`;
      case 'edit':        return `- edited${what}`;
      case 'attach':      return `- attached a path to${what} (only the path is stored)`;
      case 'detach':      return `- took the attachment off${what} (the file itself is untouched)`;
      case 'list.create': return `- created the list${what}`;
      case 'list.edit':   return `- renamed or recoloured the list${what}`;
      case 'list.remove': return `- removed the list${what}`;
      default:            return `- ${r.op} done${what}`;
    }
  }
  switch (r.error) {
    case 'TASK_NOT_FOUND':  return `- ${r.op}: no task with that id. Read the backlog again; it may already be done or gone.`;
    case 'LIST_NOT_FOUND':  return `- ${r.op}: no list by that name${what}.`;
    case 'LIST_NOT_EMPTY':  return `- ${r.op}: the list${what} still holds ${r.count ?? 'some'} task(s) and was NOT removed. Move or remove them first; the host will not pick a destination on someone's behalf.`;
    case 'LIST_IS_BUILTIN': return `- ${r.op}:${what || ' that list'} is one of the three original lists and cannot be removed. Rename it instead.`;
    case 'NAME_TAKEN':      return `- ${r.op}: a list is already called${what}.`;
    case 'NAME_EMPTY':      return `- ${r.op}: a list needs a name.`;
    case 'TEXT_EMPTY':      return `- ${r.op}: a task cannot be left with no text${what}.`;
    case 'NO_CHANGE':       return `- ${r.op}: already in that state${what}; nothing was written.`;
    case 'IS_NOTE':         return `- ${r.op}:${what || ' that task'} is a note, and a note is not ticked. Turn it back into a task first (edit, kind: "task").`;
    case 'BAD_STATUS':      return `- ${r.op}: status must be "doing", "waiting", "someday" or null${what}.`;
    case 'BAD_PRIORITY':    return `- ${r.op}: priority must be "high", "low" or null${what}.`;
    case 'BAD_PATH':        return `- ${r.op}: the path must be ABSOLUTE (C:\\... or /...)${what}. Nothing was attached.`;
    case 'TOO_MANY_ATTACHMENTS': return `- ${r.op}:${what} already holds ${r.count ?? 'the maximum of'} attachments. Attach their folder instead.`;
    case 'ATTACHMENT_NOT_FOUND': return `- ${r.op}: no attachment with that path${what}. Read the backlog with include_paths: true to see them.`;
    case 'BAD_OP':          return `- ${r.op}: not an operation this door knows.`;
    default:                return `- ${r.op}: refused (${r.error ?? 'unknown'})${what}.`;
  }
}

export function renderTodoApply(result: TodoApplyResult): string {
  if (!result.ok) return doorFailure(result.error, 'backlog');
  const results = result.results ?? [];
  const applied = result.applied ?? 0;
  const where = result.via === 'file' ? ' The app was not open, so this went straight to the file.' : '';
  const lines = results.map(renderOutcome).join('\n');
  const cut = (result.truncated ?? 0) > 0
    ? `\n${result.truncated} further change(s) were past the per-call cap and were NEVER LOOKED AT. Send them in another call.`
    : '';
  const lists = result.lists?.length
    ? `\nLists that exist now: ${result.lists.map(l => `"${l}"`).join(', ')}.`
    : '';
  const head = applied === 0
    ? 'Nothing changed. Every change was refused:'
    : `${applied} of ${results.length} change(s) applied.${where}`;
  return `${head}\n${lines}${cut}${lists}`;
}

/** Reads the tool arguments for a read; the host re-validates. */
export function todoListParams(appId: string, args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { appId, includeDone: args['include_done'] === true };
  const list = args['list'];
  if (typeof list === 'string' && list.trim()) out['list'] = list.trim();
  if (typeof args['limit'] === 'number') out['limit'] = args['limit'];
  if (args['include_paths'] === true) out['includePaths'] = true;
  return out;
}

export async function handleTodoList(
  client: TodoRpcClient, appId: string, args: Record<string, unknown>,
): Promise<string> {
  const params = todoListParams(appId, args);
  if (params['list'] !== undefined) {
    return renderTodoList(await client._rpc<TodoReadResult>('sdk.todo.read', params));
  }
  // A whole-backlog read ranks EVERY open task, so it asks the host for all of
  // them; the agent's limit then cuts the printed list only. Measured 2026-11-06
  // (doc 202 §4.4): the 8B passed limit 20 or 50, and the overdue tasks sat
  // further down the list order, out of the attention block.
  const asked = typeof params['limit'] === 'number' ? params['limit'] : undefined;
  const result = await client._rpc<TodoReadResult>('sdk.todo.read', { ...params, limit: TODO_READ_CEILING });
  return renderTodoList(result, { wholeBacklog: true, ...(asked !== undefined ? { printLimit: asked } : {}) });
}

export async function handleTodoApply(
  client: TodoRpcClient, appId: string, args: Record<string, unknown>,
): Promise<string> {
  const ops = Array.isArray(args['ops']) ? args['ops'] : [];
  if (ops.length === 0) {
    return 'Nothing to do: "ops" was empty. Each entry names an operation and the id it applies to.';
  }
  const result = await client._rpc<TodoApplyResult>('sdk.todo.apply', { appId, ops });
  return renderTodoApply(result);
}
