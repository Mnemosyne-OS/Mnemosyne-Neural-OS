/**
 * pheme-tool.test.ts — the ops the host receives, and the sentences the agent
 * reads back: dated, per-op, and never a posting.
 */
import { test } from 'node:test';
import assert   from 'node:assert/strict';
import {
  handlePhemeRadar, handlePhemeWatch, phemeOps, renderPhemeRadar, renderPhemeWatch, type PhemeRpcClient,
} from './pheme-tool.js';

test('phemeOps keeps well-formed ops only and refuses an empty batch', () => {
  assert.deepEqual(phemeOps({}), { error: 'NO_OPS' });
  assert.deepEqual(phemeOps({ ops: [{ op: 'drop', kind: 'sub', value: 'x' }] }), { error: 'NO_OPS' });
  assert.deepEqual(
    phemeOps({ ops: [{ op: 'add', kind: 'sub', value: ' r/hermesagent ' }, { op: 'remove', kind: 'nope', value: 'x' }, { op: 'add', kind: 'topic', value: '' }] }),
    { ops: [{ op: 'add', kind: 'sub', value: 'r/hermesagent' }] },
  );
});

test('handlePhemeWatch calls sdk.pheme.watch with the appId and the cleaned ops', async () => {
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const client: PhemeRpcClient = {
    async _rpc<T>(method: string, params?: Record<string, unknown>): Promise<T> {
      calls.push({ method, params });
      return { ok: true, applied: 1, revision: 4, nudged: true, results: [{ op: 'add', kind: 'sub', value: 'hermesagent', outcome: 'applied' }], lists: { subs: ['LocalLLaMA', 'hermesagent'], hnQueries: [], topics: ['retrieval'] } } as T;
    },
  };
  const out = await handlePhemeWatch(client, 'mnemosyne-mcp', { ops: [{ op: 'add', kind: 'sub', value: 'hermesagent' }] });
  assert.equal(calls[0]!.method, 'sdk.pheme.watch');
  assert.deepEqual(calls[0]!.params, { appId: 'mnemosyne-mcp', ops: [{ op: 'add', kind: 'sub', value: 'hermesagent' }] });
  assert.match(out, /1 change written .*revision 4/);
  assert.match(out, /Pheme is open and has been told/);
  assert.match(out, /add r\/hermesagent: done/);
  assert.match(out, /subreddits: r\/LocalLLaMA, r\/hermesagent\. HN queries: none\. Topics: retrieval\./);
  // An empty batch never reaches the socket.
  const before = calls.length;
  assert.match(await handlePhemeWatch(client, 'mnemosyne-mcp', { ops: [] }), /Nothing to do/);
  assert.equal(calls.length, before);
});

test('renderPhemeWatch says each outcome in its own words, and the closed-window case', () => {
  const out = renderPhemeWatch({
    ok: true, applied: 1, revision: 2, nudged: false,
    results: [
      { op: 'add', kind: 'topic', value: 'agent memory', outcome: 'applied' },
      { op: 'add', kind: 'sub', value: 'LocalLLaMA', outcome: 'already' },
      { op: 'remove', kind: 'hnQuery', value: 'zep', outcome: 'absent' },
      { op: 'remove', kind: 'sub', value: 'ObsidianMD', outcome: 'refused', reason: 'WOULD_EMPTY' },
      { op: 'add', kind: 'sub', value: 'x', outcome: 'refused', reason: 'LIST_FULL' },
      { op: 'add', kind: 'sub', value: 'r/', outcome: 'refused', reason: 'BAD_VALUE' },
    ],
  });
  assert.match(out, /adopts the change and shows the receipt the next time/);
  assert.match(out, /add topic "agent memory": done/);
  assert.match(out, /add r\/LocalLLaMA: already on the list/);
  assert.match(out, /remove HN "zep": was not on the list/);
  assert.match(out, /remove r\/ObsidianMD: refused — it is the last entry/);
  assert.match(out, /add r\/x: refused — the list is full/);
  assert.match(out, /add r\/r\/: refused — not a usable value/);
  assert.match(renderPhemeWatch({ ok: true, applied: 0, results: [] }), /^No change to Pheme's watch lists\./);
  assert.match(renderPhemeWatch({ ok: false, error: 'NO_PROFILE' }), /has not opened it and finished its onboarding/);
  assert.match(renderPhemeWatch({ ok: false, error: 'TOO_LARGE' }), /size cap. Nothing was written/);
  assert.match(renderPhemeWatch({ ok: false, error: 'WRITE_FAILED' }), /refused the change: WRITE_FAILED/);
});

test('renderPhemeRadar leads with WHEN, orders as given, and says a missing radar is not an empty one', () => {
  const now = Date.parse('2026-09-08T22:00:00.000Z');
  const out = renderPhemeRadar({
    ok: true, scannedAt: '2026-09-08T21:30:00.000Z', rankedAt: '2026-09-08T21:35:00.000Z',
    items: [
      { id: 'a', title: 'Which memory provider?', url: 'https://r/a', target: 'r/hermesagent', network: 'reddit', timestamp: '2026-09-08T20:00:00.000Z', score: 42.4, matched: ['memory'], tier: 'high', reason: 'asks exactly our question', points: 12, comments: 3 },
      { id: 'b', title: 'Student using Obsidian', url: 'https://r/b', target: 'r/ObsidianMD', network: 'reddit', timestamp: '2026-09-08T08:00:00.000Z', score: 20, matched: [] },
    ],
    failed: ['r/private'],
  }, now);
  assert.match(out, /^Pheme's radar, scanned 30 min ago \(2026-09-08T21:30:00.000Z\), Mnemosyne pass 25 min ago\. 2 threads/);
  assert.match(out, /The human posts; you draft\. Do not post as them\./);
  assert.match(out, /- \[high\] Which memory provider\?\n    r\/hermesagent · 12 pts · 3 comments · score 42 · 2 h ago\n    https:\/\/r\/a\n    why: asks exactly our question/);
  assert.match(out, /- Student using Obsidian\n    r\/ObsidianMD · score 20 · 14 h ago\n    https:\/\/r\/b/);
  assert.match(out, /Subs the scan could not cover: r\/private\./);

  const none = renderPhemeRadar({ ok: false, error: 'NO_RADAR', lists: { subs: ['LocalLLaMA'], hnQueries: [], topics: [] } }, now);
  assert.match(none, /not "no threads", no measurement/);
  assert.match(none, /subreddits: r\/LocalLLaMA/);
  const empty = renderPhemeRadar({ ok: true, scannedAt: '2026-09-06T22:00:00.000Z', items: [] }, now);
  assert.match(empty, /scanned 2 days ago .*no Mnemosyne pass yet \(no tiers\): no thread on it/);
  assert.match(renderPhemeRadar({ ok: false, error: 'NO_PROFILE' }, now), /has not opened it/);
});

test('handlePhemeRadar forwards only a known tier and a numeric limit', async () => {
  const calls: Array<Record<string, unknown> | undefined> = [];
  const client: PhemeRpcClient = {
    async _rpc<T>(method: string, params?: Record<string, unknown>): Promise<T> {
      assert.equal(method, 'sdk.pheme.radar');
      calls.push(params);
      return { ok: true, scannedAt: new Date().toISOString(), items: [] } as T;
    },
  };
  await handlePhemeRadar(client, 'mnemosyne-mcp', { limit: 5, tier: 'high' });
  await handlePhemeRadar(client, 'mnemosyne-mcp', { limit: '5', tier: 'top' });
  assert.deepEqual(calls, [{ appId: 'mnemosyne-mcp', limit: 5, tier: 'high' }, { appId: 'mnemosyne-mcp' }]);
});
