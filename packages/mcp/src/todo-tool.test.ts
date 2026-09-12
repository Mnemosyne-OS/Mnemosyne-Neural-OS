/**
 * todo-tool.test.ts — the sentence an agent reads back, for every answer the
 * host can give, and the params it sends without re-deciding anything.
 */
import { test }   from 'node:test';
import assert     from 'node:assert/strict';
import { todoParams, renderTodoAdd, handleTodoAdd, type TodoRpcClient } from './todo-tool.js';

test('todoParams carries tasks, the trimmed list name and create_list as a boolean', () => {
  const p = todoParams('mcp', { tasks: ['a', { text: 'b', group: 'S' }], list: '  Site ', create_list: true, color: '#ff9900' });
  assert.deepEqual(p, { appId: 'mcp', tasks: ['a', { text: 'b', group: 'S' }], createList: true, list: 'Site', color: '#ff9900' });
  // A lone string is one task; a missing list is not a default list.
  assert.deepEqual(todoParams('mcp', { tasks: 'only one' }), { appId: 'mcp', tasks: ['only one'], createList: false });
  assert.equal(todoParams('mcp', { tasks: [], create_list: 'yes' })['createList'], false);
});

test('a success names the list, the count and whether it was created', () => {
  assert.match(renderTodoAdd({ ok: true, added: 3, listLabel: 'Site web', created: true }, 3), /Filed 3 tasks into "Site web" \(list created\)/);
  assert.match(renderTodoAdd({ ok: true, added: 1, listLabel: 'En cours' }, 1), /Filed 1 task into "En cours"\./);
});

test('LIST_NOT_FOUND hands over the lists that exist and the way forward', () => {
  const s = renderTodoAdd({ ok: false, error: 'LIST_NOT_FOUND', lists: ['En cours', 'Perso'] }, 2);
  assert.match(s, /No list by that name/);
  assert.match(s, /"En cours", "Perso"/);
  assert.match(s, /create_list: true/);
  assert.match(s, /never assume a default/);
});

// A closed app used to be the answer here, and it was the whole defect: the
// door worked precisely when the human was in front of the app and could have
// typed it themselves. The host now writes the file directly, so this branch
// must NOT send anyone off to start something.
test('a host that cannot reach a backlog does not tell anyone to start the app', () => {
  for (const error of ['NO_WINDOW', 'NO_BACKLOG']) {
    const s = renderTodoAdd({ ok: false, error }, 1);
    assert.match(s, /cannot reach a To-do backlog/);
    assert.doesNotMatch(s, /Start the app/);
  }
  assert.match(renderTodoAdd({ ok: false, error: 'NO_VAULT' }, 1), /No workspace is configured/);
});

test('every failure says nothing was written', () => {
  for (const error of ['TIMEOUT', 'WRITE_FAILED', 'SOMETHING_ELSE']) {
    assert.match(renderTodoAdd({ ok: false, error }, 1), /Nothing was written/);
  }
});

test('a success SAYS what the plan lost, and which way the write went', () => {
  // `added` alone let a caller INFER a cut; an inference is not a message.
  const cut = renderTodoAdd(
    { ok: true, added: 200, listLabel: 'WIP', dropped: { empty: 1, overflow: 3 } }, 204);
  assert.match(cut, /1 line had no text/);
  assert.match(cut, /3 past the per-call cap were not filed/);
  // A clean plan says nothing about losses.
  assert.doesNotMatch(renderTodoAdd({ ok: true, added: 2, listLabel: 'WIP' }, 2), /cap|no text/);
  // The app being shut is not an error any more, but it is worth knowing.
  assert.match(renderTodoAdd({ ok: true, added: 1, listLabel: 'WIP', via: 'file' }, 1), /app was not open/);
  assert.doesNotMatch(renderTodoAdd({ ok: true, added: 1, listLabel: 'WIP', via: 'window' }, 1), /app was not open/);
});

test('handleTodoAdd calls sdk.todo.add with the app id and renders the answer', async () => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  const client: TodoRpcClient = {
    async _rpc<T>(method: string, params?: Record<string, unknown>): Promise<T> {
      calls.push([method, params]);
      return { ok: true, added: 2, listLabel: 'Site' } as T;
    },
  };
  const out = await handleTodoAdd(client, 'mnemosyne-mcp', { tasks: ['a', 'b'], list: 'Site' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]![0], 'sdk.todo.add');
  assert.equal(calls[0]![1]!['appId'], 'mnemosyne-mcp');
  assert.match(out, /Filed 2 tasks into "Site"/);
});

test('handleTodoAdd refuses an empty plan without calling the host', async () => {
  let called = false;
  const client: TodoRpcClient = {
    async _rpc<T>(): Promise<T> { called = true; return {} as T; },
  };
  const out = await handleTodoAdd(client, 'mcp', { tasks: [] });
  assert.equal(called, false);
  assert.match(out, /Nothing to file/);
});
