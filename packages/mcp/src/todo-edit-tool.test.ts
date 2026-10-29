/**
 * The sentences that keep an agent from misreading what happened to someone
 * else's backlog: an empty result that is not an empty backlog, a removal that
 * says whether it can be undone, a cut that announces itself, and one line per
 * refused op so a stale id is nameable.
 */
// Pinned to a NON-ZERO offset (UTC+5, POSIX sign, no DST): the due stamp used
// to be UTC with the Z cut off, and on a UTC machine that bug is invisible.
process.env['TZ'] = 'Etc/GMT-5';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  doorFailure, renderOutcome, renderTodoApply, renderTodoList, todoListParams,
  type TodoReadResult,
} from './todo-edit-tool.js';

const AT = Date.UTC(2026, 8, 10, 14, 0, 0); // 19:00 in the pinned zone

const view = (over: Partial<NonNullable<TodoReadResult['view']>> = {}): TodoReadResult => ({
  ok: true,
  view: {
    lists: [{ key: 'wip', name: 'En cours', open: 2, done: 1 }],
    tasks: [{ id: 't1', text: 'Ship it', list: 'En cours', listKey: 'wip', done: false }],
    total: 1,
    truncated: 0,
    archived: 0,
    ...over,
  },
});

test('a read prints the id in brackets and says to use it, not the text', () => {
  const s = renderTodoList(view());
  assert.match(s, /\[t1\] Ship it/);
  assert.match(s, /never the text/);
  assert.match(s, /En cours \[key: wip\] - 2 open, 1 done/);
});

test('"nothing matched" and "nothing was returned" are different sentences', () => {
  assert.match(renderTodoList(view({ tasks: [], total: 0 })), /Nothing matched\./);
  const filtered = renderTodoList(view({ tasks: [], total: 7 }));
  assert.match(filtered, /7 matched but none were returned/);
  assert.doesNotMatch(filtered, /Nothing matched\./);
});

test('a cut announces itself rather than letting a count imply it', () => {
  assert.match(renderTodoList(view({ total: 40, truncated: 39 })), /39 more matched and were NOT returned/);
  assert.doesNotMatch(renderTodoList(view()), /NOT returned/);
});

test('the answer says when it went straight to the file, so a closed app is visible', () => {
  assert.match(renderTodoList({ ...view(), via: 'file' }), /the app is not open/);
  assert.doesNotMatch(renderTodoList({ ...view(), via: 'window' }), /the app is not open/);
});

test('a removal says whether it can be undone — the two are not the same act', () => {
  assert.match(renderOutcome({ op: 'remove', ok: true, subject: 'Ship it', permanent: false }), /archived.*can be restored/);
  assert.match(renderOutcome({ op: 'remove', ok: true, subject: 'Ship it', permanent: true }), /FOR GOOD/);
});

test('a refused list removal carries the count that is in the way', () => {
  const s = renderOutcome({ op: 'list.remove', ok: false, error: 'LIST_NOT_EMPTY', subject: 'Courses', count: 3 });
  assert.match(s, /"Courses" still holds 3 task/);
  assert.match(s, /will not pick a destination/);
});

test('a stale id is nameable, not folded into a single "failed"', () => {
  const s = renderTodoApply({
    ok: true,
    applied: 1,
    results: [
      { op: 'remove', ok: true, subject: 'Ship it', permanent: false },
      { op: 'edit', ok: false, error: 'TASK_NOT_FOUND' },
    ],
  });
  assert.match(s, /1 of 2 change\(s\) applied/);
  assert.match(s, /no task with that id/);
});

test('a batch where everything was refused does not read as a success', () => {
  const s = renderTodoApply({ ok: true, applied: 0, results: [{ op: 'edit', ok: false, error: 'TASK_NOT_FOUND' }] });
  assert.match(s, /Nothing changed/);
});

test('ops past the cap are reported as NEVER LOOKED AT, not as failures', () => {
  const s = renderTodoApply({ ok: true, applied: 1, truncated: 4, results: [{ op: 'edit', ok: true }] });
  assert.match(s, /4 further change\(s\).*NEVER LOOKED AT/);
});

test('each file failure sends the reader somewhere different', () => {
  assert.match(doorFailure('NO_VAULT', 'backlog'), /No workspace is configured/);
  assert.match(doorFailure('FILE_SHAPE', 'backlog'), /LEFT UNTOUCHED/);
  assert.match(doorFailure('FILE_PARSE', 'backlog'), /not valid JSON/);
  assert.match(doorFailure('WRITE_FAILED', 'backlog'), /Nothing was changed/);
  // An unknown code is quoted rather than dressed up as one of the above.
  assert.match(doorFailure('WAT', 'backlog'), /WAT/);
});

// 🚨 On the window path the renderer applies THEN answers, and a late answer is
// dropped by main: a timeout is not "nothing was changed", it is "unknown", and
// saying otherwise invites the retry that files the change twice.
test('a TIMEOUT is an UNKNOWN outcome, never an asserted "nothing was changed"', () => {
  const s = doorFailure('TIMEOUT', 'backlog');
  assert.match(s, /UNKNOWN whether the change was applied/);
  assert.match(s, /Read the backlog back before retrying/);
  assert.doesNotMatch(s, /Nothing was changed/);
});

// A due date is printed in this machine's LOCAL time, the frame the host reads
// an offset-less date back in, and the answer says so once.
test('a due date is local time, and the answer names the frame once', () => {
  const s = renderTodoList(view({ tasks: [{ id: 't1', text: 'Ship it', list: 'En cours', listKey: 'wip', done: false, dueAt: AT }] }));
  assert.match(s, /\(due 2026-09-10 19:00\)/);
  assert.equal(s.match(/this machine's local time/g)?.length, 1);
  assert.doesNotMatch(renderTodoList(view()), /local time/);
});

test('todoListParams trims the list name and never invents one', () => {
  assert.deepEqual(todoListParams('mcp', { list: '  Perso ', include_done: true, limit: 5 }),
    { appId: 'mcp', includeDone: true, list: 'Perso', limit: 5 });
  assert.deepEqual(todoListParams('mcp', {}), { appId: 'mcp', includeDone: false });
  assert.deepEqual(todoListParams('mcp', { list: '   ' }), { appId: 'mcp', includeDone: false });
});

// ── Doc 170: numbers, notes, triage, files ─────────────────────────────────

test('a task is printed with its number, its status, its note kind and its triage', () => {
  const out = renderTodoList(view({
    lists: [{ key: 'wip', name: 'En cours', open: 1, done: 0, notes: 1 }],
    tasks: [
      { id: 't1', text: 'Ship it', list: 'En cours', listKey: 'wip', done: false, num: 42, status: 'doing', priority: 'high', triage: true, origin: { by: 'agent', name: 'Claude Code' } },
      { id: 'n1', text: 'Never trust 3 %', list: 'En cours', listKey: 'wip', done: false, num: 43, kind: 'note' },
    ],
    total: 2,
  }));
  assert.match(out, /\[t1\] #42 Ship it/);
  assert.match(out, /status: doing, priority: high, waits in triage, filed by Claude Code/);
  assert.match(out, /\[n1\] #43 Never trust 3 %[\s\S]*note \(context, not to do\)/);
  assert.match(out, /1 open, 0 done, 1 note\(s\)/);
  assert.match(out, /or the #number/);
});

test('attachments are named, and a path is printed only when the host sent one', () => {
  const named = renderTodoList(view({
    tasks: [{ id: 't1', text: 'Pay', list: 'En cours', listKey: 'wip', done: false, attachments: [{ kind: 'dir', name: 'Factures' }, { kind: 'file', name: 'a.pdf' }] }],
  }));
  assert.match(named, /files: Factures\/, a\.pdf/);
  assert.doesNotMatch(named, /C:\\/);
  const withPaths = renderTodoList(view({
    tasks: [{ id: 't1', text: 'Pay', list: 'En cours', listKey: 'wip', done: false, attachments: [{ kind: 'dir', name: 'Factures', path: 'C:\\Users\\me\\Factures' }] }],
  }));
  assert.match(withPaths, /Factures\/ \(C:\\Users\\me\\Factures\)/);
});

test('include_paths travels as includePaths, and only when true', () => {
  assert.equal(todoListParams('app', { include_paths: true })['includePaths'], true);
  assert.equal(todoListParams('app', { include_paths: 'yes' })['includePaths'], undefined);
  assert.equal(todoListParams('app', {})['includePaths'], undefined);
});

test('the new refusals each say what to do next', () => {
  assert.match(renderOutcome({ op: 'complete', ok: false, error: 'IS_NOTE', subject: 'x', num: 3 }), /#3 "x" is a note[\s\S]*kind: "task"/);
  assert.match(renderOutcome({ op: 'attach', ok: false, error: 'BAD_PATH' }), /ABSOLUTE/);
  assert.match(renderOutcome({ op: 'detach', ok: false, error: 'ATTACHMENT_NOT_FOUND' }), /include_paths: true/);
  assert.match(renderOutcome({ op: 'attach', ok: true, subject: 'x', num: 9 }), /attached a path to #9 "x" \(only the path is stored\)/);
});

test('a list counts its done work in the archive, and says it is there (doc 170 §10)', () => {
  const s = renderTodoList(view({ lists: [{ key: 'c-x', name: 'Octave', open: 4, done: 1, archivedDone: 6 }] }));
  assert.match(s, /- Octave \[key: c-x\] - 4 open, 7 done \(6 of them archived\)/);
  const none = renderTodoList(view({ lists: [{ key: 'wip', name: 'WIP', open: 2, done: 1 }] }));
  assert.match(none, /- WIP \[key: wip\] - 2 open, 1 done$/m);
});
