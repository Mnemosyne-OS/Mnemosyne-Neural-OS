/**
 * cockpit-tool.test.ts — the params the card is built from, the sentence the
 * agent reads back for every answer, and the mail that rides the answer.
 */
import { test }   from 'node:test';
import assert     from 'node:assert/strict';
import fs         from 'node:fs';
import os         from 'node:os';
import path       from 'node:path';
import { cockpitParams, renderCockpitUpdate, handleCockpitUpdate, type CockpitRpcClient } from './cockpit-tool.js';

function tree(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-cockpit-tool-'));
  fs.mkdirSync(path.join(dir, '.git'));
  return dir;
}

test('cockpitParams takes the session from the harness, the tree from the cwd, and only what was said', () => {
  const t = tree();
  try {
    const built = cockpitParams('mnemosyne-mcp', { state: 'working', title: ' T ', detail: ['a', 1, 'b'], attention: 'yes' },
      { CLAUDE_CODE_SESSION_ID: 'sess-1' } as NodeJS.ProcessEnv, t);
    assert.ok('params' in built);
    assert.deepEqual(built.params, { appId: 'mnemosyne-mcp', session: 'sess-1', state: 'working', title: 'T', detail: ['a', 'b'], tree: t });
  } finally {
    fs.rmSync(t, { recursive: true, force: true });
  }
});

// 🚨 The harness id names the transcript, the `← you` marker, the hooks' mailbox
// reads. An explicit "session" that beat it split one conversation into two
// cards and two mailboxes — so it is the FALLBACK the description promises, for
// a harness that publishes nothing, and never an override.
test('the harness id wins over an explicit "session"; "session" is the fallback; no session at all is refused', () => {
  const both = cockpitParams('mcp', { state: 'done', session: ' mine ' }, { CLAUDE_CODE_SESSION_ID: 'env' } as NodeJS.ProcessEnv, os.tmpdir());
  assert.ok('params' in both && both.params['session'] === 'env');
  const argOnly = cockpitParams('mcp', { state: 'done', session: ' mine ' }, {} as NodeJS.ProcessEnv, os.tmpdir());
  assert.ok('params' in argOnly && argOnly.params['session'] === 'mine');
  // A blank variable is "not published", not an id.
  const blankEnv = cockpitParams('mcp', { state: 'done', session: 'mine' }, { CLAUDE_CODE_SESSION_ID: '  ' } as NodeJS.ProcessEnv, os.tmpdir());
  assert.ok('params' in blankEnv && blankEnv.params['session'] === 'mine');
  assert.deepEqual(cockpitParams('mcp', { state: 'done' }, {} as NodeJS.ProcessEnv, os.tmpdir()), { error: 'NO_SESSION' });
  assert.deepEqual(cockpitParams('mcp', { state: 'thinking' }, { CLAUDE_CODE_SESSION_ID: 'x' } as NodeJS.ProcessEnv, os.tmpdir()), { error: 'BAD_STATE' });
});

test('a cwd outside any git tree sends no tree — the host then says the card has no mailbox', () => {
  const built = cockpitParams('mcp', { state: 'working' }, { CLAUDE_CODE_SESSION_ID: 'x' } as NodeJS.ProcessEnv, os.tmpdir());
  assert.ok('params' in built);
  assert.equal(built.params['tree'], undefined);
});

test('the answer says where the card is, and hands over the mail to act on', () => {
  assert.match(renderCockpitUpdate({ ok: true, pinned: true, messages: [] }, 'working'), /Card on the canvas: working\./);
  assert.match(renderCockpitUpdate({ ok: true, pinned: false, messages: [] }, 'done'), /removed this card/);
  const s = renderCockpitUpdate({
    ok: true, pinned: true,
    messages: [{ from: 'the human, from the cockpit', at: '2026-09-06T01:02:03.000Z', subject: 'Stop', body: 'Stop, use the other branch.' }],
  }, 'working');
  assert.match(s, /1 message in this session's mailbox/);
  assert.doesNotMatch(s, /messages? from the human/);
  assert.match(s, /act on what is addressed to you/);
  assert.match(s, /\(01:02 UTC\) from the human, from the cockpit: Stop, use the other branch\./);
  assert.match(renderCockpitUpdate({ ok: true, pinned: true, treeIgnored: true, messages: [] }, 'working'), /has no mailbox/);
});

test('every refusal is a sentence, and NO_WINDOW says to start the app', () => {
  assert.match(renderCockpitUpdate({ ok: false, error: 'NO_WINDOW' }, 'working'), /Start the app/);
  assert.match(renderCockpitUpdate({ ok: false, error: 'TIMEOUT' }, 'working'), /did not answer in time/);
  assert.match(renderCockpitUpdate({ ok: false, error: 'WHATEVER' }, 'working'), /refused the update: WHATEVER/);
});

// 🚨 A refused update used to END the answer at the refusal: whatever the host
// sent under it was never read. The host now leaves the mail in the box on
// that path and says how many wait; the sentence carries that, and any message
// it did send, so nothing addressed to this session is silently dropped.
test('a refusal still says what is waiting in the mailbox, and renders any mail it was handed', () => {
  const s = renderCockpitUpdate({ ok: false, error: 'TIMEOUT', pendingMail: 2 }, 'working');
  assert.match(s, /did not answer in time/);
  assert.match(s, /2 messages are waiting in this session's mailbox/);
  const one = renderCockpitUpdate({ ok: false, error: 'NO_WINDOW', pendingMail: 1 }, 'working');
  assert.match(one, /1 message is waiting/);
  assert.doesNotMatch(renderCockpitUpdate({ ok: false, error: 'TIMEOUT' }, 'working'), /waiting/);
  assert.doesNotMatch(renderCockpitUpdate({ ok: false, error: 'TIMEOUT', pendingMail: 0 }, 'working'), /waiting/);
  const handed = renderCockpitUpdate({
    ok: false, error: 'TIMEOUT',
    messages: [{ from: 'the human, from the cockpit', at: '2026-09-06T01:02:03.000Z', subject: 'Stop', body: 'Stop now.' }],
  }, 'working');
  assert.match(handed, /did not answer in time/);
  assert.match(handed, /from the human, from the cockpit: Stop now\./);
});

test('handleCockpitUpdate calls sdk.cockpit.update with the app id and renders the answer', async () => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  const client: CockpitRpcClient = {
    async _rpc<T>(method: string, params?: Record<string, unknown>): Promise<T> {
      calls.push([method, params]);
      return { ok: true, pinned: true, messages: [] } as T;
    },
  };
  const out = await handleCockpitUpdate(client, 'mnemosyne-mcp', { state: 'waiting', status: 'need a yes' },
    { CLAUDE_CODE_SESSION_ID: 's' } as NodeJS.ProcessEnv, os.tmpdir());
  assert.equal(calls.length, 1);
  assert.equal(calls[0]![0], 'sdk.cockpit.update');
  assert.equal(calls[0]![1]!['appId'], 'mnemosyne-mcp');
  assert.equal(calls[0]![1]!['status'], 'need a yes');
  assert.match(out, /Card on the canvas: waiting/);
});

test('handleCockpitUpdate explains a missing session without calling the host', async () => {
  let called = false;
  const client: CockpitRpcClient = { async _rpc<T>(): Promise<T> { called = true; return {} as T; } };
  const out = await handleCockpitUpdate(client, 'mcp', { state: 'done' }, {} as NodeJS.ProcessEnv, os.tmpdir());
  assert.equal(called, false);
  assert.match(out, /CLAUDE_CODE_SESSION_ID/);
});
