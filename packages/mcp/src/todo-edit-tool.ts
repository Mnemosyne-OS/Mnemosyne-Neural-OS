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
import { localStamp, LOCAL_TIME_NOTE } from './local-time.js';

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
}

export interface TodoListView {
  key: string;
  name: string;
  open: number;
  done: number;
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

export function renderTodoList(result: TodoReadResult): string {
  if (!result.ok || !result.view) return doorFailure(result.error, 'backlog');
  const v = result.view;
  const where = result.via === 'file' ? ' (read straight from the file: the app is not open)' : '';
  const lists = v.lists.length
    ? v.lists.map(l => `- ${l.name} [key: ${l.key}] - ${l.open} open, ${l.done} done`).join('\n')
    : '- (no lists)';

  if (v.tasks.length === 0) {
    // "Nothing matched" is not "you have nothing to do": a filter that hit no
    // rows and an empty backlog read the same to a caller who is only handed a
    // count, and only one of them is a reason to stop looking.
    const why = v.total === 0 ? 'Nothing matched.' : `${v.total} matched but none were returned.`;
    return `Lists${where}:\n${lists}\n\n${why}\nArchived (not listed here): ${v.archived}.`;
  }

  const tasks = v.tasks.map(task => {
    const flags = [task.done ? 'done' : null, task.hasAlarm ? 'reminder' : null, task.pinned ? 'pinned' : null]
      .filter(Boolean).join(', ');
    return `- [${task.id}] ${task.text}${whenText(task.dueAt)}\n    list: ${task.list}`
      + (task.group ? ` | step: ${task.group}` : '')
      + (flags ? ` | ${flags}` : '');
  }).join('\n');

  const cut = v.truncated > 0
    ? `\n\n${v.truncated} more matched and were NOT returned: narrow the list or raise the limit.`
    : '';
  // The frame is stated once, and only when a due date was printed.
  const frame = v.tasks.some(t => localStamp(t.dueAt) !== '') ? `\n${LOCAL_TIME_NOTE}` : '';
  return `Lists${where}:\n${lists}\n\nTasks (${v.tasks.length} of ${v.total}):\n${tasks}${cut}${frame}`
    + `\n\nArchived (not listed here): ${v.archived}.`
    + '\nUse the id in brackets with mnemosyne_todo_update, never the text.';
}

export interface TodoOpOutcome {
  op: string;
  ok: boolean;
  error?: string;
  subject?: string;
  count?: number;
  permanent?: boolean;
  list?: string;
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
  const what = r.subject ? ` "${r.subject}"` : '';
  if (r.ok) {
    switch (r.op) {
      case 'remove':
        return r.permanent
          ? `- deleted${what} FOR GOOD: it is not in the archive`
          : `- archived${what}: it left the list and can be restored`;
      case 'move':        return `- moved${what} to "${r.list ?? 'another list'}"`;
      case 'complete':    return `- ticked or un-ticked${what}`;
      case 'edit':        return `- edited${what}`;
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
  return out;
}

export async function handleTodoList(
  client: TodoRpcClient, appId: string, args: Record<string, unknown>,
): Promise<string> {
  const result = await client._rpc<TodoReadResult>('sdk.todo.read', todoListParams(appId, args));
  return renderTodoList(result);
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
