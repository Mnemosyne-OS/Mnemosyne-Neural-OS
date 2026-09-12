/**
 * todo-tool — `mnemosyne_todo_add`: put tasks into the human's To-do backlog.
 *
 * The agent has just agreed a plan with the human in conversation; this files
 * it — in order, under its steps — into the backlog the To-do widget shows on
 * the canvas. The host routes the write through the widget's own store (the
 * file's only writer), so what the agent files is exactly what the human sees,
 * and the same guards apply: nothing is written before the file has been read.
 *
 * The answer is text an agent can act on. A refusal names the lists that exist
 * so the next call picks one instead of guessing; a host without a window says
 * "start the app", not "error".
 *
 * Pure formatting around one RPC, so the rendering is testable without a host.
 *
 * @module todo-tool
 */

export interface TodoAddArgs {
  tasks: Array<string | { text: string; group?: string }>;
  list?: string;
  createList?: boolean;
  color?: string;
}

export interface TodoAddResult {
  ok: boolean;
  error?: string;
  lists?: string[];
  listKey?: string;
  listLabel?: string;
  added?: number;
  created?: boolean;
  /** Present only when the plan LOST lines: empty texts, and tasks past the cap. */
  dropped?: { empty: number; overflow: number };
  /** 'file' = the app was closed and the host wrote the file directly. */
  via?: 'window' | 'file';
}

/** The minimum of the WS client this tool needs — the generic RPC. */
export interface TodoRpcClient {
  _rpc<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
}

/** Reads the tool arguments into the RPC params; the host re-validates. */
export function todoParams(appId: string, args: Record<string, unknown>): Record<string, unknown> {
  const rawTasks = args['tasks'];
  const tasks = Array.isArray(rawTasks) ? rawTasks : typeof rawTasks === 'string' ? [rawTasks] : [];
  const out: Record<string, unknown> = { appId, tasks, createList: args['create_list'] === true };
  if (typeof args['list'] === 'string' && args['list'].trim()) out['list'] = args['list'].trim();
  if (typeof args['color'] === 'string' && args['color'].trim()) out['color'] = args['color'].trim();
  return out;
}

/** The sentence an agent reads back, for every shape the host can answer. */
/**
 * What the plan LOST on its way in.
 *
 * 🚨 The host has measured these two since the door existed and the sentence
 * never said them, so a caller that sent 210 lines read `Filed 200 tasks` - a
 * true number about a request that was silently cut. Empty when nothing was
 * lost, and empty when the host did not say: an absent count is not a zero.
 */
function renderTodoLost(result: TodoAddResult): string {
  const d = result.dropped;
  if (!d) return '';
  const parts: string[] = [];
  if (d.empty > 0) parts.push(`${d.empty} line${d.empty === 1 ? '' : 's'} had no text`);
  if (d.overflow > 0) {
    parts.push(`${d.overflow} past the per-call cap ${d.overflow === 1 ? 'was' : 'were'} not filed — send ${d.overflow === 1 ? 'it' : 'them'} in another call`);
  }
  return parts.length ? ` ${parts.join('; ')}.` : '';
}

export function renderTodoAdd(result: TodoAddResult, asked: number): string {
  if (result.ok) {
    const where = result.listLabel ? `"${result.listLabel}"` : 'the backlog';
    const created = result.created ? ' (list created)' : '';
    const n = result.added ?? asked;
    // The app being shut is no longer a refusal, so it is worth SAYING which
    // way the write went: the tasks are on disk either way, but only one of
    // them is on a screen the human is looking at.
    const how = result.via === 'file' ? ' The app was not open, so this went straight to the file.' : '';
    return `Filed ${n} task${n === 1 ? '' : 's'} into ${where}${created}.${renderTodoLost(result)}${how}`
      + ' They appear in the To-do widget in the order given, under their steps.';
  }
  const lists = result.lists && result.lists.length
    ? `\nLists that exist: ${result.lists.map((l) => `"${l}"`).join(', ')}.`
    : '';
  switch (result.error) {
    case 'LIST_NOT_FOUND':
      return `No list by that name.${lists}\nPick one of them, or call again with create_list: true to make a new one — never assume a default.`;
    case 'LIST_NAME_EMPTY':
      return 'The list name was empty. Name an existing list or pass create_list: true with a name.';
    case 'EMPTY_PLAN':
      return 'Nothing to file: every task was blank after trimming.';
    case 'NO_WINDOW':
    case 'NO_BACKLOG':
      // A closed app is no longer a refusal (the host writes the file itself),
      // so reaching here means this host has no backlog at all.
      return 'This host cannot reach a To-do backlog at all. That is not "the app is closed" — a closed app is written to directly — so check that this is a Mnemosyne OS install with a workspace configured.';
    case 'NO_VAULT':
      return 'No workspace is configured on this machine, so there is no backlog file yet. The human picks a vault folder in the app first.';
    case 'TIMEOUT':
      return 'The app did not answer in time. Nothing was written. Is the canvas open? Try again once the window is up.';
    case 'WRITE_FAILED':
      return 'The app refused the write — the backlog file was not readable yet, or the disk said no. Nothing was written; try again in a moment.';
    default:
      return `The backlog refused: ${result.error ?? 'unknown error'}. Nothing was written.${lists}`;
  }
}

/** One call: params in, sentence out. */
export async function handleTodoAdd(client: TodoRpcClient, appId: string, args: Record<string, unknown>): Promise<string> {
  const params = todoParams(appId, args);
  const asked = (params['tasks'] as unknown[]).length;
  if (asked === 0) return renderTodoAdd({ ok: false, error: 'EMPTY_PLAN' }, 0);
  const result = await client._rpc<TodoAddResult>('sdk.todo.add', params);
  return renderTodoAdd(result, asked);
}
