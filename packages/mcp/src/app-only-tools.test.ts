/**
 * The app-only set is a claim about index.ts, so it is checked against
 * index.ts — as text, like the README guard, because importing index.ts would
 * start an MCP server on stdio.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  APP_NOT_RUNNING_MESSAGE, APP_ONLY_TOOLS, APP_RUNNING_CAVEAT, DAEMON_METHODS, FILE_PATH_CAVEAT,
  NO_BACKEND_TOOLS, TOOL_RPC, needsRunningApp,
} from './app-only-tools.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(path.join(HERE, 'index.ts'), 'utf8');
/**
 * 🎭 Absent is a real shape here, not a failure. `daemon.ts` is in no package's
 * `files` allowlist and the public mirror does not carry it, so the two checks
 * that read it say they were skipped rather than taking the file down at import
 * time and the other guards with it.
 */
const DAEMON_PATH = path.join(HERE, 'daemon.ts');
const DAEMON = existsSync(DAEMON_PATH) ? readFileSync(DAEMON_PATH, 'utf8') : null;
const NO_DAEMON = 'daemon.ts is not in this checkout (the public mirror does not carry it)';
const README = readFileSync(path.join(HERE, '..', 'README.md'), 'utf8');

const registered = [...SOURCE.matchAll(/name:\s*'(mnemosyne_[a-z_]+)'/g)].map(m => m[1]!);
const daemonMethods = DAEMON
  ? new Set([...DAEMON.matchAll(/case '(sdk\.[a-z.]+)'/g)].map(m => m[1]!))
  : null;

test('every registered tool is either in TOOL_RPC or declared backend-less — a new tool cannot slip past', () => {
  assert.ok(registered.length >= 20, `parsed only ${registered.length} — the guard would pass on a parse failure`);
  const unclassified = registered.filter(n => !(n in TOOL_RPC) && !NO_BACKEND_TOOLS.has(n));
  assert.deepEqual(unclassified, [], `add a TOOL_RPC row (or NO_BACKEND_TOOLS) for: ${unclassified.join(', ')}`);
  const stale = [...Object.keys(TOOL_RPC), ...NO_BACKEND_TOOLS].filter(n => !registered.includes(n));
  assert.deepEqual(stale, [], `classified but no longer registered: ${stale.join(', ')}`);
});

test('every method a tool sends exists in ws-client.ts, and DAEMON_METHODS is exactly what daemon.ts dispatches', () => {
  // The ws-client wraps most methods; the To-do, calendar, cockpit and Pheme tools
  // send theirs from their own files. Both are read, so a method claimed here
  // that nothing sends is caught either way.
  const senders = ['ws-client.ts', 'todo-tool.ts', 'todo-edit-tool.ts', 'agenda-tool.ts', 'agenda-edit-tool.ts', 'cockpit-tool.ts', 'pheme-tool.ts']
    .map(f => readFileSync(path.join(HERE, f), 'utf8')).join('\n');
  const wsMethods = new Set([...senders.matchAll(/'(sdk\.[a-z.]+)'/g)].map(m => m[1]!));
  assert.ok(wsMethods.size >= 15, 'the sender parse found too little — the guard would pass on a parse failure');
  for (const [tool, methods] of Object.entries(TOOL_RPC)) {
    for (const m of methods) assert.ok(wsMethods.has(m), `${tool} claims ${m}, which no sender file ever sends`);
  }
});

test('DAEMON_METHODS declares exactly what daemon.ts dispatches', { skip: daemonMethods ? false : NO_DAEMON }, () => {
  assert.deepEqual([...DAEMON_METHODS].sort(), [...daemonMethods!].sort(),
    'daemon.ts dispatches a different set than DAEMON_METHODS declares — update the table (a served method takes its tools OUT of the app-only set)');
});

test('the app-only set is exactly the tools with a method the daemon does not serve', { skip: daemonMethods ? false : NO_DAEMON }, () => {
  const expected = Object.entries(TOOL_RPC)
    .filter(([, ms]) => ms.some(m => !daemonMethods!.has(m)))
    .map(([t]) => t)
    .sort();
  assert.deepEqual([...APP_ONLY_TOOLS].sort(), expected);
  // The cockpit and the tools the 2026-09-08 audit missed are in; the To-do
  // and calendar tools LEFT the set when the daemon learned their six methods.
  for (const t of ['mnemosyne_cockpit_update', 'mnemosyne_memory_ask', 'mnemosyne_vault_list', 'mnemosyne_voice_speak'])
    assert.ok(APP_ONLY_TOOLS.has(t), `${t} should be app-only`);
  for (const t of ['mnemosyne_memory_query', 'mnemosyne_memory_ingest', 'mnemosyne_git_log', 'mnemosyne_resonance_list',
    'mnemosyne_todo_add', 'mnemosyne_todo_list', 'mnemosyne_todo_update', 'mnemosyne_todo_categories',
    'mnemosyne_agenda_add', 'mnemosyne_agenda_list', 'mnemosyne_agenda_update', 'mnemosyne_agenda_remove'])
    assert.ok(!APP_ONLY_TOOLS.has(t), `${t} is served by the daemon`);
});

test('needsRunningApp answers by name and treats an unknown tool as servable', () => {
  assert.equal(needsRunningApp('mnemosyne_cockpit_update'), true);
  assert.equal(needsRunningApp('mnemosyne_todo_list'), false);
  assert.equal(needsRunningApp('mnemosyne_memory_query'), false);
  assert.equal(needsRunningApp(undefined), false);
});

// 🚨 The six descriptions said "works with the app CLOSED". On Windows and
// Linux the app IS its window. Every app-only tool carries the one caveat, and
// no description says "closed" as a promise any more.
test('every To-do/calendar/cockpit description carries the platform caveat, and no app-only description promises "app CLOSED"', () => {
  for (const name of APP_ONLY_TOOLS) {
    const at0 = SOURCE.indexOf(`name:        '${name}'`);
    assert.ok(at0 >= 0, `${name} not found in index.ts`);
    assert.doesNotMatch(SOURCE.slice(at0, SOURCE.indexOf('inputSchema', at0)), /app CLOSED|app window is not open|Create-only/, `${name} still carries a stale promise`);
  }
  for (const name of [...APP_ONLY_TOOLS].filter(n => /^mnemosyne_(todo|agenda|cockpit)_/.test(n))) {
    const at = SOURCE.indexOf(`name:        '${name}'`);
    assert.ok(at >= 0, `${name} not found in index.ts`);
    const block = SOURCE.slice(at, SOURCE.indexOf('inputSchema', at));
    // The cockpit is stricter than the file path: the card lives on the canvas,
    // so its own sentence ("window open") is the truer one and is kept.
    assert.ok(
      block.includes('APP_RUNNING_CAVEAT') || /Needs the app window open/.test(block),
      `${name} carries neither APP_RUNNING_CAVEAT nor "Needs the app window open"`,
    );
    assert.doesNotMatch(block, /app CLOSED|app window is not open|Create-only/, `${name} still carries a stale promise`);
  }
  assert.match(APP_RUNNING_CAVEAT, /Windows and Linux/);
});

// The To-do and calendar tools are served by the daemon on a dev install and
// by nothing but the app on an npm install (the published bundle carries no
// daemon). Their caveat says BOTH halves, and never the app-only one.
test('every To-do/calendar description and README row carries FILE_PATH_CAVEAT, and never the app-only caveat', () => {
  const fileTools = registered.filter(n => /^mnemosyne_(todo|agenda)_/.test(n));
  assert.ok(fileTools.length >= 8, `parsed only ${fileTools.length} To-do/calendar tools`);

  // Stated once, verbatim, and only once: two copies would be two things to
  // keep in step, which is how the six rows drifted apart in the first place.
  const caveatAt = README.indexOf(FILE_PATH_CAVEAT);
  assert.ok(caveatAt >= 0, 'the README states the file-path caveat nowhere');
  assert.equal(README.indexOf(FILE_PATH_CAVEAT, caveatAt + 1), -1,
    'the README states the file-path caveat more than once');
  const nextHeading = README.indexOf('\n## ', caveatAt);
  const sectionEnd = nextHeading === -1 ? README.length : nextHeading;
  for (const name of fileTools) {
    assert.ok(!APP_ONLY_TOOLS.has(name), `${name} is served by the daemon and must not be app-only`);
    const at = SOURCE.indexOf(`name:        '${name}'`);
    assert.ok(at >= 0, `${name} not found in index.ts`);
    const block = SOURCE.slice(at, SOURCE.indexOf('inputSchema', at));
    assert.ok(block.includes('FILE_PATH_CAVEAT'), `${name} does not carry FILE_PATH_CAVEAT`);
    assert.ok(!block.includes('APP_RUNNING_CAVEAT'), `${name} still carries APP_RUNNING_CAVEAT`);
    const rowAt = README.indexOf(`**\`${name}\`**`);
    assert.ok(rowAt >= 0, `${name} has no README row`);
    // The caveat used to be repeated in every row, six copies of one sentence.
    // It is stated once above the table now, so what is checked is that the row
    // is GOVERNED by it: after the sentence, and before the next `## ` heading
    // ends the section. A row that drifts out of that section fails here.
    assert.ok(rowAt > caveatAt, `${name}'s README row sits above the file-path caveat`);
    assert.ok(rowAt < sectionEnd, `${name}'s README row left the section the file-path caveat governs`);
  }
  assert.match(FILE_PATH_CAVEAT, /app closed on a dev install/);
  assert.match(FILE_PATH_CAVEAT, /npm install has no daemon/);
  assert.match(APP_NOT_RUNNING_MESSAGE, /To-do and the calendar/);
});
