/**
 * app-only-tools — the tools the headless daemon cannot serve.
 *
 * 🚨 Six descriptions said "works with the app CLOSED (the host reads the
 * file)". True on macOS, where closing the window leaves the app running.
 * False on Windows and Linux, where `window-all-closed` quits the app: there
 * is no host left to read anything. And the fallback was worse than an error:
 * with no backend on 7799, `_connect` spawned the headless daemon for ANY tool,
 * the daemon knows only query/ingest/register/git.log and answered
 * `UNKNOWN_METHOD` — then kept 7799 for the rest of the session (the MCP's
 * socket stays open, so its idle exit never fires), and the app, started
 * afterwards, could not bind its own port (2026-09-06).
 *
 * So the To-do, calendar and cockpit tools name themselves here, and a
 * connect that fails for one of them says "start the app" without spawning
 * anything. The set is pinned to the registered tool names by a drift test.
 *
 * @module app-only-tools
 */

/**
 * What every tool SENDS over the wire, by tool name — the one table the guard
 * reads. A tool absent from it talks to no backend (the agent-transcript
 * readers, `about`). 🚨 Adding a tool means adding its row here, and the drift
 * test then says whether the daemon serves it or the tool joins the app-only
 * set: nobody has to remember to look at daemon.ts (2026-09-08, Tony:
 * "à chaque add au MCP faut voir si le daemon est modifié ?" — no, the test does).
 */
export const TOOL_RPC: Readonly<Record<string, readonly string[]>> = {
  mnemosyne_query:             ['sdk.query'],
  mnemosyne_ingest:            ['sdk.ingest'],
  mnemosyne_git_log:           ['sdk.git.log'],
  mnemosyne_resonances:        ['sdk.query'],
  mnemosyne_get_position:      ['sdk.query'],
  mnemosyne_update_position:   ['sdk.ingest'],
  mnemosyne_ask:               ['sdk.ask'],
  mnemosyne_vaults:            ['sdk.vaults.list'],
  mnemosyne_dream_bridges:     ['sdk.dream.bridges'],
  mnemosyne_spine_assignments: ['sdk.spine.assignments'],
  mnemosyne_voices:            ['sdk.voice.engines'],
  mnemosyne_speak:             ['sdk.voice.speak'],
  mnemosyne_speak_status:      ['sdk.voice.status', 'sdk.voice.cancel'],
  mnemosyne_todo_add:          ['sdk.todo.add'],
  mnemosyne_todo_list:         ['sdk.todo.read'],
  mnemosyne_todo_update:       ['sdk.todo.read', 'sdk.todo.apply'],
  mnemosyne_todo_lists:        ['sdk.todo.read', 'sdk.todo.apply'],
  mnemosyne_agenda_add:        ['sdk.agenda.add'],
  mnemosyne_agenda_list:       ['sdk.agenda.read'],
  mnemosyne_agenda_update:     ['sdk.agenda.read', 'sdk.agenda.apply'],
  mnemosyne_agenda_remove:     ['sdk.agenda.read', 'sdk.agenda.apply'],
  mnemosyne_cockpit_update:    ['sdk.cockpit.update'],
};

/** Tools that read files on disk and never open a socket. */
export const NO_BACKEND_TOOLS: ReadonlySet<string> = new Set([
  'mnemosyne_about',
  'mnemosyne_agents',
  'mnemosyne_agent_files',
  'mnemosyne_agent_collisions',
]);

/**
 * What the headless daemon dispatches (daemon.ts `_dispatch`), pinned by the
 * drift test against its source. Everything else a tool sends needs the app.
 */
export const DAEMON_METHODS: ReadonlySet<string> = new Set([
  'sdk.register',
  'sdk.query',
  'sdk.ingest',
  'sdk.git.log',
  // The widget FILES, served the way the app's main process serves them with
  // its window closed (daemon-widgets.ts) — so the To-do and calendar tools
  // leave the app-only set on the strength of this table, not of a promise.
  'sdk.todo.read',
  'sdk.todo.apply',
  'sdk.todo.add',
  'sdk.agenda.read',
  'sdk.agenda.apply',
  'sdk.agenda.add',
]);

/**
 * Tools whose RPC methods exist in the Mnemosyne OS app only — DERIVED from
 * the two tables above, never listed by hand: a tool is app-only the moment
 * one of its methods is not in the daemon's dispatch. The set therefore holds
 * more than the cockpit: `ask`, `vaults`, the dream bridges, the spine
 * assignments and the voice tools were hitting the same UNKNOWN_METHOD on the
 * daemon (and squatting the port) all along. The To-do and calendar tools LEFT
 * it the day the daemon learned their six methods (2026-09-08).
 */
export const APP_ONLY_TOOLS: ReadonlySet<string> = new Set(
  Object.entries(TOOL_RPC)
    .filter(([, methods]) => methods.some(m => !DAEMON_METHODS.has(m)))
    .map(([tool]) => tool),
);

/** True when a tool has no backend but the running app. */
export function needsRunningApp(tool: string | undefined): boolean {
  return tool !== undefined && APP_ONLY_TOOLS.has(tool);
}

/**
 * The platform truth, stated once and pasted into every app-only description.
 * "Window closed" and "app closed" are the same thing on two of the three
 * platforms, and a description that promised the file path to a Windows user
 * promised something that does not exist.
 */
export const APP_RUNNING_CAVEAT =
  'Needs the Mnemosyne OS app RUNNING: on macOS its window may be closed (the app stays up and the host reads the file); on Windows and Linux closing the last window quits the app, so it must be open.';

/**
 * The To-do and calendar tools' truth, now that the headless daemon serves
 * their six methods on the widget files (daemon-widgets.ts). Two halves,
 * because an npm install of this package has NO daemon: `_connect` spawns
 * `dist/daemon.js` from the monorepo checkout, which the published bundle
 * does not carry — there, the app is still the only host.
 */
export const FILE_PATH_CAVEAT =
  'Works with the app closed on a dev install (the headless daemon reads the file); an npm install has no daemon and needs the app running.';

/** What the agent reads when the app is not there for an app-only tool. */
export const APP_NOT_RUNNING_MESSAGE =
  'Cannot reach Mnemosyne OS on ws://127.0.0.1:7799, and this tool needs the app itself: the headless daemon serves only query, ingest, git log, the To-do and the calendar (no ask, vaults, dream bridges, spine assignments, voice or cockpit). Start the Mnemosyne OS app (Infinity Edition) and call again.';
